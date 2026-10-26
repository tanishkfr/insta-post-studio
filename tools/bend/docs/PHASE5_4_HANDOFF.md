# BEND Phase 5.4 — UI/UX Handoff

Phase 5.3 leaves the editor's existing visual/runtime direction intact and adds only targeted safety surfaces. Studio 2.0 can now proceed without reopening the persistence or package contracts.

## Safe UI/UX follow-up areas

- Inspector hierarchy: make the existing edit/effects/motion sections easier to scan without changing their state model.
- Timeline clarity: improve lane grouping, keyframe density, scrubbing affordances, and small-screen legibility while preserving the current timeline data and animation engine.
- Onboarding: refine the existing first-move guide, empty composition copy, and the relationship between Add, Projects, Source, and Export.
- Responsive composition: audit the editor at narrow widths, especially the project library, export dialog, inspector slide-over, and timeline.
- Visual polish: tune spacing, typography, focus states, and motion against `docs/DESIGN_SYSTEM.md`; keep the white/seafoam editorial instrument direction and avoid generic dashboard/card patterns.

## Contracts to preserve

- `ProjectSaveCoordinator` must remain the only active editor autosave coordinator.
- Project ids, `revision`, schema-v2 normalization, and shared asset ids are persistence contracts.
- Layer removal must remain undo-safe; do not reintroduce eager asset deletion.
- `.bendpkg` remains the editable source format and must not be replaced by a flattened export.
- Preview/export must continue to use the shared Pixi compositor.
- Host integration remains the local editable-source plus rendered-media harness; do not add the real cross-origin bridge in Phase 5.4.
