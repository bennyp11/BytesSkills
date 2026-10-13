import {z} from 'zod';
import {database} from './database';
import {requireAccess,type WorkspaceAccess} from './access';
import {ApiError,canonical,sha,type Env} from './common';
const schema=z.object({id:z.string().uuid(),title:z.string().trim().min(1).max(200),summary:z.string().trim().min(1).max(2000),instructions:z.string().trim().min(1).max(50000)}).strict();
export class PrivateSkills {
 private db;
 constructor(env:Env,private access:WorkspaceAccess){requireAccess(access);this.db=database(env,access);}
 async get(id:string){
  if(!z.string().uuid().safeParse(id).success)throw new ApiError(404,'Skill not found');
  const r=await this.db.prepare('SELECT * FROM private_skills WHERE workspace_id=? AND id=? AND revision=1').bind(this.access.workspaceId,id).first<{id:string;title:string;summary:string;instructions:string;checksum:string;revision:number}>();
  if(!r)throw new ApiError(404,'Skill not found');return r;
 }
 async list(after=''){
  if(after&&!z.string().uuid().safeParse(after).success)throw new ApiError(400,'Invalid cursor');
  const r=await this.db.prepare('SELECT id,title,summary,revision FROM private_skills WHERE workspace_id=? AND id>? ORDER BY id LIMIT 101').bind(this.access.workspaceId,after).all<{id:string;title:string;summary:string;revision:number}>();
  return {items:r.results.slice(0,100),next:r.results.length>100?r.results[99].id:null};
 }
 async create(raw:unknown){
  const parsed=schema.safeParse(raw);if(!parsed.success)throw new ApiError(400,'Enter a name, description, and instructions within the displayed limits.');
  const s=parsed.data,checksum=await sha(canonical(s));
  await this.db.prepare('INSERT INTO private_skills(workspace_id,id,revision,title,summary,instructions,checksum) VALUES(?,?,1,?,?,?,?) ON CONFLICT(workspace_id,id,revision) DO NOTHING').bind(this.access.workspaceId,s.id,s.title,s.summary,s.instructions,checksum).run();
  const saved=await this.get(s.id);if(saved.checksum!==checksum)throw new ApiError(409,'This form was already saved with different content. Start a new skill.');return saved;
 }
}
