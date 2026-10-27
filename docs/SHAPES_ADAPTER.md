# Shapes Adapter — Studio 2.0 Phase 3

**Source:** `tools/shapes/` (upstream `rajshekharbasu/shapes` @ `08fea0e00d43f2b955f34e6e341c4f2aaba427ca`).
**Runtime:** React 18.3 + React Three Fiber 8 + Three.js 0.170, independently bundled.
**Host protocol:** `ToolAdapterV1` over the scoped iframe transport, protocol `1.0.0`.
**Source schema:** `application/vnd.studio.shapes+json`, version `1.0.0`.

## 1. Runtime isolation and build

Shapes never mounts inside the React 19 Studio tree. The preserved app is built by
`tools/shapes` (`vite build`) and served from the stable nested route:

```text
/tools/shapes/index.html
```

`tools/shapes/vite.config.ts` uses `base: './'` so hashed JS, CSS, dynamic chunks and
fonts resolve relative to that route. The Studio Vite plugin:

- serves `tools/shapes/dist/` in development at `/tools/shapes/*`;
- copies the independently built bundle into `apps/studio/dist/tools/shapes/` in
  production;
- fails the host build with an explicit message if the Shapes bundle is absent.

Root `build`, `predev` and `pretest:browser` run `npm run tool:shapes:build`.
CI installs `tools/shapes` dependencies separately because the root workspace
deliberately excludes tools. Shapes keeps its own lockfile and dependency tree.

The standalone route still works without a `#studio=` boot hash. In that case
`installStudioShapesBridge()` returns without installing any Studio chrome or
messaging; the original editor interface and behavior are unchanged.

## 2. Bridge and capabilities

`tools/shapes/src/studioBridge.ts` is bundled with Shapes and implements the same
scoped protocol as the Phase 1–2 tool adapters:

- boot scope is parsed from the URL hash and validated against the tool ID and
  expected origin;
- host messages must come from the parent, exact host origin, current
  project/session/tool/channel scope and a pending request ID;
- ready is announced after the React UI mounts;
- dirty events are emitted only after initialization and are suppressed during
  source restoration;
- capabilities declare `open-canvas`, `import-3d`, `export-image`,
  `transparent-render`, `editable-source` and `bridge`.

Honest limitations reported by the adapter:

- no standalone project persistence (Studio owns the versioned source state);
- single selection, fixed-parameter face tools and render-time deformation;
- FBX import merges geometry and discards materials/UVs/hierarchy/animation;
- transparent rendering requires WebGL and reports context loss;
- the UI font comes from Google Fonts; the 3D scene itself does not depend on it;
- CSG/booleans remain dead upstream code and are not presented as working.

`templates`/input assets are rejected with a clear receipt: Shapes publishes a 3D
render and does not consume host rasters. Image treatments use **Continue in Image**
instead.

## 3. Shapes source schema `1.0.0`

`tools/shapes/src/editor/sourceState.ts` serializes and validates the editor's real
private state. The payload contains:

- the complete `ShapeDocument` (`objects[]`);
- stable object IDs (`obj-<serial>`) and the next serial generator state;
- primitives, custom quad meshes, imported triangle meshes, transforms, colours,
  deformations, array rules, stroke paths, remix seeds and form flags;
- selection, active face, move/rotate/scale tool, shading mode, ink colour,
  wireframe, gizmo visibility and lighting preset;
- camera orbit state (theta, phi, radius, target) so framing survives re-entry;
- native `past`/`future` edit history, bounded and structurally validated;
- no transient pointer lock, active drag/draft transform or unfinished stroke
  draft.

Validation is deliberately strict and runs twice: once on the host before the
iframe opens (`adapters/shapes/shapesSourceState.ts`) and again inside Shapes
before replacing editor state. It checks:

- tool/schema/mime identity;
- unique, well-formed object IDs and a next serial that covers them;
- finite vectors/transforms, positive scale, bounded deformation;
- array counts ≤ 20, bounded gap/seed/jitter;
- stroke point and mesh/triangle limits;
- valid face/vertex indices;
- supported enums and hex colours;
- camera ranges;
- history array bounds/structures.

Any malformed or unsupported document throws. The existing editor state is not
assigned, so a failed reopen cannot damage the current scene. The host also
rejects unsupported versions before creating an iframe.

## 4. Transparent 3D rendering

`tools/shapes/src/editor/renderScene.ts` renders the actual 3D scene, not the
interactive canvas. It builds a fresh Three.js scene containing:

- object geometry from primitives, quad meshes or imported triangles;
- the same deformations, arrays/strokes, remix colours and instance transforms
  used by the editor;
- the selected shading/material settings, lighting preset and ink outlines;
- the saved camera rig, projected through a perspective camera.

It deliberately **does not add**:

- the editor background or grid helper;
- transform gizmos;
- selection boxes, active-face highlights or selection wireframes;
- temporary/saved stroke guide lines;
- inspector/outliner/session chrome.

Rendering uses an offscreen `WebGLRenderer` with an RGBA render target, not the
interactive buffer:

1. render at 2× supersampling when within an 8.5 MP budget;
2. `readRenderTargetPixels`;
3. flip vertically for correct PNG orientation;
4. un-premultiply partially transparent edge pixels (WebGL target stores
   premultiplied RGB);
5. downsample to the exact host artboard dimensions;
6. read the final canvas and verify both visible object pixels and transparent
   empty pixels;
7. encode PNG with `canvas.toBlob('image/png')`.

The output camera aspect matches the requested output viewport. A 4:5 render is
not stretched to 1:1 or 9:16; the camera framing is consistent with the host
artboard viewport.

Context loss, unavailable WebGL, invalid sizes, empty scenes, invalid alpha,
encoding failure and context-loss-after-clear are reported as `RENDER_FAILED` or
`ENVIRONMENT_UNSUPPORTED` errors. Render targets, geometries, materials, textures
and renderer resources are disposed in a `finally` block. A forced context-loss
test is not part of the automated suite; the code path is implemented and the
unverified case is recorded in the test report.

## 5. Publishing, re-entry and host behavior

`apps/studio/src/adapters/shapes/captureShapesArtwork.ts`:

1. asks Shapes for its complete editable source and validates it;
2. requests a transparent PNG at the active artboard's exact dimensions;
3. decodes/validates the PNG (signature, IHDR, 8-bit true-alpha, exact dimensions,
   visible and transparent samples);
4. only after a verified render, writes a new immutable source revision and a
   content-addressed rendered PNG asset;
5. verifies both records read back with matching hashes;
6. lets the normal host publish transaction commit a `shapes` layer.

Source-before-render ordering from earlier adapters was deliberately reversed: a
failed render must not leave a new source revision that the layer never references.

The host layer stores:

- the transparent raster (`RenderedAssetReference`, `hasAlpha: true`);
- native output dimensions;
- a versioned `ToolSourceStateReference`;
- provenance metadata.

New Shapes layers fit inside the artboard without upscaling. Republish updates the
same layer ID, source revision and rendered asset while leaving host transforms,
opacity, visibility, lock state, name and stacking order untouched. Cancel closes
the session without a new capture; the prior saved revision remains intact.

**Edit in Shapes** reopens the 3D document through the source payload. It does not
load the flattened PNG. Native undo/redo works after restore; the restored camera,
objects, materials, deformations, arrays and history are covered by unit and browser
tests.

## 6. Handoffs

- **Continue in Image**: the verified transparent PNG becomes a new Image input;
  Image publishes a derivative layer with `provenance.sourceLayerId` pointing at the
  Shapes layer. The Shapes source remains editable and unchanged.
- **Generate layouts**: Shapes layers are sent to Generate as real host layers with
  stable IDs and downscaled thumbnails; applying a Generate alternative changes only
  host presentation transforms.

## 7. Verification

- Existing Shapes suite now covers 23 tests including source round-trip, native
  undo/redo after restore, validation failures and a known ASCII FBX cube fixture.
- Browser acceptance covers: transparent PNG dimensions/alpha/corners, no blue
  selection pixels, source JSON, restore, republish identity/transform, FBX import,
  loop cut/extrude/inset, deformation, duplication, arrays, Shapes→Image and mixed
  composition with Image/Vector/Type.
- `docs/evidence/phase-3/01-shapes-editor.png`,
  `02-shapes-published.png`, `03-shapes-source-restored.png`,
  `04-shapes-to-image.png`, `09-shapes-compact.png`.

## 8. Known limits

- Interactive gizmo pointer gestures, orbit/pan/dolly input, stroke drawing and
  remix are preserved but not exhaustively browser-tested.
- FBX import remains merged geometry with no materials/UVs/animation.
- Face editing is fixed-parameter quad editing; no vertex/edge editing.
- CSG/booleans remain nonfunctional upstream code.
- Forced WebGL context loss is handled in code but not exercised automatically.
- Standalone Shapes still has no project persistence; persistence is a Studio
  adapter capability.
