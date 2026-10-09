# Bait: engagement settings

Bait is an engagement tactic, not a content format. The original format has been
renamed to [Troll](troll.md).

- `--bait=rage`: provoke a reaction through the premise.
- `--bait=comment`: invite a specific audience response, including a request for help.
- `--bait=rage --bait=comment`: combine both.
- `--bait=none`: explicitly use neither; cannot be combined with another bait value.

Flags form a set; repeated values deduplicate, and an explicit set replaces inherited
choices. If unresolved, ask rather than silently selecting. These settings may be
used by different formats but cannot override a format's contract. A reduction must
substantiate its opening; a troll can sustain an intentionally absurd premise.

```text
/bytes brainstorm --concepts --format=troll --bait=rage --bait=comment
/bytes brainstorm --concepts --format=reductions --bait=comment
```

See [engagement definition](../definitions/engagement/bait.json). Commands remain
assistant-facing design contracts, not an implemented generation runtime.
