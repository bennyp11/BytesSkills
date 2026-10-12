import { readFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { verify } from './release-artifacts.mjs';
import { findRelease, verifyDraftTarget } from './draft-release-state.mjs';
const dir = resolve('../release-dist');
const commit = execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const {version} = JSON.parse(await readFile('../release.json','utf8'));
const manifest = await verify(dir,commit,version);
const tag = 'v'+version;
const repo = process.env.GITHUB_REPOSITORY;
if (!/^[\w.-]+\/[\w.-]+$/.test(repo ?? '')) throw Error('Missing valid GITHUB_REPOSITORY');
const gh = (args, input) => execFileSync('gh',args,{encoding:'utf8',input});
const api = `repos/${repo}`;
let current = findRelease(JSON.parse(gh(['api','--paginate','--slurp',`${api}/releases?per_page=100`])), tag);
const refs = JSON.parse(gh(['api',`${api}/git/matching-refs/tags/${tag}`]));
const remoteTag = refs.find(r=>r.ref===`refs/tags/${tag}`);
if (current) {
  let taggedCommit;
  if (remoteTag) {
    execFileSync('git',['fetch','origin',`refs/tags/${tag}:refs/tags/${tag}`]);
    taggedCommit = execFileSync('git',['rev-parse',`${tag}^{commit}`],{encoding:'utf8'}).trim();
  }
  verifyDraftTarget(current,commit,taggedCommit);
} else {
  if (remoteTag) throw Error('Tag exists without prepared release; use a new version');
  // The creation response supplies the draft ID directly; no tag lookup or race.
  current = JSON.parse(gh(['api','--method','POST',`${api}/releases`,'--input','-'], JSON.stringify({
    tag_name:tag,target_commitish:commit,draft:true,name:`BytesSkills ${version}`,
    body:`${manifest.summary}\n\nPrepared from ${commit}. Publishing this release starts production deployment. Adoption preferences remain unchanged. See the Actions run for deployment status; publication alone is not deployment success.`,
  })));
}
if (!Number.isSafeInteger(current.id)) throw Error('Invalid release ID');
// Never clobber assets. Reruns fill only missing assets after verifying existing bytes.
const assets = JSON.parse(gh(['api','--paginate','--slurp',`${api}/releases/${current.id}/assets?per_page=100`])).flat();
for (const name of (await readdir(dir)).sort()) {
  const asset = assets.find(a=>a.name===name);
  if (asset) {
    const bytes = execFileSync('gh',['api',`${api}/releases/assets/${asset.id}`,'-H','Accept: application/octet-stream']);
    if (!bytes.equals(await readFile(resolve(dir,name)))) throw Error('Existing release asset differs: '+name);
  } else gh(['api','--method','POST',`https://uploads.github.com/${api}/releases/${current.id}/assets?name=${encodeURIComponent(name)}`,'-H','Content-Type: application/octet-stream','--input',resolve(dir,name)]);
}
console.log(`Draft ${tag} ready: publish it in GitHub to deploy.`);
