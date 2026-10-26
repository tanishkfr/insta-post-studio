# BEND. Phase 8.0 — Deployment Record

Date: 2026-10-26  
Vercel project: `bend`  
Project ID: `prj_rC1ESKcsrETeM33dTQI77QHIQdUS`  
Team: `tanishkfrs-projects` (`team_VOeLK7yFGO2OfGuEOsffIywY`)  
Preview URL: `https://bend-7osa45a8v-tanishkfrs-projects.vercel.app`  
Deployment ID: `dpl_8rb7hZUfA5Fq59kDDnbGZYoTKy5p`  
Target: `preview`  
State: `READY`  
Created: 2026-10-26 00:54 IST  
Inspector: `https://vercel.com/tanishkfrs-projects/bend/8rb7hZUfA5Fq59kDDnbGZYoTKy5p`

Production was **not** changed.

## 1. Production status

`https://bend-gilt.vercel.app` still resolves to the Phase 5-era production deployment:

- Deployment: `dpl_69htoYbLyFNLqJYPmsJMZE6YGk9o`
- Alias: `bend-gilt.vercel.app`
- Production status: READY
- Production source: older than the Phase 7/8 working tree

No `vercel --prod`, promote, alias, git push, tag, or release was performed.

## 2. Source identity

- Local Git HEAD: `343260bb048a111475216ef2141eb5b89144de75`
- Local `main` is one commit behind `origin/main` (`1cfbe6f`); no pull/reset/rebase/merge was performed.
- Working tree was already dirty in Phase 7 and now contains the complete Phase 8 implementation.
- Exact source manifest: `docs/PHASE8_0_SOURCE_IDENTITY.json`.
- Uploaded/runtime source manifest: `docs/PHASE8_0_DEPLOYED_SOURCE_IDENTITY.json`.
- Pre-implementation recovery snapshot was created outside the repository at `C:\Dev\Bend-Recovery\phase8-pre-20261025-224217` with a SHA-256 manifest and working-tree diff.
- A final recovery snapshot is recorded in `PHASE8_1_HANDOFF.md`.

The deployed preview was built by Vercel from 82 uploaded files. `npm ci` completed, `npm run build` completed (Vite 7.3.7, 2847 modules), and the deployment reached READY. TypeScript was included in the build command (`tsc --noEmit && vite build`).

## 3. Vercel configuration

`vercel.json`:

- Framework: Vite.
- Install: `npm ci`.
- Build: `npm run build`.
- Output: `dist`.
- Rewrites for `/studio`, `/studio/edit`, `/integration`.
- Immutable hashed assets.
- `X-Content-Type-Options: nosniff`.
- `Referrer-Policy: strict-origin-when-cross-origin`.

`.vercelignore` excludes tests, fixtures, docs, local evidence, browser profiles, and generated outputs from upload. The deployment therefore contains runtime source, package metadata and configuration, not acceptance media.

Deployment protection remains enabled (`all_except_custom_domains`). The existing automation bypass secret was used from outside the repository; it was not written into source, reports, screenshots or browser evidence. The bypass header is used only to bootstrap the scoped cookie, then page/asset requests use the cookie.

## 4. Build result

- Install: PASS (`npm ci`, 194 packages).
- Build: PASS (`tsc --noEmit`, `vite build`, 2847 modules).
- Bundle output included the main editor, lazy exporter and lazy package chunks. The existing ~650 kB `portableProject` chunk warning remains; it is not the initial editor route.
- Deployment target remained `preview`; production alias unchanged.

## 5. Browser versions used

| Browser | Version | Source |
|---|---:|---|
| Chrome | 155.0.8059.85 | Installed Chrome channel |
| Edge | 156.0.4314.42 | Installed Edge channel |
| Firefox | 157.0 | Playwright Firefox |
| WebKit | 27.2 | Playwright WebKit on Windows |
| Mobile | Pixel 7 emulation | Playwright |

Real macOS Safari hardware was unavailable. WebKit/Windows limitations below are not generalized to macOS Safari.

## 6. Deployed acceptance performed

Commands (from repository root, with `BEND_DEPLOY_URL` and `BEND_VERCEL_BYPASS` set):

```powershell
npx playwright test -c playwright.deployed.config.ts tests/deployed/deployed-phase8.spec.ts --grep '@smoke|@full'
```

Result: 5 passed — Chrome smoke, Chrome full media edit/export, Edge smoke, Firefox smoke, WebKit smoke.

Additional final-preview creator runs:

- Project A: 4 clips, 3 transitions, 15.00 s, 1080×1920, 450 frames, H.264/AAC, cover 8.00 s.
- Project B: 3 clips, freeze + slow motion + Motion Echo + Flow + animated mask, 10.00 s, 720×1280, 300 frames, MP4/AAC.
- Project C: 7 clips, 2 transitions, music at −14 dB, 30.00 s, 720×1280, 900 frames, MP4/AAC, cover 15.00 s.
- Project D: Phase 7 package exact frame hash preserved, edited package restored, 10.40 s, 312 frames, MP4/AAC.
- Reverse export: 6.00 s, 180 frames.
- Speed-ramp export: 4.80 s, 144 frames.
- Cover PNG: 1080×1920, 15.00 s cover frame.
- Deployed editing probe: split, ripple delete, Alt+Arrow reorder, save/reload.

Direct URL refresh was verified through the deployed routing suite and manual page reloads. Automation tested the previewed build, not production.

## 7. Media inspection

Final deployed artifacts are in `output/acceptance/`:

| File | Size | Container | Video | Audio | Frames | Duration |
|---|---:|---|---|---|---:|---:|
| `final-deployed-project-a.mp4` | 11,619,370 B | MP4 | H.264 1080×1920 30 FPS | AAC 48 kHz stereo | 450 | 15.00 s |
| `final-deployed-project-b.mp4` | 2,025,682 B | MP4 | H.264 720×1280 30 FPS | AAC 48 kHz stereo | 300 | 10.00 s |
| `final-deployed-project-c.mp4` | 4,475,027 B | MP4 | H.264 720×1280 30 FPS | AAC 48 kHz stereo | 900 | 30.00 s |
| `final-deployed-project-d.mp4` | 1,328,446 B | MP4 | H.264 720×1280 30 FPS | AAC 48 kHz stereo | 312 | 10.40 s |
| `final-deployed-project-c-cover.png` | 211 KB equivalent | PNG | 1080×1920 | — | 1 | 15.00 s frame |

The deployed Project C audio was decoded to 48 kHz mono and checked with RMS + Goertzel measurements at each shot and the slow-motion shot. All expected tones were present and transition sections showed both-source crossfade behavior. Head and tail were not silent.

Audio/visual timing was not inferred from metadata alone.

## 8. Browser-specific results

- **Chrome:** full import/edit/transition/speed/freeze/reverse/ramp/audio/color/package/export acceptance. MP4/H.264 + AAC.
- **Edge:** direct load/refresh and procedural workflow. Export codec check also produced MP4/H.264 + AAC.
- **Firefox:** direct load/refresh and procedural workflow; full local edit and a deployed-style WebM export were checked. Firefox lacks an AAC encoder here, so MP4 export correctly falls back to WebM/VP9 + Opus. Firefox emitted WebGL warnings and an AVC SPS console message while decoding an H.264 fixture; output frames were valid. No universal MP4 claim.
- **WebKit (Windows):** direct load/refresh/procedural PNG workflow passed. It cannot decode the test H.264/WebM video files in this environment and cannot provide a supported local video encoder. The app reports the failure and keeps the procedural workflow usable. This is a runtime capability limitation, not a production Safari claim.
- **macOS Safari:** not tested; marked BLOCKED.
- **Mobile:** Pixel 7 emulation verified no horizontal overflow, sequence/music lanes, and inspector access. Physical touch not tested.

## 9. Remaining runtime limitations

1. WebKit/Windows video codec coverage is absent. Real macOS Safari and hardware encode remain unverified.
2. Firefox output is WebM when AAC is unavailable; some social platforms may prefer/require MP4.
3. Heavy nested temporal-effect stacks remain below real-time; this phase did not rewrite the temporal renderer.
4. Safe-area guides are approximate and do not track platform UI changes automatically.
5. Audio is mixed at 48 kHz without LUFS normalization or a dedicated limiter beyond peak safety trim.
6. One V1 video track and one soundtrack; no detached audio, ducking, looping music, or waveform view.
7. Screen-reader and physical-touch manual sessions remain incomplete.
8. Production is still the older build. Promotion requires separate authorization.
9. The preview is protected by Vercel Authentication; local/IndexedDB projects do not automatically cross origins. `.bendpkg` remains the portable path.

No server-side renderer, cloud encoder, hosted AI, paid API, or production alias change was introduced.
