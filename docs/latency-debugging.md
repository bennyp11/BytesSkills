# MCP latency diagnosis

The Worker emits one structured `bytes.mcp_request` log per `/mcp` HTTP request.
Cloudflare Workers Logs is already enabled with invocation logs disabled. This change
adds no logging database, outbound logging requests, or new MCP tool/schema.
All requests are logged during this low-traffic diagnostic phase. Before increasing
traffic, review Workers Logs volume/retention and introduce a documented sampling
policy; keep slow requests and failures. Retention is controlled by Cloudflare's
account/product configuration, not by this code. No custom retention is claimed.

Each event contains a server-generated request ID, release version, allowlisted RPC
method/tool name, HTTP status, tool-handler error status, response-ready duration,
a slow flag (2 seconds), and aggregate duration/count per fixed stage:

- `request_body`: bounded request-body reading.
- `oauth`: provider dispatch until the authenticated API handler is entered;
  includes provider/token work, not only cryptographic authentication. On rejection
  it measures dispatch until response-ready.
- `membership`: workspace membership authorization, including its database work.
- `tool`: tool handler work, including its database and blob calls.
- `db_connect`, `db_setup`, `db_query`, `db_commit`, `db_rollback`, `db_close`:
  aggregate transaction timings across the request. Setup includes transaction
  settings, role/RLS verification, identity configuration and advisory locks.
- `blob_get`, `blob_read`, `blob_put`, `blob_head`: Store content operations;
  get measures metadata/stream acquisition and read measures consuming content.

Stages are nested and must NOT be added together as a total. Counts expose repeated
transactions/queries. HTTP 200 can contain an MCP tool error; tool-handler errors
populate `tool_error_status`. SDK validation/protocol errors before a handler may
have no tool error status; inspect the client's protocol result too.

No arguments, artifact contents, pointers, SQL, SQL parameters, account/workspace IDs,
email addresses, tokens, raw URLs, client request IDs or exception messages are emitted
by this telemetry. Unknown method/tool labels become fixed categories. Request IDs
are returned in `X-Bytes-Request-Id`, tool-result `_meta["bytes/request_id"]`, and logs.
`Server-Timing: bytes;dur=...` reports elapsed time to response construction. These
headers/metadata may not be displayed by the AI host. Logs cannot measure client
network transit, time between calls, model reasoning, or answer generation.

## Reproduce without creating workspace data

1. Deploy the reviewed instrumentation release through the normal release workflow.
2. In Cloudflare, open the `bytesskills-mvp` Worker's Logs view and filter structured
   messages for `bytes.mcp_request`. Record UTC time and release for the experiment.
3. In one new AI chat, request one `bytes_workspace` call. Record displayed duration.
4. Request one `bytes_get` call for a known exact format pointer, with content included.
   Do not run begin, version adoption or discovery just to read a known artifact.
5. In a separate new chat, ask naturally to find and return the same format. Record
   the actual tool sequence and each call's displayed duration. Repeat three times
   sequentially to distinguish the first request from later requests.
6. Match request IDs where available; otherwise use timestamps and tool sequence in
   this quiet test window. Without identity logs or a shared conversation trace ID,
   timestamps alone are not reliable attribution during concurrent user traffic.
7. Compare response-ready server durations with displayed call durations and overall
   interaction time. A gap is outside the measured handler; it does not prove which
   client/network/model component caused it. High setup/connect times warrant a
   database investigation; many fast calls warrant a workflow/tool-selection review.

Do not disable membership, role checks, RLS or transaction-local identity to improve
latency. Measure first. The initial hypothesis is that per-operation transaction setup
adds round trips; production timings must confirm its actual contribution.

## Updating the installed integration

Skill adoption (`/bytes sync --latest`), server deployment and host tool discovery
are separate. In our cross-device test, the custom MCP **Refresh** control was
available in ChatGPT's browser interface, not its desktop plugin controls. Refresh
there when tool schemas change, verify the advertised tool names, then test in a new
desktop chat. Disconnect/reconnect authentication does not prove tool metadata updated.
This instrumentation release itself adds no tools and does not require a schema refresh.

## Artifact-read optimization (0.12.2)

A known-pointer show should call `bytes_get` directly. Discovery uses `bytes_query`;
only ambiguous results need clarification. No workspace or workflow preflight is
required for these read tools. This changes assistant routing, not authorization:
OAuth, membership checks and database RLS still apply to every artifact read.
Execution and saves retain their workflow/adoption requirements.

To verify after deployment, ask the same connected client to show the same brief
pointer several times in fresh requests. Record wall-clock time and the tool list.
Expect one `bytes_get` tool call, not workspace → begin → get. Compare server get
latency separately from total chat latency; protocol initialization and model time
can remain. Instructions guide the host but cannot enforce its tool selection.
If the host keeps using cached tool descriptions, refresh the connection metadata
in ChatGPT's browser settings. Refreshing is not a substitute for deployment.

Next optimizations, measured independently:
- Consolidate pointer resolution's prefix lookup and revision read while preserving
  missing/ambiguous pointer semantics and workspace filters.
- Reuse a short transaction for related database work where safe, without retaining
  a transaction across object-storage calls or AI execution.
- Investigate protocol housekeeping costs; any fast path must explicitly allowlist
  non-content methods after token validation and fail closed for unknown methods.
- Benchmark Worker placement near PostgreSQL against current placement. Do not infer
  backend latency from the user's location or the presence of a CDN.

## Web-first viewing (0.12.3)

Cloud MCP artifact results include a presentation-only `web_url` for the exact
revision; it is not part of stored records or their checksums. Save/author/get and
paginated artifact results can link to the existing authenticated web viewer without
an extra content fetch. Show/open defaults to metadata-only retrieval plus a link;
explicit in-chat reading and analysis continue to fetch content. The public viewer
URL is not a sharing credential: browser sign-in and workspace authorization apply.

The web app supports browsing/search/sorting, opening a pasted pointer and copying
a revision link. Signed-out artifact links survive the magic-link sign-in flow.
This release does not introduce private-content caching, prefetching or an instant
load guarantee. It avoids model orchestration for ordinary browsing and viewing.

## Automatic listing refresh (0.12.4)

The artifact browser checks its existing authenticated page every five seconds
while visible. It replaces only the result list when it changes, preserving active
filters, pagination, unsent filter edits and page state. Focused list controls or
selected text defer replacement. New results must match the current filters/page;
use Recently updated on the first page to watch newly saved work arrive.

Pause/Resume is available. Hidden tabs do not poll; failures back off to at most one
check per minute, and explicit authentication/authorization denials stop checks.
Every check repeats session and workspace authorization. No private response is
cached in browser storage. This is polling, not streaming: completed saves appear
on a later successful check, not token by token. Open artifact detail pages stay
pinned to their selected revision. Each visible browser makes up to 12 checks per
minute; measure traffic before expanding to large user counts or adding push.
