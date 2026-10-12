import test, {before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import pg from 'pg';
const url=process.env.BYTES_POSTGRES_TEST_URL;
const enabled=Boolean(url);
let admin,control,env,api,dir,dbName,rolesCreated=false;
const connect=async connectionString=>{const c=new pg.Client({connectionString});await c.connect();return c;};
const urlFor=(user,db=dbName)=>{const u=new URL(url);u.username=user;u.password='';u.pathname='/'+db;return u.toString();};
const blobMap=new Map();
const BLOBS={
 async put(key,data,options){blobMap.set(key,{data:Uint8Array.from(data),customMetadata:options.customMetadata});},
 async head(key){const b=blobMap.get(key);return b?{size:b.data.length,customMetadata:b.customMetadata}:null;},
 async get(key){const b=blobMap.get(key);return b?{arrayBuffer:async()=>b.data.buffer}:null;}
};
const tenant=async subject=>api.provisionVerifiedIdentity(env,'https://test.example',subject);
const access=async t=>api.WorkspaceAccess.authorize(env,t.account_id,t.workspace_id);
const scoped=t=>new api.PostgresDatabase(env.POSTGRES.connectionString,{accountId:t.account_id,workspaceId:t.workspace_id});
const row=(db,sql,...values)=>db.prepare(sql).bind(...values).first();
const save=(s,title='private concept',extra={})=>s.save({request_id:crypto.randomUUID(),type:'concept',title,text:'a private pineapple',...extra});
before(async()=>{
 if(!enabled)return;
 if(!['localhost','127.0.0.1','::1'].includes(new URL(url).hostname))throw Error('PostgreSQL tests require an isolated local server');
 control=await connect(url);
 // Never reuse/drop pre-existing roles: this suite owns an ephemeral server.
 const existing=await control.query("SELECT rolname FROM pg_roles WHERE rolname IN ('bytes_runtime','bytes_identity','bytes_publisher')");
 assert.equal(existing.rowCount,0,'Use a fresh test PostgreSQL server');
 dbName='bytes_test_'+Date.now();await control.query(`CREATE DATABASE ${dbName}`);
 admin=await connect(urlFor(new URL(url).username));
 await admin.query('BEGIN');
 await admin.query(await readFile('postgres/migrations/0001_workspace_rls.sql','utf8'));rolesCreated=true;
 await admin.query('COMMIT');
 for(const r of ['runtime','identity','publisher'])await admin.query(`ALTER ROLE bytes_${r} LOGIN`);
 env={STORAGE_BACKEND:'postgres',POSTGRES:{connectionString:urlFor('bytes_runtime')},PUBLISHER_DB:{connectionString:urlFor('bytes_publisher')},IDENTITY_DB:{connectionString:urlFor('bytes_identity')},BLOBS,WORKSPACE_ID:'acc3351e-d092-433c-a7e1-8fc3e807ebd4'};
 dir=await mkdtemp(join(tmpdir(),'bytes-pg-test-'));
 await build({stdin:{contents:`export {PostgresDatabase,postgresParameters} from './src/database';export {WorkspaceAccess} from './src/access';export {Store} from './src/store';export {Releases} from './src/releases';export {provisionVerifiedIdentity} from './src/accounts';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',packages:'external',outfile:join(dir,'api.mjs')});
 // Bundle pg's CommonJS dependency too, via an entry created inside service.
 // External package resolution starts at the temporary file, so use the explicit pg path.
 const bundled=await readFile(join(dir,'api.mjs'),'utf8');
 const {writeFile}=await import('node:fs/promises');
 await writeFile(join(dir,'api.mjs'),bundled.replaceAll('from "pg"',`from ${JSON.stringify(pathToFileURL(join(process.cwd(),'node_modules/pg/lib/index.js')).href)}`).replaceAll('from "zod"',`from ${JSON.stringify(pathToFileURL(join(process.cwd(),'node_modules/zod/index.js')).href)}`));
 api=await import(pathToFileURL(join(dir,'api.mjs')));
});
after(async()=>{
 await admin?.end();
 if(control){if(dbName)await control.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);if(rolesCreated)for(const r of ['runtime','identity','publisher'])await control.query(`DROP ROLE bytes_${r}`);await control.end();}
 if(dir)await rm(dir,{recursive:true,force:true});
});
const pgTest=(name,fn)=>test(name,{skip:!enabled},fn);
pgTest('RLS hides other tenants even when SELECT has no workspace filter; writes cannot cross tenants',async()=>{
 const a=await tenant('read-a'),b=await tenant('read-b');
 const sa=new api.Store(env,await access(a)),sb=new api.Store(env,await access(b));
 const ra=await save(sa,'A'),rb=await save(sb,'B');
 assert.equal((await scoped(a).prepare('SELECT * FROM revisions').all()).results.length,1);
 assert.equal(await row(scoped(a),'SELECT * FROM revisions WHERE pointer=?',rb.pointer),null);
 await assert.rejects(scoped(a).prepare('INSERT INTO search_documents(workspace_id,id,title,body) VALUES(?,?,?,?)').bind(b.workspace_id,rb.id,'steal','x').run(),/row-level security/);
 await assert.rejects(sa.get(rb.pointer),/missing/);
 assert.deepEqual((await sa.query({text:'pineapple'})).items.map(x=>x.id),[ra.id]);
 assert.equal((await sa.history(ra.pointer)).items.length,1);
 assert.equal((await sa.export()).records.length,1);
 assert.equal((await sb.get(rb.pointer,true)).text,'a private pineapple');
 assert.notEqual(sa.objectKey(ra.content.key),sb.objectKey(rb.content.key));
});
pgTest('no identity and mismatched identity fail closed; runtime cannot administer or publish',async()=>{
 const a=await tenant('denied-a'),b=await tenant('denied-b');
 const blank=new api.PostgresDatabase(env.POSTGRES.connectionString);
 assert.equal((await blank.prepare('SELECT * FROM revisions').all()).results.length,0);
 await assert.rejects(api.WorkspaceAccess.authorize(env,a.account_id,b.workspace_id),/denied/);
 for(const sql of ["INSERT INTO accounts(id,status) VALUES('forged','active')","UPDATE workspace_memberships SET status='active'","SELECT * FROM account_identities","INSERT INTO skill_revocations VALUES('help','1.0.0','bad')","SELECT * FROM provision_identity('https://x','x','x','x')","SET ROLE bytes_publisher"])
  await assert.rejects(scoped(a).prepare(sql).run(),/permission denied/);
 await assert.rejects(new api.PostgresDatabase(urlFor(new URL(url).username)).prepare('SELECT 1').run(),/Unsafe database runtime role/);
});
pgTest('FORCE RLS covers every tenant table; role attributes and default privileges are restricted',async()=>{
 const tables=await admin.query("SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class JOIN pg_namespace n ON n.oid=relnamespace WHERE n.nspname='bytes' AND relkind='r' AND relname NOT IN ('skill_releases','skill_revocations')");
 assert.equal(tables.rows.length,14);for(const t of tables.rows){assert.equal(t.relrowsecurity,true,t.relname);assert.equal(t.relforcerowsecurity,true,t.relname);}
 const roles=await admin.query("SELECT rolsuper,rolbypassrls,rolcreaterole,rolcreatedb FROM pg_roles WHERE rolname LIKE 'bytes_%'");
 for(const r of roles.rows)assert.ok(Object.values(r).every(x=>x===false));
});
pgTest('transaction context is cleared on commit and rollback on a reused connection',async()=>{
 const a=await tenant('reuse-a'),b=await tenant('reuse-b');
 await save(new api.Store(env,await access(a)));
 const c=await connect(env.POSTGRES.connectionString);
 try{
  await c.query('BEGIN');await c.query("SELECT set_config('bytes.account_id',$1,true),set_config('bytes.workspace_id',$2,true)",[a.account_id,a.workspace_id]);
  assert.equal((await c.query('SELECT * FROM bytes.revisions')).rowCount,1);await c.query('COMMIT');
  assert.equal((await c.query('SELECT * FROM bytes.revisions')).rowCount,0);
  await c.query('BEGIN');await c.query("SELECT set_config('bytes.account_id',$1,true),set_config('bytes.workspace_id',$2,true)",[b.account_id,b.workspace_id]);
  assert.equal((await c.query('SELECT * FROM bytes.revisions')).rowCount,0);await c.query('ROLLBACK');
  assert.equal((await c.query('SELECT * FROM bytes.revisions')).rowCount,0);
 }finally{await c.end();}
});
pgTest('revocation and disabled accounts take effect after access objects were issued',async()=>{
 const a=await tenant('revoke'),s=new api.Store(env,await access(a));const r=await save(s);
 await admin.query("UPDATE bytes.workspace_memberships SET status='revoked' WHERE account_id=$1",[a.account_id]);
 await assert.rejects(s.get(r.pointer),/missing/);
 await assert.rejects(save(s),/row-level security/);
 await admin.query("UPDATE bytes.workspace_memberships SET status='active' WHERE account_id=$1",[a.account_id]);
 await admin.query("UPDATE bytes.accounts SET status='disabled' WHERE id=$1",[a.account_id]);
 await assert.rejects(s.get(r.pointer),/missing/);
 await assert.rejects(access(a),/denied/);
});
pgTest('concurrent identity provisioning is idempotent and does not create orphan workspaces',async()=>{
 const before=await admin.query('SELECT count(*)::int AS n FROM bytes.workspace');
 const all=await Promise.all(Array.from({length:6},()=>tenant('concurrent')));
 for(const item of all)assert.deepEqual(item,all[0]);
 const after=await admin.query('SELECT count(*)::int AS n FROM bytes.workspace');assert.equal(after.rows[0].n,before.rows[0].n+1);
});
pgTest('concurrent saves preserve revision sequence, replay, checksums and immutable history',async()=>{
 const a=await tenant('revisions'),s=new api.Store(env,await access(a));const r=await save(s);
 const req={request_id:crypto.randomUUID(),pointer:r.pointer,expected_revision:1,text:'revised'};
 const out=await Promise.all(Array.from({length:3},()=>s.save(req)));assert.ok(out.every(x=>x.pointer===out[0].pointer));
 assert.equal(out[0].previous_checksum,r.record_checksum);
 await assert.rejects(s.save({...req,request_id:crypto.randomUUID()}),/conflict/);
 const rows=(await s.history(r.pointer)).items;assert.equal(rows.length,2);
 await assert.rejects(scoped(a).prepare('UPDATE revisions SET checksum=?').bind('changed').run(),/permission denied|immutable/);
 const choices=await Promise.allSettled([s.save({request_id:crypto.randomUUID(),pointer:out[0].pointer,expected_revision:2,text:'one'}),s.save({request_id:crypto.randomUUID(),pointer:out[0].pointer,expected_revision:2,text:'two'})]);
 assert.equal(choices.filter(x=>x.status==='fulfilled').length,1);
});
pgTest('cycles and foreign-workspace relationships are rejected',async()=>{
 const a=await tenant('parents'),b=await tenant('parents-other'),s=new api.Store(env,await access(a));
 const r=await save(s),child=await save(s,'child',{parent:r.pointer});
 await assert.rejects(s.save({request_id:crypto.randomUUID(),pointer:r.pointer,expected_revision:1,parent:child.pointer}),/cyclic/);
 const other=await save(new api.Store(env,await access(b)));
 await assert.rejects(save(s,'foreign',{relations:{inputs:[other.pointer]}}),/missing/);
 await assert.rejects(scoped(a).prepare('INSERT INTO edges VALUES(?,?,?,?)').bind(a.workspace_id,r.pointer,'inputs',other.pointer).run(),/foreign key/);
});
pgTest('publisher cannot read workspace data, release adoption and workflows remain tenant scoped',async()=>{
 await admin.query("INSERT INTO bytes.accounts(id,status) VALUES('legacy-owner','unclaimed')");
 await admin.query('INSERT INTO bytes.workspace VALUES($1,$2)',[env.WORKSPACE_ID,'Content']);
 await admin.query("INSERT INTO bytes.workspace_memberships(workspace_id,account_id,role,status) VALUES($1,'legacy-owner','owner','active')",[env.WORKSPACE_ID]);
 const pubAccess=await api.WorkspaceAccess.authorize(env,'legacy-owner',env.WORKSPACE_ID,true,true);
 const pub=new api.Releases(env,pubAccess);
 const release={skill:'brainstorm',version:'1.0.0',summary:'test',protocol:1,required_scopes:['bytes:read','bytes:write'],instructions:'test',resources:{}};
 await pub.publish({releases:[release]});
 const pdb=new api.PostgresDatabase(env.PUBLISHER_DB.connectionString,undefined,'publisher');
 await assert.rejects(pdb.prepare('SELECT * FROM revisions').run(),/permission denied/);
 const a=await tenant('adopt-a'),b=await tenant('adopt-b'),aa=await access(a),ab=await access(b);
 const ra=new api.Releases(env,aa),rb=new api.Releases(env,ab);const preview=await ra.updates();
 const decision={request_id:crypto.randomUUID(),expected_revision:preview.state_revision,catalog_hash:preview.catalog_hash,skill:'brainstorm',action:'update'};
 await ra.adopt(decision,['bytes:read','bytes:write']);assert.equal((await rb.state()).selections.brainstorm,undefined);
 const session=await ra.begin({request_id:crypto.randomUUID(),command:'/bytes brainstorm'},['bytes:read','bytes:write']);assert.equal(session.status,'ready');
 await assert.rejects(rb.provenance(session.workflow_id,['bytes:read','bytes:write']),/Unknown workflow/);
 const s=new api.Store(env,aa),artifact=await s.save({request_id:crypto.randomUUID(),type:'concept',title:'linked',text:'body'},session.workflow_id);
 assert.equal((await row(scoped(a),'SELECT workflow_id FROM revision_workflows WHERE pointer=?',artifact.pointer)).workflow_id,session.workflow_id);
 await pub.revoke({skill:'brainstorm',version:'1.0.0',reason:'test'});
 await assert.rejects(s.save({request_id:crypto.randomUUID(),type:'concept',title:'revoked',text:'body'},session.workflow_id),/relationship/);
 const stale={...decision,request_id:crypto.randomUUID()};await assert.rejects(ra.adopt(stale,['bytes:read','bytes:write']),/changed/);
});
