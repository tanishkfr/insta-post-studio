# BEND. Phase 8.0 — Architecture

Date: 2026-10-26  
Schema: project `3` (Phase 7 projects are schema `2`, Phase 1 projects are schema `1`)  
Primary implementation: `src/engine/core/timeMapping.ts`, `src/engine/editing/operations.ts`, `src/engine/transitions/transition.ts`, `src/engine/export/exporter.ts`

## 1. Design intent

Phase 8.0 extends the existing layer/compositor model rather than adding a second editing engine. A video clip is still a `VideoLayer`; a sequence is the ordered set of video layers on the primary `V1` lane. The Pixi compositor remains the only preview/export renderer. Shared source blobs are referenced by asset ID and are never copied or rewritten by edits.

The extension is deliberately bounded:

- One magnetic primary video track (`V1`) for short-form sequencing.
- Existing procedural/overlay layers remain independent layers and are not moved by video ripple operations.
- One optional local music track.
- Clip-relative animation, effects, masks, and color continue to use the established layer renderer.
- No server renderer, hosted AI, cloud media service, or parallel timeline compositor.

## 2. Project and clip representation

`schemaVersion` is now `3`. Every normalized video layer contains:

```ts
trackId: string;                 // "V1" for the primary sequence
playback: ClipPlayback;          // speed, reverse, ramp, freeze
audio: ClipAudioSettings;        // enabled, gain dB, fade in/out
transitionIn: ClipTransition|null
```

`ClipPlayback`:

```ts
{
  speed: number;                 // 0.25..4
  reverse: boolean;
  rampEnabled: boolean;
  rampPoints: Array<{ time: number; speed: number }>; // 2..6 normalized points
  freeze: { sourceTime: number; duration: number } | null;
}
```

Project-level additions:

```ts
cover: { time: number };
safeAreas: {
  enabled: boolean;
  titleSafe: boolean;
  captionSafe: boolean;
  grid: boolean;
};
soundtrack: {
  assetId: string;
  timelineStart: number;
  sourceIn: number;
  sourceOut: number;
  gainDb: number;
  muted: boolean;
  fadeIn: number;
  fadeOut: number;
} | null;
```

`trimStart` and `trimEnd` remain the non-destructive source interval. `timeline.start` and `timeline.duration` remain the output placement and effective output duration. Effects, masks, animation tracks, color and transforms remain on the layer.

### Shared media

Split and duplicate operations create new layer IDs but reuse the same `assetId`. Files remain in the existing IndexedDB asset store. The only cleanup path remains the conservative cross-project reference scan in `src/storage/indexedDb.ts`; clip deletion never deletes a source blob.

## 3. Time mapping

Implementation: `src/engine/core/timeMapping.ts`.

Let a clip have source interval `[trimStart, trimEnd]`, source span `S = trimEnd - trimStart`, and normalized output progress `u = localTime / outputDuration`, clamped to `[0,1]`.

For a constant-speed clip:

```text
outputDuration = S / speed
sourceProgress(u) = u
```

For a speed ramp, each control point gives a positive speed `v_i` at normalized output position `t_i`. The speed curve is linearly interpolated and integrated:

```text
I(u) = integral(0..u, v(t) dt)
sourceProgress(u) = I(u) / I(1)
outputDuration = S / I(1)
```

The map is monotonic for forward playback because every speed is positive. Reverse playback uses:

```text
sourceTime = trimEnd - sourceProgress * S
```

Freeze replaces picture sampling with a fixed `sourceTime` and a user-controlled duration. It is stored as a held-frame state, not a flattened still.

Trimming changes the source interval. Moving/trimming on the magnetic primary track can shorten or lengthen output duration, which is recomputed by normalization. Source frames are never invented.

### Split

`splitVideoClip`:

1. Rejects invalid boundaries, locked clips, and cuts inside an active incoming transition.
2. Computes the source time at the cut with the same mapping used by preview/export.
3. Splits the source interval into two non-destructive intervals.
4. Splits the speed curve and rescales both halves so the original mapping is retained.
5. Adds boundary keyframes where needed and rebases right-hand animation times.
6. Keeps the left-side incoming transition; the right side starts without an incoming transition.
7. Re-points downstream transitions that referenced the old clip end to the new right-hand segment.
8. Preserves the shared `assetId`.
9. Leaves audio fades on the correct outside boundaries.

### Speed-ramp interior constraints

- 0.25×–4× per point.
- 2–6 points.
- No velocity graph or Bezier speed editor.
- Source sampling is deterministic and bounded; no unbounded frame buffering.
- Speed changes resample clip audio without claiming pitch preservation.

## 4. Tracks, ripple editing, sequencing

Implementation: `src/engine/editing/operations.ts`.

The primary sequence is the sorted set of `VideoLayer`s on `trackId === "V1"`. Procedure-generated layers, masks, overlays and the music lane are not shifted by video ripple operations.

Defined rules:

- **Ordinary delete** removes only the clip and leaves a gap.
- **Ripple delete** removes the clip and shifts following `V1` clips by `firstFollowing.start - removed.start`; this closes both the removed clip and any preceding gap without moving unrelated tracks.
- **Close gap** shifts the selected clip and later clips left by the gap before it.
- **Duplicate** creates a new layer at the end of the primary sequence, sharing the source asset and clearing `transitionIn`.
- **Magnetic layout** (`layoutSequence`) packs clips end-to-end, preserving valid transitions up to half the shorter neighbour's duration.
- **Free placement** (snapping off, or Shift while dragging) preserves gaps and prevents overlap by finding the nearest gap that fits.
- **Reorder** is a magnetic repack in the new order. The stack z-order of video layers is updated to match sequence order.
- **Snapping** uses 0, the playhead, clip starts and clip ends. The toolbar Snap button controls it; Shift bypasses it.

A transition requires a previous clip on the same track. Applying one aligns the incoming clip to the outgoing clip's end minus the requested transition duration, shifts the incoming clip and later clips together, and keeps the action in one undo step. The transition uses real timeline overlap. No hidden source handles are fabricated.

Changing speed/freeze/ramp duration shifts following clips by the duration delta, keeping the primary sequence contiguous. Trim operations do the same when snapping is on. Actual transition durations are reconciled to the real overlap during normalization.

## 5. Transitions

Implementation: `src/engine/transitions/transition.ts`, shaders in `src/engine/render/shaders.ts`, composition in `src/engine/render/pixiRenderer.ts`.

Transition window:

```text
start = incoming.timeline.start
end   = min(incoming.timeline.start + transition.duration, outgoing.timeline.end,
            incoming.timeline.end)
progress = (time - start) / (end - start)
```

The real overlap must be positive. If clips are moved apart, the transition contributes nothing; if clips are moved closer, normalization clamps the duration to the real overlap.

Implemented types:

| Type | Picture semantics |
|---|---|
| Dissolve | Source-over crossfade: outgoing stays opaque beneath; incoming alpha rises with easing. |
| Fade through black | Background forced to black for the active window; outgoing fades out over the first half, incoming fades in over the second. |
| Directional wipe | A feathered shader edge reveals the incoming layer; outgoing remains beneath. Direction left/right/up/down. |
| Zoom | Incoming scales down from a slightly larger frame while its alpha rises. |
| Signal split (glitch) | Incoming layer is RGB-split and scan-disturbed during a dissolve. |
| Wave dissolve (distortion) | A procedural wave warp plus dissolve carries the incoming shot. |

Crossfade compositing deliberately leaves the outgoing sprite opaque. Fading both sprites independently over the background would double-darken the frame. Audio uses linear outgoing/incoming gains over the same eased progress, so picture and sound follow one contract.

Transitions do not create a separate renderer. Wipe/glitch/distortion are Pixi filters in the existing renderer; the shared preview and export pipeline evaluates both visible clips over their genuine overlap.

## 6. Audio

Implementation: `src/engine/export/exporter.ts` (`mixProjectAudio`), `src/features/editor/CanvasStage.tsx` (monitor).

### Clip audio

Every audible, visible video layer contributes at its own timeline placement. Per-clip controls: enabled/muted, gain in dB, fade in, fade out. Audio uses the same source-time mapping as picture, including trim, speed, ramp, and reverse.

### Mixing

Export decodes supported source audio locally with Mediabunny `AudioBufferSink`, then resamples into one stereo 48 kHz Float32 mix in the selected export range. It applies:

- source trims,
- transition crossfades,
- clip fades and gains,
- the soundtrack with its own trim, gain and fades,
- a transparent master trim only when peak exceeds 0.98.

It does not clip, discard overlapping clips, or choose a topmost source. No audio track is created when all sources are muted. Freeze-frame portions are silent by policy; reverse audio is reversed; speed changes resample audio and shift pitch. Those policies are shown in the editor and export result.

### Soundtrack

One local audio asset, stored in the same asset table/package as footage. Track controls include start, source in/out, gain, mute, fade in/out and remove. The source does not loop automatically.

### Preview monitoring

The Audio Monitor toggle (off by default) unmutes the active per-clip preview media elements and a hidden soundtrack audio element. Volumes follow clip gain/fades/transition audio gains. Reverse, freeze and ramp clips are intentionally muted in the live monitor and the UI states that export audio follows the explicit resampling/freeze policy. Audio monitor uses ordinary media-element mixing, not a second export engine.

## 7. Color finishing

Implementation: `src/engine/render/shaders.ts` (`COLOR_GRADE_FRAGMENT`), `pixiRenderer.ts`.

Existing controls remain: brightness, contrast, saturation, hue, enable/bypass. Added: temperature, tint, highlights, shadows, vignette, film grain and sharpen. Defaults are neutral and do not alter legacy output.

The shader applies the established four controls first, then the extended finish. Sharpening uses a four-neighbour unsharp mask; grain is deterministic per output time; vignette is radial. Curated looks are UI products of these real controls:

- Clean contrast
- Warm film
- Cool editorial
- Soft fade
- High-contrast mono
- Analog grain

Looks replace the current layer color values; Undo restores the previous finish. Source media is never modified.

## 8. Reframing and social output

- Canvas presets: 9:16 (1080×1920), 4:5 (1080×1350), 1:1 (1080×1080), 16:9 (1920×1080).
- Existing crop, fit/fill and transform/keyframes are retained when format changes.
- Safe guides (title-safe, approximate caption-safe, thirds grid) are DOM overlays inside the editor frame only. They never enter the canvas or export.
- Cover frame stores a composition timestamp. Cover/current still exports render through the same Pixi compositor at full canvas size. Cover PNGs are independently dimension-validated.
- Export profiles are quality + range + mode rather than hard-coded platform promises: Social video (current aspect), Quick preview (≤720 px wide), Cover frame, Current still, Full composition, Loop/work range, High quality.
- MP4 uses H.264 and requires AAC for delivery. If AAC is unavailable, BEND falls back to WebM with VP9/VP8 + Opus instead of writing a mislabeled H.264/Opus MP4.
- Encoded output is reopened with Mediabunny and checked for dimensions, duration, frame count, first timestamp, audio presence and audio duration before download.

## 9. Preview/export integration

- One `PixiBendRenderer` for preview, PNG and video export.
- One deterministic source-time function for scrub, temporal sampling, export and audio.
- Per-clip preview video elements allow two split segments of the same source to be visible at once, including transitions. Export uses per-layer decoded frames.
- Temporal effects still sample through `sourceTimeAt`; caches are bounded (72 frames / 192 MB raw-frame budget).
- Thumbnails use one shared decoder/canvas and a bounded data-URL cache, not a decoder per tile.
- Transition filters are part of the shared filter chain; export never uses a different transition implementation.

## 10. Migration and storage

- Phase 1 migration (`schemaVersion 1`) and Phase 7 migration (`schemaVersion 2`) normalize into schema 3.
- Missing new fields receive neutral defaults: V1 track, 1× speed, audio on/0 dB, no transition, cover at 0, guides off, no soundtrack.
- Legacy layer placement, trim and visual output are preserved. A Phase 7 package was opened and an exact 2 s canvas frame hash matched after editing/save/package round-trip.
- Clip and soundtrack asset IDs are remapped consistently during `.bendpkg` restore, including soundtrack reference rewriting.
- Package format version remains `1`; its embedded project carries schema 3 and is normalized on decode. The archive format did not change.
- Autosave, revision rejection, duplicate project, recovery copy and conservative media cleanup remain in place.

## 11. Performance boundaries

- Basic four-clip 21 s montage seek renders measured 18.8–56.4 ms (median 48.7 ms) in headless Chromium on this machine; playback sampling showed a median 2.7 ms Pixi frame after media sync. These are observations, not fixed-FPS promises.
- A 15 s 1080×1920 H.264/AAC high-quality export, a 30 s 720×1280 montage and reverse/ramp exports completed and validated.
- Nested stateful temporal stacks remain the slow path inherited from Phase 7. Their warnings, bounded caches and cancellable preview pump are unchanged. No GPU temporal rewrite is claimed.
- Decoders are one per visible preview clip; thumbnails share one decoder; audio decode is one pass per unique source in the selected range.
