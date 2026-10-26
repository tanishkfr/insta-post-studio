# BEND. design system

## Visual direction

BEND. is a focused motion instrument: editorial typography, strict rules, deliberate negative space, and a visible relationship between controls and the moving image. Phase 5.1B makes the white/seafoam workspace, dark teal type, Instrument Sans hierarchy, and restrained teal signal canonical. It is not a SaaS dashboard and should not drift toward card grids, generic gradients, or decorative status chrome.

## Tokens

The canonical tokens live in `src/styles/tokens.css`.

| Token | Value | Use |
| --- | --- | --- |
| `--surface-primary` | `#FFFFFF` | primary surface and shell |
| `--surface-workspace` | `#F3F7F6` | workspace and quiet regions |
| `--surface-canvas` | `#EDF3F2` | canvas surround |
| `--surface-hover` | `#EAF1EF` | hover and contextual emphasis |
| `--surface-muted` | `#F0F3F2` | disabled and secondary controls |
| `--text-primary` | `#193438` | primary type |
| `--text-secondary` | `#526C6E` | supporting type |
| `--text-tertiary` | `#5A7274` | non-essential metadata with AA contrast |
| `--accent` | `#236F72` | active state, CTA, focus, playhead |
| `--accent-soft` | `#DCEFEB` | selected rows and active segments |
| `--border-subtle` | `#DEE7E5` | structural rules |
| `--border-strong` | `#B7CCCA` | inputs and editing boundaries |
| `--danger` | `#B34F5C` | capability and validation errors |

Typography uses Instrument Sans Variable for display and UI text, with Inter and system sans fallbacks. Monospace remains reserved for genuine technical metadata. Display type is clear and compact; normal labels use sentence case and avoid decorative tracking or all-caps treatment. Timecodes and dimensions use tabular numerals.

## Composition rules

- Prefer one strong typographic gesture and one moving-image gesture per view.
- Use horizontal rules to establish structure instead of rounded cards.
- Keep the moving canvas visible as the signature moment: empty compositions, imported footage, and procedural layers should all resolve inside the studio surface.
- Use teal only for action, selection, active parameters, and meaningful emphasis. Seafoam is a supporting field, not decoration.
- Keep supporting copy short and concrete; do not invent metrics, history, or system claims.
- Editor controls should expose a real project mutation or a clear capability explanation.

## Interaction rules

- Every icon-only action has an accessible label.
- Focus-visible outlines use the Signal token with a 2px outline and 3px offset.
- Range controls expose a paired numeric input and reset on double click.
- Timeline supports pointer scrubbing plus Home, End, and one-frame keyboard seeking.
- Reduced-motion users receive near-zero animation and transition durations.
- Mobile collapses the contextual inspector into a full-height controls drawer and keeps Add and Export available in the compact top bar.

## Phase 5.1A unified studio additions

- The root route is the studio. Recent projects restore directly; a clean start stays in an empty composition with Add video, Generate motion, and Open First Study actions.
- `+ Add` is the single creation entry point for footage, the four procedural systems, and the editable First Study example.
- The inspector is contextual: Edit owns placement/source/generator controls, Effects owns spatial/temporal effects, and Motion owns keyframes, modulation, and recipes.
- The first editor move is a short dismissible note tied to the active layer. It translates `◆` as a keyframe at the playhead and `MOD` as a repeating change; it is remembered locally after dismissal.
- The editor top bar keeps the project identity flexible and editable. Long names use the available width and expose the full value through the input label/title.
- Mobile uses a direct Controls toggle in the top bar. Opening it reveals the same inspector sections rather than creating a separate mobile information architecture.
- Timeline orientation copy explains clips, expanded lanes, keyframes, and modulation. Keep this language concrete and near the controls.
- Persistence failures are user-visible, non-blocking alerts with a retry action. Do not rely on an assistive-technology-only status for data-loss risk.
- The former landing/entry copy is not a primary navigation surface. Any retained route or component must not imply a separate creation workflow or claim capabilities the editor does not expose.

## Phase 5.1B visual identity rules

- The canonical semantic tokens, spacing/radius scale, typography hierarchy, selected-state rules, and Phase 5.1C motion handoff live in [PHASE5_1B_DESIGN_SYSTEM.md](PHASE5_1B_DESIGN_SYSTEM.md).
- The active shell uses a 56px top bar, a 334px desktop inspector, and a compact 216px timeline; the canvas receives the remaining central space.
- Selection uses soft seafoam fill, stronger text, and semantic selected/pressed state. Decorative left-edge bars are not used; the timeline playhead and editing guides remain functional lines.
- Dialogs and popovers use white elevated surfaces, restrained backdrops, consistent 10–12px corners, and clear primary/secondary actions. Native browser prompts are not used for the refreshed project/recipe flows.
- Generator, effect, and recipe browsers use actual previews and quiet rows rather than nested marketing cards. Existing engine palettes remain unchanged.
- The visual audit and rendered evidence are in [VISUAL_REDESIGN_AUDIT.md](VISUAL_REDESIGN_AUDIT.md) and [PHASE5_1B_VISUAL_QA.md](PHASE5_1B_VISUAL_QA.md). Phase 5.1C adds bounded presence, panel, indicator, drawer, and timeline-row motion in [INTERACTION_MOTION_ARCHITECTURE.md](INTERACTION_MOTION_ARCHITECTURE.md); the canvas and precision values remain still/direct.

## Phase 5.1C interaction motion rules

- Use the shared duration/easing/spring tokens in `src/styles/motion.ts`; do not invent per-component timing.
- Use Motion for coordinated DOM presence/layout changes and CSS for high-frequency hover/focus/pressed feedback.
- Do not animate slider values, scrubber position, keyframe timestamps, timeline scale, clip geometry, or Pixi canvas content.
- Respect `prefers-reduced-motion`; spatial transforms are suppressed while non-spatial feedback remains understandable.
- Keep exiting content hidden/inert and preserve existing dialog focus behavior.

## Phase 5.1D direct-editing visual rules

- The canvas remains the signature moment: selection is a quiet teal outline with compact handles, a single rotation affordance, and restrained seafoam guides.
- Crop mode dims only the outside of the selected crop with a transparent interior; the dimmer, handles, and guides are DOM overlays and are never part of a rendered/exported frame.
- Inspector controls stay in the existing white/seafoam system. Transform, Crop, and Appearance are contextual sections rather than a new dashboard or card grid.
- Anchor controls are a compact 3×3 semantic button group. Active, focus-visible, disabled, locked, and pressed states use existing accent tokens; no decorative glow or gradient is introduced.
- Numeric controls remain direct and still. Phase 5.1C Motion must not spring slider values, canvas geometry, crop bounds, rotation, or precision inputs.
- Color adjustments are described as layer-local ColorMatrix values. Brightness is a multiplier offset, not an exposure claim; crop is spatial and trim remains temporal.
- Locked layers keep readable selection/inspection state but suppress edit affordances. Hidden layers do not visually intercept or compete for selection.

## Phase 5.2 language and target-size refinements

- Empty and contextual help should describe the customer's next action before explaining engine mechanics. Prefer “moving background,” “deliberate change,” “repeating variation,” and “ready-made combination” over unexplained internal terms.
- Keep the established `◆` and `MOD` controls, but explain them at the first point of use and in the Motion surface: `◆` places a keyframe at the playhead; `MOD` adds a repeating variation.
- Generator and effect descriptions should predict the visual result first. Mechanism labels such as analytic, stateful, sampling, and feedback may remain as secondary metadata, not as the only explanation.
- Reorder handles, anchors, and other touch-adjacent editing controls use at least 24px targets without enlarging the canvas chrome or adding decorative controls.
- Export dialogs must keep supporting copy and primary actions at readable contrast against the white surface. Use the semantic text/accent tokens; do not solve contrast with gradients or extra badges.
