# Integration Architecture — Studio 2.0

**Phase 3 status:** Image, Vector, Type (Library + Custom), Shapes and Generate are integrated. Shapes runs as its own React 18/Three.js bundle behind the scoped iframe transport with a versioned 3D source document and transparent offscreen rendering. Generate runs as a derived integration page over the byte-identical legacy generator, receives real Studio layers, applies reversible host layouts and publishes versioned generated-background layers. BEND remains the preserved Phase 4 baseline.

Phase 0 defined these boundaries; this document remains the target architecture. Implementation details for Vector are in [VECTOR_ADAPTER.md](VECTOR_ADAPTER.md), Image in [IMAGE_ADAPTER.md](IMAGE_ADAPTER.md), Typography in [TYPOGRAPHY_ADAPTER.md](TYPOGRAPHY_ADAPTER.md), Shapes in [SHAPES_ADAPTER.md](SHAPES_ADAPTER.md) and Generate in [GENERATE_ADAPTER.md](GENERATE_ADAPTER.md).

## 1. Product principle

**One project. One canvas system. One layer stack. All original creative capabilities preserved.**

The host owns composition; each tool remains the authority for its own editing model. Tools can publish rendered assets and editable source state. The host stores both, composes rendered output, and can reopen source state in its originating tool.

## 2. Authority boundaries

| Concern | Authority | Persistence |
| --- | --- | --- |
| Project name, schema version, global format, artboards | Studio host | Project store (future) + IndexedDB |
| Layer stack, ordering, visibility, transforms, blend/opacity | Studio host | Project store |
| Final composition and multi-layer export | Studio host | Export pipeline (future) |
| Binary source media and rendered assets | Studio host | IndexedDB, referenced by project JSON |
| Editor document/source state (image settings, SVG generator state, 3D scene, type motif, BEND timeline) | Originating tool | Tool-specific serialized blob, referenced from the layer |
| Specialized export (SVG, OTF, PNG, `.bendpkg`, video) | Originating tool | Returned to host and/or direct download |

The host never mutates a tool's internal document model. It may update presentation-level layer fields (position, scale, opacity, order) while the tool's own source state remains recoverable.

## 3. Shared project model

`packages/contracts/src/project.ts` defines:

- `StudioProject`: ID, name, schema version, global `ProjectFormat`, artboards, layers, assets, normalized layer order and metadata.
- `Artboard`: dimensions, background and authoritative bottom-to-top `layerOrder`.
- `ProjectMetadata`: timestamps, app version, tags, notes and `SourceProjectReference` provenance for every imported baseline.
- `StudioGlobalContext`: the narrow context passed to tools (project identity, format, artboards, active artboard, theme).

Artboard dimensions normally mirror the global target. The host is authoritative for the final composition format; tools receive their active artboard and must not silently change the project format.

## 4. Shared layer model

`packages/contracts/src/layer.ts` defines `SharedLayer` with:

- Stable layer ID, name, kind, source tool and artboard assignment.
- `sourceState`: reference to tool-specific editable state.
- `rendered`: rendered asset reference (image/SVG/video/audio).
- Transform (position, size, scale, rotation, anchor, flips), visibility, lock, opacity, blend mode, mask, clipping.
- Normalized `order` plus the artboard's `layerOrder`.
- `TemporalMetadata` for video/audio/animated layers, including an optional BEND sequence link.

Layers are references to assets and source state, never embedded binaries. `rendered` may be null until a tool returns output. Source state remains tool-versioned via `ToolSourceStateReference.toolStateVersion`.

## 5. Tool adapter and transport

`packages/contracts/src/adapter.ts` defines `ToolAdapterV1`:

```text
initialize → open → receive global context → receive input assets
→ restore tool source state → render → return source state
→ report capabilities/issues → cancel → close
```

Capability reporting explicitly includes limitations and runtime requirements (secure context, IndexedDB, WebCodecs, WebGL, network origins). Errors use typed `ToolIssue` values. Renders carry bytes plus a `RenderedAssetReference`; source state is opaque to the host.

`packages/contracts/src/messaging.ts` defines the iframe/bridge protocol:

- Scoped by `projectId`, `sessionId`, `toolId`, `channelId`.
- Exact `hostOrigin`/`toolOrigin` matching; no wildcard trust and no null-origin acceptance.
- One request ID per operation, explicit timeout, abort/cancel and typed transport errors.
- Host→tool requests, tool→host responses and tool events (`ready`, `dirty`, `progress`, `issue`, `selection`).
- Protocol version `1.0.0` independent of a tool's own state version.

The contract supports both isolated iframes and React-hosted sub-apps. Phase 0 does not implement message validation; Phase 1 must do it in one shared transport module and test origin mismatch, scope mismatch, timeout and cancellation.

## 6. Binary asset strategy

Project JSON stores locators:

- Default: IndexedDB (`StorageLocator.backend = "indexeddb"`).
- Inline data is allowed only for transient adapter transfer/tests, not durable project storage.
- External URLs must be ingested if the project needs to be portable.

The eventual asset store needs content hashes, deduplication, missing-asset handling and cleanup that respects undo and all saved projects (BEND already demonstrates this pattern in `tools/bend/src/storage/indexedDb.ts`).

## 7. Runtime isolation decisions

| Tool | Runtime decision | Reason |
| --- | --- | --- |
| Image | Isolated iframe + injected bridge | Static legacy page; no build system; same-origin canvas capture possible |
| Vector | Isolated iframe + injected bridge | Static page; native SVG output is the cleanest first compositable asset |
| Generate | Isolated iframe + injected bridge | Static page; consumes host-provided text/image/vector/shapes layers; derived page keeps the original rule engine |
| Typography | Isolated iframe | Static pages; font assets and canvas state are page-local |
| Shapes | Isolated iframe + runtime bridge | React 18/R3F 8 must not share a runtime with React 19; WebGL and global CSS require isolation. The bundle is built separately and served at `/tools/shapes/` |
| BEND | Isolated iframe + dedicated bridge | React 19/Pixi/Mediabunny timeline engine; whole-project source state and temporal rendering |

Do **not** render Shapes as a React subtree of the React 19 host. If a future build adopts one React version everywhere, this decision can be revisited with a compatibility spike, but not by hoisting two React majors into one tree.

## 8. Tool-specific integration notes

### Image
- Render: current canvas at 1080-long-edge export resolution; current shell capture is only 600×750/480×853 preview resolution. The future adapter must use the export render path, not the shell's low-res capture.
- Source state: `S` settings can be serialized; the source photo itself is outside `S` and must be stored as an input asset. The layered ZIP exporter already emits `manifest.json`, `source.json` and layer PNGs and is the best starting reference.
- Future: support layered-image import as a composition, not only a flat rendered PNG; map its three-layer document to a nested group or a single image layer in Phase 1.

### Vector
- Render: SVG plus native dimensions. Overlay (`#ovl`) must be excluded.
- Source state: generator parameters `P`, baked object arrays, selection/history are not currently serialized; `Copy JSON` serializes generator state only. A bridge must define which parts of editing state are restorable.
- Future: make SVG output a first-class vector layer; preserve text as an independent editable source or flatten it knowingly. Fonts are not embedded.

### Generate
- Runs as a derived page over the byte-identical `generator.html`; the bridge is injected into the original classic script so the rule engine, presets and creative controls are not reimplemented.
- Studio sends a manifest of visible layers on the active artboard plus downscaled rendered thumbnails. Hidden layers are excluded; locked layers are marked and skipped by Apply.
- The original 100×125 design space is normalized to the actual artboard aspect (`frameHeight = 100 / aspect`). Authored layer aspect ratios are preserved.
- **Apply layout** updates position/width/height/rotation of real unlocked host layers in one undoable commit; source documents are untouched. **Publish background** creates a separate `generated-layout` raster layer plus a versioned Generate source document.
- Source state is `application/vnd.studio.generate+json` `1.0.0`. Reopening restores variants/controls without re-applying them; missing host layers are surfaced with a safe regeneration path.
- Claude mode/spec export remain environment-dependent and keep the original fallback.

### Typography
- Two independent static pages are integrated with two adapter entry points and one shared `ToolSession`/source document mode.
- Bundled fonts resolve from `fonts-data.js`; Custom Type still depends on Google Fonts and vendored opentype.js.
- Source state `1.0.0` stores the complete Library/Custom page state, including the sparse distortion field and motif bytes. Reopen waits for the selected font and restores the exact renderer state.
- Native PNG and OTF exports remain available; font credits and upstream licences are preserved.

### Shapes
- The full React 18/R3F editor is built independently (`tools/shapes`) and served from `/tools/shapes/index.html`; the host copies the built bundle into `dist/tools/shapes/`.
- `tools/shapes/src/studioBridge.ts` implements the scoped adapter, versioned source state and transparent render. The original editor UI and operations remain in the iframe.
- Source schema `application/vnd.studio.shapes+json` `1.0.0` stores objects, stable IDs, meshes/triangles, transforms, colors, deformations, arrays, strokes, shading/lighting, selection/tool preferences, camera, bounded history and the next serial.
- Transparent rendering uses a fresh offscreen WebGL render target, not the interactive canvas. Grid/gizmos/selection/draft strokes are excluded; output is an exact-size RGBA PNG with transparent empty regions.
- Publishing stores the source revision and rendered PNG only after the render validates. Re-entry restores the 3D document, not the PNG; republish preserves host layer ID/transform/order. Shapes → Image and Generate are supported handoffs.

### BEND
- Keep the entire timeline/render engine inside BEND. The host layer is a temporal layer with an optional sequence link and a rendered proxy.
- BEND already defines a host integration contract (`src/integration/contract.ts`), `.bendpkg` packages, source re-entry, revision checks, and rendered video/poster outputs. The Studio bridge should adapt these concepts to `ToolAdapterV1` rather than reimplement them.
- Current BEND host handoff renders **preview-quality** video (max 720 px wide). Decide whether final Studio composition uses BEND's full-quality export or the host's own render at export time.
- `.bendpkg` remains an independent specialized export; the host source-state reference may point to the same package blob or a derived form.

## 9. Target data flow

```text
Tool UI ──render──▶ ToolRenderResult ──▶ host asset store (IndexedDB)
   │                                             │
   └──serialize──▶ ToolSourceStatePayload ──▶ source-state blob
                                                 │
Host project (format/artboards/layers) ◀─────────┘
   │
   └── final composition export (future compositor)
```

Input flow:

```text
Host project + active artboard + selected input assets
        │
        ▼
Tool adapter open / receiveGlobalContext / receiveInputAssets / restoreSourceState
        │
        ▼
Preserved editor (iframe or React-hosted)
```

Editing source never overwrites host truth automatically. The tool reports dirty state; the host decides when to commit a new rendered/source revision as one undoable step.

## 10. Composition and export boundary

- The host composes rendered assets in layer order; it does not re-run editor internals.
- Shapes publishes transparent pixels while retaining its 3D source document.
- BEND publishes a temporal rendered proxy/stream or exported file; the host does not interpret BEND's internal effect graph.
- Specialized exports remain available through each tool: SVG, PNG, OTF, layered ZIP, video, `.bendpkg`.
- Final multi-layer export is Phase 1+; Phase 0 only reserves the format/layer/temporal fields needed for it.

## 11. Explicit non-goals for Phase 0

- No compositor or canvas renderer.
- No IndexedDB repository, adapter runtime, messaging implementation or schema migration code.
- No edits to preserved tool source beyond README/notice preservation and the host app.
- No deployment, public exposure or changes to upstream repositories/Vercel.
- No claim of feature parity from copying source alone.

## 12. Phase 1–3 implementation map

| Architecture area | Implemented location |
| --- | --- |
| Project state, ordering, history | `apps/studio/src/state/projectStore.ts` |
| Project autosave/hydration | `apps/studio/src/state/useProjectPersistence.ts` |
| Project persistence + schema validation | `apps/studio/src/storage/projectRepository.ts` |
| Asset/source-state persistence + integrity | `apps/studio/src/storage/assetRepository.ts` |
| Object URL lifecycle | `apps/studio/src/storage/objectUrls.ts` |
| Iframe transport + origin/sender/scope validation | `apps/studio/src/adapters/iframe/` |
| Reusable tool session | `apps/studio/src/adapters/session/toolSession.tsx` |
| Vector editor wrapper and bridge | Vite plugin in `apps/studio/vite.config.ts`, `apps/studio/src/adapters/vector/vectorBridge.js` |
| Vector capture/update/sanitization | `apps/studio/src/adapters/vector/` |
| Image editor wrapper, source state, capture and bridge | `apps/studio/src/adapters/image/`, `components/ImageEditor.tsx` |
| Type Library / Custom Type derived scripts, source state and capture | `apps/studio/src/adapters/typography/`, `components/TypeEditor.tsx` |
| Shapes independently built runtime | `tools/shapes/`, served at `/tools/shapes/` and copied into `dist/tools/shapes/` by `apps/studio/vite.config.ts` |
| Shapes source schema + offscreen render | `tools/shapes/src/editor/sourceState.ts`, `renderScene.ts`, `studioBridge.ts` |
| Shapes host capture/validation | `apps/studio/src/adapters/shapes/`, `components/ShapesEditor.tsx` |
| Generate derived page + bridge | `apps/studio/src/adapters/generate/generateBridge.js`, `apps/studio/vite.config.ts` |
| Generate host inputs, background capture and state schema | `apps/studio/src/adapters/generate/`, `components/GenerateEditor.tsx` |
| Reversible host layout application | `projectStore.applyGeneratedLayout`, `GenerateEditor.tsx` |
| Raster host rendering + object URLs | `components/CanvasWorkspace.tsx`, `storage/objectUrls.ts` |
| Cross-tool inputs/provenance | `adapters/session/inputAssets.ts`, `adapters/session/layerFactory.ts`, `SharedLayer.provenance` |
| Working canvas/layers/inspector | `apps/studio/src/components/` |

**Deviations from the Phase 0 design:** the contract extension remains
`ToolSourceStateReference.revision` plus optional content hashes on source/rendered
references. Shapes is built and served as its own bundle rather than injected into a
static page. Generate's decorative output uses a deterministic Canvas2D rasterizer
instead of a DOM screenshot because Chromium taints `foreignObject` canvas readback.
Tools still run same-origin in development/deployment; the transport already requires
exact origins and can move to a dedicated tool origin later.

**Still absent by design:** final composition export, asset garbage collection,
multi-artboard host UI, BEND integration, carousel export, persistent host undo,
generated z-order application, and dedicated production tool origins.
