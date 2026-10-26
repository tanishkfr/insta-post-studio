# BEND. Phase 2A.1 accessibility report

Date: 2026-10-13  
Target: WCAG 2.2 AA as an engineering target, not a conformance claim.

## Automated checks passed

`@axe-core/playwright` `4.13.0` is installed and runs against the local Chromium app. The audit covers these rendered states:

- Landing page and experiment gallery.
- Project entry.
- Generated editor.
- Mobile inspector drawer at `390 × 844`.
- Timeline and inspector.
- Export dialog.
- Loaded footage with Effects/Wave Displacement controls.
- Unsupported-import error state.

The audit uses the `wcag2a`, `wcag2aa`, and `wcag22aa` rule tags. The current Chromium audit reports zero violations in all covered states.

## Manual and browser checks passed

- Tab/focus operation through the editor's primary controls remains usable.
- Timeline Home/End and one-frame ArrowLeft/ArrowRight seeking work without pointer dragging.
- A focused clip can be moved with ArrowLeft/ArrowRight; Shift changes the step to one second.
- Focused trim handles expose slider semantics and respond to one-frame/one-second steps plus Home/End bounds.
- Opening the export dialog moves focus to Close; Escape closes it; focus returns to the Export trigger.
- The export dialog exposes progress as a live status/progressbar and keeps error text inside the dialog.
- Icon-only controls have accessible names; file inputs have explicit labels.
- The Chromium smoke suite passes the generated, imported, audio, muted, multi-layer, cancellation, persistence, and keyboard workflows.

The reduced-motion stylesheet is present and collapses animation, transition, and smooth-scroll durations under `prefers-reduced-motion: reduce`. The responsive editor state was exercised at `390 × 844`.

## Issues fixed

- Replaced the low-contrast hero stamp color with the existing muted token.
- Removed nested interactive semantics from timeline clip groups while preserving keyboard activation.
- Increased trim-handle hit targets to 24px without changing the visual line weight.
- Added explicit labels/IDs and `aria-valuetext` for inspector range controls.
- Added pressed/group semantics to fit, preset, Wave Displacement, and export option controls.
- Added focus trapping, Escape handling, focus return, and descriptions to the export dialog.
- Added accessible canvas labels, import labels, live export status, and error alerts.

## Untested or partially verified scenarios

- No NVDA, Narrator, or other screen-reader smoke session was available. Screen-reader announcement quality remains unverified.
- Browser/OS zoom at a true 200% was not independently measured. The mobile viewport check is not a substitute for that test.
- Firefox could not launch on this host, so Firefox accessibility behavior is unverified.
- No physical touch device or high-contrast/forced-colors session was available.
- Axe cannot establish visual focus quality, animation comfort, keyboard task completeness, or full WCAG conformance on its own.

## Phase 5 rendered audit

The fresh direct-Chrome audit covered the landing page, project entry, editor desktop, export dialog, editor mobile Motion state, and editor tablet state. Axe reported zero violations in all six states. The pass also exercised the mobile Controls toggle, Motion legend, dismissible first-move guide, timeline keyboard focus/seek, and the export dialog's completion state.

Two issues found by the Phase 5 audit were fixed: the timeline modulation band now uses valid labelled image semantics instead of an `aria-label` on a plain span, and the editor now exposes a visually hidden level-one heading containing the project name. These fixes do not change the visual layout.

The automation result is recorded at `output/evidence/phase5/verification.json`. Manual screen-reader announcement quality, true 200% zoom, forced-colors, Firefox, and physical touch remain unverified.

