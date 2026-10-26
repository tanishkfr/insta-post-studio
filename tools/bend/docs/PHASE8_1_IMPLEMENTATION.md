# BEND. Phase 8.1 — Implementation

Date: 2026-10-26  
Repository: `C:\Dev\Projects\Bend`  
Git branch: `main`  
Git HEAD: `343260bb048a111475216ef2141eb5b89144de75` (unchanged; working tree remains dirty)  
Pre-edit recovery snapshot: `C:\Dev\Bend-Recovery\phase81-pre-20261026-012952`  
Phase 8.0 final snapshot (verified usable): `C:\Dev\Bend-Recovery\phase8-final-20261026-010939`  
Deployed preview: `https://bend-ktf5bn98p-tanishkfrs-projects.vercel.app` (`dpl_YKPcLjzeFajGRZ7WLv7Nv3GrKcba`, target `preview`, READY)  
Production: `https://bend-gilt.vercel.app` (`dpl_69htoYbLyFNLqJYPmsJMZE6YGk9o`, unchanged)

No commit, push, tag, release, or production promotion was performed. Phase 8.0 source and the full Phase 7/8 working tree were preserved before any edit. This checkout is a dirty working tree containing both the uncommitted Phase 8.0 implementation and the Phase 8.1 refinement.

## 1. What Phase 8.1 changed

Phase 8.1 is a refinement of the existing Phase 8.0 editor, not a new editor or a visual rebrand. The Pixi compositor, clip model, exporter, V1 sequence, and creative engine remain shared. Changes are additive and user-facing.

### 8.1A — First-time editing experience

- Added a local **Media library** dialog with:
  - multiple video/audio import, separate from timeline auto-append;
  - source thumbnails or audio glyph, filename, duration, type, resolution and usage count;
  - filters for All, Video, Audio, Unused and Missing;
  - Add to V1, Replace selected, Use as music, Relink and Remove unused;
  - clear distinction between referenced, unused and missing sources;
  - “source files are never uploaded” local-only messaging.
- Imported layer names now use the source filename stem instead of the generic `Imported footage` text. The inspector still identifies the media type as “Imported footage”.
- Added a selected-clip quick-action bar above V1: Split, Duplicate, Ripple, Transition, Speed, Audio and Color. Transition/speed/audio/color open and scroll to the matching inspector disclosure.
- Added a discoverable shortcut reference (`?` or the keyboard button). Shortcuts cover split, delete, ripple delete, undo/redo, play/pause, zoom fit, duplicate, edit-point navigation and media library.
- Added timeline zoom to the primary sequence as well as the detail tracks. Shift+F returns to fit.
- Fixed clip hit-testing: decorative labels, thumbs and waveforms no longer intercept pointer selection; overlapping transition clips can be selected by their uncovered region.
- Added feedback for invalid splits, transition-feedback errors, removed transitions after reorder, movement/snapping, imports, save failure and media operations.
- Unused media removal is undoable for the open session. Its blob is retained until a later studio load, when reference-aware cleanup can safely reclaim it.

### 8.1B — Audio

- Added locally decoded, downsampled waveform peaks for:
  - audio-bearing video clips, following trims, reverse and speed/ramp mapping;
  - the soundtrack, including repeated loop regions.
- Waveform analysis is asynchronous, serialized, cancellable by subscriber release, and cached by asset URL. It uses 256–4096 buckets at roughly 32 buckets/second, a 2 kHz peak-sampling stride and a 900-second bound. The cache holds at most 24 results. Raw full-rate samples are never placed in the DOM.
- Added soundtrack looping:
  - one source blob, timing-only repetition;
  - loop through the composition end with a correct final partial repeat;
  - optional 0–0.25 s equal-power boundary crossfade;
  - waveform and timeline repetition boundaries;
  - export and preview follow the same loop mapping;
  - persisted in project/IndexedDB/`.bendpkg`.
- Added optional level-driven music ducking:
  - disabled by default;
  - sidechain is the audible clip mix, not speech detection;
  - configurable amount, threshold, attack and release;
  - 20 ms RMS analysis with deterministic attack/release smoothing;
  - applies only to the exported music mix, never rewrites source audio;
  - visible `DUCK` badge and inspector state.
- Audio fades, transition crossfades, reverse, freeze policy, speed resampling and peak safety retain the Phase 8.0 contract. Pitch preservation remains deferred (see §7).

### 8.1C — Creative workflow

- Added copy/paste of a **treatment** between clips: temporal effects, color, mask, blend, wave, and compatible animation tracks.
- Effect instances and animation track/keyframe identities are remapped on paste, preventing aliases across clips. Transform/timing/source are preserved.
- Added a global hold-to-compare control in the treatment section.
- Added color-look swatches and kept look values, reset and undo behavior.
- Transition defaults now follow the selected transition type. The inspector shows the available real overlap and clamps duration to it. Applying all six types, reorder, undo, split rejection and reverse/speed source behavior were re-exercised.
- Added Fit all / Fill all reframing and a cover preview with editable timestamp in the export dialog.
- Export dialog now summarizes loop repetitions, ducking, clip source count, duration, frame rate and aspect.

### 8.1D — Performance

- Added an explicit **Draft / Full** preview quality choice. Draft lowers preview backing resolution to 0.5 without modifying the project; export always renders full quality.
- Added a bounded heavy-preview safety path for pathological nested temporal stacks:
  - echo samples cap at 2, time-slice slices cap at 4, and Frame Feedback preview replay is reduced to the current frame;
  - procedural temporal sampling is rendered at half resolution;
  - a visible `Bounded heavy preview` status reports last frame time and provides a reliable Stop rendering control;
  - export uses the original full stack.
- This corrects the measured 4-effect freeze. Before the safety path, a nested Motion Echo + Time Slice + Frame Feedback + Channel Delay preview locked the main thread for more than 15 minutes. After it, observed heavy frames were ~0.88–0.92 s, Stop/Resume worked, memory stayed flat, and a simple sequence exported normally.
- Pixi video textures no longer auto-play the hidden preview video elements. Preview playback is owned only by `CanvasStage`; this removes the uncaught play/pause `AbortError` seen when clips were duplicated.
- Autosave is suppressed during pointer gestures and scheduled once on gesture end. Save debounce remains 650 ms.
- Existing bounded caches remain: temporal 72 frames/192 MB, thumbnails 80 entries, waveform 24 source results.

### 8.1E — Browser, accessibility and deployment

- Revalidated Chrome, Edge, Firefox and Windows WebKit behaviour; macOS Safari remains unavailable.
- Firefox still emits WebGL context-loss/lazy-texture warnings in headless export. The exported WebM was valid, and the editor canvas remained non-empty after export. No app-level error path was hidden.
- Windows WebKit renders procedural compositions and honestly rejects unsupported video import.
- New controls have labels, focus states, keyboard activation and dialog focus traps. The timeline ruler was split into an accessible numeric slider and a sibling loop-region control to eliminate nested-interactive markup.
- `waveform` canvases are graphical supplements; clip audio gain/fades, soundtrack gain/fades/loop timing and peak text remain the accessible numeric equivalents.
- Development dependency audit is clean after a tested Vitest 4.1.12 upgrade (0 vulnerabilities). No production dependency major was changed.
- Deployment remains a preview only; Vercel Authentication is preserved and the production alias is untouched.

## 2. Data model

Schema remains `3`. Phase 8.1 fields are optional/defaulted additive fields, so Phase 8 schema-3 projects retain their output after normalization.

`ProjectSoundtrack` adds:

```ts
loop: boolean;
loopCrossfade: number;          // seconds, 0–0.25
ducking: {
  enabled: boolean;             // default false
  amountDb: number;             // 0–24
  thresholdDb: number;          // -60..-6 dBFS
  attack: number;               // 0.01–1 s
  release: number;              // 0.02–3 s
};
```

`normalizeSoundtrack` fills these defaults for Phase 7/8 projects. `.bendpkg` round-trips the fields because the embedded project is normalized and preserved.

No media bytes are duplicated for loops. The soundtrack remains one asset record and one decoded source.

## 3. Media library and cleanup semantics

- The project `assets` map is the bin. Imported-but-unused sources persist in the project so they can be reused without reimporting bytes.
- `Add to V1` creates a new layer with the shared asset ID. `Replace selected` keeps the selected clip's transform, effects, color, mask, animation, position and lock state, then shifts following clips by any duration delta.
- `Use as music` replaces the single soundtrack source while preserving existing gain/fade/loop/duck settings where possible.
- `Remove` is disabled for referenced sources. Removal deletes only the project reference, not the blob, so Undo can restore it in the open session. On the next studio load, `cleanupUnreferencedAssets` checks every saved project before deleting orphaned blobs.
- Missing sources are shown in the bin and can be relinked independently of the top warning banner.
- Source files remain in IndexedDB and are never uploaded by Media.

## 4. Audio ordering and semantics

The export mix now follows this order:

1. Decode each unique source once for the selected range.
2. Mix all audible clip sources with trims, source-time mapping, clip gain, clip fades and transition gains.
3. Analyze the **clip-only** mix for ducking if enabled.
4. Mix the soundtrack with gain/fades, loop mapping, boundary crossfade and the duck envelope.
5. Apply the transparent peak trim only if peak > 0.98.

Ducking never analyzes the soundtrack itself and never alters clip audio. It uses no speech recognition or uploaded data. UI copy explicitly says it is level-driven.

## 5. Preview/export separation

- `Draft` changes only preview canvas backing resolution and resets preview temporal caches; `Full` restores 1.0 backing resolution.
- Pathological stacks use the bounded preview safety path in both quality choices, labelled in the UI. Export always uses the full project, full stack, full resolution.
- Switching quality reuses the same Pixi application; only resolution changes. No second compositor is introduced.
- Temporal preview safety is an engine flag, not project data.
- A repeated-export probe rendered three 2 s MP4s in 5.36 s, 4.59 s and 4.68 s with stable file size and no errors while Draft preview was selected, confirming export independence.

## 6. Scope decisions

- One V1 video track and one music track remain intentional short-form constraints.
- No audio waveform editing, detached audio clips, DAW automation, hosted speech recognition, AI captions, cloud project storage, accounts or collaboration were added.
- No new generator family, node graph, second compositor, or full multi-track rewrite was introduced.
- The media bin is a lightweight modal, not a full digital asset management system.
- Transition duration is inspector-driven; clicking a transition badge opens the controls and shows its duration.

## 7. Deferred pitch preservation

Pitch-preserving speed is not implemented. The exporter samples decoded source audio with the same source-time mapping as picture; this resamples audio and shifts pitch. No reliable, verified, lightweight time-stretch path exists in the current browser-local export architecture without introducing a new audio engine or external service.

The existing behaviour is retained and explicitly communicated. Pitch-preserved speed is a Phase 8.2 candidate, with independent spectral verification required.

## 8. Main files added

- `src/engine/audio/soundtrack.ts`
- `src/engine/audio/ducking.ts`
- `src/engine/audio/waveform.ts`
- `src/engine/editing/treatment.ts`
- `src/features/editor/waveformService.ts`
- `src/features/editor/Waveform.tsx`
- `src/features/editor/MediaLibraryDialog.tsx`
- `src/features/editor/ShortcutDialog.tsx`
- `tests/unit/phase81.test.ts`
- `tests/browser/phase81.spec.ts`
- `tests/deployed/deployed-phase81.spec.ts`

## 9. Main files changed

- `src/engine/core/types.ts`, `project.ts`
- `src/engine/export/exporter.ts`
- `src/engine/render/pixiRenderer.ts`
- `src/engine/temporal/engine.ts`
- `src/app/store.ts`
- `src/features/editor/EditorPage.tsx`, `Timeline.tsx`, `SequenceTimeline.tsx`, `CanvasStage.tsx`, `Inspector.tsx`, `ExportDialog.tsx`, `MediaLibraryDialog.tsx`
- `src/styles/global.css`
- `playwright.config.ts`, `playwright.deployed.config.ts`
- package metadata/lockfile (Vitest dev upgrade)
- deployed/browser/accessibility tests updated for filename-based layer names

## 10. Source identity

`docs/PHASE8_1_SOURCE_IDENTITY.json` contains the SHA-256 manifest of the final source/test/docs snapshot. `docs/PHASE8_1_DEPLOYED_SOURCE_IDENTITY.json` is generated from the files Vercel uploads for the final preview. No local media, test fixture, evidence directory, or `.audit-sources` is uploaded by `.vercelignore`.
