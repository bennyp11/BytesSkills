import { setTimeout as sleep } from 'node:timers/promises';
import { performance } from 'node:perf_hooks';
import { version } from './release-artifacts.mjs';

export async function waitForDeployment({readHealth, target, commit,
  now = () => performance.now(), wait = sleep, log = console.log}) {
  const deadline = now() + 60000;
  let last;
  while (now() < deadline) {
    last = await readHealth(Math.max(1, Math.ceil(Math.min(10000, deadline - now()))));
    if (last?.service !== 'BytesSkills' || last.status !== 'ok') throw Error('Unexpected service health');
    if (last.release != null) {
      const actual = version(last.release).split('.').map(Number);
      const expected = version(target).split('.').map(Number);
      const differing = actual.findIndex((n, i) => n !== expected[i]);
      if (differing >= 0 && actual[differing] > expected[differing]) throw Error('Newer release already deployed');
      if (last.release === target && last.commit !== commit) throw Error('Release already deployed from a different commit');
    }
    if (now() <= deadline && last.release === target && last.commit === commit) return last;
    const remaining = deadline - now();
    if (remaining <= 0) break;
    log('Waiting for Cloudflare to serve the expected release and commit…');
    await wait(Math.min(5000, remaining));
  }
  throw Error(`Deployment verification timed out after 60 seconds; expected ${target} at ${commit}; last observed ${last?.release ?? 'unversioned'} at ${last?.commit ?? 'unknown'}`);
}
