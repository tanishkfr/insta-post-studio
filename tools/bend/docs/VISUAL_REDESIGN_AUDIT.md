# BEND Phase 5.1B visual redesign audit

Date: 2026-10-13  
Scope: unified studio route (`/`), desktop/tablet/mobile editor shell, generator/effect/motion/recipe surfaces, overlays, and error state.  
Verdict for the named visual slice: **PARTIAL / implemented locally**.

## Baseline inventory

The Phase 5.1A screenshots and direct browser inspection showed a functional unified studio, but the visual language was still mixed:

| Observed pattern | Before | Phase 5.1B treatment | Evidence |
| --- | --- | --- | --- |
| Typography | Inter paired with compact monospace/all-caps utility labels | Instrument Sans across the product UI; sentence case for normal labels; tabular numerals for time and dimensions | `01-studio-empty.png`, `06-motion-inspector.png` |
| Selection | Decorative left-edge bars and strong per-row borders | Soft seafoam fill, stronger text, semantic pressed/selected state | `03-liquid-selected.png`, `05-effects-inspector.png`, `10-expanded-timeline.png` |
| Surfaces | Repeated nested cards and dark panel treatment | White continuous surfaces, quiet dividers, fewer structural borders | contact sheet |
| Shell | Mixed dark/chartreuse legacy tokens and light Phase 5.1A overrides | Central semantic white/seafoam token set with compatibility aliases only where runtime CSS still needs them | `src/styles/tokens.css` |
| Timeline | High-contrast blocks and technical uppercase sublabels | Pale lanes, deep teal playhead, compact readable clips, deliberate keyframes | `10-expanded-timeline.png` |
| Overlays | Older dark modal/prompt treatment | White elevated dialog/popover, restrained backdrop, clear action hierarchy | `11-export-dialog.png`, `16-new-project-dialog.png`, `14-add-popover.png` |
| Failure/loading communication | Capability state existed but could visually overlap the empty state during capture | Loading remains honest; evidence harness waits for ready state before identity screenshots; error state remains visible and actionable | `15-error-recovery.png`, `verification.json` |

## Reference study

The references were used as principles, not as templates or asset sources:

- [Jitter](https://jitter.video/) informed the relationship between a dominant canvas, compact properties, and a readable timeline.
- [Rive](https://rive.app/) informed precise inspector grouping, state communication, and animation-oriented density.
- [Figma](https://www.figma.com/) informed numerical control hierarchy, toolbar alignment, and canvas/inspector balance.
- [Linear](https://linear.app/) informed restraint, spacing consistency, quiet hover states, and soft selection treatment.
- [Instrument Sans](https://github.com/Instrument/instrument-sans) was evaluated as the primary UI family and is loaded locally through `@fontsource-variable/instrument-sans`.

The resulting BEND system remains original: the creative output is expressive, while the surrounding interface stays calm, white-first, and operational.

## Patterns removed or reduced

- Dark/chartreuse interface branding was removed from the active studio shell. Existing generated-content palettes and engine/preset values were left intact.
- Decorative left selection bars were removed from inspector rows, recipe rows, effect rows, and timeline labels. Functional playhead and editing guides remain.
- Repeated card borders were reduced in favor of continuous panel surfaces and quiet section separators.
- Utility all-caps and decorative monospace labels were reduced to sentence case and Instrument Sans. Technical values retain tabular numerals; monospace remains available for genuine technical metadata.
- Generic status decoration, heavy shadows, and unnecessary gradients were reduced. The canvas and generated motion remain the primary visual focus.

## Remaining issues and boundaries

- The active unified studio is the audited surface. Historical/inactive landing and entry components remain in the repository, and `/integration` is a separate host harness; neither was redesigned as part of this phase.
- The existing Pixi/WebGL warning and recovery path remains intentionally honest. Hardware/GPU behavior is not claimed from the system-Chrome run.
- Firefox, manual screen-reader review, true 200% zoom, physical touch, forced-colors behavior, and hardware performance remain unverified on this host.
- Full MP4/audio/cancellation acceptance was not rerun as part of this visual-only phase; the existing export/runtime contracts and prior evidence remain the source of truth for those boundaries.
- The configured repository Playwright browser runner remains unavailable because its bundled browser executable is not installed. The scoped evidence uses installed system Chrome with the same real UI journeys and axe scans.

## Phase 5.1C handoff

Keep the stable component identities and add motion only at the interaction seams:

1. A shared selected-tab indicator can move within the existing inspector tablist.
2. Inspector content can slide or crossfade between Edit, Effects, and Motion without remounting the entire workspace.
3. Add menus, dialogs, and drawers can use short opacity/position transitions with reduced-motion fallbacks.
4. Buttons, toggles, sliders, keyframe diamonds, and timeline clips can gain press/drag feedback while keeping the current hit areas.
5. Timeline lane expansion and layer reorder can animate from the existing measured layout.

Do not introduce a general animation framework or animate the canvas for decoration. The visual identity phase intentionally ships static polished states plus lightweight hover/focus/pressed feedback only.
