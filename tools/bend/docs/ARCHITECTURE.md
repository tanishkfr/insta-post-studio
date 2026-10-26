# BEND. architecture

## Runtime flow

```text
direct studio route (`/` or `/studio`)
    ↓
recent project restore or empty schema-v2 BendProject
    ↓
single Add flow → video / generator / example
    ↓
shared layer evaluation ──→ PixiBendRenderer ──→ live canvas preview
          │                         │                    ↓
          │                         └──────────────→ PNG / video export
          ↓
timestamped video frames + optional trimmed audio samples

BendProject ──→ IndexedDB project store
media Blob ───→ IndexedDB asset store ──→ object URL ──→ preview / export sources
```

The project document is the source of truth. Preview and export both consume the same layer ordering, visibility, transform, timeline, trim, and effect model; export never screenshots the editor UI.

## Boundaries

### Project model

`src/engine/core/types.ts` defines schema version 2. A `BendProject` contains canvas dimensions/FPS, asset metadata, ordered layers, timeline bounds, and timestamps. `normalizeProject` is applied when a document enters the store and after every edit so persisted values cannot bypass UI limits.

The layer array is ordered bottom-to-top. Every layer has a stable id, transform, `{ start, duration }` placement, `visible`, `locked`, and `muted` state:

- `procedural` — a versioned generator record (`signal-field`, `liquid`, `flow`, or `refraction`) with seeded parameters and a generated duration.
- `video` — an asset reference, clip-local `trimStart`/`trimEnd`, fit mode, transform, and Wave Displacement parameters.

`updateProjectDuration` derives the composition duration from the furthest layer end, so overlapping layers do not shorten one another. `getRenderableLayers(project, time)` is the shared active-layer rule used by preview and export. `sourceTimeAt(layer, time)` maps composition time through placement and trim.

Phase 1 schema-v1 documents migrate on load. Video layers receive a zero timeline offset and explicit visibility/lock/mute defaults; generator seeds, transforms, trim ranges, asset ids, and stored media references are retained. Unsupported versions and malformed core documents are rejected.

The Phase 2B generator registry in `src/engine/generators/registry.ts` is the source for generator names, presets, parameter groups, normalizers, and render capabilities. Legacy procedural records without an `id` normalize as Signal Field records; unknown ids and generator versions are rejected. See [PROCEDURAL_ENGINE.md](PROCEDURAL_ENGINE.md) for the stored parameter contract and extension checklist.

### Media inspection and frame evaluation

`inspectMediaFile` uses Mediabunny `Input` to record audio capability, codec, channels, sample rate, the first video/audio timestamps, frame-rate metrics, and the variable-frame-rate flag when the browser exposes them. This metadata is advisory and does not pretend that every codec can be decoded.

`sourceTimeAt(layer, projectTime)` is clip-local time: placement and trim are applied separately. When a decoded video track has a nonzero presentation start, export requests `CanvasSink.getCanvas(sourceTimeAt(...) + videoStartTime)`. This keeps composition time at zero while preserving the source track's presentation clock. A request before the first available frame is treated as a decode failure and stays visible in the export dialog; it is not silently replaced with a guessed frame.

Export creates a `CanvasSink` for each decodable video track and requests a canvas at the exact source timestamp returned by `sourceTimeAt`. If the track cannot be decoded through Mediabunny, the same compositor uses a prepared HTML video element and bounded `seekVideo` calls. Preview currently uses HTML video elements; export therefore has a stronger timestamp path where supported but does not claim universal frame-exact behavior across browsers/codecs.

### Renderer

`PixiBendRenderer` owns a PixiJS v8 WebGL application attached to a caller-owned canvas. It maintains one sprite and filter state per layer, one reusable video texture per asset source, and releases stale textures, filters, sprites, and sources as layers change or the owner unmounts. `render(project, time)` iterates the ordered active layers and applies each layer's own transform, opacity, visibility, and effect.

The Signal Field and Wave Displacement fragment shaders are stateless functions of layer-local time, normalized coordinates, and project parameters. Signal Field uses a seed-derived field; it does not depend on pointer history or a network service.

Phase 2B adds analytic Flow and Refraction fragment filters beside Signal Field. Liquid is stateful: a fixed-step, seeded low-resolution solver advances from the nearest retained checkpoint on backward seek and uploads its canvas result as a Pixi texture. Generator changes dispose inactive filters/textures; layer removal and renderer teardown release all remaining procedural resources. The renderer's Liquid state is intentionally runtime-only and is rebuilt from the persisted document during export or reload.

### Timeline and playback

The compact timeline renders one row per layer, topmost first. Clips expose horizontal move and video edge-trim gestures, selected-layer state, hidden/locked indicators, a current-time line, horizontal scrolling, 100–400% zoom, readable timecodes, keyboard Home/End/one-frame seeking, and snapping to zero, the playhead, and other clip boundaries. Drag gestures call the store's existing history boundary, so undo/redo remains project-level rather than creating a separate timeline history.

### Audio

The export policy is deliberately basic: the topmost visible, unmuted video layer with a source audio track is the primary audio layer. `AudioSampleSink` reads only the source interval covered by that layer's trim, timestamps the samples at the layer's timeline placement, and adds them to Mediabunny `AudioSampleSource`. Generated layers have no audio. Other overlapping video audio is omitted and reported in the dialog; there is no Phase 2A mixer. If the source track cannot decode or the selected output format cannot encode it, the result is explicitly video-only. The MediaRecorder fallback is always video-only because a canvas capture stream does not carry the local source audio.

### Export

`exportVideoComposition` creates an offscreen renderer at preview (up to 720px wide) or full canvas dimensions, checks runtime video/audio codec support, evaluates a timestamped `frame / fps` loop, and sends the same compositor surface to Mediabunny `CanvasSource`. VFR input selection is timestamp-based; output frame count uses the composition duration and the final sample duration is truncated to the composition boundary. The MP4 path does not force a fixed frame-rate timescale, so fractional durations such as `1.25s` remain representable. It reports frame progress, checks an `AbortSignal` on every frame and during audio iteration, cancels incomplete output, and falls back to MediaRecorder WebM when Mediabunny cannot initialize. `exportCurrentFrame` captures a PNG from the same renderer.

The verified Chromium path produced 5s/10s/15s H.264 MP4 outputs at 30fps and a 1080×1350 high-quality output. Firefox video encoding is intentionally not asserted in the browser suite; the installed Firefox binary could not launch on the current host, so current Firefox rendering/import/PNG behavior is unverified.

### Phase 3 temporal evaluation

Temporal processing is layer-local and is implemented by `src/engine/temporal/engine.ts`. The engine receives composition time, maps it through layer placement and trim to clip/source time, requests bounded source canvases, evaluates the ordered temporal stack, and hands one result canvas per affected layer to `PixiBendRenderer`. Preview and video/PNG export use the same engine contract; export creates a fresh engine and therefore does not inherit arbitrary preview history.

Motion Echo, Time Slice, and Channel Delay are timestamp-sampling effects. Frame Feedback is stateful and replays fixed FPS frames from a defined initial state, retaining at most eight checkpoints for backward seeking. The raw sample cache is bounded to 36 canvas entries per engine, and cache signatures invalidate on source, trim, timing, canvas, or effect changes. Temporal canvases are owned and disposed by the layer renderer; raw frames and checkpoints are runtime-only.

The existing Wave Displacement shader remains a spatial pass after the temporal stack. This preserves the existing compositor and makes the supported order explicit: temporal sampling/feedback → Wave Displacement. Frame Feedback must be last among temporal effects, and the inspector rejects unsupported feedback ordering instead of rendering an ambiguous result. The detailed time-domain, cancellation, and resource contract is in [TEMPORAL_FX_ARCHITECTURE.md](TEMPORAL_FX_ARCHITECTURE.md); the reference/license review is in [TEMPORAL_FX_AUDIT.md](TEMPORAL_FX_AUDIT.md).

### Persistence and performance

Projects and media blobs are separate IndexedDB stores. A project stores asset metadata and a `storageKey`; binary media remains in the asset store. The editor autosaves after a short debounce. Object URLs, hidden video elements, Mediabunny inputs, audio samples, Pixi textures, filters, and renderer contexts are released on replacement, cancellation, or unmount.

The root and `/studio` routes now lazy-load the editor directly; `/studio/edit` retains the host-edit query path and `/integration` remains a separate lazy harness. The landing and entry components remain in the repository as historical/inactive surfaces but are no longer primary navigation. The final local build keeps editor, renderer, and Mediabunny/IndexedDB work in separate chunks.

### Worker feasibility decision

The Phase 2A.1 capability probe created a dedicated Worker, created an `OffscreenCanvas`, and obtained a WebGL context in Chromium. That is useful platform evidence, but it is not proof that the current renderer can be moved unchanged: `PixiBendRenderer` is initialized against an `HTMLCanvasElement`, preview/export sources still use DOM-backed `HTMLVideoElement`s, and the current capture/download boundaries are main-thread browser APIs. A worker migration would therefore create a second renderer/source lifecycle and would need separate transfer, cancellation, and Firefox validation. No production worker path is enabled. The main-thread path is retained until a shared compositor prototype reproduces frames and demonstrates a measured responsiveness gain without a compatibility regression.

## Error and capability behavior

- Unsupported files are rejected before project creation.
- Missing stored media produces an explicit editor banner.
- Audio status is shown as detected, absent, unsupported, or unconfirmed.
- WebGL initialization, frame decode, codec, audio, and export failures remain visible as capability messages.
- Export failures stay inside the export dialog and can be cancelled.
- A successful export identifies whether source audio was included or the result is video-only.
- No provider, server, auth, analytics, or upload boundary is required to render a project.

## Phase 4 animation and recipe boundary

`src/engine/animation/engine.ts` evaluates layer-local keyframes and one optional deterministic modulator per property. It is a pure document-to-value boundary: the inspector and timeline edit `LayerAnimation`, while the Pixi renderer, temporal engine, Liquid replay, and export loop consume evaluated layers. This keeps preview and export on the same time model.

Animation is part of each layer in schema-v2 normalization. Existing projects receive an empty animation document. Temporal effects carry stable instance ids so numeric effect tracks do not follow the wrong effect after a stack edit. Structural values that invalidate stateful replay remain outside the first animation surface.

`src/engine/recipes` is a validated data boundary above the project model. Built-in and local recipes describe generator/effect/animation data, map effect placeholders to stable instances on application, and never embed source media or executable code. The recipe workspace renders a selected recipe through the existing Pixi/temporal path before application. Local recipe CRUD uses browser storage; project changes still pass through the existing undoable store commit.

## Phase 5.1A unified studio boundary

`createExampleProject()` in `src/engine/core/project.ts` is intentionally a small composition factory above the existing schema-v2 model. It creates a generated Signal Field layer, a Refraction layer, a Motion Echo temporal effect, keyframes, and one deterministic modulator. It does not add a new generator/effect family or bypass normalization, undoable store commits, persistence, preview, or export.

The Phase 5.1A UI changes stay at the feature boundary: `App` routes `/` and `/studio` directly to `EditorPage`, `EditorPage` owns the empty/recent/host entry state and single Add flow, `Inspector` exposes Edit/Effects/Motion as contextual sections, and `Timeline` remains the source of truth for order and timing. The light shell is a presentation change; it does not alter the schema, renderer, temporal evaluator, generator registry, animation engine, recipes, export, or IndexedDB contracts. No server, provider, account, analytics, upload, or new external integration boundary was introduced.

The legacy landing/entry components are not mounted by the active router. Keeping them unmounted avoids a second creation path while preserving the existing `/studio/edit` host query contract and `/integration` harness. Phase 5.1B/C are presentation layers and Phase 5.1D is a direct-editing layer above the existing document, renderer, persistence, and export boundaries; none adds library search, provider setup, collaboration, accounts, or a new media pipeline.

## Phase 5.1B visual identity boundary

Phase 5.1B is a presentation refinement above the existing feature/runtime boundary. `src/styles/tokens.css` owns the semantic white/seafoam palette, Instrument Sans loading is imported in `src/main.tsx`, and the appended studio rules in `src/styles/global.css` refine the top bar, Add popover, canvas surround, inspector, timeline, recipe/effect/generator browsers, dialogs, error states, and responsive drawer. No project schema, renderer, temporal evaluator, generator registry, animation engine, recipe data contract, export path, or IndexedDB contract was changed.

The only interaction-state addition is the existing store's selected-layer identity being reflected in timeline clip styling; it does not create a second selection source. New-project and local-recipe rename confirmations are local React dialogs that call the same `setProject`/recipe-storage paths as before. Inspector sections use tablist/tab semantics, and semantic token adjustments were made where the real-browser axe scan found contrast or labeling gaps.

The visual QA harness uses installed system Chrome when the repository's bundled browser is unavailable. It waits for the honest cold-compositor status to clear before identity screenshots, while leaving the existing loading/error/retry path intact. See [VISUAL_REDESIGN_AUDIT.md](VISUAL_REDESIGN_AUDIT.md), [PHASE5_1B_DESIGN_SYSTEM.md](PHASE5_1B_DESIGN_SYSTEM.md), and [PHASE5_1B_VISUAL_QA.md](PHASE5_1B_VISUAL_QA.md).

## Phase 5.1C interaction motion boundary

Phase 5.1C is a DOM presentation layer above the existing editor. `MotionConfig` provides the user reduced-motion policy; `Inspector`, `EditorPage`, dialogs, recipes, and timeline rows use Motion only for bounded presence, layout-indicator, drawer, and reveal transitions. CSS owns hover/focus/pressed feedback. The layer reorder handle, keyframe lane, clip gestures, scrubber, sliders, and history store retain their existing direct pointer contracts. The playhead is decorative and does not intercept keyframe pointer input.

No Motion import crosses into `src/engine`, `PixiBendRenderer`, generator/temporal evaluation, export, persistence, or the project schema. The canvas remains the signature surface and is not transformed, crossfaded, or reinitialized by a React interaction transition. See [INTERACTION_MOTION_ARCHITECTURE.md](INTERACTION_MOTION_ARCHITECTURE.md) and [PHASE5_1C_MOTION_SYSTEM.md](PHASE5_1C_MOTION_SYSTEM.md).

## Phase 5.1D direct manipulation boundary

Phase 5.1D adds `src/engine/core/transform.ts` as a pure geometry boundary. It converts client/display coordinates into composition and cropped local coordinates, applies anchor-aware affine transforms, computes rotated bounds, performs topmost eligible hit testing, and supplies screen-space snap decisions. It has no React, Motion, Pixi, storage, or browser-event dependency.

The project model adds normalized `crop`, static `anchor`/`flipX`/`flipY`, and layer-local `color` fields through the existing schema-v2 normalization path. `CanvasStage` owns the pointer transaction and DOM guides; `EditorStore` owns the single history boundary and rollback; `Inspector` owns precision and semantic controls. Direct pointer math never reads animated presentation values or Motion state.

`PixiBendRenderer` consumes the same normalized fields for preview and export. The layer order is source/generator or temporal sample → Wave Displacement → crop → ColorMatrix → final transform/composite. Procedural generators whose UV space is their source apply crop in the generator shader; texture-backed layers use a shared crop filter. Crop is spatial and does not alter trim or timeline timing. See [DIRECT_MANIPULATION_ARCHITECTURE.md](DIRECT_MANIPULATION_ARCHITECTURE.md) and [DIRECT_MANIPULATION_AUDIT.md](DIRECT_MANIPULATION_AUDIT.md).

Phase 6 external-tool integration should consume `VideoExportResult` and its explicit MIME/audio status through an adapter. It should not couple an external destination directly to Pixi internals, IndexedDB media blobs, or React component state. See [PHASE5_HANDOFF.md](PHASE5_HANDOFF.md) for the proposed handoff contract.

## Phase 6A portable and host boundary

`src/engine/package/bendPackage.ts` defines the versioned `.bendpkg` framed archive. The manifest contains normalized project JSON and asset metadata; source media is stored as separate binary entries with optional SHA-256 validation. `src/engine/package/portableProject.ts` is the storage-aware import/export layer. It loads every referenced IndexedDB asset, rejects incomplete packages, rewrites origin-specific storage keys, resolves id collisions, and rolls back newly written assets if restoration fails. See [PORTABLE_PROJECT_FORMAT.md](PORTABLE_PROJECT_FORMAT.md).

`src/integration/adapter.ts` is the framework-neutral boundary for rendered video, poster/still output, editable source, progress, cancellation, and source revision. It delegates rendering to the existing compositor/exporter; it does not expose Pixi or React. `src/integration/host.ts` models the host-owned layer and persists the local harness in `host-compositions` and `host-media` IndexedDB stores. BEND owns effects, generators, keyframes, source media, and rendered metadata; the host owns placement, opacity, stacking, timeline offset, playback, and audio policy. See [HOST_INTEGRATION_API.md](HOST_INTEGRATION_API.md).

The `/integration` route is a same-origin verification harness only. Cross-origin messaging, group-app storage, and production origin trust remain Phase 6B work. The editor's cold compositor state and IndexedDB request/transaction completion are explicit reliability boundaries rather than optimistic UI states.
