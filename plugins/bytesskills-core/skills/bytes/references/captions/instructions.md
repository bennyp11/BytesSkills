# Add captions in CapCut

Use `/bytes captions --app=capcut` or an equivalent request to have BytesSkills add
visible speech captions to a video using CapCut computer control. The deliverable
is an exported video with captions visible in its pixels and an editable project.
A request to create this skill, explain captioning, transcribe audio or produce only
an SRT file is not permission to edit a video. `--help` is read-only.

Use the pinned CapCut edit handler for capability checks, observed UI operation,
project preservation, bounded retries, export verification and persistence. Those
mechanics are shared; the caption-specific scope and intake below govern this run.
Do not start another workflow just to reuse that handler. The host must expose
computer control and file access; the BytesSkills MCP server alone does not provide
control of CapCut. Do not silently substitute another editor or media service.

## Parameters and clarification

- `--app=capcut`: only supported editor in this version. A natural-language request
  explicitly naming CapCut supplies this parameter.
- `--source`: accessible footage, a real video pointer, or unambiguous current project.
- `--project`: optional existing project identity; verify the loaded project.
- `--language`: spoken language or explicit delegation to detect it. Do not assume
  English. Translation is a separate request; never silently translate speech.
- `--style`: an approved accessible treatment/style reference or a plain-language
  description. Examples include plain readable captions or word highlighting; these
  are intents to resolve against available controls, not assumed CapCut preset names.
- `--placement`: desired position or explicit delegation to choose it.
- `--existing`: preserve, replace or restyle existing editable captions, when present.
- `--output`: destination for a separate captioned video, outside Git workspaces.

Ask one question at a time for unresolved applicable source, language, style,
placement, existing-caption handling and destination. Keep settled inherited choices.
“Idk” delegates that creative field. It cannot supply missing media or app access.
Use the current video duration, cut order, framing, music and audio as the baseline;
captioning does not require a new creative brief about unrelated edits. If an export
setting must be chosen and cannot be inherited, clarify it or use delegated judgment.

## Caption workflow

1. Begin the versioned workflow and save a pending run and caption plan. Pin real
   source pointers and inherited format/treatment versions. Record local source
   locators honestly when the footage is not a cloud artifact.
2. Inspect the footage and existing caption state. Distinguish editable caption
   tracks from text already burned into the source. Burned-in text cannot simply
   be removed by deleting a track; request a clean source or an explicit alternative
   if replacing it is necessary. Avoid a second overlapping caption layer.
3. Preserve the project using the edit handler's observed save/copy workflow. Inspect
   the available caption controls. If speech recognition is offered, choose the
   supplied/detected language and the intended audio source/range, then generate.
   Inspect completion and the resulting track; a button click alone is not success.
   If that capability is absent or gated, report it and use only an already-authorized
   accessible alternative transcript/import workflow. Never subscribe or purchase.
4. Check transcription against audible speech or a trustworthy supplied transcript.
   Correct names, numbers, punctuation and omitted/repeated words without rewriting
   what the speaker said. Flag uncertain words instead of inventing them. Multiple
   speakers or languages need appropriate review. If there is no intelligible speech,
   explain the mismatch rather than fabricate captions. Record any unreviewed segments.
5. Apply the resolved style consistently. Check phrase breaks, reading time, line
   length, contrast, screen edges and overlap with faces or existing hook text. Use
   animation/highlighting only when requested, inherited or delegated and available.
6. Review the full caption track against the speech where tools permit, including
   the beginning, end, cuts, fast phrases and silence. Inspect every caption for
   cropping/overflow; long lines and unusual characters need particular attention.
   Correct early/late timing and captions lingering into silence. Do not claim a
   complete speech/timing review if the available control tools cannot play or hear it.
7. Export a separate captioned video with inherited source settings unless the user
   requested a change. Verify that the rendered file exists and captions are actually
   visible in the export, not merely enabled in the editor preview. Check duration,
   dimensions, representative caption frames and audio where accessible. Report any
   unintended changes to source timing/framing/audio or failed quality checks.

## Save and return

Keep the editable project, caption plan and run outcome. Save verified video bytes
through supported artifact ingestion and return real pointers only after success.
The 10 MB service limit applies: larger exports remain explicitly local-only, with
locator and verification results recorded in the plan/run. A caption transcript or
local filename is not a saved video blob. Never put video/project data in Git.

A first captioned derivative gets a new video ID with pinned source derivation.
Revising an existing saved captioned derivative preserves that ID and uses its
expected revision; never replace the original source artifact just because it was
captioned. Preserve completed work if export or upload fails and report partial state.
Return the actual export link, editable project identity/location, language/style,
checks performed, saved plan/run/video pointers and local-versus-cloud status.
