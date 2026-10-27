# BEND Adapter (Studio 2.0)

**Status:** Phase 4 complete. BEND is the sixth integrated creative tool and still runs its complete preserved editor.

## 1. Runtime

| Item | Value |
| --- | --- |
| BEND source | `tanishkfr/Bend`, `polish/phase-8.1.1-ui`, `7f2d69c272d2a4607ff45f2575c650ac3b6cfb43` |
| Runtime | React 19 + Zustand + PixiJS + Mediabunny, own dependency tree |
| Build | `npm run tool:bend:build` → Vite production build with `BEND_BASE=/tools/bend/` |
| Standalone | `npm --prefix tools/bend run dev/build` keeps the original root base and routes |
| Studio dev route | `/tools/bend/index.html` served from `tools/bend/dist` by the Studio Vite plugin |
| Studio production route | `apps/studio/dist/tools/bend/` copied by the Studio build |
| Nested routing | `App.tsx` strips/restores `import.meta.env.BASE_URL`; `/tools/bend/studio/edit` works in production |

The complete editor UI remains inside the iframe: media/project libraries, V1/M1 timeline,
trim/split/reorder/ripple/delete, speed/reverse/freeze/ramps, generators, temporal effects,
transitions, keyframes/modulators, masks/crop/transform/color/blend, audio, history/recovery,
native still/video export and `.bendpkg` import/export. Studio does not reimplement the timeline.

## 2. Transport

Studio uses the shared `IframeToolAdapter` and `ToolAdapterV1` for:

- exact-origin/sender/scope/protocol/request-ID validation;
- initialization and READY handshake;
- `tool/open`, `context/update`, `assets/input`, `state/restore`, `state/serialize`;
- standard `render` for PNG stills;
- cancellation timeouts and listener/resource disposal.

Large BEND publishing is handled by a dedicated controller over the same scoped channel:

```text
Studio host                         BEND iframe bridge
    |  bend/publish {quality, expectedSourceVersion}
    |---------------------------------------------->
    |  progress events (video/poster/package)
    |<----------------------------------------------
    |  {video, poster, package} artifact descriptors
    |  each: same-origin object URL + SHA-256 + byte length
    |---------------------------------------------->
    |  host fetch → size/hash verify → decode/validate → store
    |  bend/publish/ack
    |---------------------------------------------->
```

No rendered video/package is sent as one enormous `postMessage` payload.

## 3. Source state

Studio stores a versioned JSON document:

- MIME `application/vnd.studio.bend+json`
- version `1.0.0`

It references, rather than embeds, the complete editable `.bendpkg`:

- package asset ID, format (`bendpkg`), format version;
- BEND project ID and source revision (`getProjectVersion` content hash);
- package SHA-256 and byte length;
- every packaged source media record (id/name/MIME/bytes/hash/dimensions/duration);
- canvas dimensions, fps, duration, aspect preset;
- preview/final output, video MIME/container/codec/dimensions/fps/duration/audio status;
- poster dimensions/timestamp;
- host mode (`new`/`edit`/`static-handoff`), source Studio layer IDs/revisions and
  optional static-handoff provenance.

The host validates this document before opening BEND. The bridge validates the package
again, fetches it through a same-origin blob URL, checks size/hash, decodes the package,
and only then replaces the editor document.

## 4. Edit-session restore and cleanup

BEND's package restore is not reused blindly for Studio sessions. A deliberate temporary
project is created with a `bend-studio-` project ID:

- repeated opens replace the same temporary record instead of appending duplicate projects;
- source media is content-deduplicated against BEND's existing asset store;
- only `bend-studio-` project IDs are deleted on close/cancel;
- cleanup then runs BEND's conservative reference scan over every saved project, so media
  belonging to standalone BEND projects is never removed;
- cancellation/failure leaves the previous Studio layer, video, poster and package intact.

The source revision is checked twice:

1. `state/restore` verifies the package revision against the committed Studio source.
2. The host compares the in-memory and durable Studio layer revision before committing a
   republish, rejecting cross-tab stale updates.

## 5. Publishing

`captureBendArtwork` requests:

1. video at explicit **preview** (≤720 px wide) or **final** (full canvas) quality;
2. full-canvas PNG cover frame at `project.cover.time`;
3. complete `.bendpkg` with all source media.

Before storing anything, the host verifies:

- all three artifact sizes and SHA-256 hashes;
- video container magic (MP4 `ftyp` / WebM EBML) against BEND's declared container;
- actual browser decodability, dimensions and duration via `<video>`;
- frame rate as the composition's encoded target FPS (average packet rate is diagnostic);
- PNG signature and exact poster dimensions;
- package magic, manifest, format version, completeness, entry sizes/hashes, project/media
  agreement and video-layer/soundtrack asset references;
- source project ID and revision agreement across video, poster and package.

Only then are video, poster and package written to Studio's IndexedDB asset store and the
host layer committed. A final export is never produced by upsampling a preview.

## 6. Host layer

A BEND publication becomes one `SharedLayer`:

- `kind: "video"`, `sourceTool: "bend"`;
- `rendered` = video asset;
- `poster` = PNG cover asset;
- `sourceState` = versioned BEND package reference;
- `temporal` = duration/fps/playback/audio policy/container/codec/audio status/preview flag;
- normal host transform, opacity, visibility, blend/mask and stacking order.

Republishing calls `applyLayerArtwork` and retains layer ID, transform, opacity, visibility,
artboard, stacking order and provenance.

## 7. Capabilities and limitations

Reported by the bridge:

- WebCodecs/Mediabunny codec support is browser-dependent (Chromium baseline; Firefox WebM;
  Safari unverified).
- Preview is 720 px wide; final is the full composition canvas.
- Static-artwork handoff uses an explicit flat background; alpha is not claimed.
- Studio previews one temporal layer at a time, muted by default.
- Synchronized multi-video/audio composition and final multi-layer Studio export are outside
  this phase.

## 8. Relevant files

```text
tools/bend/src/integration/studioBridge.tsx     scoped bridge + real EditorPage mount
tools/bend/src/integration/studioPublish.ts     original exporter + verified artifacts
tools/bend/src/integration/studioSession.ts     temp project restore/cleanup
tools/bend/src/integration/contract.ts          publish descriptors
tools/bend/src/app/App.tsx                      base-aware nested routing
tools/bend/vite.config.ts                       BEND_BASE support
apps/studio/src/adapters/bend/                  host validation, package inspection, capture
apps/studio/src/adapters/iframe/IframeToolAdapter.ts  scoped transport extension
apps/studio/src/components/BendEditor.tsx       Studio session UI/quality control
```
