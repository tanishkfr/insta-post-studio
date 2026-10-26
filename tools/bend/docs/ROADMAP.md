# BEND. roadmap

## Phase 1 — foundation + functional vertical slice

Status: complete for the scoped local slice.

- Landing page with live Signal Field hero and experiment gallery.
- Project entry for `4:5`, `1:1`, and `9:16` canvases.
- Local MP4/WebM import and IndexedDB media persistence.
- Deterministic Signal Field presets with editable seed and parameters.
- PixiJS WebGL preview with Wave Displacement shader for footage.
- Single-track editing, pointer scrubbing, playback, keyboard seeking, PNG export, and browser video export.
- Responsive editor drawer, focus-visible controls, reduced-motion CSS, and Chromium/Firefox smoke coverage.

## Phase 2A — media reliability + multi-layer composition

Status: Phase 2A core scope plus the Phase 2A.1 hardening pass are locally verified in Chromium; cross-browser and assistive-technology limitations remain. See [TEST_REPORT.md](TEST_REPORT.md), [PERFORMANCE_REPORT.md](PERFORMANCE_REPORT.md), and [ACCESSIBILITY_REPORT.md](ACCESSIBILITY_REPORT.md).

- Schema-v2 ordered procedural/video layers with stable ids, independent transforms, opacity, visibility, locking, muting, placement, trimming, and layer-specific Wave Displacement.
- Compact multi-row timeline with move/trim gestures, current-time indicator, snapping, keyboard seeking, zoom, horizontal scrolling, and undo/redo boundaries.
- Shared preview/export layer evaluation; no internal flattening of imported media.
- Mediabunny media inspection for audio capability, frame rate, VFR flag, and source timestamps.
- Timestamp-based `CanvasSink` export path when the browser can decode the video track, with HTML video compatibility fallback and explicit precision limitations.
- Primary source-audio preservation with trim/timeline synchronization; explicit no-mix policy for overlapping audio; mute and unavailable states surfaced in the export UI.
- 5s, 10s, 15s, 720p, and verified 1080×1350 local export coverage; progress and cancellation paths.
- Phase 1 project migration, malformed-document rejection, resource cleanup tests, and lazy landing/editor bundle split.

## Phase 2A.1 — reliability, accessibility, and performance hardening

Status: PARTIAL by the acceptance gates. The main implementation and Chromium evidence are complete; Firefox launch, screen-reader, true 200% zoom, and hardware-level performance evidence remain open.

- Reproducible FFmpeg fixtures cover constant 24/30fps, 29.97fps, irregular VFR, nonzero video start, delayed audio, trimmed audio, and performance media. The negative-start request is retained with its actual muxer-normalized result documented.
- VFR and nonzero-start exports use timestamp-based decoding and preserve `0.966667s` and `1.250000s` output durations under independent `ffprobe` inspection.
- Object URL, hidden-video, renderer, Mediabunny input, and removed-asset cleanup paths are covered by unit/browser probes.
- `@axe-core/playwright` scans eight rendered states with zero current Chromium violations; manual keyboard/focus workflows pass.
- Chromium Worker/OffscreenCanvas/WebGL capability evidence exists, but production worker adoption is intentionally rejected pending a shared Pixi/source lifecycle and measurable responsiveness gain.
- Primary-source audio policy is documented and tested; multi-source mixing remains out of scope.

Remaining verification: Firefox on a working browser host, NVDA/another screen reader, true 200% browser zoom, physical-device behavior, and GPU/heap instrumentation beyond browser-exposed proxies.

## Phase 2B — advanced procedural motion generation

Status: IMPLEMENTED LOCALLY; verification is strong in Chromium but not a complete cross-browser acceptance claim. The registry, four generator systems, presets, grouped inspector controls, seeded randomization, timeline seeking, persistence, resource cleanup, shared export path, and Phase 2B browser/unit coverage are present. See [PROCEDURAL_ENGINE.md](PROCEDURAL_ENGINE.md), [PROCEDURAL_ENGINE_AUDIT.md](PROCEDURAL_ENGINE_AUDIT.md), [TEST_REPORT.md](TEST_REPORT.md), and [PERFORMANCE_REPORT.md](PERFORMANCE_REPORT.md).

- Signal Field remains the signature analytic generator and is preserved as the legacy-compatible registry entry.
- Liquid is a deterministic fixed-step CPU grid with checkpoint replay and GPU texture presentation. A full GPU multipass solver remains an explicit, documented gap rather than an unverified claim.
- Flow and Refraction are seeded analytic GLSL generators with four presets each.
- The editor's Generate workspace is registry-driven and keeps generator layers editable, undoable, persisted, and exportable through the existing compositor.
- Chromium covers the four generator controls, seeking, console/page-error capture, and short PNG export for every generator. Firefox remains unavailable on the current host, and hardware/GPU profiling is not claimed.

The next decision for this phase is whether a GPU multipass Liquid implementation is worth the added state-transfer and cross-browser complexity. It must preserve the current parameter contract and deterministic replay behavior before replacing the portable path.

## Phase 3 — experimental temporal effects

Status: **PARTIAL / implemented locally**. Motion Echo, Time Slice, Frame Feedback, and Channel Delay now have a shared layer-local temporal engine, 16 functional presets, inspector/library controls, bounded sampling/history, preview cancellation, seeking reset/replay, project persistence, PNG/video export wiring, and Chromium evidence clips. See [TEMPORAL_FX_ARCHITECTURE.md](TEMPORAL_FX_ARCHITECTURE.md), [TEMPORAL_FX_AUDIT.md](TEMPORAL_FX_AUDIT.md), [TEST_REPORT.md](TEST_REPORT.md), and [PERFORMANCE_REPORT.md](PERFORMANCE_REPORT.md).

- Motion Echo samples bounded nearby frames and composites decay/tint/blend/offset variants.
- Time Slice maps separate source timestamps to horizontal or vertical regions.
- Frame Feedback replays fixed-step processed history with bounded checkpoints; it is intentionally a Canvas 2D state path, not a GPU multipass fluid claim.
- Channel Delay samples red/green/blue at separate timestamps before recombination.
- Temporal stacks are stored per layer and normalized without changing the schema-v2 project envelope. Frame Feedback is restricted to one final temporal pass; Wave Displacement remains a documented post-temporal spatial pass.
- Local Chromium evidence covers 2-second single-effect exports, a Time Slice → Motion Echo stack, saved stack reload, backward-seek Frame Feedback replay, a nonzero-source-start Time Slice export, and five-second Phase 2B generator exports. Firefox, 10-second temporal stack coverage, full aspect/quality matrix, WebM fallback, imported-audio temporal export, and hardware profiling remain open.

## Phase 4 — keyframes, modulation, and motion recipes

Status: IMPLEMENTED LOCALLY; final readiness depends on Gate Zero export evidence and the documented browser/codec limits.

- Typed layer-local keyframe tracks with hold, linear, named easing, cubic-bezier, numeric bounds, discrete hold, and shortest-path rotation.
- Inspector diamonds, animated range controls, one-per-property deterministic modulators, timeline track lanes, keyframe dragging, keyboard movement, and snapping.
- Shared preview/export evaluation for transforms, generator parameters, Wave Displacement, and numeric temporal-effect parameters; Liquid receives per-step animated params and replays from deterministic state.
- Validated JSON motion recipes with replace/append application, built-in rendered previews, local save/duplicate/rename/delete/import/export, and six initial built-ins.
- Gate Zero evidence for a 10-second temporal composition with audio inspection, WebM capability/fallback, and 2/5/10-second performance measurements.

Open follow-ups remain structural parameter transitions, spring physics, multi-node modulation graphs, broader browser/codec coverage, and hardware-level performance counters.

## Phase 5 — complete product experience and release readiness

Status: **PARTIAL / implemented and verified locally**.

- Added a real editable two-layer study at project entry, using the existing generator, temporal, animation, persistence, and export boundaries.
- Added landing capability mapping, first-move guidance, visible save recovery, mobile controls discovery, timeline vocabulary, composition-order framing, and the editor accessibility fixes.
- Verified the sample through direct installed Chrome at desktop, tablet, and mobile widths, including save/reload, keyboard timeline interaction, PNG export, and H.264 video export.
- Captured before/after visual evidence under `output/evidence/phase5/` and recorded six zero-violation axe scans.

The full bundled Playwright runner and Firefox remain unavailable on the current host. Manual screen-reader/200%/touch review and hardware performance measurement remain release gates. UX-008 fuller staged loading and the broader UX-005 failure matrix were carried into Phase 6A; the critical cold-compositor retry state and controlled IndexedDB failure recovery now pass locally.

## Phase 5.1A — unified studio structural rebuild

Status: **IMPLEMENTED LOCALLY / PARTIAL VERIFICATION**. The structural redesign is complete within the named phase; automated repository browser execution remains unavailable because the configured Playwright browser binary is not installed on this host. Direct local browser evidence is captured under `output/evidence/phase5-1a/`.

- `/` is the direct studio route. `/studio` and `/studio/edit` continue to resolve into the editor for compatibility and host-edit flows.
- Recent projects restore directly; clean starts render an empty composition with Add video, Generate motion, and Open First Study actions.
- One `+ Add` flow covers local video, Signal Field, Liquid, Flow, Refraction, and the editable First Study example.
- The right inspector is contextual: Edit for placement/source/generator controls, Effects for spatial/temporal effects, and Motion for keyframes, modulation, and recipes.
- The existing PixiJS renderer, timeline, generators, effects, animation, recipes, export, persistence, portable package path, and `/integration` harness remain in place.
- The active shell moves to white/seafoam tokens with desktop two-column, tablet drawer, and mobile full-height inspector states. No new provider, account, server, collaboration, or media pipeline was introduced.

Deferred to later phases: library/provider search, provider setup, collaboration, accounts, hosted services, and any redesign beyond the unified studio shell.

## Phase 5.1B — complete visual identity overhaul

Status: **PARTIAL / implemented and verified locally**. The active unified studio now has a canonical white-first visual system, but the documented browser and manual accessibility gates remain open.

- Replaced active dark/chartreuse UI branding with semantic white, seafoam, deep teal, accessible supporting text, and restrained status colors. Existing user-generated and engine/preset palettes were preserved.
- Loaded Instrument Sans Variable as the primary UI family, removed decorative all-caps/monospace treatment from the active studio, and applied tabular numerals to technical values.
- Refined the top bar, Add popover, empty state, canvas surround, inspector tabs/controls, generator/effect/recipe browsers, timeline, dialogs, saving/error states, tablet drawer, and mobile controls.
- Removed decorative left selection bars, reduced nested cards/borders, aligned radii and spacing, and made selected/hover/focus/disabled/error states semantic and consistent.
- Captured real system-Chrome evidence under `output/evidence/phase5-1b/`, including the before/after contact sheet and zero-violation axe output.
- Preserved PixiJS preview/export, generators, temporal effects, animation, recipes, persistence, and host/integration boundaries. Phase 5.1C is implemented locally as a bounded DOM motion layer; see [PHASE5_1C_MOTION_SYSTEM.md](PHASE5_1C_MOTION_SYSTEM.md) and [PHASE5_1C_MOTION_QA.md](PHASE5_1C_MOTION_QA.md).

The configured repository browser runner remains unavailable because its bundled browser executable is missing. Firefox, manual screen-reader/200%/touch/forced-colors review, hardware/GPU profiling, and a fresh full media/audio/cancellation acceptance remain open. See [VISUAL_REDESIGN_AUDIT.md](VISUAL_REDESIGN_AUDIT.md) and [PHASE5_1B_VISUAL_QA.md](PHASE5_1B_VISUAL_QA.md).

## Phase 5.1C — fluid interaction and motion system

Status: **PARTIAL / implemented and verified locally**. Motion tokens, reduced-motion behavior, inspector transitions, Add/dialog/drawer presence, selected-state feedback, timeline reveals, direct layer reorder, keyframe feedback, modulation/recipe transitions, and system-Chrome frame evidence are complete within the named phase. See [INTERACTION_MOTION_ARCHITECTURE.md](INTERACTION_MOTION_ARCHITECTURE.md), [PHASE5_1C_MOTION_SYSTEM.md](PHASE5_1C_MOTION_SYSTEM.md), and [PHASE5_1C_MOTION_QA.md](PHASE5_1C_MOTION_QA.md).

The bundled Playwright browser, Firefox, manual screen reader/200%/touch/forced-colors review, physical-device frame pacing, GPU/decoder profiling, and full export acceptance remain release gates.

## Phase 5.1D — direct manipulation and editing depth

Status: **IMPLEMENTED LOCALLY / PARTIAL VERIFICATION**.

- Added shared affine geometry and topmost eligible canvas selection with hidden/locked behavior.
- Added transactional move, resize, rotation, crop, anchor, flip, reset, screen-space snapping, and precision inspector controls.
- Added normalized source crop and layer-local Pixi ColorMatrix adjustments with preview/export parity.
- Added Auto-Key integration for transform, opacity, and color values while keeping crop, anchor, and flip static by policy.
- Added unit coverage and a Chromium browser suite with direct edited PNG and H.264 MP4 artifacts.
- Preserved the schema-v2 normalization path, shared Pixi renderer, temporal ordering, IndexedDB debounce, host contract, and white/seafoam visual system.

Open gates remain Firefox, manual assistive technology/true 200%/forced-colors/touch review, hardware/GPU/decoder profiling, a dedicated pointer test for every resize/rotation handle, and the dev-only Vitest dependency audit.

## Phase 6A — portable projects and integration foundation

Status: **PARTIAL / local handoff core verified**. BEND remains an independent motion studio; this phase does not connect the unavailable group application.

- Added a versioned `.bendpkg` archive with separate binary source entries, stable asset ids, hashes, size/path/version validation, incomplete-package rejection, and schema normalization.
- Added framework-neutral rendered-video, still, editable-source, progress, cancellation, and source-revision adapter contracts.
- Added a functional `/integration` host harness with 1:1, 4:5, and 9:16 canvases, video/still handoff, host transforms, playback policies, stacking, foreground content, save/reload, edit/update, cancel, and removal.
- Preserved host-owned placement and foreground content across a BEND source edit; versioned rendered artifacts prevent stale output from being presented as current.
- Added cold-compositor retry/error UI and transaction-complete IndexedDB persistence recovery with portable recovery copy.
- Captured direct Chrome evidence and independently inspected MP4/PNG outputs. The bundled browser runner, Firefox, audio fixture, cross-origin bridge, manual accessibility, and hardware profiling remain open.

Read [PORTABLE_PROJECT_FORMAT.md](PORTABLE_PROJECT_FORMAT.md), [HOST_INTEGRATION_API.md](HOST_INTEGRATION_API.md), [EMBEDDING_DECISION.md](EMBEDDING_DECISION.md), and [PHASE6B_HANDOFF.md](PHASE6B_HANDOFF.md) before connecting a real host.

## Later experimental work

- Additional deterministic generators and fluid phases.
- Advanced procedural effects and structural transition contracts.

Each future slice should preserve the project document as the source of truth and retain the existing renderer/export boundary.

## Phase 5.2 — independent first-time user quality overhaul

Status: **PARTIAL / locally verified in installed Chrome**. See [FIRST_TIME_USER_AUDIT.md](FIRST_TIME_USER_AUDIT.md), [PHASE5_2_FIX_REPORT.md](PHASE5_2_FIX_REPORT.md), and [PHASE5_2_CUSTOMER_REVIEW.md](PHASE5_2_CUSTOMER_REVIEW.md).

- Completed a fresh-profile black-box customer walkthrough before reading internal product documentation.
- Reworded first-action, generator, effect, motion, and recipe language around customer intent while preserving the existing studio architecture and engine terminology where it is needed.
- Fixed the crop shader uniform contract at the existing PixiJS boundary; the generator/effect probe went from 109 warnings to 0 and late export frames remained rendered.
- Fixed the export-cancellation audio disposal race without changing Mediabunny's export architecture.
- Increased small editing targets and corrected settled export-dialog contrast; the covered axe surfaces now report zero violations.
- Verified persistence, direct editing controls, PNG export, H.264/AAC MP4 export, cancellation, responsive widths, and the complete four-generator/five-effect matrix in fresh installed Chrome.

Remaining gates:

- Reproduce and remove the two Pixi BindGroup teardown warnings that remain after normal export.
- Restore the configured browser runner and rerun the repository suite; Firefox remains open.
- Perform manual screen-reader, true 200% zoom, forced-colors, physical-touch, and hardware GPU/decoder checks.
- Decide whether the populated-canvas state needs a compact persistent “Add layer” affordance in addition to the top-bar Add menu.

No hosted AI, paid API, cloud dependency, renderer rewrite, or animation-engine rewrite was introduced.
