SET LOCAL search_path=bytes,pg_catalog;
-- Additive type expansion; preserve every prior record, pointer and checksum.
ALTER TABLE revisions DROP CONSTRAINT revisions_type_check;
ALTER TABLE revisions ADD CONSTRAINT revisions_type_check
 CHECK(type IN ('concept','hook','script','plan','video','image','audio','run','brief','skill','format'));
-- Private execution remains anchored to a verified core release for revocation and
-- adoption. Exact private definitions are immutable alongside the session.
ALTER TABLE workflow_sessions ADD COLUMN definition_snapshot text
 CHECK(definition_snapshot IS NULL OR jsonb_typeof(definition_snapshot::jsonb)='object');
