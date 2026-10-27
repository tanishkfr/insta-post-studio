# Studio 2.0 — Phase 3 Test Report

**Date:** 2026-10-27  
**Branch:** `phase-3/shapes-generate`  
**Base:** `phase-2/tool-expansion` @ `0fe4e7498abcdef2aa6aba19ffb799b0851dc5a9`

## 1. Baseline before implementation

Run on the verified Phase 2 base before any Phase 3 change:

| Command | Result |
| --- | --- |
| `npm run verify` | **PASS** — contracts typecheck, production build, **47 unit/component tests** |
| `npm run test:browser` | **PASS** — **34 Chromium tests**, 2 workers |
| `npm --prefix tools/shapes run build` | **PASS** |
| `npm --prefix tools/shapes test` | **PASS** — **18 tests** |

## 2. Final commands and results

| Command | Result |
| --- | --- |
| `npm run verify` | **PASS** — contracts typecheck, production build (host + independently bundled Shapes), **56 unit/component tests** |
| `npm run test:browser` | **PASS** — **48 Chromium acceptance tests** |
| `npm --prefix tools/shapes run build` | **PASS** |
| `npm --prefix tools/shapes test` | **PASS** — **23 tests** |
| Retained Image/Vector/Type native exports | **PASS** — PNG, layered ZIP, GIF, SVG, PNG, OTF |
| Preserved standalone Vector/Generate/Shapes loads | **PASS** (Chromium, no boot hash) |

Environment: Windows, Node 22, Chromium via Playwright, viewport 1440×900 plus
900×700 compact sessions. Every browser test uses `studio-test.ts`'s strict
console/page-error guard; no broad allowances were added. The existing intentional
font-404 allowance remains only in the Phase 2 font-failure test.

## 3. Shapes tests

### Preserved Shapes suite (23)

| File | Coverage |
| --- | --- |
| `mesh.test.ts` | extrude/inset/loop-cut helpers |
| `triangles.test.ts` | triangle fit/clone |
| `reduce.test.ts` | add/transform/array/deform/duplicate/undo/redo reducer behavior |
| `sourceState.test.ts` (4) | full 1.0.0 round-trip; camera/material/history; native undo/redo after restore; malformed version/NaN/duplicate/nextSerial rejection; no transient pointer/draft |
| `loadFbx.test.ts` (1) | known ASCII FBX cube fixture parses into fitted triangles with valid indices |

### Phase 3 browser acceptance

| Test | Evidence |
| --- | --- |
| `shapes-smoke.spec.ts` | Cube + Sphere, numeric transform, material color, array, native undo/redo, publish; exact 1080×1350 RGBA PNG; alpha/corners/no selection-blue; source JSON objects/camera/history/nextSerial; reload/reopen; native undo/redo after restore; republish same layer ID/transform/source revision |
| `shapes-geometry.spec.ts` | custom mesh; loop cut + extrude + inset; duplicate; twist deformation; array count 4; serialized face/deform/array/history state |
| `shapes-fbx.spec.ts` | known ASCII FBX fixture through the real file input; kind `fbx`, triangle positions/indices, no quad mesh |
| `phase3-reliability.spec.ts` (Shapes) | unsupported source version rejected before iframe, layer preserved; empty-scene render failure leaves previous layer/source revision unchanged |

## 4. Generate tests

| Test | Evidence |
| --- | --- |
| `generate-smoke.spec.ts` (2) | real Image + Vector layers in asset bin; 4:5 preview; alternatives do not mutate host; Apply changes real transforms; source hashes unchanged; Undo layout restores; background publish; bottom layer; PNG 1080×1350; source schema/selected/background; reload/reopen; restored variations equal saved variations; selected variation restored; reorder; 1:1 and 9:16 slide ratios and frame heights |
| `generate-controls.spec.ts` | 12 original controls; Layout→Grid changes alternatives; Static presets; Claude fallback; carousel 2 slides × 3 variants; native +Text; Regenerate changes seed/variations deterministically |
| `generate-reliability.spec.ts` | hidden layer excluded; locked layer never moved; locked-only Apply reports no changes; background publish; delete a source layer; reopen shows missing-layer warning; no silent remap/recreation; Regenerate from current layers clears warning; Apply still moves the remaining real layer |
| `phase3-reliability.spec.ts` (Generate) | unsupported Generate source version fails safely before the iframe and leaves the composition intact |
| `pipeline-phase3.spec.ts` | Image + Vector + Type + Shapes compose; Shapes→Image derivative provenance and unchanged Shapes hash; Generate sees all real layers; Apply leaves five source hashes unchanged; background layer; save/reload restores six layers/source categories; reopen Image, Vector, Type, Shapes and Generate; Shapes cancel preserves source revision |
| `smoke.spec.ts` | standalone legacy Generate loads/regenerates; standalone Shapes bundle loads without Studio boot; Studio rail exposes five live tools and BEND preserved |

## 5. Retained regression coverage

The complete Phase 2 browser suite was rerun unchanged and passed:

- Image source round-trip/mask/history/republish, native PNG/ZIP/GIF;
- Image→Vector tracing and Image→Custom Type motif;
- Type Library/Custom Type round-trip, mode switch, native PNG/OTF;
- Vector baked/round-trip/export/failure paths;
- mixed opaque Image + Vector + transparent Type composition;
- host layer drag/resize/order/hide/lock/duplicate/delete/undo/persistence;
- transport origin/scope/protocol/timeout/cancellation conformance;
- six Image/Type reliability cases (missing photo, unsupported version, render
  failure, project write failure, source write failure, font failure).

The Shapes bundle is built before `npm run build` / `npm run test:browser`; CI installs
`tools/shapes` dependencies separately. The standalone `tools/legacy/generate/
generator.html` source is byte-identical; no new source-integrity hash was required
for it because it is unmodified.

## 6. Screenshots (actual Chromium workflows)

Generated by `phase3-evidence.spec.ts`, visually inspected:

| File | Workflow |
| --- | --- |
| `docs/evidence/phase-3/01-shapes-editor.png` | complete Shapes editor with Cube + Sphere, inspector/camera |
| `02-shapes-published.png` | transparent Shapes layer over a real Image layer |
| `03-shapes-source-restored.png` | 3D source reopened from the saved document |
| `04-shapes-to-image.png` | Continue in Image with the Shapes render as input |
| `05-mixed-composition.png` | Image + Vector + Type + Shapes in one artboard |
| `06-generate-host-layers.png` | Generate with real Studio asset bin and alternatives |
| `07-generate-applied.png` | Apply layout/undo notice on the session |
| `08-generate-background.png` | generated background as its own bottom layer |
| `09-shapes-compact.png` | Shapes inspector/camera at 900×700 |
| `10-generate-compact.png` | Generate gallery/controls at 900×700 |

## 7. Untested or environment-limited

- Forced WebGL context loss during a Shapes render (code path implemented, not
  induced automatically).
- Exhaustive Shapes pointer gizmo/camera gestures, stroke drawing, remix, all
  shade/lighting combinations and all keyboard paths.
- Every Generate background × accent × texture × colour combination; the default
  atmospheric/film-grain path and real host-layer alternatives are tested.
- Generate motion backgrounds as video (captured as a still by design).
- Claude sampling/Export spec (Claude-host environment only; fallback tested).
- Carousel/full composition export (deferred).
- Firefox, WebKit, mobile touch, and axe accessibility audit (not run).
- BEND (preserved for Phase 4).

## 8. CI

The Phase 3 code/tests head `ceb746674b37e654e22e3544cf998e496d05b1f1` passed the
`Studio CI` workflow: [run 40384892175](https://github.com/tanishkfr/insta-post-studio/actions/runs/40384892175) —
**success**. The workflow installed host and Shapes dependencies, built the host
and independently bundled Shapes app, ran 56 unit/component tests and 48 Chromium
acceptance tests. Subsequent commits are documentation-only; the exact final branch
SHA and its CI result are reported in the delivery response.
