import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
test('dedicated release key cannot access workspace or MCP; owner cannot publish after separation',async()=>{
  const owner='test-owner-key-000000000000000000000000',publisher='test-release-key-0000000000000000000000';
  const hash=s=>createHash('sha256').update(s).digest('hex');
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,scriptPath:'dist/index.js',compatibilityDate:'2026-10-01',
    compatibilityFlags:['nodejs_compat','global_fetch_strictly_public'],d1Databases:['DB'],r2Buckets:['BLOBS'],kvNamespaces:['OAUTH_KV'],
    bindings:{WORKSPACE_ID:'acc3351e-d092-433c-a7e1-8fc3e807ebd4',BASE_URL:'https://api.bytesskills.com',OWNER_KEY_SHA256:hash(owner),RELEASE_KEY_SHA256:hash(publisher)}}));
  try {
    const db=await mf.getD1Database('DB');
    for(const f of (await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort())
      await db.exec((await readFile('migrations/'+f,'utf8')).replace(/--[^\n]*/g,'').replace(/\n/g,' '));
    const call=(path,key,body)=>mf.dispatchFetch('https://api.bytesskills.com'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:body?JSON.stringify(body):undefined});
    assert.equal((await call('/v1/releases',publisher)).status,200);
    for(const path of ['/v1/query','/v1/export','/v1/grants','/v1/library','/v1/content?pointer=x'])
      assert.equal((await call(path,publisher)).status,401);
    assert.equal((await call('/mcp',publisher,{jsonrpc:'2.0',id:1,method:'tools/list'})).status,401);
    assert.equal((await call('/v1/releases',owner)).status,401);
    assert.equal((await call('/v1/query',owner)).status,200);
    const payload={releases:[{skill:'help',version:'1.0.0',summary:'test',protocol:1,required_scopes:['bytes:read'],instructions:'test',resources:{}}]};
    assert.equal((await call('/v1/releases',owner,payload)).status,401);
    const published=await call('/v1/releases',publisher,payload);
    assert.equal(published.status,200);
    assert.deepEqual(Object.keys(await published.json()),['published']);
    const denied=await call('/mcp',owner,{jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'bytes_publish',arguments:payload}});
    assert.equal((await denied.json()).result.isError,true);
  }finally{await mf.dispose();}
});

test('production email login rejects the retired owner key for REST and MCP', async () => {
 const owner='retired-owner-key-0000000000000000000000';
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,scriptPath:'dist/index.js',compatibilityDate:'2026-10-01',compatibilityFlags:['nodejs_compat','global_fetch_strictly_public'],kvNamespaces:['OAUTH_KV'],bindings:{BASE_URL:'https://api.bytesskills.com',LOGIN_ENABLED:'true',OWNER_KEY_SHA256:createHash('sha256').update(owner).digest('hex')}}));
 try {
  for(const path of ['/v1/query','/v1/releases','/mcp']) {
   const r=await mf.dispatchFetch('https://api.bytesskills.com'+path,{headers:{Authorization:'Bearer '+owner}});
   assert.equal(r.status,401);
  }
 }finally{await mf.dispose();}
});
