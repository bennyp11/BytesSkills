interface Env { DB: D1Database; WEBSITE_COMMIT?: string; }
export function page(message: string = '', failed: boolean = false) {
return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>bytesskills — Your AI Coordination System</title><meta name="description" content="Switch AIs without rebuilding your setup. Keep your saved context, skills, and work in one place. Join the BytesSkills waitlist for exclusive early access.">
<style>
html{color-scheme:light}body{margin:48px 24px;background:white;color:#222;font:18px/1.5 Georgia,'Times New Roman',serif}main{max-width:570px;margin:auto}h1{margin:0 0 4px;font:bold 38px/1.1 'Times New Roman',serif;letter-spacing:-1px;color:#551a8b}nav,footer,.note{font-size:15px}a{color:#551a8b}a:hover{color:#0000ee}hr{border:0;border-top:1px solid #ccc;margin:26px 0}h2{font-size:20px;margin:0 0 12px}p{margin:16px 0}label{display:block;margin-bottom:7px}.fields{display:flex;gap:8px;flex-wrap:wrap}input[type=email]{font:16px Arial,sans-serif;padding:7px 9px;min-width:0;flex:1 1 230px;border:1px solid #888;border-radius:0}button{font:16px 'Times New Roman',serif;padding:6px 14px;cursor:pointer}:focus-visible{outline:2px solid #551a8b;outline-offset:3px}.note,footer{color:#666}.trap{position:absolute;left:-10000px}.status{border-left:3px solid ${failed?'#a00':'#386738'};padding-left:12px}footer{margin-top:28px}@media(max-width:420px){body{margin:30px 20px}}
</style></head><body><main>
<header><h1>bytesskills</h1><p>Your AI Coordination System</p><nav aria-label="Page sections"><a href="#about">what is this?</a> &nbsp;|&nbsp; <a href="#waitlist">join the waitlist</a></nav></header><hr>
<section id="about" aria-labelledby="about-title"><h2 id="about-title">Pick up where you left off.</h2><p>Switch AIs without rebuilding your setup. BytesSkills keeps your saved context, skills, and work in one place for the AI tools you connect, on your laptop or your phone.</p></section><hr>
<section id="waitlist" aria-label="Join the waitlist"><p>Join the waitlist and get exclusive early access.</p>
${message?`<p class="status" role="${failed?'alert':'status'}">${message}</p>`:''}
<form action="/waitlist" method="post"><label for="email">email address</label><div class="fields"><input id="email" name="email" type="email" autocomplete="email" placeholder="you@example.com" maxlength="254" required><button type="submit">join the waitlist</button></div><div class="trap" aria-hidden="true"><label for="company">Leave this blank</label><input id="company" name="company" tabindex="-1" autocomplete="off"></div><p class="note">By joining, you agree to receive BytesSkills early-access updates. Unsubscribe anytime.</p></form></section>
<footer>built by Benny Bytes. &nbsp;<a href="/privacy">privacy</a></footer></main></body></html>`;
}
export const privacy=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>BytesSkills — waitlist privacy</title><style>body{max-width:570px;margin:48px auto;padding:0 24px;font:18px/1.5 Georgia,serif}a{color:#551a8b}</style><main><a href="/">← bytesskills</a><h1>waitlist privacy</h1><p>We store your email address, signup time, and the version of the signup notice you accepted so we can send BytesSkills early-access updates. This page uses no analytics or advertising cookies.</p><p>The waitlist is hosted using Cloudflare. Hosting providers may process technical request information to operate and protect the service.</p><p>We do not sell the waitlist. Each update will include a way to unsubscribe. You can also reply to an update to request deletion of your signup information.</p></main></html>`;

const headers={'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",'X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'};
const html=(content: string | null,status=200)=>new Response(content,{status,headers});
export async function website(request: Request, env: Pick<Env, "DB">) {
 const url=new URL(request.url);
 if(request.method==='GET'||request.method==='HEAD'){
  const content=url.pathname==='/'?page():url.pathname==='/thanks'?page("You're on the list. We'll email you when it's your turn."):url.pathname==='/privacy'?privacy:null;
  return content?html(request.method==='HEAD'?null:content):html('Not found.',404);
 }
 if(url.pathname!=='/waitlist')return html('Not found.',404);
 if(request.method!=='POST')return new Response('Method not allowed.',{status:405,headers:{...headers,Allow:'POST'}});
 const origin=request.headers.get('Origin');
 if((origin&&origin!==url.origin)||request.headers.get('Sec-Fetch-Site')==='cross-site')return html('Please submit the form from this website.',403);
 if(!request.headers.get('Content-Type')?.startsWith('application/x-www-form-urlencoded'))return html('Unsupported form encoding.',415);
 const reader=request.body?.getReader();let bytes=0; const chunks: Uint8Array[]=[];
 if(reader){for(;;){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>4096){await reader.cancel();return html('Form is too large.',413);}chunks.push(value);}}
 const body=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.length;}
 const form=new URLSearchParams(new TextDecoder().decode(body));
 const success=()=>new Response(null,{status:303,headers:{Location:'/thanks','Cache-Control':'no-store'}});
 if(form.get('company'))return success();
 const email=(form.get('email')||'').trim().toLowerCase();
 if(email.length>254||!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email))return html(page('Please enter a valid email address.',true),400);
 try{
  if(!env.DB)throw new Error('Missing waitlist binding');
  await env.DB.prepare('INSERT INTO website_waitlist (email, consent_version) VALUES (?, ?) ON CONFLICT(email) DO NOTHING').bind(email,'2026-10-12').run();
  return success();
 }catch{return html(page("We couldn't save your email just now. Please try again in a moment.",true),503);}
}

export default {
 async fetch(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const response = ["/", "/waitlist", "/thanks", "/privacy"].includes(url.pathname)
   ? await website(request, env)
   : Response.redirect("https://api.bytesskills.com" + url.pathname + url.search, 308);
  const result = new Response(response.body, response);
  result.headers.set("X-Bytes-Website-Commit", env.WEBSITE_COMMIT || "local");
  return result;
 }
};
