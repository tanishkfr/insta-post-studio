# Studio 2.0

**One project. One canvas. One layer stack. All original creative capabilities preserved.**

Studio 2.0 is the foundation for a unified Instagram creative toolset. Phase 0 imports and preserves six editing capabilities as frozen baselines, defines the shared contracts, and ships a clean host shell. It does **not** integrate the editors yet.

## Quick start

Requirements: Node.js 20.19+ and npm 10+.

```bash
npm install
npm run dev          # Studio host at http://localhost:5173
```

Verify the host and contracts:

```bash
npm run verify       # contracts typecheck + host typecheck/build + unit tests
npm run test:browser # Playwright host smoke test
```

The imported tools have independent dependency trees. Install/build them separately:

```bash
npm run tool:shapes:install && npm run tool:shapes:build && npm run tool:shapes:test
npm run tool:bend:install && npm run tool:bend:verify
```

## Repository layout

```text
insta-post-studio/
├─ apps/studio/          React 19 + TypeScript + Vite host shell
├─ packages/contracts/   Type-only shared project/layer/adapter contracts
├─ tools/
│  ├─ legacy/            Preserved Image, Vector and Generate sources
│  ├─ shapes/            Preserved React 18 + Three.js editor
│  ├─ typography/        Preserved static Type Library + Custom Type
│  └─ bend/              Preserved React 19 video editor (Phase 8.1.1 baseline)
├─ docs/                 Phase 0 evidence, feature matrix and architecture
├─ scripts/serve-static.mjs
└─ .github/workflows/    Host CI + separate manual tool checks
```

`apps/studio` and `packages/contracts` are the only npm workspaces. Tools are intentionally **not** workspaces: Shapes uses React 18 and BEND uses React 19, so each keeps its own lockfile, `node_modules`, build and test runtime.

## Preserved tools

| Tool | Source | Standalone entry | Run |
| --- | --- | --- | --- |
| Image | Insta-post `janya.html` | `tools/legacy/image/janya.html` | `npm run serve:legacy` → `/image/janya.html` |
| Vector | Insta-post `arnav.html` | `tools/legacy/vector/arnav.html` | `npm run serve:legacy` → `/vector/arnav.html` |
| Generate | Insta-post `generator.html` | `tools/legacy/generate/generator.html` | `npm run serve:legacy` → `/generate/generator.html` |
| Combined legacy shell | Insta-post `index.html` | `tools/legacy/upstream/index.html` | `npm run serve:legacy` → `/upstream/` |
| Type | Online-Type-Tool | `tools/typography/index.html` | `npm run serve:typography` |
| Shapes | shapes | `tools/shapes/index.html` | `npm run tool:shapes:dev` |
| BEND | Bend (private) | `tools/bend/index.html` | `npm run tool:bend:dev` |

The legacy `build.py` references `src/...` paths that do not exist in the pinned repository. The checked-in `upstream/index.html` is the prebuilt combined app and is preserved as-is. Studio 2.0 does not use that old builder as its foundation. See [tools/legacy/README.md](tools/legacy/README.md).

## Source preservation

All upstream repositories are pinned by commit in [docs/SOURCE_MANIFEST.md](docs/SOURCE_MANIFEST.md). Original source files, assets, tests, tool lockfiles, attribution and third-party notices are retained. Generated folders (`node_modules`, `dist`, `output`, test reports) are excluded.

React 18 (Shapes) and React 19 (Studio host, BEND) are never combined into one runtime. Future integration must load Shapes in an isolated runtime.

## Shared architecture

- The host project is authoritative for format, artboards, layer ordering and final composition export.
- Tool-specific editable state remains owned by each tool.
- Binary assets will live in IndexedDB; project JSON stores locators only.
- `ToolAdapterV1` supports isolated iframe runtimes and React-hosted sub-apps.
- Cross-origin messaging is scoped by project/session/tool/channel with exact-origin validation, request IDs, timeouts and typed errors.
- BEND keeps its own timeline/render engine behind a dedicated bridge.

Start with [docs/INTEGRATION_ARCHITECTURE.md](docs/INTEGRATION_ARCHITECTURE.md) and [packages/contracts/src/index.ts](packages/contracts/src/index.ts). Phase 0 defines contracts only; no compositor or asset database is implemented yet.

## Documentation

- [Phase 0 report](docs/PHASE_0_REPORT.md)
- [Feature parity matrix](docs/FEATURE_PARITY_MATRIX.md)
- [Source manifest](docs/SOURCE_MANIFEST.md)
- [Integration architecture](docs/INTEGRATION_ARCHITECTURE.md)
- [Phase 1 handoff](docs/PHASE_1_HANDOFF.md)
- [Third-party notices](THIRD_PARTY_NOTICES.md)

## Repository status

Private Phase 0 baseline on branch `phase-0/foundation`. Nothing is deployed publicly. Do not push changes to the original team repositories.
