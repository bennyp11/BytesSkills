# BytesSkills command guide

## Upload an attachment

Use `/bytes upload [--title="..."]` to save an attached JPEG, PNG, WebP, MP4,
WebM or MOV as a private image/video artifact. If no attachment is available,
ask the user to attach one. Use its filename as title when appropriate. If the
ChatGPT file handoff is unavailable or the upload is too large, link to the signed-in
Bytes web uploader at https://app.bytesskills.com/app/upload.

## Quick overview

BytesSkills describes content work through commands, saves outputs as addressable
artifacts, and carries creative context between stages. The assistant generates content and uses a bundled local artifact runtime for
pointers, revisions, search and storage. Clip supplies a tool-dependent workflow
that saves local batch files. The bytes entry skill can
explain the interface now when loaded by an assistant.

```text
/bytes --help                  General help
/bytes                         Same overview
/bytes brainstorm --help              Brainstorm parameters and examples
/bytes captions --help                Add captions through CapCut
/bytes edit --help                    CapCut computer-controlled editing
/bytes refine --help                  Revision help
/bytes show --help                   Pointers, history, settings and trees
/bytes sync --help                   Cloud skill adoption and optional source sync
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

The connected shared workspace stores metadata and immutable revisions in D1,
content in private R2, and skill selections in D1. GitHub stores core source only.
Every candidate is saved; refinement preserves history. Report actual cloud save
results. Local-only work and recovery exports stay outside Git and are not cloud
saves. No automatic backup scheduler is included.

## Sync and refresh

`/bytes sync --check` previews published skill updates. `/bytes sync --latest`
adopts the latest library across the shared workspace. Neither command moves
workspace files or changes Git. `/bytes sync --git` explicitly synchronizes a source
checkout; it never stages private workspace data or deploys the service. Installed
plugin caches require their supported update flow separately.

## Troll and engagement tactics

```text
/bytes brainstorm --concepts --format=reaction --bait=share
/bytes brainstorm --concepts --format=troll --bait=rage
/bytes brainstorm --concepts --format=troll --bait=comment
/bytes brainstorm --concepts --format=troll --bait=rage --bait=comment
/bytes brainstorm --concepts --format=reductions --bait=comment
```

Troll is the straight-faced absurd bit; deadpan is its delivery treatment. Bait is
an engagement setting shared across compatible formats. Rage seeks a reaction;
comment invites a specific response or help; share makes someone want to send the
piece to a particular person or group through recognition, relatability or utility.
A share CTA is optional. Any compatible combination is allowed. `--bait=none`
selects no tactics and cannot be combined with other values. Omission inherits a settled
selection or triggers a question. Explicit sets replace inherited ones. Tactics
never override format requirements. A reduction must explain its surprising opening;
a troll can leave the bit intact. For troll, clarify the in-group and shared knowledge.
The old `--format=bait` name is retired; suggest troll rather than guessing intent.
Generation is performed by the assistant; saved outputs use the local runtime. Joke is a broad description, not another registered format.

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
Return real file links for media batches not yet registered in the pointer runtime. Missing tools mean exports
remain pending; a plan must not be presented as an edited video. A source too short
or a point that cannot fit safely triggers a targeted decision. No video is produced
merely by installing this skill. For execution read the bundled
[clip procedure](../../clip/instructions.md).

## Reaction format

`--format=reaction` selects a short on-camera reaction, approximately 0.5 seconds,
repeated as a loop while changing text or numbers recontextualize the hook question.
Nodding yes or shaking the head no is common but optional. The same reaction can
repeat across several context states; no new performance is required for each.
Text holds are independently timed for readability, not forced to 0.5 seconds.
Clarify the actual question, values, reaction source, timing and presentation when
unresolved. Music, effects and overall ending remain choices. Brainstorming uses the assistant and local artifact runtime, not a dedicated
generation service.

## Real artifact pointers

The implemented ID format is `@concept/FULL-UUID:v2`. Unique UUID prefixes of at
least eight characters also resolve, e.g. `@concept/8aa78d78`. Omit a revision to
read latest. Earlier numeric IDs in examples are placeholders, not live records.
The five unexpected-cost concepts have been imported. In this workspace:

```text
/bytes show @concept/8aa78d78
/bytes show @concept/e559c411 --history
/bytes list --type=concept --tag=share
/bytes refine --concept=@concept/8aa78d78 --req="Make the brag even more confident"
```

These three commands use the bundled helper through the assistant. Pointer support
uses the connected cloud service or an explicitly selected private local store.
See [runtime guidance](../../artifacts.md) for storage and limitations.

## Shared workspace

When the BytesSkills MCP connection is available, pointers resolve in the shared cloud
workspace. Same commands, shared state across connected clients. Verify identity with
bytes_workspace; read [cloud guidance](../../cloud.md). Local mirrors are read-only.
Syncing Git does not deploy the Worker or refresh its bundled definitions.

## CapCut editing

Use `/bytes edit --app=capcut --source="/path/to/video.mp4" --req="Remove dead air"`
or ask “Using BytesSkills, edit this video in CapCut for me.” The assistant checks
computer-control access, clarifies the brief, edits a preserved project, exports
and verifies the video. CapCut control must be supplied by the host; a remote MCP
connection does not provide it. Saves distinguish cloud artifacts from local-only
media. Use `--help` to inspect all flags without opening or editing a project.

## CapCut captions

`/bytes captions --app=capcut --source="video.mp4"` adds visible speech captions to
a separate exported video. You can also ask “Using BytesSkills, add captions to this
video in CapCut.” It clarifies language, style, placement and existing-caption handling,
checks transcription/timing where tools permit, and verifies captions in the actual
export. Computer control must be available on the host; video upload limits still apply.
