# BytesSkills

A personal, cross-platform library of reusable AI skills, grouped into plugins.

## Structure

```text
BytesSkills/
├── catalog.yaml                 # Library taxonomy; our own convention
├── docs/architecture.md
├── templates/SKILL.md.template  # Copy when authoring a skill
└── plugins/video-editing/
    ├── plugin.json              # Portable Agent Plugins manifest for OpenAI
    ├── .claude-plugin/plugin.json
    ├── skills/                  # Shared skill instructions and resources
    ├── scripts/                 # Shared executable helpers
    └── adapters/                # Explicit platform integration points
```

The starter plugin contains scaffold skills for pacing and captions. **The full
Clipping Skill Bible has not been imported, and these are not production workflows.**

## Add a skill

1. Create `plugins/<plugin>/skills/<skill>/` and copy `templates/SKILL.md.template`
   to `SKILL.md` within it.
2. Set the skill name to match its folder and write a precise activation description.
3. Add instructions, reference material, examples, and optional helpers.
4. Add the skill to `catalog.yaml`; keep taxonomy out of directory nesting.
5. Test on both intended hosts before changing its status to ready.

## Use the library

Install individual folders under `plugins/`, not the repository root.
Claude Code can test the starter from a local checkout with:

```sh
claude --plugin-dir ./plugins/video-editing
```

For ChatGPT/Codex, package or register `plugins/video-editing` through the supported
plugin installation flow for your surface. The root `plugin.json` uses the portable
Agent Plugins schema. Merely sharing this repository URL with a chat does not
install it. Claude chat skill uploads are a separate distribution path from Claude
Code plugins. No account installation is performed by this repository.

Adapters are ordinary directories, not automatically selected by either platform.
Wire configuration explicitly and make shared skills check available capabilities.
See [architecture](docs/architecture.md).
