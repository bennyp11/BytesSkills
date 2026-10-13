# Private library acceptance and release

Release 0.12.0 adds bytes_author and bytes_definition_source, plus skill_pointer and
format_pointers on bytes_begin. Existing connectors need a tool metadata refresh;
reconnecting may be required by the host. Core version adoption remains separate.
Publishing the GitHub release deploys the reviewed PostgreSQL migration before the
Worker; merging alone only prepares the release. Do not claim another chat has new
tools until it actually exposes them.

## Data and security

Private skill and format definitions use ordinary revision records and JSON blobs in
workspace-prefixed R2 storage, with @skill/UUID:vN and @format/UUID:vN pointers.
Existing PostgreSQL FORCE RLS, composite workspace foreign keys, immutable-revision
triggers and write-role limits apply. No new publisher rights or tenant table is added.
The migration expands the existing type constraint and adds an immutable optional
workflow snapshot. Existing records/checksums remain untouched. D1 is compatibility
only; private authoring is explicitly PostgreSQL-only.

Core-source provenance records the published skill, version, checksum and optional
resource path. The original release stays immutable. Creating a customization does
not change anyone's default selection or implicitly override equal names.

A private skill refers to format artifact revisions. An explicit format selection
replaces defaults for that run. Every begin snapshot pins its exact definition bytes
and checksums; repeated request IDs reuse it across devices. Output saves stamp these
references and links. The core protocol anchor still gates permissions and revocation.
No arbitrary instruction code is executed by the server. Capability/creative quality
checks remain host responsibilities; declared private output artifact types are
checked by the MCP save path.

Old dashboard drafts remain available. Migration is on demand through authoring:
read the draft, prepare a full contract, and pass legacy_skill_id to bytes_author.
The UUID is preserved and the old checksum recorded. Existing dashboard links redirect
to the new skill artifact after migration. Concurrent independent migrations conflict;
ordinary subsequent edits append revisions using the new pointer.

## Cross-device manual scenarios

1. In chat A ask “Create a private format for short contrarian explainers.” Answer
   necessary clarifiers. Confirm a real @format pointer, private scope and JSON content.
2. In chat B on the same account, fetch that pointer. Confirm its exact revision and
   instructions; no Git operation or platform publishing is required.
3. Ask chat B to use a core brainstorming skill with that private format. Its begin
   response must contain the exact format revision in private_definitions.
4. Ask chat A to create a private brainstorming skill using the format. Confirm the
   @skill artifact contains a validated v2 contract and pinned default format reference.
5. Run it in chat B. Confirm outputs refer to both private skill and format revisions.
6. Revise the format in A. A retry of the previous workflow stays pinned. A new run
   explicitly selecting the latest format uses the new revision. An unchanged skill
   default remains pinned until that skill is revised; the UI/assistant must explain this.
7. Customize a core format. Confirm a private artifact with core-source provenance,
   and verify the original core release is unchanged. No bytes:manage request should occur.
8. Attempt to fetch the pointers using a second user's account. Reads, edits, execution
   and blob access must fail without exposing another workspace's content.
9. Submit competing edits from A and B at the same expected_revision. One wins; the
   other receives a conflict and must reread. No silent overwrite.
10. Retry an identical save with the same request ID after newer revisions exist.
    It returns its original receipt. Reusing that ID with different input is rejected.
11. A read-only connection can inspect private definitions but cannot author or run a
    write-requiring workflow. Reconnect with bytes:write; never request core management.
12. Migrate a legacy dashboard draft. Confirm its UUID and source checksum, readable
    old draft, new version history and redirected dashboard link.

CI uses isolated PostgreSQL and synthetic tenants for these boundaries, plus MCP
request/response tests and the existing browser tests. It does not demonstrate that
an external AI host will always select the right tool; the manual trials cover that.
