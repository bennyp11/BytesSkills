import { createHash } from 'node:crypto';
import { ApiError } from './common';

/** Preserve the exact byte length required by the R2 binding while hashing. */
export async function uploadVerifiedPart(multipart:R2MultipartUpload,partNumber:number,body:ReadableStream<Uint8Array>,expected:number) {
  let size=0;const digest=createHash('sha256');
  const checked=body.pipeThrough(new TransformStream<Uint8Array,Uint8Array>({
    transform(chunk,controller){size+=chunk.byteLength;if(size>expected)throw new ApiError(413,'Upload part is too large');digest.update(chunk);controller.enqueue(chunk);},
    flush(){if(size!==expected)throw new ApiError(400,'Upload part ended before its declared size');},
  }));
  const fixed=new FixedLengthStream(expected),abort=new AbortController();
  try {
    const [,part]=await Promise.all([
      checked.pipeTo(fixed.writable,{signal:abort.signal}),
      multipart.uploadPart(partNumber,fixed.readable),
    ]);
    return {part,sha256:digest.digest('hex'),size};
  } finally { abort.abort(); }
}
