# Phase 5B integration recipe

Inspect the final Phase 4 branch first. All BEND transport, entry/exit, video metadata and publishing mappings are **PENDING PHASE 4 INSPECTION**. Do not infer signatures from the demonstration.

1. Map `components/Topbar.tsx` to `StudioHeader`. Preserve project rename, save/error, undo/redo, format and project actions. Add a real export callback only when available. The present prototype does not yet expose all of these actions.
2. Map `components/ToolRail.tsx` to `StudioToolRail`. Translate the final tool IDs and availability rules; do not enable a route solely because it has a label.
3. Map `components/LayersPanel.tsx` to `StudioLayersPanel`. Convert the existing bottom-to-top artboard order to top-to-bottom view data; route callbacks to the existing store. Preserve selection, naming, visibility, lock, ordering, source edit, duplicate and delete semantics. Duplicate/delete still need explicit component support.
4. Map `components/InspectorPanel.tsx` to `StudioInspectorLayout`. Translate host transform and appearance fields, validation and source actions; do not move specialist controls into the shell. Preserve host/source transform separation.
5. Map the header portion of `adapters/session/toolSession.tsx` to `StudioToolSessionHeader`. Keep the existing iframe, adapter, dirty/cancel warning, error, retry, progress and publish logic. The prototype header requires extension for those states before replacement.
6. Map existing contextual handoffs to `ContinueInMenu`. Build route data from actual compatibility and source availability. Preserve the difference between editing source, making a derivative and applying Generate.
7. Keep `CanvasWorkspace.tsx` and its compositor. Adopt only the surrounding layout after verifying selection and canvas sizing. The demonstration artboard is not a compositor.
8. **PENDING PHASE 4 INSPECTION:** map BEND launch, return, video preview, source association and specialized export using the final adapter contract. Never infer completion from the prototype.

Adopt and verify one component at a time, keeping the old host operational. Do not replace stores, asset repositories or adapter transport. Before integration, extract reusable component styles from the preview stylesheet and complete the API gaps in COMPONENT_API.md.


## Import and adoption details

Import named exports from `apps/studio/src/phase5a/components/index.tsx`. The present component rules are in `apps/studio/src/phase5a/preview/preview.css` and require the `.p5a-root` ancestor. **Required:** extract or split reusable rules before production adoption; the file also contains demo layout and artwork selectors. Load the existing Instrument Sans font in the host. Do not import the preview entry.

Recommended order, with host checks at each step:

1. Extract scoped tokens and `StudioStatusAndFeedback`/`StudioEmptyStates`; inspect status and failure stories, then run host unit tests.
2. `StudioToolRail` replaces or augments `components/ToolRail.tsx`: map `toolNav` IDs, labels, discipline and availability to `ToolItem`; map `onTool` to existing `onOpenTool` and `onCompose` to canvas navigation. Verify all live and disabled tools.
3. `StudioHeader` augments `components/Topbar.tsx`: map `project.name`, `project.format`, formats, save state and history availability; map callbacks to existing Topbar callbacks. **Required before replacement:** expose project rename/new/export and save failure controls, and preserve edit mode semantics. Test project rename, format, save and history.
4. `StudioLayersPanel` augments `components/LayersPanel.tsx`: resolve `artboard.layerOrder` from `project.layers`, reverse it for top-first UI, map `sourceTool`, `kind`, visibility and lock to `LayerItem`. Map callbacks to the existing selection, update, reorder and source-open store actions; add existing duplicate/delete actions before replacement. Verify reorder boundaries and undo.
5. `StudioInspectorLayout` augments `components/InspectorPanel.tsx`: map host transform and appearance into values, parse and validate `onChange` at the host boundary, and map `onEdit` to existing source edit. Preserve units, separate scale axes and supported blend modes from the actual contract; preview fields alone are insufficient to replace the live inspector. Test edits, locks and republish transform preservation.
6. `StudioToolSessionHeader` augments the header in `adapters/session/toolSession.tsx`: map title, active artboard, dirty state, error and publishing/progress; map back/publish/retry to the existing session callbacks. **Required:** retain existing warnings, retry and cancellation confirmation. Verify publish, cancel and failure recovery.
7. `ContinueInMenu` augments inspector contextual actions: build `RouteItem[]` from real capabilities and source availability, map route IDs to the existing handoff callbacks; keep disabled reasons. Test Image → Vector, Image → Type, Shapes → Image and Generate.
8. BEND presentation: **PENDING PHASE 4 INSPECTION**. Confirm tool ID, source re-entry, publishing, video identity and availability before mapping. Never assume preview video state represents a playable asset.
9. Integrate `CompactPanel` at the host boundary with a single active panel and opener focus restoration; verify keyboard, Escape, focus and responsive behavior at the required sizes. Run host typecheck, build, unit and browser journeys after each component and a complete final audit. The preview is not in the production build.

Dependencies: the layer and inspector components use `StudioEmptyStates`; session/header use `StudioStatusAndFeedback`. The menu, rail and compact panel are otherwise independently adoptable. Changes to App should be limited to mapping and composition, not wholesale replacement.
