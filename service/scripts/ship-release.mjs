import { readFile, readdir, appendFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { verify, sha, version, deployedVersion } from './release-artifacts.mjs';
import { checkStorageCutover } from './storage-cutover.mjs';
import { waitForDeployment } from './deployment-health.mjs';
const [mode, dirArg] = process.argv.slice(2);
if (!['preflight','publish'].includes(mode)) throw Error('Use ship-release.mjs preflight|publish DIR');
const dir = resolve(dirArg);
const commit = execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const target = version(JSON.parse(await readFile('../release.json','utf8')).version);
const manifest = await verify(dir,commit,target);
const registered = Object.keys(JSON.parse(await readFile('../plugins/bytesskills-core/skills/bytes/contracts/runtime.json','utf8')).skills).sort();
if (JSON.stringify(manifest.skills.map(s=>s.skill).sort()) !== JSON.stringify(registered)) throw Error('Incomplete release skill set');
const base = 'https://api.bytesskills.com'; // Never send a CI credential to an asset-supplied host.
const key = process.env.BYTES_OWNER_KEY;
if (!key) throw Error('Missing production BYTES_OWNER_KEY secret');
async function request(path, body, auth = true, timeoutMs = 30000) {
  const response = await fetch(base+path,{method:body ? 'POST':'GET',redirect:'error',signal:AbortSignal.timeout(timeoutMs),headers:{...(auth ? {Authorization:'Bearer '+key}:{}),'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:body ? JSON.stringify(body):undefined});
  if (!response.ok) { const error = Error(`Service ${path} failed: HTTP ${response.status}`); error.status = response.status; throw error; }
  return response.json();
}
const greater = (a,b) => {const x=a.split('.').map(Number),y=b.split('.').map(Number);for(let i=0;i<3;i++){if(x[i]!==y[i])return x[i]>y[i];}return false;};
const health = mode === 'publish'
  ? await waitForDeployment({readHealth: timeout => request('/health',null,false,timeout), target, commit})
  : await request('/health',null,false);
if (health.service !== 'BytesSkills' || health.status !== 'ok') throw Error('Unexpected service health');
const currentVersion = health.release ? deployedVersion(health.release) : null;
if (currentVersion && greater(currentVersion,target)) throw Error('Refusing to deploy an older release');
if (currentVersion === target && health.commit !== commit) throw Error('Release already deployed from a different commit');
if (mode === 'preflight') {
  checkStorageCutover(health, manifest.migrations, manifest.storage_backend);
  const pgNames = (await readdir('postgres/migrations')).filter(n=>n.endsWith('.sql')).sort();
  if (JSON.stringify(pgNames)!==JSON.stringify(Object.keys(manifest.postgres_migrations ?? {}).sort())) throw Error('PostgreSQL migration set mismatch');
  for (const name of pgNames) if (sha(await readFile('postgres/migrations/'+name))!==manifest.postgres_migrations[name]) throw Error('PostgreSQL migration checksum mismatch');
  if (sha(await readFile('wrangler.jsonc')) !== manifest.files['wrangler.jsonc'] || sha(await readFile('package-lock.json')) !== manifest.files['package-lock.json']) throw Error('Deployment config/dependency mismatch');
  const names = (await readdir('migrations')).filter(n=>n.endsWith('.sql')).sort();
  if (JSON.stringify(names) !== JSON.stringify(Object.keys(manifest.migrations).sort())) throw Error('Migration set mismatch');
  for (const name of names) if (sha(await readFile('migrations/'+name)) !== manifest.migrations[name]) throw Error('Migration checksum mismatch');
  let catalog;
  try { catalog = await request('/v1/releases'); }
  catch(error) {
    if (error.status !== 404 || health.release != null || health.version !== '0.2.0') throw error;
    // First deployment from the known pre-automation service: still verify owner auth.
    await request('/v1/library');
    console.log('Bootstrap from pre-automation service; old catalog checksum preflight unavailable.');
  }
  for (const r of catalog?.releases ?? []) {
    const expected = manifest.skills.find(s=>s.skill===r.skill);
    if (!expected) continue;
    if (greater(version(r.version),target)) throw Error('Newer skill release already exists: '+r.skill);
    if (r.version === target && (r.checksum !== expected.checksum || r.revoked)) throw Error('Conflicting or revoked skill release: '+r.skill);
  }
  console.log('Preflight passed; no adoption preferences changed.');
} else {
  if (health.release !== target || health.commit !== commit) throw Error('Deployed Worker identity does not match release');
  // Read-only MCP discovery tests auth and the shared tool surface without starting runs.
  const rpc = await request('/mcp',{jsonrpc:'2.0',id:1,method:'tools/list',params:{}});
  if (!rpc.result?.tools?.some(t=>t.name==='bytes_begin') || !rpc.result.tools.some(t=>t.name==='bytes_updates')) throw Error('MCP discovery verification failed');
  for (const item of manifest.skills) {
    await request('/v1/releases',JSON.parse(await readFile(resolve(dir,item.file),'utf8')));
    console.log(`Published or verified ${item.skill}@${target}`);
  }
  const catalog = await request('/v1/releases');
  for (const item of manifest.skills) {
    const r = catalog.releases.find(r=>r.skill===item.skill && r.version===target);
    if (!r || r.revoked || r.checksum!==item.checksum) throw Error('Published catalog verification failed: '+item.skill);
  }
  const summary = `## Verified BytesSkills ${target}\n\nCommit: ${commit}\n\nWorker identity and ${manifest.skills.length} skill checksums verified. Workspace adoption preferences were preserved.\n`;
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY,summary);
  console.log('Release verified. Workspace adoption is unchanged.');
}
