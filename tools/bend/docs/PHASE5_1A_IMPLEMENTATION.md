# Phase 5.1A implementation

Date: 2026-10-13
Status: implemented locally; partial verification due to the repository browser runner environment.
Scope: unified studio structural redesign, navigation, and presentation shell.

## Goal

Make BEND open directly into a composition workspace. A recent project should restore there; a clean start should remain there as an empty composition. All creation actions should use one Add flow, and the right side should become a contextual Edit / Effects / Motion inspector.

## Implementation

### Routing and project entry

- `src/app/App.tsx` now mounts `EditorPage` for `/`, `/studio`, and `/studio/edit`.
- `/studio/edit` still reads `hostSession` and `hostLayer` for the integration handoff; `/integration` remains separate.
- `EditorPage` creates a normalized empty project when no recent project exists instead of exiting to an entry page.
- New project, example restore, local video import, and generator add all stay in the current editor route.

### Creation flow

- The top-bar `+ Add` menu contains Add video, Signal Field, Liquid, Flow, Refraction, and Open First Study.
- The empty canvas and composition inspector expose the same three useful first actions: Add video, Generate motion, and Open First Study.
- Existing local import and `createExampleProject()` boundaries are reused. Generator additions use the existing `createProceduralLayer()` and store commit/history path.

### Contextual inspector

- `InspectorSection` and the store's `inspectorSection` keep the new three-section model explicit while synchronizing legacy `activeTool` state for compatibility.
- Edit contains placement, video source/trim, and procedural generator controls.
- Effects contains Wave Displacement for video plus the temporal library and stack.
- Motion contains animation tracks, keyframe actions, modulation editors, and Recipes.
- The selected-layer header retains visibility, mute, lock, raise/lower, and remove actions formerly grouped in the Layers surface.
- Layer selection is now strict: no implicit first-layer selection is introduced by the redesign.

### Presentation and responsive behavior

- `src/styles/tokens.css` moves the active shell to white, seafoam, dark teal, and restrained teal signal tokens.
- The appended Phase 5.1A shell rules in `src/styles/global.css` use a desktop canvas/timeline plus contextual inspector, then collapse the inspector into a drawer at tablet/mobile widths.
- The mobile top bar keeps Add, Controls, and Export available; the inspector is full-height when opened.
- Existing Pixi canvas, timeline, dialogs, save status, reduced-motion rules, and accessibility labels remain in place.

## Files changed

Runtime: `src/app/App.tsx`, `src/app/store.ts`, `src/engine/core/types.ts`, `src/features/editor/EditorPage.tsx`, `src/features/editor/CanvasStage.tsx`, `src/features/editor/Inspector.tsx`, `src/styles/tokens.css`, `src/styles/global.css`.

Tests: `tests/browser/phase5-1a.spec.ts`, `tests/browser/studio-helpers.ts`, plus the existing browser specs updated from the retired entry actions to the direct studio/Add flow.

Docs: `README.md`, `docs/DESIGN_SYSTEM.md`, `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, `docs/TEST_REPORT.md`, and [UNIFIED_STUDIO_AUDIT.md](UNIFIED_STUDIO_AUDIT.md).

## Verification

| Check | Result |
| --- | --- |
| Baseline unit suite before changes | PASS — 10 files, 42 tests |
| `npm run typecheck` after changes | PASS |
| Direct local browser shell | PASS — root, Add, empty, generator, Effects, Motion, tablet, and mobile states rendered |
| Installed system Chrome manual harness | PASS — `tests/manual/phase5-1a.mjs`; fresh context, Add → Signal Field, Effects, Motion, mobile controls, zero errors |
| Desktop visual evidence | `output/evidence/phase5-1a/unified-add-menu.png`, `unified-generator.png`, `unified-effects.png`, `unified-motion.png` |
| Empty/responsive visual evidence | `unified-empty-seafoam.png`, `unified-tablet.png`, `unified-mobile-controls.png` |
| Horizontal overflow check | PASS — 768×1024 and 390×844 matched viewport width |
| Console errors in direct browser checks | PASS — 0 errors; Pixi cleanup warnings noted in the audit |
| Bundled Playwright Phase 5.1A spec | UNVERIFIED — missing configured `chrome-headless-shell.exe` |
| Firefox, screen reader, 200% zoom, touch, hardware/GPU | UNVERIFIED |

## Deferred boundary

5.1A does not begin provider/library search, provider setup, collaboration, accounts, hosted services, or a new media pipeline. It also does not replace the renderer or introduce a new persistence schema. Those are separate decisions for later phases.
