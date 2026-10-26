# BEND. Phase 8.0 — Implementation

Date: 2026-10-26  
Checkout: `C:\Dev\Projects\Bend`  
Git HEAD: `343260bb048a111475216ef2141eb5b89144de75` (dirty working tree, one commit behind `origin/main`)  
Production alias: unchanged  
Deployed preview: `https://bend-7osa45a8v-tanishkfrs-projects.vercel.app` (deployment `dpl_8rb7hZUfA5Fq59kDDnbGZYoTKy5p`)  
Preview target: `preview` only; production remains `dpl_69htoYbLyFNLqJYPmsJMZE6YGk9o` at `https://bend-gilt.vercel.app`.

This record describes the implementation that was actually exercised, including the failures found during creator acceptance and the fixes applied before the final build.

## 1. Workstream 8A — multi-clip timeline

Implemented:

- Schema 3 clip metadata on video layers: track, playback, audio, incoming transition.
- Primary `V1` magnetic sequence lane with per-clip thumbnails, source names, trim handles, transition badges, audio badges, speed/freeze/reverse badges, cover marker, and a music lane.
- Split at playhead (`Scissors`, `S`) with source-time continuity, animation split/rebase, effects retention, audio fade boundary handling, shared source identity, and downstream transition re-pointing.
- Ordinary delete, ripple delete, close gap, duplicate, keyboard-accessible reorder (Alt+Left/Right), magnetic drag reorder, free placement with snapping off/Shift, and snap toggle.
- Lazy local thumbnails with one shared video decoder/canvas and a bounded cache.
- Zoom-to-fit and horizontal timeline scrolling.
- Compensating ripple on primary-track trim/speed changes when snapping is active.
- Clear empty states and timeline guidance.

Rules are documented in `PHASE8_0_ARCHITECTURE.md`. Overlay/procedural layers and music are not shifted by video ripple operations.

## 2. Workstream 8B — transitions and time

Implemented:

- Dissolve, black dip, directional wipe, zoom, signal split (glitch), and wave dissolve (distortion).
- Transition duration/direction/intensity/easing, undoable apply/update/remove.
- Genuine overlap transitions with no invented source handles. The real overlap is normalized and rendered on both sides.
- Constant speed 0.25×–4×.
- Reverse picture and reversed source audio, explicitly reported.
- Editable freeze frame with chosen source timestamp and duration; freeze audio policy is silent and visible.
- 2–6 point speed ramps with monotonic source mapping, split-curve support, deterministic sampling, and explicit pitch-shift policy.
- Shared transition shaders and one compositor for preview/export.
- Range rounding so full ranges produce exact frame counts (15.00 s at 30 FPS = 450 frames).

## 3. Workstream 8C — audio

Implemented:

- Per-clip audio enable/mute, gain, fade in/out.
- Full local audio mix of every audible clip and the optional soundtrack, including overlapping transition crossfades.
- Deterministic source sampling that follows trim, speed, ramp, reverse and freeze policy.
- Background music import from local MP3/M4A/WAV/OGG/FLAC/WebM-compatible files with true-duration probing.
- Soundtrack timeline move/trim, gain, mute, fade in/out, remove; mix settings accessible from the music lane (`MIX`) and composition inspector.
- Preview audio monitor (off by default) for clip audio, transition gains and soundtrack, including fades.
- Master trim only if peak > 0.98; no silent source discarding.
- Explicit freeze-frame silence, reverse-audio reversal, and speed-resampling/pitch policy in UI and result messages.

## 4. Workstream 8D — finishing

Implemented:

- Existing brightness/contrast/saturation/hue retained and normalized.
- Temperature, tint, highlights, shadows, vignette, film grain and sharpen in the shared color shader.
- Six real-control looks: Clean contrast, Warm film, Cool editorial, Soft fade, High-contrast mono, Analog grain.
- Looks replace values; undo restores; sources never change.
- Color values animate using the existing keyframe system.
- The color shader applies the four legacy controls first to reduce legacy appearance drift, then extended finish controls.

## 5. Workstream 8E — social delivery

Implemented:

- 9:16, 4:5, 1:1 and 16:9 canvas presets.
- DOM-only safe guides (title, approximate caption zone, thirds) and an all-guides toggle.
- Cover timestamp, “Go to cover”, on-canvas cover badge, persisted cover metadata.
- Cover PNG and current-frame PNG export at full canvas, validated by decoding the PNG dimensions.
- Social video profiles, quick preview, full/loop range, high quality, cover and still exports.
- MP4/H.264 + AAC where the runtime supports it. If AAC is not encodable, BEND chooses WebM with VP9/VP8 + Opus rather than producing an H.264/Opus MP4.
- Post-encode validation: reopens the file, verifies video dimensions, duration, frame count, first timestamp, audio presence, audio duration, and rejects invalid output.
- Independent title + phrase in UI: still exports say “Export complete”; videos say “Export validated” only when validation ran.

## 6. UI implementation

- Added a “Primary sequence” lane above the existing detailed layer rows. Video detail rows are shown only for the selected video plus procedural layers, which keeps the timeline from becoming a wall of duplicate clip rows.
- Added clip editing tools (split, delete, ripple delete, close gap, duplicate, snap) and keyboard shortcuts (`S`, Delete, Shift+Delete).
- Added contextual Speed & time, Transition in and Clip audio disclosures in the inspector.
- Added timeline trim keyboard support and focus-visible clip target.
- Replaced nested interactive timeline clip markup with a group + dedicated select button + sibling trim/transition buttons.
- Covered the 720 px-tall desktop layout with a taller timeline allocation and aligned toolbar; hid the first-run guide on compact screens so it cannot block social controls.
- Mobile toolbar wraps, sequence lane and music lane remain reachable, and there is no horizontal page overflow at 390 px.
- Export dialog now surfaces output aspect, validation metadata, audio duration and messages.
- Audio monitor toggle is in the sequence header.

## 7. Defects found and fixed during acceptance

| Defect | Root cause | Fix |
|---|---|---|
| Imported media duration could collapse to 0.1 s | `inspectMediaFile` spread a `duration: undefined` field over the probed asset duration | Omit duration for video; only include audio-only computed duration |
| MP3 soundtrack was 0.1 s long | `probeAudio` read `audio.duration` after `finish()` had removed the source | Capture duration before cleanup |
| 15 s export produced 451 frames | Unrounded range duration produced `ceil(450.000… )` | Round start/end to 6 decimals before frame counting |
| Dissolve double-darkened the frame | Both outgoing and incoming sprites faded independently | Leave outgoing opaque under source-over incoming |
| Transition could span more than actual clip coexistence | Stored transition duration was not reconciled after timing edits | Normalize duration to real overlap |
| Firefox wrote H.264/Opus MP4 | First encodable audio codec selected regardless of container interoperability | Require AAC for MP4; fall back to WebM |
| Timeline clipped at 720 px height | Fixed 216 px timeline row | Responsive 340–400 px allocation, wrapped tools, internal detail scroll |
| Social controls blocked on narrow canvas | Absolute toolbar inside an overflow-hidden small frame | Moved toolbar outside the frame |
| First-run guide covered mobile toolbar | Guide overlay at top of workspace | Hide guide on compact screens |
| Axe serious nested-interactive violation | Clip container was a button containing trim/transition buttons | Clip is now a group with a full-card select button and sibling controls |
| Selection handles shown for inactive clip | Canvas checked only active layer, not active time | Selection only appears when layer is active at playhead |
| Still export claimed “validated” without validation | UI reused video wording | PNG dimensions decoded/validated; still wording changed |
| Soundtrack asset IDs not remapped in package restore | Asset remap only rewrote layer references | Remap soundtrack asset reference too; validate package soundtrack asset |

## 8. Main files added/changed

Added:

- `src/engine/core/timeMapping.ts`
- `src/engine/editing/operations.ts`
- `src/engine/transitions/transition.ts`
- `src/features/editor/SequenceTimeline.tsx`
- `src/features/editor/thumbnailService.ts`
- `tests/unit/phase80.test.ts`
- `tests/browser/phase8.spec.ts`
- `tests/deployed/deployed-phase8.spec.ts`
- `tests/fixtures/music-bed-4s.mp3`
- `scripts/deployment-identity.mjs`

Substantially changed:

- `src/engine/core/types.ts`, `project.ts`, `timeline.ts`
- `src/engine/render/pixiRenderer.ts`, `shaders.ts`
- `src/engine/export/exporter.ts`, `range.ts`
- `src/engine/media/media.ts`
- `src/engine/package/portableProject.ts`, `bendPackage.ts`
- `src/app/store.ts`
- `src/features/editor/EditorPage.tsx`, `Inspector.tsx`, `Timeline.tsx`, `CanvasStage.tsx`, `ExportDialog.tsx`
- `src/styles/global.css`
- `tests/unit/project.test.ts`, `timeline.test.ts`, `exporter.test.ts`, `media.test.ts`
- `tests/browser/studio2.spec.ts`
- `scripts/source-identity.mjs`
- `package.json`, `playwright.config.ts`

Preserved without removal: Signal Field, Liquid, Flow, Refraction, wave displacement, four temporal effects, masks, blends, keyframes, easing, modulators, recipes, effect clipboard, replace source, range exports, before/after, deterministic randomization, and existing project management.

## 9. Scope decisions

- One magnetic primary video track, not an arbitrary multi-track NLE.
- Audio is clip-linked; no detached audio clips or sample editor.
- One music track, no looping/repeat mode.
- No waveform rendering; audio presence/gain/fades are explicit rather than simulated waveform interaction.
- Transition duration consumes real overlap and shortens the sequence; there is no hidden-handle auto-extension.
- Freeze holds picture and mutes that portion’s audio rather than inventing held sound.
- Reverse audio is reversed with the picture; speed changes resample audio and are explicitly not pitch-preserving.
- No loudness normalization target or limiter beyond the safety master trim.
- No platform upload, auth, server encode, or hosted AI.
