# BEND. Phase 8.1 — Test Report

Date: 2026-10-26  
Checkout: `C:\Dev\Projects\Bend`  
Git HEAD: `343260bb048a111475216ef2141eb5b89144de75` (working tree dirty; no commit/push)  
Final preview and deployment: see `PHASE8_1_DEPLOYMENT.md`.

## 1. Build and development gates

| Check | Command | Result |
|---|---|---|
| TypeScript | `npm run typecheck` | PASS |
| Unit tests | `npm test` | PASS — 19 files, **129 tests** |
| Production build | `npm run build` | PASS — Vite 29.7 s process; `portableProject` chunk remains 652.31 kB (warning) |
| Local browser gate | `npm run test:browser` | PASS — 23 passed, 3 intentionally skipped, ~2.7 min |
| Dependency audit | `npm audit` | PASS — 0 vulnerabilities after tested Vitest 4.1.12 dev upgrade |
| Source manifest | `npm run identity:source` | PASS — `docs/PHASE8_1_SOURCE_IDENTITY.json` |
| Deployed source manifest | `npm run identity:deployment` | PASS — `docs/PHASE8_1_DEPLOYED_SOURCE_IDENTITY.json` |

The 3 Firefox skips are the historical codec-specific local tests intentionally excluded from the Firefox project. The maintained Phase 8.0 tests and new Phase 8.1 tests both pass in Firefox for editing, waveform, loop/duck, media bin, media cleanup and draft/full surfaces.

## 2. Unit coverage added

`tests/unit/phase81.test.ts` (14 tests) verifies:

- soundtrack loop repetition, final partial repeat and post-boundary equal-power crossfade;
- loop-off natural stop and playback-end summary;
- deterministic ducking silence/no-op, attack/release, amount and active ratio;
- waveform source-peak lookup and edge clamping;
- waveform mapping through trim, reverse and speed;
- repeated soundtrack waveform mapping;
- `.bendpkg` round-trip of loop, crossfade and ducking settings;
- treatment copy/paste with source/timing preservation, effect-instance remapping and animation remapping;
- wave-track dropping when pasting a video treatment onto a procedural layer;
- all six transitions applying, resolving, style/filter contribution and removal;
- split rejection inside a transition and reverse/speed-mapped source resolution;
- transition removal when reorder eliminates adjacency.

Existing Phase 7/8 tests remain green, including migration, loop regions, effects, storage revisions, packages, host revisions and media replacement.

## 3. Deployed preview results

Preview: `https://bend-ktf5bn98p-tanishkfrs-projects.vercel.app`  
Deployment: `dpl_YKPcLjzeFajGRZ7WLv7Nv3GrKcba` (`preview`, READY)  
Vercel Authentication: preserved (`all_except_custom_domains`).

- Smoke across Chrome, Edge, Firefox and Windows WebKit: **31 passed, 1 skipped** (Windows WebKit video codec).
- Chrome Phase 8.0 and 8.1 full exports: PASS.
- Chrome export matrix: 4 full tests PASS.
- Chrome deployed accessibility: 4 full tests PASS.
- Chrome projects/packages: 4 tests PASS (missing-media relink retested after label maintenance).
- Chrome creative: 5 full tests PASS.
- Host integration: PASS.
- Creator Projects A/B/C: PASS (C retested after label maintenance).
- Mobile Pixel 7: 2 PASS.
- Chrome, Edge and Firefox custom 8 s duck/loop exports: validated; ~10 dB deployed music reduction with unchanged clip tone.

Test-only label maintenance was required because Phase 8.1 changed the imported layer name and the existing audio fade labels now contain the old “Out value” substring. The deployed source itself was not changed after deployment; only excluded test files/docs were edited.

## 4. Browser regression (local)

Command: `npm run test:browser`

| Test | Chromium | Firefox |
|---|---|---|
| Capability matrix | PASS | PASS |
| Studio procedural PNG export | PASS | PASS |
| Import / trim / reload | PASS | SKIP (codec policy) |
| Loop handle keyboard | PASS | PASS |
| Mobile shell overflow/inspector | PASS | PASS |
| Phase 8 import/split/transition/speed/reload | PASS | PASS |
| Phase 8 cover PNG | PASS | SKIP |
| Phase 8 soundtrack export | PASS | SKIP |
| Phase 8.1 multi-import/media bin/waveform/quick controls/draft-full | PASS | PASS |
| Phase 8.1 loop/duck persistence | PASS | PASS |
| Phase 8.1 keyboard/edit-point/shortcut/media shortcut | PASS | PASS |
| Phase 8.1 cover preview and export audio summary | PASS | PASS |
| Phase 8.1 unused-media removal, Undo, relink | PASS | PASS |

Additional real-browser probes:

- Timeline zoom 100% → 200% expanded sequence scrollWidth from 1070 to 2140 while the page stayed at 720/1070 width with no page overflow; Shift+F returned to 100%.
- Timeline drag moved the third clip to position 2, selected it, and reported “Moved to sequence position 2.”
- Treatment copy/paste produced the copied Warm film values (temperature 0.32) and Motion Echo on the target clip.
- Media removal Undo restored the card; removing again and reloading reclaimed the orphan blob (asset store count 1).
- Audio monitor loop playback at 5.48 s project time read hidden audio currentTime 1.417 s with volume 0.501 (−6 dB) and playing.
- Hold-to-compare displayed the original-source badge and released cleanly.

## 5. Audio/video media inspection

### 30-second Journey B

File: `output/phase81-audio/journey-b-montage.mp4`

- MP4 / H.264 720×900 30 FPS, AAC 48 kHz stereo.
- 900 frames, 30.00 s video, 30.016 s audio.
- Music loops 8 times over 30.00 s; final partial repetition trimmed.
- Head RMS −38.43 dB vs body −18.06 dB; tail 29.9 s RMS −40.94 dB → fades present.
- 220 Hz music present after loop boundaries at 4.1, 8.1, 12, 20 and 29 s.
- Ducking reduced music by 10.01/10.01/9.97/9.54 dB at 1/5/20/29 s; 440 Hz clip tone unchanged except final clip fade.
- Loop-off control: music −27.52 dB at 2 s, −102.90 dB at 10 s, −119.63 dB at 29 s; clip tone remained −15.06 dB.

Exact JSON: `output/phase81-audio/journey-b-analysis.json`, `audio-analysis.json`.

### Journey A first-time montage

File: `output/phase81-creator/journey-a-montage.mp4`

- 4-source import → split → ripple → reorder → 2 transitions → Warm film → reload.
- Reload retained 4 clips, 2 transitions and temperature 0.32.
- Export: MP4/H.264+AAC, 720×900, **177 frames, 5.90 s**, mixed audio included.

### Journey C creative reel

File: `output/phase81-creator/journey-c-creative-reel.mp4`

- Signal Field overlay, screen blend, ellipse mask, Motion Echo, treatment copy/paste, distortion transition.
- Draft and Full previews exercised; hold-to-compare checked.
- Export: MP4/H.264+AAC, 720×900, **120 frames, 4.00 s**, mixed audio included.
- Contact sheet visually shows the masked overlay, wave-distorted transition and finished look.

### Transition matrix

File: `output/phase81-transitions/transition-suite.mp4`

- Seven 2 s clips; all six transition types applied once.
- Default durations: dissolve 0.6, dip black 0.8, wipe 0.5, zoom 0.55, glitch 0.35, wave dissolve 0.6.
- Reverse + 1.5× speed applied to the second shot.
- Export: MP4/H.264+AAC, 720×900, **298 frames, 9.93 s**, 1.33 MB.
- Split inside a transition rejected with feedback; reorder dropped incompatible transitions and explained it; one Undo restored all six; final sequence remained 9.93 s.
- Contact sheet `output/phase81-transitions/final-contact-sheet.png` shows dissolve mix, black dip at midpoint, visible wipe edge, zoom push, RGB/scan glitch and wave distortion.

### Repeated exports

Three sequential quick exports while Draft was active: 5.36 s / 4.59 s / 4.68 s wall time; all 720×900, 60 frames, 2.00 s, valid MP4/AAC, stable ~0.26 MB. No progressive slowdown or page error.

### Package and legacy recovery

`output/phase81-recovery/`:

- Phase 7 package opened with no missing sources.
- Added music loop/duck, added and split footage, applied treatment.
- Save/reload retained clip count, loop and duck state.
- Duplicated project, exported `.bendpkg` (2,730,785 B), restored in a fresh context.
- Restored: 3 clips, 1 music source, 0 missing media, 3 repetitions/10 s, duck badge present.
- Re-export: 300 frames, 10.00 s, MP4/H.264+AAC; ducking message reduced 10.0 dB for 73% of range.

## 6. Accessibility

Axe WCAG 2.0/2.1 A/AA scans: **zero violations** on

1. populated editor with clips, waveforms, looping and ducking,
2. Media library dialog,
3. Shortcut dialog,
4. Export dialog,
5. Export cover preview,
6. forced-colors editor.

- 200% zoom equivalent (720×450 CSS viewport): no horizontal page overflow; controls button available; inspector opens.
- Forced colors: no axe violations; waveforms hidden and replaced by the existing numeric/timing audio controls and text summaries.
- Reduced motion: enabled for the same environment; no new motion-only dependency.
- Keyboard paths rechecked: Space, S, Delete, Shift+Delete, Ctrl/Cmd+D, Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z, Ctrl+Y, Alt+Arrow reorder, Up/Down edit points, Left/Right frames, Shift+Left/Right one second, Home/End, Shift+F fit, Shift+M media, `?` shortcut dialog, Escape dialogs.
- Dialogs trap focus and return focus. Media dialog supports local Ctrl+Z/Y undo/redo outside text fields.
- Waveform canvases are `role="img"` with descriptive duration/peak/loop labels and are never the only audio representation.
- Timeline ruler is a numeric slider; loop handles are sibling sliders, removing nested-interactive markup.

Not performed / not claimed:

- Manual real screen-reader session (NVDA/JAWS/VoiceOver).
- Physical-device touch gesture testing.
- Real macOS Safari.

## 7. Browser matrix

| Browser | Version / environment | Preview | Video import | Export | Result |
|---|---|---|---|---|---|
| Chrome/Chromium | Bundled Chromium + installed Chrome channel | PASS | PASS | MP4/H.264+AAC | Full local and deployed acceptance; deployed 8 s ducked/unducked spectral check |
| Edge | Installed Edge channel | PASS | PASS | MP4/H.264+AAC | Deployed smoke + custom deployed 8 s ducked/unducked export; ~10 dB reduction measured |
| Firefox | 157.0 Playwright | PASS | PASS | WebM/VP9+Opus (no AAC here) | Full local edit; deployed WebM export; warnings documented |
| Windows WebKit | 27.2 | Procedural PASS | BLOCKED honestly | BLOCKED | Not native Safari |
| macOS Safari | unavailable | BLOCKED | BLOCKED | BLOCKED | Not claimed |
| Pixel 7 emulation | Chromium | PASS | not exercised for video | not exercised | No horizontal overflow; inspector/mobile shell |

Firefox warnings observed during a real WebM export:

- `WebGL context was lost.`
- `WebGL warning: drawElementsInstanced: Tex image TEXTURE_2D level 0 is incurring lazy initialization.`

Output: 720×900, 60 frames, 1.97 s, WebM/VP9+Opus, 50,942 B. Post-export editor canvas `toDataURL` length 212,154; post-export screenshot still rendered the composition. No page errors. Warnings were not hidden.

## 8. Dependency audit

Reported three development vulnerabilities were Vitest-adjacent:

- `vitest` (critical aggregate via tinypool)
- `@vitest/mocker` (moderate; path traversal / mock injection)
- `tinypool` (critical; prototype pollution/RCE gadget)

The minimum patched Vitest line was 4.1.12 (peer-compatible with Vite 7). Phase 8.1 installed `vitest@4.1.12` and reran all 129 tests. `npm audit` now reports **0 vulnerabilities**. No production dependency major was changed.

## 9. Acceptance matrix

| ID | Requirement | Status | Evidence |
|---|---|---|---|
| 81-01 | Current Phase 8 source protected | PASS | Pre-edit snapshot `phase81-pre-20261026-012952` with SHA-256 manifest and working-tree diff; Phase 8 final snapshot verified |
| 81-02 | First-time user audit completed | PASS | `PHASE8_1_UX_AUDIT.md`; screenshots `output/phase81-audit/` |
| 81-03 | Meaningful P0/P1 UX problems fixed | PASS | Media bin, quick actions, shortcuts, pointer hit targets, double reorder, overlay pointer events, stack rendering |
| 81-04 | Local media library usable | PASS | Media tests, local browser gate, media-flow screenshots/evidence |
| 81-05 | Clip editing and timeline controls refined | PASS | Context bar, hit targets, zoom, movement feedback, transition handling |
| 81-06 | Keyboard shortcuts discoverable | PASS | Shortcut dialog, hints, `aria-keyshortcuts`, browser test |
| 81-07 | Audio waveform generation and display | PASS | Async service, canvas waveforms, cache bounds, audio evidence |
| 81-08 | Soundtrack looping | PASS | Unit, browser, save/reload, package, 8-repetition 30 s export |
| 81-09 | Deterministic optional ducking | PASS | Unit envelope test + 10 dB spectral comparison on real exports |
| 81-10 | Audio timing and fades validated | PASS | 900 frames/30.016 s audio; head/tail RMS; loop-on/off evidence |
| 81-11 | Creative treatments easier to reuse | PASS | Treatment copy/paste, identity remap, compare, color swatches |
| 81-12 | All transitions remain correct | PASS | Six-type real export matrix; edge cases; contact sheet |
| 81-13 | Finishing/preset usability improved | PASS | Swatches, reset, compare, type-specific defaults, real-overlap display |
| 81-14 | Social output workflow refined | PASS | Fit/Fill all, cover preview/timestamp, loop/duck audio summary |
| 81-15 | Representative performance measured | PASS | Baseline/post-change p50/p95, long tasks, heavy path, repeated exports |
| 81-16 | Normal editing responsiveness preserved | PASS | Montage p50 8.6–24.7 ms / p95 46–89.5 ms across post-change runs |
| 81-17 | Heavy processing remains cancellable | PASS | Bounded heavy preview, Stop/Resume, memory flat, recovery export |
| 81-18 | No new resource leak | PASS | 42.1 → 42.1 MB over heavy toggles; stable repeated exports; bounded caches |
| 81-19 | Browser capability handling correct | PASS | Honest WebKit video failure, Firefox WebM fallback, no universal MP4 claim |
| 81-20 | Accessibility checks completed within available environment | PARTIAL | Axe zero, keyboard/zoom/forced-colors/reduced-motion pass; manual screen-reader and physical touch unavailable |
| 81-21 | Legacy projects and schema remain compatible | PASS | Phase 7 package opens/edits/loads without missing media; existing migration/regression tests |
| 81-22 | `.bendpkg` round-trip preserves new settings | PASS | Loop, crossfade and ducking package unit test + real recovery export |
| 81-23 | Unit/typecheck/build pass | PASS | 129 unit tests, typecheck, production build |
| 81-24 | Updated browser regression passes | PASS | 23 local browser tests pass, 3 intentional skips |
| 81-25 | Real Vercel preview acceptance | PASS | Preview `https://bend-ktf5bn98p-tanishkfrs-projects.vercel.app`, deployment `dpl_YKPcLjzeFajGRZ7WLv7Nv3GrKcba`; deployed smoke 31 pass/1 WebKit skip, Chrome full suites pass, Edge/Firefox real exports pass, mobile pass; see `PHASE8_1_DEPLOYMENT.md` |
| 81-26 | Creator journeys A–E executed | PASS | A and C real exports; B spectral/fade/loop/duck evidence; D package recovery; E heavy/recovery |
| 81-27 | Evidence-backed documentation | PASS | This report plus implementation, UX, audio, performance, deployment and handoff docs |

## 10. Residual risks not reclassified as passes

- Heavy nested temporal stacks remain far below real-time in full fidelity; only preview is bounded.
- Real macOS Safari is untested.
- Firefox emitted WebGL warnings during embed/export; output was valid in this environment.
- Manual screen-reader and physical touch sessions are incomplete.
- Pitch-preserving speed remains deferred.
- One V1 video track and one music track remain deliberate scope.
- The final performance run was affected by unrelated machine automation; absolute numbers should be treated as machine-specific.
- Production remains an older deployment; promotion requires separate authorization.

## 11. Finalization verification (2026-10-26)

The completed Phase 8.1 working tree was reconciled with remote `main` at `1cfbe6f` (Phase 5.4) and committed on `release/phase-8.1-final`. No force-push, production promotion, alias change, or merge into `main` was performed.

- Phase 5.4 reconciliation: remote Phase 5.4 files and behavior are present in the newer Phase 5.5-8.1 source. The preserved Phase 5.4 UI acceptance harness passes **17/17** checks with zero console errors, warnings, or page errors.
- A dialog-flow regression was found during that reconciliation check: opening First Study from the project library closed the library before the replacement confirmation, so cancelling dropped the user back into the editor. The library now remains open until the example is actually opened. A maintained browser regression test covers the cancel path.
- Typecheck: PASS.
- Unit tests: **19 files, 129 tests**, all passing.
- Production build: PASS; the existing lazy `portableProject` chunk warning remains.
- Maintained local browser suite: **25 passed, 3 intentional Firefox codec skips**.
- Focused production-build smoke (`deployed-phase8 @full` against `npm run preview`): PASS. It imported real footage, split a clip, applied a transition and speed change, added and edited a soundtrack, saved and reloaded, exported a validated video, and downloaded it.
- Production and preview deployments were not modified by this finalization. Deployment promotion remains a separate authorization step.
