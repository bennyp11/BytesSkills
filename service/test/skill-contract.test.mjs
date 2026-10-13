import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateSkillContract } from '../scripts/skill-contract.mjs';
import { validateAuthoring } from '../scripts/check-library.mjs';
const types = JSON.parse(await readFile('../plugins/bytesskills-core/skills/bytes/contracts/runtime.json', 'utf8')).artifact_types;
const load = async id => JSON.parse(await readFile(`../definitions/skills/${id}.json`, 'utf8'));

test('text and media reference skills validate without granting runtime permissions', async () => {
  for (const id of ['brainstorm', 'edit', 'captions']) validateAuthoring(await load(id), 'skill', types);
  const c = await load('brainstorm');
  assert.equal(c.parameters.audience.interface, 'conversation');
  assert.equal(c.parameters.format.interface, 'flag');
  assert.ok(c.outputs.every(o => o.persistence === 'new-artifact'));
});

test('rejects contracts that obscure missing inputs or invent dependencies', async () => {
  const base = await load('brainstorm');
  for (const mutate of [
    c => c.intake_order.pop(),
    c => c.intake_order.push(c.intake_order[0]),
    c => delete c.parameters.concept.artifact_types,
    c => c.parameters.format.artifact_types = ['concept'],
    c => c.parameters.format.inherit_from.push('nonexistent.settings.format'),
    c => c.parameters.concept.artifact_types.push('invented'),
  ]) { const c = structuredClone(base); mutate(c); assert.throws(() => validateSkillContract(c, types)); }
});

test('rejects false media declarations, unknown capability targets and unsafe handlers', async () => {
  const base = await load('edit');
  for (const mutate of [
    c => c.outputs[1].media_types = ['text/markdown'],
    c => c.outputs[1].media_types = ['video/mp4\r\nInjected: header'],
    c => c.outputs[1].artifact_type = 'invented',
    c => c.outputs[1].id = c.outputs[0].id,
    c => c.capabilities[0].required_for = ['nonexistent'],
    c => c.effects = ['workspace-write'],
    c => c.effects = ['local-file-write'],
    c => c.handler = 'references/../private.md',
    c => c.effects.push('platform-publish'),
    c => c.failure.conflict = 'overwrite',
  ]) { const c = structuredClone(base); mutate(c); assert.throws(() => validateSkillContract(c, types)); }
});

test('legacy authoring remains readable without pretending it is v2', async () => {
  const legacy = {schema_version:1,id:'example',version:'0.1.0',status:'draft',purpose:'Example',command:'example',natural_language:{positive:['Do it'],negative:['Explain it'],ambiguity_question:'Which?'},parameters:{},outputs:['plan'],persistence:'new-artifacts',capabilities:[],quality_checks:['Check'],handler:'references/artifacts.md'};
  validateAuthoring(legacy, 'skill', types);
  assert.throws(() => validateSkillContract(legacy, types));
});
