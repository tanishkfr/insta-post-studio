# BEND. Phase 8.1.1 — Test Report

Date: 2026-10-26  
Baseline: `release/phase-8.1-final` at `6140633d0f6aa7ede8332a51c597f84891986885`  
Implementation commit: `111948826bd01d8f801e82f2ee724e815a8c9352` on `polish/phase-8.1.1-ui`  
Preview: `https://bend-90dwz4qlp-tanishkfrs-projects.vercel.app` (`dpl_6GLVAkN8cmDiHRuQrWRzaXM5cxsU`)  
Verdict: **PASS** in the tested Chromium/Firefox desktop environment, the protected Vercel preview, and an actual Chrome 200% browser-zoom session.

## 1. Gates

| Gate | Command | Result |
|---|---|---|
| TypeScript | `npm run typecheck` | PASS |
| Unit tests | `npm test` | PASS — 19 files, 129 tests |
| Production build | `npm run build` | PASS; existing lazy `portableProject` ~652 kB warning remains |
| Maintained browser suite | `npm run test:browser` | PASS — 35 passed, 3 intentional Firefox codec skips |
| Phase 5.4 UI harness | `node tests/manual/phase5-4-ui-acceptance.mjs` | PASS — 17/17 checks, zero console/warning/page errors |
| Deployed-flow smoke on local production build | `deployed-phase8.spec.ts @full` against `npm run preview` | PASS — import, split, transition, speed, music, save/reload, validated export |
| Rendered layout audit | Playwright audit, 50 local states and 50 deployed states | PASS — 0 page overflow, 0 interactive spills, 0 overlaps, 0 clip-label collisions, ruler delta 0 |
| Zoom scroll synchronization | Audit and maintained browser test | PASS — V1 and ruler/detail `scrollLeft` stay within 2 px |
| Accessibility | Axe WCAG 2.0/2.1/2.2 A/AA, 8 states locally and on preview | PASS — 0 violations |
| Full user journey | 13 requested steps + save/export checks | PASS — 15/15 steps, 0 console/page errors on preview |
| Export validation | Player validation + independent `ffprobe` | PASS — H.264 + AAC MP4, 105 frames, 48 kHz stereo |
| Dependency state | No dependency changes in this pass | Unchanged from Phase 8.1 |

## 2. Maintained browser suite

Command: `npm run test:browser`

Final result: **35 passed, 3 skipped (38 total)**.

The 3 skips are the intentional Firefox codec-specific cases retained from Phase 8.1. The maintained suite includes five new regressions added in this pass:

- `keeps V1, ruler, and detail tracks aligned while zoomed and exposes the music lane on mobile`
- `keeps inspector navigation visible while editing scrolled sections`
- `reorders layers without dropping a hidden video layer`
- `keeps the ruler and detail timeline reachable with long clip names at compact desktop`
- `keeps the full Add menu reachable on a short viewport`

Coverage also continues to include procedural/imported editing, direct manipulation, mobile shell overflow, loop handles, multi-clip import, media library, waveforms, soundtrack loop/duck persistence, keyboard editing, cover export, image export, media removal/relink, and video export.

## 3. Rendered audit

The before/after script is `output/phase811-ui/audit.mjs`; evidence is under:

- `output/phase811-ui/before/audit.json` + 50 screenshots
- `output/phase811-ui/after/audit.json` + 50 screenshots
- `output/phase811-ui/release/audit.json` + 50 screenshots (final local production build)
- `output/phase811-ui/deployed-final/audit.json` + 50 screenshots (protected Vercel preview of the final commit)
- `output/phase811-ui/actual-zoom/actual-zoom.json` + real Chrome 200% browser-zoom screenshots
- `output/phase811-ui/deployed-final/add-menu-720x450.png` and `add-menu-720x450-scrolled.png`

### Before-state defects confirmed

- V1/detail scroll desynchronized when zoomed (`zoomScrollSynchronized=false`; ruler offset -220 px after a 220 px V1 scroll).
- 1024 px timeline controls spilled up to 124 px beyond the panel.
- Ruler offset -20 px at 820/768/390.
- Page vertical overflow at 720 × 450.
- Clip name/meta collisions on every V1 clip; transition/index collisions on an overlapping clip.
- Mobile quick actions clipped and timeline capped at 190 px with hidden overflow.
- Inspector navigation scrolled out of view after opening long sections.

### After-state measurements

- 50 rendered states at 1440×900, 1280×800, 1024×768, 820×720, 768×700, 390×844, and 720×450.
- 0 page horizontal overflows.
- 0 unexpected interactive spills in audited inspector/timeline chrome.
- 0 interactive overlaps in audited regions.
- 0 clip name/meta/badge collisions.
- 0 px ruler/lane x-position and width delta.
- V1/detail scroll synchronization true at 200% timeline zoom.
- 0 console errors; 0 page errors; 3 Chromium GPU `ReadPixels` performance warnings only.
- The same 50-state audit passed on the protected Vercel preview of the final commit with identical measurements.
- At 720×450 the Add menu is capped to the viewport and scrolls internally. The last generator item is reachable, stays inside the menu, and no page overflow is introduced.
- Representative screenshots: `deployed-final/populated-1440x900.png`, `deployed-final/populated-1024x768.png`, `deployed-final/populated-390x844.png`, `deployed-final/short-viewport-720x450.png`, `deployed-final/timeline-zoom-1440x900.png`, `deployed-final/populated-820x720.png`, `deployed-final/add-menu-720x450-scrolled.png`.
- Actual Chrome 200% browser zoom: 1440×980 window, OS scale 150%, resulting in a 713×443 CSS viewport at DPR 3.0. No page overflow, all three inspector tabs visible when opened, timeline `scrollLeft` synchronized at 120 px, and lane/ruler x positions both at -60 px after scrolling. 0 console/page errors. This was a real Ctrl+= browser-zoom session, separate from the 720×450 CSS-viewport simulation.

## 4. Accessibility

Axe scans: empty editor, populated Edit, Effects, Media Library, Shortcuts, Export, forced-colors, and mobile inspector.

Final result: **0 violations** in all eight states.

Before fixes, axe reported:

- color contrast on the new active-tab hint;
- target-size on trim handles, loop handles, and the reorder handle.

Fixes applied:

- active tab hint uses a passing text color;
- trim targets increased to 24 px;
- loop handles increased to 24 × 28 px with a thin visual marker;
- reorder target merged into the 26+ px track-label button, preserving drag and Alt+Up/Down reorder;
- keyframe/modulator targets increased to 26 px;
- zoom/monitor controls increased to 26–28 px;
- track-label target is 28 px high.

Keyboard verification:

- inspector tabs remain reachable after scrolling;
- clip activation by keyboard continues to work;
- Alt+Up/Down layer reorder works and preserves the entire layer stack;
- shortcut dialog / `?`, Tab/Shift+Tab dialog focus, Escape, and timeline keyboard paths remain covered by the maintained suite.

## 5. Full user journey

Script: `output/phase811-ui/deployed-journey.mjs`  
Evidence: `output/phase811-ui/deployed-journey/journey.json` and screenshots.  
This 15-step journey was executed end to end on the protected Vercel preview.

| Step | Result |
|---|---|
| 1. Open BEND | PASS |
| 2. Import three clips | PASS |
| 3. Arrange on timeline | PASS (pointer drag reorder exercised) |
| 4. Split | PASS |
| 5. Ripple delete | PASS |
| 6. Add transition | PASS |
| 7. Adjust clip speed to 1.50× | PASS |
| 8. Add Motion Echo effect | PASS |
| 9. Change color to Warm film | PASS |
| 10. Add music | PASS |
| 11. Adjust music gain, loop and ducking; adjust clip audio | PASS |
| 12. Add a keyframe and a second value | PASS — 2 keyframes in the X position track |
| 13. Select cover frame | PASS |
| 14. Export valid video | PASS |
| 15. Save status | PASS — Saved locally |

Final export:

- File: `output/phase811-ui/deployed-journey/bend-project-7a927599-c23d-482f-a024-daec373e12a7.mp4`
- Size: **506,673 bytes**
- Container: MP4 (`ftyp`)
- Video: H.264, **720 × 900**, 30 fps, 105 frames, 3.477 s
- Audio: AAC, 48 kHz stereo, 163 frames
- Export summary: **3 clip sources + music · ducked**
- Full `ffmpeg` decode succeeded; 0 console errors, 0 page errors

## 6. Source/runtime preservation

The pass did not change:

- project schema or persistence format;
- timeline time mapping;
- Pixi compositor architecture;
- export pipeline or audio mixer;
- undo/redo semantics;
- clip editing operations;
- `.bendpkg` packaging;
- Vercel configuration.

The layer-reorder implementation was hardened to operate on the full stack. The previous visible-row-only rebuild could drop a hidden video layer; a browser regression now covers that case. A separate stored-project probe confirmed three layers before and after pointer and Alt+Arrow reordering, including the inactive video layer.

## 7. Remaining limitations and risks

- 720 × 450 and the actual 200% browser-zoom viewport are usable through internal timeline scrolling, not a full-height lane view.
- The real 200% browser-zoom run used a 1440×980 Chrome window at 150% OS scale (713×443 CSS, DPR 3.0). It is a desktop Chromium result, not a physical-device or assistive-technology session.
- Manual screen-reader (NVDA/JAWS/VoiceOver), physical touch, Safari/macOS, and hardware GPU checks remain outside this pass.
- The current single-V1, single-music-track product scope is unchanged.
- Deep temporal stacks remain slow at full export fidelity; the UI now avoids mislabeling ordinary slow renders as temporal stacks.
- No new dependency was added, and the existing 652 kB lazy package chunk warning remains.

## 8. Deployed verification

The preview used for this report is the protected Vercel Git deployment of the implementation commit:

- URL: `https://bend-90dwz4qlp-tanishkfrs-projects.vercel.app`
- Deployment: `dpl_6GLVAkN8cmDiHRuQrWRzaXM5cxsU`
- Stable branch alias: `https://bend-git-polish-phase-811-ui-tanishkfrs-projects.vercel.app`
- Git source: `polish/phase-8.1.1-ui` at `111948826bd01d8f801e82f2ee724e815a8c9352`
- Target: `preview`; state: `READY`; Vercel Authentication: `all_except_custom_domains`
- Build log: `Cloning github.com/tanishkfr/Bend (Branch: polish/phase-8.1.1-ui, Commit: 1119488)`; asset hashes match the local production build.

Results:

| Deployed check | Result |
|---|---|
| Deployed smoke across Chrome, Edge, Firefox, Windows WebKit | 31 passed, 1 intentional WebKit video-codec skip |
| Mobile Pixel 7 / `@mobile` | 2 passed |
| Protected-preview 50-state visual audit | PASS — 0 overflow, spills, overlaps, label collisions, or ruler deltas |
| Protected-preview axe scan, 8 states | 0 violations |
| Protected-preview creator journey | 15/15 steps, 0 console/page errors |
| Add menu at 720×450 | Scrollable, last generator reachable, menu bottom 438 px, no page overflow |
| Actual Chrome 200% browser zoom | PASS — 713×443 CSS, DPR 3.0, no page overflow, synchronized scrolling |
| Export inspection | H.264 + AAC MP4, 720×900, 105 frames, 3.477 s, full decode OK |
| Production | Unchanged at `dpl_69htoYbLyFNLqJYPmsJMZE6YGk9o` (`bend-gilt.vercel.app`) |

## 9. Git and release state

- Baseline branch: `release/phase-8.1-final` at `6140633d0f6aa7ede8332a51c597f84891986885`.
- Working branch: `polish/phase-8.1.1-ui`.
- Implementation commit: `111948826bd01d8f801e82f2ee724e815a8c9352` — includes the Phase 8.1.1 UI pass and the final short-viewport Add menu fix.
- Pull request: `https://github.com/tanishkfr/Bend/pull/1` targeting `release/phase-8.1-final`; open, not merged.
- GitHub Actions: run `40316190497` — typecheck, 129 unit tests, production build, and 35-pass maintained browser suite passed. The first attempt was cancelled during an unusually slow Playwright/apt dependency download; the rerun passed.
- No force-push, merge, production deployment, production alias change, or deployment-protection change was made.
- This report and the UI audit are updated in a docs-only closure commit after the implementation commit; the preview app source remains the implementation commit above.
