# Studio 2.0 — Phase 1 Report

**Date:** 2026-10-26  
**Scope:** shared project engine, IndexedDB persistence, secure tool transport, complete Vector integration and a minimal host compositor.

## A. Verdict

**PASS** for the Phase 1 scope.

The real user loop works end to end: open Vector inside Studio, make procedural or manually edited artwork, publish a sanitized SVG plus complete editable source, edit host transforms, save to IndexedDB, reload, reopen the exact Vector source, revise it, republish to the same layer without losing host presentation, and survive cancel/undo/redo/error paths.

This is not a claim that all Vector controls or any other tool were exhaustively runtime-tested. Deferred checks are listed in section J and in the test report.

## B. Git branch, commit SHA and GitHub CI

| Item | Value |
| --- | --- |
| Repository | `https://github.com/tanishkfr/insta-post-studio` (private) |
| Base | `phase-0/foundation` @ `8a4d2bacda9483eea6ecd0c65dd3266398618734` |
| Phase 1 branch | `phase-1/shared-foundation` |
| Foundation commit | `82160689cf0af7dca4774c44b9c0426da8c2ece1` |
| Vector/UI commit | `d0c1c705c35de96d41beeee8368b1ef53b932b74` |
| CI bind fix | `0127de9baa1113b4ece188995d96a247e89d3f26` |
| CI | [run 40342936293](https://github.com/tanishkfr/insta-post-studio/actions/runs/40342936293) — **success** (host build/contracts/unit + Chromium acceptance) |
| Documentation head | a subsequent docs-only commit on the same branch; exact final SHA is in the delivery response |

No deployment, no changes to upstream repositories, no BEND Vercel changes.

## C. Shared project and IndexedDB implementation

Implemented:

- `apps/studio/src/state/projectStore.ts`
  - name/format/active artboard/active tool/selection
  - create/update/duplicate/delete/reorder layers
  - visibility, lock, opacity, position/size/rotation, aspect-preserving resize and clamping
  - source/rendered reference updates and explicit source revision identity
  - bounded host undo/redo
  - order reconciliation so `Artboard.layerOrder`, layer `order` and `project.layerOrder` cannot drift.
- `apps/studio/src/state/useProjectPersistence.ts`
  - latest-project hydration, debounced autosave, manual save, project creation
  - compare-and-set revisions; failed writes leave the last durable project intact.
- `apps/studio/src/storage/projectRepository.ts`
  - project store, schema validation, migration hook, revision conflict detection.
- `apps/studio/src/storage/assetRepository.ts`
  - rendered and source-state blobs, SHA-256 content hashing/dedupe, integrity checks, missing-reference reporting.
  - source states are immutable per revision; old revisions remain readable for undo.
- `apps/studio/src/storage/objectUrls.ts`
  - reference-counted object URL lifecycle.
- Publishing commits assets first and reads both back before the layer/project is allowed to reference them.
- No binary data is embedded in project JSON. No asset deletion exists, so project history/source revisions cannot be invalidated by cleanup.

Contract extension (documented): `ToolSourceStateReference.revision` plus optional source/rendered content hashes.

## D. Secure adapter transport results

`apps/studio/src/adapters/iframe/` implements `ToolAdapterV1` over exact-origin `postMessage`.

Verified with real Chromium and a deterministic cross-origin fake adapter:

- READY handshake.
- Initialize/open.
- Global context delivery.
- Binary input asset delivery/receipt.
- Source-state restore.
- Render bytes.
- Editable source serialization.
- Progress and issue events.
- Cancellation.
- Close/listener disposal.
- Wrong origin rejection (`ORIGIN_REJECTED`).
- Wrong scope rejection, both on READY and responses (`SCOPE_MISMATCH`).
- Protocol mismatch rejection.
- Forged-sender rejection (parent cannot impersonate the iframe).
- Handshake timeout.
- Render timeout.
- Late-response rejection.
- Unsolicited/stale-response rejection.
- `Uint8Array` survives structured clone.
- No wildcard target origins.

Transport implementation also rejects mismatched response methods, reuses no pending request IDs, cleans timers/listeners and maps failures to user-readable errors.

## E. Vector feature preservation

- Original file `tools/legacy/vector/arnav.html` is unchanged:
  - SHA-256 `24633B7233A5E7AD088D1E4423AACD21D838F215654F838170077328C1CB5AA2`
  - `git diff phase-0/foundation -- tools` is empty.
  - Unit guard fails if the file changes.
- Integration is a Vite-generated derived page with an injected bridge in the same classic-script scope.
- The full original editor loads in Studio: generator modes/fields, presets/palettes, controls, type settings, selection/transform overlays, bake/edit workflow, clipboard, import, undo/redo, export actions and shortcuts are all present.
- Standalone legacy editor still loads and generates artwork (browser test).
- Phase 1 acceptance exercised procedural generation, mode change, seed/colour changes, manual bake, select-all/duplicate, SVG output and source re-entry.
- The remaining original controls are preserved but not all were executed; they stay marked source-only in the feature matrix.

## F. SVG publication and editable source-state restoration

Published asset:

- Fresh `#stage svg` render after forcing `drawNow()`.
- Editor overlay (#ovl) and selection UI removed.
- Native `viewBox="0 0 1000 1414"` and native dimensions retained.
- SVG remains vector, not rasterized/flattened.
- Allowlist sanitization strips scripts, handlers, foreignObject, external images, links, inline styles and external URL references. Malformed/missing-viewBox SVG is rejected.
- Sanitized blob stored in IndexedDB, hash-verified, then rendered inline by the host.
- The authored Vector background is preserved as part of the artwork; Studio adds no white fill.

Source state (schema `1.0.0`, MIME `application/vnd.studio.vector+json`) includes:

- full native `P` params incl. seed, mode, palette/colours, text, `ov`, `baked`
- baked geometry + per-object transforms
- native history/redo and initial overrides
- selection, zoom, snap, active tab
- explicit revision via `ToolSourceStateReference.revision`.

Verified:

- Procedural round-trip restores seed/colour/mode.
- Manually baked 124-line document restores in the Edit tab with editable lines and the same geometry.
- Republish updates the same layer ID, preserves host X/Y/width/rotation/opacity, preserves hidden/order state, and increments source revision.
- Host undo after republish restores the earlier source revision while the new/old blobs both remain readable.
- Cancel after unsaved edits leaves the prior source untouched.
- Unsupported source versions fail before loading the editor and preserve the layer.

## G. Host canvas and layer interactions

- Active artboard with dynamic aspect ratio and persistent format (4:5, 1:1, 9:16).
- SVG layers rendered at intended aspect, with host position, effective scale, rotation, flip support, visibility, opacity and clipping.
- Selection outline and resize handle.
- Direct mouse move and resize; artboard-clamped so handles remain reachable.
- Keyboard nudging for selected canvas layers.
- Layer panel: select, inline rename, reorder, show/hide, lock/unlock, duplicate, delete, edit source.
- Inspector: layer/source/version, name, X/Y, width/height, rotation, opacity, visibility, lock, Edit in Vector, Download SVG.
- Undo/redo in topbar and keyboard shortcuts.
- Project name, format selection, save status, manual save and New project.
- Responsive layout for desktop and compact widths; no page overflow in tested states.
- Console guard ensures no host/iframe console errors in acceptance runs.

No final artboard/composition export is implemented in this phase.

## H. Browser acceptance results

`npm run test:browser` — **12/12 passing** Chromium tests at 1440×900, no console/page errors.

- Shell/IndexedDB hydration, empty canvas, format, save status, no overflow.
- Standalone preserved Vector still loads/generates.
- Journey A/B: publish, transform, save/reload, reopen source, republish same layer, undo/redo source assets, reload, reopen again.
- Manually baked artwork round-trip.
- Journey C: two layers, reorder, hide, cancel, undo/redo, republish hidden/reordered layer, save/reload.
- Storage failure recovery.
- Unsupported source version error.
- Missing rendered blob + source re-entry.
- Host rename/duplicate/delete/direct move/direct resize/save/reload/new project.
- Fake adapter happy path + events.
- Transport security rejection.
- Transport timeout/stale/late/cancellation.

Details: [PHASE_1_TEST_REPORT.md](PHASE_1_TEST_REPORT.md). Unit tests: **31/31** across project store, repositories, sanitizer, source state, source integrity and UI components.

**GitHub CI:** [run 40342936293](https://github.com/tanishkfr/insta-post-studio/actions/runs/40342936293) is green at code commit `0127de9baa1113b4ece188995d96a247e89d3f26`: clean install, contract typecheck, production build, 31 unit tests, Chromium install and all 12 browser tests. The first browser CI attempt (run 40341616959) exposed that the Vite webServer omitted an explicit IPv4 host; the fix binds `127.0.0.1` and the rerun above passed. This was a test-environment binding issue, not a product behavior regression.

## I. Screenshots and evidence paths

All under [`docs/evidence/phase-1/`](evidence/phase-1/):

1. `01-vector-editor.png` — integrated preserved Vector, Studio chrome and artboard context.
2. `02-published-canvas.png` — published SVG layer with host transform.
3. `03-reloaded-project.png` — project, format, layer, transform and source revision after reload.
4. `04-reopened-source.png` — saved Vector source reopened inside the real editor.
5. `05-baked-vector-editor.png` — manually baked/duplicated lines before publish.
6. `06-baked-source-reopened.png` — baked editable state restored after reload.
7. `07-layer-management.png` — two-layer reorder/visibility scenario.
8. `08-storage-failure.png` — visible save failure with retry and intact composition.
9. `09-unsupported-state.png` — unsupported source-state error with Back action.
10. `10-host-canvas-interactions.png` — direct move/resize, selection and persisted layer.

Playwright traces/failure artifacts remain in gitignored `apps/studio/test-results/`.

## J. Known limitations and remaining issues

1. **Only Vector is integrated.** Image, Type, Generate, Shapes and BEND remain preserved baselines; their adapter work is untouched.
2. **Same-origin iframe** currently. The transport is exact-origin ready for a dedicated tool origin, but production isolation is not configured.
3. **No final composition/artboard export.** The canvas is a working editor, not the final export engine.
4. **No asset garbage collection.** Old source/render revisions are retained for undo/history; storage grows until a reference-aware GC is designed.
5. **Host undo history is in-memory only.** Durable project/assets survive reload; undo stack does not.
6. **No multi-artboard UI.** Contracts/store support artboards; only the active first artboard is exposed.
7. **Vector source migrations not implemented.** Version `1.0.0` is accepted; anything else fails safely.
8. **Original Vector limitations remain:** no node/Bézier editing, text is not an independently selectable object, imports flatten styles, fonts are network-dependent for intended typography.
9. **Not every original Vector control is feature-tested.** Imports, clipboard, PNG export and many per-object combinations remain source-only.
10. **Chromium only** for Phase 1 acceptance; no Firefox/WebKit/mobile/touch/axe audit.
11. **Scale/flip are represented in rendering**, but the UI exposes size/rotation rather than separate scale/flip controls; icon-based handles can be clipped under aggressive rotation near edges.
12. **Concurrent tabs** produce a revision-conflict error; there is no automatic reload/merge UI.
13. **New project creates a new document but there is no project library UI**; reload always opens the most recently saved project.
14. **Licensing** remains unresolved for upstream Legacy/Shapes/Typography; this repo stays private.

## K. Exact Phase 2 starting point

Branch `phase-2/tool-expansion` from `phase-1/shared-foundation`.

1. **Generalize the Vector session controller** into a reusable tool-session wrapper around `ToolAdapterV1` (loading/retry/cancel/publish/errors), keeping Vector's bridge-specific capture logic behind a small registration interface.
2. **Add the Image adapter next.** Use the same repository/store/transport:
   - derived wrapper from `tools/legacy/image/janya.html`;
   - input source-photo asset delivery through the already-tested `ToolInputAsset` path;
   - render at true 1080 export size (not the legacy shell's preview capture);
   - versioned source state including effect/order/mask and photo reference;
   - preserve PNG/layered ZIP/GIF exports.
3. Add the host's raster-layer display path and final-composition export planning after Image has a proven round-trip.
4. Then Typography, Generate, Shapes render/serialize and BEND's dedicated bridge in that order, with adapter conformance tests reused.
5. Do not redesign the original editors; extend the proven wrappers/contracts.

The shared project, assets, transport, UI shell and acceptance patterns are ready for the next tool without rebuilding the foundation.
