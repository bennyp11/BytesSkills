// Build once in preparation; deploy only these verified assets from the tagged commit.
import { readFile, writeFile, mkdir, copyFile, readdir, lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
export const canonical = value => Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']' :
  value && typeof value === 'object' ? '{' + Object.keys(value).sort().map(k => JSON.stringify(k)+':'+canonical(value[k])).join(',') + '}' : JSON.stringify(value);
export const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export function version(value) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)) throw Error('Expected stable semantic version');
  return value;
}
export async function verify(dir, expectedCommit, expectedVersion) {
  const manifest = JSON.parse(await readFile(resolve(dir, 'manifest.json'), 'utf8'));
  if (manifest.schema_version !== 1 || manifest.commit !== expectedCommit || manifest.version !== version(expectedVersion)) throw Error('Release identity mismatch');
  if (!/^[0-9a-f]{40}$/.test(manifest.commit)) throw Error('Invalid commit');
  if (!Array.isArray(manifest.skills) || !manifest.skills.length) throw Error('Missing skills');
  for (const [name, digest] of Object.entries(manifest.files)) {
    if (basename(name) !== name || !/^[a-zA-Z0-9._-]+$/.test(name) || name === 'manifest.json') throw Error('Unsafe asset path');
    if ((await lstat(resolve(dir, name))).isSymbolicLink()) throw Error('Symlink asset');
    if (sha(await readFile(resolve(dir, name))) !== digest) throw Error('Asset checksum mismatch: '+name);
  }
  for (const name of ['worker.js', 'plugin.zip', 'wrangler.jsonc', 'package-lock.json'])
    if (!manifest.files[name]) throw Error('Missing asset: '+name);
  const seen = new Set();
  for (const item of manifest.skills) {
    if (seen.has(item.skill) || item.file !== `skill-${item.skill}.json` || !manifest.files[item.file]) throw Error('Invalid skill manifest');
    seen.add(item.skill);
    const batch = JSON.parse(await readFile(resolve(dir, item.file), 'utf8'));
    const r = batch.releases?.[0];
    if (batch.releases.length !== 1 || r.skill !== item.skill || r.version !== manifest.version || sha(canonical(r)) !== item.checksum) throw Error('Skill checksum mismatch');
  }
  return manifest;
}
async function build() {
  execFileSync('git', ['-C','..','diff','--quiet','HEAD','--','.',':!service/src/library.json']);
  const dir = resolve('../release-dist');
  await mkdir(dir); // Refuse stale output rather than silently reusing files.
  const spec = JSON.parse(await readFile('../release.json', 'utf8'));
  version(spec.version);
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], {encoding:'utf8'}).trim();
  const registry = JSON.parse(await readFile('../plugins/bytesskills-core/skills/bytes/contracts/runtime.json','utf8'));
  const skills = [];
  for (const skill of Object.keys(registry.skills)) {
    const file = `skill-${skill}.json`;
    execFileSync(process.execPath, ['scripts/build-release.mjs',spec.version,resolve(dir,file),skill], {stdio:'pipe'});
    const r = JSON.parse(await readFile(resolve(dir,file),'utf8')).releases[0];
    skills.push({skill,file,checksum:sha(canonical(r))});
  }
  await copyFile('dist/index.js', resolve(dir,'worker.js'));
  await copyFile('wrangler.jsonc', resolve(dir,'wrangler.jsonc'));
  await copyFile('package-lock.json', resolve(dir,'package-lock.json'));
  // Deterministic archive; includes only tracked plugin source, never local media/caches.
  execFileSync('python3', ['scripts/package-plugin.py',spec.version,resolve(dir,'plugin.zip')], {stdio:'inherit'});
  const files = {};
  for (const name of (await readdir(dir)).sort()) files[name] = sha(await readFile(resolve(dir,name)));
  const migrations = {};
  for (const name of (await readdir('migrations')).filter(n => n.endsWith('.sql')).sort()) migrations[name] = sha(await readFile('migrations/'+name));
  await writeFile(resolve(dir,'manifest.json'), JSON.stringify({schema_version:1,version:spec.version,commit,summary:spec.summary,files,skills,migrations},null,2)+'\n',{flag:'wx'});
  await verify(dir,commit,spec.version);
  console.log(`Prepared ${spec.version} at ${commit}`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === 'verify') await verify(process.argv[3],process.argv[4],process.argv[5]);
  else if (process.argv[2] === 'build') await build();
  else throw Error('Use release-artifacts.mjs build|verify DIR COMMIT VERSION');
}
