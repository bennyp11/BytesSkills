import { createHash } from 'node:crypto';
import { database, type Database } from './database';
import { requireAccess, type WorkspaceAccess } from './access';
import { ApiError, type Env } from './common';
import { Store } from './store';

export const MEDIA_UPLOAD_LIMIT = 1_073_741_824;
export const MEDIA_UPLOAD_PART_BYTES = 16 * 1024 * 1024;
const MAX_PARTS = 64;
const SESSION_HOURS = 24;
const mediaTypes = new Set([
  'image/jpeg', 'image/png', 'image/webp',
  'video/mp4', 'video/webm', 'video/quicktime',
]);
const chatFileHosts = new Set(['files.oaiusercontent.com']);
const chatFileHostAllowed = (hostname:string) => chatFileHosts.has(hostname.toLowerCase());
export function validateChatFileUrl(value:string) {
  let url:URL;
  try { url=new URL(value); } catch { throw uploadFailure(400,'ChatGPT supplied an invalid file URL'); }
  if(url.protocol!=='https:'||url.username||url.password||url.port||url.hash||!chatFileHostAllowed(url.hostname))
    throw uploadFailure(400,'The attached file URL is not from an approved ChatGPT file host');
  return url;
}
type Upload = {
  id:string; request_id:string; staging_key:string; r2_upload_id:string;
  title:string; media_type:string; bytes:number; chunk_size:number; status:string;
  sha256:string|null; content_key:string|null; pointer:string|null;
};
const uuid = (s:string) => /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(s);
const uploadFailure = (status:number,message:string)=>new ApiError(status,message);

function safeTitle(value:string) {
  const title=value.replace(/[\\/\u0000-\u001f\u007f]/g,' ').trim().slice(0,500);
  return title || 'Uploaded media';
}

function checkSignature(type:string, bytes:Uint8Array) {
  const ascii=(start:number,end:number)=>String.fromCharCode(...bytes.slice(start,end));
  const valid = type==='image/png'
    ? bytes.length>=8 && bytes[0]===0x89 && ascii(1,4)==='PNG' && bytes[4]===0x0d && bytes[5]===0x0a && bytes[6]===0x1a && bytes[7]===0x0a
    : type==='image/jpeg'
      ? bytes.length>=3 && bytes[0]===0xff && bytes[1]===0xd8 && bytes[2]===0xff
      : type==='image/webp'
        ? bytes.length>=12 && ascii(0,4)==='RIFF' && ascii(8,12)==='WEBP'
        : type==='video/webm'
          ? bytes.length>=4 && bytes[0]===0x1a && bytes[1]===0x45 && bytes[2]===0xdf && bytes[3]===0xa3
          : (type==='video/mp4' || type==='video/quicktime')
            ? bytes.length>=12 && ascii(4,8)==='ftyp' && (type!=='video/quicktime' || ascii(8,12)==='qt  ')
            : false;
  if(!valid) throw uploadFailure(415,'The file contents do not match the selected image or video type');
}

export class MediaUploads {
  private db:Database;
  constructor(private env:Env,private access:WorkspaceAccess,private fetcher:typeof fetch=fetch) {
    requireAccess(access);this.db=database(env,access);
  }
  private scopedKey(key:string){return `${this.access.workspaceId}/${key}`;}
  private async get(id:string) {
    if(!uuid(id)) throw uploadFailure(404,'Upload not found');
    const row=await this.db.prepare(`SELECT id,request_id,staging_key,r2_upload_id,title,media_type,
      bytes::bigint AS bytes,chunk_size,status,sha256,content_key,pointer
      FROM media_uploads WHERE workspace_id=? AND id=? AND expires_at>now()`)
      .bind(this.access.workspaceId,id).first<Upload>();
    if(!row)throw uploadFailure(404,'Upload not found');
    return {...row,bytes:Number(row.bytes)};
  }
  async inspect(id:string) {
    const upload=await this.get(id);
    const parts=await this.db.prepare(`SELECT part_number,sha256 FROM media_upload_parts WHERE workspace_id=? AND upload_id=? ORDER BY part_number`)
      .bind(this.access.workspaceId,id).all<{part_number:number;sha256:string}>();
    return {upload_id:id,status:upload.status,bytes:upload.bytes,part_size:upload.chunk_size,
      parts:Math.ceil(upload.bytes/upload.chunk_size),received:parts.results.map(p=>({part:p.part_number,sha256:p.sha256})),
      ...(upload.pointer?{pointer:upload.pointer,artifact_url:`/app/artifact?pointer=${encodeURIComponent(upload.pointer)}`}:{})};
  }
  async begin(input:{title?:unknown;media_type?:unknown;bytes?:unknown;request_id?:unknown}) {
    const type=typeof input.media_type==='string'?input.media_type:'';
    const bytes=typeof input.bytes==='number'?input.bytes:Number(input.bytes);
    if(!mediaTypes.has(type))throw uploadFailure(415,'Choose a JPEG, PNG, or WebP image, or an MP4, WebM, or MOV video');
    if(!Number.isSafeInteger(bytes)||bytes<1||bytes>MEDIA_UPLOAD_LIMIT)
      throw uploadFailure(413,'Files must be between 1 byte and 1 GiB');
    const parts=Math.ceil(bytes/MEDIA_UPLOAD_PART_BYTES);
    if(parts<1||parts>MAX_PARTS)throw uploadFailure(413,'File exceeds the multipart upload limit');
    const expired=await this.db.prepare(`SELECT id,staging_key,r2_upload_id FROM media_uploads WHERE workspace_id=? AND expires_at<now() LIMIT 50`)
      .bind(this.access.workspaceId).all<{id:string;staging_key:string;r2_upload_id:string}>();
    for(const old of expired.results){
      await this.env.BLOBS.resumeMultipartUpload(old.staging_key,old.r2_upload_id).abort().catch(()=>{});
      await this.env.BLOBS.delete(old.staging_key).catch(()=>{});
    }
    if(expired.results.length)await this.db.prepare(`DELETE FROM media_uploads WHERE workspace_id=? AND id IN (${expired.results.map(()=>'?').join(',')})`)
      .bind(this.access.workspaceId,...expired.results.map(row=>row.id)).run();
    const requestId=typeof input.request_id==='string'?input.request_id:crypto.randomUUID();
    if(!uuid(requestId))throw uploadFailure(400,'A valid upload request_id is required');
    const title=safeTitle(typeof input.title==='string'?input.title:'');
    const existing=await this.db.prepare(`SELECT id,request_id,title,media_type,bytes::bigint AS bytes,status,pointer
      FROM media_uploads WHERE workspace_id=? AND request_id=?`).bind(this.access.workspaceId,requestId).first<Upload>();
    if(existing){
      if(existing.title!==title||existing.media_type!==type||Number(existing.bytes)!==bytes)
        throw uploadFailure(409,'This request_id was already used for a different file; use a new request_id');
      return {upload_id:existing.id,part_size:MEDIA_UPLOAD_PART_BYTES,parts,expires_in_seconds:0,status:existing.status,
        ...(existing.pointer?{pointer:existing.pointer,artifact_url:`/app/artifact?pointer=${encodeURIComponent(existing.pointer)}`}:{})};
    }
    const id=crypto.randomUUID();
    const key=this.scopedKey(`staging/media/${id}`);
    const multipart=await this.env.BLOBS.createMultipartUpload(key,{
      httpMetadata:{contentType:'application/octet-stream'},customMetadata:{purpose:'bytes-media-staging'},
    });
    try{
      await this.db.prepare(`INSERT INTO media_uploads(workspace_id,id,request_id,staging_key,r2_upload_id,title,
        media_type,bytes,chunk_size,status,expires_at) VALUES(?,?,?,?,?,?,?,?,?,'receiving',now()+interval '${SESSION_HOURS} hours')`)
        .bind(this.access.workspaceId,id,requestId,key,multipart.uploadId,title,type,bytes,MEDIA_UPLOAD_PART_BYTES).run();
    }catch(error){await multipart.abort().catch(()=>{});throw error;}
    return {upload_id:id,part_size:MEDIA_UPLOAD_PART_BYTES,parts,expires_in_seconds:SESSION_HOURS*3600,status:'receiving'};
  }
  async importChatFile(input:{file:{download_url:string;file_id:string;mime_type?:string;file_name?:string};title?:string;request_id:string;workflow_id:string},provenanceFor:(artifactType:'image'|'video')=>Promise<unknown>) {
    const url=validateChatFileUrl(input.file.download_url);
    if(!/^[A-Za-z0-9_-]{1,256}$/.test(input.file.file_id))throw uploadFailure(400,'ChatGPT file_id is invalid');
    let response:Response;
    try{response=await this.fetcher(url,{method:'GET',redirect:'error'});}
    catch{throw uploadFailure(502,'Could not retrieve the ChatGPT attachment; reattach it and retry');}
    const rejectResponse=async(status:number,message:string):Promise<never>=>{await response.body?.cancel().catch(()=>{});throw uploadFailure(status,message);};
    if(!response.ok)await rejectResponse(502,'Could not retrieve the ChatGPT attachment; reattach it and retry');
    if(response.url&&new URL(response.url).origin!==url.origin)await rejectResponse(502,'ChatGPT redirected the file request; reattach the file and retry');
    const encoding=response.headers.get('content-encoding');
    if(encoding&&encoding!=='identity')await rejectResponse(415,'The ChatGPT file response used an unsupported encoding');
    const lengthHeader=response.headers.get('content-length');
    if(!lengthHeader||!/^[1-9]\d*$/.test(lengthHeader))await rejectResponse(411,'The ChatGPT attachment did not include a usable file size; upload it on the Bytes web app instead');
    const bytes=Number(lengthHeader);
    if(!Number.isSafeInteger(bytes)||bytes>MEDIA_UPLOAD_LIMIT)await rejectResponse(413,'ChatGPT attachment exceeds the Bytes 1 GiB upload limit; use the Bytes web uploader if supported by your account');
    const allowedType=(value:string|undefined)=>typeof value==='string'&&mediaTypes.has(value.toLowerCase().split(';')[0].trim())?value.toLowerCase().split(';')[0].trim():undefined;
    const extensionType:Record<string,string>={jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',mp4:'video/mp4',webm:'video/webm',mov:'video/quicktime'};
    const extension=input.file.file_name?.split('.').at(-1)?.toLowerCase();
    const mediaType=allowedType(input.file.mime_type)||allowedType(response.headers.get('content-type')??undefined)||(extension?extensionType[extension]:undefined);
    if(!mediaType){await response.body?.cancel().catch(()=>{});throw uploadFailure(415,'Attach a JPEG, PNG, WebP, MP4, WebM, or MOV file');}
    const artifactType=mediaType.startsWith('image/')?'image':'video';
    const skillRelease=await provenanceFor(artifactType);
    const title=safeTitle(input.title||input.file.file_name||'Uploaded media');
    const started=await this.begin({request_id:input.request_id,title,media_type:mediaType,bytes});
    if(!response.body)throw uploadFailure(502,'ChatGPT returned an empty attachment; reattach the file and retry');
    const received=new Map((await this.inspect(started.upload_id)).received.map((part:{part:number;sha256:string})=>[part.part,part.sha256]));
    const reader=response.body.getReader();let current:Uint8Array|undefined,offset=0;
    const readExact=async(size:number)=>{
      const chunk=new Uint8Array(size);let at=0;
      while(at<size){
        if(!current||offset===current.length){const next=await reader.read();if(next.done)throw uploadFailure(400,'ChatGPT attachment ended before its declared size');current=next.value;offset=0;}
        const available=current!;
        const n=Math.min(size-at,available.length-offset);chunk.set(available.subarray(offset,offset+n),at);at+=n;offset+=n;
      }
      return chunk;
    };
    try{
      const csrf=crypto.randomUUID(),parts=Math.ceil(bytes/MEDIA_UPLOAD_PART_BYTES);
      for(let number=1;number<=parts;number++){
        const size=number===parts?bytes-MEDIA_UPLOAD_PART_BYTES*(parts-1):MEDIA_UPLOAD_PART_BYTES;
        const chunk=await readExact(size),hash=createHash('sha256').update(chunk).digest('hex');
        if(started.status==='saved'){
          if(received.get(number)!==hash)throw uploadFailure(409,'This request_id belongs to a different file; use a new request_id');
          continue;
        }
        if(received.get(number)===hash)continue;
        const req=new Request('https://bytes.internal/upload',{method:'PUT',headers:{'Content-Length':String(size),'Content-Type':'application/octet-stream','X-Bytes-CSRF':csrf,'X-Bytes-Part-SHA256':hash},body:new Blob([chunk])});
        await this.putPart(req,started.upload_id,number,csrf);
      }
      if(current&&offset<current.length)throw uploadFailure(413,'ChatGPT attachment exceeded its declared size');
      const trailing=await reader.read();if(!trailing.done&&trailing.value.byteLength)throw uploadFailure(413,'ChatGPT attachment exceeded its declared size');
      if(started.status==='saved'&&started.pointer)return {pointer:started.pointer,artifact_url:started.artifact_url??`/app/artifact?pointer=${encodeURIComponent(started.pointer)}`};
      return await this.complete(started.upload_id,input.workflow_id,skillRelease);
    }catch(error){await reader.cancel().catch(()=>{});throw error;}
  }
  async putPart(req:Request,id:string,partNumber:number,csrf:string) {
    if(req.headers.get('X-Bytes-CSRF')!==csrf)throw uploadFailure(403,'Invalid session confirmation');
    const upload=await this.get(id);
    if(upload.status!=='receiving')throw uploadFailure(409,'This upload is no longer accepting parts');
    const totalParts=Math.ceil(upload.bytes/upload.chunk_size);
    if(!Number.isInteger(partNumber)||partNumber<1||partNumber>totalParts)throw uploadFailure(400,'Invalid part number');
    const expected=partNumber===totalParts?upload.bytes-upload.chunk_size*(totalParts-1):upload.chunk_size;
    const expectedHash=req.headers.get('X-Bytes-Part-SHA256')??'';
    if(!/^[a-f0-9]{64}$/.test(expectedHash))throw uploadFailure(400,'Upload part checksum required');
    const declaredLength=req.headers.get('Content-Length');
    if(req.headers.get('Content-Type')!=='application/octet-stream'||(declaredLength!==null&&Number(declaredLength)!==expected))
      throw uploadFailure(400,'Upload part has the wrong content type or size');
    if(!req.body)throw uploadFailure(400,'Upload part body required');
    let size=0;const digest=createHash('sha256');
    const limited=req.body.pipeThrough(new TransformStream<Uint8Array,Uint8Array>({
      transform(chunk,controller){size+=chunk.byteLength;if(size>expected)throw uploadFailure(413,'Upload part is too large');digest.update(chunk);controller.enqueue(chunk);},
      flush(){if(size!==expected)throw uploadFailure(400,'Upload part ended before its declared size');},
    }));
    const multipart=this.env.BLOBS.resumeMultipartUpload(upload.staging_key,upload.r2_upload_id);
    const part=await multipart.uploadPart(partNumber,limited);
    const actualHash=digest.digest('hex');
    if(actualHash!==expectedHash)throw uploadFailure(409,'Upload part checksum did not match; retry this part');
    await this.db.prepare(`INSERT INTO media_upload_parts(workspace_id,upload_id,part_number,etag,sha256,bytes)
      VALUES(?,?,?,?,?,?) ON CONFLICT(workspace_id,upload_id,part_number) DO UPDATE SET etag=excluded.etag,sha256=excluded.sha256,bytes=excluded.bytes,updated_at=now()`)
      .bind(this.access.workspaceId,id,partNumber,part.etag,actualHash,size).run();
    return {part:partNumber,bytes:size};
  }
  private async hashObject(key:string,expectedBytes:number,mediaType:string) {
    const object=await this.env.BLOBS.get(key);
    if(!object)throw uploadFailure(409,'Uploaded media is not available to verify yet');
    if(object.size!==expectedBytes)throw uploadFailure(409,'Uploaded media size did not match');
    const hash=createHash('sha256'),reader=object.body.getReader();let total=0;
    const prefix=new Uint8Array(16);let prefixSize=0;
    try{while(true){const {done,value}=await reader.read();if(done)break;
      total+=value.byteLength;if(total>expectedBytes)throw uploadFailure(413,'Uploaded media exceeded its declared size');
      if(prefixSize<prefix.length){const n=Math.min(prefix.length-prefixSize,value.length);prefix.set(value.subarray(0,n),prefixSize);prefixSize+=n;}
      hash.update(value);
    }}finally{reader.releaseLock();}
    if(total!==expectedBytes)throw uploadFailure(409,'Uploaded media size did not match');
    checkSignature(mediaType,prefix.subarray(0,prefixSize));
    return hash.digest('hex');
  }
  private async promote(stagingKey:string,contentKey:string,sha256:string,bytes:number,mediaType:string) {
    const finalKey=this.scopedKey(contentKey);
    const existing=await this.env.BLOBS.head(finalKey);
    if(existing){if(existing.size!==bytes||existing.customMetadata?.sha256!==sha256)throw uploadFailure(409,'Stored content address did not verify');return;}
    const staging=await this.env.BLOBS.get(stagingKey);
    if(!staging)throw uploadFailure(409,'Upload expired before it could be saved');
    const saved=await this.env.BLOBS.put(finalKey,staging.body,{
      sha256,httpMetadata:{contentType:'application/octet-stream'},customMetadata:{sha256,media_type:mediaType,bytes:String(bytes)},
      onlyIf:{etagDoesNotMatch:'*'},
    });
    if(!saved){
      const raced=await this.env.BLOBS.head(finalKey);
      if(!raced||raced.size!==bytes||raced.customMetadata?.sha256!==sha256)throw uploadFailure(409,'Stored content address did not verify');
    }
  }
  async complete(id:string,workflowId?:string,skillRelease?:unknown) {
    const upload=await this.get(id);
    if(upload.status==='saved'&&upload.pointer)return {pointer:upload.pointer,artifact_url:`/app/artifact?pointer=${encodeURIComponent(upload.pointer)}`};
    if(upload.status==='aborted')throw uploadFailure(409,'This upload was cancelled');
    if(upload.status==='receiving'){
      const result=await this.db.prepare(`UPDATE media_uploads SET status='completing' WHERE workspace_id=? AND id=? AND status='receiving'`).bind(this.access.workspaceId,id).run();
      if((result as {meta?:{changes?:number}})?.meta?.changes===0)throw uploadFailure(409,'This upload is already completing; retry shortly');
    }
    const latest=await this.get(id);
    if(latest.status==='saved'&&latest.pointer)return {pointer:latest.pointer,artifact_url:`/app/artifact?pointer=${encodeURIComponent(latest.pointer)}`};
    const rows=await this.db.prepare(`SELECT part_number,etag,bytes FROM media_upload_parts WHERE workspace_id=? AND upload_id=? ORDER BY part_number`)
      .bind(this.access.workspaceId,id).all<{part_number:number;etag:string;bytes:number}>();
    const expectedParts=Math.ceil(upload.bytes/upload.chunk_size);
    if(rows.results.length!==expectedParts)throw uploadFailure(409,'Upload is incomplete; finish sending every part before saving');
    const parts=rows.results.map((p,i)=>{
      const n=i+1,size=n===expectedParts?upload.bytes-upload.chunk_size*(expectedParts-1):upload.chunk_size;
      if(p.part_number!==n||p.bytes!==size)throw uploadFailure(409,'Upload parts are missing or have the wrong size');
      return {partNumber:n,etag:p.etag};
    });
    const stagingKey=upload.staging_key;
    if(!await this.env.BLOBS.head(stagingKey)){
      try{await this.env.BLOBS.resumeMultipartUpload(stagingKey,upload.r2_upload_id).complete(parts);}
      catch(error){if(!await this.env.BLOBS.head(stagingKey))throw uploadFailure(409,'Multipart upload expired or is already being finalized; retry shortly');}
    }
    let sha256:string;
    try{sha256=await this.hashObject(stagingKey,upload.bytes,upload.media_type);}
    catch(error){if(error instanceof ApiError&&error.status===415){await this.db.prepare(`UPDATE media_uploads SET status='aborted' WHERE workspace_id=? AND id=?`).bind(this.access.workspaceId,id).run();await this.env.BLOBS.delete(stagingKey).catch(()=>{});}throw error;}
    const contentKey=`blobs/sha256/${sha256.slice(0,2)}/${sha256}`;
    await this.promote(stagingKey,contentKey,sha256,upload.bytes,upload.media_type);
    const artifact=await new Store(this.env,this.access).save({request_id:upload.request_id,type:upload.media_type.startsWith('image/')?'image':'video',title:upload.title,content:{key:contentKey,sha256,bytes:upload.bytes,media_type:upload.media_type},...(skillRelease?{provenance:{skill_release:skillRelease}}:{})},workflowId);
    await this.db.prepare(`UPDATE media_uploads SET status='saved',sha256=?,content_key=?,pointer=? WHERE workspace_id=? AND id=?`)
      .bind(sha256,contentKey,artifact.pointer,this.access.workspaceId,id).run();
    await this.env.BLOBS.delete(stagingKey).catch(()=>{});
    return {pointer:artifact.pointer,artifact_url:`/app/artifact?pointer=${encodeURIComponent(artifact.pointer)}`};
  }
  async abort(id:string) {
    const upload=await this.get(id);
    if(upload.status==='saved')throw uploadFailure(409,'A saved artifact cannot be cancelled');
    if(upload.status==='aborted')return {aborted:true};
    await this.env.BLOBS.resumeMultipartUpload(upload.staging_key,upload.r2_upload_id).abort().catch(()=>{});
    await this.env.BLOBS.delete(upload.staging_key).catch(()=>{});
    await this.db.prepare(`UPDATE media_uploads SET status='aborted' WHERE workspace_id=? AND id=? AND status<>'saved'`).bind(this.access.workspaceId,id).run();
    return {aborted:true};
  }
}
