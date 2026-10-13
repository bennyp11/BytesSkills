// No application database, OAuth, storage or deployment credentials in this Worker.
export default {async fetch(req:Request,env:any){
 if(req.method!=='POST'||new URL(req.url).pathname!=='/notify')return new Response('',{status:404});
 const raw=req.headers.get('Authorization')??'';
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw))),x=>x.toString(16).padStart(2,'0')).join('');
 if(digest!==env.NOTIFY_KEY_SHA256)return new Response('',{status:401});
 if(Number(req.headers.get('Content-Length'))>2000)return new Response('',{status:413});
 let data:any;try{const text=await req.text();if(text.length>2000)return new Response('',{status:413});data=JSON.parse(text);}catch{return new Response('',{status:400});}
 if(!/^\d{1,20}$/.test(data.run_id)||!/^\d{1,5}$/.test(data.attempt)||!data.results)return new Response('',{status:400});
 const names=['check','library','postgres'],allowed=['success','failure','cancelled','skipped'];
 if(!names.every(n=>allowed.includes(data.results[n])))return new Response('',{status:400});
 const ok=names.every(n=>data.results[n]==='success');
 await env.EMAIL.send({from:env.EMAIL_FROM,to:env.EMAIL_TO,subject:`BytesSkills CI: ${ok?'passed':'needs attention'}`,text:`Test run ${data.run_id}, attempt ${data.attempt}\n\n${names.map(n=>n+': '+data.results[n]).join('\n')}\n\nhttps://github.com/bennyp11/BytesSkills/actions/runs/${data.run_id}\n\nThis is a test report, not a login link.`});
 return new Response('Accepted',{status:202});
}};
