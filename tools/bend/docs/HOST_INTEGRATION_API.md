# BEND. host integration API

## Purpose

Phase 6A exposes a framework-neutral adapter around BEND's existing project, compositor, and export boundaries. A future host does not need to adopt BEND's React editor, Zustand store, PixiJS renderer, or IndexedDB schema.

The implementation is in `src/integration/contract.ts` and `src/integration/adapter.ts`.

## Minimal adapter usage

```ts
import { createBendIntegrationAdapter } from "./src/integration/adapter";

const adapter = createBendIntegrationAdapter();
const rendered = await adapter.exportVideo(
  project,
  assetUrls,
  (progress) => hostProgress(progress),
  abortController.signal,
);

const still = await adapter.exportStill(
  project,
  assetUrls,
  1.25,
  abortController.signal,
);

const editable = await adapter.exportEditableProject(project, (progress) => hostProgress(progress));
```

The adapter returns ordinary `Blob`s plus explicit metadata. `sourceVersion` is a stable hash of the normalized project. A source edit therefore produces a new revision and the host can reject or hide stale rendered media.

## Returned media

`BendRenderedMedia` contains:

- video blob and poster blob;
- width, height, FPS, duration, and aspect ratio;
- MIME type, container, codec when detected;
- whether source audio was included and an explanatory message when it was not;
- source project id and source revision.

`BendStillMedia` contains a PNG blob, dimensions, selected timestamp, source id, and source revision. Still export uses the same compositor path as the editor/export dialog; it is not a screenshot of the surrounding UI.

## Host layer ownership

| Field | Owner | Rule |
| --- | --- | --- |
| generator, effects, keyframes, seeds, source footage | BEND | Serialized in the editable package and rendered by BEND. |
| rendered media, poster, editable package references | Host | Cached artifacts keyed by source revision. |
| `x`, `y`, scale, rotation, opacity | Host | Never reset because BEND rendered a new revision. |
| stacking order and timeline offset | Host | Remain host composition state. |
| loop / hold / trim-to-host playback policy | Host | Applied when the host places the layer. |
| mute/source audio policy | Host | Separate from BEND's source-audio setting. |
| source project id and source revision | Shared metadata | Used to associate the editable source and invalidate stale output. |

The typed host model is `BendHostLayer`. It includes a stable host-layer id, BEND source and rendered references, duration, FPS, dimensions, transform, opacity, stacking, timeline offset, playback policy, audio policy, and edit status.

## Round-trip lifecycle

The mock host follows this sequence:

1. Ask the adapter for rendered video, poster, and editable source.
2. Store those artifacts under versioned ids and add a host-owned layer.
3. Apply host transform, opacity, stacking, playback, and timeline changes without changing the BEND source.
4. On `Edit in BEND`, restore the editable package into BEND's local stores and open the editor with host context.
5. On `Update Post`, export a new video, poster, and package, then replace only the rendered/source references and BEND-owned metadata.
6. Preserve the previous host transform, opacity, stacking order, timeline offset, playback policy, and foreground content.
7. On cancel, return without replacing the committed host layer.

The implementation keeps old host artifacts until the new composition record is committed; failed artifact writes clean up their partial ids. A production host should add a durable garbage-collection policy for abandoned revisions.

## Duration and static/video policy

The contract defines `loop`, `hold-last-frame`, and `trim-to-host`. The mock host defaults to `loop`, keeps the host composition duration at least as long as the BEND layer, and does not flatten the foreground element into the BEND render. A real host must make any duration adaptation explicit and avoid blank intervals.

Static posts request `exportStill(project, assetUrls, timestamp)`. Animated posts request `exportVideo` and apply their own placement and playback policy. The host does not recreate Liquid, Flow, Refraction, temporal effects, or keyframes.

## Local persistence in the harness

The test host uses two additional IndexedDB stores only to prove the lifecycle locally: `host-compositions` stores the typed composition record and `host-media` stores video, poster, and editable-package blobs. This is harness infrastructure, not a required host framework or a cloud-storage contract.

## Stable source revision

`getProjectVersion()` hashes normalized creative content and excludes volatile bookkeeping:

- excluded: project `metadata`, project `id`, `assets[].storageKey`, `assets[].size`;
- included: canvas, layers, generators/seeds, effects, masks, blend modes, keyframes, loop/range, timing, asset identity and media metadata.

Saving, reloading or restoring a `.bendpkg` in a fresh context therefore keeps the same revision; a creative edit changes it. Hosts key cached media by `hostLayerId + sourceProjectId + sourceVersion`, never by filename.

## Runtime validation and conformance

```ts
import {
  assertValidRenderedMedia,
  assertValidStillMedia,
  assertValidHostLayer,
  assertValidHostComposition,
} from "./src/integration/validation";
import { verifyEditableSource, verifyBendHandoff } from "./src/integration/conformance";
```

- `assertValidRenderedMedia(video, project)` checks blobs, dimensions, aspect, FPS, duration, MIME/container, source id/version and audio claims.
- `assertValidStillMedia(still, project)` checks PNG output, timestamp bounds and revision.
- `assertValidHostLayer` / `assertValidHostComposition` check host-owned fields, enums and duplicate ids.
- `verifyEditableSource(blob, expected)` decodes a package without writing to BEND's stores and checks completeness, assets and revision.
- `verifyBendHandoff({ project, video, still, editableSource })` verifies that every artifact belongs to one revision.

## Revision-safe host commit

The reference host now stages every new render under a unique revision id. A commit:

1. checks `expectedSourceVersion` before rendering;
2. writes video, poster and package as staged artifacts;
3. validates the rendered artifacts;
4. commits the host composition with compare-and-set against a monotonic host revision;
5. preserves host transform, opacity, stacking, timeline offset, playback and audio policy;
6. deletes the previous artifacts only after the new composition is durable and only if no other host composition references them.

A stale source version, a concurrent host edit, an abort, a failed media write or a failed composition save leaves the previous committed revision intact and removes only the failed request's staged artifacts. `sweepAbandonedHostMedia()` removes old unreferenced artifacts with an age threshold.

This reference implementation uses IndexedDB only to prove the lifecycle. A real host must use its own storage and its own atomic/conditional-write capability.

## Status

Real group-toolset integration is currently **BLOCKED**: no host repository, origins, layer model or storage contract has been supplied. See [PHASE6B_IMPLEMENTATION.md](PHASE6B_IMPLEMENTATION.md), [PHASE6B_INTEGRATION_CONTRACT.md](PHASE6B_INTEGRATION_CONTRACT.md) and [PHASE6B_TEST_REPORT.md](PHASE6B_TEST_REPORT.md). The `/integration` route remains a local reference host, not the group application.
