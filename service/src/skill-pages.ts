import {PrivateSkills} from './private-skills';
import {Store} from './store';
import {Releases} from './releases';
import {escape,html,fileCard,fileCopyButton,copyStatus} from './html';
import {ApiError,readBody,type Env} from './common';
import type {WorkspaceAccess} from './access';
import {sessionCsrf} from './login';
export async function skillPages(req:Request,env:Env,access:WorkspaceAccess,session:{csrf:string},nav:string){
 const u=new URL(req.url),p=u.pathname,privateSkills=new PrivateSkills(env,access),releases=new Releases(env,access);
 const store=new Store(env,access);
 if(p==='/app/skills/new'){
  if(req.method==='POST'){
   const form=new URLSearchParams(await readBody(req,220000));sessionCsrf(req,env,form,session);
   const s=await privateSkills.create({id:form.get('id'),title:form.get('title'),summary:form.get('summary'),instructions:form.get('instructions')});
   return new Response(null,{status:303,headers:{Location:'/app/skill?id='+encodeURIComponent(s.id),'Cache-Control':'no-store'}});
  }
  if(req.method!=='GET')throw new ApiError(405,'GET required');
  return html(nav+`<p><a href="/app/skills">← all skills</a></p><h1>Create a private skill</h1><p>Save reusable instructions in your workspace. This creates a private draft, not a platform release or a new /bytes command.</p><form method="post"><input type="hidden" name="csrf" value="${session.csrf}"><input type="hidden" name="id" value="${crypto.randomUUID()}"><label for="title">Name (up to 200 characters)</label><input id="title" name="title" maxlength="200" required><label for="summary">Description (up to 2,000 characters)</label><textarea id="summary" name="summary" rows="3" maxlength="2000" required></textarea><label for="instructions">Instructions (up to 50,000 characters)</label><textarea id="instructions" name="instructions" rows="14" maxlength="50000" required placeholder="When to use this skill, required inputs, steps, and expected output."></textarea><button>Create private skill</button></form>`);
 }
 if(!['/app/skills','/app/skill'].includes(p))return null;
 if(req.method!=='GET')throw new ApiError(405,'GET required');
 if(p==='/app/skill'){
  if(u.searchParams.has('core')){
   const name=u.searchParams.get('core'),version=u.searchParams.get('version');
   const row=(await releases.rows()).filter(r=>r.skill===name&&!r.revoked&&(!version||r.version===version)).at(-1);
   if(!row)throw new ApiError(404,'Skill release not found');const s=await releases.verified(row);
   return html(nav+`<p><a href="/app/skills">← all skills</a></p><h1>${escape(s.skill)}</h1><p class="muted">Platform core · version ${escape(s.version)} · read only</p><p>${escape(s.summary)}</p><h2>Instructions</h2>`+fileCard('SKILL.md','instructions',s.instructions,'skill-instructions',fileCopyButton('skill-instructions','Copy','Instructions'))+`<h2>Included resources</h2>`+Object.entries(s.resources).map(([name,text],i)=>`<details><summary>${escape(name)}</summary>${fileCard(name,'resource',text,`skill-resource-${i}`,fileCopyButton(`skill-resource-${i}`,'Copy','Resource'))}</details>`).join('')+copyStatus(),new Headers(),undefined,true);
  }
  const id=u.searchParams.get('id')??'';
  if(/^[a-f0-9-]{36}$/.test(id)){
   try{const migrated=await store.resolve('@skill/'+id);return new Response(null,{status:303,headers:{Location:'/app/artifact?pointer='+encodeURIComponent(migrated.pointer)}});}
   catch(e){if(!(e instanceof ApiError)||e.status!==404)throw e;}
  }
  const s=await privateSkills.get(id);
  return html(nav+`<p><a href="/app/skills">← all skills</a></p><h1>${escape(s.title)}</h1><p class="muted">Private draft · revision ${s.revision}</p><p>Skill ID: <code>${s.id}</code></p><p>${escape(s.summary)}</p><h2>Instructions</h2>`+fileCard('SKILL.md','instructions',s.instructions,'skill-instructions',fileCopyButton('skill-instructions','Copy','Instructions'))+copyStatus()+`<p class="muted">Saved only in your workspace. You can copy these instructions into a chat; this draft is not registered as a /bytes command.</p>`,new Headers(),undefined,true);
 }
 const catalog=await releases.updates(),own=await privateSkills.list(u.searchParams.get('after')??'');
 const definitions=await store.query({type:u.searchParams.get('kind')==='format'?'format':'skill',after:u.searchParams.get('definition_after')??undefined,limit:30});
 const definitionList=`<h2>Private skills and formats</h2><p>Create or customize these by asking BytesSkills in chat. They are versioned artifacts in your workspace.</p><p><a href="/app/skills?kind=skill">Skills</a> · <a href="/app/skills?kind=format">Formats</a></p>`+definitions.items.map(d=>`<div class="listing"><a href="/app/artifact?pointer=${encodeURIComponent(d.pointer)}">${escape(d.title)}</a><br><code>${escape(d.pointer)}</code></div>`).join('')+(definitions.next_cursor?`<p><a href="/app/skills?kind=${u.searchParams.get('kind')==='format'?'format':'skill'}&amp;definition_after=${definitions.next_cursor}">More definitions →</a></p>`:'');
 return html(nav+`<h1>Your skills</h1><p><a href="/app/skills/new">+ create a private skill</a></p><h2>Platform core</h2><p class="muted">Available to everyone. Platform releases are read only.</p>`+catalog.skills.map(s=>`<div class="listing"><a href="/app/skill?core=${encodeURIComponent(s.skill)}">${escape(s.skill)}</a><br><span class="muted">Selected: ${escape(s.selected??'not selected')} · latest: ${escape(s.latest??'unavailable')}</span></div>`).join('')+definitionList+`<h2>Instruction drafts</h2>`+(own.items.length?own.items.map(s=>`<div class="listing"><a href="/app/skill?id=${s.id}">${escape(s.title)}</a><p>${escape(s.summary)}</p><span class="muted">Private draft · revision ${s.revision}</span></div>`).join(''):'<p>No private skills yet. Create one to save your own workflow.</p>')+(own.next?`<p><a href="/app/skills?after=${own.next}">More private skills →</a></p>`:''));
}
