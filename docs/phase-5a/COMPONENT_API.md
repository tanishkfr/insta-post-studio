# Component API

All exports are in `apps/studio/src/phase5a/components/index.tsx`; styles currently live in `preview/preview.css` and are scoped under `.p5a-root`. A host must supply that root and stylesheet or extract the component rules. No component imports the project store, adapters or editor implementations.

- **StudioHeader**: project, status, format, formats, editing, canUndo/canRedo; callbacks onFormat(string), onSave(), onUndo(), onRedo(). Format is a labelled select and status is announced. Export is currently disabled; a real host needs a supplied export action and project actions.
- **StudioToolRail**: ToolItem[] (id, name, purpose, enabled, optional reason), active, onCompose(), onTool(id). Native buttons indicate current view; unavailable entries are disabled.
- **StudioLayersPanel**: LayerItem[] in top-to-bottom order, selectedId, onSelect(id), onVisibility(id), onLock(id), onRename(id,name), onMove(id,up|down), onEdit(id). Selection is a pressed button; actions have layer-specific names. Host owns validation and storage. Rows currently use compact text controls; touch sizing needs further work.
- **StudioInspectorLayout**: layer, values {x,y,scale,rotation,opacity,blend}, onChange(key,value), onEdit(), optional children. Inputs are labelled and controlled. The host owns validation, units, transform math and blend compatibility; the sample fields do not change rendered output.
- **StudioToolSessionHeader**: tool, project, artboard, layer, status, publishing, updating, optional error, onBack(), onPublish(). Status and errors are announced; host owns cancellation confirmation and progress details.
- **ContinueInMenu**: RouteItem[] (id, label, description, enabled, optional reason), onChoose(id). Native button and controlled popup; host supplies compatibility and reasons. Escape closes the menu and returns focus; nested dialog Escape remains available after the menu closes.
- **StudioEmptyStates**: title, detail and optional {label,onClick} action. Generic presentational primitive; the six specific content states still need host examples and validation.
- **StudioStatusAndFeedback**: text and optional status/alert kind. Uses a native live status or alert. The host must supply truthful operation state.

All props are view-only values and callbacks; no persistence, export, compositing or transport is implemented. The demo holds local state and is not a shared schema.


## Phase 5A.1 additions

- **CompactPanel**: `title`, `onClose()` and `children`. Host conditionally mounts it and restores focus to its opener after closing. Native modal dialog contains focus; Escape and Close invoke the callback. A host must ensure one overlay at a time and handle its own responsive visibility.
- **StudioToolSessionHeader** accepts optional `onRetry()` alongside `error`; error is announced as an alert. The host supplies progress text and all retry/cancel semantics.
- Inspector `onChange(key, value)` exposes a typed property key and raw string, allowing the host to validate inputs without imposing transform mathematics. Preview values are held per selected layer and do not transform actual artwork.
- Preview feedback examples simulate save failure, publish failure/retry, missing artwork, unsupported action, no selection, unavailable video and cancelled editing. They perform no storage or media operation.
