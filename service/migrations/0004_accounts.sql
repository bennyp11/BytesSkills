-- Identity foundation only. Existing APIs remain single-workspace until scoped.
PRAGMA foreign_keys = ON;
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK(status IN ('unclaimed','active','disabled')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
-- A verified provider issuer+subject identifies a login. Email is not an identity key.
CREATE TABLE account_identities (
  issuer TEXT NOT NULL CHECK(length(issuer) > 0),
  subject TEXT NOT NULL CHECK(length(subject) > 0),
  account_id TEXT NOT NULL REFERENCES accounts(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY(issuer,subject)
);
CREATE INDEX account_identities_account ON account_identities(account_id);
CREATE TABLE workspace_memberships (
  workspace_id TEXT NOT NULL REFERENCES workspace(id),
  account_id TEXT NOT NULL REFERENCES accounts(id),
  role TEXT NOT NULL CHECK(role = 'owner'),
  status TEXT NOT NULL CHECK(status IN ('active','revoked')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY(workspace_id,account_id)
);
-- Initial product supports one private owner per workspace; team roles come later.
CREATE UNIQUE INDEX workspace_active_owner ON workspace_memberships(workspace_id)
  WHERE status = 'active';
CREATE INDEX memberships_account ON workspace_memberships(account_id,status,workspace_id);
-- Explicit claim only: no email guess, no automatic first-signup ownership.
INSERT INTO accounts(id,status) VALUES ('legacy-owner','unclaimed');
INSERT INTO workspace_memberships(workspace_id,account_id,role,status)
  SELECT id,'legacy-owner','owner','active' FROM workspace;
