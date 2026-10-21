import test from 'node:test';
import assert from 'node:assert/strict';
import { website } from '../src/index.ts';
const worker={fetch:website};
const addresses=new Set();
const env={DB:{prepare(sql){assert.match(sql,/ON CONFLICT\(email\) DO NOTHING/);return {bind(email,consent){assert.equal(consent,'2026-10-12');return {async run(){addresses.add(email);}};}};}}};
const req=(body,origin='https://bytesskills.com')=>new Request('https://bytesskills.com/waitlist',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Origin:origin},body});
test('page and privacy render; HEAD has no body',async()=>{for(const path of ['/','/privacy']){const r=await worker.fetch(new Request('https://bytesskills.com'+path),env);assert.equal(r.status,200);assert.match(await r.text(),/bytesskills/i);}assert.equal(await (await worker.fetch(new Request('https://bytesskills.com/',{method:'HEAD'}),env)).text(),'');});
test('save, normalize, and deduplicate',async()=>{for(const email of [' USER@Example.com ','user@example.com']){const r=await worker.fetch(req(new URLSearchParams({email})),env);assert.equal(r.status,303);assert.equal(r.headers.get('Location'),'/thanks');}assert.deepEqual([...addresses],['user@example.com']);});
test('reject malformed email',async()=>assert.equal((await worker.fetch(req('email=bad'),env)).status,400));
test('reject cross-origin',async()=>assert.equal((await worker.fetch(req('email=test%40example.com','https://evil.example'),env)).status,403));
test('reject actual oversized body',async()=>assert.equal((await worker.fetch(req('email='+ 'a'.repeat(4100)),env)).status,413));
test('honeypot avoids database writes',async()=>assert.equal((await worker.fetch(req('email=bot%40example.com&company=spam'),{})).status,303));
test('missing database returns honest failure',async()=>{const r=await worker.fetch(req('email=test%40example.com'),{});assert.equal(r.status,503);assert.match(await r.text(),/couldn't save/);});
test('database failure returns honest failure',async()=>{const r=await worker.fetch(req('email=test%40example.com'),{DB:{prepare(){throw Error('offline');}}});assert.equal(r.status,503);});

test('standalone Worker stamps its revision and preserves API redirects', async () => {
 const { default: site } = await import('../src/index.ts');
 const r = await site.fetch(new Request('https://bytesskills.com/'), {...env, WEBSITE_COMMIT:'reviewed-commit'});
 assert.equal(r.headers.get('X-Bytes-Website-Commit'), 'reviewed-commit');
 assert.equal(r.status, 200);
 const redirect = await site.fetch(new Request('https://bytesskills.com/mcp?test=1'), env);
 assert.equal(redirect.status, 308);
 assert.equal(redirect.headers.get('Location'), 'https://api.bytesskills.com/mcp?test=1');
});

test('docs routes stay on the website and expose readable agent instructions without a database',async()=>{
 const {default:site}=await import('../src/index.ts');
 for(const path of ['/docs','/docs/','/docs/install.md']){
  const response=await site.fetch(new Request('https://bytesskills.com'+path),{});
  assert.equal(response.status,200);
  assert.equal(response.headers.get('Location'),null);
  assert.match(await response.text(),/https:\/\/api.bytesskills.com\/mcp/);
  const head=await site.fetch(new Request('https://bytesskills.com'+path,{method:'HEAD'}),{});
  assert.equal(head.status,200);assert.equal(await head.text(),'');
 }
});
