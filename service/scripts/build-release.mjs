import { checkLibrary } from "./check-library.mjs";
await checkLibrary();
await import("./bundle-library.mjs");
// Build self-contained skill snapshots. Publication does not require Git.
import { dirname } from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";
const version = process.argv[2];
if (!version) throw Error("Supply a NEW release version explicitly");
if (!/^\d+\.\d+\.\d+$/.test(version)) throw Error("Use a semantic version");
const library = JSON.parse(await readFile("src/library.json", "utf8"));
const root = "../plugins/bytesskills-core/skills/bytes/";
const versions = await readFile(root + "references/versions.md", "utf8");
const cloud = await readFile(root + "references/cloud.md", "utf8");
const registry = JSON.parse(await readFile(root + "contracts/runtime.json", "utf8"));
const requestedSkill = process.argv[4];
if (requestedSkill && !Object.hasOwn(registry.skills, requestedSkill)) throw Error("Unknown skill");
const skills = requestedSkill ? [requestedSkill] : Object.keys(registry.skills);
const handlers = Object.fromEntries(await Promise.all(skills.map(async skill =>
  [skill, await readFile(root + registry.skills[skill].handler, "utf8")],
)));
const releases = skills.map((skill) => ({
  skill,
  version,
  protocol: 1,
  summary:
    "Uses unified extension contracts, natural-language routing, and cloud-only workspace persistence.",
  required_scopes: [
    "bytes:read",
    ...(registry.skills[skill].can_save
      ? ["bytes:write"]
      : []),
  ],
  instructions:
    versions +
    "\n" +
    cloud +
    "\n" + handlers[skill] +
    "\nOnly perform the requested " +
    skill +
    " operation. Use the bundled command contract. Help is read-only and must not start creative intake.",
  resources: Object.fromEntries(
    Object.entries(library.entries).filter(
      ([path]) =>
        path === "docs/commands.md" ||
        (skill === "captions" && path.endsWith("references/edit/instructions.md")) ||
        (skill === "edit" && path.endsWith("references/clip/instructions.md")) ||
        path.includes("/contracts/") ||
        path.endsWith("references/routing.md") ||
        (skill === "help" && path.endsWith("references/help/references/guide.md")) ||
        (registry.skills[skill].include_definitions &&
          path.startsWith("definitions/")),
    ),
  ),
}));
if (Buffer.byteLength(JSON.stringify(releases)) > 250000)
  throw Error("Batch exceeds server limit; build one skill at a time: build-release.mjs VERSION OUTPUT SKILL. Publish all required candidates before bulk adoption.");
const output = process.argv[3] ?? `releases/${version}.json`;
await mkdir(dirname(output), { recursive: true });
await writeFile(
  output,
  JSON.stringify({ releases }, null, 2) + "\n",
  { flag: "wx" },
);
console.log(
  "Built immutable publication candidate: " +
    releases.length +
    " skill releases",
);
