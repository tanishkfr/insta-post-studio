# BEND. Phase 7.0 — Deployment Report

Date: 2026-10-25  
Environment: Windows 11 Home Single Language 10.0.26200, Node 24.13.0, npm 11.6.2  
Vercel CLI: 54.9.1

## 1. Project identity

| Field | Value |
|---|---|
| Vercel project | `bend` |
| Project ID | `prj_rC1ESKcsrETeM33dTQI77QHIQdUS` |
| Team / scope | `tanishkfrs-projects` (`team_VOeLK7yFGO2OfGuEOsffIywY`) |
| Framework | Vite |
| Node.js | 24.x |
| Root Directory | `.` |
| Install Command | `npm ci` (from `vercel.json`) |
| Build Command | `npm run build` (from `vercel.json`) |
| Output Directory | `dist` |
| Deployment protection | Vercel Authentication, `all_except_custom_domains`; not disabled |

Local project link was verified by reading `.vercel/project.json`; it matches the expected project ID. `.vercel/` is ignored by Git.

## 2. Preview deployment

| Field | Value |
|---|---|
| Final preview URL | `https://bend-9b07efmjr-tanishkfrs-projects.vercel.app` |
| Deployment ID | `dpl_6JKYbspnxjrEiBw8xgNqfp9UU1K7` |
| Inspector | `https://vercel.com/tanishkfrs-projects/bend/6JKYbspnxjrEiBw8xgNqfp9UU1K7` |
| Target | `preview` (not production) |
| State | `READY` |
| Created | 2026-10-25 22:07 IST |

An earlier preview (`bend-1654tc3n4-...`) was used to validate the first hardening pass. The URL above is the final deployment from the verified source and is the one used for all final browser/media/creator evidence.

### Protection and automation access

The preview is protected by Vercel Authentication. No security protection was disabled. A Protection Bypass for Automation secret was generated for this phase and is stored outside the repository in a restricted local file. The deployed tests bootstrap the `_vercel_jwt` cookie with one CLI/API request, then page and asset requests use the cookie. The bypass header is not sent to third-party requests. The secret is not present in source, documentation, screenshots, test artifacts, or Git.

## 3. Source identity

Git state at final implementation:

- Branch: `main`
- Local HEAD: `343260bb048a111475216ef2141eb5b89144de75` (`feat: complete phase 5.2 product quality overhaul`)
- `origin/main`: `1cfbe6f244820599aaffd91a8f56cc301f1c8a58` (`feat: complete Phase 5.4 studio polish`)
- Local branch is one commit behind `origin/main`; the remote Phase 5.4 files are present in the working tree.
- Working tree contains the complete Phase 5.5, Phase 6B, and Phase 7.0 source as uncommitted work.
- No commit, merge commit, push, tag, or production deployment was created.

Durable pre-work snapshot:

`C:\Dev\Snapshots\Bend\phase7-preflight-20261025-171910`

It contains:

- a full source working-tree copy, including tracked `output/` evidence;
- `.git` history and metadata;
- a verified `bend-history.bundle`;
- the tracked diff (`tracked-changes.patch`);
- untracked source/test list;
- SHA-256 manifest;
- working-tree status.

Verification: all 1,503 snapshotted files matched their SHA-256 manifest; the bundle verified; a reconstructed copy matched the captured Git status except for the deliberately excluded browser-tool profile (`.playwright-mcp/`, 0.1 MB). `.audit-sources/` (220 MB of ignored audit media) was recorded but not copied. The ignored artifacts were not needed for the source/test/build.

Final source identity manifest:

- `docs/PHASE7_0_DEPLOYED_SOURCE_IDENTITY.json`
- Digest: `e4f8cae96f62e0b0f640f9ce75a4b07f0e62301a088721d1dbe9b056599dbf83`
- Files: 193
- Generated immediately before the final preview deployment.

The Vercel upload does not include docs/tests/output because of `.vercelignore`; the manifest covers the complete snapshot, including tests and documentation. Runtime source did not change between that manifest and the deployment.

Final recovery snapshot path and verification are recorded in `docs/PHASE7_0_TEST_REPORT.md` and the final report.

Final recovery snapshot: `C:\Dev\Snapshots\Bend\phase7-final-20261025` (1,798 files, 366.1 MB, SHA-256 manifest verified, reconstructed Git status matched).

## 4. Build and routing

### Build result

Local final `npm run build`: PASS in 9.10 s.

- `tsc --noEmit` passed.
- Vite transformed 2,841 modules.
- Output: `dist/`.
- CSS: ~129 kB (21 kB gzip).
- Main index: ~296 kB (91 kB gzip).
- Editor page: ~314 kB (95 kB gzip).
- Export dialog: ~11 kB lazy chunk.
- Encoder: ~148 kB lazy chunk.
- Shared editor/Pixi chunk: ~648 kB (179 kB gzip); still triggers the >500 kB advisory. It is required by the compositor and is not hidden by changing the warning limit.
- The former ~809 kB host chunk was eliminated by deferring encoder/integration code.

Vercel build: READY. Browser evidence is from the READY deployment, not just the local build.

### Route behavior (final preview, bypass cookie)

| Route | Status | Content-Type | Result |
|---|---:|---|---|
| `/` | 200 | `text/html; charset=utf-8` | Editor loads |
| `/studio` | 200 | `text/html; charset=utf-8` | Editor loads |
| `/studio/edit` | 200 | `text/html; charset=utf-8` | Editor loads |
| `/integration` | 200 | `text/html; charset=utf-8` | Local harness loads |
| `/assets/phase7-does-not-exist.js` | 404 | `text/plain; charset=utf-8` | No HTML fallback |
| `/phase7-does-not-exist` | 404 | `text/plain; charset=utf-8` | No catch-all HTML |

Direct navigation and refresh for all app routes pass. The old production deployment still returns 404 on `/studio`; the preview adds the narrow rewrites needed for Studio 2.0.

### Static headers

Deployed tests verified:

- Generated JS/CSS assets: correct `Content-Type`, `Cache-Control: public, max-age=31536000, immutable`.
- HTML: `Content-Type: text/html; charset=utf-8`.
- Global: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`.
- Missing assets are plain 404, not `200 text/html`.
- No same-origin asset request failed during routing/editor tests.
- No `localhost`/`127.0.0.1` dependency was observed.
- Vercel Live preview instrumentation and a machine-installed Kaspersky browser extension were observed as platform/host-injected network activity; neither is a BEND runtime dependency.

## 5. Production untouched

`https://bend-gilt.vercel.app` still resolves to:

- Deployment: `dpl_69htoYbLyFNLqJYPmsJMZE6YGk9o`
- URL: `https://bend-kee3mru10-tanishkfrs-projects.vercel.app`
- Target: production
- Created: 2026-10-19
- Aliases include `https://bend-gilt.vercel.app`

No `vercel deploy --prod` and no alias change occurred.

## 6. Tested browser versions

| Browser | Version | Engine | Result |
|---|---|---|---|
| Google Chrome | 155.0.8059.85 | Blink / V8 | Full deployed suite, hardware D3D11 AMD Radeon 780M |
| Microsoft Edge | 156.0.4314.42 | Chromium | Deployed smoke, actual Edge binary |
| Mozilla Firefox | 157.0 | Gecko | Deployed smoke; WebGL warnings recorded |
| WebKit via Playwright | WebKit 27.2 / build 2370 | WebKit (Windows Playwright build) | Generator/PNG; media codecs unavailable |
| Chromium mobile emulation | Playwright Pixel 7 profile | Chromium 155 | Touch, 390 CSS px, mobile drawer |

Playwright 1.64.0. WebKit on Windows is not macOS Safari and does not imply Safari codec parity.

## 7. Actual media exports inspected

All files were downloaded from the deployed origin and inspected with FFprobe 9.0.

### Creator acceptance

| Project | File | Duration | Streams | Size |
|---|---|---:|---|---:|
| A — Experimental Reel | `project-a-experimental-reel.mp4` | 10.000 s | H.264 1080×1920 30 fps; AAC 48 kHz mono 6.016 s | 5,010,007 B |
| B — Procedural Loop | `project-b-procedural-loop.mp4` | 3.000 s | H.264 1080×1920 30 fps; no audio | 12,665,923 B |
| C — Footage Treatment | `project-c-footage-treatment.mp4` | 4.010688 s | H.264 1080×1920 30 fps; AAC 48 kHz mono 4.010667 s | 2,916,566 B |

Editable packages:

- `project-a-experimental-reel.bendpkg` — 1,927,615 B
- `project-b-procedural-loop.bendpkg` — 2,403 B
- `project-c-footage-treatment.bendpkg` — 1,927,250 B

### Export matrix

| Output | Duration | Streams | Size |
|---|---:|---|---:|
| Full-quality with source audio (test) | 2.005333 s | H.264 1080×1350 30 fps; AAC 48 kHz mono | 1,045,924 B |
| Partial range with audio | 1.002688 s | H.264 720×900 30 fps; AAC 48 kHz mono | 142,172 B |
| Seamless mirrored loop | 1.500 s | H.264 720×900 30 fps; no audio | 347,501 B |
| Muted range (video-only) | 0.500 s | H.264 720×900 30 fps; no audio | 68,282 B |
| Encoder fault-recovery generator | 1.000 s | H.264 1080×1350 30 fps; no audio | 1,887,410 B |
| Cancel/retry export | 2.005333 s | H.264 1080×1350 30 fps; AAC | 1,057,384 B |
| PNG still | — | 1080×1350 PNG | 636,278 B / 2,413,298 B / 26,608 B (different compositions) |

Artifacts and hashes: `output/evidence/phase7-0/media-inspection.json`.

## 8. Deployment-specific failures and fixes

| Issue | Deployment relevance | Resolution |
|---|---|---|
| Direct `/studio` and `/studio/edit` returned 404 on existing production | Vite static deployment has no SPA fallback | Narrow `vercel.json` rewrites; verified direct load + refresh |
| Missing-asset HTML masking risk | A catch-all rewrite would return 200 HTML for missing JS | Rewrites are route-specific; missing assets verified plain 404 |
| Encoder-heavy initial bundle | Old `host` chunk 809 kB | Lazy export/host/package-import paths; old host chunk now ~6 kB |
| Preview returns 302 to Vercel SSO | Deployment protection is enabled | Automation bypass secret + one bootstrap request; protection left enabled |
| Bypass header leaked to third-party requests | Extra headers apply to all requests in Playwright | Bootstrap cookie in `context.request`, then no bypass header on page requests |
| Absolute asset base / MIME errors | Static deploy | Built HTML/assets loaded from same origin; correct MIME and immutable cache verified |
| Origin-scoped projects could be mistaken for transferable | Preview vs production hostnames have different IndexedDB | Project Library explicitly explains origin scope; `.bendpkg` remains portable recovery |
| WebKit cannot decode tested media/encode video | Platform Playwright WebKit lacks codecs | Actionable import error verified; video export unsupported message documented; no false success |
| Empty MediaRecorder export could look successful | Canvas capture path produced empty WebM | Removed unreliable MediaRecorder fallback; Mediabunny only; size guard rejects empty output |
| Recipe preview switching froze the page | Second Pixi context with stateful/effect recipes | Replaced with deterministic Canvas2D cue; shared compositor still renders applied recipes |
| Heavy temporal stacks freeze preview | Recursive temporal sampling | Slow-render overlay/Stop preview + heavy-stack warning; performance documented |

## 9. Known deployment limitations

1. **Protected preview.** A normal unauthenticated visitor is redirected to Vercel Authentication. Team members can sign in; automation must use the configured bypass token. This is intentional.
2. **Origin-scoped storage.** Projects saved on the preview origin are not available on `bend-gilt.vercel.app` or another preview. `.bendpkg` is the transfer/recovery mechanism.
3. **WebKit codecs.** The tested Windows WebKit build could not decode the H.264 fixture and has no video encoder. The app reports this instead of promising universal codec support.
4. **No offline PWA.** BEND is local-first in processing/storage, but the hosted page itself requires network access. No offline caching claim is made.
5. **Real group host remains absent.** `/integration` is the local reference harness only.
6. **Heavy nested temporal stack.** All four temporal effects on one layer is permitted but can take minutes at late timestamps. The UI warns and can cancel the preview; no performance guarantee is claimed.
7. **Production remains the old Phase 5.4 deployment** and still lacks Studio 2.0 routes. Promotion requires separate authorization.
