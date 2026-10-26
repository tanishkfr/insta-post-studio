import { useEffect, useMemo, useRef, useState } from "react";
import type { BendProject, ProjectSoundtrack, VideoLayer } from "../../engine/core/types";
import { clipWaveformSamples, soundtrackWaveformSamples, waveformPeakDb, type WaveformPeaks } from "../../engine/audio/waveform";
import { soundtrackLoopSummary } from "../../engine/audio/soundtrack";
import { acquireWaveform, type WaveformResult } from "./waveformService";

export function useWaveform(assetId: string | undefined, url: string | undefined): WaveformResult & { loading: boolean } {
  const [state, setState] = useState<WaveformResult & { loading: boolean }>({ peaks: null, status: "none", loading: false });
  useEffect(() => {
    if (!assetId || !url) {
      setState({ peaks: null, status: "none", loading: false, message: "Media is missing or unavailable." });
      return;
    }
    let alive = true;
    const request = acquireWaveform(assetId, url);
    setState((current) => ({ ...current, loading: true }));
    void request.promise.then((result) => {
      if (alive) setState({ ...result, loading: false });
    });
    return () => {
      alive = false;
      request.release();
    };
  }, [assetId, url]);
  return state;
}

export function ClipWaveform({ layer, project, assetUrl }: { layer: VideoLayer; project: BendProject; assetUrl?: string }) {
  const asset = project.assets[layer.assetId];
  const waveform = useWaveform(asset?.id, assetUrl);
  const values = useMemo(() => waveform.peaks ? clipWaveformSamples(waveform.peaks, layer, 320) : null, [layer, waveform.peaks]);
  const description = waveform.peaks
    ? `Clip audio waveform, ${layer.timeline.duration.toFixed(2)} seconds, source peak ${waveformPeakDb(waveform.peaks.peak)}${layer.playback.reverse ? ", reversed" : ""}${layer.playback.speed !== 1 || layer.playback.rampEnabled ? ", speed adjusted" : ""}.`
    : waveform.loading
      ? "Clip audio waveform loading."
      : `Clip audio waveform unavailable. ${waveform.message ?? "No decodable audio."}`;
  return <WaveformCanvas values={values} loading={waveform.loading} status={waveform.status} description={description} className="clip-waveform" />;
}

export function SoundtrackWaveform({ project, soundtrack, assetUrl }: { project: BendProject; soundtrack: ProjectSoundtrack; assetUrl?: string }) {
  const asset = project.assets[soundtrack.assetId];
  const waveform = useWaveform(asset?.id, assetUrl);
  const summary = soundtrackLoopSummary(project);
  const playbackEnd = summary?.playbackEnd ?? project.canvas.duration;
  const values = useMemo(() => waveform.peaks ? soundtrackWaveformSamples(waveform.peaks, project, soundtrack, 420, playbackEnd) : null, [playbackEnd, project, soundtrack, waveform.peaks]);
  const description = waveform.peaks
    ? `Soundtrack waveform, ${summary?.playbackDuration.toFixed(2) ?? "0.00"} seconds audible${summary?.loop ? `, ${summary.repetitions} loop repetitions` : ""}, source peak ${waveformPeakDb(waveform.peaks.peak)}.`
    : waveform.loading
      ? "Soundtrack waveform loading."
      : `Soundtrack waveform unavailable. ${waveform.message ?? "No decodable audio."}`;
  return <WaveformCanvas values={values} loading={waveform.loading} status={waveform.status} description={description} className="music-waveform" />;
}

function WaveformCanvas({ values, loading, status, description, className }: {
  values: Float32Array | null;
  loading: boolean;
  status: WaveformResult["status"];
  description: string;
  className: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(24, Math.round(rect.width * Math.min(2, window.devicePixelRatio || 1)));
      const height = Math.max(12, Math.round(rect.height * Math.min(2, window.devicePixelRatio || 1)));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      const context = canvas.getContext("2d");
      if (!context) return;
      context.clearRect(0, 0, width, height);
      if (!values) {
        context.strokeStyle = "rgba(255,255,255,0.34)";
        context.setLineDash([3, 3]);
        context.beginPath();
        context.moveTo(0, height / 2 + 0.5);
        context.lineTo(width, height / 2 + 0.5);
        context.stroke();
        return;
      }
      const style = getComputedStyle(canvas);
      context.fillStyle = style.getPropertyValue("--waveform-color").trim() || "rgba(35,111,114,0.82)";
      const step = Math.max(1, Math.floor(width / Math.max(32, values.length)));
      const barWidth = Math.max(1, step - 1);
      const center = height / 2;
      for (let index = 0; index < values.length; index += 1) {
        const x = (index / values.length) * width;
        const amplitude = Math.max(0.012, values[index] ?? 0);
        const barHeight = Math.max(1, amplitude * (height - 3));
        context.fillRect(x, center - barHeight / 2, barWidth, barHeight);
      }
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [values]);
  return <canvas ref={canvasRef} className={className} data-waveform-status={status} aria-label={description} role="img" />;
}
