# Studio 2.0 — Phase 5B test report

**Date:** 2026-10-27  
**Environment:** Windows 11, Node 24.13.0, npm 11.6.2, Playwright 1.64.1, Chromium (Playwright 1.64.1), Firefox where noted.  
**Recovered head:** `d7e9f97c625ec386851f8c3872e76ba5cc6b6024`  
**Implementation/test head:** `072735bcb102e2f956ec55caad1d06bae7e878ca`  
**Test directory:** isolated writable `%TEMP%\opencode\studio-tests` for `TEMP` and `TMP`.

## 1. Final command matrix

| Command | Result | Evidence |
| --- | --- | --- |
| `npm run typecheck` | **PASS** | contracts + host `tsc --noEmit` |
| `npm run verify` | **PASS** | contracts, Shapes + BEND + host production build, **16 files / 73 tests** |
| `npm run test:browser` (`CI=1`, single worker) | **PASS** | **61 passed / 0 failed / 0 skipped**, 3.7m |
| `npm run tool:bend:typecheck` | **PASS** | BEND `tsc --noEmit` |
| `npm run tool:bend:test` | **PASS** | **20 files / 131 tests**, 1.9s |
| `npm run tool:bend:build` | **PASS** | Vite production build; existing large-chunk and mixed dynamic/static import warnings |
| `npm run tool:bend:test:browser` | **PASS** | **35 passed / 3 skipped**, 38 cases, Chromium + Firefox, 1.3m |
| `npm run test:browser:bend:production` | **PASS** | **2 passed**, 6.3s, against `vite preview` of the production `dist` |
| GitHub Actions at `d7e9f97` | **PASS** | [run 40449407737](https://github.com/tanishkfr/insta-post-studio/actions/runs/40449407737) — 57 host browser cases at the recovered head |
| GitHub Actions at `072735b` | **PASS** | [run 40455419494](https://github.com/tanishkfr/insta-post-studio/actions/runs/40455419494) — host build/contracts and **61/61 host browser cases** (8.7m) |

There are no unexecuted required gates for this closure.

## 2. Browser journey coverage

| Required journey | Where covered |
| --- | --- |
| Create project → Image → publish | `host-canvas.spec.ts` (New project), `image-smoke.spec.ts`, `image-roundtrip.spec.ts`, `phase2-evidence.spec.ts` |
| Image → Vector → save/reopen | `image-to-vector.spec.ts` (source hash, derivative provenance, reload, both source editors) |
| Image → Type → publish/reopen | `image-to-type.spec.ts` (Custom Type motif, derived layer, restore) |
| Shapes → Image derivative | `pipeline-phase3.spec.ts`, `shapes-smoke.spec.ts` |
| Generate layout → apply → undo | `generate-smoke.spec.ts`, `generate-reliability.spec.ts` |
| BEND publish / playback / source re-entry | `bend-integration.spec.ts` cases 1, 3, 4, 5, 6 |
| Static artwork → BEND motion derivative | `bend-integration.spec.ts` case 2 |
| Mixed static/video → reorder → save/reload | new `mixed static and BEND layers reorder, persist and export native video/package` |
| Cancel/error recovery without corruption | `bend-integration`, `vector-failures`, `phase2-reliability`, `phase3-reliability`, `generate-reliability` |
| Navigation among all six tools | `phase5b-navigation.spec.ts` |

### New or strengthened Phase 5B cases

- `phase5b-host-controls.spec.ts` — project rename, format change, save, reload persistence, Undo availability, tab order from project name through format/New/Save/Canvas, and a 2px keyboard focus outline.
- `phase5b-handoffs.spec.ts` — first-option focus, ArrowUp/ArrowDown navigation, whole-menu visibility inside the viewport, Escape focus restoration.
- `phase5b-responsive.spec.ts` — populated compact Layers and Inspector panels on real Vector artwork; all six tools in the compact Tools dialog; explicit Close and Escape focus restoration; nested Escape closes the Continue menu first and the Inspector dialog second.
- `bend-integration.spec.ts` — mixed static + BEND ordering, durable reorder across reload, real downloaded MP4/WebM bytes, and a real `.bendpkg` with `BENDPKG1` magic.
- `native-exports.spec.ts` — Custom Type motif creation is now resolved at action time, with a bridge assertion that the motif exists before native PNG/OTF export.

## 3. Local environment investigation

The first local full-suite attempt used Playwright's default two workers and reported **56 passed, 1 failed**. The failure was `native-exports.spec.ts` → Custom Type native PNG/OTF export: the page snapshot showed “Draw a pattern before exporting” while the test waited for a download. The same test passed alone in 3.1s.

This was an interaction-timing problem, not a lost product capability:

- the page was still functional and correctly refused to export without a motif;
- an isolated rerun passed;
- the gesture was changed from stale page coordinates to element-relative clicks resolved at action time, and the test now asserts the motif exists before exporting;
- the final **single-worker/CI-equivalent** suite passed all 61 cases.

The isolated `TEMP`/`TMP` directory prevented the earlier sandbox rename failures. Playwright exited cleanly and released ports 4175/4187/4189/4186/5181; no test server was killed manually and no unrelated development session was terminated. No `/favicon.ico` console failure appeared. The console guard in `studio-test.ts` and the explicit guards in the Phase 5B specs reported no page or console errors.

## 4. Preserved BEND verification

- `tool:bend:test` covers the preserved unit/engine surface: 20 files, 131 tests.
- `tool:bend:test:browser` runs the preserved Chromium + Firefox projects: **35 passed, 3 skipped**.
- The three skips are upstream Firefox-only encoder/export paths:
  - `studio2.spec.ts:71` — imports footage, trims and restores the project after reload (codec fixture coverage is Chromium-only);
  - `phase8.spec.ts:52` — validated cover PNG export;
  - `phase8.spec.ts:77` — soundtrack duration and mixed timeline audio export.
- These skips are configured by the preserved BEND suite, not introduced by Phase 5B. Chromium executes all three paths.
- Production `bend-production.spec.ts` loads the real nested `/tools/bend/index.html` bundle, adds a Signal Field, then loads Studio from `/`, opens BEND through the nested bridge, imports a real video, publishes, and asserts the host video layer with its poster. This verifies hashed assets/dynamic chunks outside Vite dev middleware.
- The mixed static/video case confirms the BEND inspector exposes **Download video** and **Download .bendpkg**, that both produce real local files, and that the downloaded package begins with `BENDPKG1`.

## 5. Production nested-route verification

Command: `npm run test:browser:bend:production`

- pretest builds Shapes, BEND and Studio into `apps/studio/dist`;
- `vite preview` serves the built host on `127.0.0.1:4186`;
- 2/2 tests passed:
  1. complete BEND editor loads from `/tools/bend/index.html` with Add/Signal Field/canvas;
  2. Studio publishes through the nested BEND bridge and renders the host video layer.

Evidence path: `docs/evidence/phase-4/01-production-nested-route.png`. The retained production test regenerates that Phase 4 image; the generated binary change was intentionally reverted to keep Phase 4 evidence stable because the production visual did not change. The production assertions above passed against the real built bundle.

## 6. Unit/component coverage

- Host: **16 files / 73 tests**, including six Phase 5A contract tests, 11 project-store tests, BEND source/package/layer tests, Image/Vector/Type/Shapes/Generate source-state tests, storage tests and `App`/component tests.
- BEND: **20 files / 131 tests**, including the two Studio session tests.
- No unit or browser assertion was removed or weakened.

## 7. Accessibility checks performed

- Keyboard tab order in the host header and into the rail.
- Focus-visible outline on the rail (2px solid).
- Contextual menu focus into first option, arrow-key navigation, Escape and focus restoration.
- Compact modal dialog focus containment/restoration, explicit Close, and nested menu Escape precedence.
- Labelled project, format, layer, visibility, lock, reorder and download controls; `aria-pressed`, `aria-expanded`, `aria-haspopup`, native dialog/alert/status semantics.
- Sampled contrast ratios: `#526c6e` on white 5.63:1; `#236f72` on white 5.85:1; `#193438` on white 13.21:1; `#193438` on `#dcefeb` 11.07:1; white on `#236f72` 5.85:1; danger `#a23c3c` on white 6.47:1.
- Reduced-motion override remains in the stylesheet.

Not performed: screen-reader output, forced-colors, a complete contrast sweep, browser zoom, physical touch hardware, Safari/WebKit, or an axe/WCAG conformance audit. No conformance claim is made.

## 8. Evidence

Phase 5B evidence is under `docs/evidence/phase-5b/`:

- `host-1440.png`, `host-1024.png`, `host-900.png`;
- `compact-390.png`, `compact-layers-390.png`, `compact-layers-populated-390.png`, `compact-inspector-390.png`;
- `step-a-1440.png`, `step-a-preview.png`, `step-b-layer.png`, `step-c-menu.png` (focused contextual menu, fully in view);
- `mixed-static-video-1440.png` (reordered static + BEND composition with native downloads).

Phase 1–4 evidence directories were regenerated as a side effect of the retained evidence tests; they were restored to their committed versions so this change set contains only Phase 5B evidence.

## 9. Exact reproduction

```text
npm run typecheck
npm run verify
CI=1 npm run test:browser

npm run tool:bend:typecheck
npm run tool:bend:test
npm run tool:bend:build
npm run tool:bend:test:browser

npm run test:browser:bend:production
```

The host and BEND browser commands were also run with a writable isolated `TEMP`/`TMP`; the final host run used one worker, matching CI's resource policy.
