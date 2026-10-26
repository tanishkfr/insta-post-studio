# BEND Phase 6B Handoff

Date: 2026-10-25
Source: BEND Phase 5.5, shared compositor and editable-package architecture.

> **2026-10-25 Phase 6B execution update:** the actual group application remains unavailable. No real-host integration is claimed. BEND-side revision identity, artifact validation, conformance helpers and a revision-safe reference host were hardened and tested. See [PHASE6B_IMPLEMENTATION.md](PHASE6B_IMPLEMENTATION.md), [PHASE6B_INTEGRATION_CONTRACT.md](PHASE6B_INTEGRATION_CONTRACT.md), [PHASE6B_TEST_REPORT.md](PHASE6B_TEST_REPORT.md) and [PHASE7_HANDOFF.md](PHASE7_HANDOFF.md).


## Readiness

**READY WITH LIMITATIONS** for Phase 6B group-toolset integration.

The Phase 6A host contract remains functional after the additive project changes. Phase 5.5 did not alter the integration provider shape, host placement ownership, package format version, rendered-media contract, or host media persistence.

## Stable contracts to keep

- `BendProject` schema remains version 2 at this time. New phase data is additive and normalized with defaults.
- `.bendpkg` format version remains 1. It embeds the normalized project, so blend/mask/loop data round-trips without a new archive entry type.
- `createBendIntegrationAdapter` remains the host-facing path for editable source and rendered media.
- Host-owned placement, stacking, playback policy, timeline offset, audio policy, and committed rendered media remain host concerns.
- Preview and export continue through the shared `PixiBendRenderer`.
- Local-first media ownership remains conservative; replacement/source repair never deletes a potentially shared asset.
- `ProjectSaveCoordinator`, project revisions, shared asset IDs, and undo-safe media cleanup remain active.
- Audio remains topmost-primary-source-only for ordinary export. Seamless loop export intentionally omits audio.

## New fields a group toolset may encounter

```ts
type LayerBlendMode = "normal" | "multiply" | "screen" | "add" | "overlay";

interface LayerMask {
  type: "none" | "rectangle" | "ellipse" | "gradient";
  x: number; y: number;
  width: number; height: number;
  rotation: number;
  feather: number;
  invert: boolean;
  angle: number;
  falloff: number;
}

interface ProjectLoopRegion {
  enabled: boolean;
  start: number;
  end: number;
}
```

- `BendLayer.blendMode` and `BendLayer.mask` are always present after normalization.
- `BendProject.loop` is always present after normalization. Missing values on older projects become `{ enabled: false, start: 0, end: duration }`.
- Reader tools must call `normalizeProject`; do not read raw persisted objects and assume the fields exist.
- Writers may add these fields directly; normalization will validate and bound them.

## Compositor contract

```
source → temporal effects → spatial wave (video) → crop → color
       → transform → mask → layer blend/opacity → composition
```

- Mask is composition-space alpha after transform/crop/color.
- Blend uses the custom layer back-buffer filter and requires the WebGL renderer option `useBackBuffer: true`.
- Blend is non-destructive and participates in export.
- Temporal procedural sampling strips transformation/crop/color/mask/blend before temporal processing; the shared compositor applies them once.
- Do not introduce a second compositor or a parallel mask path.

## Host integration test status

Phase 6A round-trip passed in system Chrome:

1. Open `/integration`.
2. Add BEND layer.
3. Edit in BEND.
4. Add an ellipse mask.
5. Update Post.
6. Host source version changed and the host returned normally.

The Phase 5.3 40/40 media/package suite also passed after the Phase 5.5 changes, including editable package restore, shared-media duplication/deletion, relink, corrupt package rejection, and video/PNG export.

## Recommended Phase 6B work

1. Promote host range/seamless policies only if the host can store and display the added output semantics. The current Phase 6A host renders the full composition; Phase 5.5 range export is an editor-side feature.
2. Expose the new layer fields in any group toolset through the same normalized document and package contract. Do not serialize a second "group" copy of masks/blends.
3. Add multi-layer keyframe/group editing only if the selection model is lifted from the existing transient `keyframeSelection` rather than creating a new animation engine.
4. If group tools need direct mask handles, reuse `getLayerTransformMatrix`/composition-space geometry and the existing mask shape schema. Do not add a second mask representation.
5. Preserve the explicit distinction between ordinary loop playback and verified seamless export.

## Remaining verification limits

- Firefox and hardware-GPU host paths are not verified.
- Manual screen-reader, 200% zoom, forced-colors, and touch checks remain outstanding.
- The historical browser Playwright specs predate Studio 2.0 and are not a valid Phase 6B regression gate. Use the current Phase 5.3/5.4/5.5 system-Chrome harnesses plus unit/typecheck/build.
- Seamless repeat is a supported export mode, not a universal generator-period guarantee.

---

## Appendix — Retained Phase 6B host requirements

Phase 6A proves a local two-part handoff inside BEND: **editable source + rendered media**. This document is the exact boundary for connecting a real group Instagram creator later. No Phase 6B integration is claimed by the current repository.

## Inputs required from the group application

Before implementation, the group app must provide:

- repository and branch/checkout boundary;
- framework and build/runtime versions;
- deployment origins for the host and BEND editor;
- canvas dimensions, FPS, duration, and timeline semantics;
- host layer model and ownership of transform, opacity, stacking, offset, playback, and audio policy;
- local/cloud media storage and cleanup policy;
- whether the editor is same-origin, iframe, popup, or a shared module;
- authentication/authorization expectations, if any, for the real host only;
- browser support and accessibility acceptance matrix.

## Required host flow

The real host must be able to:

1. create a BEND source or receive a `.bendpkg`;
2. request a rendered video and poster plus explicit metadata;
3. place the video inside 1:1, 4:5, and 9:16 compositions;
4. request a still at a chosen timestamp;
5. reopen the editable source without depending on BEND's IndexedDB or Blob URLs;
6. receive a new rendered revision after editing;
7. preserve host transform, opacity, stacking, timeline offset, playback policy, audio policy, and unrelated foreground layers;
8. cancel without replacing the committed revision;
9. save/reload and clean old or abandoned media revisions.

## API boundary

Start from `BendIntegrationAdapter` and `BendHostLayer` in this repository. Keep BEND-owned data inside the editable package and keep host-owned placement outside it. The host should cache artifacts by `sourceProjectId + sourceVersion`, never by filename alone. A stale rendered revision must not be shown as the current source.

The host must not import BEND's internal React components, Pixi renderer, Zustand store, or IndexedDB storage as its integration API. If a shared-module approach is selected, expose only the adapter/contract surface and retain the source package as the durable fallback.

## If cross-origin isolation is selected

Implement a versioned typed bridge with:

- exact origin allowlists in both directions;
- exact `event.source`/window validation;
- explicit `hello`/`ready` handshake;
- request ids and runtime payload validation;
- `open`, `export-video`, `export-still`, `export-source`, `progress`, `complete`, `cancel`, `error`, and `dispose` messages;
- timeouts, cancellation, editor-close recovery, and stale-request rejection;
- archive or structured-clone binary transfer, never temporary object URLs;
- negative tests for wildcard origins, wrong sender windows, malformed payloads, incompatible versions, and replayed request ids.

No cross-origin bridge should ship without a real deployed host/origin pair and a browser test that exercises the actual boundary.

## Storage and failure requirements

The real host must define who owns each rendered video, poster, package, and obsolete revision. Failed writes must clean partial artifacts. Failed saves must leave the previous committed layer usable. User-visible recovery must retain the editable source or offer a portable package. Quota, missing media, invalid package, cancelled export, and renderer failure need explicit states.

## Exit criteria

Phase 6B is complete only when the real group app passes:

- fresh-context source/package import;
- rendered video playback and independent media validation;
- still output at an explicit timestamp;
- round-trip edit with preserved host placement and foreground layers;
- cancel and stale-revision tests;
- audio/policy tests with a real source-audio fixture;
- save/reload and abandoned-artifact cleanup;
- accessibility and supported-browser checks;
- exact-origin bridge security tests if applicable.
