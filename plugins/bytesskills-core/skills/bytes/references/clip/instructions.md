# Progressive clipping

Authored assistant workflow. Execute with available media/file tools, not by passing
`/bytes` text to a shell. No editor, transcription service or pointer runtime is
bundled. Never claim an export, measured duration, saved file or remote backup that
has not been verified. This reference is self-contained for packaged use.

## Command and intake

```text
/bytes clip --source="/path/to/recording.mov" --point="The takeaway to preserve"
/bytes clip --source="/path/to/recording.mov" --point="..." --format=none --mode=render --output="/path/to/BytesSkills/workspace"
/bytes clip --help
```

Accept `--source` (attachment, accessible path or actually resolvable video pointer),
`--point` (one-sentence takeaway), `--format` (available definition ID or `none`),
`--mode` (`render` or `plan`), `--output` (workspace path). Reject unknown flags.
All three durations are included: 60s, 30s, 10–15s. No duration flag is necessary.
Help is read-only and takes precedence over every operation.

Ask one clarifier at a time for unresolved inputs, in this order: source, central
point, format/treatment or plain editorial cuts, render versus plan. Resolve the
workspace from context or ask for its path. Do not ask again for supplied, inherited
or explicitly settled answers. `Idk` delegates only the current creative choice;
`choose everything else` delegates remaining choices. Missing files and inaccessible
pointers cannot be invented. If point is delegated, inspect the source and state the
chosen takeaway before editing. If source contains competing points, ask which one
to preserve unless selection was delegated. Avoid imposing Reductions on all clips.

## Inspect and establish the invariant

Read/watch the relevant source and obtain a timestamped transcript from available
tools. Identify speakers, continuous timebase, source duration and any existing edits.
Transcription estimates must be distinguished from checked source timing. If video
is inaccessible but transcript exists, offer a transcript-based paper edit, not a
render. Untimed text cannot support invented exact in/out timestamps.

Record a meaning anchor: central takeaway, speaker intent, necessary evidence or
example, qualifiers, negations, causal relationships, and the promised payoff.
Every cut must communicate that same point and remain understandable on its own.
A punchier false implication fails even if every retained word was in the source.
Do not splice fragments to fabricate a statement. Do not fabricate replacement
speech, reactions, B-roll or new facts. No speed-up or silence padding solely to
satisfy a duration target. Preserve necessary breaths and emotional pauses.

## Build three cuts, saving each

1. **60-second cut:** select the strongest opening, minimum context, useful example
   or evidence, and complete payoff. Remove repetition and dead air. Save this version.
2. **30-second cut:** tighten the approved meaning of the 60s cut, removing secondary
   examples and setup. Preserve essential qualifiers and payoff. Save separately.
3. **10–15-second cut:** retain the shortest self-contained expression of the same
   point, with enough context for a new viewer. Save separately. Do not substitute a
   teaser that only promises an explanation for an actual statement of the point.

Work from original media/master edits for each export, not successive compression
of rendered files. Prefer the previous cut's material as the editorial starting
point, but allow a more concise passage from the original if it communicates the
same point; record the substitution. No extra approval round between cuts when
inputs and decisions are already authorized. Do not overwrite source footage.

60s and 30s are target ceilings: aim close while ending naturally at or below each.
The shortest target is inclusive 10–15s. Measure final files; do not label an
estimated timeline duration as verified. If fidelity cannot fit a target, save the
faithful candidate/plan and flag that variant as needing a decision. Never silently
change the point or claim the duration passed. If source is too short, do not pad
or manufacture three redundant exports; explain the limitation and ask whether to
produce fewer distinct cuts or use different targets.

## Treatment and execution

Use established source/format styling where available. Focus on editorial compression;
additional effects, music, animation or generated assets are not required for this
command. Ask about creative choices only when applicable and unresolved. If adding
captions, use the user's manual-text preference from the final cut, preserve distinct
hook text when applicable, and retime captions separately for each variant. Do not
silently strip necessary captions or crop key evidence. Disclose source-baked captions
that cannot be retimed independently.

Use an accessible editor or media tool and its applicable instructions. If rendering
is unavailable, save timestamped edit plans and explain that video exports remain
pending. A plan is not a successful render; never downgrade render to plan silently.
Respect the user's chosen local editor if specified; obtain a decision before using
another service. Check audio seams, picture continuity, caption timing and the
meaning anchor after cuts. Review the actual encoded outputs when tools allow and
report physical playback or visual checks that were not performed.

## Local files and provenance

Until a shared artifact runtime exists, use real filesystem paths, not fabricated
`@video` or `@run` references. Create a fresh UUID-named batch under the selected
workspace's `clipping/`; create it exclusively and never overwrite an existing batch.
Save incremental progress after each completed variant:

```text
clipping/<batch-uuid>/
  run.json
  source-transcript.md
  60s/edit-plan.json
  60s/content.md
  60s/output.mp4       # only when actually rendered
  30s/...
  10-15s/...
```

run.json records batch ID, command/intake, mode, timestamps, source path or pinned
source reference, source checksum where accessible, meaning anchor, definition
versions/snapshots used, output paths, checks and statuses. Three cuts are sibling
variants of the same source/point, not revisions that overwrite each other. Record
that the 30s plan develops the 60s plan and the shortest develops the 30s plan while
all exports reference original source timestamps. Future refinement appends versions;
it must not replace this batch. Do not copy unrelated footage into the workspace.

Each edit-plan.json lists ordered source segments with file/speaker, in/out seconds,
rationale, and any transitions/overlaps. Record estimated versus measured duration,
final transcript, necessary qualifiers retained, and rejected or unresolved cuts.
For untimed sources use text spans, null times, and timing_status=unverified.
Mark run pending, succeeded, partial or failed; each variant records planned,
rendered, verified or blocked stages as applicable. Plan-only success is scoped to
the plan deliverable; rendered files with unperformed checks remain unverified.

In the user's BytesSkills checkout, follow its GitHub backup instructions after a
completed batch or partial save. Preserve local results if upload fails and report
backup pending. For large binaries use verified configured LFS or request a backup
choice; never silently omit media and claim the entire batch backed up. Source paths
and checksums identify inputs but do not imply the source media is remotely backed up.
A packaged skill in an unrelated repository must not commit/push there without user
scope or repository authorization. Sync is a separate reference, not an automatic
conflict override.

## Return

Present the point preserved and a table of three variants with actual file links,
measured duration (or clearly estimated plan timing), and verification status. Briefly
explain what was removed at each step. Identify any blocked target, missing tools,
unperformed checks and local-versus-remote save status. Never create sample pointer
IDs as though they resolve to these files.
