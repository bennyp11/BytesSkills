# BytesSkills help

Read [the command guide](references/guide.md). Handle `/bytes --help` and
`/bytes <command> --help` through the bytes entry skill. Bare commands outside the
BytesSkills namespace are not aliases. This is assistant-readable help, not a
native slash-command registry or terminal executable.

For general help, show the short overview, main commands, and one example. For `/bytes sync`, also explain local-vs-remote and source-vs-installed state. For a
named command, explain its flags, missing-input behavior, output and one useful
example. For “everything”, explain the full guide progressively with readable
sections. Answer natural-language help requests too. Unknown commands should get
an honest error and the supported list, not invented syntax.

Help takes precedence over execution and intake: never ask the creative questionnaire,
generate content, allocate pointers or change workspace files for a help request.
Use example pointers only as examples. The shared local artifact runtime is now
implemented: the assistant generates/refines content and saves it through Python.
There is no native slash parser or automatic model service. Explain required local
filesystem/Python access. Clip execution still depends on media tools and its large
files use the existing batch flow. Sync must rebuild the artifact index after Git.
Installing this package and reading its instructions is separate from executing a
native CLI. Do not claim installation has occurred merely because files exist.
