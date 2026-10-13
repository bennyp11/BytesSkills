# Shared skill releases and adoption

For every new `/bytes` request, call `bytes_begin` with the exact command and a new
UUID request_id. The returned instructions and resources are the selected immutable
skill release, not a mutable latest document. Continue clarifications and retries
within that workflow; a separate user operation starts a new workflow. Never reuse a
workflow merely to avoid checking for updates.

If `status=update_available`, show current version, latest version and change summary.
Ask **Update**, **Stay on this version**, or **Always use latest**. Initial adoption
has no old version to keep. Use `bytes_adopt` with the response's exact state revision,
catalog hash and skill. Recheck after a conflict; do not silently apply a decision to
a different release. Stay suppresses this particular update, not future releases.
Preferences are shared by this workspace across devices; they are not chat-local.
Automatic adoption never expands permissions. Publishing permission is separate.

`/bytes sync --check` calls `bytes_updates` and reports changes without adopting.
`/bytes sync --latest` explicitly authorizes ONE bulk adoption: call `bytes_updates`,
then `bytes_adopt` action=sync with the returned state_revision and catalog_hash and
no skill. This adopts every current compatible release atomically. It preserves
ask/auto preferences for future updates. Do not ask about each skill again. A
concurrent publication/preference change requires refreshing the preview and reporting
what changed before retrying. Bare `/bytes sync` asks whether to check or adopt latest.
These control requests may inspect/apply adoption even if their begin response reports
an update; they must not be blocked by the update question they are intended to resolve.

`/bytes sync --git` uses the separate local Git procedure. It does not publish skill
releases, select cloud versions, or reload a host's plugin metadata. Never interpret
library sync as permission to merge Git files, export workspace content, or run code.

After `status=ready`, use its workflow_id for every `bytes_save` in that operation.
The server supplies skill/version/checksum provenance and rejects missing, expired,
read-only, or revoked workflow sessions. Sessions last 24 hours. Existing work stays
pinned when new releases appear; expiration requires a new begin, with generated
content retained for review rather than discarded. This proves which instructions
were issued, not that a model followed them perfectly.

Private authoring uses bytes_author directly and does not publish platform releases.
See private-library.md for private copies and pinned execution.

Platform publishing (operator only): show the proposed instructions and summary; publish only when the user
asks. `bytes_publish` needs a platform operator credential and the separate `bytes:manage` scope.
Ordinary user customizations must use bytes_author instead. Publish a new semantic
version; never overwrite a published one. Include the complete required instructions
and resources in the release, so a pinned workflow cannot mix in current definitions.
Do not promote ordinary artifact content into instructions without an explicit request.
The server treats releases as text and never executes packaged code. An admin can
also publish via `service/scripts/publish-library.mjs`; Git is optional.

Version checks cannot run while a chat is idle. A disconnected chat must disclose
that freshness is unverified and must not claim a cloud save. The installed entry
skill and tool metadata require a one-time host update/refresh for this protocol.
Future instruction-only releases use the existing tools without reinstalling.
