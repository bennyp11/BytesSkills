# BytesSkills system specification

Status: evolving specification with an implemented local artifact runtime. See
[pointer architecture](pointer-architecture.md) for implemented behavior and limits.
Historical numeric pointers in examples are fictional.

## Purpose

Make content workflows easy to invoke while preserving creative context, editable
formats, nested ideas, stable references and all generated candidates. Use the shared
Cloudflare workspace for creative data; GitHub stores core code and reusable definitions only.

## Vocabulary

| Entity | Meaning |
| --- | --- |
| Brief | Objective, audience, source material and constraints for a piece |
| Format | Reusable editorial structure, required inputs, workflow and defaults |
| Treatment | Reusable presentation choices: rhythm, music, SFX, framing, captions and generated visuals |
| Workflow | Named sequence of stages and expected inputs/outputs; stages may be invoked individually |
| Skill | Instructions for one operation within a stage |
| Command | User-facing request that selects an operation and supplies parameters |
| Artifact | Saved output or input: concept, hook, script, plan, image, audio or video |
| Revision | Immutable content and metadata snapshot of one artifact |
| Run | Saved invocation, resolved inputs/settings, status and output pointers |
| Production specification | Snapshot of resolved creative choices used by a run |
| Plugin | Distribution package containing skills and platform configuration |

A concept is an idea at any level of specificity. A hook is an opening attached to
an idea. A script develops an idea and optionally a selected hook. A plan describes
execution; media is the resulting file. Avoid new entity types until they carry
meaningful distinct rules.

## Relationships

- `parent`: organizational/conceptual containment. A concept has at most one parent.
  A child concept should narrow or develop that parent. Cross-links and tags allow
  other associations without duplicating the concept.
- `extends`: definition inheritance. A format has at most one base format in v0.1.
  It is explicit; folder nesting never establishes inheritance.
- `derived_from`: exact source revisions used to create an artifact revision.
- `inputs`: named run inputs such as concept and hook, pinned to exact revisions.
- `links`: additional references without inheritance or derivation semantics.

Validate types, missing targets and cycles before changing parent or extends
relationships. Moving or renaming an object preserves its ID. Moving a concept
changes organization only; it does not rewrite creative settings or provenance.
Refinement of a parent does not silently update children or downstream scripts.

## Pointers and identity

Implemented pointers use `@concept/<UUID>` or `@concept/<UUID>:v2`. An unambiguous
UUID prefix of at least eight characters is accepted. Records store full pinned
references. Omitted revisions resolve to latest when the operation starts. IDs are
stable and independent of titles or file locations. Older numeric examples were
never allocated. UUIDs avoid requiring a shared counter across future writers.

The workspace has its own stable ID. Shorthand pointers resolve only in the active
workspace. Cross-workspace merging is outside v0.1; never resolve an ambiguous
reference by guessing. Runs are records with lifecycle status rather than creative
artifacts subject to `/bytes refine`.

## Context resolution

1. Parse and validate the command and pointer types. Run clarification-first intake
   for unresolved creative fields as specified in commands.md; omitted values are
   not permission to choose defaults.
2. Resolve pointers once to exact revisions.
3. Find the chosen format: explicit selection first, otherwise compatible input
   context, otherwise ask if the operation needs a format.
4. Resolve library defaults, base-to-child format defaults and selected treatment.
5. Apply compatible settings already carried by input artifacts.
6. Apply explicit command overrides, then validate all constraints.
7. Save values AND the source of each value in the run specification, including
   intake answers and explicit delegation. Defaults resolve after intake; they do
   not bypass a question about an unresolved user-facing field.

Precedence: library < base format < child format < treatment < inherited artifact
settings < explicit arguments. An explicit format change rebuilds format/treatment
settings from the newly selected definitions; stale inherited defaults from the
old format must not leak through. Preserve source content and explicitly compatible
brief constraints. Present unresolved incompatibilities before generating.

Multiple inputs with conflicting formats or values have no implicit winner. Ask
for a decision or require an explicit resolving argument. A hook tied to a different
concept revision is a potential content conflict even if formats match. Surface it;
never silently relink or rewrite either input. Explicit overrides can resolve a
choice, but cannot silently bypass hard constraints or missing capabilities.

Proposed merge convention: merge maps by key, replace lists as whole values, and use
explicit `none` for disabled optional features; omission means inherit. Each setting
must declare its type and permitted values. Do not let arbitrary flags invent new
settings. Keep defaults separate from requirements and prohibitions.

Definitions are versioned; runs record definition IDs, versions, source snapshots
and the repository commit when available. Existing artifacts retain their resolved
specification when a definition changes. Definition edits govern future runs.

## Generation, refinement and persistence

Brainstorming produces new candidate IDs. `--parent` creates narrower child concepts;
`--from` produces alternatives derived from a source without making it their parent.
Refinement appends a revision to the same artifact. Content and provenance in old
revisions are immutable. Status, title, tags and parent changes also receive revision
history so reorganization is auditable.

Save every successfully produced candidate and return its pointer. A run starts as
pending and ends succeeded, partial or failed. Partial outputs stay available, with
errors recorded; never call failed work complete. Record the original command,
exact inputs, settings with origins, output pointers and capability limitations.
Save media bytes alongside metadata, rather than treating temporary remote URLs as
persistent files. Never report an artifact saved until its files are present.

A minimal local implementation can use one writer per workspace, staged writes
and atomic file replacement for current pointers. Recovery must not reuse IDs or
expose an incomplete revision as current. A retry creates a linked run; it must not
silently masquerade as the original invocation.

## Growth and cleanup

Use tree views with depth limits, search, type/status/tag filters and pagination.
Archive rather than delete by default. Archived objects remain resolvable and keep
existing links valid, but are excluded from ordinary lists. Permanent deletion is
outside the initial command set and must inspect incoming references first.

## Scope

Local pointer resolution, immutable revisions, search, relationships and persistence
are implemented. The assistant handles generation and context resolution using these
contracts; no native slash parser or autonomous generation service is bundled.
The MVP branch implements authenticated remote storage and concurrent-write checks;
see [service](../service/README.md). Large streaming media and multi-user tenancy remain future work.
The reductions draft is grounded in the user’s editorial description; see
[reductions.md](reductions.md). Its sound palette is proposed and has no audio assets.
