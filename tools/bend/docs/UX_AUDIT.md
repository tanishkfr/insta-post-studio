# BEND Phase 5 UX audit

Date: 2026-10-13  
Scope: local Chromium inspection of the landing page, project entry, generated editor, generator/effects/motion/recipe workspaces, export dialog, and 390px editor state. No deployment or remote services were used.

## Baseline evidence

Screenshots captured before Phase 5 UI changes:

- `output/playwright/baseline-direct.png` — landing page, 1440px wide
- `output/playwright/baseline-entry-desktop.png` — project entry, 1440px wide
- `output/playwright/baseline-editor-desktop.png` — generated editor, 1440px wide
- `output/playwright/baseline-editor-mobile.png` — generated editor, 390px wide
- `output/playwright/baseline-editor-generate.png` — Generate workspace
- `output/playwright/baseline-editor-effects.png` — Effects workspace
- `output/playwright/baseline-editor-motion.png` — Motion workspace
- `output/playwright/baseline-editor-recipes.png` — Recipes workspace
- `output/playwright/baseline-export-dialog.png` — Export dialog

## Findings

| ID | Severity | Screen | Reproduction | User impact | Root cause | Proposed solution | Evidence | Resolution |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| UX-001 | P1 | Editor top bar | Open a generated project at a wide desktop viewport. | The project name is visibly clipped to a few characters, so orientation and rename feedback are weakened. | The top bar reserves a fixed left grid column while the name input has no overflow treatment or flexible width. | Make the project identity region flexible, preserve an editable name, and expose the full value through a tooltip/accessible label. | `screenshots/before-editor-desktop.png`; `screenshots/editor-example-desktop.png`. | **RESOLVED** — flexible grid/min-width/ellipsis treatment; direct Chrome capture shows `BEND / First Study` and the input remains editable. |
| UX-002 | P1 | Editor tool navigation | Enter the editor and scan the left rail, then repeat at 390px. | The rail is a narrow stack of small icons and labels; the mobile inspector is only discoverable by clicking the active rail item. | The editor has no compact “controls” affordance or orientation copy, and the same rail serves desktop and mobile without a responsive cue. | Add a visible mobile controls toggle, clearer tool grouping/selection state, and a concise workspace orientation cue. | `screenshots/before-editor-mobile.png`; `screenshots/editor-mobile-controls.png`; `verification.json`. | **RESOLVED** — mobile toggle, larger targets, and first-move guide verified at 390px; Motion drawer opens through the control path. |
| UX-003 | P1 | Project entry | Open `/studio` as a new user. | Upload, generated motion, and remix are clear, but there is no editable example that demonstrates layers, animation, or effects without importing footage. | Entry options only construct the basic import/generated projects. | Add one real sample composition built from BEND’s existing generator/animation engine; keep it editable and exportable. | `screenshots/before-entry-desktop.png`; `screenshots/entry-desktop.png`; `bend-example-frame.png`; `bend-example-preview.mp4`. | **RESOLVED** — `BEND / First Study` is a real two-layer, animated, effect-backed project; save, reload, PNG, and video export passed. |
| UX-004 | P1 | Inspector / animation | Open Motion and inspect Scale, Position, or Opacity controls. | `◆` and `MOD` are visually compact but do not explain keyframe versus modulation without prior knowledge. | The controls expose state through icon/text abbreviations only; there is no nearby legend or first-use explanation. | Add a small persistent legend/help line and a dismissible first-use hint tied to an animatable control. | `screenshots/before-editor-motion.png`; `screenshots/editor-motion-desktop.png`; `screenshots/editor-mobile-motion.png`. | **RESOLVED** — Motion legend, button titles, and first-move guide explain the vocabulary in desktop and mobile captures. |
| UX-005 | P1 | Save/recovery | Cause local persistence to fail or inspect the save-failed state. | Save failure is announced only to assistive technology; a sighted user may continue assuming the project is safe. | `saveError` is rendered as an `sr-only` status while the visible top bar only changes a small status label. | Show a visible, non-blocking recovery banner with the failure and a clear retry action. | `EditorPage.tsx`; save-failure banner implementation. | **PARTIAL** — visible alert and `Try again` recovery are implemented; a controlled IndexedDB failure injection remains unverified. |
| UX-006 | P1 | Timeline | Open a project with animation tracks. | The timeline contains keyframe diamonds and modulation bands, but the relationship between clip rows, expanded lanes, and current time is not explained at the point of use. | Timeline labels are compact and the animation disclosure has no legend or summary. | Add a compact timeline heading/legend and preserve collapsible advanced lanes. | `screenshots/editor-keyframes-desktop.png`; `verification.json`. | **RESOLVED** — timeline help/legend, collapse/re-expand, and keyboard focus/seek were verified. |
| UX-007 | P2 | Inspector information architecture | Compare Media, Layers, and Generate tools. | Layer order is useful in both Media and Layers, but repeated lists make the navigation feel like separate systems rather than one composition model. | The same `LayersSection` is rendered in multiple tool states without an explicit “composition” framing. | Keep the existing controls for compatibility, but label the shared layer context and reduce ambiguity in the panel header. | `screenshots/before-editor-desktop.png`; `screenshots/editor-example-desktop.png`. | **PARTIAL** — Layers now has explicit “Composition order” framing; the repeated control remains for compatibility and is a Phase 6 IA candidate. |
| UX-008 | P2 | Loading states | Open the generated editor on a cold compositor. | “Warming the GPU compositor…” is centered over the canvas without telling the user whether the project is ready for input. | Canvas initialization exposes a single overlay message and no staged loading context. | Retain the honest capability message but add a structured loading treatment and keep navigation/export state understandable. | Existing cold compositor behavior; `docs/RELEASE_READINESS.md`. | **OPEN** — no broad loading redesign was added; the current message is honest, but a staged treatment should be evaluated in Phase 6. |
| UX-009 | P2 | Landing / entry terminology | Scan the landing page then project entry. | The landing page communicates “fields and effects,” while entry uses “remix” as a route; the distinction between Media, Generate, Effects, Motion, and Recipes is learned only after entry. | The marketing route descriptions do not map directly to editor destinations. | Add a compact capability map using the existing terminology without adding marketing claims or a new feature. | `screenshots/before-landing-desktop.png`; `screenshots/landing-desktop.png`. | **RESOLVED** — landing now names the existing editor capability vocabulary and the desktop screenshot shows the mapping. |

## Post-change journey results

- Journey A: **PASS** — landing → entry → editable sample → Motion → timeline → PNG/video export passed in direct Chrome at desktop width.
- Journey B: **UNVERIFIED fresh / historical PASS** — fresh Phase 5 did not import a new file; existing media regression evidence remains the source for import coverage.
- Journey C: **PASS** — the sample demonstrates two editable layers, visible composition order, timeline rows, save, reload, and export.
- Journey D: **PASS** — keyframe lanes, collapse/re-expand, keyboard focus, and timeline legend passed.
- Journey E: **PASS** — Motion legend and mobile drawer explain modulation; the sample includes a real opacity modulator.
- Journey F: **UNVERIFIED fresh** — the recipe workspace remains represented by the baseline reference capture; no new apply/save interaction was needed for this surgical pass.
- Journey G: **PARTIAL** — export capability/error messaging is visible and the save recovery banner is implemented; controlled persistence failure injection remains open.

## Post-change evidence

The direct verification harness is `output/evidence/phase5/verify-phase5.mjs`; its result is `output/evidence/phase5/verification.json`. It ran installed system Chrome through Playwright because the repository's configured browser binaries were unavailable. All six axe scans were clean after the accessibility fixes.

## Verification rule

An item is not marked resolved until the implementation is rendered again at desktop and narrow mobile widths, the relevant keyboard path is exercised, and the corresponding evidence file exists. Browser/runtime limitations remain documented separately from product findings.
