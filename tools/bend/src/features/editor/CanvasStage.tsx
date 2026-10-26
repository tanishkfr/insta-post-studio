import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent } from "react";
import { BookOpen, Minus, Pause, Play, Plus, RotateCw, Upload } from "lucide-react";
import { getActiveLayer } from "../../engine/core/project";
import { clamp, formatSeconds, isLayerActiveAt, sourceTimeAt } from "../../engine/core/timeline";
import { compositionDeltaFromClient, compositionPointFromClient, compositionToLayerLocal, getLayerContentDimensions, getLayerFullContentDimensions, getLayerSelectionGeometry, hitTestLayer, layerLocalToComposition, normalizeAngle, snapAngle, snapTranslation, type Point, type SnapGuide } from "../../engine/core/transform";
import { createVideoElement, releaseVideoElement, seekVideo, waitForVideoReady } from "../../engine/media/media";
import { PixiBendRenderer } from "../../engine/render/pixiRenderer";
import { buildComparisonProject } from "../../engine/render/comparison";
import { TemporalEngine } from "../../engine/temporal/engine";
import { isHeavyTemporalStack } from "../../engine/temporal/time";
import { evaluateAnimatedLayer, setTargetValue, upsertKeyframe } from "../../engine/animation/engine";
import { getGeneratorDefinition } from "../../engine/generators/registry";
import type { BendLayer, BendProject, CropRect } from "../../engine/core/types";
import { useEditorStore } from "../../app/store";
import { transitionAudioGainAt } from "../../engine/transitions/transition";
import { soundtrackPlaybackEnd, soundtrackSamplePointsAt } from "../../engine/audio/soundtrack";

interface CanvasStageProps {
  project: BendProject;
  activeLayerId: string | null;
  assetUrls: Record<string, string>;
  currentTime: number;
  isPlaying: boolean;
  onTogglePlaying: () => void;
  onImportFile: (file: File) => void;
  onRequestImport: () => void;
  onOpenAddMenu: () => void;
  onOpenExample: () => void;
}

type Corner = "nw" | "ne" | "se" | "sw";
type CropHandle = Corner | "n" | "e" | "s" | "w";

type Interaction = {
  mode: "move" | "scale" | "rotate" | "crop-move" | "crop-resize";
  pointerId: number;
  layerId: string;
  initialLayer: BendLayer;
  startComposition: Point;
  initialCrop: CropRect;
  corner?: Corner;
  cropHandle?: CropHandle;
  fixedLocal?: Point;
  changed: boolean;
};

export function CanvasStage({ project, activeLayerId, assetUrls, currentTime, isPlaying, onTogglePlaying, onImportFile, onRequestImport, onOpenAddMenu, onOpenExample }: CanvasStageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<PixiBendRenderer | null>(null);
  const temporalEngineRef = useRef<TemporalEngine | null>(null);
  const videoElementsRef = useRef<Record<string, HTMLVideoElement>>({});
  const interactionRef = useRef<Interaction | null>(null);
  const [rendererReady, setRendererReady] = useState(false);
  const [rendererError, setRendererError] = useState<string | null>(null);
  const [renderStackError, setRenderStackError] = useState<string | null>(null);
  const [rendererAttempt, setRendererAttempt] = useState(0);
  const [isRendering, setIsRendering] = useState(false);
  const [showSlowRender, setShowSlowRender] = useState(false);
  const [lastRenderMs, setLastRenderMs] = useState<number | null>(null);
  const [previewSuspended, setPreviewSuspended] = useState(false);
  const renderAbortRef = useRef<AbortController | null>(null);
  const renderRequestRef = useRef<{ project: BendProject; comparisonProject: BendProject; time: number; isPlaying: boolean } | null>(null);
  const renderRunningRef = useRef(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [snapGuides, setSnapGuides] = useState<SnapGuide[]>([]);
  const updateTransient = useEditorStore((state) => state.updateTransient);
  const beginGesture = useEditorStore((state) => state.beginGesture);
  const endGesture = useEditorStore((state) => state.endGesture);
  const cancelGesture = useEditorStore((state) => state.cancelGesture);
  const setActiveLayer = useEditorStore((state) => state.setActiveLayer);
  const setInspectorSection = useEditorStore((state) => state.setInspectorSection);
  const commit = useEditorStore((state) => state.commit);
  const canvasMode = useEditorStore((state) => state.canvasMode);
  const cancelCrop = useEditorStore((state) => state.cancelCrop);
  const autoKey = useEditorStore((state) => state.autoKey);
  const compareLayerId = useEditorStore((state) => state.compareLayerId);
  const setCompareLayer = useEditorStore((state) => state.setCompareLayer);
  const setCurrentTime = useEditorStore((state) => state.setCurrentTime);
  const setIsPlaying = useEditorStore((state) => state.setIsPlaying);
  const monitorAudio = useEditorStore((state) => state.monitorAudio);
  const previewQuality = useEditorStore((state) => state.previewQuality);
  const setPreviewQuality = useEditorStore((state) => state.setPreviewQuality);
  const soundtrackAudioRef = useRef<HTMLAudioElement | null>(null);
  const soundtrack = project.soundtrack;
  const soundtrackUrl = soundtrack ? assetUrls[soundtrack.assetId] : undefined;
  const layer = activeLayerId ? getActiveLayer(project, activeLayerId) : null;
  const evaluatedLayer = layer ? evaluateAnimatedLayer(project, layer, currentTime) : null;
  const comparisonProject = useMemo(() => compareLayerId ? buildComparisonProject(project, compareLayerId) : project, [compareLayerId, project]);
  const heavyStack = useMemo(() => project.layers.some((candidate) => candidate.effects.some((effect) => effect.enabled) && isHeavyTemporalStack(candidate.effects)), [project.layers]);
  const comparisonLayer = compareLayerId ? project.layers.find((candidate) => candidate.id === compareLayerId) : null;
  const videoAssetKey = useMemo(() => project.layers
    .filter((candidate): candidate is Extract<BendLayer, { kind: "video" }> => candidate.kind === "video" && Boolean(assetUrls[candidate.assetId]))
    .map((candidate) => `${candidate.id}:${candidate.assetId}:${assetUrls[candidate.assetId]}:${project.assets[candidate.assetId]?.duration ?? 0}`)
    .join("|"), [assetUrls, project.assets, project.layers]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let alive = true;
    setRendererReady(false);
    setRendererError(null);
    const resolution = previewQuality === "draft" ? 0.5 : 1;
    const renderer = new PixiBendRenderer({ canvas, width: project.canvas.width, height: project.canvas.height, resolution });
    const temporalEngine = new TemporalEngine();
    temporalEngine.setRenderResolution(resolution);
    temporalEngine.setPreviewSafety(heavyStack);
    rendererRef.current = renderer;
    temporalEngineRef.current = temporalEngine;
    void renderer.init().then(() => {
      if (!alive) return;
      renderer.setVideoElements(videoElementsRef.current);
      setRendererReady(true);
    }).catch((error: unknown) => {
      if (alive) {
        setRendererReady(false);
        setRendererError(error instanceof Error ? error.message : "WebGL could not be initialized.");
      }
    });
    return () => {
      alive = false;
      renderRequestRef.current = null;
      renderAbortRef.current?.abort();
      renderer.destroy();
      temporalEngine.dispose();
      rendererRef.current = null;
      temporalEngineRef.current = null;
      setRendererReady(false);
    };
    // The renderer owns a canvas for the life of this stage. Dimension changes
    // are handled by the resize effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rendererAttempt]);

  useEffect(() => {
    rendererRef.current?.resize(project.canvas.width, project.canvas.height);
  }, [project.canvas.width, project.canvas.height]);

  useEffect(() => {
    const resolution = previewQuality === "draft" ? 0.5 : 1;
    rendererRef.current?.setResolution(resolution);
    temporalEngineRef.current?.setRenderResolution(resolution);
    setPreviewSuspended(false);
  }, [previewQuality]);

  useEffect(() => {
    temporalEngineRef.current?.setPreviewSafety(heavyStack);
  }, [heavyStack, rendererReady]);

  useEffect(() => () => {
    if (useEditorStore.getState().compareLayerId) useEditorStore.getState().setCompareLayer(null);
  }, []);

  useEffect(() => {
    if (compareLayerId && !project.layers.some((candidate) => candidate.id === compareLayerId)) setCompareLayer(null);
  }, [compareLayerId, project.layers, setCompareLayer]);

  useEffect(() => {
    const renderer = rendererRef.current;
    const nextElements: Record<string, HTMLVideoElement> = {};
    for (const layerCandidate of project.layers) {
      if (layerCandidate.kind !== "video") continue;
      const url = assetUrls[layerCandidate.assetId];
      if (url) nextElements[layerCandidate.id] = createVideoElement(url);
    }
    videoElementsRef.current = nextElements;
    renderer?.setVideoElements(nextElements);
    let cancelled = false;
    void Promise.all(Object.values(nextElements).map((video) => waitForVideoReady(video).catch(() => undefined))).then(() => {
      if (!cancelled) renderer?.setVideoElements(nextElements);
    });
    return () => {
      cancelled = true;
      renderer?.setVideoElements({});
      for (const video of Object.values(nextElements)) releaseVideoElement(video);
      if (videoElementsRef.current === nextElements) videoElementsRef.current = {};
    };
  }, [videoAssetKey, rendererReady]);

  useEffect(() => {
    soundtrackAudioRef.current?.pause();
    soundtrackAudioRef.current?.remove();
    soundtrackAudioRef.current = null;
    if (!monitorAudio || !soundtrack || !soundtrackUrl) return;
    const audio = document.createElement("audio");
    audio.preload = "auto";
    audio.muted = soundtrack.muted;
    audio.setAttribute("aria-hidden", "true");
    audio.style.display = "none";
    audio.src = soundtrackUrl;
    document.body.appendChild(audio);
    soundtrackAudioRef.current = audio;
    return () => {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      audio.remove();
      if (soundtrackAudioRef.current === audio) soundtrackAudioRef.current = null;
    };
  }, [monitorAudio, soundtrack?.assetId, soundtrack?.muted, soundtrackUrl]);

  useEffect(() => {
    const videos = videoElementsRef.current;
    for (const layerCandidate of project.layers) {
      if (layerCandidate.kind !== "video") continue;
      const video = videos[layerCandidate.id];
      if (!video) continue;
      const specialTime = layerCandidate.playback.reverse || layerCandidate.playback.rampEnabled || Boolean(layerCandidate.playback.freeze);
      const audible = monitorAudio && !specialTime && !layerCandidate.muted && layerCandidate.audio.enabled && isLayerActiveAt(layerCandidate, currentTime);
      video.muted = !audible;
      if (!audible) continue;
      const local = Math.max(0, currentTime - layerCandidate.timeline.start);
      const fadeIn = layerCandidate.audio.fadeIn > 0 ? Math.min(1, local / layerCandidate.audio.fadeIn) : 1;
      const remaining = layerCandidate.timeline.duration - local;
      const fadeOut = layerCandidate.audio.fadeOut > 0 ? Math.min(1, Math.max(0, remaining / layerCandidate.audio.fadeOut)) : 1;
      const gain = dbToLinear(layerCandidate.audio.gainDb) * fadeIn * fadeOut * transitionAudioGainAt(project, layerCandidate, currentTime);
      video.volume = Math.min(1, Math.max(0, gain));
    }
    const audio = soundtrackAudioRef.current;
    if (audio && soundtrack) {
      const musicEnd = soundtrackPlaybackEnd(project);
      const inside = currentTime >= soundtrack.timelineStart && currentTime < musicEnd;
      const musicLocal = Math.max(0, currentTime - soundtrack.timelineStart);
      const musicPlaybackDuration = Math.max(0.1, musicEnd - soundtrack.timelineStart);
      const musicFadeIn = soundtrack.fadeIn > 0 ? Math.min(1, musicLocal / soundtrack.fadeIn) : 1;
      const musicFadeOut = soundtrack.fadeOut > 0 ? Math.min(1, Math.max(0, (musicPlaybackDuration - musicLocal) / soundtrack.fadeOut)) : 1;
      audio.muted = soundtrack.muted;
      audio.volume = Math.min(1, Math.max(0, dbToLinear(soundtrack.gainDb) * musicFadeIn * musicFadeOut));
      if (isPlaying && monitorAudio && !soundtrack.muted && inside) {
        const points = soundtrackSamplePointsAt(soundtrack, currentTime, musicEnd);
        let primary = points[0];
        for (const point of points) if (primary && point.gain > primary.gain) primary = point;
        if (primary) {
          const target = primary.sourceTime;
          if (Math.abs(audio.currentTime - target) > 0.3) audio.currentTime = Math.max(0, target);
          if (audio.paused) void audio.play().catch(() => undefined);
        } else {
          audio.pause();
        }
      } else {
        audio.pause();
      }
    }
  }, [currentTime, isPlaying, monitorAudio, project, soundtrack, soundtrackUrl, videoAssetKey]);

  useEffect(() => {
    const videos = videoElementsRef.current;
    const syncPlayback = async () => {
      for (const layerCandidate of project.layers) {
        if (layerCandidate.kind !== "video") continue;
        const video = videos[layerCandidate.id];
        if (!video) continue;
        const requiresFrameSeek = layerCandidate.playback.reverse || layerCandidate.playback.rampEnabled || Boolean(layerCandidate.playback.freeze);
        if (isPlaying && !requiresFrameSeek && isLayerActiveAt(layerCandidate, currentTime)) {
          video.playbackRate = layerCandidate.playback.speed;
          if (video.paused) void video.play().catch(() => undefined);
          const target = sourceTimeAt(layerCandidate, currentTime);
          if (Math.abs(video.currentTime - target) > 0.2) video.currentTime = target;
        } else video.pause();
      }
    };
    void syncPlayback();
  }, [currentTime, isPlaying, project.layers]);

  useEffect(() => {
    if (!isRendering) {
      setShowSlowRender(false);
      return;
    }
    const timer = window.setTimeout(() => setShowSlowRender(true), 1_500);
    return () => window.clearTimeout(timer);
  }, [isRendering]);

  const pumpRender = useCallback(async () => {
    if (renderRunningRef.current) return;
    renderRunningRef.current = true;
    setIsRendering(true);
    try {
      while (renderRequestRef.current) {
        const request = renderRequestRef.current;
        renderRequestRef.current = null;
        const renderer = rendererRef.current;
        const temporal = temporalEngineRef.current;
        if (!renderer || !temporal) break;
        const controller = new AbortController();
        renderAbortRef.current = controller;
        const pipelineStarted = performance.now();
        try {
          for (const layerCandidate of request.project.layers) {
            if (layerCandidate.kind !== "video") continue;
            const video = videoElementsRef.current[layerCandidate.id];
            if (!video || !isLayerActiveAt(layerCandidate, request.time)) continue;
            throwIfAborted(controller.signal);
            const requiresFrameSeek = layerCandidate.playback.reverse || layerCandidate.playback.rampEnabled || Boolean(layerCandidate.playback.freeze);
            if (!request.isPlaying || requiresFrameSeek) {
              await waitForVideoReady(video);
              video.pause();
              await seekVideo(video, sourceTimeAt(layerCandidate, request.time));
            } else if (Math.abs(video.currentTime - sourceTimeAt(layerCandidate, request.time)) > 0.2) {
              video.currentTime = sourceTimeAt(layerCandidate, request.time);
            }
            throwIfAborted(controller.signal);
          }
          const temporalFrames = await temporal.prepareFrame({
            project: request.comparisonProject,
            time: request.time,
            signal: controller.signal,
            sampleVideo: async (layerCandidate, sampleTime, signal) => {
              if (layerCandidate.kind !== "video") throw new Error("Temporal video sampling received a non-video layer.");
              const video = videoElementsRef.current[layerCandidate.id];
              if (!video) throw new Error("The local video source is unavailable for a temporal effect.");
              throwIfAborted(signal);
              await waitForVideoReady(video);
              await seekVideo(video, sourceTimeAt(layerCandidate, sampleTime));
              throwIfAborted(signal);
              return copyVideoFrame(video, previewQuality === "draft" || heavyStack ? Math.round(project.canvas.width * 0.5) : undefined);
            },
          });
          throwIfAborted(controller.signal);
          renderer.setTemporalFrames(temporalFrames ?? {});
          renderer.render(request.comparisonProject, request.time);
          const renderMs = performance.now() - pipelineStarted;
          if (canvasRef.current) canvasRef.current.dataset.renderMs = renderMs.toFixed(2);
          setLastRenderMs(renderMs);
          setRendererError(null);
          setRenderStackError(null);
        } catch (error) {
          if (!isAbortError(error)) {
            const message = error instanceof Error ? error.message : "The frame could not be rendered.";
            if (/Frame Feedback must remain|temporal effect order|temporal stack/i.test(message)) setRenderStackError(message);
            else setRendererError(message);
          }
        } finally {
          if (renderAbortRef.current === controller) renderAbortRef.current = null;
        }
      }
    } finally {
      renderRunningRef.current = false;
      setIsRendering(false);
      // A request can arrive between the loop check and the running flag
      // clearing. Pick it up rather than leaving the canvas stale.
      if (renderRequestRef.current) void pumpRender();
    }
  }, [previewQuality, project.canvas.width]);

  useEffect(() => {
    if (!rendererReady || previewSuspended) return;
    renderRequestRef.current = { project, comparisonProject, time: currentTime, isPlaying };
    void pumpRender();
  }, [comparisonProject, currentTime, isPlaying, previewSuspended, project, rendererReady, pumpRender]);

  const stopPreview = () => {
    renderRequestRef.current = null;
    renderAbortRef.current?.abort();
    setIsPlaying(false);
    setPreviewSuspended(true);
    setShowSlowRender(false);
  };

  useEffect(() => () => {
    renderRequestRef.current = null;
    renderAbortRef.current?.abort();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;
      const interactive = target?.closest("input, textarea, select, button, [role='button'], [role='slider'], [role='tab'], [tabindex]");
      const blockingSurface = document.querySelector("[role='dialog'], [role='menu']");
      if (typing || (event.key !== "Escape" && (interactive || blockingSurface))) return;
      if (event.key === "Escape") {
        if (interactionRef.current) {
          cancelGesture();
          interactionRef.current = null;
          setSnapGuides([]);
          event.preventDefault();
        }
        if (canvasMode === "crop") {
          cancelCrop();
          event.preventDefault();
        }
        return;
      }
      if (!document.activeElement?.closest(".canvas-area")) return;
      if (!evaluatedLayer || evaluatedLayer.locked || !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
      const step = event.shiftKey ? 10 : 1;
      const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
      const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
      commit("Nudge layer", (draft) => {
        const targetLayer = draft.layers.find((candidate) => candidate.id === evaluatedLayer.id);
        if (!targetLayer) return draft;
        directValue(targetLayer, "transform.x", targetLayer.transform.x + dx, currentTime, autoKey);
        directValue(targetLayer, "transform.y", targetLayer.transform.y + dy, currentTime, autoKey);
        return draft;
      });
      event.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [autoKey, cancelCrop, cancelGesture, canvasMode, commit, currentTime, evaluatedLayer, project.layers, setActiveLayer]);

  const handleHandleKeyDown = (event: ReactKeyboardEvent<HTMLElement>, mode: "scale" | "rotate" | "crop-resize", handle?: Corner | CropHandle) => {
    if (!evaluatedLayer || evaluatedLayer.locked) return;
    if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
    const step = event.shiftKey ? 0.1 : 0.02;
    if (mode === "rotate") {
      const rotationStep = event.shiftKey ? 15 : 1;
      const direction = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
      commit("Rotate layer", (draft) => {
        const target = draft.layers.find((candidate) => candidate.id === evaluatedLayer.id);
        if (target) directValue(target, "transform.rotation", target.transform.rotation + direction * rotationStep, currentTime, autoKey);
        return draft;
      });
    } else if (mode === "scale") {
      const direction = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
      commit("Scale layer", (draft) => {
        const target = draft.layers.find((candidate) => candidate.id === evaluatedLayer.id);
        if (target) directValue(target, "transform.scale", clamp(target.transform.scale + direction * step, 0.1, 4), currentTime, autoKey);
        return draft;
      });
    } else if (handle && isCropHandle(handle)) {
      const delta = {
        x: event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0,
        y: event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0,
      };
      commit("Adjust crop", (draft) => {
        const target = draft.layers.find((candidate) => candidate.id === evaluatedLayer.id);
        if (target) target.crop = resizeCrop(target.crop, handle, delta);
        return draft;
      });
    }
    event.preventDefault();
  };

  const beginInteraction = (event: PointerEvent<HTMLElement>, mode: Interaction["mode"], handle?: Corner | CropHandle, interactionLayer = evaluatedLayer) => {
    if (!frameRef.current || !interactionLayer || interactionLayer.locked) return;
    const rect = frameRef.current.getBoundingClientRect();
    const startComposition = compositionPointFromClient(event.clientX, event.clientY, rect, project);
    const initialLayer = structuredClone(interactionLayer);
    const interaction: Interaction = { mode, pointerId: event.pointerId, layerId: interactionLayer.id, initialLayer, startComposition, initialCrop: { ...initialLayer.crop }, changed: false };
    if (mode === "scale" && isCorner(handle)) {
      const dimensions = getLayerContentDimensions(project, initialLayer);
      interaction.corner = handle;
      interaction.fixedLocal = fixedCorner(handle, dimensions.width, dimensions.height);
    }
    if (mode === "crop-resize" && isCropHandle(handle)) interaction.cropHandle = handle;
    beginGesture();
    interactionRef.current = interaction;
    frameRef.current.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const handleFramePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !frameRef.current) return;
    const rect = frameRef.current.getBoundingClientRect();
    const point = compositionPointFromClient(event.clientX, event.clientY, rect, project);
    if (canvasMode === "crop" && evaluatedLayer) {
      if (hitTestLayer(project, evaluatedLayer, point)) {
        if (!evaluatedLayer.locked) beginInteraction(event, "crop-move");
        return;
      }
      return;
    }
    const hit = [...project.layers].reverse().find((candidate) => candidate.visible && isLayerActiveAt(candidate, currentTime) && (candidate.kind !== "video" || Boolean(assetUrls[candidate.assetId])) && hitTestLayer(project, evaluateAnimatedLayer(project, candidate, currentTime), point));
    setActiveLayer(hit?.id ?? null);
    const hitLayer = hit ? evaluateAnimatedLayer(project, hit, currentTime) : null;
    if (hitLayer && !hitLayer.locked) beginInteraction(event, "move", undefined, hitLayer);
  };

  const handlePointerMove = (event: PointerEvent<HTMLElement>) => {
    const interaction = interactionRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId || !frameRef.current) return;
    const rect = frameRef.current.getBoundingClientRect();
    const point = compositionPointFromClient(event.clientX, event.clientY, rect, project);
    const initial = interaction.initialLayer;
    const threshold = compositionDeltaFromClient(8, 8, rect, project);
    let guides: SnapGuide[] = [];
    updateTransient((draft) => {
      const target = draft.layers.find((candidate) => candidate.id === interaction.layerId);
      if (!target) return draft;
      if (interaction.mode === "move") {
        const delta = { x: point.x - interaction.startComposition.x, y: point.y - interaction.startComposition.y };
        const snapped = snapTranslation(project, initial, initial.transform.x + delta.x, initial.transform.y + delta.y, threshold, !event.shiftKey);
        guides = snapped.guides;
        directValue(target, "transform.x", snapped.x, currentTime, autoKey);
        directValue(target, "transform.y", snapped.y, currentTime, autoKey);
        interaction.changed = Math.abs(delta.x) + Math.abs(delta.y) > 0.5;
        return draft;
      }
      if (interaction.mode === "scale" && interaction.corner && interaction.fixedLocal) {
        const dimensions = getLayerContentDimensions(project, initial);
        const activeLocal = compositionToLayerLocal(project, initial, point);
        const activeCorner = activeCornerFor(interaction.corner, dimensions.width, dimensions.height);
        const baseVector = { x: activeCorner.x - interaction.fixedLocal.x, y: activeCorner.y - interaction.fixedLocal.y };
        const nextVector = { x: activeLocal.x - interaction.fixedLocal.x, y: activeLocal.y - interaction.fixedLocal.y };
        const denominator = Math.max(1, baseVector.x * baseVector.x + baseVector.y * baseVector.y);
        const factor = Math.max(0.05 / Math.max(0.05, initial.transform.scale), (nextVector.x * baseVector.x + nextVector.y * baseVector.y) / denominator);
        const nextScale = clamp(initial.transform.scale * factor, 0.05, 8);
        const before = layerLocalToComposition(project, initial, interaction.fixedLocal);
        const preview = structuredClone(initial);
        preview.transform.scale = nextScale;
        const after = layerLocalToComposition(project, preview, interaction.fixedLocal);
        directValue(target, "transform.scale", nextScale, currentTime, autoKey);
        directValue(target, "transform.x", initial.transform.x + before.x - after.x, currentTime, autoKey);
        directValue(target, "transform.y", initial.transform.y + before.y - after.y, currentTime, autoKey);
        interaction.changed = Math.abs(nextScale - initial.transform.scale) > 0.001;
        return draft;
      }
      if (interaction.mode === "rotate") {
        const center = getLayerSelectionGeometry(project, initial).center;
        const startAngle = Math.atan2(interaction.startComposition.y - center.y, interaction.startComposition.x - center.x) * 180 / Math.PI;
        let nextRotation = initial.transform.rotation + normalizeAngle(Math.atan2(point.y - center.y, point.x - center.x) * 180 / Math.PI - startAngle);
        if (event.shiftKey) nextRotation = snapAngle(nextRotation, 15);
        directValue(target, "transform.rotation", nextRotation, currentTime, autoKey);
        interaction.changed = Math.abs(nextRotation - initial.transform.rotation) > 0.1;
        return draft;
      }
      const full = getLayerFullContentDimensions(project, initial);
      const startLocal = compositionToLayerLocal(project, initial, interaction.startComposition);
      const currentLocal = compositionToLayerLocal(project, initial, point);
      const delta = { x: (currentLocal.x - startLocal.x) / Math.max(1, full.width), y: (currentLocal.y - startLocal.y) / Math.max(1, full.height) };
      target.crop = interaction.mode === "crop-move" ? moveCrop(interaction.initialCrop, delta) : resizeCrop(interaction.initialCrop, interaction.cropHandle ?? "se", delta);
      interaction.changed = Math.abs(delta.x) + Math.abs(delta.y) > 0.001;
      return draft;
    });
    setSnapGuides(guides);
  };

  const finishInteraction = (event?: PointerEvent<HTMLElement>) => {
    const interaction = interactionRef.current;
    if (event && frameRef.current?.hasPointerCapture(event.pointerId)) frameRef.current.releasePointerCapture(event.pointerId);
    if (interaction && !interaction.changed) cancelGesture();
    else if (interaction?.changed) endGesture();
    interactionRef.current = null;
    setSnapGuides([]);
  };

  const cancelInteraction = (event?: PointerEvent<HTMLElement>) => {
    if (event && frameRef.current?.hasPointerCapture(event.pointerId)) frameRef.current.releasePointerCapture(event.pointerId);
    if (interactionRef.current) cancelGesture();
    interactionRef.current = null;
    setSnapGuides([]);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDraggingFile(false);
    const file = event.dataTransfer.files[0];
    if (file) onImportFile(file);
  };

  const selection = evaluatedLayer ? getLayerSelectionGeometry(project, evaluatedLayer) : null;
  const selectionStyle = selection ? { left: `${(selection.center.x / project.canvas.width) * 100}%`, top: `${(selection.center.y / project.canvas.height) * 100}%`, width: `${(selection.width / project.canvas.width) * 100}%`, height: `${(selection.height / project.canvas.height) * 100}%`, transform: `translate(-50%, -50%) rotate(${selection.rotation}deg)` } : undefined;

  return (
    <div className="canvas-area">
      <div className="canvas-social-tools" role="group" aria-label="Social framing and cover">
        <button type="button" className={project.safeAreas.enabled ? "is-on" : ""} aria-pressed={project.safeAreas.enabled} onClick={() => commit("Toggle composition guides", (draft) => { draft.safeAreas.enabled = !draft.safeAreas.enabled; return draft; })}>Guides</button>
        <button type="button" onClick={() => commit("Set cover frame", (draft) => { draft.cover.time = currentTime; return draft; })}>Set cover</button>
        <button type="button" onClick={() => setCurrentTime(project.cover.time)}>Go to cover</button>
        <span>Cover {formatSeconds(project.cover.time)}</span>
      </div>
      <div className="canvas-viewport" tabIndex={0} role="region" aria-label="Canvas interaction area. Use arrow keys to nudge the selected layer." onPointerDown={(event) => { if (event.target === event.currentTarget) event.currentTarget.focus({ preventScroll: true }); }}>
        <div className={isDraggingFile ? "canvas-frame is-dragging" : "canvas-frame"} ref={frameRef} style={{ aspectRatio: `${project.canvas.width} / ${project.canvas.height}`, transform: `scale(${zoom})` }} onPointerDown={(event) => { frameRef.current?.parentElement?.focus({ preventScroll: true }); handleFramePointerDown(event); }} onPointerMove={handlePointerMove} onPointerUp={finishInteraction} onPointerCancel={cancelInteraction} onDragOver={(event) => { event.preventDefault(); setIsDraggingFile(true); }} onDragEnter={(event) => { event.preventDefault(); setIsDraggingFile(true); }} onDragLeave={() => setIsDraggingFile(false)} onDrop={handleDrop}>
          <canvas ref={canvasRef} data-testid="editor-canvas" data-rendering={isRendering ? "true" : "false"} data-preview-quality={previewQuality} data-heavy-preview={heavyStack ? "true" : "false"} role="img" aria-busy={!rendererReady} aria-label={`BEND ${previewQuality} preview at ${project.canvas.width} by ${project.canvas.height}${heavyStack ? ", heavy stack sampling bounded for interaction" : ""}`} width={project.canvas.width} height={project.canvas.height} />
          <div className="canvas-drop-target" aria-hidden="true" />
          {project.safeAreas.enabled && <div className="canvas-safe-overlay" aria-hidden="true">
            {project.safeAreas.titleSafe && <span className="safe-title-area" />}
            {project.safeAreas.captionSafe && <span className="safe-caption-area" />}
            {project.safeAreas.grid && <span className="safe-rule-grid" />}
            <span className="safe-note">Editing guides only · never exported</span>
          </div>}
          {snapGuides.map((guide, index) => <span className={guide.axis === "x" ? "canvas-guide is-vertical" : "canvas-guide is-horizontal"} style={guide.axis === "x" ? { left: `${(guide.position / project.canvas.width) * 100}%` } : { top: `${(guide.position / project.canvas.height) * 100}%` }} aria-hidden="true" key={`${guide.axis}-${guide.position}-${index}`} />)}
          {project.layers.length === 0 && <div className="canvas-empty-state"><span className="canvas-empty-kicker">Empty composition</span><h2>Start with a moving image.</h2><p>Add a clip or start with a moving background. Build both in this composition.</p><div className="canvas-empty-actions"><button type="button" className="canvas-empty-primary" onClick={onRequestImport}><Plus size={15} /> Add video</button><button type="button" className="canvas-empty-secondary" onClick={onOpenAddMenu}><SparkleMark /> Generate motion</button><button type="button" className="canvas-empty-secondary" onClick={onOpenExample}><BookOpen size={14} /> Open First Study</button></div></div>}
          {rendererError && <div className="canvas-overlay-note canvas-overlay-error" role="alert"><strong>Compositor unavailable</strong><span>{rendererError}</span><button type="button" className="small-action" onClick={() => setRendererAttempt((attempt) => attempt + 1)}>Retry compositor</button></div>}
          {renderStackError && !rendererError && <div className="canvas-overlay-note canvas-overlay-error" role="alert"><strong>Temporal stack cannot render</strong><span>{renderStackError}</span><button type="button" className="small-action" onClick={() => setInspectorSection("effects")}>Open effects</button></div>}
          {showSlowRender && heavyStack && !rendererError && <div className="canvas-overlay-note canvas-render-status" role="status" aria-live="polite"><strong>Rendering heavy preview…</strong><span>Nested temporal sampling can take a while. Your edit is safe; stop the preview, switch to Draft, or shorten the stack.</span><div className="canvas-render-actions"><button type="button" className="small-action" onClick={stopPreview}>Stop preview</button><button type="button" className="small-action" onClick={() => setPreviewQuality("draft")}>Use Draft</button></div></div>}
          {previewSuspended && !rendererError && <div className="canvas-overlay-note canvas-render-status" role="status" aria-live="polite"><strong>Preview stopped to keep editing responsive.</strong><span>The edit and export are unchanged. Resume when you are ready, or use Draft while adjusting a heavy stack.</span><div className="canvas-render-actions"><button type="button" className="small-action is-primary" onClick={() => setPreviewSuspended(false)}>Resume preview</button><button type="button" className="small-action" onClick={() => setPreviewQuality(previewQuality === "draft" ? "full" : "draft")}>{previewQuality === "draft" ? "Use Full" : "Use Draft"}</button></div></div>}
          {!rendererReady && !rendererError && <div className="canvas-overlay-note" role="status" aria-live="polite"><strong>Warming the GPU compositor…</strong><span>Preview controls unlock when the renderer is ready.</span></div>}
          {isDraggingFile && <div className="canvas-overlay-note"><Upload size={18} /> Drop footage to import</div>}
          {canvasMode === "crop" && selectionStyle && <div className="crop-dimmer" style={selectionStyle} aria-hidden="true" />}
          {project.layers.length > 0 && Math.abs(currentTime - project.cover.time) < 0.03 && <span className="canvas-cover-indicator" role="status">Cover frame</span>}
          {comparisonLayer && <div className="canvas-compare-badge" role="status"><span>Original source</span><strong>{comparisonLayer.name}</strong><small>Release compare to return to the edit</small></div>}
          {rendererReady && evaluatedLayer && selection && isLayerActiveAt(evaluatedLayer, currentTime) && <div className={canvasMode === "crop" ? "canvas-selection is-crop-mode" : evaluatedLayer.locked ? "canvas-selection is-locked" : "canvas-selection"} role="group" aria-label={`Selected ${evaluatedLayer.name}. ${evaluatedLayer.locked ? "Layer locked." : canvasMode === "crop" ? "Crop editing mode." : "Drag to reposition."}`} style={selectionStyle}>
            <span className="selection-label">{canvasMode === "crop" ? "Crop" : evaluatedLayer.kind === "video" ? "Footage" : getGeneratorDefinition(evaluatedLayer.generator.id).name}{canvasMode !== "crop" && Math.abs(evaluatedLayer.transform.rotation) > 0.5 ? ` · ${Math.round(evaluatedLayer.transform.rotation)}°` : ""}</span>
            {canvasMode === "crop" ? <>{(["nw", "n", "ne", "e", "se", "s", "sw", "w"] as CropHandle[]).map((handle) => <span className={`transform-handle crop-handle handle-${handle}`} key={handle} role="button" tabIndex={0} aria-label={`Crop ${handle}`} aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight" onKeyDown={(event) => handleHandleKeyDown(event, "crop-resize", handle)} onPointerDown={(event) => { event.stopPropagation(); beginInteraction(event, "crop-resize", handle); }} />)}</> : !evaluatedLayer.locked && <>{(["nw", "ne", "se", "sw"] as Corner[]).map((corner) => <span className={`transform-handle handle-${corner}`} key={corner} role="button" tabIndex={0} aria-label={`Resize ${corner} corner`} aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight" onKeyDown={(event) => handleHandleKeyDown(event, "scale", corner)} onPointerDown={(event) => { event.stopPropagation(); beginInteraction(event, "scale", corner); }} />)}<span className="rotation-handle" role="button" tabIndex={0} aria-label="Rotate layer" aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight" onKeyDown={(event) => handleHandleKeyDown(event, "rotate")} onPointerDown={(event) => { event.stopPropagation(); beginInteraction(event, "rotate"); }}><RotateCw size={11} /></span></>}
          </div>}
        </div>
      </div>
      {heavyStack && <div className="canvas-heavy-status" role="status" aria-live="polite"><span><strong>Bounded heavy preview</strong> · echo, slice and feedback sampling are limited for interaction{lastRenderMs !== null ? ` · ${Math.round(lastRenderMs)} ms last frame` : ""}. Export renders the full stack.</span><button type="button" className="small-action" onClick={stopPreview}>Stop rendering</button></div>}
      <div className="canvas-underbar"><button className="canvas-play" onClick={onTogglePlaying} disabled={!rendererReady || Boolean(rendererError) || Boolean(renderStackError)} aria-label={isPlaying ? "Pause preview" : "Play preview"}>{isPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}</button><span><strong>{isRendering ? "Rendering preview" : isPlaying ? "Playing" : "Paused"}</strong> / {project.canvas.width} × {project.canvas.height} · {heavyStack ? "Bounded heavy preview" : previewQuality === "draft" ? "Draft preview" : "Full preview"}</span><span className="canvas-hint">{canvasMode === "crop" ? "Drag crop edges · Escape cancels" : "Drag to move · corners scale · top handle rotates · Shift disables snap"}</span><div className="preview-quality-toggle" role="group" aria-label="Preview quality"><button type="button" className={previewQuality === "draft" ? "is-active" : ""} aria-pressed={previewQuality === "draft"} onClick={() => setPreviewQuality("draft")} title="Lower-resolution interactive preview; export stays at full quality">Draft</button><button type="button" className={previewQuality === "full" ? "is-active" : ""} aria-pressed={previewQuality === "full"} onClick={() => setPreviewQuality("full")} title="Full-resolution preview. Pathological temporal stacks use bounded sampling here; export always renders the full stack.">Full</button></div><div className="canvas-zoom-control" role="group" aria-label="Canvas zoom"><button type="button" onClick={() => setZoom((value) => Math.max(0.5, Number((value - 0.25).toFixed(2))))} aria-label="Zoom canvas out"><Minus size={12} /></button><span>{Math.round(zoom * 100)}%</span><button type="button" onClick={() => setZoom((value) => Math.min(2, Number((value + 0.25).toFixed(2))))} aria-label="Zoom canvas in"><Plus size={12} /></button><button type="button" onClick={() => setZoom(1)} aria-label="Reset canvas zoom">Reset</button></div></div>
    </div>
  );
}

function dbToLinear(db: number): number {
  return Math.pow(10, Math.min(12, Math.max(-60, db)) / 20);
}

function directValue(layer: BendLayer, property: string, value: number, currentTime: number, autoKey: boolean): void {
  if (autoKey) layer.animation = upsertKeyframe(layer, property, Math.max(0, currentTime - layer.timeline.start), value);
  else Object.assign(layer, setTargetValue(layer, property, value));
}

function fixedCorner(corner: Corner, width: number, height: number): Point {
  if (corner === "nw") return { x: width, y: height };
  if (corner === "ne") return { x: 0, y: height };
  if (corner === "sw") return { x: width, y: 0 };
  return { x: 0, y: 0 };
}

function activeCornerFor(corner: Corner, width: number, height: number): Point {
  if (corner === "nw") return { x: 0, y: 0 };
  if (corner === "ne") return { x: width, y: 0 };
  if (corner === "sw") return { x: 0, y: height };
  return { x: width, y: height };
}

function moveCrop(crop: CropRect, delta: Point): CropRect {
  return { ...crop, x: clamp(crop.x + delta.x, 0, 1 - crop.width), y: clamp(crop.y + delta.y, 0, 1 - crop.height) };
}

function resizeCrop(crop: CropRect, handle: CropHandle, delta: Point): CropRect {
  let { x, y, width, height } = crop;
  if (handle.includes("w")) { const nextX = clamp(x + delta.x, 0, x + width - 0.05); width = width + x - nextX; x = nextX; }
  if (handle.includes("e")) width = clamp(width + delta.x, 0.05, 1 - x);
  if (handle.includes("n")) { const nextY = clamp(y + delta.y, 0, y + height - 0.05); height = height + y - nextY; y = nextY; }
  if (handle.includes("s")) height = clamp(height + delta.y, 0.05, 1 - y);
  return { x, y, width, height };
}

function isCorner(value: Corner | CropHandle | undefined): value is Corner {
  return value === "nw" || value === "ne" || value === "se" || value === "sw";
}

function isCropHandle(value: Corner | CropHandle | undefined): value is CropHandle {
  return value === "nw" || value === "n" || value === "ne" || value === "e" || value === "se" || value === "s" || value === "sw" || value === "w";
}

function SparkleMark() {
  return <span className="sparkle-mark" aria-hidden="true">✦</span>;
}

function copyVideoFrame(video: HTMLVideoElement, maxWidth?: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const sourceWidth = Math.max(1, video.videoWidth);
  const sourceHeight = Math.max(1, video.videoHeight);
  const scale = maxWidth && maxWidth > 0 ? Math.min(1, maxWidth / sourceWidth) : 1;
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("BEND could not create a frame sample canvas.");
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("BEND preview evaluation cancelled.", "AbortError");
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
