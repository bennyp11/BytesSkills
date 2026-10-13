import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const config=JSON.parse(await readFile('wrangler.jsonc','utf8'));
if(config.vars?.STORAGE_BACKEND==='postgres')
 execFileSync(process.execPath,['scripts/postgres-migrate.mjs'],{stdio:'inherit'});
else execFileSync('npx',['wrangler','d1','migrations','apply','DB','--remote'],{stdio:'inherit'});
