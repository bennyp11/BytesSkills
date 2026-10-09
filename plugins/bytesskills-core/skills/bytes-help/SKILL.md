---
name: bytes-help
description: Explain the BytesSkills content workflow commands, flags, pointers, creative intake, and format terminology when the user requests BytesSkills help, --help, /help, or command-specific help in a BytesSkills context. Does not execute generation or workspace mutations.
---

# BytesSkills help

Read [the command guide](references/guide.md). Treat `--help`, `/help`, and
`/brainstorm --help` (or another BytesSkills command with `--help`) as help requests
when this skill is available. These are interpreted text aliases, not registered
native slash commands or a working terminal executable.

For general help, show the short overview, main commands, and one example. For a
named command, explain its flags, missing-input behavior, output and one useful
example. For “everything”, explain the full guide progressively with readable
sections. Answer natural-language help requests too. Unknown commands should get
an honest error and the supported list, not invented syntax.

Help takes precedence over execution and intake: never ask the creative questionnaire,
generate content, allocate pointers or change workspace files for a help request.
Use example pointers only as examples. State that generation/persistence operations
are currently specifications; this package implements assistant-readable help only.
Installing this package and reading its instructions is separate from executing a
native CLI. Do not claim installation has occurred merely because files exist.
