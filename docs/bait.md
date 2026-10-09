# Bait

One format, two combinable modes:

| Modes | Creative contract |
| --- | --- |
| `rage` | Deliberately stupid or absurd statement, delivered with a straight face. Insiders recognize the bit. |
| `comment` | A premise that invites a specific response, especially a request for help. Absurdity is optional. |
| `rage` + `comment` | The deadpan absurd premise leads into a sincere-sounding request for audience help. |

```text
/bytes brainstorm --concepts --format=bait --bait=rage
/bytes brainstorm --concepts --format=bait --bait=comment
/bytes brainstorm --concepts --format=bait --bait=rage --bait=comment
```

These remain proposed generation commands. `--bait` is a repeatable set-valued
parameter, not three separate formats. Repeated values deduplicate; order is
irrelevant. An explicit set replaces an inherited set. With no flag, inherit a
settled selection or ask “rage, comment, or both?” Never silently select a mode.
Other scalar flags retain their existing duplicate/conflict validation.

## Concept information

In addition to topic, angle and audience value, rage concepts carry:

- The in-group and shared knowledge that makes the joke legible.
- The narrator’s deliberately absurd premise.
- Why the premise is wrong and why that particular misunderstanding is funny.

Comment concepts carry the desired audience contribution and a specific question.
Combined concepts carry both. These are internal creative notes; the performer
need not explain the joke in the video. The role of a stated claim is recorded as
part of an intentional bit, rather than as a verified educational takeaway.

## Illustrative combined premise

“I renamed my file from .jpg to .mp4, but the picture still isn’t moving. Does
anyone know what frame rate I need to set?”

The in-group knows changing a filename extension does not turn a still image into
an animation. The request for help grows from the same misunderstanding. This is
an illustration, not a saved concept or a claim that the bit will perform well.

## Boundaries between formats

Bait is independent of Reductions. It does not inherit the ELI5 explanation,
near-end qualification, follow CTA, or edit settings. Its ending may leave the bit
intact. Comment-only need not manufacture outrage. The combined mode gets its
comment prompt from the premise rather than appending “comment below” arbitrarily.

See [format](../definitions/formats/bait.json),
[treatment](../definitions/treatments/deadpan-bit.json), and
[workflow](../definitions/workflows/bait-production.json).
