# Proposed command contract

Commands are assistant-facing syntax, not shell commands. Do not execute arbitrary
parameter text in a shell. No parser or command runner exists yet.

## Grammar

Use `/verb`, named flags, quoted strings and typed pointers. Accept `--key=value`
and `--key value`. Reject unknown flags, conflicting duplicate flags and malformed
references with an actionable error. `--req` is an editing instruction, not executable
code. Missing creative inputs trigger the clarification-first intake below before generation.

## Initial commands

| Command | Contract |
| --- | --- |
| `/brainstorm --concepts [--format=ID] [--topic="..."] [--seed="..."] [--strategy=ID] [--parent=PTR or --from=PTR] [--count=N]` | Create new concept candidates; parent/from are mutually exclusive |
| `/brainstorm --hooks --concept=PTR [--format=ID] [--count=N]` | Create hook candidates using a concept revision |
| `/brainstorm --hooks --format=ID` | Ask for the premise if absent; do not invent a hidden concept |
| `/brainstorm --script --concept=PTR [--hook=PTR] [--format=ID]` | Create one script; validate the selected hook against the concept |
| `/refine --concept=PTR --req="..."` | Append a concept revision |
| `/refine --hook=PTR --req="..."` | Append a hook revision |
| `/refine --script=PTR --req="..."` | Append a script revision |
| `/show PTR [--settings or --history or --tree] [--depth=N]` | Inspect content, setting origins, revision history or concept descendants |
| `/list --type=TYPE [--parent=PTR] [--status=STATUS] [--tag=TAG] [--query="..."] [--limit=N] [--cursor=TOKEN]` | Browse and search saved work; omit archived objects by default |
| `/move PTR --parent=PTR` | Reparent a concept after cycle checks; no creative-context changes |
| `/move PTR --root` | Remove the organizational parent |
| `/archive PTR` | Archive this object only; no recursive behavior in v0.1 |

Exactly one output selector is required for brainstorm and one target selector for
refine. Suggested candidate count: 3; scripts produce one output. An omitted candidate
count is asked about, not silently defaulted. Count must be a positive
integer, with material generation costs surfaced before execution where applicable.
`--depth` applies only to tree views. Refining an old pinned revision requires an
explicit decision if a newer revision exists; do not replace the current branch
silently. Concurrent updates must be detected before committing a revision.

## Useful output convention

```text
Saved 3 hooks: @hook/005, @hook/006, @hook/007
Run: @run/012
Source: @concept/002:v1
Format: reductions (version 1)

Next:
/brainstorm --script --concept=@concept/002 --hook=@hook/005
```

Return copyable pointers, a short result preview and one sensible next command.
Show meaningful conflicts and limitations; keep routine metadata available through
`/show`. Explicit overrides and inherited choices must be inspectable.

## Definition editing

For now, edit format, treatment and workflow files through an explicit natural-
language request and review the resulting file diff. Dedicated `/format` or
`/treatment` management commands are deferred until real authoring examples establish
their needs. This avoids claiming that `/refine` also edits every kind of definition.

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
User: /brainstorm --concepts --format=reductions
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

`--help`, `/help`, and `/COMMAND --help` request read-only guidance and take
precedence over execution and creative intake. The assistant-readable
[bytes-help skill](../plugins/bytesskills-core/skills/bytes-help/SKILL.md) provides
overview, command-specific help, examples and terminology. These are interpreted
aliases, not native commands registered by the host. Update its guide when changing
this contract. The help package does not implement generation or persistence.
