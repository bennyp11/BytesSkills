import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { canonical, sha } from '../scripts/release-artifacts.mjs';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
const legacy='acc3351e-d092-433c-a7e1-8fc3e807ebd4';
let mf,db,bucket,alice,bob;
const operator={account_id:'legacy-owner',workspace_id:legacy,operator:true};
before(async()=>{
  const bundle=await build({entryPoints:['test/fixtures/tenancy-worker.ts'],bundle:true,write:false,format:'esm',platform:'node',target:'es2022',conditions:['workerd'],external:['cloudflare:sockets'],banner:{js:'import {createRequire} from "node:module"; const require=createRequire("/test-worker.js");'}});
  mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:bundle.outputFiles[0].text,
    compatibilityDate:'2026-10-01',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],r2Buckets:['BLOBS'],
    bindings:{WORKSPACE_ID:legacy}}));
  db=await mf.getD1Database('DB');bucket=await mf.getR2Bucket('BLOBS');
  for(const file of (await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort())
    await db.exec((await readFile('migrations/'+file,'utf8')).replace(/--[^\n]*/g,'').replace(/\n/g,' '));
  alice=await provision('alice');bob=await provision('bob');
});
after(async()=>{await mf?.dispose();});
async function provision(subject) {
  const r=await mf.dispatchFetch('https://test/provision',{method:'POST',body:JSON.stringify({issuer:'https://identity.example',subject})});
  assert.equal(r.status,200);return r.json();
}
async function call(who,op,...args){
  const r=await mf.dispatchFetch('https://test/op',{method:'POST',headers:{'x-test-account':who.account_id,'x-test-workspace':who.workspace_id,'x-test-operator':String(!!who.operator)},body:JSON.stringify({op,args})});
  return {status:r.status,body:await r.json()};
}
async function ok(who,op,...args){const r=await call(who,op,...args);assert.equal(r.status,200,JSON.stringify(r));return r.body;}
const input=(extra={})=>({request_id:randomUUID(),type:'concept',title:'isolation needle',text:'private needle',...extra});
async function rpc(who,name,args){
  const r=await mf.dispatchFetch('https://test/mcp',{method:'POST',headers:{'x-test-account':who.account_id,'x-test-workspace':who.workspace_id,'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})});
  return r.json();
}
test('concurrent verified identity provisioning is idempotent, never claims legacy',async()=>{
  const results=await Promise.all(Array.from({length:8},()=>provision('concurrent')));
  assert.equal(new Set(results.map(r=>r.account_id)).size,1);
  assert.equal(new Set(results.map(r=>r.workspace_id)).size,1);
  assert.notEqual(alice.workspace_id,legacy);assert.notEqual(alice.workspace_id,bob.workspace_id);
  assert.equal((await db.prepare("SELECT count(*) AS n FROM accounts").first()).n,4);
  assert.equal((await db.prepare("SELECT count(*) AS n FROM workspace").first()).n,4);
  assert.equal((await db.prepare("SELECT count(*) AS n FROM library_state").first()).n,4);
  assert.equal((await db.prepare("SELECT status FROM accounts WHERE id='legacy-owner'").first()).status,'unclaimed');
});
test('artifact reads, prefix resolution, search, history, links, exports and request receipts are isolated',async()=>{
  const request_id=randomUUID();
  const a=await ok(alice,'save',input({request_id,tags:['private']}));
  const b=await ok(bob,'save',input({request_id,text:'bob content',tags:['private']}));
  assert.notEqual(a.id,b.id);
  for(const op of ['get','history','related']) assert.equal((await call(bob,op,a.pointer)).status,404);
  assert.equal((await call(bob,'get',`@concept/${a.id.slice(0,8)}`)).status,404);
  assert.equal((await call(bob,'get',`@concept/${randomUUID()}:v1`)).status,404);
  for(const query of [{},{text:'needle'},{tag:'private'},{after:a.id}]){
    const q=await ok(bob,'query',query);assert.ok(q.items.every(r=>r.workspace_id===bob.workspace_id));
    assert.ok(q.items.every(r=>r.id!==a.id));
  }
  for(const args of [[],['',20,99999],[a.pointer,20,99999]]){
    const exported=await ok(bob,'export',...args);assert.ok(exported.records.every(r=>r.workspace_id===bob.workspace_id));
  }
  assert.equal((await call(bob,'save',input({pointer:a.pointer,expected_revision:1}))).status,404);
  assert.equal((await call(bob,'save',input({parent:a.pointer}))).status,404);
  for(const kind of ['inputs','derived_from','links','outputs'])
    assert.equal((await call(bob,'save',input({relations:{[kind]:[a.pointer]}}))).status,404);
  assert.equal((await call(bob,'import',a)).status,400);
  assert.equal((await ok(alice,'get',a.pointer)).text,'private needle');
  const replay=await ok(alice,'save',input({request_id,tags:['private']}));assert.equal(replay.pointer,a.pointer);
  const linked=await ok(alice,'save',input({parent:a.pointer,relations:{links:[a.pointer]}}));
  assert.equal((await ok(alice,'related',a.pointer)).items[0].source,linked.pointer);
  assert.equal((await ok(alice,'query',{parent:a.pointer})).items[0].id,linked.id);
  const updated=await ok(alice,'save',{request_id:randomUUID(),pointer:a.pointer,expected_revision:1,text:'revised private'});
  assert.equal(updated.revision,2);assert.equal((await ok(alice,'history',a.pointer)).items.length,2);
});
test('R2 same-content hashes are namespaced; guessed foreign content and traversal fail',async()=>{
  const onlyA=await ok(alice,'blob','alice-only-unique-bytes');
  const stolen=await call(bob,'save',{request_id:randomUUID(),type:'concept',title:'stolen',content:{...onlyA,media_type:'text/plain'}});
  assert.equal(stolen.status,409);
  assert.ok(await bucket.head(`${alice.workspace_id}/${onlyA.key}`));
  assert.equal(await bucket.head(`${bob.workspace_id}/${onlyA.key}`),null);
  const same=await ok(bob,'blob','alice-only-unique-bytes');assert.equal(same.key,onlyA.key);
  assert.ok(await bucket.head(`${bob.workspace_id}/${same.key}`));
  for(const key of [`${alice.workspace_id}/${onlyA.key}`,`../${alice.workspace_id}/${onlyA.key}`,'/etc/passwd'])
    assert.equal((await call(bob,'objectKey',key)).status,400);
  assert.equal((await call(bob,'forged')).status,403);
});
test('database foreign keys reject cross-workspace writes independently of API checks',async()=>{
  const a=await ok(alice,'save',input()),b=await ok(bob,'save',input());
  const statements=[
    ['INSERT INTO edges VALUES(?,?,?,?)',[bob.workspace_id,b.pointer,'links',a.pointer]],
    ['INSERT INTO requests VALUES(?,?,?,?,?)',[bob.workspace_id,randomUUID(),'x',a.pointer,'now']],
    ['INSERT INTO tags VALUES(?,?,?)',[bob.workspace_id,a.id,'leak']],
    ['INSERT INTO search_documents VALUES(?,?,?,?)',[bob.workspace_id,a.id,'leak','leak']],
    ['UPDATE heads SET parent=? WHERE workspace_id=? AND id=?',[a.id,bob.workspace_id,b.id]],
    ['UPDATE heads SET pointer=? WHERE workspace_id=? AND id=?',[a.pointer,bob.workspace_id,b.id]],
    ['INSERT INTO revisions VALUES(?,?,?,?,?,?,?)',[bob.workspace_id,a.pointer,a.id,a.type,1,a.record_checksum,JSON.stringify(a)]],
    ['UPDATE heads SET workspace_id=? WHERE workspace_id=? AND id=?',[bob.workspace_id,alice.workspace_id,a.id]],
  ];
  for(const [sql,args] of statements) await assert.rejects(db.prepare(sql).bind(...args).run(),sql);
  assert.equal((await db.prepare('PRAGMA foreign_key_check').all()).results.length,0);
});
test('adoption, workflows and MCP saves stay in their workspace; manage scope cannot publish core',async()=>{
  const release={skill:'brainstorm',version:'1.0.0',summary:'test',protocol:1,required_scopes:['bytes:read'],instructions:'test',resources:{}};
  await ok(operator,'publish',{releases:[release]});
  assert.equal((await call(alice,'publish',{releases:[{...release,version:'1.0.1'}]})).status,403);
  assert.equal((await call(alice,'revoke',{skill:'brainstorm',version:'1.0.0',reason:'no'})).status,403);
  const denied=await rpc(alice,'bytes_publish',{releases:[{...release,version:'1.0.1'}]});assert.equal(denied.result.isError,true);
  const request_id=randomUUID();
  for(const who of [alice,bob]) {
    const state=await ok(who,'updates');
    await ok(who,'adopt',{request_id,expected_revision:state.state_revision,catalog_hash:state.catalog_hash,action:who===alice?'auto':'update',skill:'brainstorm'});
  }
  assert.equal((await ok(alice,'updates')).skills.find(s=>s.skill==='brainstorm').policy,'auto');
  assert.equal((await ok(bob,'updates')).skills.find(s=>s.skill==='brainstorm').policy,'ask');
  const workflow=randomUUID();
  const a=await ok(alice,'begin',{request_id:workflow,command:'/bytes brainstorm --concepts'});assert.equal(a.status,'ready');
  assert.equal((await call(bob,'provenance',workflow)).status,409);
  const deniedSave=await rpc(bob,'bytes_save',{...input(),workflow_id:workflow});assert.equal(deniedSave.result.isError,true);
  const unrelated=await ok(bob,'save',input());
  await assert.rejects(db.prepare('INSERT INTO revision_workflows VALUES(?,?,?)').bind(bob.workspace_id,unrelated.pointer,workflow).run());
  const direct=await call(bob,'save',input(),workflow);assert.notEqual(direct.status,200);
  const b=await ok(bob,'begin',{request_id:workflow,command:'/bytes brainstorm --hooks'});assert.equal(b.status,'ready');
  const saved=await rpc(alice,'bytes_save',{...input(),workflow_id:workflow});assert.ok(!saved.result.isError,JSON.stringify(saved));
  const artifact=JSON.parse(saved.result.content[0].text);assert.equal(artifact.workspace_id,alice.workspace_id);
  assert.equal((await db.prepare('SELECT workflow_id FROM revision_workflows WHERE workspace_id=? AND pointer=?').bind(alice.workspace_id,artifact.pointer).first()).workflow_id,workflow);
  const got=await rpc(bob,'bytes_get',{pointer:artifact.pointer});assert.equal(got.result.isError,true);
  const workspace=await rpc(bob,'bytes_workspace',{});assert.equal(JSON.parse(workspace.result.content[0].text).workspace_id,bob.workspace_id);
});
test('identical artifact IDs in different workspaces do not mix joins, search or revisions',async()=>{
  const a=await ok(alice,'save',input({text:'aliceuniquesearch',tags:['alice-tag']}));
  const content=await ok(bob,'blob','bobuniquesearch');
  const {record_checksum,...copy}=a;
  copy.workspace_id=bob.workspace_id;copy.content={...content,media_type:'text/markdown'};
  copy.title='Bob independent artifact';copy.tags=['bob-tag'];
  const b=await ok(bob,'import',{...copy,record_checksum:sha(canonical(copy))});
  assert.equal(b.pointer,a.pointer);
  assert.equal((await ok(bob,'get',a.pointer)).text,'bobuniquesearch');
  assert.equal((await ok(alice,'get',a.pointer)).text,'aliceuniquesearch');
  assert.equal((await ok(alice,'query',{text:'bobuniquesearch'})).items.length,0);
  assert.equal((await ok(bob,'query',{text:'aliceuniquesearch'})).items.length,0);
  assert.equal((await ok(alice,'query',{tag:'bob-tag'})).items.length,0);
  await ok(bob,'save',{request_id:randomUUID(),pointer:b.pointer,expected_revision:1,text:'changed bob'});
  assert.equal((await ok(alice,'history',a.pointer)).items.length,1);
  assert.equal((await ok(bob,'history',b.pointer)).items.length,2);
});
test('membership and account status are checked on each request, including forged workspace selection',async()=>{
  assert.equal((await call({...alice,workspace_id:bob.workspace_id},'query',{})).status,403);
  await db.prepare("UPDATE workspace_memberships SET status='revoked' WHERE account_id=?").bind(bob.account_id).run();
  assert.equal((await call(bob,'query',{})).status,403);
  await db.prepare("UPDATE workspace_memberships SET status='active' WHERE account_id=?").bind(bob.account_id).run();
  await db.prepare("UPDATE accounts SET status='disabled' WHERE id=?").bind(bob.account_id).run();
  assert.equal((await call(bob,'query',{})).status,403);
  assert.equal((await call(alice,'query',{})).status,200);
});
