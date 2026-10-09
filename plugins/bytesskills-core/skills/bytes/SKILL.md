---
name: bytes
description: Entry point for the BytesSkills content workflow library. Interpret /bytes commands and explicit requests to use BytesSkills, including help and Git synchronization. Do not intercept unrelated plugins or generic help/sync requests outside BytesSkills.
---

# BytesSkills

Use `/bytes <command> [parameters]` as the canonical assistant-facing language.
This skill is the single entry point; read relevant references directly rather than
asking the user to invoke additional skills. Do not execute the command text as a
shell command. Native host invocation may differ; these aliases do not register a
terminal executable or guarantee a slash-menu entry on every platform.

## Route the request

1. `/bytes`, `/bytes --help`, or a BytesSkills overview request: read
   [help instructions](references/help/instructions.md) and show concise help.
2. `/bytes <command> --help`: show that command's help before any intake, generation,
   fetch, file mutation or sync. Help has precedence over every other flag.
3. `/bytes sync [--check] [--repo="/absolute/path"]`: read
   [sync instructions](references/sync/instructions.md) and follow its procedure
   using available tools. Ask for the checkout only when not identifiable.
4. `brainstorm`, `refine`, `show`, `list`, `move`, `archive`: explain the current
   implementation boundary using the [guide](references/help/references/guide.md).
   These operations remain design-only: do not claim an operational pointer store,
   allocate fake IDs, or pretend artifacts were saved. If the user wants to develop
   or discuss the workflow, use clarification-first intake without claiming execution.
5. Unknown command or unsupported flag: explain the issue and offer the nearest
   supported form. Never fall through to a generic tool or unrelated plugin.

Canonical commands:

```text
/bytes --help
/bytes brainstorm --concepts --format=reductions
/bytes brainstorm --hooks --concept=@concept/002
/bytes refine --hook=@hook/005 --req="Make it more personal"
/bytes show @concept/002 --tree
/bytes list --type=concept
/bytes move @concept/018 --parent=@concept/002
/bytes archive @hook/005
/bytes sync --check
/bytes sync
```

Pointers here are examples, not existing artifacts. All suggested next commands
must use `/bytes`. Do not intercept bare `/sync`, `/help`, or `/brainstorm`; those
may belong to another plugin. If an old BytesSkills example is explicitly identified,
translate it to the namespaced form and apply the same capability limits.

## Creative intake and capability boundaries

Unresolved creative fields require one clarifier at a time before generation.
Clear inherited values and settled answers do not need repeating. “Idk” delegates
one choice; “choose everything else” delegates the remaining choices. Help and sync
do not trigger this creative questionnaire.

Other plugins are execution tools a future workflow may use when actually available;
they are not stacked user-facing invocations. Check capability and permissions before
using an editor, image generator or other external service. Reading this skill does
not install those tools or grant access to another platform.

After sync, distinguish the updated source checkout, reread instructions in this
chat and any installed or cached plugin. Do not equate source updates with a reload.
