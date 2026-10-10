# Git checkout synchronization only

Cloud library adoption uses `/bytes sync --latest` and `/bytes sync --check`; see
[version instructions](../versions.md). The procedure below applies only when the
user explicitly supplies `--git`. Bare sync must not initiate Git changes.

# Sync BytesSkills

Follow [the synchronization procedure](references/procedure.md). `/bytes sync --git` is an
assistant-interpreted request, not a native host command. An invocation authorizes
ordinary inspection, fetch, a reviewed local checkpoint commit, safe integration
and non-force push for the selected BytesSkills repository, including workspace/.
It does not authorize destructive resets, deletion, overwriting conflicting
artifacts, executing fetched code, or installing/replacing plugins in another host.

`/bytes sync --git --check` fetches upstream metadata and reports drift without changing working
files, creating commits, merging or pushing. Explain that it updates Git remote refs.
`/bytes sync --help` describes behavior without fetching, intake or other side effects.
Accept an optional `--repo="/absolute/path"` to select the checkout. If no current
BytesSkills checkout is identifiable, ask for its location; never guess or clone over
an existing directory. If filesystem, Git, network or credentials are unavailable,
report the precise missing capability and do not claim synchronization.

Report repository synchronization and active skill refresh separately. After
successful integration, reread changed instruction files relevant to this task.
A plugin installed elsewhere or cached by a host is not refreshed just because the
source checkout changed. Identify that state as pending or unknown unless a supported
host update and reload was actually verified. Do not edit plugin caches directly.
