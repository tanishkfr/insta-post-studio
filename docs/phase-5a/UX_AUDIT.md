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


## Phase 5A.1 journey evidence — 2026-10-27

The baseline was exercised against the isolated Phase 3 worktree on port 4185. A manual Chromium session created a new project, published two Vector layers, selected, hid, locked and reordered one, reopened its source and returned to the canvas. Five existing Playwright workflow tests also ran: their journey assertions completed, but every test failed its final console guard on the baseline's missing `/favicon.ico` (404). A proxy retry timed out before page load. Thus those runs supply observed workflow evidence but **are not passing browser tests**. The descriptions below do not infer user study findings.

| Journey | Observed behavior and friction | Phase 5A response and Phase 5B work |
| --- | --- | --- |
| 1. Create a project | New opens a fresh project; initial canvas and Layers panel repeat the same tool choices. | Compact navigation and a canvas-first composition reduce duplicated entry points; preserve real project creation and save prompts in 5B. |
| 2. Open a tool | Vector opens inside Studio, with project context in the top bar and a separate session row. | The session header groups tool and project context; 5B must preserve iframe lifecycle and existing editor. |
| 3. Publish artwork | Vector Add to composition returns to the artboard and selects the new layer. | Demo mirrors the return action; real capture, persistence and error handling remain host-owned. |
| 4. Select/reorder/hide/lock | Two published layers were selectable, hideable, lockable and reorderable. Identically named outputs are difficult to distinguish at a glance. | Panel offers visible names and labelled actions; map order and state to the real store. Thumbnails require actual host data. |
| 5. Reopen source | Edit in Vector reopened the source session. Its inspector distinguishes host transforms from editor state. | Edit source is prominent in panel and inspector; 5B must retain source loading and transform preservation. |
| 6. Image to Vector | The browser workflow exercised a tracing input and published a derivative while retaining the original. The cross-tool action is contextual to selecting an Image layer. | Menu separates source edit and derivatives; host supplies real compatibility and provenance. |
| 7. Image to Type | The workflow opened a Custom Type motif from Image and published a separate result. The action appears only for a suitable selected Image. | Menu has data-driven availability; map the real Type mode and motif input, not a generic tool launch. |
| 8. Shapes to Image | The Phase 3 pipeline exercised a Shapes render into Image without removing its source. | The handoff model permits a separate derivative; map the real rendered input and capability after Phase 4 inspection. |
| 9. Generate alternatives | The workflow generated alternatives from existing layers and applied a layout; existing tests also exercise undo and source preservation. | Generate is presented as an arrangement action; 5B must wire its actual apply and undo semantics. |
| 10. Return to composition | Canvas returned from a reopened Vector editor to the same composition. | The demo has a back action and explicit cancellation feedback; host must preserve dirty confirmation and committed state. |

These are limited browser observations, not a complete accessibility or qualitative usability study. BEND playback, source and export remain pending Phase 4.
