import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateGraph, validateRoutes, checkLibrary, validateAuthoring } from "../scripts/check-library.mjs";
const root = "../plugins/bytesskills-core/skills/bytes/contracts/";
const registry = JSON.parse(await readFile(root + "runtime.json", "utf8"));
const operations = JSON.parse(await readFile(root + "operations.json", "utf8")).operations;
test("library contracts agree across routing, handlers, formats and SQL", async () => { await checkLibrary(); });
test("duplicate routes, unknown output types and write-enabled inspection fail", () => {
  let r = structuredClone(registry);
  r.skills.refine.commands.push("brainstorm");
  assert.throws(() => validateRoutes(r, operations), /Duplicate command/);
  r = structuredClone(registry); r.skills.inspect.can_save = true;
  assert.throws(() => validateRoutes(r, operations), /Read-only/);
  const ops = structuredClone(operations); ops.refine.outputs = ["invented"];
  assert.throws(() => validateRoutes(registry, ops), /Unknown artifact/);
});
test("format inheritance rejects cycles and missing dependencies", async () => {
  const f = JSON.parse(await readFile("../definitions/formats/reductions.json", "utf8"));
  const workflows = [f.workflow], treatments = [f.default_treatment];
  assert.throws(() => validateGraph([{...f, extends: f.id}], workflows, treatments), /cycle/);
  assert.throws(() => validateGraph([{...f, extends: "missing"}], workflows, treatments), /Unknown parent/);
  assert.throws(() => validateGraph([f], [], treatments), /Unknown workflow/);
  assert.throws(() => validateGraph([f], workflows, []), /Unknown treatment/);
});

test("object profiles reject missing pointer targets and unsupported base types", async () => {
  const profile = JSON.parse(await readFile("../templates/extensions/object-profile.json", "utf8"));
  validateAuthoring(profile, "profile", registry.artifact_types);
  assert.throws(() => validateAuthoring({...profile, base_type: "episode"}, "profile", registry.artifact_types), /Unknown/);
  delete profile.fields.source.artifact_types;
  assert.throws(() => validateAuthoring(profile, "profile", registry.artifact_types));
});

test("release builder includes pinned routing/handler, fits server limits and refuses overwrite", async () => {
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { execFileSync } = await import("node:child_process");
  const dir = await mkdtemp(join(tmpdir(), "bytes-release-"));
  const output = join(dir, "candidate.json");
  const args = ["scripts/build-release.mjs", "0.9.0", output, "brainstorm"];
  try {
    execFileSync(process.execPath, args, {stdio: "pipe"});
    const text = await readFile(output, "utf8");
    const batch = JSON.parse(text);
    assert.equal(batch.releases.length, 1);
    const release = batch.releases[0];
    assert.equal(release.skill, "brainstorm");
    assert.ok(release.instructions.includes("Artifact runtime and workflow contract"));
    const responseContract = await readFile("../plugins/bytesskills-core/skills/bytes/references/responses.md", "utf8");
    assert.ok(release.instructions.includes(responseContract));
    assert.ok(Object.keys(release.resources).some(p => p.endsWith("references/routing.md")));
    assert.ok(Buffer.byteLength(JSON.stringify(batch.releases)) <= 250000);
    assert.throws(() => execFileSync(process.execPath, args, {stdio: "pipe"}));
    assert.equal(await readFile(output, "utf8"), text);
  } finally { await rm(dir, {recursive: true, force: true}); }
});

test("CapCut release pins its handler, authoring contract and progressive-clip dependency", async () => {
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { execFileSync } = await import("node:child_process");
  const dir = await mkdtemp(join(tmpdir(), "bytes-edit-"));
  try {
    const output = join(dir, "edit.json");
    execFileSync(process.execPath, ["scripts/build-release.mjs", "0.9.0", output, "edit"], {stdio: "pipe"});
    const release = JSON.parse(await readFile(output, "utf8")).releases[0];
    assert.equal(release.skill, "edit");
    assert.deepEqual(release.required_scopes, ["bytes:read", "bytes:write"]);
    assert.ok(release.instructions.includes("Edit video in CapCut through computer control"));
    assert.equal(JSON.parse(release.resources["definitions/skills/edit.json"]).command, "edit");
    assert.ok(release.resources["plugins/bytesskills-core/skills/bytes/references/clip/instructions.md"]);
  } finally { await rm(dir, {recursive: true, force: true}); }
});

test("caption release contains its contract and shared CapCut execution instructions", async () => {
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { execFileSync } = await import("node:child_process");
  const dir = await mkdtemp(join(tmpdir(), "bytes-captions-"));
  try {
    const output = join(dir, "captions.json");
    execFileSync(process.execPath, ["scripts/build-release.mjs", "0.9.0", output, "captions"], {stdio: "pipe"});
    const release = JSON.parse(await readFile(output, "utf8")).releases[0];
    assert.equal(release.skill, "captions");
    assert.ok(release.instructions.includes(await readFile("../plugins/bytesskills-core/skills/bytes/references/responses.md", "utf8")));
    assert.deepEqual(release.required_scopes, ["bytes:read", "bytes:write"]);
    assert.ok(release.instructions.includes("Add captions in CapCut"));
    assert.equal(JSON.parse(release.resources["definitions/skills/captions.json"]).command, "captions");
    assert.ok(release.resources["plugins/bytesskills-core/skills/bytes/references/edit/instructions.md"]);
  } finally { await rm(dir, {recursive: true, force: true}); }
});

test("every skill release inherits the same response contract without optional opt-in", async () => {
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { execFileSync } = await import("node:child_process");
  const dir = await mkdtemp(join(tmpdir(), "bytes-responses-"));
  const contract = await readFile("../plugins/bytesskills-core/skills/bytes/references/responses.md", "utf8");
  try {
    for (const skill of Object.keys(registry.skills)) {
      const output = join(dir, skill + ".json");
      execFileSync(process.execPath, ["scripts/build-release.mjs", "0.9.0", output, skill], {stdio: "pipe"});
      const release = JSON.parse(await readFile(output, "utf8")).releases[0];
      assert.ok(release.instructions.includes(contract), skill);
      assert.ok(release.instructions.length <= 50000, skill + " instruction limit");
    }
  } finally { await rm(dir, {recursive: true, force: true}); }
});
