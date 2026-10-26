# Studio 2.0 — Phase 4 Test Report

**Date:** 2026-10-27  
**Branch:** `phase-4/bend-integration`  
**Environment:** Windows 11, Node 24.13.0, npm 11.6.2, Chromium (Playwright 1.61.1), Firefox where noted.

## 1. Commands and results

| Command | Result | Evidence |
| --- | --- | --- |
| `npm run tool:bend:install` | PASS | 185 packages installed; 0 vulnerabilities |
| `npm run tool:bend:typecheck` | PASS | `tsc --noEmit` |
| `npm run tool:bend:test` | PASS | **20 files / 131 tests** (includes 2 new Studio-session tests) |
| `npm run tool:bend:build` | PASS | Vite production build with `BEND_BASE=/tools/bend/`; nested asset URLs verified in `dist/index.html` |
| `npm run tool:bend:test:browser` | PASS | **35 passed, 3 skipped**; Chromium + Firefox; 56.9s |
| `npm run typecheck` | PASS | contracts + host |
| `npm run build` | PASS | Shapes + BEND + Studio production build; copies both bundles into `dist/tools/` |
| `npm run test` | PASS | **15 files / 67 tests** |
| `npm run test:browser` | PASS | **54 Chromium tests**; includes 6 BEND-in-Studio acceptance tests; Phase 2/3 retained |
| `npm run test:browser:bend:production` | PASS | **2 tests** against `vite preview` (production `dist`), nested route + Studio publish |
| `npm run verify` | PASS | contracts + full build + 67 unit/component tests |

The three BEND skipped tests are the upstream Firefox video-export cases; they are skipped by
the preserved BEND Playwright configuration, not by Studio.

## 2. BEND-in-Studio acceptance tests

File: `apps/studio/tests/browser/bend-integration.spec.ts`

1. **Fresh BEND project + temporal effect + publish + re-entry** (PASS, ~1.1m)
   - opened the complete BEND editor, added Signal Field, added Motion Echo;
   - published preview quality (720×720 MP4/H.264, 1080×1080 PNG poster, `.bendpkg`);
   - independently parsed package magic/manifest and verified `complete: true`;
   - decoded and played the video in the host (`720×720`, advancing currentTime);
   - confirmed the static composition shows the cover and explicit playback is muted;
   - changed host X/opacity, reloaded, reopened BEND, verified Signal Field/effect timeline,
     republished, and confirmed same layer ID/transform/opacity and new source revision;
   - reloaded and reopened again to verify persisted source.

2. **Static Studio artwork → real BEND clip → derivative layer** (PASS, ~14s)
   - created a real Vector layer and recorded its source revision/hash;
   - used **Animate in BEND** (1.5s, explicit background);
   - confirmed BEND's project has **1 video layer and 1 video asset**;
   - added a temporal effect and published;
   - confirmed a derivative video layer with provenance pointing at the Vector layer;
   - confirmed the Vector source revision/hash/rendered asset are unchanged;
   - confirmed BEND source mode `static-handoff`, source layer IDs, and one packaged video.

3. **Audio and packaged media** (PASS, ~6s)
   - imported `test-pattern-audio.mp4` and `music-bed-4s.mp3` into BEND;
   - published preview;
   - source state reported `audio.present: true`;
   - package media contained both video and audio assets;
   - host layer defaulted to muted; mute toggle persisted `temporal.audio: "source"`;
   - real video decode/playback advanced currentTime and duration ≈2s.

4. **Cancel + corrupt source recovery** (PASS, ~5s)
   - cancelled an in-flight publish; previous source/video asset IDs unchanged;
   - corrupted only the editable package bytes in IndexedDB;
   - reopening reported “BEND source is unavailable” before replacing anything;
   - committed video and poster asset IDs remained unchanged.

5. **Stale committed revision** (PASS, ~6s)
   - mutated the durable committed layer revision while a BEND edit session was open;
   - publish was rejected with “another Studio tab / updated elsewhere”;
   - previous video/poster asset IDs remained unchanged.

6. **Explicit aspect fit decision** (PASS, ~13s)
   - published a 1:1 project, changed Studio to 4:5, reopened BEND;
   - the format gate required **Fit inside artboard**;
   - republish retained layer ID and fitted 1080×1080 host transform;
   - source state recorded `aspectPreset: "1:1"` and `host.fitDecision: "fit"`.

## 3. Production nested-route acceptance

File: `apps/studio/tests/browser/bend-production.spec.ts` + `playwright.production.config.ts`

- served `apps/studio/dist` with `vite preview` on port 4186;
- `/tools/bend/index.html` loaded the complete editor, Add menu, Signal Field and canvas;
- Studio loaded from `/`, opened BEND through the nested bundle, imported a real video,
  published, and displayed the host video layer with cover;
- evidence: `docs/evidence/phase-4/01-production-nested-route.png`.

This verifies hashed assets/dynamic chunks under `/tools/bend/` outside dev middleware.

## 4. Unit/component coverage added

### Studio host

- `bendSourceState.test.ts` — 5 tests: version/MIME/tool validation, package/media/hash
  rejection, aspect labels, layer naming, ephemeral URL injection without revision change.
- `bendPackage.test.ts` — 4 tests: complete archive inspection, incomplete/future-version/
  asset-table mismatch, missing entry/hash/trailing/truncated bytes, missing layer media.
- `bendLayerStore.test.ts` — 2 tests: video layer creation with poster/temporal metadata;
  republish retains ID/transform/visibility/opacity/order and updates source/poster/temporal.
- `App.test.tsx` / `ToolRail` smoke now expect six live tools including BEND.

### BEND tool

- `studioBridge.test.ts` — 2 tests: deterministic Studio temporary project identity and
  namespaced fallback.

## 5. Retained Phase 2/3 regression

The full Studio browser suite passed all Image, Vector, Type, Shapes and Generate journeys
including:

- native Image PNG/ZIP/GIF, Vector SVG/PNG, Type PNG/OTF, Generate background;
- Image/Vector/Shapes/Generate source re-entry and cross-tool handoffs;
- transport origin/scope/protocol/stale-message checks;
- storage/render/cancel failure paths;
- layout and compact-width checks.

The only test edit was the pre-Phase-4 smoke assertion that BEND must be disabled; it now
expects BEND live, because BEND is integrated.

## 6. Evidence gallery

`docs/evidence/phase-4/`:

| File | Shows |
| --- | --- |
| `01-production-nested-route.png` | production nested route + host video layer |
| `02-bend-editor-timeline.png` | full BEND UI, procedural layer, effect stack, timeline |
| `03-published-video-layer.png` | cover + playable host layer + inspector |
| `04-source-reentry.png` | restored native BEND timeline/effects |
| `05-same-layer-update.png` | republished same layer/transform |
| `06-static-handoff-dialog.png` | explicit static-to-motion choices |
| `07-static-handoff-timeline.png` | real imported clip in native BEND timeline |
| `08-static-derivative.png` | derivative Studio video layer |
| `09-audio-layer.png` | audio-capable published layer |
| `10-failure-recovery.png` | corrupt source blocked, prior layer preserved |
| `11-stale-revision-rejected.png` | stale update rejected |
| `12-format-fit-decision.png` | explicit aspect fit decision |

## 7. Honest test limits

- Not every BEND feature/combination was browser-executed; the preserved editor and upstream
  131 unit + 35 browser tests cover its core. Pointer-only gestures, some keyframe/modulator
  combinations, every generator preset and every transition/mask/ducking variant remain
  source-preserved but not individually re-run in Studio.
- Studio E2E is Chromium-only. Firefox is exercised in the preserved BEND suite; Safari/
  WebKit is unverified.
- Missing-media package failure is unit-covered; the browser failure test corrupts the package
  hash. Unsupported-codec failure is environment-dependent and not simulated.
- No simulated video blob is used as publication evidence: tests decode and play real bytes,
  parse the real package archive and hash real media.
