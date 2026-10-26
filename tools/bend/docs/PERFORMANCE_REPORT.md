# BEND. Phase 2A.1 performance report

Date: 2026-10-13  
Workspace: `C:\Dev\Projects\Bend`  
Scope: local browser measurements only; no deployment or push performed.

## Reproducible setup

- Windows managed test host; hardware inventory and physical GPU counters were unavailable from this session.
- Chromium Playwright project, Playwright `1.64.0`, headless browser runtime.
- Vite served locally on `127.0.0.1`; the browser tests use the repository's generated media fixtures.
- Preview exports target BEND's default `4:5` canvas at `720 × 900`; the 720p source fixture is `1280 × 720` and is intentionally composed into that portrait canvas.
- `performance.memory.usedJSHeapSize` is recorded when Chromium exposes it. It is a diagnostic proxy, not a heap snapshot and not a GPU-memory measurement.
- FFmpeg `9.0-full_build` generated the reproducible fixtures. `ffprobe` independently inspected the saved export artifacts.

The current smoke baseline was `domContentLoadedMs: 165`, `loadEventMs: 167`, callback FPS `25`, and `memoryUsedBytes: 15,200,000`. The earlier Phase 2A note recorded `115ms / 35 FPS / 15,200,000 bytes`; the difference is within the variability of the headless GPU/runtime and is not treated as a product regression without a stable hardware profile.

## Measurements after the reliability pass

### Repeated export and cleanup

The dedicated ten-cycle PNG export benchmark produced:

| Proxy | Before | After |
| --- | ---: | ---: |
| Canvas elements | 1 | 1 |
| Hidden video elements | 0 | 0 |
| Export dialogs | 0 | 0 |
| Reported JS heap | 23,100,000 | 23,100,000 bytes |

The final serial rerun recorded `365, 308, 320, 328, 332, 351, 343, 364, 327, 336ms`; median `336ms`. Its reported heap proxy was `23,100,000` bytes before and after, with canvas `1 → 1`, hidden video `0 → 0`, and dialogs `0 → 0`. No sustained DOM/resource growth was observed across the ten create/export/close cycles.

### Imported footage and effects

The `performance-720p.mp4` plus Wave Displacement benchmark completed in `2,656ms` in the final serial run. The result video reported `720 × 900`, `2.000000s`; the canvas and hidden-video proxies remained `1` and `1`, and the reported heap remained `21,700,000 bytes` before and after the export.

The multi-layer smoke path (constant 24fps plus constant 30fps, Signal Field, and Wave Displacement) completed in `1,693ms`. The imported-footage trim/transform/displacement path completed in `1,025ms`. High-quality `1080 × 1350` output for a `0.5s` generated project completed in `1,038ms`.

### Long exports

| Composition | Wall time | Output | Independent `ffprobe` result |
| --- | ---: | --- | --- |
| 5s preview | 3,540ms | 720 × 900 H.264 | 150 frames, 5.000000s |
| 10s preview | 7,165ms | 720 × 900 H.264 | 300 frames, 10.000000s |
| 15s preview | 9,647ms | 720 × 900 H.264 | 450 frames, 15.000000s |

The timings are local headless measurements, not a universal performance budget. They show roughly linear work for this procedural canvas path, but do not establish a device-independent FPS or export-time guarantee.

### Import/remove lifecycle

After importing three local clips, the resource proxy showed `3` hidden video elements. After removing all three layers, it showed `0`; canvas count stayed at `1` and the reported heap stayed at `23,100,000 bytes`. The store now revokes object URLs when replacing/clearing a project and when a removed asset is no longer referenced by any layer.

## Improvements made

- Reclaimed project and removed-asset object URLs at their lifecycle boundaries.
- Removed unused media records/URLs when a video layer is deleted.
- Kept VFR and nonzero-source-start export requests on timestamp-based `CanvasSink` decoding.
- Corrected fractional composition frame durations and removed the fixed 30fps MP4 timescale hint so a `1.25s` composition is not quantized to `1.233333s`.
- Added real VFR, nonzero-start, delayed-audio, trimmed-audio, fractional-rate, constant-rate, and performance fixtures.
- Added browser timing, cleanup, capability, and independent `ffprobe` evidence.

## Remaining bottlenecks and limits

- Rendering and encoding remain on the main thread. A raw Worker/OffscreenCanvas capability probe passed in Chromium, but the existing Pixi renderer still owns DOM-backed video elements, an HTML canvas surface, and browser-only capture/export boundaries.
- No GPU memory counter, decoder allocation counter, or forced-GC measurement was available. Stable DOM and heap proxies do not prove that every browser-internal allocation is immediately reclaimed.
- Firefox could not launch in this environment (`firefox.exe` exited with code `3221225506`), so no Firefox performance number is claimed.
- No physical mobile device or representative production hardware profile was available.

## Phase 2B procedural motion evidence

The targeted Chromium Playwright run used the default `1080 × 1350` project canvas and a `0.5s` composition. The generator-library/control test completed in `13.0s`; the four-generator still-export test completed in `5.2s` and passed PNG export for Signal Field, Liquid, Flow, and Refraction. These are whole-test headless wall times, not per-frame budgets or device-independent performance guarantees.

Liquid's standard preview grid is bounded to `72 × aspect-adjusted cells` (draft `48`, high `96`) and advances at a fixed `1/60` step. At most eight runtime snapshots are retained; no simulation cache is written to IndexedDB. The current solver is CPU fixed-grid state with GPU texture presentation, so this report does not claim GPU-fluid throughput, GPU memory usage, or a physical-device frame rate.

The Phase 2B browser test captured console/page errors during the four-generator export loop and observed none. Firefox could not launch on this host, and no hardware/GPU counters were available; cross-browser and hardware performance remain unmeasured.

## Phase 3 temporal-effects evidence

The Chromium temporal export test completed in `38.0s` for one 2-second base export, four single-effect exports, and one Time Slice → Motion Echo stack export. The outputs were all independently inspected as `720 × 900`, 30 FPS, 60 frames, and 2.000000 seconds. These wall times include browser interaction and encoding; no per-effect decoder or GPU timing was instrumented, so those measurements remain N/A rather than inferred.

The exercised configurations were bounded: Motion Echo used three echoes, Time Slice used six slices for its individual evidence and four slices in the stack, Channel Delay requested three channel timestamps, and Frame Feedback replayed the two-second composition at the project 30 FPS. The implementation budgets are a 36-entry raw canvas cache per temporal engine and eight Frame Feedback checkpoints. No full-resolution source history is persisted or retained indefinitely.

The Phase 3 video outputs and frame extracts are under `output/evidence/phase3/`. The latest encoded sizes were: base `235,401` bytes, Motion Echo `187,276`, Time Slice `231,679`, Frame Feedback `200,452`, Channel Delay `241,487`, and the stacked clip `173,857`; the backward-seek Frame Feedback artifact was `201,309` bytes and the nonzero-source Time Slice artifact was `168,186` bytes. The final two-case seek/timestamp regression completed in `15.0s`. File size is codec output evidence only, not a memory measurement.

Temporal preview/export performance is still bounded by main-thread canvas work, source decoder seeks, Canvas 2D channel readbacks, and the Canvas 2D Frame Feedback state path. No GPU memory, decoder allocation, or physical-device FPS measurement was available. A 10-second stacked temporal export and the 1080p/aspect-ratio matrix remain open acceptance measurements.

## Phase 4 measurement boundary

Animation evaluation is scalar and document-local; it adds no persistent frame cache. Numeric keyframes and modulators are evaluated once per requested layer/time, while Liquid evaluates animated runtime-safe parameters inside its existing fixed-step replay. The animation document is included in temporal invalidation signatures so stale feedback/checkpoint state is not reused after an animation edit.

The Phase 4 Gate Zero matrix records actual wall time, frame count, output dimensions, output duration, browser-exposed memory/CPU proxies where available, and whether a GPU/decoder counter was available. No FPS, GPU memory, decoder allocation, or device-independent claim is inferred from a successful export. Unmeasured fields remain N/A.

Chromium Gate Zero results on 2026-10-13 were 4,512ms for 2s/60 frames, 9,833ms for 5s/150 frames, and 18,270ms for 10s/300 frames at 720 × 900. The exposed heap proxy was `23,100,000` bytes before and after each generated export. The 10-second temporal composition took 2.9 minutes wall time because its Time Slice → Motion Echo stack performs repeated timestamp sampling; it produced 300 frames with no `blackdetect` interval. These values are evidence from this host and test path, not a device-independent guarantee.

The audio temporal export independently reported H.264 video plus AAC mono 48 kHz audio. Chromium reported WebM VP9 and generic WebM support, but the run used the preferred MP4 path; no forced fallback timing or output is claimed. GPU memory, decoder allocation, preview FPS, physical-device behavior, and true forced-GC behavior remain N/A.

## Phase 5 product-experience boundary

Phase 5 changes are UI/orientation work plus one engine-built sample factory; they do not introduce a new renderer, simulation, cache, network request, or animation evaluation path. Therefore no performance improvement is claimed from the UI pass. The production build remained at 2,408 transformed modules; the current emitted CSS was `47.50 kB` (`9.10 kB` gzip), the editor chunk was `241.15 kB` (`64.98 kB` gzip), and the IndexedDB/media chunk was `436.94 kB` (`114.28 kB` gzip). These are build artifacts, not runtime performance scores.

The fresh Phase 5 sample export produced a real H.264 MP4 at `720 × 900`, 30 FPS, `8.000000s`, and `1,138,751` bytes. The PNG frame was `1080 × 1350` and `2,115,294` bytes. The harness wall time includes Vite startup, browser startup, UI interaction, rendering, and encoding, so it is not reported as a per-frame or device-independent benchmark. GPU memory, decoder allocations, preview FPS, physical-device behavior, and forced-GC behavior remain N/A.

## Phase 5.1C interaction motion boundary

The Phase 5.1C motion layer uses DOM opacity/transform transitions and does not add a renderer, simulation, export, or persistent animation-evaluation path. The final production build transformed `2,823` modules and emitted a `103.14 kB` CSS file (`16.85 kB` gzip), a `237.43 kB` editor chunk (`74.82 kB` gzip), and a `772.17 kB` host chunk (`208.04 kB` gzip). Vite retained the existing large-chunk warning; these are build artifacts, not runtime budgets.

The targeted system-Chrome runner recorded transition frames at 40ms, 120ms, 260ms, and settled checkpoints for desktop and mobile flows. It did not measure frame pacing, paint time, GPU memory, decoder allocations, or physical-device FPS. Those values remain N/A rather than inferred from screenshots or a successful build. Reduced-motion was exercised in a separate browser context and the Pixi canvas remained present; no performance improvement claim is made.

## Phase 5.1D direct-editing boundary

Direct manipulation adds pure geometry calculations, DOM overlays, normalized scalar project fields, and reusable Pixi crop/color filter state. It does not create a second renderer, decode path, simulation cache, or persistence writer. Pointer movement stays transient until the existing gesture commit and the existing editor save debounce; the browser evidence does not claim a device-independent drag FPS.

The final build transformed `2,824` modules and retained the existing Vite large-chunk warning. The directly edited browser outputs were a 750,106-byte PNG and a 216,657-byte H.264 MP4 at 720 × 900 for 0.5 seconds. These are artifact-size/codec checks, not performance budgets. GPU memory, decoder allocation, preview frame pacing, physical touch latency, and true device profiling remain N/A.

