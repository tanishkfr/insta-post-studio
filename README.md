# Studio 2.0

**One project. One canvas. One layer stack. All original creative capabilities preserved.**

Studio 2.0 is a unified Instagram creative toolset built around preserved standalone editors. Phase 0 imported and pinned six original capabilities. Phase 1 made Vector the first fully integrated tool. **Phase 2 adds the complete Image editor, host raster layers, Image → Vector tracing, both Typography modes, and Image → Custom Type.**

Generate, Shapes and BEND remain preserved baselines and are marked **Soon** in the host.

## What works in Phase 2

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
- Image → Custom Type motif handoff.
- Type mode switching that keeps both in-session drafts.
- Image/Vector/Type layers remain separate; host transform, order, visibility and revisions are authoritative.
- Native specialized export controls remain available inside each preserved editor.

No final multi-layer composition export exists yet.

## Quick start

Requirements: Node.js 20.19+ and npm 10+.

```bash
npm install
npm run dev          # Studio host at http://localhost:5173
```

Verify:

```bash
npm run verify       # contracts typecheck + host build + 47 unit/component tests
npm run test:browser # 34 Chromium acceptance tests
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
│  ├─ src/adapters/      secure iframe transport, shared session, Image/Vector/Type adapters
│  ├─ src/components/    canvas, layers, inspector, tool sessions
│  ├─ public/vendor/     vendored JSZip/opentype.js for derived adapter pages
│  └─ tests/browser/     Playwright acceptance + fake cross-origin adapter
├─ packages/contracts/   shared project/layer/adapter/messaging types
├─ tools/
│  ├─ legacy/            preserved Image, Vector and Generate sources
│  ├─ shapes/            preserved React 18 + Three.js editor
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
| Generate | Insta-post `generator.html` | `tools/legacy/generate/generator.html` | Preserved; later phase |
| Shapes | `tools/shapes` | `tools/shapes/index.html` | Preserved; later phase |
| BEND | `tools/bend` | `tools/bend/index.html` | Preserved; later phase |

Original source files are not edited. Studio uses Vite-generated derived adapter pages and same-scope bridge injection. SHA-256 guards fail if a preserved source changes.

## Documentation

- [Integration architecture](docs/INTEGRATION_ARCHITECTURE.md)
- [Image adapter](docs/IMAGE_ADAPTER.md)
- [Typography adapter](docs/TYPOGRAPHY_ADAPTER.md)
- [Phase 2 report](docs/PHASE_2_REPORT.md)
- [Phase 2 test report](docs/PHASE_2_TEST_REPORT.md)
- [Feature parity matrix](docs/FEATURE_PARITY_MATRIX.md)
- [Phase 1 report](docs/PHASE_1_REPORT.md) / [Vector adapter](docs/VECTOR_ADAPTER.md)

This remains a private repository. Upstream licences and font redistribution rights must be resolved before public distribution.
