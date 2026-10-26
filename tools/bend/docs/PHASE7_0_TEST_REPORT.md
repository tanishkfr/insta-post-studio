# BEND. Phase 7.0 — Test Report

Date: 2026-10-25  
Final deployed preview: `https://bend-9b07efmjr-tanishkfrs-projects.vercel.app`  
Deployment: `dpl_6JKYbspnxjrEiBw8xgNqfp9UU1K7` (preview, READY)  
Deployed source digest: `e4f8cae96f62e0b0f640f9ce75a4b07f0e62301a088721d1dbe9b056599dbf83`

This report separates unit, local-browser, deployed-browser, creator, media, performance, GPU, and accessibility evidence. Local tests are useful gates; they are not a substitute for the deployed-origin results below.

## 1. Commands and results

| Command | Result |
|---|---|
| `npm run typecheck` | PASS, exit 0 |
| `npm test -- --reporter=dot` | PASS, 104/104 tests, 17 files |
| `npm run build` | PASS, 9.10 s |
| `npm run test:browser` | PASS, 9 passed / 1 skipped (Chromium + Firefox maintained Studio 2.0 smoke) |
| `npx playwright test -c playwright.deployed.config.ts --grep @smoke` | PASS, 23 passed / 1 skipped, 1.5 min across Chrome, Edge, Firefox, WebKit |
| `npx playwright test -c playwright.deployed.config.ts --project=mobile` | PASS, 1/1, 7.0 s |
| `npx playwright test -c playwright.deployed.config.ts --project=chrome --grep @full` | PASS, 18/18, 2.8 min |
| `npx playwright test -c playwright.deployed.config.ts --project=chrome --grep @creator` | PASS, 3/3, 2.1 min |
| GPU warning probes (Chrome hardware, Chrome SwiftShader, Firefox) | Completed; see §6 |
| Performance probe (Chrome hardware, deployed origin) | Completed; see §5 |

Deployed tests receive:

- `BEND_DEPLOY_URL`
- `BEND_VERCEL_BYPASS` from the restricted local secret file (not in Git)
- `BEND_SOURCE_DIGEST`

The bypass is used only to set an origin-scoped Vercel cookie; it is not sent to third-party requests.

## 2. Unit tests

Final: **104 passed / 104**, 17 files, ~2–3 s.

Phase 7.0 additions in `tests/unit/phase70.test.ts`:

- loop/work-range clamp instead of reset when the composition shortens;
- mask animation tracks retained while mask type is `none`;
- active layer reconciled after undo/redo;
- save retry writes the newest edit, not the stale failed snapshot;
- generator variation scales existing animated generator keyframes;
- recipe append keeps Frame Feedback terminal and does not duplicate an effect type;
- Wave control ranges match persistence clamps;
- visible-only media requirements and range-overlap helper.

Existing suites also cover project migration, package format, export audio math, temporal sampling, storage revisions, host revisions/contracts, and integration adapters.

## 3. Deployed smoke suite

**23 passed, 1 skipped.**

Coverage:

- `/`, `/studio`, `/studio/edit`, `/integration` direct load and refresh;
- `/studio/edit` query-string preservation;
- unknown paths and missing assets return plain 404;
- correct HTML/JS/CSS MIME types;
- immutable asset caching;
- `nosniff` and referrer policy;
- no localhost dependency or unexpected application third-party origin;
- generator creation, preset/seed editing, canvas change, PNG download and signature;
- real H.264/AAC import, decode, seek, play/pause, trim, save and reload;
- actual Edge and Firefox engines;
- WebKit generator/PNG;
- mobile/Pixel touch emulation, mobile drawer, no horizontal overflow.

The single skip is the WebKit media-import test after both MP4 and WebM fixtures were rejected by that Playwright WebKit build. The actionable import error was asserted before skipping; it is not counted as a pass.

## 4. Deployed full suite (Chrome)

**18 passed / 18.**

### Creative tools

- Each temporal effect added, preset selected, preview changed, and stack validity checked;
- bypass survives preset selection;
- Frame Feedback move-up rejected;
- heavy-stack warning visible;
- effect stack copied;
- multiply/screen blend and ellipse mask changed the rendered page;
- ellipse mask keyframes retained across mask off/on;
- compare hold changes the rendered page;
- keyframe group selection, copy/paste, cubic easing preset, modulation controls;
- seeded generator variation and undo;
- recipe replace/append with terminal Frame Feedback guard;
- project library create/rename/duplicate/delete.

### Exports

- 2 s full-quality H.264/AAC with source audio; player duration/dimensions; downloaded `ftyp` MP4; 1,045,924 B;
- 1.0 s partial range with audio; 142,172 B; filename range;
- 0.5 s video-only muted range; no audio stream; 68,282 B;
- 1.5 s seamless mirrored loop; no audio; 347,501 B; mirrored policy text;
- injected unavailable WebCodecs encoder: explicit error, no false success; after restoring encoders and reloading, a valid 1 s export; 1,887,410 B;
- cancel in-flight high-quality export, no stale result, retry completes with a 2.005 s AAC/H.264 output; 1,057,384 B.

### Projects/data safety

- package export and fresh-context restore with video + procedural + effect;
- reimport of the same package reuses identical asset IDs instead of duplicating media;
- older stored document with deleted `loop`, `blendMode`, `mask` restores defaults without changing the rendered frame;
- missing media: visible layer blocked with actionable message; hidden-layer PNG export succeeds; relink removes banner and restores preview;
- injected IndexedDB quota failure: save error banner appears, Try again still fails while fault active, after fault removal the newest edit saves locally.

### Host harness

- Add BEND layer, set placement/opacity/playback/stacking, edit in BEND, add ellipse mask, update post;
- source version changed;
- host placement `x=120`, `y=-80`, opacity `0.72`, stacking `1`, playback `hold-last-frame`, foreground marker preserved.
- This is the local reference host only, not the real group toolset.

### Accessibility

- Axe WCAG 2 A/AA + 2.1 A/AA: **zero violations** on empty editor, layer editor, Effects, Motion, Export dialog, Project Library, and forced-colors editor. Stored reports are `[]`.
- keyboard: Add menu, Escape close, timeline scrubber, loop end slider, export dialog focus trap/return, library Escape/return.
- viewports 1440, 1280, 1024, 768, 390, and 720×450-equivalent: no horizontal overflow; Add control visible.
- reduced motion computed durations ≤ 0.01 ms.
- forced-colors screenshot inspected; controls and canvas remain visible.

## 5. Browser matrix and media

### Import/decode/seek/play/trim

| Browser | H.264/AAC import | Seek/scrub | Play/pause | Trim | PNG | Video export |
|---|---|---|---|---|---|---|
| Chrome 155 | PASS | PASS | PASS | PASS | PASS | PASS |
| Edge 156 | PASS | PASS | PASS | PASS | PASS | Deployed smoke does not export video on Edge |
| Firefox 157 | PASS | PASS | PASS | PASS | PASS | Not run in final full suite |
| WebKit 27.2 (Windows Playwright) | Rejected with actionable codec message | — | — | — | PASS for generator | Unsupported; explicit error expected |
| Pixel 7 emulation | Smoke layout/touch only | — | — | — | — | — |

Fixtures were independently probed:

- H.264/AAC 540×960 30 fps 6.0 s with 1 kHz tone;
- H.264/AAC 540×540 30 fps 4.0 s;
- H.264 960×540 30 fps 12.0 s silent;
- H.264 540×960 30 fps 3.0 s silent;
- VP9/Opus 540×960 30 fps 4.008 s;
- existing 24 fps, 29.97 fps, VFR, delayed-audio, nonzero-timestamp, negative-start fixtures.

Generated media metadata, stream codecs, dimensions, frame counts, audio channels, file sizes, and SHA-256 are in `output/evidence/phase7-0/media-inspection.json`.

### Rendering correctness

| Comparison | Result | Interpretation |
|---|---:|---|
| Project A poster vs exported frame | SSIM 0.928 | Poster was captured at 3.967 s; extracted MP4 frame content at ~4.000 s. Motion/keyframes and H.264 encoding explain the difference; visual content matches. |
| Project C poster vs exported frame | SSIM 0.976 | Crop/reframe/color/wave/Motion Echo agree between PNG preview and video output. |
| Project B seamless first vs last exported frame | SSIM 0.707 | Expected for mirrored time: the last frame maps near the start but is not the same instant; this is not mathematically periodic. |
| Project B exported frame 1 vs frame 89 | SSIM 0.956 | Confirms the mirrored boundary maps back near the opening; encoding accounts for residual difference. |
| Loop-start still vs exported first frame | SSIM 0.925 | Frame-time rounding and encoding; visual match. |

The UI and docs call this **mirrored repeat**, not universally seamless periodic motion. The loop has a velocity reversal by design.

### Audio

- Project A: video 10.000 s, AAC 6.016 s (topmost primary source only; source clip ends at 6 s).
- Project C: video 4.0107 s, AAC 4.0107 s; non-silent 1 kHz tone (mean −21.1 dB, max −18.0 dB).
- Partial range 0.5–1.5 s: AAC present, 1.0027 s.
- Muted 0.5–1.0 s: no audio stream.
- Seamless loop: no audio stream.
- Fault-recovery generator: no audio source, no audio stream.

No multitrack mixing was implemented or claimed.

## 6. GPU warnings

| Environment | Renderer | Minimal | Mask + Screen + Motion Echo | Video + PNG | Errors |
|---|---|---|---:|---:|---:|---:|
| Chrome hardware | ANGLE AMD Radeon 780M D3D11 | 0 warnings | 0 warnings | 0 warnings | 0 |
| Chrome SwiftShader | ANGLE Vulkan SwiftShader | 0 warnings | 0 warnings | 0 warnings | 0 |
| Firefox 157 | ANGLE AMD (generic) | 3 warnings | 4 warnings | 8 warnings | 0 |

Chrome/SwiftShader zero-warning result is evidence that the formerly reported `GL_INVALID_OPERATION: glCopySubTextureCHROMIUM` was not reproduced by the current engine in the tested workflows. It does **not** prove that warning had no other trigger; no claim of a root-cause fix is made.

Firefox warnings include:

- `texImage: Alpha-premult and y-flip are deprecated for non-DOM-Element uploads`;
- `drawElementsInstanced ... lazy initialization`;
- `copyTexSubImage ... texture not initialized / lazy initialization`;
- transient `WebGL context was lost` while importing/exports.

No Firefox console errors or page errors occurred. A focused probe showed `gl.isContextLost() === false` after editing, PNG export, and subsequent edits; canvas hashes continued to change. Output correctness was not affected in these workflows, but the warning remains an investigated P3 platform risk, not silenced.

## 7. Performance (final deployed origin)

Hardware: Chrome 155, AMD Radeon 780M D3D11, Windows 11, 1280×800, headless.

Playback sampling over 2.5 s:

| Composition | Completed renders | Render p50 | Render p95 | Max | Memory |
|---|---:|---:|---:|---:|---:|
| Signal Field | 420 | 1.1 ms | 1.4 ms | 2.4 ms | 16.1 MB |
| Video | 423 | 1.1 ms | 1.8 ms | 34.4 ms | 17.4 MB |
| Two generators + ellipse mask + Screen + Motion Echo | 34 | 76.2 ms | 119.2 ms | 120.8 ms | 11.2 MB |
| Video + Frame Feedback | 162 | 2.5 ms | 46.4 ms | 184.3 ms | 10.7 MB |
| Liquid (Nebula) | 394 | 1.4 ms | 3.7 ms | 18.9 ms | 18.9 MB |

Scrub sample medians: **7 ms p50 / 11 ms p95** on Signal Field.

Three consecutive 1 s preview exports: **1.468 s, 1.291 s, 1.180 s** (wall). JS heap before/after: **13.6 MB → 16.0 MB**; no progressive growth across the three runs is claimed as proof of leak freedom, but no critical leak or slowdown was observed. Export tests also included repeated PNG/video operations without failure.

Interpretation:

- Fast paths are genuinely interactive.
- The nested temporal composition is not interactive at 1080×1350; ~13 fps for that test. The UI warns and exposes Stop preview.
- The render scheduler prevents the previous starvation behavior: Frame Feedback playback now completes 162 frames in 2.5 s instead of only 2.
- The all-four temporal stack is still a known heavy path and can take minutes at late timestamps. It is not presented as production-real-time.

## 8. Deployment and origin-scoped storage

Verified:

- direct routes and refresh on the preview origin;
- same-origin asset loading, MIME types, caching, 404 behavior;
- no project or asset requests to localhost;
- IndexedDB persistence across reload and fresh context package restore;
- project switch, duplicate, delete, shared media;
- quota error and recovery;
- package round-trip between origins/contexts via `.bendpkg`.

Not tested as a claim:

- transfer of IndexedDB between preview and production origins (they are distinct origins by design);
- offline/PWA startup;
- browser restart on physical devices (fresh contexts were used);
- storage-unavailable browser with IndexedDB disabled (UI path exists, no final browser fault test).

## 9. Remaining defects and limitations

| Severity | Item | User impact | Status |
|---|---|---|---|
| P2 | All-four nested temporal stack can take minutes | Preview appears stalled; Stop preview and warning available; no export corruption | Open / documented |
| P2 | WebKit (tested Windows build) cannot decode fixtures or encode video | Import error; PNG/generator still work; no video export | Platform limitation |
| P3 | Firefox WebGL context/lazy-init warnings | No output failure observed; warning not silenced | Open / investigated |
| P3 | WebM fallback path not naturally triggered in tested browsers | MP4 codecs were available; WebM logic remains source-tested only | Partial verification |
| P3 | Replace Source lacks a final deployed browser journey | Unit/source coverage only | Open coverage gap |
| P3 | Rectangle/gradient masks, Add/Overlay blends, some presets lack dedicated export comparisons | UI/unit/source coverage only | Partial visual coverage |
| P3 | Timeline clip dragging/snapping/zoom lack final deployed automated journeys | Source/manual historical evidence only | Coverage gap |
| P3 | Manual screen-reader and physical touch sessions not performed | Automated/keyboard/touch-emulation only | Unverified manual area |
| — | Real group host absent | `/integration` is local reference harness only | Blocked (external) |

## 10. Final recovery snapshot

After documentation and evidence generation, the complete working tree was copied outside the repository and temporary storage to:

`C:\Dev\Snapshots\Bend\phase7-final-20261025`

Verification:

- 1,798 files, 366.1 MB;
- SHA-256 manifest: 1,798 entries checked, 0 bad hashes;
- reconstructed copy Git status matched the captured 95-line working-tree status;
- `git bundle verify`: bundle is okay;
- Git history, tracked diff, untracked list, and working-tree status are included;
- `node_modules/`, `dist/`, `test-results/`, `.playwright-mcp/`, `.vercel/`, and `.audit-sources/` are excluded;
- the automation bypass secret was not copied into source, docs, or test artifacts.

The pre-work snapshot remains at `C:\Dev\Snapshots\Bend\phase7-preflight-20261025-171910`.
