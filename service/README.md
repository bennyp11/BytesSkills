# BytesSkills cloud MVP

One private workspace, served at https://api.bytesskills.com. MCP endpoint:
`https://api.bytesskills.com/mcp`. The apex https://bytesskills.com is a landing page.

## Components

- Cloudflare Worker: authenticated API, stateless Streamable HTTP MCP, connection page.
- D1: immutable record envelopes, current heads, relationships, tags, FTS5 search and idempotency receipts.
- R2: private content blobs at `<workspace UUID>/blobs/sha256/<prefix>/<hash>`.
- Workers KV: OAuth client registrations, grants and token state managed by Cloudflare's OAuth library. It does not hold artifact state.
- GitHub: definitions, skills, source, migrations and explicit workspace backup exports.

Cloud records are authoritative in D1. Heads, tags and search are derived, updated in
one transaction alongside a revision. Original local records import unchanged,
including their IDs, revision numbers, checksums and provenance.

## Connect

Use the MCP URL above and OAuth. Client registration supports both dynamic
registration and Client ID Metadata Documents. The consent page asks for the owner
workspace access key and displays the client, redirect destination and permissions.
Select write permission to create/refine artifacts. Read-only grants cannot save.

The owner key is generated into `service/.secrets/owner-key.txt` (mode 0600,
Git-ignored). Store it in your password manager. Only its SHA-256 hash is deployed
as `OWNER_KEY_SHA256`. Do not put the key in a plugin, chat prompt, Git or a URL.
OAuth clients receive separate expiring access tokens and refresh tokens, not the
owner key. API administration can use the owner key as a bearer credential.

Connecting a host is separate from deployment. No host installation is claimed by
this repository. The core plugin includes portable `mcp.json` and a Claude overlay.

## MCP tools

`bytes_help`, `bytes_workspace`, `bytes_library`, `bytes_get`, `bytes_query`, `bytes_history`,
`bytes_related`, `bytes_save`. Workflow definitions are bundled into the Worker;
read them with bytes_library before generating. The AI performs creative work.
There are no server-side model calls or rendering jobs.

`bytes_save` accepts the local envelope, with a mandatory `request_id` UUID.
Use one ID per logical save and reuse the same arguments/ID for network retries.
Revisions require `pointer` and `expected_revision`. Metadata fields replace whole
values; omission inherits. Parent is identity-based; relations pin revisions.
Database triggers enforce sequential revisions and parent-cycle prevention inside
the transaction, including concurrent moves. Invalid/stale writes return 409.

## API

All `/v1/*` routes require `Authorization: Bearer <owner key>`; OAuth is used at MCP.

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/health` | Public service version/liveness; not a database readiness guarantee |
| GET | `/v1/artifact?pointer=...&content=true` | Resolve/get |
| GET | `/v1/query?type=concept&format=troll&text=tokens` | Filter/search; `limit` and `after` pagination |
| GET | `/v1/history?pointer=...` | Revisions; integer `after`, `limit` |
| GET | `/v1/related?pointer=...` | Incoming exact-revision edges; cursor `after`, `limit` |
| POST | `/v1/save` | Same envelope as bytes_save |
| PUT | `/v1/blobs/<sha256>` | Upload bytes, verify checksum, deduplicate |
| GET | `/v1/content?pointer=...` | Authenticated content download as attachment |
| POST | `/v1/import` | Import a verified immutable record after dependencies/blob |
| GET | `/v1/export` | Revision pages at stable insertion watermark; preserve returned `snapshot` and `next_cursor` |
| GET | `/v1/library?path=...` | List/read bundled definitions |
| GET | `/v1/grants` | List owner OAuth grants; cursor pagination |
| POST | `/v1/revoke` | Revoke `{ "grant_id": "..." }` |

## Development and deploy

Node 22+, `npm ci`, `npm run check`, `npm run build`, `npm test`.
Build before tests: the integration suite executes the bundled Worker in Miniflare,
with real local D1/R2/KV implementations. `npm run dev` runs the local service.

`wrangler.jsonc` records real account/resource IDs and custom-domain routes. The SQL
migration is in `migrations/0001_artifacts.sql`. For another deployment, create a D1
database, private R2 bucket and KV namespace:

```sh
npx wrangler d1 create bytesskills-mvp
npx wrangler r2 bucket create bytesskills-mvp-blobs
npx wrangler kv namespace create OAUTH_KV
```

Skip resource creation for this already-provisioned deployment. Replace IDs, workspace UUID and domains
in config/schema/OAuth resource metadata, then:

```sh
npm run db:remote
npm run deploy
npx wrangler secret put OWNER_KEY_SHA256
```

The secret value is the lowercase SHA-256 hex digest of a cryptographically random
32-byte owner key, not the key itself. Public access remains denied without it.
Never overwrite another existing domain route while provisioning.

`npm run build` regenerates the published library from repo definitions and
contracts. Release source and definitions together; record library and definition
versions in artifact provenance. No automated GitHub deployment workflow is enabled.

## Import, backup, restore

```sh
node scripts/workspace.mjs import ../workspace
node scripts/workspace.mjs export ../workspace
node scripts/smoke.mjs
```

Scripts read `.secrets/owner-key.txt`; `BYTES_KEY_FILE` overrides the key path for
workspace scripts. `BYTES_URL` overrides the service origin. They never print keys.
Import uploads/checksums blobs, then imports revisions in dependency order and can
resume safely. Export captures an insertion watermark, downloads exact revisions
and verifies every blob checksum. It refuses conflicting local revisions. Exports
mark the workspace as a read-only mirror of the remote authority. Reindex the local
mirror after export to inspect it offline. Commit/push exports after creative work;
cloud saves do not automatically create GitHub commits.

Restore into an empty deployment with the same workspace ID: apply migrations,
configure resources/auth, then import a complete verified export. Retain the source
backup until you have verified reads, search, history and checksums. Import fails on
missing/cyclic dependencies rather than inventing them. No permanent deletion API.

Rotate the owner key by replacing its deployed hash; this stops use of the old owner
key but does not revoke existing OAuth grants. Revoke grants separately through the
admin API when needed. OAuth KV is separate from creative-workspace exports; a new
KV namespace requires clients to authorize again. Do not restore token state from Git.

## MVP boundaries

Single owner and workspace; no team roles, offline writes or cross-workspace sharing.
Uploads are capped at 10 MB, inline text at 100,000 characters, requests at 300 KB;
large video needs a later multipart/direct-upload path. Queries page by UUID, not
relevance, and ordinary pagination is not a frozen snapshot. History/export are
bounded. Text is indexed; audio/video are not automatically transcribed.

Blob upload and D1 commit are not one distributed transaction: the blob is verified
first, so a failed save can leave an unreferenced blob. No automatic blob deletion is
implemented. Database growth, auth endpoints and operational quotas need monitoring
before opening this to more users. The integration tests exercise correctness, not
production load capacity. D1 read replication is disabled for simple current reads.

### Command discovery in ChatGPT

Connecting MCP supplies tools, not a native slash-command registration or automatic
installation of the local skill package. Refresh the custom connection after tool
metadata changes, start a new chat, select @BytesSkills, then send `/bytes help`.
The read-only `bytes_help` tool returns the deployed command contract and cloud
workflow instructions; the assistant interprets subsequent `/bytes` requests.
ChatGPT tool selection must still be verified in the client.

### Versioned skill releases (service 0.2.0 / plugin 0.7.0)

See [release architecture](../docs/skill-releases.md). New tools: `bytes_begin`,
`bytes_updates`, `bytes_adopt`, `bytes_publish`. MCP `bytes_save` now requires the
workflow_id from bytes_begin. Refresh existing custom MCP connections once.

Apply migration 0002 before deploying this server. Build/publish the release JSON,
then explicitly adopt it through bytes_updates + bytes_adopt. Database migration
alone creates no selections or published skill content. Deploying Worker code does
not publish or adopt an instruction release. This separation prevents accidental
updates from a code deploy.
