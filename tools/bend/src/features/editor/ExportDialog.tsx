import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Download, LoaderCircle, Repeat2, X } from "lucide-react";
import { motion, useIsPresent } from "motion/react";
import { exportStillFrame, exportVideoComposition, type ExportQuality, type VideoExportResult } from "../../engine/export/exporter";
import { downloadBlob } from "../../engine/export/download";
import { analyzeSeamlessLoopSupport, resolveExportRange, type ExportRange, type ResolvedExportRange } from "../../engine/export/range";
import type { BendProject } from "../../engine/core/types";
import { soundtrackLoopSummary } from "../../engine/audio/soundtrack";
import { motionTokens } from "../../styles/motion";

interface ExportDialogProps {
  project: BendProject;
  assetUrls: Record<string, string>;
  currentTime: number;
  onClose: () => void;
  onSetCoverTime: (time: number) => void;
}

type ExportMode = "png" | "video" | "cover";
type RangeMode = "full" | "loop";

export function ExportDialog({ project, assetUrls, currentTime, onClose, onSetCoverTime }: ExportDialogProps) {
  const [mode, setMode] = useState<ExportMode>("video");
  const [quality, setQuality] = useState<ExportQuality>("high");
  const [rangeMode, setRangeMode] = useState<RangeMode>(() => project.loop.enabled ? "loop" : "full");
  const [seamless, setSeamless] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<"idle" | "working" | "complete" | "failed" | "cancelled">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<VideoExportResult | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(null);
  const [coverPreviewError, setCoverPreviewError] = useState<string | null>(null);
  const isPresent = useIsPresent();
  const abortRef = useRef<AbortController | null>(null);
  const jobIdRef = useRef(0);
  const closedRef = useRef(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => () => {
    closedRef.current = true;
    jobIdRef.current += 1;
    abortRef.current?.abort();
  }, []);

  useEffect(() => () => {
    if (resultUrl) URL.revokeObjectURL(resultUrl);
  }, [resultUrl]);

  useEffect(() => {
    if (mode !== "cover") {
      setCoverPreviewUrl((current) => { if (current) URL.revokeObjectURL(current); return null; });
      setCoverPreviewError(null);
      return;
    }
    const controller = new AbortController();
    let url: string | null = null;
    const timer = window.setTimeout(() => {
      void exportStillFrame({ project, assetUrls, time: project.cover.time, signal: controller.signal }).then((still) => {
        if (controller.signal.aborted) return;
        url = URL.createObjectURL(still.blob);
        setCoverPreviewUrl((current) => { if (current) URL.revokeObjectURL(current); return url; });
        setCoverPreviewError(null);
      }).catch((error) => {
        if (!controller.signal.aborted) setCoverPreviewError(error instanceof Error ? error.message : "Cover preview is unavailable.");
      });
    }, 280);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [assetUrls, mode, project, project.cover.time]);

  useEffect(() => {
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusFrame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        jobIdRef.current += 1;
        abortRef.current?.abort();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), select:not([disabled]), video[controls], [href], [tabindex]:not([tabindex='-1'])") ?? []);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", onKeyDown);
      returnFocus?.focus();
    };
  }, [onClose]);

  const requestedRange: ExportRange | null = rangeMode === "loop" ? { start: project.loop.start, end: project.loop.end } : null;
  const rangeState = useMemo(() => {
    try {
      return { range: resolveExportRange(project, requestedRange), error: null as string | null };
    } catch (error) {
      return { range: null as ResolvedExportRange | null, error: error instanceof Error ? error.message : "The selected export range is invalid." };
    }
  }, [project, requestedRange?.start, requestedRange?.end]);
  const seamlessSupport = useMemo(() => rangeState.range ? analyzeSeamlessLoopSupport(project, rangeState.range) : { supported: false, reasons: ["Choose a valid range first."], visibleProceduralLayers: 0 }, [project, rangeState.range]);
  const seamlessActive = mode === "video" && rangeMode === "loop" && seamless && seamlessSupport.supported;

  const runExport = async () => {
    const jobId = jobIdRef.current + 1;
    jobIdRef.current = jobId;
    setStatus("working");
    setProgress(0);
    setMessage(null);
    const controller = new AbortController();
    abortRef.current = controller;
    const isCurrent = () => !closedRef.current && jobIdRef.current === jobId;
    try {
      if (mode === "png" || mode === "cover") {
        const timestamp = mode === "cover" ? project.cover.time : currentTime;
        const still = await exportStillFrame({ project, assetUrls, time: timestamp, signal: controller.signal });
        if (!isCurrent()) return;
        const filename = mode === "cover" ? `bend-${project.id}-cover-${timestamp.toFixed(2)}s.png` : still.filename;
        const pngResult: VideoExportResult = { blob: still.blob, filename, mimeType: still.mimeType, encoder: "mediabunny", width: still.width, height: still.height, fps: project.canvas.fps, duration: 0, codec: null, verified: still.verified };
        setResult(pngResult);
        setResultUrl(URL.createObjectURL(still.blob));
      } else {
        if (!rangeState.range) throw new Error(rangeState.error ?? "The selected export range is invalid.");
        const videoResult = await exportVideoComposition({ project, assetUrls, quality, range: requestedRange, seamless: seamlessActive, signal: controller.signal, onProgress: (value) => { if (isCurrent()) setProgress(value.total ? value.completed / value.total : 0); } });
        if (!isCurrent()) return;
        setResult(videoResult);
        setResultUrl(URL.createObjectURL(videoResult.blob));
      }
      if (!isCurrent()) return;
      setProgress(1);
      setStatus("complete");
    } catch (error) {
      if (!isCurrent()) return;
      if (controller.signal.aborted) {
        setStatus("cancelled");
        setMessage("Export cancelled.");
      } else {
        setStatus("failed");
        setMessage(error instanceof Error ? error.message : "BEND could not complete this export.");
      }
    } finally {
      if (isCurrent()) abortRef.current = null;
    }
  };

  const close = () => {
    jobIdRef.current += 1;
    abortRef.current?.abort();
    onClose();
  };

  const audibleClips = project.layers.filter((layer) => layer.kind === "video" && layer.visible && !layer.muted && layer.audio.enabled).length;
  const soundtrackActive = Boolean(project.soundtrack && !project.soundtrack.muted);
  const musicSummary = soundtrackLoopSummary(project);
  const audioExpected = audibleClips > 0 || soundtrackActive;
  const audioSummary = !audioExpected
    ? "Muted / no source"
    : `${audibleClips} clip source${audibleClips === 1 ? "" : "s"}${soundtrackActive ? ` + music${musicSummary?.loop && musicSummary.repetitions > 1 ? ` (×${musicSummary.repetitions})` : ""}` : ""}${project.soundtrack?.ducking.enabled ? " · ducked" : ""}`;
  const aspectLabel = Math.abs(project.canvas.width / project.canvas.height - 9 / 16) < 0.01 ? "9:16 Reel / Story" : Math.abs(project.canvas.width / project.canvas.height - 4 / 5) < 0.01 ? "4:5 Portrait feed" : Math.abs(project.canvas.width / project.canvas.height - 1) < 0.01 ? "1:1 Square" : Math.abs(project.canvas.width / project.canvas.height - 16 / 9) < 0.01 ? "16:9 Landscape" : `${project.canvas.width} x ${project.canvas.height}`;

  return (
    <motion.div className="dialog-backdrop" role="presentation" aria-hidden={!isPresent} inert={!isPresent} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={motionTokens.transition.quick} onMouseDown={(event) => { if (event.target === event.currentTarget && status !== "working") close(); }}>
      <motion.div className="dialog" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="export-title" aria-describedby="export-description" initial={{ opacity: 0, y: 10, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 5, scale: 0.99 }} transition={motionTokens.transition.standard}>
        <div className="dialog-header"><div><p className="eyebrow">Output / local</p><h2 className="dialog-title" id="export-title">Export composition</h2></div><button type="button" ref={closeButtonRef} className="dialog-close" onClick={close} aria-label="Close export dialog"><X size={18} /></button></div>
        <p className="dialog-copy" id="export-description">Choose a still, the full composition, or the loop / work range. Rendering stays local and exported files exclude the editor interface.</p>
        <div className="export-options export-options-three">
          <button type="button" className={mode === "video" ? "export-option is-active" : "export-option"} aria-pressed={mode === "video"} disabled={status === "working"} onClick={() => setMode("video")}><strong>Social video</strong><span>{aspectLabel} · MP4 when supported</span></button>
          <button type="button" className={mode === "cover" ? "export-option is-active" : "export-option"} aria-pressed={mode === "cover"} disabled={status === "working"} onClick={() => setMode("cover")}><strong>Cover frame</strong><span>PNG at {project.cover.time.toFixed(2)}s · full canvas</span></button>
          <button type="button" className={mode === "png" ? "export-option is-active" : "export-option"} aria-pressed={mode === "png"} disabled={status === "working"} onClick={() => setMode("png")}><strong>Current still</strong><span>PNG at playhead · full canvas</span></button>
        </div>
        {mode === "video" && <div className="export-options" style={{ marginTop: 7 }}><button type="button" className={quality === "preview" ? "export-option is-active" : "export-option"} aria-pressed={quality === "preview"} disabled={status === "working"} onClick={() => setQuality("preview")}><strong>Quick preview</strong><span>Up to 720px wide · faster review</span></button><button type="button" className={quality === "high" ? "export-option is-active" : "export-option"} aria-pressed={quality === "high"} disabled={status === "working"} onClick={() => setQuality("high")}><strong>High quality</strong><span>{project.canvas.width} × {project.canvas.height} · canvas</span></button></div>}
        {mode === "video" && <div className="export-range" role="group" aria-label="Export range">
          <div className="export-options"><button type="button" className={rangeMode === "full" ? "export-option is-active" : "export-option"} aria-pressed={rangeMode === "full"} disabled={status === "working"} onClick={() => { setRangeMode("full"); setSeamless(false); }}><strong>Full composition</strong><span>0.00 → {project.canvas.duration.toFixed(2)}s</span></button><button type="button" className={rangeMode === "loop" ? "export-option is-active" : "export-option"} aria-pressed={rangeMode === "loop"} disabled={status === "working"} onClick={() => setRangeMode("loop")}><strong>Loop / work range</strong><span>{project.loop.start.toFixed(2)} → {project.loop.end.toFixed(2)}s</span></button></div>
          <div className="export-range-readout" role="group" aria-label="Selected export range"><span><b>Start</b>{rangeState.range ? `${rangeState.range.start.toFixed(2)}s` : "Invalid"}</span><span><b>End</b>{rangeState.range ? `${rangeState.range.end.toFixed(2)}s` : "Invalid"}</span><span><b>Duration</b>{rangeState.range ? `${rangeState.range.duration.toFixed(2)}s` : "—"}</span><span><b>Output</b>Starts at 0.00s · {rangeState.range?.frameCount ?? 0} frames</span></div>
          {rangeState.error && <p className="form-error" role="alert">{rangeState.error}</p>}
          {rangeMode === "loop" && <div className="seamless-option">
            <label className={seamlessSupport.supported ? "seamless-check" : "seamless-check is-disabled"}><input type="checkbox" checked={seamlessActive} disabled={!seamlessSupport.supported || status === "working"} onChange={(event) => setSeamless(event.target.checked)} /><span><Repeat2 size={13} /><strong>Seamless repeat</strong><small>{seamlessSupport.supported ? "Mirrored (ping-pong) time map. The end approaches the start for a continuous visual repeat; source audio is omitted." : "Unavailable for this composition."}</small></span></label>
            {!seamlessSupport.supported && <p className="export-policy is-warning">{seamlessSupport.reasons.join(" ")}</p>}
            {seamlessSupport.supported && <p className="export-policy">Seamless repeat is verified for analytic procedural layers. Use ordinary loop export for footage or temporal-effect stacks.</p>}
          </div>}
        </div>}
        <div className="export-summary" role="group" aria-label="Export summary"><span><b>Output frame</b>{project.canvas.width} × {project.canvas.height} · {aspectLabel}</span><span><b>Duration</b>{mode === "video" ? rangeState.range ? `${rangeState.range.duration.toFixed(2)}s${rangeMode === "loop" ? " range" : ""}` : "Invalid range" : mode === "cover" ? `${project.cover.time.toFixed(2)}s cover` : `${currentTime.toFixed(2)}s still`}</span><span><b>Frame rate</b>{project.canvas.fps} FPS</span><span><b>Audio</b>{mode !== "video" ? "Not included" : seamlessActive ? "Muted for seamless repeat" : audioSummary}</span></div>
        {mode === "cover" && <div className="cover-preview-panel" aria-live="polite"><div className="cover-preview-frame">{coverPreviewUrl ? <img src={coverPreviewUrl} alt={`Cover frame preview at ${project.cover.time.toFixed(2)} seconds`} /> : <span>{coverPreviewError ?? "Rendering cover preview…"}</span>}</div><div><strong>Cover preview</strong><label className="cover-time-field">Timestamp <input type="number" min={0} max={Math.max(0, project.canvas.duration - 0.01)} step={0.05} value={Number(project.cover.time.toFixed(2))} aria-label="Cover time seconds" onChange={(event) => onSetCoverTime(Number(event.target.value))} /></label><span>{project.canvas.width} × {project.canvas.height}</span></div></div>}
        <p className="export-policy">BEND mixes every audible clip and the soundtrack locally, including clip fades, transition crossfades{musicSummary?.loop && musicSummary.repetitions > 1 ? `, ${musicSummary.repetitions} music repetitions with a ${musicSummary.crossfade.toFixed(2)}s boundary crossfade` : ""}{project.soundtrack?.ducking.enabled ? ", and level-driven music ducking" : ""}. Speed changes resample audio without a pitch-preservation claim; freeze-frame audio is silent. The encoded file is reopened and checked for dimensions, duration, frame count, start timestamp, and audio presence before download. Guides never enter the canvas.</p>
        {status === "working" && <div className="export-progress" role="status" aria-live="polite"><div className="progress-label"><span><LoaderCircle size={12} className="spin" /> Rendering locally</span><span>{Math.round(progress * 100)}%</span></div><div className="progress-track" role="progressbar" aria-label="Export progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}><div className="progress-fill" style={{ transform: `scaleX(${progress})` }} /></div><button type="button" className="small-action" style={{ marginTop: 12 }} onClick={() => abortRef.current?.abort()}>Cancel export</button></div>}
        {status === "failed" && <p className="form-error" role="alert">{message}</p>}
        {(status === "idle" || status === "cancelled") && message && <p className="form-error" role="status">{message}</p>}
        {status === "complete" && result && resultUrl && <div className="export-result">
          <p><Check size={13} /> {mode === "video" ? "Export validated" : "Export complete"} ? {result.mimeType} ? {(result.blob.size / 1024 / 1024).toFixed(2)} MB</p>
          {result.verification && <p className="export-validation">{result.verification.width} × {result.verification.height} · {result.verification.frameCount} frames · {result.verification.duration.toFixed(2)}s · {result.verification.container}{result.verification.audioPresent ? ` · ${result.verification.audioCodec ?? "audio"}` : " · video only"}</p>}
          {mode !== "video" && <p className="export-validation">{result.width} ? {result.height} ? PNG ? {mode === "cover" ? `cover frame ${project.cover.time.toFixed(2)}s` : `frame ${currentTime.toFixed(2)}s`}</p>}
          {mode === "video" && result.audioStatus === "included" && <p className="export-audio-status">Mixed timeline audio included</p>}
          {mode === "video" && result.audioMessage && <p className="export-validation" role="status">{result.audioMessage}</p>}
          {mode === "video" && result.audioStatus !== "included" && <p className="export-audio-status is-warning">Video-only · {result.audioMessage ?? "No audible source was selected."}</p>}
          {mode === "video" ? <video src={resultUrl} controls playsInline /> : <img src={resultUrl} alt={mode === "cover" ? "Exported BEND cover frame" : "Exported BEND frame"} style={{ display: "block", maxHeight: 220, objectFit: "contain", width: "100%" }} />}
          <button type="button" className="small-action" onClick={() => downloadBlob(result.blob, result.filename)}><Download size={13} /> Download {result.filename}</button>
        </div>}
        <div className="dialog-actions">{status !== "complete" && <button type="button" className="button button-secondary" onClick={close}>Close</button>}{status === "complete" ? <button type="button" className="button button-primary" onClick={close}>Done</button> : <button type="button" className="button button-primary" onClick={() => void runExport()} disabled={status === "working" || (mode === "video" && !rangeState.range)}>{status === "failed" || status === "cancelled" ? "Retry export" : mode === "cover" ? "Export cover PNG" : mode === "png" ? "Export still PNG" : seamlessActive ? "Export seamless loop" : rangeMode === "loop" ? "Export range" : "Export social video"}</button>}</div>
      </motion.div>
    </motion.div>
  );
}

