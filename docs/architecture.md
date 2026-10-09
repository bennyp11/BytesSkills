# Architecture

## Shared content, explicit integrations

Each plugin is self-contained. Its shared `skills/` folder is the canonical home
for instructions. Both manifests describe the same plugin identity and version.
The root portable manifest is for OpenAI-compatible hosts; Claude Code uses
`.claude-plugin/plugin.json`.

Use standard Agent Skills frontmatter in shared skills. Keep platform-only
instructions in references and executable integrations in adapters. Adapter folders
have no built-in runtime meaning: manifest declarations, helper scripts, or explicit
skill instructions must select them. Check actual capabilities rather than inferring
that a model brand guarantees access to an editor, filesystem, or connector.

## Taxonomy

The catalog records domain, workflow stage, inputs, outputs, tags, and readiness.
A skill has one canonical home. Categories are browsing dimensions, not an
assumption that nested plugins or cross-plugin dependencies load automatically.
Keep installed packages self-contained; do not link outside their plugin directory.

## Resources

`references/` holds detailed guidance; `assets/` holds templates and other inputs;
`scripts/` holds executable helpers. Only include runnable scripts when implemented.
Document required runtimes and dependencies. Secrets belong in host-managed
credentials or environment configuration, never in the repository.

## Distribution

Maintain one source repository. Prefer a shared package for skills-only workflows.
Generate separate release archives when a host or public submission requires
removing unsupported components. Installation, authentication, updates, and testing
remain separate for each host. A compatible manifest does not prove execution
compatibility. No MCP servers, hooks, credentials, or automatic installers are
configured in this skeleton.

## References

- [OpenAI packaging](https://developers.openai.com/plugins/build/plugins)
- [OpenAI Claude plugin compatibility](https://developers.openai.com/plugins/guides/submit-claude-plugin)
- [Claude plugin manifests](https://code.claude.com/docs/en/plugins-reference)
- [Claude skills](https://code.claude.com/docs/en/skills)

## Content model

Plugin boundaries are packaging choices. The domain model and command behavior are
defined in [system-spec.md](system-spec.md) and [commands.md](commands.md). The local
workspace is tracked in Git alongside these definitions by explicit user request.
