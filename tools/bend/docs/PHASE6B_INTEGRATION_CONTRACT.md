# BEND Phase 6B — Integration Contract

Status: **host-neutral contract complete; real-host binding BLOCKED** (no group application supplied).  
Applies to BEND schema v2, `.bendpkg` format v1 and `BEND_INTEGRATION_VERSION = 1`.

This document is the contract a real group Instagram creative toolset must implement. It does not claim that a host exists. The existing `/integration` route is a local reference host only.

## 1. Scope and non-negotiables

BEND supplies:

1. a rendered video;
2. a poster/still rendered by the same compositor (never a UI screenshot);
3. an editable `.bendpkg` source package;
4. explicit source/version and media metadata.

The host owns its composition, host-layer identity, placement, stacking, timeline offset, playback policy, audio policy, persistence and final multi-specialist export.

Never:

- flatten the editable source into the rendered video as the only artifact;
- reimplement BEND's generator, mask, blend, effect, keyframe or temporal engine in the host;
- identify media by display filename;
- store temporary `blob:` URLs or BEND IndexedDB keys as durable host references;
- reset host placement when a BEND revision is updated;
- present an old render as the current source revision.

## 2. Artifact contract

### Rendered video — `BendRenderedMedia`

Required fields:

| Field | Meaning |
|---|---|
| `blob` | Playable video. |
| `poster` | PNG still rendered at timestamp 0 by `exportStillFrame`. |
| `width`, `height` | Actual rendered dimensions (preview export may be scaled to ≤720 px wide). |
| `fps`, `duration` | Actual composition timing. |
| `aspectRatio` | `width / height`, matching the composition aspect. |
| `mimeType`, `container`, `codec` | Truthful runtime output metadata; `codec` may be `null`. |
| `audioPresent`, `audioMessage` | Whether source audio was actually included, and why not if absent. |
| `sourceProjectId`, `sourceVersion` | Source identity for caching and stale detection. |

### Still — `BendStillMedia`

- Full-composition PNG from `exportStill(project, assetUrls, timestamp)`.
- `timestamp` is clamped to the composition and reported.
- Carries the same `sourceProjectId` / `sourceVersion`.

### Editable source

- `.bendpkg` format `bendpkg` / version `1`.
- Contains the normalized schema-v2 project plus referenced source assets.
- Does not contain local storage keys, temporary URLs or host placement.
- Must be validated with `normalizeProject` and package validation on import.

## 3. Source identity and revision rules

`getProjectVersion(project)` is the only source revision function.

- It normalizes the project and hashes creative content.
- Excluded: `metadata`, project `id`, `assets[].storageKey`, `assets[].size`.
- Included: canvas, layers, generators/seeds, effects, masks, blend modes, keyframes/animation, loop regions, timing, asset identity and media metadata.
- Saving, reloading, or reopening a package must therefore produce the **same** `sourceVersion`.
- Any creative edit must produce a **different** version.

Host cache key:

```
hostLayerId + sourceProjectId + sourceVersion
```

Never a filename. A previous render is stale as soon as `sourceVersion` changes.

On **Edit in BEND**:

1. Restore the package in a fresh context.
2. Recompute its version.
3. Reject the edit if it does not equal the host layer's committed `sourceVersion`.
4. Pass that version into the editor as the expected version.
5. Reject the update if the host layer changed while the editor was open.

## 4. Host layer record

`BendHostLayer` contains both BEND-owned and host-owned data. The ownership split is binding.

| Field | Owner | Update rule |
|---|---|---|
| generator, effects, masks, blends, keyframes, loop, source footage | BEND | Inside `.bendpkg`; replaced with the new source revision. |
| `sourceProjectId`, `sourceVersion` | Shared identity | Updated on a successful revision commit. |
| `renderedMediaId`, `posterMediaId`, `editablePackageId` | Host | Point to the committed artifacts; replaced only after a successful commit. |
| `duration`, `fps`, `width`, `height`, codec, audio presence | BEND output metadata | Updated with the render. |
| `id` | Host | Never changes. |
| `transform` | Host | Never reset by BEND. |
| `opacity` | Host | Never reset by BEND. |
| `stackingOrder` | Host | Never reset by BEND. |
| `timelineOffset` | Host | Never reset by BEND. |
| `playback` | Host | Never reset by BEND. |
| `audioPolicy` | Host | Never reset by BEND, even when a new render has no audio. |
| `audioPresent`, `audioMessage` | BEND output metadata | Inform the host; the host decides how to present them. |
| `editStatus` | Host | Committed / editing / rendering / error. |

## 5. Lifecycle

1. Host creates or selects a host layer context.
2. Host opens BEND with the source package or a new-project request.
3. BEND edits its own composition.
4. BEND exports video, poster and package through `BendIntegrationAdapter`.
5. Host validates the artifacts and stages them under a unique revision token.
6. Host commits the new artifact references and BEND metadata with compare-and-set against the host composition revision.
7. Host preserves the host-owned fields and unrelated layers.
8. Host updates/reloads its composition and plays the new render.
9. Cancel or failure leaves the previous committed revision untouched.
10. Host persists the source package and rendered artifacts using its existing storage architecture.

## 6. Staging, commit and cleanup

A real host should implement this state machine, even if its storage is not transactional:

```
load current host layer + expected sourceVersion
  -> refuse if sourceVersion changed
  -> export video/poster/package
  -> validate artifacts
  -> write artifacts under a new unique revision id (staged)
  -> compare-and-set host composition revision
       success -> point layer at staged artifacts
                -> keep old artifacts until commit is durable
                -> reference-scan before deleting old artifacts
       conflict/failure -> delete only this request's staged artifacts
                        -> leave old layer and old artifacts intact
```

Requirements:

- Never write staged artifacts over committed artifact IDs.
- Distinguish staged from committed revisions.
- Keep the previous revision until the new one is durable.
- Reject stale/concurrent updates explicitly.
- Delete only artifacts that no host composition references.
- Provide a conservative abandoned-artifact sweep (age threshold + reference scan).
- Never delete an artifact used by another host layer.
- Cleanup failure must not make a committed composition unusable.

The reference implementation is in `src/integration/host.ts`; it is not the real host's storage contract.

## 7. Duration, looping and audio

### Duration

- BEND exports its own composition duration.
- Host policies are `loop`, `hold-last-frame`, `trim-to-host`.
- The host must make duration adaptation explicit; avoid unexplained black gaps or duplicated playback.
- A host duration change must not rewrite BEND's source timeline.

### Loop

Three distinct concepts:

1. BEND project loop region (editable source).
2. BEND exported loop treatment (ordinary or mirrored/seamless export mode).
3. Host playback looping (host-owned policy).

A host loop setting must never rewrite the BEND loop region. Mirrored export is a verified visual export mode, not a universal perceptual-seamless guarantee.

### Audio

- BEND contract: topmost visible, unmuted primary source only; generated layers have no audio.
- Report `audioPresent` and `audioMessage` truthfully.
- Host mute/audio policy is host-owned.
- A render with no audio must not silently retain a false "source audio" claim.
- Seamless mirrored export omits source audio.

## 8. Range exports

- A range export is still a view of the same editable source project.
- Preserve the whole source package, including off-range keyframes, layers and footage.
- Do not permanently discard source context unless the user explicitly asks.
- Host placement remains host-owned; range start does not alter host timeline offset unless the host decides to.

## 9. Validation and conformance API

Hosts should import only these modules, not BEND internals:

```ts
import { createBendIntegrationAdapter, getProjectVersion } from "./src/integration/adapter";
import { assertValidRenderedMedia, assertValidStillMedia, assertValidHostLayer } from "./src/integration/validation";
import { verifyEditableSource, verifyBendHandoff } from "./src/integration/conformance";
```

Recommended host sequence:

```ts
const adapter = createBendIntegrationAdapter();
const video = await adapter.exportVideo(project, assetUrls, onProgress, signal);
assertValidRenderedMedia(video, project);

const still = await adapter.exportStill(project, assetUrls, timestamp, signal);
assertValidStillMedia(still, project);

const editable = await adapter.exportEditableProject(project, onProgress);
const verified = await verifyEditableSource(editable.blob, {
  sourceProjectId: project.id,
  sourceVersion: getProjectVersion(project),
});
```

For a complete handoff, `verifyBendHandoff({ project, video, still, editableSource })` checks that all artifacts share one revision.

Do not import BEND's React tree, Zustand store, Pixi renderer or IndexedDB schema as the host API.

## 10. Persistence ownership

- BEND's IndexedDB is local to BEND's origin and is not shared host storage.
- The host uses its existing persistence: local database, object storage, or its own document store.
- Persist the video, poster and package together with `sourceProjectId` / `sourceVersion` and the host layer id.
- Associate artifacts with a revision, not a filename.
- Keep previously committed artifacts until cleanup can prove they are unreferenced.
- Opening the editable source must use the stored `.bendpkg`, not BEND's original IndexedDB or blob URLs.

## 11. Security model

The current verified boundary is same-origin only. No cross-origin bridge is implemented or claimed.

If the real host requires an iframe or popup, the bridge must add:

- exact allowlisted origins in both directions; no wildcard;
- exact sender-window validation;
- explicit `hello` / `ready` handshake;
- protocol version validation;
- request IDs and runtime payload validation;
- timeout, cancellation, stale-request rejection and replay protection;
- editor-close recovery and disposal;
- host authorization for the intended project/layer;
- binary transfer through structured data or a validated package;
- negative tests for wrong origin, wrong window, malformed payload, unsupported version, repeated request ID, late response, unrequested replacement, oversized payload and unexpected close.

Messages, if used: `hello`, `ready`, `open`, `export-video`, `export-still`, `export-source`, `progress`, `complete`, `cancel`, `error`, `dispose`.

Do not invent production origins or deployment details.

## 12. Compatibility

- Schema `2`; legacy schema-1 projects migrate through `migrateProject` / `normalizeProject`.
- `.bendpkg` format `1`.
- Phase 5.5 fields are additive and normalized:
  - `BendLayer.blendMode`
  - `BendLayer.mask`
  - `BendProject.loop`
- There is no second mask format or animation engine.
- Older valid projects load unchanged; missing fields get visible-safe defaults.
- The integration contract version remains `1` because this work adds runtime validation and host-side safety, not a new transport shape. `audioMessage` on `BendHostLayer` is optional and additive.

## 13. Real-host acceptance checklist

A real host must demonstrate, in its own browser context:

- [ ] Create a BEND layer from the host and return video + poster + package.
- [ ] Place the result in 1:1, 4:5 and 9:16 compositions.
- [ ] Move, scale, rotate, reorder, set opacity and timeline offset.
- [ ] Save, reload and playback.
- [ ] Reopen the editable source in a fresh context.
- [ ] Edit generators/effects/masks/keyframes/loop and update.
- [ ] Preserve every host-owned property and unrelated foreground layer.
- [ ] Cancel and fail without replacing the last committed revision.
- [ ] Reject a stale/concurrent update.
- [ ] Verify audio policy with an audible fixture.
- [ ] Verify media with FFprobe/FFmpeg.
- [ ] Exercise storage quota/permission failures.
- [ ] Exercise keyboard, focus, progress/error announcements and supported breakpoints.
- [ ] Exercise the exact-origin bridge if one is used.

Until all applicable items pass in the actual group application, Phase 6B is not complete.
