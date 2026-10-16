import { readFile, access, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { validateSkillContract } from './skill-contract.mjs';
import { schemaText } from './export-skill-schema.mjs';
const slug = z.string().regex(/^[a-z][a-z0-9-]*$/);
const version = z.string().regex(/^\d+\.\d+\.\d+$/);
const unique = values => new Set(values).size === values.length;
const strings = z.array(z.string().min(1));
export const registrySchema = z.object({
  schema_version: z.literal(1),
  artifact_types: z.array(z.string().regex(/^[a-z]+$/)).min(1).refine(unique),
  statuses: z.array(slug).min(1).refine(unique),
  skills: z.record(slug, z.object({
    commands: z.array(slug).min(1).refine(unique),
    can_save: z.boolean(), handler: z.string().regex(/^references\/[a-z0-9/.-]+\.md$/),
    include_definitions: z.boolean(),
  }).strict()),
}).strict();
export const formatSchema = z.object({
  schema_version: z.literal(1), id: slug, version,
  status: z.enum(["draft", "active", "deprecated"]), name: z.string().min(1),
  purpose: z.string().min(1), extends: slug.nullable(), workflow: slug,
  default_treatment: slug.nullable(), required_inputs: strings,
  structure: z.array(z.object({stage: slug}).passthrough()).min(1),
  defaults: z.record(z.string(), z.json()), review_checks: strings.min(1),
}).passthrough();
const fieldSchema = z.object({
  type: z.enum(["string", "number", "boolean", "pointer"]),
  required: z.boolean(), question: z.string().min(1), allow_delegation: z.boolean(),
  artifact_types: z.array(slug).min(1).optional(),
}).strict().refine(f => f.type === "pointer" ? !!f.artifact_types : !f.artifact_types,
  "Only pointer fields require artifact_types");
const authoringBase = {schema_version: z.literal(1), id: slug, version,
  status: z.enum(["draft", "active", "deprecated"]), purpose: z.string().min(1),
  quality_checks: strings.min(1)};
export const skillContractSchema = z.object({...authoringBase, command: slug,
  natural_language: z.object({positive: strings.min(1), negative: strings.min(1), ambiguity_question: z.string().min(1)}).strict(),
  parameters: z.record(slug, fieldSchema), outputs: z.array(slug).min(1),
  persistence: z.enum(["new-artifacts", "append-revision", "new-artifacts-or-revisions", "read-only"]),
  capabilities: strings, handler: z.string().regex(/^references\/[a-z0-9/.-]+\.md$/),
}).strict();
export const profileSchema = z.object({...authoringBase, base_type: slug,
  fields: z.record(slug, fieldSchema), migration_notes: z.string().min(1)}).strict();
export function validateAuthoring(value, kind, types) {
  if (kind === 'skill' && value.schema_version === 2) return validateSkillContract(value, types);
  const parsed = (kind === "skill" ? skillContractSchema : profileSchema).parse(value);
  const refs = kind === "skill" ? [...parsed.outputs] : [parsed.base_type];
  for (const field of Object.values(kind === "skill" ? parsed.parameters : parsed.fields))
    refs.push(...(field.artifact_types ?? []));
  for (const type of refs) if (!types.includes(type)) throw Error("Unknown profile/skill artifact type: " + type);
  if (kind === "skill" && parsed.handler.split("/").includes("..")) throw Error("Unsafe handler path");
}
export function validateGraph(formats, workflows, treatments) {
  const byId = new Map(formats.map(f => [f.id, f]));
  if (byId.size !== formats.length) throw Error("Duplicate format ID");
  for (const format of formats) {
    formatSchema.parse(format);
    if (!workflows.includes(format.workflow)) throw Error("Unknown workflow: " + format.workflow);
    if (format.default_treatment && !treatments.includes(format.default_treatment)) throw Error("Unknown treatment");
    const seen = new Set();
    let current = format;
    while (current) {
      if (seen.has(current.id)) throw Error("Format inheritance cycle");
      seen.add(current.id);
      if (!current.extends) break;
      const parent = byId.get(current.extends);
      if (!parent) throw Error("Unknown parent format: " + current.extends);
      current = parent;
    }
  }
}
export function validateRoutes(registry, operations) {
  registrySchema.parse(registry);
  const routes = new Set();
  for (const spec of Object.values(registry.skills)) {
    if (spec.handler.split("/").includes("..")) throw Error("Unsafe handler path");
    for (const command of spec.commands) {
      if (routes.has(command)) throw Error("Duplicate command: " + command);
      routes.add(command);
      if (command !== "help" && !operations[command]) throw Error("Missing operation: " + command);
    }
  }
  for (const [name, operation] of Object.entries(operations)) {
    if (!routes.has(name)) throw Error("Operation has no route: " + name);
    version.parse(operation.version);
    for (const type of [...(operation.inputs ?? []), ...(operation.outputs ?? [])])
      if (type !== "same-type" && !registry.artifact_types.includes(type)) throw Error("Unknown artifact type: " + type);
  }
  for (const required of ["help", "inspect", "sync"])
    if (registry.skills[required]?.can_save !== false) throw Error("Read-only workflow cannot save: " + required);
}
export async function checkLibrary(root = resolve("..")) {
  const skill = resolve(root, "plugins/bytesskills-core/skills/bytes");
  if (await readFile(resolve(skill, 'contracts/skill.schema.json'), 'utf8') !== schemaText())
    throw Error('Stale skill JSON Schema; run node scripts/export-skill-schema.mjs');
  const json = async path => JSON.parse(await readFile(path, "utf8"));
  const registry = await json(resolve(skill, "contracts/runtime.json"));
  const operations = (await json(resolve(skill, "contracts/operations.json"))).operations;
  validateRoutes(registry, operations);
  for (const spec of [...Object.values(registry.skills), ...Object.values(operations)])
    await access(resolve(skill, spec.handler));
  const defs = async category => Promise.all((await readdir(resolve(root, "definitions", category)))
    .filter(name => name.endsWith(".json")).map(name => json(resolve(root, "definitions", category, name))));
  const [formats, workflows, treatments] = await Promise.all([defs("formats"), defs("workflows"), defs("treatments")]);
  validateGraph(formats, workflows.map(x => x.id), treatments.map(x => x.id));
  for (const [folder, kind] of [["skills", "skill"], ["object-profiles", "profile"]]) {
    let entries;
    try { entries = await defs(folder); }
    catch (error) { if (error.code === "ENOENT") entries = []; else throw error; }
    const ids = new Set();
    for (const entry of entries) {
      validateAuthoring(entry, kind, registry.artifact_types);
      if (ids.has(entry.id)) throw Error("Duplicate authoring ID: " + entry.id);
      ids.add(entry.id);
      if (kind === "skill") {
        if (entry.schema_version !== 2) throw Error('Migrate source skill contracts to schema_version 2: ' + entry.id);
        const spec = registry.skills[entry.id];
        if (!spec || !spec.commands.includes(entry.command) || spec.handler !== entry.handler)
          throw Error("Skill contract disagrees with runtime registry: " + entry.id);
        const operation = operations[entry.command];
        if (!spec.can_save) throw Error('Artifact-producing contract cannot use a read-only route');
        for (const output of entry.outputs) {
          if (!(operation?.outputs ?? []).includes(output.artifact_type))
            throw Error('Output disagrees with operation: ' + output.artifact_type);
          if (operation.persistence === 'new-artifacts' && output.persistence !== 'new-artifact')
            throw Error('New-artifact operation cannot append revisions');
          if (output.profile) {
            const profile = await json(resolve(root, 'definitions/object-profiles', output.profile.id + '.json'));
            validateAuthoring(profile, 'profile', registry.artifact_types);
            if (profile.version !== output.profile.version || profile.base_type !== output.artifact_type)
              throw Error('Output profile version/type mismatch');
          }
        }
        await access(resolve(skill, entry.handler));
        await access(resolve(skill, entry.execution_contract));
        await access(resolve(skill, entry.response_contract));
      }
    }
  }
  for (const [name, kind] of [["skill", "skill"], ["object-profile", "profile"]])
    validateAuthoring(await json(resolve(root, "templates/extensions", name + ".json")), kind, registry.artifact_types);
  formatSchema.parse(await json(resolve(root, "templates/extensions/format.json")));
  // A new fundamental type requires a deliberate SQL migration, not just registry edits.
  const migrations = (await readdir(resolve(root, "service/postgres/migrations"))).filter(name => /^\d+.*\.sql$/.test(name)).sort();
  let sql;
  for (const name of migrations) {
    const candidate = await readFile(resolve(root, "service/postgres/migrations", name), "utf8");
    if (candidate.includes("ADD CONSTRAINT revisions_type_check")) sql = candidate;
  }
  if (!sql) throw Error("No migration defines the current artifact type constraint");
  const sqlTypes = [...sql.match(/type IN \(([^)]+)\)/)[1].matchAll(/'([^']+)'/g)].map(x => x[1]);
  if (JSON.stringify([...sqlTypes].sort()) !== JSON.stringify([...registry.artifact_types].sort()))
    throw Error("Artifact registry and SQL type constraint differ; implement and verify a migration before extending types");
  console.log(`Validated ${Object.keys(registry.skills).length} skills, ${formats.length} formats, routes, handlers and storage types`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await checkLibrary();
