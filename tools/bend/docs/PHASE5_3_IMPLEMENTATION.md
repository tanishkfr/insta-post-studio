# BEND Phase 5.3 — Implementation

Status: implementation complete; overall acceptance remains `PARTIAL` because the environment did not support the full media/browser matrix.

## Previous architecture and observed problems

BEND persisted one most-recent project and used a component-owned debounced `saveProject` effect. A save had no durable revision guard, so late IndexedDB work could report stale state. Video-layer deletion also removed an asset from the live store even when undo history still referenced it. The editor had package export but no standalone package-open flow, and a missing video could only be re-imported as a new layer. PNG export did not share the video path's abort lifecycle. Phase 5.2 had also left Pixi teardown warnings involving destroyed texture resources, and host revision staging did not roll back all newly written media when the composition save failed.

## Changes made

### Project lifecycle

- Added a compact local project library dialog with list, open, new, duplicate, rename, and confirmed delete actions.
- Project rows show name, aspect, duration, last-modified date/time, current-project state, and a structural layer thumbnail. The thumbnail is deliberately not presented as a rendered media preview when no cached preview exists.
- Added `listProjects`, `renameProject`, and active-project-safe loading in the editor.
- Duplicates receive a new project id and share existing asset ids/blobs. Deleting one project does not delete shared media.

### Autosave and persistence

- Added `ProjectSaveCoordinator` with project identity, monotonic in-session revisions, debounce, explicit settle/flush, failure retention, and retry.
- Added an IndexedDB revision guard. A transaction reads the current record and only commits an incoming revision that is at least as new, protecting against out-of-order writes.
- Project switches, new projects, example opening, package import, home navigation, and the project library settle the current project first.
- Save failure leaves the current project in memory, exposes retry and recovery-package actions, and blocks unsafe navigation when local persistence is unavailable.
- The `beforeunload` warning is intentionally conservative. Browser shutdown cannot guarantee completion of an asynchronous IndexedDB write.

### Undo and media ownership

- Removed ordinary layer-removal calls to `removeUnusedAsset`; project state and undo/redo history retain the asset reference needed to restore the layer.
- Replacing an object URL now revokes the previous URL before storing the new one.
- Added reference-aware cleanup helpers. Cleanup runs conservatively during project deletion and protects active/unsaved asset ids; ordinary layer removal does not trigger collection.
- Restored-package deletion now removes only the project first and performs the same reference-aware cleanup rather than deleting every asset id blindly.

### Missing-media recovery

- Added `Relink source` in the video inspector and in the missing-media banner.
- Relinking probes and inspects the replacement, warns on meaningful dimension/duration differences, reuses the missing asset id, overwrites only that asset's stored blob, and leaves layer transform, crop, timeline, effects, and animation untouched.

### Portable packages

- Added `Open project package` to the project library and standalone editor menu.
- Import validates the existing `.bendpkg` format before showing project name, format, duration, and media count. Confirmation then restores editable layers/assets using the existing collision and rollback logic.
- Existing project and asset ids are rewritten as needed; the original project is never overwritten.

### Export lifecycle

- Still-frame export now accepts the same abort signal and checks cancellation around source preparation, frame sampling, and capture.
- Export jobs have identities. Obsolete jobs cannot update React state or replace a newer/previous successful result.
- Close/Escape aborts active work without stale completion messages; explicit cancellation reports a distinct retryable state.
- Result URLs are revoked on replacement/unmount, and a previous successful result is retained until a newer result succeeds.

### Pixi lifecycle

- Cleared Pixi's shared filter input bind-group resources before resource teardown and before render-time replacement cleanup.
- Kept the existing sprite/filter ownership and the Phase 5.2 crop-uniform fix; no warning suppression or renderer rewrite was added.

### Host revision safety

- Host video, still, and editable-package blobs are staged first.
- Composition save failure or cancellation deletes only the newly staged ids, leaving the previous committed revision intact.
- After a successful replacement commit, superseded media is cleaned best-effort. Host placement, foreground state, and layer identity remain unchanged.
- The integration page no longer performs a redundant second composition write after `createAndPersistHostLayer` has committed it.

### Inspector and timeline readability

- Range controls now use a dedicated full-width track row with a larger thumb and pointer target; labels, numeric values, and animation actions remain grouped above it so the slider is usable at the inspector's narrow width.
- The timeline toolbar separates transport/readout from legend/zoom tools and wraps those groups at smaller widths, preventing the timecode, layer metadata, and controls from colliding.
- These are presentation-only changes: the existing range events, keyframe/modulator actions, timeline scrubber, and zoom behavior are unchanged.

## Ownership rules

1. `project.assets` is the persisted project-level ownership reference.
2. Undo/redo and the current project are protected in memory; no ordinary layer deletion deletes a blob or URL.
3. Shared assets are deleted only when no saved project references them and the caller has not protected an active/unsaved id.
4. Host media is revision-owned. New ids are temporary until the composition record commits; old ids are eligible only after a successful replacement.
5. Temporary object URLs are revoked when replaced, when switching projects, and when editor/export resources are disposed.

This intentionally favors deferred/conservative cleanup over aggressive garbage collection. A future explicit maintenance action can collect assets that have become unreachable without changing the editing contract.

## Known limitations

- The project library uses a structural thumbnail fallback; it does not render a full Pixi preview for every saved project during listing.
- The complete fixture-backed video import/relink/audio round trip was not run in this environment.
- The in-app browser verified procedural export teardown and found no console warnings, but the full video-only/video-plus-effect/repeated-export matrix remains unverified.
- The real cross-origin Phase 6B bridge remains out of scope; `/integration` is still a local harness.
