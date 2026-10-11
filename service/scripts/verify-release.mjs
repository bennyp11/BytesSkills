// Live verification: adopts the requested current library and saves one archived test run.
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const base=process.env.BYTES_URL??'https://api.bytesskills.com';
const key=(await readFile('.secrets/owner-key.txt','utf8')).trim();
async function connect(name){const c=new Client({name,version:'0.7.0'});await c.connect(new StreamableHTTPClientTransport(new URL(base+'/mcp'),{requestInit:{headers:{Authorization:'Bearer '+key}}}));return c;}
const a=await connect('bytes-release-machine-a'),b=await connect('bytes-release-machine-b');
async function call(client,name,args={}){const r=await client.callTool({name,arguments:args});assert.ok(!r.isError,JSON.stringify(r));return JSON.parse(r.content[0].text);}
try{
 const preview=await call(a,'bytes_updates');
 assert.ok(preview.skills.every(s=>s.latest==='0.7.0'),'Unexpected release; do not adopt');
 await call(a,'bytes_adopt',{request_id:randomUUID(),expected_revision:preview.state_revision,catalog_hash:preview.catalog_hash,action:'sync'});
 const shared=await call(b,'bytes_updates');
 assert.ok(shared.skills.every(s=>s.selected==='0.7.0'&&s.policy==='ask'));
 const workflow=await call(b,'bytes_begin',{request_id:randomUUID(),command:'/bytes brainstorm --concepts'});
 assert.equal(workflow.status,'ready');assert.equal(workflow.version,'0.7.0');
 assert.ok(Object.keys(workflow.resources).some(p=>p.startsWith('definitions/')));
 const args={workflow_id:workflow.workflow_id,request_id:randomUUID(),type:'run',title:'Skill release 0.7.0 verification',text:'Verified cross-client adoption and server-stamped skill provenance.',status:'archived',tags:['release-verification']};
 const saved=await call(b,'bytes_save',args);
 assert.equal(saved.provenance.skill_release.version,'0.7.0');
 assert.equal((await call(b,'bytes_save',args)).pointer,saved.pointer);
 const seen=await call(a,'bytes_get',{pointer:saved.pointer});
 assert.equal(seen.provenance.skill_release.checksum,workflow.checksum);
 const help=await call(a,'bytes_begin',{request_id:randomUUID(),command:'/bytes help'});
 assert.equal(help.skill,'help');assert.equal(help.status,'ready');
 const receipt={verified_at:new Date().toISOString(),release:'0.7.0',checks:['shared adoption across two MCP clients','all skills selected with ask policy','begin returns pinned definitions','save stamps skill provenance','idempotent save','cross-client pointer lookup','help begins correct workflow'],test_artifact:saved.pointer,chatgpt_host_refresh_verified:false};
 await writeFile('.secrets/release-verification.json',JSON.stringify(receipt,null,2)+'\n');
 console.log(JSON.stringify(receipt,null,2));
}finally{await a.close();await b.close();}
