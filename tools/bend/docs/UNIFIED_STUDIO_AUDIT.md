# Phase 5.1A unified studio audit

Date: 2026-10-13
Scope: structural redesign and navigation only.
Starting worktree: `aafdae9` (`feat: add portable project integration foundation`).

## Evidence labels

- **OBSERVED** — reproduced in the local rendered browser or captured from the baseline screenshots.
- **DOCUMENTED** — defined by the existing project docs or source contracts.
- **INFERRED** — a product/UX conclusion drawn from the observed structure.
- **UNVERIFIED** — not claimed because the available browser, device, or measurement path was unavailable.

## Baseline audit

### OBSERVED: primary navigation

The baseline root route rendered a marketing landing page with a live hero canvas and experiment gallery (`baseline-landing.png`). `/studio` rendered a separate project-entry surface (`baseline-entry.png`) with four equal-weight choices: Upload footage, Generate motion, Remix footage, and Explore a study. The editor itself was reached at `/studio/edit` (`baseline-editor-media.png`).

### OBSERVED: editor structure

The editor had a left tool rail with Media, Generate, Effects, Motion, Recipes, and Layers; a central Pixi canvas; a right inspector; and a bottom timeline. The right inspector was mostly a mirror of the active tool rather than a stable contextual surface. A clean start could exit back to entry instead of presenting an empty composition.

### DOCUMENTED: runtime boundaries

The project document remains the source of truth. `PixiBendRenderer` is shared by preview, PNG, and video export. IndexedDB stores project metadata and source media separately. Temporal effects are layer-local, keyframes/modulators are evaluated through the shared animation engine, and the portable package/integration work is a separate boundary. These contracts are documented in [ARCHITECTURE.md](ARCHITECTURE.md), [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md), and [PHASE6A_TEST_REPORT.md](PHASE6A_TEST_REPORT.md).

### INFERRED: primary friction

The landing page, entry page, and editor created three different mental models before a user could reach the composition. The four entry choices also exposed implementation concepts (remix, generate, example) as parallel destinations even though they all become layers or project state in the same editor. The absence of an empty editor made the first action feel like a route change rather than composition work.

## Phase 5.1A information architecture

| User intent | Previous surface | Unified surface | Runtime path |
| --- | --- | --- | --- |
| Resume work | Entry restore card | Direct root studio restore | `EditorPage` + IndexedDB project store |
| Start empty | Entry choice / no editor state | Empty composition canvas and inspector | `createProject()` + existing store |
| Add footage | Entry Upload footage / Media rail | `+ Add` → Add video, also empty-canvas action | Existing import pipeline and asset store |
| Add motion | Entry Generate / Layers | `+ Add` → Signal Field, Liquid, Flow, Refraction | Existing generator registry and procedural layer model |
| Learn by example | Entry Explore a study | `+ Add` → Open First Study, also empty-canvas action | `createExampleProject()` |
| Edit a selected layer | Tool-specific inspector | Inspector → Edit | Existing transform/source/generator controls |
| Shape effects | Tool-specific inspector | Inspector → Effects | Existing Wave and temporal effect stack |
| Animate | Motion rail and separate controls | Inspector → Motion | Existing keyframes, modulation, recipes, timeline |
| Export/save | Top bar and existing dialogs | Same top bar and dialogs | Existing export/persistence contracts |

The old landing and entry components remain unmounted by the active router. This removes competing primary navigation without deleting unrelated historical source or changing the `/integration` harness.

## Acceptance mapping

- **Direct `/` studio:** implemented and manually observed with the local browser.
- **Recent project restore:** implemented through the existing project restore effect and observed with the persisted First Study state.
- **Empty composition:** implemented with visible Add video, Generate motion, and Open First Study actions.
- **Single Add flow:** implemented for footage, four generators, and First Study.
- **Contextual inspector:** implemented as Edit, Effects, and Motion tabs with no left tool rail.
- **Responsive shell:** rendered checks captured at desktop, 768×1024, and 390×844; no horizontal overflow was observed.
- **Preservation:** no renderer, generator, temporal, animation, recipe, export, persistence, portable-package, or integration boundary was replaced; selected-layer visibility, mute, lock, order, and remove actions remain available in the inspector header.

## Deliberately out of scope

Phase 5.1A does not add library search, provider setup, collaboration, accounts, hosted services, analytics, new media decoding, a new renderer, or the later 5.1B/5.1C/5.1D work. Those remain roadmap decisions, not hidden requirements of this rebuild.

## Verification limits

The repository Playwright runner could not launch because its configured `chrome-headless-shell.exe` is absent on this host. The direct local browser checks reported zero console errors; repeated project replacement also reported existing PixiJS resource-cleanup warnings. Firefox, axe scans for this checkpoint, screen-reader behavior, true 200% zoom, physical touch, and hardware/GPU profiling remain **UNVERIFIED**.
