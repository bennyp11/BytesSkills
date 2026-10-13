// Independent of the API so verification works while the maintenance gate is live.
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {sha} from './release-artifacts.mjs';
import {verifySnapshot} from './postgres-transfer.mjs';
const snapshot=verifySnapshot(JSON.parse(await readFile(process.argv[2],'utf8')));
const checked=new Set();
for(const row of snapshot.tables.revisions){
 const record=JSON.parse(row.record),c=record.content;
 if(!/^[a-f0-9-]{36}$/.test(row.workspace_id) || c.key!==`blobs/sha256/${c.sha256.slice(0,2)}/${c.sha256}` || !/^[a-f0-9]{64}$/.test(c.sha256))throw Error('Invalid blob descriptor');
 const key=row.workspace_id+'/'+c.key;
 if(checked.has(key))continue;
 const bytes=execFileSync('npx',['wrangler','r2','object','get','bytesskills-mvp-blobs/'+key,'--remote','--pipe'],{maxBuffer:12*1024*1024});
 if(bytes.length!==c.bytes || sha(bytes)!==c.sha256)throw Error('R2 content integrity mismatch');
 checked.add(key);
}
console.log(`Verified ${checked.size} R2 objects. No keys or content changed.`);
