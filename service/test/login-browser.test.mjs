import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {chromium} from 'playwright';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';

test('real browser submits login confirmation with exact Origin and no token in Referer', {skip:process.env.BYTES_BROWSER_TESTS!=='1',timeout:60000}, async()=>{
 let mf,received,browser;
 const server=createServer(async(req,res)=>{
  try {
   if(req.method==='POST'){
    received={origin:req.headers.origin,referer:req.headers.referer,path:req.url};
    res.end('Submission captured');return;
   }
   // Render the actual Worker confirmation page using a synthetic, non-redeemable link.
   const response=await mf.dispatchFetch(base+req.url,{headers:{Cookie:'__Host-bytes-login='+'2'.repeat(64)}});
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());
  }catch{res.writeHead(500);res.end('Test fixture failed');}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 try {
  mf=new Miniflare(convertV4MiniflareOptions({modules:true,scriptPath:'dist/index.js',compatibilityDate:'2026-10-01',compatibilityFlags:['nodejs_compat','global_fetch_strictly_public'],kvNamespaces:['OAUTH_KV'],bindings:{BASE_URL:base,APP_URL:base,LOGIN_ENABLED:'true'}}));
  browser=await chromium.launch({headless:true,...(process.env.BYTES_BROWSER_CHANNEL?{channel:process.env.BYTES_BROWSER_CHANNEL}:{})});
  const page=await browser.newPage();
  const response=await page.goto(base+'/auth/verify?token='+'1'.repeat(64));
  assert.equal(response.status(),200);
  await Promise.all([page.waitForURL(base+'/auth/complete'),page.getByRole('button',{name:'Sign in',exact:true}).click()]);
  assert.deepEqual(received,{origin:base,referer:base+'/',path:'/auth/complete'});
 }finally{await browser?.close();await mf?.dispose();await new Promise(resolve=>server.close(resolve));}
});
