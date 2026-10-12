// Real SDK + OAuth smoke test. Only creates an archived run; never edits creative work.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { readFile, writeFile } from "node:fs/promises";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import assert from "node:assert/strict";
const base = process.env.BYTES_URL ?? "https://api.bytesskills.com",
  key = (await readFile(".secrets/owner-key.txt", "utf8")).trim();
const headers = { Authorization: "Bearer " + key };
const health = await fetch(base + "/health");
assert.equal(health.status, 200);
assert.equal((await fetch(base + "/v1/query")).status, 401);
const challenge = await fetch(base + "/mcp", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: "{}",
});
assert.equal(challenge.status, 401);
assert.ok(
  challenge.headers.get("www-authenticate").includes("resource_metadata"),
);
const client = new Client({ name: "bytesskills-live-smoke", version: "0.1.0" });
await client.connect(
  new StreamableHTTPClientTransport(new URL(base + "/mcp"), {
    requestInit: { headers },
  }),
);
const tools = await client.listTools();
assert.equal(tools.tools.length, 12);
const call = async (name, args) => {
  const r = await client.callTool({ name, arguments: args });
  assert.ok(!r.isError, JSON.stringify(r));
  return JSON.parse(r.content[0].text);
};
const workflow = await call("bytes_begin", {
  request_id: randomUUID(),
  command: "/bytes brainstorm --concepts",
});
assert.equal(workflow.status, "ready");
const args = {
  workflow_id: workflow.workflow_id,
  request_id: randomUUID(),
  type: "run",
  title: "MVP live integration smoke test",
  text: "Verified live MCP, persistence and OAuth. Test artifact; safe to archive.",
  status: "pending",
  tags: ["mvp-smoke"],
  provenance: { operation: "service-verification" },
};
const created = await call("bytes_save", args);
assert.equal((await call("bytes_save", args)).pointer, created.pointer);
const revised = await call("bytes_save", {
  request_id: randomUUID(),
  workflow_id: workflow.workflow_id,
  pointer: created.pointer,
  expected_revision: 1,
  status: "succeeded",
});
assert.equal(revised.revision, 2);
const existing = await call("bytes_get", {pointer: revised.pointer, include_content: true});
assert.equal(existing.text, args.text);
const conflict = await client.callTool({
  name: "bytes_save",
  arguments: {
    request_id: randomUUID(),
    workflow_id: workflow.workflow_id,
    pointer: created.pointer,
    expected_revision: 1,
    text: "stale",
  },
});
assert.equal(conflict.isError, true);
await call("bytes_save", {
  request_id: randomUUID(),
  workflow_id: workflow.workflow_id,
  pointer: revised.pointer,
  expected_revision: 2,
  status: "archived",
});
await client.close();
// Exercise browser-bound consent, PKCE, refresh, and write scope through OAuth.
const reg = await fetch(base + "/oauth/register", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    client_name: "BytesSkills deployment verification",
    redirect_uris: ["http://localhost:8484/callback"],
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
  }),
});
assert.equal(reg.status, 201);
const registration = await reg.json();
const verifier = randomBytes(48).toString("base64url"),
  pkce = createHash("sha256").update(verifier).digest("base64url");
const query = new URLSearchParams({
  client_id: registration.client_id,
  redirect_uri: "http://localhost:8484/callback",
  response_type: "code",
  code_challenge: pkce,
  code_challenge_method: "S256",
  scope: "bytes:read bytes:write offline_access",
  resource: base + "/mcp",
  state: randomUUID(),
});
const page = await fetch(base + "/authorize?" + query);
assert.equal(page.status, 200);
const cookie = page.headers.get("set-cookie").split(";")[0],
  html = await page.text(),
  handle = html.match(/name="handle" value="([^"]+)"/)[1];
const form = new URLSearchParams({ handle, key, decision: "approve" });
for (const s of ["bytes:read", "bytes:write", "offline_access"])
  form.append("scope", s);
const approved = await fetch(base + "/authorize", {
  method: "POST",
  redirect: "manual",
  headers: {
    Origin: base,
    Cookie: cookie,
    "Content-Type": "application/x-www-form-urlencoded",
  },
  body: form.toString(),
});
assert.equal(approved.status, 303, await approved.clone().text());
const code = new URL(approved.headers.get("location")).searchParams.get("code");
const token = await fetch(base + "/oauth/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    grant_type: "authorization_code",
    client_id: registration.client_id,
    code,
    redirect_uri: "http://localhost:8484/callback",
    code_verifier: verifier,
    resource: base + "/mcp",
  }).toString(),
});
assert.equal(token.status, 200, await token.clone().text());
const tokens = await token.json();
const oauthClient = new Client({ name: "bytes-oauth-test", version: "1" });
await oauthClient.connect(
  new StreamableHTTPClientTransport(new URL(base + "/mcp"), {
    requestInit: {
      headers: { Authorization: "Bearer " + tokens.access_token },
    },
  }),
);
const workspace = await oauthClient.callTool({
  name: "bytes_workspace",
  arguments: {},
});
assert.equal(JSON.parse(workspace.content[0].text).write_access, true);
await oauthClient.close();
// A freshly issued grant can still be stale in KV at another edge location.
// Retry only propagation-shaped failures for this newly issued test token.
const refreshDeadline = Date.now() + 75000;
let refreshed;
while (true) {
refreshed = await fetch(base + "/oauth/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    grant_type: "refresh_token",
    client_id: registration.client_id,
    refresh_token: tokens.refresh_token,
    resource: base + "/mcp",
  }).toString(),
});
if (refreshed.status === 200) break;
const failure = await refreshed.clone().json();
if (Date.now() >= refreshDeadline || failure.error !== "invalid_grant" ||
    !["Invalid refresh token", "Grant not found"].includes(failure.error_description)) break;
await new Promise(resolve => setTimeout(resolve, 5000));
}
assert.equal(refreshed.status, 200, await refreshed.clone().text());
const grants = await (await fetch(base + "/v1/grants", { headers })).json();
for (const grant of grants.items ?? [])
  if (grant.clientId === registration.client_id) {
    const r = await fetch(base + "/v1/revoke", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ grant_id: grant.id }),
    });
    assert.equal(r.status, 200);
  }
const receipt = {
  tested_at: new Date().toISOString(),
  base_url: base,
  checks: [
    "health",
    "private-access",
    "SDK-initialize",
    "twelve-tools",
    "created-pointer",
    "create",
    "idempotent-retry",
    "revision",
    "stale-write-rejection",
    "archive",
    "OAuth-PKCE-consent",
    "OAuth-write-scope",
    "refresh-token",
  ],
  test_run: created.pointer,
};
await writeFile(
  ".secrets/live-verification.json",
  JSON.stringify(receipt, null, 2) + "\n",
);
console.log(JSON.stringify(receipt, null, 2));
