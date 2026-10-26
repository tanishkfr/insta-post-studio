# BEND. Phase 3 temporal-effects audit

Audit date: 2026-10-13
Scope: algorithm and license review for browser-local temporal processing. No reference application code was copied into BEND.

## Pinned references

| Reference | Revision inspected | License / obligation | BEND decision |
| --- | --- | --- | --- |
| [Video Flows](https://github.com/p-chops/video-flows) | `6e111b6fbfebef9177fcdbbb3571c1d261460b02` | MIT (`LICENSE`) | Algorithm reference only |
| [TimeSlice Nodes](https://github.com/systms-ai/TimeSlice-Nodes) | `b4bd03287247aec00e972273bf01f908b0648540` | MIT (`LICENSE`) | Algorithm reference only |
| [Temporalis](https://github.com/positlabs/temporalis) | `cdad2dcc6b3279d1e703bafa8cf1a5adc05943ba` | No `LICENSE` file was present at this pinned revision | Do not copy or bundle; reference behavior only |
| [PixiJS](https://github.com/pixijs/pixijs) | `636c2375d0753b0f2c51b54a1298811802fb5252` (`v8.22.0`) | MIT (`LICENSE`) | Existing runtime dependency; use public Filter/Texture APIs |

The three temporal repositories were shallow-cloned into the ignored `.audit-sources/` directory and inspected at the revisions above. PixiJS v8 filter guidance was reviewed at the [official Filters guide](https://pixijs.com/8.x/guides/components/filters). The existing BEND dependency audit already records PixiJS and Mediabunny attribution obligations; Phase 3 adds no runtime dependency.

## Techniques that informed the implementation

### Video Flows

The pinned source documents bounded versus all-frame history, ring-buffer echo blending, transformed previous-output feedback, and slit-scan sampling by row or column. BEND adopts the bounded principle and explicit frame-time requests. It does not load a complete source video into GPU memory, and it does not import the reference project's application infrastructure.

### TimeSlice Nodes

The node implementation calculates a source frame per spatial slice and exposes orientation, slice geometry, offset curves, jitter, and trim/loop boundaries. BEND maps those ideas to `TimeSliceEffect`: every band requests a timestamp through the shared clip-local/source-time mapping, then draws only that band. The implementation remains browser-side and does not use Python, ComfyUI, Prefect, or server FFmpeg.

### Temporalis

The pinned demo keeps a bounded recent `ImageData` history and writes slices into a canvas. That is useful evidence for the slit-scan interaction, but the repository is an old webcam/MediaRecorder application and has no license file at the pinned revision. BEND does not copy it. BEND uses timestamped source requests and a bounded canvas cache instead of camera-specific infrastructure.

### PixiJS v8 filters

Pixi's public `Filter`, `GlProgram`, `Texture`, and source-update APIs remain the compositor boundary. Temporal evaluation returns one explicit frame canvas per layer; Pixi owns the resulting texture and destroys it when the layer/effect is removed. Frame Feedback uses a bounded canvas ping-pong state in Phase 3 because channel recombination and source sampling already require CPU-visible canvas pixels; it is not described as a GPU multipass simulation.

## Compatibility decisions

- Temporal effects are layer-local. They do not flatten the full composition or share history between layers.
- Sampling effects request source frames directly at mapped timestamps. Preview uses a serialized local HTML-video sampler; export prefers Mediabunny `CanvasSink` and falls back to HTML video when needed.
- Frame Feedback replays fixed output frames chronologically and retains at most eight checkpoints. Backward seeking resets to a valid checkpoint or frame zero.
- The cache is bounded and contains runtime canvases only. Cached frames are never written to project JSON.
- Existing Wave Displacement remains the final spatial pass after the temporal stack. This supports `Time Slice → Wave Displacement` and keeps the existing shader path stable; `Wave Displacement → temporal effect` is a declared Phase 3 ordering limitation rather than a silently different operation.
- No upstream source was vendored, and no new license notice is required beyond the existing PixiJS/Mediabunny dependency notices.
