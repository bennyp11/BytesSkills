import {z} from 'zod';
import {database} from './database';
import {requireAccess,type WorkspaceAccess} from './access';
import {ApiError,canonical,sha,type Env} from './common';
import registry from '../../plugins/bytesskills-core/skills/bytes/contracts/runtime.json';
export const browseSchema=z.object({text:z.string().max(300).default(''),type:z.enum(['',...registry.artifact_types] as [string,...string[]]).default(''),status:z.enum(['','all',...registry.statuses] as [string,...string[]]).default(''),format:z.string().max(100).default(''),sort:z.enum(['updated','newest','oldest','title']).default('updated'),runs:z.boolean().default(false),cursor:z.string().max(4000).optional(),limit:z.number().int().min(1).max(100).default(30)}).strict();
export async function browseArtifacts(env:Env,access:WorkspaceAccess,raw:unknown){
 requireAccess(access);const parsed=browseSchema.safeParse(raw);if(!parsed.success)throw new ApiError(400,'Invalid artifact filters');const q=parsed.data;
 const db=database(env,access),{cursor,limit,...filters}=q,filterHash=await sha(canonical(filters));
 const where=['h.workspace_id=?'],args:unknown[]=[access.workspaceId];
 for(const field of ['type','format'] as const)if(q[field]){where.push(`h.${field}=?`);args.push(q[field]);}
 if(q.status&&q.status!=='all'){where.push('h.status=?');args.push(q.status);}else if(!q.status)where.push("h.status!='archived'");
 if(!q.runs&&q.type!=='run')where.push("h.type!='run'");
 if(q.text){where.push("h.id IN (SELECT id FROM search_documents WHERE workspace_id=h.workspace_id AND document @@ plainto_tsquery('simple',?))");args.push(q.text);}
 // Normalize dates before sorting; creation belongs to revision one, not the latest revision.
 const created="r.record::jsonb->>'created_at'";
 const dateKey=(expression:string)=>`to_char((${expression})::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"')`;
 const key=q.sort==='title'?'lower(h.title) COLLATE "C"':dateKey(q.sort==='updated'?'h.updated':created);
 const desc=q.sort==='updated'||q.sort==='newest';let after='';
 if(cursor){let c;try{c=JSON.parse(cursor);}catch{throw new ApiError(400,'Invalid page cursor');}
  const valid=z.object({hash:z.literal(filterHash),key:z.string().max(500),id:z.string().uuid()}).strict().safeParse(c);
  if(!valid.success)throw new ApiError(400,'Filters changed; start from the first page');
  after=`WHERE (sort_key ${desc?'<':'>'} ? OR (sort_key=? AND id>?))`;args.push(c.key,c.key,c.id);
 }
 const rows=(await db.prepare(`WITH matches AS (SELECT h.*,${created} AS created,${key} AS sort_key FROM heads h JOIN revisions r ON r.workspace_id=h.workspace_id AND r.id=h.id AND r.revision=1 WHERE ${where.join(' AND ')}) SELECT * FROM matches ${after} ORDER BY sort_key ${desc?'DESC':'ASC'},id ASC LIMIT ?`).bind(...args,limit+1).all<{id:string;pointer:string;title:string;type:string;status:string;format:string|null;updated:string;created:string;sort_key:string}>()).results;
 const last=rows[limit-1];return {items:rows.slice(0,limit),next:rows.length>limit?JSON.stringify({hash:filterHash,key:last.sort_key,id:last.id}):null,filters:q};
}
export async function artifactFormats(env:Env,access:WorkspaceAccess){requireAccess(access);return (await database(env,access).prepare("SELECT DISTINCT format FROM heads WHERE workspace_id=? AND format IS NOT NULL AND format<>'' ORDER BY format").bind(access.workspaceId).all<{format:string}>()).results.map(r=>r.format);}
