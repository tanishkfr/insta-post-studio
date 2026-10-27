# Feature Parity Matrix — Studio 2.0

**Baseline date:** 2026-10-26  
**Phase 3 status:** Image, Vector, Type (Type Library + Custom Type), Shapes and Generate are integrated. BEND remains a preserved baseline for Phase 4.  
**Baseline commits:** see [SOURCE_MANIFEST.md](SOURCE_MANIFEST.md)  
**Purpose:** the non-regression contract for future phases. It records what exists, not what is planned.

> **Phase 3 update:** Shapes now runs as an independently built React 18/Three.js iframe with versioned 3D source state, transparent offscreen rendering, publish/re-entry and Shapes→Image/Generate handoffs. Generate now runs as a derived page over the byte-identical legacy source with real host-layer inputs, aspect-aware layouts, reversible Apply, generated-background publishing and versioned source restoration. Rows below were upgraded only where a repeatable Phase 3 test actually exercised them. Evidence is in [Phase 3 integration](#phase-3-integration--verified) and [PHASE_3_TEST_REPORT.md](PHASE_3_TEST_REPORT.md).

## Status legend

| Tag | Meaning |
| --- | --- |
| **T** | Confirmed by automated tests that were run in Phase 0. Test scope is named; this is not a claim of full end-to-end coverage. |
| **R** | Exercised in the Phase 0 browser verification (load, visible render or direct interaction). Not a full feature acceptance test. |
| **S** | Identified in source but not exercised in Phase 0. |
| **L** | Known existing limitation or missing capability in the preserved source. |
| **E** | Unsupported or environment-dependent (host, network, codec, browser, or external service). |

**No full parity claim:** the editors were loaded and basic flows checked, but most individual controls were not exhaustively exercised. Features marked **S** remain part of the preservation contract and must be checked during adapter development.

Environment used for **R** checks: Chromium via Playwright at 1440×900, Windows, online; local static/Vite servers. No console or page errors were observed on any primary page.

---

## 1. Image — `tools/legacy/image/janya.html`

Entry point: standalone `janya.html`; also embedded in the legacy combined shell. All logic is inline; state is a page-local `S` object plus module-level canvases, history and presets.

| # | Source feature | Source & entry point | State owner | Required deps / browser | Output formats | Future integration consideration | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| IMG-01 | Photo import: file picker, drag/drop, image clipboard paste | `loadFile()`, `#file`, `#drop`, paste listener | Source photo outside `S`; filename sets header | Canvas2D, FileReader, Clipboard API | In-editor source bitmap | Source photo stored as a separate host asset; source image is not covered by undo | **T** (file-picker import + host asset round-trip); S (drop/paste) |
| IMG-02 | Square/portrait/story preview formats, zoom, safe-zone guides | `dims()`, `zoomF`/`fitSc`, UI-zone overlay | `S.frame`, `S.zone`; zoom is view state | DOM, Canvas2D | Live preview | Host artboard format is authoritative in Studio; integrated zoom/safe-zone controls remain available | **T** (4:5/1:1/9:16 host map); S (zoom/safe zones) |
| IMG-03 | 4:5, 1:1 and 9:16 export sizing to 1080 short edge | `dims(1)`, `expo()` | `S` | Canvas2D | 1080×1350 / 1080×1080 / 1080×1920 PNG | Studio uses the same full-resolution path, verifies exact artboard dimensions and rejects unsupported aspects | **T** (shared publish + native PNG) |
| IMG-04 | Eight built-in looks (Dreamy sunset, Neon night, Faded polaroid, Moody film, Pastel haze, Speed rush, Fading to dust, No effects) | `LOOKS`, `look()`, `#ls` | `S` sections/order; frame preserved | Canvas2D, Google Fonts | Rendered canvas | Map to source-state presets; don't flatten on integration | S |
| IMG-05 | Saved looks with thumbnails and delete | `#ps`, `PR`, `localStorage['bd_presets']` | Browser localStorage | localStorage, Canvas2D | Local presets | Migrate into project-scoped presets or preserve as local user library | S |
| IMG-06 | Prompt-based look generation, shuffle, idea chips | `gen()`, `applyGen()`, `RULES`, `localGen()`, `#gi`, `#sh` | `S` | DOM regex local fallback; optional `window.claude` sampling | Updated effect controls | Local rule engine can be preserved as an in-tool assistant; Claude path optional | S |
| IMG-07 | Colour: Original/B&W/Sepia/Duotone, brightness, contrast, saturation, posterize, duotone swatches | `colorPass()`, `PAL`, `c1`/`c2` | `S` | Canvas2D | Rendered canvas | Source-state fields map directly; preserve exact grading math | **T** (Duotone + brightness round-trip/republish); S (other modes) |
| IMG-08 | Cover-fit framing and pan/zoom | `S.frame`, `render()`, Edit tab | `S.frame` | Canvas2D, pointer events | Rendered canvas | Frame stays source-editor crop; host transform remains separate | **T** (zoom/x/y source round-trip) |
| IMG-09 | Pattern treatments: Cross-stitch, Pixels, Dots, Beads, Lines, Knit, Letters, Glass + palettes/yarn limits | `medium()`, `#cats`, Pattern controls | `S.medium` | Canvas2D, optional JSZip only for export | Rendered canvas; layer exports | Preserve as source state; rendered flat output as composition asset | **T** (Cross-stitch/Dots render, source round-trip); S (other variants) |
| IMG-10 | Trace treatments: Paper layers, Contours, Waveform, Stipple | `traceFx()`, `tPaper`/`tContour`/`tWave`/`tStipple` | `S.trace` | Canvas2D | Rendered canvas | Heavy synchronous CPU work; preserve exact tracing algorithms | **T** (Contours used for Image?Vector input); S (other trace styles) |
| IMG-11 | Blur treatments: Soft, Smudge, Motion, Zoom, Blast, Wave, Glitch; smudge stroke brush, paint/erase mask brush | `blur()`, `smudge()`, `dab()`, `S.blur.strokes` | `S.blur`, pointer strokes | Pointer events, Canvas2D | Rendered canvas | Preserve pointer strokes; do not replace with simplified CSS filters | **T** (Glitch render + source state); S (smudge gesture and other variants) |
| IMG-12 | Effect stack with drag reorder, per-effect visibility, opacity and removal | `S.order`, `buildStack()`, `build()` | `S.order`, section states | DOM drag, keyboard arrows | Rendered canvas | Host layer stack is separate; this remains intra-image effect stack | **T** (reorder via preserved keyboard handle); S (visibility/opacity/removal) |
| IMG-13 | Masks/fades: directional/edge/centre gradients, hand-painted paint/erase mask, clear/fill | `S.zone`, `mk`, `mask` rendering, `#ov` | `S.zone`, mask canvas | Canvas2D, pointer capture | `paint-mask.png` in ZIP | Painted mask is stored separately in source state and restored before settings render | **T** (painted mask round-trip + ZIP paint-mask); S (gradient/clear/fill); some dormant `z.*` fields unreachable **L** |
| IMG-14 | Grain and vignette finish | `S.finish`, `render()` texture pass | `S.finish` | Canvas2D | Rendered canvas | Preserve in source-state render | S |
| IMG-15 | Fixed three-layer stack with rename, visibility, lock, opacity, blend, order; each layer exported separately | `defLayers()`, `layersView()`, `BMN`/`BMV` | Layer metadata in `S` | DOM, Canvas2D | Layer PNGs + manifest | Preserved inside Image source; host layer stack remains separate | **T** (opacity/order + three layer ZIP files); S (rename/visibility/lock/blend) |
| IMG-16 | Undo/redo snapshots (max 60), section reset, reset all | `hist`, `go()`, `undo`, `redo` | JSON snapshots of `S` (not source photo/name) | localStorage only for presets | In-editor state | Native history/index persisted; host undo remains separate | **T** (restore + native undo/redo after reload); S (section/reset-all) |
| IMG-17 | Piece motion presets and animated GIF export (10/12/15 fps; 360/480/600) | PCS, setPlay(), makeGif(), LZW/median-cut | S.motion, phase PH | Canvas2D, Blob, timing | GIF | Preserve specialized animation; host temporal contract can reference GIF/video proxy | **T** (native 360×360 GIF89a, 10 fps) |
| IMG-18 | PNG export; layered ZIP with `manifest.json`, `flattened.png`, `source.json`, layer PNGs, `paint-mask.png` | `expo()`, `#modal`, JSZip | `S` + current source bitmap | Canvas2D, vendored JSZip for derived page, Blob | PNG, ZIP | Strong reference for source state; manifest schema v1 is tool-specific | **T** (native PNG and ZIP contents validated) |
| IMG-19 | "Use in Generate" handoff from legacy shell | `upstream/index.html` `useAsset('image')`, direct same-origin `#cv.toDataURL` | Shell `F.img` | Same-origin iframe, Canvas2D | Data URL at preview resolution | Studio uses scoped adapter export at full resolution instead; legacy standalone shell remains preserved | **T** (full-res Studio publish/handoff); legacy low-res path **L** |
| IMG-20 | Project persistence / save-load | Studio adapter adds versioned source state; original standalone still has none | `ToolSourceStateReference` + IndexedDB | Tool bridge, IndexedDB | Editable Image source JSON + separate photo/render assets | **T** (Studio round-trip); L (standalone) |

**Image limitations to preserve deliberately (standalone baseline):** single source photo, synchronous heavy effects, legacy shell handoff at preview resolution, no standalone project persistence, undo excludes the photo and project name, no safe-zone for 1:1, no URL import, no layer reordering across effect sections. Studio adds full-resolution scoped capture, separate photo/source assets and persistence through its adapter; the standalone tool is unchanged.

---

## 2. Vector — `tools/legacy/vector/arnav.html`

Entry point: standalone `arnav.html`; embedded in legacy shell. `FlowEngine` is an IIFE with a plugin registry; state is page-local `P`, `SEL`, `HIST`, `REDO`, `res`.

| # | Source feature | Source & entry point | State owner | Required deps / browser | Output formats | Future integration consideration | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| VEC-01 | Procedural modes: Ribbons, Streamlines, Contours | `REG.mode`, `FlowEngine`, `#modes` | `P.mode`, `P.ov` | Inline JS, SVG DOM | SVG items | Preserve generator algorithms exactly; each mode is a separate maturity path | T (browser: default Ribbons + Contours switch in round-trip), R (default) |
| VEC-02 | Field plugins: Soft noise, Ridged noise, Sine interference; plugin/bake API | `REG.field`, `FlowEngine.register()`, `bake()` | `P.field`; `KIT` helpers | Inline JS | SVG paths/polygons | Do not replace with a generic noise substitute | S |
| VEC-03 | Four presets and four palettes | `PRESETS`, `PALETTES`, preset/palette handlers | `P` | DOM | SVG | Presets should be restorable source state | S |
| VEC-04 | Five canvas sizes: poster, square, phone, story, wide | `SIZES` | `P` / `res.W/H` | SVG | SVG/PNG sizes | Host artboard needs mapping; generator canvas may differ from final layer dimensions | R (1000×1414 poster) |
| VEC-05 | Composition controls: margin, top inset, clipping, seed, line opacity/fade, accent lines, glow | `SCHEMA`, `generate()` | `P` | SVG filters, random | SVG | Source-state fields; seed must round-trip for reproduction | S |
| VEC-06 | Typography: two-part title, body, sizes, position, colours, wrapping | text group in `generate()`, `wrap()`, `esc()` | `P` | SVG text, available fonts | Live SVG text | Text is not selectable/editable as objects and fonts are not embedded **L** | S |
| VEC-07 | Schema-driven controls, seed dice, randomise shape | `SCHEMA`, `build()`, `refresh()`, `#rand` | `P` | DOM | Updated SVG | Preserve schema; future inspector may expose selected source params | R (Randomise button visible), S |
| VEC-08 | Selection: click hit-test, shift-click, marquee, select all, escape | `SEL`, `hit()`, `pip()`, `dseg()`, `inRect()` | `SEL` | SVG APIs, pointer events | Selection overlay | Selection not part of exported SVG; source-state only | S |
| VEC-09 | Transforms: move, rotate, corner scale, snap, arrow nudge, numeric fields, flips, ±90°, z-order | pointer gestures, `snapMove()`, inspector | Baked item array | DOMPoint, matrix helpers | Modified SVG | Host transform is presentation-level; avoid duplicating in both models without rules | S |
| VEC-10 | Object edit and bake cycle: colour, weight, opacity, hide, make editable/back to generated | `ensureBaked()`, `OV0`, Edit tab | `HIST`/baked `res.items` | DOM | SVG | “Back to generated” history semantics must survive serialization | T (browser: Make editable, Select all, Duplicate, restored editable state), S (per-object inspector combinations) |
| VEC-11 | Undo/redo history (max 100), keyboard shortcuts | `HIST`/`REDO`, `commit()`, `jump()`, `undo()`, `redo()` | Page-local stacks | Keyboard | Baked state | Generator param changes before bake are not in history **L** | S |
| VEC-12 | Internal clipboard: copy, copy area, cut, paste, duplicate; system clipboard for SVG/JSON | `CLIP`, `copySel()`, `pasteClip()`, `navigator.clipboard` | `CLIP` + selection | Clipboard API | SVG/JSON | Copy area semantics rely on clipping; preserve | S |
| VEC-13 | SVG import: sanitise and sample paths/shapes (cap 4,000 raw / 500 samples) | `impSVG()`, `place()`, `#imp` | Baked items | DOMParser, SVG length/CTM APIs | Editable polyline items | Text/images/use/gradients/masks unsupported **L**; imported geometry is flattened | S |
| VEC-14 | Raster import: downsample to 180 px, extract nine luminance contours | `impImg()`, `fit`/`place()` | Baked items | Canvas2D, FileReader | SVG contour items | Not a photographic image layer; a stylisation at import | S |
| VEC-15 | Export SVG, export PNG (2×), copy SVG, copy/load generator JSON | `#svg`, `#png`, `#cs`, `#cj`, `#lj` | `P` + `res` | Blob, object URLs, canvas rasterisation, clipboard | SVG, PNG, JSON | SVG output is the preferred first compositable asset; JSON is generator state only, not full history | S |
| VEC-16 | “Use in Generate” shell handoff by serialising `#stage svg` | `upstream/index.html` `useAsset('vector')` | Shell `F.svg` | Same-origin iframe, XMLSerializer | SVG data URL + W/H | Adapter must strip `#ovl`, preserve viewBox; current handoff works | R (1000×1414 SVG captured; 62 items) |
| VEC-17 | Project persistence / autosave | Studio adapter (Phase 1) adds versioned source state; original standalone page still has none | `ToolSourceStateReference` + IndexedDB | Tool bridge, IndexedDB | Editable Vector source JSON | New integration feature; standalone remains a static editor | T (Studio adapter round-trip); L (standalone) |
| VEC-18 | Editing model limits: no freehand/node editing, mostly polylines (no Béziers), text not selectable, generated geometry frozen after bake | source architecture | — | — | — | Preserve as known scope; do not silently replace with a simplified vector editor | L |
| VEC-19 | External/browser requirements | inline page | — | Google Fonts; SVG DOM APIs; Blob; clipboard | — | Font embedding/offline deterministic PNG export needs a future decision | E |

---

## 3. Generate — `tools/legacy/generate/generator.html`

Entry point: standalone `generator.html`; the embedded version in the legacy shell is build-patched to accept host assets. Output is DOM/CSS inside artboard-sized containers.

| # | Source feature | Source & entry point | State owner | Required deps / browser | Output formats | Future integration consideration | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GEN-01 | Post vs carousel, one to three slides; format controls hidden when embedded | `S.fmt`, `S.slides`, `nSl()`, `#fmt`, `#slw` | `S` | DOM/CSS container queries | Live DOM preview | Host owns carousel artboards; generator receives the active artboard and keeps carousel previews | **T** (post/carousel 1–3 slide preview browser) |
| GEN-02 | Rule-based layout engine with 60-pass overlap/separation and boundary clamping | `rules()` | `S.assets` + `S.ctl` + seed | Deterministic RNG | DOM variant previews | Preserved rule engine now runs on real host layers with aspect-aware coordinates | **T** (real layers, controls, seeds, 4:5/1:1/9:16) |
| GEN-03 | Claude-assisted variant generation | `claudeVars()`, `S.mode='claude'`, `claude.use('sample')` | `S.mode`; external result | claude.ai host API | Variant geometry | Studio keeps the original Claude mode; normal-browser fallback is visible and tested | **E**; fallback **T** (browser) |
| GEN-04 | Static curated mode with three fixed presets | `FIXED`, `S.mode='static'` | `S.mode`, variant count still from controls | DOM/CSS | Variant previews | Preserved static preset mode | **T** (browser) |
| GEN-05 | Twelve creative controls: style, layout, hierarchy, density, negative space, overlap, colour, background, accents, texture, freedom, variations | `OPT`, `S.ctl`, `#ct` | `S.ctl` | DOM | Variant previews | All 12 original controls retained; host source state stores them | **T** (control presence/layout change); S (every combination) |
| GEN-06 | Four layouts plus Auto (mix): grid, centred, dynamic/asymmetrical, layered/overlap | `LAY`, `ruleVars()` | `S.ctl.layout`, seed | CSS | DOM | Four layouts + Auto; active artboard normalized space | **T** (Auto + Grid tested); S (all layout branches) |
| GEN-07 | Seed, regenerate, variant selection | `#regen`, `S.seed`, `S.sel`, `draw()` | `S` | DOM | Selected variant | Deterministic seed/regenerate; variations restore byte-identically | **T** (browser) |
| GEN-08 | Asset bin: headline, subhead, 3D sphere, photo, vector, motion ring; enable toggles; add text/image | `S.assets`, `assets()`, `#addT`, `#addI`, `#fi` | `S.assets` | FileReader, data URLs, DOM | DOM composition | Real host assets replace samples; native + Text/+ Image preserved | **T** (host asset bin); L (deletion/reorder) |
| GEN-09 | Host setup handshake: replace assets with per-slide text, vector, photo; sync controls | build-patched message listener in embedded generator | `S` + `window._init/_hi` | `postMessage` from parent | Re-rendered previews | Scoped adapter delivers active-artboard layers + thumbnails; hidden/locked policy enforced | **T** (browser) |
| GEN-10 | Six backgrounds, four textures, four accent styles | `bgHtml()`, `texHtml()`, `accHtml()` | `S.ctl` | CSS gradients, SVG feTurbulence, CSS animation | DOM | Backgrounds/accents/textures publish as PNG; editable source retained | **T** (selected treatment PNG + source); S (all combinations) |
| GEN-11 | Element renderers: head, sub, 3D sphere, image, vector, motion | `elHtml()` | Assets/S | CSS, SVG data URL | DOM | Host layers render as real thumbnails; native renderers preserved | **T** (real layer previews); L (motion is a still) |
| GEN-12 | Per-slide asset filtering in embedded patched build | build.py generator patch (`slide` filtering) | `S.assets` | postMessage setup | DOM per slide | Carousel slides remain per-slide; standalone source unchanged | **T** (carousel preview) |
| GEN-13 | Export composition spec JSON via claude.ai downloads | `#exp`, `claude.use('downloads')` | Selected variant | claude.ai host API | JSON spec | Export spec remains Claude-host-only; Studio does not invent an AI backend | **E** |
| GEN-14 | Image/vector/text asset handoff from shell | `pushGen()` in shell, generator setup listener | Shell `F` → tool `S` | Same-origin iframe messaging | Re-rendered previews | Adapter uses `ToolAdapterV1`; real Image/Vector/Type/Shapes assets arrive | **T** (pipeline) |
| GEN-15 | PNG/HTML composition export | None | — | — | Only live DOM; no visual export | Generated background/accent/texture PNG publish path added; full composition export still deferred | **T** (background PNG); L (carousel/composition export) |
| GEN-16 | Project persistence and edge-case management | None | `S` only | — | — | Versioned Generate source, reopen, Apply/undo, missing-layer recovery | **T** (browser reload/reopen/reliability); L (native asset deletion) |
| GEN-17 | Environment dependency: Google Fonts | page `<link>` | — | Network | Intended typography | Google Fonts remain an environment dependency; Canvas2D background rasterizer is font-independent | **E** |

---

## 4. Typography — `tools/typography/`

Entry points: `index.html` hub → `fonts.html` (Type Library) and `custom.html` (Custom Type). Static pages; no build step. Each page owns a page-local `S`.

### Type Library

| # | Source feature | Source & entry point | State owner | Required deps / browser | Output formats | Future integration consideration | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TYP-01 | Font catalogue: 13 system stacks + 8 bundled open-source fonts, previews and source groups | `fonts.html`; `STANDARD`, `OPEN`, `buildList()`, `row()` | Static catalogue; selected font + `S` | Canvas2D, FontFace | Live canvas | Preserve font list/credits; no search/filter exists | **T** (all catalogue rows loaded; "Fonts ready"; credits) |
| TYP-02 | Bundled font assets as base64: Barlow-TypoDesBois, Beast, Crédible, Ding Dong, Elastic, Goozette, Rami, Space Notorious Rounded | `fonts-data.js`, `fontBytes()`, `loadOne()` | `window.FONT_DATA`; each font status | FontFace, base64 | Loaded browser fonts | Eight fonts; preserve credits and licences; vendor assets in adapter build | **T** (Goozette, Rami, Elastic loaded) |
| TYP-03 | Font loading states, retry on failure, credit/licence UI | `loadAll()`, `loadOne()`, `updateCredit()`, `#credit` | `pending`, `S.fonts` statuses | FontFace, network fallback | Font credit text | Preserve inline credits; upstream has no separate licence files **L** | **T** (success + credits + failure path) |
| TYP-04 | Text, newline support, ink colour, automatic black/white preview backing, caps-only behaviour | `#text`, `#ink`, `draw()`, `shown()` | `S.text`, `S.ink` | Canvas2D | Live canvas, PNG | Include text/ink/background choice in source state | **T** (text round-trip); S (ink/multiline/color backing beyond default) |
| TYP-05 | Size 24–400 px and tracking −10…40% with recommended-range warning | `#size`, `#track`; `S`, `draw()` | `S.size`, `S.tracking` | Canvas2D letterSpacing/fallback | Live canvas | Preserve recommended ranges; no leading/alignment **L** | **T** (size/tracking round-trip) |
| TYP-06 | Synthetic weight shaping (100–900, erode/dilate), not true variable weight | `weight` slider, `draw()` | `S.weight` | Canvas2D compositing | Live canvas, PNG | Do not replace with a static font weight; it is a distinct effect | **T** (weight 600 round-trip) |
| TYP-07 | Distort edges: brush-based displacement field, strength/brush size/reset | `warp()`, pointer handlers, `#reset` | `S.field` Float32Array | Pointer events, Canvas2D | Warped canvas/PNG | Fixed canvas-space field; not automatically resized **L** | **T** (brush distortion + exact field restore + reset) |
| TYP-08 | PNG export of distorted preview | `#export-png`, `exportPng()` | Canvas + DPR | Canvas2D, Blob | PNG | Use as specialized export; include not only flattened composition | **T** (native PNG) |
| TYP-09 | UI limits: no search/filter, no custom font import, no leading/alignment, no project persistence, no OTF export | source | — | — | — | Preserve as parity boundaries; future additions must not remove existing controls | L |
| TYP-10 | Browser requirements | `fonts.js` | — | Canvas2D, FontFace, Blob, DPR | — | Network Google Fonts for UI; bundled font path is offline-capable | E |

### Custom Type

| # | Source feature | Source & entry point | State owner | Required deps / browser | Output formats | Future integration consideration | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TYP-11 | Draw pattern: freehand stroke capture, thickness, coalesced events, undo, clear | `script.js` `showStage`, pointer handlers; `#draw`; `#undo`, `#clear` | `S.strokes` | Pointer Events, Canvas2D | Internal motif sprite; PNG/OTF | Preserve stroke data for source state; undo only strokes | **T** (draw/persist); S (undo/clear) |
| TYP-12 | Image-as-pattern upload, centre fit, 10–300% scaling, remove, drawing/image layer order | `image` handling, `#img`, `#imgSize`, Drawing/Image toggle | `S.image`, `S.imageScale`, `S.imageOnTop` | FileReader, object URLs, Canvas2D | Internal motif; PNG | Image colour/alpha lost in OTF glyph outline; preserve for PNG | **T** (native upload, remove, layering) |
| TYP-13 | Pattern spacing, size, rotation, seeded per-cell rotation variation, stroke/image weight | pattern controls, `glyphInstances()`, `sprite()` | `S` | Canvas2D, deterministic hash | Internal motif; PNG/OTF | Source-state needs all pattern sliders and image | **T** (spacing/motif size/rotation/variation/weight) |
| TYP-14 | Letter setting: multiline text, size 60–400 px, tracking, stretch, slant | `script.js` layout/draw; `#text`, `#size`, `#track`, `#stretch`, `#slant` | `S` | Canvas2D, Google Fonts | Canvas, PNG, OTF | Fixed leading/alignment remain limitations **L** | **T** (text/size/tracking/stretch/slant) |
| TYP-15 | Face blending: Serif, Monospace, Script weights over sans remainder; blur/contrast pipeline | `FACES`, weight sliders, `glyphs()` | `S.weights` | Canvas2D filters, Google Fonts (DM Serif, JetBrains Mono, Pacifico) | Glyph bitmaps, PNG, OTF | Bitmap morphing, not variable-axis interpolation; exact faces required for parity | **T** (serif/mono blending); S (script in isolation) |
| TYP-16 | Legibility warnings and recommended slider ranges | `flag` logic, `#legibility`, `sliders.js` | Page-local computed flags | DOM | Warning text | Preserve ranges/warnings; not a hard restriction | **T** (warning rendered) |
| TYP-17 | PNG export at 3×, capped to 6000 px, auto-contrast background | `#export-png`, `exportPng()` | `S` | Canvas2D, Blob | PNG | Specialized export remains available | **T** (native PNG) |
| TYP-18 | OTF export: ASCII 32–126, line-segment glyphs, unitsPerEm 1000, progress | `#export-otf`, `exportOtf()`; global `opentype` | `S` + cdnjs library | opentype.js 1.3.4 CDN | OTF | No kerning/curves/Unicode beyond ASCII **L**; image becomes 1-bit dark runs **L** | **T** (OTF parsed) |
| TYP-19 | Draw/Type ARIA tabs, retained page-local state, keyboard arrows | `showStage()` | `S` | DOM | — | Adapter can expose two entry modes rather than one generic page | **T** (mode switch preserves drafts; reopen mode) |
| TYP-20 | Persistence/history limits: no save/load, no redo, no localStorage, no cross-page state | source | — | — | — | Source-state bridge required; do not claim project restore | **T** (Studio adapter); L (standalone) |
| TYP-21 | Font credits: Typothèque of ESA le 75 (SIL OFL), Fonderie Download (WTFPL), designers/years, source links; no LICENSE file in repo | `fonts.js` `SOURCES`, `#credit`; `fonts-data.js` | Static | — | In-app credit UI | Preserve credits; resolve font redistribution rights before public release | **T** (credits); licensing gap **L** |
| TYP-22 | Runtime dependencies: Google Fonts (UI and Custom Type faces), cdnjs opentype.js | HTML `<link>`/`<script>` tags | — | Network | — | Network-dependent OTF export and face blending; vendor or explicitly declare offline limits | E |

---

## 5. Shapes — `tools/shapes/`

Entry: `index.html` → `src/main.tsx` → `Studio` with `createEditor()`. React 18.3.1 + Three.js 0.170.0 + React Three Fiber 8.18.0. State is an `Editor` closure (`store.ts`) using immutable reducer edits and `useSyncExternalStore`. Output today is only the live WebGL canvas.

| # | Source feature | Source & entry point | State owner | Required deps / browser | Output formats | Future integration consideration | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| SHP-01 | Add primitives: box, sphere, plane, cone, cylinder, torus, capsule, custom mesh | `Inspector` add buttons; `reduce.ts addObject`; `shapeGeometry.ts` | `ShapeDocument.objects[]`; selection in session | React/R3F/Three, WebGL2, Canvas2D | Live WebGL | Need explicit scene serialization; do not reimplement geometry | **T** (Cube/Sphere/Torus + transparent publish in Chromium) |
| SHP-02 | Custom quad mesh starting cube | `reduce.ts` (assign `cubeMesh()`), `mesh.ts` | Document object mesh + active face | Three | Live WebGL | Required for face editing parity | **T** (Custom mesh + loop cut/extrude/inset browser) |
| SHP-03 | FBX import, merge meshes, fit/centre, name from file, undo | `Inspector` file input; `loadFbx.ts`; `triangles.ts fitTriangles` | Document triangle mesh | FBXLoader, File.arrayBuffer, WebGL | Live 3D object | Materials/UVs/animations/hierarchy discarded **L**; keep explicit | **T** (known ASCII FBX fixture unit + file-input browser); merged-geometry limits remain **L** |
| SHP-04 | Transform channels/numeric inspector with validation | `Inspector.tsx`; `reduce.ts setChannel` | Document object transform | React, DOM | Live WebGL | Host presentation transform must not overwrite 3D source transform silently | T |
| SHP-05 | Gizmo move/rotate/scale, axis handles, local frame, pointer gestures | `Viewport.tsx`; `reduce.ts` gizmo math; `model.ts localAxis` | Session `tool`/`draft`; commits to document | R3F, raycasting, pointer capture | Live WebGL | Preserve gizmo interaction inside iframe; bridge only publishes render/state | T (reducer), S (pointer UI) |
| SHP-06 | Selection, outliner, rename, active face picking | `Studio.tsx`, `Viewport.tsx`, `reduce.ts` | Session selection/activeFace | WebGL raycast, pointer events | Live WebGL | Single selection only **L**; no multi-select/grouping | S; selection semantics **T** |
| SHP-07 | Face editing: extrude, inset, loop cut (fixed parameters) | `Inspector.tsx`; `mesh.ts`; `reduce.ts modelFace` | Document quad mesh | Three | Live WebGL | No vertex/edge editing; fixed distances; active face may go stale **L** | **T** (browser loop cut, extrude, inset) |
| SHP-08 | Deformations: twist, taper, noise | `Inspector.tsx`; `deform.ts applyDeform` | Document deform object; render-time | Three geometry, normals | Live WebGL | Render-time, not baked; no bend/lattice/axis/weights | **T** (browser twist commit + source/undo tests) |
| SHP-09 | Arrays: line, radial, scatter; count ≤20; gap/radius/seed/jitter | `Inspector.tsx`; `Viewport.tsx` array group; `reduce.ts` | Document array rule | Three, deterministic noise | Visual instances only | Instances are not independent objects/exports; no instancing performance path | **T** (array rule/visual state serialized in browser) |
| SHP-10 | Remix per-instance colour/scale | `Inspector.tsx`; `Viewport.tsx`; `reduce.ts` | Document remix seed | Deterministic RNG | Visual only | Preserve deterministic look | T (state), S |
| SHP-11 | Stroke repeats along drawn ground-plane path | `Inspector.tsx` draw mode; `Viewport.tsx` stroke sampling/resampling | Document stroke points + session draft | Pointer events, Three | Visual clones | Max 40 clones; replaces previous stroke; no point editing | T (state), S (workflow) |
| SHP-12 | Duplicate, delete, rename, flip, mirror | `reduce.ts`, `Inspector.tsx`, `Studio.tsx` | Document objects + history | React | Live WebGL | Mirror clears array/stroke/remix **L**; duplicate deep-clones | T |
| SHP-13 | Shading: Toon, Flat, Ink; global mode | `Inspector.tsx`; `Viewport.tsx` materials, shell outline | Session `shade`, `inkColor` | Three materials, CanvasTexture | Live WebGL | Global not per-object; preserve exact look; transparent render needs alpha clearing | S |
| SHP-14 | Per-object colour swatches/picker | `Inspector.tsx`; `reduce.ts setColor` | Document colour | Three | Live WebGL | No alpha/gradients/textures; ink ignores colour **L** | T |
| SHP-15 | Wireframe/selection edges, gizmo toggle, three lighting presets | `Inspector.tsx`; `Viewport.tsx` | Session flags; fixed light presets | Three lights, EdgesGeometry | Live WebGL | No shadows/PBR/environment; “wireframe” only selected edges **L** | S |
| SHP-16 | Camera orbit/pan/zoom, frame-driven rig, resize | `Viewport.tsx SceneInput` | Session camera rig (not store) | R3F, pointer/wheel | View only | No focus-selected/reset/ortho/pinch; camera not undoable | **T** (camera serialize/restore/validation); S (orbit/pan pointer input) |
| SHP-17 | Undo/redo, keyboard shortcuts | `Studio.tsx`, `reduce.ts`, history in model | Undo/redo stacks | Keyboard | State | Active face not restored; no history limit/persistence | T |
| SHP-18 | Inspector tabs Object/Material/Modifiers, resizable panels, responsive overlays | `Inspector.tsx`, `Studio.tsx`, `index.css` | UI-local state | React, CSS | — | Iframe isolation means host styling won't collide; preserve internal UI | **R** (desktop + 900×700 screenshots) |
| SHP-19 | Project save/load, autosave, JSON/GLTF/OBJ export | None | — | — | None | Studio now adds versioned serialization/re-entry; standalone Shapes still has no project save/load | **T** (Studio round-trip); L (standalone) |
| SHP-20 | Render/export (PNG/transparent still/video) | None; canvas lacks `preserveDrawingBuffer` | — | — | Live WebGL only | Offscreen RGBA render target; exact-size transparent PNG verified in Chromium | **T** (dimensions, alpha, transparent corners, no selection pixels) |
| SHP-21 | Booleans / positive-negative form | `solid.ts cutSolid`, `ShapeForm`; dead/absent UI | Document form flag only | three-bvh-csg | None | CSG is unused dead code and form has no UI/effect; preserve but do not present as working **L** | T (form flag), L (booleans) |
| SHP-22 | Tests | `src/editor/{reduce,mesh,triangles}.test.ts` | Reducer/helpers | Vitest node | — | 23 unit tests now include source-state and FBX fixture; browser acceptance covers UI/WebGL | **T** |
| SHP-23 | React/runtime isolation | `package.json` React 18.3 / R3F 8 | Separate tree | WebGL2, ResizeObserver, Pointer Events | — | Independently bundled, isolated iframe; standalone route also loads | **T** (Chromium) |

**Shapes gaps that must not be mistaken for adapter work already existing:** no serialization, no render/export, no project persistence, no measurements/search/groups/visibility, no multi-select, and CSG is dead code.

---

## 6. BEND — `tools/bend/`

Entry: `src/main.tsx` → `src/app/App.tsx` (`/`, `/studio`, `/studio/edit`, `/integration`). React 19 + Zustand + PixiJS + Mediabunny. State: project/history/selection in `src/app/store.ts`; project/asset blobs in IndexedDB `src/storage/indexedDb.ts`; recipes/guides in localStorage. Schema 3. All preview, PNG and video export use the same renderer contract.

| # | Source feature | Source & entry point | State owner | Required deps / browser | Output formats | Future integration consideration | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BND-01 | Studio routes and shell; project bootstrap, topbar format/name/save status, Projects/Media, Source/Export | `App.tsx`, `EditorPage.tsx` | Zustand + IndexedDB | React, routing/pushState, Pixi | — | Isolated iframe + dedicated bridge; don't import into host runtime | R (root loaded), S (routes) |
| BND-02 | Canvas formats 4:5, 1:1, 9:16, 16:9 and duration/FPS | `EditorPage.tsx`, `types.ts`, `project.ts` | Project | DOM | Project schema | Map to host artboards/temporal metadata; BEND owns internal timeline | R (4:5 1080×1350) |
| BND-03 | Multi-file video import to V1; media library import of video/audio | `EditorPage.tsx importVideoFiles/importLibraryMedia`, `media.ts` | Project assets + layers; IndexedDB blobs | File API, Mediabunny, IndexedDB | Project + media | Use contract input assets; preserve probe/metadata behavior | S; media helpers **T** |
| BND-04 | Media library: filters/search, thumbnails, duration/usage/missing, add/replace/use as music/relink/remove | `MediaLibraryDialog.tsx`, `EditorPage.tsx`, `thumbnailService.ts` | Project + asset records | IndexedDB, hidden video, object URLs | Asset bin | Host asset store may share data but must not replace BEND's media bin semantics | S (UI), R (app loads) |
| BND-05 | Relink missing media and conservative cleanup of unused assets | `EditorPage.relinkFile`, `cleanupUnreferencedAssets` | IndexedDB | IndexedDB, File API | Restored source | Need origin-local vs host-store strategy | S |
| BND-06 | Single magnetic V1 sequence + M1 music lane; clip drag/reorder, trim, split, duplicate, delete, ripple, close gap | `SequenceTimeline.tsx`, `Timeline.tsx`, `operations.ts` | Project layers + undo | Pointer events, DOM | Timeline state | Preserve as tool-internal; host publishes temporal layer proxy | T (unit), R (First Study opened), S (editing) |
| BND-07 | Timeline zoom 100–400%, snapping, scroll sync, edit points/timecode, keyboard | `Timeline.tsx` | UI/session + project | DOM, keyboard | Project time | Preserve keyboard model inside iframe; adapter needs save/close hooks | S |
| BND-08 | Speed 0.25–4×, reverse, freeze, 2–6 point speed ramps | `timeMapping.ts`, `ClipTimingSection`, `operations.ts` | Project playback | Deterministic math | Project/export | Must map to host temporal metadata but keep full detail in source state | T (unit) |
| BND-09 | Six transitions (crossfade/dissolve, dip-black, wipe, zoom, glitch, wave distortion), overlap clamping, cleanup | `transition.ts`, `operations.ts`, inspector | Project transitions | Pixi shaders | Rendered video | Host should reference final rendered proxy; do not flatten internal transition state | T (unit), S (browser visual) |
| BND-10 | Direct canvas move/scale/rotate/crop, fit/fill, anchor, flips, snapping | `CanvasStage.tsx`, `transform.ts` | Project layer transform + keyframes | Pointer, Pixi | Rendered video/PNG | Distinguish BEND-internal layer transform from host layer transform | T (unit/helper), S (UI) |
| BND-11 | Blend modes normal/multiply/screen/add/overlay | `types.ts`, `pixiRenderer.ts` | Project layer | Pixi filter | Rendered | Host may offer broader blend set; BEND output remains authoritative in its layer | T (unit/normalization), S (visual) |
| BND-12 | Color grade: brightness/contrast/saturation/hue/temp/tint/highlights/shadows/vignette/grain/sharpen + six looks | `COLOR_GRADE_FRAGMENT`, inspector | Project color object | Pixi shader | Rendered | Source state; host must not re-grade flattened proxy | T (unit), S (visual) |
| BND-13 | Masks: rectangle, ellipse, gradient, invert/feather/rotation; animatable numeric fields | `mask.ts`, `maskTexture.ts`, inspector | Project mask | Pixi mask texture | Rendered | No pen/rotoscope **L** | T (unit), S (visual) |
| BND-14 | Wave displacement (video layers) | `waveDisplacement.ts`, shader | Project effects | Pixi shader | Rendered | Preserve order relative to temporal/crop/color/mask | T (bounds/unit), S |
| BND-15 | Safe-area guides, third grid, cover frame set/go/preview/export | `SafeAreaSettings`, `CanvasStage`, Export dialog | Project cover/settings | DOM, Pixi | Guides are edit-only; cover PNG | Guides must never be exported | R (guides visible), S (cover) |
| BND-16 | Keyframes/easing (hold/linear/ease/cubic-bezier), animation lanes, copy/paste/duplicate/delete, clip-split remap | `animation/engine.ts`, `keyframes.ts`, Timeline | Project animation | Deterministic math | Project/export | Preserve complete source state; do not compress to a few host keyframes | T (unit), S (UI) |
| BND-17 | Modulators: sine/triangle/pulse/smooth-noise/ramp, add/multiply/replace | `animation/engine.ts`, inspector | Project animation | Deterministic math | Project/export | UI exposes a subset; keep full data | T (unit) |
| BND-18 | Auto-Key (default on) and direct keyframe creation | `store.ts`, `TransformSection`, `CanvasStage` | Project + session autoKey | DOM | Project | Behavior may surprise host users; keep tool setting explicit | S |
| BND-19 | Motion recipes: six built-ins, save/import/duplicate/apply, effect remap, localStorage (up to 48) | `recipes.ts`, `storage/recipes.ts`, RecipesWorkspace | localStorage + project | localStorage | JSON recipes | Tool-local; preserve separate from Studio project | T (unit), S (UI) |
| BND-20 | Temporal effects: Motion Echo, Time Slice, Channel Delay, Frame Feedback; presets, max 8/layer | `temporal/engine.ts`, `registry.ts`, inspector | Project temporal stack | Pixi, Canvas2D; main thread | Rendered | Heavy; preview safety differs from full export; host must request full render explicitly | T (unit), S (visual) |
| BND-21 | Procedural generators: Signal Field, Liquid, Flow, Refraction; four presets each, seven palettes, seeded params | `generators/registry.ts`, shaders, liquid.ts | Project generator layer | WebGL/Pixi, deterministic seeds | Rendered/video | Keep generator documents; host layer proxy is rendered output | T (unit), R (First Study uses Refraction), S (all generators) |
| BND-22 | Seamless loop export with ping-pong mapping only for analytic procedural layers | `seamlessLoopProjectTime`, `analyzeSeamlessLoopSupport` | Project range | WebCodecs/Pixi | Video | Audio omitted; reject unsupported stacks honestly | T (unit), S (export) |
| BND-23 | Audio: clip gain/mute/fades, soundtrack loop/crossfade, waveform peaks | `soundtrack.ts`, `waveform.ts`, inspector | Project audio | Mediabunny, Web Audio decode | Mixed audio in video | Preserve full mix as specialized export | T (unit), S |
| BND-24 | Level-driven ducking (clip mix only, not speech), attack/release, master peak trim | `ducking.ts`, `exporter.ts` | Project soundtrack ducking | Web Audio, deterministic analysis | Mixed audio | No LUFS/pitch-preserve/multi-music **L** | T (unit), S (audible) |
| BND-25 | Preview quality Draft/Full, slow-overlay guard, retry, cancel, audio monitor | `CanvasStage.tsx`, store | Session + renderer | WebGL/Pixi, main thread | Preview | Heavy stacks remain main-thread; host should not run multiple live BEND instances | S |
| BND-26 | PNG current still and cover export with dimension validation | `exporter.ts`, `ExportDialog.tsx` | Project | Pixi offscreen, Canvas2D | PNG | Full resolution independent of preview; use specialized/host render as appropriate | R (UI load), S (export); upstream browser test exists |
| BND-27 | Video export MP4/H.264+AAC or WebM/VP9/VP8+Opus, range/quality, progress/cancel/validation | `exporter.ts`, `ExportDialog.tsx` | Project | Mediabunny, WebCodecs, WebGL | MP4/WebM | Environment-dependent; verify in Chromium; host bridge should clarify preview vs full quality | S; **E** by browser codec |
| BND-28 | IndexedDB project library, revisions, debounced autosave, duplicate/delete, schema migration | `indexedDb.ts`, `saveCoordinator.ts`, `ProjectLibraryDialog.tsx` | IndexedDB + Zustand | IndexedDB | Project records | Host project is separate; `.bendpkg` is the portable bridge, not shared IDB keys | R (saved locally indicator), S (flows); **T** storage helpers |
| BND-29 | `.bendpkg` portable package: custom framed archive, project + source media, SHA-256, limits, restore in fresh context | `bendPackage.ts`, `portableProject.ts`, EditorPage | IndexedDB + archive | Web Crypto, Blob | `.bendpkg` | Strong source-state transport; not encrypted; source-state reference can point at package | T (unit), S (UI import/export) |
| BND-30 | Host integration adapter and source re-entry: rendered video/poster/package, revision compare-and-set, update-post flow | `src/integration/*`, `/integration` harness | Host composition + IndexedDB | IndexedDB, export pipeline | Video, PNG poster, `.bendpkg` | Adapt to `ToolAdapterV1`; current host handoff is preview-quality video **L** | T (unit), S (deployed/browser) |
| BND-31 | Phase 8.1.1 UI refinements: sticky inspector, 44 px tabs, 24 px trim/loop handles, scroll sync, mobile Add menu, hidden-layer reorder fix | `Inspector.tsx`, `Timeline.tsx`, `global.css` | UI/session | DOM | — | Preserve; upstream browser regression tests exist but were deferred in Phase 0 | R (visual), S (regression suite) |
| BND-32 | Text/captions/subtitles/title templates, overlay/PiP video, multiple video tracks | None | — | — | — | Major scope gaps; do not invent parity | L / E |
| BND-33 | Browser/runtime requirements | Pixi WebGL, Mediabunny/WebCodecs, IndexedDB, localStorage, Web Crypto | — | — | — | Chrome/Edge MP4 path; Firefox WebM; Safari unverified; main-thread heavy export | E |
| BND-34 | Upstream automated test coverage | `tests/unit` 19 files/129 tests; maintained Playwright and deployed specs | — | Vitest, Playwright | — | Phase 0 ran unit tests + typecheck + build; maintained browser gate deferred | **T** (unit) |

**BEND deferred verification:** maintained 19-case × Chromium/Firefox browser gate, deployed suites and heavy media acceptance were not run in Phase 0. Exact commands and reasons are in [PHASE_0_REPORT.md](PHASE_0_REPORT.md#d-buildtest-results). BEND's upstream report also notes documentation drift (reported 25 vs 35+3 pass counts, stale schema/MediaRecorder claims); source is authoritative.

---

## 7. Cross-cutting shared gaps

| Gap | Impact after Phase 3 | Follow-up |
| --- | --- | --- |
| Image, Vector, Type, Shapes and Generate implement `ToolAdapterV1` | BEND still needs its dedicated adapter; the shared session, transport and project/asset engine are reused | Phase 4 adapter |
| Image/Vector/Type/Shapes/Generate have versioned source serialization/re-entry; BEND has its own schema/package | Source re-entry works for five categories without deleting existing state | BEND adapter |
| Shapes now has a transparent render/export API | Real RGBA 3D layers publish at exact artboard dimensions; final composition export is still deferred | Host compositor |
| Legacy shell handoff is direct DOM access and low resolution for Image | Studio uses scoped full-resolution exports; legacy shell remains preserved but not used for Studio composition | Keep legacy path out of Studio |
| Generate now has a background/accents/texture PNG publish path | Visually complete generated treatments publish as independent raster layers with editable source; carousel/full composition export remains deferred | Carousel/composition export |
| Typography/Generate rely on Google Fonts; Custom Type uses a vendored opentype.js | Offline/secure iframe determinism still depends on font availability; Generate's Canvas2D background renderer is font-independent | Vendor/font strategy |
| No upstream licence grants for Legacy, Shapes, Typography | Private use only until permission is obtained | Project owner |
| Old source/rendered revisions are never deleted | Safe undo/history, but IndexedDB grows over time | Reference-aware GC |
| Host has no final composition export | Single-artboard editing works; all-layer export is still deferred | Host compositor phase |
| Tools run same-origin in current deployment | Exact-origin transport is ready, but production isolation still needs a dedicated tool origin | Deployment topology |
| No host UI for multiple artboards | Store/contract support artboards; only the first/active artboard is exposed; Generate carousel previews target one host artboard | Host UI phase |
| Host undo is not persisted | Source/rendered/project data survive reload; host undo history is session-only | Project history persistence |
| Type modes have independent in-session drafts but only the active mode is durable per layer | A Type layer cannot retain both Library and Custom source variants after reload | Future dual-mode layer design |
| Image accepts three artboard aspects only | Other aspects fail explicitly rather than stretching/cropping | Future renderer mapping |
| Raster/source assets lack a reference-aware GC | Orphaned assets from cancelled/failed captures remain safe but consume space | GC phase |
| Generate z-order is stored but not applied | Host stacking order is preserved on Apply; some generated overlaps rely on source ordering | Optional ordering phase |
| Generated backgrounds are raster treatments | Background/accents/texture appearance is preserved as editable-source + raster, not reconstructed as individual vector layers | Future decorative-object editor |

## 8. How to use this matrix

1. Any change that removes or alters a row marked **T**, **R** or **S** is a regression unless explicitly re-scoped.
2. A feature may move between editors only if its output and source-state behavior remain available.
3. New adapter work adds a verification row; it does not upgrade **S** to **T** without a repeatable test.
4. Environment-limited features (**E**) must remain available when their environment exists and must fail honestly otherwise.
5. Keep specialized exports even when host composition export is implemented.

## 9. Phase 1 integration — verified

Legend references in the rows below are automated evidence from `npm test` (unit/component) and `npm run test:browser` (Chromium, 1440×900). See [PHASE_1_TEST_REPORT.md](PHASE_1_TEST_REPORT.md) for commands and screenshots.

| # | Integrated capability | Source / implementation | Verification |
| --- | --- | --- | --- |
| INT-01 | Authoritative project store: name, format, active artboard/tool, selection, layer CRUD, visibility/lock/opacity/transforms, ordering | `apps/studio/src/state/projectStore.ts` | T (7 unit tests + browser journeys) |
| INT-02 | `Artboard.layerOrder` / per-layer `order` / `project.layerOrder` reconciliation | `synchronizeLayerOrder()` | T (unit) |
| INT-03 | Host undo/redo for committed document changes | project store history, topbar/shortcut | T (unit + Journey C) |
| INT-04 | Durable project save/reload with compare-and-set revisions and schema validation | `storage/projectRepository.ts` | T (6 unit + repeated browser reloads) |
| INT-05 | IndexedDB binary assets, content hashing, dedupe, integrity verification | `storage/assetRepository.ts` | T (6 unit) |
| INT-06 | Immutable Vector source revisions + retained old assets for undo | `AssetRepository.putSourceState`, `ToolSourceStateReference.revision` | T (Journey A/B + storage tests) |
| INT-07 | Object-URL lifecycle registry | `storage/objectUrls.ts` | T (unit) |
| INT-08 | Secure iframe runtime with exact origin/sender/scope/request validation, timeouts, cancellation, stale-response rejection, listener disposal | `adapters/iframe/IframeToolAdapter.ts`, `protocol.ts` | T (12 transport checks incl. fake adapter) |
| INT-09 | Deterministic fake adapter for conformance | `tests/fixtures/fake-tool/fake-adapter.html` | T (browser) |
| INT-10 | Generated Vector integration page without modifying original source | `vite.config.ts` plugin + `adapters/vector/vectorBridge.js` | T (browser + SHA-256 source guard) |
| INT-11 | Full Vector source-state capture/restore (params, seed, colours, baked geometry, transforms, history/redo, view/selection) | bridge `serializeSourceState`/`restoreSourceState` | T (procedural + baked browser round-trips) |
| INT-12 | Fresh SVG render with overlay exclusion, native viewBox/dimensions | bridge `renderArtwork` | T (browser: `#ovl` absent, viewBox preserved) |
| INT-13 | SVG sanitization before storage/render | `adapters/vector/svgSanitizer.ts` | T (3 unit) |
| INT-14 | Publish transaction: source/render persisted and read back before layer commit | `adapters/vector/captureVectorArtwork.ts` | T (Journey A/B, storage failure) |
| INT-15 | New layer creation with recognizable name, centered aspect-preserving transform | `adapters/vector/vectorLayer.ts` | T (browser) |
| INT-16 | Re-edit and republish retain layer ID, name, transform, opacity, visibility, lock, artboard and stacking order | `applyLayerArtwork` + tests | T (Journey A/B transform; Journey C hidden/reordered republish) |
| INT-17 | Cancel an in-progress edit leaves the prior source untouched | Vector session close path | T (Journey C) |
| INT-18 | Host canvas renders sanitized SVG with aspect ratio and position/size/rotation/opacity/visibility; flip/scale fields supported | `CanvasWorkspace.tsx` | T (browser) |
| INT-19 | Layer panel select/rename/reorder/hide/lock/duplicate/delete/open source | `LayersPanel.tsx` | T (browser + components) |
| INT-20 | Inspector name/source/revision/transform/opacity/visibility/lock/Edit/Download | `InspectorPanel.tsx` | T (browser + components) |
| INT-21 | Direct move/resize with selection outline and artboard clamping | `CanvasWorkspace.tsx` | T (browser pointer test) |
| INT-22 | In-memory project New + latest-project auto-load | `useProjectPersistence.ts` | T (browser) |
| INT-23 | Failure UX: storage failure, unsupported source version, missing rendered asset, transport failures | host UI + repositories/transport | T (browser + unit) |
| INT-24 | No console errors, host overflow or broken core fonts in tested desktop workflows | Playwright console guard + layout/font checks | T (smoke) |
| INT-25 | Final multi-layer composition export | Not implemented (explicit non-goal) | L |

**Original Vector capabilities still not exhaustively exercised:** clipboard, all per-object inspector controls and edge-case path selection. Vector SVG/PNG export, native undo/redo and raster image import (Image→Vector) are now exercised by Phase 2 tests. The source remains unchanged.

## 10. Phase 2 integration — verified

Legend references below are automated evidence from `npm test` (unit/component) and `npm run test:browser` (Chromium, 1440×900 plus narrower layout checks). Full details are in [PHASE_2_TEST_REPORT.md](PHASE_2_TEST_REPORT.md).

| # | Integrated capability | Source / implementation | Verification |
| --- | --- | --- | --- |
| INT-26 | Reusable tool session: handshake, context, inputs, source restore, dirty/progress, publish/cancel/retry/error, cleanup | `adapters/session/toolSession.tsx` | **T** (Vector + Image + Type browser journeys; transport unit/browser) |
| INT-27 | Transactional publish rollback when project save fails | `projectStore.rollbackLastCommit`, `App.handlePublish` | **T** (browser failed-project-write + failed-asset-write tests) |
| INT-28 | Image source state `1.0.0`: full `S`, layers/order, mask, brush strokes, crop, history/index, view | `adapters/image/`, `imageBridge.js` | **T** (4 unit + Journey A browser; painted-mask pixel count restored) |
| INT-29 | Original photo stored as a separate source-image asset; durable source holds only asset reference | `captureImageArtwork.ts` | **T** (source JSON inspected; photo bytes survive reopen) |
| INT-30 | Restore waits for photo decode and bypasses the file-import reset path | `imageBridge.restoreSourceState` | **T** (settings/mask/history after reload) |
| INT-31 | Full-resolution Image publish at exact 1080×1350 / 1080×1080 / 1080×1920 | bridge `renderArtwork` + PNG IHDR validation | **T** (4:5 and 9:16 host publishes; native 9:16 PNG) |
| INT-32 | Publish excludes editor overlays/guides/selection; unsupported aspects fail clearly | bridge temp canvas + exact-dimension check | **T** (browser + unit) |
| INT-33 | Host raster layers: intrinsic aspect, alpha, transforms, rotation, opacity, blend, clipping, missing-asset state | `CanvasWorkspace.tsx`, object-URL registry | **T** (mixed-layer browser; alpha scan; reload) |
| INT-34 | Image republish updates same layer and preserves host transform/order; cancel preserves prior revision | adapter commit path | **T** (Journey A) |
| INT-35 | Native Image PNG, layered ZIP and animated GIF exports | preserved `expo()`/`makeGif()` + vendored JSZip | **T** (native-exports browser) |
| INT-36 | Image→Vector traced derivative with provenance; original Image untouched; explicit conversion UI | `vectorBridge.receiveInputAssets`, native `impFile` | **T** (Journey B) |
| INT-37 | Type Library source `1.0.0`: font identity, controls, full sparse distortion field | generated closure bridge | **T** (4 unit + Journey C; exact canvas data URL) |
| INT-38 | Font wait/credits/failure/reset behavior | `loadOne`, `document.fonts.ready`, reset field | **T** (browser success/failure/reset) |
| INT-39 | Type Library transparent shared PNG; native PNG preserved | bridge `renderArtwork`; original export | **T** (mixed alpha scan + native export) |
| INT-40 | Custom Type source `1.0.0`: strokes, motif image bytes/placement, layering, all controls, stage | generated closure bridge | **T** (4 unit + Journey D; exact canvas) |
| INT-41 | Native Custom Type motif upload/remove/layer order, PNG and OTF | preserved controls + vendored opentype.js | **T** (Journey D + OTF parse) |
| INT-42 | Image→Custom Type motif derivative; original Image untouched; native direct upload still possible | Custom Type `assets/input` + host handoff | **T** (Journey E) |
| INT-43 | Type mode switch preserves both unsaved drafts in session; reopen returns to published mode | `TypeEditor.tsx` serialize/stash + tags | **T** (browser mode-switch + Journey D) |
| INT-44 | Type publishing never overwrites native font/pattern size with host artboard format | host fits raster layer; Type source untouched | **T** (Journey C/D, mixed-layer) |
| INT-45 | Mixed opaque Image + Vector + transparent Type layers stay separate and reorderable | host layer stack + raster renderer | **T** (mixed-layer browser alpha/order/drag/opacity/reload) |
| INT-46 | Derivative provenance for cross-tool layers | `SharedLayer.provenance` | **T** (Journey B/E) |
| INT-47 | Failure paths: missing photo, font load, render, asset write, project write, unsupported version, cancel | adapters + host rollback | **T** (six reliability browser tests) |
| INT-48 | Source integrity for Image/Vector/Typography originals | SHA-256 guards + empty `git diff` | **T** (3 unit tests) |
| INT-49 | Desktop + narrower layouts without host overflow or hidden essential controls | responsive host session/iframe layout | **T** (layout browser at 1024×768 and 900×700) |
| INT-50 | Final multi-layer composition export | Not implemented | L |

## 11. Phase 3 integration — verified

Legend references below are automated evidence from `npm test` / `npm run test:browser`
(Chromium 1440×900, plus 900×700 compact sessions) and the retained Shapes
build/unit commands. Full command output and screenshots are in
[PHASE_3_TEST_REPORT.md](PHASE_3_TEST_REPORT.md).

| # | Integrated capability | Source / implementation | Verification |
| --- | --- | --- | --- |
| INT-51 | Independently bundled React 18/R3F Shapes app served under `/tools/shapes/`; production build copies JS/CSS/chunks/fonts | `tools/shapes/vite.config.ts`, `apps/studio/vite.config.ts`, root scripts/CI | **T** (build + standalone + isolated iframe Chromium) |
| INT-52 | Scoped Shapes adapter with capability/limitation reporting, context, dirty events, close | `tools/shapes/src/studioBridge.ts` | **T** (browser sessions) |
| INT-53 | Complete Shapes source schema `1.0.0`: objects/IDs, meshes/triangles, transforms/colors, deformations, arrays, strokes, shading/lighting, selection/tool, camera, bounded history, next serial | `tools/shapes/src/editor/sourceState.ts`, `store.ts` | **T** (4 unit + browser round-trip/republish) |
| INT-54 | Host+bridge validation of finite values, identities, geometry limits, camera and version before applying | `adapters/shapes/shapesSourceState.ts`, bridge `restoreSourceState` | **T** (4 host unit + browser unsupported-version test) |
| INT-55 | Transparent Shapes render via offscreen RGBA render target, 2× downsample, exact artboard dimensions, valid alpha/empty pixels, no grid/gizmo/selection/draft | `tools/shapes/src/editor/renderScene.ts` | **T** (1080×1350 PNG; alpha/corners/no blue selection pixels) |
| INT-56 | Render failure/empty scene leaves previous layer/source revision untouched | capture transaction + bridge errors | **T** (browser failure test) |
| INT-57 | Shapes publish/reopen/republish; same layer ID, host transform/order/opacity preserved; native undo/redo after restore | `ShapesEditor.tsx`, `captureShapesArtwork.ts`, `toolSession.tsx` | **T** (browser smoke + unit) |
| INT-58 | Shapes primitives, custom mesh, loop cut/extrude/inset, deformation, arrays, duplication, colors, camera, FBX fixture | preserved UI + host serialization | **T** (browser geometry/FBX; pointer gizmo/stroke remain S) |
| INT-59 | Shapes → Image derivative with provenance; original 3D source unchanged | `InspectorPanel` + `App.startHandoff` + `loadRasterInputForLayer` | **T** (pipeline browser) |
| INT-60 | Generate derived page keeps byte-identical source plus original rule engine, presets, 12 controls, carousel, seed/regenerate and Claude fallback | `generateBridge.js`, `apps/studio/vite.config.ts` | **T** (controls browser; Claude is E) |
| INT-61 | Generate receives real active-artboard Image/Vector/Type/Shapes layers with stable host IDs and thumbnails; hidden excluded; locked marked | `loadGenerateInputs.ts`, bridge `assets/input` | **T** (real-layer + hidden/locked browser) |
| INT-62 | Aspect-aware 100-wide normalized layout for 4:5, 1:1, 9:16; authored asset aspect preserved | bridge `frameHeight` + `adaptPlacementsToArtboard` | **T** (ratios and frame heights browser) |
| INT-63 | Apply layout as one undoable host action; position/size/rotation only; source documents unchanged; locked/hidden skipped | `projectStore.applyGeneratedLayout`, `GenerateEditor.tsx` | **T** (browser + 11 store unit tests) |
| INT-64 | Generate source schema `1.0.0`; restore controls/seed/variations/selected/host mapping/background settings; no silent host apply | `generateSourceState.ts`, bridge | **T** (reload/reopen variations equality) |
| INT-65 | Missing/stale source layers warning + regenerate from current layers; no silent ID remap | bridge banner + host validation | **T** (browser reliability) |
| INT-66 | Generated background/accents/texture PNG at exact artboard size; independent bottom layer; editable Generate source | `captureGenerateArtwork.ts`, bridge Canvas2D renderer | **T** (1080×1350 PNG + source + reorder/reopen) |
| INT-67 | Mixed Image + Vector + Type + Shapes composition with Generate arrangement; reload restores all six layers and all five source editors | host layer stack + sessions | **T** (pipeline browser) |
| INT-68 | Phase 2 native PNG/ZIP/GIF/SVG/OTF exports and Image/Vector/Type workflows remain intact | preserved sources + adapters | **T** (retained Phase 2 browser suite) |
| INT-69 | Standalone legacy Generate and Shapes still load without Studio boot | preserved source + independent bundle | **T** (Chromium smoke) |
| INT-70 | Final multi-layer/carousel composition export and Generate z-order application | Not implemented in this phase | L |

## 12. Phase 4 integration � verified

Legend references below are automated evidence from `npm test` / `npm run test:browser`,
BEND's preserved typecheck/unit/build/browser commands, and the production nested-route
Playwright config. Full output is in [PHASE_4_TEST_REPORT.md](PHASE_4_TEST_REPORT.md).

| # | Integrated capability | Source / implementation | Verification |
| --- | --- | --- | --- |
| BND-35 | Complete preserved BEND editor runs from Studio at `/tools/bend/` in dev and production | `tools/bend`, `BendEditor.tsx`, nested Studio Vite plugin, `BEND_BASE` | **T** (full UI + timeline browser; production nested route) |
| BND-36 | Base-aware BEND routing without breaking standalone root deployment | `tools/bend/src/app/App.tsx` | **T** (standalone + nested production smoke) |
| BND-37 | Scoped `ToolAdapterV1` handshake/context/input/restore/render/cancel/close plus dedicated publish controller | `studioBridge.tsx`, `IframeToolAdapter`, shared protocol | **T** (Studio browser + transport suite) |
| BND-38 | Full editable source reference to a real `.bendpkg` with media integrity, project/source revision, canvas/duration/fps and host metadata | `bendSourceState.ts`, `captureBendArtwork.ts`, `studioSession.ts` | **T** (browser round-trip; unit parse/reject tests) |
| BND-39 | Package completeness/missing-media/source-hash validation before commit | `bendPackage.ts`, BEND conformance/package decoder | **T** (4 host unit tests + corrupt package browser) |
| BND-40 | Real video + full-canvas PNG cover + editable package publication as one video layer | `captureBendArtwork.ts`, `createBendVideoLayer` | **T** (browser: decodable video, poster dims, package magic/manifest) |
| BND-41 | Honest preview (720 px) vs final (full canvas) selection; no upsampling claim | `BendEditor` quality control, `studioPublish.ts`, host metadata validation | **T** (preview and final manual/automated metadata; unit publish rules) |
| BND-42 | Same-origin bounded artifact handoff with size/hash verification and explicit release | `studioPublish.ts`, `captureBendArtwork.ts`, `bend/publish/ack` | **T** (browser publish/re-entry; no large blob postMessage) |
| BND-43 | Host temporal layer with cover, poster, playable video, duration/fps/codec/audio metadata | `SharedLayer.poster`, `TemporalMetadata`, `CanvasWorkspace` | **T** (host playback `currentTime > 0`, muted default, pixel/duration checks) |
| BND-44 | Single-player mute policy and persisted mute/playback controls | `CanvasWorkspace` global play event, inspector/project store | **T** (browser playback/mute persistence) |
| BND-45 | Edit in BEND restores original timeline/effects/audio, retains layer ID/transform/opacity/visibility/order on republish | `BendEditor`, `captureBendArtwork.guard`, `applyLayerArtwork` | **T** (browser save/reload/edit/republish, same layer id) |
| BND-46 | Stale/cross-tab revision rejection without overwriting newer artwork | `App.handlePublish` durable revision check, bridge source-version check | **T** (browser forged durable revision) |
| BND-47 | Cancel/failure/corrupt package/missing media preserve prior committed video/poster/package | capture transaction + BEND temp cleanup + host guard | **T** (browser cancel/corrupt; package unit failures; missing-media decoder) |
| BND-48 | Static Studio artwork ? real editable BEND video clip at exact artboard size; sources unchanged; derivative provenance | `staticToVideo.ts`, `AnimateInBendDialog`, bridge media import | **T** (published Vector source; real BEND clip/asset; derivative layer; source hash unchanged) |
| BND-49 | Explicit static-handoff background treatment; no false alpha claim | handoff dialog + encoder metadata | **T** (dialog options; encoded clip metadata) |
| BND-50 | Explicit fit/reformat decision for mismatched BEND/Studio aspect | `BendEditor` gate + bridge restore policy | **T** (1:1 project on 4:5 artboard fit decision) |
| BND-51 | Native `.bendpkg` import/export, package restoration and BEND native still/video export remain available | preserved BEND UI/export/package pipeline | **T** (BEND browser 35 pass; Studio package decode/restore) |
| BND-52 | Audio/source/video streams reported honestly; validated audio fixture and soundtrack package | preserved BEND mixer/exporter + host metadata | **T** (audio fixture browser: `audioPresent`, video+audio package, decode/playback) |
| BND-53 | No duplicate temporary BEND projects on re-entry; conservative cleanup protects standalone projects | `studioSession.ts`, `cleanupUnreferencedAssets` | **T** (deterministic temp IDs unit; re-entry browser) |
| BND-54 | Final Studio multi-layer composition, synchronized multi-video/audio, carousel export, asset GC, persistent host undo | Not implemented (explicit non-goals) | L |
