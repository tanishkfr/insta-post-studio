# BEND Phase 5.3 — Test Report

## Verdict

`PARTIAL`: the implemented reliability paths are green in unit/build checks and targeted in-app browser journeys. Full media-fixture and cross-browser acceptance remains unverified.

## Exact commands executed

Baseline and final checks:

```text
npm test -- --run
npm run lint
npm run typecheck
npx vitest run tests/unit/store.test.ts tests/unit/saveCoordinator.test.ts tests/unit/storageRevision.test.ts tests/unit/hostRevision.test.ts tests/unit/exporter.test.ts
npm run build
git diff --check
```

Browser setup and fallback checks:

```text
npm run dev -- --host 127.0.0.1
npx --yes --package @playwright/cli playwright-cli --help
npx --yes --package @playwright/cli playwright-cli --session phase53 open http://127.0.0.1:5173/ --headed
```

The first Vite command failed inside the sandbox with `listen EACCES` on `127.0.0.1:5173`. The same local server succeeded with the approved elevated boundary. Playwright CLI reached installed Google Chrome, but Chrome exited during startup with a Crashpad named-pipe error. The standard Playwright browser path was not retried repeatedly.

## Unit and build results

- Final Vitest suite: passed; 14 files and 60 tests after the Phase 5.3 additions.
- Focused Phase 5.3 group: passed; save coordinator, storage revision/reference rules, store undo safety, exporter abort guards, and host revision rollback.
- TypeScript typecheck: passed.
- Production Vite build: passed. Vite emitted the existing large-chunk advisory for the host/index bundles; this is a performance warning, not a build failure.
- `git diff --check`: passed.
- No independent ESLint run was reported; the repository's `lint` script is only a TypeScript alias.

## In-app browser acceptance

Runtime: Codex ChatGPT in-app browser, local Vite server at `http://127.0.0.1:5173/`.

Observed journeys:

- Project safety: created/loaded a blank project, duplicated it, renamed the duplicate, reloaded, opened the other project, opened the library again, and confirmed current-project highlighting and last-modified date/time.
- Library visual check: dialog, empty/loaded states, structural thumbnails, actions, and existing BEND white/seafoam visual direction were rendered and inspected.
- Editor control visual check: inspector sliders rendered with visible full-width tracks and larger thumbs; timeline transport, metadata, legend, and zoom controls rendered as separated groups without header overlap.
- Portable package: downloaded a valid `.bendpkg`, opened the package chooser, observed validation metadata, restored it as an editable project, and confirmed a separate collision-safe project row rather than overwrite.
- Export lifecycle: started an 8-second procedural video export, observed local progress, cancelled it, and confirmed the explicit cancelled/retry state. Retried as a PNG still export and observed a completed rendered image.
- Console/resource signal: the in-app browser reported no captured error or warning messages after the export cancellation and PNG teardown checks.

Not run in the browser:

- Fixture-backed video import → remove → undo → preview → video export → relink.
- Fresh-context mixed video/audio/package round trip.
- Full host UI failure/retry journey.
- Axe or another automated accessibility audit in this pass. The browser accessibility snapshots were inspected manually.

## Acceptance matrix

| ID | Status | Evidence / gap |
| --- | --- | --- |
| A01 | PARTIAL | Library create/list/open/rename/duplicate verified in-app; delete path is implemented with confirmation but was not exercised destructively in the browser. |
| A02 | PASS | Coordinator settle plus in-app switch/reload verification. |
| A03 | PASS | Out-of-order coordinator test and IndexedDB revision-policy test. |
| A04 | PARTIAL | Store regression proves remove/undo retains media metadata; real video preview/export after undo remains unverified. |
| A05 | PARTIAL | Shared-reference collector and conservative deletion code are covered; live IndexedDB multi-project blob test remains unverified. |
| A06 | PARTIAL | Reference-aware cleanup policy and unit collector test pass; browser storage reclamation was not measured. |
| A07 | PARTIAL | Relink implementation preserves the layer object and warns on metadata differences; live replacement-file journey was not run. |
| A08 | PASS | Valid package validation, preview, restore, and collision-safe duplicate verified in-app. |
| A09 | PASS | Existing package validation/rollback test coverage remains green in the full suite. |
| A10 | PARTIAL | Editable procedural round trip verified; mixed media/audio fresh-context round trip remains unverified. |
| A11 | PASS | Video cancellation and PNG completion/retry verified in-app; stale job guards are unit-covered. |
| A12 | PARTIAL | Procedural cancellation/PNG teardown produced no captured warnings; video/effect/repeated-export matrix remains unverified. |
| A13 | PASS | Host failure preserves old revision and success removes superseded media in focused unit tests. |
| A14 | PASS | Full unit suite and editable First Study browser render remained green. |
| A15 | PASS | Saving, failed/recovery, import preview/error, missing-media relink, and export cancellation states are implemented and partially browser-verified. |

The latest UI polish did not change any persisted schema or interaction contract; it is covered by the passing typecheck, build, and in-app render inspection above.

## Media inspection and cleanup

The browser produced and displayed a PNG export, but no output file was retained as committed evidence. No independent `ffprobe`/decoder inspection was run in this pass. Host-media cleanup was verified through mocked persistence maps in `hostRevision.test.ts`; Pixi cleanup was observed through browser console output rather than a standalone GPU lifecycle harness.

## Remaining risks

The highest remaining risk is environmental coverage rather than a known failing implementation: actual video decode/audio encode, relink against a replacement file, mixed `.bendpkg` round trip in a fresh context, and repeated WebGL teardown across video/effect exports still need a browser with stable file upload and codec support.

## Phase 5.3 closure — 2026-10-19

### Closure verdict

`PARTIAL`: all applicable Chromium, media, persistence, package, cancellation, responsive, unit, typecheck, and build gates passed. Firefox remains blocked by the available runtime environment, so this is supported-browser acceptance rather than a completed two-browser matrix.

### Test environment

- Repository: `C:\Dev\Projects\Bend`, branch `main`.
- Starting and ending SHA for this closure pass: `343260bb048a111475216ef2141eb5b89144de75`.
- System Chromium: Google Chrome `155.0.8059.84` at `C:\Program Files\Google\Chrome\Application\chrome.exe`.
- Node `v24.13.0`, npm `11.6.2`, Vite `7.3.7`.
- FFmpeg and FFprobe `9.0-full_build-www.gyan.dev`.
- The configured Playwright Chromium executable was unavailable in the sandbox, so the real-browser acceptance harness used the installed system Chrome with SwiftShader. This is a harness/runtime limitation, not an application failure.

### Deterministic real-media fixtures

Generated locally with FFmpeg under the ignored `output/evidence/phase5-3/fixtures/` directory:

| Fixture | Container and streams | Media facts |
| --- | --- | --- |
| `standard-h264-aac.mp4` | MP4 / H.264 High + AAC-LC | 320x240, 30 fps, 4.000 s, mono 48 kHz audio, 4.000 s |
| `webm-vp9-opus.webm` | WebM / VP9 Profile 0 + Opus | 320x240, 30 fps, 4.008 s, mono 48 kHz audio |
| `video-only.mp4` | MP4 / H.264 High | 320x240, 30 fps, 4.000 s, no audio stream |

The fixtures use moving colour bars, diagonal motion, timestamps, and small shapes so frozen or black output is observable. No fixture binary was added to source control.

### Real-browser acceptance

Command: `node tests/manual/phase5-3-acceptance.mjs`

The measured system-Chrome run completed in `78.876 s` with `40/40` checks passing. It covered MP4 import, source audio detection, playback/scrubbing, trim, transforms, a spatial effect, keyframes, save/reload, delete/undo/redo, shared-media ownership, project switching, missing-source relink, MP4/WebM/video-only exports, cancellation/retry, package round-trip in a fresh browser context, corrupted-package rollback, and responsive checks at 1440, 1024, and 768 px. `consoleErrors`, `consoleWarnings`, and `pageErrors` were all empty.

Export observations from the browser run and independent FFprobe/FFmpeg inspection:

- Edited MP4 export: valid MP4/H.264 + AAC, 720x900, 3.008021 s container duration, 3.000 s video, 3.008 s audio.
- WebM input fallback: valid MP4/H.264 + AAC, 720x900, 4.010667 s duration. The UI reported `Source audio included`.
- Video-only export: valid MP4/H.264, 720x900, 4.000 s, with no audio stream and no encoder failure.
- Audio-bearing exports were independently non-silent: FFmpeg `volumedetect` reported approximately `-21.1 dB` mean and `-17.6` to `-17.8 dB` maximum.
- Beginning, middle, and end frames were decoded from each export into `output/evidence/phase5-3/frames/`. All three hashes differed within each edited/WebM/video-only output. Package-round-trip frame hashes matched the edited export at all three sampled positions, supporting consistent preview/export composition.
- The browser reported MP4 and WebM playback as `probably`, and Chrome reported support for VP9, VP8, WebM, and H.264 MediaRecorder types plus `VideoEncoder` and `AudioEncoder`.

### Data safety and package acceptance

- Save/reload preserved transforms, effects, keyframes, trim, and imported media.
- Real imported media survived delete → undo → preview/export, and delete → undo → redo behaved correctly.
- Two layers shared one imported asset; duplicate-project and original-deletion checks preserved the shared media.
- A missing source displayed the recovery state; relinking restored playback without losing transform data.
- A `.bendpkg` restored media, layers, effect, keyframes, and transforms in a fresh browser context. The restored project saved, reloaded, and exported both video and PNG still output.
- A corrupted package was rejected without replacing the current project.

### Defect found and fixed

Cancellation exposed a real Chromium `AbortError: BEND export cancelled.` unhandled-rejection race even though the UI cancellation state was correct. In `src/engine/export/exporter.ts`, the concurrent audio-sampling promise now receives an immediate rejection observer before the main video path can abort; the existing cleanup catch still awaits it safely. This is the smallest fix for the identified lifecycle race. Regression coverage is the focused exporter suite (`4/4`) plus the measured browser cancellation → retry → successful-export path in `tests/manual/phase5-3-acceptance.mjs`; the final run reported no page errors or unhandled rejection signals.

### Cross-browser and responsive matrix

| Target | Result | Evidence or limitation |
| --- | --- | --- |
| Chromium / system Chrome 155 | PASS | 40/40 real-browser acceptance checks, independent media inspection, zero browser error signals |
| Firefox | BLOCKED | No system Firefox was installed. One controlled `npx playwright install firefox` attempt downloaded into the isolated runner, but the runtime was not available to the subsequent process; the direct Firefox capability test failed before launch with a missing executable. No Firefox application result is claimed. |
| Responsive Chromium | PASS | 1440/1024/768 px had no horizontal overflow, no timeline-toolbar overlap, and no slider value overlap; range widths were 283, 255, and 718 px respectively |

The normal negative unsupported-encoder branch was not forced because the accepted Chrome capabilities were available; no unavailable codec was reported as successful. Firefox and hardware-GPU coverage remain separate limitations. The final acceptance harness used SwiftShader.

### Final commands and measured results

| Command | Result and runtime |
| --- | --- |
| `npm test -- --run` | `14/14` files, `60/60` tests, exit 0; PowerShell-measured `6.197 s` |
| `npx vitest run tests/unit/exporter.test.ts` | `4/4` tests, exit 0; focused regression run after the exporter fix, `2.73 s` |
| `npm run typecheck` | exit 0; `6.337 s` |
| `npm run build` | exit 0; `2826` modules transformed, Vite build `8.76 s`, PowerShell total `15.636 s`; existing large-chunk advisory only |
| `node tests/manual/phase5-3-acceptance.mjs` | exit 0; `40/40` checks, `78.876 s` |
| `npx playwright test tests/browser/capabilities.spec.ts --project=firefox --reporter=line` | blocked before test execution because the Firefox executable was unavailable in the isolated runner |
| `git diff --check` | passed after the closure documentation update; exit 0 |

### Acceptance matrix closure

G01–G12 and G14–G15 are PASS for the tested supported Chromium environment. G13 is BLOCKED because Firefox could not be made available to the runner. The overall Phase 5.3 verdict therefore remains `PARTIAL`, with no known failing product gate in the supported browser.

### Remaining risks and Phase 5.4 readiness

Remaining risks are limited to unverified Firefox behavior, hardware-GPU-specific behavior, and the intentionally unforced unsupported-codec negative branch. BEND's documented audio policy remains primary-source audio retention; this pass did not introduce or require a multitrack mixer.

Phase 5.4 readiness: `READY WITH LIMITATIONS`. Studio 2.0 work can proceed for the supported Chromium path; a Firefox runtime and hardware-GPU pass should be completed before claiming a full cross-browser release matrix.
