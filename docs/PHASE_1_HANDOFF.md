# Phase 1 Handoff — Studio 2.0

Phase 0 is complete enough to start implementation without re-discovery. Read [INTEGRATION_ARCHITECTURE.md](INTEGRATION_ARCHITECTURE.md), then use [FEATURE_PARITY_MATRIX.md](FEATURE_PARITY_MATRIX.md) as the non-regression contract.

## 1. What is already true

- The Studio host runs (React 19 + TypeScript + Vite), builds and has unit and Playwright smoke tests.
- `@studio/contracts` typechecks and defines project, artboard, layer, asset, adapter and messaging boundaries.
- Six preserved editors and all three legacy tools load as independent applications.
- Shapes, BEND, legacy tools and typography are pinned and recoverable from their upstream SHAs.
- The host UI is only a shell: project state is in memory, layers are empty, and no tool is embedded.
- No adapter runtime, project persistence, asset database or compositor exists.

## 2. Phase 1 objective

Ship one vertical slice end to end:

> Open a preserved tool with host context → edit → publish a rendered asset + editable source state → display it as a layer → reopen the exact source state.

Do not attempt all six adapters before proving the first one. Do not build the final compositor before the project/asset/adapter loop works.

### Explicit non-goals for the first Phase 1 slice

- BEND full-quality timeline integration.
- Full multi-layer video composition export.
- Redesigning any preserved editor.
- Cloud storage, accounts, collaboration or deployment.
- Rewriting the legacy three into a new editor.

## 3. Exact starting point

**Branch:** `phase-1/shared-foundation`

**First commit (foundation):**

1. Create `apps/studio/src/state/projectStore.ts`.
   - Normalized `StudioProject` state, active artboard, active tool, selected layer.
   - Actions for project rename, format change, artboard selection, layer create/update/reorder/delete, source reference update.
   - Keep host project truth authoritative; no editor internals.
   - Add undo/redo at the project-action boundary now, before adapters depend on it.
2. Create `apps/studio/src/storage/assetRepository.ts`.
   - IndexedDB database `studio-assets`, object store `assets`.
   - `putAsset(bytes, metadata) -> AssetReference`, `getBytes(assetId)`, `delete`, `resolve`.
   - Content hashing and missing-asset reporting.
   - Persist the project document separately (`studio-projects`), with a schema version and migrations.
3. Create `apps/studio/src/adapters/iframe/`:
   - Host transport implementing `ToolAdapterV1` over `ScopedChannel`.
   - Origin validation, request IDs, timeout, abort/cancel, stale-response rejection, typed errors.
   - A deterministic fake adapter/conformance page used only in tests.
4. Add a browser test that opens the fake adapter, exchanges context and input assets, restores state, renders bytes, serializes state, closes, and rejects a wrong-origin/wrong-scope message.

Do not touch any preserved tool source in this first commit.

**Second commit (pilot adapter): Vector.**

Why Vector first:

- Output is natively SVG and transparent.
- The existing page already produces `res.svg` and `res.W/H`.
- The generator state, selection and history are lower-risk than BEND/Shapes.
- It proves source-state restore before the harder image/3D/video paths.

Implementation approach:

- Keep `tools/legacy/vector/arnav.html` untouched.
- Add a derived adapter wrapper under `apps/studio/src/adapters/vector/` (or a served wrapper page) that loads the preserved page and injects a minimal bridge with a versioned document API.
- The bridge may append a script that references existing top-level bindings; it must not fork/replace generator algorithms.
- Render: serialize `#stage svg`, strip `#ovl`, preserve `viewBox` and dimensions.
- Source state: define a versioned Vector document containing generator parameters, baked items, current selection/tool options that matter for re-entry. Extend the bridge as needed; do not pretend `Copy JSON` is complete state.
- Verify: publish SVG layer → reopen → identical generated output at the same seed; edit history remains usable.

## 4. Recommended sequence

| Order | Work package | Exit criterion |
| --- | --- | --- |
| 1 | Project store + IndexedDB assets + project persistence | Reload preserves project name, format, artboard and an asset reference |
| 2 | Iframe transport + fake adapter + conformance tests | Origin/scope/timeout/cancel tests pass; fake adapter round-trips |
| 3 | Vector adapter | SVG layer appears; source state reopens; original Vector build/behavior unchanged |
| 4 | Image adapter | Render at true 1080 export size; source settings/mask/photo reopen; layered export remains |
| 5 | Typography adapter | Type Library and Custom Type entry points; font assets pinned; PNG/OTF exports remain |
| 6 | Generate adapter | Consumes host text/vector/image input; produces a rendered asset; no Claude dependency |
| 7 | BEND bridge spike (can run in parallel from step 2) | Rendered proxy + `.bendpkg` source re-entry through a dedicated bridge |
| 8 | Shapes adapter | Add serializable scene export + transparent render without weakening editor; React 18 isolated |
| 9 | Host composition/export | Images/SVG/types/shapes compose with layer order; temporals remain explicit |
| 10 | Parity verification | Matrix rows exercised or explicitly deferred; original test suites stay green |

If time is constrained, stop after step 3 with a fully proven vertical slice rather than six half-adapters.

## 5. Adapter requirements per tool

### Vector
- Entry: `tools/legacy/vector/arnav.html`.
- Required output: SVG + native dimensions; transparent.
- Required source state: complete generator + baked item state needed to reopen.
- Preserve: import flows, undo/redo, clipboard, exports, typography, plugin registry.
- Known limits to carry forward: no node editing, text is not a selectable object, fonts not embedded.

### Image
- Entry: `tools/legacy/image/janya.html`.
- Required output: rendered PNG at 1080 short edge (use export render path, not `#cv` preview/shell capture).
- Required source state: `S` settings, effect order, layer metadata, mask/painted data, source-photo asset reference. The source photo is currently outside `S`.
- Preserve: layered ZIP, GIF, saved Looks, prompt/local generation, undo, specialized exports.
- Known limits: no project save, low-res legacy shell handoff, synchronous CPU effects, dormant mask fields.

### Typography
- Entries: `fonts.html` (Type Library) and `custom.html` (Custom Type); likely two adapter modes.
- Required output: PNG; Custom Type also OTF.
- Required source state: Type Library text/font/weight/size/tracking/ink/warp field; Custom Type strokes/image/text/weights/pattern controls.
- Required assets: bundled `fonts-data.js`; decide about Google Fonts and cdnjs opentype.js for offline/secure iframe.
- Preserve font credits, licences and existing export behavior.
- Known limits: no Type Library OTF, ASCII-only line-segment OTF, no persistence/redo.

### Generate
- Entry: `tools/legacy/generate/generator.html` (embedded patched behavior is the baseline for host input).
- Required output: a rendered composition asset. No visual export exists today; add a host-render/capture path rather than pretending a spec export is the asset.
- Required source state: `S.fmt/slides/mode/seed/ctl/assets` and per-slide inputs.
- Replace legacy `{type:'setup'}` postMessage with the scoped adapter contract.
- Preserve: rule engine, static presets, carousel behavior, 12 controls, asset bin.
- Env limits: Claude mode and Export spec stay unsupported outside claude.ai.

### Shapes
- Entry: `tools/shapes/index.html`.
- Required output: transparent rendered image (or frame sequence/video where supported) while retaining 3D source.
- Required source state: `ShapeDocument` plus session choices needed to restore the edit; introduce explicit versioning and history semantics.
- **Must add:** serialization and render/export APIs. They do not exist today; the canvas also lacks `preserveDrawingBuffer`. Do this in adapter files/build entries, not by degrading the editor.
- Preserve: React 18/R3F 8 runtime isolation, primitives, face editing, deform, arrays, strokes, FBX, materials, camera, undo.
- Do not expose dead CSG as working parity.

### BEND
- Entry: `tools/bend/` (React 19/Pixi/Mediabunny).
- Dedicated bridge; preserve its timeline/effect/render engine and IndexedDB/.bendpkg formats.
- Reuse its integration contract concepts: rendered video/poster/package, source revision, compare-and-set host layer update.
- Decide explicitly whether the host uses BEND preview-quality handoff (current adapter) or full-quality export, and whether playback is live proxy or host-composited.
- Preserve: media library, V1 clips, transitions, speed/reverse/freeze, audio/ducking, temporal effects, generators, keyframes, masks, color, packages, exports.
- Known gaps: no text/captions, no multi-video track/PiP, main-thread heavy export, browser codec dependence.

## 6. Non-regression gates

Every tool adapter PR must run:

```powershell
# Host and contracts
npm run verify
npm run test:browser

# Shapes (from a clean install of its own tree)
npm run tool:shapes:install
npm run tool:shapes:build
npm run tool:shapes:test

# BEND
npm run tool:bend:install
npm run tool:bend:typecheck
npm run tool:bend:test
npm run tool:bend:build

# Static tools
npm run serve:legacy     # inspect Image, Vector, Generate, combined shell
npm run serve:typography  # Type Library + Custom Type
```

Add for every adapter:

- browser test: open, restore source state, render, close, reopen;
- origin/scope rejection test;
- source-state version migration test;
- export regression check for specialized formats when its runtime is available;
- explicit capability/limitation list in the adapter's report.

Do not mark a matrix row **T** unless a repeatable automated check covers it.

## 7. Guardrails

- Preserve original algorithms and assets; add wrappers/adapters around them.
- Never combine React 18 and React 19 in one runtime.
- Keep binary assets out of project JSON; IndexedDB only.
- Keep original tool state authoritative inside its adapter; the host owns presentation and composition.
- Keep specialized exports (SVG, PNG, GIF, layered ZIP, OTF, `.bendpkg`, MP4/WebM).
- Do not push to upstream repositories, touch BEND's production Vercel project, or deploy Studio publicly.
- Resolve upstream licensing before making the app public.
- Update the feature matrix when capability or verification status changes; do not silently delete a preserved feature.

## 8. Immediate next actions

1. Create `phase-1/shared-foundation`.
2. Implement the project store + IndexedDB repository + tests.
3. Implement the iframe transport and fake-adapter conformance test.
4. Build the Vector pilot adapter and one real end-to-end layer round-trip.
5. Only then expand to Image and Typography.
6. Run a short BEND bridge spike in parallel so the video path is de-risked before composition work.
