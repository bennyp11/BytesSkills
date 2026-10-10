# BytesSkills working instructions

Read README.md and docs/system-spec.md before changing the model. The /bytes interface is assistant-interpreted; the bundled Python artifact helper
is implemented. Do not claim /bytes is a native host or terminal command.

Preserve stable artifact identities, immutable revisions, exact input provenance,
and separation of parent, extends and derived_from relationships. Do not invent
production format rules from a format's name. Examples are not live artifacts.

The user wants GitHub backups as work proceeds, including workspace/. After each
completed logical change or generation batch, inspect, commit and push its files.
Preserve unrelated edits. Report failures honestly; do not claim remote backup before
push succeeds. Exclude credentials and caches, but do not silently exclude requested
workspace artifacts or media. Read workspace/README.md for large-file handling.

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
Export cloud revisions/blobs before committing workspace backups; see service/README.md. Reindex after Git sync or external
record changes. Never allocate IDs by guessing or write immutable records manually.
Return actual saved pointers. The ignored SQLite cache is not a backup artifact.
