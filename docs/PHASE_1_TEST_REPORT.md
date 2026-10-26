# Phase 1 Test Report — Vector Vertical Slice

**Date:** 2026-10-26  
**Runtime:** Windows, Node `v24.13.0`, npm `11.6.2`, Chromium via Playwright, viewport 1440×900 (browser journeys).  
**Result:** PASS for the Phase 1 scope.

## Commands and results

| Command | Result |
| --- | --- |
| `npm run contracts:typecheck` | PASS |
| `npm run build` | PASS — host + generated `/tools/vector/adapter.html` |
| `npm test` | PASS — 7 files / **31 tests** |
| `npm run test:browser` | PASS — **12 tests** |
| `npx playwright test tests/browser/vector-roundtrip.spec.ts --project=chromium` | PASS |
| `npx playwright test tests/browser/transport.spec.ts --project=chromium` | PASS |
| `npx playwright test tests/browser/vector-baked.spec.ts tests/browser/vector-layers.spec.ts --project=chromium` | PASS |
| `npx playwright test tests/browser/vector-failures.spec.ts --project=chromium` | PASS |
| `npx playwright test tests/browser/host-canvas.spec.ts --project=chromium` | PASS |

**GitHub CI:** [run 40342936293](https://github.com/tanishkfr/insta-post-studio/actions/runs/40342936293) — success at code commit `0127de9baa1113b4ece188995d96a247e89d3f26`, including clean `npm ci`, contract typecheck, build, unit tests and the automated Chromium browser job.

An earlier browser CI attempt (run 40341616959) timed out because the Vite webServer was not explicitly bound to IPv4; commit `0127de9` adds `--host 127.0.0.1`. The rerun passed both CI jobs.

The browser config starts the Studio host (`4175`), a separate-origin deterministic fake adapter (`4189`) and the preserved standalone Vector page (`4187`). All browser tests fail on any uncaught page error or `console.error`, including errors from embedded frames.

## Unit and component tests

| File | Tests | Covers |
| --- | ---: | --- |
| `src/state/projectStore.test.ts` | 7 | order reconciliation, transforms, visibility/lock/opacity, undo/redo, duplicate/delete/reorder, format change, source/rendered layer updates |
| `src/storage/projectRepository.test.ts` | 6 | save/reload, latest project, revision CAS conflicts, unsupported schema, interrupted/stale write recovery |
| `src/storage/assetRepository.test.ts` | 6 | binary persistence/integrity, content dedupe, source revisions, missing references, corruption detection, object-URL ref counting |
| `src/adapters/vector/svgSanitizer.test.ts` | 3 | valid SVG preservation, executable/external content removal, malformed/missing viewBox rejection |
| `src/adapters/vector/vectorSourceState.test.ts` | 4 | source parsing, baked state, version/tool rejection, malformed state |
| `src/sourceIntegrity.test.ts` | 1 | `arnav.html` remains byte-identical (SHA-256) |
| `src/App.test.tsx` | 4 | topbar/save/format, live-vs-disabled tools, layer panel visibility/lock/rename, inspector metadata/transforms |

**Total:** 31 passing.

## Browser acceptance scenarios

| # | Test | Evidence |
| --- | --- | --- |
| 1 | Shell loads from IndexedDB, empty persisted canvas, live Vector entry, no page overflow | smoke |
| 2 | Preserved standalone Vector still loads, generates SVG and responds to Randomise | smoke |
| 3 | **Journey A/B:** 4:5 project, Vector session, seed/colour edit, publish, SVG layer, host move/resize/rotation/opacity, save/reload, reopen exact state, republish revision, same layer ID/transform, undo/redo source asset, reload again | `01-vector-editor.png`, `02-published-canvas.png`, `03-reloaded-project.png`, `04-reopened-source.png` |
| 4 | Manually baked geometry + duplicate + selection + Edit tab restore across publish/reload | `05-baked-vector-editor.png`, `06-baked-source-reopened.png` |
| 5 | **Journey C:** two layers, reorder, hide, undo/redo, cancel edit without changing source, republish a hidden layer without losing order/visibility, reload, reopen both | `07-layer-management.png` |
| 6 | **Storage failure:** simulated IndexedDB write failure, visible error + retry, previous revision survives reload | `08-storage-failure.png` |
| 7 | **Unsupported source version:** clear error, layer retained, back/reload safe | `09-unsupported-state.png` |
| 8 | **Missing rendered blob:** layer retained, UI reports unavailable artwork, original source still reopens | failure test |
| 9 | Host canvas: rename, duplicate/delete, direct mouse move, direct handle resize, save/reload, new project creation | `10-host-canvas-interactions.png` |
| 10 | Fake adapter happy path: READY, initialize, open, context, assets, restore, serialize, render bytes, progress/issue events, close | transport test |
| 11 | Transport rejects wrong origin, wrong scope (READY and response), wrong protocol, forged sender | transport test |
| 12 | Transport handles handshake timeout, render timeout, late response, stale response and cancellation | transport test |

## Source preservation checks

- `tools/legacy/vector/arnav.html` SHA-256 remains **`24633B7233A5E7AD088D1E4423AACD21D838F215654F838170077328C1CB5AA2`**.
- `git diff phase-0/foundation -- tools` is empty.
- The generated adapter is built from the original at request/build time; no algorithm or DOM rewrite is checked in.
- Standalone editor test confirms the original entry point still functions.
- The bridge/source hash guard runs in unit tests.

## Reliability and security observations

- Publishing validates source state and render output before the layer commit.
- Source and rendered blobs are written and read back before project references are created.
- Project writes use compare-and-set revisions and single transactions.
- Failed project writes do not overwrite the last durable document; the browser shows `Project save failed` and a Retry action.
- All tool messages require exact origin, sender (`iframe.contentWindow`), protocol, scope and a live request ID.
- Stale and unsolicited responses are ignored and surfaced to a protocol observer.
- Close/dispose removes the window listener and rejects pending requests.
- Sanitizer strips executable/external content and is applied again when loading a layer.
- No console or page errors occurred under the automated guard.

## Deferred / not exercised

These remain **not verified by Phase 1 acceptance** and must not be marked tested:

- Original Vector imports (SVG/raster), clipboard, PNG export, all object-transform/inspector combinations, path-selection edge cases and every preset.
- Other tools (Image, Generate, Typography, Shapes, BEND) — untouched and intentionally unintegrated.
- Cross-browser support (Firefox/Safari/WebKit), mobile/touch, offline font behavior.
- Final multi-layer composition export.
- Vector source-version migration beyond rejection.
- Long-duration asset cleanup/garbage collection (not implemented; no deletes).
- Concurrent tabs (project revision conflicts produce an error and require reload; no merge/reload UI).
- Host composition performance with dozens of complex SVG layers.
- Accessibility audit beyond keyboard-accessible controls and labels; no axe run in Phase 1.
- Cross-browser CI browser matrix (only Chromium is installed/run).

## Evidence

All screenshots are in [`evidence/phase-1/`](evidence/phase-1/):

- `01-vector-editor.png`
- `02-published-canvas.png`
- `03-reloaded-project.png`
- `04-reopened-source.png`
- `05-baked-vector-editor.png`
- `06-baked-source-reopened.png`
- `07-layer-management.png`
- `08-storage-failure.png`
- `09-unsupported-state.png`
- `10-host-canvas-interactions.png`

Playwright traces and failure artifacts remain under the gitignored `apps/studio/test-results/`.
