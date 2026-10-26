$ErrorActionPreference = "Stop"

$fixtureRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$ffmpeg = (Get-Command ffmpeg -ErrorAction Stop).Source

function Invoke-FFmpeg {
  param([string[]]$Arguments)
  & $ffmpeg @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "ffmpeg failed with exit code $LASTEXITCODE."
  }
}

$common = @("-y", "-hide_banner", "-loglevel", "error")
$video = "testsrc2=size=160x90:rate=30:duration=1"

Invoke-FFmpeg ($common + @(
  "-f", "lavfi", "-i", "testsrc2=size=160x90:rate=24:duration=1",
  "-c:v", "libx264", "-preset", "ultrafast", "-tune", "zerolatency", "-crf", "35",
  "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an",
  (Join-Path $fixtureRoot "constant-24.mp4")
))

Invoke-FFmpeg ($common + @(
  "-f", "lavfi", "-i", "testsrc2=size=160x90:rate=30:duration=1",
  "-c:v", "libx264", "-preset", "ultrafast", "-tune", "zerolatency", "-crf", "35",
  "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an",
  (Join-Path $fixtureRoot "constant-30.mp4")
))

Invoke-FFmpeg ($common + @(
  "-f", "lavfi", "-i", "testsrc2=size=160x90:rate=30000/1001:duration=1",
  "-c:v", "libx264", "-preset", "ultrafast", "-tune", "zerolatency", "-crf", "35",
  "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an",
  (Join-Path $fixtureRoot "fractional-29-97.mp4")
))

Invoke-FFmpeg ($common + @(
  "-f", "lavfi", "-i", $video,
  "-vf", "select='eq(n,0)+eq(n,1)+eq(n,3)+eq(n,6)+eq(n,10)+eq(n,15)+eq(n,21)+eq(n,28)',setpts=PTS-STARTPTS",
  "-fps_mode", "vfr", "-c:v", "libx264", "-preset", "ultrafast", "-tune", "zerolatency", "-crf", "35",
  "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an",
  (Join-Path $fixtureRoot "vfr-irregular.mp4")
))

Invoke-FFmpeg ($common + @(
  "-f", "lavfi", "-i", "testsrc2=size=160x90:rate=24:duration=1",
  "-vf", "setpts=PTS+0.25/TB", "-c:v", "libvpx-vp9", "-deadline", "realtime", "-cpu-used", "8", "-crf", "40",
  "-copyts", "-avoid_negative_ts", "disabled", "-an",
  (Join-Path $fixtureRoot "nonzero-video-start.webm")
))

Invoke-FFmpeg ($common + @(
  "-f", "lavfi", "-i", "testsrc2=size=160x90:rate=24:duration=1",
  "-vf", "setpts=PTS-0.25/TB", "-c:v", "libvpx-vp9", "-deadline", "realtime", "-cpu-used", "8", "-crf", "40",
  "-copyts", "-avoid_negative_ts", "disabled", "-an",
  (Join-Path $fixtureRoot "negative-video-start.webm")
))

Invoke-FFmpeg ($common + @(
  "-f", "lavfi", "-i", "testsrc2=size=160x90:rate=30:duration=2",
  "-itsoffset", "0.25", "-f", "lavfi", "-i", "sine=frequency=660:sample_rate=48000:duration=2",
  "-map", "0:v:0", "-map", "1:a:0", "-c:v", "libx264", "-preset", "ultrafast", "-tune", "zerolatency", "-crf", "35",
  "-c:a", "aac", "-shortest", "-movflags", "+faststart", "-avoid_negative_ts", "disabled",
  (Join-Path $fixtureRoot "delayed-audio-start.mp4")
))

Invoke-FFmpeg ($common + @(
  "-f", "lavfi", "-i", "testsrc2=size=160x90:rate=30:duration=2",
  "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=2",
  "-map", "0:v:0", "-map", "1:a:0", "-c:v", "libx264", "-preset", "ultrafast", "-tune", "zerolatency", "-crf", "35",
  "-c:a", "aac", "-shortest", "-movflags", "+faststart",
  (Join-Path $fixtureRoot "trimmed-audio-source.mp4")
))

Invoke-FFmpeg ($common + @(
  "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=30:duration=2",
  "-c:v", "libx264", "-preset", "ultrafast", "-tune", "zerolatency", "-crf", "35",
  "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an",
  (Join-Path $fixtureRoot "performance-720p.mp4")
))

Write-Output "Generated Phase 2A.1 fixtures in $fixtureRoot"
