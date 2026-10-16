// Static browser code. File bytes move directly from the browser to the
// authenticated same-origin part route; they are never base64 encoded.
export const mediaUploadScript = `(() => {
 const form=document.getElementById('media-upload-form');if(!form)return;
 const fileInput=document.getElementById('media-file');
 const title=document.getElementById('media-title');
 const status=document.getElementById('media-upload-status');
 const progress=document.getElementById('media-upload-progress');
 const button=document.getElementById('media-upload-submit');
 const csrf=form.dataset.csrf,sessionKey='bytes-media-upload-v1';
 const mediaType=file=>file.type==='application/x-zip-compressed'?'application/zip':file.type||(/\.zip$/i.test(file.name)?'application/zip':'');
 const partHash=async blob=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),value=>value.toString(16).padStart(2,'0')).join('');
 fileInput.addEventListener('change',()=>{if(fileInput.files[0]&&!title.value)title.value=fileInput.files[0].name;});
 form.addEventListener('submit',async event=>{
  event.preventDefault();const file=fileInput.files[0];if(!file){status.textContent='Choose an image, video, or ZIP archive first.';return;}
  button.disabled=true;fileInput.disabled=true;title.disabled=true;progress.value=0;
  const check=async response=>{const data=await response.json();if(!response.ok){const error=Error(data.error||'Upload request failed');error.status=response.status;throw error;}return data;};
  const post=async(path,body)=>check(await fetch(path,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(body)}));
  try{
   status.textContent='Preparing secure upload…';
  const identity={name:file.name,size:file.size,type:mediaType(file),lastModified:file.lastModified,title:title.value};
   let saved=sessionStorage.getItem(sessionKey),start=null;
   if(saved){try{const previous=JSON.parse(saved);if(previous.name===identity.name&&previous.size===identity.size&&previous.type===identity.type&&previous.lastModified===identity.lastModified){const response=await fetch('/app/upload/'+encodeURIComponent(previous.upload_id),{credentials:'same-origin',cache:'no-store'});if(response.ok){start=await response.json();identity.title=previous.title;title.value=previous.title;}else sessionStorage.removeItem(sessionKey);}else sessionStorage.removeItem(sessionKey);}catch{sessionStorage.removeItem(sessionKey);}}
   if(start&&start.status!=='aborted'){for(const received of start.received||[]){const from=(received.part-1)*start.part_size,to=Math.min(file.size,received.part*start.part_size);if(from<0||to<=from||await partHash(file.slice(from,to))!==received.sha256){if(start.status!=='saved')await fetch('/app/upload/'+encodeURIComponent(start.upload_id)+'/abort',{method:'DELETE',credentials:'same-origin',headers:{'X-Bytes-CSRF':csrf}}).catch(()=>{});sessionStorage.removeItem(sessionKey);start=null;break;}}}
   if(start?.status==='aborted'){sessionStorage.removeItem(sessionKey);start=null;}
   if(start?.status==='saved'&&start.pointer){const link=document.createElement('a');link.href='/app/artifact?pointer='+encodeURIComponent(start.pointer);link.textContent='Open '+identity.title;status.replaceChildren(document.createTextNode('Already saved. '),link);progress.value=100;return;}
   if(!start){start=await post('/app/upload',{csrf,title:identity.title,media_type:identity.type,bytes:String(file.size)});sessionStorage.setItem(sessionKey,JSON.stringify({...identity,upload_id:start.upload_id}));}
   const done=new Set((start.received||[]).map(receipt=>receipt.part));let completed=0;
   const putPart=async part=>{const from=(part-1)*start.part_size,to=Math.min(file.size,part*start.part_size),blob=file.slice(from,to),sha256=await partHash(blob);await check(await fetch('/app/upload/'+encodeURIComponent(start.upload_id)+'/part/'+part,{method:'PUT',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/octet-stream','X-Bytes-CSRF':csrf,'X-Bytes-Part-SHA256':sha256},body:blob}));completed+=to-from;progress.value=(doneBytes+completed)/file.size*90;};
   if(start.status==='aborted')throw Error('This upload was cancelled. Start a new upload.');
   const doneBytes=[...done].reduce((sum,part)=>sum+Math.min(start.part_size,file.size-(part-1)*start.part_size),0);progress.value=doneBytes/file.size*90;let completedParts=0;
   const todo=Array.from({length:start.parts},(_,i)=>i+1).filter(part=>!done.has(part));
   let cursor=0;status.textContent='Uploading '+(done.size+completedParts)+' of '+start.parts+' parts…';await Promise.all(Array.from({length:Math.min(3,todo.length)},async()=>{while(cursor<todo.length){const part=todo[cursor++];await putPart(part);completedParts++;status.textContent='Uploading '+(done.size+completedParts)+' of '+start.parts+' parts…';}}));
   status.textContent='Verifying and saving the artifact…';
   const artifact=await post('/app/upload/'+encodeURIComponent(start.upload_id)+'/complete',{csrf});progress.value=100;sessionStorage.removeItem(sessionKey);
   const link=document.createElement('a');link.href='/app/artifact?pointer='+encodeURIComponent(artifact.pointer);link.textContent='Open '+identity.title;status.replaceChildren(document.createTextNode('Saved. '),link);
  }catch(error){if(error?.status===415)sessionStorage.removeItem(sessionKey);status.textContent=(error instanceof Error?error.message:'Upload failed.')+(error?.status===415?' Choose a valid supported image, video, or ZIP file.':' Re-select the same file to resume.');button.disabled=false;fileInput.disabled=false;title.disabled=false;}
 });
})();`;
