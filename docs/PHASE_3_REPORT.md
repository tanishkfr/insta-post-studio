# Studio 2.0 — Phase 3 Report

**Date:** 2026-10-27  
**Scope:** complete Shapes integration (isolated React 18 runtime, versioned 3D source, transparent render, publish/re-entry, Shapes→Image/Generate) and complete Generate integration (real host layers, preserved rule engine, aspect-aware layouts, reversible Apply, generated-background publishing and source re-entry).

## A. Verdict

**PASS for the Phase 3 scope**, with the explicit limitations in section K.

The integrated loop works end to end:

- create/edit a real 3D scene in the complete preserved Shapes editor;
- publish a transparent RGBA PNG at the exact host artboard size;
- reopen the saved 3D document (not the flattened PNG), restore camera/materials/
  transforms/history and use native undo/redo;
- compose Shapes with Image, Vector and Type as independent reorderable layers;
- continue a Shapes render in Image as a derivative while the 3D source stays intact;
- open Generate with those real layers, explore alternatives and apply a chosen
  arrangement as one undoable host action without changing any native source;
- publish the selected generated background/accents/texture as an independent
  layer, reorder it, reload and reopen its editable Generate source;
- switch 4:5, 1:1 and 9:16 and get aspect-aware layouts rather than reused 4:5
  vertical coordinates.

This is **not** a claim that every original Shapes control or every Generate
control combination was exhaustively executed. Shapes pointer gizmos, stroke
drawing/remix, some shader/material combinations, all Generate background/accents/
texture combinations and motion frames remain source-preserved but are not all
browser-tested. Deferred cases are named in section K and the matrix.

## B. Git branch, final commit, CI

| Item | Value |
| --- | --- |
| Repository | `https://github.com/tanishkfr/insta-post-studio` (private) |
| Base branch | `phase-2/tool-expansion` @ `0fe4e7498abcdef2aa6aba19ffb799b0851dc5a9` |
| Base CI | run `40367370457` — success |
| Branch | `phase-3/shapes-generate` |
| Shapes runtime commit | `bdb5aa8` — versioned 3D source + transparent render |
| Studio integration commit | `7409d20` — Shapes/Generate host integration |
| Tests + docs commit | `ceb7466` — Phase 3 acceptance, evidence, reports |
| CI for tested code/tests head | [run 40384892175](https://github.com/tanishkfr/insta-post-studio/actions/runs/40384892175) — **success** (contracts/build/56 unit + 48 Chromium browser tests) |
| Verified remote head | The docs-only commits after `ceb7466` update reports only; the exact final branch SHA and its successful CI run are recorded in the delivery response. |

No merge into the Phase 2/default branch, no public Studio deployment, no changes to
upstream repositories, and no BEND repository/Vercel changes.

## C. Shapes runtime and feature preservation

- `tools/shapes/` remains its own React 18.3/R3F 8/Three 0.170 dependency tree and
  is built independently with Vite.
- The production/development host serves it from `/tools/shapes/index.html`; the
  Studio build copies the complete hashed bundle into `dist/tools/shapes/`.
- The host never mounts Shapes under React 19. The scoped `ToolAdapterV1` bridge
  runs inside the Shapes frame and exposes only protocol operations.
- The complete original interface is still present: primitives, custom mesh/FBX,
  numeric transforms, gizmo controls, face tools (loop cut/extrude/inset),
  deformation, arrays, mirror/duplicate, stroke controls, colors/materials,
  Toon/Ink/Flat shading, lighting presets, camera navigation, undo/redo, outliner,
  inspector tabs and keyboard shortcuts.
- Browser evidence exercised Cube/Sphere/Torus, custom mesh, loop cut/extrude/inset,
  twist deformation, array/duplicate, color/material, camera serialization, FBX
  import, transparent publish, restore and republish.
- Pointer gizmo drags, freehand stroke drawing, remix and every lighting/material
  combination are preserved but remain source-tested/not exhaustively executed.

## D. Shapes source-state fidelity

Shapes source schema `1.0.0`
(`application/vnd.studio.shapes+json`) stores:

- complete `ShapeDocument` and stable object IDs;
- primitives, custom quad meshes and imported triangle meshes;
- transforms, colors, deformations, arrays, strokes and remix seeds;
- shading, ink color, wireframe, gizmo, lighting and selection/tool preferences;
- camera theta/phi/radius/target;
- bounded native undo/redo history;
- next object serial.

Transient pointer locks, in-progress drag drafts and unfinished stroke drafts are
never serialized. Validation runs on the host before the iframe opens and again in
Shapes before assignment. It checks schema identity, finite numbers, unique IDs,
next-serial coverage, positive scales, geometry limits/indices, colors, camera
ranges and history bounds. A malformed/unsupported payload fails without replacing
the current scene or the saved layer.

Browser tests confirm objects, arrays/deformations, selection, camera, source
revision and native undo/redo survive reload/re-entry. Republish keeps the layer
ID and host transform.

## E. Transparent 3D render validation

- Offscreen `WebGLRenderer` + RGBA render target (not the interactive canvas).
- 2× supersampling within a pixel budget, readback, vertical flip, alpha
  un-premultiplication, exact-size downsample, PNG encode.
- Excludes editor background, grid, gizmos, selection boxes/highlights and draft
  stroke guides.
- Preserves actual object geometry, deformations, arrays, materials/ink outlines,
  lighting and the saved camera framing.
- Output viewport aspect matches the host artboard; 3D framing is not stretched.

Chromium acceptance checks:

- PNG IHDR is exactly 1080×1350 for 4:5 and 1080×1080 / 1080×1920 for the other
  tested formats;
- true RGBA with transparent corner pixels and >1,000 visible pixels;
- no selection-blue pixels;
- published layer shows the real scene over an Image layer;
- empty-scene render fails honestly and does not change the prior layer/source
  revision.

Forced WebGL context loss is handled in the renderer (checks + honest error) but is
not automatically induced in the suite; this remains an explicitly untested path.

## F. Generate integration and original controls

- The original `generator.html` is byte-identical.
- A derived page injects the scoped bridge and only four narrow rendering
  adaptations (aspect var, frame-height top mapping, authored aspect ratio,
  host-kind mapping) plus an upstream texture markup fix.
- The original rule engine, `FIXED` static presets, `ruleVars`, 12 creative
  controls, seed/regenerate, Auto/Grid/Centered/Dynamic/Layered layouts, carousel
  controls, asset bin, +Text/+Image, Claude mode and Export spec remain present.
- Claude mode still fails/falls back honestly in a normal browser; no paid AI
  backend was invented. Static/rule-based modes work locally.
- Generate receives real active-artboard Image/Vector/Type/Shapes layers with stable
  host IDs and downscaled rendered thumbnails. Hidden layers are excluded; locked
  layers are previewed and skipped by Apply.
- Native sample assets remain when there are no eligible host layers; +Text/+Image
  still work.

Browser tests exercised: 12 controls, layout change, static presets, Claude
fallback, carousel 2-slide generation, +Text, seed/regeneration, real host asset
bin, hidden/locked policy and missing-layer recovery.

## G. Format-aware layout application

- The preserved 100×125 design space is mapped to `frameHeight = 100 / aspect`.
- 4:5 = 125 (identity); 1:1 = 100; 9:16 = 177.78.
- Non-4:5 placements are remapped into the real frame and re-run through the same
  separation/boundary constants.
- Each layer keeps its authored height/width ratio (`aspectHOverW`); thumbnails and
  host transforms are never stretched.
- Apply layout validates the current artboard aspect, maps the selected variant's
  first slide to stable host-layer IDs and updates only x/y/width/height/rotation on
  unlocked visible layers.
- It is one project-store commit/undo step. A failed save rolls it back. The session
  exposes **Undo layout** immediately; normal host undo also restores the prior
  composition after returning to the canvas.
- Image effect source, Vector geometry, Type font/motif settings, Shapes geometry
  and asset bytes are unchanged; source-state hashes are compared before/after in
  the browser test.
- Layer stacking is intentionally preserved; generated z values are stored but not
  auto-applied in this phase.

## H. Generated backgrounds and source restoration

- **Publish background layer** renders the selected variant's background, accents
  and texture to an exact-size PNG using a deterministic Canvas2D rasterizer.
- It creates an independent `generated-layout` layer at the bottom by default; the
  user can reorder/hide/move/duplicate it and reopen it.
- The versioned Generate source stores mode, seed, controls, variations, selected
  alternative, host mapping, placements, artboard dimensions, missing layers and
  decorative settings.
- Reopening restores the selected variation and controls without applying anything
  to the host. Stale/missing layers show a warning and a **Regenerate from current
  layers** action; IDs are never silently remapped.
- The background is honestly a raster treatment with editable Generate settings,
  not a reconstruction of individual CSS decorative objects.
- Motion backgrounds capture a representative still; carousel/full composition
  export remains deferred.

## I. Cross-tool journeys

Browser-tested end to end:

1. **Image → Shapes → Composition**: an Image layer remains under a new transparent
   Shapes layer; both are independently reorderable.
2. **Shapes → Image**: Continue in Image publishes a new derivative Image layer with
   provenance; the Shapes scene/source remains editable and unchanged.
3. **Multiple tools → Generate**: Image, Vector, Type and Shapes arrive as real
   assets; Apply moves them while every source document stays intact; all five
   categories reopen afterward.
4. **Generate background layering**: the background publishes separately, can be
   moved up/down, survives reload, and reopens with its selected source state.
5. **Cancel/publish failure**: Shapes cancel preserves the prior source revision;
   an empty-scene render failure leaves the previous layer and source untouched.

## J. Regression tests and screenshots

- `npm run verify` — PASS (contracts, production build including Shapes bundle,
  56 unit/component tests).
- `npm run test:browser` — PASS (Chromium; **48** browser acceptance tests; exact
  counts in the test report).
- `npm run tool:shapes:build` — PASS.
- `npm run tool:shapes:test` — PASS (23 tests).
- Retained Phase 2 native export tests: Image PNG/ZIP/GIF, Vector SVG/PNG, Type
  PNG/OTF all PASS.
- Retained Image/Vector/Type integration/reliability suite: PASS.
- Strict console/page-error guard across all browser tests.

Screenshots from actual Chromium workflows are in `docs/evidence/phase-3/`:
`01-shapes-editor.png`, `02-shapes-published.png`,
`03-shapes-source-restored.png`, `04-shapes-to-image.png`,
`05-mixed-composition.png`, `06-generate-host-layers.png`,
`07-generate-applied.png`, `08-generate-background.png`,
`09-shapes-compact.png`, `10-generate-compact.png`.

## K. Limitations and remaining blockers

1. Not every Shapes control/combination was executed. Pointer gizmo interactions,
   freehand stroke drawing, remix, all shade/material/lighting combinations and
   some keyboard paths remain preserved but not exhaustively browser-tested.
2. Shapes CSG/booleans remain dead upstream code; no vertex/edge editing; FBX
   import merges geometry and drops materials/UVs/hierarchy/animation.
3. Forced WebGL context loss is handled in code but not automatically exercised.
4. Generate decorative output is a Canvas2D rasterization of the selected
   background/accents/texture, not a pixel-identical browser screenshot. Motion is
   a still frame; carousel/full composition export is deferred.
5. Generate Apply preserves host stacking order; generated z values are stored but
   not applied automatically.
6. Generated-layout layers are excluded from foreground Generate inputs to avoid
   recursive background arrangement.
7. Generate Claude/spec export remains environment-dependent.
8. Studio has one active artboard; carousel previews exist but Apply targets one
   artboard.
9. Host undo history is session-only; old source/render revisions are never
   garbage-collected.
10. Chromium-only acceptance; no Firefox/WebKit/touch/axe audit.
11. BEND remains unintegrated; no final multi-layer composition export.
12. Shapes and Generate still run same-origin iframes in this deployment; the
    transport is exact-origin ready for a dedicated tool origin.

## L. Exact Phase 4 BEND handoff

**Starting point:** branch `phase-3/shapes-generate` (do not merge automatically).
BEND source is pinned at `tools/bend/` (`tanishkfr/Bend`,
`polish/phase-8.1.1-ui` @ `7f2d69c272d2a4607ff45f2575c650ac3b6cfb43`). Do not
change the BEND repository or its Vercel deployment.

1. Keep the whole BEND React 19/Pixi/Mediabunny app inside an isolated iframe,
   served from a stable `/tools/bend/` route. Build it with relative asset URLs and
   copy the bundle into the Studio production output, following the Shapes pattern.
2. Reuse `apps/studio/src/adapters/session/toolSession.tsx`; do not build another
   session controller. Implement the bridge with `ToolAdapterV1`.
3. Map BEND's existing `src/integration/contract.ts`:
   - `BendRenderedMedia` → video rendered asset + poster;
   - `BendStillMedia` → PNG still;
   - `exportEditableProject` → `.bendpkg` portable source package;
   - `HostPlaybackPolicy`, transform/opacity/order → host temporal layer metadata.
4. Add a versioned BEND source-state payload that references the `.bendpkg` and
   project schema/version. Restore must validate the package, project media and
   revisions before opening the editor; do not flatten the timeline/effects into
   host fields.
5. Add host `video`/`temporal` layer support and a poster image. Export explicitly
   chooses preview vs full-quality video; codec support is environment-dependent
   (Mediabunny/WebCodecs, Chromium baseline; document Firefox/Safari honestly).
6. Preserve every BEND specialized export and the existing project library/media
   bin. Do not reimplement transitions, masks, keyframes, generators or audio in
   the host.
7. Required Phase 4 verification:
   - `npm run tool:bend:install`
   - `npm run tool:bend:typecheck`
   - `npm run tool:bend:test`
   - `npm run tool:bend:build`
   - `npm run tool:bend:test:browser`
   - retained Phase 3 `npm run verify` and `npm run test:browser`
   - screenshot/video evidence for reopen, cancel, failed export, missing media,
     poster/video layering, full-quality vs preview and browser codec support.
8. Defer asset GC, persistent host undo, carousel/final composition export and
   BEND deployment changes unless separately scoped.
