# BEND Phase 5.1D editing QA

Date: 2026-10-13
Branch: `main`
Starting SHA: `6a601e156f66f58bcbfb712dda448cae763773f6`
Scope: direct selection, transform, crop, appearance, animation, persistence, export, and responsive editing.

## Verdict

**PARTIAL.** The named local implementation is complete and the covered Chromium assertions pass. Broad release sign-off remains open for Firefox, the bundled runner's clean shutdown, manual accessibility/forced-colors/true-200% review, physical touch, and hardware/GPU measurements.

## Verification matrix

| Check | Result | Evidence |
| --- | --- | --- |
| Unit regression | PASS | `npm test`: 11 files, 52 tests |
| TypeScript | PASS | `npm run typecheck` |
| Production build | PASS | `npm run build`; 2,824 modules transformed; existing >500kB chunk warning |
| Direct selection/topmost/hidden/locked geometry | PASS locally | `CanvasStage.tsx`, `transform.ts`, geometry tests |
| Coordinate conversion and rotated/flipped/anchor math | PASS | `tests/unit/transform.test.ts` |
| Gesture history/rollback | PASS | `tests/unit/store.test.ts` |
| Transform/appearance/crop controls | PASS | Chromium `tests/browser/phase5-1d.spec.ts`, desktop screenshot |
| Direct move and responsive inspector | PASS | Chromium Phase 5.1D test, mobile screenshot, no horizontal overflow |
| Crop persistence/undo/export | PASS locally | normalized crop/store tests and direct PNG/MP4 export journey |
| Direct edited PNG | PASS | `chromium-phase5-1d-edited.png`, valid PNG, 750,106 bytes |
| Direct edited MP4 | PASS | `chromium-phase5-1d-edited.mp4`, H.264, 720×900, 0.5s, 216,657 bytes |
| Firefox browser execution | UNVERIFIED | Firefox did not launch on this host |
| Manual AT/touch/forced-colors/true 200% | OPEN | Not available in the current environment |
| GPU/decoder/physical-device performance | OPEN | No target hardware counters available |
| Dependency security | PARTIAL | 1 moderate + 2 critical dev-chain advisories; see security audit |

The four Chromium Phase 5.1D tests reported PASS. The process did not emit a final clean shutdown summary after the assertions, so the command was stopped after the completed results; no assertion failure or failed artifact was observed.

## Acceptance scenarios

| Scenario | Status | Note |
| --- | --- | --- |
| A — select/hit-test | PASS | Geometry hit testing is topmost-first and alpha-independent. |
| B — coordinate conversion | PASS | Pure affine round-trip and flipped/rotated geometry tests. |
| C — drag transaction | PASS | Browser move plus one-transaction store coverage; Escape rollback is unit-tested. |
| D — resize/rotate | PARTIAL | Pure geometry and visible controls are covered; a dedicated browser pointer test for every handle is still open. |
| E — crop | PASS | Presets, normalized crop, handles, dimmer, confirm/cancel, and export path covered. |
| F — orientation | PASS | Rotate, flip, reset controls and renderer path covered. |
| G — anchor | PASS | 3×3 semantic buttons and center-preserving math covered. |
| H — snapping | PASS locally | Center/edge and Shift bypass are unit-covered; physical threshold feel remains open. |
| I — precision inspector | PASS | Transform, appearance, crop, duplicate, fit/fill/center/reset controls present. |
| J — color | PASS | Pixi ColorMatrix API is pinned to installed Pixi 8.22.0 semantics; PNG/MP4 journeys apply color edits. |
| K — animation | PASS | Transform, opacity, color definitions and Auto-Key behavior are unit/browser-covered. |
| L — export parity | PASS on Chromium | Shared renderer produced directly edited PNG and H.264 MP4 artifacts. |
| M — responsive/accessibility | PARTIAL | 390px no-overflow capture and semantic labels pass; manual AT, touch, forced colors, and Firefox remain open. |

## Evidence paths

- [Direct manipulation audit](DIRECT_MANIPULATION_AUDIT.md)
- [Direct manipulation architecture](DIRECT_MANIPULATION_ARCHITECTURE.md)
- [Desktop controls capture](../output/playwright/chromium-phase5-1d-controls.png)
- [Mobile controls capture](../output/playwright/chromium-phase5-1d-mobile.png)
- [Edited PNG](../output/playwright/chromium-phase5-1d-edited.png)
- [Edited MP4](../output/playwright/chromium-phase5-1d-edited.mp4)
- Browser regression: `tests/browser/phase5-1d.spec.ts`
- Unit regression: `tests/unit/transform.test.ts`, `tests/unit/project.test.ts`, `tests/unit/store.test.ts`, `tests/unit/animation.test.ts`
