// Administrative, offline transfer. Keep snapshots outside Git; never log records.
import pg from 'pg';
import {readFile,writeFile,realpath,mkdir,chmod} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {adminConnection} from './postgres-migrate.mjs';
import {canonical,sha} from './release-artifacts.mjs';
export const columns={
 accounts:['id','status','created_at'],workspace:['id','name'],
 account_identities:['issuer','subject','account_id','created_at'],
 workspace_memberships:['workspace_id','account_id','role','status','created_at'],
 skill_releases:['skill','version','sequence','checksum','payload','published_at'],
 skill_revocations:['skill','version','reason'],
 revisions:['workspace_id','pointer','id','type','revision','checksum','record','rowid'],
 heads:['workspace_id','id','pointer','type','revision','title','status','format','parent','updated'],
 tags:['workspace_id','id','tag'],edges:['workspace_id','source','kind','target'],
 requests:['workspace_id','request_id','fingerprint','pointer','created_at'],
 library_state:['workspace_id','revision','selections','policies','dismissed'],
 library_decisions:['workspace_id','request_id','fingerprint','result','created_at'],
 workflow_sessions:['workspace_id','id','fingerprint','skill','version','command','created_at','expires_at'],
 revision_workflows:['workspace_id','pointer','workflow_id'],search_documents:['workspace_id','id','title','body']
};
const now=()=>new Date().toISOString();
const sorted=rows=>rows.map(canonical).sort();
const digest=rows=>sha(canonical(sorted(rows)));
export function normalize(source) {
 const rows=structuredClone(source);
 if(!Array.isArray(rows.workspace) || rows.workspace.length!==1)throw Error('Legacy transfer requires exactly one workspace');
 const workspace=rows.workspace[0].id;
 const stamped=now();
 rows.accounts??=[{id:'legacy-owner',status:'unclaimed',created_at:stamped}];
 rows.account_identities??=[];
 rows.workspace_memberships??=[{workspace_id:workspace,account_id:'legacy-owner',role:'owner',status:'active',created_at:stamped}];
 for(const name of ['revisions','heads','tags','edges','requests','library_state','library_decisions','workflow_sessions'])
  rows[name]=(rows[name]??[]).map(r=>{const copy={workspace_id:workspace,...r};if(name==='library_state')delete copy.id;return copy;});
 rows.search_documents??=(rows.search??[]).map(r=>({workspace_id:workspace,...r}));
 delete rows.search;
 rows.revision_workflows??=rows.revisions.flatMap(r=>{
  const id=JSON.parse(r.record).provenance?.skill_release?.workflow_id;
  return rows.workflow_sessions.some(s=>s.workspace_id===r.workspace_id && s.id===id)?[{workspace_id:r.workspace_id,pointer:r.pointer,workflow_id:id}]:[];
 });
 for(const [table,keys] of Object.entries(columns)){
  rows[table]??=[];
  rows[table]=rows[table].map(r=>Object.fromEntries(keys.map(k=>{if(r[k]===undefined)throw Error(`Missing ${table}.${k}`);return [k,r[k]];})));
 }
 return rows;
}
export function verifySnapshot(snapshot) {
 if(snapshot.schema_version!==1 || !snapshot.write_freeze_verified)throw Error('Expected a frozen D1 snapshot');
 for(const name of Object.keys(columns)){
  if(!Array.isArray(snapshot.tables[name]) || digest(snapshot.tables[name])!==snapshot.hashes[name])throw Error('Snapshot table checksum mismatch: '+name);
 }
 for(const r of snapshot.tables.revisions){
  const {record_checksum,...record}=JSON.parse(r.record);
  if(sha(canonical(record))!==record_checksum || record_checksum!==r.checksum || record.workspace_id!==r.workspace_id || record.pointer!==r.pointer || record.id!==r.id || record.type!==r.type || record.revision!==r.revision)
   throw Error('Artifact integrity mismatch');
 }
 for(const r of snapshot.tables.skill_releases)if(sha(canonical(JSON.parse(r.payload)))!==r.checksum)throw Error('Skill integrity mismatch');
 return snapshot;
}
export async function verifyDatabase(client,snapshot) {
 for(const [table,keys] of Object.entries(columns)){
  const result=await client.query(`SELECT ${keys.join(',')} FROM bytes.${table}`);
  if(digest(result.rows)!==snapshot.hashes[table])throw Error('Database differs from snapshot: '+table);
 }
 return Object.fromEntries(Object.keys(columns).map(t=>[t,snapshot.tables[t].length]));
}
export async function importSnapshot(client,snapshot) {
 verifySnapshot(snapshot);
 await client.query('BEGIN');
 try{
  await client.query('SELECT pg_advisory_xact_lock(17491,2)');
  for(const table of Object.keys(columns)){
   const existing=await client.query(`SELECT 1 FROM bytes.${table} LIMIT 1`);
   if(existing.rowCount)throw Error('Import target must be empty: '+table);
   // Only trusted schema owner can do this. The entire import, integrity check and
   // trigger re-enable commit together. Foreign keys remain enforced.
   await client.query(`ALTER TABLE bytes.${table} DISABLE TRIGGER USER`);
  }
  await client.query('SET CONSTRAINTS ALL DEFERRED');
  for(const [table,keys] of Object.entries(columns))for(const r of snapshot.tables[table])
   await client.query(`INSERT INTO bytes.${table}(${keys.join(',')}) VALUES(${keys.map((_,i)=>'$'+(i+1)).join(',')})`,keys.map(k=>r[k]));
  // Flush deferred FK events before PostgreSQL permits trigger DDL on those tables.
  await client.query('SET CONSTRAINTS ALL IMMEDIATE');
  for(const table of Object.keys(columns))await client.query(`ALTER TABLE bytes.${table} ENABLE TRIGGER USER`);
  await client.query("SELECT setval('bytes.revisions_rowid_seq',greatest(coalesce((SELECT max(rowid) FROM bytes.revisions),0),1),(SELECT count(*)>0 FROM bytes.revisions))");
  const counts=await verifyDatabase(client,snapshot);
  await client.query('COMMIT');return counts;
 }catch(error){await client.query('ROLLBACK');throw error;}
}
async function outsideRepo(path) {
 const root=await realpath(resolve('..'));await mkdir(dirname(path),{recursive:true,mode:0o700});
 const parent=await realpath(dirname(path));
 if(parent===root || parent.startsWith(root+'/'))throw Error('Snapshots must be outside the Git checkout');
 return resolve(parent,path.split('/').at(-1));
}
async function requireFreeze() {
 const response=await fetch('https://api.bytesskills.com/health',{signal:AbortSignal.timeout(10000)});
 const health=await response.json();
 if(health.service!=='BytesSkills' || health.status!=='maintenance' || health.writes_paused!==true)throw Error('Deploy maintenance gate before exporting the final snapshot');
}
async function exportD1(path) {
 await requireFreeze();
 const query=sql=>{
  const out=execFileSync('npx',['wrangler','--config','wrangler.d1-recovery.jsonc','d1','execute','DB','--remote','--json','--command',sql],{encoding:'utf8',maxBuffer:64*1024*1024});
  const result=JSON.parse(out);if(!result.every(x=>x.success))throw Error('D1 query failed');return result[0].results;
 };
 const names=new Set(query("SELECT name FROM sqlite_master WHERE type='table'").map(r=>r.name));
 const raw={};
 for(const name of [...Object.keys(columns),'search'])if(names.has(name))raw[name]=query(name==='revisions'?'SELECT rowid,* FROM revisions':`SELECT * FROM ${name}`);
 // search_documents is canonical after 0005; only use virtual search on legacy D1.
 if(raw.search_documents)delete raw.search;
 const tables=normalize(raw);
 const snapshot={schema_version:1,created_at:now(),write_freeze_verified:true,source_database:'952f6010-c5de-4c0a-8485-cb0ae30f6f1a',tables,hashes:Object.fromEntries(Object.entries(tables).map(([name,rows])=>[name,digest(rows)]))};
 verifySnapshot(snapshot);await requireFreeze();
 await writeFile(path,JSON.stringify(snapshot),{flag:'wx',mode:0o600});await chmod(path,0o600);
 console.log('Frozen D1 snapshot written; table counts:',Object.fromEntries(Object.entries(tables).map(([n,r])=>[n,r.length])));
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 const [command,input]=process.argv.slice(2);if(!['export','import','verify'].includes(command)||!input)throw Error('Use postgres-transfer.mjs export|import|verify /private/outside-repo/snapshot.json');
 const path=await outsideRepo(resolve(input));
 if(command==='export')await exportD1(path);
 else{
  const snapshot=verifySnapshot(JSON.parse(await readFile(path,'utf8')));
  const client=new pg.Client({connectionString:adminConnection()});await client.connect();
  try{console.log(command==='import'?await importSnapshot(client,snapshot):await verifyDatabase(client,snapshot));}finally{await client.end();}
 }
}
