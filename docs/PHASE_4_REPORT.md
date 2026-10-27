# Studio 2.0 — Phase 4 Report

**Date:** 2026-10-27  
**Branch:** `phase-4/bend-integration`  
**Base:** `phase-3/shapes-generate` @ `3383e6af6e0336c972cb5588be6426ee460df73e`  
**BEND baseline:** `tanishkfr/Bend`, `polish/phase-8.1.1-ui` @ `7f2d69c272d2a4607ff45f2575c650ac3b6cfb43`

## A. Verdict

**PASS for the Phase 4 scope**, with the limitations in section K.

Verified end-to-end:

- the complete preserved BEND editor opens inside Studio from `/tools/bend/`;
- the real timeline, generators, temporal effects, audio and export engine remain available;
- a BEND project publishes a decodable video, full-canvas PNG cover and complete editable
  `.bendpkg` as **one** Studio video layer;
- the layer, source package and timeline survive Studio save/reload and re-entry;
- republishing keeps the same layer ID, transform, opacity, visibility, artboard and stacking;
- static Studio artwork genuinely enters BEND as an editable video clip and publishes a
  derivative motion layer without changing the source layers;
- native BEND exports and package restoration remain intact;
- all five prior tools retain their workflows and native exports.

This is not a claim that every BEND control combination was exhaustively executed. The
non-exhaustive areas are named in section K.

## B. Git branch, final SHA and CI

| Item | Value |
| --- | --- |
| Repository | `https://github.com/tanishkfr/insta-post-studio` (private) |
| Branch | `phase-4/bend-integration` |
| Base | `3383e6af6e0336c972cb5588be6426ee460df73e` |
| Implementation head | `3450c57` — tested code (BEND FPS truthfulness fix) |
| Final head | The docs-only head SHA and its CI run are recorded in the delivery response. |
| CI | [run 40407321502](https://github.com/tanishkfr/insta-post-studio/actions/runs/40407321502) — **success** (contracts/build/67 unit + 54 Chromium browser) |

No merge into Phase 3/default, no public Studio deployment, no changes to upstream BEND or
its Vercel deployment.

## C. Preserved BEND runtime and full feature access

- BEND remains a separate React 19/PixiJS/Mediabunny dependency tree built by Vite.
- Studio serves `/tools/bend/` in development and copies the hashed bundle into
  `apps/studio/dist/tools/bend/` in production.
- `BEND_BASE` gives the integrated build a nested base without changing standalone
  `npm --prefix tools/bend run build`.
- `App.tsx` routing is base-aware in both standalone and nested builds.
- The real `EditorPage` is mounted in the iframe; Studio does not replace the timeline.
- Preserved capabilities include source import, media/project libraries, V1/M1 editing,
  trim/split/reorder/ripple/delete, speed/reverse/freeze/ramps, generators, temporal effect
  stacking, transitions, keyframes/modulators, masks/crop/transform/color/blend, audio and
  ducking, history/recovery, native still/video export and `.bendpkg` source packages.
- BEND browser gate from the preserved source: **35 passed, 3 skipped** (Chromium + Firefox;
  Firefox video-export tests are skipped by the upstream configuration).

## D. Video/poster/package publication

- The original BEND exporter runs in the iframe.
- Preview uses the 720 px review path; final uses the full canvas. A preview is never
  upsampled or labelled final.
- Video, cover PNG and `.bendpkg` are returned as same-origin object URLs with SHA-256 and
  byte length, not as one unbounded `postMessage` allocation.
- The host verifies size/hash, MP4/WebM container magic, actual browser decodability,
  dimensions/duration, PNG signature/dimensions and archive completeness/media hashes before
  storing or committing.
- Audio inclusion/status is reported from BEND's validated export metadata.
- Tested Chromium path produced MP4/H.264; preview was 720×720, final 1080×1080, poster
  1080×1080 for a 1:1 artboard.

## E. Editable source round-trip

- Source schema `application/vnd.studio.bend+json` `1.0.0` references the package asset ID,
  package format/version, BEND project ID, source revision, package hash/bytes, packaged
  media integrity, canvas/fps/duration/aspect, video/audio/poster metadata and host context.
- The package contains the real source media, not clip metadata only.
- Re-entry validates package and media, restores into a temporary `bend-studio-` project,
  reuses content-identical media, and removes only Studio-owned temporary projects.
- Republish keeps layer ID/transform/opacity/visibility/artboard/order and advances source
  revision. Cross-tab/durable revision checks reject stale updates.
- Cancel, corrupt package, render failure and storage failure preserve the prior committed
  layer assets.

## F. Static artwork → BEND handoff

- **Animate in BEND** is available from any selected static layer and from the composition
  header.
- Studio rasterizes at the exact artboard dimensions with host transform, opacity, flips,
  rotation, blend/order, masks where present, and an explicit background.
- The PNG is encoded locally to a real MP4/WebM clip, imported into BEND's existing media
  pipeline and opened in the native timeline as a normal video clip.
- Original source layers are unchanged; provenance and source revisions are recorded.
- Alpha is not claimed. The dialog requires a deliberate artboard/white/black background.
- Browser acceptance used a real published Vector layer, confirmed one video asset and one
  video layer in BEND's local project, edited it, and published a derivative Studio video
  layer.

## G. Host temporal-layer behavior

- Published BEND layers use `kind: "video"`, `sourceTool: "bend"`, a poster and temporal
  metadata.
- Static composition shows the cover frame.
- Explicit Play shows the playable video; only one temporal layer can play at a time.
- Preview audio is muted by default and can be enabled for the single active video.
- Duration/fps/container/codec/audio/preview status are exposed in the inspector.
- Loop/hold/once playback, Edit in BEND, Download video and Download `.bendpkg` are exposed.
- Host transform/opacity/visibility/blend/mask/stacking remain independent.
- Synchronized multi-video/audio composition is out of scope.

## H. Codec, audio and export validation

- Actual video bytes were MP4/H.264 (`ftyp`) in tested Chromium and decoded/played in the host.
- Preview dimensions were ≤720 px wide; final matched the composition canvas.
- Poster PNG signature/dimensions were verified.
- Package archive magic/manifest/version/completeness/entry hashes/media references were
  independently parsed by the host.
- Audio fixture + soundtrack test reported `audioPresent: true`, packaged both video and audio
  media, and produced a 2.005 s decodable video.
- Firefox capability output reported WebM/VP8 available and MP4/H.264 unavailable; the bridge
  reports codec limitations honestly rather than claiming MP4.
- Safari/WebKit was not verified.

## I. Cross-tool regressions

`npm run test:browser` retained Image, Vector, Type, Shapes and Generate workflows and native
exports. The only initial failure was the old smoke expectation that BEND remained disabled;
it was updated because BEND is now live. No cross-tool workflow or native export was removed.

## J. Browser tests and evidence

Commands and exact counts are in [PHASE_4_TEST_REPORT.md](PHASE_4_TEST_REPORT.md).

Screenshots in `docs/evidence/phase-4/`:

- `01-production-nested-route.png` — production build, nested route, published video layer
- `02-bend-editor-timeline.png` — complete BEND UI with procedural layer/effect/timeline
- `03-published-video-layer.png` — cover + playable host layer
- `04-source-reentry.png` — restored native timeline/effects
- `05-same-layer-update.png` — same layer updated after republish
- `06-static-handoff-dialog.png` — explicit static-to-motion choices
- `07-static-handoff-timeline.png` — real imported clip in BEND
- `08-static-derivative.png` — derivative host video layer
- `09-audio-layer.png` — published audio-capable layer
- `10-failure-recovery.png` — corrupt package blocked, prior layer preserved
- `11-stale-revision-rejected.png` — stale update rejected
- `12-format-fit-decision.png` — explicit aspect fit decision

Machine-readable acceptance also asserts video bytes/container, video dimensions/duration,
current playback time, source state revisions, package manifest/media, source-layer hashes and
stale/cancel preservation.

## K. Remaining limitations

1. Not every BEND control combination was executed. The complete source and UI remain
   available, but keyframe/modulator variants, every generator preset, every transition,
   masks/ducking combinations and some pointer gestures are source-tested rather than each
   browser-executed.
2. Video export is Chromium/Chromium-based first. Firefox WebM support exists; Safari/WebKit
   is unverified. Codec availability is reported honestly.
3. Studio previews one BEND temporal layer at a time; synchronized multi-video/audio
   composition is deferred.
4. Static-to-motion encodes a flat clip; alpha is not preserved and the user chooses a
   background. Motion inside BEND starts from that clip.
5. Final multi-layer Studio composition export, carousel export, asset GC and persistent host
   undo remain deferred.
6. Failed publishes can leave content-deduplicated, unreferenced Studio asset records; there
   is no GC in this phase. They are not duplicated binaries, and prior layers remain intact.
7. The bridge runs same-origin; the transport is exact-origin ready for a dedicated tool
   origin later.
8. Chromium-only Studio acceptance; no Firefox/WebKit Studio E2E or axe audit.
9. BEND's standalone browser tests cover the preserved product; the new Studio bridge is
   covered by Studio Playwright acceptance and unit tests, not by a dedicated BEND source
   test suite.

## L. Exact Phase 5 starting point

- Branch: `phase-4/bend-integration` at the final SHA in section B.
- Preserve `phase-4/bend-integration`; do not merge Phase 5A.
- BEND remains pinned at the unchanged upstream commit; do not modify the upstream repository
  or its Vercel deployment.
- Start Phase 5B from the completed Phase 4 branch, then integrate Terra's additive UI files.
- Re-run the Phase 4 gate after UI integration: root installs, `tool:bend:*`, `verify`,
  `test:browser`, production BEND route test, and the retained Phase 2/3 suites.

## PHASE 5B UI INTEGRATION HANDOFF

### Final Studio navigation structure

- `ToolRail`: Canvas + six live tools in order Image, Vector, Type, Shapes, BEND, Generate.
- Canvas header: Generate layouts, Animate composition, Add video.
- Side panel: LayersPanel + InspectorPanel.
- Active tool replaces the canvas area with the tool session shell; the complete editor stays
  inside the tool iframe.

### Components modified for BEND

- `apps/studio/src/App.tsx` — tool routing, publish commit, stale guards, static handoff state.
- `apps/studio/src/components/BendEditor.tsx` — BEND session wrapper, quality control, source
  package verification, fit gate, handoff input.
- `apps/studio/src/components/AnimateInBendDialog.tsx` — static-to-motion UI.
- `apps/studio/src/components/CanvasWorkspace.tsx` — video cover/playback controls, composition
  handoff and Add video.
- `apps/studio/src/components/InspectorPanel.tsx` — BEND metadata/quality/audio/playback,
  download video/package, Animate in BEND.
- `apps/studio/src/components/ToolRail.tsx`, `LayersPanel.tsx`, `defaultProject.ts` — BEND live.
- `apps/studio/src/styles.css` — BEND temporal/handoff styles (append-only section).

Phase 5B must preserve these functional callbacks; new UI can wrap them but should not
reimplement BEND internals or bypass the commit/validation path.

### New video-layer presentation and controls

- `SharedLayer.poster` (PNG cover) + `rendered` (video).
- `TemporalMetadata`: `playback`, `audio`, `preview`, `container`, `codec`, `audioPresent`,
  `audioMessage`, plus existing duration/fps.
- Canvas: cover by default; explicit Play; single-player policy; mute/sound toggle; preview badge.
- Inspector: duration/fps/output/codec/source aspect/audio, playback policy, preview audio,
  download video, download package.
- Actions are exposed through stable `SharedLayer` data and project-store updates
  (`updateLayer` with `temporal`), so Phase 5B can reskin without touching BEND.

### BEND entry/exit callbacks

- Open new: `openNewTool("bend")` → `BendEditor` with `layer=null`, `handoff=null`.
- Edit existing: `openExistingTool(layerId)` → `BendEditor` with the layer; the wrapper verifies
  package hash/revision and opens a fit gate if the saved aspect differs.
- Exit: `resetEditingState()` → Canvas; tool cancel closes the iframe and preserves the prior
  committed layer.
- Publish/update: `handlePublish(capture)` in `App.tsx`; BEND passes a revision guard and an
  optional poster/temporal payload through `ToolSessionCapture`.
- Static handoff: `animateInBend(layerId|null)` → `AnimateInBendDialog` →
  `openBendHandoff(handoff)`.
- Video playback: Canvas `BendVideoControls`; mute/playback persist via `updateLayer`.

### Shared contract changes

- `SharedLayer.poster?: RenderedAssetReference | null`.
- `TemporalMetadata` additions listed above.
- BEND publish descriptors (`BendPublishRequest/Result`, video/poster/package artifacts) and
  `bend/publish` + `bend/publish/ack` protocol methods.
- `ToolSessionCapture.poster/posterAsset/temporal/guard`.
- `ToolSessionConfig.openOptions`.
- `LayerArtworkUpdate.poster/temporal`.
- `IframeToolAdapter.publishBend/acknowledgeBendArtifacts/cancelAllPending`.

### Components Phase 5B must preserve/accommodate

- `ToolSession` header/publish/cancel/error/input-warning semantics.
- `BendEditor` source verification/fit gate and quality control.
- `CanvasWorkspace` single-player policy and data-testids.
- `InspectorPanel` BEND actions and metadata.
- `App.handlePublish` stale checks and transactional rollback.
- `createBendVideoLayer` and `applyLayerArtwork` preserving host presentation.
- Do not move BEND Timeline/effects/audio into React 19 host code.

### Exact tests to rerun after UI integration

```text
npm run tool:bend:typecheck
npm run tool:bend:test
npm run tool:bend:build
npm run tool:bend:test:browser
npm run typecheck
npm run verify
npm run test:browser
npm run test:browser:bend:production
```

Plus the BEND-in-Studio spec `apps/studio/tests/browser/bend-integration.spec.ts` and the
production nested-route spec.
