-- One deployment owns one workspace. Revisions are authoritative, heads/search derived.
PRAGMA foreign_keys = ON;
CREATE TABLE workspace (id TEXT PRIMARY KEY, name TEXT NOT NULL);
INSERT INTO workspace VALUES ('acc3351e-d092-433c-a7e1-8fc3e807ebd4','Content');
CREATE TABLE revisions (
  pointer TEXT PRIMARY KEY,
  id TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('concept','hook','script','plan','video','image','audio','run','brief')),
  revision INTEGER NOT NULL CHECK(revision >= 1),
  checksum TEXT NOT NULL,
  record TEXT NOT NULL CHECK(json_valid(record)),
  UNIQUE(id,revision)
);
CREATE TABLE heads (
  id TEXT PRIMARY KEY,
  pointer TEXT NOT NULL REFERENCES revisions(pointer),
  type TEXT NOT NULL,
  revision INTEGER NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  format TEXT,
  parent TEXT REFERENCES heads(id) DEFERRABLE INITIALLY DEFERRED,
  updated TEXT NOT NULL
);
CREATE INDEX heads_filter ON heads(type,status,format,id);
CREATE INDEX heads_parent ON heads(parent,id);
CREATE TABLE tags (id TEXT NOT NULL REFERENCES heads(id), tag TEXT NOT NULL, PRIMARY KEY(id,tag));
CREATE INDEX tags_lookup ON tags(tag,id);
CREATE TABLE edges (
  source TEXT NOT NULL REFERENCES revisions(pointer) DEFERRABLE INITIALLY DEFERRED,
  kind TEXT NOT NULL CHECK(kind IN ('inputs','derived_from','links','outputs')),
  target TEXT NOT NULL REFERENCES revisions(pointer) DEFERRABLE INITIALLY DEFERRED,
  PRIMARY KEY(source,kind,target)
);
CREATE INDEX edges_reverse ON edges(target,kind,source);
CREATE VIRTUAL TABLE search USING fts5(id UNINDEXED,title,body);
CREATE TABLE requests (
  request_id TEXT PRIMARY KEY,
  fingerprint TEXT NOT NULL,
  pointer TEXT NOT NULL REFERENCES revisions(pointer) DEFERRABLE INITIALLY DEFERRED,
  created_at TEXT NOT NULL
);
-- Checked inside the same transaction as head/index updates, closing the read/write race.
CREATE TRIGGER revision_sequence BEFORE INSERT ON revisions BEGIN
  SELECT RAISE(ABORT,'revision_conflict') WHERE NEW.revision != COALESCE((SELECT revision+1 FROM heads WHERE id=NEW.id),1);
  SELECT RAISE(ABORT,'revision_conflict') WHERE NEW.revision > 1 AND (
    json_extract(NEW.record,'$.previous_checksum') IS NOT (SELECT r.checksum FROM heads h JOIN revisions r ON r.pointer=h.pointer WHERE h.id=NEW.id)
    OR NEW.type IS NOT (SELECT type FROM heads WHERE id=NEW.id));
END;
CREATE TRIGGER immutable_revision_update BEFORE UPDATE ON revisions BEGIN SELECT RAISE(ABORT,'immutable_revision'); END;
CREATE TRIGGER immutable_revision_delete BEFORE DELETE ON revisions BEGIN SELECT RAISE(ABORT,'immutable_revision'); END;
CREATE TRIGGER no_parent_cycle_insert BEFORE INSERT ON heads WHEN NEW.parent IS NOT NULL BEGIN
  SELECT RAISE(ABORT,'invalid_parent') WHERE NEW.type != 'concept' OR NEW.parent=NEW.id OR
    (SELECT type FROM heads WHERE id=NEW.parent) != 'concept';
  SELECT RAISE(ABORT,'parent_cycle') WHERE EXISTS(WITH RECURSIVE ancestors(id,parent) AS (
    SELECT id,parent FROM heads WHERE id=NEW.parent UNION SELECT h.id,h.parent FROM heads h JOIN ancestors a ON h.id=a.parent
  ) SELECT 1 FROM ancestors WHERE id=NEW.id);
END;
CREATE TRIGGER no_parent_cycle_update BEFORE UPDATE OF parent ON heads WHEN NEW.parent IS NOT NULL BEGIN
  SELECT RAISE(ABORT,'invalid_parent') WHERE NEW.type != 'concept' OR NEW.parent=NEW.id OR
    (SELECT type FROM heads WHERE id=NEW.parent) != 'concept';
  SELECT RAISE(ABORT,'parent_cycle') WHERE EXISTS(WITH RECURSIVE ancestors(id,parent) AS (
    SELECT id,parent FROM heads WHERE id=NEW.parent UNION SELECT h.id,h.parent FROM heads h JOIN ancestors a ON h.id=a.parent
  ) SELECT 1 FROM ancestors WHERE id=NEW.id);
END;
