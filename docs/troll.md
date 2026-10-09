# Troll

A straight-faced bit where the narrator says something deliberately stupid or absurd.
People with the relevant shared knowledge recognize the joke. “Joke” is a broader
description; `troll` is the canonical format name.

The format defines the bit. The [deadpan treatment](../definitions/treatments/deadpan.json)
defines delivery. [Bait](bait.md) separately selects engagement tactics.

```text
/bytes brainstorm --concepts --format=troll --bait=rage
/bytes brainstorm --concepts --format=troll --bait=comment
/bytes brainstorm --concepts --format=troll --bait=rage --bait=comment
```

Comment-only still retains the troll format's absurd premise; a straightforward
non-joking question can use comment bait with another appropriate format.

Example: “I renamed my file from .jpg to .mp4, but the picture still isn't moving.
Does anyone know what frame rate I need to set?” The false premise is the bit;
the help request is the comment tactic. This is illustrative, not a saved artifact.

See [format](../definitions/formats/troll.json) and
[workflow](../definitions/workflows/troll-production.json). No production artifacts
referenced the retired draft `bait` format, so this rename requires no artifact migration.
