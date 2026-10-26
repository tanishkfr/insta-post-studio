# BEND. temporal-effects architecture

Phase 3 introduces a reusable, layer-local temporal evaluation boundary without replacing the existing Pixi compositor.

## Evaluation contract

`BendProject` remains the source of truth. Every layer now contains `effects: TemporalEffectInstance[]`; the project schema stays at version 2 because missing effect arrays normalize to `[]` and effect records carry their own `version: 1`. Runtime caches and feedback history are never serialized.

The engine separates three kinds of work:

| Kind | BEND implementation | History requirement |
| --- | --- | --- |
| Spatial | Existing Wave Displacement in `PixiBendRenderer` | One input frame |
| Temporal sampling | Motion Echo, Time Slice, Channel Delay | Direct source/intermediate timestamp requests |
| Stateful feedback | Frame Feedback | Previous processed frame plus bounded checkpoints |

`src/engine/temporal/registry.ts` owns effect definitions, parameter ranges, four presets per effect, normalization, and registration. `src/engine/temporal/time.ts` owns explicit time mapping and stack compatibility. `src/engine/temporal/engine.ts` evaluates an enabled stack and returns a canvas frame per affected layer. `PixiBendRenderer.setTemporalFrames` uploads those canvases as ordinary per-layer textures.

## Time domains

| Domain | Meaning |
| --- | --- |
| Composition timestamp | Global project playhead, including layer placement |
| Clip-local timestamp | `composition - layer.timeline.start`, clamped to the layer |
| Source presentation timestamp | Clip-local time plus `asset.videoStartTime` for timestamped Mediabunny requests |
| Effect history offset | A signed offset relative to the requested composition timestamp, clamped or looped inside the layer |
| Export frame index | `round(localTime * project.canvas.fps)` for fixed-step feedback replay |

`sourceTimeAt` applies trim after placement. `sourceTimestampAt` adds a nonzero source presentation start only at the decoder boundary. This keeps a clip starting at 3 seconds and a source with a 0.25-second presentation start distinct from the project clock.

## Sampling and cache

`TemporalEngine` requests raw video frames through a `TemporalSourceSampler`. Preview supplies a serialized HTML-video sampler so one shared element is never concurrently sought. Export supplies Mediabunny `CanvasSink` requests when the track is decodable, with the existing HTML-video fallback otherwise. Procedural layers are rendered through a separate offscreen `PixiBendRenderer` with their temporal effects removed, then cloned into the same frame type.

The raw cache is a bounded LRU-like canvas cache with a 36-frame limit per engine. Its key includes the layer id and mapped source time; the stack signature also includes canvas dimensions/FPS, asset identity/storage metadata, timeline/trim values, and effect parameters. Signature changes invalidate raw frames, feedback state, and procedural offscreen renderers for that layer. A new export creates a fresh engine, so preview history cannot affect export.

## Effect evaluation

The stack is evaluated in order. An effect at position `n` receives the output of positions before it when sampling a different time. This makes temporal chaining real rather than a changing shader uniform:

1. Motion Echo requests a bounded set of nearby timestamps and composites distinct frames with decay, opacity, tint, blend mode, and offsets.
2. Time Slice divides the output into horizontal or vertical bands and requests one mapped timestamp per band. Curves, jitter, direction, speed, width, and seed affect those requests and regions.
3. Channel Delay requests separate red, green, and blue intermediate frames sequentially, then recombines their channels with edge behavior and optional spatial offset.
4. Frame Feedback evaluates fixed chronological frames, transforms/decays the prior processed canvas, composites it with the current intermediate frame, and stores the result as the next state.

The supported compatibility contract currently allows at most one Frame Feedback effect and requires it to be the last temporal effect. Unsupported ordering is rejected in the engine and reported in the inspector. Wave Displacement remains a fixed post-temporal spatial pass; it is not mislabeled as a reorderable temporal stack entry.

## Seeking and cancellation

Sampling effects reconstruct requested timestamps directly and do not depend on what the user previously previewed. Frame Feedback tracks a local frame index. Forward evaluation advances one fixed frame at a time; backward evaluation restores the nearest retained checkpoint or resets to frame zero. At most eight checkpoints are retained, with checkpoint canvases created only at bounded intervals.

Canvas preview evaluations receive an `AbortSignal`. A new playhead/project evaluation aborts the previous one, and stale results cannot replace a newer render. Export has its own fresh engine and checks cancellation per frame and during sampling. Parameter, trim, source, canvas, and timing changes are included in cache signatures.

## Resource lifecycle

- Raw sample canvases are bounded by the temporal engine cache.
- Feedback state and checkpoints are disposed with the engine or invalidated layer.
- Procedural offscreen renderers are destroyed when their layer signature changes or the engine is disposed.
- Pixi temporal textures are destroyed when a layer/effect leaves the composition or the renderer is destroyed.
- Export disposes its engine, renderer, Mediabunny inputs, and hidden video elements in `finally` paths.
- Project JSON stores only effect ids, enabled state, normalized parameters, preset ids, order, and effect version; it stores no decoded frame or checkpoint data.

## Known Phase 3 boundaries

Frame Feedback currently uses bounded Canvas 2D ping-pong state, not a GPU multipass render-texture solver. This is deliberate and measurable, but it limits high-resolution feedback throughput until a GPU state path can be introduced without readback, seek, or export-parity regressions. Wave ordering is fixed after temporal effects. Firefox execution, physical-device GPU profiling, screen-reader testing, and 200% zoom remain inherited open items.
