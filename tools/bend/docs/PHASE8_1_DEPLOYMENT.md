# BEND. Phase 8.1 — Deployment Record

Date: 2026-10-26  
Vercel project: `bend`  
Project ID: `prj_rC1ESKcsrETeM33dTQI77QHIQdUS`  
Team: `tanishkfrs-projects` (`team_VOeLK7yFGO2OfGuEOsffIywY`)  
Target: **preview only**

Preview URL: `https://bend-ktf5bn98p-tanishkfrs-projects.vercel.app`  
Deployment ID: `dpl_YKPcLjzeFajGRZ7WLv7Nv3GrKcba`  
State: `READY`  
Inspector: `https://vercel.com/tanishkfrs-projects/bend/YKPcLjzeFajGRZ7WLv7Nv3GrKcba`

Production: `https://bend-gilt.vercel.app`  
Production deployment: `dpl_69htoYbLyFNLqJYPmsJMZE6YGk9o` (unchanged)

## 1. Source and configuration

- Local Git HEAD remains `343260bb048a111475216ef2141eb5b89144de75`.
- Working tree is deliberately dirty and preserved in `C:\Dev\Bend-Recovery\phase81-pre-20261026-012952`.
- Local source identity: `docs/PHASE8_1_SOURCE_IDENTITY.json` (235 files).
- Vercel upload identity: `docs/PHASE8_1_DEPLOYED_SOURCE_IDENTITY.json`.
- Uploaded source digest before/after deployment: `5ec7e0b3062ff7cfccce7fcf2051db45ef82a2bf414f61e636d206f5ea061bcc`, 91 files.
- `vercel.json`: Vite, `npm ci`, `npm run build`, output `dist`, route rewrites, immutable asset caching, nosniff/referrer headers.
- `.vercelignore` excludes docs, tests, fixtures, output/evidence, browser profiles, logs and local recovery material.
- Vercel Authentication remains `all_except_custom_domains`; one existing automation-bypass secret is configured. The secret was read from Vercel protection settings only for the test process and was not written into source, reports, screenshots or committed files.

The deployment command was a preview deploy only:

```powershell
npx vercel deploy --yes
```

No `--prod`, promote, alias change, git push, tag, or release was performed.

## 2. Build/deploy result

- Vercel build completed in `/vercel/output` in 22 s.
- Vite production build completed; editor and lazy exporter/package chunks present.
- Preview returned READY.
- Inspector target: `preview`.
- The existing ~652 kB `portableProject` chunk warning remains; it is loaded only for package/source operations.

## 3. Deployed acceptance

All deployed tests used the protected preview with the automation bypass bootstrapped as a scoped cookie.

### Smoke — Chrome, Edge, Firefox, WebKit

Command shape:

```powershell
npx playwright test -c playwright.deployed.config.ts --grep "@smoke"
```

Result: **31 passed, 1 skipped** (Windows WebKit video-codec skip). Covered:

- direct load and refresh on every supported route;
- procedural generator create/edit/scrub;
- valid PNG still download;
- real video import/decode/seek/play/trim/reload (Chrome, Edge, Firefox);
- Phase 8.0 direct/procedural reload;
- Phase 8.1 media/shortcut/waveform/Draft-Full surfaces;
- routing, MIME types, immutable caching, 404 behaviour, no localhost/foreign asset load.

### Full Chrome export and creator suites

| Suite | Result |
|---|---|
| `deployed-phase8.spec.ts --grep @full` | PASS — split, transition, speed, music, save/reload, export |
| `deployed-phase81.spec.ts --grep @full` | PASS — two-shot import, waveforms, loop/duck, reload, validated MP4/AAC export |
| `deployed-exports.spec.ts --grep @full` | PASS — 4 tests: full MP4 + still + range + muted, seamless loop, encoder-failure retry, cancel/retry |
| `deployed-a11y.spec.ts --grep @full` | PASS — axe editor/panels/export/library, keyboard, 200% layout, reduced motion, forced colors |
| `deployed-projects.spec.ts --grep @full` | PASS — package restore, legacy stored document, missing-media relink/hidden export, quota recovery |
| `deployed-creative.spec.ts --grep @full` | PASS — 5 tests: temporal presets, masks/blend/compare, keyframe groups, recipes, project library |
| `deployed-host.spec.ts --grep @host` | PASS — host-owned placement round-trip |
| `deployed-creators.spec.ts --grep @creator` | PASS — Projects A, B and C (C passed after test-label maintenance) |
| Mobile `@mobile` | PASS — phone viewport, touch shell, no horizontal overflow, inspector access |

The Phase 8.1 deployed full test produced MP4/H.264 + AAC, 720×900, 240 frames, 8.00 s, mixed timeline audio, and the loop/duck export messages.

### Deployed sample-level audio verification

A separate deployed Chrome and Edge workflow built four 2 s clips (alternating 440 Hz audio and silent footage) with a 4.05 s 220 Hz music bed, loop enabled (2 repetitions over 8 s), and ducking enabled. Each browser exported ducked and unducked versions.

Chrome and Edge both reported:

- MP4/H.264+AAC, 720×900, **240 frames, 8.00 s**;
- soundtrack loops 2 times with a 0.04 s boundary crossfade;
- ducking reduced music by up to 10.0 dB for 81% of the range.

Independent spectral analysis of the deployed files:

| Time | Chrome music reduction | Edge music reduction | Firefox WebM reduction | Clip 440 Hz |
|---:|---:|---:|---:|---:|
| 1.0 s | 10.02 dB | 10.02 dB | 10.17 dB | unchanged |
| 4.1 s (after loop boundary) | 9.88 dB | 9.88 dB | 9.90 dB | unchanged |
| 5.0 s | 10.02 dB | 10.02 dB | 10.06 dB | unchanged |

At 3.5 s and 7.0 s, where the active clip is the silent footage, the reduction was ~0.2 dB; this verifies the ducking is level-driven rather than blindly on. Deployed files:

- `output/phase81-deployed/deployed-chrome-ducked.mp4`
- `output/phase81-deployed/deployed-chrome-unducked.mp4`
- `output/phase81-deployed/deployed-edge-ducked.mp4`
- `output/phase81-deployed/deployed-edge-unducked.mp4`
- `output/phase81-deployed/deployed-firefox-ducked.webm`
- `output/phase81-deployed/deployed-firefox-unducked.webm`

### Firefox deployed path

Firefox exported a validated **WebM/VP9 + Opus** file, 720×900, 240 frames, 7.97 s, mixed audio, loop and duck messages present. Independent audio analysis confirmed ~10 dB music reduction at loop-local active voices with unchanged 440 Hz clip tone. Firefox WebGL warnings remain documented in `PHASE8_1_TEST_REPORT.md`; output was valid.

### WebKit deployed path

Windows Playwright WebKit 27.2 rendered procedural compositions and downloaded a valid PNG in the deployed smoke. Video import remains unavailable in this environment and is reported honestly. This is not a macOS Safari claim.

### Mobile deployed path

Pixel 7 emulation passed the phone shell and Phase 8.0 mobile sequence checks with no horizontal overflow.

## 4. Production status

Production was not modified:

- `https://bend-gilt.vercel.app` resolves to `dpl_69htoYbLyFNLqJYPmsJMZE6YGk9o`.
- No production alias or deployment was changed.
- The verified preview is isolated by Vercel Authentication and does not share local IndexedDB projects with the production origin.

**Promotion decision: NOT MADE. Requires separate Product/Release authorization.**
