export function destination(s:string){
 try {
  const u=new URL(s,'https://return.invalid');
  if(!s.startsWith('/')||s.startsWith('//')||u.origin!=='https://return.invalid'||u.hash||s.length>12000)return '/app';
  if(u.pathname==='/app'||u.pathname==='/app/artifact')return u.pathname+u.search;
  if(s.startsWith('/authorize?')&&u.pathname==='/authorize')return s;
 }catch{}
 return '/app';
}
