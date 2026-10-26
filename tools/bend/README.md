# BEND.

BEND. is a local-first, standalone browser video editor for short-form vertical, square, and landscape compositions. Import footage and audio, cut a V1 sequence, add transitions, speed ramps, masks, effects, and animation, build a soundtrack with loops and ducking, then export a validated still or video. **Make motion misbehave.**

The editor runs entirely in the browser. Project metadata and source media stay in IndexedDB on the current origin; there is no account system, upload endpoint, analytics service, or hosted AI dependency.

## Current capabilities

Phase 8.1 is the current standalone editing surface.

### Media and sequence editing

- Multi-file video and audio import, plus a local media library with thumbnails, duration, type, resolution, usage, and missing-source state.
- Add to V1, replace a selected clip's source, reuse a source as music, relink missing media, and remove unreferenced media with undo protection.
- One V1 video sequence with split, duplicate, delete, ripple delete, drag reorder, timeline zoom, snapping, edit-point navigation, and frame/timecode scrubbing.
- Trim, reverse, freeze frame, constant speed, speed ramps, and transition-aware source-time mapping.
- Six transitions: dissolve, dip to black, wipe, zoom, glitch, and wave dissolve, with type-specific defaults, real-overlap clamping, and reorder cleanup.
- Selected-clip quick actions and keyboard shortcuts for the common edit operations.

### Composition and creative controls

- Direct canvas move, resize, rotate, crop, fit/fill all, and anchor-preserving placement.
- Rectangle, ellipse, and gradient masks with invert and feather controls.
- Blend modes, color adjustments, color-look swatches, and hold-to-compare against the original source.
- Keyframes, easing, modulation, per-layer transform/opacity/color animation, and animation track editing.
- Procedural Signal Field, Liquid, Flow, and Refraction generators with deterministic seeds and presets.
- Motion Echo, Time Slice, Channel Delay, and Frame Feedback temporal stacks plus Wave Displacement.
- Built-in and saved recipes, treatment copy/paste between clips, effect-instance remapping, and animation-track remapping.

### Audio

- Clip audio gain, mute, fades, and transition crossfades.
- Locally decoded waveform peaks for audio-bearing video clips and the soundtrack, mapped through trim, reverse, speed, and loop timing.
- One soundtrack source with gain, fades, looping to the composition end, final partial repeat, and an optional equal-power boundary crossfade.
- Optional level-driven music ducking with configurable amount, threshold, attack, and release. Ducking analyzes the audible clip mix, not speech.
- Export mix order, peak safety, source-time mapping, and output validation are shared with the rendered video. Pitch-preserving speed is not implemented.

### Export, persistence, and portability

- PNG current still and cover-frame export at full canvas resolution.
- Video export with MP4/H.264 + AAC where the browser supports it, otherwise WebM/VP9 or VP8 + Opus.
- Draft and Full preview quality, bounded heavy-preview safety for pathological temporal stacks, cancellation, retry, and full-quality export independent of preview quality.
- Encoded output is reopened and checked for dimensions, duration, frame count, start timestamp, and audio presence before download.
- Debounced local autosave, project library, project revisions, safe switch/duplicate/delete flows, and schema migration.
- Editable `.bendpkg` packages containing normalized project data and source media, restorable in a fresh browser context. Packages are not encrypted; treat them as sensitive project archives.

## Requirements

- Node.js 20.19+ or 22.12+ (the CI workflow uses Node 24) and npm.
- A current Chromium-based browser for the fully verified MP4/H.264 + AAC path. Firefox is supported for WebM/VP9 + Opus export in the tested environment. Safari on macOS is not verified.
- `ffmpeg` is optional and only needed to regenerate browser/deployed test fixtures. It is not a runtime dependency.

## Setup

```bash
npm ci
npm run dev
```

Open the Vite URL printed by the terminal (normally `http://127.0.0.1:5173`). `/` and `/studio` open the editor; `/studio/edit` and `/integration` remain supported compatibility/host-harness routes.

`npm install` also works, but `npm ci` is the reproducible path used by CI and Vercel.

## Verification

```bash
npm run typecheck
npm test
npm run build
npm run test:browser
```

The final Phase 8.1 verification recorded:

- Typecheck: PASS.
- Unit tests: 19 files, 129 tests, all passing.
- Production build: PASS. The lazy `portableProject` chunk remains about 652 kB; it is loaded only for package/source operations.
- Maintained local browser suite: 25 passing checks across Chromium and Firefox, with 3 intentional Firefox codec-specific skips.
- Phase 5.4 UI acceptance harness: 17/17 checks, zero console/page errors.
- Dependency audit: 0 reported vulnerabilities.

The maintained `npm run test:browser` suite covers procedural and imported-media editing, direct manipulation, accessibility surfaces, loop handles, mobile shell overflow, multi-clip import, media library, waveforms, soundtrack loop/duck persistence, shortcut/keyboard editing, cover preview, media removal/relink, and video export. Historical phase specs remain in `tests/browser` for archaeology but are not part of the maintained gate.

### Focused import, edit, reload, and export smoke

Run the production build in one terminal:

```bash
npm run preview -- --port 4173 --strictPort
```

Run the maintained deployed-flow test against that local production build in another terminal (PowerShell):

```powershell
$env:BEND_DEPLOY_URL='http://127.0.0.1:4173'
$env:BEND_ALLOW_LOCAL='1'
$env:BEND_BUNDLED_CHROMIUM='1'
npx playwright test -c playwright.deployed.config.ts --project=chrome --grep '@full' tests/deployed/deployed-phase8.spec.ts
```

The smoke imports real footage, splits a clip, applies a transition and speed change, adds and edits a soundtrack, saves and reloads the project, exports a validated video, and downloads it. `BEND_ALLOW_LOCAL=1` is an explicit local-only override; the deployed suite otherwise refuses non-HTTPS or localhost origins.

### Deployed acceptance

The deployed suite requires an explicit URL and, for protected Vercel previews, an automation bypass secret:

```powershell
$env:BEND_DEPLOY_URL='https://<deployment-or-preview-url>'
$env:BEND_VERCEL_BYPASS='<protection-bypass-secret>'
npx playwright test -c playwright.deployed.config.ts --grep '@smoke'
```

Never commit the bypass secret. It is read only from the environment; the tests use it once to bootstrap the scoped Vercel cookie. Full Chrome suites can be selected with `--project=chrome --grep '@full'`; creator, host, export, accessibility, and Phase 8/8.1 suites live under `tests/deployed`.

Minimal media fixtures are committed. The larger Phase 7 fixtures can be regenerated with `pwsh tests/fixtures/generate-phase7-fixtures.ps1` when `ffmpeg` is available.

## Vercel deployment

BEND is configured as a Vite project in `vercel.json`:

- Install: `npm ci`
- Build: `npm run build`
- Output: `dist`
- SPA rewrites for `/studio`, `/studio/edit`, and `/integration`
- Immutable caching for `/assets/*`
- `X-Content-Type-Options` and `Referrer-Policy` headers

`.vercelignore` keeps documentation, tests, local evidence, browser profiles, logs, and recovery material out of the uploaded runtime source. No runtime environment secret or server API is required.

Create a preview deployment without changing production:

```bash
npx vercel deploy --yes
```

Do **not** add `--prod`, promote an alias, or merge this branch into `main` as part of routine verification. The production alias is a separate, explicitly authorized release action. Vercel Authentication stays enabled for previews.

Local projects are scoped to the exact browser origin. A preview URL and the production domain do not share IndexedDB projects; use an editable `.bendpkg` package to move work between origins or devices.

## Project shape

- `src/engine/core` - schema-3 project document, normalization, migration, timeline math, loops, masks, and time mapping.
- `src/engine/media` - browser metadata probing, Mediabunny inspection, media lifecycle, and source replacement.
- `src/engine/editing` - V1 operations and treatment copy/paste.
- `src/engine/animation` - keyframes, easing, modulators, and layer evaluation.
- `src/engine/audio` - soundtrack loops, ducking, and waveform peaks.
- `src/engine/render` - the shared PixiJS compositor used by preview, PNG, and video export.
- `src/engine/temporal` - temporal effect registry, sampling, feedback replay, and stack compatibility.
- `src/engine/export` - fixed-clock composition, Mediabunny encode, audio mix, range/loop export, and download.
- `src/engine/package` - `.bendpkg` encoding, validation, and portable project restoration.
- `src/storage` - IndexedDB projects, assets, host media, revisions, and save coordination.
- `src/features` - studio editor, inspector, sequence timeline, media/project dialogs, export UI, and integration harness.
- `tests` - unit, maintained browser, deployed, manual acceptance, and fixture generation.
- `docs` - architecture, design system, phase evidence, deployment, and handoff records.

## Supported boundaries and known limitations

- **One V1 video track and one music track.** Overlay/PiP video and multitrack mixing are deliberate future scope, not current claims.
- **Codec support varies by browser.** Chrome/Edge are the verified MP4/H.264 + AAC path. Firefox uses WebM/VP9 + Opus here and may not provide AAC. Windows WebKit supports procedural compositions but not video import in the tested environment. macOS Safari is untested. BEND does not claim universal codec or frame-exact support.
- **Speed changes resample audio.** Pitch-preserving speed is deferred. Freeze-frame audio is silent, and reverse audio follows the reversed picture.
- **Ducking is level-driven and export-authoritative.** It is not speech recognition. The live monitor does not apply the ducking envelope.
- **Heavy temporal stacks are bounded in preview.** Export always uses the full stack and full resolution, so deep stacks can still take much longer than real time.
- **No LUFS normalization.** Only transparent peak safety above 0.98 is applied.
- **No cloud or collaboration surface.** There are no accounts, cloud projects, hosted AI, captions, speech isolation, or analytics.
- **Accessibility coverage is intentionally scoped.** Automated axe scans, keyboard paths, 200% zoom equivalent, forced colors, and reduced motion were exercised. A manual NVDA/JAWS/VoiceOver session and physical-device touch testing were not performed.
- **Firefox WebGL availability varies.** Headless Linux CI may expose no worker WebGL context; the capability matrix records that absence rather than claiming universal GPU/WebGL support, and the Firefox browser checks pass with the available renderer. Headless Firefox on Windows emitted WebGL context-loss/lazy-texture warnings during export; the exported WebM was valid and the editor canvas remained rendered. The app does not hide those warnings.
- **Local storage is origin-scoped.** Clearing site data deletes local projects unless a `.bendpkg` was downloaded.

## Documentation

Start with the Phase 8.1 records:

- [Phase 8.1 implementation](docs/PHASE8_1_IMPLEMENTATION.md)
- [Phase 8.1 handoff index](docs/PHASE8_1_HANDOFF.md)
- [Phase 8.1 test report](docs/PHASE8_1_TEST_REPORT.md)
- [Phase 8.1 UX audit](docs/PHASE8_1_UX_AUDIT.md)
- [Phase 8.1 audio report](docs/PHASE8_1_AUDIO_REPORT.md)
- [Phase 8.1 performance report](docs/PHASE8_1_PERFORMANCE.md)
- [Phase 8.1 deployment record](docs/PHASE8_1_DEPLOYMENT.md)
- [Phase 8.1.1 UI audit](docs/PHASE8_1_1_UI_AUDIT.md)
- [Phase 8.1.1 test report](docs/PHASE8_1_1_TEST_REPORT.md)
- [Phase 8.2 handoff](docs/PHASE8_2_HANDOFF.md)

Runtime and integration references:

- [Architecture](docs/ARCHITECTURE.md)
- [Portable project format](docs/PORTABLE_PROJECT_FORMAT.md)
- [Host integration API](docs/HOST_INTEGRATION_API.md)
- [Embedding decision](docs/EMBEDDING_DECISION.md)
- [Design system](docs/DESIGN_SYSTEM.md)
- [Phase 6B integration contract](docs/PHASE6B_INTEGRATION_CONTRACT.md)
- [Dependency security audit](docs/DEPENDENCY_SECURITY_AUDIT.md)

Release history:

- [Phase 5.5 handoff](docs/PHASE5_5_HANDOFF.md)
- [Phase 6A test report](docs/PHASE6A_TEST_REPORT.md)
- [Phase 6B handoff](docs/PHASE6B_HANDOFF.md)
- [Phase 7 handoff](docs/PHASE7_HANDOFF.md)
- [Phase 7.0 implementation](docs/PHASE7_0_IMPLEMENTATION.md)
- [Phase 8.0 handoff](docs/PHASE8_0_HANDOFF.md)
- [Phase 8.0 implementation](docs/PHASE8_0_IMPLEMENTATION.md)

The source-identity JSON files under `docs` are point-in-time SHA-256 manifests. The deployed-source manifests identify the Vercel preview upload; later documentation-only finalization can change the repository manifest without changing runtime behavior. The Git commit SHA of the release branch is authoritative for the final source state.
