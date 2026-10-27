# Studio 2.0 — Phase 2 Report

**Date:** 2026-10-26  
**Scope:** reusable tool session, complete Image integration, host raster support, Image → Vector, Type Library, Custom Type, Image → Type, and cross-tool persistence.

## A. Verdict

**PASS** for the Phase 2 scope.

The integrated loop works end to end:

- create/reopen Image artwork with its original photo, effects, mask, crop,
  internal layer state and native history;
- publish at the host artboard's exact full resolution;
- continue an Image layer in Vector as a traced derivative;
- use an Image layer as a Custom Type motif;
- create Type Library or Custom Type artwork with editable source recovery;
- publish Image, Vector and Type as separate, reorderable layers;
- save/reload and reopen each originating editor without losing its native state;
- cancel, failed writes, missing assets, unsupported versions and failed font
  loads leave prior durable work intact;
- native PNG/ZIP/GIF/SVG/OTF exports still work.

This is **not** a claim that every original control was exhaustively executed.
Deferred checks and genuine gaps are listed in section K and in the feature
matrix.

## B. Git branch, final SHA and CI

| Item | Value |
| --- | --- |
| Repository | `https://github.com/tanishkfr/insta-post-studio` (private) |
| Base | `phase-1/shared-foundation` @ `fdf3cfb293f407f5f31fd3840bc5072de0e20172` |
| Branch | `phase-2/tool-expansion` |
| Phase 2 code commit | `6f004e1ef6e71261472736b8191a9018b3cfe3f0` |
| CI | [run 40366524254](https://github.com/tanishkfr/insta-post-studio/actions/runs/40366524254) — **success** (contracts/build/47 unit tests + 34 Chromium browser tests) |
| Documentation head | A subsequent docs-only commit on the same branch; exact final SHA is in the delivery response. |

No merge into the Phase 0/default branch, no public deployment, no changes to
teammates' repositories, no BEND production/Vercel changes.

## C. Session orchestration changes

The Vector-only React session was extracted into
`apps/studio/src/adapters/session/toolSession.tsx`:

- tool identity, bridge path, iframe title and expected capability tool ID;
- exact-origin READY handshake via the existing `IframeToolAdapter`;
- global context delivery and active-artboard display;
- source resolution/validation before the iframe opens;
- input asset resolution and delivery before restore;
- source restore after binary inputs decode;
- dirty/progress/issue events, loading and error/retry/back UI;
- new layer vs existing layer labels and close/cancel/publish behavior;
- transactional publish with rollback when the project write fails;
- listener, timer and adapter disposal on close/unmount/retry.

Tool-specific source parsing, input resolution, capture and priming stay in each
adapter (`VectorEditor`, `ImageEditor`, `TypeEditor`). Vector's existing bridge
was preserved; only its media-input branch was extended.

Contract extensions:

- `SharedLayer.provenance` (optional) records a derivative's source layer/asset.
- `LayerArtworkUpdate` accepts `sourceAssets` and replacement namespaced tags.
- `rollbackLastCommit()` rolls back an in-memory publish commit when durable
  save fails.

The Phase 1 Vector suite was rerun immediately after this refactor and passed
before Image/Type work continued.

## D. Image integration and native functionality

- Original `tools/legacy/image/janya.html` is byte-identical.
- Derived `/tools/image/adapter.html` injects the bridge into the same classic
  script that owns `S`, `img`, `hist`, `mk`, `PH`, `render()` and native export
  functions.
- The bridge exposes the full native editor: upload/drop/paste path preserved,
  colour, patterns, trace, blur, masking/fades, internal layer stack, presets,
  prompt/local look generation, undo/redo, motion preview, GIF, PNG and layered
  ZIP.
- Source schema `1.0.0` stores full `S`, internal layer metadata, effect order,
  brush strokes, painted mask, crop/frame, native history/index and view state.
- The source photo is emitted transiently and stored as a separate
  `source-image` asset; durable source state contains only `photo.assetId`.
- Restore waits for photo decode, then restores settings/mask/history without
  calling the file-import path that would reset effects.
- Publishing uses the original full-resolution renderer mapped to the host
  artboard: 1080×1350, 1080×1080 or 1080×1920. It verifies exact dimensions and
  never captures the 600×750 preview. Unsupported aspects fail explicitly.
- Image layers render as separate transparent/opaque raster host layers with
  intrinsic aspect, alpha compositing, transform/rotation/opacity/blend and
  clipping.
- Cancel and failed renders/writes leave the previous layer untouched.
- Republish updates the same layer ID and preserves host transform/order.

Verified native feature evidence includes file upload, Dots/Cross-stitch,
Contours, Glitch, Duotone + brightness, painted mask, crop zoom/pan, internal
layer opacity/order, effect-stack reorder, native undo/redo after restore, PNG,
layered ZIP and animated GIF. Other controls remain preserved but not all were
executed (matrix).

## E. Type Library integration

- Original `fonts.html` / `fonts.js` are byte-identical.
- Derived page/script inject the bridge **inside** the original
  `DOMContentLoaded` closure, giving access to the real `S`, font catalogue,
  `field`, `draw()` and export functions.
- Source state `1.0.0` stores text, exact font identity, size/tracking/weight/ink,
  distortion strength/brush and the renderer's sparse `Float32` distortion field.
- Restore waits for the selected `FontFace`/`document.fonts.ready`, then applies
  controls and the full-precision field. Browser acceptance compares the preview
  canvas data URL before publish and after reload byte-for-byte.
- The original reset-distortion action clears the field.
- Shared publish prefers the exact transparent preview canvas; no background is
  added by Studio. Native PNG export remains unchanged.
- Font loading feedback, catalogue grouping, credits/licensing text and the
  original font list remain visible.
- Font-load failure is surfaced cleanly and the layer survives.

## F. Custom Type integration

- Original `custom.html` / `script.js` are byte-identical.
- Derived page/script inject the bridge inside the original closure.
- Source state stores editable motif strokes, uploaded/host motif image bytes,
  image placement/scale, drawing/image stacking, text, ink and every letterform/
  pattern/type control plus Draw/Type stage.
- Native upload/remove, image size, Drawing/Image order, draw/type tabs, PNG and
  OTF exports remain available and were exercised.
- Shared publish uses the original `renderComposition(3, null)` path and returns
  a transparent PNG with authored margins.
- Reopen restores strokes, image motif and controls and returns to the correct
  stage and mode.
- Native OTF export was parsed: `OTTO`, 1000 units/em, >90 glyphs, space glyph.
- Both modes can switch inside one session; each draft is serialized before the
  switch and restored when switching back. The active mode is published and
  tagged so reopening returns to that mode.

## G. Cross-tool pipeline results

### Image → Vector

Select an Image layer → **Continue in Vector** → host reads the rendered PNG →
scoped `assets/input` → preserved `impFile()`/`impImg()` trace into editable
contour lines → publish a new Vector layer with provenance. The original Image
layer and its source hash remain unchanged. The UI explicitly says this is a
conversion/tracing step, not a live linked image.

### Image → Type

Select an Image layer → **Use as Type Pattern** → Custom Type opens with the
rendered image as motif → edit lettering/pattern → publish a new Typography layer
with provenance. The original Image layer remains unchanged. Native direct motif
upload is still available and does not require a prior Image layer.

Both derivative layers are separate, reorderable host layers.

## H. Source-state fidelity and persistence

- Image: all `S`, masks, brush strokes, effect order, internal layers, crop,
  source-photo reference and history survive reload; painted-mask pixel count and
  full settings matched before/after.
- Type Library: font identity, controls and exact distortion field survive; the
  pre-publish and post-reload canvas data URLs matched.
- Custom Type: stroke arrays, motif image, placement, controls and stage survive;
  the canvas data URL matched.
- Source assets are content-addressed and immutable per revision. Old revisions
  remain readable for host undo/redos.
- Source-state versions other than `1.0.0` are rejected before the iframe opens.
- Project schema remains version 1; the only layer-contract addition is optional
  provenance.

## I. Native export regression tests

| Tool | Export | Result |
| --- | --- | --- |
| Image | flattened PNG | 1080×1920 for 9:16 project |
| Image | layered ZIP | manifest + flattened + source + 3 layer PNGs + paint-mask |
| Image | animated GIF | GIF89a 360×360 via preserved encoder |
| Vector | SVG + PNG | SVG payload; 2000×2828 PNG |
| Type Library | PNG | native export |
| Custom Type | PNG + OTF | PNG; OTF parsed (1000 upm, >90 glyphs) |

Specialized export controls remain inside each preserved editor; the shared
Studio publish button does not remove them.

## J. Browser acceptance, screenshots and metrics

- `npm run verify`: PASS — contracts typecheck, production build, **47 unit/
  component tests** across 10 files.
- `npm run test:browser`: PASS — **34 Chromium acceptance tests**, 2 workers,
  1440×900 plus 1024×768 and 900×700 layout checks.
- Journeys A–E are covered by dedicated browser tests; Journey F reliability is
  covered by six Image/Type failure tests plus the Phase 1 transport suite.
- Native exports are covered by five browser tests in `native-exports.spec.ts`.
- Mixed raster/vector composition, alpha, ordering, drag and opacity are covered.
- All browser tests fail on unexpected console/page errors. The intentional
  font-failure test allows only its expected 404 font errors.
- Screenshots in `docs/evidence/phase-2/` were generated from real integrated
  sessions and visually inspected:
  `01-image-integrated.png`, `02-image-published.png`,
  `03-image-source-restored.png`, `04-image-to-vector-trace.png`,
  `05-image-to-type-motif.png`, `06-mixed-composition.png`,
  `07-type-library-distortion.png`, `08-custom-type.png`,
  `09-image-narrow-layout.png`.

Details: [PHASE_2_TEST_REPORT.md](PHASE_2_TEST_REPORT.md).

## K. Feature-parity gaps and limitations

1. Not every original control was executed. The matrix marks what was actually
   tested; look presets, saved looks, prompt/Claude generation, most pattern/
   trace/blur variants, smudge gestures, drag/drop and clipboard paste import,
   and many effect visibility/removal combinations remain source-only.
2. Image supports the three Studio artboard aspects (4:5, 1:1, 9:16). Other
   aspects fail instead of being stretched/cropped.
3. Image native undo covers `S`, not the separate painted mask/photo — original
   editor semantics.
4. The Image source photo is single; replacing it inside the editor replaces the
   layer input.
5. Custom Type native stroke undo/clear and some face-blend combinations remain
   preserved but are not all browser-tested.
6. Type modes keep independent drafts in a session, but only the published mode
   is durable for that layer. Publishing a different mode replaces the layer's
   source mode (same layer ID) rather than storing two modes in one layer.
7. Google Fonts are still network-dependent for Custom Type blending/UI; bundled
   Type Library fonts are local.
8. OTF export remains ASCII/line-segment with no kerning/curves; image motifs
   become 1-bit dark runs.
9. No final multi-layer composition export.
10. No asset garbage collection; source/render history grows.
11. Host undo history remains session-only; durable project/assets survive
    reload.
12. Chromium-only acceptance; no Firefox/WebKit/touch/axe audit.
13. Image Type source fields can be large when distortion/photo/mask data is
    extensive; there is no compaction beyond sparse field encoding and asset
    dedupe.
14. Same-origin iframe deployment remains; transport is exact-origin ready.
15. Legacy Image/Typography drag/drop, clipboard and some specialized controls
    remain source-only in the matrix.

## L. Exact Phase 3 starting point

Branch `phase-2/tool-expansion` (do not merge into the Phase 0 default branch).

1. Use the shared `ToolSession` for the next adapter. Do not build another
   session controller.
2. Add Shapes behind its own iframe bridge: serializable scene/document state, a
   controlled transparent render path, and source re-entry without changing the
   React 18/R3F runtime.
3. Add Generate with a host capture contract; it currently has no visual export.
4. Add BEND through its existing integration contract/package, keeping the
   timeline engine inside BEND and using full-quality export explicitly.
5. Add a reference-aware asset GC only after the retained-project/history scan
   is defined.
6. Design final multi-artboard/composition export; do not flatten source layers.
7. Resolve upstream licences and font redistribution before public deployment.
