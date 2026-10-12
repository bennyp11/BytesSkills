# BytesSkills

A CLI-like content workflow system: reusable definitions, skills, and persistent
creative artifacts with stable pointers. GitHub stores the system; Cloudflare stores
the shared workspace, including records, blobs, revisions and skill preferences.

**MVP branch:** a deployed shared workspace is available at [bytesskills.com](https://bytesskills.com).
Connect via `https://api.bytesskills.com/mcp` using OAuth. See [service setup and architecture](service/README.md).

**Current status:** assistant-driven skills with local and hosted artifact runtimes.
Stable UUID pointers, immutable revisions, metadata filters, full-text search and
reverse references are implemented. The assistant supplies generation and calls the
bundled Python helper; `/bytes` is not a standalone shell executable. Media clipping
still requires appropriate tools.

```text
/bytes brainstorm --concepts --format=reductions --count=5
/bytes brainstorm --hooks --concept=@concept/002
/bytes brainstorm --script --concept=@concept/002 --hook=@hook/005
/bytes refine --hook=@hook/005 --req="Make it more personal"
/bytes show @concept/002 --tree
/bytes show @script/008 --settings
```

## Start here

- [GitHub release automation](docs/releases.md): prepare, publish, verify and recover releases.

- [Add skills, formats and object profiles](docs/extending-bytes.md): contracts, natural-language routing and release process.

- [System specification](docs/system-spec.md): ontology, relationships and behavior.
- [Command reference](docs/commands.md): proposed grammar and command contracts.
- [Worked example](examples/reductions/README.md): illustrative end-to-end flow.
- [Workspace storage](docs/workspace-storage.md): cloud ownership and private recovery exports.
- [Plugin packaging](docs/architecture.md): platform boundaries.

## Repository

```text
catalog.yaml                  Library taxonomy (our convention)
definitions/                  Formats, treatments and workflows
plugins/                      Installable packaging and skill scaffolds
templates/                    Authoring templates
service/                      Cloudflare Worker, database migrations and tests
examples/                     Fictional examples, outside the live pointer namespace
docs/                         System and command contracts
```

The Video Editing plugin still contains unfinished pacing and captions scaffolds.
Its portable and Claude Code manifests share the same skill folders. Installation
is separate per host. The shared workspace uses the Cloudflare MCP service; the
optional local runtime requires an explicit private directory outside this repository. The first draft format, [Reductions](docs/reductions.md), is now defined from the user’s description.

## Working agreement

Keep core source and reusable definitions in GitHub. Save creative work through the
cloud runtime; Git is not part of a creative save. Commit and push reviewed source
changes, excluding all private records, blobs, exports and credentials.

See [workspace policy](docs/workspace-storage.md) for recovery and migration details.

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
routes, not separate skills to stack. Clipping is tool-dependent; other creative commands use the assistant and shared
artifact runtime.
Platform-native skill selection may differ; `/bytes` is the canonical text interface.

## Content formats

- [Reaction](docs/reaction.md): a roughly half-second reaction loops as changing text or numbers recontextualize a hook question.

- [Reductions](docs/reductions.md): make a complex topic accessible through a surprising opening.
- [Troll](docs/troll.md): a straight-faced absurd bit.
- [Bait](docs/bait.md): reusable rage/comment engagement settings.

## Progressive clipping

`/bytes clip --source="/path/to/recording.mov"` produces separate 60s, 30s and
10–15s cuts that preserve the same point. Read the
[clip workflow](plugins/bytesskills-core/skills/bytes/references/clip/instructions.md).
Missing inputs trigger clarifiers; missing rendering tools are reported explicitly.

## Pointer runtime

Read the [architecture](docs/pointer-architecture.md) and
[runtime contract](plugins/bytesskills-core/skills/bytes/references/artifacts.md).
Pointers resolve against the connected workspace, independently of this checkout.
Examples in documentation are illustrative, not live user records.

Run local storage tests with `python3 -m unittest discover -s tests -v`.
Cloud records and revision state live in D1; content blobs live in private R2.
SQLite is only a rebuildable cache for explicitly local stores.

## Release 0.7.0: shared skill versions

The remote library separates publication from adoption. Each `/bytes` request
starts with `bytes_begin`; new skill versions offer Update / Stay / Always latest.
Preferences follow the workspace across devices. `/bytes sync --latest` adopts
the current library in one step; `/bytes sync --check` previews changes. Git sync
is now explicitly `/bytes sync --git`. See [release architecture](docs/skill-releases.md).

Existing custom MCP connections need one metadata refresh for the new tools and
required workflow_id on saves. Instruction-only releases thereafter do not need
a tool refresh. The remote server cannot edit the installed ChatGPT plugin package
or guarantee model routing; select @BytesSkills when invoking it.
