# Feature Parity Matrix — Studio 2.0

**Baseline date:** 2026-10-26  
**Baseline commits:** see [SOURCE_MANIFEST.md](SOURCE_MANIFEST.md)  
**Purpose:** the non-regression contract for future phases. It records what exists, not what is planned.

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
| IMG-01 | Photo import: file picker, drag/drop, image clipboard paste | `loadFile()`, `#file`, `#drop`, paste listener | Source photo outside `S`; filename sets header | Canvas2D, FileReader, Clipboard API | In-editor source bitmap | Store original as an input asset; source image is not covered by undo | S |
| IMG-02 | Square/portrait/story preview formats, zoom, safe-zone guides | `dims()`, `zoomF`/`fitSc`, UI-zone overlay | `S.frame`, `S.zone`; zoom is view state | DOM, Canvas2D | Live preview | Tools receive the host artboard; avoid conflicting format ownership | R (4:5 loaded, 600×750), S (zoom/zones) |
| IMG-03 | 4:5, 1:1 and 9:16 export sizing to 1080 short edge | `dims(1)`, `expo()` | `S` | Canvas2D | 1080×1350 / 1080×1080 / 1080×1920 PNG | Replace shell's low-res capture with this export path | S |
| IMG-04 | Eight built-in looks (Dreamy sunset, Neon night, Faded polaroid, Moody film, Pastel haze, Speed rush, Fading to dust, No effects) | `LOOKS`, `look()`, `#ls` | `S` sections/order; frame preserved | Canvas2D, Google Fonts | Rendered canvas | Map to source-state presets; don't flatten on integration | S |
| IMG-05 | Saved looks with thumbnails and delete | `#ps`, `PR`, `localStorage['bd_presets']` | Browser localStorage | localStorage, Canvas2D | Local presets | Migrate into project-scoped presets or preserve as local user library | S |
| IMG-06 | Prompt-based look generation, shuffle, idea chips | `gen()`, `applyGen()`, `RULES`, `localGen()`, `#gi`, `#sh` | `S` | DOM regex local fallback; optional `window.claude` sampling | Updated effect controls | Local rule engine can be preserved as an in-tool assistant; Claude path optional | S |
| IMG-07 | Colour: Original/B&W/Sepia/Duotone, brightness, contrast, saturation, posterize, duotone swatches | `colorPass()`, `PAL`, `c1`/`c2` | `S` | Canvas2D | Rendered canvas | Source-state fields map directly; preserve exact grading math | S |
| IMG-08 | Cover-fit framing and pan/zoom | `S.frame`, `render()`, Edit tab | `S.frame` | Canvas2D, pointer events | Rendered canvas | Frame should become layer crop/transform or stay source-editor state | S |
| IMG-09 | Pattern treatments: Cross-stitch, Pixels, Dots, Beads, Lines, Knit, Letters, Glass + palettes/yarn limits | `medium()`, `#cats`, Pattern controls | `S.medium` | Canvas2D, optional JSZip only for export | Rendered canvas; layer exports | Preserve as source state; rendered flat output as composition asset | R (Cross-stitch visible), S (controls) |
| IMG-10 | Trace treatments: Paper layers, Contours, Waveform, Stipple | `traceFx()`, `tPaper`/`tContour`/`tWave`/`tStipple` | `S.trace` | Canvas2D | Rendered canvas | Heavy synchronous CPU work; consider preview quality at integration | S |
| IMG-11 | Blur treatments: Soft, Smudge, Motion, Zoom, Blast, Wave, Glitch; smudge stroke brush, paint/erase mask brush | `blur()`, `smudge()`, `dab()`, `S.blur.strokes` | `S.blur`, pointer strokes | Pointer events, Canvas2D | Rendered canvas | Preserve pointer strokes; do not replace with simplified CSS filters | S |
| IMG-12 | Effect stack with drag reorder, per-effect visibility, opacity and removal | `S.order`, `buildStack()`, `build()` | `S.order`, section states | DOM drag, keyboard arrows | Rendered canvas | Host layer stack is separate; this remains intra-image effect stack | S |
| IMG-13 | Masks/fades: directional/edge/centre gradients, hand-painted paint/erase mask, clear/fill | `S.zone`, `mk`, `mask` rendering, `#ov` | `S.zone`, mask canvas | Canvas2D, pointer capture | `paint-mask.png` in ZIP | Map to host mask only if semantics allow; otherwise keep in source state | S; some dormant `z.*` fields are unreachable **L** |
| IMG-14 | Grain and vignette finish | `S.finish`, `render()` texture pass | `S.finish` | Canvas2D | Rendered canvas | Preserve in source-state render | S |
| IMG-15 | Fixed three-layer stack with rename, visibility, lock, opacity, blend, order; each layer exported separately | `defLayers()`, `layersView()`, `BMN`/`BMV` | Layer metadata in `S` | DOM, Canvas2D | Layer PNGs + manifest | Host layer stack can either import these as a group or preserve them inside image source state | S |
| IMG-16 | Undo/redo snapshots (max 60), section reset, reset all | `hist`, `go()`, `undo`, `redo` | JSON snapshots of `S` (not source photo/name) | localStorage only for presets | In-editor state | Source-state adapter must define checkpoints; host undo must not fight tool history | S |
| IMG-17 | Piece motion presets and animated GIF export (10/12/15 fps; 360/480/600) | `PCS`, `setPlay()`, `makeGif()`, LZW/median-cut | `S.motion`, phase `PH` | Canvas2D, Blob, timing | GIF | Preserve specialized animation; host temporal contract can reference GIF/video proxy | S |
| IMG-18 | PNG export; layered ZIP with `manifest.json`, `flattened.png`, `source.json`, layer PNGs, `paint-mask.png` | `expo()`, `#modal`, JSZip | `S` + current source bitmap | Canvas2D, JSZip CDN, Blob | PNG, ZIP | Strong reference for source state; manifest schema v1 is tool-specific | S; ZIP requires JSZip to load **E/L** |
| IMG-19 | “Use in Generate” handoff from legacy shell | `upstream/index.html` `useAsset('image')`, direct same-origin `#cv.toDataURL` | Shell `F.img` | Same-origin iframe, Canvas2D | Data URL at preview resolution | Must be replaced by scripted adapter capture at export resolution; current handoff is 600×750, not 1080 **L** | R (captured 600×750 in combined flow) |
| IMG-20 | Project persistence / save-load | None | Only saved Looks in localStorage | — | — | Source state and input image need explicit host storage; no full project save exists | L |

**Image limitations to preserve deliberately:** single source photo, synchronous heavy effects, low-res shell handoff, no project persistence, undo excludes the photo and project name, no safe-zone for 1:1, no URL import, no layer reordering across effect sections.

---

## 2. Vector — `tools/legacy/vector/arnav.html`

Entry point: standalone `arnav.html`; embedded in legacy shell. `FlowEngine` is an IIFE with a plugin registry; state is page-local `P`, `SEL`, `HIST`, `REDO`, `res`.

| # | Source feature | Source & entry point | State owner | Required deps / browser | Output formats | Future integration consideration | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| VEC-01 | Procedural modes: Ribbons, Streamlines, Contours | `REG.mode`, `FlowEngine`, `#modes` | `P.mode`, `P.ov` | Inline JS, SVG DOM | SVG items | Preserve generator algorithms exactly; each mode is a separate maturity path | R (default Ribbons generated 62 items), S (mode switching) |
| VEC-02 | Field plugins: Soft noise, Ridged noise, Sine interference; plugin/bake API | `REG.field`, `FlowEngine.register()`, `bake()` | `P.field`; `KIT` helpers | Inline JS | SVG paths/polygons | Do not replace with a generic noise substitute | S |
| VEC-03 | Four presets and four palettes | `PRESETS`, `PALETTES`, preset/palette handlers | `P` | DOM | SVG | Presets should be restorable source state | S |
| VEC-04 | Five canvas sizes: poster, square, phone, story, wide | `SIZES` | `P` / `res.W/H` | SVG | SVG/PNG sizes | Host artboard needs mapping; generator canvas may differ from final layer dimensions | R (1000×1414 poster) |
| VEC-05 | Composition controls: margin, top inset, clipping, seed, line opacity/fade, accent lines, glow | `SCHEMA`, `generate()` | `P` | SVG filters, random | SVG | Source-state fields; seed must round-trip for reproduction | S |
| VEC-06 | Typography: two-part title, body, sizes, position, colours, wrapping | text group in `generate()`, `wrap()`, `esc()` | `P` | SVG text, available fonts | Live SVG text | Text is not selectable/editable as objects and fonts are not embedded **L** | S |
| VEC-07 | Schema-driven controls, seed dice, randomise shape | `SCHEMA`, `build()`, `refresh()`, `#rand` | `P` | DOM | Updated SVG | Preserve schema; future inspector may expose selected source params | R (Randomise button visible), S |
| VEC-08 | Selection: click hit-test, shift-click, marquee, select all, escape | `SEL`, `hit()`, `pip()`, `dseg()`, `inRect()` | `SEL` | SVG APIs, pointer events | Selection overlay | Selection not part of exported SVG; source-state only | S |
| VEC-09 | Transforms: move, rotate, corner scale, snap, arrow nudge, numeric fields, flips, ±90°, z-order | pointer gestures, `snapMove()`, inspector | Baked item array | DOMPoint, matrix helpers | Modified SVG | Host transform is presentation-level; avoid duplicating in both models without rules | S |
| VEC-10 | Object edit and bake cycle: colour, weight, opacity, hide, make editable/back to generated | `ensureBaked()`, `OV0`, Edit tab | `HIST`/baked `res.items` | DOM | SVG | “Back to generated” history semantics must survive serialization | S |
| VEC-11 | Undo/redo history (max 100), keyboard shortcuts | `HIST`/`REDO`, `commit()`, `jump()`, `undo()`, `redo()` | Page-local stacks | Keyboard | Baked state | Generator param changes before bake are not in history **L** | S |
| VEC-12 | Internal clipboard: copy, copy area, cut, paste, duplicate; system clipboard for SVG/JSON | `CLIP`, `copySel()`, `pasteClip()`, `navigator.clipboard` | `CLIP` + selection | Clipboard API | SVG/JSON | Copy area semantics rely on clipping; preserve | S |
| VEC-13 | SVG import: sanitise and sample paths/shapes (cap 4,000 raw / 500 samples) | `impSVG()`, `place()`, `#imp` | Baked items | DOMParser, SVG length/CTM APIs | Editable polyline items | Text/images/use/gradients/masks unsupported **L**; imported geometry is flattened | S |
| VEC-14 | Raster import: downsample to 180 px, extract nine luminance contours | `impImg()`, `fit`/`place()` | Baked items | Canvas2D, FileReader | SVG contour items | Not a photographic image layer; a stylisation at import | S |
| VEC-15 | Export SVG, export PNG (2×), copy SVG, copy/load generator JSON | `#svg`, `#png`, `#cs`, `#cj`, `#lj` | `P` + `res` | Blob, object URLs, canvas rasterisation, clipboard | SVG, PNG, JSON | SVG output is the preferred first compositable asset; JSON is generator state only, not full history | S |
| VEC-16 | “Use in Generate” shell handoff by serialising `#stage svg` | `upstream/index.html` `useAsset('vector')` | Shell `F.svg` | Same-origin iframe, XMLSerializer | SVG data URL + W/H | Adapter must strip `#ovl`, preserve viewBox; current handoff works | R (1000×1414 SVG captured; 62 items) |
| VEC-17 | Project persistence / autosave | None | — | — | — | Must build serialization for source re-entry; shell handoff is not restorable state | L |
| VEC-18 | Editing model limits: no freehand/node editing, mostly polylines (no Béziers), text not selectable, generated geometry frozen after bake | source architecture | — | — | — | Preserve as known scope; do not silently replace with a simplified vector editor | L |
| VEC-19 | External/browser requirements | inline page | — | Google Fonts; SVG DOM APIs; Blob; clipboard | — | Font embedding/offline deterministic PNG export needs a future decision | E |

---

## 3. Generate — `tools/legacy/generate/generator.html`

Entry point: standalone `generator.html`; the embedded version in the legacy shell is build-patched to accept host assets. Output is DOM/CSS inside artboard-sized containers.

| # | Source feature | Source & entry point | State owner | Required deps / browser | Output formats | Future integration consideration | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GEN-01 | Post vs carousel, one to three slides; format controls hidden when embedded | `S.fmt`, `S.slides`, `nSl()`, `#fmt`, `#slw` | `S` | DOM/CSS container queries | Live DOM preview | Host owns carousel artboards; generator should receive them via adapter context | S |
| GEN-02 | Rule-based layout engine with 60-pass overlap/separation and boundary clamping | `rules()` | `S.assets` + `S.ctl` + seed | Deterministic RNG | DOM variant previews | Fast local baseline; preserve algorithm rather than replace with host layout | R (three alternatives rendered) |
| GEN-03 | Claude-assisted variant generation | `claudeVars()`, `S.mode='claude'`, `claude.use('sample')` | `S.mode`; external result | claude.ai host API | Variant geometry | Not available in a normal browser; keep optional/explicit | E; falls back to rules **S** |
| GEN-04 | Static curated mode with three fixed presets | `FIXED`, `S.mode='static'` | `S.mode`, variant count still from controls | DOM/CSS | Variant previews | Preserve as deterministic sample mode | S |
| GEN-05 | Twelve creative controls: style, layout, hierarchy, density, negative space, overlap, colour, background, accents, texture, freedom, variations | `OPT`, `S.ctl`, `#ct` | `S.ctl` | DOM | Variant previews | Host can expose as source-state inspector later; do not flatten to presets only | R (controls rendered), S |
| GEN-06 | Four layouts plus Auto (mix): grid, centred, dynamic/asymmetrical, layered/overlap | `LAY`, `ruleVars()` | `S.ctl.layout`, seed | CSS | DOM | Must map to carousel slides and safe areas | R (Auto mix generated), S |
| GEN-07 | Seed, regenerate, variant selection | `#regen`, `S.seed`, `S.sel`, `draw()` | `S` | DOM | Selected variant | Seed is essential for reproducible source state | R (selected variant visible), S (regenerate) |
| GEN-08 | Asset bin: headline, subhead, 3D sphere, photo, vector, motion ring; enable toggles; add text/image | `S.assets`, `assets()`, `#addT`, `#addI`, `#fi` | `S.assets` | FileReader, data URLs, DOM | DOM composition | Asset deletion/reordering/per-asset slide badges are absent **L** | R (asset UI visible), S (mutations) |
| GEN-09 | Host setup handshake: replace assets with per-slide text, vector, photo; sync controls | build-patched message listener in embedded generator | `S` + `window._init/_hi` | `postMessage` from parent | Re-rendered previews | Replace wildcard `postMessage`/ad-hoc setup with scoped adapter messaging | R (host setup populated text + SVG; no photo supplied) |
| GEN-10 | Six backgrounds, four textures, four accent styles | `bgHtml()`, `texHtml()`, `accHtml()` | `S.ctl` | CSS gradients, SVG feTurbulence, CSS animation | DOM | Some effects are CSS-only; host rasterisation must capture them faithfully | S |
| GEN-11 | Element renderers: head, sub, 3D sphere, image, vector, motion | `elHtml()` | Assets/S | CSS, SVG data URL | DOM | Sphere/motion are CSS approximations, not true 3D/video **L** | S |
| GEN-12 | Per-slide asset filtering in embedded patched build | build.py generator patch (`slide` filtering) | `S.assets` | postMessage setup | DOM per slide | Preserve patch behavior; standalone `generator.html` is unpatched | R (setup post received; slides varied) |
| GEN-13 | Export composition spec JSON via claude.ai downloads | `#exp`, `claude.use('downloads')` | Selected variant | claude.ai host API | JSON spec | No normal-browser fallback **E/L** | E |
| GEN-14 | Image/vector/text asset handoff from shell | `pushGen()` in shell, generator setup listener | Shell `F` → tool `S` | Same-origin iframe messaging | Re-rendered previews | Studio adapter should use contracts rather than legacy setup message | R (vector captured; text/slides rendered) |
| GEN-15 | PNG/HTML composition export | None | — | — | Only live DOM; no visual export | Host must render/capture or generator needs an export path; do not claim parity | L |
| GEN-16 | Project persistence and edge-case management | None | `S` only | — | — | No save/load; asset list replaced on setup; no deletion/reorder; no per-asset slide UI | L |
| GEN-17 | Environment dependency: Google Fonts | page `<link>` | — | Network | Intended typography | Vendor/pin fonts for deterministic offline export | E; page loaded online **R** |

---

## 4. Typography — `tools/typography/`

Entry points: `index.html` hub → `fonts.html` (Type Library) and `custom.html` (Custom Type). Static pages; no build step. Each page owns a page-local `S`.

### Type Library

| # | Source feature | Source & entry point | State owner | Required deps / browser | Output formats | Future integration consideration | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TYP-01 | Font catalogue: 13 system stacks + 8 bundled open-source fonts, previews and source groups | `fonts.html`; `STANDARD`, `OPEN`, `buildList()`, `row()` | Static catalogue; selected font + `S` | Canvas2D, FontFace | Live canvas | Preserve font list/credits; no search/filter exists | R (21 fonts + Custom Type link; “Fonts ready”) |
| TYP-02 | Bundled font assets as base64: Barlow-TypoDesBois, Beast, Crédible, Ding Dong, Elastic, Goozette, Rami, Space Notorious Rounded | `fonts-data.js`, `fontBytes()`, `loadOne()` | `window.FONT_DATA`; each font status | FontFace, base64 | Loaded browser fonts | Eight fonts; preserve credits and licences; vendor assets in adapter build | R (all eight font faces loaded; 8 keys) |
| TYP-03 | Font loading states, retry on failure, credit/licence UI | `loadAll()`, `loadOne()`, `updateCredit()`, `#credit` | `pending`, `S.fonts` statuses | FontFace, network fallback | Font credit text | Preserve inline credits; upstream has no separate licence files **L** | R (loaded); S (failure path) |
| TYP-04 | Text, newline support, ink colour, automatic black/white preview backing, caps-only behaviour | `#text`, `#ink`, `draw()`, `shown()` | `S.text`, `S.ink` | Canvas2D | Live canvas, PNG | Include text/ink/background choice in source state | R (text rendered) |
| TYP-05 | Size 24–400 px and tracking −10…40% with recommended-range warning | `#size`, `#track`; `S`, `draw()` | `S.size`, `S.tracking` | Canvas2D letterSpacing/fallback | Live canvas | Preserve recommended ranges; no leading/alignment **L** | S |
| TYP-06 | Synthetic weight shaping (100–900, erode/dilate), not true variable weight | `weight` slider, `draw()` | `S.weight` | Canvas2D compositing | Live canvas, PNG | Do not replace with a static font weight; it is a distinct effect | S |
| TYP-07 | Distort edges: brush-based displacement field, strength/brush size/reset | `warp()`, pointer handlers, `#reset` | `S.field` Float32Array | Pointer events, Canvas2D | Warped canvas/PNG | Fixed canvas-space field; not automatically resized **L** | S |
| TYP-08 | PNG export of distorted preview | `#export-png`, `exportPng()` | Canvas + DPR | Canvas2D, Blob | PNG | Use as specialized export; include not only flattened composition | S |
| TYP-09 | UI limits: no search/filter, no custom font import, no leading/alignment, no project persistence, no OTF export | source | — | — | — | Preserve as parity boundaries; future additions must not remove existing controls | L |
| TYP-10 | Browser requirements | `fonts.js` | — | Canvas2D, FontFace, Blob, DPR | — | Network Google Fonts for UI; bundled font path is offline-capable | E |

### Custom Type

| # | Source feature | Source & entry point | State owner | Required deps / browser | Output formats | Future integration consideration | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TYP-11 | Draw pattern: freehand stroke capture, thickness, coalesced events, undo, clear | `script.js` `showStage`, pointer handlers; `#draw`; `#undo`, `#clear` | `S.strokes` | Pointer Events, Canvas2D | Internal motif sprite; PNG/OTF | Preserve stroke data for source state; undo only strokes | R (Draw stage loaded), S (strokes) |
| TYP-12 | Image-as-pattern upload, centre fit, 10–300% scaling, remove, drawing/image layer order | `image` handling, `#img`, `#imgSize`, Drawing/Image toggle | `S.image`, `S.imageScale`, `S.imageOnTop` | FileReader, object URLs, Canvas2D | Internal motif; PNG | Image colour/alpha lost in OTF glyph outline; preserve for PNG | S |
| TYP-13 | Pattern spacing, size, rotation, seeded per-cell rotation variation, stroke/image weight | pattern controls, `glyphInstances()`, `sprite()` | `S` | Canvas2D, deterministic hash | Internal motif; PNG/OTF | Source-state needs all pattern sliders and image | S |
| TYP-14 | Letter setting: multiline text, size 60–400 px, tracking, stretch, slant | `script.js` layout/draw; `#text`, `#size`, `#track`, `#stretch`, `#slant` | `S` | Canvas2D, Google Fonts | Canvas, PNG, OTF | Fixed leading/alignment remain limitations **L** | S |
| TYP-15 | Face blending: Serif, Monospace, Script weights over sans remainder; blur/contrast pipeline | `FACES`, weight sliders, `glyphs()` | `S.weights` | Canvas2D filters, Google Fonts (DM Serif, JetBrains Mono, Pacifico) | Glyph bitmaps, PNG, OTF | Bitmap morphing, not variable-axis interpolation; exact faces required for parity | S |
| TYP-16 | Legibility warnings and recommended slider ranges | `flag` logic, `#legibility`, `sliders.js` | Page-local computed flags | DOM | Warning text | Preserve ranges/warnings; not a hard restriction | S |
| TYP-17 | PNG export at 3×, capped to 6000 px, auto-contrast background | `#export-png`, `exportPng()` | `S` | Canvas2D, Blob | PNG | Specialized export remains available | S |
| TYP-18 | OTF export: ASCII 32–126, line-segment glyphs, unitsPerEm 1000, progress | `#export-otf`, `exportOtf()`; global `opentype` | `S` + cdnjs library | opentype.js 1.3.4 CDN | OTF | No kerning/curves/Unicode beyond ASCII **L**; image becomes 1-bit dark runs **L** | R (opentype available), S (export) |
| TYP-19 | Draw/Type ARIA tabs, retained page-local state, keyboard arrows | `showStage()` | `S` | DOM | — | Adapter can expose two entry modes rather than one generic page | R (both tabs present) |
| TYP-20 | Persistence/history limits: no save/load, no redo, no localStorage, no cross-page state | source | — | — | — | Source-state bridge required; do not claim project restore | L |
| TYP-21 | Font credits: Typothèque of ESA le 75 (SIL OFL), Fonderie Download (WTFPL), designers/years, source links; no LICENSE file in repo | `fonts.js` `SOURCES`, `#credit`; `fonts-data.js` | Static | — | In-app credit UI | Preserve credits; resolve font redistribution rights before public release | R (credit UI loaded); licensing gap **L** |
| TYP-22 | Runtime dependencies: Google Fonts (UI and Custom Type faces), cdnjs opentype.js | HTML `<link>`/`<script>` tags | — | Network | — | Network-dependent OTF export and face blending; vendor or explicitly declare offline limits | E |

---

## 5. Shapes — `tools/shapes/`

Entry: `index.html` → `src/main.tsx` → `Studio` with `createEditor()`. React 18.3.1 + Three.js 0.170.0 + React Three Fiber 8.18.0. State is an `Editor` closure (`store.ts`) using immutable reducer edits and `useSyncExternalStore`. Output today is only the live WebGL canvas.

| # | Source feature | Source & entry point | State owner | Required deps / browser | Output formats | Future integration consideration | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| SHP-01 | Add primitives: box, sphere, plane, cone, cylinder, torus, capsule, custom mesh | `Inspector` add buttons; `reduce.ts addObject`; `shapeGeometry.ts` | `ShapeDocument.objects[]`; selection in session | React/R3F/Three, WebGL2, Canvas2D | Live WebGL | Need explicit scene serialization; do not reimplement geometry | R (added Cube), T (add reducer) |
| SHP-02 | Custom quad mesh starting cube | `reduce.ts` (assign `cubeMesh()`), `mesh.ts` | Document object mesh + active face | Three | Live WebGL | Required for face editing parity | T (helper), S (UI) |
| SHP-03 | FBX import, merge meshes, fit/centre, name from file, undo | `Inspector` file input; `loadFbx.ts`; `triangles.ts fitTriangles` | Document triangle mesh | FBXLoader, File.arrayBuffer, WebGL | Live 3D object | Materials/UVs/animations/hierarchy discarded **L**; keep explicit | S; fit helper **T** |
| SHP-04 | Transform channels/numeric inspector with validation | `Inspector.tsx`; `reduce.ts setChannel` | Document object transform | React, DOM | Live WebGL | Host presentation transform must not overwrite 3D source transform silently | T |
| SHP-05 | Gizmo move/rotate/scale, axis handles, local frame, pointer gestures | `Viewport.tsx`; `reduce.ts` gizmo math; `model.ts localAxis` | Session `tool`/`draft`; commits to document | R3F, raycasting, pointer capture | Live WebGL | Preserve gizmo interaction inside iframe; bridge only publishes render/state | T (reducer), S (pointer UI) |
| SHP-06 | Selection, outliner, rename, active face picking | `Studio.tsx`, `Viewport.tsx`, `reduce.ts` | Session selection/activeFace | WebGL raycast, pointer events | Live WebGL | Single selection only **L**; no multi-select/grouping | S; selection semantics **T** |
| SHP-07 | Face editing: extrude, inset, loop cut (fixed parameters) | `Inspector.tsx`; `mesh.ts`; `reduce.ts modelFace` | Document quad mesh | Three | Live WebGL | No vertex/edge editing; fixed distances; active face may go stale **L** | T (helpers), S (UI) |
| SHP-08 | Deformations: twist, taper, noise | `Inspector.tsx`; `deform.ts applyDeform` | Document deform object; render-time | Three geometry, normals | Live WebGL | Render-time, not baked; no bend/lattice/axis/weights | S; setter/undo **T** |
| SHP-09 | Arrays: line, radial, scatter; count ≤20; gap/radius/seed/jitter | `Inspector.tsx`; `Viewport.tsx` array group; `reduce.ts` | Document array rule | Three, deterministic noise | Visual instances only | Instances are not independent objects/exports; no instancing performance path | T (rule state), S (visuals) |
| SHP-10 | Remix per-instance colour/scale | `Inspector.tsx`; `Viewport.tsx`; `reduce.ts` | Document remix seed | Deterministic RNG | Visual only | Preserve deterministic look | T (state), S |
| SHP-11 | Stroke repeats along drawn ground-plane path | `Inspector.tsx` draw mode; `Viewport.tsx` stroke sampling/resampling | Document stroke points + session draft | Pointer events, Three | Visual clones | Max 40 clones; replaces previous stroke; no point editing | T (state), S (workflow) |
| SHP-12 | Duplicate, delete, rename, flip, mirror | `reduce.ts`, `Inspector.tsx`, `Studio.tsx` | Document objects + history | React | Live WebGL | Mirror clears array/stroke/remix **L**; duplicate deep-clones | T |
| SHP-13 | Shading: Toon, Flat, Ink; global mode | `Inspector.tsx`; `Viewport.tsx` materials, shell outline | Session `shade`, `inkColor` | Three materials, CanvasTexture | Live WebGL | Global not per-object; preserve exact look; transparent render needs alpha clearing | S |
| SHP-14 | Per-object colour swatches/picker | `Inspector.tsx`; `reduce.ts setColor` | Document colour | Three | Live WebGL | No alpha/gradients/textures; ink ignores colour **L** | T |
| SHP-15 | Wireframe/selection edges, gizmo toggle, three lighting presets | `Inspector.tsx`; `Viewport.tsx` | Session flags; fixed light presets | Three lights, EdgesGeometry | Live WebGL | No shadows/PBR/environment; “wireframe” only selected edges **L** | S |
| SHP-16 | Camera orbit/pan/zoom, frame-driven rig, resize | `Viewport.tsx SceneInput` | Session camera rig (not store) | R3F, pointer/wheel | View only | No focus-selected/reset/ortho/pinch; camera not undoable | S |
| SHP-17 | Undo/redo, keyboard shortcuts | `Studio.tsx`, `reduce.ts`, history in model | Undo/redo stacks | Keyboard | State | Active face not restored; no history limit/persistence | T |
| SHP-18 | Inspector tabs Object/Material/Modifiers, resizable panels, responsive overlays | `Inspector.tsx`, `Studio.tsx`, `index.css` | UI-local state | React, CSS | — | Iframe isolation means host styling won't collide; preserve internal UI | S |
| SHP-19 | Project save/load, autosave, JSON/GLTF/OBJ export | None | — | — | None | Critical gap: Phase 1 must add source serialization; do not claim source re-entry exists | L |
| SHP-20 | Render/export (PNG/transparent still/video) | None; canvas lacks `preserveDrawingBuffer` | — | — | Live WebGL only | Must add a controlled transparent render path; host can then publish shapes layer | L |
| SHP-21 | Booleans / positive-negative form | `solid.ts cutSolid`, `ShapeForm`; dead/absent UI | Document form flag only | three-bvh-csg | None | CSG is unused dead code and form has no UI/effect; preserve but do not present as working **L** | T (form flag), L (booleans) |
| SHP-22 | Tests | `src/editor/{reduce,mesh,triangles}.test.ts` | Reducer/helpers | Vitest node | — | No UI/WebGL/browser tests; 18 tests passed in Phase 0 | T |
| SHP-23 | React/runtime isolation | `package.json` React 18.3 / R3F 8 | Separate tree | WebGL2, ResizeObserver, Pointer Events | — | Load in isolated iframe; never mount under React 19 host without a version-alignment spike | R |

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

| Gap | Impact | Owner in Phase 1 |
| --- | --- | --- |
| No tool implements `ToolAdapterV1` | Host cannot open/save/restore/render any tool yet | Adapter layer + one pilot tool |
| Image/Vector/Type/Generate/Shapes have no shared project serialization; BEND has its own schema/package | Source re-entry must be added per tool without deleting existing state | Tool adapters |
| Shapes has no export/render API | Transparent layer output and final composition require a new render path | Shapes adapter |
| Legacy shell handoff is direct DOM access and low resolution for Image | Not safe/scalable as a host integration; replace with adapter protocol | Image adapter |
| Generate has no visual export, only DOM and Claude-host spec export | Cannot publish a composition asset yet | Generate adapter/host capture |
| Typography/Generate rely on Google Fonts; Custom Type relies on cdnjs opentype.js | Offline/secure iframe requirements and export determinism | Typography adapter |
| No upstream licence grants for Legacy, Shapes, Typography | Private use only until permission is obtained | Project owner |
| Most inventory rows are not feature-acceptance tested | Parity is proven only for tested/verified rows; build a repeatable adapter acceptance suite before refactors | Phase 1 test plan |

## 8. How to use this matrix

1. Any Phase 1 change that removes or alters a row marked **T**, **R** or **S** is a regression unless explicitly re-scoped.
2. A feature may move between editors only if its output and source-state behavior remain available.
3. New adapter work adds a verification row; it does not upgrade **S** to **T** without a repeatable test.
4. Environment-limited features (**E**) must remain available when their environment exists and must fail honestly otherwise.
5. Keep specialized exports even when host composition export is implemented.
