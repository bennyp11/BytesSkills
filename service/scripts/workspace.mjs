// Run from service/. Key stays in an ignored, mode-0600 file; never print it.
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { createHash } from "node:crypto";
const [mode, dirArg] = process.argv.slice(2),
  dir = resolve(dirArg ?? "../workspace");
const base = process.env.BYTES_URL ?? "https://api.bytesskills.com";
const key = (
  await readFile(process.env.BYTES_KEY_FILE ?? ".secrets/owner-key.txt", "utf8")
).trim();
const hash = (b) => createHash("sha256").update(b).digest("hex");
const headers = { Authorization: "Bearer " + key };
async function api(path, body, method = body ? "POST" : "GET") {
  const r = await fetch(base + path, {
    method,
    headers: { ...headers, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw Error(`${r.status}: ${await r.text()}`);
  return r.json();
}
async function files(d) {
  const out = [];
  for (const f of await readdir(d, { withFileTypes: true })) {
    const p = resolve(d, f.name);
    if (f.isDirectory()) out.push(...(await files(p)));
    else if (f.name.endsWith(".json")) out.push(p);
  }
  return out;
}
if (mode === "import") {
  const records = await Promise.all(
    (await files(resolve(dir, "records"))).map(async (p) =>
      JSON.parse(await readFile(p, "utf8")),
    ),
  );
  const uploaded = new Set(),
    done = new Set();
  for (const r of records) {
    if (uploaded.has(r.content.key)) continue;
    const bytes = await readFile(resolve(dir, r.content.key));
    if (hash(bytes) !== r.content.sha256)
      throw Error("Local checksum mismatch");
    const response = await fetch(base + "/v1/blobs/" + r.content.sha256, {
      method: "PUT",
      headers,
      body: bytes,
    });
    if (!response.ok) throw Error(await response.text());
    uploaded.add(r.content.key);
  }
  while (done.size < records.length) {
    let progress = false;
    for (const r of records) {
      if (done.has(r.pointer)) continue;
      const dependencies = Object.values(r.relations).flat();
      if (r.revision > 1)
        dependencies.push(`@${r.type}/${r.id}:v${r.revision - 1}`);
      if (r.parent) dependencies.push(r.parent + ":v1");
      if (dependencies.some((p) => !done.has(p))) continue;
      await api("/v1/import", r);
      done.add(r.pointer);
      progress = true;
    }
    if (!progress) throw Error("Unresolved import dependency/cycle");
  }
  console.log(
    `Imported ${done.size} immutable revisions and ${uploaded.size} blobs, preserving IDs.`,
  );
} else if (mode === "export") {
  await mkdir(dir, { recursive: true });
  let after = "",
    snapshot;
  let count = 0;
  const blobs = new Set();
  do {
    const q = new URLSearchParams({ after, limit: "20" });
    if (snapshot) q.set("snapshot", String(snapshot));
    const page = await api("/v1/export?" + q);
    snapshot = page.snapshot;
    for (const r of page.records) {
      const path = resolve(dir, r.record_key);
      if (!path.startsWith(dir + "/")) throw Error("Invalid record key");
      await mkdir(dirname(path), { recursive: true });
      let old;
      try {
        old = JSON.parse(await readFile(path, "utf8"));
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
      }
      if (old && old.record_checksum !== r.record_checksum)
        throw Error("Conflicting local revision");
      await writeFile(path, JSON.stringify(r) + "\n");
      count++;
      if (!blobs.has(r.content.key)) {
        const response = await fetch(
          base + "/v1/content?pointer=" + encodeURIComponent(r.pointer),
          { headers },
        );
        if (!response.ok) throw Error("Blob download failed");
        const data = Buffer.from(await response.arrayBuffer());
        if (hash(data) !== r.content.sha256)
          throw Error("Downloaded checksum mismatch");
        const p = resolve(dir, r.content.key);
        if (!p.startsWith(dir + "/")) throw Error("Invalid blob key");
        await mkdir(dirname(p), { recursive: true });
        await writeFile(p, data);
        blobs.add(r.content.key);
      }
    }
    let metadata = {};
    try {
      metadata = JSON.parse(
        await readFile(resolve(dir, "workspace.json"), "utf8"),
      );
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    if (metadata.id && metadata.id !== page.workspace_id)
      throw Error("Destination workspace identity mismatch");
    await writeFile(
      resolve(dir, "workspace.json"),
      JSON.stringify(
        {
          ...metadata,
          id: page.workspace_id,
          name: metadata.name ?? "Content",
          storage: { mode: "remote", url: base },
          artifact_schema_version: 1,
        },
        null,
        2,
      ) + "\n",
    );
    after = page.next_cursor;
  } while (after);
  await writeFile(
    resolve(dir, "export-receipt.json"),
    JSON.stringify(
      {
        source: base,
        snapshot,
        revisions: count,
        blobs: blobs.size,
        exported_at: new Date().toISOString(),
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    `Exported ${count} revisions and ${blobs.size} verified blobs at snapshot ${snapshot}.`,
  );
} else
  throw Error(
    "Usage: node scripts/workspace.mjs import|export [workspace path]",
  );
