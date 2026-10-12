# Parts 1–2: isolation review

This branch implements the account/storage foundation. It does not enable signup,
magic links, user-facing consent or a dashboard. Production has not been migrated.

## Review entry points

| File | Responsibility |
| --- | --- |
| `service/migrations/0004_accounts.sql` | Internal accounts, issuer/subject identities, private ownership |
| `service/migrations/0005_workspace_isolation.sql` | Tenant keys, composite foreign keys, indexes, scoped search and legacy backfill |
| `service/src/access.ts` | Server-issued context from active account and membership |
| `service/src/accounts.ts` | Atomic, idempotent provisioning from an already verified identity |
| `service/src/store.ts` | Scoped reads/writes, pointer resolution and R2 key construction |
| `service/src/releases.ts` | Global core releases; workspace adoption, receipts and workflow sessions |
| `service/src/index.ts` | Credential/claim boundary and legacy compatibility |
| `service/test/tenancy.test.mjs` | Two-account adversarial tests and direct SQL checks |
| `service/test/accounts.test.mjs` | Migration preservation and identity constraints |
| `service/test/release-credential.test.mjs` | Dedicated publisher cannot read user storage |

## Boundary and limits

D1 is a shared SQLite database: **it does not provide row-level security**. Our
Worker credential can read the entire database. Isolation from end users is enforced
by authenticated context plus scoped queries; composite keys and foreign keys defend
against cross-workspace relationships and writes. A compromised Worker or operator
credential remains outside this tenant boundary. Separate D1 databases/buckets per
workspace would be a different, stronger infrastructure isolation model.

R2 is one private bucket. Keys are `<workspace UUID>/blobs/sha256/<prefix>/<hash>`.
There is no cross-workspace deduplication. Users receive no R2 credentials or public
object URLs; reads resolve a permitted artifact first. `objectKey()` accepts only
canonical blob keys, rejects traversal/absolute/foreign-prefix strings, and takes
the prefix from a validated access context. The bucket binding itself is privileged,
not prefix-restricted by R2 IAM. Keep public bucket access disabled.

The context is issued only after an active membership and account check. Callers
cannot select a workspace through an artifact payload or query parameter. Existing
signed OAuth grants without an account ID remain confined to the legacy workspace;
new account-bound claims require active membership. Membership revocation takes
effect on the next request; an already-authorized in-flight request may finish.

The provisioning helper is internal. Its caller must verify issuer/subject using
the managed identity provider in part 3. No public route invokes it. It does not
match emails or let the first signup claim existing data. Concurrent provisioning
for one identity creates one account, one workspace and one membership. The legacy
account remains unclaimed until the explicit owner-verified login flow is built.

Current `/v1/*` workspace administration remains owner-key-only and bound to the
legacy workspace. New users will use account-bound MCP claims; their dashboard REST
adapter comes with login. User scopes, including `bytes:manage`, cannot publish or
revoke global core skills. There are no public import/export/admin endpoints for
new users. The test-only adapter under `test/fixtures/` simulates trusted verified
claims; its headers are NOT accepted by the production Worker and it is not bundled
into the production entry point.

## Database guarantees

- Artifact identity is `(workspace_id, id)`; revision identity is
  `(workspace_id, pointer)`. Identical UUIDs in two workspaces are independent.
- Heads reference the matching workspace, pointer, artifact ID, type and revision.
- Parent links, tags, search documents, edges and save receipts have same-workspace
  foreign keys. Parent-cycle triggers traverse only their workspace.
- Record JSON must agree with the SQL workspace/identity columns. Existing JSON and
  checksums are copied verbatim. Revision rowids are retained for export snapshots.
- FTS is a derived index of `search_documents`; insert/update/delete triggers maintain
  workspace-scoped entries. Search results join only the authorized workspace.
- Request IDs, adoption receipts and workflow IDs are unique within each workspace.
  Workflow-backed saves verify the workspace, expiration and release revocation in
  the insertion transaction. Immutable `revision_workflows` links use composite
  foreign keys to both the revision and session; imports without a verified session
  do not create that linkage. Migration backfills links only for matching sessions. Workflow provenance is validated by the MCP save path;
  arbitrary application metadata is not a database authorization capability.
- Adoption state is per workspace and uses the existing compare-and-swap trigger.
  Core publication invalidates previews across workspaces but does not adopt versions.

## Release credential separation

Set the Worker secret `RELEASE_KEY_SHA256` to the SHA-256 of a dedicated random
publisher credential, then replace the GitHub production secret currently named
`BYTES_OWNER_KEY` with that publisher credential. The historical GitHub secret name
can stay until a later cleanup. The publisher can only use `/v1/releases` and
`/v1/releases/revoke`; it cannot use workspace REST routes, MCP or owner consent.
Once configured, the owner credential cannot publish core releases, even via MCP.

Until that secret is configured, the existing owner credential is a documented
compatibility fallback for releases, limited to its existing legacy workspace for
creative data. Credential rotation/configuration is not performed by this PR.
Do not hand the owner key to a new user. Separate the credentials before onboarding.

## Migration and deployment gate

Migration 0005 rebuilds tenant-owned tables. **It is not compatible with the previous
Worker's positional INSERTs and singleton library state.** The normal release
preflight therefore blocks a release containing this migration when the live Worker
does not advertise `storage_contract: workspace-v1`. Merging this branch cannot
silently turn a normal migration-first deployment into an unsafe schema cutover.
The health field advertises code compatibility, not an independent database audit.

Before a production cutover: review the schema, rehearse migration and restore on
private staging data, check record/relationship counts, checksums, foreign keys,
search and R2 access, then schedule a maintenance window that stops requests and
drains in-flight writes. Preserve a verified private backup of D1 and the R2 objects.
Apply migrations and deploy the matching verified Worker while traffic is stopped;
validate it before resuming traffic. This coordinated cutover tooling/runbook still
needs rehearsal before execution. Do not use the ordinary migration-first workflow
for the first cutover. Later compatible releases can use it normally.

Do not roll back only the Worker after migration. Recovery requires the matching
schema/code pair. There is no automatic database downgrade in this PR. The source
release version has not been bumped and nothing has been deployed.

## Tests to review

The suite checks concurrent identity creation; preservation of legacy record bytes,
checksums, heads, tags, links, search, receipts, sessions and adoption state; same-ID
artifacts in different workspaces; guessed pointers and prefixes; search and cursor
filters; foreign parent/input/output/link writes; request-ID reuse; direct SQL foreign
keys; R2 hash reuse and foreign uploads; workflow/adoption isolation; disabled and
revoked memberships; and core publication privilege separation.

Run from `service/`: `npm run check`, `npm run build`, `npm test`. Miniflare uses
isolated ephemeral D1/R2. Production OAuth remains covered by existing tests; the
second-user login/consent and real cross-device pilot remain parts 3–6.
