# Studio 2.0

**One project. One canvas. One layer stack. All original creative capabilities preserved.**

Studio 2.0 is a unified Instagram creative toolset built around preserved standalone editors. Phase 0 imported and pinned six original capabilities. Phase 1 made Vector the first fully integrated tool. **Phase 2 added the complete Image editor, host raster layers, Image → Vector tracing, both Typography modes, and Image → Custom Type. Phase 3 added the complete preserved Shapes 3D editor with versioned source state and transparent rendering, plus Generate as the composition assistant over real Studio layers. Phase 4 adds the complete preserved BEND video editor, verified video/poster/.bendpkg publication, temporal host layers, editable source re-entry, and static-artwork → motion handoff.**

BEND is live as the sixth tool; the complete native timeline/effects/audio/export engine remains inside its isolated runtime.

## What works in Phase 4

- One persistent Studio project with 4:5, 1:1 and 9:16 formats.
- Local-first IndexedDB project and binary asset storage.
- A shared tool-session controller: secure handshake, inputs, source restore, dirty/progress, publish/update/cancel/retry, rollback and cleanup.
- Vector source re-entry and SVG publication (Phase 1, retained).
- Complete preserved Image editor inside Studio:
  - source photo stored separately from the editable settings;
  - full native `S`, effect order, internal layers, painted mask, brush strokes, crop and history;
  - full-resolution PNG publish at the host artboard dimensions;
  - native PNG, layered ZIP and animated GIF exports.
- Host raster layers with alpha, transforms, rotation, opacity, blend, clipping and reorderable mixed stacks.
- Image → Vector tracing through the preserved importer, recorded as a derivative with provenance.
- Type Library with exact font identity, controls and internal distortion-field recovery.
- Custom Type with editable strokes, motif image bytes, placement/layering, letterform/pattern controls, PNG and OTF exports.
- Image → Custom Type motif handoff; Type mode switching keeps both in-session drafts.
- Complete preserved Shapes editor in an isolated React 18/Three.js bundle:
  - primitives, custom/FBX meshes, transforms, face tools, deformation, arrays, mirror/duplicate, strokes, materials/lighting, outliner/inspector and native undo/redo;
  - versioned 3D source document including camera and bounded history;
  - exact-size transparent RGBA render through an offscreen render target;
  - Edit in Shapes source re-entry and republish that preserve host layer identity;
  - Continue in Image for a processed derivative.
- Generate composition assistant over real Image/Vector/Type/Shapes layers:
  - preserved rule engine, layouts, presets, 12 creative controls, seeds, carousel and original asset bin;
  - aspect-aware 4:5/1:1/9:16 coordinates and authored asset aspects;
  - Apply layout as one reversible host action without modifying source documents;
  - generated background/accents/texture published as an independent, reopenable layer.
- Native specialized export controls remain available inside each preserved editor.

No final multi-layer/carousel composition export exists yet.

## Quick start

Requirements: Node.js 20.19+ and npm 10+.

```bash
npm install
npm run dev          # Studio host at http://localhost:5173 (also builds the Shapes bundle)
```

Verify:

```bash
npm run verify       # contracts typecheck + host/Shapes build + 56 unit/component tests
npm run test:browser # 48 Chromium acceptance tests
```

The imported tools have independent dependency trees. Install/build them separately:

```bash
npm run tool:shapes:install && npm run tool:shapes:build && npm run tool:shapes:test
npm run tool:bend:install && npm run tool:bend:verify
```

## Repository layout

```text
insta-post-studio/
├─ apps/studio/          React 19 + TypeScript + Vite host
│  ├─ src/state/         authoritative project store + autosave
│  ├─ src/storage/       IndexedDB project/asset repositories
│  ├─ src/adapters/      secure iframe transport, shared session, Image/Vector/Type/Shapes/Generate adapters
│  ├─ src/components/    canvas, layers, inspector, tool sessions
│  ├─ public/vendor/     vendored JSZip/opentype.js for derived adapter pages
│  └─ tests/browser/     Playwright acceptance + fake cross-origin adapter
├─ packages/contracts/   shared project/layer/adapter/messaging types
├─ tools/
│  ├─ legacy/            preserved Image, Vector and Generate sources
│  ├─ shapes/            independently built React 18 + Three.js editor + Studio adapter
│  ├─ typography/        preserved static Type Library + Custom Type
│  └─ bend/              preserved React 19 video editor (Phase 8.1.1 baseline)
├─ docs/                 reports, adapters, feature matrix, architecture, evidence
├─ scripts/serve-static.mjs
└─ .github/workflows/    host/unit/browser CI + manual tool checks
```

`apps/studio` and `packages/contracts` are the only npm workspaces. Tools are intentionally **not** workspaces: Shapes uses React 18 and BEND uses React 19, so each keeps its own lockfile, `node_modules`, build and test runtime.

## Preserved tools

| Tool | Source | Standalone entry | Integrated? |
| --- | --- | --- | --- |
| Image | Insta-post `janya.html` | `tools/legacy/image/janya.html` | **Yes — Phase 2** |
| Vector | Insta-post `arnav.html` | `tools/legacy/vector/arnav.html` | **Yes — Phase 1/2** |
| Type | Online-Type-Tool `fonts.html` / `custom.html` | `tools/typography/` | **Yes — Phase 2** |
| Generate | Insta-post `generator.html` | `tools/legacy/generate/generator.html` | **Yes — Phase 3** (derived page; source byte-identical) |
| Shapes | `tools/shapes` | `tools/shapes/index.html` | **Yes — Phase 3** (upstream pinned; adapter code added) |
| BEND | `tools/bend` | `tools/bend/index.html` | **Yes - Phase 4** (upstream pinned; adapter/bridge added) |

Legacy Image/Vector/Generate pages remain byte-identical and are served through Vite-generated derived adapter pages. Shapes is the one imported app intentionally extended in Phase 3; its upstream commit remains pinned and the original editor UI/operations are preserved. SHA-256 guards continue to protect the byte-identical legacy sources.

## Documentation

- [Integration architecture](docs/INTEGRATION_ARCHITECTURE.md)
- [Image adapter](docs/IMAGE_ADAPTER.md)
- [Typography adapter](docs/TYPOGRAPHY_ADAPTER.md)
- [Shapes adapter](docs/SHAPES_ADAPTER.md)
- [Generate adapter](docs/GENERATE_ADAPTER.md)
- [Phase 3 report](docs/PHASE_3_REPORT.md)
- [Phase 3 test report](docs/PHASE_3_TEST_REPORT.md)
- [Phase 4 report](docs/PHASE_4_REPORT.md) / [test report](docs/PHASE_4_TEST_REPORT.md)
- [BEND adapter](docs/BEND_ADAPTER.md) / [video handoff](docs/VIDEO_HANDOFF.md)
- [Phase 2 report](docs/PHASE_2_REPORT.md) / [test report](docs/PHASE_2_TEST_REPORT.md)
- [Feature parity matrix](docs/FEATURE_PARITY_MATRIX.md)
- [Phase 1 report](docs/PHASE_1_REPORT.md) / [Vector adapter](docs/VECTOR_ADAPTER.md)

The GitHub repository is public. Upstream licences and font redistribution rights remain unresolved and must be settled before further public distribution or release.
