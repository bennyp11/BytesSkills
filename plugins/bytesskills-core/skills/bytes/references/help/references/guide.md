# BytesSkills command guide

## Quick overview

BytesSkills describes content work through commands, saves outputs as addressable
artifacts, and carries creative context between stages. General generation and pointer persistence remain planned behavior; clip supplies
a tool-dependent assistant workflow that saves real local files. The bytes entry skill can
explain the interface now when loaded by an assistant.

```text
/bytes --help                  General help
/bytes                         Same overview
/bytes brainstorm --help              Brainstorm parameters and examples
/bytes refine --help                  Revision help
/bytes show --help                   Pointers, history, settings and trees
/bytes sync --help                   GitHub/local synchronization and refresh
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
/bytes brainstorm --concepts --format=reductions --topic="productivity"
/bytes brainstorm --concepts --format=reductions --seed="More tools can mean less work"
/bytes brainstorm --concepts --parent=@concept/002 --count=3
/bytes brainstorm --hooks --concept=@concept/002
/bytes brainstorm --script --concept=@concept/002 --hook=@hook/005
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
/bytes refine --concept=@concept/002 --req="Make the takeaway more useful"
/bytes refine --hook=@hook/005 --req="Start with a personal admission"
/bytes refine --script=@script/008 --req="Explain the mechanism more simply"
```

Creates a new revision of the same object. Earlier versions remain accessible.
If targeting an old revision when newer work exists, clarify rather than silently
superseding it. This command does not manage format definitions.

## Inspect

```text
/bytes show @script/008
/bytes show @script/008 --settings
/bytes show @hook/005 --history
/bytes show @concept/002 --tree --depth=2
```

Choose at most one of settings, history or tree. Tree and depth are for concept
hierarchies. Settings shows resolved choices and where each came from.

## Browse, organize and archive

```text
/bytes list --type=concept --query="productivity" --limit=20
/bytes list --type=concept --parent=@concept/002
/bytes move @concept/018 --parent=@concept/002
/bytes move @concept/018 --root
/bytes archive @hook/005
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
/bytes sync --check
/bytes sync
/bytes sync --repo="/absolute/path/to/BytesSkills"
/bytes sync --help
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

The sync reference provides an assistant procedure using ordinary Git; it is not
a terminal parser or automatic background process. Source checkout, GitHub and the
installed/loaded plugin are separate states. Sync cannot promise to refresh every
chat or a cached plugin installation. Its report states which source commit it read
and whether the installed plugin still needs a supported update or reload.

## Troll and engagement tactics

```text
/bytes brainstorm --concepts --format=troll --bait=rage
/bytes brainstorm --concepts --format=troll --bait=comment
/bytes brainstorm --concepts --format=troll --bait=rage --bait=comment
/bytes brainstorm --concepts --format=reductions --bait=comment
```

Troll is the straight-faced absurd bit; deadpan is its delivery treatment. Bait is
an engagement setting shared across compatible formats. Rage seeks a reaction;
comment invites a specific response or help. Both can be combined. `--bait=none`
selects neither and cannot be combined with other values. Omission inherits a settled
selection or triggers a question. Explicit sets replace inherited ones. Tactics
never override format requirements. A reduction must explain its surprising opening;
a troll can leave the bit intact. For troll, clarify the in-group and shared knowledge.
The old `--format=bait` name is retired; suggest troll rather than guessing intent.
Generation remains planned. Joke is a broad description, not another registered format.

## Clip: three lengths, same point

```text
/bytes clip --source="/path/to/recording.mov"
/bytes clip --source="/path/to/recording.mov" --point="More tools can become a way to avoid work" --format=none --mode=render
/bytes clip --help
```

Clip is an authored assistant workflow, available when file/media tools support it.
It saves a 60-second cut, a 30-second cut and a 10–15-second cut, each progressively
tighter while retaining the same central point. They are separate variants, not
replacements. Work from original media for every export. Targets of 60s and 30s are
ceilings; final timing must be measured. Never remove essential qualifiers just to fit.

Flags: `--source` accessible media/attachment or real video pointer; `--point`
one-sentence takeaway; `--format` available format ID or `none`; `--mode=render|plan`;
`--output` local workspace path. Ask for unresolved source, point, presentation and
mode, one at a time; inherit known choices and accept `idk` for creative decisions.
The three lengths are built into this workflow. No extra generation flags apply.

Save plans, transcripts, provenance and available exports to a new workspace batch.
Return real file links until the pointer runtime exists. Missing tools mean exports
remain pending; a plan must not be presented as an edited video. A source too short
or a point that cannot fit safely triggers a targeted decision. No video is produced
merely by installing this skill. For execution read the bundled
[clip procedure](../../clip/instructions.md).
