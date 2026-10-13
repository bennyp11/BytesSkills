-- Legacy D1 may read core workflows; private definition authoring requires Postgres.
ALTER TABLE workflow_sessions ADD COLUMN definition_snapshot TEXT;
