-- Browser media uploads use short-lived tenant-scoped state. R2 stores bytes;
-- these rows store only server-issued multipart identifiers and part receipts.
SET LOCAL search_path=bytes,pg_catalog;
CREATE TABLE media_uploads (
 workspace_id text NOT NULL REFERENCES workspace(id),
 id text NOT NULL CHECK(id ~ '^[a-f0-9-]{36}$'),
 request_id text NOT NULL CHECK(request_id ~ '^[a-f0-9-]{36}$'),
 staging_key text NOT NULL CHECK(staging_key ~ '^[a-f0-9-]{36}/staging/media/[a-f0-9-]{36}$'),
 r2_upload_id text NOT NULL,
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 500),
 media_type text NOT NULL CHECK(media_type IN ('image/jpeg','image/png','image/webp','video/mp4','video/webm','video/quicktime')),
 bytes bigint NOT NULL CHECK(bytes BETWEEN 1 AND 1073741824),
 chunk_size integer NOT NULL CHECK(chunk_size=16777216),
 status text NOT NULL CHECK(status IN ('receiving','completing','saved','aborted')),
 sha256 text CHECK(sha256 IS NULL OR sha256 ~ '^[a-f0-9]{64}$'),
 content_key text CHECK(content_key IS NULL OR content_key ~ '^blobs/sha256/[a-f0-9]{2}/[a-f0-9]{64}$'),
 pointer text,
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,id),
 UNIQUE(workspace_id,request_id),
 UNIQUE(staging_key),
 CHECK((status='saved')=(pointer IS NOT NULL))
);
CREATE INDEX media_uploads_expiry ON media_uploads(workspace_id,expires_at);
CREATE INDEX media_uploads_active ON media_uploads(workspace_id,status,created_at);
CREATE TABLE media_upload_parts (
 workspace_id text NOT NULL,
 upload_id text NOT NULL,
 part_number integer NOT NULL CHECK(part_number BETWEEN 1 AND 64),
 etag text NOT NULL CHECK(length(etag) BETWEEN 1 AND 256),
 sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
 bytes integer NOT NULL CHECK(bytes BETWEEN 1 AND 16777216),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,upload_id,part_number),
 FOREIGN KEY(workspace_id,upload_id) REFERENCES media_uploads(workspace_id,id) ON DELETE CASCADE
);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['media_uploads','media_upload_parts'] LOOP
  EXECUTE format('ALTER TABLE bytes.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE bytes.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY schema_admin ON bytes.%I TO %I USING(true) WITH CHECK(true)',t,current_user);
  EXECUTE format('CREATE POLICY tenant ON bytes.%I TO bytes_runtime USING(bytes.can_access_workspace(workspace_id)) WITH CHECK(bytes.can_access_workspace(workspace_id))',t);
 END LOOP;
END $$;
GRANT SELECT,INSERT,UPDATE,DELETE ON media_uploads,media_upload_parts TO bytes_runtime;
CREATE FUNCTION check_media_upload_quota() RETURNS trigger LANGUAGE plpgsql SET search_path=bytes,pg_catalog AS $$
DECLARE active_count integer; pending_bytes bigint;
BEGIN
 SELECT count(*),coalesce(sum(bytes),0) INTO active_count,pending_bytes FROM media_uploads
  WHERE workspace_id=NEW.workspace_id AND status IN ('receiving','completing') AND expires_at>now();
 IF active_count>=3 OR pending_bytes+NEW.bytes>2147483648 THEN RAISE EXCEPTION 'media_upload_quota'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER media_upload_quota BEFORE INSERT ON media_uploads FOR EACH ROW EXECUTE FUNCTION check_media_upload_quota();
GRANT EXECUTE ON FUNCTION check_media_upload_quota() TO bytes_runtime;
