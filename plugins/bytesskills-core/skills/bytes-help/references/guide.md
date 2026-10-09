# BytesSkills command guide

## Quick overview

BytesSkills describes content work through commands, saves outputs as addressable
artifacts, and carries creative context between stages. Generation and persistence
are currently planned behavior, not an implemented runtime. This help skill can
explain the interface now when loaded by an assistant.

```text
--help                         General help in BytesSkills context
/help                          Same overview
/brainstorm --help              Brainstorm parameters and examples
/refine --help                  Revision help
/show --help                   Pointers, history, settings and trees
/sync --help                   GitHub/local synchronization and refresh
```

Help is read-only and never starts the creative questionnaire. A complete command
with `--help` explains rather than executes it.

## Brainstorm

Choose exactly one: `--concepts`, `--hooks`, or `--script`.

- Concepts: `--format=ID`, `--topic="subject"`, `--seed="starting thought"`,
  `--strategy=ID`, `--count=N`, and either `--parent=PTR` or `--from=PTR`.
- Hooks: `--concept=PTR`, `--format=ID`, `--count=N`. If only a format is supplied,
  clarify the premise; do not fabricate a hidden source concept.
- Script: `--concept=PTR`, optional selected `--hook=PTR`, `--format=ID`.

```text
/brainstorm --concepts --format=reductions --topic="productivity"
/brainstorm --concepts --format=reductions --seed="More tools can mean less work"
/brainstorm --concepts --parent=@concept/002 --count=3
/brainstorm --hooks --concept=@concept/002
/brainstorm --script --concept=@concept/002 --hook=@hook/005
```

`--parent` makes narrower child concepts. `--from` makes alternatives derived from
an existing concept; it does not make them its children. Each candidate receives a
new ID. Seeds are hypotheses, not verified claims. Scripts produce one output.

## Missing parameters

Omission means ask, not silently choose. Ask one short question at a time about
applicable unresolved creative inputs before generation. Reuse clear inherited
values and settled conversation answers. “Idk” delegates the current choice;
“choose everything else” delegates remaining choices. Record delegated decisions.

Concept intake: output kind, format, topic or seed, discovery strategy, audience,
count. Topic and seed are alternative entry points; both can be supplied. Hook
intake resolves concept/premise, format, audience and count. Script intake resolves
concept, hook selection or delegation, format, audience and length. Not every
creative intake answer currently has a flag; do not invent flags for audience or
length. Refinement asks only for unresolved target and requested change.

## Refine

Exactly one target selector and an instruction:

```text
/refine --concept=@concept/002 --req="Make the takeaway more useful"
/refine --hook=@hook/005 --req="Start with a personal admission"
/refine --script=@script/008 --req="Explain the mechanism more simply"
```

Creates a new revision of the same object. Earlier versions remain accessible.
If targeting an old revision when newer work exists, clarify rather than silently
superseding it. This command does not manage format definitions.

## Inspect

```text
/show @script/008
/show @script/008 --settings
/show @hook/005 --history
/show @concept/002 --tree --depth=2
```

Choose at most one of settings, history or tree. Tree and depth are for concept
hierarchies. Settings shows resolved choices and where each came from.

## Browse, organize and archive

```text
/list --type=concept --query="productivity" --limit=20
/list --type=concept --parent=@concept/002
/move @concept/018 --parent=@concept/002
/move @concept/018 --root
/archive @hook/005
```

List supports `--type`, `--parent`, `--status`, `--tag`, `--query`, `--limit`,
`--cursor`. Ordinary lists omit archived objects. Move changes a concept's parent,
not its identity, provenance or creative settings; cycles are invalid. Archive
applies only to the selected object, not its descendants, and preserves references.
There is no permanent-delete command in the initial contract.

## Pointers and inheritance

`@hook/005` means the current revision in the active workspace; `@hook/005:v2`
means exactly revision 2. Outputs pin the source revisions used so later edits do
not silently change existing scripts. Titles and hierarchy can change without
changing IDs. Example IDs here do not identify real saved artifacts.

Explicit parameters override compatible inherited choices. Conflicting inputs
require resolution. Format switches rebuild format defaults instead of leaking
old defaults into the new format. Hard constraints and unavailable tools remain
visible. Saved artifacts retain their resolved context when definitions change.

## Vocabulary

- Topic: subject territory.
- Concept: an angle and takeaway with audience value and support/limits.
- Strategy: how to search for concepts.
- Format: editorial structure, workflow and suitable defaults.
- Treatment: presentation choices such as captions, music, SFX and animation.
- Hook: a particular opening expression of a concept.
- Run: a recorded command, intake answers, inputs, settings and outputs.

Reductions is the first draft format: surprising opening, entertaining ELI5
explanation, resolution, near-end qualification and follow CTA. Its treatment uses
on-camera narration, dead-air removal, hook text, captions and light SFX. Animation
styles and actual sound recordings remain to be selected.

## Storage and status

The planned runtime uses local files in a workspace tracked in the private GitHub
repository. Every candidate is saved; refinement preserves history. A local save and
a successful remote backup are separate states. No working generator, pointer store,
or automatic backup runner ships with this help skill yet.

## Sync and refresh

```text
/sync --check
/sync
/sync --repo="/absolute/path/to/BytesSkills"
/sync --help
```

`--check` fetches the configured upstream and reports local changes and ahead/behind
state; it changes remote-tracking metadata, not working files or commits. Full sync
checkpoints reviewed local changes including workspace artifacts, fast-forwards or
merges compatible updates, validates and pushes without force. It then rereads the
updated source instructions. If the checkout cannot be identified, it asks for the
path. An explicit repo path selects the checkout, not a remote destination.

Conflicts stop the workflow for resolution. Different artifacts with the same ID,
competing revisions, or broken references cannot be solved by blindly picking the
newest file. Local saves remain intact if network access or pushing fails.

The bytes-sync skill provides an assistant procedure using ordinary Git; it is not
a terminal parser or automatic background process. Source checkout, GitHub and the
installed/loaded plugin are separate states. Sync cannot promise to refresh every
chat or a cached plugin installation. Its report states which source commit it read
and whether the installed plugin still needs a supported update or reload.
