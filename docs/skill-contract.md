# Skill contract v2

Status: source authoring contract with CI validation and release packaging. This
is not a new runtime executor, media uploader, package installer or permission system.

## Shared structure, optional content

The core owns identity, pointer resolution, revisions, authorization, help and skill
adoption. A skill defines an operation. A format defines editorial structure; a
treatment defines presentation; an object profile defines a versioned shape on an
artifact type. A package can collect those definitions without changing their meaning.
Users' artifacts and private skill drafts are not platform definitions.

The intended onboarding model is an empty personal workspace plus a choice of
starter packages. The existing Content Creator workflows are our reference examples,
not universal preferences. Package selection and public user publication remain future work; private copies
and execution are now supported through the MCP private-library flow. this change does not give users a path to platform publication.

## Authoring source

Start with `templates/extensions/skill.json`. JSON Schema lives at
`plugins/bytesskills-core/skills/bytes/contracts/skill.schema.json`; its canonical
implementation is `service/scripts/skill-contract.mjs`. Regenerate the structural
schema with `node scripts/export-skill-schema.mjs` from service. CI also checks semantic
relationships that JSON Schema alone cannot express.

| Field | Meaning |
| --- | --- |
| schema_version | Version of the authoring document shape, now 2 |
| id / version / status | Stable skill identity, definition version and editorial maturity |
| command / natural_language | Existing canonical command, positive/negative routing examples and ambiguity question |
| parameters | Typed values, flag vs conversation interface, applicability, questions, delegation and eligible inheritance sources |
| parameter_rules / intake_order | Conditional constraints, alternative groups and clarification order |
| outputs | Named deliverables with artifact type, media types, creation/revision behavior, delivery location, optional pinned profile and checks |
| capabilities | Host capabilities needed by specific outputs and what to do when unavailable |
| effects | Declared workspace writes, local writes or computer control; never an access grant |
| failure | Shared partial-result, identical-retry and revision-conflict rules |
| handler | Existing, packaged execution instructions |
| execution_contract / response_contract | Required shared behavior and response references |
| quality_checks | Outcome-specific acceptance criteria |

`required` applies only when `applies_when` holds. The applicability expressions,
parameter rules and quality checks are plain language interpreted by the assistant,
not executable predicates. Group alternative selectors into one clarifier. The
command reference remains authoritative for allowed syntax; adding a conversation
input must not invent a flag. Defaults never replace unresolved creative answers.

An output profile is either null or `{ "id": "episode-plan", "version": "1.0.0" }`.
That example requires an actual matching profile file before use. CI verifies its
version and base type. It does not yet validate generated profile bodies at save time.

## Production and file contract

A `script` is an artifact type, `reductions` is a creative format, and
`text/markdown` is a media type. Each current artifact revision still has one primary
blob. Multiple declared outputs mean multiple artifacts, not multiple attachments.
Run records are shared execution bookkeeping, not creative deliverables in outputs.

Text passed to bytes_save is currently Markdown. JSON, images, audio and video need
verified bytes with their real media type. Authoring an output declaration does not
add file conversion or upload support. Large files remain subject to the current
upload limit. A local video export is explicitly local-only and cannot receive a
made-up cloud pointer. A saved plan does not satisfy a promised video output.

Filename handling, exports, large uploads, retention and usage billing are separate
storage work. This contract gives those systems declared output expectations without
claiming they have been implemented.

## Validation and execution boundary

`npm run check:library` validates all source definitions, the template, schema freshness,
known artifact types, intake coverage, inheritance input names, output/capability
references, media families, profile references, handlers and runtime route agreement.
Current source skill definitions must use v2. The legacy v1 reader remains available
for historical authoring documents; released snapshots are never rewritten.

The shared execution contract is embedded in every newly built skill release. Relevant
creative releases include version-pinned definitions and the structural schema.
The host assistant follows them; the service still enforces its existing OAuth,
workspace access, idempotency and revision rules. There is no new server-side semantic
validation of generated content or capability availability. Draft status describes
maturity, not an access-control or activation gate.

Reference migrations: brainstorm (Markdown candidates), edit and captions (plans plus
verified video exports). Refine, clip and system routes continue under their existing
operation contracts until their dedicated authoring definitions are added. This avoids
inventing capabilities or replacing tested handlers merely to populate a catalog.

## Version and release rules

Definition version, authoring schema version, published skill-release version and
artifact revision are distinct. Bump the definition version for changed behavior;
use a new major definition version when existing required inputs or output semantics
break compatibility. Publish a new immutable release through the existing pipeline.
Contract v2 does not change artifact record schema v1 or any saved pointer.

A request uses the selected release's pinned definitions from bytes_begin. New source
files are not live across devices until released and adopted. Do not mix discovery
resources from a newer release into an already pinned workflow.

## Review scenarios

- Equivalent natural language and command requests select the same skill and inputs.
- An inherited format skips a question; conflicting inputs prompt for resolution.
- “Idk” delegates one creative choice, never a missing source file or pointer.
- A metadata-only edit preserves content; a new candidate gets a new identity.
- Missing CapCut access prevents claiming a completed edit, while a saved plan survives.
- An interrupted save retry returns its existing receipt; revision conflicts do not overwrite.
- Results identify actual file types, saved pointers and what follow-up commands do.

Automated contract/release tests cover structural invariants and packaging. These
scenarios also need real host trials; static validation cannot prove model compliance.
