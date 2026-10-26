# Studio 2.0 — Phase 0 Report

**Date:** 2026-10-26  
**Scope:** source preservation, feature-parity baseline, shared contracts and host foundation. No tool integration.

## A. Verdict

**PASS** for the Phase 0 foundation, with documented deferred acceptance work.

The host application builds and runs; shared contracts typecheck; all four source repositories are imported at the required commits with original files intact; the combined legacy editor and all standalone editors load; Shapes and BEND pass their build/typecheck/unit-test gates; a complete feature inventory exists; and the implementation is committed to a private Git branch. Full feature parity has **not** been runtime-tested merely because source was copied. Deferred tests and known gaps are listed below and in the matrix.

## B. Repository and branch

| Field | Value |
| --- | --- |
| Repository | `https://github.com/tanishkfr/insta-post-studio` (private) |
| Branch | `phase-0/foundation` |
| Remote commit | `352007ea7c341090e2bdc492a92750f7475f6339` (verified Phase 0 baseline; this report is a subsequent docs-only commit on the same branch) |
| Visibility | Private |
| Local workspace | `C:\Dev\Coursework\insta-post-studio` |
| Default start | `npm install && npm run dev` |
| CI | [run 40329333860](https://github.com/tanishkfr/insta-post-studio/actions/runs/40329333860) — success |

Repo creation was verified with `gh repo view` after creation. No source work was published to teammates' repositories, and BEND's Vercel project was not touched.

## C. Imported sources, original SHAs and verification

| Tool | Original repository | Branch | Commit | Imported location | Verification |
| --- | --- | --- | --- | --- | --- |
| Image | `nithilaprakash18/Insta-post` | `main` | `3eac3c7f5228e8324c6b245eb3011b86762b1d25` | `tools/legacy/image/janya.html` | Byte-identical (SHA-256); loads and captures to Generate |
| Vector | `nithilaprakash18/Insta-post` | `main` | `3eac3c7f5228e8324c6b245eb3011b86762b1d25` | `tools/legacy/vector/arnav.html` | Byte-identical; loads, generates SVG, captures to Generate |
| Generate | `nithilaprakash18/Insta-post` | `main` | `3eac3c7f5228e8324c6b245eb3011b86762b1d25` | `tools/legacy/generate/generator.html` | Byte-identical; loads in combined flow |
| Legacy shell/builder | `nithilaprakash18/Insta-post` | `main` | `3eac3c7f5228e8324c6b245eb3011b86762b1d25` | `tools/legacy/upstream/` | Byte-identical `index.html`; full Text→Image→Vector→Generate walkthrough |
| Shapes | `rajshekharbasu/shapes` | `main` | `08fea0e00d43f2b955f34e6e341c4f2aaba427ca` | `tools/shapes/` | Tree diff vs staging clone: 0 files; build/tests pass; WebGL editor verified |
| Typography | `anushkaaaajain/Online-Type-Tool` | `main` | `7a7fcfbcb97d4defc402f41da723c95b6de735ac` | `tools/typography/` | Tree diff: 0 files; both tools load; all 8 bundled fonts ready |
| BEND | `tanishkfr/Bend` (private) | `polish/phase-8.1.1-ui` | `7f2d69c272d2a4607ff45f2575c650ac3b6cfb43` | `tools/bend/` | Tree diff: 0 files; typecheck/build/129 unit tests pass; required CI run `success` |

- Required BEND CI run: [40325071662](https://github.com/tanishkfr/Bend/actions/runs/40325071662) — verified through GitHub API as success at the required SHA.
- No `.git` histories were imported; provenance is recoverable via the pinned SHAs and [SOURCE_MANIFEST.md](SOURCE_MANIFEST.md).
- No original feature implementations were deleted or reduced. No `node_modules`, build output, caches, `.env` or secrets are committed.
- Upstream licences are missing for Insta-post, Shapes and Typography; the repo is private and that blocker is recorded in [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).

### Legacy build discrepancy

`tools/legacy/upstream/build.py` fails exactly as expected with Python 3.11.9:

```text
FileNotFoundError: [Errno 2] No such file or directory: 'src/apps/janya.html'
```

The checked-in `index.html` is the prebuilt combined application. The old builder was **not** adopted as the Studio foundation. The checked-in index also predates the current `build.py` `cmd:'grab'` hook additions; the shell captures tool assets through direct same-origin DOM access, so the legacy flow remains functional. Both facts are documented in `tools/legacy/README.md` and the matrix.

## D. Build/test results

| Area | Command | Result |
| --- | --- | --- |
| Root install | `npm install` | PASS — host/contracts dependency tree installed |
| Contracts | `npm run contracts:typecheck` | PASS |
| Host production build | `npm run build` | PASS — 43 modules; JS 233.45 kB / CSS 18.40 kB |
| Host unit tests | `npm test` | PASS — 3/3 |
| Host browser smoke | `npm run test:browser` | PASS — 1/1 Chromium; shell, nav, layers, inspector |
| Shapes install | `npm --prefix tools/shapes install` | PASS — 124 packages |
| Shapes build | `npm --prefix tools/shapes run build` | PASS — tsc + Vite; 1,084 kB bundle warning |
| Shapes tests | `npm --prefix tools/shapes test` | PASS — 3 files / 18 tests |
| Shapes browser | Playwright load against Vite | PASS — WebGL renderer active, 824×820 canvas, added Cube |
| BEND install | `npm --prefix tools/bend install` | PASS — 185 packages |
| BEND typecheck | `npm --prefix tools/bend run typecheck` | PASS |
| BEND unit tests | `npm --prefix tools/bend test` | PASS — 19 files / 129 tests |
| BEND build | `npm --prefix tools/bend run build` | PASS — 2,855 modules; lazy `portableProject` chunk 652 kB warning |
| BEND browser | Playwright load against Vite | PASS — editor and First Study project loaded |
| Typography | static server + browser | PASS — 21 fonts plus Custom Type link (22 `.font-row` entries), 8/8 bundled faces loaded, “Fonts ready”; Custom Type loaded, opentype available |
| Legacy | static server + browser | PASS — combined flow and standalone Image/Vector/Generate load; handoff worked |
| CI workflow | GitHub Actions `Studio CI` | PASS — [run 40329333860](https://github.com/tanishkfr/insta-post-studio/actions/runs/40329333860) |
| Clean clone | `git clone` remote → `npm ci` → contracts typecheck → build → tests → dev server | PASS — 182 packages from committed lockfile; 43-module build; 3/3 tests; HTTP 200 at `127.0.0.1:4180`; tool trees byte-identical to pinned sources |

**Legacy browser walkthrough evidence:** Text → Image iframe (`600×750` canvas, non-empty pixels) → captured `Image captured (600 × 750)` → Vector iframe (`1,000×1,414` SVG, 62 items) → captured `Vector captured (1000 × 1414)` → Generate with vector and text assets, 3 alternatives. No page or console errors.

**BEND test suites deferred in Phase 0:**

- Maintained browser gate: 19 cases × Chromium/Firefox, including media import, clip editing, transitions, audio, persistence and export. Deferred to protect the Phase 0 time budget; upstream records 35 passed / 3 codec-specific skipped.
- Historical/heavy specs and manual acceptance harnesses were not run. Deployed/Vercel suites were not run; no deployment was performed.
- Export codecs (MP4/WebM), `.bendpkg` browser round-trip and full media acceptance remain unverified in Phase 0. Unit coverage for package format/export logic passed.

Exact deferred commands (from `tools/bend`; run after `npm --prefix tools/bend install`):

```powershell
# Maintained gate (current playwright.config.ts testMatch)
npm run test:browser

# Declared script, but note its named specs are outside the maintained testMatch
npm run test:phase2a1

# Historical specs — current config only discovers four maintained specs.
# Use/restore a dedicated Playwright config whose testMatch includes these files.
npx playwright test tests/browser/phase2b.spec.ts tests/browser/phase2b-export.spec.ts --project=chromium
npx playwright test tests/browser/phase3-temporal.spec.ts --project=chromium
npx playwright test tests/browser/phase4-animation.spec.ts --project=chromium
npx playwright test tests/browser/smoke.spec.ts --project=chromium
npx playwright test tests/browser/phase5-1a.spec.ts tests/browser/phase5-1d.spec.ts --project=chromium
npx playwright test tests/browser/phase6a.spec.ts --project=chromium
npx playwright test tests/browser/accessibility.spec.ts tests/browser/timing.spec.ts --project=chromium

# Heavy manual acceptance harnesses (start their own Vite server)
node tests/manual/phase5-3-acceptance.mjs
node tests/manual/phase5-4-ui-acceptance.mjs
node tests/manual/phase5-5-acceptance.mjs
node tests/manual/phase5-1b.mjs
node tests/manual/phase5-1c-motion.mjs

# Deployed checks (require an authorized non-production/preview URL + env credentials)
npm run test:deployed:smoke
npm run test:deployed:full
npm run test:deployed:creator
npm run test:deployed:host
npm run test:deployed:exports
npm run test:deployed:a11y
```

Upstream documentation has drift in pass counts and some architecture claims; source and the pinned commit are authoritative.

**Other deferred checks:** Image PNG/GIF/ZIP export, Vector import/undo/export, Typography PNG/OTF export, Shapes FBX/booleans (booleans are dead code), Generate Claude mode/Export spec (host-dependent), and BEND maintained browser gate. These are marked **S** or **E** in the matrix, never **T**.

## E. Feature inventory coverage

[`FEATURE_PARITY_MATRIX.md`](FEATURE_PARITY_MATRIX.md) contains **135 editor feature rows + 7 cross-cutting shared gaps**, organized by:

| Editor | Rows | Coverage |
| --- | ---: | --- |
| Image | 20 | import, formats, looks, prompting, colour, framing, patterns/trace/blur, masks, layers, undo, GIF, PNG/ZIP, handoff, persistence limits |
| Vector | 19 | generators/fields/presets, canvas/colour/type, selection/transforms, bake/edit, history, clipboard, SVG/raster import, export, handoff, limits |
| Generate | 17 | post/carousel, rule/static/Claude modes, 12 controls, layouts, assets, host setup, backgrounds/textures, export and persistence gaps |
| Typography | 22 | font catalogue/bundled fonts, Type Library controls/distortion/PNG, Custom Type drawing/image/pattern/blend/stretch/PNG/OTF, credits and network deps |
| Shapes | 23 | primitives, transforms/gizmo, selection/outliner, face editing, deform, arrays/remix/strokes, materials/camera, FBX, undo, persistence/export gaps, dead CSG |
| BEND | 34 | media/library, timeline, speed/transitions, transform/masks/colour, temporal effects, generators, animation, audio/ducking, persistence, `.bendpkg`, export, host bridge, UI refinements, unsupported gaps |
| Shared | 7 | missing adapters, serialization, Shapes render, low-res legacy handoff, Generate visual export, network assets, licensing |

Every row records source file/entry point, state ownership, dependencies/browser requirements, output formats, integration note and a verification tag. The matrix is the non-regression contract; source-only features are not claimed as runtime-verified.

## F. Shared architecture contracts

`packages/contracts` is a type-only workspace package and typechecks successfully.

- `project.ts`: `StudioProject` (ID/name/schema version/global format/artboards/asset references/layers/ordering/metadata), `ProjectFormat`, `Artboard`, `StudioGlobalContext` and source provenance.
- `layer.ts`: `SharedLayer` with stable ID, kind, source tool, editable source-state reference, rendered asset reference, artboard, transform, visibility/lock, opacity/blend, order, masks and optional temporal metadata.
- `adapter.ts`: versioned `ToolAdapterV1` covering initialize/open, global context, input assets, restore, render, editable state return, capabilities/issues, cancel and close; supports iframe and React-hosted runtimes; capability report includes limitations and runtime requirements.
- `messaging.ts`: scoped project/session/tool/channel messages, exact origin policy, request IDs, timeouts, typed transport errors and request/response/event envelopes.
- `assets.ts`: IndexedDB-first storage locators, rendered assets and opaque tool state payloads.

Architecture decisions are detailed in [INTEGRATION_ARCHITECTURE.md](INTEGRATION_ARCHITECTURE.md). No compositor, adapter runtime or asset database was implemented in Phase 0, per scope.

## G. Host application readiness

- React 19 + TypeScript + Vite host at `apps/studio`.
- White-first shell with `#236F72` seafoam accent, Instrument Sans, restrained motion.
- Application shell with project name input, six-tool navigation, central artboard placeholder, layer panel, inspector and format display.
- Responsive breakpoints at 1120/900/620 px; reduced-motion support; keyboard focus states.
- Unit and Playwright smoke infrastructure; 3 unit tests and 1 browser test pass.
- In-memory demo project typed against the real contracts. No persistence or tool embedding yet; UI labeling says so explicitly.
- Minimal CI workflow at `.github/workflows/ci.yml` checks install, contracts, host build and unit tests. A separate manual tool-checks workflow exists for preserved-tool builds.
- Clean-clone verification passed from the private remote at the baseline SHA: `npm ci`, contracts typecheck, production build, unit tests, dev server HTTP 200, and byte-identical source trees. Remote CI is green.

## H. Known blockers and risks

1. **Licensing:** Insta-post, Shapes and Online-Type-Tool declare no licence in their pinned trees; the legacy README explicitly requires author permission. Private only until resolved. Font credits are preserved, but redistribution rights need validation.
2. **No project serialization for most tools:** Image, Vector, Generate, Type Library/Custom Type and Shapes have no full project save/restore. Shapes additionally has **no render/export API**. These are adapter work in Phase 1, not claims of current parity.
3. **BEND browser/export acceptance deferred:** unit/typecheck/build pass; maintained browser gate, codec exports and `.bendpkg` browser round-trip are unverified in Phase 0. BEND's upstream integration adapter also emits preview-quality (max 720 px) video for host handoff.
4. **Environment dependencies:** Typography loads Google Fonts and cdnjs opentype.js; legacy pages use Google Fonts and Image uses JSZip CDN; Generate's Claude mode and Export spec only work inside claude.ai; BEND video export depends on browser codecs/WebCodecs.
5. **Legacy `build.py` is broken** by missing `src/` paths. It was deliberately not repaired or adopted. The checked-in `index.html` is the runnable baseline and predates the current grab-hook additions.
6. **React version split:** Shapes is React 18; host/BEND are React 19. The monorepo deliberately excludes tools from npm workspaces. Shapes must remain isolated (iframe recommended) in Phase 1.
7. **High-res handoff:** the legacy shell captures Image at preview resolution, not 1080. Do not use it as the production adapter path.
8. **Generate output gap:** there is no PNG/HTML export today. A rendered asset path must be added before Generate can publish a layer.
9. **Docs drift in BEND:** upstream README/report pass counts and some architecture claims (schema version, MediaRecorder, audio mixing) lag source. Source and pinned commit were treated as authoritative.
10. **Full integration is not implemented by design:** no shared project store, IndexedDB asset DB, messaging runtime, renderer or final composition export yet.

## I. Exact Phase 1 starting point

Branch `phase-1/shared-foundation`, starting with [PHASE_1_HANDOFF.md](PHASE_1_HANDOFF.md):

1. Implement the authoritative project store and IndexedDB project/asset repositories.
2. Implement the iframe transport from `ToolAdapterV1` plus a fake-adapter conformance test (origin/scope/request ID/timeout/cancel).
3. Build the **Vector adapter** as the first vertical slice: open preserved Vector with host context → edit → return SVG + versioned source state → host layer → reopen identical state.
4. Then Image, Typography, Generate, the Shapes render/serialize adapter and the BEND dedicated bridge.
5. Do not begin final composition export until the first tool round-trip is proven.

No upstream repository may be modified. No public deployment is authorized for Phase 1.
