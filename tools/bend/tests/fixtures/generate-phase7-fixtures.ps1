$ErrorActionPreference = "Stop"
$ffmpegCommand = Get-Command ffmpeg -ErrorAction SilentlyContinue
$ffprobeCommand = Get-Command ffprobe -ErrorAction SilentlyContinue
$ffmpeg = if ($ffmpegCommand) { $ffmpegCommand.Source } else { "C:\Users\User\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-9.0-full_build\bin\ffmpeg.exe" }
$out = Join-Path (Get-Location) "output/fixtures"
New-Item -ItemType Directory -Force -Path $out | Out-Null
$fontPath = "C:/Windows/Fonts/consola.ttf"
$fontOption = if (Test-Path $fontPath) { "fontfile='C\:/Windows/Fonts/consola.ttf':" } else { "" }

function Render-Fixture {
  param(
    [string]$Name,
    [string]$Size,
    [int]$Seconds,
    [string]$Label,
    [string]$Audio,
    [string[]]$Extra = @()
  )
  $duration = "$Seconds"
  $visual = "testsrc2=size=$Size`:rate=30`:duration=$duration"
  $draw = "drawtext=${fontOption}text='$Label %{pts\:hms}':x=18:y=18:fontsize=26:fontcolor=white:box=1:boxcolor=black@0.65"
  $args = @("-hide_banner", "-y", "-f", "lavfi", "-i", $visual)
  if ($Audio -eq "tone") {
    $args += @("-f", "lavfi", "-i", "sine=frequency=1000:sample_rate=48000:duration=$duration")
  }
  $args += @("-vf", $draw)
  $args += $Extra
  if ($Audio -eq "tone") { $args += @("-c:a", "aac", "-b:a", "128k") }
  $args += @("-shortest", (Join-Path $out $Name))
  & $ffmpeg @args
  if ($LASTEXITCODE -ne 0) { throw "ffmpeg failed for $Name" }
}

$videoOnly = @("-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart")
Render-Fixture -Name "bend-portrait-916.mp4" -Size "540x960" -Seconds 6 -Label "BEND 9x16" -Audio "tone" -Extra $videoOnly
Render-Fixture -Name "bend-square-11.mp4" -Size "540x540" -Seconds 4 -Label "BEND 1x1" -Audio "tone" -Extra $videoOnly
Render-Fixture -Name "bend-landscape-long.mp4" -Size "960x540" -Seconds 12 -Label "BEND LONG" -Audio "none" -Extra @("-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart")
Render-Fixture -Name "bend-portrait-video-only.mp4" -Size "540x960" -Seconds 3 -Label "BEND SILENT" -Audio "none" -Extra $videoOnly

$duration = "4"
& $ffmpeg -hide_banner -y -f lavfi -i "testsrc2=size=540x960:rate=30:duration=$duration" -f lavfi -i "sine=frequency=1000:sample_rate=48000:duration=$duration" -vf "drawtext=${fontOption}text='BEND VP9 %{pts\:hms}':x=18:y=18:fontsize=26:fontcolor=white:box=1:boxcolor=black@0.65" -c:v libvpx-vp9 -b:v 2M -row-mt 1 -c:a libopus -b:a 96k -shortest (Join-Path $out "bend-portrait-vp9-opus.webm")
if ($LASTEXITCODE -ne 0) { throw "ffmpeg failed for bend-portrait-vp9-opus.webm" }


$ffprobe = if ($ffprobeCommand) { $ffprobeCommand.Source } else { "C:\Users\User\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-9.0-full_build\bin\ffprobe.exe" }
foreach ($file in Get-ChildItem $out -File | Where-Object { $_.Name -like "bend-*" }) {
  $json = & $ffprobe -v error -show_entries format=duration,size,format_name -show_entries stream=index,codec_name,codec_type,width,height,avg_frame_rate,sample_rate,channels,start_time,duration -of json $file.FullName | ConvertFrom-Json
  $v = $json.streams | Where-Object codec_type -eq "video" | Select-Object -First 1
  $a = $json.streams | Where-Object codec_type -eq "audio" | Select-Object -First 1
  "{0}`t{1}`t{2}`tV:{3} {4}x{5} {6} start={7}`tA:{8} {9}ch {10}Hz start={11}" -f $file.Name, $json.format.format_name, $json.format.duration, $v.codec_name, $v.width, $v.height, $v.avg_frame_rate, $v.start_time, $a.codec_name, $a.channels, $a.sample_rate, $a.start_time
}
