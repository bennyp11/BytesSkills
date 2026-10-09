# Reductions: first content format

A reduction makes a complex topic understandable to more people. It begins with an
oxymoron, apparent contradiction, or surprising claim, then resolves the curiosity
gap through an entertaining ELI5 explanation. Near the end it acknowledges the
simplification and its relevant limits, and closes with “If you found this helpful,
hit follow.”

The delivery is an on-camera narrator with dead air removed, opening hook text,
speech captions, restrained sound effects, and optional light explanatory animation.

## Definitions

- [Format](../definitions/formats/reductions.json): story and accuracy requirements.
- [Treatment](../definitions/treatments/restrained-narrator.json): presentation defaults.
- [Workflow](../definitions/workflows/reduction-production.json): stages and handoffs.
- [Sound palette](../definitions/sound-libraries/reductions-light.json): proposed effect
  categories, with an empty recording inventory.

These are draft definitions, not a running renderer or implemented CLI. The format
is grounded in the user's description. Sound categories and practical review checks
are proposed elaborations; caption construction carries the user's earlier preference
for manually timed text. No numeric runtime, music choice, zoom frequency, animation
style, or audio recording has been invented as an approved default.

## Information passed between stages

A concept carries the topic, audience benefit, central claim and source material.
A hook carries spoken text, on-screen hook text and the promise its explanation must
fulfill. A script carries the opening, explanation, resolution, qualification and CTA.
An edit plan carries cuts, final transcript, caption timing, effect asset references
and any selected animation treatment. Each output pins its input revisions and saves
resolved definition versions with its run.

## Illustrative invocation

```text
/brainstorm --concepts --format=reductions --count=3
/brainstorm --hooks --concept=@concept/002
/brainstorm --script --concept=@concept/002 --hook=@hook/005
```

The pointers above are illustrative. No live creative artifacts have been created.
The worked example in examples/reductions remains fictional and does not allocate IDs.

## Next creative decisions

Choose a target duration when a piece needs one. Review the proposed SFX categories
and select actual recordings before executing the sound pass. Define animation
styles through examples before adding them as reusable treatments. Music remains
unspecified, not mandatory and not prohibited.
