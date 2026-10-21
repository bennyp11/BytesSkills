import test, {before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
let mf;
before(async()=>{
 const bundle=await build({stdin:{contents:`
 import {uploadVerifiedPart} from './src/upload-part';
 export default {async fetch(req,env){
  const upload=await env.BLOBS.createMultipartUpload(crypto.randomUUID());
  try {
   const target=new URL(req.url).pathname==='/reject'?{uploadPart:async()=>{throw Error('Storage unavailable')}}:upload;
   const result=await uploadVerifiedPart(target,1,req.body,Number(req.headers.get('x-size')));
   const object=await upload.complete([result.part]);
   const stored=await env.BLOBS.get(object.key);
   const bytes=Array.from(new Uint8Array(await stored.arrayBuffer()));
   await env.BLOBS.delete(object.key);
   return Response.json({size:result.size,sha256:result.sha256,bytes});
  }catch(e){await upload.abort();return Response.json({error:e.message},{status:e.status||500})}
 }};`,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'esm',platform:'browser',external:['node:crypto']});
 mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-10-01',compatibilityFlags:['nodejs_compat'],r2Buckets:['BLOBS']}));
});
after(async()=>{await mf?.dispose()});
test('verified ZIP part preserves known length for the real R2 binding',async()=>{
 const bytes=new Uint8Array(22);bytes.set([80,75,5,6]);
 const response=await mf.dispatchFetch('http://local/',{method:'POST',headers:{'x-size':String(bytes.length)},body:bytes});
 assert.equal(response.status,200);
 assert.deepEqual(await response.json(),{size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:Array.from(bytes)});
});
for(const expected of [3,5])test(`rejects incorrect part length ${expected}`,{timeout:10000},async()=>{
 const response=await mf.dispatchFetch('http://local/',{method:'POST',headers:{'x-size':String(expected)},body:new Uint8Array(4)});
 assert.notEqual(response.status,200);
 assert.match((await response.json()).error,/too large|ended before/);
});
test('storage rejection aborts the pipeline promptly',{timeout:10000},async()=>{
 const response=await mf.dispatchFetch('http://local/reject',{method:'POST',headers:{'x-size':'1048576'},body:new Uint8Array(1048576)});
 assert.equal(response.status,500);
 assert.match((await response.json()).error,/Storage unavailable/);
});
