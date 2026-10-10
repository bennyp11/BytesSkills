import { readFile, writeFile, readdir } from "node:fs/promises";
import { resolve, relative } from "node:path";
const root = resolve(".."),
  entries = {};
async function walk(dir) {
  for (const d of await readdir(dir, { withFileTypes: true })) {
    const p = resolve(dir, d.name);
    if (d.isDirectory()) await walk(p);
    else if (/\.(json|md)$/.test(p))
      entries[relative(root, p)] = await readFile(p, "utf8");
  }
}
await walk(resolve(root, "definitions"));
for (const p of [
  "docs/commands.md",
  "docs/system-spec.md",
  "plugins/bytesskills-core/skills/bytes/references/cloud.md",
  "plugins/bytesskills-core/skills/bytes/contracts/operations.json",
])
  entries[p] = await readFile(resolve(root, p), "utf8");
await writeFile(
  "src/library.json",
  JSON.stringify({ version: "0.6.0", entries }, null, 2) + "\n",
);
console.log(`Bundled ${Object.keys(entries).length} library entries`);
