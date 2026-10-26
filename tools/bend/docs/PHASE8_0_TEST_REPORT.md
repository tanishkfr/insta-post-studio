# BEND. Phase 8.0 — Test Report

Date: 2026-10-26  
Machine: AMD Ryzen 7 7840HS (8C/16T), 15.2 GB RAM, Windows, Radeon 780M + RTX 4060 Laptop  
Build under test: source snapshot described in `PHASE8_0_SOURCE_IDENTITY.json`; deployed runtime identity in `PHASE8_0_DEPLOYED_SOURCE_IDENTITY.json`  
Final preview: `https://bend-7osa45a8v-tanishkfrs-projects.vercel.app`  
Deployment: `dpl_8rb7hZUfA5Fq59kDDnbGZYoTKy5p` (`preview`, READY)

## 1. Development and verification commands

| Check | Command | Result |
|---|---|---|
| TypeScript | `npm run typecheck` | PASS |
| Unit tests | `npm test` | PASS — 18 files, 115 tests |
| Production build | `npm run build` | PASS |
| Local browser gate | `npm run test:browser` | PASS — 13 passed, 3 intentionally skipped |
| Deployed Phase 8 smoke | `playwright test -c playwright.deployed.config.ts tests/deployed/deployed-phase8.spec.ts --grep '@smoke'` | PASS — Chrome, Edge, Firefox, WebKit |
| Deployed full edit/export | same, `--project=chrome --grep '@full'` | PASS |
| Axe WCAG 2.0/2.1 A/AA | editor + export dialog + mobile shell | PASS — zero violations in all three |
| Media inspection | `ffprobe`/`ffmpeg`, frame extraction, Goertzel audio checks | PASS |

No production alias, git commit, tag, push, or release was performed.

## 2. Unit coverage added or updated

`tests/unit/phase80.test.ts` (9 tests):

- Constant speed and freeze duration mapping.
- Monotonic speed-ramp mapping and split-curve preservation.
- Six-second split into independent shared-source segments with animation continuity.
- Effects preserved on both halves and downstream transition relinking.
- Ordinary delete vs ripple delete, close gap, duplicate at sequence end.
- Magnetic reorder and video z-order.
- Genuine-overlap transition visual/audio contribution and clean removal.
- Schema 2 → 3 migration with safe defaults.
- Color/cover/safe-area/soundtrack normalization.

Other additions:

- Range rounding: 15.000000000000002 s at 30 FPS produces 450 frames.
- Audio asset record preserves probed duration.
- Media inspection no longer overwrites video duration.

All 115 tests pass. Historical Phase 7 behavior tests continue to pass, including loop clamping, mask-track retention, undo selection reconciliation, storage revisions, package integrity and host revisions.

## 3. Local browser coverage

Final local gate (`npm run test:browser`):

- Chromium and Firefox projects.
- 13 passed, 3 skipped (video-codec-specific cases not applicable to Firefox local test project by design).
- Editing, save/reload, direct route, timeline keyboard, still export, video export, soundtrack duration, audio mixing, cover PNG, mobile horizontal overflow.

Additional local probes:

- Import → split → ripple → transition → speed → save/reload → export.
- Undo/redo after split and transition restored the expected clip counts.
- Reverse export: 6.00 s, 180 frames.
- Speed-ramp export: 4.80 s, 144 frames; playback rendered without exceptions.
- Selected range export: 0.5–1.5 s produced exactly 30 frames and a 1.00 s output.
- Muted export: video-only, no audio stream; visible warning.
- Transition matrix export: dissolve, black dip, wipe, zoom, glitch and distortion.
- 16:9 cover PNG: 1920×1080 and no guide overlay.
- Audio monitor: active clip unmuted, soundtrack at −6 dB, pause stops soundtrack.
- Mobile 390×844: `scrollWidth == innerWidth`; sequence/music lanes usable.

## 4. Browser capability matrix

| Browser | Version | Video import | Preview | MP4/AAC export | WebM export | Result |
|---|---:|---|---|---|---|---|
| Chrome | 155.0.8059.85 | PASS (H.264/AAC) | PASS | PASS | supported | Full acceptance |
| Edge | 156.0.4314.42 | PASS (H.264/AAC) | PASS | PASS | supported | Full acceptance |
| Firefox | 157.0 | PASS (H.264/AAC fixture) | PASS | Not available (AAC encoder absent) | PASS (VP9/Opus) | Supported with explicit WebM fallback |
| WebKit | 27.2 (Windows build) | BLOCKED — no video codec path in this build | Procedural preview PASS | BLOCKED | BLOCKED | Procedural PNG workflow verified; video messaging remains explicit |
| macOS Safari hardware | not available | BLOCKED | BLOCKED | BLOCKED | BLOCKED | Not claimed |

Firefox emitted a WebGL lazy-texture warning and an intermittent “Error parsing AVC SPS” console message while decoding the H.264 test fixture, but exported WebM frames were non-empty and visually correct. This remains a Firefox warning/coverage caveat, not an exported-file failure.

## 5. Deployed acceptance

Final preview URL and deployment in the header. Protection remained enabled; automation used the existing project bypass secret outside the repository and bootstrapped a scoped cookie on one request.

### Deployed test suite

| Test | Browser(s) | Result |
|---|---|---|
| Direct load, refresh, procedural composition, compact music/sequence surfaces | Chrome, Edge, Firefox, WebKit | PASS |
| Import → split → transition → speed → soundtrack → save → reload → export with mixed audio | Chrome | PASS |
| Mobile shell sequence/Inspector access, no horizontal overflow | Pixel 7 emulation | PASS |
| Project A package restore + high-quality export | Chrome | PASS |
| Project B package restore + quick export | Chrome | PASS |
| Project C package restore + quick export + cover PNG | Chrome | PASS |
| Project D Phase 7 package, exact frame compare + edited package restore/export | Chrome | PASS |
| Deployed split + ripple + Alt+Arrow reorder + reload | Chrome | PASS |

### Independently inspected deployed media

Files are under `output/acceptance/`. All were produced by the final preview and inspected independently with FFprobe/FFmpeg.

| File | Container | Video | Dimensions | FPS | Frames | Duration | Audio |
|---|---|---|---:|---:|---:|---:|---|
| `final-deployed-project-a.mp4` | MP4 | H.264 | 1080×1920 | 30 | 450 | 15.00 s | AAC 48 kHz stereo |
| `final-deployed-project-b.mp4` | MP4 | H.264 | 720×1280 | 30 | 300 | 10.00 s | AAC 48 kHz stereo |
| `final-deployed-project-c.mp4` | MP4 | H.264 | 720×1280 | 30 | 900 | 30.00 s | AAC 48 kHz stereo |
| `final-deployed-project-d.mp4` | MP4 | H.264 | 720×1280 | 30 | 312 | 10.40 s | AAC 48 kHz stereo |
| `final-deployed-project-c-cover.png` | PNG | RGB | 1080×1920 | — | 1 still | 15.00 s frame | — |

Audio content was checked by decoding to mono 48 kHz, measuring RMS and running Goertzel power checks at the source tones. Project C’s 30 s mix showed:

| Section | Time | RMS | Expected tone check |
|---|---:|---:|---|
| Clip A | 2.0 s | −17.83 dB | 440 Hz present |
| A→B transition | 5.75 s | −18.24 dB | 440 Hz reduced during crossfade |
| B1 | 6.5 s | −17.83 dB | 554 Hz present |
| B2 | 9.0 s | −17.82 dB | 554 Hz present |
| C slow motion | 13.0 s | −17.82 dB | 527 Hz present; original 659 Hz absent |
| D | 18.5 s | −17.93 dB | 330 Hz present |
| Form 02 | 23.0 s | −17.83 dB | 523 Hz present |
| Form 01 | 27.5 s | −17.83 dB | 392 Hz present |

Head and tail remained non-silent (−21.22 dB / −22.51 dB), consistent with clip/music fades. This confirms mixed clip audio, soundtrack presence, timeline placement and slow-motion resampling rather than merely checking for an audio stream.

Reverse audio was rechecked on the final preview: first half contained 880 Hz and essentially no 440 Hz; second half contained 440 Hz and essentially no 880 Hz.

### Transition evidence

- Crossfade: red/blue source-over export showed red → purple → blue, with both source audio tones present during the overlap.
- Black dip: exported midpoint was fully black.
- Wipe/zoom: exercised in Project A’s final 450-frame export.
- Glitch: exported midpoint showed RGB split/scan disturbance.
- Distortion: exported patterned footage showed the expected wave-warped transitional frames.
- Transition filters use the shared Pixi renderer, not a preview-only implementation.

### Cover evidence

- Cover timestamp persisted at 8.00 s (A), 4.00 s (B), 15.00 s (C), 7.20 s (D).
- Deployed Project C cover PNG was 1080×1920.
- The cover still was compared with a frame decoded from the 30 s video at 15 s; PSNR ≈ 35.2 dB after video compression, consistent with the same rendered frame.
- Guides are DOM-only; a 16:9 guide-on export was 1920×1080 and contained no guide lines.

### Legacy evidence

Phase 7 package `project-a-experimental-reel.bendpkg` was opened, edited and round-tripped. At exact 2.00 s, before-edit and after-package-restore canvas SHA-256 were both:

`1d62044d209e74a95eea6c714f2b4d631542771d3bdfb46b757246ee5acdd4c6`

This is a byte-identical canvas PNG, not a similarity claim.

## 6. Accessibility

Axe scans (WCAG 2.0/2.1 A/AA):
- Full desktop editor with a multi-clip Project A package: zero violations.
- Export dialog: zero violations.
- 390 px mobile shell: zero violations.

A serious nested-interactive violation found during development was fixed by replacing the interactive clip card with a group containing a select button and sibling trim/transition controls.

Keyboard paths verified:
- Space play/pause.
- S split.
- Delete ordinary delete; Shift+Delete ripple delete.
- Alt+Left/Right clip reorder.
- Arrow keys on focused trim handles.
- Existing keyframe copy/paste/duplicate/delete and easing paths.
- Focus-visible styling added for clip cards and controls.

Not manually verified: real screen-reader sessions and physical-device touch gestures. Automated axe/keyboard/touch-emulation coverage is not a substitute.

## 7. Performance observations

Measured on this machine, local Chromium, four-clip 21 s montage, 1080×1350:

- Paused seek completion, `data-render-ms`: 20.9, 56.4, 48.7, 18.8 ms; median 48.7 ms.
- Playback samples: median 2.7 ms of Pixi work after media sync; not an FPS guarantee.
- Speed-ramp playback sample: 75 ms render after a seek-heavy ramp request; frame-stepped ramp preview is intentionally slower than constant-speed playback.
- Export completions validated: 450 frames at 1080×1920; 900 frames at 720×1280; 300/312-frame projects; reverse 180 frames; ramp 144 frames.
- Heavy nested temporal stacks remain slow. Phase 7’s bounded caches, slow-render warning and cancellable preview pump are intact; no GPU temporal rewrite was attempted.
- The 650 kB `portableProject` chunk warning remains. It includes source/package and decoder-adjacent code; it is loaded only for package operations, not the main editor route.

No fixed real-time FPS promise is made for arbitrary hardware or pathological effect stacks.

## 8. Acceptance matrix

| ID | Requirement | Status | Evidence |
|---|---|---|---|
| 8-01 | Protected Phase 7 source baseline | PASS | Pre-implementation snapshot and SHA-256 manifest; Phase 7 identity restored after an early tooling overwrite |
| 8-02 | Backward-compatible multi-clip project model | PASS | Schema 3 migration tests; Phase 7 package exact frame hash |
| 8-03 | Split at playhead | PASS | Unit, local browser, deployed full test; shared source IDs |
| 8-04 | Ripple deletion and gap closing | PASS | Unit, local UI, deployed UI; unrelated tracks unaffected |
| 8-05 | Clip movement and sequencing | PASS | Magnetic reorder, free placement, Alt+Arrow, deployed reload |
| 8-06 | Timeline snapping and thumbnails | PASS | Snap toggle, magnetic/free contracts, shared lazy thumbnail decoder |
| 8-07 | Crossfade and fade transitions | PASS | Exported dissolve + black dip; audio crossfade measured |
| 8-08 | Wipe, zoom and creative transitions | PASS | Project A/transition matrix exports; glitch/distortion verified |
| 8-09 | Adjustable clip speed | PASS | 1.25×/1.5×/0.5×/0.8× projects; durations/frames correct |
| 8-10 | Reverse and freeze-frame | PASS | Deployed reverse export; freeze media/audio policy tested |
| 8-11 | Speed ramping | PASS | Unit math + local/deployed 4.80 s/144-frame exports |
| 8-12 | Clip-level audio controls | PASS | Gain/mute/fades UI and saved project; muted export has no stream |
| 8-13 | Basic audio mixing | PASS | Overlapping clips and transition audio measured in final 30 s file |
| 8-14 | Local soundtrack and fades | PASS | 32 s local MP3, true duration, gain/fades, final mix |
| 8-15 | Audio/video synchronization | PASS | Section tones matched 30 s timeline; head/tail non-silent |
| 8-16 | Expanded color finishing | PASS | Shader controls; two treatments on split source exported |
| 8-17 | Color looks/presets | PASS | Six real-control looks; replace/undo behavior |
| 8-18 | Social canvas presets | PASS | 9:16, 4:5, 1:1, 16:9; 16:9 cover validated |
| 8-19 | Safe-area overlays | PASS | DOM-only guides; exported cover contained no guides |
| 8-20 | Cover-frame selection | PASS | Persisted timestamps; 1080×1920 cover; source frame comparison |
| 8-21 | Reliable output profiles | PASS | Validated MP4/AAC on Chrome/Edge; explicit WebM/VP9+Opus fallback on Firefox; WebKit limitation explicitly reported |
| 8-22 | Existing creative-tool compatibility | PASS | Signal Field/Flow, masks, blends, temporal effect, recipes and package tests |
| 8-23 | Undo/redo and persistence | PASS | Split/transition undo-redo probes; autosave/reload and final deployed reload |
| 8-24 | Legacy migration | PASS | Schema tests and exact legacy frame hash |
| 8-25 | `.bendpkg` round-trip | PASS | Soundtrack, masks, effects, transitions and cover survived restore |
| 8-26 | Acceptable measured performance | PASS | Basic 4-clip seek/render measurements; 15 s/30 s exports |
| 8-27 | Accessible UI and keyboard paths | PASS | Axe zero; keyboard split/delete/reorder/trim; focus-visible |
| 8-28 | Vercel preview acceptance | PASS | Preview deployment ID/URL; Chrome/Edge/Firefox/WebKit smoke; Chrome full |
| 8-29 | Creator Projects A–D | PASS | All four built, saved, packaged and exported; final deployed exports inspected |
| 8-30 | Maintained regression suite and documentation | PASS | Unit/browser/deployed specs and Phase 8 documentation set |

## 9. Residual risks not reclassified as passes

- Heavy nested temporal stacks remain intentionally unoptimized.
- Real Safari hardware and macOS WebCodecs behavior are untested.
- Firefox emitted WebGL warnings and an AVC SPS console message while still producing correct WebM frames.
- Real screen-reader and physical-touch testing are incomplete.
- Cross-browser export uses different codec containers; no universal MP4 claim is made.
- Platform safe-area zones are approximate editing aids, not platform guarantees.
- Audio pitch is not preserved under speed changes; reverse/freeze policies are explicit, not transparent.
