# Definitions

Production definitions will live here as versioned YAML or JSON documents.

- `formats/`: editorial structure, required inputs, optional `extends`, workflow,
  defaults and constraints.
- `treatments/`: presentation settings for pacing, captions, sound and visuals.
- `workflows/`: stages, skill references and input/output requirements.

The first draft is `formats/reductions.json`, linked to a narrator treatment,
production workflow, and proposed sound palette. See [Reductions](../docs/reductions.md).
Definitions are design data; no resolver is implemented yet. Add IDs and versions
explicitly; folders do not establish inheritance. Sound libraries describe reusable
asset collections; their entries must point to real files before use.

See [extension authoring](../docs/extending-bytes.md). Optional `skills/` and
`object-profiles/` directories hold validated draft authoring contracts; files do
not activate new runtime capabilities by themselves.
