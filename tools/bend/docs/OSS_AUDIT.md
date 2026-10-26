# BEND open-source audit

Audit date: 2026-10-12  
Scope: Phase 1 foundation and functional vertical slice  
Repository state at audit start: `C:\Dev\Projects\Bend` was empty and was not a Git repository.

The repositories below were shallow-cloned and inspected at the exact commits listed. The audit used package manifests, licenses, source files, and implementation documentation; README claims were treated as orientation only.

## Decisions at a glance

| Candidate | Pinned commit / version | License | Decision |
| --- | --- | --- | --- |
| [Cutaway](https://github.com/S07K/cutaway) | `e9c6cc06b549d7fa857bb8f43f02c47a39368e33` | MIT | Reference only |
| [WebMotion](https://github.com/superhq-ai/webmotion) | `4c518e0f4e42e3cd97717b92601f1037cc881515` / `0.18.2` | MIT | Reference only |
| [PixiJS](https://github.com/pixijs/pixijs) | `65552017d23255c1442a7d4ac7f0d49e3225fb1d` / `8.22.0` | MIT | Adopt |
| [Mediabunny](https://github.com/Vanilagy/mediabunny) | `cc108b3b492d1e00aa976586b6d3f344a0bd178d` / `1.61.3` | MPL-2.0 | Adopt as a dependency |
| [React Timeline Editor](https://github.com/xzdarcy/react-timeline-editor) | `4148f4a837dd767ea66807560d05bc7b65c7e578` | MIT | Reject for Phase 1; reference behavior |
| [WebGL Fluid Simulation](https://github.com/PavelDoGreat/WebGL-Fluid-Simulation) | `a2d292931f19d9b3b9f564e23e6c32729d2121c3` | MIT | Reference only; defer |

## Cutaway

- Repository: https://github.com/S07K/cutaway
- Inspected commit: `e9c6cc06b549d7fa857bb8f43f02c47a39368e33`
- License: MIT (`LICENSE`). No source is copied into BEND.
- Inspected: `docs/ARCHITECTURE.md`, root and app manifests, `apps/web/src/features/preview/PixiSceneRenderer.ts`, `apps/web/src/features/export/WebCodecsVideoWriter.ts`, `apps/web/src/state/projectStorage.ts`, `packages/render-engine/src/scene.ts`, and `packages/timeline-engine/src/time.ts`.

### Relevant findings

- A pure project document resolves to a scene, and preview/export consume the same resolved frame model.
- Integer frame math and half-open ranges avoid trim and boundary drift.
- Pixi display objects are reconciled by clip id and destroyed deliberately; this is important for video textures and filters.
- Project metadata and media blobs are separate IndexedDB concerns.
- WebCodecs export is isolated behind a frame-source/writer boundary and applies encoder backpressure.

### BEND compatibility

The boundaries are directly compatible with BEND. The application and package structure are not: Cutaway is a Next.js/pnpm/Turborepo monorepo with a substantially larger editor scope. Adopting it wholesale would inherit unrelated UI, routing, state, and feature complexity.

### Decision

**Reference only.** BEND adopts the pure frame evaluation, resource disposal, and persistence patterns, but not Cutaway code or its UI.

Estimated integration complexity if forked: **high**. Maintenance risk: **high** for a Phase 1 standalone slice.

## WebMotion

- Repository: https://github.com/superhq-ai/webmotion
- Inspected commit: `4c518e0f4e42e3cd97717b92601f1037cc881515`
- Package version: `@superhq/webmotion 0.18.2` from `package.json`.
- License: MIT (`LICENSE`). No source is copied into BEND.
- Inspected: `src/render/renderer.ts`, `src/render/canvas-renderer.ts`, `src/export/exporter.ts`, `src/export/encoder.ts`, `src/video/decoder.ts`, `src/video/mp4-demux.ts`, and timeline/runtime files.

### Relevant findings

- A renderer exposes `beginFrame`, `capture(timestamp, duration)`, and explicit `destroy` operations.
- Export iterates fixed composition frames, captures `VideoFrame` objects, and waits when `VideoEncoder.encodeQueueSize` grows beyond a safe depth.
- The video decoder demuxes MP4 samples and uses WebCodecs for deterministic frame selection, instead of treating HTML video seeking as frame-exact.
- The published package has a broad runtime surface including DOM, WebCodecs, `mp4box`, `mp4-muxer`, optional Three.js, and its own composition model.

### BEND compatibility

The frame-clock and encoder seam are useful. Integrating the whole runtime would duplicate BEND’s project model and shader compositor, and would increase the dependency/compatibility surface before imported-video export needs exact WebCodecs decoding.

### Decision

**Reference only.** BEND uses the fixed timestamp model, cancellation, and backpressure ideas. Phase 1 uses the smaller Mediabunny `CanvasSource` path for browser-side output and explicitly documents that imported-video seeking is not claimed frame-exact.

Estimated integration complexity: **medium-high**. Maintenance risk: **medium**.

## PixiJS

- Repository: https://github.com/pixijs/pixijs
- Inspected commit: `65552017d23255c1442a7d4ac7f0d49e3225fb1d` on `dev`.
- Package version: `8.22.0` from `package.json`.
- License: MIT (`LICENSE`). BEND uses the package without modifying its source.
- Inspected: `package.json`, the WebGL `Application`/renderer exports, `examples/filters_custom-shader_glsl/index.ts`, the custom GLSL filter sources, `rendering/.../VideoSource.ts`, `RenderTexture`, and filter resource handling.

### Relevant findings

- PixiJS v8 supports an explicit WebGL preference, custom `Filter` instances backed by `GlProgram`, float/vector uniform resources, video sources, and render targets.
- `VideoSource` can update at render time and exposes explicit source updates for paused/seeking media.
- The renderer can capture a stable canvas and can render into a target surface.

### BEND compatibility

This is the smallest mature GPU compositor that satisfies the Phase 1 effect requirement without copying a full editor. BEND uses PixiJS for the preview/export canvas, video sprite transforms, the Signal Field fragment shader, and Wave Displacement.

### Decision

**Adopt `pixi.js@8.22.0`.** BEND only depends on its public APIs and uses WebGL as the primary renderer. WebGPU is not required.

Estimated integration complexity: **medium**. Maintenance risk: **low-medium**; the API is actively maintained, but custom filter resources must be verified against the pinned version.

## Mediabunny

- Repository: https://github.com/Vanilagy/mediabunny
- Inspected commit: `cc108b3b492d1e00aa976586b6d3f344a0bd178d`.
- Package version: `1.61.3` from `package.json`.
- License: MPL-2.0 (`LICENSE`). The dependency remains unmodified; BEND will ship the upstream license reference in project documentation and retain the package license in the installed dependency tree.
- Inspected: package manifest, `examples/metadata-extraction`, `examples/procedural-generation/procedural-generation.ts`, `Input`/`BlobSource`, `CanvasSource`, `Output`, `BufferTarget`, `Mp4OutputFormat`, codec capability helpers, and encoding implementation.

### Relevant findings

- `Input` + `BlobSource` provides local file metadata inspection without upload.
- `Output` + `BufferTarget` + `Mp4OutputFormat` + `CanvasSource` is a direct browser-side canvas-to-video path.
- `getFirstEncodableVideoCodec` performs a capability check before work begins.
- `CanvasSource.add(timestamp, duration)` is designed for a fixed-timestamp procedural frame loop and applies encoder backpressure.
- The library is substantially larger than a hand-written WebM fallback, but it avoids guessing container/muxer APIs.

### BEND compatibility

Mediabunny is a good fit for generated and composited canvas output. Phase 1 uses it for metadata probing where available and MP4 video export when the browser exposes a supported encoder. A native `MediaRecorder` WebM path remains as a documented fallback for browsers where MP4/WebCodecs is unavailable.

### Decision

**Adopt `mediabunny@1.61.3`** for browser-side output/capability checks. Do not claim source-audio passthrough in Phase 1.

Estimated integration complexity: **medium**. Maintenance risk: **medium** due browser codec variance and MPL-2.0 attribution obligations.

## React Timeline Editor

- Repository: https://github.com/xzdarcy/react-timeline-editor
- Inspected commit: `4148f4a837dd767ea66807560d05bc7b65c7e578`.
- License: MIT (`LICENSE`). No source is copied into BEND.
- Inspected: root manifest, `packages/timeline`, `packages/engine/src/core/engine.ts`, timeline layout/cursor components, and action/row data interfaces.

### Relevant findings

- The component provides rows/actions, cursor movement, zoom/scroll, and an effect engine with enter/update/leave lifecycle callbacks.
- It is a Yarn 4 monorepo package with a broad visual and interaction surface designed for a generic animation editor.
- Styling and internal coordinate/scroll behavior would need to be overridden for BEND’s compact, single-clip instrument.

### Decision

**Reject for Phase 1; reference behavior only.** A small custom timeline keeps the implementation honest and preserves control over scrubbing, trim boundaries, keyboard seeking, and BEND’s visual language. The internal model still uses a track/clip abstraction so a future multi-track phase has a migration seam.

Estimated integration complexity: **medium-high** for this slice. Maintenance risk: **medium**.

## WebGL Fluid Simulation

- Repository: https://github.com/PavelDoGreat/WebGL-Fluid-Simulation
- Inspected commit: `a2d292931f19d9b3b9f564e23e6c32729d2121c3`.
- License: MIT (`LICENSE`). No source is copied into BEND.
- Inspected: `script.js`, `index.html`, and `README.md`.

### Relevant findings

- The implementation is a stateful multi-pass WebGL fluid solver with velocity/density framebuffers, pressure iterations, bloom, sunrays, pointer splats, and runtime configuration.
- It uses interactive and random splats and therefore is not a direct fit for BEND’s deterministic `frame + seed + parameters` requirement without a separate checkpoint/replay design.
- The project is a standalone demo rather than a modular TypeScript package.

### Decision

**Reference only; defer to a later procedural phase.** Do not integrate it into Phase 1. BEND’s Signal Field is deterministic and stateless per frame; fluid feedback is explicitly out of scope.

Estimated integration complexity: **high**. Maintenance risk: **medium-high**.

## License and attribution summary

- Adopted runtime dependencies: PixiJS (MIT) and Mediabunny (MPL-2.0).
- Reference-only projects are not copied or bundled.
- BEND code will not modify upstream dependency source.
- The application will state that media stays local and will not imply that upstream libraries provide universal codec support.

## Sources

- PixiJS v8 guides: https://pixijs.com/8.x/guides
- Mediabunny documentation: https://mediabunny.dev/
- WebMotion repository: https://github.com/superhq-ai/webmotion
- Cutaway repository: https://github.com/S07K/cutaway
- React Timeline Editor repository: https://github.com/xzdarcy/react-timeline-editor
- WebGL Fluid Simulation repository: https://github.com/PavelDoGreat/WebGL-Fluid-Simulation
