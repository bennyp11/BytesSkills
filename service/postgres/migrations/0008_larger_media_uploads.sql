-- Allow large source videos while keeping a bounded number of in-flight bytes.
SET LOCAL search_path=bytes,pg_catalog;
ALTER TABLE media_uploads DROP CONSTRAINT media_uploads_bytes_check;
ALTER TABLE media_uploads ADD CONSTRAINT media_uploads_bytes_check
 CHECK(bytes BETWEEN 1 AND 10737418240);
ALTER TABLE media_upload_parts DROP CONSTRAINT media_upload_parts_part_number_check;
ALTER TABLE media_upload_parts ADD CONSTRAINT media_upload_parts_part_number_check
 CHECK(part_number BETWEEN 1 AND 640);
CREATE OR REPLACE FUNCTION check_media_upload_quota() RETURNS trigger
 LANGUAGE plpgsql SET search_path=bytes,pg_catalog AS $$
DECLARE active_count integer; pending_bytes bigint;
BEGIN
 SELECT count(*),coalesce(sum(bytes),0) INTO active_count,pending_bytes FROM media_uploads
  WHERE workspace_id=NEW.workspace_id AND status IN ('receiving','completing') AND expires_at>now();
 IF active_count>=3 OR pending_bytes+NEW.bytes>12884901888 THEN
  RAISE EXCEPTION 'media_upload_quota';
 END IF;
 RETURN NEW;
END $$;
