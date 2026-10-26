import { ChevronDown, ChevronRight, Copy, CopyPlus, Film, GripVertical, LockKeyhole, Magnet, Maximize2, Pause, Play, Repeat2, RotateCcw, Scissors, Trash2, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useEditorStore } from "../../app/store";
import { formatSeconds, layerEndAt, layerStartAt, timeAtPointer, timeToPercent } from "../../engine/core/timeline";
import { clamp } from "../../engine/core/timeline";
import { isLoopUsable } from "../../engine/core/loop";
import { averagePlaybackSpeed, videoLayerDuration } from "../../engine/core/timeMapping";
import type { BendLayer, BendProject, LayerAnimation, ProjectLoopRegion } from "../../engine/core/types";
import { getAnimationTrackLabel } from "../../engine/animation/engine";
import { copyKeyframeSelection, deleteKeyframeSelection, duplicateKeyframeSelection, moveKeyframeSelection, pasteKeyframeClipboard, type KeyframeClipboard, type KeyframeRef } from "../../engine/animation/keyframes";
import { getGeneratorDefinition } from "../../engine/generators/registry";
import { motionTokens } from "../../styles/motion";
import { SequenceTimeline } from "./SequenceTimeline";
import { closeSequenceGap, duplicateVideoClip, removeVideoClip, shiftClipsAfter, splitVideoClip } from "../../engine/editing/operations";

interface TimelineProps {
  project: BendProject;
  currentTime: number;
  isPlaying: boolean;
  onSetTime: (time: number) => void;
  onTogglePlaying: () => void;
  onSelectLayer: (layerId: string) => void;
  assetUrls: Record<string, string>;
  onRequestSoundtrack: () => void;
}

type DragMode = "move" | "trim-start" | "trim-end";

interface ClipDrag {
  layerId: string;
  mode: DragMode;
  startX: number;
  laneWidth: number;
  initialStart: number;
  initialTrimStart: number;
  initialTrimEnd: number;
  initialEnd: number;
  changed: boolean;
}

interface KeyframeDrag {
  layerId: string;
  property: string;
  keyframeId: string;
  startX: number;
  laneWidth: number;
  initialTime: number;
  group: KeyframeRef[];
  changed: boolean;
  initialAnimation: LayerAnimation;
}

type LoopDragMode = "start" | "end" | "move";

interface LoopDrag {
  mode: LoopDragMode;
  startX: number;
  laneWidth: number;
  initialStart: number;
  initialEnd: number;
  changed: boolean;
}

interface LayerReorderDrag {
  layerId: string;
  overId: string | null;
}

export function Timeline({ project, currentTime, isPlaying, onSetTime, onTogglePlaying, onSelectLayer, assetUrls, onRequestSoundtrack }: TimelineProps) {
  const duration = project.canvas.duration;
  const [zoom, setZoom] = useState(1);
  const sequenceScrollRef = useRef<HTMLDivElement>(null);
  const timelineScrollRef = useRef<HTMLDivElement>(null);
  const syncingScrollRef = useRef<"sequence" | "timeline" | null>(null);
  const [expandedLayers, setExpandedLayers] = useState<Set<string>>(() => new Set(project.layers.filter((layer) => layer.animation.tracks.length > 0).map((layer) => layer.id)));
  const dragRef = useRef<ClipDrag | null>(null);
  const keyframeDragRef = useRef<KeyframeDrag | null>(null);
  const loopDragRef = useRef<LoopDrag | null>(null);
  const layerReorderRef = useRef<LayerReorderDrag | null>(null);
  const [layerReorder, setLayerReorder] = useState<LayerReorderDrag | null>(null);
  const [timelineMessage, setTimelineMessage] = useState<string | null>(null);
  const keyframeClipboardRef = useRef<KeyframeClipboard | null>(null);
  const beginGesture = useEditorStore((state) => state.beginGesture);
  const endGesture = useEditorStore((state) => state.endGesture);
  const updateTransient = useEditorStore((state) => state.updateTransient);
  const cancelGesture = useEditorStore((state) => state.cancelGesture);
  const commit = useEditorStore((state) => state.commit);
  const activeLayerId = useEditorStore((state) => state.activeLayerId);
  const keyframeSelection = useEditorStore((state) => state.keyframeSelection);
  const setKeyframeSelection = useEditorStore((state) => state.setKeyframeSelection);
  const toggleKeyframeSelection = useEditorStore((state) => state.toggleKeyframeSelection);
  const clearKeyframeSelection = useEditorStore((state) => state.clearKeyframeSelection);
  const snapping = useEditorStore((state) => state.snapping);
  const setSnapping = useEditorStore((state) => state.setSnapping);
  const setActiveLayer = useEditorStore((state) => state.setActiveLayer);
  const loop = project.loop;
  const loopActive = isLoopUsable(loop, duration);
  const loopRegionVisible = loop.enabled || loop.start > 0.0001 || loop.end < duration - 0.0001;
  const activeLayer = project.layers.find((layer) => layer.id === activeLayerId) ?? null;
  const activeSelection = activeLayer ? keyframeSelection.filter((ref) => ref.layerId === activeLayer.id) : [];
  const layerRows = [...project.layers].reverse().filter((layer) => layer.kind !== "video" || layer.id === activeLayerId);
  const playhead = timeToPercent(currentTime, duration);
  const rulerSteps = createRulerSteps(duration);

  useEffect(() => {
    setExpandedLayers((current) => {
      const next = new Set(current);
      let changed = false;
      for (const layer of project.layers) {
        if (layer.animation.tracks.length > 0 && !next.has(layer.id)) { next.add(layer.id); changed = true; }
      }
      return changed ? next : current;
    });
  }, [project.layers]);

  useEffect(() => {
    const fit = () => {
      setZoom(1);
      sequenceScrollRef.current?.scrollTo({ left: 0 });
      timelineScrollRef.current?.scrollTo({ left: 0 });
    };
    window.addEventListener("bend:timeline-zoom-fit", fit);
    return () => window.removeEventListener("bend:timeline-zoom-fit", fit);
  }, []);

  const syncScroll = (source: "sequence" | "timeline") => {
    const sequence = sequenceScrollRef.current;
    const timeline = timelineScrollRef.current;
    if (!sequence || !timeline) return;
    const expectedSource = source === "sequence" ? sequence : timeline;
    const target = source === "sequence" ? timeline : sequence;
    if (syncingScrollRef.current === (source === "sequence" ? "timeline" : "sequence")) {
      syncingScrollRef.current = null;
      return;
    }
    if (expectedSource.scrollLeft === target.scrollLeft) return;
    syncingScrollRef.current = source;
    target.scrollLeft = expectedSource.scrollLeft;
    window.requestAnimationFrame(() => {
      if (syncingScrollRef.current === source) syncingScrollRef.current = null;
    });
  };

  useEffect(() => {
    const sequence = sequenceScrollRef.current;
    const timeline = timelineScrollRef.current;
    if (sequence && timeline) timeline.scrollLeft = sequence.scrollLeft;
  }, [zoom]);

  const scrub = (clientX: number, currentTarget: HTMLElement) => onSetTime(timeAtPointer(clientX, currentTarget.getBoundingClientRect(), duration));
  const beginScrub = (event: React.PointerEvent<HTMLElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    scrub(event.clientX, event.currentTarget);
  };
  const continueScrub = (event: React.PointerEvent<HTMLElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) scrub(event.clientX, event.currentTarget);
  };
  const endScrub = (event: React.PointerEvent<HTMLElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const commitLoop = (label: string, patch: (loop: ProjectLoopRegion) => void) => {
    commit(label, (draft) => {
      const next = { ...draft.loop };
      patch(next);
      const start = clamp(next.start, 0, Math.max(0, duration - 0.05));
      const end = clamp(next.end, start + 0.05, duration);
      draft.loop = { enabled: next.enabled, start: Number(start.toFixed(3)), end: Number(end.toFixed(3)) };
      return draft;
    });
  };

  const toggleLoop = () => {
    if (loop.enabled) commitLoop("Disable loop playback", (next) => { next.enabled = false; });
    else {
      commit("Enable loop playback", (draft) => {
        const start = draft.loop.end > draft.loop.start + 0.05 ? draft.loop.start : 0;
        const end = draft.loop.end > draft.loop.start + 0.05 ? draft.loop.end : draft.canvas.duration;
        draft.loop = { enabled: true, start, end };
        return draft;
      });
    }
  };

  const resetLoop = () => commit("Reset loop to full composition", (draft) => {
    draft.loop = { enabled: false, start: 0, end: draft.canvas.duration };
    return draft;
  });

  const updateLoopTime = (which: "start" | "end", value: number) => {
    if (!Number.isFinite(value)) return;
    if (Math.abs(value - (which === "start" ? loop.start : loop.end)) < 0.0005) return;
    commitLoop(`Set loop ${which}`, (next) => {
      if (which === "start") next.start = Math.min(value, next.end - 0.05);
      else next.end = Math.max(value, next.start + 0.05);
    });
  };

  const handleLoopKeyDown = (event: React.KeyboardEvent<HTMLElement>, which: "start" | "end") => {
    const step = event.shiftKey ? 0.5 : 1 / Math.max(1, project.canvas.fps);
    const current = which === "start" ? loop.start : loop.end;
    let next: number | null = null;
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") next = current - step;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") next = current + step;
    if (event.key === "Home") next = which === "start" ? 0 : loop.start + 0.05;
    if (event.key === "End") next = which === "end" ? duration : loop.end - 0.05;
    if (next === null) return;
    event.preventDefault();
    event.stopPropagation();
    updateLoopTime(which, next);
  };

  const beginLoopDrag = (event: React.PointerEvent<HTMLElement>, mode: LoopDragMode) => {
    event.stopPropagation();
    event.preventDefault();
    const lane = event.currentTarget.closest(".timeline-ruler");
    if (!lane) return;
    beginGesture();
    loopDragRef.current = {
      mode,
      startX: event.clientX,
      laneWidth: lane.getBoundingClientRect().width,
      initialStart: loop.start,
      initialEnd: loop.end,
      changed: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const continueLoopDrag = (event: React.PointerEvent<HTMLElement>) => {
    const drag = loopDragRef.current;
    if (!drag) return;
    const delta = ((event.clientX - drag.startX) / Math.max(1, drag.laneWidth)) * duration;
    const frame = 1 / Math.max(1, project.canvas.fps);
    updateTransient((draft) => {
      if (drag.mode === "start") {
        const start = clamp(drag.initialStart + delta, 0, drag.initialEnd - frame);
        draft.loop = { ...draft.loop, start: Number(start.toFixed(3)), end: Number(draft.loop.end.toFixed(3)) };
      } else if (drag.mode === "end") {
        const end = clamp(drag.initialEnd + delta, drag.initialStart + frame, duration);
        draft.loop = { ...draft.loop, start: Number(draft.loop.start.toFixed(3)), end: Number(end.toFixed(3)) };
      } else {
        const span = drag.initialEnd - drag.initialStart;
        const start = clamp(drag.initialStart + delta, 0, duration - span);
        draft.loop = { ...draft.loop, start: Number(start.toFixed(3)), end: Number((start + span).toFixed(3)) };
      }
      return draft;
    });
    drag.changed = Math.abs(delta) > 0.01;
  };

  const endLoopDrag = (event: React.PointerEvent<HTMLElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (loopDragRef.current && !loopDragRef.current.changed) cancelGesture();
    else if (loopDragRef.current?.changed) endGesture();
    loopDragRef.current = null;
  };

  const beginClipDrag = (event: React.PointerEvent<HTMLElement>, layer: BendLayer, mode: DragMode) => {
    event.stopPropagation();
    onSelectLayer(layer.id);
    if (layer.locked) return;
    const lane = event.currentTarget.closest(".track-lane");
    if (!lane) return;
    const rect = lane.getBoundingClientRect();
    beginGesture();
    dragRef.current = {
      layerId: layer.id,
      mode,
      startX: event.clientX,
      laneWidth: rect.width,
      initialStart: layerStartAt(layer),
      initialTrimStart: layer.kind === "video" ? layer.trimStart : 0,
      initialTrimEnd: layer.kind === "video" ? layer.trimEnd : 0,
      initialEnd: layerStartAt(layer) + layer.timeline.duration,
      changed: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const continueClipDrag = (event: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const delta = ((event.clientX - drag.startX) / Math.max(1, drag.laneWidth)) * duration;
    if (Math.abs(delta) > 0.001) drag.changed = true;
    const targetLayer = project.layers.find((layer) => layer.id === drag.layerId);
    if (!targetLayer) return;
    const snapPoints = snapping && !event.shiftKey ? [0, currentTime, ...project.layers.filter((layer) => layer.id !== drag.layerId).flatMap((layer) => [layerStartAt(layer), layerEndAt(layer)])] : [];
    updateTransient((draft) => {
      const layer = draft.layers.find((candidate) => candidate.id === drag.layerId);
      if (!layer || layer.locked) return draft;
      if (drag.mode === "move") {
        layer.timeline.start = snapTime(Math.max(0, drag.initialStart + delta), snapPoints, duration);
      } else if (layer.kind === "video") {
        const speed = Math.max(0.1, averagePlaybackSpeed(layer.playback));
        if (drag.mode === "trim-start") {
          layer.trimStart = clamp(drag.initialTrimStart + delta * speed, 0, drag.initialTrimEnd - 0.1);
          layer.timeline.start = Math.max(0, drag.initialEnd - videoLayerDuration(layer));
        } else {
          layer.trimEnd = clamp(drag.initialTrimEnd + delta * speed, drag.initialTrimStart + 0.1, Math.max(drag.initialTrimStart + 0.1, draft.assets[layer.assetId]?.duration ?? drag.initialTrimEnd));
        }
        if (snapping) return shiftClipsAfter(draft, layer.id, layer.timeline.start + videoLayerDuration(layer) - drag.initialEnd);
      }
      return draft;
    });
  };

  const endClipDrag = (event: React.PointerEvent<HTMLElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (dragRef.current && !dragRef.current.changed) cancelGesture();
    else if (dragRef.current?.changed) endGesture();
    dragRef.current = null;
  };

  const handleClipKeyDown = (event: React.KeyboardEvent<HTMLElement>, layer: BendLayer) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelectLayer(layer.id);
      return;
    }
    const direction = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
    if (!direction || layer.locked) return;
    event.preventDefault();
    const step = event.shiftKey ? 1 : 1 / project.canvas.fps;
    commit(`Move ${layer.name}`, (draft) => {
      const target = draft.layers.find((candidate) => candidate.id === layer.id);
      if (target) target.timeline.start = Math.max(0, target.timeline.start + direction * step);
      return draft;
    });
  };

  const handleTrimKeyDown = (event: React.KeyboardEvent<HTMLElement>, layer: BendLayer, mode: "trim-start" | "trim-end") => {
    if (layer.kind !== "video" || layer.locked) return;
    const step = event.shiftKey ? 1 : 1 / project.canvas.fps;
    const minimum = mode === "trim-start" ? 0 : layer.trimStart + 0.1;
    const maximum = mode === "trim-start" ? layer.trimEnd - 0.1 : project.assets[layer.assetId]?.duration ?? layer.trimEnd;
    let nextValue: number | null = null;
    if (event.key === "ArrowLeft") nextValue = (mode === "trim-start" ? layer.trimStart : layer.trimEnd) - step;
    if (event.key === "ArrowRight") nextValue = (mode === "trim-start" ? layer.trimStart : layer.trimEnd) + step;
    if (event.key === "Home") nextValue = minimum;
    if (event.key === "End") nextValue = maximum;
    if (nextValue === null) return;
    event.preventDefault();
    const value = clamp(nextValue, minimum, maximum);
    commit(`${mode === "trim-start" ? "Trim in" : "Trim out"} ${layer.name}`, (draft) => {
      const target = draft.layers.find((candidate) => candidate.id === layer.id);
      if (target?.kind === "video") {
        const end = target.timeline.start + target.timeline.duration;
        if (mode === "trim-start") {
          target.trimStart = value;
          target.timeline.start = Math.max(0, end - videoLayerDuration(target));
        } else target.trimEnd = value;
      }
      return draft;
    });
  };

  const toggleAnimationTracks = (layerId: string) => setExpandedLayers((current) => {
    const next = new Set(current);
    if (next.has(layerId)) next.delete(layerId);
    else next.add(layerId);
    return next;
  });

  const moveLayerRelativeTo = (layerId: string, targetId: string | null, label: string) => {
    if (!targetId || layerId === targetId) return;
    commit(label, (draft) => {
      const canonicalIds = draft.layers.map((layer) => layer.id);
      const visualIds = [...canonicalIds].reverse();
      const fromIndex = visualIds.indexOf(layerId);
      const targetIndex = visualIds.indexOf(targetId);
      if (fromIndex < 0 || targetIndex < 0) return draft;
      visualIds.splice(fromIndex, 1);
      visualIds.splice(targetIndex, 0, layerId);
      const nextCanonical = visualIds.reverse();
      const layersById = new Map(draft.layers.map((layer) => [layer.id, layer]));
      return { ...draft, layers: nextCanonical.flatMap((id) => { const layer = layersById.get(id); return layer ? [layer] : []; }) };
    });
  };

  const reorderVisualLayers = (layerId: string, overId: string | null) => {
    moveLayerRelativeTo(layerId, overId, "Reorder layers");
  };

  const nudgeLayer = (layerId: string, visualDirection: -1 | 1) => {
    const visibleIds = layerRows.map((layer) => layer.id);
    const fromIndex = visibleIds.indexOf(layerId);
    const targetId = visibleIds[fromIndex + visualDirection] ?? null;
    if (!targetId) return;
    moveLayerRelativeTo(layerId, targetId, visualDirection < 0 ? "Raise layer" : "Lower layer");
    onSelectLayer(layerId);
  };

  const beginLayerReorder = (event: React.PointerEvent<HTMLButtonElement>, layer: BendLayer) => {
    event.stopPropagation();
    if (layer.locked) return;
    layerReorderRef.current = { layerId: layer.id, overId: null };
    setLayerReorder(layerReorderRef.current);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const continueLayerReorder = (event: React.PointerEvent<HTMLElement>) => {
    const drag = layerReorderRef.current;
    if (!drag) return;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>(".timeline-track[data-layer-id]");
    const overId = target?.dataset.layerId ?? null;
    if (overId !== drag.overId) {
      layerReorderRef.current = { ...drag, overId };
      setLayerReorder(layerReorderRef.current);
    }
  };

  const endLayerReorder = (event: React.PointerEvent<HTMLElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const drag = layerReorderRef.current;
    if (drag) reorderVisualLayers(drag.layerId, drag.overId);
    layerReorderRef.current = null;
    setLayerReorder(null);
  };

  const selectionForLayer = (layerId: string): KeyframeRef[] => keyframeSelection.filter((ref) => ref.layerId === layerId);

  const beginKeyframeDrag = (event: React.PointerEvent<HTMLElement>, layer: BendLayer, property: string, keyframeId: string, initialTime: number) => {
    event.stopPropagation();
    onSelectLayer(layer.id);
    if (layer.locked) return;
    if (event.shiftKey || event.ctrlKey || event.metaKey) {
      event.preventDefault();
      toggleKeyframeSelection({ layerId: layer.id, property, keyframeId });
      return;
    }
    const selectedRef: KeyframeRef = { layerId: layer.id, property, keyframeId };
    const currentSelection = selectionForLayer(layer.id);
    const alreadySelected = currentSelection.some((ref) => ref.property === property && ref.keyframeId === keyframeId);
    const group = alreadySelected && currentSelection.length > 1 ? currentSelection : [selectedRef];
    setKeyframeSelection(group);
    const lane = event.currentTarget.closest(".animation-track-lane");
    if (!lane) return;
    beginGesture();
    keyframeDragRef.current = { layerId: layer.id, property, keyframeId, startX: event.clientX, laneWidth: lane.getBoundingClientRect().width, initialTime, group, changed: false, initialAnimation: structuredClone(layer.animation) };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const continueKeyframeDrag = (event: React.PointerEvent<HTMLElement>) => {
    const drag = keyframeDragRef.current;
    if (!drag) return;
    const delta = ((event.clientX - drag.startX) / Math.max(1, drag.laneWidth)) * duration;
    const targetLayer = project.layers.find((layer) => layer.id === drag.layerId);
    if (!targetLayer) return;
    const snapPoints = [0, targetLayer.timeline.duration, currentTime - layerStartAt(targetLayer), ...targetLayer.animation.tracks.flatMap((track) => track.keyframes.map((keyframe) => keyframe.time))];
    const nextTime = snapTime(Math.max(0, drag.initialTime + delta), snapPoints, targetLayer.timeline.duration);
    const shift = nextTime - drag.initialTime;
    if (Math.abs(shift) < 1e-6) return;
    const baseLayer = { ...targetLayer, animation: drag.initialAnimation };
    const result = moveKeyframeSelection(baseLayer, drag.group, shift, project.canvas.fps);
    if (!result.ok) return;
    drag.changed = true;
    updateTransient((draft) => {
      const layer = draft.layers.find((candidate) => candidate.id === drag.layerId);
      if (layer && !layer.locked) layer.animation = result.animation;
      return draft;
    });
  };

  const endKeyframeDrag = (event: React.PointerEvent<HTMLElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (keyframeDragRef.current && !keyframeDragRef.current.changed) cancelGesture();
    else if (keyframeDragRef.current?.changed) endGesture();
    keyframeDragRef.current = null;
  };

  const copySelection = (layer: BendLayer, selection = selectionForLayer(layer.id)) => {
    const copied = copyKeyframeSelection(layer, selection);
    if (!copied) {
      setTimelineMessage("Select a keyframe to copy.");
      return;
    }
    keyframeClipboardRef.current = copied;
    setTimelineMessage(`Copied ${copied.entries.length} keyframe${copied.entries.length === 1 ? "" : "s"} with relative timing.`);
  };

  const pasteSelection = (layer: BendLayer) => {
    const clipboard = keyframeClipboardRef.current;
    if (!clipboard) {
      setTimelineMessage("Copy keyframes before pasting.");
      return;
    }
    const atTime = clamp(currentTime - layerStartAt(layer), 0, layer.timeline.duration);
    const result = pasteKeyframeClipboard(layer, clipboard, atTime);
    if (!result.ok) {
      setTimelineMessage(result.reason);
      return;
    }
    commit("Paste keyframes", (draft) => {
      const target = draft.layers.find((candidate) => candidate.id === layer.id);
      if (target) target.animation = result.animation;
      return draft;
    });
    setKeyframeSelection(result.selection);
    setTimelineMessage(result.message);
  };

  const duplicateSelection = (layer: BendLayer, selection = selectionForLayer(layer.id)) => {
    const result = duplicateKeyframeSelection(layer, selection, project.canvas.fps);
    if (!result.ok) {
      setTimelineMessage(result.reason);
      return;
    }
    commit("Duplicate keyframes", (draft) => {
      const target = draft.layers.find((candidate) => candidate.id === layer.id);
      if (target) target.animation = result.animation;
      return draft;
    });
    setKeyframeSelection(result.selection);
    setTimelineMessage(result.message);
  };

  const removeSelection = (layer: BendLayer, selection = selectionForLayer(layer.id)) => {
    const result = deleteKeyframeSelection(layer, selection);
    if (!result.ok) {
      setTimelineMessage(result.reason);
      return;
    }
    commit("Delete keyframes", (draft) => {
      const target = draft.layers.find((candidate) => candidate.id === layer.id);
      if (target) target.animation = result.animation;
      return draft;
    });
    clearKeyframeSelection();
    setTimelineMessage(result.message);
  };

  const handleKeyframeKeyDown = (event: React.KeyboardEvent<HTMLElement>, layer: BendLayer, property: string, keyframeId: string, currentKeyframeTime: number) => {
    const modifier = event.ctrlKey || event.metaKey;
    const selectedRef: KeyframeRef = { layerId: layer.id, property, keyframeId };
    const currentSelection = selectionForLayer(layer.id);
    const alreadySelected = currentSelection.some((ref) => ref.property === property && ref.keyframeId === keyframeId);
    const group = alreadySelected ? currentSelection : [selectedRef];
    if (modifier && event.key.toLowerCase() === "c") {
      event.preventDefault();
      copySelection(layer, group);
      return;
    }
    if (modifier && event.key.toLowerCase() === "v") {
      event.preventDefault();
      pasteSelection(layer);
      return;
    }
    if (modifier && event.key.toLowerCase() === "d") {
      event.preventDefault();
      setKeyframeSelection(group);
      duplicateSelection(layer, group);
      return;
    }
    if ((event.key === "Delete" || event.key === "Backspace") && !layer.locked) {
      event.preventDefault();
      setKeyframeSelection(group);
      removeSelection(layer, group);
      return;
    }
    if (event.key.toLowerCase() === "c" && !modifier) return;
    const step = event.shiftKey ? 1 : 1 / project.canvas.fps;
    let shift: number | null = null;
    if (event.key === "ArrowLeft") shift = -step;
    if (event.key === "ArrowRight") shift = step;
    if (event.key === "Home") shift = -currentKeyframeTime;
    if (event.key === "End") shift = layer.timeline.duration - currentKeyframeTime;
    if (shift === null || layer.locked) return;
    event.preventDefault();
    if (!alreadySelected) setKeyframeSelection([selectedRef]);
    const result = moveKeyframeSelection(layer, group, shift, project.canvas.fps);
    if (!result.ok) {
      setTimelineMessage(result.reason);
      return;
    }
    commit(`Move ${group.length > 1 ? "selected keyframes" : getAnimationTrackLabel(layer, property) + " keyframe"}`, (draft) => {
      const target = draft.layers.find((candidate) => candidate.id === layer.id);
      if (target) target.animation = result.animation;
      return draft;
    });
    setKeyframeSelection(result.selection);
    setTimelineMessage(result.message);
  };

  const activeVideo = activeLayer?.kind === "video" ? activeLayer : null;
  const canSplit = Boolean(activeVideo && !activeVideo.locked && currentTime > layerStartAt(activeVideo) + 0.15 && currentTime < layerEndAt(activeVideo) - 0.15);

  const splitAtPlayhead = () => {
    if (!activeVideo) {
      setTimelineMessage("Select a video clip to split.");
      return;
    }
    try {
      const result = splitVideoClip(project, activeVideo.id, currentTime);
      commit("Split clip at playhead", () => result.project);
      setActiveLayer(result.rightId);
      setTimelineMessage(`Split ${activeVideo.name} at ${formatSeconds(currentTime)}. Both segments share the original source.`);
    } catch (error) {
      setTimelineMessage(error instanceof Error ? error.message : "This clip could not be split here.");
    }
  };

  const removeClip = (ripple: boolean) => {
    if (!activeVideo) {
      setTimelineMessage("Select a video clip to remove.");
      return;
    }
    const clips = [...project.layers].filter((layer): layer is BendLayer & { kind: "video" } => layer.kind === "video" && layer.timeline.start >= 0);
    const index = clips.findIndex((clip) => clip.id === activeVideo.id);
    const nextSelection = clips[index + 1]?.id ?? clips[index - 1]?.id ?? null;
    try {
      const nextProject = removeVideoClip(project, activeVideo.id, ripple);
      commit(ripple ? "Ripple delete clip" : "Delete clip", () => nextProject);
      setActiveLayer(nextSelection);
      setTimelineMessage(ripple ? "Clip removed and following clips moved left to close the gap." : "Clip removed. The gap remains on the sequence.");
    } catch (error) {
      setTimelineMessage(error instanceof Error ? error.message : "This clip could not be removed.");
    }
  };

  const duplicateClip = () => {
    if (!activeVideo) {
      setTimelineMessage("Select a video clip to duplicate.");
      return;
    }
    try {
      const result = duplicateVideoClip(project, activeVideo.id);
      commit("Duplicate clip", () => result.project);
      setActiveLayer(result.layerId);
      setTimelineMessage("Clip duplicated at the end of the sequence with shared source media.");
    } catch (error) {
      setTimelineMessage(error instanceof Error ? error.message : "This clip could not be duplicated.");
    }
  };

  const closeGap = () => {
    if (!activeVideo) {
      setTimelineMessage("Select the clip after the gap.");
      return;
    }
    try {
      const nextProject = closeSequenceGap(project, activeVideo.id);
      commit("Close sequence gap", () => nextProject);
      setTimelineMessage("Moved this clip and following clips left to close the preceding gap.");
    } catch (error) {
      setTimelineMessage(error instanceof Error ? error.message : "There is no gap to close here.");
    }
  };

  return (
    <section className="timeline-panel" aria-label="Timeline">
      <div className="timeline-toolbar">
        <div className="timeline-transport">
          <div className="timeline-context"><span className="timeline-label">Timeline</span><span className="timeline-help">Drag clips to move · expand lanes to animate</span></div>
          <div className="timeline-readout">
            <button onClick={onTogglePlaying} aria-label={isPlaying ? "Pause timeline" : "Play timeline"}>{isPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}</button>
            <span className="timeline-timecode">{formatSeconds(currentTime)}</span>
            <span className="timeline-duration">/ {formatSeconds(duration)}</span>
            <span className="timeline-duration">{project.layers.length} layer{project.layers.length === 1 ? "" : "s"} · {project.canvas.fps} FPS</span>
          </div>
        </div>
        <div className="timeline-tools">
          <div className="timeline-edit-tools" role="group" aria-label="Clip editing actions">
            <button type="button" onClick={splitAtPlayhead} disabled={!canSplit} aria-label="Split selected clip at playhead (S)" title="Split at playhead (S)"><Scissors size={12} /> Split</button>
            <button type="button" onClick={() => removeClip(false)} disabled={!activeVideo} aria-label="Delete selected clip and leave a gap" title="Delete clip and leave gap"><Trash2 size={12} /> <span className="edit-tool-label">Delete</span></button>
            <button type="button" onClick={() => removeClip(true)} disabled={!activeVideo} aria-label="Ripple delete selected clip and close the gap" title="Ripple delete (Shift+Delete)"><Trash2 size={12} /> <span className="edit-tool-label">Ripple delete</span></button>
            <button type="button" onClick={closeGap} disabled={!activeVideo} aria-label="Close gap before selected clip" title="Close gap before selected clip"><Maximize2 size={12} /> Close gap</button>
            <button type="button" onClick={duplicateClip} disabled={!activeVideo} aria-label="Duplicate selected clip at sequence end" title="Duplicate at sequence end"><CopyPlus size={12} /></button>
            <button type="button" className={snapping ? "is-on" : ""} aria-pressed={snapping} onClick={() => setSnapping(!snapping)} aria-label={snapping ? "Disable snapping" : "Enable snapping"} title="Toggle snapping"><Magnet size={12} /> Snap</button>
          </div>
          {activeLayer && activeSelection.length > 0 && <div className="keyframe-group-tools" role="group" aria-label="Selected keyframe actions"><span>{activeSelection.length} selected</span><button type="button" onClick={() => copySelection(activeLayer, activeSelection)} aria-label="Copy selected keyframes"><Copy size={12} /> Copy</button><button type="button" onClick={() => pasteSelection(activeLayer)} aria-label="Paste keyframes at playhead">Paste</button><button type="button" onClick={() => duplicateSelection(activeLayer, activeSelection)} aria-label="Duplicate selected keyframes"><CopyPlus size={12} /> Duplicate</button><button type="button" onClick={() => removeSelection(activeLayer, activeSelection)} aria-label="Delete selected keyframes"><Trash2 size={12} /></button><button type="button" className="keyframe-clear" onClick={clearKeyframeSelection} aria-label="Clear keyframe selection">Clear</button></div>}
          <div className="timeline-legend" role="group" aria-label="Animation legend"><span><b>◆</b> keyframes</span><span><b>MOD</b> repeat</span></div>
          <div className="timeline-zoom">
            <button onClick={() => setZoom((value) => Math.max(1, Number((value - 0.5).toFixed(1))))} disabled={zoom <= 1} aria-label="Zoom timeline out"><ZoomOut size={13} /></button>
            <span>{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom((value) => Math.min(4, Number((value + 0.5).toFixed(1))))} disabled={zoom >= 4} aria-label="Zoom timeline in"><ZoomIn size={13} /></button>
            <button onClick={() => setZoom(1)} disabled={zoom === 1} aria-label="Zoom timeline to fit" title="Zoom to fit"><Maximize2 size={12} /></button>
          </div>
        </div>
      </div>
      <div className="timeline-loop-bar" role="group" aria-label="Loop region">
        <button type="button" className={loop.enabled ? "loop-toggle is-on" : "loop-toggle"} aria-pressed={loop.enabled} onClick={toggleLoop}><Repeat2 size={13} /> Loop {loop.enabled ? "On" : "Off"}</button>
        <label className="loop-time-field">Start <input type="number" min={0} max={Math.max(0, loop.end - 0.05)} step={1 / project.canvas.fps} value={Number(loop.start.toFixed(3))} aria-label="Loop start seconds" onChange={(event) => updateLoopTime("start", Number(event.target.value))} onBlur={(event) => updateLoopTime("start", Number(event.target.value))} /></label>
        <label className="loop-time-field">End <input type="number" min={loop.start + 0.05} max={duration} step={1 / project.canvas.fps} value={Number(loop.end.toFixed(3))} aria-label="Loop end seconds" onChange={(event) => updateLoopTime("end", Number(event.target.value))} onBlur={(event) => updateLoopTime("end", Number(event.target.value))} /></label>
        <span className="loop-readout">{(loop.end - loop.start).toFixed(2)}s · {formatSeconds(loop.start)} → {formatSeconds(loop.end)}</span>
        <button type="button" className="small-action" onClick={resetLoop} aria-label="Reset loop to full composition"><RotateCcw size={12} /> Full composition</button>
        <span className="loop-hint">{loopActive ? "Playback loops this interval. Export can use it as a work range." : "Set a work range without changing layer timing or composition duration."}</span>
      </div>
      <div className="sequence-scroll" ref={sequenceScrollRef} onScroll={() => syncScroll("sequence")}>
        <SequenceTimeline project={project} currentTime={currentTime} assetUrls={assetUrls} zoom={zoom} onSetTime={onSetTime} onSelectLayer={onSelectLayer} onRequestSoundtrack={onRequestSoundtrack} />
      </div>
      {timelineMessage && <p className="timeline-message" role="status">{timelineMessage}</p>}
      <div className="timeline-scroll" ref={timelineScrollRef} onScroll={() => syncScroll("timeline")}>
        <div className="timeline-content" style={{ width: `${Math.max(100, zoom * 100)}%` }}>
          <div className="timeline-ruler-wrap">
            <div className="timeline-ruler" role="slider" aria-valuemin={0} aria-valuemax={duration} aria-valuenow={Number(currentTime.toFixed(3))} aria-valuetext={formatSeconds(currentTime)} tabIndex={0} onPointerDown={beginScrub} onPointerMove={continueScrub} onPointerUp={endScrub} onPointerCancel={endScrub} onKeyDown={(event) => {
              if (event.key === "ArrowLeft") { event.preventDefault(); onSetTime(Math.max(0, currentTime - 1 / project.canvas.fps)); }
              if (event.key === "ArrowRight") { event.preventDefault(); onSetTime(Math.min(duration, currentTime + 1 / project.canvas.fps)); }
              if (event.key === "Home") { event.preventDefault(); onSetTime(0); }
              if (event.key === "End") { event.preventDefault(); onSetTime(duration); }
            }} aria-label="Timeline scrubber">
              <div className="ruler-line" />
              {rulerSteps.map((step) => <span className="ruler-tick" key={step} style={{ left: `${timeToPercent(step, duration)}%` }}>{formatSeconds(step)}</span>)}
            </div>
            {loopRegionVisible && <div className={`timeline-loop-region${loop.enabled ? " is-on" : " is-off"}`} style={{ left: `${timeToPercent(loop.start, duration)}%`, width: `${Math.max(0.4, timeToPercent(loop.end - loop.start, duration))}%` }} onPointerDown={(event) => beginLoopDrag(event, "move")} onPointerMove={continueLoopDrag} onPointerUp={endLoopDrag} onPointerCancel={endLoopDrag} role="group" aria-label={`Loop region ${loop.start.toFixed(2)} to ${loop.end.toFixed(2)} seconds`}>
              <button type="button" className="loop-handle loop-handle-start" aria-label="Drag loop start" aria-valuemin={0} aria-valuemax={loop.end - 0.05} aria-valuenow={loop.start} aria-valuetext={`${loop.start.toFixed(2)} seconds`} role="slider" onKeyDown={(event) => handleLoopKeyDown(event, "start")} onPointerDown={(event) => beginLoopDrag(event, "start")} onPointerMove={continueLoopDrag} onPointerUp={endLoopDrag} onPointerCancel={endLoopDrag} />
              <span className="loop-region-label">LOOP</span>
              <button type="button" className="loop-handle loop-handle-end" aria-label="Drag loop end" aria-valuemin={loop.start + 0.05} aria-valuemax={duration} aria-valuenow={loop.end} aria-valuetext={`${loop.end.toFixed(2)} seconds`} role="slider" onKeyDown={(event) => handleLoopKeyDown(event, "end")} onPointerDown={(event) => beginLoopDrag(event, "end")} onPointerMove={continueLoopDrag} onPointerUp={endLoopDrag} onPointerCancel={endLoopDrag} />
            </div>}
          </div>
          <div className="timeline-tracks">
            {project.layers.length === 0 && <div className="timeline-empty">Add footage or a procedural generator to start layering.</div>}
            <AnimatePresence initial={false} mode="popLayout">
            {layerRows.map((layer) => {
              const layerIndex = project.layers.findIndex((candidate) => candidate.id === layer.id);
              const left = timeToPercent(layerStartAt(layer), duration);
              const width = timeToPercent(layer.timeline.duration, duration);
              const isExpanded = expandedLayers.has(layer.id);
              return (
                <motion.div className={`${layerReorder?.layerId === layer.id ? "timeline-layer-group is-reordering" : "timeline-layer-group"}${layerReorder?.overId === layer.id ? " is-reorder-target" : ""}`} data-layer-id={layer.id} key={layer.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={motionTokens.transition.standard}>
                <div className="timeline-track" data-layer-id={layer.id} onPointerMove={continueLayerReorder} onPointerUp={endLayerReorder} onPointerCancel={endLayerReorder}>
                  <div className="track-label-cell">
                    <button
                      className="track-label"
                      onClick={() => onSelectLayer(layer.id)}
                      aria-label={`Select ${layer.name}`}
                      title={layer.locked ? `${layer.name} is locked` : `Select ${layer.name}. Drag to reorder; Alt+Up/Down moves it.`}
                      onPointerDown={(event) => beginLayerReorder(event, layer)}
                      onKeyDown={(event) => {
                        if (!event.altKey) return;
                        if (event.key === "ArrowUp") { event.preventDefault(); nudgeLayer(layer.id, -1); }
                        if (event.key === "ArrowDown") { event.preventDefault(); nudgeLayer(layer.id, 1); }
                      }}
                    ><Film size={13} /> V{layerIndex + 1}{!layer.locked && <GripVertical className="track-drag-glyph" size={12} aria-hidden="true" />}</button>
                  </div>
                  <div className="track-lane" onPointerDown={beginScrub} onPointerMove={continueScrub} onPointerUp={endScrub} onPointerCancel={endScrub}>
                    <div
                      className={`${layer.visible ? "timeline-clip" : "timeline-clip is-hidden"}${activeLayerId === layer.id ? " is-selected" : ""}`}
                      style={{ left: `${left}%`, width: `${Math.max(1.5, width)}%` }}
                      role="group"
                      tabIndex={0}
                      aria-label={`${layer.name}, starts at ${formatSeconds(layerStartAt(layer))}, lasts ${formatSeconds(layer.timeline.duration)}`}
                      onClick={(event) => { event.stopPropagation(); onSelectLayer(layer.id); }}
                      onKeyDown={(event) => handleClipKeyDown(event, layer)}
                      onPointerDown={(event) => beginClipDrag(event, layer, "move")}
                      onPointerMove={continueClipDrag}
                      onPointerUp={endClipDrag}
                      onPointerCancel={endClipDrag}
                    >
                      {layer.kind === "video" && <button
                        type="button"
                        className="clip-trim-handle clip-trim-start"
                        role="slider"
                        aria-label={`Trim start for ${layer.name}`}
                        aria-orientation="horizontal"
                        aria-valuemin={0}
                        aria-valuemax={Math.max(0, layer.trimEnd - 0.1)}
                        aria-valuenow={layer.trimStart}
                        aria-valuetext={`${formatSeconds(layer.trimStart)} source time`}
                        onKeyDown={(event) => handleTrimKeyDown(event, layer, "trim-start")}
                        onPointerDown={(event) => { event.stopPropagation(); beginClipDrag(event, layer, "trim-start"); }}
                      />}
                      <span className="timeline-clip-label">V{layerIndex + 1} · {layer.name}</span>
                      <span className="timeline-clip-sub">{layer.kind === "procedural" ? getGeneratorDefinition(layer.generator.id).name : "Local footage"} · {formatSeconds(layer.timeline.duration)}</span>
                      {layer.kind === "video" && <button
                        type="button"
                        className="clip-trim-handle clip-trim-end"
                        role="slider"
                        aria-label={`Trim end for ${layer.name}`}
                        aria-orientation="horizontal"
                        aria-valuemin={layer.trimStart + 0.1}
                        aria-valuemax={project.assets[layer.assetId]?.duration ?? layer.trimEnd}
                        aria-valuenow={layer.trimEnd}
                        aria-valuetext={`${formatSeconds(layer.trimEnd)} source time`}
                        onKeyDown={(event) => handleTrimKeyDown(event, layer, "trim-end")}
                        onPointerDown={(event) => { event.stopPropagation(); beginClipDrag(event, layer, "trim-end"); }}
                      />}
                    </div>
                    <div className="timeline-playhead" style={{ left: `${playhead}%` }} aria-hidden="true" />
                  </div>
                  <span className="timeline-track-state">{layer.animation.tracks.length > 0 && <button type="button" className="track-expand" aria-label={`${isExpanded ? "Collapse" : "Expand"} animation tracks for ${layer.name}`} aria-expanded={isExpanded} onClick={() => toggleAnimationTracks(layer.id)}>{isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</button>}{layer.locked ? <LockKeyhole size={11} /> : layer.kind === "video" && layer.muted ? <Scissors size={11} /> : null}</span>
                </div>
                <AnimatePresence initial={false} mode="popLayout">
                {isExpanded && layer.animation.tracks.map((track) => <motion.div className="animation-track-row" key={track.id} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -3 }} transition={motionTokens.transition.quick}>
                  <span className="animation-track-label" title={track.property}>{getAnimationTrackLabel(layer, track.property)}</span>
                  <div className="animation-track-lane" onPointerMove={continueKeyframeDrag} onPointerUp={endKeyframeDrag} onPointerCancel={endKeyframeDrag}>
                    <div className="animation-track-base" />
                    {track.modulator?.enabled && <span className="animation-modulator-band" role="img" aria-label={`${getAnimationTrackLabel(layer, track.property)} has modulation`} />}
                    {track.keyframes.map((keyframe) => {
                      const selected = keyframeSelection.some((ref) => ref.layerId === layer.id && ref.property === track.property && ref.keyframeId === keyframe.id);
                      return <button
                        type="button"
                        key={keyframe.id}
                        className={`${Math.abs(currentTime - (layerStartAt(layer) + keyframe.time)) < 0.0001 ? "timeline-keyframe is-current" : "timeline-keyframe"}${selected ? " is-selected" : ""}`}
                        style={{ left: `${timeToPercent(layerStartAt(layer) + keyframe.time, duration)}%` }}
                        aria-label={`${getAnimationTrackLabel(layer, track.property)} keyframe at ${formatSeconds(keyframe.time)}`}
                        aria-pressed={selected}
                        title={`${getAnimationTrackLabel(layer, track.property)} · ${keyframe.time.toFixed(2)}s · ${keyframe.easing}${selected ? " · selected" : ""}`}
                        onPointerDown={(event) => beginKeyframeDrag(event, layer, track.property, keyframe.id, keyframe.time)}
                        onKeyDown={(event) => handleKeyframeKeyDown(event, layer, track.property, keyframe.id, keyframe.time)}
                      >◆</button>;
                    })}
                    <div className="timeline-playhead" style={{ left: `${playhead}%` }} aria-hidden="true" />
                  </div>
                </motion.div>)}
                </AnimatePresence>
                </motion.div>
              );
            })}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}

function snapTime(value: number, points: number[], duration: number): number {
  const threshold = Math.max(0.06, duration * 0.012);
  const nearest = points.reduce<{ point: number; distance: number } | null>((best, point) => {
    const distance = Math.abs(point - value);
    return !best || distance < best.distance ? { point, distance } : best;
  }, null);
  return nearest && nearest.distance <= threshold ? Math.max(0, nearest.point) : value;
}

function createRulerSteps(duration: number): number[] {
  const step = duration <= 8 ? 1 : duration <= 30 ? 5 : 10;
  const steps: number[] = [];
  for (let time = 0; time <= duration + 0.001; time += step) steps.push(Math.min(time, duration));
  return Array.from(new Set(steps.map((time) => Number(time.toFixed(2)))));
}
