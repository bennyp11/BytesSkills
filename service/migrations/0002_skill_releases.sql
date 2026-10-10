-- Skill history and workspace adoption are separate from creative artifact history.
CREATE TABLE skill_releases (
  skill TEXT NOT NULL,
  version TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK(sequence > 0),
  checksum TEXT NOT NULL,
  payload TEXT NOT NULL CHECK(json_valid(payload)),
  published_at TEXT NOT NULL,
  PRIMARY KEY(skill,version), UNIQUE(skill,sequence)
);
CREATE TRIGGER skill_release_immutable_update BEFORE UPDATE ON skill_releases BEGIN SELECT RAISE(ABORT,'immutable_skill_release'); END;
CREATE TRIGGER skill_release_immutable_delete BEFORE DELETE ON skill_releases BEGIN SELECT RAISE(ABORT,'immutable_skill_release'); END;
CREATE TRIGGER skill_release_sequence BEFORE INSERT ON skill_releases BEGIN
 SELECT RAISE(ABORT,'release_conflict') WHERE NEW.sequence != COALESCE((SELECT MAX(sequence)+1 FROM skill_releases WHERE skill=NEW.skill),1);
END;
CREATE TABLE skill_revocations (
 skill TEXT NOT NULL, version TEXT NOT NULL, reason TEXT NOT NULL,
 PRIMARY KEY(skill,version), FOREIGN KEY(skill,version) REFERENCES skill_releases(skill,version)
);
CREATE TABLE library_state (
 id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL,
 selections TEXT NOT NULL CHECK(json_valid(selections)),
 policies TEXT NOT NULL CHECK(json_valid(policies)),
 dismissed TEXT NOT NULL CHECK(json_valid(dismissed))
);
INSERT INTO library_state VALUES(1,0,'{}','{}','{}');
CREATE TRIGGER library_state_cas BEFORE UPDATE ON library_state BEGIN
 SELECT RAISE(ABORT,'adoption_conflict') WHERE NEW.revision != OLD.revision+1;
END;
CREATE TABLE library_decisions (
 request_id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, result TEXT NOT NULL CHECK(json_valid(result)), created_at TEXT NOT NULL
);
CREATE TRIGGER decisions_immutable_update BEFORE UPDATE ON library_decisions BEGIN SELECT RAISE(ABORT,'immutable_decision'); END;
CREATE TRIGGER decisions_immutable_delete BEFORE DELETE ON library_decisions BEGIN SELECT RAISE(ABORT,'immutable_decision'); END;
CREATE TABLE workflow_sessions (
 id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, skill TEXT NOT NULL, version TEXT NOT NULL,
 command TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL,
 FOREIGN KEY(skill,version) REFERENCES skill_releases(skill,version)
);
CREATE TRIGGER sessions_immutable_update BEFORE UPDATE ON workflow_sessions BEGIN SELECT RAISE(ABORT,'immutable_session'); END;
CREATE TRIGGER sessions_immutable_delete BEFORE DELETE ON workflow_sessions BEGIN SELECT RAISE(ABORT,'immutable_session'); END;
-- Publications invalidate adoption previews in the same transaction.
CREATE TRIGGER release_invalidates_preview AFTER INSERT ON skill_releases BEGIN
 UPDATE library_state SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER revocation_invalidates_preview AFTER INSERT ON skill_revocations BEGIN
 UPDATE library_state SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER revocations_immutable_update BEFORE UPDATE ON skill_revocations BEGIN SELECT RAISE(ABORT,'immutable_revocation'); END;
CREATE TRIGGER revocations_immutable_delete BEFORE DELETE ON skill_revocations BEGIN SELECT RAISE(ABORT,'immutable_revocation'); END;
