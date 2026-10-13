import test, {before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import pg from 'pg';
import {createHash} from 'node:crypto';
import {migrate} from '../scripts/postgres-migrate.mjs';
import {normalize,importSnapshot,verifyDatabase} from '../scripts/postgres-transfer.mjs';
import {canonical,sha} from '../scripts/release-artifacts.mjs';
const url=process.env.BYTES_POSTGRES_TEST_URL;
const enabled=Boolean(url);
let admin,control,env,api,dir,dbName,rolesCreated=false;
const connect=async connectionString=>{const c=new pg.Client({connectionString});await c.connect();return c;};
const urlFor=(user,db=dbName)=>{const u=new URL(url);u.username=user;u.password='local-only-test';u.pathname='/'+db;return u.toString();};
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
 await migrate(admin);rolesCreated=true;
 await migrate(admin); // Applied migration checksums make retries idempotent.
 for(const r of ['runtime','identity','publisher'])await admin.query(`ALTER ROLE bytes_${r} LOGIN`);
 env={STORAGE_BACKEND:'postgres',POSTGRES:{connectionString:urlFor('bytes_runtime')},PUBLISHER_DB:{connectionString:urlFor('bytes_publisher')},IDENTITY_DB:{connectionString:urlFor('bytes_identity')},BLOBS,WORKSPACE_ID:'acc3351e-d092-433c-a7e1-8fc3e807ebd4'};
 dir=await mkdtemp(join(tmpdir(),'bytes-pg-test-'));
 await build({stdin:{contents:`export {PostgresDatabase,postgresParameters} from './src/database';export {WorkspaceAccess} from './src/access';export {Store} from './src/store';export {Releases} from './src/releases';export {provisionVerifiedIdentity} from './src/accounts';export {loginRoutes,browserSession} from './src/login';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',packages:'external',outfile:join(dir,'api.mjs')});
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
const pgTest=(name,fn)=>test(name,{skip:!enabled,timeout:120000},fn);
pgTest('legacy D1 import preserves canonical records, indexes, receipts, releases and snapshot cursors',async()=>{
 const workspace=env.WORKSPACE_ID,id=crypto.randomUUID(),pointer=`@concept/${id}:v1`,text='legacy body';
 const hash=sha(text),key=`blobs/sha256/${hash.slice(0,2)}/${hash}`;
 const time='2026-10-01T00:00:00.000Z',workflow=crypto.randomUUID();
 const record={schema_version:1,workspace_id:workspace,type:'concept',id,revision:1,pointer,previous_checksum:null,
  title:'legacy',status:'draft',tags:['legacy'],settings:{},provenance:{skill_release:{workflow_id:workflow}},
  parent:null,relations:{links:[pointer]},created_at:time,record_key:`records/concept/${id}/v00000001.json`,
  content:{key,sha256:hash,bytes:text.length,media_type:'text/markdown'}};
 const complete={...record,record_checksum:sha(canonical(record))};
 const payload=canonical({skill:'help',version:'1.0.0',summary:'legacy',protocol:1,required_scopes:['bytes:read'],instructions:'help',resources:{}});
 const tables=normalize({workspace:[{id:workspace,name:'Content'}],
  revisions:[{pointer,id,type:'concept',revision:1,checksum:complete.record_checksum,record:canonical(complete),rowid:7}],
  heads:[{id,pointer,type:'concept',revision:1,title:'legacy',status:'draft',format:null,parent:null,updated:time}],
  tags:[{id,tag:'legacy'}],edges:[{source:pointer,kind:'links',target:pointer}],
  requests:[{request_id:crypto.randomUUID(),fingerprint:'fingerprint',pointer,created_at:time}],
  library_state:[{id:1,revision:4,selections:'{"help":"1.0.0"}',policies:'{}',dismissed:'{}'}],
  library_decisions:[{request_id:crypto.randomUUID(),fingerprint:'decision',result:'{"state_revision":4}',created_at:time}],
  skill_releases:[{skill:'help',version:'1.0.0',sequence:1,checksum:sha(payload),payload,published_at:time}],
  skill_revocations:[],workflow_sessions:[{id:workflow,fingerprint:'flow',skill:'help',version:'1.0.0',command:'/bytes help',created_at:time,expires_at:'2030-01-01T00:00:00.000Z'}],
  search:[{id,title:'legacy',body:text}]});
 const snapshot={schema_version:1,write_freeze_verified:true,tables,hashes:Object.fromEntries(Object.entries(tables).map(([n,rows])=>[n,sha(canonical(rows.map(canonical).sort()))]))};
 await importSnapshot(admin,snapshot);await verifyDatabase(admin,snapshot);
 await assert.rejects(importSnapshot(admin,snapshot),/empty/);
 const bad=structuredClone(snapshot);bad.tables.revisions[0].record='{}';await assert.rejects(importSnapshot(admin,bad),/checksum/);
 await BLOBS.put(workspace+'/'+key,new TextEncoder().encode(text),{customMetadata:{sha256:hash}});
 const a=await api.WorkspaceAccess.authorize(env,'legacy-owner',workspace,true),s=new api.Store(env,a);
 assert.equal((await s.export()).snapshot,7);assert.deepEqual(await s.resolve(pointer),complete);
 assert.equal((await s.get(pointer,true)).text,text);assert.equal((await s.query({text:'legacy'})).items.length,1);
 assert.equal((await new api.Releases(env,a).state()).revision,4);
 const newer=await s.save({request_id:crypto.randomUUID(),pointer,expected_revision:1,text:'newer'});
 assert.equal(newer.previous_checksum,complete.record_checksum);assert.ok((await s.export()).snapshot>7);
 assert.equal((await s.export('',20,7)).records.length,1);
});
pgTest('RLS hides other tenants even when SELECT has no workspace filter; writes cannot cross tenants',async()=>{
 const a=await tenant('read-a'),b=await tenant('read-b');
 const sa=new api.Store(env,await access(a)),sb=new api.Store(env,await access(b));
 const ra=await save(sa,'A'),rb=await save(sb,'B');
 assert.equal((await scoped(a).prepare('SELECT * FROM revisions').all()).results.length,1);
 for(const table of ['heads','tags','edges','requests','library_state','library_decisions','workflow_sessions','revision_workflows','search_documents']) {
  const visible=(await scoped(a).prepare(`SELECT workspace_id FROM ${table}`).all()).results;
  assert.ok(visible.every(r=>r.workspace_id===a.workspace_id),table);
 }
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
 assert.equal(tables.rows.length,18);for(const t of tables.rows){assert.equal(t.relrowsecurity,true,t.relname);assert.equal(t.relforcerowsecurity,true,t.relname);}
 const roles=await admin.query("SELECT rolsuper,rolbypassrls,rolcreaterole,rolcreatedb FROM pg_roles WHERE rolname LIKE 'bytes_%'");
 for(const r of roles.rows)assert.ok(Object.values(r).every(x=>x===false));
});
pgTest('runtime fails closed if an administrator disables RLS',async()=>{
 const a=await tenant('rls-disabled');
 await admin.query('ALTER TABLE bytes.revisions DISABLE ROW LEVEL SECURITY');
 try {await assert.rejects(scoped(a).prepare('SELECT * FROM revisions').all(),/row security is unavailable/);}
 finally {await admin.query('ALTER TABLE bytes.revisions ENABLE ROW LEVEL SECURITY');}
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
pgTest('Cloudflare Worker uses Hyperdrive bindings for PostgreSQL storage and MCP tenant isolation',async()=>{
 const {Miniflare,convertV4MiniflareOptions}=await import('miniflare');
 const bundle=await build({entryPoints:['test/fixtures/tenancy-worker.ts'],bundle:true,write:false,format:'esm',platform:'node',target:'es2022',conditions:['workerd'],external:['cloudflare:*'],banner:{js:'import {createRequire} from "node:module"; const require=createRequire("/test-worker.js");'}});
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:bundle.outputFiles[0].text,
  compatibilityDate:'2026-10-01',compatibilityFlags:['nodejs_compat'],r2Buckets:['BLOBS'],
  hyperdrives:{POSTGRES:env.POSTGRES.connectionString,PUBLISHER_DB:env.PUBLISHER_DB.connectionString,IDENTITY_DB:env.IDENTITY_DB.connectionString},
  bindings:{STORAGE_BACKEND:'postgres',WORKSPACE_ID:env.WORKSPACE_ID}}));
 try{
  const provision=async subject=>{
   const r=await mf.dispatchFetch('https://test/provision',{method:'POST',body:JSON.stringify({issuer:'https://worker.example',subject})});
   const body=await r.json();assert.equal(r.status,200,JSON.stringify(body));return body;
  };
  const a=await provision('worker-a'),b=await provision('worker-b');
  const headers=who=>({'x-test-account':who.account_id,'x-test-workspace':who.workspace_id,'Content-Type':'application/json',Accept:'application/json, text/event-stream'});
  const saved=await mf.dispatchFetch('https://test/op',{method:'POST',headers:headers(a),body:JSON.stringify({op:'save',args:[{request_id:crypto.randomUUID(),type:'concept',title:'worker-private',text:'Worker transport verified'}]})});
  const record=await saved.json();assert.equal(saved.status,200,JSON.stringify(record));
  const get=async who=>{
   const response=await mf.dispatchFetch('https://test/mcp',{method:'POST',headers:headers(who),body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'bytes_get',arguments:{pointer:record.pointer,include_content:true}}})});
   return response.json();
  };
  const own=await get(a);assert.notEqual(own.result?.isError,true,JSON.stringify(own));assert.match(JSON.stringify(own),/worker-private/);
  const foreign=await get(b);assert.equal(foreign.result.isError,true);assert.doesNotMatch(JSON.stringify(foreign),/worker-private/);
 }finally{await mf.dispose();}
});
pgTest('magic links are invite-only, browser-bound, expiring and atomically single-use; sessions revoke immediately',async()=>{
 const identity=new api.PostgresDatabase(env.IDENTITY_DB.connectionString,undefined,'identity');
 const h=()=>sha(crypto.randomUUID()),o='https://api.bytesskills.com',email='magic@example.com',browser=h();
 await admin.query('INSERT INTO bytes.login_invites(email) VALUES($1)',[email]);
 const start=async(e,token,b=browser,ip=h())=>row(identity,'SELECT login_start(?,?,?,?,?,?) AS ok',e,token,b,ip,o,'/app');
 assert.equal((await start('unknown@example.com',h())).ok,false);
 const token=h();assert.equal((await start(email,token)).ok,true);
 const finish=(t,b,s=h(),origin=o)=>row(identity,'SELECT * FROM login_finish(?,?,?,?,?)',t,b,origin,s,null);
 assert.equal(await finish(token,h()),null);assert.equal(await finish(token,browser,h(),'https://other.example'),null);
 const session=h();const raced=await Promise.all([finish(token,browser,session),finish(token,browser,h())]);
 assert.equal(raced.filter(Boolean).length,1);const who=raced.find(Boolean);
 assert.equal(await finish(token,browser),null);
 assert.notEqual(who.account_id,'legacy-owner');
 // Use a separate known session because either concurrent redemption may win.
 const token2=h(),session2=h();assert.equal((await start(email,token2)).ok,true);
 const again=await finish(token2,browser,session2);assert.equal(again.account_id,who.account_id);
 assert.equal((await row(identity,'SELECT * FROM login_session(?,?)',session2,o)).account_id,who.account_id);
 assert.equal(await row(identity,'SELECT * FROM login_session(?,?)',session2,'https://other.example'),null);
 await identity.prepare('SELECT login_logout(?,?)').bind(session2,o).run();assert.equal(await row(identity,'SELECT * FROM login_session(?,?)',session2,o),null);
 const expired=h();assert.equal((await start(email,expired)).ok,true);await admin.query('UPDATE bytes.login_tokens SET expires=now()-interval \'1 second\' WHERE hash=$1',[expired]);assert.equal(await finish(expired,browser),null);
 assert.equal((await start(email,h())).ok,false);
 for(const table of ['login_tokens','browser_sessions','login_invites'])await assert.rejects(scoped(who).prepare(`SELECT * FROM ${table}`).all(),/permission denied/);
});
pgTest('login HTTP flow sends a confirmation link, ignores scanner GETs, blocks CSRF and protects the dashboard',async()=>{
 const messages=[],o='https://api.bytesskills.com',email='http-login@example.com';
 const loginEnv={...env,BASE_URL:o,APP_URL:'https://app.bytesskills.com',LOGIN_ENABLED:'true',EMAIL_FROM:'login@example.com',EMAIL:{async send(m){messages.push(m);}}};
 await admin.query('INSERT INTO bytes.login_invites(email) VALUES($1)',[email]);
 const request=(path,opts={})=>new Request(o+path,opts);
 const page=await api.loginRoutes(request('/login?next=https://evil.example'),loginEnv);
 const nonce=page.headers.get('set-cookie').split(';')[0];assert.match(nonce,/^__Host-bytes-login=/);assert.match(page.headers.get('set-cookie'),/Secure; HttpOnly; SameSite=Lax/);
 const post=(path,data,cookie=nonce,origin=o)=>request(path,{method:'POST',headers:{Cookie:cookie,Origin:origin,'CF-Connecting-IP':'192.0.2.1'},body:new URLSearchParams(data)});
 await assert.rejects(api.loginRoutes(post('/auth/request',{email},nonce,'https://evil.example'),loginEnv),/origin/);
 await api.loginRoutes(post('/auth/request',{email,next:'//evil.example'}),loginEnv);assert.equal(messages.length,1);
 const link=messages[0].text.match(/https:\/\/[^\s]+\/auth\/verify\?token=[a-f0-9]+/)[0],token=new URL(link).searchParams.get('token');
 assert.match(messages[0].text,/10 minutes/);
 const preview=await api.loginRoutes(new Request(link,{headers:{Cookie:nonce}}),loginEnv);assert.equal(preview.status,200);assert.equal(preview.headers.get('referrer-policy'),'no-referrer');
 await assert.rejects(api.loginRoutes(new Request(link),loginEnv),/browser/);
 await assert.rejects(api.loginRoutes(post('/auth/complete',{token,owner_key:'wrong-owner-proof'}),loginEnv),/owner proof/);
 const confirmed=await api.loginRoutes(post('/auth/complete',{token}),loginEnv);assert.equal(confirmed.status,303);assert.equal(confirmed.headers.get('location'),'/app');
 const sessionCookie=confirmed.headers.getSetCookie().find(s=>s.startsWith('__Host-bytes-session=')).split(';')[0];
 await assert.rejects(api.loginRoutes(post('/auth/complete',{token}),loginEnv),/already used/);
 const dashboard=await api.loginRoutes(request('/app',{headers:{Cookie:sessionCookie}}),loginEnv);assert.equal(dashboard.status,200);
 const body=await dashboard.text();assert.match(body,/Your artifacts/);const csrf=body.match(/name="csrf" value="([^"]+)"/)[1];
 await assert.rejects(api.loginRoutes(post('/auth/logout',{csrf:'bad'},sessionCookie),loginEnv),/confirmation/);
 await api.loginRoutes(post('/auth/logout',{csrf},sessionCookie),loginEnv);
 assert.equal(await api.browserSession(request('/app',{headers:{Cookie:sessionCookie}}),loginEnv),null);
});
pgTest('complete Worker login → account consent → OAuth → MCP rejects cross-account pointers and management scopes',async()=>{
 const {Miniflare,convertV4MiniflareOptions}=await import('miniflare');
 const bundle=await build({entryPoints:['test/fixtures/login-worker.ts'],bundle:true,write:false,format:'esm',platform:'node',target:'es2022',conditions:['workerd'],external:['cloudflare:*'],banner:{js:'import {createRequire} from "node:module"; const require=createRequire("/test-worker.js");'}});
 const base='https://api.bytesskills.com';
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:bundle.outputFiles[0].text,
 compatibilityDate:'2026-10-01',compatibilityFlags:['nodejs_compat'],r2Buckets:['BLOBS'],kvNamespaces:['OAUTH_KV'],
 hyperdrives:{POSTGRES:env.POSTGRES.connectionString,PUBLISHER_DB:env.PUBLISHER_DB.connectionString,IDENTITY_DB:env.IDENTITY_DB.connectionString},
 bindings:{STORAGE_BACKEND:'postgres',WORKSPACE_ID:env.WORKSPACE_ID,BASE_URL:base,APP_URL:'https://app.bytesskills.com',LOGIN_ENABLED:'true',EMAIL_FROM:'login@example.com',OWNER_KEY_SHA256:sha('test-only-owner-key-000000000000000000000000')}}));
 const cookies=r=>r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
 const send=(path,opts={})=>mf.dispatchFetch(base+path,{redirect:'manual',...opts});
 const post=(path,data,cookie)=>send(path,{method:'POST',headers:{Origin:base,Cookie:cookie??'','Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(data)});
 try{
 const login=async email=>{
 await admin.query('INSERT INTO bytes.login_invites(email) VALUES($1)',[email]);
 const first=await send('/login');const nonce=cookies(first);
 assert.equal((await post('/auth/request',{email},nonce)).status,200);
 const messages=await (await send('/test/mail')).json();assert.equal(messages.length,1);
 const token=messages[0].text.match(/token=([a-f0-9]+)/)[1];
 const done=await post('/auth/complete',{token},nonce);assert.equal(done.status,303,await done.clone().text());return cookies(done);
 };
 const a=await login('worker-login-a@example.com'),b=await login('worker-login-b@example.com');
 const register=await send('/oauth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_name:'CI user connection',redirect_uris:['http://localhost:8484/callback'],token_endpoint_auth_method:'none',grant_types:['authorization_code','refresh_token'],response_types:['code']})});
 assert.equal(register.status,201);const client=await register.json();
 const verifier='v'.repeat(64),challenge=createHash('sha256').update(verifier).digest('base64url');
 const params=new URLSearchParams({client_id:client.client_id,redirect_uri:'http://localhost:8484/callback',response_type:'code',scope:'bytes:read bytes:write offline_access',resource:base+'/mcp',state:'ci-state',code_challenge:challenge,code_challenge_method:'S256'});
 assert.equal((await send('/authorize?'+params)).status,303);
 const consent=await send('/authorize?'+params,{headers:{Cookie:a}});const text=await consent.text();assert.equal(consent.status,200,text);
 assert.doesNotMatch(text,/name="key"/);assert.doesNotMatch(text,/value="bytes:manage"/);
 const handle=text.match(/name="handle" value="([^"]+)"/)[1],csrf=text.match(/name="csrf" value="([^"]+)"/)[1],cookie=a+'; '+cookies(consent);
 assert.equal((await post('/authorize',{handle,csrf,decision:'approve',scope:'bytes:manage'},cookie)).status,403);
 assert.equal((await post('/authorize',{handle,csrf,decision:'approve',scope:'bytes:read'},b+'; '+cookies(consent))).status,403);
 const approved=await post('/authorize',{handle,csrf,decision:'approve',scope:'bytes:read'},cookie);assert.equal(approved.status,303,await approved.clone().text());
 const code=new URL(approved.headers.get('location')).searchParams.get('code');
 const tokenResponse=await post('/oauth/token',{grant_type:'authorization_code',client_id:client.client_id,code,redirect_uri:'http://localhost:8484/callback',code_verifier:verifier,resource:base+'/mcp'});assert.equal(tokenResponse.status,200);const tokens=await tokenResponse.json();
 const call=async(name,args={})=>{const r=await send('/mcp',{method:'POST',headers:{Authorization:'Bearer '+tokens.access_token,'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})});assert.equal(r.status,200);return r.json();};
 const workspace=await call('bytes_workspace');assert.notEqual(workspace.result.isError,true,JSON.stringify(workspace));assert.doesNotMatch(JSON.stringify(workspace),new RegExp(env.WORKSPACE_ID));
 const legacy=(await admin.query("SELECT pointer FROM bytes.revisions WHERE workspace_id=$1 LIMIT 1",[env.WORKSPACE_ID])).rows[0].pointer;
 assert.equal((await call('bytes_get',{pointer:legacy,include_content:true})).result.isError,true);
 assert.equal((await send('/app/artifact?pointer='+encodeURIComponent(legacy),{headers:{Cookie:a}})).status,404);
 }finally{await mf.dispose();}
});
pgTest('legacy ownership requires explicit claim and cannot be reassigned; disabled accounts invalidate sessions',async()=>{
 const db=new api.PostgresDatabase(env.IDENTITY_DB.connectionString,undefined,'identity'),o='https://api.bytesskills.com',email='claim@example.com';
 await admin.query('INSERT INTO bytes.login_invites(email) VALUES($1)',[email]);
 const b=sha('claim-browser'),h=sha('claim-token'),s=sha('claim-session');
 assert.equal((await row(db,'SELECT login_start(?,?,?,?,?,?) AS ok',email,h,b,sha('claim-ip'),o,'/app')).ok,true);
 const result=await row(db,'SELECT * FROM login_finish(?,?,?,?,?)',h,b,o,s,env.WORKSPACE_ID);
 assert.equal(result.account_id,'legacy-owner');assert.equal(result.workspace_id,env.WORKSPACE_ID);
 assert.equal((await row(db,'SELECT * FROM login_session(?,?)',s,o)).account_id,'legacy-owner');
 await admin.query("UPDATE bytes.accounts SET status='disabled' WHERE id='legacy-owner'");
 assert.equal(await row(db,'SELECT * FROM login_session(?,?)',s,o),null);
 await admin.query("UPDATE bytes.accounts SET status='active' WHERE id='legacy-owner'");
 const e2='claim-other@example.com',h2=sha('claim-other-token');await admin.query('INSERT INTO bytes.login_invites(email) VALUES($1)',[e2]);
 await row(db,'SELECT login_start(?,?,?,?,?,?) AS ok',e2,h2,b,sha('claim-other-ip'),o,'/app');
 assert.equal(await row(db,'SELECT * FROM login_finish(?,?,?,?,?)',h2,b,o,sha('claim-other-session'),env.WORKSPACE_ID),null);
 assert.equal((await admin.query("SELECT subject FROM bytes.account_identities WHERE account_id='legacy-owner'")).rows[0].subject,email);
});
