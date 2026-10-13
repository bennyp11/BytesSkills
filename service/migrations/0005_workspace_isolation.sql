-- Apply atomically via D1 migrations. Preserve all record bytes, checksums and R2 keys.
PRAGMA defer_foreign_keys = ON;
DROP TRIGGER revision_sequence;
DROP TRIGGER immutable_revision_update;
DROP TRIGGER immutable_revision_delete;
DROP TRIGGER no_parent_cycle_insert;
DROP TRIGGER no_parent_cycle_update;
DROP TRIGGER library_state_cas;
DROP TRIGGER decisions_immutable_update;
DROP TRIGGER decisions_immutable_delete;
DROP TRIGGER sessions_immutable_update;
DROP TRIGGER sessions_immutable_delete;
DROP TRIGGER release_invalidates_preview;
DROP TRIGGER revocation_invalidates_preview;
ALTER TABLE requests RENAME TO requests_legacy;
ALTER TABLE edges RENAME TO edges_legacy;
ALTER TABLE tags RENAME TO tags_legacy;
ALTER TABLE heads RENAME TO heads_legacy;
ALTER TABLE revisions RENAME TO revisions_legacy;
ALTER TABLE library_state RENAME TO library_state_legacy;
ALTER TABLE library_decisions RENAME TO library_decisions_legacy;
ALTER TABLE workflow_sessions RENAME TO workflow_sessions_legacy;
CREATE TABLE revisions (
 workspace_id TEXT NOT NULL REFERENCES workspace(id),
 pointer TEXT NOT NULL, id TEXT NOT NULL,
 type TEXT NOT NULL CHECK(type IN ('concept','hook','script','plan','video','image','audio','run','brief')),
 revision INTEGER NOT NULL CHECK(revision >= 1), checksum TEXT NOT NULL,
 record TEXT NOT NULL CHECK(json_valid(record)),
 CHECK(json_extract(record,'$.workspace_id') IS workspace_id),
 CHECK(json_extract(record,'$.id') IS id AND json_extract(record,'$.pointer') IS pointer),
 CHECK(json_extract(record,'$.type') IS type AND json_extract(record,'$.revision') IS revision),
 PRIMARY KEY(workspace_id,pointer), UNIQUE(workspace_id,id,revision),
 UNIQUE(workspace_id,pointer,id,type,revision)
);
CREATE TABLE heads (
 workspace_id TEXT NOT NULL REFERENCES workspace(id), id TEXT NOT NULL,
 pointer TEXT NOT NULL, type TEXT NOT NULL, revision INTEGER NOT NULL,
 title TEXT NOT NULL, status TEXT NOT NULL, format TEXT, parent TEXT, updated TEXT NOT NULL,
 PRIMARY KEY(workspace_id,id),
 FOREIGN KEY(workspace_id,pointer,id,type,revision) REFERENCES revisions(workspace_id,pointer,id,type,revision) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY(workspace_id,parent) REFERENCES heads(workspace_id,id) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX tenant_heads_filter ON heads(workspace_id,type,status,format,id);
CREATE INDEX tenant_heads_parent ON heads(workspace_id,parent,id);
CREATE TABLE tags (
 workspace_id TEXT NOT NULL, id TEXT NOT NULL, tag TEXT NOT NULL,
 PRIMARY KEY(workspace_id,id,tag),
 FOREIGN KEY(workspace_id,id) REFERENCES heads(workspace_id,id)
);
CREATE INDEX tenant_tags_lookup ON tags(workspace_id,tag,id);
CREATE TABLE edges (
 workspace_id TEXT NOT NULL, source TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('inputs','derived_from','links','outputs')), target TEXT NOT NULL,
 PRIMARY KEY(workspace_id,source,kind,target),
 FOREIGN KEY(workspace_id,source) REFERENCES revisions(workspace_id,pointer) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY(workspace_id,target) REFERENCES revisions(workspace_id,pointer) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX tenant_edges_reverse ON edges(workspace_id,target,kind,source);
CREATE TABLE requests (
 workspace_id TEXT NOT NULL, request_id TEXT NOT NULL, fingerprint TEXT NOT NULL,
 pointer TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(workspace_id,request_id),
 FOREIGN KEY(workspace_id,pointer) REFERENCES revisions(workspace_id,pointer) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE library_state (
 workspace_id TEXT PRIMARY KEY REFERENCES workspace(id), revision INTEGER NOT NULL,
 selections TEXT NOT NULL CHECK(json_valid(selections)), policies TEXT NOT NULL CHECK(json_valid(policies)), dismissed TEXT NOT NULL CHECK(json_valid(dismissed))
);
CREATE TABLE library_decisions (
 workspace_id TEXT NOT NULL REFERENCES workspace(id), request_id TEXT NOT NULL,
 fingerprint TEXT NOT NULL, result TEXT NOT NULL CHECK(json_valid(result)), created_at TEXT NOT NULL,
 PRIMARY KEY(workspace_id,request_id)
);
CREATE TABLE workflow_sessions (
 workspace_id TEXT NOT NULL REFERENCES workspace(id), id TEXT NOT NULL, fingerprint TEXT NOT NULL,
 skill TEXT NOT NULL, version TEXT NOT NULL, command TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL,
 PRIMARY KEY(workspace_id,id), FOREIGN KEY(skill,version) REFERENCES skill_releases(skill,version)
);
INSERT INTO requests SELECT 'acc3351e-d092-433c-a7e1-8fc3e807ebd4',old.* FROM requests_legacy old;
INSERT INTO edges SELECT 'acc3351e-d092-433c-a7e1-8fc3e807ebd4',old.* FROM edges_legacy old;
INSERT INTO tags SELECT 'acc3351e-d092-433c-a7e1-8fc3e807ebd4',old.* FROM tags_legacy old;
INSERT INTO heads SELECT 'acc3351e-d092-433c-a7e1-8fc3e807ebd4',old.* FROM heads_legacy old;
INSERT INTO revisions(rowid,workspace_id,pointer,id,type,revision,checksum,record) SELECT old.rowid,'acc3351e-d092-433c-a7e1-8fc3e807ebd4',old.* FROM revisions_legacy old;
INSERT INTO library_state SELECT 'acc3351e-d092-433c-a7e1-8fc3e807ebd4',revision,selections,policies,dismissed FROM library_state_legacy;
INSERT INTO library_decisions SELECT 'acc3351e-d092-433c-a7e1-8fc3e807ebd4',old.* FROM library_decisions_legacy old;
INSERT INTO workflow_sessions SELECT 'acc3351e-d092-433c-a7e1-8fc3e807ebd4',old.* FROM workflow_sessions_legacy old;
INSERT INTO library_state SELECT id,0,'{}','{}','{}' FROM workspace WHERE id NOT IN (SELECT workspace_id FROM library_state);
-- Verified workflow linkage is separate from arbitrary provenance JSON.
CREATE TABLE revision_workflows (
 workspace_id TEXT NOT NULL, pointer TEXT NOT NULL, workflow_id TEXT NOT NULL,
 PRIMARY KEY(workspace_id,pointer),
 FOREIGN KEY(workspace_id,pointer) REFERENCES revisions(workspace_id,pointer) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY(workspace_id,workflow_id) REFERENCES workflow_sessions(workspace_id,id)
);
INSERT INTO revision_workflows
 SELECT r.workspace_id,r.pointer,s.id FROM revisions r JOIN workflow_sessions s
 ON s.workspace_id=r.workspace_id AND s.id=json_extract(r.record,'$.provenance.skill_release.workflow_id');
CREATE TRIGGER workflow_link_immutable_update BEFORE UPDATE ON revision_workflows BEGIN SELECT RAISE(ABORT,'immutable_workflow_link'); END;
CREATE TRIGGER workflow_link_immutable_delete BEFORE DELETE ON revision_workflows BEGIN SELECT RAISE(ABORT,'immutable_workflow_link'); END;
CREATE TABLE search_documents (
 workspace_id TEXT NOT NULL, id TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL,
 PRIMARY KEY(workspace_id,id), FOREIGN KEY(workspace_id,id) REFERENCES heads(workspace_id,id)
);
INSERT INTO search_documents SELECT 'acc3351e-d092-433c-a7e1-8fc3e807ebd4',id,title,body FROM search;
DROP TABLE search;
CREATE VIRTUAL TABLE search USING fts5(workspace_id UNINDEXED,id UNINDEXED,title,body);
INSERT INTO search SELECT workspace_id,id,title,body FROM search_documents;
CREATE TRIGGER search_insert AFTER INSERT ON search_documents BEGIN
 INSERT INTO search(workspace_id,id,title,body) VALUES(NEW.workspace_id,NEW.id,NEW.title,NEW.body);
END;
CREATE TRIGGER search_delete AFTER DELETE ON search_documents BEGIN
 DELETE FROM search WHERE workspace_id=OLD.workspace_id AND id=OLD.id;
END;
CREATE TRIGGER search_update AFTER UPDATE ON search_documents BEGIN
 DELETE FROM search WHERE workspace_id=OLD.workspace_id AND id=OLD.id;
 INSERT INTO search(workspace_id,id,title,body) VALUES(NEW.workspace_id,NEW.id,NEW.title,NEW.body);
END;
DROP TABLE requests_legacy;
DROP TABLE edges_legacy;
DROP TABLE tags_legacy;
DROP TABLE heads_legacy;
DROP TABLE revisions_legacy;
DROP TABLE library_state_legacy;
DROP TABLE library_decisions_legacy;
DROP TABLE workflow_sessions_legacy;
CREATE TRIGGER revision_sequence BEFORE INSERT ON revisions BEGIN
  SELECT RAISE(ABORT,'revision_conflict') WHERE NEW.revision != COALESCE((SELECT revision+1 FROM heads WHERE workspace_id=NEW.workspace_id AND id=NEW.id),1);
  SELECT RAISE(ABORT,'revision_conflict') WHERE NEW.revision > 1 AND (
    json_extract(NEW.record,'$.previous_checksum') IS NOT (SELECT r.checksum FROM heads h JOIN revisions r ON r.workspace_id=h.workspace_id AND r.pointer=h.pointer WHERE h.workspace_id=NEW.workspace_id AND h.id=NEW.id)
    OR NEW.type IS NOT (SELECT type FROM heads WHERE workspace_id=NEW.workspace_id AND id=NEW.id));
END;
CREATE TRIGGER immutable_revision_update BEFORE UPDATE ON revisions BEGIN SELECT RAISE(ABORT,'immutable_revision'); END;
CREATE TRIGGER immutable_revision_delete BEFORE DELETE ON revisions BEGIN SELECT RAISE(ABORT,'immutable_revision'); END;
CREATE TRIGGER no_parent_cycle_insert BEFORE INSERT ON heads WHEN NEW.parent IS NOT NULL BEGIN
  SELECT RAISE(ABORT,'invalid_parent') WHERE NEW.type != 'concept' OR NEW.parent=NEW.id OR
    (SELECT type FROM heads WHERE workspace_id=NEW.workspace_id AND id=NEW.parent) != 'concept';
  SELECT RAISE(ABORT,'parent_cycle') WHERE EXISTS(WITH RECURSIVE ancestors(id,parent) AS (
    SELECT id,parent FROM heads WHERE workspace_id=NEW.workspace_id AND id=NEW.parent UNION SELECT h.id,h.parent FROM heads h JOIN ancestors a ON h.id=a.parent AND h.workspace_id=NEW.workspace_id
  ) SELECT 1 FROM ancestors WHERE id=NEW.id);
END;
CREATE TRIGGER no_parent_cycle_update BEFORE UPDATE OF parent ON heads WHEN NEW.parent IS NOT NULL BEGIN
  SELECT RAISE(ABORT,'invalid_parent') WHERE NEW.type != 'concept' OR NEW.parent=NEW.id OR
    (SELECT type FROM heads WHERE workspace_id=NEW.workspace_id AND id=NEW.parent) != 'concept';
  SELECT RAISE(ABORT,'parent_cycle') WHERE EXISTS(WITH RECURSIVE ancestors(id,parent) AS (
    SELECT id,parent FROM heads WHERE workspace_id=NEW.workspace_id AND id=NEW.parent UNION SELECT h.id,h.parent FROM heads h JOIN ancestors a ON h.id=a.parent AND h.workspace_id=NEW.workspace_id
  ) SELECT 1 FROM ancestors WHERE id=NEW.id);
END;
CREATE TRIGGER immutable_head_workspace BEFORE UPDATE OF workspace_id,id ON heads BEGIN SELECT RAISE(ABORT,'immutable_identity'); END;
CREATE TRIGGER library_state_cas BEFORE UPDATE ON library_state BEGIN
 SELECT RAISE(ABORT,'adoption_conflict') WHERE NEW.workspace_id != OLD.workspace_id OR NEW.revision != OLD.revision+1;
END;
CREATE TRIGGER initialize_workspace_library AFTER INSERT ON workspace BEGIN
 INSERT INTO library_state VALUES(NEW.id,0,'{}','{}','{}');
END;
CREATE TRIGGER release_invalidates_preview AFTER INSERT ON skill_releases BEGIN
 UPDATE library_state SET revision=revision+1;
END;
CREATE TRIGGER revocation_invalidates_preview AFTER INSERT ON skill_revocations BEGIN
 UPDATE library_state SET revision=revision+1;
END;
CREATE TRIGGER decision_immutable_update BEFORE UPDATE ON library_decisions BEGIN SELECT RAISE(ABORT,'immutable_decision'); END;
CREATE TRIGGER decision_immutable_delete BEFORE DELETE ON library_decisions BEGIN SELECT RAISE(ABORT,'immutable_decision'); END;
CREATE TRIGGER session_immutable_update BEFORE UPDATE ON workflow_sessions BEGIN SELECT RAISE(ABORT,'immutable_session'); END;
CREATE TRIGGER session_immutable_delete BEFORE DELETE ON workflow_sessions BEGIN SELECT RAISE(ABORT,'immutable_session'); END;
