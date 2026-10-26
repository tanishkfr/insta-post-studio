# BEND. Phase 8.0 — Handoff

Date: 2026-10-25  
Input state: Phase 7.0 hardened Studio 2.0 / Phase 5.5 working tree  
Deployment verified: `https://bend-9b07efmjr-tanishkfrs-projects.vercel.app` (preview)

Phase 8.0 should turn BEND from a strong single-composition motion tool into a real short-form video editor. Phase 7.0 deliberately did not add those features. This handoff separates **missing editing capabilities** from the reliability foundation that now exists.

## 1. What Phase 7.0 established

- A single deployed Studio 2.0 origin with direct routes, correct assets, and local-first persistence.
- One shared Pixi compositor for preview, PNG, and video export.
- Four procedural generators, four temporal effects, masks, five blend modes, keyframes/easing/modulators/recipes, timelines and loop ranges.
- Deterministic `.bendpkg` packages, project library CRUD, autosave/recovery, missing-media relink.
- Browser-side H.264/AAC and WebM import; browser-side MP4 export via Mediabunny; PNG export.
- Deployed regression suites and creator evidence.

## 2. Phase 8.0 priority order

### P0 — Multi-clip editing foundation

Needed before most short-form workflows feel real.

1. **Sequential clips** — a composition must contain multiple video clips placed one after another, not every import starting at time zero.
2. **Split at playhead** — split a video clip into two independent clips with source-trim continuity.
3. **Trim edge semantics** — trimming an in-point should move the clip boundary (and optionally ripple), not only shift the source window while keeping the clip duration fixed.
4. **Ripple delete / close gaps** — remove a clip and pull following clips left, with an explicit “leave gap” alternative.
5. **Clip selection and multi-selection** — select clips independently from layers; group move/delete.
6. **Linked audio/video** — splitting footage should keep its audio in sync or intentionally detach it.
7. **Per-clip start/time controls** — expose numeric start, duration, and source in/out in the inspector, not only canvas gestures.
8. **Snap indicator and override** — visible snap candidate and a predictable modifier to disable it.

Acceptance: import three clips, reorder/split/trim/ripple, play through the sequence, save/reload, export a valid social-length file with audio.

### P0 — Timeline and transport usability

- Draggable playhead and clip edges with robust pointer capture.
- Undo grouping so one drag is one undo step (Phase 7.0 removed no-op drag entries; more gestures need the same treatment).
- Explicit timeline markers (named markers, in/out, chapter marks) — Phase 7.0 has only a loop/work-range, not named markers.
- Timeline zoom-to-fit and zoom-to-playhead.
- Scrubbing while paused must not race the render pump; Phase 7.0 added coalescing, but heavy temporal frames still need progress/quality controls.
- Keyboard map for split, ripple delete, add marker, and clip navigation.

### P1 — Transitions and track compositing

- Cross-dissolve, dip-to-black/white, wipes, and directional slides.
- Transition duration handles and preview.
- Adjustment layers for shared color/effects.
- Track mattes and better mask handles (rect/gradient currently exist in the model/UI but need thorough visual acceptance).
- Additive/Overlay blend validation and broader blend-mode families only if the shared compositor can keep export parity.
- Avoid cards-inside-cards; transitions should be timeline-level, not nested UI.

### P1 — Speed and time manipulation

- Constant speed (0.25×–4×), reverse, freeze frame.
- Speed ramps with easing and visual speed curve.
- Pitch-preserved audio or an honest mute policy when pitch preservation is unavailable.
- Frame-blending/interpolation options with clear preview/export parity.
- Seamless loop export needs a real periodic-motion contract, not a universal “seamless” claim. Phase 7.0’s mirrored mode is correct but reverses velocity.

### P1 — Audio finishing (without becoming a DAW)

Phase 7.0 exports only the topmost visible, unmuted video source’s audio. Phase 8.0 should add:

- Per-clip gain and fades.
- Mute/solo with visible mixer state.
- Audio waveform display and accurate trim alignment.
- Monitor-in-editor playback (Phase 7.0 preview elements are muted).
- Multitrack mixing if multiple audible sources are introduced.
- Export loudness target (for example −14 LUFS for social) and peak limiting, or explicitly remain single-source.
- Sample-accurate range export with cancellation tests.

### P1 — Color finishing and social polish

- Curves, lift/gamma/gain or color wheels, white balance, HSL qualifiers.
- LUT import/export and color-management intent.
- Scopes (waveform/vectorscope) or a clear “not available” stance.
- Aspect-ratio reframing with safe areas and focal-point controls.
- Captions/subtitles and text overlays.
- Platform presets (9:16, 1:1, 4:5), duration and file-size targets, thumbnail selection.
- Batch/queue export and deterministic naming for social deliverables.

### P2 — Browser/export reach

- macOS Safari/WebKit hardware validation and an encoder path if Safari’s WebCodecs support is sufficient.
- Firefox video-export acceptance (MP4/WebM, audio, preview parity).
- WebKit import codec strategy and actionable fallback copy.
- WebM fallback acceptance when MP4 codecs are unavailable (Phase 7.0 source path exists but was not naturally triggered).
- Native file-system save picker where available; current download behavior is fine but less production-friendly.
- No cloud media-processing backend.

### P2 — Performance and resource architecture

- GPU temporal-effect path or a bounded preview-quality mode for nested stateful stacks.
- Complexity estimate with estimated render time, not only a warning.
- Resolution-scaled preview for temporal stacks, while preserving export resolution.
- Better source-frame caching budget and instrumentation.
- Fix/avoid the Firefox transient WebGL context-loss warnings; validate on real hardware.
- Keep the single renderer/compositor; do not add a second engine.
- Re-run the Phase 7.0 deployed performance suite after every major editing feature.

### P2 — Project/media management

- Media bin with ownership counts and safe delete.
- Replace Source final browser journey and relink across all supported codecs.
- Surface origin-scoped storage more prominently (preview vs production vs custom domain).
- Storage quota panel with estimated project/media size and export-before-delete prompts.
- Package tombstones/missing-media diagnostics; legacy schema compatibility testing for every new field.
- Project switching while an export is active should be explicitly blocked or safely cancelled.

### P3 — Recipe/creative system

- Reintroduce an optional recipe preview only with a safe, single-compositor or offscreen-worker design; Phase 7.0 replaced the live second Pixi context with a deterministic static cue after it stalled the page.
- Expose advanced modulator fields (offset, phase, duty cycle, intensity, smoothness, start/end, easing).
- Add curve editing/parameter locks to seeded variation.
- Full preset visual acceptance for all generator/effect presets.

## 3. Explicit Phase 8.0 non-goals for the first slice

- No real group Instagram toolset or cross-origin host integration; the host remains absent.
- No accounts/authentication.
- No cloud rendering or hosted AI.
- No full NLE clone (multicam, color grading suite, VFX node graph) in the first phase.
- No replacement of the Pixi compositor or deterministic procedural engine.

## 4. Data-model guidance

Keep additive, normalized fields and bump schema/package versions only when required.

Suggested shapes (not commitments):

```ts
interface TimelineClip {
  id: string;
  assetId: string;
  start: number;
  duration: number;
  sourceIn: number;
  sourceOut: number;
  linkedAudio: boolean;
}

interface Transition {
  id: string;
  type: "cross-dissolve" | "dip" | "wipe";
  fromClipId: string;
  toClipId: string;
  duration: number;
}
```

Rules to preserve:

- normalize on every read; never assume new fields exist;
- source version must remain content-derived and stable across package restore;
- `.bendpkg` remains the portable recovery boundary;
- media cleanup remains conservative and reference-aware;
- preview, PNG, and video export all use the same render path;
- no silent fallback that reports success for corrupt/empty media.

## 5. Release gate for Phase 8.0

1. Unit/typecheck/build/local maintained smoke pass.
2. Deployed preview smoke on Chrome, Edge, Firefox, WebKit where codecs permit.
3. Sequencing/splitting/ripple journey created in the deployed app.
4. Full-quality and preview exports independently inspected (FFprobe + frame inspection).
5. Audio sync and muted/video-only behavior verified.
6. Save/reload and `.bendpkg` round-trip after the new schema.
7. Cancellation, retry, quota failure, missing media, and stale export checks.
8. Accessibility: axe serious/critical zero, keyboard timeline editing, reduced motion, forced colors, responsive viewports.
9. Performance baseline recorded on hardware; no new progressive slowdown or unbounded resource growth.
10. Documentation and Phase 8 acceptance report produced.

## 6. Known Phase 7.0 carry-over risks

- Heavy nested temporal stacks (all four on one layer) remain non-real-time and may take minutes at late timestamps.
- Firefox WebGL context/lazy-init warnings persist; no output failure observed, but no root-cause fix was made.
- WebKit Windows test build lacks import/encode codecs; do not generalize that result to macOS Safari.
- Real screen-reader and physical-touch sessions remain unverified.
- Production still runs the older Phase 5.4 build; promotion requires separate authorization.
