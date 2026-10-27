# Phase 5B UI mapping

**Status:** Phase 5B PASS at implementation/test head `072735bcb102e2f956ec55caad1d06bae7e878ca`.

| Surface | Current integration | Preservation boundary |
| --- | --- | --- |
| Navigation | `StudioToolRail` receives the six actual `toolNav` IDs and availability, including `typography`; Canvas and `openNewTool` stay host-owned. | Editor session and adapter remain unchanged. The rail's real tool IDs and all six editors are browser-verified. |
| Header | `StudioHeader` hosts the existing real project controls; `StudioStatusAndFeedback` announces the real save state. | Rename commits on blur/Enter; New, Save, undo/redo and format remain host callbacks. Project rename/format/save/reload and tab order are browser-verified. The format selector keeps its full label down to 900px. |
| Layers | `StudioLayersPanel` host-content variant wraps the existing top-first store-backed presentation, with source/video labels and seafoam selection. | Selection, explicit rename commit, visibility, lock, reorder, duplicate, delete and source edit retain store callbacks. The host rows have not been migrated to the prototype `LayerItem` view model; real rows are also tested inside the compact dialog. |
| Inspector | `StudioInspectorLayout` host-content variant preserves the real controls; `ContinueInMenu` receives routes derived from the selected layer. | Real transform units, opacity conversion, source actions and BEND controls remain in the host. The prototype scale field is not used. |
| Handoff menu | `ContinueInMenu` receives capability-derived routes and real callbacks. Open focuses the first enabled route, scrolls the complete menu into view, supports ArrowUp/ArrowDown, closes on Escape and restores the trigger. | Host decides availability and disabled reasons. Source edit remains separate from derivative creation and Generate navigation. |
| Sessions | Existing `ToolSession` header retained with spacing and typography treatment. | Handshake, restore, publish, progress, cancel, disposal and BEND-specific paths remain in the existing implementation. |
| Compact | `CompactPanel` conditionally hosts the real Tools, Layers or Inspector panel at 760px and below; triggers expose `aria-haspopup="dialog"`/`aria-expanded`. | Close/Escape restore the invoking control; nested Escape closes the menu before the dialog. Original editor mobile workflows are not claimed optimized. |
| Canvas | Original `CanvasWorkspace` retained. | Rendering, selection, video playback and media lifecycle remain unchanged. |

Reusable styles remain in `apps/studio/src/phase5a/components.css`; preview-only artwork and layout remain in `preview/preview.css`. No source under `tools/` was changed.

## Verification delta in recovery

- The contextual menu previously opened as inline content below the visible inspector. Focus and whole-menu scrolling now make all routes reachable at 900×700 and on compact screens.
- Compact panel triggers gained dialog semantics (`aria-haspopup`, `aria-expanded`) without changing the host-owned single-panel policy.
- The 761–1000px format select cap was widened from 128px to 170px; the full `Instagram 1:1 · 1080×1080` label is readable at 900px.
- Browser coverage now includes project rename persistence, populated compact Layers/Inspector, all six compact tool entries, keyboard menu navigation, nested Escape, mixed static/video reorder persistence and BEND native downloads.
- The mapping remains a host-content adaptation, not a wholesale migration to the Phase 5A view model. That architectural choice is intentional and preserves the real editor callbacks.
