# BEND. Phase 8.1 — UX Audit

Date: 2026-10-26  
Perspective: first-time creator completing real short-form work, not a feature demo.  
Environments: clean local Chromium 1440×900 and 720×450 (200% zoom equivalent), Firefox, Windows WebKit procedural, Pixel 7 emulation. Deployed acceptance is recorded in `PHASE8_1_DEPLOYMENT.md`.

## 1. Method

- Clean browser contexts with no tutorial or documentation open.
- Real local fixtures: four video sources, audio-bearing clips, a 4.05 s music bed.
- Tasks performed: start a project, multi-import, find media again, add/reuse/replace, split, trim, ripple delete, reorder, add transitions, adjust speed, apply color/effects, add music, loop/duck, covers, save/reload, package, export.
- Findings were only recorded as fixed when re-tested in the UI and in the maintained browser suite.
- Automated checks were not treated as a substitute for the manual first-time audit.

## 2. Ranked issue inventory

### Fixed — P1

| # | Baseline issue | Creator impact | Resolution |
|---|---|---|---|
| 1 | Media import accepted one file at a time and there was no media bin. | Four shots required four separate file-picking cycles; imported sources could not be found or reused outside their clip. | Multi-file import, Media library dialog, thumbnails, type/duration/usage labels, filters, Add to V1, Replace selected, Use as music, Relink, Remove unused. |
| 2 | Every imported layer was called “Imported footage”. | Inspector title and mute/hide controls could not distinguish shots. | Layer name defaults to filename stem; media type remains visible. |
| 3 | Transition, speed, audio and color controls were buried below Transform, Crop, Appearance and Mask in the inspector. | A first-time user could not find the common editing actions and had to scroll a long panel. | Contextual selected-clip bar above V1 with Split, Duplicate, Ripple, Transition, Speed, Audio and Color. Inspector requests open/scroll/focus the target disclosure. |
| 4 | No shortcut reference; only a few undocumented shortcuts existed. | Users could not discover S, Delete, Alt+Arrow, etc. | Shortcut dialog (`?` and topbar button), documented editing/navigation/project shortcuts, `aria-keyshortcuts`, visible hints. |
| 5 | No audio waveforms. | Audio cuts were guesswork; soundtrack trim/loop boundaries were invisible. | Local waveform canvas for clip audio and music; follows trims, reverse, speed/ramp and loop timing; bounded cache. |
| 6 | No music looping. A short track simply stopped. | A 4 s bed could not support a 15–30 s edit. | Loop toggle, loop crossfade, timeline repetition boundaries, waveform repetition, export/preview timing, persistence. |
| 7 | No ducking. | Music competed with clip audio. | Optional level-driven ducking with amount/threshold/attack/release and visible `DUCK` state. |
| 8 | Clip labels and decorative overlays sat above the hit target. | Clicking a clipped or narrow clip often failed to select it; selecting across a transition could be unreliable. | Decorative overlays are `pointer-events: none`; dedicated hit target remains; overlapping clips select by uncovered region. |
| 9 | Alt+Arrow reordered twice (local clip handler and global shortcut). | One keypress could move a clip two positions and silently drop transitions; one Undo did not restore the cut. | Removed the duplicate local reorder path; global reorder is the single action. Undo restores all transitions after a reorder. |
| 10 | Slow-preview overlay buttons were not clickable because the overlay inherited `pointer-events: none`. | “Stop preview” and “Resume preview” could appear but not be clicked. | Overlay/status containers and actions receive pointer events; Stop/Resume verified with a heavy stack. |
| 11 | Frame Feedback could be created after another sampling effect, producing a false “Compositor unavailable” state. | Adding Channel Delay after Frame Feedback broke the stack and disabled playback. | Effects are inserted before Frame Feedback; unsupported order is rejected with a specific message. Unsupported imported stacks show “Temporal stack cannot render” with an Open effects action, not compositor failure. |
| 12 | Adding four temporal effects could freeze the editor for more than 15 minutes. | UI became unrecoverable; Stop preview could not run. | Bounded heavy preview, accurate `Bounded heavy preview` status, reliable Stop rendering, flat memory, full export preserved. |
| 13 | Pixi auto-played hidden preview videos. | Duplicating clips produced uncaught media play/pause `AbortError` console errors. | Video textures use `autoPlay: false`; CanvasStage owns all preview play/pause. |

### Fixed — P2

| # | Issue | Resolution |
|---|---|---|
| 14 | Primary sequence did not participate in timeline zoom. | Shared zoom applies to V1 and detail tracks; Shift+F fits; horizontal scroll verified at 200%, no page overflow. |
| 15 | No single place to compare treatment and reuse a look. | Treatment copy/paste with effect-instance and animation remapping; hold-to-compare; copy summary. |
| 16 | Color looks had no visual preview. | Six lightweight swatches tied to the actual look families. |
| 17 | Transition defaults were always 0.6 s regardless of type. | Type-specific defaults (dissolve 0.6, dip black 0.8, wipe 0.5, zoom 0.55, glitch 0.35, distortion 0.6) with real available-overlap display and clamping. |
| 18 | Cover selection had no preview and no timestamp entry in export. | Cover mode renders a full-canvas preview with an editable timestamp. |
| 19 | Reframing a multi-shot sequence required editing each clip. | Fit all / Fill all on the composition inspector. |
| 20 | Reordering could remove transitions without explanation. | Message reports how many transitions were removed and that Undo restores them. |
| 21 | Media removal appeared undoable but the blob/URL was discarded immediately. | Removal keeps the blob/URL for the open session; Undo restores the card; reference-aware cleanup runs on the next studio load. |
| 22 | Small touch targets on trim handles and music controls. | Coarse-pointer rules enlarge trim handles, music buttons and quick actions. |
| 23 | Missing media was surfaced only as a top banner. | Media library Missing filter and per-card Relink; tested by clearing local assets. |
| 24 | Import/save failure feedback was scattered or silent. | Import progress, aggregate import failures, save-failure recovery actions, timeline messages, session notices. |

## 3. Task-level friction after refinement

| Task | First-time result | Notes |
|---|---|---|
| Start a project | Clear | Empty canvas offers import, generator, example; media library now also available in topbar/Add menu. |
| Import several clips | Clear | One picker accepts multiple files; progress shows file N of M. |
| Find footage again | Clear | Media button, thumbnails, filename, duration, type and usage count. |
| Add/reuse source | Clear | Add to V1 from Media; no reimport. |
| Replace a source | Clear | Select clip, Replace selected in Media; timing preserved, following clips rippled. |
| Split at playhead | Clear with feedback | Toolbar, quick bar, S. Invalid boundary tells the user why via tooltip/notice. |
| Trim | Workable | Timeline handles + arrow keys; coarse-pointer targets enlarged. |
| Ripple delete | Clear | Quick bar, toolbar, Shift+Delete; result message. |
| Reorder | Clear | Magnetic drag and Alt+Arrow; one action per press; transitions removal is explained. |
| Add transition | Clearer | Quick Transition opens the disclosure; badge shows type + duration; duration follows type and clamps to actual overlap. |
| Adjust speed | Clearer | Quick Speed scrolls to Speed and time; pitch policy is visible. |
| Apply effects/color | Clearer | Treatment copy/paste, color swatches, hold-to-compare, reset. |
| Add music | Clear | Add menu, music lane, Media → Use as music. |
| Loop/duck | Clear | Music lane toggles/badges + composition inspector controls. |
| Preview heavy effects | Graceful | Bounded heavy preview status, Stop rendering, Resume, Draft/Full. |
| Export | Clear | Validated MP4/AAC or honest WebM fallback; range, duration, frames, audio summary, loop/duck summary. |
| Save/reopen/package | Reliable | Autosave, reload, package round-trip with new audio settings and legacy Phase 7 media. |

## 4. Interactions still intentionally constrained

- One V1 video track and one music track remain; no overlay video/PiP track.
- Media library is a modal, not a permanently docked bin.
- Transition duration is adjusted in the inspector, not by dragging the transition band.
- Waveforms are read-only; they do not support sample-level editing.
- Auto-Key can still add a keyframe when a numeric control is changed while a clip is selected.
- Ducking’s live monitor does not apply the export duck envelope; the UI states this explicitly.
- Audio speed changes still shift pitch.
- Heavy stacks show a bounded preview, not a true every-sample full preview; export remains full.
- Cover export is a PNG still, not a platform upload or embedded poster frame.

## 5. Evidence

- Baseline and after screenshots: `output/phase81-audit/`.
- First-time montage: `output/phase81-creator/01-first-montage-media.png`, `02-first-montage-edit.png`, `journey-a-contact.png`.
- Creative reel: `output/phase81-creator/03-creative-draft.png`, `04-creative-compare.png`, `05-creative-full.png`, `journey-c-contact.png`.
- Media bin: `output/phase81-audit/07-media-library.png`, `09-media-library-import.png`, `10-media-workflow.png`.
- Shortcuts: `output/phase81-audit/08-shortcuts.png`.
- Slow-path recovery: `output/phase81-stress/`.
- Transition matrix: `output/phase81-transitions/final-contact-sheet.png`.
