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
