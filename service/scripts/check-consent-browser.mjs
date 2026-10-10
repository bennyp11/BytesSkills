// Optional live Chromium regression. Cancels consent; never grants access.
// Requires Playwright (or PLAYWRIGHT_MODULE pointing to its index.mjs).
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
import {createHash,randomBytes} from 'node:crypto';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE});
try {
 const page=await browser.newPage();
 const violations=[];
 page.on('console',m=>{if(m.text().includes('form-action')) violations.push('form-action blocked');});
 await page.route('https://chatgpt.com/connector_platform_oauth_redirect?**',async route=>{
  const u=new URL(route.request().url());
  await route.fulfill({contentType:'text/plain',body:u.searchParams.get('error')==='access_denied'?'Callback reached successfully':'Unexpected callback'});
 });
 const q=new URLSearchParams({response_type:'code',client_id:'https://chatgpt.com/oauth/client.json',redirect_uri:'https://chatgpt.com/connector_platform_oauth_redirect',scope:'bytes:read',code_challenge:createHash('sha256').update(randomBytes(48)).digest('base64url'),code_challenge_method:'S256',resource:'https://api.bytesskills.com/mcp',state:'browser-csp-regression'});
 await page.goto('https://api.bytesskills.com/authorize?'+q);
 await page.getByRole('button',{name:'Cancel',exact:true}).click();
 try {await page.waitForURL('https://chatgpt.com/**',{timeout:5000});} catch {}
 const success=page.url().startsWith('https://chatgpt.com/');
 console.log(JSON.stringify({callbackReached:success,formActionViolations:violations.length}));
 if(!success || violations.length) process.exitCode=1;
}finally{await browser.close();}
