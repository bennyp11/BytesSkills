-- ZIP archives are opaque downloadable file artifacts; the service never extracts them.
SET LOCAL search_path=bytes,pg_catalog;
ALTER TABLE revisions DROP CONSTRAINT revisions_type_check;
ALTER TABLE revisions ADD CONSTRAINT revisions_type_check
 CHECK(type IN ('concept','hook','script','plan','video','image','audio','run','brief','skill','format','file'));
ALTER TABLE media_uploads DROP CONSTRAINT media_uploads_media_type_check;
ALTER TABLE media_uploads ADD CONSTRAINT media_uploads_media_type_check
 CHECK(media_type IN ('image/jpeg','image/png','image/webp','video/mp4','video/webm','video/quicktime','application/zip'));
