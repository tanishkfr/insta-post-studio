# BEND. Phase 8.1 — Audio Report

Date: 2026-10-26  
Scope: clip/soundtrack waveforms, soundtrack looping, optional ducking, audio correctness.  
Evidence: `output/phase81-audio/`, `output/phase81-recovery/`, `output/phase81-creator/`.

## 1. Audio model

Phase 8.1 keeps the Phase 8.0 model: every video clip owns its audio settings, and one optional soundtrack is linked to a shared local asset. No detached audio clips, waveform editor, DAW track stack, or hosted speech service was added.

`ProjectSoundtrack` is additive:

```ts
{
  assetId, timelineStart, sourceIn, sourceOut,
  gainDb, muted, fadeIn, fadeOut,
  loop: boolean,
  loopCrossfade: number,        // 0–0.25 s
  ducking: {
    enabled: boolean,           // default false
    amountDb: number,           // 0–24 dB
    thresholdDb: number,        // -60..-6 dBFS
    attack: number,             // 0.01–1 s
    release: number             // 0.02–3 s
  }
}
```

Phase 7/8 schema-3 projects normalize with `loop=false`, `loopCrossfade=0.04`, and ducking disabled.

## 2. Waveforms

### Analysis

- Local decode via Mediabunny `AudioBufferSink`.
- Peak buckets: minimum 256, maximum 4096, approximately 32 buckets per second.
- Peak sampling stride: approximately one sample per 0.5 ms (2 kHz), not raw full-rate DOM data.
- Maximum analyzed source duration: 900 s.
- Serialized queue with `requestIdleCallback`/timeout yields between chunks.
- Cache: 24 source entries, keyed by asset ID + object URL.
- In-flight requests are shared and ref-counted; when the last subscriber releases, the analysis aborts.
- Missing, silent, or undecodable audio returns an honest state and a dashed baseline rather than a fake waveform.

### Display mapping

- Clip waveforms call `sourceTimeForVideoLayer` for every display point, so trim, reverse, freeze, constant speed and speed ramps use the same mapping as picture/export.
- Soundtrack waveforms call the same loop sample-point helper as export, so repeated regions and crossfades match.
- Waveforms are canvas graphics, not thousands of DOM nodes. They scale with timeline zoom by redrawing against client width.
- Canvas `role="img"` labels include duration, source peak, reverse/speed state and loop repetition count.
- Waveform graphics are supplementary: clip gain/fades, soundtrack gain/fades/loop count, source metadata and exact timeline values remain available in the inspector.

## 3. Soundtrack looping rules

- `timelineStart` is the first audible frame.
- When `loop=false`, the soundtrack plays `sourceIn..sourceOut` once and stops.
- When `loop=true`, the trimmed source repeats from `timelineStart` until `project.canvas.duration`.
- The final repetition is truncated to the remaining timeline; no samples are generated after the composition end.
- `loopCrossfade` is applied after each loop boundary. The outgoing tail and incoming head are equal-power mixed for 0–0.25 s; zero disables the crossfade.
- The loop count is `ceil(playbackDuration / sourceDuration)`; the timeline shows the repetition count and dashed boundaries.
- The source remains one binary asset. Looping is timing only; no duplicated blobs are created.
- Preview uses the same source-time mapping. Verified audio monitor currentTime was 1.417 s after 5.48 s of project playback with a 4.05 s source (loop local ~1.43 s).
- Loop, crossfade and ducking survive project save/reload and `.bendpkg` round-trip.

## 4. Ducking rules

- Disabled by default.
- Sidechain: the audible clip mix only, after clip trims, fades, gains and transition gains. The soundtrack is not in its own sidechain.
- Analysis window: 20 ms RMS.
- Threshold: -60..-6 dBFS. Signal below threshold leaves music unchanged.
- Amount: 0–24 dB maximum reduction. It ramps in over 12 dB above threshold to avoid hard pumping.
- Attack/release: deterministic one-pole smoothing, 0.01–1 s and 0.02–3 s.
- Applies to background music in the exported mix. Never modifies clip audio, source blobs, or project assets.
- Honest behaviour for silence/non-voice material: no voice detection or speech isolation is claimed. If clip levels stay below threshold, the mix reports that ducking did not reduce music.
- Visible state: `DUCK` badge on the music lane and enabled controls in Composition.
- The live monitor does not apply the analysis envelope; the UI says ducking is applied on export.

## 5. Mix order and safety

1. Decode each unique source once for the selected range.
2. Mix clip sources with source-time mapping, gain, fades and transition gains.
3. Compute ducking from the clip-only mix if enabled.
4. Mix the soundtrack with source trim/loop/crossfade, its gain/fades and duck gain.
5. Transparently trim the master only if peak > 0.98; relative balance is unchanged.
6. Encode MP4/H.264+AAC where supported, otherwise WebM/VP9 or VP8+Opus.
7. Reopen and validate dimensions, frame count, duration, first timestamp and audio duration.

Freeze-frame audio remains silent. Reverse audio is reversed with the picture. Speed changes resample audio and shift pitch. These policies are visible in the editor and export result.

## 6. Journey B — 30-second montage with looping and ducking

Project: fifteen 2 s 440 Hz tone clips → 30.00 s; one 4.05 s 220 Hz music bed; loop enabled; ducking enabled (10 dB, -36 dBFS, 0.08 s attack, 0.4 s release); first clip fade-in 0.6 s, last clip fade-out 0.8 s; music fades retained.

Export: `output/phase81-audio/journey-b-montage.mp4`

| Check | Result |
|---|---|
| Container | MP4 / H.264 720×900 30 FPS + AAC 48 kHz stereo |
| Frames | 900 |
| Video duration | 30.00 s |
| Audio duration | 30.016 s |
| Music repetitions | 8 across 30.00 s, final partial repetition trimmed |
| Head RMS (0–0.1 s) | −38.43 dB |
| Body RMS (1 s) | −18.06 dB |
| Body RMS (15 s) | −18.07 dB |
| Tail RMS (29.2–29.7 s) | −21.00 dB |
| Tail RMS (29.9–30.0 s) | −40.94 dB |

The lower head/tail levels confirm the clip/soundtrack fades; the body is stable.

### Independent spectral checks

| Time | 220 Hz music | 440 Hz clip | Meaning |
|---:|---:|---:|---|
| 1.0 s | −37.54 dB | −15.08 dB | start, ducked |
| 2.0 s | −37.55 dB | −15.06 dB | steady state |
| 4.1 s | −38.15 dB | −15.05 dB | just after loop boundary 1 |
| 5.0 s | −37.54 dB | −15.08 dB | second repetition |
| 7.9 s | −41.64 dB | −15.10 dB | approaching boundary |
| 8.1 s | −38.50 dB | −15.05 dB | just after loop boundary 2 |
| 12.0 s | −40.48 dB | −15.06 dB | later repetition |
| 20.0 s | −42.64 dB | −15.06 dB | later repetition |
| 28.0 s | −45.83 dB | −15.06 dB | late repetition, music fade region |
| 29.0 s | −41.21 dB | −19.20 dB | final partial repetition, clip fade |

Music energy is present after every loop boundary; the source does not stop at 4.05 s. The 440 Hz clip tone remains stable until the intentional final fade.

### Ducking comparison

The same 30 s mix was exported with ducking disabled (`audio-unducked.mp4`).

| Time | Music ducked | Music unducked | Reduction | Clip 440 ducked | Clip 440 unducked |
|---:|---:|---:|---:|---:|---:|
| 1.0 s | −37.54 dB | −27.54 dB | **10.01 dB** | −15.08 | −15.08 |
| 5.0 s | −37.54 dB | −27.53 dB | **10.01 dB** | −15.08 | −15.08 |
| 20.0 s | −42.64 dB | −32.68 dB | **9.97 dB** | −15.06 | −15.06 |
| 29.0 s | −41.21 dB | −31.67 dB | **9.54 dB** | −19.20 | −15.08 |

The music-only 220 Hz component is reduced by the configured ~10 dB while the clip 440 Hz component is unchanged except for its intentional fade. This is sample-level evidence, not stream-presence detection.

### Loop-off control

With looping disabled, the same 220 Hz music component measured:

- 2.0 s: −27.52 dB
- 10.0 s: −102.90 dB
- 29.0 s: −119.63 dB

The clip 440 Hz tone remained at −15.06 dB at 10 s and 29 s. The music stopped at its natural source end as intended.

## 7. `.bendpkg` and legacy audio

Project recovery test (`output/phase81-recovery/`):

- Opened the Phase 7 `project-a-experimental-reel.bendpkg` with no missing media.
- Added music, enabled loop and ducking, added/split a shot, applied a treatment.
- Saved and reloaded: clip count, music and `looped` + `ducking enabled` state persisted.
- Duplicated the project, downloaded an editable package, restored it in a fresh context.
- Restored result: 3 clips, 1 music source, no missing media, looped 3 times over 10 s, ducking enabled.
- Re-export: 300 frames, 10.00 s, MP4/H.264 + AAC, with export messages: ducking reduced 10.0 dB for 73% of the range; 3 soundtrack repetitions with a 0.04 s boundary crossfade.

## 8. Audio policies and remaining limitations

- Pitch-preserved speed: **not implemented**. Current speed/ramp changes resample and shift pitch. This remains a documented Phase 8.2 candidate; no unverified time-stretch was forced into the mixer.
- One soundtrack and one V1 audio-bearing sequence; no solo buses, track meters or sample editor.
- Soundtrack loop crossfade is applied in export. Preview uses correct loop timing but not the export crossfade envelope.
- Ducking uses level analysis, not voice/speech detection.
- The audio monitor is off by default and does not apply ducking; export is the authoritative mix.
- AAC is unavailable in Firefox here; BEND correctly falls back to WebM/VP9+Opus.
- No LUFS normalization; only transparent peak safety above 0.98.
