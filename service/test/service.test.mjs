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
  await db.exec(
    (await readFile("migrations/0002_skill_releases.sql", "utf8"))
      .replace(/--[^\n]*/g, "")
      .replace(/\n/g, " "),
  );
  for (const migration of ['0003_website_waitlist.sql', '0004_accounts.sql', '0005_workspace_isolation.sql']) {
    await db.exec((await readFile('migrations/' + migration, 'utf8'))
      .replace(/--[^\n]*/g, '').replace(/\n/g, ' '));
  }
  const fixture = [
    "help",
    "brainstorm",
    "refine",
    "inspect",
    "organize",
    "clip",
    "edit",
    "captions",
    "sync",
  ].map((skill) => ({
    skill,
    version: "0.7.0",
    summary: "Initial test release",
    protocol: 1,
    required_scopes: ["bytes:read"],
    instructions: "Fixture workflow: " + skill,
    resources: { "format.json": '{"version":1}' },
  }));
  assert.equal((await api("/v1/releases", { releases: fixture })).status, 200);
  const preview = await tool("bytes_updates", {});
  await tool("bytes_adopt", {
    request_id: randomUUID(),
    expected_revision: preview.state_revision,
    catalog_hash: preview.catalog_hash,
    action: "sync",
  });
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
async function tool(name, args) {
  const result = await rpc("tools/call", { name, arguments: args });
  assert.ok(!result.body.result.isError, JSON.stringify(result));
  return JSON.parse(result.body.result.content[0].text);
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
test("release verification catalog requires owner auth and returns checksums without payloads", async () => {
  assert.equal((await api("/v1/releases", null, "GET", "bad")).status, 401);
  const response = await api("/v1/releases");
  assert.equal(response.status, 200);
  assert.ok(response.body.releases.length > 0);
  for (const release of response.body.releases) {
    assert.match(release.checksum, /^[a-f0-9]{64}$/);
    assert.equal(release.payload, undefined);
    assert.equal(release.instructions, undefined);
  }
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
      workflow_id: (
        await tool("bytes_begin", {
          request_id: randomUUID(),
          command: "/bytes brainstorm --hooks",
        })
      ).workflow_id,
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
test("BytesSkills help is discoverable, read-only and provides the command contract", async () => {
  const list = await rpc("tools/list");
  const tool = list.body.result.tools.find((t) => t.name === "bytes_help");
  assert.ok(tool.description.includes("/bytes help"));
  assert.equal(tool.annotations.readOnlyHint, true);
  const before = await db
    .prepare("SELECT COUNT(*) AS n FROM revisions")
    .first();
  const result = await rpc("tools/call", { name: "bytes_help", arguments: {} });
  assert.ok(!result.body.result.isError);
  const help = JSON.parse(result.body.result.content[0].text);
  assert.ok(help.aliases.includes("/bytes help"));
  assert.ok(help.commands.content.includes("/bytes brainstorm"));
  assert.ok(help.shared_workspace.content.includes("bytes_save"));
  const after = await db.prepare("SELECT COUNT(*) AS n FROM revisions").first();
  assert.equal(after.n, before.n);
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
  assert.equal(page.headers.get("referrer-policy"), "same-origin");
  assert.equal(
    page.headers.get("content-security-policy").match(/form-action ([^;]+)/)[1],
    "'self' http://localhost:8484",
  );
  const tampered = new URLSearchParams(query);
  tampered.set("redirect_uri", "https://unregistered.example/callback");
  const invalidCallback = await mf.dispatchFetch(
    base + "/authorize?" + tampered,
  );
  assert.equal(invalidCallback.status, 400);

  const cookie = page.headers.get("set-cookie").split(";")[0],
    html = await page.text(),
    handle = html.match(/name="handle" value="([^"]+)"/)[1];
  const body = new URLSearchParams({ handle, key, decision: "approve" });
  body.append("scope", "bytes:read");
  body.append("scope", "offline_access");
  // Invalid origins must fail even with a valid consent cookie and handle.
  for (const origin of ["null", "https://other.example", undefined]) {
    const headers = {
      Cookie: cookie,
      "Content-Type": "application/x-www-form-urlencoded",
    };
    if (origin !== undefined) headers.Origin = origin;
    const rejected = await mf.dispatchFetch(base + "/authorize", {
      method: "POST",
      headers,
      body: body.toString(),
    });
    assert.equal(rejected.status, 403);
  }
  const denied = await mf.dispatchFetch(base + "/authorize", {
    method: "POST",
    headers: {
      Origin: base,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  assert.equal(denied.status, 400);
  assert.equal((await denied.json()).reason, "consent_cookie_missing");
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
  assert.equal(allowed.status, 303, await allowed.clone().text());
  const replay = await mf.dispatchFetch(base + "/authorize", {
    method: "POST",
    headers: {
      Origin: base,
      Cookie: cookie,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  assert.equal(replay.status, 400);
  assert.equal((await replay.json()).reason, "consent_expired");
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
  const publication = await rpc(
    "tools/call",
    {
      name: "bytes_publish",
      arguments: {
        releases: [
          {
            skill: "help",
            version: "9.0.0",
            summary: "Unauthorized",
            protocol: 1,
            required_scopes: ["bytes:read"],
            instructions: "Not allowed",
            resources: {},
          },
        ],
      },
    },
    tokens.access_token,
  );
  assert.equal(publication.body.result.isError, true);
  assert.equal(
    await db
      .prepare("SELECT version FROM skill_releases WHERE version='9.0.0'")
      .first(),
    null,
  );
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
test("synthetic local revisions import without a repository workspace and export snapshots stay stable", async () => {
  const { execFileSync } = await import("node:child_process");
  const fixtures = JSON.parse(execFileSync("python3", ["../tests/make_import_fixture.py"], {encoding: "utf8"}));
  const records = fixtures.map(f => f.record);
  for (const fixture of fixtures) {
    const r = fixture.record;
    const res = await mf.dispatchFetch(base + "/v1/blobs/" + r.content.sha256, {
      method: "PUT",
      headers: { Authorization: "Bearer " + key },
      body: Buffer.from(fixture.content, "base64"),
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

test("every registered command routes to its declared skill and help stays read-only", async () => {
  const registry = JSON.parse(await readFile("../plugins/bytesskills-core/skills/bytes/contracts/runtime.json", "utf8"));
  for (const [skill, spec] of Object.entries(registry.skills)) {
    for (const command of spec.commands) {
      const begun = await tool("bytes_begin", {request_id: randomUUID(), command: "/bytes " + command});
      assert.equal(begun.skill, skill);
      const help = await tool("bytes_begin", {request_id: randomUUID(), command: "/bytes " + command + " --help"});
      assert.equal(help.skill, "help");
    }
  }
});

test("edit workflow can persist a plan with release provenance and edit help cannot write", async () => {
  const begun = await tool("bytes_begin", {request_id: randomUUID(), command: '/bytes edit --app=capcut --source="/private/example.mp4" --req="Tighten pacing"'});
  assert.equal(begun.skill, "edit");
  const saved = await tool("bytes_save", {request_id: randomUUID(), workflow_id: begun.workflow_id, type: "plan", title: "Fictional edit plan", text: "Test only: no application was controlled."});
  assert.equal(saved.provenance.skill_release.skill, "edit");
  const help = await tool("bytes_begin", {request_id: randomUUID(), command: "/bytes edit --help"});
  assert.equal(help.skill, "help");
  const result = await rpc("tools/call", {name: "bytes_save", arguments: {
    request_id: randomUUID(), workflow_id: help.workflow_id,
    type: "plan", title: "Must fail", text: "Help must not mutate",
  }});
  assert.equal(result.body.result.isError, true);
  assert.ok(result.body.result.content[0].text.includes("cannot save artifacts"));
});

test("skill releases are immutable; adoption is shared and each run pins its resources", async () => {
  const first = await tool("bytes_begin", {
    request_id: randomUUID(),
    command: "/bytes brainstorm --concepts",
  });
  assert.equal(first.version, "0.7.0");
  const next = {
    skill: "brainstorm",
    version: "0.8.0",
    summary: "New question ordering",
    protocol: 1,
    required_scopes: ["bytes:read"],
    instructions: "New immutable instructions",
    resources: { "format.json": '{"version":2}' },
  };
  assert.equal((await api("/v1/releases", { releases: [next] })).status, 200);
  assert.equal(
    (
      await api("/v1/releases", {
        releases: [{ ...next, instructions: "Overwrite attempt" }],
      })
    ).status,
    409,
  );
  const request = {
    request_id: randomUUID(),
    command: "/bytes brainstorm --concepts",
  };
  const offered = await tool("bytes_begin", request);
  assert.equal(offered.status, "update_available");
  const keep = {
    request_id: randomUUID(),
    expected_revision: offered.state_revision,
    catalog_hash: offered.catalog_hash,
    skill: "brainstorm",
    action: "keep",
  };
  const kept = await tool("bytes_adopt", keep);
  assert.deepEqual(await tool("bytes_adopt", keep), kept);
  const continued = await tool("bytes_begin", request);
  assert.equal(continued.version, "0.7.0");
  assert.equal(
    (
      await tool("bytes_begin", {
        request_id: randomUUID(),
        command: "/bytes brainstorm --hooks",
      })
    ).version,
    "0.7.0",
  );
  const preview = await tool("bytes_updates", {});
  await tool("bytes_adopt", {
    request_id: randomUUID(),
    expected_revision: preview.state_revision,
    catalog_hash: preview.catalog_hash,
    action: "sync",
  });
  const second = await tool("bytes_begin", {
    request_id: randomUUID(),
    command: "/bytes brainstorm --concepts",
  });
  assert.equal(second.version, "0.8.0");
  assert.equal(second.resources["format.json"], '{"version":2}');
  assert.equal((await tool("bytes_begin", request)).version, "0.7.0");
  const record = await tool("bytes_save", {
    workflow_id: first.workflow_id,
    request_id: randomUUID(),
    type: "concept",
    title: "Pinned test",
    text: "content",
    provenance: { skill_release: { version: "fake" } },
  });
  assert.equal(record.provenance.skill_release.version, "0.7.0");
  const missing = await rpc("tools/call", {
    name: "bytes_save",
    arguments: {
      request_id: randomUUID(),
      type: "concept",
      title: "Bypass",
      text: "x",
    },
  });
  assert.equal(missing.body.result.isError, true);
  const help = await tool("bytes_begin", {
    request_id: randomUUID(),
    command: "/bytes help",
  });
  const prohibited = await rpc("tools/call", {
    name: "bytes_save",
    arguments: {
      workflow_id: help.workflow_id,
      request_id: randomUUID(),
      type: "concept",
      title: "Bad help",
      text: "x",
    },
  });
  assert.equal(prohibited.body.result.isError, true);
});

test("bulk adoption is atomic, rejects stale previews and concurrent preference changes", async () => {
  let preview = await tool("bytes_updates", {});
  const request = {
    request_id: randomUUID(),
    expected_revision: preview.state_revision,
    catalog_hash: preview.catalog_hash,
    action: "sync",
  };
  await api("/v1/releases", {
    releases: [
      {
        skill: "refine",
        version: "0.8.0",
        summary: "Refine update",
        protocol: 1,
        required_scopes: ["bytes:read"],
        instructions: "Refine next",
        resources: {},
      },
    ],
  });
  const stale = await rpc("tools/call", {
    name: "bytes_adopt",
    arguments: request,
  });
  assert.equal(stale.body.result.isError, true);
  assert.equal(
    (await tool("bytes_updates", {})).state_revision,
    preview.state_revision + 1,
  );
  preview = await tool("bytes_updates", {});
  const decisions = await Promise.all(
    ["refine", "brainstorm"].map((skill) =>
      rpc("tools/call", {
        name: "bytes_adopt",
        arguments: {
          request_id: randomUUID(),
          expected_revision: preview.state_revision,
          catalog_hash: preview.catalog_hash,
          skill,
          action: "keep",
        },
      }),
    ),
  );
  assert.equal(decisions.filter((r) => !r.body.result.isError).length, 1);
  assert.equal(
    (await tool("bytes_updates", {})).state_revision,
    preview.state_revision + 1,
  );
});

test("auto adoption never escalates scopes; revoked and expired workflows cannot save", async () => {
  let p = await tool("bytes_updates", {});
  await tool("bytes_adopt", {
    request_id: randomUUID(),
    expected_revision: p.state_revision,
    catalog_hash: p.catalog_hash,
    skill: "brainstorm",
    action: "auto",
  });
  const release = {
    skill: "brainstorm",
    version: "0.9.0",
    summary: "Compatible update",
    protocol: 1,
    required_scopes: ["bytes:read"],
    instructions: "Auto release",
    resources: {},
  };
  await api("/v1/releases", { releases: [release] });
  const ready = await tool("bytes_begin", {
    request_id: randomUUID(),
    command: "/bytes brainstorm --concepts",
  });
  assert.equal(ready.version, "0.9.0");
  await api("/v1/releases", {
    releases: [
      {
        ...release,
        version: "0.10.0",
        required_scopes: ["bytes:read", "bytes:manage"],
      },
    ],
  });
  const offer = await tool("bytes_begin", {
    request_id: randomUUID(),
    command: "/bytes brainstorm --concepts",
  });
  assert.equal(offer.status, "update_available");
  await db
    .prepare("INSERT INTO skill_revocations VALUES(?,?,?)")
    .bind("brainstorm", "0.9.0", "test revocation")
    .run();
  const blocked = await rpc("tools/call", {
    name: "bytes_save",
    arguments: {
      workflow_id: ready.workflow_id,
      request_id: randomUUID(),
      type: "concept",
      title: "Revoked",
      text: "x",
    },
  });
  assert.equal(blocked.body.result.isError, true);
  const id = randomUUID();
  await db
    .prepare("INSERT INTO workflow_sessions VALUES(?,?,?,?,?,?,?,?)")
    .bind(
      "acc3351e-d092-433c-a7e1-8fc3e807ebd4",
      id,
      "test",
      "refine",
      "0.7.0",
      "/bytes refine",
      "2000-01-01T00:00:00.000Z",
      "2000-01-02T00:00:00.000Z",
    )
    .run();
  const expired = await rpc("tools/call", {
    name: "bytes_save",
    arguments: {
      workflow_id: id,
      request_id: randomUUID(),
      type: "concept",
      title: "Expired",
      text: "x",
    },
  });
  assert.equal(expired.body.result.isError, true);
});

test('MCP responses carry diagnostic IDs without changing auth or tool data', async () => {
  for (const token of [key, 'invalid']) {
    const r=await mf.dispatchFetch(base+'/mcp', {method:'POST',headers:{
      Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'application/json, text/event-stream'
    },body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'bytes_workspace',arguments:{}}})});
    assert.match(r.headers.get('X-Bytes-Request-Id'),/^[a-f0-9-]{36}$/);
    assert.match(r.headers.get('Server-Timing'),/^bytes;dur=\d/);
    if(token===key) {
      assert.equal(r.status,200);
      const body=await r.json();
      assert.equal(body.result._meta['bytes/request_id'],r.headers.get('X-Bytes-Request-Id'));
      assert.equal(JSON.parse(body.result.content[0].text).workspace_id,'acc3351e-d092-433c-a7e1-8fc3e807ebd4');
    } else assert.equal(r.status,401);
  }
});
