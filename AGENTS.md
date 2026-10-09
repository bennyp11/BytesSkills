# BytesSkills working instructions

Read README.md and docs/system-spec.md before changing the model. Commands described
in docs/commands.md are a proposed interface until implemented and tested. Do not
claim they are native host commands or working executables.

Preserve stable artifact identities, immutable revisions, exact input provenance,
and separation of parent, extends and derived_from relationships. Do not invent
production format rules from a format's name. Examples are not live artifacts.

The user wants GitHub backups as work proceeds, including workspace/. After each
completed logical change or generation batch, inspect, commit and push its files.
Preserve unrelated edits. Report failures honestly; do not claim remote backup before
push succeeds. Exclude credentials and caches, but do not silently exclude requested
workspace artifacts or media. Read workspace/README.md for large-file handling.

Generation and refinement use clarification-first intake. Ask about each unresolved
applicable creative input before generating; accept “idk” as delegation for that
field. Preserve clear inherited inputs and do not re-ask settled choices. See
docs/commands.md for intake order and the distinction between defaults and answers.

For explicit BytesSkills /sync requests, use
plugins/bytesskills-core/skills/bytes-sync/SKILL.md. Do not equate a Git pull with
refreshing a cached plugin. Preserve workspace identities and revision history; stop
for semantic conflicts even when Git can merge the text. /sync --help is read-only.
