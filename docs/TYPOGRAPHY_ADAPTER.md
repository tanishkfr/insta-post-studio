# Typography Adapter — Studio 2.0 Phase 2

## Status

Studio exposes one **Type** tool with two internal modes:

1. **Type Library** — the preserved `tools/typography/fonts.html` editor.
2. **Custom Type** — the preserved `tools/typography/custom.html` editor.

Both modes remain complete. Neither is replaced by a host text element or a
flattened preview.

- Original pages: `tools/typography/fonts.html`, `custom.html`
- Original scripts: `fonts.js`, `script.js` (unchanged)
- Integration entries:
  - `/tools/typography/fonts-adapter.html`
  - `/tools/typography/custom-adapter.html`
- Derived scripts:
  - `/tools/typography/fonts-adapter.js`
  - `/tools/typography/custom-adapter.js`
- Host schema: `apps/studio/src/adapters/typography/typographySourceState.ts`
- Host capture: `apps/studio/src/adapters/typography/captureTypographyArtwork.ts`
- Bridges: `apps/studio/src/adapters/typography/libraryBridge.js`,
  `customBridge.js`
- Host session: `apps/studio/src/components/TypeEditor.tsx`

The original files are byte-identical and covered by SHA-256 guards. The Vite
plugin creates derived pages and injects each bridge **inside the existing
`DOMContentLoaded` closure** in a generated copy of the original script. That is
required because the real state (`S`, the distortion `field`, controls, renderer
and export functions) is closure-scoped and is not exposed globally.

```
Studio Type session
├─ mode toggle (Library / Custom) with independent in-session drafts
├─ shared ToolSession handshake/restore/publish/cleanup
├─ Type Library adapter ─ derived fonts-adapter.html/js
└─ Custom Type adapter  ─ derived custom-adapter.html/js
```

## Type Library source state (`1.0.0`)

MIME: `application/vnd.studio.typography+json`

```json
{
  "tool": "typography",
  "schemaVersion": "1.0.0",
  "mode": "library",
  "savedAt": "…",
  "state": {
    "text": "STUDIO TYPE",
    "font": {
      "name": "Goozette",
      "kind": "open",
      "file": "goozette.otf",
      "source": "typotheque",
      "caps": false,
      "family": "typefont3"
    },
    "size": 200,
    "tracking": 0.06,
    "weight": 600,
    "ink": "#193438",
    "strength": 80,
    "brush": 150,
    "field": {
      "width": 1920,
      "height": 512,
      "values": [[25, 1.25, -0.5], [26, 0, 2]]
    }
  }
}
```

- Font identity selects the exact preserved catalogue entry by name/kind.
  Bundled open-source fonts are loaded through `loadOne()`; the bridge waits for
  `FontFace.load()` and `document.fonts.ready` before restoring/capture.
- `field` is the renderer's actual distortion plane, not the visible slider
  values. It stores the plane size plus sparse `[cellIndex, offsetX, offsetY]`
  values at full precision. On restore the plane is rebuilt and a full dirty box
  is applied, reproducing the same deformed canvas.
- The bridge restores text, ink, size, tracking, weight, strength and brush by
  updating the preserved controls and calling the original `draw()` path.
- If the selected font cannot load, restore fails with a readable warning and
  the existing layer stays untouched. The failure path is tested by removing the
  bundled `fonts-data.js` payload.

### Distortion reset

The original “Reset distortion” button remains wired to `resetField()`. A
browser test verifies the internal field is non-zero after a brush drag and
returns to zero after reset.

### Type Library publication

The bridge uses the preserved transparent preview canvas (`#preview`), not a
reconstructed font renderer:

- waits for the selected font and `document.fonts.ready`;
- calls the original `draw()` to synchronise the canvas;
- encodes that exact canvas as PNG;
- preserves authored ink/transparency and the renderer's margins;
- returns native canvas dimensions to the host.

The host stores the PNG and fits it into the active artboard without changing
font size, tracking, weight or distortion controls. No background is added by
Studio. Native “Export PNG” remains available inside the editor and still uses
the original background-composited export path.

## Custom Type source state (`1.0.0`)

```json
{
  "tool": "typography",
  "schemaVersion": "1.0.0",
  "mode": "custom",
  "savedAt": "…",
  "state": {
    "strokes": [{ "w": 0.013, "pts": [[0.42, 0.51], [0.55, 0.47]] }],
    "thickness": 8,
    "img": {
      "dataUrl": "data:image/png;base64,…",
      "name": "motif.png",
      "width": 320,
      "height": 420
    },
    "imgRect": { "x": 0.08, "y": 0.1, "w": 0.84, "h": 0.7 },
    "imgBase": { "w": 0.84, "h": 0.7 },
    "imgScale": 1,
    "top": "doodle",
    "ink": "#193438",
    "text": "BEND",
    "spacing": 0.09,
    "motifSize": 1.1,
    "letterSize": 180,
    "tracking": 0.02,
    "rotation": 0,
    "variation": 0,
    "weight": 1,
    "serif": 0,
    "mono": 0,
    "script": 0,
    "stretch": 1,
    "slant": 0,
    "stage": "draw"
  }
}
```

- `strokes` are the editable motif strokes captured at full precision.
- The uploaded motif image is preserved as a data URL (original bytes for native
  uploads, PNG bytes for host-delivered inputs) together with the exact
  placement/scale rectangle and drawing/image layering order.
- All letterform, pattern, tracking, stretch, slant and stage controls are
  restored through the preserved controls.
- Reopening returns to the saved Draw/Type stage and the selected mode.

### Custom Type publication

The bridge calls the original `renderComposition(3, null)` path. That is the
same composition engine used by the native PNG/OTF exporters, but without the
optional background, so the published layer is a transparent PNG with the
original margins around distorted/slanted glyphs. Stroke/image pattern data and
all controls remain in the source state.

### Native exports

- **PNG** — original 3× export with the authored contrast background.
- **OTF** — original opentype.js export: ASCII 32–126, line-segment glyphs,
  1000 units/em, image motifs reduced to one-bit dark runs. The adapter page uses
  a vendored opentype.js 1.3.4 so OTF export does not depend on cdnjs; the
  standalone page keeps its original CDN reference.
- Native OTF export is parsed by an automated test (`OTTO`, `unitsPerEm=1000`,
  glyph count and space glyph).

## Mode switching and persistence

- Switching modes first serializes the current draft through the adapter, then
  restores it when the user switches back. Both drafts live independently inside
  the open Studio session.
- Publishing saves the **active** mode and tags the layer with
  `type-mode:library` or `type-mode:custom`.
- Reopening a Type layer returns to the mode recorded in its tags and restores
  that mode's source state.
- Only the published mode is durable for a given layer. The other mode's
  in-session draft is intentionally not merged into the same source document.
  Publishing a different mode updates the same Type layer, so the composition
  remains one layer per authored design.

## Inputs and handoffs

- **Image → Type:** “Use as Type Pattern” sends the selected Image layer's
  rendered PNG through the scoped asset transport. Custom Type imports it as the
  motif using the same geometry as a native upload. The original Image layer is
  unchanged and the result is a new Type layer with provenance.
- **Native motif upload:** still available directly in Custom Type. Upload,
  remove, image size and drawing/image order controls are preserved and tested.
- Type Library rejects image inputs with a message pointing the user to Custom
  Type; it does not silently ignore or fake the capability.

## Host behavior

- One “Type” entry in the Studio tool rail.
- Mode toggle remains available in the session bar.
- Canvas format does **not** overwrite font size, pattern size, letter size or
  distortion. Type publishes at its native authored size; the host fits the
  resulting raster into the artboard.
- Type layers are transparent PNG raster layers, reorderable with Image/Vector
  layers. Selection, drag, opacity and host transforms are separate from Type's
  internal controls.
- Type Library and Custom Type export controls stay visible inside the editor.

## Known limitations

- Type Library's distortion plane can be large; source state stores it sparsely
  but a very large field still increases source size.
- Only the active mode is durable per layer after publish/reload. Both drafts are
  safe while the session is open, but the inactive draft is not merged into the
  layer on publish.
- Google Fonts are still used by Custom Type for serif/monospace/script blending
  and by both pages for UI; fallback faces render when offline.
- OTF export remains ASCII/line-segment only with no kerning or curve outlines.
- Type Library has no custom font import, leading/alignment controls or search;
  those are original limitations, not removed features.
- Bundled font redistribution rights remain unresolved for public release.

## Evidence and commands

```powershell
npm run verify
npm run test:browser
npx playwright test tests/browser/type-smoke.spec.ts --project=chromium
npx playwright test tests/browser/custom-type-smoke.spec.ts --project=chromium
npx playwright test tests/browser/native-exports.spec.ts --project=chromium
```

Screenshots: `docs/evidence/phase-2/05-image-to-type-motif.png`,
`06-mixed-composition.png`, `07-type-library-distortion.png`,
`08-custom-type.png`.
