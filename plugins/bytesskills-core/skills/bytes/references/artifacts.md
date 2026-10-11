# Artifact runtime and workflow contract

For connected shared workspaces, use [cloud guidance](cloud.md). The Python commands
below apply to explicitly local workspaces; remote mirrors are read-only.

The bundled `scripts/artifacts.py` is a real local persistence/query runtime using
Python 3.10+ and SQLite with FTS5. It does not generate content or render video. Use
an explicit `--workspace` pointing to the user's workspace.json. No implicit home
folder or remote storage. Keep local workspaces outside Git. Run `reindex` after external record changes
before resolving pointers. Do not assume a cached index reflects another writer.

## Interface

Paths below are relative to the bytes skill directory; resolve them before calling.
The workspace and request paths are explicit, user-scoped filesystem paths.

```text
python3 scripts/artifacts.py --workspace WORKSPACE save --request request.json
python3 scripts/artifacts.py --workspace WORKSPACE get @concept/UUID --content
python3 scripts/artifacts.py --workspace WORKSPACE history @concept/UUID
python3 scripts/artifacts.py --workspace WORKSPACE query --type concept --format troll --tag share --text "tokens" --limit 20
python3 scripts/artifacts.py --workspace WORKSPACE related @concept/UUID:v1
python3 scripts/artifacts.py --workspace WORKSPACE reindex
```

`@type/<full UUID>:vN` is a canonical pinned pointer. Omit `:vN` for latest. An
unambiguous UUID prefix of at least eight characters is accepted for convenient
copy/paste; return full pinned pointers in machine records. Missing/ambiguous IDs
fail. Numeric IDs in older design examples were never allocated and do not resolve.
Pointers are scoped to workspace.json's UUID, not a computer path.

## Save envelope

```json
{
  "type": "concept",
  "title": "The AI bill monitor",
  "text": "The full authored concept goes here.",
  "status": "draft",
  "tags": ["share", "unexpected-costs"],
  "settings": {"format": "troll", "bait": ["share"]},
  "relations": {"inputs": [], "derived_from": []},
  "provenance": {
    "operation": "brainstorm",
    "operation_version": "1.0.0",
    "intake": {},
    "definition_versions": {},
    "settings_origins": {}
  }
}
```

For an update add `pointer` and `expected_revision` with the version just read.
Omitted fields inherit from the previous revision. Explicit fields replace their
previous value; a null parent removes it. Never remove body content for a status-only
change. `file` can replace `text` with `media_type`; media ingest currently reads
bytes into memory, so this version is intended for text and modest files. For large
video, keep the existing clipping batch flow until streaming ingestion is added.

Allowed types: brief, concept, hook, script, plan, video, image, audio, run.
Allowed statuses: draft, selected, approved, archived, pending, succeeded, partial,
failed. These are local lifecycle states; external systems can have different labels.
Metadata settings/provenance remain JSON objects; their creative schemas belong to
versioned workflow contracts, not arbitrary new columns per skill.

Relations (`inputs`, `derived_from`, `links`, `outputs`) are lists of valid pointers
and are pinned at save time. Concept `parent` is a stable identity relation and can
change in a later revision; it must not create a cycle. Reverse lookup through
`related` returns references to that exact revision across history, including old
and archived revisions. Do not present it as only current users of that source.

Query supports type, status, format, tag, parent, full-text words, limit and after.
Pass next_cursor as `--after` with the same filters. Cursor order is stable UUID order,
not relevance or creation order; paging is not a frozen snapshot while writers run.
Archived artifacts are excluded unless that status is explicitly requested. Full-text
search covers current title/body; binary contents are not transcribed or indexed.
`get --content` returns text or a local blob path. `history` preserves all revisions.

## How creative operations use it

1. Resolve real inputs and pin their revisions. Ask for unresolved creative fields
   according to intake rules; no extra questions for already established decisions.
2. Save a pending `run` record containing command, intake, resolved settings and
   definition versions. Record the operation/version from contracts/operations.json.
3. Produce content with the assistant or available tools. Save each output via this
   runtime, with inputs/derivation pinned, settings, tags, and run pointer in provenance.
4. Complete the run via a new revision with outputs and succeeded/partial/failed.
   Preserve completed candidates on partial failure. A retry is a new run.
5. Return actual runtime pointers and file links. Shared records and blobs belong in
   Cloudflare; explicitly local stores and recovery exports stay outside Git.

Report confirmed cloud persistence or local-only storage accurately. No Git step is required.
One save is atomic; an entire multi-output run is not. Record partial progress.

## Shared operations

- brainstorm: assistant generates candidates; save new IDs. Require concept input
  for hooks/scripts unless premise development was explicitly delegated; never create
  fake source references. `--parent` and `--from` remain distinct.
- refine: read latest, preserve meaning and supplied change, save a new revision
  with expected_revision. Old pinned targets require an explicit branch decision.
- show: get content; --history uses history; --settings shows saved values and origins.
  Tree is built by querying children for each parent with a visited set and depth limit;
  page every level instead of implying a partial result is the entire tree.
- list: query with filters; translate --query to --text and --cursor to --after.
- move: read latest and save parent change with expected_revision; only concepts.
- archive: read latest and save status=archived; single object only.

The assistant dispatches these operations; no native `/bytes` parser or generative
model service is bundled. It must use this runtime to make claims about saved pointers.

## Integrity and recovery

Immutable records live under records/TYPE/UUID/vNNNNNNNN.json; content lives under
blobs/sha256/PREFIX/HASH. Checksums chain revisions. Reindex verifies blobs, chains,
references and parents before rebuilding. A failed verification leaves a dirty marker
and reads fail closed. The writer lock is local and exclusive, not a distributed lock.
After a crashed writer, confirm no process owns the lock before removing only that
lock and running reindex. Do not remove immutable records to hide corruption.

After external local record changes, run reindex and resolve conflicts before further writes. Two
machines editing the same artifact revision concurrently still need explicit merge
resolution. UUIDs reduce independently-created object collisions, not competing
edits to one object. No automatic last-writer-wins or distributed transaction claim.
