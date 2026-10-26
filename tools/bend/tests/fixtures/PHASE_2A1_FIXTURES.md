# Phase 2A.1 media fixtures

These fixtures are generated from FFmpeg's `testsrc2` and `sine` sources. They contain no third-party footage and are reproducible locally.

From the repository root, run:

```powershell
powershell -ExecutionPolicy Bypass -File .\tests\fixtures\generate-phase2a1-fixtures.ps1
```

The script creates:

| Fixture | Purpose |
| --- | --- |
| `constant-24.mp4` | Constant 24 FPS video |
| `constant-30.mp4` | Constant 30 FPS video |
| `fractional-29-97.mp4` | Fractional 29.97 FPS video |
| `vfr-irregular.mp4` | H.264 video with selected frames retaining irregular presentation intervals |
| `nonzero-video-start.webm` | Video whose first timestamp is shifted later when the container preserves it |
| `negative-video-start.webm` | Video with a negative timestamp request for formats that preserve it |
| `delayed-audio-start.mp4` | Video plus audio delayed by 250 ms |
| `trimmed-audio-source.mp4` | Two-second video/audio source for trim synchronization |
| `performance-720p.mp4` | Small 1280 × 720 footage sample for performance runs |

Inspect the generated timestamps independently with:

```powershell
ffprobe -hide_banner -show_streams -show_packets -select_streams v:0 .\tests\fixtures\vfr-irregular.mp4
ffprobe -hide_banner -show_streams -show_packets .\tests\fixtures\delayed-audio-start.mp4
ffprobe -hide_banner -show_streams -show_packets -select_streams v:0 .\tests\fixtures\nonzero-video-start.webm
```

Container timestamp preservation is a property of the selected muxer. The reports must record the `ffprobe` result for each generated file instead of assuming the requested offset survived.
