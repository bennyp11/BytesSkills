// Test-only adapter: trusted principals stand in for provider-verified OAuth claims.
// Never imported by src/index.ts or deployed; request headers below are NOT production auth.
import { WorkspaceAccess } from '../../src/access';
import { provisionVerifiedIdentity } from '../../src/accounts';
import { Store } from '../../src/store';
import { Releases } from '../../src/releases';
import { mcp } from '../../src/mcp';
import { ApiError } from '../../src/common';
export default {async fetch(req:any,env:any) {
  try {
    const path = new URL(req.url).pathname;
    if(path === '/provision') {
      const {issuer,subject} = await req.json();
      return Response.json(await provisionVerifiedIdentity(env,issuer,subject));
    }
    const access=await WorkspaceAccess.authorize(env,req.headers.get('x-test-account'),req.headers.get('x-test-workspace'),
      req.headers.get('x-test-operator')==='true',req.headers.get('x-test-operator')==='true');
    const scopes=(req.headers.get('x-test-scopes')??'bytes:read,bytes:write,bytes:manage').split(',');
    if(path==='/mcp') return mcp(req,env,scopes,access);
    const store=new Store(env,access), releases=new Releases(env,access);
    const {op,args=[]}=await req.json();
    const operations:any={save:()=>store.save(...args as [any, string?]),get:()=>store.get(args[0],true),
      query:()=>store.query(args[0]),history:()=>store.history(args[0]),related:()=>store.related(args[0]),
      export:()=>store.export(...args as [string?,number?,number?]),blob:()=>store.putBlob(new TextEncoder().encode(args[0])),
      objectKey:()=>store.objectKey(args[0]),import:()=>store.importRecord(args[0]),
      updates:()=>releases.updates(),adopt:()=>releases.adopt(args[0],scopes),begin:()=>releases.begin(args[0],scopes),
      provenance:()=>releases.provenance(args[0],scopes),publish:()=>releases.publish(args[0]),revoke:()=>releases.revoke(args[0]),
      forged:()=>new Store(env,{} as any).query({})};
    return Response.json(await operations[op]());
  }catch(e:any){return Response.json({error:e instanceof Error?e.message:'Operation failed'}, {status:e instanceof ApiError?e.status:400});}
}};
