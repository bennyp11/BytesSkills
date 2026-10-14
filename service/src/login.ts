import {destination} from './login-destination';
import {artifactUrl} from './artifact-links';
import {ApiError,readBody,sha,type Env} from './common';
import {database} from './database';
import {WorkspaceAccess} from './access';
import {Store} from './store';
import {skillPages} from './skill-pages';
import {escape,html,artifactReferences,copyButton,copyAiButton,copyOptions,copyStatus} from './html';
import {browseArtifacts,artifactFormats} from './artifact-browser';
import registry from '../../plugins/bytesskills-core/skills/bytes/contracts/runtime.json';
const random=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('');
const cookie=(req:Request,name:string)=>req.headers.get('Cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='))?.slice(name.length+1)??'';
const setCookie=(name:string,value:string,age:number)=>`${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${age}`;
const previewTypes=new Set(['image/png','image/jpeg','image/gif','image/webp','audio/mpeg','audio/mp4','audio/ogg','audio/wav','video/mp4','video/webm']);
const valid=(s:string)=>/^[a-f0-9]{64}$/.test(s);
function origin(req:Request,env:Env){const o=new URL(req.url).origin;if(![env.BASE_URL,env.APP_URL].includes(o))throw new ApiError(403,'Invalid login origin');return o;}
function post(req:Request,env:Env){if(req.method!=='POST')throw new ApiError(405,'POST required');if(req.headers.get('Origin')!==origin(req,env))throw new ApiError(403,'Invalid form origin');}

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
 if(!['/login','/auth/request','/auth/verify','/auth/complete','/auth/logout','/app','/app/artifact','/app/content','/app/skills','/app/skills/new','/app/skill','/app/connections','/app/revoke'].includes(p))return null;
 if(env.LOGIN_ENABLED!=='true')throw new ApiError(404,'Not found');
 const o=origin(req,env);
 if(p==='/login'&&req.method==='GET'){
  const nonce=random();return html(`<h1>Sign in to BytesSkills</h1><p>Enter your invited email address. Open the link in this browser.</p><form method="post" action="/auth/request"><input type="email" name="email" aria-label="Email address" required maxlength="254" autocomplete="email"><input type="hidden" name="next" value="${escape(destination(u.searchParams.get('next')??'/app'))}"><button>Send sign-in link</button></form>`,new Headers({'Set-Cookie':setCookie('__Host-bytes-login',nonce,600)}));
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
  // Preserve the form Origin without disclosing the token-bearing URL in Referer.
  const headers=new Headers();
  const response=html(`<h1>Confirm sign-in</h1><p>Continue only if you requested this link.</p><form method="post" action="/auth/complete"><input type="hidden" name="token" value="${token}"><button>Sign in</button></form>`,headers);response.headers.set('Referrer-Policy','strict-origin');return response;
 }
 if(p==='/auth/complete'&&req.method==='GET')return loginRedirect('/app');
 if(p==='/auth/complete'){
  post(req,env);const form=new URLSearchParams(await readBody(req,16000));const token=form.get('token')??'',nonce=cookie(req,'__Host-bytes-login');
  if(!valid(token)||!valid(nonce))throw new ApiError(400,'Invalid or expired sign-in link');
  if(form.has('owner_key'))throw new ApiError(400,'Owner-key claims are retired. Request a new sign-in link.');
  const session=random();const result=await authRow<{account_id:string;workspace_id:string;destination:string}>(env,'SELECT * FROM login_finish(?,?,?,?,?)',await sha(token),await sha(nonce),o,await sha(session),null);
  if(!result)throw new ApiError(400,'Invalid, expired, or already used link. Request a new link.');
  const headers=new Headers({Location:destination(result.destination),'Cache-Control':'no-store'});headers.append('Set-Cookie',setCookie('__Host-bytes-session',session,604800));headers.append('Set-Cookie',setCookie('__Host-bytes-login','',0));return new Response(null,{status:303,headers});
 }
 const session=await browserSession(req,env);if(!session)return loginRedirect(req.method==='GET'?u.pathname+u.search:'/app');
 if(p==='/auth/logout'){
  const form=new URLSearchParams(await readBody(req,16000));sessionCsrf(req,env,form,session);
  await authRow(env,'SELECT login_logout(?,?)',await sha(cookie(req,'__Host-bytes-session')),o);
  return new Response(null,{status:303,headers:{Location:'/login','Set-Cookie':setCookie('__Host-bytes-session','',0),'Cache-Control':'no-store'}});
 }
 const access=await WorkspaceAccess.authorize(env,session.account_id,session.workspace_id),store=new Store(env,access);
 const nav=`<div class="workspace-nav"><nav aria-label="Workspace"><a href="/app">Artifacts</a> · <a href="/app/skills">Skills</a> · <a href="/app/connections">Connections</a></nav><form method="post" action="/auth/logout"><input type="hidden" name="csrf" value="${session.csrf}"><button>Sign out</button></form></div>`;
 const skillPage=await skillPages(req,env,access,session,nav);if(skillPage)return skillPage;
 if(p==='/app/revoke'){
  const form=new URLSearchParams(await readBody(req,16000));sessionCsrf(req,env,form,session);
  const id=form.get('grant')??'';if(!id||id.length>256)throw new ApiError(400,'Invalid connection');
  await env.OAUTH_PROVIDER.revokeGrant(id,session.account_id);return new Response(null,{status:303,headers:{Location:'/app/connections'}});
 }
 if(req.method!=='GET')throw new ApiError(405,'GET required');
 if(p==='/app/content'){
  const record=await store.resolve(u.searchParams.get('pointer')??'');const blob=await env.BLOBS.get(store.objectKey(record.content.key));if(!blob)throw new ApiError(404,'Content missing');const inline=u.searchParams.get('view')==='1'&&previewTypes.has(record.content.media_type);return new Response(blob.body,{headers:{'Content-Type':inline?record.content.media_type:'application/octet-stream','Content-Disposition':inline?'inline':'attachment','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 }
 if(p==='/app/artifact'){
  const item=await store.get(u.searchParams.get('pointer')??'',true);const history=await store.history(item.pointer);
  const url='/app/content?pointer='+encodeURIComponent(item.pointer)+'&amp;view=1';
  let content='text' in item?`<pre id="artifact-content">${escape(String(item.text))}</pre>`:'<p>Preview unavailable for this file type. Download it below.</p>';
  if(previewTypes.has(item.content.media_type))content=item.content.media_type.startsWith('image/')?`<img src="${url}" alt="${escape(item.title)}">`:item.content.media_type.startsWith('video/')?`<video controls preload="metadata" src="${url}"></video>`:`<audio controls preload="metadata" src="${url}"></audio>`;
  if(item.content.media_type==='application/json')content=`<pre id="artifact-content">${escape(await store.contentText(item.content))}</pre>`;
  const copyText='text' in item?String(item.text):item.content.media_type==='application/json'?await store.contentText(item.content):undefined;
  const moreCopy=[copyButton("Copy link",artifactUrl(env,item.pointer)),copyButton("Copy reference",item.pointer),copyButton("Copy command",'/bytes show '+item.pointer)];
  return html(nav+`<p><a href="/app">← all artifacts</a></p><h1>${escape(item.title)}</h1><p class="muted">${escape(item.type)} · ${escape(item.status)} · revision ${item.revision}</p><div class="artifact-actions">${copyText!==undefined?copyButton("Copy text",copyText,true):''}${copyAiButton(item.title,item.pointer,copyText)}${copyOptions(moreCopy)}</div>${copyStatus()}${content}${artifactReferences(item)}<p><a href="/app/content?pointer=${encodeURIComponent(item.pointer)}">Download content</a></p><h2>Revisions</h2>`+history.items.map((r:any)=>`<p><a href="/app/artifact?pointer=${encodeURIComponent(r.pointer)}">Revision ${r.revision}</a></p>`).join(''),new Headers(),undefined,true);

 }

 if(p==='/app/connections'){
  const grants=await env.OAUTH_PROVIDER.listUserGrants(session.account_id,{limit:50,cursor:u.searchParams.get('cursor')??undefined});
  return html(nav+`<h1>Connected apps</h1>`+grants.items.map(g=>`<section><p>${escape(g.clientId)}</p><form method="post" action="/app/revoke"><input type="hidden" name="csrf" value="${session.csrf}"><input type="hidden" name="grant" value="${escape(g.id)}"><button>Revoke access</button></form></section>`).join(''));
 }
 const rows=await browseArtifacts(env,access,{text:u.searchParams.get('q')??'',type:u.searchParams.get('type')??'',status:u.searchParams.get('status')??'',format:u.searchParams.get('format')??'',sort:u.searchParams.get('sort')??'updated',runs:u.searchParams.get('runs')==='1',cursor:u.searchParams.get('cursor')??undefined});
 const q=rows.filters,formats=await artifactFormats(env,access);
 const select=(name:string,label:string,choices:[string,string][],value:string)=>`<label>${label}<br><select name="${name}">${choices.map(([v,t])=>`<option value="${escape(v)}" ${v===value?'selected':''}>${escape(t)}</option>`).join('')}</select></label>`;
 const dates=(s:string)=>{const date=new Date(s);return Number.isNaN(date.valueOf())?'unknown date':date.toLocaleString('en-US',{timeZone:'UTC',year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})+' UTC';};
 const next=new URLSearchParams(u.searchParams);if(rows.next)next.set('cursor',rows.next);
 return html(nav+`<h1>Your artifacts</h1><p>Browse and open your saved work here. Use /bytes in chat to create or edit it.</p><form action="/app/artifact"><label>Open by reference <input name="pointer" required placeholder="@brief/…:v1"></label><button>Open artifact</button></form><form><input aria-label="Search artifacts" name="q" value="${escape(q.text)}" placeholder="Search"><div class="filters">`+
 select('sort','Sort',[['updated','Recently updated'],['newest','Newest created'],['oldest','Oldest created'],['title','Title A–Z']],q.sort)+
 select('type','Type',[['','All types'],...registry.artifact_types.map(t=>[t,t] as [string,string])],q.type)+
 select('status','Status',[['','Active (not archived)'],['all','All statuses'],...registry.statuses.map(t=>[t,t] as [string,string])],q.status)+
 select('format','Format',[['','All formats'],...formats.map(t=>[t,t] as [string,string])],q.format)+
 `<label><input type="checkbox" name="runs" value="1" ${q.runs?'checked':''}> Show runs</label><button>Apply</button><a href="/app">Reset</a></div></form>${copyStatus()}`+
 '<p id="artifact-refresh-status" role="status" aria-live="polite">Live updates on. Checking every 5 seconds while this tab is visible.</p><button type="button" id="artifact-refresh-toggle" aria-pressed="false">Pause live updates</button><noscript>Refresh this page to see new artifacts.</noscript><div id="artifact-results">'+
 (rows.items.length?rows.items.map(r=>`<div class="listing"><h2><a href="/app/artifact?pointer=${encodeURIComponent(r.pointer)}">${escape(r.title)}</a></h2><p class="muted">${escape(r.type)} · ${escape(r.status)}${r.format?' · '+escape(r.format):''}<br>Updated <time datetime="${escape(r.updated)}">${escape(dates(r.updated))}</time> · Created <time datetime="${escape(r.created)}">${escape(dates(r.created))}</time></p><a href="/app/artifact?pointer=${encodeURIComponent(r.pointer)}">open</a>${copyButton('Copy link',artifactUrl(env,r.pointer),true)}${copyOptions([copyButton('Copy reference',r.pointer)])}</div>`).join(''):'<p>No artifacts match these filters.</p>')+
 (rows.next?`<p><a href="/app?${escape(next.toString())}">Next page →</a></p>`:'')+'</div>',new Headers(),undefined,true,true);
}
