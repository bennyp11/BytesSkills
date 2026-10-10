# Shared workspace (cloud MVP)

When the BytesSkills MCP tools are connected, use them for the active shared
workspace. Start with `bytes_workspace` to verify workspace identity and access.
Read `bytes_library` for the published definitions and contracts. Local checkout
files may be newer than the deployed library; record the actual versions used.
Do not mix local and remote writes to the same workspace or silently switch to
local storage if the connection fails.

Map `/bytes` operations to the shared tools:

- show: `bytes_get`; settings are in the returned record. For a tree, page through
  `bytes_query` with parent pointers, with a user-relevant depth/result bound.
- list/search: `bytes_query`; continue using next_cursor and identical filters.
- brainstorm: assistant generates after intake, then `bytes_save` each new candidate.
- refine: read the exact input, generate revised content, then `bytes_save` with
  pointer and expected_revision. Preserve ID; a conflict requires rereading.
- move/archive: `bytes_save` metadata-only revision with parent/status.
- history/references: `bytes_history` / `bytes_related`, with bounded pagination.
- clip: available media tools execute the editing workflow; large-media upload
  remains outside the 10 MB MVP upload limit. Never claim video saved remotely from
  a local path alone. Text plans can be saved using bytes_save.

Save inputs and derived_from as exact revisions. Use separate run records for
pending → succeeded/partial/failed execution, linking outputs. Every save requires
request_id: generate one UUID for that logical save. A network retry uses the same
ID and exact arguments. A changed request or later revision gets a new ID. Do not
retry with a new ID merely because the response was lost.

The shared envelope matches the local artifact contract except: cloud saves add
request_id; uploaded content uses its verified content descriptor instead of a local
file path. Type/title/content are required for new records. Other metadata is
optional and inherits on revisions; supplied maps/lists replace whole values.
The service enforces storage invariants, not creative format semantics. The assistant
still performs intake, resolves inherited settings and surfaces incompatible inputs.

The remote D1 database is authoritative. Local workspace files marked storage.mode
remote are read-only backup mirrors. Use the repository's service export script
before Git backup; never pretend cloud saves automatically push GitHub. Without
local tools, report cloud save confirmed and Git backup pending. `/bytes sync`
updates library source; it does not deploy that source or merge live D1 state.

Connection: https://api.bytesskills.com/mcp, Streamable HTTP, OAuth. Keys belong in
the login/credential flow, never in skill text, artifact content, or plugin manifests.
Do not claim this chat is connected until its MCP tools can actually be called.
