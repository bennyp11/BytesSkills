# Bait: engagement settings

Bait is an engagement tactic, not a content format. The original format has been
renamed to [Troll](troll.md).

- `--bait=rage`: provoke a reaction through the premise.
- `--bait=comment`: invite a specific audience response, including a request for help.
- `--bait=share`: create a reason to send the piece to a specific person or group.
- Repeat flags to combine any compatible tactics.
- `--bait=none`: explicitly use no bait; cannot be combined with another bait value.

Flags form a set; repeated values deduplicate, and an explicit set replaces inherited
choices. If unresolved, ask rather than silently selecting. These settings may be
used by different formats but cannot override a format's contract. A reduction must
substantiate its opening; a troll can sustain an intentionally absurd premise.

```text
/bytes brainstorm --concepts --format=troll --bait=rage --bait=comment
/bytes brainstorm --concepts --format=reductions --bait=comment
```

Share bait is about recipient recognition or value: “this is you”, “this is us”,
or “you need to see this”. An explicit share CTA is optional; the content itself
should supply the reason to send it. It does not require an absurd premise.

```text
/bytes brainstorm --concepts --format=reaction --bait=share
/bytes brainstorm --concepts --format=troll --bait=comment --bait=share
```

See [engagement definition](../definitions/engagement/bait.json). Commands remain
assistant-facing design contracts, not an implemented generation runtime.
