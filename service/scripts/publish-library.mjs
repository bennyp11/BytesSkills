// Publish a prepared release batch without Git. Server validates, hashes and preserves it.
import { readFile } from "node:fs/promises";
const file = process.argv[2];
if (!file)
  throw Error("Usage: node scripts/publish-library.mjs release-batch.json");
const base = process.env.BYTES_URL ?? "https://api.bytesskills.com";
const key = (
  await readFile(process.env.BYTES_KEY_FILE ?? ".secrets/owner-key.txt", "utf8")
).trim();
const r = await fetch(base + "/v1/releases", {
  method: "POST",
  headers: {
    Authorization: "Bearer " + key,
    "Content-Type": "application/json",
  },
  body: await readFile(file, "utf8"),
});
if (!r.ok) throw Error(`${r.status}: ${await r.text()}`);
console.log(JSON.stringify(await r.json(), null, 2));
