# Phase 5A.1 accessibility report

## Checks performed

- Chromium at 390×844: Tools, Layers and Inspector open as one native modal dialog at a time. Enter opens Tools; Escape closes it and restores focus to the trigger. Close also dismisses panels.
- In Inspector, Space opens Continue in; Tab reaches an enabled option. The first Escape closes the menu and restores focus to its button; a second Escape dismisses the panel and restores its opener. The menu exposes `aria-expanded`.
- Enter toggled a layer's visibility and Space moved a layer using labelled buttons; selection uses `aria-pressed`.
- Six component tests exercise action callbacks, disabled routes, Escape, focus restoration, compact close and error/retry. The preview uses focus-visible outlines and native buttons, inputs, selects and a dialog.
- Calculated contrast from specified colors: #526c6e on white 5.63:1, #193438 on white 13.21:1, white on #236f72 5.85:1. These are sample pairs, not an exhaustive contrast audit.
- No purposeful UI transition is required for the preview; the stylesheet includes a reduced-motion override.

## Limits

This is not a WCAG conformance claim. A full tab-order sweep, screen-reader testing, forced-colors, high zoom, touch-device, all component-state contrast and non-Chromium checks have not been completed. Desktop layer controls remain dense and the mobile sheet has not been tested on a physical device. Native dialog behavior must be tested in supported browsers after host integration.
