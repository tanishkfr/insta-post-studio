# Image Adapter — Studio 2.0 Phase 2

## Status

The preserved Image editor is fully integrated as a Studio tool.

- Original file: `tools/legacy/image/janya.html`
- Original SHA-256: `ACDD62C499A4FCD3C372918BC6AD96F3E0A6DFA6D583A1BAB74B4AFBF9EC9BF6`
- Integration entry: `/tools/image/adapter.html` (generated at dev/build time)
- Host capture: `apps/studio/src/adapters/image/captureImageArtwork.ts`
- Source schema: `apps/studio/src/adapters/image/imageSourceState.ts`
- Tool bridge: `apps/studio/src/adapters/image/imageBridge.js`
- Shared session controller: `apps/studio/src/adapters/session/toolSession.tsx`
- Host raster renderer: `apps/studio/src/components/CanvasWorkspace.tsx`

The original file is **not edited**. The Vite plugin reads it, replaces the JSZip
CDN reference with a local vendored copy for the derived page, and injects the
bridge at the end of the same classic script that owns `S`, `img`, `hist`, `mk`,
`PH` and the original render/export functions. The standalone page remains
available at `tools/legacy/image/janya.html`, and a unit guard fails if the
source bytes change.

```
Studio React host
├─ ToolSession (handshake, inputs, restore, publish, cancel, retry, cleanup)
├─ Image adapter capture (photo asset + source state + full-res PNG)
└─ <iframe src="/tools/image/adapter.html">
   └─ injected bridge (same script scope as the preserved editor)
      └─ original Image editor and all filter/GIF/ZIP code
```

## Secure session flow

1. The host resolves and validates the layer's Image source document before the
   iframe opens.
2. For an existing layer, host reads `source.photo.assetId` and loads the
   original photo bytes from IndexedDB.
3. Host creates a scoped session and exact-origin `IframeToolAdapter`.
4. The bridge validates boot scope/origin and announces READY.
5. Host sends `tool/initialize`, `tool/open` with `StudioGlobalContext`, then
   `assets/input` with the photo bytes.
6. The bridge decodes the photo and **waits for the image `load` event** before
   accepting source restore. The normal `loadFile()` initialization path is not
   called during restore, so it cannot reset the saved effects.
7. Host sends `state/restore`; the bridge restores settings, internal layers,
   effect order, brush strokes, painted mask, crop/frame, history index and view.
8. Only after restore succeeds does the session become interactive.

The host never sends a photo-less restore: if the referenced source photo is
missing, the session fails with a readable error and the published layer is left
untouched.

## Source state (`1.0.0`)

MIME: `application/vnd.studio.image+json`

```json
{
  "tool": "image",
  "schemaVersion": "1.0.0",
  "savedAt": "…",
  "photo": {
    "assetId": "asset_…",
    "name": "portrait.png",
    "mimeType": "image/png",
    "width": 640,
    "height": 800,
    "contentHash": "…"
  },
  "settings": {
    "frame": { "zoom": 1.4, "x": 0.32, "y": 0.58 },
    "color": { "on": 1, "mode": "Duotone", "c1": "#1b1b4b", "c2": "#f4c78a", "bri": 0.25 },
    "medium": { "on": 1, "type": "Dots", "size": 9 },
    "trace": { "on": 0, "type": "Contours" },
    "blur": { "on": 1, "type": "Glitch", "strokes": [] },
    "zone": { "on": 1, "paint": "Paint", "use": "Only where painted" },
    "finish": { "on": 1, "grain": 0.3, "vig": 0 },
    "layers": [{ "id": "styled", "op": 0.8 }],
    "order": ["trace", "blur", "medium"]
  },
  "history": ["…native S snapshots…"],
  "historyIndex": 1,
  "mask": {
    "width": 600,
    "height": 750,
    "dataUrl": "data:image/png;base64,…"
  },
  "view": {
    "format": "4:5",
    "tab": "edit",
    "selectedLayer": "styled",
    "openSections": ["medium"],
    "advancedSections": []
  }
}
```

- `settings` is the full native `S` object — colour grading, pattern/trace/blur
  controls, effect order/visibility/opacity, smudge strokes, fade/paint controls,
  grain/vignette, internal photo/styled/texture layer metadata and crop framing.
- `mask` is the painted mask canvas, not part of `S`.
- `history` preserves the editor's native snapshots and `historyIndex`; undo/redo
  continue to work after restoration.
- `view` restores the format, active inspector tab, selected internal layer and
  open sections.
- The **source photo is not stored inside `S`**. The bridge emits it once at
  publish time; the host separates the bytes into a `source-image` asset and
  stores only `photo.assetId` in the durable source state. The transient payload
  is not persisted.

## Full-resolution publication

The host supplies the active artboard dimensions. The bridge maps them to the
preserved renderer's native export path:

- 4:5 → `1080 × 1350`
- 1:1 → `1080 × 1080`
- 9:16 → `1080 × 1920`

It temporarily selects the matching native format, computes the editor's actual
export scale (`targetWidth / dims(1).W`), calls the original `render(k, canvas)`,
verifies the resulting canvas exactly matches the target, and restores the live
format/phase state afterwards. It never captures the 600×750 preview canvas and
never silently stretches or crops. Other aspect ratios fail with a clear render
error instead of guessing.

The captured canvas contains only Image content. UI overlays, guides, safe-zone
shading, cursors, selection rings and editor chrome are separate overlay/DOM
layers and are excluded. The published raster is PNG with native artboard
dimensions and valid PNG alpha information (the photographic result is normally
opaque).

## Host raster support

Published Image layers are separate raster layers in the host:

- rendered with `<img>` from an IndexedDB-backed object URL;
- intrinsic dimensions/aspect preserved;
- host position, size, rotation, anchor, flips, opacity and visibility applied;
- host blend mode passed to CSS compositing;
- clipping through the artboard container;
- selection, drag/resize, layer panel order and inspector operations;
- object URLs are reference-counted and revoked on unmount;
- missing/corrupt assets show an unavailable-artwork state without deleting the
  source or other layers.

No host edit flattens the composition or rewrites the Image source document.

## Publish transaction

`captureImageArtwork()`:

1. requests the native Image source payload;
2. validates tool/MIME/version and required fields;
3. decodes the transient source photo and stores it as a separate asset;
4. builds the durable source document with `photo.assetId` and persists it at
   the next source revision;
5. requests a fresh full-resolution PNG render;
6. validates PNG signature/IHDR and exact target dimensions;
7. stores the rendered asset;
8. reads photo, source and render records back and verifies content hashes;
9. only then returns references to the host, which commits the layer/project.

If the project write fails, the host rolls back the in-memory commit. The prior
durable layer/source revision remains intact and a retry cannot create a
duplicate layer. Republishing an existing Image layer updates that same layer ID
and preserves host transform, rotation, opacity, visibility, lock, artboard and
stacking order.

## Inputs and handoffs

- **Selected host image as input:** the inspector exposes “Use as Image Input”;
  the host sends the selected rendered raster as the source photo for a new Image
  layer.
- **Image → Vector:** “Continue in Vector” sends the rendered PNG through scoped
  asset transport. The preserved Vector importer traces it into editable contour
  lines. The UI states explicitly that this is a conversion, not a live linked
  raster. The original Image layer remains unchanged.
- **Image → Type:** “Use as Type Pattern” sends the rendered Image asset to
  Custom Type as its motif. The original image layer remains unchanged.

## Native exports

All original specialized exports remain inside the preserved editor:

- flattened PNG at the editor's native export size;
- layered ZIP containing `manifest.json`, `flattened.png`, `source.json`, three
  layer PNGs and `paint-mask.png`;
- animated GIF at 10/12/15 fps and 360/480/600 px width, with the preserved
  median-cut/LZW encoder.

The derived page uses a vendored JSZip 3.10.1 so ZIP export is deterministic and
works without the cdnjs dependency. The standalone page keeps its original CDN
script reference.

## Known limitations

- Single source photo. Replacing it inside Image replaces the layer input photo.
- Heavy pattern/trace effects run synchronously; full-resolution publication can
  take seconds.
- Native undo snapshots cover `S`, not the separate painted mask or source photo,
  matching the original editor's semantics.
- The integrated renderer accepts the three Studio artboard aspects (4:5, 1:1,
  9:16). Other aspects fail honestly.
- Image output is a flat rendered layer; its internal three-layer stack remains
  editable only in the Image source. The ZIP preserves it as specialized output.
- Old assets are never garbage-collected; source/render revisions remain
  readable for undo/history.
- Drag/drop and clipboard import remain available but are not covered by
  Phase 2 browser acceptance; file-picker import is automated.

## Evidence and commands

```powershell
npm run verify
npm run test:browser
npx playwright test tests/browser/image-roundtrip.spec.ts --project=chromium
npx playwright test tests/browser/native-exports.spec.ts --project=chromium
```

Screenshots: `docs/evidence/phase-2/01-image-integrated.png`,
`02-image-published.png`, `03-image-source-restored.png`,
`04-image-to-vector-trace.png`, `05-image-to-type-motif.png`,
`09-image-narrow-layout.png`.
