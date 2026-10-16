# Private media uploads

The signed-in web app at `/app/upload` accepts JPEG, PNG, WebP, MP4, WebM, MOV and ZIP
files up to 10 GiB. A successful upload is saved as a regular `image`, `video`, or
downloadable `file` artifact with a stable Bytes pointer, and the artifact list, detail page, download,
history and workspace queries work through the existing artifact system.

The `/bytes upload` MCP operation also accepts one ChatGPT-attached file through
ChatGPT's `openai/fileParams` handoff. It retrieves the short-lived attachment URL
server-side, streams it in the same 16 MiB R2 multipart flow, and creates the same
private artifact record with workflow provenance. The source URL must use the
approved `files.oaiusercontent.com` HTTPS host; redirects, arbitrary URLs, unsupported
types, unknown sizes and files over 10 GiB are rejected. ZIP archives are signature-checked, stored opaque, and never extracted. If the host cannot hand off
the file, use the web uploader. Other MCP hosts can continue to use the standard
web upload flow; this file-input bridge is a ChatGPT extension.

The browser slices the selected file into 16 MiB raw parts and sends up to three
parts at a time to same-origin Worker routes. A browser checksum for each part is
verified while the Worker streams the part into R2, and saved beside its R2 receipt;
resume checks already-saved part hashes against the reselected file. The Worker authenticates the browser
session and workspace before reading upload state, checks Origin and CSRF on every
write, and owns the R2 multipart key and upload ID. It enforces part count and exact
part sizes, then checks the completed file's size, SHA-256 and image/video/ZIP signature.
ZIP files are never expanded. Bytes stream through R2; the Worker does not base64 encode or buffer a whole video.

The session and per-part ETag receipts live in PostgreSQL tables with forced RLS,
using the same account and workspace context as artifact records. The database
limits each workspace to three active uploads and 12 GiB in flight. Upload sessions
expire after 24 hours. The browser can resume a matching file in the same tab by
reading the server's part receipts; re-select the same file after a failed request
or page reload. An upload in another tab or device is not resumed automatically.

After R2 completes its temporary multipart object, the Worker streams it through a
native SHA-256 hasher, streams the bytes into the workspace-scoped content-addressed
R2 key, and saves an ordinary immutable artifact record. The artifact save has a
stable request ID so retrying a completion returns the same pointer. The temporary
object is deleted after the record commits. R2 automatically aborts incomplete
multipart uploads after seven days; a later upload request also removes expired
session staging objects. An interrupted finalization can be retried for 24 hours.

Artifact previews use authenticated byte-range reads so video players can fetch
metadata and seek without downloading the full file. Downloads are attachments with
`nosniff`; the bucket has no public URLs. User-provided titles are escaped in the
web UI and URL-encoded in download headers. Unsupported types and content whose
signature does not match the declared media type are rejected.

The existing direct `/v1/blobs` upload remains limited to 10 MB. This feature does
not add transcoding, malware scanning, media moderation, transcription, automatic
retention billing or public sharing. The production release applies the additive
PostgreSQL migration before deploying the Worker; the readiness guard fails closed
if either upload table lacks forced RLS.
