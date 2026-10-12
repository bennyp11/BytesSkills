import { readFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { verify } from './release-artifacts.mjs';
const dir = resolve('../release-dist');
const commit = execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const {version} = JSON.parse(await readFile('../release.json','utf8'));
const manifest = await verify(dir,commit,version);
const tag = 'v'+version;
const gh = args => execFileSync('gh',args,{encoding:'utf8'});
let existing;
try { existing = JSON.parse(gh(['api',`repos/${process.env.GITHUB_REPOSITORY}/releases/tags/${tag}`])); }
catch(error) { if (!String(error.stderr).includes('HTTP 404')) throw error; }
if (existing) {
  if (!existing.draft) throw Error('Release already published; bump release.json for new work');
  execFileSync('git',['fetch','origin',`refs/tags/${tag}:refs/tags/${tag}`]);
  const tagged = execFileSync('git',['rev-parse',`${tag}^{commit}`],{encoding:'utf8'}).trim();
  if (tagged !== commit) throw Error('Version already belongs to a different commit; bump release.json');
} else {
  // Reject an unrelated existing tag before creating a release around it.
  const remote = gh(['api',`repos/${process.env.GITHUB_REPOSITORY}/git/matching-refs/tags/${tag}`]);
  if (JSON.parse(remote).some(r=>r.ref===`refs/tags/${tag}`)) throw Error('Tag exists without prepared release; use a new version');
  gh(['release','create',tag,'--draft','--target',commit,'--title',`BytesSkills ${version}`,'--notes',`${manifest.summary}\n\nPrepared from ${commit}. Publishing this release starts production deployment. Adoption preferences remain unchanged. See the Actions run for deployment status; publication alone is not deployment success.`]);
}
// Never clobber assets. A rerun may fill missing assets only if existing bytes match.
const current = JSON.parse(gh(['api',`repos/${process.env.GITHUB_REPOSITORY}/releases/tags/${tag}`]));
for (const name of (await readdir(dir)).sort()) {
  const asset = current.assets.find(a=>a.name===name);
  if (asset) {
    const bytes = execFileSync('gh',['api',`repos/${process.env.GITHUB_REPOSITORY}/releases/assets/${asset.id}`,'-H','Accept: application/octet-stream']);
    if (!bytes.equals(await readFile(resolve(dir,name)))) throw Error('Existing release asset differs: '+name);
  } else gh(['release','upload',tag,resolve(dir,name)]);
}
console.log(`Draft ${tag} ready: publish it in GitHub to deploy.`);
