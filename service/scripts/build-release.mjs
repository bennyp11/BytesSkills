// Build self-contained skill snapshots. Publication does not require Git.
import { readFile, writeFile, mkdir } from "node:fs/promises";
const version = process.argv[2] ?? "0.7.0";
if (!/^\d+\.\d+\.\d+$/.test(version)) throw Error("Use a semantic version");
const library = JSON.parse(await readFile("src/library.json", "utf8"));
const root = "../plugins/bytesskills-core/skills/bytes/";
const versions = await readFile(root + "references/versions.md", "utf8");
const cloud = await readFile(root + "references/cloud.md", "utf8");
const clip = await readFile(root + "references/clip/instructions.md", "utf8");
const skills = [
  "help",
  "brainstorm",
  "refine",
  "inspect",
  "organize",
  "clip",
  "sync",
];
const releases = skills.map((skill) => ({
  skill,
  version,
  protocol: 1,
  summary:
    "Adds shared version adoption, update/stay/automatic preferences, pinned workflow provenance, and one-step library sync.",
  required_scopes: [
    "bytes:read",
    ...(["brainstorm", "refine", "organize", "clip"].includes(skill)
      ? ["bytes:write"]
      : []),
  ],
  instructions:
    versions +
    "\n" +
    cloud +
    (skill === "clip" ? "\n" + clip : "") +
    "\nOnly perform the requested " +
    skill +
    " operation. Use the bundled command contract. Help is read-only and must not start creative intake.",
  resources: Object.fromEntries(
    Object.entries(library.entries).filter(
      ([path]) =>
        path === "docs/commands.md" ||
        path.endsWith("operations.json") ||
        (["brainstorm", "refine", "clip"].includes(skill) &&
          path.startsWith("definitions/")),
    ),
  ),
}));
await mkdir("releases", { recursive: true });
await writeFile(
  `releases/${version}.json`,
  JSON.stringify({ releases }, null, 2) + "\n",
);
console.log(
  "Built immutable publication candidate: " +
    releases.length +
    " skill releases",
);
