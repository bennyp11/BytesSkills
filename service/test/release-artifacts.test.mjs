import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canonical, sha, verify, version } from '../scripts/release-artifacts.mjs';
test('release identity and every asset are checked before deployment', async () => {
  const dir = await mkdtemp(join(tmpdir(),'bytes-manifest-'));
  const commit = 'a'.repeat(40);
  const release = {skill:'help', version:'0.8.0', instructions:'Fixture only'};
  const contents = {'worker.js':'export default {};','plugin.zip':'fixture','wrangler.jsonc':'{}','package-lock.json':'{}','skill-help.json':JSON.stringify({releases:[release]})};
  const manifest = {schema_version:1,commit,version:'0.8.0',skills:[{skill:'help',file:'skill-help.json',checksum:sha(canonical(release))}],files:Object.fromEntries(Object.entries(contents).map(([k,v])=>[k,sha(v)]))};
  try {
    for (const [name,bytes] of Object.entries(contents)) await writeFile(join(dir,name),bytes);
    const save = () => writeFile(join(dir,'manifest.json'),JSON.stringify(manifest));
    await save();
    await verify(dir,commit,'0.8.0');
    await assert.rejects(verify(dir,'b'.repeat(40),'0.8.0'),/identity/);
    await assert.rejects(verify(dir,commit,'0.8.1'),/identity/);
    await writeFile(join(dir,'worker.js'),'tampered');
    await assert.rejects(verify(dir,commit,'0.8.0'),/checksum/);
    await writeFile(join(dir,'worker.js'),contents['worker.js']);
    manifest.skills[0].checksum = 'b'.repeat(64); await save();
    await assert.rejects(verify(dir,commit,'0.8.0'),/Skill checksum/);
    manifest.files['../outside'] = 'b'.repeat(64); await save();
    await assert.rejects(verify(dir,commit,'0.8.0'),/Unsafe/);
  } finally {await rm(dir,{recursive:true,force:true});}
});
test('release versions reject shell text, prereleases and leading zeros',()=>{
  for(const input of ['v0.8.0','01.0.0','1.0.0-beta','1.0.0;echo bad','']) assert.throws(()=>version(input));
  assert.equal(version('1.20.3'),'1.20.3');
});
