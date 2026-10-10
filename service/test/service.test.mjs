import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
const base = "https://api.bytesskills.com",
  key = "test-only-owner-key-000000000000000000000000";
const hash = (s) => createHash("sha256").update(s).digest("hex");
let mf, db;
before(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      scriptPath: "dist/index.js",
      compatibilityDate: "2026-10-01",
      compatibilityFlags: ["nodejs_compat", "global_fetch_strictly_public"],
      d1Databases: { DB: "test" },
      r2Buckets: ["BLOBS"],
      kvNamespaces: ["OAUTH_KV"],
      bindings: {
        BASE_URL: base,
        WORKSPACE_ID: "acc3351e-d092-433c-a7e1-8fc3e807ebd4",
        OWNER_KEY_SHA256: hash(key),
      },
    }),
  );
  db = await mf.getD1Database("DB");
  const sql = (await readFile("migrations/0001_artifacts.sql", "utf8"))
    .replace(/--[^\n]*/g, "")
    .replace(/\n/g, " ");
  await db.exec(sql);
});
after(async () => {
  await mf?.dispose();
});
async function api(path, body, method = body ? "POST" : "GET", token = key) {
  const res = await mf.dispatchFetch(base + path, {
    method,
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
}
async function save(extra = {}) {
  const r = await api("/v1/save", {
    request_id: randomUUID(),
    type: "concept",
    title: "Test idea",
    text: "subscription token spending",
    ...extra,
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body;
}
async function rpc(method, params = {}, token = key) {
  const r = await mf.dispatchFetch(base + "/mcp", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  return { status: r.status, body: await r.json() };
}
test("private routes require auth; discovery is public", async () => {
  assert.equal((await api("/v1/query", null, "GET", "bad")).status, 401);
  assert.equal((await rpc("tools/list", {}, "bad")).status, 401);
  const r = await mf.dispatchFetch(
    base + "/.well-known/oauth-protected-resource/mcp",
  );
  assert.equal(r.status, 200);
  assert.equal((await r.json()).resource, base + "/mcp");
});
test("MCP initialization, list, and actual artifact save/get", async () => {
  const init = await rpc("initialize", {
    protocolVersion: "2025-11-25",
    capabilities: {},
    clientInfo: { name: "test", version: "1" },
  });
  assert.equal(init.status, 200);
  assert.equal(init.body.result.serverInfo.name, "BytesSkills");
  const list = await rpc("tools/list");
  assert.ok(list.body.result.tools.find((t) => t.name === "bytes_save"));
  const created = await rpc("tools/call", {
    name: "bytes_save",
    arguments: {
      request_id: randomUUID(),
      type: "hook",
      title: "MCP hook",
      text: "Hello",
    },
  });
  assert.ok(!created.body.result.isError, JSON.stringify(created));
  const ptr = JSON.parse(created.body.result.content[0].text).pointer;
  const got = await rpc("tools/call", {
    name: "bytes_get",
    arguments: { pointer: ptr },
  });
  assert.equal(JSON.parse(got.body.result.content[0].text).text, "Hello");
});
test("idempotent retries and mismatched request detection", async () => {
  const req = {
    request_id: randomUUID(),
    type: "concept",
    title: "Retry",
    text: "One",
  };
  const a = await api("/v1/save", req),
    b = await api("/v1/save", req);
  assert.equal(a.status, 200);
  assert.equal(a.body.pointer, b.body.pointer);
  assert.equal(
    (await api("/v1/save", { ...req, text: "different" })).status,
    409,
  );
});
test("concurrent revisions have one winner; exact references remain pinned", async () => {
  const c = await save();
  const h = await save({
    type: "hook",
    relations: { inputs: [c.pointer.split(":")[0]] },
  });
  const responses = await Promise.all(
    [1, 2].map((n) =>
      api("/v1/save", {
        request_id: randomUUID(),
        pointer: c.pointer,
        expected_revision: 1,
        text: "Change " + n,
      }),
    ),
  );
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
  const got = await api(
    "/v1/artifact?pointer=" + encodeURIComponent(h.pointer),
  );
  assert.deepEqual(got.body.relations.inputs, [c.pointer]);
  const hist = await api(
    "/v1/history?pointer=" + encodeURIComponent(c.pointer),
  );
  assert.equal(hist.body.items.length, 2);
});
test("parent cycles rejected inside transactions including concurrent moves", async () => {
  const a = await save(),
    b = await save();
  const moves = await Promise.all(
    [
      [a, b],
      [b, a],
    ].map(([x, y]) =>
      api("/v1/save", {
        request_id: randomUUID(),
        pointer: x.pointer,
        expected_revision: 1,
        parent: y.pointer,
      }),
    ),
  );
  assert.deepEqual(moves.map((x) => x.status).sort(), [200, 409]);
});
test("search, filtering, archive, reverse edges and pagination", async () => {
  const a = await save({
    title: "Unique quokka",
    tags: ["test-tag"],
    settings: { format: "troll" },
  });
  const b = await save({
    title: "Unique quokka two",
    tags: ["test-tag"],
    settings: { format: "troll" },
    relations: { inputs: [a.pointer] },
  });
  const first = await api(
    "/v1/query?text=quokka&format=troll&tag=test-tag&limit=1",
  );
  assert.equal(first.body.items.length, 1);
  assert.ok(first.body.next_cursor);
  const next = await api(
    "/v1/query?text=quokka&format=troll&tag=test-tag&limit=1&after=" +
      first.body.next_cursor,
  );
  assert.equal(next.body.items.length, 1);
  assert.notEqual(first.body.items[0].id, next.body.items[0].id);
  const related = await api(
    "/v1/related?pointer=" + encodeURIComponent(a.pointer),
  );
  assert.equal(related.body.items[0].source, b.pointer);
  await api("/v1/save", {
    request_id: randomUUID(),
    pointer: a.pointer,
    expected_revision: 1,
    status: "archived",
  });
  assert.equal((await api("/v1/query?text=quokka")).body.items.length, 1);
  assert.equal(
    (await api("/v1/artifact?pointer=" + encodeURIComponent(a.pointer))).status,
    200,
  );
});
test("invalid references, body and blob hashes fail without records", async () => {
  assert.equal(
    (
      await api("/v1/save", {
        request_id: randomUUID(),
        type: "concept",
        title: "Bad",
        text: "",
        relations: { inputs: ["@concept/12345678"] },
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await api("/v1/save", {
        request_id: randomUUID(),
        type: "concept",
        title: "Bad",
        text: "",
        unexpected: 1,
      })
    ).status,
    400,
  );
  const res = await mf.dispatchFetch(base + "/v1/blobs/" + "0".repeat(64), {
    method: "PUT",
    headers: { Authorization: "Bearer " + key },
    body: "bad",
  });
  assert.equal(res.status, 409);
});
test("immutable database revisions reject direct modification", async () => {
  const c = await save();
  await assert.rejects(
    () =>
      db
        .prepare("UPDATE revisions SET checksum=? WHERE pointer=?")
        .bind("bad", c.pointer)
        .run(),
    /immutable_revision/,
  );
});
test("OAuth registration, PKCE consent, read scope and refresh", async () => {
  const reg = await mf.dispatchFetch(base + "/oauth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "Integration test",
      redirect_uris: ["http://localhost:8484/callback"],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    }),
  });
  assert.equal(reg.status, 201);
  const client = await reg.json(),
    verifier = "v".repeat(64),
    challenge = createHash("sha256").update(verifier).digest("base64url");
  const query = new URLSearchParams({
    client_id: client.client_id,
    redirect_uri: "http://localhost:8484/callback",
    response_type: "code",
    code_challenge: challenge,
    code_challenge_method: "S256",
    scope: "bytes:read offline_access",
    resource: base + "/mcp",
    state: "state",
  });
  const page = await mf.dispatchFetch(base + "/authorize?" + query);
  assert.equal(page.status, 200);
  const cookie = page.headers.get("set-cookie").split(";")[0],
    html = await page.text(),
    handle = html.match(/name="handle" value="([^"]+)"/)[1];
  const body = new URLSearchParams({ handle, key, decision: "approve" });
  body.append("scope", "bytes:read");
  body.append("scope", "offline_access");
  const denied = await mf.dispatchFetch(base + "/authorize", {
    method: "POST",
    headers: {
      Origin: base,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  assert.equal(denied.status, 400);
  const allowed = await mf.dispatchFetch(base + "/authorize", {
    method: "POST",
    redirect: "manual",
    headers: {
      Origin: base,
      Cookie: cookie,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  assert.equal(allowed.status, 302, await allowed.clone().text());
  const code = new URL(allowed.headers.get("location")).searchParams.get(
    "code",
  );
  const exchange = await mf.dispatchFetch(base + "/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: client.client_id,
      code,
      redirect_uri: "http://localhost:8484/callback",
      code_verifier: verifier,
      resource: base + "/mcp",
    }).toString(),
  });
  assert.equal(exchange.status, 200, await exchange.clone().text());
  const tokens = await exchange.json();
  const read = await rpc(
    "tools/call",
    { name: "bytes_query", arguments: {} },
    tokens.access_token,
  );
  assert.ok(!read.body.result.isError, JSON.stringify(read));
  const write = await rpc(
    "tools/call",
    {
      name: "bytes_save",
      arguments: {
        request_id: randomUUID(),
        type: "concept",
        title: "Unauthorized",
        text: "x",
      },
    },
    tokens.access_token,
  );
  assert.equal(write.body.result.isError, true);
  const refresh = await mf.dispatchFetch(base + "/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: client.client_id,
      refresh_token: tokens.refresh_token,
      resource: base + "/mcp",
    }).toString(),
  });
  assert.equal(refresh.status, 200, await refresh.clone().text());
});
test("import real local records preserves checksums and export snapshot is stable", async () => {
  const { readdir } = await import("node:fs/promises");
  async function files(dir) {
    let result = [];
    for (const f of await readdir(dir, { withFileTypes: true })) {
      const p = dir + "/" + f.name;
      if (f.isDirectory()) result.push(...(await files(p)));
      else result.push(p);
    }
    return result;
  }
  const records = await Promise.all(
    (await files("../workspace/records")).map(async (p) =>
      JSON.parse(await readFile(p, "utf8")),
    ),
  );
  for (const r of records) {
    const bytes = await readFile("../workspace/" + r.content.key);
    const res = await mf.dispatchFetch(base + "/v1/blobs/" + r.content.sha256, {
      method: "PUT",
      headers: { Authorization: "Bearer " + key },
      body: bytes,
    });
    assert.equal(res.status, 200);
  }
  const done = new Set();
  while (done.size < records.length) {
    let progress = false;
    for (const r of records) {
      if (done.has(r.pointer)) continue;
      const deps = Object.values(r.relations).flat();
      if (r.revision > 1) deps.push(`@${r.type}/${r.id}:v${r.revision - 1}`);
      if (deps.some((p) => !done.has(p))) continue;
      const imported = await api("/v1/import", r);
      assert.equal(imported.status, 200, JSON.stringify(imported.body));
      assert.equal(imported.body.record_checksum, r.record_checksum);
      done.add(r.pointer);
      progress = true;
    }
    assert.ok(progress);
  }
  const ex = await api("/v1/export?limit=100");
  const before = ex.body.records.length;
  await save();
  const snapshot = await api(
    "/v1/export?limit=100&snapshot=" + ex.body.snapshot,
  );
  assert.equal(snapshot.body.records.length, before);
});
