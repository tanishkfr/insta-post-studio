# Generate Adapter — Studio 2.0 Phase 3

**Source:** `tools/legacy/generate/generator.html` (upstream Insta-post @
`3eac3c7f5228e8324c6b245eb3011b86762b1d25`), byte-identical.
**Derived entry:** `/tools/generate/adapter.html`, generated at build/dev time.
**Host protocol:** `ToolAdapterV1`, protocol `1.0.0`.
**Source schema:** `application/vnd.studio.generate+json`, version `1.0.0`.

## 1. Preserved source and derived integration

The original `generator.html` is never modified. The Studio Vite plugin derives a
single integration page by:

1. injecting the scoped Generate bridge before the original inline script closes;
2. making the slide aspect ratio format-driven
   (`--studio-gen-aspect`, default `4/5`);
3. making the placement `top` percentage use
   `window.__studioGenFrameHeight` (default 125);
4. preferring an authored asset aspect ratio in the original rule engine
   (`h: w * (a.aspectHOverW || AR[k])`);
5. extending the original `kind()` helper so host layer kinds map onto the
   existing hierarchy roles;
6. fixing the upstream texture helper's nested double quotes so its valid texture
   markup survives rasterization.

Everything else remains the original generator: `OPT`, the 12 creative controls,
`rules()` with its 60-pass collision/boundary loop, `FIXED` static presets,
`ruleVars()`, carousel controls, the asset bin, `+ Text`/`+ Image`, Claude mode and
the environment-dependent Export spec action.

The standalone `tools/legacy/generate/generator.html` continues to load and operate
without a bridge or boot hash (browser-tested).

## 2. Runtime, transport and capabilities

The bridge is injected into the same classic script so it can access the real
`S`, `rules`, `elHtml`, `pal`, `rngF` and renderer helpers without forking the
layout algorithm.

- exact host origin/parent/scope/request validation;
- ready handshake after the original UI boots;
- `tool/open` receives the active artboard and real Studio context;
- `assets/input` receives a manifest plus thumbnails;
- `state/restore` restores saved source without applying it;
- `state/serialize` returns the complete Generate source document;
- `render` publishes the selected decorative treatment as PNG;
- capabilities declare `open-canvas`, `import-image`, `export-image`,
  `transparent-render`, `editable-source` and `bridge`.

Honest limitations:

- Claude sampling/spec export is Claude-host-only. Studio preserves the mode and
  shows the original fallback; it does not invent a paid AI backend.
- Generated visual treatments are rasterized with a deterministic Canvas2D
  renderer because Chromium taints canvases drawn from SVG `foreignObject` with
  cross-origin CSS resources. The renderer mirrors the original backgrounds,
  accents and textures; it is not a browser screenshot.
- Motion backgrounds are captured as a representative still.
- Studio has one active artboard; carousel previews remain available but Apply
  layout targets the active host artboard.

## 3. Host inputs

`apps/studio/src/adapters/generate/loadGenerateInputs.ts` builds two kinds of input:

1. a JSON manifest (`__studio_generate_manifest__`) with project/artboard context
   and one entry per included layer;
2. one reference/thumbnail input per layer with a rendered asset, using the
   stable host `layerId`.

Policy:

- only the selected/active artboard is sent;
- hidden layers are excluded by default;
- locked layers are included for preview and marked `locked`; Apply layout skips
  them;
- generated-layout background layers are excluded from foreground inputs so a
  background cannot recursively arrange itself;
- the layer being edited is excluded from its own Generate inputs;
- raster thumbnails are downscaled to ≤512 px; SVG thumbnails remain vectors;
- no unrelated project/artboard assets are transmitted.

The bridge maps host assets to stable internal IDs `host:<layerId>` and replaces
the Studio asset bin with real layers. Original sample assets remain in use when
the project has no eligible layers; `+ Text` and `+ Image` continue to work.

Host layer kinds map to existing hierarchy roles:

| Host kind | Rule role | Preview |
| --- | --- | --- |
| image | `img` | rendered thumbnail |
| vector | `vec` | rendered SVG thumbnail |
| shapes | `obj` | transparent render thumbnail |
| typography | `head` | rendered Type thumbnail + host text metadata |

## 4. Format-aware layout coordinates

The preserved engine works in a 100×125 design space (4:5). The bridge sets:

```text
frameHeight = 100 * artboard.height / artboard.width
```

- 4:5 → 125 (identity, original rules unchanged);
- 1:1 → 100;
- 9:16 → 177.78.

For non-4:5 artboards, the original 100×125 result is mapped into the actual
frame (`y' = y / 125 * frameHeight`) and the same separation/overlap/boundary
constants are run again in that space. Element widths remain percentages of the
artboard width, and each placement height uses the layer's authored aspect ratio
(`aspectHOverW`), so images/vectors/Types/Shapes are never stretched to a new
aspect. The slide preview uses the real artboard aspect ratio.

## 5. Apply layout

The session bar exposes **Apply layout**. It is deliberately separate from
publishing:

1. the host asks the bridge for the current complete source state;
2. the host validates it and resolves the selected variant's first slide to
   stable host-layer targets;
3. the active artboard aspect is checked against the saved session aspect;
4. `projectStore.applyGeneratedLayout()` updates only position, width, height and
   rotation for unlocked, visible layers in one commit;
5. the project is saved; a failed save rolls the commit back.

It never modifies Image effect documents, Vector geometry, Type font/motif state,
Shapes 3D geometry or asset bytes. It does not change layer stacking order in this
phase; the generated `z` values are retained in source state but order application
is intentionally deferred. Locked and hidden layers are skipped; a completely
locked composition reports that no layers were changed.

The commit is one host undo step. The session exposes **Undo layout** immediately
after applying, and the normal host undo works after returning to the canvas.

## 6. Generated backgrounds/accents/textures

**Publish background layer** uses the bridge `render` operation to produce a PNG
at the exact active-artboard dimensions. The Canvas2D rasterizer mirrors the
selected variant's:

- background style (Atmospheric, Abstract, Image-based, Material-based,
  Depth-based, Motion-based);
- accent style (lines, geometric shapes, small marks, frames);
- texture (film grain, paper, noise, distressed);
- palette/colour mode and seed, including alpha overlays.

The result is stored as a normal `generated-layout` raster layer, placed at the
bottom of the stack by default. The user can reorder, hide, move or duplicate it.
Foreground layers are never merged into it.

The editable Generate source is stored beside the raster. It keeps the selected
variant, seed, controls, variations, host mapping, placements, per-artboard
dimensions, decorative settings and missing-layer list. Reopening the layer
restores those settings and the selected variation; it does **not** re-apply any
layout to the host. The distinction is explicit: the background itself is an
honest rendered raster, not editable individual background shapes.

## 7. Source restoration and stale inputs

On reopen:

- the host validates the Generate source version before opening the iframe;
- the bridge compares the saved host-layer mapping with the current manifest;
- missing layers are replaced by explicit missing placeholders and a visible
  banner lists them;
- saved placements are restored as previews but not applied;
- the banner offers **Regenerate from current layers**, which drops missing
  placeholders and reruns the preserved engine against the current real layers;
- if the artboard aspect changed, the bridge regenerates for the current aspect
  rather than reusing stale 4:5 coordinates.

The host Apply path independently filters targets to IDs that still exist. A missing
ID is never silently remapped to a different layer.

## 8. Verification

- `generate-smoke.spec.ts`: real layers, alternatives, reversible Apply, source
  hashes unchanged, background publish, reload/reopen, restored variations,
  reorder, 4:5/1:1/9:16 frame heights.
- `generate-controls.spec.ts`: 12 controls, layout change, static presets, Claude
  fallback, carousel slides, native + Text, seed/regeneration determinism.
- `generate-reliability.spec.ts`: hidden exclusion, locked policy, missing-layer
  warning/regeneration, safe host preservation.
- `pipeline-phase3.spec.ts`: Image + Vector + Type + Shapes → Generate, Apply,
  background, reload, all five source editors.
- Evidence: `docs/evidence/phase-3/06-generate-host-layers.png`,
  `07-generate-applied.png`, `08-generate-background.png`,
  `10-generate-compact.png`.

## 9. Known limits

- Generated backgrounds are raster treatments; individual decorative CSS shapes
  are not reconstructed as editable host layers.
- The Canvas2D rasterizer is visually faithful to the selected palette/style but
  cannot reproduce every browser-specific CSS filter nuance pixel-for-pixel.
- Motion backgrounds are stills.
- Carousel previews exist, but Studio's single active artboard means Apply targets
  one artboard and carousel export remains deferred.
- Layer z-order is preserved from the host; generated z values are stored but not
  applied automatically.
- Claude-dependent generation/spec export remains environment-dependent.
