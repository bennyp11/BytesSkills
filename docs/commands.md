# Proposed command contract

Commands are assistant-facing syntax, not shell commands. Do not execute arbitrary
parameter text in a shell. No parser or command runner exists yet.

## Namespace

The only canonical entry is `/bytes`. Bare `/bytes` shows help. Use
`/bytes help`, `/bytes --help` or `/bytes COMMAND --help` for read-only guidance. Generic bare
commands are not intercepted; they may belong to other plugins. The bytes entry
skill routes to bundled help and sync references. Generation uses the assistant; artifact operations use the bundled Python runtime.
Namespacing does not create a native host command.

## Grammar

Use `/bytes verb`, named flags, quoted strings and typed pointers. Accept `--key=value`
and `--key value`. Reject unknown flags, conflicting duplicate scalar flags and malformed
references with an actionable error. `--req` is an editing instruction, not executable
code. Missing creative inputs trigger the clarification-first intake below before generation.

## Initial commands

| Command | Contract |
| --- | --- |
| `/bytes brainstorm --concepts [--format=ID] [--topic="..."] [--seed="..."] [--strategy=ID] [--parent=PTR or --from=PTR] [--count=N]` | Create new concept candidates; parent/from are mutually exclusive |
| `/bytes brainstorm --hooks --concept=PTR [--format=ID] [--count=N]` | Create hook candidates using a concept revision |
| `/bytes brainstorm --hooks --format=ID` | Ask for the premise if absent; do not invent a hidden concept |
| `/bytes brainstorm --script --concept=PTR [--hook=PTR] [--format=ID]` | Create one script; validate the selected hook against the concept |
| `/bytes refine --concept=PTR --req="..."` | Append a concept revision |
| `/bytes refine --hook=PTR --req="..."` | Append a hook revision |
| `/bytes refine --script=PTR --req="..."` | Append a script revision |
| `/bytes show PTR [--settings or --history or --tree] [--depth=N]` | Inspect content, setting origins, revision history or concept descendants |
| `/bytes list --type=TYPE [--parent=PTR] [--status=STATUS] [--tag=TAG] [--query="..."] [--limit=N] [--cursor=TOKEN]` | Browse and search saved work; omit archived objects by default |
| `/bytes move PTR --parent=PTR` | Reparent a concept after cycle checks; no creative-context changes |
| `/bytes move PTR --root` | Remove the organizational parent |
| `/bytes archive PTR` | Archive this object only; no recursive behavior in v0.1 |

Exactly one output selector is required for brainstorm and one target selector for
refine. Suggested candidate count: 3; scripts produce one output. An omitted candidate
count is asked about, not silently defaulted. Count must be a positive
integer, with material generation costs surfaced before execution where applicable.
`--depth` applies only to tree views. Refining an old pinned revision requires an
explicit decision if a newer revision exists; do not replace the current branch
silently. Concurrent updates must be detected before committing a revision.

## CapCut captions

`/bytes captions --app=capcut --source="/path/to/video.mp4" --language=en --style="plain readable captions"`

Other flags: `--project`, `--placement`, `--existing=preserve|replace|restyle`,
`--output`. Missing applicable inputs are clarified one at a time; “idk” delegates
creative choices. Source timing, framing and audio are preserved unless requested
otherwise. The output is a video with visible captions, not just a transcript.
Natural language: “Using BytesSkills, add captions to this video in CapCut.”
`/bytes captions --help` explains the workflow without controlling CapCut.
This requires host computer control, source access and usable captioning facilities.
See the [caption handler](../plugins/bytesskills-core/skills/bytes/references/captions/instructions.md).

## CapCut editing

`/bytes edit --app=capcut --source="/path/to/video.mp4" --req="Tighten the pacing"`

Other supported flags: `--project`, `--format`, `--duration`, `--aspect`, `--captions`,
`--music`, `--output`. Sources may be accessible files, real video pointers or an
unambiguous project selection; a brief may be text or a real plan pointer. Missing
applicable inputs are clarified one at a time. `--help` is read-only. The initial
editor implementation is CapCut through host-provided computer control; it is not
an editing API exposed by the BytesSkills server.

Equivalent request: “Using BytesSkills, edit this video in CapCut, cut the dead air
and add captions.” Both forms use `bytes_begin`, the same intake and pinned handler.
An edit request does not authorize social publishing or purchases. See the
[editing workflow](../plugins/bytesskills-core/skills/bytes/references/edit/instructions.md).
The handler saves plans/runs and ingests verified media where supported; exports over
the MVP upload limit remain explicitly local-only. Progressive clip durations are a
separate choice, never an assumption attached to every edit.

## Useful output convention

```text
Saved 3 hooks: @hook/005, @hook/006, @hook/007
Run: @run/012
Source: @concept/002:v1
Format: reductions (version 1)

Next:
/bytes brainstorm --script --concept=@concept/002 --hook=@hook/005
```

Return copyable pointers, a short result preview and one sensible next command.
Show meaningful conflicts and limitations; keep routine metadata available through
`/bytes show`. Explicit overrides and inherited choices must be inspectable.

## Definition editing

For now, edit format, treatment and workflow files through an explicit natural-
language request and review the resulting file diff. Dedicated `/format` or
`/treatment` management commands are deferred until real authoring examples establish
their needs. This avoids claiming that `/bytes refine` also edits every kind of definition.

## Clarification-first intake

For generation and refinement, the first assistant response is a clarifier whenever
applicable creative inputs remain unresolved. Do not generate candidates first or
quietly fill gaps from defaults. Ask one short question at a time, continuing until
each applicable intake field has an answer or explicit delegation. If all inputs
are resolved, execute without a redundant questionnaire.

Input states must remain distinct:

- **Explicit:** supplied in parameters or answered during intake.
- **Inherited:** unambiguously supplied by a referenced artifact or previously
  established context; retain it rather than asking the user to repeat it.
- **Unresolved:** omitted and not already established. Ask before generation.
- **Delegated:** user said “idk”, “you choose”, or equivalent for this field. The
  assistant may select a suitable value, including a default, and records its choice.
- **Not applicable / none:** explicitly skipped or unnecessary for this operation.

A format default can inform a suggested answer but is not an answer to an unresolved
intake question. A format's implementation details do not each require questions;
its command intake declares which choices are user-facing. Omitted technical flags
such as pagination cursors are not creative intake fields.

For concept brainstorming, use this intake order:

1. Output kind, if absent: concepts, hooks, or script?
2. Format, unless already resolved.
3. Topic or starting thought: offer either or both as the starting point. They are
   alternatives, not two mandatory inputs. If both are unknown, record delegation.
4. Discovery strategy: what kind of ideas should we look for? Offer relevant lenses
   such as contradictions, misconceptions, audience problems, or personal lessons.
5. Audience, if not already established by the brief or context.
6. Candidate count, unless supplied.

For hooks, resolve the concept/premise, format, audience and count. For scripts,
resolve the concept, chosen hook (or delegate creation of an opening), format,
audience and target length. For refinement, resolve the target and requested change;
do not restart the original brainstorming intake. Conflicting inherited values remain
unresolved until explicitly addressed.

“Idk” delegates the question currently being asked, not every remaining field.
“Choose everything else” delegates all remaining creative choices. Delegation does
not permit fabricating an existing artifact pointer, missing source footage or
factual support. Explain those dependencies and ask for a valid next step.

Persist the original command, intake answers, delegated decisions and final parameter
values in the run record. Resume intake from those answers rather than restarting
when interrupted. Do not create creative artifacts until generation actually occurs.

Example (proposed interaction):

```text
User: /bytes brainstorm --concepts --format=reductions
Assistant: Do you have a topic or a surprising thought to start from?
User: idk
Assistant: I'll explore broadly. What should guide the search—contradictions,
           misconceptions, audience problems, or should I choose?
User: misconceptions
Assistant: Who should these be for?
User: first-time founders
Assistant: How many concepts would you like? I suggest three.
User: three
Assistant: [Generates and saves three concepts with the resolved intake recorded.]
```

`--topic` is subject territory; `--seed` is a starting thought or hypothesis, not
accepted evidence; `--strategy` is the discovery lens. Both topic-first and seed-first
routes produce the same concept structure. A concept records its angle, takeaway,
audience value, and support/limits. Format-specific development records a selected
format without making that format the concept's permanent identity.

## Help

`/bytes --help` and `/bytes COMMAND --help` request read-only guidance and take
precedence over execution and creative intake. The assistant-readable
[bytes help reference](../plugins/bytesskills-core/skills/bytes/references/help/instructions.md) provides
overview, command-specific help, examples and terminology. These are interpreted
aliases, not native commands registered by the host. Update its guide when changing
this contract. The core package now includes the local artifact runtime; see [pointer architecture](pointer-architecture.md).

## Sync

`/bytes sync --check` previews cloud skill releases; `/bytes sync --latest` adopts
latest releases across the shared workspace. Neither command changes Git.
`/bytes sync --git [--repo="/absolute/path"]` reconciles source with its configured
upstream and rereads relevant source instructions. `--git --check` fetches and
reports source drift without changing working files, committing or pushing.
`/bytes sync --help` has no sync side effects. The
[bytes sync reference](../plugins/bytesskills-core/skills/bytes/references/sync/instructions.md)
contains the source-only procedure. Workspace records, blobs and exports must never
be staged. Source synchronization and installed-plugin refresh are separate.

## Engagement parameters

Generation commands accept repeatable `--bait=rage`, `--bait=comment`, and `--bait=share` where
compatible with the selected format. Any compatible subset combines; `--bait=none` selects no tactics
and cannot accompany another value. Explicit sets replace inherited choices.
Unresolved selections trigger clarification. See [bait.md](bait.md). Bait does not
override format requirements: reductions resolve into a true explanation; troll
preserves an intentional bit. `--format=bait` is retired: suggest `--format=troll`
when the user means the straight-faced joke rather than silently translating it.

## Clip

`/bytes clip [--source=PATH_OR_POINTER] [--point="..."] [--format=ID_OR_none]
[--mode=render|plan] [--output=WORKSPACE_PATH]` invokes the authored
[three-cut workflow](../plugins/bytesskills-core/skills/bytes/references/clip/instructions.md).
It saves separate 60s, 30s, and 10–15s variants of the same point. Ask about unresolved
creative inputs before editing; these durations are inherent to the command. Help
remains read-only. Actual editing depends on available tools and source media.
Until general artifact persistence is implemented, use unique local batch folders
and return actual file links rather than fake pointers. See the workflow for fidelity,
timing verification, partial completion and backup rules.

## Implemented pointer backend

See [pointer architecture](pointer-architecture.md). `/bytes` remains assistant-facing;
its save/query helper is executable Python. Use returned UUID pointers, not numeric
placeholders from older examples. `show`, `list`, `move`, `archive`, and revision saves
now use this backend. Native command parsing and automatic generation are not bundled.

## Cloud skill releases (0.7.0)

Every new command starts with bytes_begin. Use its immutable instructions/resources
and workflow_id throughout that operation. Update prompts offer update, keep, or
auto; preferences persist per skill in the workspace. Help/inspection workflows
cannot save creative artifacts. All MCP saves require a valid workflow_id.

- `/bytes sync --check`: preview selected/latest skill releases.
- `/bytes sync --latest`: adopt the entire compatible library atomically, without
  changing future ask/auto preferences. This is not a Git operation.
- `/bytes sync --git [--check]`: the separate local repository workflow.

Published skill content is immutable. New instruction releases are published via
bytes_publish (separate management permission) or the authenticated publication
script. Publishing and adoption are separate; ordinary writes grant no publishing
rights. Pinned workflows retain exact resources even after another machine updates.
