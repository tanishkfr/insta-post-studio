# Studio 2.0

**One project. One canvas. One layer stack. All original creative capabilities preserved.**

Studio 2.0 is a unified Instagram creative toolset built around preserved standalone editors. Phase 0 imported and pinned six original capabilities. **Phase 1 makes Vector the first fully integrated tool**: create artwork in the complete preserved editor, publish it as a studio layer, save the project locally, reopen the original source, revise it, and keep the host composition intact.

The other five tools remain preserved but are intentionally not integrated yet. They are marked **Soon** in the host.

## What works in Phase 1

- A persistent Studio project with 4:5, 1:1 and 9:16 formats.
- Local-first IndexedDB project and binary asset storage.
- A working SVG layer canvas with direct move/resize, rotation, opacity and visibility.
- Layer rename, reorder, hide, lock, duplicate, delete and source editing.
- Undo/redo for committed host actions.
- Secure, versioned iframe adapter transport.
- Full Vector source re-entry:
  - generator parameters, seed, colours, presets and text
  - baked/manual geometry and object transforms
  - native undo/redo stacks and selection/view state
- A polished Vector session inside Studio with the original tool controls preserved.
- SVG publication with overlay removal, native viewBox and sanitization.
- Republish updates the same layer while preserving host transform, opacity, visibility, lock, artboard and stacking order.

No final multi-layer composition export exists yet.

## Quick start

Requirements: Node.js 20.19+ and npm 10+.

```bash
npm install
npm run dev          # Studio host at http://localhost:5173
```

Verify:

```bash
npm run verify       # contracts typecheck + host build + unit tests
npm run test:browser # 12 Chromium acceptance tests (starts host + fake + legacy servers)
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
│  ├─ src/adapters/      secure iframe transport + Vector bridge
│  ├─ src/components/    canvas, layers, inspector, Vector session
│  └─ tests/browser/     Playwright acceptance + fake cross-origin adapter
├─ packages/contracts/   shared project/layer/adapter/messaging types
├─ tools/
│  ├─ legacy/            preserved Image, Vector and Generate sources
│  ├─ shapes/            preserved React 18 + Three.js editor
│  ├─ typography/        preserved static Type Library + Custom Type
│  └─ bend/              preserved React 19 video editor (Phase 8.1.1 baseline)
├─ docs/                 reports, feature matrix, architecture, evidence
├─ scripts/serve-static.mjs
└─ .github/workflows/    host/unit/browser CI + manual tool checks
```

`apps/studio` and `packages/contracts` are the only npm workspaces. Tools are intentionally **not** workspaces: Shapes uses React 18 and BEND uses React 19, so each keeps its own lockfile, `node_modules`, build and test runtime.

## Preserved tools

| Tool | Source | Standalone entry | Integrated? |
| --- | --- | --- | --- |
| Vector | Insta-post `arnav.html` | `tools/legacy/vector/arnav.html` | **Yes — Phase 1** |
| Image | Insta-post `janya.html` | `tools/legacy/image/janya.html` | Preserved; later phase |
| Generate | Insta-post `generator.html` | `tools/legacy/generate/generator.html` | Preserved; later phase |
| Combined legacy shell | Insta-post `index.html` | `tools/legacy/upstream/index.html` | Preserved; not a Studio foundation |
| Type | Online-Type-Tool | `tools/typography/index.html` | Preserved; later phase |
| Shapes | shapes | `tools/shapes/index.html` | Preserved; later phase |
| BEND | Bend (private) | `tools/bend/index.html` | Preserved; later phase |

Run static tools with `npm run serve:legacy` (port 4173) or `npm run serve:typography` (4174). Shapes/BEND retain their own dev servers as listed above.

The legacy `build.py` references `src/...` paths that do not exist in the pinned repository. The checked-in `upstream/index.html` is the prebuilt combined app and is preserved as-is. Studio 2.0 does not use that old builder. See [tools/legacy/README.md](tools/legacy/README.md).

## Vector integration

- Original `tools/legacy/vector/arnav.html` is byte-for-byte unchanged (hash-guarded).
- Studio generates `/tools/vector/adapter.html` from that file at dev/build time and injects a thin bridge inside the original boot script.
- The bridge captures and restores the editor's real document state, not the limited `Copy JSON` output.
- The host validates source and render assets, sanitizes SVG, writes both blobs, verifies them, then commits the layer.
- Files and flow: [docs/VECTOR_ADAPTER.md](docs/VECTOR_ADAPTER.md).

## Architecture

- The host project is authoritative for format, artboards, layer ordering, presentation transforms and future composition export.
- Each tool owns its specialized editable source state.
- Binary/source blobs live in IndexedDB; project JSON stores locators and hashes only.
- `ToolAdapterV1` supports isolated iframe runtimes (currently used) and React-hosted sub-apps.
- Messaging is scoped by project/session/tool/channel with exact origin and sender validation, request IDs, protocol checks, timeouts, cancellation and stale-response rejection.
- BEND will keep its own timeline/render engine behind a dedicated bridge.
- Shapes stays isolated from the React 19 runtime.

Read [docs/INTEGRATION_ARCHITECTURE.md](docs/INTEGRATION_ARCHITECTURE.md) and [packages/contracts/src/index.ts](packages/contracts/src/index.ts).

## Source preservation

All upstream repositories are pinned by commit in [docs/SOURCE_MANIFEST.md](docs/SOURCE_MANIFEST.md). Original source files, assets, tests, lockfiles, attribution and notices are retained. Generated folders (`node_modules`, `dist`, `output`, test reports) are excluded.

React 18 (Shapes) and React 19 (Studio host, BEND) are never combined into one runtime.

## Documentation

- [Phase 1 report](docs/PHASE_1_REPORT.md)
- [Phase 1 test report](docs/PHASE_1_TEST_REPORT.md)
- [Vector adapter](docs/VECTOR_ADAPTER.md)
- [Feature parity matrix](docs/FEATURE_PARITY_MATRIX.md)
- [Source manifest](docs/SOURCE_MANIFEST.md)
- [Integration architecture](docs/INTEGRATION_ARCHITECTURE.md)
- [Phase 0 report](docs/PHASE_0_REPORT.md)
- [Third-party notices](THIRD_PARTY_NOTICES.md)

## Repository status

Private Phase 1 baseline on `phase-1/shared-foundation`. Nothing is deployed publicly. Do not push to teammates' original repositories or touch BEND's production Vercel project.
