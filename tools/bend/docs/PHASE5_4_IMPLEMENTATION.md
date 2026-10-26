# BEND Phase 5.4 — Studio 2.0 Implementation

Date: 2026-10-19  
Verdict: implemented locally; final acceptance is `PARTIAL` because Chromium is the only available browser runtime and screen-reader, 200% zoom, forced-colors, Firefox, and hardware-GPU checks remain outside this environment.

## Goal

Make the existing BEND editor easier to understand without changing its project schema, Pixi compositor, export engine, or integration contracts. The canvas remains the signature surface; the inspector and timeline support it with less competition and clearer next actions.

The implementation follows the existing white/seafoam editorial system in `docs/DESIGN_SYSTEM.md`: Instrument Sans hierarchy, quiet dividers, teal for action/selection, continuous workspace surfaces, and restrained motion.

## Implemented changes

### 5.4A — Workspace and navigation

- Removed `Open First Study` from the ordinary `Add to composition` menu. It remains available as an empty-state learning action and as a project-library entry.
- Replaced browser-native First Study replacement confirmation with an accessible in-app dialog explaining that the current project is saved locally and remains available in Projects.
- Preserved the existing project library, save coordinator, switch/duplicate/delete flows, package preview, and recovery behavior from the dirty Phase 5.3 worktree.
- Kept the canvas-first shell and the existing Add, Projects, Source, and Export hierarchy.
- Fixed a confirmed transition defect where an exiting inspector panel stayed in normal layout flow and left a large blank gap during rapid section or layer changes. Exiting panels are now absolute, inert, and pointer-free while they leave.

### 5.4B — Inspector and creative controls

- Kept Edit / Effects / Motion as the contextual inspector surfaces and preserved all existing effect, generator, recipe, keyframe, modulation, crop, transform, and appearance controls.
- Made Crop and Appearance restrained disclosure groups under the primary Transform surface. Crop opens automatically while crop mode is active; Appearance remains available without making every control equally prominent.
- Removed the duplicate `Add to composition` action from the no-selection inspector. The header Add action and empty-canvas actions remain the creation entry points.
- Preserved full-width slider tracks, paired numeric inputs, keyframe diamonds, animation toggles, modulation controls, and visible units.

### 5.4C — Canvas, timeline, and keyboard interaction

- Added arrow-key equivalents to resize, rotate, and crop canvas handles. Shift increases the adjustment step; the existing inspector remains the precise alternative.
- Hardened the global shortcut guard so Space does not toggle playback while a control, menu, dialog, tab, slider, or text-editing surface owns the interaction. Escape still cancels active gestures/crop mode.
- Kept pointer capture, transactional store commits, timeline selection, undo/redo, and the existing direct-manipulation geometry path unchanged.

### 5.4D — First use and export

- Retained the real First Study project and contextual first-move guidance rather than adding a disconnected demo or hosted dependency.
- Added an export summary for canvas dimensions, duration, frame rate, and audio policy. The copy explains that rendering is local and that the result reports the actual audio outcome.
- Changed the normal video export default from preview quality to full canvas resolution. Preview remains an explicit quick option.
- Made audio copy more precise: a video export reports `Topmost visible source only` when a ready source exists and `No ready source` otherwise; the completed result still reports included versus video-only output.

## Files changed for Phase 5.4

- `src/features/editor/EditorPage.tsx`
- `src/features/editor/ProjectLibraryDialog.tsx`
- `src/features/editor/Inspector.tsx`
- `src/features/editor/CanvasStage.tsx`
- `src/features/editor/ExportDialog.tsx`
- `src/styles/global.css`
- `tests/manual/phase5-4-ui-acceptance.mjs`
- Updated browser/manual assertions for the relocated First Study action and export dialog name.

No new package dependency, renderer, project format, hosted service, authentication layer, or integration architecture was added.

## Preserved contracts

- Project ids, revisions, local IndexedDB persistence, save ordering, undo/redo, and shared asset ownership remain governed by the existing Phase 5.3 implementation.
- Preview and export continue through the shared compositor path.
- Video audio remains primary-source-only; no multitrack mixer was introduced.
- `/integration` remains a local editable-source/rendered-media harness, not a claim of real Phase 6B cross-origin integration.
- Existing generator/effect palettes and visual output were not recolored or replaced.

## Evidence

- Baseline screenshots: `output/playwright/phase54-baseline-editor-1440.png`, `output/playwright/phase54-baseline-generator.png`, `output/playwright/phase54-baseline-editor-390.png`, and `output/playwright/phase54-baseline-export-dialog.png`.
- Final focused UX evidence: `output/evidence/phase5-4/phase5-4-ui-acceptance.json` plus the six rendered screenshots in the same directory.
- Final real-media evidence: `output/evidence/phase5-3/verification.json` and the generated exports/package artifacts under `output/evidence/phase5-3/`.

