# BEND Phase 5.5 — Creative Audit

Date: 2026-10-25  
Reviewed against the running Studio 2.0 editor in system Chrome, including real exports.

## What changed for a working artist

### Can users combine effects faster?

Yes, materially.

- Copy Stack and Paste Replace/Append remove the repetitive part of rebuilding a treatment on a new layer.
- The clipboard summary says whether animation is included before the paste, and the paste result explains remapped tracks and whether Frame Feedback had to remain terminal.
- Before/after comparison is one held control away and names the layer being compared. It is fast enough to use as a reflex while tuning, not a mode users must enter and then remember to leave.
- The effect variation control is deliberately hidden behind a disclosure. It does not compete with the primary effect parameters.

The main remaining friction is that there is still one effect of each type per layer. The clipboard reports skipped duplicate types rather than inventing a second same-type slot, which is honest and avoids ambiguous animation identity.

### Can they produce new visual outcomes?

Yes.

- Layer blend modes create a real compositing step, not only more temporal sampling. Multiply and Screen against a procedural bed immediately read as new images; Overlay is supported by the same custom blend filter path.
- Ellipse and gradient masks turn a full-frame generator or clip into a window, band, or reveal. Feathering is soft and deterministic, and inversion is useful rather than a checkbox afterthought.
- The combination of a masked moving layer, a blended procedural bed, and temporal echo is one coherent composition rather than three disconnected demos.

The gradient is currently a linear band with containment at the mask rectangle. That is useful, but radial/linear alpha refinement could be a future addition. It was not needed to make masks real in this phase.

### Can they make variations without losing their work?

Yes.

- Variation is seeded and visible as a seed. Re-entering the same seed reproduces the same settings; Undo and Redo behave as ordinary project history.
- Structural data (IDs, durations, source seed, quality, preset identity) is excluded, so "Wild" does not corrupt the layer.
- Animated values for a varied property scale with the base value, which prevents the common disappointment of randomizing a property whose track immediately overrides it.

There is no per-parameter lock UI, so artists cannot protect selected values beyond choosing a scope. The scope choices (Motion, Structure, Appearance) are a practical compromise that avoids extra surface area.

### Are masks genuinely useful?

Yes, but with one deliberate limit.

- Rectangle, ellipse, and linear gradient all render in preview and in exported PNG/video.
- Mask position, size, rotation, feather/falloff, and invert are precise inspector controls.
- Animating mask position and feather is straightforward through the existing ◆/Auto-Key model. The test composition's animated ellipse survived save/reload and exported video.
- Crop and mask remain clearly separate: crop changes source framing; mask changes what remains visible in the composition. The copy in the inspector reinforces that distinction.

Direct canvas handles for masks were not shipped. That is the honest trade-off in this phase: precise, accessible inspector controls are better than broken drag handles that imply precision they do not have.

### Is animation editing less repetitive?

Yes, for the common "repeat this phrase later" task.

- Shift-click group selection, copy/paste relative timing, duplicate, delete, and group drag reduce repeated single-key editing.
- The selected-keyframe panel shows mixed easing, a curve preview from the actual evaluator, and applies easing to the whole selection in one history step.
- The duplicate operation correctly refuses an impossible placement at the composition end rather than squeezing the phrase and changing its timing. The explanation tells the artist how to proceed.
- Hold is explicit, not an unlabeled step in a list.

Group selection is intentionally scoped to one layer. Cross-layer keyframe selection would add a second mental model and more complex paste compatibility than the current workflow needs.

### Are loop exports predictable?

Yes, with an important distinction kept visible.

- The loop is a playback/work window; it does not silently alter layer timing or composition duration.
- Range export shows exact start, end, duration, output start at zero, and frame count.
- The middle-of-composition test produced exactly 3.000s / 90 frames and matched the corresponding full-composition frame at SSIM 1.000.
- Liquid + Frame Feedback range export matched the full composition at the start frame (SSIM 0.9959), demonstrating deterministic state reconstruction rather than assuming temporal state begins at the export start.
- Ordinary loop playback is clearly separate from Seamless repeat. Seamless is an export option with an explicit eligibility explanation.

The seamless path is a mirrored time map, not a claim that every generator is mathematically periodic. It produces a verified frame-continuous repeat for supported analytic procedural compositions; audio is omitted. Unsupported stacks are told why, rather than given a loop button that restarts and calls itself seamless.

### Do the new controls add unnecessary complexity?

Mostly no.

- Blend lives inside Appearance, not a separate compositing workspace.
- Mask is one disclosure with shapes and contextual controls.
- Compare, clipboard, and variation are in the Effects surface where the artist is already working.
- Loop is a compact bar under the timeline, not a new panel.
- The export range/seamless options appear only for video export.

The main density increase is in Export and the Effects stack. Both were made scrollable/compact, and the repeated Export-open defect was fixed by giving each open a fresh session.

### Does the editor still feel distinctly BEND?

Yes. The canvas remains dominant; the inspector remains contextual; the timeline remains the animation authority. The new surfaces use the existing white/seafoam Studio 2.0 hierarchy, Instrument Sans/typography, teal action states, and restrained motion. Nothing was recolored into a generic "creative tool" dark UI. The new states are described in plain language ("Hold to compare", "Keep edit timing", "Starts at 0.00s · 90 frames") rather than in renderer jargon.

## Meaningful issues found and fixed

1. **Filtered procedural blend modes did nothing.** The Pixi filter pass ignored the leaf blend mode. Fixed with a back-buffer layer blend filter; five modes now produce distinct preview and export frames.
2. **Temporal sampling order was wrong.** Procedural temporal samples could include a transform/crop/color that the final compositor applied again. Sampling now records the raw source and the declared compositing order is applied once.
3. **Rapid Export reopen showed the previous completed result.** A motion presence child could be reused with old state. Each open now has a unique session key; the full Phase 5.3 cancel/retry flow passes.
4. **Tall export dialog hid the download action.** The dialog is now bounded and scrollable.
5. **Mask texture upload ran every frame.** Static masks no longer re-upload; only shape/feather/gradient changes rebuild the alpha texture.
6. **Project switches could retain temporal feedback caches.** Temporal state now resets by project identity.
7. **Impossible keyframe duplicate was initially confusing in testing.** The product was doing the right thing by rejecting a phrase with no room; the test was corrected to demonstrate duplicate/space behavior honestly rather than weakening the guard.

## Honest limitations

- Seamless repeat is export-only and mirrors time; it is not a universal generator-period solver.
- Audio is omitted from seamless repeat by design.
- Direct mask manipulation is not available on canvas.
- Mask types are rectangle, ellipse, and linear gradient; no polygon/feather-point editor.
- Keyframe groups are per-layer.
- Variation has scopes but not per-parameter locks.
- The heavy stateful composition is slow on SwiftShader; no hardware-GPU claim is made.
- Firefox, hardware GPU, screen-reader, and 200% zoom verification remain outside this pass.

## Verdict

As a creative instrument, Phase 5.5 succeeds: it shortens the loop from idea to variation to comparison to a finished masked, blended, animated export. The remaining limits are intentionally narrow and visible in the interface rather than hidden behind misleading loop or mask claims.
