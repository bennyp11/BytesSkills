# BytesSkills

A CLI-like content workflow system: reusable definitions, skills, and persistent
creative artifacts with stable pointers. GitHub backs up both the system and its
local workspace.

**Current status: design specification plus plugin skeleton.** Commands below are
proposed contracts, not an implemented CLI or installed slash commands.

```text
/bytes brainstorm --concepts --format=reductions --count=5
/bytes brainstorm --hooks --concept=@concept/002
/bytes brainstorm --script --concept=@concept/002 --hook=@hook/005
/bytes refine --hook=@hook/005 --req="Make it more personal"
/bytes show @concept/002 --tree
/bytes show @script/008 --settings
```

## Start here

- [System specification](docs/system-spec.md): ontology, relationships and behavior.
- [Command reference](docs/commands.md): proposed grammar and command contracts.
- [Worked example](examples/reductions/README.md): illustrative end-to-end flow.
- [Workspace](workspace/README.md): local records, revisions and GitHub backups.
- [Plugin packaging](docs/architecture.md): platform boundaries.

## Repository

```text
catalog.yaml                  Library taxonomy (our convention)
definitions/                  Formats, treatments and workflows
plugins/                      Installable packaging and skill scaffolds
templates/                    Authoring templates
workspace/                    Tracked local creative work and run records
examples/                     Fictional examples, outside the live pointer namespace
docs/                         System and command contracts
```

The Video Editing plugin still contains unfinished pacing and captions scaffolds.
Its portable and Claude Code manifests share the same skill folders. Installation
is separate per host. No storage service, database or MCP server is required for
the current design. The first draft format, [Reductions](docs/reductions.md), is now defined from the user’s description.

## Working agreement

Keep definitions and the workspace in this private repository. After each completed
logical change or saved generation batch, commit and push the relevant files. Report
backup failures; a local save is not a confirmed remote backup. Never commit secrets,
credentials or temporary caches. Large binary media requires a verified Git LFS or
other explicit backup arrangement; do not claim a path alone backs up its contents.

See [workspace policy](workspace/README.md) for details.

## Help

The [BytesSkills help skill](plugins/bytesskills-core/skills/bytes/references/help/instructions.md)
explains `/bytes --help` and `/bytes brainstorm --help` when loaded by an assistant.
The core package also includes an assistant-driven [sync workflow](plugins/bytesskills-core/skills/bytes/references/sync/instructions.md) for `/bytes sync` and `/bytes sync --check`.
Its [guide](plugins/bytesskills-core/skills/bytes/references/help/references/guide.md) is also
readable directly. It is packaged in `plugins/bytesskills-core` for installation;
creating it in this repo does not install it across chats.

## One entry point

Load the [bytes skill](plugins/bytesskills-core/skills/bytes/SKILL.md), then use
`/bytes --help`, `/bytes brainstorm ...`, or `/bytes sync`. Help and sync are internal
routes, not separate skills to stack. Creative command execution remains planned.
Platform-native skill selection may differ; `/bytes` is the canonical text interface.

## Content formats

- [Reductions](docs/reductions.md): make a complex topic accessible through a surprising opening.
- [Bait](docs/bait.md): straight-faced rage, audience-comment prompts, or both.
