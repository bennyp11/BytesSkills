# Illustrative walkthrough (not live workspace data)

The name `reductions` comes from the user. All content and setting values here are
fictional, used only to test the proposed model. The actual draft format is in definitions/formats/reductions.json; this walkthrough
does not override it.

1. `/bytes brainstorm --concepts --format=reductions --count=3`
   saves new concepts including `@concept/002:v1`, “The cost of optionality”.
2. `/bytes brainstorm --concepts --parent=@concept/002 --count=2`
   saves `@concept/018:v1`, “Keeping career options open”, with parent `@concept/002`
   and derivation source `@concept/002:v1`. Context is captured at generation time.
3. `/bytes brainstorm --hooks --concept=@concept/018 --count=3`
   saves hooks including `@hook/005:v1`. Each carries the concept's format context.
4. `/bytes refine --hook=@hook/005 --req="Start with a personal admission"`
   saves `@hook/005:v2`. Revision 1 remains intact.
5. `/bytes brainstorm --script --concept=@concept/018 --hook=@hook/005`
   resolves the inputs to concept v1 and hook v2 and saves `@script/008:v1`.
6. Refining the hook again creates v3; the script still references v2.
7. `/bytes move @concept/018 --root` changes its organization in a new revision. Its ID,
   existing scripts and original generation provenance remain valid.
8. A later format edit changes defaults for future resolutions; the saved script
   retains its exact settings snapshot and definition version.

## Conflict cases to test during implementation

- A hook belongs to a different concept: surface the mismatch before script creation.
- Two inputs have different formats: ask or accept an explicit compatible resolution.
- An explicit format switch drops stale defaults from the old format.
- Reparenting a concept beneath its descendant fails without changing either object.
- A nonexistent pointer produces no fabricated content.
- Refining an old revision does not silently supersede newer work.
- Partial generation saves completed candidates and marks the run partial.
- A push failure preserves local files and reports backup pending.
- Archived inputs remain resolvable; ordinary lists omit them.
