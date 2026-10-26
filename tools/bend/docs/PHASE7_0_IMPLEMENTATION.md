# BEND. Phase 7.0 — Implementation Record

Date: 2026-10-25  
Implementation checkout: `C:\Dev\Projects\Bend`  
Git HEAD: `343260bb048a111475216ef2141eb5b89144de75` (local `main`, one commit behind `origin/main` at `1cfbe6f`)  
Working tree: 88 changed/untracked entries at final inspection; preserved outside Git, not committed.

This document records what was changed, why, and how each change was verified. The deployment report, feature matrix, test report, and Phase 8 handoff are separate documents.

## 1. Deployment architecture

### 1.1 Vercel configuration

Added `vercel.json` with an explicit Vite contract:

- Framework preset: Vite
- Install: `npm ci`
- Build: `npm run build`
- Output: `dist`
- Rewrites only `/studio`, `/studio/edit`, and `/integration` to `/index.html`
- Immutable one-year caching for hashed `/assets/*`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`

The rewrites are deliberately route-specific. A missing JavaScript asset returns a plain 404 instead of an HTML document with status 200; this is covered by the deployed routing suite.

Added `.vercelignore` so docs, tests, fixture generators, local evidence, and browser tool profiles are not uploaded. Runtime source, package files, and configuration remain included.

Added `.vercel/` and `.playwright-mcp/` to `.gitignore`.

The Vercel project was verified by CLI:

- Name: `bend`
- Project ID: `prj_rC1ESKcsrETeM33dTQI77QHIQdUS`
- Team ID: `team_VOeLK7yFGO2OfGuEOsffIywY`
- Node.js: 24.x
- Framework: Vite
- Root Directory: `.`
- Output Directory: `dist`

Production (`https://bend-gilt.vercel.app`) was not redeployed or re-aliased. `vercel inspect` still resolves the production alias to `dpl_69htoYbLyFNLqJYPmsJMZE6YGk9o`, created 2026-10-19.

### 1.2 Preview deployment protection

The project uses Vercel Authentication (`all_except_custom_domains`). Protection was not disabled. Automation access was provided by a Vercel Protection Bypass for Automation secret created for this phase. The secret is stored outside the repository in a restricted local snapshot directory and is not written to source, reports, screenshots, or Git. Browser tests bootstrap the bypass cookie on a single request, then use the resulting origin-scoped cookie; the bypass header is not attached to page or third-party requests.

Preview URL used for final acceptance:

`https://bend-9b07efmjr-tanishkfrs-projects.vercel.app`

Deployment ID: `dpl_6JKYbspnxjrEiBw8xgNqfp9UU1K7`  
State: `READY`  
Target: preview (not production)

### 1.3 Bundle work

The previous 808 kB `host` chunk was caused by the editor statically importing the integration adapter and exporter stack. Changes:

- Moved `downloadBlob` to dependency-free `src/engine/export/download.ts`.
- Lazy-loaded `ExportDialog` and the encoder stack.
- Dynamically imported host edit/source code only in host context.
- Dynamically imported the integration adapter only when downloading a project package.

Result: the old `host` chunk fell from ~809 kB to ~6 kB and Mediabunny/exporter code moved to a separate `exporter` chunk loaded on demand. The remaining large shared chunk (~648 kB, ~179 kB gzip) contains Pixi/React/editor-shared code and is required by the editor. This is recorded as an advisory, not hidden by raising Vite’s warning threshold.

## 2. Confirmed defects fixed

### 2.1 Loop/work range was discarded when a composition shortened

**Root cause:** `normalizeLoopRegion` reset any out-of-bounds range to the full composition. A layer edit that shortened the composition silently disabled and expanded a user’s work range.

**Fix:** `src/engine/core/loop.ts` clamps a finite loop to the new duration and preserves `enabled`. Only non-numeric/empty documents fall back to the full-composition default.

**Tests:** `tests/unit/phase70.test.ts` asserts clamping on shrink and out-of-bounds persisted values.

### 2.2 Mask animation was deleted when switching the mask off

**Root cause:** `getAnimatableProperties` removed mask property definitions when `mask.type === "none"`. The next normalized commit dropped those tracks.

**Fix:** `src/engine/animation/engine.ts` always exposes mask animation definitions, so tracks survive a temporary mask toggle and reattach when a shape is enabled.

**Tests:** unit mask-track retention and deployed “composites blend modes and masks” journey.

### 2.3 Undo/redo could leave a deleted layer selected

**Root cause:** the store replaced `project` without reconciling `activeLayerId`.

**Fix:** `src/app/store.ts` reconciles the active layer after undo/redo, keeping the current selection if it exists and otherwise selecting the top remaining layer or `null`.

**Tests:** unit undo/redo active-layer regression.

### 2.4 A save retry could replay an older failed snapshot

**Root cause:** `ProjectSaveCoordinator.retry` unconditionally replayed the failed job, even if a newer job was pending in the debounce window.

**Fix:** `src/storage/saveCoordinator.ts` flushes a newer pending job instead, and refuses to replay when a newer revision already exists.

**Tests:** unit test proves a retry writes the newest snapshot after a quota failure.

### 2.5 Generator variation did not move animated generator keyframes

**Root cause:** animated scaling used `readNumber(layer, key)` instead of reading from `layer.generator`.

**Fix:** `src/engine/random/randomize.ts` resolves generator properties against the generator object and scales existing generator animation keyframes with the varied base value.

**Tests:** unit test finds a deterministically varied Signal Field speed and checks both keyframes scale.

### 2.6 New generators were inserted beneath existing layers

**Root cause:** both Add paths prepended new procedural layers. Adding a second generator placed it at the bottom, contradicting the visual “Add” expectation and making blend/order tests misleading.

**Fix:** new procedural layers append at the top of the canonical layer stack in `EditorPage.tsx` and `Inspector.tsx`; the timeline’s reversed visual order now shows the newest layer on top.

**Tests:** deployed blend/mask and creator projects exercise top-layer masks and blends.

### 2.7 Effect preset selection re-enabled a bypassed effect

**Root cause:** preset application replaced the whole effect object with a freshly created enabled effect.

**Fix:** preset application preserves `instanceId` and `enabled`.

**Tests:** deployed temporal-effect journey bypasses Channel Delay, selects RGB Stutter, and confirms it remains bypassed.

### 2.8 Recipe append could create an invalid stack

**Root cause:** append concatenated effects without enforcing uniqueness or keeping Frame Feedback terminal, and silently sliced overflow to eight.

**Fix:** `src/engine/recipes/recipes.ts` deduplicates effect types, inserts new passes before an existing Frame Feedback, keeps Frame Feedback terminal, and throws an actionable error on overflow.

**Tests:** unit append with existing Channel Delay + Frame Feedback, duplicate-type append, and deployed recipe journey.

### 2.9 Package import reported success warnings as an error; dialogs stacked

**Root cause:** successful restore warnings were written to `packageError`, rendering “Editable package unavailable.” The project library also stayed open behind the package preview, and the preview lacked a focus trap.

**Fix:** successful restores use a separate non-error notice; errors remain in `packageError`; the library is closed before preview; package preview has focus entry, trap, Escape close, and focus return.

**Tests:** deployed package round-trip asserts a restored notice and absence of the error banner.

### 2.10 Identical package assets were duplicated and changed host source revisions

**Root cause:** restore always assigned a new asset ID when an asset with the same source ID existed, even with identical bytes. That changed `getProjectVersion`, could fail host source-version checks, and accumulated media on repeated host edits.

**Fix:**

- `restoreEditableProjectPackage` compares existing and packaged bytes and reuses the existing local asset ID when identical.
- `loadHostEditSource` validates the packaged project version **before** any local ID remapping, using a single decoded package.
- Package restore accepts an already-decoded package to avoid decoding twice.

**Tests:** deployed package test imports the same package twice in one origin and asserts the asset-ID set is unchanged; deployed host round-trip passes.

### 2.11 Missing media blocked hidden-layer export; recovery copy failed ambiguously

**Root cause:** export preparation required every video asset, even for hidden layers. The package recovery button could not explain that incomplete media must be relinked first.

**Fix:**

- `getRequiredVideoAssetIds` filters to visible video layers.
- Visible missing media produces an actionable relink/hide message.
- Package download preflights missing local assets and explains that a package without media cannot be restored.
- Source relinking preserves layer placement, effects, mask, crop, color, and animation.

**Tests:** deployed missing-media journey verifies blocked visible export, successful hidden-layer PNG export, and relink recovery.

### 2.12 Export errors were swallowed; audio could be reported without samples

**Root cause:** any Mediabunny error fell through to another format and then MediaRecorder, potentially producing a successful-looking empty file. Audio status was marked included as soon as a track was prepared, before samples were written.

**Fix:**

- Encoder/render/decode errors now propagate with actionable messages.
- Encoded output below a minimum size is rejected.
- Audio status becomes `included` only after written samples > 0.
- Range audio that does not overlap the selected interval is reported explicitly.
- The legacy MediaRecorder fallback was removed. In tested Chromium it produced empty recordings and could hang while waiting for a canvas frame; it was not a reliable safety net. WebM remains a Mediabunny output path when MP4 codec selection is unavailable. Browsers with no supported WebCodecs encoder now receive an explicit error instead of a false success.

**Tests:** deployed full-quality/range/mute export checks, injected encoder failure, cancellation/retry, and output signature/size checks. No empty-success case remains.

### 2.13 Heavy preview renders were starved by playback updates

**Root cause:** every playhead update aborted the in-flight asynchronous render. When a temporal frame took longer than one animation tick, renders were continuously cancelled and the canvas could remain stale for seconds.

**Fix:** `CanvasStage.tsx` now uses a coalescing render pump:

- New project/time requests replace the pending request.
- An in-flight render is allowed to complete.
- The pump then renders the newest request.
- Stop/unmount/renderer replacement aborts deliberately.
- A slow-render overlay appears after 1.5 seconds with an explicit Stop preview action.

**Measured effect:** a Frame Feedback playback test improved from 2 completed frames in 2.5 s before the pump to 162 completed frames on the deployed build, while retaining correct output.

### 2.14 Nested temporal stacks could look frozen

**Root cause:** temporal effects recursively resample earlier effects, multiplying source reads. A Frame Feedback pass over Time Slice + Motion Echo + Channel Delay can require thousands of samples per preview frame. The old UI gave no warning while such a frame rendered.

**Fix:**

- Added `estimateTemporalSamplingLoad` / `isHeavyTemporalStack` in `src/engine/temporal/time.ts`.
- The effect inspector warns for pathological nested stacks and explains that preview remains cancellable.
- The canvas shows a slow-render status with a Stop preview control.
- Raw-frame cache is bounded by both entry count and a 192 MB byte budget; cache accounting is now explicit.

This is a mitigation and an honest warning, not a claim that every possible temporal stack is interactive. Performance evidence is in the test report.

### 2.15 Recipe preview could hang the page

**Root cause:** the Motion tab created a second Pixi/WebGL compositor for recipe previews. Switching to stateful/effect recipes (for example Liquid Bloom or Signal Breakdown) stalled the main thread for tens of seconds, visibly and reproducibly.

**Fix:** `RecipePreview` no longer creates a second compositor. It renders a deterministic Canvas 2D “recipe cue” and labels it “Static cue · apply to render.” Applying the recipe still uses the single shared Pixi compositor and produces the real, exportable result. This removes a second renderer and its context-switching failure mode; it does not remove recipe application, saving, import/export, duplication, rename, or deletion.

### 2.16 Accessibility and control-state issues

- Darkened `--text-tertiary` so 9–10 px helper text clears WCAG AA contrast on seafoam surfaces.
- Added grouped accessible names for Transform, Appearance, Mask, Source/Trim, Wave Displacement, generator controls, and temporal controls, removing ambiguous duplicate control labels.
- Added distinct “Bypass X in stack” / “Disable X effect” names.
- Added keyboard support to loop start/end sliders (arrow, Home, End, Shift for larger steps, aria-valuetext).
- Disabled transform, trim, generator, effect, appearance, mask and wave controls on locked layers instead of silently ignoring input.
- Added `role="img"` to the project-library structural thumbnail.
- Confirmed focus trap/return for export, library, package preview, and example dialogs.
- Verified reduced motion, forced colors, representative viewports, and a 200%-zoom-equivalent layout.

### 2.17 Test harness modernization

Added:

- `playwright.deployed.config.ts` — refuses localhost by default; requires HTTPS; no web server; Chrome, Edge, Firefox, WebKit, and touch/mobile projects; smoke/full/creator tiers.
- `tests/deployed/*` — deployed routing/headers, Studio 2.0 creative tools, export matrix, projects/data safety, accessibility, host harness, creator acceptance.
- `tests/browser/studio2.spec.ts` — maintained local Studio 2.0 smoke suite.
- `playwright.config.ts` now runs only the maintained local specs plus the capability matrix. Historical phase specs remain in the tree but are no longer a misleading gate.
- `.github/workflows/phase7-ci.yml` — typecheck/unit/build/local browser gate; manual deployed-preview smoke with secret injection and no automatic production promotion.
- `tests/fixtures/generate-phase7-fixtures.ps1` — deterministic H.264/AAC, VP9/Opus, portrait, square, silent, and 12-second fixtures.
- `scripts/source-identity.mjs` — content digest for dirty-tree snapshots.
- `scripts/inspect-media.mjs` — independent ffprobe metadata and byte hashes for evidence.

## 3. Deliberate scope boundaries

- No accounts, cloud media processing, hosted AI, or new group-toolset shell.
- No change to the shared Pixi compositor architecture or deterministic procedural rendering.
- No new short-form editing engine (clip sequencing, splitters, transitions, speed ramps). Those are recorded in the Phase 8 handoff.
- No production alias change and no Git commit/push.
- Project storage remains local-first and origin-scoped. The UI now explicitly states that a Vercel preview origin and the production domain do not share IndexedDB projects and that `.bendpkg` is the portable recovery path.
