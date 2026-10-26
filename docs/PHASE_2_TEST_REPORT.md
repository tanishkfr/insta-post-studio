# Studio 2.0 — Phase 2 Test Report

**Date:** 2026-10-26  
**Runtime:** Windows, Node `v24.13.0`, npm `11.6.2`, Playwright Chromium. Desktop acceptance at 1440×900; narrower-layout acceptance at 1024×768 and 900×700.  
**Result:** PASS for the Phase 2 scope.

## Commands and results

| Command | Result |
| --- | --- |
| `npm run verify` | **PASS** — contracts typecheck, host production build, 10 unit/component files / **47 tests** |
| `npm run test:browser` | **PASS** — **34 Chromium acceptance tests** in 2 workers |
| `npx playwright test tests/browser/image-roundtrip.spec.ts --project=chromium` | PASS |
| `npx playwright test tests/browser/image-to-vector.spec.ts tests/browser/image-to-type.spec.ts --project=chromium` | PASS |
| `npx playwright test tests/browser/type-smoke.spec.ts tests/browser/custom-type-smoke.spec.ts --project=chromium` | PASS |
| `npx playwright test tests/browser/native-exports.spec.ts --project=chromium` | PASS — Image PNG/ZIP/GIF, Vector SVG/PNG, Type Library PNG, Custom Type PNG/OTF |
| `npx playwright test tests/browser/mixed-layers.spec.ts tests/browser/layout.spec.ts --project=chromium` | PASS |
| `npx playwright test tests/browser/phase2-reliability.spec.ts --project=chromium` | PASS |

**GitHub CI:** [run 40366524254](https://github.com/tanishkfr/insta-post-studio/actions/runs/40366524254) passed both jobs at commit `6f004e1ef6e71261472736b8191a9018b3cfe3f0` — contracts typecheck, production build, 47 unit tests and all 34 Chromium browser tests. An earlier run (`40363939257`) failed only because two failure-path tests matched both the publish alert and the save banner; the tests were narrowed to the publish-error region and rerun green.

Playwright now runs **2 workers** with a 120-second test timeout because the
preserved Image and Type renderers perform synchronous full-resolution work. An
earlier 8-worker run overloaded the browser and produced timeouts in tests that
pass deterministically at two workers; no product assertion failed in that run.

The browser harness fails on any uncaught page error or `console.error` from the
host or embedded frames. The one intentional font-load-failure test annotates the
expected 404 font errors; every other console error remains guarded.

## Unit and component tests

| File | Tests | Covers |
| --- | ---: | --- |
| `src/state/projectStore.test.ts` | 9 | order reconciliation, transforms, visibility/lock/opacity, undo/redo, duplicate/delete/reorder, format change, source/rendered updates, generic tool version, source assets, namespaced mode-tag replacement, publish rollback |
| `src/storage/projectRepository.test.ts` | 6 | save/reload, latest project, revision CAS conflicts, unsupported schema, interrupted/stale writes |
| `src/storage/assetRepository.test.ts` | 6 | binary persistence/integrity, content dedupe, source revisions, missing refs, corruption, object-URL ref counting |
| `src/adapters/image/imageSourceState.test.ts` | 4 | stored/transient Image schema, photo separation, masks/history/view, unsupported versions, data-URL decoding |
| `src/adapters/typography/typographySourceState.test.ts` | 4 | Library font/field schema, Custom strokes/image/controls, mode rejection, source tags |
| `src/adapters/image/rasterValidation.test.ts` | 4 | PNG IHDR dimensions/alpha, PNG/JPEG/WebP signatures, SVG rejection, exact-dimension enforcement |
| `src/adapters/vector/vectorSourceState.test.ts` | 4 | Vector source parsing, baked state, version/tool rejection, malformed state |
| `src/adapters/vector/svgSanitizer.test.ts` | 3 | valid SVG preservation, executable/external removal, malformed/missing viewBox rejection |
| `src/sourceIntegrity.test.ts` | 3 | Vector, Image and both Typography script/page SHA-256 guards |
| `src/App.test.tsx` | 4 | topbar/save/format, live Image/Vector/Type entries, layers visibility/lock/rename, inspector metadata/transforms |
| **Total** | **47** | |

## Browser acceptance

| # | Test | Evidence / scope |
| --- | --- | --- |
| 1 | Shell hydration, empty persisted canvas, live Image/Vector/Type entries, no host overflow | `smoke` |
| 2 | Preserved standalone Vector still loads | `smoke` |
| 3 | Vector Phase 1 round-trip: publish, transform, reload, reopen, revise same layer | `01-vector-editor.png` … `04-reopened-source.png` (Phase 1) |
| 4 | Vector manually baked geometry restored as editable lines | `05-baked-vector-editor.png`, `06-baked-source-reopened.png` |
| 5 | Vector layer reorder/hide/cancel/undo/republish/reload | `07-layer-management.png` |
| 6 | Vector storage failure preserves durable project | `08-storage-failure.png` |
| 7 | Unsupported Vector source version and missing render blob | `09-unsupported-state.png` |
| 8 | Transport fake-adapter conformance: handshake, context, assets, restore, render, serialize, events, close | `transport.spec.ts` |
| 9 | Transport security: origin, scope, protocol, forged sender | `transport.spec.ts` |
| 10 | Transport timeout, stale/late response, cancellation, cleanup | `transport.spec.ts` |
| 11 | Host canvas rename/duplicate/delete/direct move/resize/reload | `10-host-canvas-interactions.png` |
| 12 | **Journey A — Image round-trip:** upload, Dots + Glitch + Duotone, crop zoom/pan, painted mask, internal layer opacity/order, effect reorder, publish, host move/rotation, reload, reopen, native undo/redo, republish same layer, cancel, host undo/redo, 1080×1350 render | `01-image-integrated.png`, `02-image-published.png`, `03-image-source-restored.png` |
| 13 | Image smoke: upload, publish, raster layer canvas display, reopen settings/photo | `image-smoke.spec.ts` |
| 14 | **Journey B — Image → Vector:** publish Image, Continue in Vector, native raster trace (contours), publish new Vector layer, provenance, reorder, reload, reopen Image and Vector sources | `04-image-to-vector-trace.png` |
| 15 | **Journey C — Type Library:** font catalogue ready, Goozette, text, size/tracking/weight, distortion brush, publish, reload, reopen same font/field, exact canvas data URL, revise/republish | `07-type-library-distortion.png` |
| 16 | Type Library reset distortion clears the internal field | `type-smoke.spec.ts` |
| 17 | **Journey D — Custom Type:** native motif upload, drawing, drawing/image layer order, remove image, text, pattern/letterform controls, publish, reload, restore strokes/controls, exact canvas, revise/republish | `08-custom-type.png` |
| 18 | Type mode switching keeps both unsaved drafts and publishes the active custom draft | `type-mode-switch.spec.ts` |
| 19 | **Journey E — Image → Custom Type:** publish Image, Use as Type Pattern, motif arrives, modify lettering/controls, publish separate Type layer, provenance, reorder, reload, restore both source states | `05-image-to-type-motif.png`, `06-mixed-composition.png` |
| 20 | Mixed raster/vector composition: opaque Image behind, Vector middle, transparent Type raster in front, alpha scan, selection/drag/opacity/rotation, reload | `mixed-layers.spec.ts` |
| 21 | Narrow layouts: Image at 1024×768 and Type at 900×700 remain usable with no host overflow | `09-image-narrow-layout.png` |
| 22 | Image native flattened PNG at 1080×1920 | `native-exports.spec.ts` |
| 23 | Image native layered ZIP: manifest, flattened PNG, source.json, 3 layer PNGs, paint-mask | `native-exports.spec.ts` |
| 24 | Image native animated GIF: 360×360 GIF89a, 10 fps, 1 s loop | `native-exports.spec.ts` |
| 25 | Vector native SVG and PNG (2000×2828) | `native-exports.spec.ts` |
| 26 | Type Library native PNG | `native-exports.spec.ts` |
| 27 | Custom Type native PNG and OTF (parsed: OTTO, unitsPerEm 1000, >90 glyphs, space glyph) | `native-exports.spec.ts` |
| 28 | Missing Image source photo blocks restore without deleting layer | `phase2-reliability.spec.ts` |
| 29 | Unsupported Image source version rejected before iframe open | `phase2-reliability.spec.ts` |
| 30 | Failed full-resolution render leaves no new layer | `phase2-reliability.spec.ts` |
| 31 | Failed project write rolls back an Image update to the previous durable source | `phase2-reliability.spec.ts` |
| 32 | Failed source-asset write leaves previous Image revision intact | `phase2-reliability.spec.ts` |
| 33 | Type Library font-load failure reported; layer remains | `phase2-reliability.spec.ts` |
| 34 | End-to-end evidence run across Image, Image→Vector, Image→Type, Type Library, Custom Type, mixed composition and narrow layout | `phase-2/*.png` |

## Journey mapping

| Required journey | Automated coverage |
| --- | --- |
| A — Image round-trip | Test 12 |
| B — Image to Vector | Test 14 |
| C — Type Library | Test 15 |
| D — Custom Type | Test 17 |
| E — Image to Type | Test 19 |
| F — Reliability | Tests 28–33 + Phase 1 transport tests 8–10 |

## Source preservation checks

- `tools/legacy/vector/arnav.html` — `24633B7233A5E7AD088D1E4423AACD21D838F215654F838170077328C1CB5AA2`
- `tools/legacy/image/janya.html` — `ACDD62C499A4FCD3C372918BC6AD96F3E0A6DFA6D583A1BAB74B4AFBF9EC9BF6`
- `tools/typography/fonts.js` — `82D9409347F795CAC9C124FF2D329A74F19B9408D6F121A46F4E21586195456C`
- `tools/typography/script.js` — `715DCEE5B88EACCE025120B7AD43F91DE698065E3FA1F648824853703BD08161`
- `tools/typography/fonts.html` — `C2CF92B1AF381B8EBD3446F15E65CFE996112FD8F3A00E9628FE75627500109B`
- `tools/typography/custom.html` — `457120E04C874158341D4D2314B740A0E4DFB7D363B6DFE49337C727662799ED`
- `git diff phase-1/shared-foundation -- tools` is empty.
- Standalone Vector browser test still passes; standalone Image/Typography pages are untouched and remain served by the static scripts.

## Native export regression evidence

| Tool | Export | Validation |
| --- | --- | --- |
| Image | flattened PNG | 1080×1920 PNG for a 9:16 project; PNG signature/IHDR |
| Image | layered ZIP | `manifest.json` (`originatingTool=image`, 1080×1920, 3 layers), `flattened.png`, `source.json` v1 with Dots settings, 3 layer PNGs, `paint-mask.png` |
| Image | animated GIF | GIF89a, 360×360, produced by the preserved median-cut/LZW encoder |
| Vector | SVG | `<svg>` payload from preserved Export SVG |
| Vector | PNG | 2000×2828 from preserved 2× export |
| Type Library | PNG | native PNG, non-empty dimensions |
| Custom Type | PNG | native 3× export |
| Custom Type | OTF | `OTTO`; parsed with opentype.js: 1000 units/em, >90 glyphs, space glyph |

## Failure and transaction observations

- Publishing validates both source and rendered assets, then reads both back
  before the layer references them.
- Full-resolution PNG must exactly match the active artboard dimensions. A
  mismatched render fails rather than being stretched.
- Project-save failure triggers an in-memory rollback of the attempted commit;
  the prior durable source/render revision stays referenced.
- Asset-write failure aborts before the host commit.
- Cancel paths never write a new revision.
- Republishing updates the same layer ID; no duplicate layer is created.
- Host undo/redo across raster republish keeps both binary references readable.
- Missing source photo, missing rendered blob, unsupported versions and font-load
  failures produce visible errors without deleting the layer.
- Listener/timer/object-URL cleanup is covered by the shared transport tests and
  the raster object-URL registry; no browser console errors occur in passing
  workflows.

## Screenshots (inspected)

All in [`evidence/phase-2/`](evidence/phase-2/):

1. `01-image-integrated.png` — preserved Image editor inside Studio, Dots effect,
   painted mask, full-resolution session context.
2. `02-image-published.png` — published Image raster layer in the host canvas
   with layer/inspector chrome.
3. `03-image-source-restored.png` — reopened Image source with settings/mask
   restored.
4. `04-image-to-vector-trace.png` — Image → Vector session with explicit tracing
   note and imported editable contour lines.
5. `05-image-to-type-motif.png` — Custom Type using the published Image as a
   motif.
6. `06-mixed-composition.png` — Image + Vector + Type as three independent,
   reorderable layers.
7. `07-type-library-distortion.png` — Type Library with Goozette font, credits
   and restored distortion field.
8. `08-custom-type.png` — Custom Type draw stage with native motif controls.
9. `09-image-narrow-layout.png` — 1024×768 integrated Image session without host
   overflow.

## Deferred / not exercised

These remain **not verified by Phase 2 acceptance** and are not marked tested in
the feature matrix:

- Image drag/drop and clipboard paste import (file-picker import is automated).
- Every Image preset/look, every pattern/trace/blur variant, smudge brush
  gestures, safe-zone UI, saved user looks, prompt/Claude generation, and all
  per-effect visibility/removal combinations.
- Every Type Library font, every browser/device fallback, custom font import
  (not an original feature), and leading/alignment (not original).
- Custom Type every face-blend combination, script face in isolation, native
  stroke undo/clear browser acceptance (controls remain present), and native
  motif upload of every image format.
- Final multi-layer artboard/composition export (not implemented in Phase 2).
- Cross-browser (Firefox/WebKit), touch/mobile, and axe accessibility audit.
- Asset garbage collection and concurrent-tab merge UI.
- Long-duration IndexedDB/source-size stress for very large distortion fields.
