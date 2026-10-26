# Phase 5A UX audit

Baseline: 3383e6af6e0336c972cb5588be6426ee460df73e. Browser: Chromium, local Vite server, 2026-10-27.

## Observed
- The empty composition presents four editor entry points in the canvas and repeats them in the Layers panel. This gives a clear first action but competes with the artwork area.
- The rail exposes five available tools and labels BEND as upcoming. Users can begin with any available tool.
- Opening Vector retains the project name and format above a separate session bar. The session identifies the tool, document, back action and publishing action; the original editor occupies the area below.
- Publishing the default Vector artwork returned to the composition with a selected layer. The layer panel exposed visibility, locking and order actions; the inspector exposed source re-entry and host transforms.
- The layer inspector explains that host placement is separate from source-editor state.

## Design priorities
1. Preserve project and artboard context while reducing duplicate chrome in a tool session.
2. Give layer identity, visibility, lock and ordering clear accessible controls. Keep topmost layers first.
3. Separate source editing from derivative handoffs, with compatibility supplied by the host.
4. Keep the canvas central and mark future video behavior as a prototype.

## Evidence limits
Only the empty composition, Vector entry and a default Vector publish were exercised in this audit. Image to Vector/Type, Shapes to Image, Generate, multi-layer reordering, source re-entry and BEND flows were not verified here. Consult the existing feature-parity matrix and Phase 3 reports for their separately documented test coverage. BEND is pending Phase 4; no prototype interaction establishes real integration.
