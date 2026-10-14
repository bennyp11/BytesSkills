import type {Env} from './common';
import registry from '../../plugins/bytesskills-core/skills/bytes/contracts/runtime.json';
const exactPointer=new RegExp('^@('+registry.artifact_types.join('|')+')/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}:v[1-9][0-9]*$');
export function artifactUrl(env:Pick<Env,'APP_URL'|'BASE_URL'>,pointer:string){
 if(!exactPointer.test(pointer))throw new Error('An exact artifact pointer is required');
 const url=new URL('/app/artifact',env.APP_URL||env.BASE_URL);
 url.searchParams.set('pointer',pointer);return url.toString();
}
// Presentation fields only: never write URLs into immutable records/checksums,
// nor traverse user-controlled definitions, metadata or content.
export function withArtifactLinks(value:unknown,env:Pick<Env,'APP_URL'|'BASE_URL'>):unknown{
 if(!value||typeof value!=='object'||Array.isArray(value)||!(env.APP_URL||env.BASE_URL))return value;
 const row=value as Record<string,unknown>;
 const linked:Record<string,unknown>=typeof row.pointer==='string'&&exactPointer.test(row.pointer)
  ? {...row,web_url:artifactUrl(env,row.pointer)} : {...row};
 if(Array.isArray(row.items))linked.items=row.items.map(item=>withArtifactLinks(item,env));
 return linked;
}
