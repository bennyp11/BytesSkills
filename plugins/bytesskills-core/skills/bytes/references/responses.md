# Standard artifact responses and follow-up commands

Apply this shared presentation contract to every BytesSkills operation. It changes
how results are presented, not what is authorized, saved or executed. Follow-up
commands are suggestions; do not execute them automatically.

## Created or revised artifacts

Lead with a concise, truthful outcome: saved, revised, partially saved, local-only,
or failed. Then use this order for each result:

1. **Number and title** — a short recognizable label. Numbers are selection aids,
   never artifact IDs.
2. **Preview** — enough content to choose the item; provide full content when asked.
3. **ID** — the exact full pinned pointer returned by the runtime, in inline code.
4. **Next — action label** — one useful follow-up in its own `text` code block,
   with the real pointer already substituted. No shell prompt, bullets, comments
   or multiple competing commands inside that block.

For multiple candidates, repeat the compact card for each, keeping display numbers
stable within the response. Use one default next action per card, plus at most two
additional shared actions when genuinely helpful. Put run and source pointers once
at the end, only when actually known. Keep provenance detail accessible via show.
For a single result, omit the unnecessary candidate number.

## Lists and inspection

List/search results use the same title → preview → ID → next-action pattern. Say
“Found” rather than “Saved”; listing must not create new records. Default to an
exact `/bytes show POINTER` action when the next creative step is unclear. Keep
results bounded; never claim all results were shown if pagination remains.
When a cursor is returned, offer a separate next-page command using its exact value
and the original supported filters. Do not invent cursors or continuation commands.
An empty list reports no matches and may offer a supported search/help action.

For a long result set, use a compact title/ID/preview table followed by independently
copyable action blocks labelled with the same numbers. Never put essential commands
only inside a Markdown table where they are hard to copy.

## Constructing a usable command

- Use only commands/flags supported by the active deployed command contract. A
  proposed skill or an unpublished source change is not a callable next action.
- Copy exact full `@type/UUID:vN` references from acknowledged save/get/query results.
  If a result supplies only identity without a revision, resolve it before claiming
  a pinned reference. Do not allocate IDs, infer them from titles or use example IDs.
- Pin read and derivation actions to the displayed revision. For refinement, which
  operates on the latest artifact, use its real stable identity without `:vN` and
  label it “Refine latest”; the next run rereads it and uses expected_revision.
  If the user intends to change an old revision, explain that an explicit branching
  decision is needed rather than silently editing latest.
- For hooks → script, include the real source concept AND selected hook. Resolve
  their relationship if needed; do not guess a concept or substitute a nearby item.
- Fill all known inputs. If creative choices are missing, omit only parameters whose
  omission invokes supported clarification, and label the action “asks for …”.
  Never put `<pointer>`, `...`, `YOUR_ID` or an invented request into a runnable block.
  If required inputs cannot be resolved, offer show/help or ask for the missing input.
- Quote free-text values and paths using JSON-style double-quoted escaping so embedded
  quotes and line breaks remain data. Commands are assistant-interpreted, never shell
  scripts. Include no credentials, signed URLs or hidden private metadata.
- A displayed index such as “2” may resolve to that response's exact pointer in a
  follow-up conversation. If multiple lists or revisions make it ambiguous, clarify.

Useful defaults, only when their prerequisites and deployed support are established:

| Result | Follow-up |
| --- | --- |
| Concept | Brainstorm hooks using that concept revision |
| Hook with known concept | Brainstorm a script using both pinned inputs |
| Script | Show settings, or refine latest with an explicitly supplied requirement |
| Plan | Show the plan; propose execution only with valid source/tool inputs |
| Verified cloud video | Show it, or caption it when captions is an available workflow |
| Run | Show its saved outcome |
| Other artifact or unknown context | Show the exact saved revision |

## Unsaved, local and authoring results

A failed save has no new artifact ID. Preserve actual successful pointers on partial
failure and clearly distinguish unsaved content. Local media may have a real file
link but no cloud video pointer; never disguise a saved plan pointer as a video ID.
Use an accessible local path in a command only when appropriate for the current
machine, and label it local-only rather than promising cross-device access.

Skill-definition authoring returns the real skill slug and version, its state
(draft/published/adopted if verified), and the actual source/PR link when available.
A definition ID is not an artifact pointer. Give a command ready to use only when
that skill is available in the target connection; otherwise label syntax as a preview
that requires deployment/publication. Do not create an artifact just to satisfy this
response template. Help and clarification remain concise and read-only.

## Authoring acceptance checks

Every new skill inherits this contract. Check a single save, several candidates,
a list with pagination, a failed/partial save and a local-only media result. Verify
that each ID matches returned data, each command references the intended item, all
flags are supported, and copied commands contain no placeholders. Check quotation
handling for titles/paths containing spaces and quotes. Review-only suggestions must
not execute or broaden the original request.
