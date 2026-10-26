# BEND first-time user audit

Date: 2026-10-14
Branch: `main`
Starting SHA: `187126c9cc62c2bdeb077b387b67579c9d12a19b`
Scope: independent first-time customer walkthrough, product-quality fixes, and fresh-browser retest. No push or deployment.

## Verdict

**PARTIAL — materially improved and locally usable, but not broad release-ready.**

BEND now lets a new customer reach a live procedural composition, add real footage, apply an effect, add motion, reload the project, and produce an independently verified eight-second MP4 with preserved source audio. The primary workflow is credible in installed Chrome. The remaining gaps are a small set of Pixi teardown warnings, the unavailable bundled browser runner, and unperformed manual assistive-technology, true zoom, forced-colors, touch-device, and hardware-level performance checks.

## Method and constraints

The first walkthrough was performed before reading the internal architecture or design documentation. A fresh temporary Chrome profile was used with empty application storage. The browser interacted with the visible UI and a real fixture, `tests/fixtures/test-pattern-audio.mp4`. The internal source and documentation were read only after the black-box walkthrough, to diagnose observed problems.

The harness used the installed Chrome executable at `C:\Program Files\Google\Chrome\Application\chrome.exe`. The repository Playwright runner could not launch because its configured headless Chromium executable was absent; that is reported as an environment limitation rather than a product pass.

Evidence is under [`output/evidence/phase5-2`](../output/evidence/phase5-2). The primary browser reports are [`blackbox-journey.json`](../output/evidence/phase5-2/reports/blackbox-journey.json), [`blackbox-libraries.json`](../output/evidence/phase5-2/reports/blackbox-libraries.json), [`blackbox-export.json`](../output/evidence/phase5-2/reports/blackbox-export.json), and [`phase5-2-verification.json`](../output/evidence/phase5-2/reports/phase5-2-verification.json).

## First-time journey results

### Opening the application

The empty studio immediately communicates that BEND is a focused editor rather than a marketing page. The canvas is the largest object, the Add action is visible, and the seafoam/white identity is coherent. The first screenshot is [`before-initial-studio.png`](../output/evidence/phase5-2/screenshots/before-initial-studio.png).

The initial hesitation was vocabulary, not visual chaos. A new customer could see “composition,” “procedural,” “Source,” “Effects,” “Motion,” and a timeline before seeing a result. The empty state also used technical or abstract explanations in places where a direct action would be more useful. The empty-state wording and supporting inspector language were changed, then retested in [`after-empty-state.png`](../output/evidence/phase5-2/screenshots/after-empty-state.png).

### Three-minute creation attempt

The visible workflow succeeded:

1. Open Add → Generate motion.
2. Choose Signal Field and get a live layer immediately.
3. Open the persistent top-bar Add menu → Add video.
4. Import the real MP4 fixture.
5. Open Effects → add Motion Echo.
6. Open Edit → add a Position X keyframe and modulation.
7. Open Motion → apply Analog Ghost.
8. Open Export → render video.

The journey reached the export dialog in 6.1 seconds after the fresh page was ready; the full deliberately paced workflow and export run took 54.7 seconds, including the eight-second render. These are interaction-run measurements, not customer performance benchmarks. The initial visible result was one action after opening the Add menu. The complete export is [`phase5-2-workflow-export.mp4`](../output/evidence/phase5-2/functional/phase5-2-workflow-export.mp4).

The main remaining discoverability friction is that the empty canvas offers Add video, but once a generator exists the canvas action is no longer present; a new customer must notice the top-bar Add menu to add footage. The persistent Add control is a safe mitigation, but this remains an open P2 product decision rather than a claimed fix.

### Generator and effect discovery

All four generators were reachable from the visible Add menu, and each exposed four distinct presets:

| Generator | Presets observed | Customer-facing purpose after fix |
| --- | --- | --- |
| Signal Field | Pulse, Drift, Current, Fracture | Seeded field of noise, ribbons, and light |
| Liquid | Ink Spill, Vortex, Tidal, Nebula | Ink and color that swirl over time |
| Flow | Threads, Current, Orbit, Drift | Particles that drift, stream, and orbit |
| Refraction | Pool, Glass, Prism, Mirage | Moving glass, light, and distortion |

All five effects were reachable after importing footage: Motion Echo, Time Slice, Channel Delay, Frame Feedback, and Wave Displacement. Each had a visible Add/ON state, reset control where applicable, and layer stack. The effect descriptions were shortened to explain the visible result before the mechanism. The complete matrix is in [`blackbox-libraries.json`](../output/evidence/phase5-2/reports/blackbox-libraries.json), with representative screens in [`after-effects-inspector.png`](../output/evidence/phase5-2/screenshots/after-effects-inspector.png) and the generator screenshots in the same evidence folder.

### Motion and direct manipulation

The visible UI distinguishes the concepts after the copy pass:

- A keyframe is a deliberate property change at the playhead.
- Modulation is a repeating variation.
- A recipe is a ready-made combination that can be applied and then edited.

The browser harness created a keyframe, changed the value at a later playhead position, added modulation, applied Analog Ghost, and verified that direct rotation, flip, crop cancellation, locking, and undo/redo worked. The controls are still dense for a beginner, but the underlying capabilities remain available without a new navigation system.

### Save, close, and return

A generated layer and imported footage were reloaded in a fresh browser context with the same temporary profile. Both layers were restored, no missing-asset alert appeared, and the harness recorded no page errors. The test also injected a controlled storage failure in a disposable profile during the verification flow; no unhandled page error was recorded. This verifies the covered IndexedDB path, not every quota or corruption scenario.

### Export

The export dialog explains the distinction between a still frame and a full video, offers Preview versus Canvas quality, and reports the chosen media type when complete. The real video output independently reported:

| Property | Result |
| --- | --- |
| Duration | 8.000000 seconds |
| Video | H.264, 720 × 900, 30 FPS, 240 frames |
| Audio | AAC, present, starts at 0 seconds |
| Render | Generator remained visible after the imported two-second source ended; no unexplained blank interval in sampled frames |
| Artifact | [`phase5-2-workflow-export.mp4`](../output/evidence/phase5-2/functional/phase5-2-workflow-export.mp4) |

The still export also completed as a real 1080 × 1350 PNG: [`phase5-2-representative-frame.png`](../output/evidence/phase5-2/functional/phase5-2-representative-frame.png). Cancellation exposed a real audio-disposal race before the fix; the corrected path now reports cancellation without a page error.

## Independent issue register

Severity follows the phase definition: P0 is critical, P1 major, P2 important, and P3 minor.

| ID | Severity | Journey | Finding | Status | Retest |
| --- | --- | --- | --- | --- | --- |
| P2-001 | P2 | A, B, C, E | Technical vocabulary made the first action and creative concepts harder to predict. | Fixed | Fresh Chrome screenshots, journey, library probe |
| P2-002 | P2 | B | After a generator is added, Add video is only in the top Add menu; the canvas no longer offers the empty-state action. | Mitigated; remains open | Persistent Add confirmed; no architecture change claimed |
| P1-003 | P1 | C, F | Pixi crop uniform/resource mismatch produced 109 warnings in the library probe and flat late export frames. | Fixed | Library warning count 0; sampled export frames remain visible |
| P2-004 | P2 | F, adversarial | Cancelling video export could dispose audio input while the parallel audio write was still running. | Fixed | Cancellation message true; page errors 0 |
| P2-005 | P2 | D, accessibility | Track reorder and anchor targets were below the product's usable touch target size. | Fixed | Axe zero violations; 24px controls in source |
| P2-006 | P2 | F, accessibility | Export dialog supporting copy and action styling had weak contrast in the settled state. | Fixed | Axe zero violations across six surfaces |
| P2-007 | P2/P3 | F, performance | Normal export still emits two Pixi BindGroup teardown warnings even though output is correct. | Remaining | Latest export report records exactly two warnings |

### P2-001 — first-time vocabulary and hierarchy

**Actual behavior:** The empty and inspector states introduced a first-time customer to “procedural systems,” “source of truth,” and effect mechanics before a visible result. Motion also required interpreting `◆` and `MOD` without enough plain-language context.

**Expected behavior:** The first screen should tell a customer what to do and what each motion concept changes, in concrete language.

**Reproduction:** Open BEND with empty storage; read the empty canvas, Add menu, generator inspector, Effects tab, Motion tab, and recipe workspace without documentation. Baseline: [`before-initial-studio.png`](../output/evidence/phase5-2/screenshots/before-initial-studio.png). Compare current: [`after-empty-state.png`](../output/evidence/phase5-2/screenshots/after-empty-state.png), [`after-motion-inspector.png`](../output/evidence/phase5-2/screenshots/after-motion-inspector.png).

**Root cause:** Copy was written from the engine's model rather than the customer's intended action.

**Improvement:** Reworded empty state, generator descriptions, effect help, motion help, recipe help, and first-move guide. No feature was removed.

**Implementation status:** Fixed in `CanvasStage.tsx`, `EditorPage.tsx`, `Inspector.tsx`, `RecipesWorkspace.tsx`, and `registry.ts`.

**Retest result:** The same fresh journey reached a live generator, footage import, effects, motion, and export with no documentation lookup.

### P2-002 — adding footage after a background

**Actual behavior:** The empty canvas has Add video, but after adding a generator the canvas action is replaced by the active composition. A customer must use the top-bar Add menu to find Add video.

**Expected behavior:** Adding another layer should remain obvious at the point where a customer is looking.

**Reproduction:** Open Add → Signal Field, then inspect the canvas. The top Add button remains visible; a canvas-level Add video action does not.

**Root cause:** The canvas empty state is intentionally replaced when a composition becomes non-empty.

**Improvement:** Kept the single persistent Add flow to avoid a second creation architecture. This is a mitigation, not a full resolution.

**Implementation status:** Remaining P2. A future surgical improvement could keep a compact “Add layer” affordance near the canvas without duplicating the Add menu.

**Retest result:** The top Add menu reliably added footage in the black-box journey; no failed action occurred.

### P1-003 — renderer uniform and late-frame output defect

**Actual behavior:** The crop shader declared a scalar float uniform with an array size even though the shader consumed a vector. The library probe produced 109 Pixi warnings, and pre-fix export frames after the imported source ended could flatten to an unexplained green field.

**Expected behavior:** Generator/effect interactions should be warning-free in the covered path and the composition should render continuously through the full duration.

**Reproduction:** Add a generator, import the two-second fixture, apply a temporal effect, and export eight seconds. Inspect the console and frames around 0, 3, and 6 seconds.

**Root cause:** `uCrop` GPU resource declarations in `pixiRenderer.ts` did not match the shader's `vec4<f32>` contract.

**Improvement:** Changed all four crop declarations to `vec4<f32>` while preserving PixiJS and the existing shader path.

**Implementation status:** Fixed.

**Retest result:** Generator/effect probe warning count is 0; the final MP4 contains visible, changing generator output at sampled frames 0, 90, and 180 after the source clip ends.

### P2-004 — cancellation audio race

**Actual behavior:** Cancelling an export could dispose the audio input while the parallel audio writer still used it, yielding `InputDisposedError` in the page.

**Expected behavior:** Cancellation should stop cleanly, explain that it was cancelled, and leave the editor usable.

**Root cause:** The video error/cancellation path disposed audio resources without awaiting the parallel audio promise.

**Improvement:** Retained the parallel path but awaited the audio promise's rejection before disposing its input.

**Implementation status:** Fixed in `src/engine/export/exporter.ts`.

**Retest result:** `cancelControlAppeared: true`, `cancelledMessage: true`, and `pageErrors: []` in the fresh verification report.

### P2-005 — small manipulation targets

**Actual behavior:** The reorder handle was 16px wide and anchor controls were 19px, which the axe target-size rule flagged.

**Expected behavior:** Frequent editing and touch-adjacent controls should be reliably targetable.

**Root cause:** Compact desktop density was prioritized over minimum target size.

**Improvement:** Increased reorder and anchor targets to 24px while preserving the layout and mobile drawer architecture.

**Implementation status:** Fixed in `src/styles/global.css`.

**Retest result:** All six targeted axe surfaces report zero violations; responsive widths have no horizontal overflow.

### P2-006 — export dialog contrast

**Actual behavior:** The settled export dialog had weak contrast for the eyebrow, supporting text, option captions, and one primary action state.

**Expected behavior:** Export choices and completion feedback should remain legible against the white dialog.

**Root cause:** Supporting text and button colors were too close to the white surface.

**Improvement:** Darkened only the affected semantic text/action colors within the established seafoam palette.

**Implementation status:** Fixed in `src/styles/global.css`.

**Retest result:** Axe reports zero violations for the export dialog and the updated screenshot is [`after-export-dialog.png`](../output/evidence/phase5-2/screenshots/after-export-dialog.png).

### P2-007 — remaining Pixi teardown warnings

**Actual behavior:** A normal export completes with correct MP4 output and no page error, but the latest export report still records two Pixi BindGroup warnings about a destroyed `textureSource` and `textureSampler` remaining bound during teardown.

**Expected behavior:** A completed export should release renderer resources without console warnings.

**Root cause:** The remaining binding lifetime is inside the renderer/filter teardown boundary. `removeSprite` now detaches filters and replaces the sprite texture before destruction, which reduced the risk but did not eliminate these two warnings.

**Improvement:** Keep the warning visible in the evidence and roadmap. Further changes should be made only with a focused Pixi lifecycle reproduction; replacing the renderer would be disproportionate.

**Implementation status:** Remaining P2/P3 reliability polish.

**Retest result:** Output correctness passes; `blackbox-export.json` records two warnings and zero page errors. This is not marked fixed.

## Direct manipulation and adversarial coverage

The direct Chrome harness covered rotate, flip, crop cancel, lock behavior, undo/redo, repeated inspector switching, project reload, export cancellation, and effect/generator creation. It did not find a crash, stale selection, missing control, or page error in the covered path. The full manual matrix requested by the phase remains limited by the absence of a physical touch device, screen-reader session, and forced-colors environment.

## Responsive, accessibility, and performance evidence

| Surface | Result |
| --- | --- |
| 1440 × 900 | No horizontal overflow |
| 1280 × 800 | No horizontal overflow |
| 1024 × 768 | No horizontal overflow |
| 768 × 1024 | No horizontal overflow |
| 390 × 844 | No horizontal overflow; full-height controls drawer settled before capture |
| 200% attempt | Two Chrome `Ctrl+=` presses attempted; true browser zoom rendering was not measurable in this harness |
| Axe | Zero violations on empty, mobile, generated, effects, motion, and export surfaces |
| Keyboard | Visible UI paths and cancellation were exercised; full screen-reader semantics remain unverified |
| Performance | 163 animation-frame callbacks in a 1,005ms generator sample; host/browser callback evidence only, not a universal FPS or GPU budget |

The repository browser suite was attempted and blocked before test execution because the configured Chromium headless shell executable was missing. Direct installed Chrome evidence is retained and clearly separated from that blocked suite.

## Evidence index

### Screenshots

- Before/after empty studio: [`before-initial-studio.png`](../output/evidence/phase5-2/screenshots/before-initial-studio.png), [`after-empty-state.png`](../output/evidence/phase5-2/screenshots/after-empty-state.png)
- Generator picker and layers: [`before-generator-picker.png`](../output/evidence/phase5-2/screenshots/before-generator-picker.png), [`after-generator-signal-field.png`](../output/evidence/phase5-2/screenshots/after-generator-signal-field.png), [`after-footage-import.png`](../output/evidence/phase5-2/screenshots/after-footage-import.png)
- Effects, motion, recipe, and timeline: [`after-effects-inspector.png`](../output/evidence/phase5-2/screenshots/after-effects-inspector.png), [`after-motion-inspector.png`](../output/evidence/phase5-2/screenshots/after-motion-inspector.png), [`recipe-analog-ghost.png`](../output/evidence/phase5-2/screenshots/recipe-analog-ghost.png), [`workflow-keyframe-modulation.png`](../output/evidence/phase5-2/screenshots/workflow-keyframe-modulation.png)
- Export and mobile: [`after-export-dialog.png`](../output/evidence/phase5-2/screenshots/after-export-dialog.png), [`after-mobile-controls.png`](../output/evidence/phase5-2/screenshots/after-mobile-controls.png)

### Recording

The real browser recording [`page@932882b52fa297bca60020d6249a2e6a.webm`](../output/evidence/phase5-2/recordings/page@932882b52fa297bca60020d6249a2e6a.webm) covers the empty studio, generator creation, footage import, effect application, Motion panel, and export dialog in one source capture. It is VP9, 1440 × 900, 25 FPS, 5.680 seconds.

## Remaining limitations

- Two Pixi BindGroup teardown warnings remain after otherwise successful export.
- The repository's bundled browser suite could not launch on this host; Firefox was not independently verified.
- True 200% browser zoom, screen-reader narration, forced-colors, physical touch, GPU memory, decoder allocation, and hardware FPS were not available.
- The current persistent top-bar Add menu mitigates but does not completely solve adding a second layer after the canvas is populated.
- No group application origin or bridge was supplied; this phase does not claim group-toolset integration.
