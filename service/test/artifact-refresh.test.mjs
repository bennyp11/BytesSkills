import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {build} from 'esbuild';
import {chromium} from 'playwright';

test('visible listing refreshes under CSP without losing filters or executing content; pause stops polling',{skip:process.env.BYTES_BROWSER_TESTS!=='1',timeout:60000},async()=>{
 const bundle=await build({entryPoints:['src/html.ts'],bundle:true,write:false,format:'esm',platform:'node'});
 const {html,escape}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
 let title='First artifact',requests=0,denied=false;const urls=[];
 const server=createServer(async(req,res)=>{
  requests++;urls.push(req.url);
  if(denied){res.writeHead(403);res.end('denied');return;}
  const r=html(`<input aria-label="Search" value="brief"><p id="artifact-refresh-status" role="status">Live updates on.</p><button id="artifact-refresh-toggle">Pause live updates</button><div id="artifact-results"><a href="/app/artifact">${escape(title)}</a><time datetime="2026-10-14T10:00:00Z">UTC date</time></div>`,new Headers(),undefined,true,true);
  res.writeHead(200,Object.fromEntries(r.headers));res.end(await r.text());
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({headless:true,...(process.env.BYTES_BROWSER_CHANNEL?{channel:process.env.BYTES_BROWSER_CHANNEL}:{})});
  const page=await browser.newPage();await page.clock.install();
  const response=await page.goto('http://127.0.0.1:'+server.address().port+'/app?type=brief&sort=updated');
  assert.match(response.headers()['content-security-policy'],/connect-src 'self'/);
  await page.getByLabel('Search').fill('unsent filter');
  title='<img src=x onerror=alert(1)> New brief';
  await page.clock.fastForward(5100);
  await page.getByText(title,{exact:true}).waitFor();
  assert.equal(await page.getByLabel('Search').inputValue(),'unsent filter');
  assert.equal(await page.locator('#artifact-results img').count(),0);
  assert.ok(urls.every(u=>u==='/app?type=brief&sort=updated'));
  await page.getByRole('button',{name:'Pause live updates'}).click();const pausedCount=requests;
  await page.clock.fastForward(20000);assert.equal(requests,pausedCount);
  await page.getByRole('button',{name:'Resume live updates'}).click();
  denied=true;await page.clock.fastForward(5100);await page.getByRole('status').filter({hasText:'Reload to sign in'}).waitFor();
  const stoppedCount=requests;await page.clock.fastForward(20000);assert.equal(requests,stoppedCount);
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
});
