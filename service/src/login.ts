import {ApiError,readBody,sha,ownerKey,type Env} from './common';
import {database} from './database';
import {WorkspaceAccess} from './access';
import {Store} from './store';
import {Releases} from './releases';
import {escape,html} from './html';
const random=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('');
const cookie=(req:Request,name:string)=>req.headers.get('Cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='))?.slice(name.length+1)??'';
const setCookie=(name:string,value:string,age:number)=>`${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${age}`;
const valid=(s:string)=>/^[a-f0-9]{64}$/.test(s);
function origin(req:Request,env:Env){const o=new URL(req.url).origin;if(![env.BASE_URL,env.APP_URL].includes(o))throw new ApiError(403,'Invalid login origin');return o;}
function post(req:Request,env:Env){if(req.method!=='POST')throw new ApiError(405,'POST required');if(req.headers.get('Origin')!==origin(req,env))throw new ApiError(403,'Invalid form origin');}
function destination(s:string){if(s==='/app')return s;const u=new URL(s,'https://return.invalid');if(s.startsWith('/authorize?')&&u.origin==='https://return.invalid'&&u.pathname==='/authorize'&&!u.hash&&s.length<=12000)return s;return '/app';}
export const loginRedirect=(next:string)=>new Response(null,{status:303,headers:{Location:'/login?next='+encodeURIComponent(destination(next)),'Cache-Control':'no-store'}});
async function authRow<T>(env:Env,sql:string,...params:unknown[]){return database(env,undefined,'identity').prepare(sql).bind(...params).first<T>();}
export async function browserSession(req:Request,env:Env){
 if(env.LOGIN_ENABLED!=='true')return null;
 const token=cookie(req,'__Host-bytes-session');if(!valid(token))return null;
 const row=await authRow<{account_id:string;workspace_id:string}>(env,'SELECT * FROM login_session(?,?)',await sha(token),origin(req,env));
 return row?{...row,csrf:await sha('csrf:'+token)}:null;
}
export function sessionCsrf(req:Request,env:Env,form:URLSearchParams,s:{csrf:string}){post(req,env);if(form.get('csrf')!==s.csrf)throw new ApiError(403,'Invalid session confirmation');}
export async function loginRoutes(req:Request,env:Env):Promise<Response|null>{
 const u=new URL(req.url),p=u.pathname;
 if(!['/login','/auth/request','/auth/verify','/auth/complete','/auth/logout','/app','/app/artifact','/app/content','/app/skills','/app/connections','/app/revoke'].includes(p))return null;
 if(env.LOGIN_ENABLED!=='true')throw new ApiError(404,'Not found');
 const o=origin(req,env);
 if(p==='/login'&&req.method==='GET'){
  const nonce=random();return html(`<h1>Sign in to BytesSkills</h1><p>Enter your invited email address. Open the link in this browser.</p><form method="post" action="/auth/request"><input type="email" name="email" required maxlength="254" autocomplete="email"><input type="hidden" name="next" value="${escape(destination(u.searchParams.get('next')??'/app'))}"><button>Send sign-in link</button></form>`,new Headers({'Set-Cookie':setCookie('__Host-bytes-login',nonce,600)}));
 }
 if(p==='/auth/request'){
  post(req,env);const form=new URLSearchParams(await readBody(req,16000));const email=(form.get('email')??'').trim().toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)throw new ApiError(400,'Enter a valid email');
  const nonce=cookie(req,'__Host-bytes-login');if(!valid(nonce))throw new ApiError(400,'Start again from sign in');
  if(!env.EMAIL||!env.EMAIL_FROM)throw new ApiError(503,'Email sign-in is unavailable');
  const token=random();const allowed=await authRow<{allowed:boolean}>(env,'SELECT login_start(?,?,?,?,?,?) AS allowed',email,await sha(token),await sha(nonce),await sha(req.headers.get('CF-Connecting-IP')??'unknown'),o,destination(form.get('next')??'/app'));
  if(allowed?.allowed){try{await env.EMAIL.send({to:email,from:env.EMAIL_FROM,subject:'Sign in to BytesSkills',text:`Open this link in the browser where you requested it, then confirm sign-in:\n\n${o}/auth/verify?token=${token}\n\nIt expires in 10 minutes and works once. If you did not request it, ignore this email.`});}catch{console.error('login_email_delivery_failed');}}
  return html('<h1>Check your email</h1><p>If this address is invited and eligible for another link, you will receive an email shortly. Links expire in ten minutes.</p><a href="/login">Start again</a>');
 }
 if(p==='/auth/verify'&&req.method==='GET'){
  const token=u.searchParams.get('token')??'';if(!valid(token)||!valid(cookie(req,'__Host-bytes-login')))throw new ApiError(400,'Open the link in the browser where you requested it, or request a new link');
  const headers=new Headers({'Referrer-Policy':'no-referrer'});
  const response=html(`<h1>Confirm sign-in</h1><p>Continue only if you requested this link.</p><form method="post" action="/auth/complete"><input type="hidden" name="token" value="${token}"><details><summary>Claim an existing owner workspace</summary><p>Only for the original owner signing in for the first time.</p><input type="password" name="owner_key" autocomplete="off" aria-label="Existing owner key"></details><button>Sign in</button></form>`,headers);response.headers.set('Referrer-Policy','no-referrer');return response;
 }
 if(p==='/auth/complete'){
  post(req,env);const form=new URLSearchParams(await readBody(req,16000));const token=form.get('token')??'',nonce=cookie(req,'__Host-bytes-login');
  if(!valid(token)||!valid(nonce))throw new ApiError(400,'Invalid or expired sign-in link');
  const key=form.get('owner_key')??'';if(key&&!await ownerKey(key,env))throw new ApiError(403,'Invalid owner proof');
  const session=random();const result=await authRow<{account_id:string;workspace_id:string;destination:string}>(env,'SELECT * FROM login_finish(?,?,?,?,?)',await sha(token),await sha(nonce),o,await sha(session),key?env.WORKSPACE_ID:null);
  if(!result)throw new ApiError(400,'Invalid, expired, or already used link. Request a new link.');
  const headers=new Headers({Location:destination(result.destination),'Cache-Control':'no-store'});headers.append('Set-Cookie',setCookie('__Host-bytes-session',session,604800));headers.append('Set-Cookie',setCookie('__Host-bytes-login','',0));return new Response(null,{status:303,headers});
 }
 const session=await browserSession(req,env);if(!session)return loginRedirect('/app');
 if(p==='/auth/logout'){
  const form=new URLSearchParams(await readBody(req,16000));sessionCsrf(req,env,form,session);
  await authRow(env,'SELECT login_logout(?,?)',await sha(cookie(req,'__Host-bytes-session')),o);
  return new Response(null,{status:303,headers:{Location:'/login','Set-Cookie':setCookie('__Host-bytes-session','',0),'Cache-Control':'no-store'}});
 }
 const access=await WorkspaceAccess.authorize(env,session.account_id,session.workspace_id),store=new Store(env,access);
 const nav=`<nav><a href="/app">Artifacts</a> · <a href="/app/skills">Skills</a> · <a href="/app/connections">Connections</a></nav><form method="post" action="/auth/logout"><input type="hidden" name="csrf" value="${session.csrf}"><button>Sign out</button></form>`;
 if(p==='/app/revoke'){
  const form=new URLSearchParams(await readBody(req,16000));sessionCsrf(req,env,form,session);
  const id=form.get('grant')??'';if(!id||id.length>256)throw new ApiError(400,'Invalid connection');
  await env.OAUTH_PROVIDER.revokeGrant(id,session.account_id);return new Response(null,{status:303,headers:{Location:'/app/connections'}});
 }
 if(req.method!=='GET')throw new ApiError(405,'GET required');
 if(p==='/app/content'){
  const record=await store.resolve(u.searchParams.get('pointer')??'');const blob=await env.BLOBS.get(store.objectKey(record.content.key));if(!blob)throw new ApiError(404,'Content missing');return new Response(blob.body,{headers:{'Content-Type':'application/octet-stream','Content-Disposition':'attachment','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 }
 if(p==='/app/artifact'){
  const item=await store.get(u.searchParams.get('pointer')??'',true);return html(nav+`<h1>Artifact</h1><pre>${escape(JSON.stringify(item,null,2))}</pre>`);
 }
 if(p==='/app/skills')return html(nav+`<h1>Your skills</h1><pre>${escape(JSON.stringify(await new Releases(env,access).state(),null,2))}</pre>`);
 if(p==='/app/connections'){
  const grants=await env.OAUTH_PROVIDER.listUserGrants(session.account_id,{limit:50,cursor:u.searchParams.get('cursor')??undefined});
  return html(nav+`<h1>Connected apps</h1>`+grants.items.map(g=>`<section><p>${escape(g.clientId)}</p><form method="post" action="/app/revoke"><input type="hidden" name="csrf" value="${session.csrf}"><input type="hidden" name="grant" value="${escape(g.id)}"><button>Revoke access</button></form></section>`).join(''));
 }
 const rows=await store.query({text:u.searchParams.get('q')??undefined,after:u.searchParams.get('after')??undefined,limit:30});
 return html(nav+`<h1>Your artifacts</h1><form><input name="q" value="${escape(u.searchParams.get('q')??'')}" placeholder="Search"><button>Search</button></form>`+rows.items.map(r=>`<p><a href="/app/artifact?pointer=${encodeURIComponent(r.pointer)}">${escape(r.title)}</a><br><code>${escape(r.pointer)}</code></p>`).join(''));
}
