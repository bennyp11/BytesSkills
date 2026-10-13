// Test-only principal injection; never included in production entry points.
import {mcp} from '../../src/mcp';
import {WorkspaceAccess} from '../../src/access';
export default {async fetch(req:Request,env:any){
 const access=await WorkspaceAccess.authorize(env,req.headers.get('test-account')!,req.headers.get('test-workspace')!);
 return mcp(req,env,(req.headers.get('test-scopes')??'bytes:read').split(' '),access);
}};
