# BEND. Phase 8.0 — Creator Audit

Date: 2026-10-26  
Perspective: a creator attempting a finished short-form video, not a feature demonstrator.  
Evidence: `output/acceptance/` plus the final preview URL and deployment in `PHASE8_0_DEPLOYMENT.md`.

## 1. Verdict as a creator

A complete multi-clip short-form video can now be made in BEND without leaving the browser:

- import several videos;
- split/trim and ripple-edit;
- reorder magnetically or place freely;
- add transitions, speed, freeze, reverse and speed ramps;
- mix clip audio and a local music track;
- finish color with real controls;
- reframe in 9:16, 4:5, 1:1 or 16:9;
- choose a cover;
- validate and download MP4/AAC or a supported WebM fallback;
- reload the editable project or move it in a `.bendpkg`.

The workflow is substantially more credible than Phase 7. The limiting factors are now scope choices (one primary video track, no waveform, one music track), not missing core editing operations.

## 2. Acceptance projects

### Project A — 15-second product teaser

**Result:** PASS.

- Four vertical product-like clips.
- Split first shot, removed tail, ripple closed.
- Three transitions: dissolve, wipe and zoom.
- 1.25× speed on one shot.
- Warm-film color finish on the second shot.
- Signal Field procedural layer over the sequence, screen blend, reduced opacity.
- Source audio across all four clips.
- Cover at 8.00 s.
- 9:16 1080×1920 high-quality export: 450 frames, 15.00 s, H.264 + AAC, 11.08 MB.
- Editable package round-tripped.

Evidence: `project-a-product-teaser.bendpkg`, `final-deployed-project-a.mp4`, `project-a-edit.png`, `project-a-final-frames.png`.

**Creator friction:** the Signal Field overlay is visually dominant at screen blend; a creator would lower it further or mask it. The product cards are readable, but the style leans experimental. That is BEND’s identity rather than a functional failure.

### Project B — 10-second experimental Reel

**Result:** PASS.

- Imported footage split into three segments.
- 0.5× slow motion on two segments.
- A genuine freeze frame in the middle.
- Motion Echo temporal effect.
- Flow procedural layer over the cut, screen blend.
- Ellipse mask with two mask-width keyframes (0.00 s → 6.00 s).
- Loop enabled over the full 10 s.
- Cover at 4.00 s.
- Export: 300 frames, 10.00 s, H.264 + AAC, 720×1280.
- Editable package restore preserved clips, loop, mask type, two mask keyframes, effect stack and cover.
- Freeze portion is silent by policy; message is visible in the result.

Evidence: `project-b-experimental-reel.bendpkg`, `final-deployed-project-b.mp4`, `project-b-edit.png`, `project-b-frames.png`.

**Creator friction:** after an auto-keyed opacity change, there was an extra opacity keyframe at 0.02 s that was not part of the mask story. It is harmless but demonstrates why Auto-Key should stay a deliberate mode for some creators. The overlay animation itself is clear.

### Project C — 30-second event recap

**Result:** PASS.

- Seven timeline clips from six imported videos.
- Split one shot; reordered the final shot with Alt+Arrow.
- 0.8× slow motion on one shot.
- Two transitions: dissolve and wipe.
- Clip audio from all clips with fade-in/fade-out on outer shots.
- 32 s local music bed at −14 dB, 1 s fade-in and 2 s fade-out.
- Cover at 15.00 s.
- 9:16 export: 900 frames, 30.00 s, H.264 + AAC, 720×1280.
- Deployed audio inspection measured the expected source tone in each section and the slow-motion-pitch-shifted tone; head/tail were not silent.

Evidence: `project-c-event-recap.bendpkg`, `final-deployed-project-c.mp4`, `final-deployed-project-c-cover.png`, `project-c-edit.png`, `final-deployed-project-c-audio.json`.

**Creator friction:** the content is deliberately synthetic test-pattern/event imagery rather than a real event. The edit, timing and mix are real; visual storytelling would benefit from actual event footage. The 30-second output exceeded the length of the 20/32 s music only by none (the final source is 32 s), so no music-loop UI was needed. A real recap with a shorter track would expose the missing soundtrack loop feature.

### Project D — Legacy compatibility

**Result:** PASS.

- Opened Phase 7 `project-a-experimental-reel.bendpkg`.
- Preserved 1080×1920, six-second legacy composition, Signal Field overlay, blend/mask/effects and original placement.
- Added a new clip.
- Applied a transition into it.
- Split it.
- Saved, reloaded, downloaded a new package, restored in a fresh context.
- Final package retained three clips, one transition, cover 7.20 s.
- At exactly 2.00 s, the legacy canvas PNG had the same SHA-256 before and after the round trip:
  `1d62044d209e74a95eea6c714f2b4d631542771d3bdfb46b757246ee5acdd4c6`.
- Re-exported 10.40 s, 312 frames, H.264 + AAC.

Evidence: `project-d-legacy-edited.bendpkg`, `final-deployed-project-d.mp4`, `project-d-exact-before.png`, `project-d-exact-after.png`, `final-deployed-project-d.png`.

## 3. Confusing interactions found and fixed

| Issue | Creator impact | Fix |
|---|---|---|
| Imported clips collapsed to 0.1 s when the inspector media metadata contained an undefined duration | Could not split/trim/export sensible clips | Omit undefined duration; preserve probe duration |
| MP3 soundtrack imported as 0.1 s | Music vanished almost immediately | Fixed audio probe cleanup order; require real duration |
| Vertical 9:16 canvas made the social toolbar overflow a narrow canvas | Guides/cover controls could not be clicked | Moved toolbar outside the clipped canvas frame |
| First-run guide covered mobile social controls | New mobile user could not reach setup | Hidden on compact screens |
| Timeline panel clipped the primary sequence at 720 px height | Split/sequence toolbar was partly inaccessible | Responsive 340–400 px timeline, wrapped toolbar, scrollable detail area |
| Timeline looked like duplicate clip rows | Video sequence and layer detail competed | Video detail rows only show selected clip; primary sequence is the main lane |
| Selection handles appeared for a clip not active at the playhead | Confusing which shot was being edited | Selection overlay hidden outside the active time range; selecting a clip seeks to it if necessary |
| Transition audio message duplicated on success | Result looked noisier than necessary | Removed mixed-audio duplication |
| Crossfade looked darker than expected | Both source alphas faded against the background | Outgoing shot now stays opaque under source-over incoming |
| H.264/Opus MP4 was produced in Firefox | Not broadly social-media compatible | AAC required for MP4; WebM fallback |
| “Export validated” appeared for PNG | False verification wording | Still dimensions decoded/validated; stills show “Export complete” |

## 4. Remaining UX friction

- **One video track only.** This is fast and predictable for short-form montage, but creators cannot stack picture-in-picture video without misusing the old layer model.
- **No waveform.** Audio presence/gain/fades are visible, but precise cut-to-beat editing requires listening and guessing.
- **One soundtrack.** No music looping or ducking; a music bed shorter than the edit simply ends.
- **Transitions live in the inspector**, not as draggable handles at the cut. This is discoverable via the badge but slower than an NLE.
- **Cover export is a PNG still**, not a platform upload or a video with an embedded poster frame.
- **No media bin.** Assets are visible through clip labels, but source ownership/reuse is not a first-class panel.
- **Speed is not pitch-preserving.** Slow motion is visually useful but audio may sound pitched down/up.
- **Freeze audio is silent.** The policy is explicit but not creatively interchangeable with a held sound design.
- **Safe guides are approximate.** They are not platform guarantees and may become stale as Instagram changes its UI.
- **Heavy temporal stacks remain slow.** A simple montage is responsive; adding stacked stateful effects can still make scrub/export slow.
- **Auto-Key may create extra keyframes** when an opacity/color control is changed while a clip is selected. Undo is available, but the behavior can surprise.

## 5. Interaction quality

Working and verified:

- Clear selection persistence and focus-visible states.
- S split, Delete, Shift+Delete ripple, Alt+Arrow reorder, space playback.
- Undo/redo for split, transition, speed, color, audio, cover and guides.
- Save/reload and package round-trip.
- Music lane MIX opens composition settings.
- Export policy text before rendering; validation details after.
- Empty state explains that imports are added end to end.
- Magnetic snapping toggle has visible on/off copy and Shift bypass.

Still weak:

- There is no drag-and-drop media bin; import remains a topbar/file-picker action.
- The sound mix is only monitorable after enabling Audio Monitor (intentional due autoplay and to avoid surprise sound).
- Source audio reverse/speed policy is in small fine print rather than a warning modal.
- Transition duration consumes timeline overlap, so creators expecting “same length” transitions should watch the total duration change.

## 6. Creator acceptance conclusion

For the first time, BEND can credibly complete a short-form edited video: the content, timing, audio and cover survive a deployed export and a portable editable package. The strongest workflow is conventional shot assembly plus BEND’s procedural/mask/color identity. The next creator-product priority is not more effects; it is media organization, waveforms, and multi-track overlay video.
