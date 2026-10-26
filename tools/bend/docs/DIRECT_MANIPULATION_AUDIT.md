# BEND Phase 5.1D direct manipulation audit

Date: 2026-10-13
Branch: `main`
Starting SHA: `6a601e156f66f58bcbfb712dda448cae763773f6`
Scope: local direct-manipulation, editing-depth, shared-renderer, persistence, and release verification. No push or deployment was performed.

## Verdict

**PARTIAL / implemented locally.** The editor now has a shared geometry model for selection, movement, scaling, rotation, crop, anchor, flip, snapping, precision values, color adjustments, and Auto-Key edits. PNG and H.264 MP4 exports were exercised after direct edits. Firefox, physical touch, manual assistive-technology review, forced-colors, hardware profiling, and a clean repository Playwright shutdown remain open gates.

## Starting-point findings

The project already had a schema-v2 document, ordered layers, a Zustand history boundary, a 650ms debounced IndexedDB save, a PixiJS compositor, a temporal evaluator, an animation evaluator, and a Mediabunny export path. Before this phase, `BendTransform` only modeled position, uniform scale, rotation, and opacity; crop, anchor, flip, layer-local color adjustments, and canvas gesture geometry were not shared project concepts.

## Implemented audit

| Area | Implementation | Evidence |
| --- | --- | --- |
| Selection | Reverse-order topmost eligible geometry hit testing. Hidden layers do not intercept; locked layers can be inspected but cannot be edited. | `src/features/editor/CanvasStage.tsx`, `src/engine/core/transform.ts` |
| Coordinates | Client/display/composition/local/source-space helpers, inverse affine matrices, rotated bounds, anchor-aware position. | `src/engine/core/transform.ts`; `tests/unit/transform.test.ts` |
| Gestures | Pointer-down snapshot, transient movement, one pointer-up history commit, Escape/pointer-cancel rollback. | `src/app/store.ts`, `CanvasStage.tsx`, `tests/unit/store.test.ts` |
| Resize/rotation | Corner scale handles, uniform scale, rotation handle, live angle, Shift 15-degree rotation snap. | `CanvasStage.tsx`, `transform.ts` |
| Crop | Normalized source crop, free/original/1:1/4:5/9:16/16:9 presets, crop mode with dimmed outside, eight handles, confirm/cancel/reset. | `Inspector.tsx`, `CanvasStage.tsx`, `project.ts`, browser evidence |
| Orientation | Rotate ±90, horizontal/vertical flip, reset orientation. | `Inspector.tsx`, project normalization |
| Anchor | 3×3 anchor controls and center-preserving position adjustment. Anchor is static by policy. | `Inspector.tsx`, `transform.ts`, browser evidence |
| Snapping | Center/edge composition snap in screen-space threshold; Shift disables snapping. Guides are DOM overlay only. | `transform.ts`, `CanvasStage.tsx` |
| Precision | Scale, X, Y, rotation, opacity, anchor, orientation, center/fit/fill/reset, duplicate, and layer-local color controls. | `Inspector.tsx` |
| Appearance | Pixi `ColorMatrixFilter` brightness, contrast, saturation, and hue with bypass/reset. | `pixiRenderer.ts`, `animation/engine.ts` |
| Animation | Auto-Key adds/updates transform, opacity, and color keyframes. Crop, anchor, and flip remain static. | `store.ts`, `Inspector.tsx`, `animation/engine.ts` |
| Render/export parity | The same normalized project and Pixi renderer feed preview, still export, and video export. | `pixiRenderer.ts`, `exporter.ts`, browser/export artifacts |
| Persistence/security | New fields normalize old schema-v2 documents; source media remains outside project JSON; no network or executable project payload is introduced. | `project.ts`, `storage/`, `DEPENDENCY_SECURITY_AUDIT.md` |

## Effect order

The documented layer-local order is:

`source/generator or temporal sample → Wave Displacement → normalized source crop → ColorMatrix adjustment → final anchor/scale/flip/rotation transform → composition`

Signal Field, Flow, and Refraction remap their generator UVs for source-space crop. Other texture-backed layers use the shared crop filter. Crop is spatial and does not change video trim or timeline timing. Guides, handles, and the crop dimmer are DOM presentation only and cannot enter an export frame.

## Evidence and limits

- Unit suite: 11 files, 52 tests, PASS.
- TypeScript no-emit: PASS.
- Vite production build: PASS; existing large-chunk warning remains.
- Chromium Phase 5.1D suite: 4/4 tests reported PASS, including direct controls, direct move/responsive layout, edited PNG, and edited H.264 MP4. The runner did not return its final shutdown summary and was stopped after all four test results had printed; this is recorded as a harness limitation, not a failed assertion.
- Edited PNG: `output/playwright/chromium-phase5-1d-edited.png`, valid PNG, 750,106 bytes.
- Edited MP4: `output/playwright/chromium-phase5-1d-edited.mp4`, independently inspected as H.264, 720×900, 0.500000s, 216,657 bytes.
- Rendered UI captures: `output/playwright/chromium-phase5-1d-controls.png` and `output/playwright/chromium-phase5-1d-mobile.png`.
- `npm audit` reports one moderate and two critical advisories in the dev-only Vitest 3.2.7 test chain. The available fix is a Vitest 5 major upgrade and was not applied in this phase.

The remaining release boundary is documented in [PHASE5_1D_EDITING_QA.md](PHASE5_1D_EDITING_QA.md) and [RELEASE_READINESS.md](RELEASE_READINESS.md).
