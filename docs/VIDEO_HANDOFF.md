# Video Handoff (Studio 2.0)

**Scope:** Phase 4 static artwork → BEND → Studio temporal layer, plus preview policy and limits.

## 1. Why a real video clip

BEND's supported timeline input model is `VideoLayer` referencing a packaged media asset.
Phase 4 therefore does **not** insert an unsupported image kind into `BendProject.layers`.
Studio rasterizes static artwork at the artboard size, encodes a short real video clip, and
imports it through BEND's existing media/project pipeline. It becomes a normal editable clip
with trim, split, speed, effects, keyframes, audio and export.

## 2. User flow

1. Select a static Studio layer (Image, Vector, Type, Shapes, Generate) or choose
   **Animate composition** in the canvas header.
2. Studio opens **Animate in BEND**.
3. Choose:
   - selected layer or the visible active composition;
   - background: artboard colour, white, or black;
   - clip duration 0.5–10s (default 3s), 30 FPS.
4. Studio renders the artwork at the exact artboard dimensions, including host transform,
   rotation, opacity, flips, blend mode, visible-layer order, artboard background and masks
   when present.
5. The PNG is encoded locally with Mediabunny/WebCodecs (MP4/H.264 where available, WebM
   otherwise) and validated for dimensions, duration and frame count.
6. BEND receives the clip bytes plus a same-origin URL, verifies SHA-256/byte length, saves
   it to its asset store and opens the real timeline with the clip selected.
7. Normal BEND editing follows. Publishing creates a derivative Studio video layer.

Original Studio layers and their source documents are not modified. The new layer records
`provenance.relation = "derived-from"` and the BEND source document records every source
layer ID/revision.

## 3. Transparency

This handoff path intentionally treats video alpha as unsupported:

- MP4/H.264 has no alpha in this delivery path;
- the browser may choose WebM, whose alpha support is not guaranteed across encoders;
- therefore the dialog requires an explicit background.

Transparent artboards default to a deliberate **white** treatment, with black or the artboard
colour available. Studio never silently substitutes black. The BEND source metadata records
`hasAlpha: false` and the chosen background.

## 4. Encoding and limits

| Item | Rule |
| --- | --- |
| Resolution | Exact Studio artboard (1080×1350, 1080×1080, 1080×1920) |
| Duration | 0.5–10s |
| Frame rate | 30 FPS |
| Codec | Mediabunny picks the first encodable codec for MP4, then WebM |
| Validation | Reopened with Mediabunny; width/height/duration/frame count checked |
| Size | Short clips are bounded; bytes ≤24 MB are also attached to the scoped input message |
| Failure | Honest error; no layer/source changes; the handoff can be cancelled |

## 5. Host temporal-layer preview policy

A published BEND layer is a **single temporal host layer**, not a live multi-track compositor.

- Static composition: the PNG cover is shown; the video is not auto-played.
- Explicit **Play video** replaces the cover with the playable video for that layer.
- Only one temporal layer plays at a time. Starting another stops the previous player.
- Audio is **muted by default**. The inspector can include source audio for the single active
  preview; multiple layers cannot unexpectedly play audio simultaneously.
- Playback can be `loop`, `hold last frame`, or `once`.
- Duration, frame rate, container, codec, audio status and preview/final quality are shown in
  the inspector.
- Download video and Download `.bendpkg` are available; **Edit in BEND** restores the full
  timeline.
- Host transform, opacity, visibility, blend/mask and stacking order remain independent of
  BEND's internal composition.

Advanced synchronized cross-layer video/audio composition is intentionally deferred.

## 6. Preview vs final

| Mode | Output | Honest UI |
| --- | --- | --- |
| Preview (default) | BEND's 720 px-wide export | `temporal.preview = true`; inspector explains final quality |
| Final | Full composition canvas | Requires exact canvas dimensions; never upsampled |

A 720 px preview is never labelled full resolution. If final encoding is unavailable, BEND
reports failure rather than silently downgrading.

## 7. Audio and codecs

- BEND's original mixer produces the audio track from audible clips, clip fades, transitions,
  soundtrack loop/crossfade and optional ducking.
- The exporter validates the encoded audio stream before publication.
- Host source metadata records `audioPresent`, codec/message and container.
- Chromium/Edge is the tested MP4/AAC path; Firefox uses WebM where available; Safari is
  environment-dependent and not claimed.
- Video-only output is reported honestly.

## 8. Re-entry and revision rules

- The Studio source record references the complete `.bendpkg`, including source media.
- Re-entry validates package hash/size, package completeness/revision, then restores into a
  temporary `bend-studio-` project.
- Republishing preserves the Studio layer ID, transform, opacity, visibility, artboard,
  stacking order and provenance.
- A stale in-memory or cross-tab revision is rejected; the newer committed layer survives.
- Cancel, render failure, storage failure or corrupt package leaves the previous video,
  poster and package untouched.
- Old revisions remain addressable for host undo; no destructive asset GC runs in Phase 4.

## 9. Explicit non-goals

- final multi-layer Studio composition export;
- synchronized multiple BEND video/audio layers;
- carousel export;
- asset garbage collection;
- persistent cross-session host undo;
- native still-image layers inside `BendProject` (not added; video clips are used instead).
