# First independent user milestone

**Architecture update:** PostgreSQL/PlanetScale with FORCE RLS is now being implemented
on this review branch. Production remains on D1; database provisioning/cutover have
not completed. See [PostgreSQL cutover](postgres-cutover.md) for current roles,
verification, migration and recovery requirements. The D1 details below describe the
pre-cutover compatibility implementation.

Success: a second person signs in, authorizes an AI connection, saves an artifact,
and finds it in their dashboard. They cannot access the existing owner's workspace
through pointers, search, history, relationships, files, exports, workflow sessions,
adoption state, or OAuth grants. The same account sees its data on a second device.

## Implementation sequence

1. **Account foundation (this change).** Add stable internal accounts, external
   identity mappings, and private workspace membership. Reserve an unclaimed legacy
   account for the existing workspace; never assign it to the first signup or match
   ownership by email. Test migration against existing records and membership
   constraints. These tables alone do not enable multi-user access.
2. **Storage isolation.** Add workspace ownership to revisions, heads, tags, edges,
   search, idempotency requests, workflow sessions and adoption decisions/state.
   Backfill the existing workspace without modifying immutable record JSON or its
   checksums. Replace singleton library state with per-workspace state. Keep core
   releases global, but restrict publication to a dedicated release credential.
   Require an authenticated workspace context in Store and Releases. All joins,
   pagination, prefix resolution and writes must use that context. Enforce
   same-workspace relationships and workflow provenance in database constraints.
   Keep R2 keys under the existing workspace prefix; never accept a raw object key
   as authorization. Remove public-user access to administrative imports/exports.
3. **Login and OAuth.** Select a managed identity provider supporting email login
   and standards-based identity verification. Use validated issuer + subject as
   identity, never client-supplied account IDs or an email-only lookup. Implement
   secure server sessions, CSRF protection, fixed callback allowlists, rate limits,
   logout, and session expiration. Verify tokens server-side. Provision account,
   workspace and membership atomically and idempotently. Explicitly claim the legacy
   workspace using existing owner authorization plus verified login. Do not copy
   the owner's broad key into user accounts or browsers.
4. **AI authorization.** Replace workspace-key consent with authenticated account
   consent. Bind grants to account, workspace and approved scopes. Recheck active
   membership on every MCP request, including after token refresh. Keep refresh
   tokens scoped and revocable. Only list/revoke the signed-in user's grants.
   Define an explicit transition for existing owner grants before rollout.
5. **Dashboard.** Deliver a small authenticated app: artifact search and detail,
   revisions, safe file downloads, skills and version adoption, connected apps and
   revoke action. Show real pointers and copyable follow-up commands. Use the same
   authorization layer as MCP. Render artifact text as text, not executable HTML.
   Keep the existing public website and its independent deployment intact.
6. **Pilot and release.** Run two-account automated adversarial tests, then a real
   two-device pilot with a second person. Verify migration and restore on private
   staging data, use an additive rollout, and deploy through the existing release
   process. Keep signup invite-only until the pilot passes. Document recovery and
   revocation. Do not put workspace backups or credentials in GitHub.

## Acceptance tests before inviting a second user

- The legacy workspace retains every pointer, revision, checksum and R2 key.
- Concurrent first logins for one identity produce one account and workspace.
- Two users can use the same request ID without collision or result disclosure.
- Guessing another user's full/prefix pointer, revision, cursor, workflow ID or
  object key reveals no content or existence through any REST/MCP route.
- Search, counts, reverse links, parent trees and exports contain only authorized
  records; cross-workspace parent/input/output/reference writes are rejected.
- Skill adoption and auto-update preferences remain independent across workspaces.
- An ordinary user cannot publish/revoke global core skills or use deployment keys.
- Logout expires the browser session; revoking an AI grant blocks its access and
  refresh tokens; removing membership blocks a still-valid grant immediately.
- Invalid/expired/replayed login callbacks and CSRF requests fail safely.
- The second user saves through MCP and sees that artifact through the dashboard
  on another device, while the first user's data remains inaccessible.

## Deliberately later

Personal skill authoring, teams/invitations, public sharing, marketplace, billing,
and large media uploads are not required for this first independent-user journey.
Core skills stay centrally published; users independently adopt versions.

## Current progress

- [x] Audit existing single-workspace assumptions.
- [x] Add account/identity/membership schema and reserved legacy owner.
- [x] Scope storage operations and enforce workspace authorization (implemented on review branch; not deployed).
- [ ] Configure identity provider and implement login/consent.
- [ ] Implement authenticated dashboard.
- [ ] Complete isolation tests and two-device pilot.

Migration 0004 is additive; migration 0005 rebuilds workspace tables and requires
a coordinated cutover. See [the isolation review](workspace-isolation-review.md)
for guarantees, tests, credential setup and rollout limits. No signup is exposed;
this must not be presented as completed end-to-end multi-user support.
