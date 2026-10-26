# BEND. integration contract

This document describes the Phase 2A/2B local seams. There is no provider registry, server API, authentication contract, hosted generation dependency, or upload boundary in this phase.

## Inputs

### Generated motion

`createGeneratedProject(aspect, preset, seed)` remains the Signal Field entry helper. `createProceduralLayer(generatorId, seed, name)` and the registry-backed Generate workspace create any supported procedural system. The generator is deterministic for the same preset, seed, time, and parameters; Liquid additionally rebuilds state through its fixed-step replay path.

Supported generators and presets:

- `signal-field`: `pulse`, `drift`, `current`, `fracture`
- `liquid`: `ink-spill`, `vortex`, `tidal`, `nebula`
- `flow`: `threads`, `current`, `orbit`, `drift`
- `refraction`: `pool`, `glass`, `prism`, `mirage`

### Local footage

`probeVideo(file)` reads browser metadata from a temporary object URL. `createAssetRecord(file, metadata)` creates metadata and a storage key. `inspectMediaFile(file)` then checks Mediabunny video/audio tracks, source timestamps, frame-rate metrics, and audio decode capability when available. The blob is saved separately with `saveAsset`; the project holds only metadata and the asset id.

Accepted formats are browser-compatible MP4 and WebM variants. A file may pass the extension check and still fail at browser decode; that error is surfaced to the user.

## Project contract

```ts
interface BendProject {
  schemaVersion: 2;
  id: string;
  name: string;
  canvas: { width: number; height: number; fps: number; duration: number; background: string };
  assets: Record<string, MediaAssetRecord>;
  layers: BendLayer[]; // ordered bottom-to-top
  timeline: { inPoint: number; outPoint: number };
  metadata: { createdAt: number; updatedAt: number };
}

interface MediaAssetRecord {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  width: number;
  height: number;
  duration: number;
  storageKey: string;
  audio?: { status: "unknown" | "none" | "available" | "unsupported"; codec: string | null; channels: number | null; sampleRate: number | null; startTime: number; message?: string };
  frameRate?: number | null;
  isVariableFrameRate?: boolean;
  videoStartTime?: number;
}

interface BendLayerBase {
  id: string;
  name: string;
  transform: {
    x: number; y: number; scale: number; rotation: number; opacity: number;
    anchor: { x: number; y: number }; flipX: boolean; flipY: boolean;
  };
  crop: { x: number; y: number; width: number; height: number };
  color: { brightness: number; contrast: number; saturation: number; hue: number; enabled: boolean };
  timeline: { start: number; duration: number };
  visible: boolean;
  locked: boolean;
  muted: boolean;
  effects: TemporalEffectInstance[];
  animation: LayerAnimation;
}

interface VideoLayer extends BendLayerBase {
  kind: "video";
  assetId: string;
  trimStart: number;
  trimEnd: number;
  fit: "contain" | "cover";
  wave: WaveDisplacementParams;
}

interface ProceduralLayer extends BendLayerBase {
  kind: "procedural";
  generator: SignalFieldParams | LiquidParams | FlowParams | RefractionParams;
}
```

`LayerAnimation` stores stable property tracks with bounded keyframes and an optional deterministic modulator. Supported property paths are layer transforms, numeric generator parameters, video Wave Displacement parameters, and numeric temporal-effect parameters. Effect tracks use `effects.<instanceId>.<parameter>`; consumers must not key them only by effect type.

Preview and export call the same animation evaluator at composition time. Stateful Liquid evaluation receives the evaluated parameter callback at each fixed simulation step. A recipe is applied only after JSON validation and is mapped into ordinary project layers; recipes do not bypass normalization, asset storage, or undo/redo.

Each generator record includes `id`, `version: 1`, `preset`, `seed`, generator-specific normalized parameters, and `duration`. See [PROCEDURAL_ENGINE.md](PROCEDURAL_ENGINE.md) for the full registry/extension contract.

Do not write a project directly to IndexedDB without passing through `normalizeProject`. Do not store media blobs inside the project record. Use `migrateProject`/`normalizeProject` when reading old data; schema-v1 projects are migrated to v2 with explicit timeline and layer-state defaults. Unsupported or malformed documents must fail closed.

`createVideoLayer(asset)` creates a new independent layer. `prependProceduralLayer(project, generatorId)` adds the selected procedural generator below existing layers. Layer order is part of the contract; do not flatten video or procedural content into a replacement source asset.

`getRenderableLayers(project, projectTime)` returns visible layers whose timeline contains the requested composition time. `sourceTimeAt(layer, projectTime)` maps a video layer through its placement and clip-local trim. Preview and export must use these rules together.

## Rendering contract

`PixiBendRenderer` accepts a caller-owned canvas and dimensions. Call `init()` before rendering, call `setVideoElements()` when local video sources change, and call `destroy()` when the owning view unmounts. `render(project, time)` must be the only source of compositor output for preview and export. `setVideoFrames()` may provide timestamped Mediabunny canvas frames during export. The renderer owns per-layer sprites/filters and must release stale textures when layer references disappear.

The renderer uses WebGL as the primary path for analytic generators and texture presentation. Liquid's deterministic fixed-grid state is rebuilt on the CPU and uploaded as a low-resolution texture; this is portable but is not a full GPU multipass fluid implementation. A device without a usable WebGL context receives a visible capability message; no static fake frame is substituted.

## Export contract

`exportVideoComposition` accepts a project, object-URL map, quality (`preview` or `high`), optional `AbortSignal`, and progress callback. It returns a blob, filename, MIME type, and encoder identity. Callers must treat codec support as runtime capability and must not assume MP4 exists on every browser.

Phase 2A output contract:

- PNG captures the current rendered frame.
- Video renders all visible, active layers at the project FPS using the same ordering and transforms as preview.
- MP4 is preferred when a compatible encoder is available.
- WebM is the fallback path.
- A compatible source audio track is retained from the topmost visible, unmuted video layer and mapped through trim and timeline placement.
- Other overlapping source audio is omitted by policy and reported; generated layers have no audio.
- If audio cannot be decoded/encoded, or MediaRecorder fallback is used, the result is explicitly video-only.
- Aborting cancels the encoder and releases local media/render resources.

Mediabunny `CanvasSink` is the preferred timestamp-based decode path when `InputVideoTrack.canDecode()` is true. HTML video seeking is the compatibility fallback. Consumers must not claim universal frame-exact behavior, especially for unsupported codecs or variable-frame-rate input.

## Future integration boundary

If hosted or local AI generation is added later, it must return a project-safe asset or generator payload through an explicit adapter. It must not bypass the local project model, mutate IndexedDB implicitly, or add a provider-specific route to the editor. The current deterministic generator remains the fallback and the offline baseline.

The future Instagram canvas importer should receive independent layer records, not a flattened video: each record needs its stable id, source asset reference, kind, order, `{ start, duration }`, trim (for video), transform, visibility, opacity, mute/lock state, and supported effect parameters. Binary media remains outside the project JSON and is resolved through the existing storage boundary.

## Phase 6A portable source and rendered handoff

The Phase 6A contract deliberately separates two artifacts:

1. `.bendpkg` is the editable source package. It contains normalized project data and source media entries, never temporary object URLs or origin-specific IndexedDB keys.
2. `BendRenderedMedia` is a playable rendered layer with video, poster, dimensions, FPS, duration, MIME/container, codec, audio status, source project id, and a stable source revision.

`BendIntegrationAdapter` exposes `exportVideo`, `exportStill`, and `exportEditableProject`, each with progress/cancellation where the operation can take time. The host stores those blobs and creates a `BendHostLayer`; it does not recreate BEND's renderer. `BendHostLayer` keeps host transform, opacity, stacking order, timeline offset, playback policy, audio policy, and edit status outside the BEND project.

On a round trip, the host restores the editable package, opens BEND with host context, and accepts a new rendered revision only after export and artifact storage succeed. The previous host transform and unrelated foreground content remain untouched. Cancel returns without replacing the committed revision. The local proof is `/integration`; the decision and future cross-origin requirements are in [EMBEDDING_DECISION.md](EMBEDDING_DECISION.md) and [PHASE6B_HANDOFF.md](PHASE6B_HANDOFF.md).

## Phase 5.1D editing contract

Direct editing does not create a new host boundary. The host continues to receive rendered video/still output and editable project packages through the Phase 6A adapter. Within BEND, selection, crop, anchor, flip, color, and transform values are normalized project fields and therefore survive save/restore, package export/import, preview, PNG export, and video export through the existing paths.

Crop is normalized source-space geometry and is intentionally distinct from video trim and layer timeline placement. Guides and UI overlays are not project fields and must never be serialized or rasterized into host media. Auto-Key may create transform/opacity/color tracks; crop, anchor, and flip remain static in this phase. A host must not reimplement these rules or flatten editable BEND layers into a replacement source asset.
