// Static script, enabled only on the artifact listing. Fetches the existing
// authenticated page, preserving its filters and cursor; never bypasses auth.
export const artifactRefreshScript = `(() => {
 const status=document.getElementById('artifact-refresh-status');
 const toggle=document.getElementById('artifact-refresh-toggle');
 if(!status||!toggle)return;
 let timer,controller,busy=false,paused=false,stopped=false,delay=5000;
 const schedule=()=>{clearTimeout(timer);if(!paused&&!stopped&&!document.hidden)timer=setTimeout(check,delay);};
 const localize=root=>root.querySelectorAll('time[datetime]').forEach(node=>{const date=new Date(node.dateTime);if(!Number.isNaN(date.valueOf()))node.textContent=date.toLocaleString(undefined,{year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'});});
 const snapshot=node=>{const clone=node.cloneNode(true);clone.querySelectorAll('time[datetime]').forEach(t=>t.textContent=t.dateTime);return clone.innerHTML;};
 let signature=snapshot(document.getElementById('artifact-results'));
 async function check(){
  if(busy||paused||stopped||document.hidden)return;
  busy=true;controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),15000);
  try{
   const response=await fetch(location.href,{credentials:'same-origin',cache:'no-store',redirect:'error',signal:controller.signal});
   if(response.status===401||response.status===403){stopped=true;status.textContent='Live updates stopped. Reload to sign in or check access.';toggle.disabled=true;return;}
   if(!response.ok)throw Error('refresh failed');
   const page=new DOMParser().parseFromString(await response.text(),'text/html');
   const incoming=page.getElementById('artifact-results'),current=document.getElementById('artifact-results');
   if(!incoming||!current)throw Error('refresh unavailable');
   const next=snapshot(incoming);
   if(next!==signature){
    // Do not remove a focused link/button or a user's text selection.
    if(current.contains(document.activeElement)||String(getSelection()).length){status.textContent='Updated artifacts available. The list will refresh when you finish interacting.';}
    else {current.replaceChildren(...Array.from(incoming.childNodes));signature=next;localize(current);status.textContent='New or updated artifacts available — list refreshed.';}
   }
   else if(delay>5000)status.textContent='Live updates resumed. Checking every 5 seconds.';
   delay=5000;
  }catch(error){
   if(!paused&&!document.hidden){delay=Math.min(delay*2,60000);status.textContent='Live updates unavailable. Retrying; reload if you need to sign in.';}
  }finally{clearTimeout(timeout);busy=false;controller=null;schedule();}
 }
 toggle.addEventListener('click',()=>{paused=!paused;toggle.textContent=paused?'Resume live updates':'Pause live updates';toggle.setAttribute('aria-pressed',String(paused));clearTimeout(timer);if(paused)controller?.abort();status.textContent=paused?'Live updates paused.':'Live updates on. Checking every 5 seconds.';schedule();});
 document.addEventListener('visibilitychange',()=>{clearTimeout(timer);if(document.hidden)controller?.abort();else schedule();});
 window.addEventListener('pagehide',()=>{clearTimeout(timer);controller?.abort();});
 schedule();
})();`;
