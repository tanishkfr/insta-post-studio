# BEND Phase 5.5 — Test Report

Date: 2026-10-25  
Checkout: `C:\Dev\Projects\Bend` — starting HEAD `343260b` plus the preserved Phase 5.3/5.4 worktree.  
Primary browser: system Google Chrome 155.0.8059.85, headless, SwiftShader WebGL.  
Media inspection: FFmpeg/FFprobe 9.0.

## 1. Commands executed and results

| Command | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm test -- --reporter=dot` | PASS — 15 files, 75/75 tests |
| `npm run build` | PASS — existing large-chunk advisory only |
| `node tests/manual/phase5-5-acceptance.mjs` | PASS — 13/13 acceptance journeys, zero console/page errors |
| `node tests/manual/phase5-4-ui-acceptance.mjs` | PASS — 17/17 Studio 2.0 checks |
| `node tests/manual/phase5-3-acceptance.mjs` | PASS — 40/40 media, persistence, package, relink, responsive checks |
| `npx playwright test tests/browser/smoke.spec.ts --project=chromium` | Not a valid full gate in this worktree; see historical-suite note below. Individual current smoke checks passed (unified shell, 61 rAF callback/s idle baseline, media export). |
| `npx playwright test tests/browser/phase3-temporal.spec.ts tests/browser/phase4-animation.spec.ts tests/browser/phase6a.spec.ts --project=chromium` | Not used as a gate; stale `/studio` entry labels and old `.layer-select` expectations. Current behavior is covered by the Phase 5.3/5.4/5.5 system-Chrome harnesses above. |

### Historical Playwright note

The repository contains browser specs from before the Studio 2.0 routing and label changes. They still expect a removed `/studio` entry page (`input[aria-label="Choose local video footage"]`), old `.layer-select` markup, and closed-by-default Appearance controls. Running them produces harness drift failures unrelated to Phase 5.5 runtime behavior. This report does **not** claim that suite as passing. Current browser evidence comes from the three real-Chrome harnesses above, which include Phase 5.3 media/package/relink/cleanup paths, Phase 5.4 Studio 2.0 paths, and the new Phase 5.5 journeys.

## 2. Unit coverage added

`tests/unit/phase55.test.ts` (15 tests) covers:

- Pre-5.5 defaults for blend/mask/loop and unchanged visual model.
- Mask/blend/loop validation and shrinking-duration behavior.
- Effect clipboard replace/append, incompressible duplicates, Frame Feedback terminal order, fresh IDs, remapped animation, modulator/easing preservation.
- Seeded generator and effect variation reproducibility, bounds, structural exclusions, and animated-value scaling.
- Keyframe group copy/paste/duplicate/delete/move, collision replacement, spacing, unique IDs, group easing.
- Hold/linear/cubic Bézier evaluator behavior and mask animation properties.
- Export range metadata/rejection, seamless time map and support analysis, source replacement policies, and audio output timestamps with a non-zero export start.

Total unit result: **75/75**.

## 3. Real-browser acceptance journeys

Evidence: `output/evidence/phase5-5/phase5-5-acceptance.json`  
Media: `output/evidence/phase5-5/media/`  
Screenshots: `output/evidence/phase5-5/*.png`

| Journey | Result | Evidence highlights |
|---|---|---|
| 1 — Creative variation | PASS | Generator variation changed bounds; undo/redo restored both directions; animated effect stack copied and replaced on a second layer with fresh instance IDs and remapped track `effects.effect-motion-echo-8ee07bc8-…decay`; PNG 1080 × 1350; save/reload kept both stacks. Pointer and keyboard comparison both changed the frame and restored the exact edited hash. |
| 2 — Footage replacement | PASS | Two layers shared one asset; replacement produced a new asset ID while the untouched layer retained the original; treatment (scale/keyframe track/effect) survived; fit policy produced 1.00s timeline; cancel made no project change; undo/redo restored 2.00s/1.00s; reload persisted; exported 1.00s range video. |
| 3 — Layer compositing | PASS | Multiply + ellipse + animated mask + Motion Echo produced different previews across time; all ellipse/rectangle/gradient masks produced distinct frames; PNG 1080 × 1350; 8s video at 720 × 900; reload preserved mask/blend/animation; preview-vs-scaled-export SSIM 0.944. |
| 4 — Animation editing | PASS | Three keyframes selected, group copied, pasted at the playhead with spacing preserved and unique IDs; one Undo/Redo removed/reapplied the whole paste; Snappy applied to all three selected keys; Shift+Arrow moved the group from `[0,1,2,4,5,6]` to `[0,1,2,5,6,7]` preserving selected spacing; save/reload kept six IDs and three cubic-Bézier keys. |
| 5 — Loop production | PASS | Loop region enabled and visible; end marker drag moved the region; playback wrapped from 4.89s to 2.36s inside 2–5s; cancellation returned `Export cancelled.`; range export was exactly 3.000s, 90 frames, 720 × 900; range-first vs full-at-2s SSIM = **1.000**; seamless export 3.000s/90 frames; boundary SSIM **0.8412** vs adjacent **0.8502**; reset returned to full composition. |
| 5A — Audio range | PASS | 0.5–1.5s range export: 1.0027s MP4, 30 video frames, AAC audio stream present, UI reported “Source audio included”. |
| 6 — Compatibility / reliability | PASS | Legacy project without loop/blend/mask loaded with identical canvas hash, normalized defaults applied; new fields saved/reloaded; `.bendpkg` restored in a clean context with Screen blend, ellipse mask, and loop 1–3s; Phase 6A host add/edit/update round-trip changed the host source version and returned to the harness. |
| Blend modes | PASS | Normal, Multiply, Screen, Add, Overlay produced **five distinct preview hashes** and **five distinct exported PNG hashes**. |
| Accessibility | PASS | axe (WCAG 2 A/AA + 2.1 A/AA) reported **zero** violations in the editor with mask/blend/loop/effect controls open and **zero** in the range/seamless export dialog; no serious/critical findings; 390px layout had no horizontal overflow. |
| Stateful range | PASS | Liquid + Frame Feedback 3s composition; export 1.0–2.5s (45 frames, 1.5s) first frame vs full-composition frame at 1.0s: SSIM **0.9959**. |
| Performance | PASS (measurement, not a hardware claim) | 3 generators + mask + Screen + Motion Echo: scrub samples 19.7–37.6 ms, median **26.8 ms**, p95 **37.6 ms**, heap ~27.5 MiB; 720 × 900 8s export **67.1 s** in SwiftShader. |

All 13 journey entries passed. Global console errors: **0**. Page errors: **0**.

## 4. Media outputs inspected

- `media/journey1-variation.png` — 1080 × 1350.
- `media/journey2-replacement.mp4` — 1s replacement export.
- `media/journey3-composite.png` — mask + blend still.
- `media/journey3-composite.mp4` — 8s, 720 × 900, 240 frames.
- `media/journey5-range.mp4` — 3.000s, 90 frames, 720 × 900.
- `media/journey5-full.mp4` — 8.000s, 240 frames.
- `media/journey5-range-first.png` vs `journey5-full-at-2.png` — SSIM 1.000000.
- `media/journey5-seamless.mp4` — 3.000s, 90 frames; last→first SSIM 0.841238; first→second SSIM 0.850232.
- `media/journey5-audio-range.mp4` — 1.002688s, H.264 + AAC.
- `media/stateful-range-part.mp4` (1.5s, 45 frames) vs `stateful-range-full.mp4` (3s, 90 frames) — first-frame SSIM 0.995855.
- `media/blend-mode-{normal,multiply,screen,add,overlay}.png` — five distinct SHA-1 hashes in preview and export.
- `media/journey6-editable.bendpkg` — restored with new feature fields in a clean context.

Independent FFprobe/FFmpeg was used for durations, frame counts, dimensions, audio streams, and SSIM comparisons. No FPS or quality claim was inferred from filenames or flags.

## 5. Migration, persistence, and package checks

- Legacy project without new fields: canvas hash before/after identical; normalized defaults `loop.disabled`, `blendMode: normal`, `mask.type: none`.
- New fields forced through save/reload in Journeys 1, 3, 4, 6.
- Package restore in a fresh browser context preserved blend/mask/loop and produced an editable project.
- Phase 5.3 40/40 checks include shared-media duplication/deletion, webm import, missing-media relink, package restore (including effect and keyframes), corrupt package rejection, package save/reload, and exports. All passed.
- Phase 6A host handoff: Add layer → Edit in BEND → add mask → Update Post → returned to host with a new source version. Passed.

## 6. Defects found and fixed during testing

1. **Filtered procedural blend modes did not change the frame.** Pixi leaf blend modes were ignored by the filtered render path. Added the custom back-buffer layer blend filter; verified five distinct preview/export modes.
2. **Temporal procedural sampling could double-apply transform/crop/color.** Temporal sampling now strips those treatments before Pixi re-applies them once in the declared order.
3. **Mask textures uploaded every frame.** Static mask signatures now avoid redundant texture updates.
4. **Rapidly closing and reopening Export preserved the previous “complete” result**, because the motion presence child was reused. Each open now gets a fresh session key; the full Phase 5.3 cancellation/retry flow passes.
5. **Tall export dialog hid the download action.** Dialog max-height/overflow was added; download and result actions are reachable.
6. **Temporal state could survive project switches.** Temporal caches and internal procedural renderers are reset by project identity.
7. **Group keyframe check used the wrong marker.** The test harness initially selected keys ending at the composition end; product correctly rejected an impossible duplicate. Coverage was corrected to verify duplicate/space semantics inside the available range.

## 7. Performance measurements

Measured in system Chrome 155/SwiftShader, 1440 × 980 viewport:

- Heavy interactive composition (Signal + Flow + Refraction, top Screen blend, ellipse mask, Motion Echo): 9 end-to-end scrub renders, **median 26.8 ms / p95 37.6 ms**, JS heap ~27.5 MiB.
- Same composition, 8s preview video at 720 × 900: **67.1 s** wall time, 240 frames, H.264.
- Explicit loop-range export on a single generator: 3s/90 frames in ~2.4–3.0s.
- Seamless range export: 3s/90 frames in ~2.4s.
- Idle shell smoke baseline: **61 rAF callbacks/s**.
- Phase 5.3 existing media export: 3.008s output at 1080 × 1350.

There is no pre-5.5 numeric baseline for the new heavy composition, and SwiftShader is not hardware GPU. The report therefore records current absolute numbers and the targeted optimizations instead of claiming a fabricated improvement.

## 8. Blocked / not verified

- Firefox browser acceptance.
- Hardware-GPU acceptance.
- Manual screen-reader, 200% zoom/text-spacing, forced-colors, and physical-touch passes.
- Direct mask manipulation on canvas (deliberately not shipped; inspector precise controls are supported).
- Live seamless-loop preview (seamless is an export mode; ordinary loop playback is live).
- Full historical Playwright suite (stale routes/selectors; not a valid gate for this worktree).

These are verification/scope limitations, not hidden product failures.

## 9. Final acceptance matrix

| ID | Feature | Status | Evidence |
|---|---|---|---|
| 55-01 | Before/after | PASS | J1 pointer + keyboard compare; hash restoration; no history commit; no persistence |
| 55-02 | Effect clipboard | PASS | J1 replace; unit append/overflow/ordering; UI report |
| 55-03 | Animated effect paste | PASS | Fresh IDs + remapped track asserted from persisted project |
| 55-04 | Randomization | PASS | Seeded same-output unit test; browser undo/redo; bounded registry ranges |
| 55-05 | Replace Source | PASS | J2 shared asset, cancel, fit policy, treatment, undo/redo, reload/export |
| 55-06 | Blend modes | PASS | Five distinct preview and exported PNG hashes; preview/export mask SSIM 0.944 |
| 55-07 | Masks | PASS | Distinct rectangle/ellipse/gradient frames; exported 1080 × 1350 still |
| 55-08 | Mask animation | PASS | Animated mask preview change; persisted/reloaded; video export |
| 55-09 | Multi-keyframe | PASS | Three selected, group paste/move/undo/redo, unique IDs, spacing, reload |
| 55-10 | Easing | PASS | Existing evaluator exported; group preset; cubic persistence; curve preview |
| 55-11 | Loop region | PASS | Inputs, marker drag, playback wrap, reset, persistence |
| 55-12 | Range export | PASS | 3s/90-frame output, SSIM 1.0 vs full at 2s; stateful 0.9959; audio 1.0027s |
| 55-13 | Seamless loop | PASS | Supported path exported 3s/90 frames; boundary SSIM comparable to adjacent; limits documented |
| 55-14 | Performance | PASS with limits | Measured absolute numbers; targeted cache/rebuild reductions; no hardware baseline |
| 55-15 | Migration | PASS | Legacy hash identical + defaults; unit coverage |
| 55-16 | Persistence | PASS | Save/reload in J1/J3/J4/J6 |
| 55-17 | Packaging | PASS | `.bendpkg` clean-context restore of blend/mask/loop; Phase 5.3 package checks |
| 55-18 | Integration | PASS | Phase 6A add/edit/update round-trip; host version changed |
| 55-19 | Accessibility | PASS with limits | axe zero violations (editor + export dialog); 390px no overflow; manual SR/zoom not run |
| 55-20 | Regression | PASS with limits | Phase 5.3 40/40, Phase 5.4 17/17, units 75/75; historical Playwright suite stale |
| 55-21 | Browser QA | PASS | Real system Chrome; FFmpeg/FFprobe media inspection; screenshots/artifacts |
| 55-22 | Documentation | PASS | This report plus implementation, audit, and Phase 6B handoff |

Overall: **PASS with the explicitly listed environment/scope limitations.** No P0/P1 runtime defect remains in the tested Chromium path.
