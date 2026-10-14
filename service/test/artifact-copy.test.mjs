import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {build} from 'esbuild';
import {chromium} from 'playwright';

test('artifact references copy exact IDs and revisions under CSP, with manual-copy fallback',{skip:process.env.BYTES_BROWSER_TESTS!=='1',timeout:60000},async()=>{
 const bundle=await build({entryPoints:['src/html.ts'],bundle:true,write:false,format:'esm',platform:'node'});
 const {html,artifactReferences,copyButton,copyAiButton,copyOptions,copyStatus}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
 const item={type:'concept',id:'12345678-1234-4234-8234-123456789abc',pointer:'@concept/12345678-1234-4234-8234-123456789abc:v7'};
 const server=createServer(async(req,res)=>{const actions=copyButton('Copy text','Some <private> content',true)+copyAiButton('Test artifact',item.pointer,'Some <private> content')+copyOptions([copyButton('Copy link','https://app.example/app/artifact?pointer='+encodeURIComponent(item.pointer)),copyButton('Copy reference',item.pointer),copyButton('Copy command','/bytes show '+item.pointer)]);const r=html(actions+'<pre id="artifact-content">Some &lt;private&gt; content</pre>'+artifactReferences(item)+copyStatus(),new Headers(),undefined,true);res.writeHead(r.status,Object.fromEntries(r.headers));res.end(await r.text());});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 let browser;
 try {
  browser=await chromium.launch({headless:true,...(process.env.BYTES_BROWSER_CHANNEL?{channel:process.env.BYTES_BROWSER_CHANNEL}:{})});
  const context=await browser.newContext({permissions:['clipboard-read','clipboard-write']});const page=await context.newPage();
  const response=await page.goto(base);assert.match(response.headers()['content-security-policy'],/script-src 'nonce-/);
  for(const [label,value] of [['Copy text','Some <private> content'],['Copy for AI',`BytesSkills artifact\nTitle: Test artifact\nPointer: ${item.pointer}\nContent:\nSome <private> content`]]) {
   await page.getByRole('button',{name:label,exact:true}).click();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),value);
  }
  await page.getByText('More copy options',{exact:true}).click();
  for(const [label,value] of [['Copy link','https://app.example/app/artifact?pointer='+encodeURIComponent(item.pointer)],['Copy reference',item.pointer],['Copy command','/bytes show '+item.pointer]]) {
   await page.getByRole('button',{name:label,exact:true}).click();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),value);
  }
  await page.getByText('Reference details',{exact:true}).click();
  for(const [label,value] of [['artifact reference (latest)',`@concept/${item.id}`],['revision reference',item.pointer],['artifact id',item.id]]){
   await page.getByRole('button',{name:'Copy '+label,exact:true}).click();
   await page.waitForFunction(()=>document.getElementById('copy-status').textContent.endsWith('copied.'));
   assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),value);
  }
  await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:async()=>{throw Error('Denied');}}}));
  await page.getByRole('button',{name:'Copy revision reference',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Selected.'}).waitFor();
  assert.deepEqual(await page.locator('#revision-reference').evaluate(e=>[e.selectionStart,e.selectionEnd]),[0,item.pointer.length]);
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
});
