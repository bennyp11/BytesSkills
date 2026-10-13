import { AsyncLocalStorage } from 'node:async_hooks';

// Fixed labels only: never accept SQL, pointers, URLs, identities or error messages.
type Stage = 'request_body' | 'oauth' | 'membership' | 'tool' | 'db_connect' |
  'db_setup' | 'db_query' | 'db_commit' | 'db_rollback' | 'db_close' |
  'blob_get' | 'blob_read' | 'blob_put' | 'blob_head';
type Trace = { id:string; started:number; method:string; tool:string; error:number|null;
  stages:Partial<Record<Stage,{ms:number;count:number}>>; oauthStarted?:number };
const context = new AsyncLocalStorage<Trace>();
const tools = new Set(['workspace','help','library','begin','updates','adopt','publish','get',
  'query','history','related','save','author','definition_source'].map(n=>'bytes_'+n));
const methods = new Set(['initialize','notifications/initialized','tools/list','tools/call','ping',
  'resources/list','resources/read','prompts/list']);
const elapsed = (start:number) => Math.round((performance.now()-start)*100)/100;
function add(trace:Trace, stage:Stage, ms:number) {
  const entry=trace.stages[stage]??={ms:0,count:0};
  entry.ms=Math.round((entry.ms+ms)*100)/100; entry.count++;
}
export async function timed<T>(stage:Stage, fn:()=>Promise<T>):Promise<T> {
  const trace=context.getStore(); if(!trace)return fn();
  const start=performance.now(); try{return await fn();}finally{add(trace,stage,elapsed(start));}
}
export function identifyRpc(body:string) {
  const trace=context.getStore(); if(!trace)return;
  try { const rpc=JSON.parse(body); trace.method=methods.has(rpc?.method)?rpc.method:'other';
    trace.tool=rpc?.method==='tools/call'&&tools.has(rpc?.params?.name)?rpc.params.name:'none';
  } catch { trace.method='invalid'; }
}
export function oauthStarted() { const t=context.getStore();if(t)t.oauthStarted=performance.now(); }
export function oauthAccepted() { const t=context.getStore();if(t&&t.oauthStarted!==undefined){
  add(t,'oauth',elapsed(t.oauthStarted));delete t.oauthStarted;
} }
export function toolError(status:number) { const t=context.getStore();if(t)t.error=status; }
export function requestId() { return context.getStore()?.id; }

/** Response-ready time, not delivery/client/model time. One bounded event per MCP HTTP request. */
export async function observeMcp(req:Request, release:string|undefined, fn:()=>Promise<Response>,
  emit:(event:unknown)=>void=event=>console.log(JSON.stringify(event))):Promise<Response> {
  if(new URL(req.url).pathname!=='/mcp')return fn();
  const trace:Trace={id:crypto.randomUUID(),started:performance.now(),method:'unknown',tool:'none',error:null,stages:{}};
  return context.run(trace,async()=>{
    let status=500;
    try {
      const response=await fn();status=response.status;
      const headers=new Headers(response.headers);
      headers.set('X-Bytes-Request-Id',trace.id);
      headers.set('Server-Timing',`bytes;dur=${elapsed(trace.started)}`);
      return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
    } finally {
      if(trace.oauthStarted!==undefined)add(trace,'oauth',elapsed(trace.oauthStarted));
      const duration=elapsed(trace.started);
      // Logging must never change the request outcome, even if the sink fails.
      try{emit({event:'bytes.mcp_request',schema:1,request_id:trace.id,
        release:release&&/^\d+\.\d+\.\d+$/.test(release)?release:'unknown',
        rpc_method:trace.method,tool:trace.tool,http_status:status,tool_error_status:trace.error,
        duration_ms:duration,slow:duration>=2000,stages:trace.stages});}catch{}
    }
  });
}
