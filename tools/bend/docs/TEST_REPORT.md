# BEND. Phase 2A.1 verification report

Date: 2026-10-13
Workspace: `C:\Dev\Projects\Bend`
Branch: `main`
Expected starting commit: `9bdd536c953b88f017084037677b634387278af`
Scope: local implementation and verification only; no remote push or deployment.

## Verdict

**PARTIAL.** The timing, cleanup, Chromium accessibility, regression, and local export gates are complete. The phase remains partial because Firefox cannot launch on this host, screen-reader and true 200% zoom checks were unavailable, and the performance evidence uses browser-exposed resource proxies rather than hardware/GPU instrumentation.

## Automated results

| Check | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS — project lint script is the TypeScript no-emit check |
| `npm test` | PASS — 9 files, 35 tests |
| `npm run build` | PASS — Vite production build, 2408 modules transformed |
| `git diff --check` | PASS |
| Chromium smoke | PASS — 18/18 |
| Chromium Phase 2A.1 timing/cleanup suite | PASS — after final targeted rerun |
| Chromium axe audit | PASS — zero violations in the covered rendered states |
| Chromium capability probe | PASS — Worker, OffscreenCanvas, worker WebGL, WebCodecs, and MediaRecorder capabilities recorded |
| Firefox browser execution | BLOCKED — installed Firefox exits with code `3221225506` before tests run |

No skipped test is counted as passing. The Firefox limitation is reported separately from the Chromium evidence.

## Phase 4 animation verification

The Phase 4 evaluator is covered by `tests/unit/animation.test.ts` and recipe application tests. Coverage includes hold/linear interpolation, shortest-path rotation, bounds, seeded smooth-noise determinism, layer-local time, stable temporal-effect instance mapping, and recipe normalization. Browser verification additionally covers the rendered diamond controls, timeline tracks, modulation editor, recipe workspace, and local persistence where the Phase 4 browser suite is available.

Gate Zero export evidence is recorded below only after the 10-second temporal composition, independent audio inspection, WebM capability/fallback check, and 2/5/10-second performance matrix complete. Unsupported browser/codec outcomes are reported as capability results; they are not converted into passes.

## Phase 4 Gate Zero evidence

The focused Chromium suite is `tests/browser/phase4-animation.spec.ts`. The rendered UI test passed in `23.8s`, covering inspector diamonds, two keyframes, modulation controls, timeline tracks, recipe preview/application, screenshot evidence, and reload persistence.

### A — temporal composition

`output/evidence/phase4/gate-zero-a-temporal-10s.mp4` passed the 10-second composition gate. The composition used a generated video layer with Time Slice and Motion Echo, bounded to four slices and two echoes for a reproducible export. Independent `ffprobe` reported H.264 video, `720 × 900`, `30/1`, `300` frames, and `10.000000s`. `blackdetect=d=0.25:pix_th=0.01` reported no black interval. A contact sheet of frames 0, 150, and 299 is saved at `output/evidence/phase4/gate-zero-a-contact.png`; all three frames contain visible signal texture and differ compositionally.

### B — temporal plus audio

`output/evidence/phase4/gate-zero-b-temporal-audio.mp4` passed the independent audio path. The browser reported `Source audio included`; `ffprobe` reported H.264 video at `720 × 900`, `30/1`, `60` frames, `2.000000s`, plus AAC mono audio at `48 kHz` with `2.005333s` duration. The audio and video both start at `0.000000s`; the small container duration extension is the encoded audio tail, not an unverified sync claim.

### C — WebM capability/fallback

The same Chromium run recorded `MediaRecorder.isTypeSupported` as `webmVp9=true`, `webm=true`, and `mp4=true`. The tested export selected the preferred Mediabunny MP4 path and reported `video/mp4; codecs="avc1.640c1f, mp4a.40.2"`. WebM fallback capability is therefore evidenced, but a forced encoder-fallback export was not claimed as a pass.

### D — 2/5/10-second performance matrix

All outputs were independently checked as 720 × 900, 30 FPS, and exact durations. Wall time includes browser interaction and encoding on this host:

| Duration | Frames | Export wall time | Heap proxy before → after | Artifact |
| ---: | ---: | ---: | ---: | --- |
| 2s | 60 | 4,512ms | 23,100,000 → 23,100,000 bytes | `gate-zero-d-2s.mp4` |
| 5s | 150 | 9,833ms | 23,100,000 → 23,100,000 bytes | `gate-zero-d-5s.mp4` |
| 10s | 300 | 18,270ms | 23,100,000 → 23,100,000 bytes | `gate-zero-d-10s.mp4` |

These are host-specific measurements, not a universal performance budget. No GPU memory, decoder allocation, physical-device FPS, or forced-GC result was available.

## Timing and fixture evidence

The reproducible fixture generator is [generate-phase2a1-fixtures.ps1](../tests/fixtures/generate-phase2a1-fixtures.ps1), with commands and independent inspection instructions in [PHASE_2A1_FIXTURES.md](../tests/fixtures/PHASE_2A1_FIXTURES.md). It creates:

- constant 24fps and 30fps MP4;
- fractional 29.97fps MP4;
- irregular VFR H.264 MP4 with packet timestamps `0, .0333, .1, .2, .3333, .5, .7, .9333`;
- VP9 video with a preserved first timestamp of `0.250000s`;
- delayed-audio MP4 whose audio starts at `0.228667s`;
- trimmed video/audio source;
- a 1280 × 720 performance source;
- a negative-start request whose WebM muxer actually normalized the result to `start_time=0.000000` (the report does not claim negative-start support).

The browser timing regression imports and exports the irregular VFR and nonzero-start fixtures through the Chromium Mediabunny path. The results were saved from the rendered blob and inspected with `ffprobe`:

| Case | Source evidence | Browser metadata | Export `ffprobe` |
| --- | --- | ---: | ---: |
| Irregular VFR | 8 frames, duration `0.966667s` | `0.966667s`, 720 × 900 | `0.966667s`, start `0.000000s` |
| Nonzero video start | first packet `0.250000s`, format `1.250000s` | `1.250000s`, 720 × 900 | `1.250000s`, start `0.000000s` |

The implementation keeps composition time at zero, applies clip placement and trim separately, adds the inspected source video start only for timestamped `CanvasSink` requests, and uses source timestamps rather than equal-duration frame assumptions. The final export sample is bounded to the composition duration. MP4 output no longer forces a 30fps timescale, which prevents fractional durations such as `1.25s` from being quantized down to `1.233333s`.

The supported Chromium decoder path is verified; this is not a universal frame-exact guarantee for every browser or codec. The HTML video seek path remains the compatibility fallback when Mediabunny cannot decode a track. A request before the first available decoded frame is an explicit export error rather than an invented frame.

## Worker feasibility

The capability probe created a dedicated Worker, created an `OffscreenCanvas`, and obtained WebGL in Chromium. It also recorded `MediaRecorder`, WebCodecs `VideoEncoder`/`AudioEncoder`, and Chromium's supported WebM/MP4 recorder types.

Decision: **retain the main-thread export path for now.** The current Pixi renderer is initialized from an `HTMLCanvasElement`, preview/export sources still own DOM-backed `HTMLVideoElement`s, and the current lifecycle/cancellation boundary is main-thread code. Moving only part of this path would create a second renderer/source implementation without evidence of output parity or a responsiveness gain. A future worker prototype must reuse the same compositor semantics, prove frame equivalence, preserve cancellation/cleanup, and show a measured improvement before adoption.

## Memory and performance

The detailed measurements are in [PERFORMANCE_REPORT.md](PERFORMANCE_REPORT.md). The key results are:

- ten repeated PNG export/close cycles: median `336ms`; canvas `1 → 1`, hidden videos `0 → 0`, dialogs `0 → 0`, reported heap `23,100,000 → 23,100,000` bytes in the final serial run;
- 1280 × 720 footage plus Wave Displacement: `2,656ms`, output `720 × 900`, `2.000000s`;
- importing/removing three clips: hidden videos `3 → 0`, canvas `1 → 1`, reported heap `23,100,000 → 23,100,000` bytes;
- 5s/10s/15s preview exports: `3,540ms / 7,165ms / 9,647ms`, independently verified as 150/300/450 frames and 5/10/15 seconds;
- current Chromium smoke baseline: `165ms` DOMContentLoaded, `167ms` load, callback FPS `25`, reported heap `15,200,000` bytes.

Object URLs are revoked when projects are replaced/cleared and when removed assets are no longer referenced. Hidden video elements, Mediabunny inputs, audio sources, Pixi resources, and renderer contexts have explicit release paths. Browser-internal GPU/decoder allocation and forced-GC behavior were not measurable here.

The final Vite build emitted a `246.78 kB` landing entry (`77.66 kB` gzip), `187.62 kB` editor chunk, `152.66 kB` Pixi renderer chunk, and `436.71 kB` Mediabunny/IndexedDB chunk.

## Accessibility findings

`@axe-core/playwright` runs WCAG 2.2 AA-tagged scans against landing, entry, generated editor, mobile inspector, timeline/inspector, export dialog, loaded footage/effects, and unsupported-import error states. The current Chromium scans report zero violations.

The remediation includes contrast correction, non-nested timeline semantics, 24px trim hit targets, explicit range labels and values, pressed/group semantics, dialog focus trap and focus return, accessible canvas/import labels, live export progress, and alert/status messaging. Manual Chromium keyboard tests pass for seeking, clip movement, trimming, Escape, and export focus return.

Reduced-motion CSS is present and the 390 × 844 mobile inspector state is tested. NVDA/another screen reader, a true 200% browser zoom pass, Firefox accessibility, physical touch, and forced-colors behavior remain unverified.

See [ACCESSIBILITY_REPORT.md](ACCESSIBILITY_REPORT.md).

## Firefox and codec compatibility matrix

| Capability or flow | Chromium evidence | Firefox evidence on this host | Interpretation |
| --- | --- | --- | --- |
| Dedicated Worker | supported | unavailable because Firefox exits before test execution | environment blocker |
| OffscreenCanvas + worker WebGL | supported | unavailable | environment blocker |
| `VideoEncoder` / `AudioEncoder` | present | unavailable | do not claim Firefox WebCodecs support here |
| MediaRecorder VP9/VP8/WebM | `true` for the tested types | unavailable | Chromium fallback capability only |
| MP4 H.264/AAC export | exported and independently inspected | not claimed | verified Chromium path |
| WebM import and Wave Displacement | passed with local WebM fixture | unavailable | Chromium import path verified |
| PNG, generated editor, timeline, persistence | passed in Chromium | unavailable | no current Firefox claim |

The nine browser-name-gated cases inherited from the prior matrix are: Chromium render baseline, short video export, 5/10/15-second export, high-quality canvas export, cancellation, multi-layer video export, compatible-audio export, muted-audio export, and imported-video export. They remain intentionally Chromium-only because the application uses runtime codec checks and a WebM fallback rather than a heavyweight transcoder. On this host, Firefox could not reach any of those tests; they are not counted as passes. The export UI continues to state “MP4 when supported · WebM fallback” and labels outputs without included audio as video-only.

## Phase 2B procedural-motion verification

Date: 2026-10-13
Starting commit: `8af8c305fe8686a7dcd6b12b640c142bf2e030f1`
Scope: local implementation only; no push or deployment.

| Check | Result |
| --- | --- |
| `npm test` | PASS — 7 files, 25 tests |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| Phase 2B Chromium generator-library test | PASS — four cards, thumbnails, presets, grouped controls, seed randomization, and dynamic labels |
| Phase 2B Chromium still-export test | PASS — short PNG export for Signal Field, Liquid, Flow, and Refraction; console/page errors asserted empty |
| Existing generated-editor PNG smoke | PASS — after entering the explicit Generate workspace |
| Firefox Phase 2B execution | UNVERIFIED — Firefox cannot launch on this host |
| Hardware/GPU profiling | UNVERIFIED — browser proxy measurements only |

The rendered artifacts inspected were `output/playwright/chromium-mobile-editor.png` at 390 × 844 and `output/playwright/chromium-phase2b-library.png` at the desktop test viewport. The mobile image showed the registry library, thumbnails, preset controls, and narrow inspector without horizontal overflow. The desktop image showed the Liquid controls after a generator switch and exposed a stale Signal Field timeline label; that label was corrected and the browser assertions now verify the active generator name in the timeline and canvas selection path.

The strict GPU-fluid acceptance boundary remains partial: Liquid uses a deterministic CPU fixed-grid solver whose output is uploaded as a low-resolution Pixi texture. The audited reference, adaptation, and upgrade requirements are recorded in [PROCEDURAL_ENGINE_AUDIT.md](PROCEDURAL_ENGINE_AUDIT.md). No claim is made here for physical-device performance, cross-driver pixel identity, Firefox rendering/export, screen-reader behavior, or true 200% zoom.

## Audio decision

The recommendation is to retain the current deterministic primary-source policy. The topmost visible, unmuted video layer is the only audio candidate; trim and timeline placement are preserved, hidden/muted layers contribute no audio, overlaps are reported as omitted, and unavailable audio is labeled video-only. The comparison of retained policy, deterministic multi-source mixing, and future audio-tool delegation is in [AUDIO_DECISION.md](AUDIO_DECISION.md). No mixer was added in this phase.

## Regression coverage

The local Chromium regression suite covers generated Signal Field projects, real video upload, WebM import, multiple clips with constant 24fps and 30fps sources, Wave Displacement, layer reorder/selection, trim and seek, playback controls, audio preservation, mute/video-only export, MP4 export, PNG export, cancellation, project reload, accessibility/error states, keyboard controls, and resource cleanup. Unit coverage remains green for project migration, timeline/source mapping, media helpers, generator behavior, store behavior, export frame-count/audio timestamp behavior, and the existing schemas.

## Phase 2B readiness

BEND is ready for a controlled review of the Phase 2B advanced procedural-motion scope, but not for a claim of fully cross-browser hardening. The current rendering/export foundation should remain frozen while Firefox, screen-reader, true 200% zoom, and representative hardware profiling are scheduled. No Phase 2B feature work was started in this checkpoint.

## Phase 2B Gate Zero: independent video export verification

Date: 2026-10-13
Browser: Chromium, real local browser process
Test: `tests/browser/phase2b-export.spec.ts` — **PASS, 1.4 minutes**

The gate rendered each procedural generator for five seconds at 30 FPS, performed the Liquid backward-seek/re-export path, reloaded the saved project after each generator, and verified the rendered export metadata in the browser. Independent `ffprobe` inspection of the saved files reported the following for every output: H.264 video, `720 × 900`, `30/1`, `150` frames, `5.000000s`, start `0.000000s`.

| Generator | Saved artifacts | Independent visual checks |
| --- | --- | --- |
| Signal Field | `output/evidence/phase2b/signal-field-main.mp4` | Beginning/middle/end extracted frames differ; no `blackdetect` interval |
| Liquid | `output/evidence/phase2b/liquid-before.mp4`, `liquid-after-seek.mp4` | Beginning/middle/end are animated; paired exports SSIM `All: 0.998755`; no black interval |
| Flow | `output/evidence/phase2b/flow-main.mp4` | Beginning/middle/end contain visible moving stream texture after a shader visibility repair; no black interval |
| Refraction | `output/evidence/phase2b/refraction-main.mp4` | Beginning/middle/end extracted frames differ; no `blackdetect` interval |

The Flow export initially exposed a real near-black defect that metadata and a PNG-only smoke check missed. The Phase 2B shader was corrected and the full five-second gate was rerun. Liquid is deterministic within the measured encoded comparison tolerance; it remains the documented CPU fixed-grid solver whose output is uploaded to a GPU texture, not a full GPU multipass fluid simulation.

## Phase 3 temporal-effects verification

Phase 3 implementation starts from `b1f3ee580fc95bdf370697bc91f3692a3d88b488` (`b1f3ee5 feat: add Phase 2B procedural motion engine`). The focused automated results are:

| Check | Result |
| --- | --- |
| Temporal unit suite | PASS — 5 tests |
| Full unit suite | PASS — 8 files, 30 tests |
| TypeScript no-emit | PASS |
| Vite production build | PASS — 2403 modules transformed |
| Chromium temporal library/control/persistence test | PASS — 1 test, 12.7s |
| Chromium temporal export test | PASS — 1 test, 38.0s |
| Chromium temporal seek/nonzero-source regression | PASS — 2 tests, 15.0s; backward replay plus `1.250000s` / 38-frame nonzero-start export |
| Firefox temporal execution | UNVERIFIED — Firefox exits before test execution on this host |

The temporal export test used `tests/fixtures/test-pattern.mp4`, a moving color-bar/timecode clip, and wrote:

- `output/evidence/phase3/temporal-base.mp4`
- `output/evidence/phase3/motion-echo.mp4`
- `output/evidence/phase3/time-slice.mp4`
- `output/evidence/phase3/frame-feedback.mp4`
- `output/evidence/phase3/channel-delay.mp4`
- `output/evidence/phase3/stacked-time-slice-motion-echo.mp4`
- `output/evidence/phase3/frame-feedback-after-backward-seek.mp4`
- `output/evidence/phase3/time-slice-nonzero-source.mp4`

Independent `ffprobe` reported `720 × 900`, `30/1`, `60` frames, and `2.000000s` for each. `blackdetect` reported no black intervals. Compared with the unaffected export, encoded-frame SSIM was `0.843515` Motion Echo, `0.949491` Time Slice, `0.954288` Frame Feedback, `0.917309` Channel Delay, and `0.855011` for the stacked clip. These are visual-difference indicators, not quality scores; the extracted frames are the primary evidence that the effects are visible.

The inspector test confirms four temporal entries, four functional presets per effect, real parameter controls, ordered stack rows, enable/disable/remove actions, and a saved Motion Echo stack restored after reload. The engine tests cover timestamp mapping, clamping, normalization, registry/preset coverage, feedback ordering, and bounded cache eviction. The expanded browser evidence covers a backward scrub followed by a fresh Frame Feedback export and a Time Slice export from the `1.250000s` nonzero-start WebM fixture. Preview cancellation was also exercised indirectly by reload and parameter updates; the CanvasStage now aborts stale temporal evaluations.

## Phase 3 acceptance gaps

This is **PARTIAL**, not a universal cross-browser or performance sign-off. The Phase 4 Gate Zero now covers a 10-second two-temporal-effect export, imported-audio temporal export, WebM capability, and the 2/5/10-second matrix. The 1080p/4:5/1:1/9:16 matrix, forced WebM fallback export, measured preview FPS, GPU memory, and physical-device profiling remain open. Firefox execution, manual screen-reader testing, true 200% zoom, and hardware/GPU profiling remain inherited open items. Frame Feedback uses bounded Canvas 2D ping-pong state rather than a GPU multipass render-texture implementation, and Wave Displacement is intentionally fixed after the temporal stack; both boundaries are documented in [TEMPORAL_FX_ARCHITECTURE.md](TEMPORAL_FX_ARCHITECTURE.md).

## Phase 5 product-experience verification

The Phase 5 implementation starts from `a22134b0b5d19e12281ecec776c0bb6eefb94a8a` (`a22134b feat: add keyframe motion system and recipes`). Fresh local checks are:

| Check | Result |
| --- | --- |
| Full unit suite | PASS — 9 files, 36 tests |
| TypeScript no-emit | PASS |
| Lint command | PASS — project lint is the TypeScript no-emit check |
| Vite production build | PASS — 2,408 modules transformed |
| Direct Chrome product journey | PASS — landing, entry, sample, Motion, timeline, PNG, video, reload, mobile, and tablet |
| Axe accessibility scans | PASS — six states, zero violations |
| PNG export | PASS — live sample frame, 1080 × 1350 |
| Video export | PASS — live sample, H.264 MP4, 720 × 900, 30 FPS, 8.000 seconds |
| Repository Playwright runner | UNVERIFIED — configured sandbox browser executable unavailable on this host |
| Firefox execution | UNVERIFIED — browser cannot launch on this host |

The direct journey evidence is under `output/evidence/phase5/`, with the machine-readable summary in `verification.json`. The example-project unit test asserts the two-layer structure, Motion Echo effect, multiple keyframes, and deterministic modulation rather than only asserting that a project object exists. The full release boundary, including manual accessibility and hardware limitations, is in [RELEASE_READINESS.md](RELEASE_READINESS.md).

## Phase 6A verification — 2026-10-13

| Check | Result |
| --- | --- |
| Portable-package unit coverage | PASS — 6 tests for round trip, binary preservation, incomplete/malformed/future packages, limits, and source revisions |
| Full unit suite | PASS — 10 files, 42 tests |
| TypeScript / lint | PASS — `tsc --noEmit` |
| Production build | PASS — 2,413 modules transformed |
| Direct system Chrome integration journey | PASS — host route, rendered video, host placement preservation, 1:1 switch, still, save/reload, editable source, update, cancel, fresh import, injected quota failure, and zero console errors |
| Independent media inspection | PASS — H.264 MP4 `720×900`, 30 fps, 2.000 s; PNG `1080×1350` |
| Bundled Playwright runner | UNVERIFIED — host port/browser environment did not complete the configured run |
| Firefox / manual screen reader / true 200% / touch / hardware profiling | UNVERIFIED — retained from existing release gates |

The new repository regression coverage is `tests/browser/phase6a.spec.ts`; the fallback browser script is `tests/manual/phase6a.mjs`. Their machine-readable output and downloadable artifacts are under `output/evidence/phase6a/`. Measured local values were 21,594 ms for initial host handoff, 12,327 ms for the round-trip update, 750 ms to create the 18,242-byte editable package, and 1,219 ms to restore it in a fresh browser context. Peak memory was not measured. Full acceptance notes and open gates are in [PHASE6A_TEST_REPORT.md](PHASE6A_TEST_REPORT.md).

## Phase 5.1A unified studio verification — 2026-10-13

Scope: direct studio route, empty/recent project startup, one Add flow, contextual inspector sections, responsive shell, and preservation of the existing renderer/engine boundaries. No push or deployment was performed.

| Check | Result |
| --- | --- |
| Baseline unit suite before implementation | PASS — 10 files, 42 tests |
| `npm run typecheck` after implementation | PASS |
| `npm run build` after implementation | PASS — 2,410 modules transformed |
| Direct local Vite build preview | PASS — live shell served at `127.0.0.1:4173` |
| Installed system Chrome manual harness | PASS — `tests/manual/phase5-1a.mjs`; fresh context, direct root, Add → Signal Field, Effects, Motion, mobile controls, zero errors |
| Root `/` direct studio journey | PASS — existing project restored in the studio; no landing/entry screen mounted |
| Empty composition journey | PASS — new project remains in the editor with Add video, Generate motion, Open First Study, inspector, and timeline |
| Unified Add flow | PASS — local video action, four generators, and editable First Study menu items observed |
| Contextual inspector | PASS — Edit, Effects, and Motion rendered in the same right-side surface |
| Generator add journey | PASS — Signal Field added from Add, selected, rendered, and exposed existing generator controls |
| Responsive rendered checks | PASS — 768×1024 and 390×844; document/body width matched viewport |
| Browser console errors during direct checks | PASS — 0 errors; repeated project changes emitted existing PixiJS cleanup warnings |
| Repository Playwright runner | UNVERIFIED — configured headless Chromium executable is absent on this host |
| Firefox / axe / screen reader / true 200% / physical touch / hardware profiling | UNVERIFIED — retained/open environment gates |

Rendered evidence is under `output/evidence/phase5-1a/`: `unified-empty-seafoam.png`, `unified-add-menu.png`, `unified-generator.png`, `unified-effects.png`, `unified-motion.png`, `unified-tablet.png`, and `unified-mobile-controls.png`. The dedicated regression file is `tests/browser/phase5-1a.spec.ts`; it is typechecked but could not execute through the repository runner because Playwright reported a missing `chrome-headless-shell.exe`. Direct browser evidence was collected through the available local browser surface.

## Phase 5.1B visual identity verification — 2026-10-13

Scope: white-first visual identity overhaul of the active unified studio. No push or deployment was performed. Existing PixiJS, generator, effects, animation, recipes, export, persistence, and host boundaries were preserved.

| Check | Result |
| --- | --- |
| Baseline unit suite before visual changes | PASS — 10 files, 42 tests |
| `npm run typecheck` after visual changes | PASS |
| `npm run build` after visual changes | PASS — 2,411 modules transformed; existing large-chunk warning remains |
| Installed system Chrome manual harness | PASS — `tests/manual/phase5-1b.mjs`; empty, Add, Liquid, Effects, First Study/Motion, recipe library, export dialog, imported footage, error recovery, confirmation dialog, tablet, and mobile |
| Browser console/page errors in the harness | PASS — 0 |
| Axe WCAG 2.0 A/AA scans | PASS — empty, effects, new-project dialog, motion, and export; zero violations |
| Responsive rendered checks | PASS — 768×1024 and 390×844 document/body widths match viewport |
| Before/after contact sheet | PASS — `output/evidence/phase5-1b/before-after-contact-sheet.png` |
| Bundled repository Playwright runner | UNVERIFIED — configured browser executable unavailable on this host |
| Firefox / manual screen reader / true 200% / physical touch / forced colors / hardware GPU | UNVERIFIED |
| Fresh full MP4/audio/cancellation acceptance | UNVERIFIED in this visual-only phase; prior runtime evidence remains applicable |

The machine-readable result is `output/evidence/phase5-1b/verification.json`. The required live screenshots are listed in [PHASE5_1B_VISUAL_QA.md](PHASE5_1B_VISUAL_QA.md); the visual inventory and remaining issues are in [VISUAL_REDESIGN_AUDIT.md](VISUAL_REDESIGN_AUDIT.md).

## Phase 5.1C interaction motion verification — 2026-10-13

Scope: bounded React DOM motion and direct timeline interaction feedback. Existing PixiJS preview/export, animation evaluation, persistence, and host boundaries were preserved.

| Check | Result |
| --- | --- |
| Final unit suite | PASS — 10 files, 42 tests |
| `npm run typecheck` | PASS |
| `npm run build` | PASS — 2,823 modules transformed; existing large-chunk warning remains |
| Targeted system-Chrome motion runner | PASS — `tests/manual/phase5-1c-motion.mjs`; 1440×980 and 390×844; zero console/page errors |
| Rapid inspector interruption | PASS — Edit → Effects → Motion → Edit |
| Add/dialog/drawer presence | PASS — open, close, settled states captured |
| Timeline track reveal | PASS — collapse and expand sequences captured |
| Direct layer reorder | PASS — order changed and undo/redo returned the expected states |
| Direct keyframe movement | PASS — keyframe moved from `0:00.00` to `0:02.55` |
| Reduced motion | PASS — explicit reduced-motion context observed and exercised |
| Settled axe scans | PASS — inspector, export dialog, mobile drawer, reduced-motion effects: zero violations |
| Pixi canvas presence | PASS — canvas observed during the targeted motion run |

Evidence is under `output/evidence/phase5-1c/`; the machine-readable result is `output/evidence/phase5-1c/verification.json`. The configured repository Playwright browser, Firefox, manual screen reader/200%/touch/forced-colors review, physical-device behavior, hardware/GPU profiling, and full media/audio/cancellation acceptance remain unverified. The dependency install reported one moderate and two critical npm audit advisories; no automatic audit fix was run.

## Phase 5.1D direct manipulation verification — 2026-10-13

Scope: direct layer selection, geometry, transform editing, crop, anchor/orientation, color adjustments, Auto-Key integration, persistence boundaries, and shared preview/export parity. Starting SHA: `6a601e156f66f58bcbfb712dda448cae763773f6`.

| Check | Result |
| --- | --- |
| Unit suite | PASS — 11 files, 52 tests |
| TypeScript no-emit | PASS |
| Production build | PASS — 2,824 modules transformed; existing large-chunk warning remains |
| Pure transform geometry | PASS — affine round-trip, anchor preservation, crop aspect, rotated bounds, snap angle |
| Store transactions | PASS — one gesture history boundary and crop rollback |
| Chromium direct-editing suite | PASS — 4/4 assertions reported pass: controls, direct move/responsive inspector, PNG, H.264 MP4 |
| Edited still artifact | PASS — valid PNG, 750,106 bytes |
| Edited video artifact | PASS — H.264 MP4, 720 × 900, 0.500000s, 216,657 bytes |
| Firefox / bundled runner clean shutdown | UNVERIFIED — Firefox unavailable; Chromium assertions completed but cleanup did not return a final summary |
| Manual accessibility / touch / forced colors / true 200% | OPEN |
| Hardware/GPU/decoder profiling | OPEN |
| Dependency audit | PARTIAL — one moderate and two critical dev-chain advisories; no automatic major upgrade |

The detailed scenario matrix is in [PHASE5_1D_EDITING_QA.md](PHASE5_1D_EDITING_QA.md); geometry/render order is in [DIRECT_MANIPULATION_ARCHITECTURE.md](DIRECT_MANIPULATION_ARCHITECTURE.md).

## Phase 5.2 independent first-time user verification — 2026-10-14

Scope: fresh Chrome customer walkthrough, generator/effect discoverability, direct manipulation, persistence, cancellation, real media export, visual/accessibility retest, and product-quality fixes. Starting SHA: `187126c9cc62c2bdeb077b387b67579c9d12a19b`.

| Check | Result |
| --- | --- |
| `npm test` | PASS — 11 files, 52 tests |
| `npm run typecheck` | PASS |
| `npm run build` | PASS — 2,824 modules transformed; existing large-chunk warning remains |
| `git diff --check` | PASS |
| Installed Google Chrome fresh-profile journey | PASS — generator, real MP4 import, effect, keyframe/modulation, recipe, export |
| Generator coverage | PASS — Signal Field, Liquid, Flow, Refraction; four presets each |
| Effect coverage | PASS — Motion Echo, Time Slice, Channel Delay, Frame Feedback, Wave Displacement |
| Direct editing | PASS for covered controls — rotate, flip, crop cancel, lock, undo/redo |
| Persistence | PASS for covered flow — generator and footage restored after reload |
| Export cancellation | PASS — cancellation UI appeared and no page error was recorded |
| PNG export | PASS — real 1080 × 1350 PNG |
| MP4 export | PASS — real 8.000s H.264/AAC, 720 × 900, 30 FPS, source audio present |
| Late-frame visual inspection | PASS — sampled frames 0, 90, and 180 remained visibly rendered |
| Axe | PASS for six covered states — zero violations |
| Responsive overflow | PASS — no horizontal overflow at 1440, 1280, 1024, 768, or 390 widths |
| Repository browser suite | BLOCKED before execution — missing configured headless Chromium executable |
| Manual screen reader / true 200% / forced-colors / physical touch | OPEN |
| GPU/decoder/heap instrumentation | OPEN |
| Pixi teardown warnings | OPEN — two warnings remain in normal export teardown; output and page errors are clean |

Machine-readable evidence is in `output/evidence/phase5-2/reports/`. The independent media artifacts are `output/evidence/phase5-2/functional/phase5-2-workflow-export.mp4` and `phase5-2-representative-frame.png`. Do not treat the direct installed-Chrome harness as a replacement for the blocked repository browser suite; the two results have different coverage boundaries.
