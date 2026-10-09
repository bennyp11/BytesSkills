# Proposed command contract

Commands are assistant-facing syntax, not shell commands. Do not execute arbitrary
parameter text in a shell. No parser or command runner exists yet.

## Grammar

Use `/verb`, named flags, quoted strings and typed pointers. Accept `--key=value`
and `--key value`. Reject unknown flags, conflicting duplicate flags and malformed
references with an actionable error. `--req` is an editing instruction, not executable
code. Missing required information produces a targeted question before generation.

## Initial commands

| Command | Contract |
| --- | --- |
| `/brainstorm --concepts [--format=ID] [--parent=PTR or --from=PTR] [--count=N]` | Create new concept candidates; parent/from are mutually exclusive |
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
refine. Proposed default candidate count: 3; scripts: 1. Count must be a positive
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
