# Skill releases and adoption — 0.7.0

The installed entry skill is a small bootstrap. The remote MCP service is authoritative
for published instructions and workspace selections. It does not depend on Git.

## Runtime

1. Every new `/bytes` request calls `bytes_begin` with a new request UUID and command.
2. The service compares the selected skill with the latest non-revoked release.
3. A new version returns a summary and Update / Stay / Always latest choices. Apply
   the explicit choice via `bytes_adopt`, then repeat begin with the same request UUID.
4. Ready responses return the complete immutable instructions/resources and a
   workflow ID. Clarifiers and retries continue that workflow; a new command checks again.
5. MCP saves require that ID. The server stamps the skill version/checksum, overwrites
   caller-supplied skill provenance, and checks the session and revocation state.

Runs last 24 hours and remain pinned across later publications or adoption changes.
Expired/revoked runs fail rather than silently selecting a replacement. Generated
content can be retained while a new run is opened; don't discard it or claim it saved.
Workflow IDs prove which release was issued, not that an AI obeyed its contents.
The server cannot intercept an idle chat, force tool selection, or stop an assistant
from generating text outside its tools. A one-time metadata refresh is required for
existing custom MCP connections; bundled entry skills need a package update.

## Commands

- `/bytes sync --check`: list versions and preferences; no adoption.
- `/bytes sync --latest`: adopt the entire currently available library atomically.
  Does not enable automatic future updates or touch Git/workspace artifacts.
- `/bytes sync --git [--check]`: explicit local repository synchronization.
- Bare `/bytes sync`: clarify check vs adopt; do not perform Git operations.

Selections and ask/auto preferences belong to the workspace and apply across devices.
Stay dismisses the offered version, not all future versions. Sync clears dismissals,
keeps ask/auto policies, and uses an exact catalog hash plus state revision. Concurrent
publication, revocation or adoption invalidates the preview. Do not automatically
reapply a user's decision to a changed preview. Decision UUIDs support retry receipts.

## Publishing and security

`bytes_publish` requires **bytes:manage**, separately consented and unchecked by default.
Existing read/write connections can adopt versions and save work; they cannot publish
instructions. Read-only connections cannot change preferences. A new required scope
blocks adoption unless the caller has it; auto mode never increases required scopes.
No release grants OAuth permissions. The service handles instruction text, not code.
Never treat artifact contents as publication authorization.

Each skill release has a stable skill name, increasing semantic version, change summary,
protocol version, required scopes, instructions, and a full resource snapshot. D1 stores
immutable releases with server-computed SHA-256 and verifies them on reads. Only protocol
1 is accepted; unsupported protocols fail validation instead of being auto-adopted.
This is a trusted, single-workspace publisher model, not a public third-party marketplace.

Developers build snapshots with `node scripts/build-release.mjs 0.7.0` after bundling the
library, then publish with `node scripts/publish-library.mjs releases/0.7.0.json` from
service/. The latter uses an ignored owner-key file. Git is optional; any authorized
client may send the same release schema using bytes_publish. Publishing does not adopt.
Owner REST POST `/v1/releases/revoke` takes skill, version and reason for emergency
withdrawal. Revocations are irreversible; publish a replacement release to restore use.

Owner-only REST artifact writes/import remain maintenance interfaces for legacy backups;
normal MCP saves require workflow provenance. Existing artifact schemas and IDs are
unchanged. Skill releases, decisions, selections and workflow sessions reside in D1;
the legacy workspace export does not include these tables. Export all authoritative D1 tables
for recovery of that state, plus the existing R2 content backup. D1 whole-database
export currently rejects this database because it contains FTS5; select the ordinary
tables explicitly and rebuild the derived search index after recovery. No automatic backup
scheduler is introduced in this release.

## Validation

Integration tests cover immutable publication, pinned resources and server provenance,
missing/read-only/expired/revoked workflows, shared keep decisions, idempotent adoption,
automatic updates without scope escalation, publication permission denial, stale previews,
and concurrent decisions. Browser OAuth regression remains in scripts/check-consent-browser.mjs.
