# BEND. Phase 8.1 — Performance Report

Date: 2026-10-26  
Machine: AMD Ryzen 7 7840HS (8C/16T), 15.2 GB RAM, Windows, integrated Radeon 780M + RTX 4060 Laptop  
Preview browser: Playwright-bundled Chromium, 1440×900, headless  
Evidence: `output/phase81-performance/`, `output/phase81-stress/`, `output/phase81-audio/`.

## 1. Method

- Before changing performance-sensitive code, measured a four-clip montage and the built-in procedural First Study.
- `data-render-ms` on the editor canvas is the pipeline time from request start through temporal preparation, video seek and Pixi render.
- p50/p95 are computed from 16 seeks across the composition; they are not FPS guarantees.
- Long tasks were measured with `PerformanceObserver({ type: "longtask" })` during the same seek sweep where available.
- Memory uses `performance.memory` and is indicative only.
- Final repeated-export probe measured wall time for three sequential 2 s MP4 exports.
- The machine was also running unrelated browser automation during the final measurement window. Both the earlier post-change and final post-change runs are reported instead of selecting the more flattering one.

## 2. Baseline before Phase 8.1 changes

| Scenario | p50 | p95 | Evidence |
|---|---:|---:|---|
| Four-clip montage seek | 9.4 ms | 57.0 ms | `output/phase81-performance/baseline.json` |
| Procedural First Study seek | 352.6 ms | 389.9 ms | same |

Baseline limitations: no waveform decoding/display, no media bin, no loop/duck UI, no bounded heavy preview, no Draft mode.

## 3. Post-change measurements

### First post-change run (lower host contention)

| Scenario | p50 | p95 |
|---|---:|---:|
| Four-clip montage, Full | 8.6 ms | 46.0 ms |
| Four-clip montage, Draft | 8.1 ms | 41.6 ms |
| Procedural example, Full | 317.4 ms | 336.2 ms |
| Procedural example, Draft | 162.7 ms | 169.6 ms |

Draft reduced the procedural example by **48.7% at p50** and **49.5% at p95** with the same renderer and project.

### Final source run (unrelated host automation active)

| Scenario | p50 | p95 | Long tasks (count / max / total) |
|---|---:|---:|---|
| Four-clip montage, Full | 24.7 ms | 89.5 ms | 10 / 63 ms / 548 ms |
| Four-clip montage, Draft | 18.3 ms | 83.0 ms | 5 / 57 ms / 273 ms |
| Procedural example, Full | 417.3 ms | 441.4 ms | 32 / 514 ms / 8,926 ms |
| Procedural example, Draft | 209.4 ms | 230.9 ms | 16 / 301 ms / 4,260 ms |

The final run's absolute numbers are inflated by host load, but the same-session relative result is consistent: Draft halves the procedural cost, and long-task count/total time is approximately halved. Normal montage editing remained under 90 ms at p95 even in the loaded run. Phase 8.0's recorded four-clip median was 48.7 ms; this final source measured 24.7 ms p50 in the loaded run and 8.6 ms p50 in the first post-change run.

## 4. Heavy temporal stack recovery

The stress composition was the built-in procedural example plus Motion Echo + Time Slice + Channel Delay + Frame Feedback (4-effect nested stack).

- **Before safety path:** seeking/playing this stack locked the editor main thread for more than 15 minutes in a real browser run; the Stop preview overlay could not be clicked.
- **After safety path:** the UI reports `Bounded heavy preview`, caps preview echo/slice sampling, bounds Frame Feedback preview replay, and renders procedural samples at half resolution.
- Observed final heavy frames: **877–920 ms** last-frame time while interactive, compared with an unbounded freeze.
- Stop rendering produced a reliable “Preview stopped…” state; Resume preview worked.
- Memory before/after heavy preview and six quality toggles: **42.1 MB → 42.1 MB** (no observed progressive growth).
- Returning to a new simple 2 s sequence and exporting produced a validated 720×900, 60-frame, 2.00 s MP4.
- Export never uses the preview safety constants; it retains the full stack and full resolution.

This is not a claim of real-time heavy preview. It is a claim of bounded, cancellable degradation with full export fidelity.

## 5. Repeated export and resource behaviour

Three sequential 2 s quick-preview exports while the editor was in Draft:

| Export | Wall time | Size | Result |
|---:|---:|---:|---|
| 1 | 5.36 s | 268,829 B | MP4/H.264+AAC, 720×900, 60 frames, 2.00 s |
| 2 | 4.59 s | 269,008 B | same validated profile |
| 3 | 4.68 s | 268,256 B | same validated profile |

No progressive slowdown, no page errors, and output remained full 720×900 while Draft was active. This confirms export quality is independent of preview quality.

Audio and recovery stress runs also performed three 30 s exports plus a package-restore export in the same sessions without a crash or progressive failure.

## 6. Verified bottlenecks and fixes

| Bottleneck | Evidence | Fix |
|---|---|---|
| Pixi video textures auto-played and raced pause on layer duplication | Uncaught `AbortError` and repeated play/pause calls in Chromium traces; 4 duplicate operations reproduced it | Use `VideoSource({ autoPlay:false })`; CanvasStage owns play/pause; no page errors after change |
| Autosave serialized every transient gesture update | 650 ms debounce could still write mid-drag on long gestures | Store gesture state; save effect skips while active and schedules once on gesture end |
| Full-resolution procedural seek was ~0.35–0.42 s | Baseline and post-change measurements | Draft backing resolution; heavy procedural preview sampling at half resolution |
| Nested temporal stack could consume unbounded samples | 4-effect stack froze for >15 min | Bounded preview budget + accurate status + Stop/Resume; export unchanged |
| Slow overlay buttons inherited `pointer-events: none` | Resume/Stop clicks intercepted by canvas selection | Explicit pointer events on status/error overlays |
| Sequence zoom did not affect V1 | 100% width only on the primary lane | Shared zoom wrapper with horizontal scroll and Shift+F fit |

## 7. Caches and bounds

- Temporal raw-frame cache: 72 frames, 192 MB raw-frame budget.
- Preview thumbnail cache: 80 data URLs, shared decoder/canvas, max 320 px.
- Waveform cache: 24 source results, max 4096 buckets, 900 s source bound, ref-counted abort.
- Bounded heavy preview: max 2 echoes, 4 slices, current-frame feedback preview; full export stack untouched.
- No unbounded raw audio sample or full-resolution waveform data is attached to the DOM.

## 8. GPU/browser observations

- **Firefox 157 headless (local):** exported a validated VP9/Opus WebM (720×900, 60 frames, ~1.97 s). Console emitted `WebGL context was lost` and `Tex image ... incurring lazy initialization` warnings during export. The exported frame was non-empty and the editor canvas remained valid after export (`toDataURL` was 212,154 bytes; post-export screenshot still showed the composition). No page errors. These warnings are reported, not suppressed; no output failure was observed.
- **Chromium headless:** occasional `GPU stall due to ReadPixels` performance warnings while reading back preview/export frames. Normal montage editing remained responsive.
- **Windows WebKit 27.2:** procedural rendering worked; video import failed honestly with a visible alert. Not representative of real macOS Safari.
- **Firefox warnings are not classified as proof of correct output by themselves.** Video frames and encoded audio were independently inspected.

## 9. Performance limitations

- No universal real-time FPS claim.
- Heavy nested temporal stacks still require approximately 0.9 s per bounded preview frame on this machine; they are usable for editing and cancellation, not fluid playback.
- Full heavy export can still take much longer than normal exports; it is intentionally full quality.
- The final absolute benchmark was run with unrelated host automation active; use the same-session Draft/Full comparison for the most reliable delta.
- Main-thread long tasks remain during 0.4 s procedural frames and heavy preview frames; no worker/compositor rewrite was attempted in Phase 8.1.
