# BEND Phase 5 handoff

Date: 2026-10-13  
Status: **PARTIAL / locally verified**  
Branch: `main`  
Starting SHA: `a22134b0b5d19e12281ecec776c0bb6eefb94a8a`

> Navigation note: this handoff records the earlier Phase 5 product-experience slice. Phase 5.1A supersedes its landing → entry primary path with the direct unified studio described in [PHASE5_1A_IMPLEMENTATION.md](PHASE5_1A_IMPLEMENTATION.md). The schema, renderer, export, persistence, and Phase 6 integration contracts below remain applicable.

## What Phase 5 leaves behind

BEND now presents one coherent path from landing page to an editable composition:

1. The landing page names the actual capability vocabulary: Media, Generate, Effects, Animate, and Recipes.
2. Project entry offers import, procedural generation, remix, and `Explore a study`.
3. The sample is a real schema-v2 project with `Signal bed` and `Refraction study` layers, Motion Echo, animated scale/opacity, and a deterministic opacity modulator.
4. The editor explains its first move, exposes a mobile controls toggle, and labels the animation relationship between keyframes, modulators, clips, and lanes.
5. Preview, save, reload, PNG export, and video export continue to use the existing project, renderer, temporal, and persistence boundaries.

## Integration contract for Phase 6

| Concern | Contract |
| --- | --- |
| Project source of truth | `BendProject` schema v2 in `src/engine/core/types.ts`; normalize and migrate through `src/engine/core/project.ts`. |
| Animation | Layer-local `animation.tracks` with numeric keyframes and at most one deterministic modulator per property through `src/engine/animation/engine.ts`. |
| Temporal effects | Layer-local ordered effects through `src/engine/temporal/registry.ts` and the shared temporal engine. Preserve compatibility/ordering validation. |
| Rendering | `PixiBendRenderer` remains the shared preview/PNG/video compositor. Do not create a second preview-only renderer for integration. |
| Export | `src/engine/export/exporter.ts` owns fixed-clock composition and codec fallback. Integrations should consume the produced file/blob and its explicit MIME/audio status. |
| Persistence | Projects and media stay local in IndexedDB. Media references are metadata plus `storageKey`; no upload or account boundary is implied. |
| UI integration | Keep external handoff controls outside the core compositor/editor state. Phase 6 may add an adapter or explicit export action, but should not mix external authentication/upload with local rendering. |

## Recommended Phase 6 shape

- Define one explicit handoff payload: exported file, MIME type, dimensions, duration, aspect preset, and whether audio is included.
- Add an adapter around the existing export result rather than coupling the Instagram toolkit to Pixi, IndexedDB, or React components.
- Preserve the current local-first fallback: users must be able to keep the file when an external service is unavailable.
- Reuse the existing 4:5, 1:1, and 9:16 format contract; do not silently crop or transcode outside the export boundary.
- Keep codec, audio, and browser capability messages visible at the handoff boundary.

## Known limitations to carry forward

- The repository Playwright runner could not start its sandbox browser binaries on this host; direct installed Chrome verification is the current fresh evidence.
- Firefox, screen-reader quality, true 200% zoom, forced-colors, physical touch, GPU memory, decoder allocation, and preview-FPS measurements remain unverified.
- The compositor remains main-thread and the temporal Frame Feedback path remains bounded Canvas 2D state, as documented in `docs/ARCHITECTURE.md`.
- UX-008 (a fuller staged cold-compositor loading treatment) and controlled UX-005 persistence-failure verification remain follow-ups.

See [RELEASE_READINESS.md](RELEASE_READINESS.md), [VISUAL_QA.md](VISUAL_QA.md), and `output/evidence/phase5/verification.json` for the sign-off evidence.
