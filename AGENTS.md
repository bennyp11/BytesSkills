# BytesSkills working instructions

Read README.md and docs/system-spec.md before changing the model. The /bytes interface is assistant-interpreted; the bundled Python artifact helper
is implemented. Do not claim /bytes is a native host or terminal command.

Preserve stable artifact identities, immutable revisions, exact input provenance,
and separation of parent, extends and derived_from relationships. Do not invent
production format rules from a format's name. Examples are not live artifacts.

GitHub stores core code, schemas, reusable definitions and packaged skills only.
After each completed logical source change, inspect, commit and push relevant files.
Never stage workspace records, blobs, exports, local caches or credentials, even
with force-add. Cloudflare D1 and R2 are authoritative for shared workspace data.
Preserve existing ignored local copies. See docs/workspace-storage.md.

Generation and refinement use clarification-first intake. Ask about each unresolved
applicable creative input before generating; accept “idk” as delegation for that
field. Preserve clear inherited inputs and do not re-ask settled choices. See
docs/commands.md for intake order and the distinction between defaults and answers.

For explicit BytesSkills /bytes sync requests, use
plugins/bytesskills-core/skills/bytes/references/sync/instructions.md. Do not equate a Git pull with
refreshing a cached plugin. Preserve workspace identities and revision history; stop
for semantic conflicts even when Git can merge the text. /bytes sync --help is read-only.

All new pointer-backed saves and queries use the shared runtime and operation
contracts: connected MCP service for remote workspaces, artifacts.py for explicitly
local workspaces. Never save locally to a workspace marked storage.mode=remote.
Keep any explicitly requested recovery exports outside Git checkouts; see service/README.md. Reindex explicitly local stores after external
record changes, not ordinary code sync. Never allocate IDs by guessing or write immutable records manually.
Return actual saved pointers. The ignored SQLite cache is not a backup artifact.
