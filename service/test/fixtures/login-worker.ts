// CI-only email capture. This file is never deployed or imported by production.
import worker from '../../src/index';
const sent:any[]=[];
export default {async fetch(req:Request,env:any,ctx:any){
 if(new URL(req.url).pathname==='/test/mail')return Response.json(sent.splice(0));
 env.EMAIL={async send(message:any){sent.push(message);}};
 return worker.fetch(req,env,ctx);
}};
