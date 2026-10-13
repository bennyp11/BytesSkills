import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
const dir=await mkdtemp(join(tmpdir(),'bytes-telemetry-'));
await build({entryPoints:['src/telemetry.ts'],bundle:true,platform:'node',format:'esm',outfile:join(dir,'telemetry.mjs')});
const t=await import(pathToFileURL(join(dir,'telemetry.mjs')));
after(()=>rm(dir,{recursive:true,force:true}));
const req=()=>new Request('https://test.example/mcp?secret=never-log',{headers:{Authorization:'Bearer never-log'}});
const rpc=name=>JSON.stringify({method:'tools/call',id:'never-log',params:{name,arguments:{text:'never-log',email:'never-log'}}});
test('one redacted event, diagnostic headers, and unchanged response',async()=>{
 const logs=[];
 const response=await t.observeMcp(req(),'0.12.1',async()=>{
  t.identifyRpc(rpc('bytes_get'));t.oauthStarted();t.oauthAccepted();
  await t.timed('membership',async()=>t.timed('db_query',async()=>42));
  await t.timed('blob_get',async()=>null);
  return new Response('original',{headers:{'Content-Type':'application/json'}});
 },e=>logs.push(e));
 assert.equal(await response.text(),'original');assert.equal(logs.length,1);
 const log=logs[0];assert.equal(log.tool,'bytes_get');assert.equal(log.stages.db_query.count,1);
 assert.equal(response.headers.get('X-Bytes-Request-Id'),log.request_id);
 assert.match(response.headers.get('Server-Timing'),/^bytes;dur=\d/);
 assert.equal(response.headers.get('Content-Type'),'application/json');
 assert(!JSON.stringify(logs).includes('never-log'));
});
test('overlapping requests keep their tools, errors and stage counts separate',async()=>{
 const logs=[];let release;
 const gate=new Promise(resolve=>{release=resolve;});
 const a=t.observeMcp(req(),'0.12.1',async()=>{
  t.identifyRpc(rpc('bytes_workspace'));await gate;
  await t.timed('db_query',async()=>1);return new Response('A');
 },e=>logs.push(e));
 const b=t.observeMcp(req(),'0.12.1',async()=>{
  t.identifyRpc(rpc('bytes_author'));t.toolError(409);
  await t.timed('blob_put',async()=>1);release();return new Response('B');
 },e=>logs.push(e));
 await Promise.all([a,b]);assert.equal(logs.length,2);
 const byTool=Object.fromEntries(logs.map(l=>[l.tool,l]));
 assert.equal(byTool.bytes_workspace.tool_error_status,null);
 assert.equal(byTool.bytes_workspace.stages.blob_put,undefined);
 assert.equal(byTool.bytes_author.tool_error_status,409);
 assert.equal(byTool.bytes_author.stages.db_query,undefined);
 assert.notEqual(logs[0].request_id,logs[1].request_id);
});
test('failure timings survive; untrusted method/tool names and errors never enter logs',async()=>{
 const logs=[];
 await assert.rejects(t.observeMcp(req(),'never-log',async()=>{
  t.identifyRpc(rpc('never-log'));t.oauthStarted();
  await t.timed('db_connect',async()=>{throw Error('never-log');});
 },e=>logs.push(e)),/never-log/);
 assert.equal(logs[0].http_status,500);assert.equal(logs[0].tool,'none');
 assert.equal(logs[0].stages.db_connect.count,1);assert.equal(logs[0].stages.oauth.count,1);
 assert(!JSON.stringify(logs).includes('never-log'));
});
test('log sink failure does not break requests; non-MCP requests are not instrumented',async()=>{
 assert.equal((await t.observeMcp(req(),undefined,async()=>new Response('ok'),()=>{throw Error('sink');})).status,200);
 let logged=false;
 await t.observeMcp(new Request('https://test.example/auth/complete'),undefined,async()=>{
  assert.equal(t.requestId(),undefined);return new Response('ok');
 },()=>{logged=true;});
 assert.equal(logged,false);
});
