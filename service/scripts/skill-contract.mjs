import { z } from 'zod';

const slug = z.string().regex(/^[a-z][a-z0-9-]*$/);
const text = z.string().trim().min(1);
const strings = z.array(text).min(1);
const unique = xs => new Set(xs).size === xs.length;
const parameter = z.object({
  interface: z.enum(['flag', 'conversation']),
  type: z.enum(['string', 'number', 'boolean', 'pointer']),
  required: z.boolean(),
  applies_when: text,
  question: text,
  allow_delegation: z.boolean(),
  inherit_from: z.array(text),
  artifact_types: z.array(slug).min(1).optional(),
}).strict();
const output = z.object({
  id: slug,
  artifact_type: slug,
  when: text,
  media_types: z.array(z.string().regex(/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/)).min(1),
  persistence: z.enum(['new-artifact', 'append-revision', 'new-or-revision']),
  delivery: z.enum(['workspace', 'workspace-or-explicit-local-file']),
  profile: z.object({id: slug, version: z.string().regex(/^\d+\.\d+\.\d+$/)}).strict().nullable(),
  quality_checks: strings,
}).strict();

// Structural schema is portable. validateSkillContract adds cross-field invariants.
export const skillContractV2 = z.object({
  schema_version: z.literal(2),
  id: slug,
  version: z.string().regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/),
  status: z.enum(['draft', 'active', 'deprecated']),
  purpose: text,
  command: slug,
  natural_language: z.object({positive: strings, negative: strings, ambiguity_question: text}).strict(),
  parameters: z.record(slug, parameter),
  parameter_rules: strings,
  intake_order: z.array(slug),
  outputs: z.array(output).min(1),
  capabilities: z.array(z.object({
    id: slug, required_for: strings, unavailable: text,
  }).strict()),
  effects: z.array(z.enum(['workspace-write', 'local-file-write', 'computer-control'])).refine(unique),
  failure: z.object({
    partial: z.literal('preserve-completed-outputs'),
    retry: z.literal('reuse-save-request-id-for-identical-retry'),
    conflict: z.literal('reread-and-resolve-never-overwrite'),
  }).strict(),
  response_contract: z.literal('references/responses.md'),
  execution_contract: z.literal('references/skill-contract.md'),
  quality_checks: strings,
  handler: z.string().regex(/^references\/[a-z0-9/.-]+\.md$/),
}).strict();

export function validateSkillContract(value, types) {
  const c = skillContractV2.parse(value);
  if (c.handler.split('/').includes('..')) throw Error('Unsafe handler path');
  const params = Object.keys(c.parameters);
  if (!unique(c.intake_order) || c.intake_order.length !== params.length ||
      c.intake_order.some(p => !params.includes(p))) throw Error('Intake must name every parameter exactly once');
  for (const p of Object.values(c.parameters)) {
    if ((p.type === 'pointer') !== !!p.artifact_types) throw Error('Only pointer parameters require artifact_types');
    for (const type of p.artifact_types ?? [])
      if (!types.includes(type)) throw Error('Unknown input artifact type: ' + type);
    for (const source of p.inherit_from)
      if (!params.includes(source.split('.')[0])) throw Error('Inheritance names unknown input: ' + source);
  }
  if (!unique(c.outputs.map(o => o.id))) throw Error('Duplicate output ID');
  for (const o of c.outputs) {
    if (!types.includes(o.artifact_type)) throw Error('Unknown output artifact type: ' + o.artifact_type);
    if (['video', 'audio', 'image'].includes(o.artifact_type) &&
        o.media_types.some(m => !m.startsWith(o.artifact_type + '/')))
      throw Error('Media artifact requires matching media types');
    if (o.delivery === 'workspace-or-explicit-local-file' && !c.effects.includes('local-file-write'))
      throw Error('Local delivery requires local-file-write effect');
  }
  if (!c.effects.includes('workspace-write')) throw Error('Artifact-producing skills require workspace-write effect');
  if (!unique(c.capabilities.map(x => x.id))) throw Error('Duplicate capability ID');
  for (const capability of c.capabilities)
    if (capability.required_for.some(id => !c.outputs.some(o => o.id === id)))
      throw Error('Capability refers to unknown output');
  return c;
}
