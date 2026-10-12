// Run after provisioning restricted-role Hyperdrives, not before. No credentials
// enter wrangler.jsonc. Hyperdrive origin caching MUST be disabled in Cloudflare.
import {readFile,writeFile} from 'node:fs/promises';
const [runtime,publisher,identity]=process.argv.slice(2);
if(![runtime,publisher].every(id=>/^[a-f0-9]{32}$/.test(id??'')) || (identity&&!/^[a-f0-9]{32}$/.test(identity)))
 throw Error('Use postgres-config.mjs RUNTIME_HYPERDRIVE_ID PUBLISHER_HYPERDRIVE_ID [IDENTITY_HYPERDRIVE_ID]');
if(new Set([runtime,publisher,identity].filter(Boolean)).size!==[runtime,publisher,identity].filter(Boolean).length)throw Error('Use separate role bindings');
const config=JSON.parse(await readFile('wrangler.jsonc','utf8'));
config.vars.STORAGE_BACKEND='postgres';
delete config.d1_databases;
config.hyperdrive=[{binding:'POSTGRES',id:runtime},{binding:'PUBLISHER_DB',id:publisher},...(identity?[{binding:'IDENTITY_DB',id:identity}]:[])];
await writeFile('wrangler.jsonc',JSON.stringify(config,null,2)+'\n');
console.log('PostgreSQL binding configuration prepared. Review and commit it before cutover.');
