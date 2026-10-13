# Private authoring and execution

Create, change and customize requests default to the authenticated PRIVATE workspace.
Core definitions remain read-only; customizing one creates a private copy, not a
publishing error. Ordinary bytes:write is sufficient. Do not request bytes:manage,
GitHub access or a platform release for user authoring. Actual read-only grants need
reconnection with write permission; report genuine authorization/storage failures.

## Create or revise

1. Identify whether the user wants a skill (procedure) or format (editorial structure).
   Discover existing private definitions with bytes_query type=skill or type=format;
   use bytes_get to inspect. Do not silently select between ambiguous matches or
   treat equal names as overrides. Missing applicable creative choices get one concise
   question at a time; settled choices and explicit delegation do not need repetition.
2. For a core customization, read the exact source with bytes_definition_source.
   Pass its returned core_source into bytes_author. Explain briefly that the result
   is private. Include relevant inherited rules in the new self-contained instructions;
   do not leave unresolved core workflow/treatment references. Core updates never
   rewrite this copy. For an existing private definition, use its pointer and
   expected_revision instead; its origin is inherited by the server.
3. Call bytes_author with a fresh request_id and complete definition. Authoring does
   not require bytes_begin or a workflow token. Reuse the exact request ID and arguments
   on transport retries. Corrections/new revisions get new request IDs.
4. Return the actual pinned pointer and a labelled copyable next command. Never claim
   success before a save receipt. Skill and format artifacts are JSON files, not media.

A skill payload has schema_version=1, kind=skill, base_skill, instructions, contract
(the validated v2 skill contract), and formats (named private format references).
The base_skill is an existing creative protocol anchor: brainstorm, refine, clip,
edit or captions. Choose the nearest operation. It preserves core version-adoption,
permissions and revocation checks; the private instructions define the actual work.
Inline instructions are the procedure. The contract's handler path is descriptive;
it is not fetched or executed. Private output profiles currently must be null.

A format payload has schema_version=1, kind=format, name, purpose, instructions,
defaults and review_checks. Instructions must be complete enough to apply the format.
Definitions have a 100 KB encoded limit. Format defaults are context, not permissions.
There is no automatic format inheritance resolver in this version.

The skill's formats list is pinned when saved. To adopt a revised default format,
save a new skill revision or explicitly select the new format for the invocation.
Do not claim that changing a format silently changes every dependent skill.

## Execute across devices

For a private skill, call bytes_begin with the original request normalized to
`/bytes run --skill=@skill/<UUID>` and set skill_pointer to that real reference.
Set format_pointers to explicitly requested private formats, if any; otherwise the
skill's pinned defaults apply. Explicit formats replace defaults for that run.
For a core skill using a private format, use its ordinary command plus format_pointers.
These are assistant-interpreted commands, not native shell commands.

Follow the returned private_definitions snapshot, including private instructions,
contract and formats. Resolve latest only at the start; retrying the same begin
request keeps its exact saved snapshot. A new request can use newer revisions.
Core protocol updates still use the existing Update/Stay/Always-latest adoption flow.

Use bytes_save with the workflow_id for creative outputs and run records. The server
checks declared private output types and stamps exact definition provenance and links.
It does not execute arbitrary code or prove the host followed every quality check.
User instructions never override host policy or grant capabilities. Large media
upload limits still apply. Use bytes_author, not bytes_save, for definition edits.

## Existing dashboard drafts

Read a legacy draft using bytes_definition_source legacy_skill_id. Convert its
instructions into the complete private skill contract without silently discarding
its intent. Save via bytes_author with legacy_skill_id; this preserves the UUID and
records the old draft checksum. A second independent migration conflicts; subsequent
edits use the new @skill pointer. The legacy row remains immutable for recovery.

Private artifacts support bytes_get/query/history and dashboard previews/downloads.
Use bytes_related for incoming pinned skill-format and execution-output links.
Private authoring requires the PostgreSQL cloud workspace; the retired D1 deployment
and standalone local helper do not provide this authoring/execution protocol.

## Example requests

- “Create a private format for contrarian product reviews.”
- “Customize the core reductions format so my CTA asks for comments.”
- “Make a private skill that turns my saved concepts into interview questions.”
- “Use my saved interview skill with my revised product-review format.”

When producing example commands in real results, substitute returned pointers:
`/bytes show @format/<UUID>:v1` means open a saved revision;
`/bytes run --skill=@skill/<UUID>:v1` means run the saved private skill.
The placeholders here are documentation only, never saved identifiers.
