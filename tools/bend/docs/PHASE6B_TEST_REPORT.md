# BEND Phase 6B — Test Report

Date: 2026-10-25  
Checkout: `C:\Dev\Projects\Bend`  
Starting HEAD: `343260bb048a111475216ef2141eb5b89144de75`  
Fetched remote: `1cfbe6f244820599aaffd91a8f56cc301f1c8a58`  
Verdict: **BLOCKED for real group-toolset acceptance; BEND-side and reference-host verification PASS with the limitations below.**

## 1. Environment

| Item | Value |
|---|---|
| OS | Windows 10.0.26200 |
| Node / npm | v24.13.0 / 11.6.2 |
| Browser | Google Chrome 155.0.8059.85, headless, SwiftShader WebGL |
| Media inspection | FFmpeg/FFprobe 9.0-full_build |
| Test runner | Vitest 3.2.7, Playwright manual Chromium harnesses |
| Group host | **Not available** |

No hardware-GPU, Firefox, physical-touch or screen-reader run is claimed.

## 2. Baseline before modification

| Command | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm test -- --reporter=dot` | PASS — 15 files, 75/75 tests |
| Phase 5.5 browser acceptance | Previously PASS — 13/13; re-run after changes also PASS |

This confirms the Phase 5.5 baseline was intact before Phase 6B work.

## 3. Final test results

| Command / suite | Result | Evidence |
|---|---|---|
| `npm run typecheck` | **PASS** | No TypeScript errors. |
| `npm test -- --reporter=dot` | **PASS — 16 files, 96/96 tests** | 21 executed integration/revision tests added. |
| `npm run build` | **PASS** | Vite production build; existing 808 kB `host` chunk advisory only. |
| `node tests/manual/phase5-5-acceptance.mjs` | **PASS — 13/13 journeys** | 0 console errors, 0 page errors; includes host round-trip. |
| `node tests/manual/phase5-4-ui-acceptance.mjs` | **PASS — 17/17** | 0 console errors/warnings/page errors. |
| `node tests/manual/phase5-3-acceptance.mjs` | **38/39 checks; one environmental warning** | All media, persistence, package, relink, responsive checks true. `noConsoleWarnings` false due to 78 repetitions of one SwiftShader `GL_INVALID_OPERATION: glCopySubTextureCHROMIUM` warning. 0 console errors, 0 page errors. |
| `node tests/manual/phase6a.mjs` | **FAIL — stale harness** | Waits for a removed `Generate` button at line 95 (pre-Studio 2.0 selector). Not a valid regression gate; see Phase 5.5 note. |
| Real group-toolset journeys A–H | **BLOCKED** | Host repository/runtime absent. |

### 3.1 Unit coverage added

`tests/unit/integrationContract.test.ts` — 10 tests:

- source identity stable across metadata, local storage keys and regenerated project IDs;
- source identity changes for blend/mask/loop/keyframe edits;
- Phase 5.5 package round-trip with unchanged source revision;
- wrong expected version rejected;
- rendered-media validation (empty blob, stale version, aspect, FPS, poster MIME);
- still timestamp/dimension validation;
- host layer ownership/range validation;
- duplicate host layer IDs and integration version rejection;
- video + still + editable source share one revision;
- still from another revision rejected.

`tests/unit/hostRevision.test.ts` — 11 test definitions / 13 executed cases:

- new-layer composition save failure removes staged media;
- add rejected when the host composition changed elsewhere;
- failed update preserves old revision and cleans only after success;
- stale `expectedSourceVersion` rejected before rendering;
- retrying the same source version cannot overwrite committed artifacts;
- CAS conflict after rendering removes only the request's staged artifacts;
- every host-owned property preserved, including audio policy and unrelated layers;
- reference-safe cleanup preserves shared media;
- video, still and package storage failures roll back all staged artifacts;
- missing editable package is reported before opening a partial layer;
- abandoned-artifact sweep keeps referenced and recent media.

### 3.2 Phase 5.5 browser acceptance detail

`output/evidence/phase5-5/phase5-5-acceptance.json`

```
journey1 PASS, journey2 PASS, journey3 PASS, journey4 PASS,
journey5 PASS, journey5-audio PASS, journey6 PASS,
journey6-package PASS, journey6-integration PASS,
blend-modes PASS, accessibility PASS, stateful-range PASS,
performance PASS
passed 13, failed 0, consoleErrors 0, pageErrors 0
```

Journey 6 integration is the **local reference host**, not the real group toolset. It confirms the handled lifecycle still works after the hardening changes.

### 3.3 Phase 5.4 browser detail

`output/evidence/phase5-4/`

All 17 Studio 2.0 checks true, including Add menu, progressive disclosure, inspector settling, project library, export summary, full-canvas default, audio policy visibility, and laptop/mobile no-overflow.

### 3.4 Phase 5.3 browser detail

`output/evidence/phase5-3/`

- 38 functional checks true: MP4/WebM import, audio detection, temporal effect, keyframes, trim, transform/effect/keyframe reload, delete/undo, export bytes, cancellation state, project duplication, shared-media deletion, responsive layouts, missing-media banner, relink, package validation, fresh-context restore, package effect/keyframes, package export, corrupt-package rejection.
- The only false check is `noConsoleWarnings`: 78 repetitions of one `GL_INVALID_OPERATION: glCopySubTextureCHROMIUM` SwiftShader warning. There were no console errors or page errors. This is an environment/compositor warning, not a failed media or persistence check, and is not attributed to the Phase 6B integration changes.

## 4. Media inspection

FFprobe was run on current outputs:

| File | Streams | Duration |
|---|---|---|
| `output/evidence/phase5-3/exports/mp4-edited-export.mp4` | H.264 1080×1350 30 fps + AAC 48 kHz mono | 3.008 s |
| `output/evidence/phase5-3/exports/webm-input-export.mp4` | H.264 1080×1350 30 fps + AAC 48 kHz mono | 4.011 s |
| `output/evidence/phase5-3/exports/video-only-export.mp4` | H.264 1080×1350 30 fps (no audio) | 4.000 s |
| `output/evidence/phase5-5/media/journey5-range.mp4` | H.264 720×900 30 fps | 3.000 s |

These confirm real encoded media, declared audio policy, and range timing. They do **not** constitute host insertion or host audio-policy acceptance.

## 5. Failure-scenario matrix

| Scenario | Status | Evidence |
|---|---|---|
| Export cancellation | PASS (BEND) | Phase 5.5 journey 5 cancellation; phase 5.3 retry state. |
| Renderer failure | PARTIAL | Artifact validators reject damaged media; no injected renderer crash was run this phase. |
| Invalid package | PASS | Phase 5.3 corrupt package rejected; `verifyEditableSource` unit tests. |
| Missing footage | PASS (BEND) | Phase 5.3 missing-media banner, transform retention and relink. |
| Failed source/package write | PASS (reference host) | `hostRevision` package rollback. Real host storage blocked. |
| Failed video write | PASS (reference host) | `hostRevision` video rollback. |
| Failed poster write | PASS (reference host) | `hostRevision` still rollback. |
| Host composition save failure | PASS (reference host) | Old composition/media preserved, staged media removed. |
| Browser reload during update | NOT RUN | Sweep helper covers abandoned artifacts; no mid-update crash test. Real host blocked. |
| Two competing updates | PASS (reference host) | CAS revision conflict; losing request cleans only its staging. |
| Old revision completes after newer | PASS (reference host) | Stale `expectedSourceVersion` and CAS rejection. |
| Deleted/unavailable host source | PASS (reference host) | Missing package error; Phase 5.3 missing media/relink. |
| Storage quota/permission | PASS (simulated) | Throwing host/media writes roll back; real quota pressure not induced. |

## 6. Security tests

No cross-origin boundary exists, so no bridge security claim is made. The required negative tests (wrong origin, wrong window, malformed payload, unsupported protocol, repeated request ID, late response, unrequested replacement, oversized payload, unexpected close) remain **BLOCKED** until the real host's origins and transport exist.

The current verified boundary is same-origin and uses direct adapter calls plus host-owned storage.

## 7. Accessibility

- Phase 5.5 axe: zero WCAG 2 A/AA + 2.1 A/AA violations in the editor with mask/blend/loop/effect controls and in the range/seamless export dialog.
- 390 px Phase 5.5 layout: no horizontal overflow.
- Phase 5.4: laptop and mobile no horizontal overflow.
- Real host keyboard/focus transfer, dialogs, progress announcements and host-to-BEND navigation: **BLOCKED** (host absent).
- Manual screen reader, 200% zoom/text spacing, forced colors and physical touch: **NOT RUN**.

## 8. Acceptance matrix

| ID | Requirement | Status | Evidence / reason |
|---|---|---|---|
| 6B-01 | Git safety | **PASS** | Snapshot + restore probe + remote comparison; no destructive operations. |
| 6B-02 | Host discovery | **BLOCKED** | No group app in local workspaces or accessible GitHub; only a proposed design spec. |
| 6B-03 | Architecture | **BLOCKED** | Cannot select a real integration mode without host framework/origins. |
| 6B-04 | New composition | **BLOCKED** | No real host launch. Local reference host only. |
| 6B-05 | Video handoff | **BLOCKED** | Adapter output verified; real host never received it. |
| 6B-06 | Still handoff | **BLOCKED** | `exportStill` and validators verified; real host absent. |
| 6B-07 | Editable source | **PARTIAL** | Valid `.bendpkg` + fresh-context restore verified in BEND; host retention blocked. |
| 6B-08 | Placement | **BLOCKED** | Only the local harness exercises 1:1/4:5/9:16 placement. |
| 6B-09 | Source reopen | **PARTIAL** | Fresh-context package restore verified; host reopen path blocked. |
| 6B-10 | Round-trip | **BLOCKED** | Local harness round-trip passes; no real host update. |
| 6B-11 | Host preservation | **PARTIAL** | Reference-host tests preserve every host field; real host blocked. |
| 6B-12 | Cancellation | **PARTIAL** | Reference host + Phase 5.5 cancel verified; real host blocked. |
| 6B-13 | Stale revisions | **PARTIAL** | Source-version and CAS rejection unit-tested; real multi-tab host not exercised. |
| 6B-14 | Storage | **PARTIAL** | Reference IndexedDB + CAS + cleanup tested; real host storage absent. |
| 6B-15 | Audio | **PARTIAL** | Phase 5.3 audible MP4/AAC verified; real host policy blocked. |
| 6B-16 | Phase 5.5 | **PASS** | Blend/mask/animation/loop survive package round-trip and Phase 5.5 browser suite. |
| 6B-17 | Security | **BLOCKED** | No cross-origin host boundary or origins. |
| 6B-18 | Compatibility | **PASS** | Schema v2 normalization, legacy defaults, package v1 and old-project tests pass. |
| 6B-19 | Accessibility | **PARTIAL** | BEND editor axe/overflow pass; real host keyboard/focus blocked. |
| 6B-20 | Browser acceptance | **BLOCKED** | Real integration not runnable; BEND regression Chromium pass only. |
| 6B-21 | Regression | **PASS** | 96/96 unit, typecheck, build, 13/13 Phase 5.5, 17/17 Phase 5.4, 38/39 Phase 5.3 (environmental warning; prior reports recorded 40/40). |
| 6B-22 | Documentation | **PASS** | This report, implementation, contract and Phase 7 handoff record the blocked state. |

## 9. Not verified

- Real group toolset insertion, placement, save/reload and round-trip.
- Real host audio policy and mute behavior.
- Real host persistence/quota/cleanup behavior.
- Cross-origin bridge security.
- Firefox, hardware GPU, manual screen reader, 200% zoom, forced colors, physical touch.
- Mid-update browser crash/reload recovery in a real host.

## 10. Conclusion

The BEND adapter and reference host are safer and more testable than at the start of Phase 6B, and the Phase 5.5 creative baseline remains intact. The central Phase 6B outcome — the actual group Instagram toolset consuming, preserving, reopening and updating BEND compositions — **has not been demonstrated because the group application is not accessible**.
