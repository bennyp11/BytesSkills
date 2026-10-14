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
 async get(key){const b=blobMap.get(key);return b?{body:b.data,arrayBuffer:async()=>b.data.buffer}:null;}
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
 await build({stdin:{contents:`export {observeMcp} from './src/telemetry';export {PostgresDatabase,postgresParameters} from './src/database';export {WorkspaceAccess} from './src/access';export {Store} from './src/store';export {Releases} from './src/releases';export {Definitions} from './src/definitions';export {PrivateSkills} from './src/private-skills';export {browseArtifacts} from './src/artifact-browser';export {provisionVerifiedIdentity} from './src/accounts';export {loginRoutes,browserSession} from './src/login';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',packages:'external',outfile:join(dir,'api.mjs')});
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
 assert.equal(tables.rows.length,19);for(const t of tables.rows){assert.equal(t.relrowsecurity,true,t.relname);assert.equal(t.relforcerowsecurity,true,t.relname);}
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
 const target='/app/artifact?pointer='+encodeURIComponent('@brief/12345678-1234-4234-8234-123456789abc:v1');
 const redirected=await api.loginRoutes(request(target),loginEnv);assert.equal(redirected.headers.get('location'),'/login?next='+encodeURIComponent(target));
 await api.loginRoutes(post('/auth/request',{email,next:target}),loginEnv);assert.equal(messages.length,1);
 const link=messages[0].text.match(/https:\/\/[^\s]+\/auth\/verify\?token=[a-f0-9]+/)[0],token=new URL(link).searchParams.get('token');
 assert.match(messages[0].text,/10 minutes/);
 const preview=await api.loginRoutes(new Request(link,{headers:{Cookie:nonce}}),loginEnv);assert.equal(preview.status,200);assert.equal(preview.headers.get('referrer-policy'),'strict-origin');
 await assert.rejects(api.loginRoutes(new Request(link),loginEnv),/browser/);
 await assert.rejects(api.loginRoutes(post('/auth/complete',{token},nonce,'null'),loginEnv),/origin/);
 await assert.rejects(api.loginRoutes(post('/auth/complete',{token,owner_key:'wrong-owner-proof'}),loginEnv),/claims are retired/);
 const confirmed=await api.loginRoutes(post('/auth/complete',{token}),loginEnv);assert.equal(confirmed.status,303);assert.equal(confirmed.headers.get('location'),target);
 const sessionCookie=confirmed.headers.getSetCookie().find(s=>s.startsWith('__Host-bytes-session=')).split(';')[0];
 await assert.rejects(api.loginRoutes(post('/auth/complete',{token}),loginEnv),/already used/);
 const dashboard=await api.loginRoutes(request('/app',{headers:{Cookie:sessionCookie}}),loginEnv);assert.equal(dashboard.status,200);
 const body=await dashboard.text();assert.match(body,/Your artifacts/);const csrf=body.match(/name="csrf" value="([^"]+)"/)[1];
 const skillsPage=await api.loginRoutes(request('/app/skills',{headers:{Cookie:sessionCookie}}),loginEnv);assert.match(await skillsPage.text(),/Platform core/);
 const formPage=await api.loginRoutes(request('/app/skills/new',{headers:{Cookie:sessionCookie}}),loginEnv);const formText=await formPage.text();const id=formText.match(/name="id" value="([^"]+)"/)[1];
 const skillForm={id,csrf,title:'Personal test skill',summary:'A private workflow',instructions:'Ask for context, then summarize.'};
 await assert.rejects(api.loginRoutes(post('/app/skills/new',{...skillForm,csrf:'bad'},sessionCookie),loginEnv),/confirmation/);
 const createdSkill=await api.loginRoutes(post('/app/skills/new',skillForm,sessionCookie),loginEnv);assert.equal(createdSkill.status,303);
 const detail=await api.loginRoutes(request(createdSkill.headers.get('location'),{headers:{Cookie:sessionCookie}}),loginEnv);assert.match(await detail.text(),/Ask for context, then summarize/);
 const owner=await api.browserSession(request('/app',{headers:{Cookie:sessionCookie}}),loginEnv);
 const artifact=await save(new api.Store(loginEnv,await access(owner)),'Clickable artifact');
 const listing=await api.loginRoutes(request('/app',{headers:{Cookie:sessionCookie}}),loginEnv);assert.ok((await listing.text()).includes('/app/artifact?pointer='+encodeURIComponent(artifact.pointer)));
 const opened=await api.loginRoutes(request('/app/artifact?pointer='+encodeURIComponent(artifact.pointer),{headers:{Cookie:sessionCookie}}),loginEnv);const openedText=await opened.text();assert.match(openedText,/a private pineapple/);assert.match(openedText,/Copy link/);assert.ok(openedText.includes('https://app.bytesskills.com/app/artifact?pointer='+encodeURIComponent(artifact.pointer)));
 const otherTenant=await tenant('web-link-other');const otherArtifact=await save(new api.Store(loginEnv,await access(otherTenant)));
 await assert.rejects(api.loginRoutes(request('/app/artifact?pointer='+encodeURIComponent(otherArtifact.pointer),{headers:{Cookie:sessionCookie}}),loginEnv),/missing/);
 const core=await api.loginRoutes(request('/app/skill?core=help',{headers:{Cookie:sessionCookie}}),loginEnv);assert.match(await core.text(),/Platform core/);
 const ownerStore=new api.Store(loginEnv,await access(owner));
 for(const mime of ['image/png','image/svg+xml']){
  const bytes=new TextEncoder().encode('synthetic preview fixture '+mime),blob=await ownerStore.putBlob(bytes);
  const media=await ownerStore.save({request_id:crypto.randomUUID(),type:'image',title:'Media test',content:{...blob,media_type:mime}});
  const view=await api.loginRoutes(request('/app/artifact?pointer='+encodeURIComponent(media.pointer),{headers:{Cookie:sessionCookie}}),loginEnv);
  assert.equal((await view.text()).includes('<img src='),mime==='image/png');
  const download=await api.loginRoutes(request('/app/content?view=1&pointer='+encodeURIComponent(media.pointer),{headers:{Cookie:sessionCookie}}),loginEnv);
  assert.equal(download.headers.get('content-disposition'),mime==='image/png'?'inline':'attachment');assert.equal((await download.arrayBuffer()).byteLength,bytes.length);
  assert.equal((await api.loginRoutes(request('/app/content?view=1&pointer='+encodeURIComponent(media.pointer)),loginEnv)).status,303);
 }

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
 const getCsrf=async cookie=>(await (await send('/app/connections',{headers:{Cookie:cookie}})).text()).match(/name="csrf" value="([^"]+)"/)[1];
 const connections=await (await send('/app/connections',{headers:{Cookie:a}})).text();
 const grant=connections.match(/name="grant" value="([^"]+)"/)[1];
 await post('/app/revoke',{grant,csrf:await getCsrf(b)},b);
 assert.notEqual((await call('bytes_workspace')).result.isError,true,'Another account cannot revoke this grant');
 const refreshed=await post('/oauth/token',{grant_type:'refresh_token',client_id:client.client_id,refresh_token:tokens.refresh_token,resource:base+'/mcp'});
 assert.equal(refreshed.status,200,await refreshed.clone().text());const fresh=await refreshed.json();tokens.access_token=fresh.access_token;
 assert.notEqual((await call('bytes_workspace')).result.isError,true);
 assert.equal((await call('bytes_save',{type:'concept',title:'denied',text:'read-only grant',request_id:crypto.randomUUID()})).result.isError,true);
 await post('/app/revoke',{grant,csrf:await getCsrf(a)},a);
 const rejected=await send('/mcp',{method:'POST',headers:{Authorization:'Bearer '+tokens.access_token,'Content-Type':'application/json'},body:'{}'});assert.equal(rejected.status,401);
 const rejectedRefresh=await post('/oauth/token',{grant_type:'refresh_token',client_id:client.client_id,refresh_token:fresh.refresh_token,resource:base+'/mcp'});assert.equal(rejectedRefresh.status,400);

 }finally{await mf.dispose();}
});
pgTest('only administrator-prelinked identities inherit legacy data; browser claims fail and disabled accounts invalidate sessions',async()=>{
 const db=new api.PostgresDatabase(env.IDENTITY_DB.connectionString,undefined,'identity'),o='https://api.bytesskills.com',email='claim@example.com';
 await admin.query('INSERT INTO bytes.login_invites(email) VALUES($1)',[email]);
 const b=sha('claim-browser'),h=sha('claim-token'),s=sha('claim-session');
 assert.equal((await row(db,'SELECT login_start(?,?,?,?,?,?) AS ok',email,h,b,sha('claim-ip'),o,'/app')).ok,true);
 assert.equal(await row(db,'SELECT * FROM login_finish(?,?,?,?,?)',h,b,o,s,env.WORKSPACE_ID),null);
 await admin.query("UPDATE bytes.accounts SET status='active' WHERE id='legacy-owner'");
 await admin.query("INSERT INTO bytes.account_identities(issuer,subject,account_id) VALUES('https://api.bytesskills.com/email',$1,'legacy-owner')",[email]);
 const result=await row(db,'SELECT * FROM login_finish(?,?,?,?,?)',h,b,o,s,null);
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

pgTest('private skill drafts are immutable, idempotent, and isolated from other tenants and core releases',async()=>{
 const a=await tenant('private-skill-a'),b=await tenant('private-skill-b');
 const sa=new api.PrivateSkills(env,await access(a)),sb=new api.PrivateSkills(env,await access(b));
 const input={id:crypto.randomUUID(),title:'My workflow',summary:'Private summary',instructions:'Do the private task.'};
 const saved=await sa.create(input);assert.equal(saved.revision,1);assert.deepEqual(await sa.create(input),saved);
 await assert.rejects(sa.create({...input,instructions:'Overwrite'}),/already saved/);
 assert.equal((await sa.list()).items.length,1);assert.equal((await sb.list()).items.length,0);await assert.rejects(sb.get(input.id),/not found/);
 assert.equal((await new api.PostgresDatabase(env.POSTGRES.connectionString).prepare('SELECT * FROM private_skills').all()).results.length,0);
 await assert.rejects(scoped(b).prepare('INSERT INTO private_skills(workspace_id,id,revision,title,summary,instructions,checksum) VALUES(?,?,1,?,?,?,?)').bind(a.workspace_id,crypto.randomUUID(),'X','X','X','a'.repeat(64)).run(),/row-level security/);
 await assert.rejects(scoped(a).prepare('UPDATE private_skills SET title=? WHERE workspace_id=?').bind('X',a.workspace_id).run(),/permission denied/);
 await assert.rejects(new api.PostgresDatabase(env.PUBLISHER_DB.connectionString,undefined,'publisher').prepare('SELECT * FROM private_skills').all(),/permission denied/);
 await assert.rejects(scoped(a).prepare('INSERT INTO skill_revocations VALUES(?,?,?)').bind('help','1.0.0','private publishing').run(),/permission denied/);
});

pgTest('artifact browser sorts original creation and updates, filters, and paginates tied keys without duplicates',async()=>{
 const who=await tenant('artifact-browser'),other=await tenant('artifact-browser-other'),ctx=await access(who),s=new api.Store(env,ctx);
 const first=await save(s,'Zulu',{settings:{format:'reductions'}}),second=await save(s,'Alpha'),third=await save(s,'Alpha');
 await save(s,'Internal run',{type:'run'});await save(s,'Archived',{status:'archived'});
 await save(new api.Store(env,await access(other)),'Foreign');
 await s.save({request_id:crypto.randomUUID(),pointer:first.pointer,expected_revision:1,text:'updated first'});
 const browse=q=>api.browseArtifacts(env,ctx,q);
 assert.equal((await browse({})).items[0].id,first.id);
 assert.equal((await browse({sort:'newest'})).items[0].id,third.id);
 assert.equal((await browse({sort:'oldest'})).items[0].id,first.id);
 assert.equal((await browse({format:'reductions'})).items.length,1);
 assert.equal((await browse({type:'run'})).items.length,1);
 assert.equal((await browse({runs:true})).items.length,4);
 assert.equal((await browse({status:'all'})).items.length,4);
 assert.equal((await browse({text:'pineapple'})).items.length,2);
 await admin.query('UPDATE bytes.heads SET updated=$1 WHERE workspace_id=$2',['2026-10-01T01:02:03.000Z',who.workspace_id]);
 for(const sort of ['updated','newest','oldest','title']){
  const expected=(await browse({sort})).items.map(r=>r.id),seen=[];let cursor;
  do {const page=await browse({sort,limit:1,cursor});seen.push(...page.items.map(r=>r.id));cursor=page.next??undefined;}while(cursor);
  assert.deepEqual(seen,expected);assert.equal(new Set(seen).size,3);
 }
 const page=await browse({limit:1});await assert.rejects(browse({cursor:page.next,sort:'title'}),/Filters changed/);
 await assert.rejects(browse({cursor:'bad'}),/Invalid page cursor/);
 const title=(await browse({sort:'title'})).items;assert.equal(title[0].title,'Alpha');assert.equal(title[2].title,'Zulu');
});

pgTest('private definitions pin format/skill revisions across instances, preserve origin and enforce isolation',async()=>{
 const a=await tenant('definitions-a'),b=await tenant('definitions-b'),ctx=await access(a);
 const da=new api.Definitions(env,ctx),db=new api.Definitions(env,await access(b)),s=new api.Store(env,ctx);
 const contract=JSON.parse(await readFile('../definitions/skills/brainstorm.json','utf8'));
 const f={schema_version:1,kind:'format',name:'My reductions',purpose:'Explain simply',instructions:'Start with a contradiction. Explain it. Qualify the simplification.',defaults:{tone:'warm'},review_checks:['Explanation resolves the hook']};
 const noCore=async()=>{throw Error('No publication access needed');};
 const input={request_id:crypto.randomUUID(),title:'My reductions',definition:f};
 const results=await Promise.all([da.save(input,noCore),da.save(input,noCore)]),format=results[0];
 assert.equal(results[1].pointer,format.pointer);assert.equal(format.type,'format');
 assert.equal((await db.store.query({type:'format'})).items.length,0);
 await assert.rejects(db.load(format.pointer),/missing/i);
 await assert.rejects(da.save({...input,title:'Different'},noCore),/reused/);
 const d={schema_version:1,kind:'skill',base_skill:'brainstorm',instructions:'Brainstorm original ideas for my audience.',contract,formats:[{name:'default',pointer:format.pointer.split(':')[0]}]};
 const skillInput={request_id:crypto.randomUUID(),title:'My brainstorm',definition:d};
 const skill=await da.save(skillInput,noCore);
 assert.equal((await da.load(skill.pointer)).definition.formats[0].pointer,format.pointer);
 await assert.rejects(db.save({...skillInput,request_id:crypto.randomUUID()},noCore),/missing/i);
 const pub=new api.Releases(env,await api.WorkspaceAccess.authorize(env,'legacy-owner',env.WORKSPACE_ID,true,true));
 await pub.publish({releases:[{skill:'brainstorm',version:'1.1.0',summary:'private test',protocol:1,required_scopes:['bytes:read','bytes:write'],instructions:'Core brainstorming',resources:{}}]});
 const rel=new api.Releases(env,ctx),scopes=['bytes:read','bytes:write'],updates=await rel.updates();
 await rel.adopt({request_id:crypto.randomUUID(),expected_revision:updates.state_revision,catalog_hash:updates.catalog_hash,skill:'brainstorm',action:'update'},scopes);
 const req={request_id:crypto.randomUUID(),command:'/bytes run',skill_pointer:skill.pointer.split(':')[0]};
 const helpUpdates=await rel.updates();
 await rel.adopt({request_id:crypto.randomUUID(),expected_revision:helpUpdates.state_revision,catalog_hash:helpUpdates.catalog_hash,skill:'help',action:'update'},scopes);
 const help=await rel.begin({...req,request_id:crypto.randomUUID(),command:'/bytes run --help'},scopes);
 assert.equal(help.skill,'help');assert.match(help.instructions,/read-only/);
 await assert.rejects(rel.provenance(help.workflow_id,scopes,'concept'),/cannot save/);
 const begin=await rel.begin(req,scopes);assert.equal(begin.status,'ready');assert.equal(begin.private_definitions.formats[0].pointer,format.pointer);
 const format2=await da.save({request_id:crypto.randomUUID(),title:'New format',pointer:format.pointer,expected_revision:1,definition:{...f,instructions:'A different opening'}},noCore);
 const skill2=await da.save({request_id:crypto.randomUUID(),title:'My updated brainstorm',pointer:skill.pointer,expected_revision:1,definition:{...d,instructions:'Use the new approach',formats:[{name:'default',pointer:format2.pointer}]}},noCore);
 // Another instance of the same account sees updates; retries remain pinned.
 const otherInstance=new api.Releases(env,await api.WorkspaceAccess.authorize(env,a.account_id,a.workspace_id));
 assert.deepEqual(await otherInstance.begin(req,scopes),begin);
 assert.equal((await da.save(skillInput,noCore)).pointer,skill.pointer,'Retry preserves the original receipt after defaults change');
 const next=await otherInstance.begin({...req,request_id:crypto.randomUUID()},scopes);
 assert.equal(next.private_definitions.skill.pointer,skill2.pointer);assert.equal(next.private_definitions.formats[0].pointer,format2.pointer);
 const explicit=await rel.begin({request_id:crypto.randomUUID(),command:'/bytes brainstorm --concepts',format_pointers:[format2.pointer]},scopes);
 assert.equal(explicit.private_definitions.formats[0].pointer,format2.pointer);
 await assert.rejects(new api.Releases(env,await access(b)).begin(req,scopes),/missing/i);
 await assert.rejects(rel.begin({...req,command:'/bytes edit'},scopes),/different command/);
 await assert.rejects(rel.provenance(begin.workflow_id,scopes,'video'),/not declared/);
 const provenance=await rel.provenance(begin.workflow_id,scopes,'concept');
 const out=await s.save({request_id:crypto.randomUUID(),type:'concept',title:'Output',text:'Idea',provenance:{skill_release:provenance}},begin.workflow_id);
 assert.equal(out.provenance.skill_release.private_definitions.skill.pointer,skill.pointer);
 assert.equal((await s.history(format.pointer)).items.length,2);
 const race=await Promise.allSettled(['One','Two'].map(title=>da.save({request_id:crypto.randomUUID(),pointer:format2.pointer,expected_revision:2,title,definition:f},noCore)));
 assert.equal(race.filter(x=>x.status==='fulfilled').length,1);
 const coreBefore=(await admin.query('SELECT count(*)::int n FROM bytes.skill_releases')).rows[0].n;
 const copied=await da.save({request_id:crypto.randomUUID(),title:'Core customized',definition:f,core_source:{skill:'brainstorm',version:'1.1.0',path:'definitions/formats/reductions.json'}},async()=>({checksum:'a'.repeat(64),release:{resources:{'definitions/formats/reductions.json':'original'}}}));
 assert.equal(copied.provenance.core_source.version,'1.1.0');
 assert.equal((await admin.query('SELECT count(*)::int n FROM bytes.skill_releases')).rows[0].n,coreBefore);
 await assert.rejects(new api.PostgresDatabase(env.PUBLISHER_DB.connectionString,undefined,'publisher').prepare('SELECT * FROM revisions WHERE type=?').bind('format').all(),/permission denied/);
 // No cross-workspace blob lookup, even with a known content address.
 assert.equal(await env.BLOBS.get(db.store.objectKey(format.content.key)),null);
 const legacy=await new api.PrivateSkills(env,ctx).create({id:crypto.randomUUID(),title:'Legacy',summary:'old',instructions:'Old draft'});
 const migrated=await da.save({request_id:crypto.randomUUID(),title:'Migrated',definition:d,legacy_skill_id:legacy.id},noCore);
 assert.equal(migrated.id,legacy.id);assert.equal(migrated.provenance.legacy_source.checksum,legacy.checksum);
 await assert.rejects(db.save({request_id:crypto.randomUUID(),title:'Steal',definition:{...d,formats:[]},legacy_skill_id:legacy.id},noCore),/not found/);
});

pgTest('MCP authors and executes private definitions with no manage scope and stamps exact output provenance',async()=>{
 const {Miniflare,convertV4MiniflareOptions}=await import('miniflare');
 const bundle=await build({entryPoints:['test/fixtures/private-definitions-worker.ts'],bundle:true,write:false,format:'esm',platform:'node',target:'es2022',conditions:['workerd'],external:['cloudflare:*'],banner:{js:'import {createRequire} from "node:module"; const require=createRequire("/test-worker.js");'}});
 const a=await tenant('mcp-private-a'),b=await tenant('mcp-private-b');
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-10-01',compatibilityFlags:['nodejs_compat'],r2Buckets:['BLOBS'],
 hyperdrives:{POSTGRES:env.POSTGRES.connectionString,PUBLISHER_DB:env.PUBLISHER_DB.connectionString},bindings:{STORAGE_BACKEND:'postgres',WORKSPACE_ID:env.WORKSPACE_ID}}));
 const scopes='bytes:read bytes:write';
 const call=async(name,args={},who=a,permissions=scopes)=>{
  const res=await mf.dispatchFetch('https://test/mcp',{method:'POST',headers:{'test-account':who.account_id,'test-workspace':who.workspace_id,'test-scopes':permissions,'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})});
  assert.equal(res.status,200);const json=await res.json();assert.ok(json.result,JSON.stringify(json));return {error:json.result.isError===true,data:JSON.parse(json.result.content[0].text)};
 };
 try{
 const contract=JSON.parse(await readFile('../definitions/skills/brainstorm.json','utf8'));
 const format={schema_version:1,kind:'format',name:'Mine',purpose:'Explain',instructions:'Use a warm opening',defaults:{},review_checks:['Accurate']};
 const request={request_id:crypto.randomUUID(),title:'My format',definition:format};
 assert.equal((await call('bytes_author',request,a,'bytes:read')).data.status,403);
 const first=await call('bytes_author',request);assert.equal(first.error,false,JSON.stringify(first));
 assert.equal((await call('bytes_author',request)).data.pointer,first.data.pointer);
 assert.equal((await call('bytes_get',{pointer:first.data.pointer})).data.definition.kind,'format');
 assert.equal((await call('bytes_get',{pointer:first.data.pointer},b)).error,true);
 const privateSkill={schema_version:1,kind:'skill',base_skill:'brainstorm',instructions:'Create two ideas',contract,formats:[{name:'default',pointer:first.data.pointer}]};
 const authored=await call('bytes_author',{request_id:crypto.randomUUID(),title:'My skill',definition:privateSkill});assert.equal(authored.error,false,JSON.stringify(authored));
 const updates=(await call('bytes_updates')).data;
 assert.equal((await call('bytes_adopt',{request_id:crypto.randomUUID(),expected_revision:updates.state_revision,catalog_hash:updates.catalog_hash,skill:'brainstorm',action:'update'})).error,false);
 const began=await call('bytes_begin',{request_id:crypto.randomUUID(),command:'/bytes run',skill_pointer:authored.data.pointer});assert.equal(began.error,false,JSON.stringify(began));assert.equal(began.data.status,'ready');
 const output=await call('bytes_save',{request_id:crypto.randomUUID(),workflow_id:began.data.workflow_id,type:'concept',title:'A concept',text:'A useful idea'});assert.equal(output.error,false,JSON.stringify(output));
 assert.equal(output.data.provenance.skill_release.private_definitions.skill.pointer,authored.data.pointer);
 assert.ok(output.data.relations.links.includes(first.data.pointer));
 assert.equal((await call('bytes_save',{request_id:crypto.randomUUID(),workflow_id:began.data.workflow_id,type:'video',title:'Wrong type',text:'not a video'})).error,true);
 const updated=await call('bytes_author',{request_id:crypto.randomUUID(),title:'Revised',pointer:first.data.pointer,expected_revision:1,definition:{...format,instructions:'Revised format'}});assert.equal(updated.error,false,JSON.stringify(updated));
 assert.equal((await call('bytes_history',{pointer:first.data.pointer})).data.items.length,2);
 const invalid=structuredClone(privateSkill);invalid.contract.outputs[0].artifact_type='format';
 assert.equal((await call('bytes_author',{request_id:crypto.randomUUID(),title:'Bad skill',definition:invalid})).error,true);
 const denied=await call('bytes_publish',{releases:[{skill:'brainstorm',version:'9.0.0',summary:'forbidden',protocol:1,required_scopes:['bytes:read'],instructions:'Forbidden core edit',resources:{}}]});
 assert.equal(denied.error,true);assert.equal(denied.data.status,403);
 const privateList=await call('bytes_query',{type:'skill'});assert.equal(privateList.data.items.length,1);
 const source=await call('bytes_definition_source',{core_skill:'brainstorm'});assert.equal(source.error,false);
 const copied=await call('bytes_author',{request_id:crypto.randomUUID(),title:'Customized core',definition:privateSkill,core_source:source.data.core_source});
 assert.equal(copied.error,false,JSON.stringify(copied));assert.equal(copied.data.provenance.core_source.version,source.data.core_source.version);
 }finally{await mf.dispose();}
});

pgTest('batched setup applies local settings and parameterized identity before application queries',async()=>{
 const a=await tenant('batched-setup');
 const settings=await row(scoped(a),`SELECT current_setting('search_path') AS path,
   current_setting('statement_timeout') AS statement_timeout,
   current_setting('lock_timeout') AS lock_timeout,
   current_setting('bytes.account_id') AS account,
   current_setting('bytes.workspace_id') AS workspace,
   current_setting('bytes.legacy_owner') AS legacy`);
 assert.deepEqual(settings,{path:'bytes, pg_catalog',statement_timeout:'15s',lock_timeout:'5s',
   account:a.account_id,workspace:a.workspace_id,legacy:'false'});
 // Identity must remain a bound value, even if it contains SQL punctuation.
 const unusual="tenant'; SET LOCAL statement_timeout='0'; --";
 const db=new api.PostgresDatabase(env.POSTGRES.connectionString,{accountId:unusual,workspaceId:a.workspace_id});
 const safe=await row(db,"SELECT current_setting('bytes.account_id') AS account, current_setting('statement_timeout') AS timeout");
 assert.deepEqual(safe,{account:unusual,timeout:'15s'});
 // A failed write batch must roll back; a later operation still has fresh settings.
 const record=await save(new api.Store(env,await access(a)),'rollback target');
 const tx=scoped(a),id=record.id;
 await assert.rejects(tx.batch([
   tx.prepare('DELETE FROM search_documents WHERE workspace_id=? AND id=?').bind(a.workspace_id,id),
   tx.prepare('SELECT 1/0')
 ]),/division by zero/);
 assert.deepEqual(await row(scoped(a),'SELECT id FROM search_documents WHERE id=?',id),{id});
 assert.equal((await row(scoped(a),"SELECT current_setting('statement_timeout') AS timeout")).timeout,'15s');
});

pgTest('pointer resolution uses one transaction and preserves revision, ambiguity and isolation semantics',async()=>{
 const a=await tenant('resolve-a'),b=await tenant('resolve-b');
 const sa=new api.Store(env,await access(a)),sb=new api.Store(env,await access(b));
 const first=await save(sa,'lookup fixture');
 const latest=await sa.save({request_id:crypto.randomUUID(),pointer:first.pointer,expected_revision:1,text:'revision two'});
 const prefix=`@concept/${first.id.slice(0,8)}`;
 const events=[];
 await api.observeMcp(new Request('https://test.example/mcp'),'test',async()=>{
  assert.deepEqual(await sa.resolve(prefix),latest);return new Response('ok');
 },e=>events.push(e));
 assert.equal(events[0].stages.db_setup.count,1);
 assert.equal(events[0].stages.db_query.count,1);
 assert.equal(events[0].stages.db_commit.count,1);
 assert.deepEqual(await sa.resolve(`${prefix}:v1`),first);
 assert.deepEqual(await sa.resolve(first.pointer),first);
 assert.deepEqual(await sa.resolve(`@concept/${first.id}`),latest);
 await assert.rejects(sa.resolve(`${prefix}:v99`),/Revision not found/);
 await assert.rejects(sa.resolve(`@hook/${first.id}`),/Pointer missing or ambiguous/);
 await assert.rejects(sb.resolve(first.pointer),/Pointer missing or ambiguous/);
 await assert.rejects(sa.resolve('@concept/not-valid'),/Invalid/);
 // Insert a valid second identity sharing the prefix, with only revision 1.
 // Fixture insertion is administrative; resolution still uses the runtime RLS role.
 const id=first.id.slice(0,8)+crypto.randomUUID().slice(8);
 const clone={...first,id,pointer:`@concept/${id}:v1`,record_key:`records/concept/${id}/v00000001.json`};
 delete clone.record_checksum;clone.record_checksum=sha(canonical(clone));
 await admin.query(`INSERT INTO bytes.revisions(workspace_id,pointer,id,type,revision,checksum,record)
 VALUES($1,$2,$3,'concept',1,$4,$5)`,[a.workspace_id,clone.pointer,id,clone.record_checksum,canonical(clone)]);
 await admin.query(`INSERT INTO bytes.heads(workspace_id,id,pointer,type,revision,title,status,updated)
 VALUES($1,$2,$3,'concept',1,'collision','draft',$4)`,[a.workspace_id,id,clone.pointer,first.created_at]);
 for(const p of [prefix,`${prefix}:v1`,`${prefix}:v2`,`${prefix}:v99`]){
  await assert.rejects(sa.resolve(p),e=>e.status===409&&/ambiguous/.test(e.message));
 }
 assert.deepEqual(await sa.resolve(latest.pointer),latest);
 await assert.rejects(sb.resolve(prefix),e=>e.status===404);
});
