# BEND interaction motion architecture

Date: 2026-10-13
Status: Phase 5.1C implemented locally; cross-browser and hardware gates remain open.

## Decision

BEND uses `motion@14.2.0` as a direct dependency for coordinated React DOM transitions. The integration imports `motion`, `AnimatePresence`, `LayoutGroup`, `useIsPresent`, and `MotionConfig` from `motion/react`. The app root sets `reducedMotion="user"`, so the library follows the user's operating-system preference while preserving non-spatial feedback such as opacity and color.

The choice is intentionally narrow:

- Motion owns interruptible presence, panel, indicator, and list transitions where React state changes the DOM tree.
- CSS owns hover, focus, pressed, selected-color, border, and other high-frequency micro-feedback.
- Existing pointer math and store mutations own direct editing. Motion never interpolates a slider value, scrubber position, keyframe timestamp, timeline scale, clip geometry, or renderer time.

The current Motion React API and reduced-motion behavior are documented in the [Motion React documentation](https://motion.dev/docs/react) and [MotionConfig documentation](https://motion.dev/docs/react-motion-config). BEND uses those APIs without replacing the existing PixiJS or animation engine boundaries.

## Alternatives considered

| Option | Decision | Reason |
| --- | --- | --- |
| CSS only | Partial use | Excellent for hover/press/focus, but insufficient for coordinated enter/exit, interruptible panel transitions, and a shared tab indicator. |
| Motion for React | Adopted | Small surface for the required React DOM presence/layout behavior, shared reduced-motion policy, and current React 19 compatibility in the installed package metadata. |
| Framer Motion as a direct dependency | Rejected | The app does not need a second direct animation dependency; `motion` is the current import surface and already supplies the required React APIs. |
| React Spring | Rejected | Would add a second animation model for a scope that only needs a few bounded springs and easing tokens. |
| Motion Reorder / drag primitives | Rejected for the timeline | The timeline already has project-specific pointer math, snapping, direct manipulation, and undo boundaries. Reorder uses a small existing-store gesture instead of replacing those contracts. |

## Token source of truth

The shared JavaScript tokens live in `src/styles/motion.ts`; CSS aliases live in `src/styles/tokens.css`.

| Token | Value | Use |
| --- | --- | --- |
| `immediate` | 120ms | Small feedback and tab/indicator changes |
| `quick` | 200ms | Popovers, track reveals, button feedback |
| `standard` | 280ms | Inspector content and layer presence |
| `deliberate` | 380ms | Reserved for future low-frequency transitions; not used to decorate the canvas |
| `responsive` | `cubic-bezier(.22, 1, .36, 1)` | Fast settle without bounce |
| `soft` | `cubic-bezier(.16, 1, .3, 1)` | Inspector/content transitions |
| `precise` | `cubic-bezier(.33, 1, .68, 1)` | Compact controlled feedback |
| `panel` | spring 420 / 38 / .72 | Mobile inspector drawer |
| `spatial` | spring 520 / 42 / .62 | Reserved for bounded spatial UI movement |

All springs use positive damping and do not bounce. The timing scale stays below the 300ms interaction target for the active transitions.

## Component mapping

### Inspector

`Inspector.tsx` uses `LayoutGroup` and a shared `layoutId` for the active Edit/Effects/Motion indicator. Contextual content is a keyed `AnimatePresence` panel with a small directional opacity/translate transition. Exiting panels are `aria-hidden` and `inert` while they leave the DOM so rapid tab changes cannot expose stale controls to keyboard or assistive-technology users.

### Add flow and overlays

The Add popover, new-project confirmation, export dialog, recipe rename dialog, and mobile inspector drawer use presence transitions. Dialog focus trapping and focus return remain owned by the existing dialog implementations. The mobile drawer moves as one surface; it does not create a second inspector or animate the canvas.

### Timeline

Animation track rows and layer groups use short opacity/position reveals. Layer reorder is a direct pointer gesture on the existing project document and commits through the existing history store. The visible reorder target is a DOM outline only. Keyframe creation uses a short feedback animation; keyframe dragging remains direct and updates the existing animation engine continuously. The playhead is decorative and `pointer-events: none` so a keyframe at the current time remains directly draggable.

### Controls and selection

CSS supplies restrained hover/pressed/focus transitions for buttons, cards, toggles, and selected rows. Inspector keyframe buttons are excluded from hover transforms to keep their hit geometry stable. Slider values and the time model do not animate toward a target.

## Runtime boundary

Motion is not imported by `src/engine`, `src/engine/render`, `src/engine/export`, the Pixi canvas surface, generator shaders, temporal evaluators, or the project schema. No renderer is reinitialized when a DOM transition runs. Preview and export continue to consume the same `BendProject` and timestamped evaluator as before.

The boundary is:

```text
React state change
    ├─ DOM presence / panel / indicator → Motion or CSS
    └─ document value / time / pointer gesture → existing store + engine

BendProject → animation / temporal evaluation → Pixi preview and export
```

## Accessibility and reduced motion

- `MotionConfig reducedMotion="user"` is the global policy.
- The CSS `prefers-reduced-motion: reduce` block removes `will-change` and reduces micro-transition durations to a near-zero value.
- Spatial transforms are suppressed by Motion's reduced-motion policy while opacity/background feedback remains available.
- Exiting inspector content is hidden and inert during presence transitions.
- Dialogs preserve their existing focus trap, close labels, and return-focus behavior.
- The targeted system-Chrome run scanned settled inspector, export-dialog, mobile-drawer, and reduced-motion states with zero recorded axe violations.

## Performance boundary

Animated properties are limited to opacity and transform for presence/panel work. `will-change` is applied only to surfaces that actually transition and is cleared by the reduced-motion CSS path. The phase evidence records browser wall time and build output, but does not claim frame pacing, GPU memory, decoder allocation, or physical-device FPS. Those measurements remain open.
