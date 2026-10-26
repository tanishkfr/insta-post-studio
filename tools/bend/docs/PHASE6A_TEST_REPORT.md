# BEND. Phase 6A test report

Date: 2026-10-13
Verdict: **PARTIAL release readiness; Phase 6A local handoff core verified**
Start commit: `df2eeac452f7c3a32677299905dd66acb09f6223`
End commit: `HEAD` (exact SHA reported in the final handoff)

## Scope

Phase 6A adds a portable editable source package, a framework-neutral rendered/still adapter, a local Instagram-shaped host harness, host-owned layer metadata, round-trip editing, renderer startup/retry messaging, and persistence-failure recovery. No group application, backend, AI API, auth, deployment, or postMessage bridge was added.

## Verification commands

| Check | Result | Evidence |
| --- | --- | --- |
| `npm run typecheck` | PASS | TypeScript completed without diagnostics. |
| `npm test -- --run` | PASS | 10 files, 42 tests. |
| `npm run build` | PASS | 2,413 modules transformed; Vite production build completed. |
| `npm run lint` | PASS by project definition | The project lint script aliases `tsc --noEmit`; covered by typecheck. |
| `node tests/manual/phase6a.mjs` | PASS | Direct installed Google Chrome, headless with SwiftShader; all checks true and no console errors. |
| independent `ffprobe` inspection | PASS | H.264 MP4 and PNG output decoded outside the browser test. |

The repository Playwright runner was attempted but could not provide a clean result on this host: its web server encountered existing-port/bind permission conflicts, and the configured browser environment did not complete the run. The new regression coverage lives in [`tests/browser/phase6a.spec.ts`](../tests/browser/phase6a.spec.ts); the direct Node Playwright fallback in [`tests/manual/phase6a.mjs`](../tests/manual/phase6a.mjs) uses the installed system Chrome and is the source of the Phase 6A browser evidence below. Firefox remains unverified, consistent with the existing Phase 5 report.

## Gate Zero fixes

### Cold compositor startup

`CanvasStage` now exposes a real warming state, keeps playback/selection controls unavailable until the renderer is ready, reports initialization failure as an alert, and offers `Retry compositor`. A blank canvas is not presented as a successful ready state.

### Persistence failure recovery

IndexedDB writes now resolve only after both the request and its transaction complete. Request, transaction, abort, and startup failures are surfaced. The editor keeps the project in memory, offers `Try again`, and offers `Download recovery copy` when autosave fails. The browser evidence injects a `QuotaExceededError` into the next project write; the failure banner and recovery action were both observed, with no console errors.

## Acceptance evidence

| Area | Result | Evidence / limitation |
| --- | --- | --- |
| A — portable project | PARTIAL/PASS | Procedural example source and an imported-footage package both round-trip. Unit coverage verifies binary assets, missing assets, future versions, limits, and malformed archives. A single browser flow does not yet isolate a combined imported + procedural + keyframed project from a clean database. |
| B — rendered handoff | PASS | Host receives and plays the rendered BEND layer; 4:5 source output is displayed in the host and host aspect control switches to 1:1. |
| C — round-trip edit | PASS | Refraction seed change produced a new source revision; host layer updated and foreground content remained. |
| D — cancel | PASS | Edit → Exit left the committed host layer and foreground intact. |
| E — static output | PASS | Still handoff displayed in the host; independent PNG decode passed. |
| F — audio/playback | PARTIAL | Contract carries codec/audio metadata and host audio policy is separate. The Phase 6A example is procedural/video-only, so a source-audio round trip was not newly measured here. Existing Phase 5 audio/export evidence remains applicable. |
| G — persistence | PASS | Host Save → browser reload restored the layer, source association, placement controls, playback policy, and foreground. |
| H — failure injection | PARTIAL/PASS | Unit tests cover malformed, missing, future-version, and size-limit packages; browser covers quota failure. Cancelled export, failed handoff, and cross-origin invalid-origin messages are not claimed. |

## Measured local run

Machine/browser conditions: system Google Chrome executable, headless, `--use-angle=swiftshader`, viewport `1440×980`; fresh browser context used for package restore.

| Measurement | Value |
| --- | ---: |
| Add-layer handoff (export + package + local host writes) | 21,594 ms |
| Round-trip update | 12,327 ms |
| Editable package download | 750 ms |
| Editable package size | 18,242 bytes |
| Fresh package restore | 1,219 ms |
| Host MP4 size | 352,676 bytes |
| Host MP4 dimensions / duration / FPS | 720×900 / 2.000 s / 30 fps |
| Host still size / dimensions | 2,116,917 bytes / 1080×1350 |
| Peak memory | N/A; no reliable browser heap/GPU profiler was available in this run |

Independent `ffprobe` reported `h264` in an MP4 container for the video and `png` at `1080×1350` for the still. The generated example has no source audio, so the MP4 correctly reports video-only.

## Evidence files

The direct run writes:

- [`verification.json`](../output/evidence/phase6a/verification.json)
- [`host-empty.png`](../output/evidence/phase6a/host-empty.png)
- [`host-composition.png`](../output/evidence/phase6a/host-composition.png)
- [`host-round-trip.png`](../output/evidence/phase6a/host-round-trip.png)
- [`fresh-package-import.png`](../output/evidence/phase6a/fresh-package-import.png)
- [`host-layer.mp4`](../output/evidence/phase6a/host-layer.mp4)
- [`host-still.png`](../output/evidence/phase6a/host-still.png)
- [`test-pattern.bendpkg`](../output/evidence/phase6a/test-pattern.bendpkg)

## Remaining release gates

The result remains partial because the existing cross-browser and human-verification gates are still open: Firefox, manual screen-reader review, true 200% zoom, forced-colors, touch/physical-device behavior, and hardware GPU/heap profiling. The configured bundled browser runner also needs a host with clean port/browser permissions. Audio round-trip, large/multi-asset packaging, cancelled export, and failed-handoff injection should be added before a broader production sign-off.
