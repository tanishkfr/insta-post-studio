# BEND. audio architecture decision

Date: 2026-10-13  
Decision: retain the deterministic primary-audio-source policy for the current BEND scope.

## Current behavior

The exporter selects the topmost visible, unmuted video layer as the primary audio candidate. It reads only that source's trimmed interval through Mediabunny `AudioSampleSink`, shifts samples to the layer's timeline placement, and adds them to the selected output format. Hidden and muted video layers are not candidates. Procedural layers never contribute audio.

If another visible, unmuted video layer overlaps the primary layer, BEND omits that other source audio and reports the policy in the export dialog. If the selected source has no decodable audio, or the output format cannot encode it, the export remains usable and is explicitly labeled video-only. The MediaRecorder fallback is also video-only.

The delayed-audio fixture starts its audio at `0.228667s`; the trim test independently verifies that trimmed audio is timestamped at the layer's timeline origin rather than copied blindly from the source packet clock. Chromium `ffprobe` evidence reports a trimmed video stream at `1.000000s` and an AAC stream at `1.002667s`, both starting at zero after export. Muting produces a video-only output and a visible warning.

## Options considered

### 1. Retain the primary-audio policy

Pros: deterministic output, small local-first implementation, predictable cancellation, clear UI messaging, and no new mixing graph. It matches BEND's current role as a visual motion instrument rather than a multitrack audio editor.

Tradeoff: overlapping unmuted source audio is intentionally omitted instead of mixed.

### 2. Add deterministic multi-source mixing inside BEND

Pros: overlapping clips would preserve more source material and could support fades/levels later.

Tradeoffs: requires an audio timeline/mix contract, sample-rate/channel normalization, overlap and gain policy, silence/padding semantics, cancellation coverage, UI for the active mix, and more cross-browser encoder testing. Implementing only a partial mixer would make the current explicit policy less predictable.

### 3. Delegate complex mixing to the future audio tool

Pros: keeps BEND focused on visual composition and lets a dedicated audio tool own routing, fades, loudness, and multitrack concerns.

Tradeoff: BEND would need a future interchange boundary if users expect a round trip.

## Recommendation

Keep option 1 through Phase 2B. Improve the existing status copy only when a specific ambiguity appears in testing. Revisit option 3 when the group's audio tool and interchange contract exist. Do not add speculative audio infrastructure or a mixer in this phase.

