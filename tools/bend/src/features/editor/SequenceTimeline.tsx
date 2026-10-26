import { useEffect, useRef, useState } from "react";
import { AudioLines, ChevronLeft, ChevronRight, CopyPlus, Film, Gauge, Music2, Palette, Pause, Repeat2, ScanText, Scissors, Snowflake, Trash2, Volume2, VolumeX } from "lucide-react";
import { useEditorStore } from "../../app/store";
import { formatSeconds, layerEndAt, layerStartAt, timeToPercent } from "../../engine/core/timeline";
import { averagePlaybackSpeed, videoLayerDuration } from "../../engine/core/timeMapping";
import { duplicateVideoClip, layoutSequence, removeVideoClip, shiftClipsAfter, splitVideoClip } from "../../engine/editing/operations";
import { getVideoClips, getTransitionDefinition, transitionDirectionLabel } from "../../engine/transitions/transition";
import { soundtrackLoopSummary, soundtrackPlaybackEnd, soundtrackSourceDuration } from "../../engine/audio/soundtrack";
import type { BendLayer, BendProject, VideoLayer } from "../../engine/core/types";
import { getThumbnail } from "./thumbnailService";
import { ClipWaveform, SoundtrackWaveform } from "./Waveform";

interface SequenceTimelineProps {
  project: BendProject;
  currentTime: number;
  assetUrls: Record<string, string>;
  zoom: number;
  onSetTime: (time: number) => void;
  onSelectLayer: (layerId: string) => void;
  onRequestSoundtrack: () => void;
}

type DragState =
  | { mode: "move"; layerId: string; startX: number; laneWidth: number; clips: string[]; initialStart: number; transitions: number; changed: boolean }
  | { mode: "trim-start" | "trim-end"; layerId: string; startX: number; laneWidth: number; initialLayer: VideoLayer; initialEnd: number; changed: boolean }
  | { mode: "music-move"; startX: number; laneWidth: number; initialStart: number; changed: boolean }
  | { mode: "music-in" | "music-out"; startX: number; laneWidth: number; initialStart: number; initialIn: number; initialOut: number; changed: boolean };

export function SequenceTimeline({ project, currentTime, assetUrls, zoom, onSetTime, onSelectLayer, onRequestSoundtrack }: SequenceTimelineProps) {
  const beginGesture = useEditorStore((state) => state.beginGesture);
  const endGesture = useEditorStore((state) => state.endGesture);
  const updateTransient = useEditorStore((state) => state.updateTransient);
  const cancelGesture = useEditorStore((state) => state.cancelGesture);
  const commit = useEditorStore((state) => state.commit);
  const setInspectorSection = useEditorStore((state) => state.setInspectorSection);
  const snapping = useEditorStore((state) => state.snapping);
  const activeLayerId = useEditorStore((state) => state.activeLayerId);
  const monitorAudio = useEditorStore((state) => state.monitorAudio);
  const setMonitorAudio = useEditorStore((state) => state.setMonitorAudio);
  const setActiveLayer = useEditorStore((state) => state.setActiveLayer);
  const requestInspector = useEditorStore((state) => state.requestInspector);
  const notify = useEditorStore((state) => state.notify);
  const laneRef = useRef<HTMLDivElement>(null);
  const musicLaneRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const clips = getVideoClips(project);
  const duration = Math.max(project.canvas.duration, 0.1);
  const soundtrack = project.soundtrack;
  const musicAsset = soundtrack ? project.assets[soundtrack.assetId] : null;
  const musicDuration = soundtrack ? soundtrackSourceDuration(soundtrack) : 0;
  const musicSummary = soundtrackLoopSummary(project);
  const musicPlaybackEnd = soundtrackPlaybackEnd(project);
  const activeClip = activeLayerId ? clips.find((clip) => clip.id === activeLayerId) ?? null : null;
  const activeClipIndex = activeClip ? clips.findIndex((clip) => clip.id === activeClip.id) : -1;
  const activeClipSplitReason = !activeClip
    ? "Select a clip to split."
    : activeClip.locked
      ? "Unlock this clip before splitting."
      : currentTime <= layerStartAt(activeClip) + 0.15 || currentTime >= layerEndAt(activeClip) - 0.15
        ? "Move the playhead inside the selected clip, away from its edges, to split."
        : null;

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(null), 4_000);
    return () => window.clearTimeout(timer);
  }, [message]);

  const selectClip = (clip: VideoLayer) => {
    onSelectLayer(clip.id);
    setInspectorSection("edit");
    if (currentTime < layerStartAt(clip) || currentTime >= layerEndAt(clip)) {
      onSetTime(layerStartAt(clip) + Math.min(0.02, clip.timeline.duration / 4));
    }
  };

  const beginScrub = (event: React.PointerEvent<HTMLElement>) => {
    if (!laneRef.current) return;
    const rect = laneRef.current.getBoundingClientRect();
    const scrub = (clientX: number) => onSetTime(Math.min(duration, Math.max(0, ((clientX - rect.left) / Math.max(1, rect.width)) * duration)));
    scrub(event.clientX);
    event.currentTarget.setPointerCapture(event.pointerId);
    const move = (moveEvent: PointerEvent) => scrub(moveEvent.clientX);
    const up = () => {
      event.currentTarget.removeEventListener("pointermove", move);
      event.currentTarget.removeEventListener("pointerup", up);
      event.currentTarget.removeEventListener("pointercancel", up);
    };
    event.currentTarget.addEventListener("pointermove", move);
    event.currentTarget.addEventListener("pointerup", up);
    event.currentTarget.addEventListener("pointercancel", up);
  };

  const beginClipDrag = (event: React.PointerEvent<HTMLElement>, clip: VideoLayer) => {
    event.stopPropagation();
    if (clip.locked || !laneRef.current) return;
    selectClip(clip);
    beginGesture();
    const rect = laneRef.current.getBoundingClientRect();
    dragRef.current = {
      mode: "move",
      layerId: clip.id,
      startX: event.clientX,
      laneWidth: rect.width,
      clips: clips.map((candidate) => candidate.id),
      initialStart: clip.timeline.start,
      transitions: clips.filter((candidate) => candidate.transitionIn).length,
      changed: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const continueClipDrag = (event: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (drag.mode === "move") {
      if (!laneRef.current) return;
      const rect = laneRef.current.getBoundingClientRect();
      const pointerTime = ((event.clientX - rect.left) / Math.max(1, rect.width)) * duration;
      if (Math.abs(event.clientX - drag.startX) > 3) drag.changed = true;
      if (!snapping || event.shiftKey) {
        const rawStart = Math.max(0, drag.initialStart + (event.clientX - drag.startX) / Math.max(1, rect.width) * duration);
        const layer = clips.find((candidate) => candidate.id === drag.layerId);
        if (!layer) return;
        const start = findFreeSequenceStart(rawStart, layer.timeline.duration, clips.filter((candidate) => candidate.id !== drag.layerId));
        updateTransient((draft) => {
          const target = draft.layers.find((candidate): candidate is VideoLayer => candidate.kind === "video" && candidate.id === drag.layerId);
          if (target) target.timeline.start = start;
          return draft;
        });
        return;
      }
      const without = drag.clips.filter((id) => id !== drag.layerId);
      const clipById = new Map(clips.map((clip) => [clip.id, clip]));
      let targetIndex = without.findIndex((id) => {
        const clip = clipById.get(id);
        return clip ? pointerTime < layerStartAt(clip) + clip.timeline.duration / 2 : false;
      });
      if (targetIndex < 0) targetIndex = without.length;
      const ordered = [...without];
      ordered.splice(targetIndex, 0, drag.layerId);
      const currentOrder = clips.map((clip) => clip.id);
      if (ordered.join("|") === currentOrder.join("|")) return;
      updateTransient((draft) => layoutSequence(draft, "V1", ordered));
      return;
    }
    if (drag.mode === "trim-start" || drag.mode === "trim-end") {
      const delta = ((event.clientX - drag.startX) / Math.max(1, drag.laneWidth)) * duration;
      if (Math.abs(delta) < 0.005) return;
      drag.changed = true;
      const averageSpeed = averagePlaybackSpeed(drag.initialLayer.playback);
      updateTransient((draft) => {
        const layer = draft.layers.find((candidate): candidate is VideoLayer => candidate.id === drag.layerId && candidate.kind === "video");
        if (!layer) return draft;
        const sourceDelta = delta * Math.max(0.1, averageSpeed);
        if (drag.mode === "trim-start") {
          const trimStart = Math.min(layer.trimEnd - 0.1, Math.max(0, drag.initialLayer.trimStart + sourceDelta));
          layer.trimStart = Number(trimStart.toFixed(4));
          const nextDuration = videoLayerDuration(layer);
          layer.timeline.start = Math.max(0, drag.initialEnd - nextDuration);
        } else {
          const trimEnd = Math.max(layer.trimStart + 0.1, Math.min(draft.assets[layer.assetId]?.duration ?? drag.initialLayer.trimEnd, drag.initialLayer.trimEnd + sourceDelta));
          layer.trimEnd = Number(trimEnd.toFixed(4));
        }
        if (snapping) {
          const nextEnd = layer.timeline.start + videoLayerDuration(layer);
          return shiftClipsAfter(draft, layer.id, nextEnd - drag.initialEnd);
        }
        return draft;
      });
    }
  };

  const endClipDrag = (event: React.PointerEvent<HTMLElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const drag = dragRef.current;
    if (drag && !drag.changed) cancelGesture();
    if (drag?.changed) endGesture();
    if (drag?.changed && "layerId" in drag) {
      const currentProject = useEditorStore.getState().project;
      const latestClips = currentProject ? getVideoClips(currentProject) : [];
      const index = latestClips.findIndex((clip) => clip.id === drag.layerId);
      if (drag.mode === "move") {
        const transitionsAfter = latestClips.filter((clip) => clip.transitionIn).length;
        const transitionNotice = transitionsAfter < drag.transitions ? ` ${drag.transitions - transitionsAfter} transition${drag.transitions - transitionsAfter === 1 ? " was" : "s were"} removed because the cut changed.` : "";
        setMessage((snapping ? `Moved to sequence position ${index + 1}. Undo restores the previous cut order.` : `Placed at ${formatSeconds(latestClips[index]?.timeline.start ?? 0)}. Snapping was bypassed for this drag.`) + transitionNotice);
      } else {
        setMessage("Trim changed. Following clips rippled only when snapping is on.");
      }
    }
    dragRef.current = null;
  };

  const beginMusicDrag = (event: React.PointerEvent<HTMLElement>, mode: "music-move" | "music-in" | "music-out") => {
    event.stopPropagation();
    if (!soundtrack || !musicLaneRef.current) return;
    beginGesture();
    dragRef.current = {
      mode,
      startX: event.clientX,
      laneWidth: musicLaneRef.current.getBoundingClientRect().width,
      initialStart: soundtrack.timelineStart,
      initialIn: soundtrack.sourceIn,
      initialOut: soundtrack.sourceOut,
      changed: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const continueMusicDrag = (event: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || !soundtrack || !musicLaneRef.current) return;
    if (drag.mode !== "music-move" && drag.mode !== "music-in" && drag.mode !== "music-out") return;
    const delta = ((event.clientX - drag.startX) / Math.max(1, drag.laneWidth)) * duration;
    if (Math.abs(delta) < 0.005) return;
    drag.changed = true;
    updateTransient((draft) => {
      if (!draft.soundtrack) return draft;
      if (drag.mode === "music-move") {
        draft.soundtrack.timelineStart = Math.max(0, drag.initialStart + delta);
      } else if (drag.mode === "music-in") {
        const nextIn = Math.max(0, Math.min(drag.initialOut - 0.1, drag.initialIn + delta));
        draft.soundtrack.sourceIn = Number(nextIn.toFixed(3));
        draft.soundtrack.timelineStart = Math.max(0, drag.initialStart + (nextIn - drag.initialIn));
      } else {
        draft.soundtrack.sourceOut = Math.max(drag.initialIn + 0.1, Math.min(draft.assets[draft.soundtrack.assetId]?.duration ?? drag.initialOut, drag.initialOut + delta));
      }
      return draft;
    });
  };

  const endMusicDrag = (event: React.PointerEvent<HTMLElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (dragRef.current && !dragRef.current.changed) cancelGesture();
    if (dragRef.current?.changed) {
      endGesture();
      setMessage(soundtrack?.loop ? "Soundtrack timing changed. Loop boundaries update with the source trim." : "Soundtrack timing changed. Undo restores the previous placement.");
    }
    dragRef.current = null;
  };

  const nudgeTrim = (event: React.KeyboardEvent<HTMLElement>, clip: VideoLayer, mode: "start" | "end") => {
    if (clip.locked || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
    event.preventDefault();
    event.stopPropagation();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const step = (event.shiftKey ? 0.5 : 0.1) * direction;
    commit(mode === "start" ? "Trim clip start" : "Trim clip end", (draft) => {
      const target = draft.layers.find((candidate): candidate is VideoLayer => candidate.kind === "video" && candidate.id === clip.id);
      if (!target) return draft;
      const beforeEnd = target.timeline.start + videoLayerDuration(target);
      if (mode === "start") {
        target.trimStart = Math.min(target.trimEnd - 0.1, Math.max(0, target.trimStart + step));
        target.timeline.start = Math.max(0, beforeEnd - videoLayerDuration(target));
      } else {
        target.trimEnd = Math.max(target.trimStart + 0.1, Math.min(draft.assets[target.assetId]?.duration ?? target.trimEnd, target.trimEnd + step));
      }
      const afterEnd = target.timeline.start + videoLayerDuration(target);
      return snapping ? shiftClipsAfter(draft, target.id, afterEnd - beforeEnd) : draft;
    });
  };

  const toggleMusicMute = () => {
    if (!soundtrack) return;
    commit("Toggle soundtrack mute", (draft) => {
      if (draft.soundtrack) draft.soundtrack.muted = !draft.soundtrack.muted;
      return draft;
    });
  };

  const quickSplit = () => {
    if (!activeClip) return;
    try {
      const result = splitVideoClip(project, activeClip.id, currentTime);
      commit("Split clip at playhead", () => result.project);
      setActiveLayer(result.rightId);
      setMessage(`Split at ${formatSeconds(currentTime)}. Both segments share the original source.`);
    } catch (error) {
      const text = error instanceof Error ? error.message : "This clip could not be split here.";
      setMessage(text);
      notify(text, "warning");
    }
  };

  const quickRippleDelete = () => {
    if (!activeClip) return;
    try {
      const index = clips.findIndex((clip) => clip.id === activeClip.id);
      const next = clips[index + 1]?.id ?? clips[index - 1]?.id ?? null;
      const result = removeVideoClip(project, activeClip.id, true);
      commit("Ripple delete clip", () => result);
      setActiveLayer(next);
      setMessage("Clip removed; following clips moved left. Undo restores the cut.");
    } catch (error) {
      const text = error instanceof Error ? error.message : "This clip could not be removed.";
      setMessage(text);
      notify(text, "warning");
    }
  };

  const quickDuplicate = () => {
    if (!activeClip) return;
    try {
      const result = duplicateVideoClip(project, activeClip.id);
      commit("Duplicate clip", () => result.project);
      setActiveLayer(result.layerId);
      setMessage("Clip duplicated at the end of V1 with shared source media.");
    } catch (error) {
      const text = error instanceof Error ? error.message : "This clip could not be duplicated.";
      setMessage(text);
      notify(text, "warning");
    }
  };

  const openClipTool = (target: "speed" | "transition" | "audio" | "appearance") => {
    if (!activeClip) return;
    if (target === "transition" && activeClipIndex <= 0) {
      notify("Add or move a clip before this one on V1 to create an incoming transition.", "warning");
      setInspectorSection("edit");
      return;
    }
    requestInspector("edit", target);
  };

  const toggleMusicLoop = () => {
    if (!soundtrack) return;
    commit(soundtrack.loop ? "Disable soundtrack loop" : "Enable soundtrack loop", (draft) => {
      if (draft.soundtrack) draft.soundtrack.loop = !draft.soundtrack.loop;
      return draft;
    });
    setMessage(soundtrack.loop ? "Music loop disabled; the soundtrack now stops at its source end." : "Music loop enabled. The trimmed source repeats through the composition end with a de-click crossfade.");
  };

  return (
    <div className="sequence-editor" role="group" aria-label="Video sequence">
      <div className="sequence-header">
        <div><span className="sequence-kicker">Primary sequence</span><strong>V1 · {clips.length} clip{clips.length === 1 ? "" : "s"}</strong></div>
        <span className="sequence-hint">Magnetic order · drag clips to reorder · S splits at playhead</span>
        <div className="sequence-header-actions"><span className="sequence-total">{clips.length > 0 ? `${formatSeconds(Math.max(...clips.map((clip) => layerEndAt(clip))))} timeline` : "Empty"}</span><button type="button" className={monitorAudio ? "sequence-monitor is-on" : "sequence-monitor"} aria-pressed={monitorAudio} onClick={() => setMonitorAudio(!monitorAudio)} title="Monitor clip, transition, and soundtrack audio in preview"><Volume2 size={11} /> {monitorAudio ? "Audio monitor on" : "Monitor audio"}</button></div>
      </div>
      {activeClip && <div className="sequence-context-bar" role="group" aria-label={`Quick actions for clip ${activeClipIndex + 1}`}>
        <span className="sequence-context-title" title={`Clip ${activeClipIndex + 1}: ${activeClip.name}`}>Clip {String(activeClipIndex + 1).padStart(2, "0")} · {activeClip.name}</span>
        <button type="button" className="small-action" onClick={quickSplit} disabled={Boolean(activeClipSplitReason)} title={activeClipSplitReason ?? "Split at playhead (S)"} aria-label={`Quick split selected clip at playhead${activeClipSplitReason ? `: ${activeClipSplitReason}` : ""}`}><Scissors size={12} /> Split <kbd>S</kbd></button>
        <button type="button" className="small-action" onClick={quickDuplicate} disabled={activeClip.locked} title="Duplicate at sequence end (Ctrl/Cmd+D)" aria-label="Quick duplicate selected clip at sequence end"><CopyPlus size={12} /> Duplicate</button>
        <button type="button" className="small-action" onClick={quickRippleDelete} disabled={activeClip.locked} title="Ripple delete removes this clip and closes the gap (Shift+Delete)" aria-label="Quick ripple delete selected clip and close the gap"><Trash2 size={12} /> Ripple delete</button>
        <button type="button" className="small-action" onClick={() => openClipTool("transition")} title="Open incoming transition controls" aria-label="Quick open transition controls"><Repeat2 size={12} /> Transition</button>
        <button type="button" className="small-action" onClick={() => openClipTool("speed")} title="Open speed, reverse, freeze, and ramp controls" aria-label="Quick open speed and time controls"><Gauge size={12} /> Speed</button>
        <button type="button" className="small-action" onClick={() => openClipTool("audio")} title="Open clip audio gain and fade controls" aria-label="Quick open audio controls"><Volume2 size={12} /> Audio</button>
        <button type="button" className="small-action" onClick={() => openClipTool("appearance")} title="Open color, blend, and look controls" aria-label="Quick open color and look controls"><Palette size={12} /> Color</button>
      </div>}
      {message && <p className="timeline-message" role="status">{message}</p>}
      <div className="sequence-zoom-lanes" style={{ width: `${Math.max(100, zoom * 100)}%` }}>
      <div className="sequence-row">
        <div className="sequence-track-label"><Film size={13} /><span>V1</span><small>Video</small></div>
        <div
          className="sequence-lane"
          ref={laneRef}
          onPointerDown={beginScrub}
          role="group"
          aria-label={`Primary video sequence, ${clips.length} clips, ${formatSeconds(duration)}`}
        >
          {clips.length === 0 && <div className="sequence-empty"><Film size={15} /><span>Import footage to start the sequence. New clips are added end to end.</span></div>}
          {clips.map((clip, index) => {
            const asset = project.assets[clip.assetId];
            const transition = clip.transitionIn;
            const speedLabel = clip.playback.freeze ? "FREEZE" : clip.playback.reverse ? `${clip.playback.speed.toFixed(2)}× REV` : clip.playback.rampEnabled ? "RAMP" : `${clip.playback.speed.toFixed(2)}×`;
            return <div
              key={clip.id}
              className={`sequence-clip${clip.id === activeLayerId ? " is-selected" : ""}${clip.locked ? " is-locked" : ""}`}
              style={{ left: `${timeToPercent(layerStartAt(clip), duration)}%`, width: `${Math.max(1.2, timeToPercent(clip.timeline.duration, duration))}%` }}
              role="group"
              aria-label={`Clip ${index + 1}: ${asset?.name ?? clip.name}, ${formatSeconds(clip.timeline.duration)}`}
            >
              <ClipThumb assetId={clip.assetId} url={assetUrls[clip.assetId]} sourceTime={clip.playback.reverse ? Math.max(clip.trimStart, clip.trimEnd - 0.2) : clip.trimStart + 0.15} />
              <ClipWaveform layer={clip} project={project} assetUrl={assetUrls[clip.assetId]} />
              <button
                type="button"
                className="sequence-clip-hit"
                aria-label={`Select clip ${index + 1}: ${asset?.name ?? clip.name}, ${formatSeconds(clip.timeline.duration)}, starts ${formatSeconds(layerStartAt(clip))}, ${speedLabel}`}
                onPointerDown={(event) => beginClipDrag(event, clip)}
                onPointerMove={continueClipDrag}
                onPointerUp={endClipDrag}
                onPointerCancel={endClipDrag}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectClip(clip); }
                }}
              />
              <div className="sequence-clip-shade" />
              {!transition && <span className="sequence-clip-index">CLIP {String(index + 1).padStart(2, "0")}</span>}
              <strong className="sequence-clip-name" title={asset?.name ?? clip.name}>{asset?.name?.replace(/\.[^/.]+$/, "") ?? clip.name}</strong>
              <span className="sequence-clip-meta">{formatSeconds(clip.timeline.duration)} · {speedLabel}</span>
              <span className="sequence-clip-badges">
                {clip.audio.enabled && !clip.muted && (!asset || asset.audio?.status !== "none") && <span title="Clip audio enabled"><Volume2 size={10} /></span>}
                {(clip.muted || !clip.audio.enabled) && <span title="Clip audio muted"><VolumeX size={10} /></span>}
                {clip.playback.reverse && <span title="Reverse playback"><ChevronLeft size={10} /></span>}
                {clip.playback.freeze && <span title="Freeze frame"><Snowflake size={10} /></span>}
                {clip.effects.some((effect) => effect.enabled) && <span title="Temporal effects"><Gauge size={10} /></span>}
              </span>
              {transition && <button
                type="button"
                className="sequence-transition"
                title={`${getTransitionDefinition(transition.type).name} · ${transition.duration.toFixed(2)}s · ${transitionDirectionLabel(transition.direction)}`}
                aria-label={`Transition into clip ${index + 1}: ${getTransitionDefinition(transition.type).name}, ${transition.duration.toFixed(2)} seconds`}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => { event.stopPropagation(); selectClip(clip); requestInspector("edit", "transition"); }}
              ><Repeat2 size={10} /><span>{getTransitionDefinition(transition.type).name} · {transition.duration.toFixed(1)}s</span></button>}
              <button
                type="button"
                className="sequence-trim-handle is-start"
                aria-label={`Trim start of clip ${index + 1}`}
                aria-keyshortcuts="ArrowLeft ArrowRight"
                onKeyDown={(event) => nudgeTrim(event, clip, "start")}
                onPointerDown={(event) => { event.stopPropagation(); if (!clip.locked && laneRef.current) { selectClip(clip); beginGesture(); dragRef.current = { mode: "trim-start", layerId: clip.id, startX: event.clientX, laneWidth: laneRef.current.getBoundingClientRect().width, initialLayer: structuredClone(clip), initialEnd: layerEndAt(clip), changed: false }; event.currentTarget.setPointerCapture(event.pointerId); } }}
                onPointerMove={continueClipDrag}
                onPointerUp={endClipDrag}
                onPointerCancel={endClipDrag}
              />
              <button
                type="button"
                className="sequence-trim-handle is-end"
                aria-label={`Trim end of clip ${index + 1}`}
                aria-keyshortcuts="ArrowLeft ArrowRight"
                onKeyDown={(event) => nudgeTrim(event, clip, "end")}
                onPointerDown={(event) => { event.stopPropagation(); if (!clip.locked && laneRef.current) { selectClip(clip); beginGesture(); dragRef.current = { mode: "trim-end", layerId: clip.id, startX: event.clientX, laneWidth: laneRef.current.getBoundingClientRect().width, initialLayer: structuredClone(clip), initialEnd: layerEndAt(clip), changed: false }; event.currentTarget.setPointerCapture(event.pointerId); } }}
                onPointerMove={continueClipDrag}
                onPointerUp={endClipDrag}
                onPointerCancel={endClipDrag}
              />
            </div>;
          })}
          {clips.map((clip) => clip.transitionIn ? <TransitionBand key={`transition-${clip.id}`} project={project} incoming={clip} /> : null)}
          <div className="timeline-playhead" style={{ left: `${timeToPercent(currentTime, duration)}%` }} aria-hidden="true" />
          <span className="sequence-cover-marker" style={{ left: `${timeToPercent(project.cover.time, duration)}%` }} title={`Cover frame at ${formatSeconds(project.cover.time)}`}>COVER</span>
        </div>
      </div>
      <div className="sequence-row is-music">
        <div className="sequence-track-label"><Music2 size={13} /><span>M1</span><small>Music</small></div>
        <div className="sequence-lane music-lane" ref={musicLaneRef} onPointerDown={beginScrub} role="group" aria-label="Soundtrack lane">
          {!soundtrack && <button type="button" className="sequence-music-empty" onPointerDown={(event) => event.stopPropagation()} onClick={onRequestSoundtrack}><Music2 size={14} /> Add a local soundtrack</button>}
          {soundtrack && musicAsset && <div
            className={`sequence-music-clip${soundtrack.muted ? " is-muted" : ""}${soundtrack.loop ? " is-looping" : ""}`}
            role="group"
            style={{ left: `${timeToPercent(soundtrack.timelineStart, duration)}%`, width: `${Math.max(1.4, timeToPercent(Math.max(0.1, musicPlaybackEnd - soundtrack.timelineStart), duration))}%` }}
            aria-label={`Soundtrack ${musicAsset.name}, ${formatSeconds(musicDuration)} source, ${musicSummary?.loop ? `looped ${musicSummary.repetitions} times, ` : ""}audible ${formatSeconds(musicSummary?.playbackDuration ?? 0)}, starts ${formatSeconds(soundtrack.timelineStart)}${soundtrack.ducking.enabled ? ", ducking enabled" : ""}`}
            onPointerDown={(event) => beginMusicDrag(event, "music-move")}
            onPointerMove={continueMusicDrag}
            onPointerUp={endMusicDrag}
            onPointerCancel={endMusicDrag}
          >
            <div className="music-clip-head">
              <AudioLines size={13} />
              <strong>{musicAsset.name.replace(/\.[^/.]+$/, "")}</strong>
              <span>{soundtrack.gainDb.toFixed(1)} dB</span>
              {soundtrack.loop && <span className="music-loop-badge"><Repeat2 size={9} /> ×{musicSummary?.repetitions ?? 1}</span>}
              {soundtrack.ducking.enabled && <span className="music-duck-badge">DUCK</span>}
              <button type="button" className={soundtrack.loop ? "music-loop is-on" : "music-loop"} aria-label={soundtrack.loop ? "Disable soundtrack loop" : "Enable soundtrack loop"} aria-pressed={soundtrack.loop} onPointerDown={(event) => event.stopPropagation()} onClick={toggleMusicLoop}><Repeat2 size={10} /></button>
              <button type="button" className="music-mute" aria-label={soundtrack.muted ? "Unmute soundtrack" : "Mute soundtrack"} aria-pressed={soundtrack.muted} onPointerDown={(event) => event.stopPropagation()} onClick={toggleMusicMute}>{soundtrack.muted ? <VolumeX size={11} /> : <Volume2 size={11} />}</button>
              <button type="button" className="music-mix" aria-label="Open soundtrack mix settings" onPointerDown={(event) => event.stopPropagation()} onClick={() => { setActiveLayer(null); setInspectorSection("edit"); }}>MIX</button>
            </div>
            <SoundtrackWaveform project={project} soundtrack={soundtrack} assetUrl={assetUrls[soundtrack.assetId]} />
            <button type="button" className="music-trim is-in" aria-label="Trim soundtrack in" onPointerDown={(event) => beginMusicDrag(event, "music-in")} onPointerMove={continueMusicDrag} onPointerUp={endMusicDrag} onPointerCancel={endMusicDrag} />
            <button type="button" className="music-trim is-out" aria-label="Trim soundtrack out" onPointerDown={(event) => beginMusicDrag(event, "music-out")} onPointerMove={continueMusicDrag} onPointerUp={endMusicDrag} onPointerCancel={endMusicDrag} />
            <div className="music-fades" style={{ background: `linear-gradient(90deg, rgba(255,255,255,.55) 0 ${Math.min(45, (soundtrack.fadeIn / Math.max(0.1, musicSummary?.playbackDuration ?? musicDuration)) * 100)}%, transparent ${Math.min(45, (soundtrack.fadeIn / Math.max(0.1, musicSummary?.playbackDuration ?? musicDuration)) * 100)}% ${Math.max(55, 100 - (soundtrack.fadeOut / Math.max(0.1, musicSummary?.playbackDuration ?? musicDuration)) * 100)}%, rgba(255,255,255,.55) 100%)` }} />
            {soundtrack.loop && <div className="music-loop-boundaries" aria-hidden="true">{Array.from({ length: Math.max(0, (musicSummary?.repetitions ?? 1) - 1) }).map((_, index) => <span key={index} style={{ left: `${(musicDuration * (index + 1) / Math.max(0.1, musicSummary?.playbackDuration ?? musicDuration)) * 100}%` }} />)}</div>}
          </div>}
          {soundtrack && !musicAsset && <div className="sequence-music-missing">Soundtrack media is missing. Relink it from the project library.</div>}
          <div className="timeline-playhead" style={{ left: `${timeToPercent(currentTime, duration)}%` }} aria-hidden="true" />
        </div>
      </div>
      </div>
      {clips.length > 0 && <div className="sequence-footer"><span><Pause size={10} /> Play preview includes overlapping transition audio</span><span><ScanText size={10} /> {snapping ? "Snapping on" : "Snapping off"} · Shift while dragging to bypass</span></div>}
    </div>
  );
}

function TransitionBand({ project, incoming }: { project: BendProject; incoming: VideoLayer }) {
  const outgoing = incoming.transitionIn
    ? project.layers.find((layer): layer is VideoLayer => layer.kind === "video" && layer.id === incoming.transitionIn?.fromLayerId)
    : null;
  if (!incoming.transitionIn || !outgoing) return null;
  const start = Math.max(layerStartAt(incoming), layerEndAt(outgoing) - incoming.transitionIn.duration);
  const end = Math.min(layerStartAt(incoming) + incoming.transitionIn.duration, layerEndAt(outgoing));
  if (end <= start) return null;
  return <span className="sequence-transition-band" style={{ left: `${timeToPercent(start, project.canvas.duration)}%`, width: `${Math.max(0.6, timeToPercent(end - start, project.canvas.duration))}%` }} aria-hidden="true" />;
}

function findFreeSequenceStart(target: number, duration: number, others: VideoLayer[]): number {
  const start = Math.max(0, target);
  const end = start + duration;
  const overlaps = others.some((clip) => Math.min(end, layerEndAt(clip)) > Math.max(start, layerStartAt(clip)) + 0.001);
  if (!overlaps) return start;
  const ordered = [...others].sort((left, right) => layerStartAt(left) - layerStartAt(right));
  const gaps: Array<{ start: number; end: number }> = [];
  let cursor = 0;
  for (const clip of ordered) {
    const clipStart = layerStartAt(clip);
    if (clipStart - cursor >= duration - 0.001) gaps.push({ start: cursor, end: clipStart });
    cursor = Math.max(cursor, layerEndAt(clip));
  }
  gaps.push({ start: cursor, end: Number.POSITIVE_INFINITY });
  const fitting = gaps
    .map((gap) => {
      const maxStart = Number.isFinite(gap.end) ? Math.max(gap.start, gap.end - duration) : gap.start;
      const candidate = Math.min(maxStart, Math.max(gap.start, start));
      return { start: candidate, distance: Math.abs(candidate - start) };
    })
    .sort((left, right) => left.distance - right.distance);
  return fitting[0]?.start ?? cursor;
}

function ClipThumb({ assetId, url, sourceTime }: { assetId: string; url?: string; sourceTime: number }) {
  const [thumb, setThumb] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (!url) { setThumb(null); return; }
    void getThumbnail(url, assetId, sourceTime).then((value) => { if (alive) setThumb(value); });
    return () => { alive = false; };
  }, [assetId, sourceTime, url]);
  return thumb ? <div className="sequence-clip-thumb" style={{ backgroundImage: `url(${thumb})` }} aria-hidden="true" /> : <div className="sequence-clip-thumb is-empty" aria-hidden="true" />;
}
