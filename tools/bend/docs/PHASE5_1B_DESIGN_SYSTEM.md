# BEND Phase 5.1B design system

Date: 2026-10-13  
Status: implemented locally; canonical visual rules for the unified studio.

## Color roles

The source of truth is `src/styles/tokens.css`.

| Role | Token | Value | Use |
| --- | --- | --- | --- |
| Primary surface | `--surface-primary` | `#FFFFFF` | Main shell, inspector, dialogs |
| Workspace | `--surface-workspace` | `#F3F7F6` | Editor surround, disabled/quiet regions |
| Canvas surround | `--surface-canvas` | `#EDF3F2` | Canvas frame and editing field |
| Elevated surface | `--surface-elevated` | `#FFFFFF` | Popovers and dialogs |
| Hover | `--surface-hover` | `#EAF1EF` | Quiet hover and focus-adjacent treatment |
| Muted surface | `--surface-muted` | `#F0F3F2` | Secondary buttons and disabled regions |
| Primary text | `--text-primary` | `#193438` | Headings, values, important labels |
| Secondary text | `--text-secondary` | `#526C6E` | Descriptions and supporting copy |
| Tertiary text | `--text-tertiary` | `#5A7274` | Non-essential metadata; chosen to clear AA on light surfaces |
| Accent | `--accent` | `#236F72` | Primary actions, active controls, playhead, focus |
| Accent soft | `--accent-soft` | `#DCEFEB` | Selected rows and segmented-control backgrounds |
| Border | `--border-subtle` | `#DEE7E5` | Structural separators |
| Strong border | `--border-strong` | `#B7CCCA` | Inputs, clip boundaries, selected editing regions |
| Danger | `--danger` | `#B34F5C` | Destructive/error states with text or icon support |

The old aliases (`--ink`, `--paper`, `--signal`, and related names) remain only as compatibility names for untouched runtime selectors. Active studio branding uses the semantic tokens above. User media and generator/preset palettes are not recolored.

## Typography

- Primary family: Instrument Sans Variable, with Instrument Sans, Inter, and system sans fallbacks.
- Wordmark: compact, clean `BEND.` treatment at approximately 20–24px.
- Workspace title: approximately 18–22px with strong but not exaggerated weight.
- Section headings: 12–16px, semibold.
- Ordinary controls: 11–14px, sentence case.
- Supporting descriptions: 11–13px with accessible contrast.
- Timecodes, frame counts, dimensions, and numeric values use tabular numerals; monospace is reserved for genuine technical metadata.
- Decorative all-caps and wide tracking are not part of the active UI language.

## Layout and spacing

The active desktop shell uses a 56px top bar, a 334px inspector, and a compact 216px timeline. The canvas receives the remaining central space. Tablet keeps a reduced inspector column; at 820px and below, the inspector becomes a drawer; at 560px and below, the top bar and timeline compress without horizontal overflow.

The spacing scale is 4 / 8 / 12 / 16 / 20 / 24 / 32px. The radius scale is 4 / 6 / 8 / 10 / 12px. Panels use 8–10px corners, controls use 4–8px corners, and popovers/dialogs use 10–12px corners. Shadows are limited to the canvas frame, workspace guide, and elevated overlays.

## Component rules

- Buttons: quiet neutral secondary treatment; deep seafoam only for the primary action in a view.
- Icon buttons: Lucide icons, consistent 14–16px sizing, explicit accessible labels, and visible focus.
- Inputs: 6px radius, semantic border, paired unit/value where needed, and a 3px focus halo.
- Sliders: functional thin tracks with a visible accent fill and numeric value; no decorative gradients.
- Segmented controls: one shared quiet surface with a soft selected segment, not three independent cards.
- Section groups: typographic heading plus whitespace or a single divider; avoid card-inside-card nesting.
- Dialogs/popovers: white elevated surface, restrained backdrop, clear title/copy/actions, no glass blur.
- Error/loading states: text plus icon and semantic role; never rely on color alone.

## Selected states

Selection uses a soft seafoam fill, stronger text, and a semantic attribute (`aria-selected`, `aria-pressed`, or selected class) where applicable. No decorative left-edge bar is used. The timeline playhead and trim guides remain functional lines. Active sliders, keyframes, toggles, and primary actions use deep seafoam with adequate adjacent contrast.

## Accessibility decisions

The scoped system-Chrome harness runs axe WCAG 2.0 A/AA tags against empty, effects, new-project dialog, motion, and export states. The final run reports zero violations. Inspector sections use tablist/tab semantics, hidden recipe import has an accessible name, and tertiary text/selected clip sublabels were darkened where the initial scan found contrast below AA. Manual screen-reader, 200% zoom, touch, forced-colors, Firefox, and hardware checks remain open.

## Phase 5.1C opportunity map

Phase 5.1C implements the tab indicator, panel/drawer transitions, popover/dialog entry, restrained button feedback, keyframe feedback, lane expansion, and layer reorder. It preserves the current stable DOM/runtime boundaries, follows the reduced-motion policy, and avoids decorative canvas/timeline motion. The decision record and token table are in [INTERACTION_MOTION_ARCHITECTURE.md](INTERACTION_MOTION_ARCHITECTURE.md); rendered evidence is in [PHASE5_1C_MOTION_QA.md](PHASE5_1C_MOTION_QA.md).

The motion layer uses `motion@14.2.0` only for coordinated React DOM presence/layout work. CSS remains the source for hover, focus, pressed, selected-color, and precision-control feedback. Scrubbing, slider values, playhead position, timeline scale, clip geometry, and keyframe timestamps remain direct.
