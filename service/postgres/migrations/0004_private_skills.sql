SET LOCAL search_path=bytes,pg_catalog;
CREATE TABLE private_skills (
 workspace_id text NOT NULL REFERENCES workspace(id),
 id text NOT NULL CHECK(id ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'),
 revision integer NOT NULL CHECK(revision=1),
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 200),
 summary text NOT NULL CHECK(length(summary) BETWEEN 1 AND 2000),
 instructions text NOT NULL CHECK(length(instructions) BETWEEN 1 AND 50000),
 checksum text NOT NULL CHECK(checksum ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,id,revision)
);
ALTER TABLE private_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE private_skills FORCE ROW LEVEL SECURITY;
DO $$ BEGIN EXECUTE format('CREATE POLICY schema_admin ON bytes.private_skills TO %I USING(true) WITH CHECK(true)',current_user); END $$;
CREATE POLICY tenant ON private_skills TO bytes_runtime USING(can_access_workspace(workspace_id)) WITH CHECK(can_access_workspace(workspace_id));
GRANT SELECT,INSERT ON private_skills TO bytes_runtime;
CREATE TRIGGER immutable_private_skill BEFORE UPDATE OR DELETE ON private_skills FOR EACH ROW EXECUTE FUNCTION immutable();
