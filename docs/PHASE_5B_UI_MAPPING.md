# Phase 5B UI mapping

| Surface | Current integration | Preservation boundary |
| --- | --- | --- |
| Navigation | `StudioToolRail` receives the six actual `toolNav` IDs and availability, including `typography`; Canvas and `openNewTool` stay host-owned. | Editor session and adapter remain unchanged. |
| Header | `StudioHeader` hosts the existing real project controls; `StudioStatusAndFeedback` announces the real save state. | Rename commits on blur/Enter; New, Save, undo/redo and format remain host callbacks. No final composition export was added. |
| Layers | `StudioLayersPanel` host-content variant wraps the existing top-first store-backed presentation, now with source/video labels and seafoam selection. | Selection, explicit rename commit, visibility, lock, reorder, duplicate, delete and source edit retain store callbacks. The host rows have not been migrated to the prototype `LayerItem` view model. |
| Inspector | `StudioInspectorLayout` host-content variant preserves the real controls; `ContinueInMenu` receives routes derived from the selected layer. | Real transform units, opacity conversion, source actions and BEND controls remain in the host. The prototype scale field is not used. |
| Sessions | Existing `ToolSession` header retained with spacing and typography treatment. | Handshake, restore, publish, progress, cancel, disposal and BEND-specific paths remain in the existing implementation. |
| Compact | `CompactPanel` conditionally hosts the real Tools, Layers or Inspector panel at 760px and below. | Close/Escape restore the invoking control; original editor mobile workflows are not claimed optimized. |
| Canvas | Original `CanvasWorkspace` retained. | Rendering, selection, video playback and media lifecycle remain unchanged. |

Reusable styles were extracted to `apps/studio/src/phase5a/components.css` and imported by the host rail boundary. Preview-only artwork and layout remain in `preview/preview.css`. No source under `tools/` was changed.
