# BEND Phase 5.1C motion system

Date: 2026-10-13
Status: implemented locally; verification is strong in installed system Chrome and remains partial across the documented environment gates.

## Goal

Make the unified studio feel responsive and deliberate without turning a precision motion editor into a decorative animation surface. The signature moment remains the live Pixi-generated image; interaction motion clarifies state changes around it.

## Implementation

| Area | Implementation | Boundary preserved |
| --- | --- | --- |
| Motion policy | `MotionConfig reducedMotion="user"` in `src/main.tsx` | No engine or renderer change |
| Shared tokens | `src/styles/motion.ts` plus CSS duration/easing variables | One timing vocabulary |
| Inspector | Layout-grouped active tab indicator; keyed directional panel presence | Existing Edit/Effects/Motion tabs and content |
| Add / dialogs | Presence transitions for Add, new project, export, and recipe rename surfaces | Existing actions, focus behavior, and data paths |
| Mobile controls | Spring drawer transition with open/close focus handoff | Same inspector DOM/content, no mobile duplicate |
| Timeline rows | Layer-group and animation-track reveal transitions | Existing layer rows and animation engine |
| Layer reorder | Direct handle drag, target outline, keyboard ArrowUp/ArrowDown, existing undo/redo | Existing project layer order and history |
| Keyframes | Entry feedback, current-time selected state, lane-bound direct drag | Existing keyframe time math and snapping |
| Modulation / recipes | Existing controls inherit micro-feedback; recipe presence uses Motion | Existing recipe and modulation commits |
| Buttons / cards | CSS hover, focus, pressed, border, color, and shadow transitions | No animated values or speculative UI |

## Interaction rules

The following remain direct by design:

- timeline scrubbing;
- clip move and video trim gestures;
- slider and paired numeric values;
- timeline scale and zoom;
- keyframe timestamp movement;
- layer reorder commits;
- playhead position and project time.

The keyframe lane now makes the visual playhead non-interactive so a keyframe sitting at the current time receives the pointer directly. Timeline drag listeners also observe the containing lane, preserving the existing pointer behavior when the pointer leaves the small handle. Downward layer drops insert after the visible target; upward drops insert before it. Both paths remain undoable project mutations.

## Visual language

Motion follows the Phase 5.1B white/seafoam system:

- no decorative movement inside the Pixi canvas;
- no camera zoom, parallax, or background animation;
- no bounce on controls;
- no transform hover effect on precision keyframe buttons;
- short opacity/position transitions for state change, not ornament;
- seafoam selected surfaces remain the primary feedback language.

The implementation weights Emil Kowalski's restrained, high-frequency interaction principles first, with subtle Jakub Krehel-style production polish for presence and panel transitions. The detailed token and boundary decision is in [INTERACTION_MOTION_ARCHITECTURE.md](INTERACTION_MOTION_ARCHITECTURE.md).

## Files changed

- `src/styles/motion.ts`
- `src/styles/tokens.css`
- `src/styles/global.css`
- `src/main.tsx`
- `src/features/editor/EditorPage.tsx`
- `src/features/editor/Inspector.tsx`
- `src/features/editor/Timeline.tsx`
- `src/features/editor/ExportDialog.tsx`
- `src/features/editor/RecipesWorkspace.tsx`
- `tests/manual/phase5-1c-motion.mjs`

`motion@14.2.0` is the only new direct runtime dependency. The package install reported three audit advisories on this local dependency tree (one moderate and two critical); no automatic audit fix was run in this scoped phase.

## Known limits

The motion system has no measured physical-device frame budget, GPU memory profile, decoder allocation profile, Firefox run, true 200% zoom pass, screen-reader pass, forced-colors pass, or physical-touch pass in this environment. Full media/audio/cancellation acceptance is inherited from prior phase evidence and was not re-run as part of this interaction-only slice.
