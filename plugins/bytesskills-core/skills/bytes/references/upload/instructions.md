# `/bytes upload`

Save a user-attached image, video, or ZIP archive into the authenticated Bytes
workspace as an ordinary `image`, `video`, or downloadable `file` artifact. ZIP
archives remain opaque and are never extracted. This workflow copies the attachment;
it does not edit, publish or share it.

## Intake and execution

1. If no file is attached or otherwise available as a ChatGPT file input, ask the
   user to attach one. Accept JPEG, PNG, WebP, MP4, WebM, MOV or ZIP. If the file is not
   available to the MCP tool, give the user the Bytes web uploader link instead.
2. Ask for a title only when one is not clear from the request or filename; use the
   filename as the title when appropriate. Do not ask for format, music or editing
   choices because upload is storage only.
3. At the start of the request use `bytes_begin` with a fresh request ID and the
   full `/bytes upload` command. Resolve version adoption before continuing.
4. Generate one fresh `request_id` UUID for the upload. Call `bytes_upload` with the
   attached file, title, that ID, and the `workflow_id` from `bytes_begin`. Reuse the
   same request ID if retrying the same file; use a new ID for a different file.
5. Return the actual pointer and server-provided artifact link. Do not claim the file
   was saved unless the tool returned success.

## Limits and safety

Bytes accepts JPEG, PNG, WebP, MP4, WebM, MOV and ZIP, up to 10 GiB. The service
checks the ChatGPT file host, response size, MIME type, file signature and SHA-256,
then streams the file through tenant-scoped multipart storage. Temporary URLs are
never saved as artifact content. If the attachment handoff is unavailable, the
response lacks a usable size, or the file exceeds the limit, link to
https://app.bytesskills.com/app/upload; the signed-in web uploader supports resumable
16 MiB parts.

Do not fetch a user-pasted URL as an attachment. Do not use a local path, link or
temporary URL as proof of persistence. A successful upload creates a normal
workspace artifact and never implies public sharing.
