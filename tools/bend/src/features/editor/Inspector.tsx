import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ClipboardPaste, Columns2, Copy, Dices, Eye, EyeOff, GripVertical, Lock, Plus, RotateCcw, Scissors, Trash2, Unlock, Volume2, VolumeX, Wand2 } from "lucide-react";
import { AnimatePresence, LayoutGroup, motion, useIsPresent } from "motion/react";
import { useEditorStore } from "../../app/store";
import { clampWaveDisplacement, DEFAULT_WAVE_DISPLACEMENT } from "../../engine/effects/waveDisplacement";
import { createProceduralLayer, defaultBlendMode, defaultLayerColor, defaultLayerMask, defaultSoundtrackDucking, defaultTransform, makeId } from "../../engine/core/project";
import { soundtrackLoopSummary, soundtrackSourceDuration } from "../../engine/audio/soundtrack";
import { copyLayerTreatment, describeTreatmentClipboard, pasteLayerTreatment } from "../../engine/editing/treatment";
import { clampPlaybackSpeed, normalizeSpeedRampPoints, sourceTimeForVideoLayer, videoLayerDuration } from "../../engine/core/timeMapping";
import { applyTransition, duplicateVideoClip, previousClipFor, removeTransition, removeVideoClip, shiftClipsAfter } from "../../engine/editing/operations";
import { getTransitionDefinition, TRANSITION_DEFINITIONS, transitionDirectionLabel } from "../../engine/transitions/transition";
import { createDefaultMask, maskSummary } from "../../engine/core/mask";
import { adjustAnchorPreservingCenter, cropForAspect } from "../../engine/core/transform";
import { formatSeconds } from "../../engine/core/timeline";
import { createGeneratorParams, GENERATOR_REGISTRY, getGeneratorDefinition, type GeneratorParameterDefinition } from "../../engine/generators/registry";
import { randomSeed } from "../../engine/generators/signalField";
import { sampleFlowVector } from "../../engine/generators/flow";
import { sampleRefraction } from "../../engine/generators/refraction";
import { sampleSignalField } from "../../engine/generators/signalField";
import type { AnimationEasing, AnimationModulator, BendLayer, BendProject, ClipTransitionDirection, ClipTransitionType, GeneratorId, InspectorSection, LayerBlendMode, LayerColorAdjustments, LayerMaskType, ProceduralGeneratorParams, ProceduralLayer, TemporalEffectId, TemporalEffectInstance, VideoLayer } from "../../engine/core/types";
import { createDefaultModulator, evaluateAnimatedLayer, evaluateAnimatedProperty, evaluateEasingProgress, getAnimationTrack, getAnimationTrackLabel, getPropertyDefinition, removeKeyframeAt, setTargetValue, upsertKeyframe } from "../../engine/animation/engine";
import { createTemporalEffect, getTemporalEffectDefinition, TEMPORAL_EFFECTS } from "../../engine/temporal/registry";
import { createEffectStackClipboard, describeEffectStackClipboard, pasteEffectStack, type EffectStackPasteMode } from "../../engine/temporal/clipboard";
import { isHeavyTemporalStack, isSupportedTemporalStack } from "../../engine/temporal/time";
import { EASING_OPTIONS, EASING_PRESETS, easingLabel } from "../../engine/animation/easing";
import { applyEasingToKeyframeSelection, deleteKeyframeSelection, getSelectedKeyframes } from "../../engine/animation/keyframes";
import { randomizeLayerParameters, type VariationScope, type VariationStrength } from "../../engine/random/randomize";
import { RecipesWorkspace } from "./RecipesWorkspace";
import { motionTokens, sectionDirection } from "../../styles/motion";

interface InspectorProps {
  project: BendProject;
  activeLayerId: string | null;
  currentTime: number;
  assetUrls: Record<string, string>;
  onRelinkAsset: (assetId: string) => void;
  onReplaceSource: (layerId: string) => void;
  onRequestSoundtrack: () => void;
}

export function Inspector({ project, activeLayerId, currentTime, assetUrls, onRelinkAsset, onReplaceSource, onRequestSoundtrack }: InspectorProps) {
  const commit = useEditorStore((state) => state.commit);
  const setActiveLayer = useEditorStore((state) => state.setActiveLayer);
  const setCanvasMode = useEditorStore((state) => state.setCanvasMode);
  const canvasMode = useEditorStore((state) => state.canvasMode);
  const startCrop = useEditorStore((state) => state.startCrop);
  const finishCrop = useEditorStore((state) => state.finishCrop);
  const cancelCrop = useEditorStore((state) => state.cancelCrop);
  const inspectorSection = useEditorStore((state) => state.inspectorSection);
  const setInspectorSection = useEditorStore((state) => state.setInspectorSection);
  const activeLayer = project.layers.find((layer) => layer.id === activeLayerId) ?? null;
  const [selectedEffectId, setSelectedEffectId] = useState<string | null>(null);
  const panelDirection = useRef<-1 | 1>(1);
  const compareLayerId = useEditorStore((state) => state.compareLayerId);
  const setCompareLayer = useEditorStore((state) => state.setCompareLayer);
  const treatmentClipboard = useEditorStore((state) => state.treatmentClipboard);
  const setTreatmentClipboard = useEditorStore((state) => state.setTreatmentClipboard);
  const notify = useEditorStore((state) => state.notify);
  const inspectorRequest = useEditorStore((state) => state.inspectorRequest);

  useEffect(() => {
    if (!inspectorRequest) return;
    const frame = window.requestAnimationFrame(() => {
      const disclosure = document.querySelector<HTMLDetailsElement>(`.inspector-panel[aria-hidden="false"] [data-inspector-disclosure="${inspectorRequest.target}"]`);
      if (!disclosure) return;
      disclosure.open = true;
      disclosure.scrollIntoView({ block: "center", behavior: "smooth" });
      disclosure.querySelector<HTMLElement>("summary")?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [inspectorRequest]);

  const copyTreatment = () => {
    if (!activeLayer) return;
    const clipboard = copyLayerTreatment(activeLayer);
    setTreatmentClipboard(clipboard);
    notify(`Copied ${describeTreatmentClipboard(clipboard)}.`, "info");
  };
  const pasteTreatment = () => {
    if (!activeLayer || !treatmentClipboard) return;
    const result = pasteLayerTreatment(activeLayer, treatmentClipboard);
    commit("Paste treatment", (draft) => {
      const index = draft.layers.findIndex((layer) => layer.id === activeLayer.id);
      if (index >= 0) draft.layers[index] = result.layer;
      return draft;
    });
    notify(`Pasted treatment: ${result.pastedEffects} effect${result.pastedEffects === 1 ? "" : "s"}, ${result.pastedTracks} animation track${result.pastedTracks === 1 ? "" : "s"}${result.droppedTracks > 0 ? `; ${result.droppedTracks} incompatible track${result.droppedTracks === 1 ? " was" : "s were"} skipped` : ""}.`, result.droppedTracks > 0 ? "warning" : "info");
  };

  useEffect(() => {
    if (!activeLayer?.effects.some((effect) => effect.instanceId === selectedEffectId)) setSelectedEffectId(activeLayer?.effects[0]?.instanceId ?? null);
  }, [activeLayer, selectedEffectId]);

  useEffect(() => () => {
    if (useEditorStore.getState().compareLayerId) useEditorStore.getState().setCompareLayer(null);
  }, []);

  const patchActive = (label: string, patch: (layer: BendLayer) => void, allowLocked = false) => {
    if (!activeLayer || (activeLayer.locked && !allowLocked)) return;
    commit(label, (draft) => {
      const target = draft.layers.find((candidate) => candidate.id === activeLayer.id);
      if (target) patch(target);
      return draft;
    });
  };

  const moveActive = (direction: -1 | 1) => {
    if (!activeLayer) return;
    commit(direction > 0 ? "Raise layer" : "Lower layer", (draft) => {
      const index = draft.layers.findIndex((candidate) => candidate.id === activeLayer.id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= draft.layers.length) return draft;
      const layers = [...draft.layers];
      [layers[index], layers[target]] = [layers[target], layers[index]];
      return { ...draft, layers };
    });
  };

  const removeActive = () => {
    if (!activeLayer) return;
    const index = project.layers.findIndex((candidate) => candidate.id === activeLayer.id);
    const next = project.layers[index + 1] ?? project.layers[index - 1] ?? null;
    if (activeLayer.kind === "video") {
      try {
        const nextProject = removeVideoClip(project, activeLayer.id, false);
        commit("Remove clip", () => nextProject);
        setActiveLayer(next?.id ?? null);
      } catch {
        // Locked clips stay untouched; the timeline action reports specifics.
      }
      return;
    }
    commit("Remove layer", (draft) => ({ ...draft, layers: draft.layers.filter((candidate) => candidate.id !== activeLayer.id) }));
    setActiveLayer(next?.id ?? null);
  };

  const addGenerator = (generatorId: GeneratorId) => {
    const definition = getGeneratorDefinition(generatorId);
    const layer = createProceduralLayer(generatorId, `${project.name}-${generatorId.toUpperCase()}`, definition.name);
    layer.generator.duration = project.canvas.duration;
    layer.timeline.duration = project.canvas.duration;
    commit(`Add ${definition.name}`, (draft) => ({ ...draft, layers: [...draft.layers, layer] }));
    setActiveLayer(layer.id);
  };

  const duplicateActive = () => {
    if (!activeLayer) return;
    if (activeLayer.kind === "video") {
      try {
        const result = duplicateVideoClip(project, activeLayer.id);
        commit("Duplicate clip", () => result.project);
        setActiveLayer(result.layerId);
      } catch {
        // Locked clips stay untouched; the timeline action reports specifics.
      }
      return;
    }
    const duplicate = structuredClone(activeLayer);
    duplicate.id = makeId("layer");
    duplicate.name = `${activeLayer.name} copy`;
    commit("Duplicate layer", (draft) => ({ ...draft, layers: [...draft.layers, duplicate] }));
    setActiveLayer(duplicate.id);
  };

  const changeSection = (section: InspectorSection) => {
    panelDirection.current = sectionDirection(inspectorSection, section);
    setInspectorSection(section);
  };

  return (
    <aside className="inspector-content" aria-label="Inspector">
      <div className="inspector-sticky">
      <div className="inspector-head">
        <div className="inspector-layer-meta"><span className="inspector-kicker">{activeLayer ? "Selected layer" : "Composition"}</span><h2 className="inspector-title" title={activeLayer?.name ?? "Untitled composition"}>{activeLayer?.name ?? "Untitled composition"}</h2><span className="inspector-layer-type">{activeLayer ? (activeLayer.kind === "video" ? "Imported footage" : `${getGeneratorDefinition(activeLayer.generator.id).name} · Procedural layer`) : `${project.layers.length} layer${project.layers.length === 1 ? "" : "s"} · no selection`}</span></div>
        {activeLayer && <div className="inspector-layer-actions" role="group" aria-label={`${activeLayer.name} controls`}>
          <button type="button" className="layer-icon" title={`${activeLayer.visible ? "Hide" : "Show"} layer`} onClick={() => patchActive(activeLayer.visible ? "Hide layer" : "Show layer", (target) => { target.visible = !target.visible; })} disabled={activeLayer.locked} aria-label={`${activeLayer.visible ? "Hide" : "Show"} ${activeLayer.name}`}>{activeLayer.visible ? <Eye size={14} /> : <EyeOff size={14} />}</button>
          <button type="button" className="layer-icon" title={`${activeLayer.muted ? "Unmute" : "Mute"} layer audio`} onClick={() => patchActive(activeLayer.muted ? "Unmute layer" : "Mute layer", (target) => { target.muted = !target.muted; })} disabled={activeLayer.locked} aria-label={`${activeLayer.muted ? "Unmute" : "Mute"} ${activeLayer.name}`}>{activeLayer.muted ? <VolumeX size={14} /> : <Volume2 size={14} />}</button>
          <button type="button" className="layer-icon" title={`${activeLayer.locked ? "Unlock" : "Lock"} editing`} onClick={() => patchActive(activeLayer.locked ? "Unlock layer" : "Lock layer", (target) => { target.locked = !target.locked; }, true)} aria-label={`${activeLayer.locked ? "Unlock" : "Lock"} ${activeLayer.name}`}>{activeLayer.locked ? <Lock size={14} /> : <Unlock size={14} />}</button>
          <button type="button" className="layer-icon" title="Move layer up in the stack" onClick={() => moveActive(1)} disabled={activeLayer.locked || project.layers.findIndex((layer) => layer.id === activeLayer.id) === project.layers.length - 1} aria-label={`Raise ${activeLayer.name}`}><ArrowUp size={14} /></button>
          <button type="button" className="layer-icon" title="Move layer down in the stack" onClick={() => moveActive(-1)} disabled={activeLayer.locked || project.layers.findIndex((layer) => layer.id === activeLayer.id) === 0} aria-label={`Lower ${activeLayer.name}`}><ArrowDown size={14} /></button>
          <button type="button" className="layer-icon is-danger" title="Remove layer" onClick={removeActive} disabled={activeLayer.locked} aria-label={`Remove ${activeLayer.name}`}><Trash2 size={14} /></button>
          <button type="button" className="layer-icon" title="Duplicate layer" onClick={duplicateActive} disabled={activeLayer.locked} aria-label={`Duplicate ${activeLayer.name}`}><Copy size={14} /></button>
        </div>}
      </div>
      <LayoutGroup id="bend-inspector-tabs">
        <nav className="inspector-tabs" role="tablist" aria-label="Layer inspector sections">
          {(["edit", "effects", "motion"] as InspectorSection[]).map((section) => <button type="button" role="tab" key={section} className={inspectorSection === section ? "inspector-tab is-active" : "inspector-tab"} aria-selected={inspectorSection === section} onClick={() => changeSection(section)}>
            {inspectorSection === section && <motion.span className="inspector-tab-indicator" layoutId="bend-inspector-active-tab" transition={motionTokens.transition.quick} aria-hidden="true" />}
            <span className="inspector-tab-label">{section[0].toUpperCase() + section.slice(1)}</span>
            <span className="inspector-tab-hint" aria-hidden="true">{section === "edit" ? "Source, look & audio" : section === "effects" ? "Temporal FX" : "Keyframes & recipes"}</span>
          </button>)}
        </nav>
      </LayoutGroup>
      </div>
      <div className="inspector-panel-stage">
        <AnimatePresence initial={false} mode="popLayout" custom={panelDirection.current}>
          <InspectorPanel key={`${inspectorSection}:${activeLayerId ?? "composition"}`} direction={panelDirection.current}>
            {inspectorSection === "motion" && <div className="animation-legend" role="note"><strong>Change what the layer does over time.</strong><span><b>◆</b> keyframe at the playhead · <b>MOD</b> repeating change</span></div>}
            {inspectorSection === "edit" && !activeLayer && <SocialCompositionSection project={project} currentTime={currentTime} onRequestSoundtrack={onRequestSoundtrack} />}
            {inspectorSection === "edit" && activeLayer && <>
              <section className="inspector-section treatment-actions" role="group" aria-label="Treatment clipboard and compare">
                <div className="inspector-section-heading"><div><h3 className="inspector-section-title">Treatment</h3><p className="inspector-help">Copy the look between clips. Source, timing, transform, and motion stay unchanged.</p></div><span className="inspector-kicker">Reusable</span></div>
                <div className="treatment-action-row">
                  <button type="button" className="small-action" onClick={copyTreatment}><Copy size={12} /> Copy treatment</button>
                  <button type="button" className="small-action" onClick={pasteTreatment} disabled={!treatmentClipboard} title={treatmentClipboard ? `Paste ${describeTreatmentClipboard(treatmentClipboard)}` : "Copy a treatment first"}><ClipboardPaste size={12} /> Paste treatment</button>
                  <button type="button" className={compareLayerId === activeLayer.id ? "small-action is-primary" : "small-action"} aria-label="Hold to compare original source and edited result" aria-pressed={compareLayerId === activeLayer.id} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); setCompareLayer(activeLayer.id); }} onPointerUp={() => setCompareLayer(null)} onPointerCancel={() => setCompareLayer(null)} onPointerLeave={() => { if (compareLayerId === activeLayer.id) setCompareLayer(null); }} onKeyDown={(event) => { if ((event.key === " " || event.key === "Enter") && !event.repeat) { event.preventDefault(); setCompareLayer(activeLayer.id); } }} onKeyUp={(event) => { if (event.key === " " || event.key === "Enter") { event.preventDefault(); setCompareLayer(null); } }}><Columns2 size={12} /> Hold to compare</button>
                </div>
                <p className="treatment-clipboard-summary">{describeTreatmentClipboard(treatmentClipboard)}</p>
              </section>
              <TransformSection project={project} layer={activeLayer} currentTime={currentTime} onPatch={patchActive} />
              <InspectorDisclosure title="Crop" disclosureId="crop" summary={canvasMode === "crop" ? "Editing on canvas" : `${Math.round(activeLayer.crop.width * 100)}% × ${Math.round(activeLayer.crop.height * 100)}% source`} open={canvasMode === "crop"}>
                <CropSection project={project} layer={activeLayer} canvasMode={canvasMode} onPatch={patchActive} onStart={() => { setCanvasMode("crop"); startCrop(); }} onConfirm={finishCrop} onCancel={cancelCrop} />
              </InspectorDisclosure>
              <InspectorDisclosure title="Appearance" disclosureId="appearance" summary={activeLayer.color.enabled ? `Blend ${activeLayer.blendMode} · color adjustments` : `Blend ${activeLayer.blendMode} · color bypassed`}>
                <ColorFinishSection layer={activeLayer} currentTime={currentTime} onPatch={patchActive} />
              </InspectorDisclosure>
              <InspectorDisclosure title="Mask" disclosureId="mask" summary={maskSummary(activeLayer.mask)}>
                <MaskSection layer={activeLayer} currentTime={currentTime} onPatch={patchActive} />
              </InspectorDisclosure>
              {activeLayer.kind === "video" ? <>
                <InspectorDisclosure title="Speed and time" disclosureId="speed" summary={clipTimingSummary(activeLayer)}>
                  <ClipTimingSection layer={activeLayer} currentTime={currentTime} currentProjectTime={currentTime} onPatch={patchActive} />
                </InspectorDisclosure>
                <VideoSection layer={activeLayer} project={project} assetAvailable={Boolean(assetUrls[activeLayer.assetId])} onRelink={() => onRelinkAsset(activeLayer.assetId)} onReplace={() => onReplaceSource(activeLayer.id)} onPatch={patchActive} />
                <InspectorDisclosure title="Transition in" disclosureId="transition" summary={activeLayer.transitionIn ? `${getTransitionDefinition(activeLayer.transitionIn.type).name} ? ${activeLayer.transitionIn.duration.toFixed(2)}s` : "None"}>
                  <TransitionSection project={project} layer={activeLayer} />
                </InspectorDisclosure>
                <InspectorDisclosure title="Clip audio" disclosureId="audio" summary={`${activeLayer.muted || !activeLayer.audio.enabled ? "Muted" : "On"} · ${activeLayer.audio.gainDb.toFixed(1)} dB`}>
                  <ClipAudioSection layer={activeLayer} project={project} onPatch={patchActive} />
                </InspectorDisclosure>
              </> : <GenerateWorkspace project={project} activeLayer={activeLayer} currentTime={currentTime} onPatch={patchActive} onAddGenerator={addGenerator} />}
            </>}
            {inspectorSection === "effects" && !activeLayer && <div className="empty-inspector">Select a layer in the canvas or timeline to manage its effect stack.</div>}
            {inspectorSection === "effects" && activeLayer && <>
              {activeLayer.kind === "video" && <WaveSection layer={activeLayer} currentTime={currentTime} onPatch={patchActive} />}
              <EffectsSection layer={activeLayer} currentTime={currentTime} selectedEffectId={selectedEffectId} onSelect={setSelectedEffectId} onPatch={patchActive} compareActive={compareLayerId === activeLayer.id} onCompareChange={(active) => setCompareLayer(active ? activeLayer.id : null)} />
            </>}
            {inspectorSection === "motion" && !activeLayer && <div className="empty-inspector">Select a layer to inspect its keyframes, modulators, and recipes.</div>}
            {inspectorSection === "motion" && activeLayer && <>
              <KeyframeSelectionSection layer={activeLayer} onPatch={patchActive} />
              <MotionSection layer={activeLayer} currentTime={currentTime} onPatch={patchActive} />
              <RecipesWorkspace project={project} activeLayer={activeLayer} />
            </>}
          </InspectorPanel>
        </AnimatePresence>
      </div>
    </aside>
  );
}

function InspectorPanel({ children, direction }: { children: ReactNode; direction: -1 | 1 }) {
  const isPresent = useIsPresent();
  return <motion.div
    className="inspector-panel"
    initial={{ opacity: 0, x: direction * 12 }}
    animate={{ opacity: 1, x: 0 }}
    exit={{ opacity: 0, x: direction * -10 }}
    transition={motionTokens.transition.standard}
    aria-hidden={!isPresent}
    inert={!isPresent}
  >{children}</motion.div>;
}

function CompositionSection({ project }: { project: BendProject }) {
  return <section className="inspector-section composition-section">
    <span className="inspector-section-kicker">Composition</span>
    <h3 className="composition-title">A clear canvas is ready.</h3>
    <p className="inspector-help">Use Add in the toolbar to bring in footage or a moving background. The timeline controls layer order and timing.</p>
    <div className="composition-stats"><span><b>Format</b>{project.canvas.width} × {project.canvas.height}</span><span><b>Duration</b>{project.canvas.duration.toFixed(2)}s</span><span><b>Frame rate</b>{project.canvas.fps} FPS</span></div>
  </section>;
}

function SocialCompositionSection({ project, currentTime, onRequestSoundtrack }: { project: BendProject; currentTime: number; onRequestSoundtrack: () => void }) {
  const commit = useEditorStore((state) => state.commit);
  const soundtrack = project.soundtrack;
  const music = soundtrack ? project.assets[soundtrack.assetId] : null;
  const musicDuration = soundtrack ? soundtrackSourceDuration(soundtrack) : 0;
  const loopSummary = soundtrackLoopSummary(project);
  const reframeAll = (fit: "contain" | "cover") => commit(fit === "cover" ? "Fill all footage in frame" : "Fit all footage in frame", (draft) => {
    for (const layer of draft.layers) if (layer.kind === "video") layer.fit = fit;
    return draft;
  });
  return <section className="inspector-section composition-section">
    <span className="inspector-section-kicker">Composition / social</span>
    <h3 className="composition-title">Finish the frame.</h3>
    <p className="inspector-help">The topbar format sets 9:16, 4:5, 1:1, or 16:9. Guides are editing aids and never render into the canvas or export.</p>
    <div className="composition-stats"><span><b>Format</b>{project.canvas.width} × {project.canvas.height}</span><span><b>Duration</b>{project.canvas.duration.toFixed(2)}s</span><span><b>Frame rate</b>{project.canvas.fps} FPS</span></div>
    <div className="toggle-row"><span className="control-label">Safe-area guides</span><button type="button" className={project.safeAreas.enabled ? "toggle is-on" : "toggle"} aria-pressed={project.safeAreas.enabled} aria-label="Toggle safe-area guides" onClick={() => commit(project.safeAreas.enabled ? "Hide safe-area guides" : "Show safe-area guides", (draft) => { draft.safeAreas.enabled = !draft.safeAreas.enabled; return draft; })} /></div>
    <div className="reframe-all" role="group" aria-label="Reframe all footage"><span className="control-label">Reframe footage</span><div><button type="button" className="small-action" onClick={() => reframeAll("contain")}>Fit all</button><button type="button" className="small-action" onClick={() => reframeAll("cover")}>Fill all</button></div></div>
    <p className="inspector-fineprint">Safe guides are editing aids only. They never enter the rendered canvas or export.</p>
    {project.safeAreas.enabled && <div className="safe-area-options">
      <label><input type="checkbox" checked={project.safeAreas.titleSafe} onChange={(event) => commit("Toggle title-safe guide", (draft) => { draft.safeAreas.titleSafe = event.target.checked; return draft; })} /> Title safe</label>
      <label><input type="checkbox" checked={project.safeAreas.captionSafe} onChange={(event) => commit("Toggle caption-safe guide", (draft) => { draft.safeAreas.captionSafe = event.target.checked; return draft; })} /> Caption safe</label>
      <label><input type="checkbox" checked={project.safeAreas.grid} onChange={(event) => commit("Toggle framing grid", (draft) => { draft.safeAreas.grid = event.target.checked; return draft; })} /> Thirds grid</label>
    </div>}
    <div className="cover-row"><div><span className="control-label">Cover frame</span><strong>{formatSeconds(project.cover.time)}</strong></div><button type="button" className="small-action" onClick={() => commit("Set cover frame at playhead", (draft) => { draft.cover.time = currentTime; return draft; })}>Set at playhead</button></div>
    <div className="soundtrack-panel">
      <div className="inspector-section-heading"><div><h3 className="inspector-section-title">Soundtrack</h3><p className="inspector-help">One local music track, mixed beneath clip audio.</p></div>{soundtrack ? <button type="button" className="small-action" onClick={() => commit("Remove soundtrack", (draft) => { draft.soundtrack = null; return draft; })}>Remove</button> : <button type="button" className="small-action" onClick={onRequestSoundtrack}>Add music</button>}</div>
      {!soundtrack && <p className="inspector-help">No soundtrack. Choose Add → Add soundtrack, or click the music lane.</p>}
      {soundtrack && music && <>
        <div className="soundtrack-title"><strong>{music.name.replace(/\.[^/.]+$/, "")}</strong><span>{musicDuration.toFixed(2)}s</span><button type="button" className={soundtrack.muted ? "toggle" : "toggle is-on"} aria-pressed={!soundtrack.muted} aria-label={soundtrack.muted ? "Unmute soundtrack" : "Mute soundtrack"} onClick={() => commit("Toggle soundtrack mute", (draft) => { if (draft.soundtrack) draft.soundtrack.muted = !draft.soundtrack.muted; return draft; })} /></div>
        <div className="toggle-row"><span className="control-label">Loop music through the edit</span><button type="button" className={soundtrack.loop ? "toggle is-on" : "toggle"} aria-label="Toggle soundtrack looping" aria-pressed={soundtrack.loop} onClick={() => commit(soundtrack.loop ? "Disable soundtrack loop" : "Enable soundtrack loop", (draft) => { if (draft.soundtrack) draft.soundtrack.loop = !draft.soundtrack.loop; return draft; })} /></div>
        {soundtrack.loop && <>
          <RangeControl label="Loop crossfade" value={soundtrack.loopCrossfade} min={0} max={0.25} step={0.01} display={(value) => `${value.toFixed(2)}s`} defaultValue={0.04} onChange={(value) => commit("Change loop crossfade", (draft) => { if (draft.soundtrack) draft.soundtrack.loopCrossfade = value; return draft; })} />
          {loopSummary && <div className="soundtrack-loop-summary" role="status"><strong>{loopSummary.repetitions} repetition{loopSummary.repetitions === 1 ? "" : "s"}</strong><span>{loopSummary.playbackDuration.toFixed(2)}s audible · ends {loopSummary.playbackEnd.toFixed(2)}s · final repeat trims to the timeline</span></div>}
        </>}
        <RangeControl label="Music gain" value={soundtrack.gainDb} min={-60} max={12} step={0.5} display={(value) => `${value.toFixed(1)} dB`} defaultValue={-6} onChange={(value) => commit("Change soundtrack gain", (draft) => { if (draft.soundtrack) draft.soundtrack.gainDb = value; return draft; })} />
        <div className="toggle-row"><span className="control-label"><Volume2 size={13} /> Duck music under clip audio</span><button type="button" className={soundtrack.ducking.enabled ? "toggle is-on" : "toggle"} aria-label="Toggle automatic music ducking" aria-pressed={soundtrack.ducking.enabled} onClick={() => commit(soundtrack.ducking.enabled ? "Disable music ducking" : "Enable music ducking", (draft) => { if (draft.soundtrack) draft.soundtrack.ducking = { ...defaultSoundtrackDucking(), ...draft.soundtrack.ducking, enabled: !draft.soundtrack.ducking.enabled }; return draft; })} /></div>
        {soundtrack.ducking.enabled && <>
          <RangeControl label="Duck amount" value={soundtrack.ducking.amountDb} min={0} max={24} step={0.5} display={(value) => `-${value.toFixed(1)} dB`} defaultValue={10} onChange={(value) => commit("Change ducking amount", (draft) => { if (draft.soundtrack) draft.soundtrack.ducking.amountDb = value; return draft; })} />
          <RangeControl label="Ducking threshold" value={soundtrack.ducking.thresholdDb} min={-60} max={-6} step={1} display={(value) => `${value.toFixed(0)} dBFS`} defaultValue={-36} onChange={(value) => commit("Change ducking threshold", (draft) => { if (draft.soundtrack) draft.soundtrack.ducking.thresholdDb = value; return draft; })} />
          <RangeControl label="Ducking attack" value={soundtrack.ducking.attack} min={0.01} max={1} step={0.01} display={(value) => `${value.toFixed(2)}s`} defaultValue={0.08} onChange={(value) => commit("Change ducking attack", (draft) => { if (draft.soundtrack) draft.soundtrack.ducking.attack = value; return draft; })} />
          <RangeControl label="Ducking release" value={soundtrack.ducking.release} min={0.02} max={3} step={0.01} display={(value) => `${value.toFixed(2)}s`} defaultValue={0.4} onChange={(value) => commit("Change ducking release", (draft) => { if (draft.soundtrack) draft.soundtrack.ducking.release = value; return draft; })} />
          <p className="inspector-fineprint">Ducking is level-driven from the audible clip mix, not speech detection. It runs deterministically during export; the live monitor shows music without the duck gain.</p>
        </>}
        <RangeControl label="Fade in" value={Math.min(soundtrack.fadeIn, musicDuration)} min={0} max={musicDuration} step={0.05} display={(value) => `${value.toFixed(2)}s`} defaultValue={0} onChange={(value) => commit("Change soundtrack fade in", (draft) => { if (draft.soundtrack) draft.soundtrack.fadeIn = value; return draft; })} />
        <RangeControl label="Fade out" value={Math.min(soundtrack.fadeOut, musicDuration)} min={0} max={musicDuration} step={0.05} display={(value) => `${value.toFixed(2)}s`} defaultValue={0} onChange={(value) => commit("Change soundtrack fade out", (draft) => { if (draft.soundtrack) draft.soundtrack.fadeOut = value; return draft; })} />
        <RangeControl label="Timeline start" value={soundtrack.timelineStart} min={0} max={Math.max(project.canvas.duration, soundtrack.timelineStart)} step={0.05} display={(value) => `${value.toFixed(2)}s`} defaultValue={0} onChange={(value) => commit("Move soundtrack", (draft) => { if (draft.soundtrack) draft.soundtrack.timelineStart = value; return draft; })} />
        <RangeControl label="Source in" value={soundtrack.sourceIn} min={0} max={Math.max(0.1, soundtrack.sourceOut - 0.1)} step={0.05} display={(value) => `${value.toFixed(2)}s`} defaultValue={0} onChange={(value) => commit("Trim soundtrack in", (draft) => { if (draft.soundtrack) draft.soundtrack.sourceIn = value; return draft; })} />
        <RangeControl label="Source out" value={soundtrack.sourceOut} min={soundtrack.sourceIn + 0.1} max={Math.max(soundtrack.sourceOut, music.duration)} step={0.05} display={(value) => `${value.toFixed(2)}s`} defaultValue={music.duration} onChange={(value) => commit("Trim soundtrack out", (draft) => { if (draft.soundtrack) draft.soundtrack.sourceOut = value; return draft; })} />
      </>}
      {soundtrack && !music && <p className="form-error">Soundtrack media is missing. Relink it before export.</p>}
    </div>
  </section>;
}

function InspectorDisclosure({ title, summary, open, disclosureId, children }: { title: string; summary: string; open?: boolean; disclosureId?: string; children: ReactNode }) {
  return <details className="inspector-disclosure" data-inspector-disclosure={disclosureId} open={open ? true : undefined}>
    <summary><span><strong>{title}</strong><small title={summary}>{summary}</small></span><ChevronDown size={15} aria-hidden="true" /></summary>
    <div className="inspector-disclosure-body">{children}</div>
  </details>;
}

function MotionSection({ layer, currentTime, onPatch }: { layer: BendLayer; currentTime: number; onPatch: (label: string, patch: (layer: BendLayer) => void) => void }) {
  const setCurrentTime = useEditorStore((state) => state.setCurrentTime);
  const keyframeSelection = useEditorStore((state) => state.keyframeSelection);
  const setKeyframeSelection = useEditorStore((state) => state.setKeyframeSelection);
  const toggleKeyframeSelection = useEditorStore((state) => state.toggleKeyframeSelection);
  const localTime = Math.min(Math.max(0, currentTime - layer.timeline.start), layer.timeline.duration);
  const tracks = layer.animation.tracks;
  const addKeyframe = (property: string) => onPatch(`Add ${getAnimationTrackLabel(layer, property)} keyframe`, (target) => {
    target.animation = upsertKeyframe(target, property, localTime, evaluateAnimatedProperty(target, property, currentTime));
  });
  const removeCurrentKeyframe = (property: string) => onPatch(`Remove ${getAnimationTrackLabel(layer, property)} keyframe`, (target) => {
    target.animation = removeKeyframeAt(target.animation, property, localTime);
  });
  const toggleTrack = (property: string) => onPatch("Toggle animation track", (target) => {
    target.animation = { version: 1, tracks: target.animation.tracks.map((track) => track.property === property ? { ...track, enabled: !track.enabled } : track) };
  });

  return <section className="inspector-section motion-section">
    <div className="inspector-section-heading"><div><h3 className="inspector-section-title">Keyframes and modulation</h3><p className="inspector-help">Animation changes a property at chosen moments. Modulation adds a repeating variation.</p></div><span className="inspector-kicker">{tracks.length} track{tracks.length === 1 ? "" : "s"}</span></div>
    {tracks.length === 0 ? <p className="motion-empty">No animated properties yet. Use ◆ beside a property to place a deliberate change at the playhead.</p> : <div className="motion-track-list">
      {tracks.map((track) => {
        const currentKeyframe = track.keyframes.find((keyframe) => Math.abs(keyframe.time - localTime) < 0.0001);
        return <div className="motion-track-item" key={track.id}>
          <div className="motion-track-head"><div><strong>{getAnimationTrackLabel(layer, track.property)}</strong><span>{track.keyframes.length} keyframe{track.keyframes.length === 1 ? "" : "s"} · {track.enabled ? "active" : "bypassed"}</span></div><button type="button" className={track.enabled ? "motion-track-toggle is-on" : "motion-track-toggle"} aria-label={`${track.enabled ? "Disable" : "Enable"} animation for ${getAnimationTrackLabel(layer, track.property)}`} aria-pressed={track.enabled} onClick={() => toggleTrack(track.property)}>A</button></div>
          <div className="motion-track-actions"><button type="button" className="small-action" onClick={() => addKeyframe(track.property)}><Plus size={12} /> Keyframe</button><button type="button" className="small-action" disabled={!currentKeyframe} onClick={() => removeCurrentKeyframe(track.property)}>Remove at playhead</button></div>
          <div className="motion-keyframe-list" role="group" aria-label={`${getAnimationTrackLabel(layer, track.property)} keyframes`}>
            {track.keyframes.map((keyframe) => {
              const ref = { layerId: layer.id, property: track.property, keyframeId: keyframe.id };
              const selected = keyframeSelection.some((candidate) => candidate.layerId === layer.id && candidate.property === track.property && candidate.keyframeId === keyframe.id);
              return <button type="button" className={`${Math.abs(keyframe.time - localTime) < 0.0001 ? "motion-keyframe is-current" : "motion-keyframe"}${selected ? " is-selected" : ""}`} key={keyframe.id} aria-pressed={selected} onClick={(event) => {
                if (event.shiftKey || event.ctrlKey || event.metaKey) toggleKeyframeSelection(ref);
                else setKeyframeSelection([ref]);
                setCurrentTime(layer.timeline.start + keyframe.time);
              }}><span>◆</span> {keyframe.time.toFixed(2)}s · {easingLabel(keyframe.easing, keyframe.bezier)}</button>;
            })}
          </div>
          {track.modulator && <ModulationEditor layer={layer} property={track.property} modulator={track.modulator} onPatch={onPatch} />}
        </div>;
      })}
    </div>}
  </section>;
}

function KeyframeSelectionSection({ layer, onPatch }: { layer: BendLayer; onPatch: (label: string, patch: (layer: BendLayer) => void) => void }) {
  const selection = useEditorStore((state) => state.keyframeSelection);
  const setKeyframeSelection = useEditorStore((state) => state.setKeyframeSelection);
  const selected = getSelectedKeyframes(layer, selection);
  const first = selected[0]?.keyframe;
  const [draftEasing, setDraftEasing] = useState<AnimationEasing>(first?.easing ?? "ease-in-out");
  const [draftBezier, setDraftBezier] = useState<[number, number, number, number]>(first?.bezier ?? [0.25, 0.1, 0.25, 1]);
  const [message, setMessage] = useState<string | null>(null);
  const selectionKey = selection.map((ref) => `${ref.property}:${ref.keyframeId}`).join("|");
  useEffect(() => {
    const current = getSelectedKeyframes(layer, useEditorStore.getState().keyframeSelection)[0]?.keyframe;
    setDraftEasing(current?.easing ?? "ease-in-out");
    setDraftBezier(current?.bezier ?? [0.25, 0.1, 0.25, 1]);
    setMessage(null);
    // Resetting the draft is tied to the selected identities, not every project tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionKey]);
  const mixedEasing = new Set(selected.map((entry) => entry.keyframe.easing)).size > 1;
  const applyEasing = (easing: AnimationEasing, bezier?: [number, number, number, number]) => {
    setDraftEasing(easing);
    if (bezier) setDraftBezier(bezier);
    const result = applyEasingToKeyframeSelection(layer, selection, easing, bezier ?? draftBezier);
    if (!result.ok) {
      setMessage(result.reason);
      return;
    }
    onPatch(`Set ${easingLabel(easing, bezier)} easing`, (target) => { target.animation = result.animation; });
    setKeyframeSelection(result.selection);
    setMessage(result.message);
  };
  const removeSelected = () => {
    const result = deleteKeyframeSelection(layer, selection);
    if (!result.ok) {
      setMessage(result.reason);
      return;
    }
    onPatch("Delete selected keyframes", (target) => { target.animation = result.animation; });
    setKeyframeSelection([]);
    setMessage(result.message);
  };
  if (selected.length === 0) {
    return <section className="inspector-section easing-selection-section"><div className="inspector-section-heading"><div><h3 className="inspector-section-title">Selected keyframes</h3><p className="inspector-help">Select keyframes in the timeline with Shift-click to edit their easing as a group.</p></div><span className="inspector-kicker">None</span></div></section>;
  }
  return <section className="inspector-section easing-selection-section">
    <div className="inspector-section-heading"><div><h3 className="inspector-section-title">Selected keyframes</h3><p className="inspector-help">{selected.length} keyframe{selected.length === 1 ? "" : "s"} across {new Set(selected.map((entry) => entry.property)).size} track{new Set(selected.map((entry) => entry.property)).size === 1 ? "" : "s"}. Easing changes apply to this whole selection in one undo step.</p></div><span className="inspector-kicker">{mixedEasing ? "Mixed easing" : easingLabel(first?.easing ?? "linear", first?.bezier)}</span></div>
    <div className="easing-editor">
      <EasingCurvePreview easing={draftEasing} bezier={draftBezier} />
      <div className="easing-controls">
        <div className="select-row"><label htmlFor={`${layer.id}-selected-easing`}>Easing</label><select id={`${layer.id}-selected-easing`} className="inspector-select" value={draftEasing} onChange={(event) => applyEasing(event.target.value as AnimationEasing)}>{EASING_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
        {draftEasing === "cubic-bezier" && <div className="bezier-grid" aria-label="Cubic Bézier values">{(['X1', 'Y1', 'X2', 'Y2'] as const).map((label, index) => <label key={label}><span>{label}</span><input type="number" min={0} max={1} step={0.01} value={Number(draftBezier[index].toFixed(2))} aria-label={`Bézier ${label}`} onChange={(event) => { const next = [...draftBezier] as [number, number, number, number]; next[index] = Math.min(1, Math.max(0, Number(event.target.value))); setDraftBezier(next); }} /></label>)}</div>}
      </div>
    </div>
    <div className="preset-grid easing-presets" role="group" aria-label="Easing presets">{EASING_PRESETS.map((preset) => <button type="button" className="preset-button" key={`${preset.value}-${preset.label}`} onClick={() => applyEasing(preset.value, preset.bezier)}>{preset.label}</button>)}</div>
    {draftEasing === "cubic-bezier" && <button type="button" className="small-action" onClick={() => applyEasing("cubic-bezier", draftBezier)}>Apply Bézier curve</button>}
    <div className="easing-selected-list" role="group" aria-label="Selected keyframe details">{selected.slice(0, 8).map((entry) => <div key={`${entry.property}-${entry.keyframe.id}`}><span>{getAnimationTrackLabel(layer, entry.property)}</span><span>{entry.keyframe.time.toFixed(2)}s</span><span>{easingLabel(entry.keyframe.easing, entry.keyframe.bezier)}</span></div>)}{selected.length > 8 && <p className="inspector-help">+ {selected.length - 8} more selected.</p>}</div>
    <div className="easing-footer"><span className="inspector-fineprint">Hold keeps the value until the next keyframe. The curve preview uses the same evaluator as playback and export.</span><button type="button" className="small-action is-danger" onClick={removeSelected} disabled={layer.locked}><Trash2 size={12} /> Delete selected</button></div>
    {message && <p className="effect-paste-message" role="status">{message}</p>}
  </section>;
}

function EasingCurvePreview({ easing, bezier }: { easing: AnimationEasing; bezier?: [number, number, number, number] }) {
  const width = 92;
  const height = 56;
  const padding = 7;
  const points = Array.from({ length: 29 }, (_, index) => {
    const progress = index / 28;
    const value = evaluateEasingProgress(progress, easing, bezier);
    return `${padding + progress * (width - padding * 2)},${height - padding - value * (height - padding * 2)}`;
  }).join(" ");
  return <svg className="easing-curve-preview" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${easingLabel(easing, bezier)} easing curve`}><rect x="0" y="0" width={width} height={height} rx="6" /><line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} /><line x1={padding} y1={padding} x2={padding} y2={height - padding} /><polyline points={points} /></svg>;
}

function TransformSection({ project, layer, currentTime, onPatch }: { project: BendProject; layer: BendLayer; currentTime: number; onPatch: (label: string, patch: (layer: BendLayer) => void) => void }) {
  const autoKey = useEditorStore((state) => state.autoKey);
  const setAutoKey = useEditorStore((state) => state.setAutoKey);
  const localTime = Math.min(Math.max(0, currentTime - layer.timeline.start), layer.timeline.duration);
  const applyAnimatedValue = (target: BendLayer, property: string, update: (value: number) => number) => {
    const currentValue = evaluateAnimatedProperty(target, property, currentTime);
    const nextValue = update(typeof currentValue === "number" ? currentValue : 0);
    if (autoKey) target.animation = upsertKeyframe(target, property, localTime, nextValue);
    else Object.assign(target, setTargetValue(target, property, nextValue));
  };
  const patchAnimatedValue = (label: string, property: string, update: (value: number) => number) => onPatch(label, (target) => applyAnimatedValue(target, property, update));
  const setAnchor = (x: number, y: number) => onPatch("Change anchor point", (target) => {
    const source = structuredClone(target);
    const currentFrame = evaluateAnimatedLayer(project, source, currentTime);
    const position = adjustAnchorPreservingCenter(project, currentFrame, { x, y });
    target.transform.anchor = { x, y };
    target.transform.x = position.x;
    target.transform.y = position.y;
    const animatedPositions = new Set(["transform.x", "transform.y"]);
    const frameTimes = new Set<number>([0, source.timeline.duration]);
    for (const track of source.animation.tracks) {
      if (animatedPositions.has(track.property)) track.keyframes.forEach((keyframe) => frameTimes.add(keyframe.time));
    }
    let animation = target.animation;
    for (const time of frameTimes) {
      const frame = evaluateAnimatedLayer(project, source, source.timeline.start + time);
      const nextPosition = adjustAnchorPreservingCenter(project, frame, { x, y });
      if (getAnimationTrack(source, "transform.x")) animation = upsertKeyframe({ ...target, animation }, "transform.x", time, nextPosition.x);
      if (getAnimationTrack(source, "transform.y")) animation = upsertKeyframe({ ...target, animation }, "transform.y", time, nextPosition.y);
    }
    target.animation = animation;
  });
  const resetTransform = () => onPatch("Reset transform", (target) => {
    const reset = defaultTransform();
    target.transform.anchor = reset.anchor;
    target.transform.flipX = reset.flipX;
    target.transform.flipY = reset.flipY;
    for (const property of ["transform.x", "transform.y", "transform.scale", "transform.rotation", "transform.opacity"]) {
      const key = property.split(".")[1] as "x" | "y" | "scale" | "rotation" | "opacity";
      applyAnimatedValue(target, property, () => reset[key]);
    }
  });
  return (
      <section className="inspector-section" role="group" aria-label="Transform">
      <div className="inspector-section-heading"><div><h3 className="inspector-section-title">Transform</h3><p className="inspector-help">Position is the layer anchor offset from composition center. Auto-Key adds numeric edits at the playhead; crop, anchor, and flips stay static.</p></div><button type="button" className={autoKey ? "auto-key-toggle is-on" : "auto-key-toggle"} aria-label="Auto-Key" aria-pressed={autoKey} onClick={() => setAutoKey(!autoKey)}>◆ Auto-Key {autoKey ? "On" : "Off"}</button></div>
      <AnimatedRangeControl layer={layer} currentTime={currentTime} property="transform.scale" label="Scale" display={(value) => `${value.toFixed(2)}×`} onPatch={onPatch} />
      <AnimatedRangeControl layer={layer} currentTime={currentTime} property="transform.x" label="Position X" display={(value) => `${Math.round(value)} px`} onPatch={onPatch} />
      <AnimatedRangeControl layer={layer} currentTime={currentTime} property="transform.y" label="Position Y" display={(value) => `${Math.round(value)} px`} onPatch={onPatch} />
      <AnimatedRangeControl layer={layer} currentTime={currentTime} property="transform.rotation" label="Rotation" display={(value) => `${Math.round(value)}°`} onPatch={onPatch} />
      <AnimatedRangeControl layer={layer} currentTime={currentTime} property="transform.opacity" label="Opacity" display={(value) => `${Math.round(value * 100)}%`} onPatch={onPatch} />
      <div className="transform-action-row" role="group" aria-label="Orientation actions">
        <button type="button" className="small-action" aria-label="Rotate clockwise 90 degrees" onClick={() => patchAnimatedValue("Rotate clockwise", "transform.rotation", (value) => value + 90)}>↻ 90°</button>
        <button type="button" className="small-action" aria-label="Rotate counterclockwise 90 degrees" onClick={() => patchAnimatedValue("Rotate counterclockwise", "transform.rotation", (value) => value - 90)}>↺ 90°</button>
        <button type="button" className="small-action" aria-label="Flip horizontal" onClick={() => onPatch("Flip horizontal", (target) => { target.transform.flipX = !target.transform.flipX; })}>Flip H</button>
        <button type="button" className="small-action" aria-label="Flip vertical" onClick={() => onPatch("Flip vertical", (target) => { target.transform.flipY = !target.transform.flipY; })}>Flip V</button>
        <button type="button" className="small-action" aria-label="Reset orientation" onClick={() => onPatch("Reset orientation", (target) => { applyAnimatedValue(target, "transform.rotation", () => 0); target.transform.flipX = false; target.transform.flipY = false; })}>Reset orientation</button>
      </div>
      <div className="anchor-control">
        <span className="control-label">Anchor</span>
        <div className="anchor-grid" role="group" aria-label="Anchor point">
          {[0, 0.5, 1].flatMap((y) => [0, 0.5, 1].map((x) => ({ x, y }))).map((anchor) => <button type="button" key={`${anchor.x}-${anchor.y}`} className={Math.abs(layer.transform.anchor.x - anchor.x) < 0.001 && Math.abs(layer.transform.anchor.y - anchor.y) < 0.001 ? "anchor-point is-active" : "anchor-point"} aria-label={`Anchor ${anchor.y === 0 ? "top" : anchor.y === 0.5 ? "middle" : "bottom"} ${anchor.x === 0 ? "left" : anchor.x === 0.5 ? "center" : "right"}`} aria-pressed={Math.abs(layer.transform.anchor.x - anchor.x) < 0.001 && Math.abs(layer.transform.anchor.y - anchor.y) < 0.001} onClick={() => setAnchor(anchor.x, anchor.y)}><span /></button>)}
        </div>
      </div>
      <div className="transform-action-row" role="group" aria-label="Transform quick actions">
        <button type="button" className="small-action" onClick={() => onPatch("Center layer", (target) => { applyAnimatedValue(target, "transform.x", () => 0); applyAnimatedValue(target, "transform.y", () => 0); })}>Center</button>
        {layer.kind === "video" && <><button type="button" className="small-action" onClick={() => onPatch("Fit to canvas", (target) => { if (target.kind === "video") { target.fit = "contain"; applyAnimatedValue(target, "transform.scale", () => 1); } })}>Fit</button><button type="button" className="small-action" onClick={() => onPatch("Fill canvas", (target) => { if (target.kind === "video") { target.fit = "cover"; applyAnimatedValue(target, "transform.scale", () => 1); } })}>Fill</button></>}
        <button type="button" className="small-action" onClick={resetTransform}><RotateCcw size={12} /> Reset</button>
      </div>
    </section>
  );
}

function CropSection({ project, layer, canvasMode, onPatch, onStart, onConfirm, onCancel }: { project: BendProject; layer: BendLayer; canvasMode: "select" | "crop"; onPatch: (label: string, patch: (layer: BendLayer) => void) => void; onStart: () => void; onConfirm: () => void; onCancel: () => void }) {
  const locked = layer.locked;
  return <section className={canvasMode === "crop" ? "inspector-section crop-section is-editing" : "inspector-section crop-section"}>
    <div className="inspector-section-heading"><div><h3 className="inspector-section-title">Crop</h3><p className="inspector-help">Spatial only. Source media and timing stay untouched.</p></div><span className="inspector-kicker">{canvasMode === "crop" ? "Editing" : "Non-destructive"}</span></div>
    <div className="crop-presets" role="group" aria-label="Crop presets">
      {(["free", "original", "1:1", "4:5", "9:16", "16:9"] as const).map((preset) => <button type="button" className="small-action" key={preset} disabled={locked} onClick={() => onPatch(`Set ${preset} crop`, (target) => { target.crop = cropForAspect(project, target, preset); })}>{preset === "original" ? "Original" : preset}</button>)}
    </div>
    {canvasMode === "crop" ? <div className="crop-session-actions"><span>Drag edges or move the crop on canvas.</span><div><button type="button" className="small-action" onClick={onCancel}>Cancel</button><button type="button" className="small-action is-primary" onClick={onConfirm}>Confirm crop</button></div></div> : <button type="button" className="small-action crop-start" disabled={locked} onClick={onStart}>Crop on canvas</button>}
    <div className="crop-footer"><span>{Math.round(layer.crop.width * 100)}% × {Math.round(layer.crop.height * 100)}% source</span><button type="button" className="small-action" disabled={locked} onClick={() => onPatch("Reset crop", (target) => { target.crop = cropForAspect(project, target, "original"); })}>Reset crop</button></div>
  </section>;
}

function AppearanceSection({ layer, currentTime, onPatch }: { layer: BendLayer; currentTime: number; onPatch: (label: string, patch: (layer: BendLayer) => void) => void }) {
  return <section className="inspector-section appearance-section" role="group" aria-label="Appearance">
    <div className="inspector-section-heading"><div><h3 className="inspector-section-title">Appearance</h3><p className="inspector-help">Layer-local color and compositing. Blend mode composites this layer against the layers below it.</p></div><button type="button" className={layer.color.enabled ? "toggle is-on" : "toggle"} aria-label="Bypass color adjustments" aria-pressed={!layer.color.enabled} disabled={layer.locked} onClick={() => onPatch(layer.color.enabled ? "Bypass color adjustments" : "Enable color adjustments", (target) => { target.color.enabled = !target.color.enabled; })}>{layer.color.enabled ? "On" : "Bypass"}</button></div>
    <div className="select-row"><label htmlFor={`${layer.id}-blend-mode`}>Blend mode</label><select id={`${layer.id}-blend-mode`} className="inspector-select" value={layer.blendMode ?? "normal"} disabled={layer.locked} onChange={(event) => onPatch("Change blend mode", (target) => { target.blendMode = event.target.value as LayerBlendMode; })}><option value="normal">Normal</option><option value="multiply">Multiply</option><option value="screen">Screen</option><option value="add">Add / Lighter</option><option value="overlay">Overlay</option></select></div>
    <AnimatedRangeControl layer={layer} currentTime={currentTime} property="color.brightness" label="Brightness" display={(value) => `${Math.round(value * 100)}%`} onPatch={onPatch} />
    <AnimatedRangeControl layer={layer} currentTime={currentTime} property="color.contrast" label="Contrast" display={(value) => `${Math.round(value * 100)}%`} onPatch={onPatch} />
    <AnimatedRangeControl layer={layer} currentTime={currentTime} property="color.saturation" label="Saturation" display={(value) => `${Math.round(value * 100)}%`} onPatch={onPatch} />
    <AnimatedRangeControl layer={layer} currentTime={currentTime} property="color.hue" label="Hue" display={(value) => `${Math.round(value)}°`} onPatch={onPatch} />
    <button type="button" className="small-action" onClick={() => onPatch("Reset color adjustments", (target) => { target.color = defaultLayerColor(); })} disabled={layer.locked}><RotateCcw size={12} /> Reset color</button>
    <p className="inspector-fineprint">Compositing order: source → temporal effects → spatial effects → crop → transform → mask → blend. Normal preserves previous projects.</p>
  </section>;
}

const COLOR_LOOKS: Array<{ id: string; name: string; description: string; values: Partial<LayerColorAdjustments> }> = [
  { id: "clean", name: "Clean contrast", description: "Crisp neutral finish", values: { brightness: 0.03, contrast: 0.14, saturation: 0.04, temperature: 0.04, highlights: -0.04, shadows: 0.05, sharpen: 0.12 } },
  { id: "warm-film", name: "Warm film", description: "Warm light, soft grain", values: { brightness: 0.02, contrast: 0.08, saturation: -0.04, temperature: 0.32, tint: 0.05, highlights: -0.1, shadows: 0.12, grain: 0.16, vignette: 0.12 } },
  { id: "cool", name: "Cool editorial", description: "Cool shadows, quieter color", values: { contrast: 0.12, saturation: -0.14, temperature: -0.3, tint: -0.04, shadows: -0.04, highlights: 0.05 } },
  { id: "fade", name: "Soft fade", description: "Lifted black point", values: { brightness: 0.06, contrast: -0.18, saturation: -0.08, shadows: 0.28, highlights: -0.12, grain: 0.08 } },
  { id: "mono", name: "High-contrast mono", description: "Monochrome, deep contrast", values: { contrast: 0.32, saturation: -1, highlights: 0.06, shadows: -0.08, vignette: 0.2, grain: 0.08 } },
  { id: "analog", name: "Analog grain", description: "Texture and warm falloff", values: { contrast: 0.06, saturation: -0.04, temperature: 0.18, shadows: 0.1, vignette: 0.26, grain: 0.32 } },
];

function colorLookSwatch(id: string): string {
  if (id === "warm-film") return "linear-gradient(135deg, #e7ba83 0%, #b6774d 46%, #5b3b2d 100%)";
  if (id === "cool") return "linear-gradient(135deg, #b8d5df 0%, #688b9b 48%, #293f4c 100%)";
  if (id === "fade") return "linear-gradient(135deg, #e5ddd1 0%, #b9b0a3 52%, #7e8580 100%)";
  if (id === "mono") return "linear-gradient(135deg, #f2f2ef 0%, #a5a5a1 50%, #2a2a29 100%)";
  if (id === "analog") return "linear-gradient(135deg, #c9b7a0 0%, #8c7561 48%, #3d342d 100%)";
  return "linear-gradient(135deg, #e3eae6 0%, #8db3ad 48%, #355d61 100%)";
}

function ColorFinishSection({ layer, currentTime, onPatch }: { layer: BendLayer; currentTime: number; onPatch: (label: string, patch: (layer: BendLayer) => void) => void }) {
  const color = layer.color;
  const applyLook = (look: typeof COLOR_LOOKS[number]) => onPatch(`Apply ${look.name} look`, (target) => {
    target.color = { ...defaultLayerColor(), ...target.color, ...look.values, enabled: true };
  });
  return <section className="inspector-section appearance-section" role="group" aria-label="Color finish">
    <div className="inspector-section-heading"><div><h3 className="inspector-section-title">Color finish</h3><p className="inspector-help">Layer-local color and compositing. Defaults preserve source appearance.</p></div><button type="button" className={color.enabled ? "toggle is-on" : "toggle"} aria-label="Bypass color adjustments" aria-pressed={!color.enabled} disabled={layer.locked} onClick={() => onPatch(color.enabled ? "Bypass color adjustments" : "Enable color adjustments", (target) => { target.color.enabled = !target.color.enabled; })}>{color.enabled ? "On" : "Bypass"}</button></div>
    <div className="select-row"><label htmlFor={`${layer.id}-blend-mode`}>Blend mode</label><select id={`${layer.id}-blend-mode`} className="inspector-select" value={layer.blendMode ?? "normal"} disabled={layer.locked} onChange={(event) => onPatch("Change blend mode", (target) => { target.blendMode = event.target.value as LayerBlendMode; })}><option value="normal">Normal</option><option value="multiply">Multiply</option><option value="screen">Screen</option><option value="add">Add / Lighter</option><option value="overlay">Overlay</option></select></div>
    <div className="color-look-grid" role="group" aria-label="Color looks">{COLOR_LOOKS.map((look) => <button type="button" key={look.id} className="color-look" disabled={layer.locked} title={look.description} onClick={() => applyLook(look)}><span className="color-look-swatch" style={{ background: colorLookSwatch(look.id) }} aria-hidden="true" /><strong>{look.name}</strong><span>{look.description}</span></button>)}</div>
    <p className="inspector-fineprint">A look replaces this layer's color values. Undo restores the previous finish; source media stays untouched.</p>
    <AnimatedRangeControl layer={layer} currentTime={currentTime} property="color.brightness" label="Brightness" display={(value) => `${Math.round(value * 100)}%`} onPatch={onPatch} />
    <AnimatedRangeControl layer={layer} currentTime={currentTime} property="color.contrast" label="Contrast" display={(value) => `${Math.round(value * 100)}%`} onPatch={onPatch} />
    <AnimatedRangeControl layer={layer} currentTime={currentTime} property="color.saturation" label="Saturation" display={(value) => `${Math.round(value * 100)}%`} onPatch={onPatch} />
    <AnimatedRangeControl layer={layer} currentTime={currentTime} property="color.hue" label="Hue" display={(value) => `${Math.round(value)}°`} onPatch={onPatch} />
    <AnimatedRangeControl layer={layer} currentTime={currentTime} property="color.temperature" label="Temperature" display={(value) => `${Math.round(value * 100)}`} onPatch={onPatch} />
    <AnimatedRangeControl layer={layer} currentTime={currentTime} property="color.tint" label="Tint" display={(value) => `${Math.round(value * 100)}`} onPatch={onPatch} />
    <AnimatedRangeControl layer={layer} currentTime={currentTime} property="color.highlights" label="Highlights" display={(value) => `${Math.round(value * 100)}`} onPatch={onPatch} />
    <AnimatedRangeControl layer={layer} currentTime={currentTime} property="color.shadows" label="Shadows" display={(value) => `${Math.round(value * 100)}`} onPatch={onPatch} />
    <AnimatedRangeControl layer={layer} currentTime={currentTime} property="color.vignette" label="Vignette" display={(value) => `${Math.round(value * 100)}%`} onPatch={onPatch} />
    <AnimatedRangeControl layer={layer} currentTime={currentTime} property="color.grain" label="Film grain" display={(value) => `${Math.round(value * 100)}%`} onPatch={onPatch} />
    <AnimatedRangeControl layer={layer} currentTime={currentTime} property="color.sharpen" label="Sharpen" display={(value) => `${Math.round(value * 100)}%`} onPatch={onPatch} />
    <button type="button" className="small-action" onClick={() => onPatch("Reset color adjustments", (target) => { target.color = defaultLayerColor(); })} disabled={layer.locked}><RotateCcw size={12} /> Reset color</button>
    <p className="inspector-fineprint">Order: source → temporal effects → spatial effects → crop → color → transform → mask → blend.</p>
  </section>;
}

function MaskSection({ layer, currentTime, onPatch }: { layer: BendLayer; currentTime: number; onPatch: (label: string, patch: (layer: BendLayer) => void) => void }) {
  const mask = layer.mask ?? defaultLayerMask();
  const shape = (type: LayerMaskType, label: string) => <button type="button" className={mask.type === type ? "segment is-active" : "segment"} aria-pressed={mask.type === type} disabled={layer.locked} onClick={() => onPatch(`Use ${label} mask`, (target) => { target.mask = { ...createDefaultMask(), ...target.mask, type }; })}>{label}</button>;
  return <section className="inspector-section mask-section" role="group" aria-label="Mask">
    <div className="inspector-section-heading"><div><h3 className="inspector-section-title">Mask</h3><p className="inspector-help">A non-destructive window over the rendered layer. Crop still controls source framing; the mask controls what remains visible during compositing.</p></div><span className="inspector-kicker">{mask.type === "none" ? "Off" : "Active"}</span></div>
    <div className="segmented mask-shape" role="group" aria-label="Mask shape">{shape("none", "None")}{shape("rectangle", "Rect")}{shape("ellipse", "Ellipse")}{shape("gradient", "Gradient")}</div>
    {mask.type !== "none" && <>
      <div className="toggle-row"><span className="control-label">Invert mask</span><button type="button" className={mask.invert ? "toggle is-on" : "toggle"} aria-label="Invert mask" aria-pressed={mask.invert} disabled={layer.locked} onClick={() => onPatch(mask.invert ? "Uninvert mask" : "Invert mask", (target) => { target.mask.invert = !target.mask.invert; })} /></div>
      <AnimatedRangeControl layer={layer} currentTime={currentTime} property="mask.x" label="Position X" display={(value) => `${Math.round(value * 100)}%`} onPatch={onPatch} fallbackValue={mask.x} />
      <AnimatedRangeControl layer={layer} currentTime={currentTime} property="mask.y" label="Position Y" display={(value) => `${Math.round(value * 100)}%`} onPatch={onPatch} fallbackValue={mask.y} />
      <AnimatedRangeControl layer={layer} currentTime={currentTime} property="mask.width" label="Width" display={(value) => `${Math.round(value * 100)}%`} onPatch={onPatch} fallbackValue={mask.width} />
      <AnimatedRangeControl layer={layer} currentTime={currentTime} property="mask.height" label="Height" display={(value) => `${Math.round(value * 100)}%`} onPatch={onPatch} fallbackValue={mask.height} />
      <AnimatedRangeControl layer={layer} currentTime={currentTime} property="mask.rotation" label="Rotation" display={(value) => `${Math.round(value)}°`} onPatch={onPatch} fallbackValue={mask.rotation} />
      {mask.type === "gradient" ? <>
        <AnimatedRangeControl layer={layer} currentTime={currentTime} property="mask.angle" label="Direction" display={(value) => `${Math.round(value)}°`} onPatch={onPatch} fallbackValue={mask.angle} />
        <AnimatedRangeControl layer={layer} currentTime={currentTime} property="mask.falloff" label="Falloff" display={(value) => `${Math.round(value * 100)}%`} onPatch={onPatch} fallbackValue={mask.falloff} />
      </> : <AnimatedRangeControl layer={layer} currentTime={currentTime} property="mask.feather" label="Feather" display={(value) => `${Math.round(value * 100)}%`} onPatch={onPatch} fallbackValue={mask.feather} />}
      <div className="mask-footer"><span>{maskSummary(mask)}</span><button type="button" className="small-action" disabled={layer.locked} onClick={() => onPatch("Reset mask", (target) => { target.mask = defaultLayerMask(); })}><RotateCcw size={12} /> Clear mask</button></div>
    </>}
    {mask.type === "none" && <p className="inspector-help mask-empty">No mask. The layer remains fully visible. Choose a shape to create an editable window.</p>}
  </section>;
}

function VideoSection({ layer, project, assetAvailable, onRelink, onReplace, onPatch }: { layer: VideoLayer; project: BendProject; assetAvailable: boolean; onRelink: () => void; onReplace: () => void; onPatch: (label: string, patch: (layer: BendLayer) => void) => void }) {
  const asset = project.assets[layer.assetId];
  const duration = asset?.duration ?? layer.trimEnd;
  const audio = asset?.audio;
  const commit = useEditorStore((state) => state.commit);
  const patchTrim = (label: string, mutate: (target: VideoLayer) => void) => {
    if (layer.locked) return;
    const snapping = useEditorStore.getState().snapping;
    commit(label, (draft) => {
      const target = draft.layers.find((candidate): candidate is VideoLayer => candidate.kind === "video" && candidate.id === layer.id);
      if (!target) return draft;
      const beforeEnd = target.timeline.start + videoLayerDuration(target);
      mutate(target);
      const nextEnd = target.timeline.start + videoLayerDuration(target);
      return snapping ? shiftClipsAfter(draft, target.id, nextEnd - beforeEnd) : draft;
    });
  };
  return (
    <section className="inspector-section" role="group" aria-label="Source and trim">
      <h3 className="inspector-section-title">Source / trim</h3>
      <div className="select-row"><span className="control-label">Fit mode</span><div className="segmented" role="group" aria-label="Fit mode"><button type="button" className={layer.fit === "contain" ? "segment is-active" : "segment"} aria-pressed={layer.fit === "contain"} disabled={layer.locked} onClick={() => onPatch("Fit footage", (target) => { if (target.kind === "video") target.fit = "contain"; })}>Fit</button><button type="button" className={layer.fit === "cover" ? "segment is-active" : "segment"} aria-pressed={layer.fit === "cover"} disabled={layer.locked} onClick={() => onPatch("Fill footage", (target) => { if (target.kind === "video") target.fit = "cover"; })}>Fill</button></div></div>
      <RangeControl label="In" value={layer.trimStart} min={0} max={Math.max(0.1, layer.trimEnd - 0.1)} step={0.01} display={(value) => `${value.toFixed(2)}s`} defaultValue={0} disabled={layer.locked} onChange={(value) => patchTrim("Trim start", (target) => { const end = target.timeline.start + videoLayerDuration(target); target.trimStart = value; target.timeline.start = Math.max(0, end - videoLayerDuration(target)); })} />
      <RangeControl label="Out" value={layer.trimEnd} min={Math.min(duration, layer.trimStart + 0.1)} max={Math.max(duration, layer.trimStart + 0.1)} step={0.01} display={(value) => `${value.toFixed(2)}s`} defaultValue={duration} disabled={layer.locked} onChange={(value) => patchTrim("Trim end", (target) => { target.trimEnd = value; })} />
      <div className="select-row"><span className="control-label">Original</span><span className="inspector-kicker">{asset && assetAvailable ? `${asset.width} × ${asset.height} · ${duration.toFixed(2)}s` : "Missing media"}</span></div>
      {!assetAvailable && <div className="missing-source-action"><span>Source unavailable. Your layer placement, crop, effects, and animation stay saved.</span><button type="button" className="small-action" onClick={onRelink}>Relink source</button></div>}
      <div className="source-replace-row"><button type="button" className="small-action" onClick={onReplace} disabled={layer.locked}><Scissors size={13} /> {assetAvailable ? "Replace source" : "Replace missing source"}</button><span>{assetAvailable ? "Keeps this layer's edit; other layers keep the original." : "Choose a new source and review its duration."}</span></div>
      <div className="audio-capability"><Volume2 size={13} /><span>{audioLabel(audio?.status)}</span></div>
    </section>
  );
}

function clipTimingSummary(layer: VideoLayer): string {
  if (layer.playback.freeze) return `Freeze · ${layer.playback.freeze.duration.toFixed(2)}s`;
  if (layer.playback.rampEnabled) return `Speed ramp · ${videoLayerDuration(layer).toFixed(2)}s`;
  return `${layer.playback.speed.toFixed(2)}×${layer.playback.reverse ? " reverse" : ""} · ${videoLayerDuration(layer).toFixed(2)}s`;
}

function ClipTimingSection({ layer, currentProjectTime, onPatch }: { layer: VideoLayer; currentTime: number; currentProjectTime: number; onPatch: (label: string, patch: (layer: BendLayer) => void) => void }) {
  const commit = useEditorStore((state) => state.commit);
  const duration = videoLayerDuration(layer);
  const playback = layer.playback;
  const rampPoints = normalizeSpeedRampPoints(playback.rampPoints);
  // Speed, freeze, and ramp edits extend/shorten the magnetic primary
  // sequence, so following clips close the resulting gap/overlap in the same
  // undo step instead of leaving a silent blank stretch.
  const setPlayback = (label: string, patch: (layer: VideoLayer) => void) => {
    const current = useEditorStore.getState().project;
    if (!current) return;
    const source = current.layers.find((candidate): candidate is VideoLayer => candidate.kind === "video" && candidate.id === layer.id);
    if (!source) return;
    const beforeEnd = source.timeline.start + videoLayerDuration(source);
    commit(label, (draft) => {
      const target = draft.layers.find((candidate): candidate is VideoLayer => candidate.kind === "video" && candidate.id === layer.id);
      if (!target) return draft;
      patch(target);
      const afterEnd = target.timeline.start + videoLayerDuration(target);
      return shiftClipsAfter(draft, target.id, afterEnd - beforeEnd);
    });
  };
  const updateRampPoint = (index: number, field: "time" | "speed", value: number) => setPlayback("Adjust speed ramp", (target) => {
    const points = normalizeSpeedRampPoints(target.playback.rampPoints).map((point, pointIndex) => pointIndex === index
      ? { ...point, [field]: field === "speed" ? clampPlaybackSpeed(value) : Math.min(1, Math.max(0, value)) }
      : point);
    target.playback.rampPoints = normalizeSpeedRampPoints(points);
  });
  const addRampPoint = () => setPlayback("Add speed ramp point", (target) => {
    const points = normalizeSpeedRampPoints(target.playback.rampPoints);
    if (points.length >= 6) return;
    const index = Math.max(0, points.findIndex((point, i) => i > 0 && point.time > 0.5) - 1);
    const left = points[index];
    const right = points[Math.min(points.length - 1, index + 1)];
    const time = Number(((left.time + right.time) / 2).toFixed(3));
    const speed = Number(((left.speed + right.speed) / 2).toFixed(2));
    target.playback.rampPoints = normalizeSpeedRampPoints([...points, { time, speed }]);
  });
  const removeRampPoint = (index: number) => setPlayback("Remove speed ramp point", (target) => {
    const points = normalizeSpeedRampPoints(target.playback.rampPoints);
    if (points.length <= 2 || index <= 0 || index >= points.length - 1) return;
    target.playback.rampPoints = points.filter((_, pointIndex) => pointIndex !== index);
  });
  return <section className="inspector-section clip-timing-section" role="group" aria-label="Speed and time">
    <div className="inspector-section-heading"><div><h3 className="inspector-section-title">Speed &amp; time</h3><p className="inspector-help">Clip-relative speed changes the output duration. Source trims remain non-destructive.</p></div><span className="inspector-kicker">{duration.toFixed(2)}s out</span></div>
    {!playback.freeze && <RangeControl label="Speed" value={playback.speed} min={0.25} max={4} step={0.05} display={(value) => `${value.toFixed(2)}×`} defaultValue={1} disabled={layer.locked || playback.rampEnabled} onChange={(value) => setPlayback("Change clip speed", (target) => { target.playback.speed = clampPlaybackSpeed(value); })} />}
    <div className="toggle-row"><span className="control-label">Reverse playback</span><button type="button" className={playback.reverse ? "toggle is-on" : "toggle"} aria-label="Toggle reverse playback" aria-pressed={playback.reverse} disabled={layer.locked || Boolean(playback.freeze)} onClick={() => setPlayback("Toggle reverse playback", (target) => { target.playback.reverse = !target.playback.reverse; })} /></div>
    <div className="clip-time-actions">
      <button type="button" className="small-action" disabled={layer.locked} onClick={() => {
        const sourceTime = sourceTimeForVideoLayer(layer, Math.max(0, Math.min(duration - 0.001, currentProjectTime - layer.timeline.start)));
        setPlayback("Freeze current frame", (target) => { target.playback.freeze = { sourceTime, duration: Math.min(3, Math.max(0.5, duration)) }; });
      }}><span aria-hidden="true">❄</span> Freeze current frame</button>
      {playback.freeze && <button type="button" className="small-action" disabled={layer.locked} onClick={() => setPlayback("Unfreeze frame", (target) => { target.playback.freeze = null; })}>Unfreeze</button>}
    </div>
    {playback.freeze && <RangeControl label="Freeze for" value={playback.freeze.duration} min={0.1} max={30} step={0.1} display={(value) => `${value.toFixed(1)}s`} defaultValue={Math.min(3, duration)} disabled={layer.locked} onChange={(value) => setPlayback("Change freeze duration", (target) => { if (target.playback.freeze) target.playback.freeze.duration = value; })} />}
    <div className="toggle-row"><span className="control-label">Speed ramp</span><button type="button" className={playback.rampEnabled ? "toggle is-on" : "toggle"} aria-label="Toggle speed ramp" aria-pressed={playback.rampEnabled} disabled={layer.locked || Boolean(playback.freeze)} onClick={() => setPlayback("Toggle speed ramp", (target) => {
      target.playback.rampEnabled = !target.playback.rampEnabled;
      if (target.playback.rampEnabled) target.playback.rampPoints = [{ time: 0, speed: target.playback.speed }, { time: 0.5, speed: clampPlaybackSpeed(target.playback.speed * 0.5) }, { time: 1, speed: target.playback.speed }];
    })} /></div>
    {playback.rampEnabled && <div className="speed-ramp">
      <p className="inspector-fineprint">Two to six control points. Values are speeds along the clip; the source mapping remains monotonic and deterministic.</p>
      {rampPoints.map((point, index) => <div className="speed-ramp-point" key={`${index}-${point.time}`}>
        <span>{index === 0 ? "Start" : index === rampPoints.length - 1 ? "End" : `P${index + 1}`}</span>
        {index > 0 && index < rampPoints.length - 1 && <label>Pos <input type="number" min={0} max={1} step={0.05} value={Number(point.time.toFixed(2))} disabled={layer.locked} onChange={(event) => updateRampPoint(index, "time", Number(event.target.value))} aria-label={`Ramp point ${index + 1} position`} /></label>}
        <label>Speed <input type="number" min={0.25} max={4} step={0.05} value={Number(point.speed.toFixed(2))} disabled={layer.locked} onChange={(event) => updateRampPoint(index, "speed", Number(event.target.value))} aria-label={`Ramp point ${index + 1} speed`} /></label>
        {index > 0 && index < rampPoints.length - 1 && <button type="button" className="small-action" disabled={layer.locked} onClick={() => removeRampPoint(index)} aria-label={`Remove ramp point ${index + 1}`}>×</button>}
      </div>)}
      <button type="button" className="small-action" disabled={layer.locked || rampPoints.length >= 6} onClick={addRampPoint}><Plus size={12} /> Add ramp point</button>
    </div>}
    <RangeControl label="Sequence start" value={layer.timeline.start} min={0} max={Math.max(layer.timeline.start, currentProjectTime + 30)} step={0.01} display={(value) => `${value.toFixed(2)}s`} defaultValue={0} disabled={layer.locked} onChange={(value) => onPatch("Move clip in sequence", (target) => { if (target.kind === "video") target.timeline.start = value; })} />
    <p className="inspector-fineprint">Speed changes resample clip audio. Audio pitch preservation is not claimed; freeze-frame audio is silent.</p>
  </section>;
}

function TransitionSection({ project, layer }: { project: BendProject; layer: VideoLayer }) {
  const commit = useEditorStore((state) => state.commit);
  const previous = previousClipFor(project, layer.id);
  const existing = layer.transitionIn;
  const [type, setType] = useState<ClipTransitionType>(existing?.type ?? "crossfade");
  const [duration, setDuration] = useState(existing?.duration ?? 0.6);
  const [direction, setDirection] = useState<ClipTransitionDirection>(existing?.direction ?? "left");
  const [intensity, setIntensity] = useState(existing?.intensity ?? 0.55);
  const [easing, setEasing] = useState<AnimationEasing>(existing?.easing ?? "ease-in-out");
  const [message, setMessage] = useState<string | null>(null);
  const definition = getTransitionDefinition(type);
  useEffect(() => {
    setType(existing?.type ?? "crossfade");
    setDuration(existing?.duration ?? 0.6);
    setDirection(existing?.direction ?? "left");
    setIntensity(existing?.intensity ?? 0.55);
    setEasing(existing?.easing ?? "ease-in-out");
  }, [existing?.id, existing?.type, existing?.duration, existing?.direction, existing?.intensity, existing?.easing]);
  if (!previous) return <section className="inspector-section"><p className="inspector-help">Add or move a clip before this one on V1 to create an incoming transition. The first clip cannot have a transition in.</p></section>;
  const maxDuration = Math.max(0.1, Math.min(3, previous.timeline.duration * 0.8, layer.timeline.duration * 0.8));
  const effectiveDuration = Math.min(duration, maxDuration);
  const changeType = (nextType: ClipTransitionType) => {
    const previousDefault = definition.defaultDuration;
    setType(nextType);
    if (Math.abs(duration - previousDefault) < 0.001) setDuration(getTransitionDefinition(nextType).defaultDuration);
  };
  const apply = () => {
    try {
      commit("Apply clip transition", (draft) => applyTransition(draft, layer.id, { type, duration: effectiveDuration, direction, intensity, easing }));
      setMessage(`${definition.name} applied over ${effectiveDuration.toFixed(2)}s of genuine clip overlap.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The transition could not be applied.");
    }
  };
  const remove = () => {
    try {
      commit("Remove clip transition", (draft) => removeTransition(draft, layer.id));
      setMessage("Transition removed and the sequence overlap closed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The transition could not be removed.");
    }
  };
  return <section className="inspector-section transition-section" role="group" aria-label="Incoming transition">
    <p className="inspector-help">From <strong>{previous.name}</strong>. BEND evaluates both clips inside their real overlap; it never invents hidden source frames.</p>
    <div className="select-row"><label htmlFor={`${layer.id}-transition-type`}>Type</label><select id={`${layer.id}-transition-type`} className="inspector-select" value={type} onChange={(event) => changeType(event.target.value as ClipTransitionType)}>{TRANSITION_DEFINITIONS.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select></div>
    <p className="inspector-fineprint">{definition.description}</p>
    <RangeControl label="Duration" value={effectiveDuration} min={0.1} max={maxDuration} step={0.05} display={(value) => `${value.toFixed(2)}s`} defaultValue={definition.defaultDuration} onChange={setDuration} />
    <p className="inspector-fineprint">Available overlap between these two clips: up to {maxDuration.toFixed(2)}s. The sequence shortens by the transition duration.</p>
    {definition.supportsDirection && <div className="select-row"><label htmlFor={`${layer.id}-transition-direction`}>Direction</label><select id={`${layer.id}-transition-direction`} className="inspector-select" value={direction} onChange={(event) => setDirection(event.target.value as ClipTransitionDirection)}>{(['left', 'right', 'up', 'down'] as ClipTransitionDirection[]).map((candidate) => <option key={candidate} value={candidate}>{transitionDirectionLabel(candidate)}</option>)}</select></div>}
    <RangeControl label="Intensity" value={intensity} min={0} max={1} step={0.01} display={(value) => `${Math.round(value * 100)}%`} defaultValue={0.55} onChange={setIntensity} />
    <div className="select-row"><label htmlFor={`${layer.id}-transition-easing`}>Easing</label><select id={`${layer.id}-transition-easing`} className="inspector-select" value={easing} onChange={(event) => setEasing(event.target.value as AnimationEasing)}>{EASING_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
    <div className="clip-time-actions"><button type="button" className="small-action is-primary" disabled={layer.locked} onClick={apply}>{existing ? "Update transition" : "Apply transition"}</button>{existing && <button type="button" className="small-action" disabled={layer.locked} onClick={remove}>Remove</button>}</div>
    {message && <p className="inspector-fineprint" role="status">{message}</p>}
    <p className="inspector-fineprint">Audio crossfades follow the same curve. Transitions use actual overlap and shorten the sequence by the overlap duration.</p>
  </section>;
}

function ClipAudioSection({ layer, project, onPatch }: { layer: VideoLayer; project: BendProject; onPatch: (label: string, patch: (layer: BendLayer) => void) => void }) {
  const asset = project.assets[layer.assetId];
  const duration = videoLayerDuration(layer);
  const muted = layer.muted || !layer.audio.enabled;
  const patchAudio = (label: string, patch: (layer: VideoLayer) => void) => onPatch(label, (target) => { if (target.kind === "video") patch(target); });
  return <section className="inspector-section clip-audio-section" role="group" aria-label="Clip audio">
    <div className="toggle-row"><span className="control-label"><Volume2 size={13} /> Use clip audio</span><button type="button" className={!muted ? "toggle is-on" : "toggle"} aria-label="Enable clip audio" aria-pressed={!muted} disabled={layer.locked} onClick={() => patchAudio("Toggle clip audio", (target) => { target.audio.enabled = !layer.audio.enabled; target.muted = false; })} /></div>
    <RangeControl label="Gain" value={layer.audio.gainDb} min={-60} max={12} step={0.5} display={(value) => `${value.toFixed(1)} dB`} defaultValue={0} disabled={layer.locked || muted} onChange={(value) => patchAudio("Change clip gain", (target) => { target.audio.gainDb = value; })} />
    <RangeControl label="Audio fade in" value={Math.min(layer.audio.fadeIn, duration)} min={0} max={duration} step={0.05} display={(value) => `${value.toFixed(2)}s`} defaultValue={0} disabled={layer.locked || muted} onChange={(value) => patchAudio("Change clip fade in", (target) => { target.audio.fadeIn = value; })} />
    <RangeControl label="Audio fade out" value={Math.min(layer.audio.fadeOut, duration)} min={0} max={duration} step={0.05} display={(value) => `${value.toFixed(2)}s`} defaultValue={0} disabled={layer.locked || muted} onChange={(value) => patchAudio("Change clip fade out", (target) => { target.audio.fadeOut = value; })} />
    <div className="audio-capability"><Volume2 size={13} /><span>{asset?.audio?.status === "available" ? "Decodable source audio · mixed on export" : audioLabel(asset?.audio?.status)}</span></div>
    <p className="inspector-fineprint">Clip audio follows trims, movement, splits, and transitions. Reverse audio is reversed; speed changes resample without pitch preservation.</p>
  </section>;
}

function WaveSection({ layer, currentTime, onPatch }: { layer: VideoLayer; currentTime: number; onPatch: (label: string, patch: (layer: BendLayer) => void) => void }) {
  return (
    <section className="inspector-section" role="group" aria-label="Wave Displacement">
      <div className="toggle-row"><span className="control-label"><Wand2 size={14} /> Wave Displacement</span><button type="button" className={layer.wave.enabled ? "toggle is-on" : "toggle"} aria-label="Toggle Wave Displacement" aria-pressed={layer.wave.enabled} disabled={layer.locked} onClick={() => onPatch("Toggle Wave Displacement", (target) => { if (target.kind === "video") target.wave.enabled = !target.wave.enabled; })} /></div>
      {layer.wave.enabled && <div style={{ marginTop: 16 }}>
        <AnimatedRangeControl layer={layer} currentTime={currentTime} property="wave.intensity" label="Intensity" display={(value) => `${Math.round(value * 100)}%`} onPatch={onPatch} />
        <AnimatedRangeControl layer={layer} currentTime={currentTime} property="wave.frequency" label="Frequency" display={(value) => value.toFixed(1)} onPatch={onPatch} />
        <AnimatedRangeControl layer={layer} currentTime={currentTime} property="wave.speed" label="Speed" display={(value) => value.toFixed(2)} onPatch={onPatch} />
        <AnimatedRangeControl layer={layer} currentTime={currentTime} property="wave.direction" label="Direction" display={(value) => `${Math.round(value)}°`} onPatch={onPatch} />
        <AnimatedRangeControl layer={layer} currentTime={currentTime} property="wave.phase" label="Phase" display={(value) => `${Math.round(value)}°`} onPatch={onPatch} />
      </div>}
    </section>
  );
}

function EffectsSection({ layer, currentTime, selectedEffectId, onSelect, onPatch, compareActive, onCompareChange }: { layer: BendLayer; currentTime: number; selectedEffectId: string | null; onSelect: (id: string | null) => void; onPatch: (label: string, patch: (layer: BendLayer) => void) => void; compareActive: boolean; onCompareChange: (active: boolean) => void }) {
  const clipboard = useEditorStore((state) => state.effectClipboard);
  const setEffectClipboard = useEditorStore((state) => state.setEffectClipboard);
  const [message, setMessage] = useState<string | null>(null);
  const [strength, setStrength] = useState<VariationStrength>("moderate");
  const [variationSeed, setVariationSeed] = useState("");
  const selected = layer.effects.find((effect) => effect.instanceId === selectedEffectId) ?? null;
  const addEffect = (id: TemporalEffectId) => {
    const effect = createTemporalEffect(id);
    if (layer.effects.some((candidate) => candidate.id === id)) {
      setMessage(`${getTemporalEffectDefinition(id).name} is already in this stack. Each layer holds one of each effect type.`);
      return;
    }
    const next = [...layer.effects];
    const feedbackIndex = next.findIndex((candidate) => candidate.id === "frame-feedback");
    if (id === "frame-feedback" || feedbackIndex < 0) next.push(effect);
    else next.splice(feedbackIndex, 0, effect);
    const support = isSupportedTemporalStack(next.filter((candidate) => candidate.enabled));
    if (!support.supported) {
      setMessage(support.reason ?? "This temporal effect order cannot be rendered.");
      return;
    }
    onPatch(`Add ${getTemporalEffectDefinition(id).name}`, (target) => { target.effects = next; });
    onSelect(effect.instanceId);
    setMessage(id === "frame-feedback" ? null : feedbackIndex >= 0 ? "Added before Frame Feedback so cue replay remains the final pass." : null);
  };
  const removeEffect = (instanceId: string) => {
    onPatch("Remove temporal effect", (target) => {
      target.effects = target.effects.filter((effect) => effect.instanceId !== instanceId);
      target.animation = { version: 1, tracks: target.animation.tracks.filter((track) => !track.property.startsWith(`effects.${instanceId}.`)) };
    });
    onSelect(null);
  };
  const moveEffect = (instanceId: string, direction: -1 | 1) => {
    const index = layer.effects.findIndex((effect) => effect.instanceId === instanceId);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= layer.effects.length) return;
    const next = [...layer.effects];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    if (!isSupportedTemporalStack(next.filter((effect) => effect.enabled)).supported) {
      setMessage("Frame Feedback must remain the final temporal pass.");
      return;
    }
    onPatch(direction > 0 ? "Move effect down" : "Move effect up", (target) => { target.effects = next; });
  };
  const resetEffect = (instanceId: string) => {
    const current = layer.effects.find((effect) => effect.instanceId === instanceId);
    if (!current) return;
    onPatch(`Reset ${getTemporalEffectDefinition(current.id).name}`, (target) => { target.effects = target.effects.map((effect) => effect.instanceId === instanceId ? { ...createTemporalEffect(effect.id), instanceId: effect.instanceId } : effect); });
  };
  const copyStack = () => {
    const copied = createEffectStackClipboard(layer);
    if (!copied) {
      setMessage("This layer has no effects to copy.");
      return;
    }
    setEffectClipboard(copied);
    setMessage(`Copied ${describeEffectStackClipboard(copied)}.`);
  };
  const pasteStack = (mode: EffectStackPasteMode) => {
    const result = pasteEffectStack(layer, clipboard, mode);
    if (!result.ok) {
      setMessage(result.reason);
      return;
    }
    onPatch(mode === "append" ? "Append effect stack" : "Replace effect stack", (target) => {
      target.effects = result.effects;
      target.animation = result.animation;
    });
    onSelect(result.addedEffectIds[0] ?? null);
    setMessage(result.message);
  };
  const applyVariation = (seedValue: string, effectInstanceId?: string) => {
    const seed = seedValue.trim() || `BEND-VARY-${Date.now().toString(36)}`;
    const result = randomizeLayerParameters(layer, { seed, strength, target: "effects", effectInstanceId });
    if (!result.ok) {
      setMessage(result.reason);
      return;
    }
    onPatch("Vary effect parameters", (target) => {
      const varied = result.layer as BendLayer;
      target.effects = varied.effects;
      target.animation = varied.animation;
    });
    setVariationSeed(seed);
    setMessage(result.message);
  };
  const startCompare = () => onCompareChange(true);
  const stopCompare = () => onCompareChange(false);
  return <section className="inspector-section temporal-effects-section">
    <div className="inspector-section-heading"><div><h3 className="inspector-section-title">Temporal effects</h3><p className="inspector-help">These effects sample moments from the layer. Wave Displacement is applied after this stack.</p></div><span className="inspector-kicker">{layer.effects.length} active</span></div>
    <div className="effect-compare-bar">
      <button
        type="button"
        className={compareActive ? "compare-hold is-active" : "compare-hold"}
        aria-pressed={compareActive}
        aria-label={`Hold to compare original source and edited result for ${layer.name}`}
        title={`Hold to compare original source vs ${layer.name} treatment`}
        onPointerDown={(event) => { event.preventDefault(); startCompare(); }}
        onPointerUp={stopCompare}
        onPointerCancel={stopCompare}
        onPointerLeave={stopCompare}
        onKeyDown={(event) => { if ((event.key === " " || event.key === "Enter") && !event.repeat) { event.preventDefault(); startCompare(); } }}
        onKeyUp={(event) => { if (event.key === " " || event.key === "Enter") { event.preventDefault(); stopCompare(); } }}
        onBlur={stopCompare}
      ><Eye size={14} /><span><strong>{compareActive ? "Showing original source" : "Hold to compare"}</strong><small>{layer.name} · effects, crop, color, mask and blend bypassed</small></span></button>
      <span className="compare-hint">Release to return. Not saved, not exported.</span>
    </div>
    <div className="effect-stack-toolbar" role="group" aria-label="Effect stack clipboard">
      <button type="button" className="small-action" onClick={copyStack} disabled={layer.effects.length === 0}><Copy size={12} /> Copy stack</button>
      <button type="button" className="small-action" onClick={() => pasteStack("append")} disabled={!clipboard || layer.locked}>Paste append</button>
      <button type="button" className="small-action" onClick={() => pasteStack("replace")} disabled={!clipboard || layer.locked}>Paste replace</button>
      <span className="effect-clipboard-summary">{describeEffectStackClipboard(clipboard)}</span>
    </div>
    {message && <p className="effect-paste-message" role="status">{message}</p>}
    <details className="variation-controls">
      <summary><span><strong>Variation</strong><small>Reproducible seeded changes</small></span><ChevronDown size={14} /></summary>
      <div className="variation-body">
        <div className="variation-row"><label htmlFor={`${layer.id}-variation-strength`}>Strength</label><select id={`${layer.id}-variation-strength`} className="inspector-select" value={strength} onChange={(event) => setStrength(event.target.value as VariationStrength)}><option value="subtle">Subtle</option><option value="moderate">Moderate</option><option value="wild">Wild</option></select></div>
        <div className="variation-row"><label htmlFor={`${layer.id}-variation-seed`}>Seed</label><input id={`${layer.id}-variation-seed`} className="seed-input" value={variationSeed} placeholder="Generate on first variation" onChange={(event) => setVariationSeed(event.target.value)} /></div>
        <div className="variation-actions"><button type="button" className="small-action" onClick={() => applyVariation(variationSeed)} disabled={layer.effects.length === 0 || layer.locked}><Dices size={12} /> Vary stack</button>{selected && <button type="button" className="small-action" onClick={() => applyVariation(variationSeed, selected.instanceId)} disabled={layer.locked}>Vary selected</button>}{variationSeed && <button type="button" className="small-action" onClick={() => applyVariation(variationSeed)} disabled={layer.locked}>Reapply seed</button>}</div>
        <p className="inspector-fineprint">Same seed, strength, and stack reproduce the same result. Durations, seeds, IDs, and structural metadata are excluded.</p>
      </div>
    </details>
    <div className="temporal-library" role="group" aria-label="Temporal effect library">
      <p className="effect-category-label">Time</p>
      {TEMPORAL_EFFECTS.filter((definition) => definition.category === "Time").map((definition) => <EffectLibraryItem key={definition.id} definition={definition} disabled={layer.locked} onAdd={() => addEffect(definition.id)} />)}
      <p className="effect-category-label">Feedback</p>
      {TEMPORAL_EFFECTS.filter((definition) => definition.category === "Feedback").map((definition) => <EffectLibraryItem key={definition.id} definition={definition} disabled={layer.locked} onAdd={() => addEffect(definition.id)} />)}
      {layer.kind === "video" && <button type="button" className={layer.wave.enabled ? "effect-library-item is-added" : "effect-library-item"} disabled={layer.locked} onClick={() => onPatch(layer.wave.enabled ? "Disable Wave Displacement" : "Enable Wave Displacement", (target) => { if (target.kind === "video") target.wave.enabled = !target.wave.enabled; })}><EffectThumbnail id="wave-displacement" /><span><strong>Wave Displacement</strong><small>Distort · {layer.wave.enabled ? "ON" : "ADD"}</small></span></button>}
    </div>
    <div className="effect-stack-heading"><h4>Layer stack</h4><span>top → output</span></div>
    <div className="temporal-stack" role="group" aria-label="Temporal effect stack">
      {layer.effects.length === 0 && <p className="inspector-help">Add a time effect or feedback pass. The original layer stays untouched.</p>}
      {layer.effects.map((effect, index) => <div className={effect.instanceId === selectedEffectId ? "temporal-stack-row is-selected" : "temporal-stack-row"} key={effect.instanceId}>
        <button type="button" className="temporal-stack-select" onClick={() => onSelect(effect.instanceId)} aria-pressed={effect.instanceId === selectedEffectId}><GripVertical size={13} /><span><strong>{getTemporalEffectDefinition(effect.id).name}</strong><small>{effect.enabled ? "Enabled" : "Bypassed"} · {getTemporalEffectDefinition(effect.id).mode}</small></span></button>
        <button type="button" className="layer-icon" aria-label={`${effect.enabled ? "Bypass" : "Enable"} ${getTemporalEffectDefinition(effect.id).name} in stack`} disabled={layer.locked} onClick={() => onPatch(`${effect.enabled ? "Disable" : "Enable"} effect`, (target) => { const found = target.effects.find((candidate) => candidate.instanceId === effect.instanceId); if (found) found.enabled = !found.enabled; })}>{effect.enabled ? <Eye size={13} /> : <EyeOff size={13} />}</button>
        <button type="button" className="layer-icon" aria-label={`Move ${getTemporalEffectDefinition(effect.id).name} up`} onClick={() => moveEffect(effect.instanceId, -1)} disabled={layer.locked || index === 0}><ArrowUp size={13} /></button>
        <button type="button" className="layer-icon" aria-label={`Move ${getTemporalEffectDefinition(effect.id).name} down`} onClick={() => moveEffect(effect.instanceId, 1)} disabled={layer.locked || index === layer.effects.length - 1}><ArrowDown size={13} /></button>
        <button type="button" className="layer-icon is-danger" aria-label={`Remove ${getTemporalEffectDefinition(effect.id).name}`} disabled={layer.locked} onClick={() => removeEffect(effect.instanceId)}><Trash2 size={13} /></button>
      </div>)}
    </div>
    {selected && <TemporalEffectControls layer={layer} currentTime={currentTime} effect={selected} onPatch={(label, patch) => onPatch(label, (target) => { const found = target.effects.find((candidate) => candidate.instanceId === selected.instanceId); if (found) patch(found); })} onLayerPatch={onPatch} onReset={() => resetEffect(selected.instanceId)} />}
    {!isSupportedTemporalStack(layer.effects.filter((effect) => effect.enabled)).supported && <p className="form-error">Frame Feedback must remain the last temporal pass. Move it to the bottom before rendering.</p>}
    {isHeavyTemporalStack(layer.effects) && <p className="export-policy is-warning" role="status">Heavy temporal stack: interactive preview automatically bounds echo, slice and feedback warm-up samples so the editor stays responsive. Export still renders the full stack at full quality and can take much longer.</p>}
  </section>;
}

function EffectLibraryItem({ definition, onAdd, disabled }: { definition: ReturnType<typeof getTemporalEffectDefinition>; onAdd: () => void; disabled?: boolean }) {
  return <button type="button" className="effect-library-item" onClick={onAdd} disabled={disabled}><EffectThumbnail id={definition.id} /><span><strong>{definition.name}</strong><small>{definition.description}</small><em>+ Add</em></span></button>;
}

function TemporalEffectControls({ layer, currentTime, effect, onPatch, onLayerPatch, onReset }: { layer: BendLayer; currentTime: number; effect: TemporalEffectInstance; onPatch: (label: string, patch: (effect: TemporalEffectInstance) => void) => void; onLayerPatch: (label: string, patch: (layer: BendLayer) => void) => void; onReset: () => void }) {
  const definition = getTemporalEffectDefinition(effect.id);
  const main = definition.parameters.filter((parameter) => !parameter.advanced);
  const advanced = definition.parameters.filter((parameter) => parameter.advanced);
  const renderParameter = (parameter: typeof definition.parameters[number]) => <TemporalParameterControl key={parameter.key} layer={layer} currentTime={currentTime} parameter={parameter} effect={effect} onChange={(value) => onPatch(`Adjust ${parameter.label}`, (target) => { (target as unknown as Record<string, unknown>)[parameter.key] = value; })} onLayerPatch={onLayerPatch} />;
  return <div className="temporal-controls" role="group" aria-label={`${definition.name} controls`}>
    <div className="temporal-controls-head"><div><h4>{definition.name}</h4><p>{definition.description}</p></div><button type="button" className={effect.enabled ? "toggle is-on" : "toggle"} aria-label={`${effect.enabled ? "Disable" : "Enable"} ${definition.name} effect`} aria-pressed={effect.enabled} disabled={layer.locked} onClick={() => onPatch(`${effect.enabled ? "Disable" : "Enable"} ${definition.name}`, (target) => { target.enabled = !target.enabled; })} /></div>
    <div className="preset-grid" role="group" aria-label={`${definition.name} preset`}>{definition.presets.map((preset) => <button type="button" className={effect.preset === preset.id ? "preset-button is-active" : "preset-button"} key={preset.id} aria-pressed={effect.preset === preset.id} disabled={layer.locked} onClick={() => onPatch(`Use ${preset.label}`, (target) => Object.assign(target, { ...createTemporalEffect(effect.id, preset.id), instanceId: target.instanceId, enabled: target.enabled }))}>{preset.label}</button>)}</div>
    <div className="temporal-main-controls">{main.map(renderParameter)}</div>
    {advanced.length > 0 && <details className="temporal-advanced"><summary>Advanced controls <ChevronDown size={13} /></summary><div>{advanced.map(renderParameter)}</div></details>}
    <button type="button" className="small-action temporal-reset" disabled={layer.locked} onClick={onReset}><RotateCcw size={13} /> Reset effect</button>
  </div>;
}

function TemporalParameterControl({ layer, currentTime, parameter, effect, onChange, onLayerPatch }: { layer: BendLayer; currentTime: number; parameter: ReturnType<typeof getTemporalEffectDefinition>["parameters"][number]; effect: TemporalEffectInstance; onChange: (value: number | string) => void; onLayerPatch: (label: string, patch: (layer: BendLayer) => void) => void }) {
  const value = (effect as unknown as Record<string, unknown>)[parameter.key];
  if (parameter.kind === "select" && (parameter.options?.length ?? 0) > 0) return <div className="select-row"><label htmlFor={`${effect.id}-${parameter.key}`}>{parameter.label}</label><select id={`${effect.id}-${parameter.key}`} className="inspector-select" value={String(value ?? "")} onChange={(event) => onChange(event.target.value)}>{parameter.options?.map((option) => <option key={option} value={option}>{option}</option>)}</select></div>;
  if (typeof value === "string") return <div className="select-row"><label htmlFor={`${effect.id}-${parameter.key}`}>{parameter.label}</label><input id={`${effect.id}-${parameter.key}`} className="seed-input" value={value} onChange={(event) => onChange(event.target.value)} /></div>;
  const numericValue = typeof value === "number" && Number.isFinite(value) ? value : parameter.min ?? 0;
  return <AnimatedRangeControl layer={layer} currentTime={currentTime} property={`effects.${effect.instanceId}.${parameter.key}`} label={parameter.label} display={(current) => formatTemporalParameterValue(parameter.key, current)} onPatch={onLayerPatch} fallbackValue={numericValue} />;
}

function EffectThumbnail({ id }: { id: TemporalEffectId | "wave-displacement" }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const width = canvas.width;
    const height = canvas.height;
    context.fillStyle = "#193438";
    context.fillRect(0, 0, width, height);
    context.strokeStyle = "#9ACCC5";
    context.fillStyle = "#DCEFEB";
    context.lineWidth = 2;
    if (id === "time-slice") {
      for (let index = 0; index < 8; index += 1) { context.globalAlpha = 0.2 + index * 0.08; context.fillRect((index % 4) * 22 + 4, (index % 2) * 23 + 8, 30, 20); }
    } else if (id === "channel-delay") {
      for (const [offset, color] of [[-5, "#B34F5C"], [0, "#9ACCC5"], [5, "#6F9B9D"]] as const) { context.strokeStyle = color; context.globalAlpha = 0.75; context.beginPath(); context.arc(51 + offset, 26, 17, 0, Math.PI * 2); context.stroke(); }
    } else if (id === "frame-feedback") {
      for (let index = 0; index < 4; index += 1) { context.globalAlpha = 0.24 + index * 0.12; context.strokeRect(19 + index * 7, 7 + index * 4, 62 - index * 14, 38 - index * 8); }
    } else {
      for (let index = 0; index < 5; index += 1) { context.globalAlpha = 0.18 + index * 0.12; context.beginPath(); context.arc(51 - index * 7, 27 + index * 2, 8 + index * 2, 0, Math.PI * 2); context.stroke(); }
    }
    context.globalAlpha = 1;
  }, [id]);
  return <canvas className="effect-thumbnail" ref={canvasRef} width={108} height={54} aria-hidden="true" />;
}

function GenerateWorkspace({ project, activeLayer, currentTime, onPatch, onAddGenerator }: { project: BendProject; activeLayer: BendLayer | null; currentTime: number; onPatch: (label: string, patch: (layer: BendLayer) => void) => void; onAddGenerator: (id: GeneratorId) => void }) {
  const activeGenerator = activeLayer?.kind === "procedural" ? activeLayer.generator.id : null;
  const selectGenerator = (id: GeneratorId) => {
    if (activeLayer?.kind === "procedural") {
      onPatch(`Switch to ${getGeneratorDefinition(id).name}`, (target) => {
        if (target.kind === "procedural") {
          target.generator = createGeneratorParams(id, undefined, target.generator.seed);
          target.name = getGeneratorDefinition(id).name;
        }
      });
    } else {
      onAddGenerator(id);
    }
  };
  return <div className="generator-workspace">
    <section className="inspector-section generator-library-section">
      <div className="inspector-section-heading"><div><h3 className="inspector-section-title">Generator library</h3><p className="inspector-help">Choose a moving background, then tune its look.</p></div><span className="inspector-kicker">4 systems</span></div>
      <div className="generator-library" role="group" aria-label="Procedural generator library">
        {GENERATOR_REGISTRY.map((definition) => <button type="button" className={activeGenerator === definition.id ? "generator-card is-active" : "generator-card"} aria-pressed={activeGenerator === definition.id} aria-label={`${definition.name} generator`} key={definition.id} onClick={() => selectGenerator(definition.id)}>
          <GeneratorThumbnail id={definition.id} />
          <span className="generator-card-copy"><strong>{definition.name}</strong><small>{definition.presets.length} presets · {definition.capabilities.renderMode === "stateful" ? "stateful" : "analytic"}</small></span>
        </button>)}
      </div>
    </section>
    {activeLayer?.kind === "procedural" ? <GeneratorSection layer={activeLayer} currentTime={currentTime} onPatch={onPatch} /> : <div className="empty-inspector generator-prompt">Select a generator above to add a procedural layer to the bottom of the stack.</div>}
    {activeLayer?.kind === "procedural" && <div className="generator-footnote">{project.layers.length > 1 ? "Moving backgrounds stay editable and render directly into the export." : "Liquid replays from its saved starting state when you scrub backward."}</div>}
  </div>;
}

function GeneratorSection({ layer, currentTime, onPatch }: { layer: ProceduralLayer; currentTime: number; onPatch: (label: string, patch: (layer: BendLayer) => void) => void }) {
  const [variationStrength, setVariationStrength] = useState<VariationStrength>("moderate");
  const [variationScope, setVariationScope] = useState<VariationScope>("all");
  const [variationSeed, setVariationSeed] = useState("");
  const [variationMessage, setVariationMessage] = useState<string | null>(null);
  const definition = getGeneratorDefinition(layer.generator.id);
  const grouped = definition.parameters.reduce<Record<string, GeneratorParameterDefinition[]>>((groups, parameter) => {
    (groups[parameter.group] ??= []).push(parameter);
    return groups;
  }, {});
  const patchGenerator = (label: string, patch: (generator: ProceduralGeneratorParams) => ProceduralGeneratorParams) => onPatch(label, (target) => {
    if (target.kind !== "procedural") return;
    const generator = patch(target.generator);
    target.generator = generator;
    target.timeline.duration = generator.duration;
  });
  const seedLabel = layer.generator.id === "signal-field" ? "Signal seed" : `${definition.name} seed`;
  const applyVariation = (seedValue: string) => {
    const seed = seedValue.trim() || randomSeed();
    const result = randomizeLayerParameters(layer, { seed, strength: variationStrength, scope: variationScope, target: "generator" });
    if (!result.ok) {
      setVariationMessage(result.reason);
      return;
    }
    const varied = result.layer as ProceduralLayer;
    onPatch("Vary generator parameters", (target) => {
      if (target.kind !== "procedural") return;
      target.generator = varied.generator;
      target.animation = varied.animation;
      target.timeline.duration = varied.generator.duration;
    });
    setVariationSeed(seed);
    setVariationMessage(result.message);
  };
  return <section className="inspector-section generator-controls" role="group" aria-label={`${definition.name} generator controls`}>
    <div className="generator-controls-head"><div><h3 className="inspector-section-title">{definition.name} controls</h3><p className="inspector-help">{definition.description}</p></div><span className="generator-mode">{definition.capabilities.renderMode === "stateful" ? "Stateful" : "Analytic"}</span></div>
    <div className="preset-grid" role="group" aria-label={`${definition.name} preset`}>
      {definition.presets.map((preset) => <button type="button" className={layer.generator.preset === preset.id ? "preset-button is-active" : "preset-button"} aria-pressed={layer.generator.preset === preset.id} key={preset.id} title={preset.description} disabled={layer.locked} onClick={() => patchGenerator(`Use ${preset.label}`, (generator) => createGeneratorParams(generator.id, preset.id, generator.seed))}>{preset.label}</button>)}
    </div>
    <div className="seed-row"><input className="seed-input" value={layer.generator.seed} aria-label={seedLabel} disabled={layer.locked} onChange={(event) => patchGenerator("Change seed", (generator) => getGeneratorDefinition(generator.id).normalize({ ...generator, seed: event.target.value }))} /><button className="small-action" disabled={layer.locked} onClick={() => patchGenerator("Randomize seed", (generator) => getGeneratorDefinition(generator.id).normalize({ ...generator, seed: randomSeed() }))}><Dices size={13} /> Randomize</button></div>
    <details className="variation-controls generator-variation">
      <summary><span><strong>Create a variation</strong><small>Seeded, bounded, undoable</small></span><ChevronDown size={14} /></summary>
      <div className="variation-body">
        <div className="variation-row"><label htmlFor={`${layer.id}-generator-strength`}>Strength</label><select id={`${layer.id}-generator-strength`} className="inspector-select" value={variationStrength} onChange={(event) => setVariationStrength(event.target.value as VariationStrength)}><option value="subtle">Subtle</option><option value="moderate">Moderate</option><option value="wild">Wild</option></select></div>
        <div className="variation-row"><label htmlFor={`${layer.id}-generator-scope`}>Scope</label><select id={`${layer.id}-generator-scope`} className="inspector-select" value={variationScope} onChange={(event) => setVariationScope(event.target.value as VariationScope)}><option value="all">All parameters</option><option value="motion">Motion</option><option value="structure">Structure</option><option value="appearance">Appearance</option></select></div>
        <div className="variation-row"><label htmlFor={`${layer.id}-generator-seed`}>Seed</label><input id={`${layer.id}-generator-seed`} className="seed-input" value={variationSeed} placeholder="Generate on first variation" onChange={(event) => setVariationSeed(event.target.value)} /></div>
        <div className="variation-actions"><button type="button" className="small-action" onClick={() => applyVariation(variationSeed)} disabled={layer.locked}><Dices size={12} /> Vary</button>{variationSeed && <button type="button" className="small-action" onClick={() => applyVariation(variationSeed)} disabled={layer.locked}>Reapply seed</button>}</div>
        {variationMessage && <p className="effect-paste-message" role="status">{variationMessage}</p>}
        <p className="inspector-fineprint">Durations, source seeds, IDs, and structure are excluded. Animated values for a varied parameter move with it.</p>
      </div>
    </details>
    {(Object.keys(grouped) as Array<keyof typeof grouped>).map((group) => <div className="generator-group" key={group}><h4>{group}</h4>{grouped[group]?.map((parameter) => <GeneratorParameterControl key={parameter.key} layer={layer} currentTime={currentTime} parameter={parameter} generator={layer.generator} onChange={(value) => patchGenerator(`${parameter.label}`, (generator) => getGeneratorDefinition(generator.id).normalize({ ...generator, [parameter.key]: value }))} onLayerPatch={onPatch} />)}</div>)}
    <p className="generator-capability">Loop: {definition.capabilities.loop === "supported" ? "periodic in output" : definition.capabilities.loop === "approximate" ? "approximate" : "no periodic cycle"} · Seeded output · Undoable controls</p>
  </section>;
}

function GeneratorParameterControl({ layer, currentTime, parameter, generator, onChange, onLayerPatch }: { layer: ProceduralLayer; currentTime: number; parameter: GeneratorParameterDefinition; generator: ProceduralGeneratorParams; onChange: (value: number | string) => void; onLayerPatch: (label: string, patch: (layer: BendLayer) => void) => void }) {
  const value = (generator as unknown as Record<string, unknown>)[parameter.key];
  if (parameter.type === "select") {
    return <div className="select-row"><label htmlFor={`${generator.id}-${parameter.key}`}>{parameter.label}</label><select id={`${generator.id}-${parameter.key}`} className="inspector-select" value={String(value ?? "")} onChange={(event) => onChange(event.target.value)}>{parameter.options?.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></div>;
  }
  const numericValue = typeof value === "number" && Number.isFinite(value) ? value : parameter.min ?? 0;
  const defaultValue = parameter.min ?? 0;
  if (parameter.key === "duration") return <RangeControl label={parameter.label} value={numericValue} min={parameter.min ?? 0} max={parameter.max ?? 1} step={parameter.step ?? 0.01} display={(current) => formatParameterValue(parameter.key, current)} defaultValue={defaultValue} disabled={layer.locked} onChange={(value) => onChange(value)} />;
  return <AnimatedRangeControl layer={layer} currentTime={currentTime} property={`generator.${parameter.key}`} label={parameter.label} display={(current) => formatParameterValue(parameter.key, current)} onPatch={onLayerPatch} fallbackValue={numericValue} />;
}

function GeneratorThumbnail({ id }: { id: GeneratorId }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const width = canvas.width;
    const height = canvas.height;
    context.fillStyle = "#193438";
    context.fillRect(0, 0, width, height);
    if (id === "liquid") drawLiquidThumbnail(context, width, height);
    if (id === "flow") drawFlowThumbnail(context, width, height);
    if (id === "refraction") drawRefractionThumbnail(context, width, height);
    if (id === "signal-field") drawSignalThumbnail(context, width, height);
  }, [id]);
  return <canvas className="generator-thumbnail" ref={canvasRef} width={144} height={82} aria-hidden="true" />;
}

function drawSignalThumbnail(context: CanvasRenderingContext2D, width: number, height: number): void {
  for (let row = 0; row < 34; row += 1) {
    context.beginPath();
    for (let x = 0; x <= width; x += 4) {
      const y = height * 0.5 + Math.sin(x * 0.06 + row * 0.5) * 12 + Math.cos(x * 0.025 - row) * 7 + row * 0.8;
      x === 0 ? context.moveTo(x, y) : context.lineTo(x, y);
    }
    context.strokeStyle = `rgba(199, 255, 91, ${0.02 + row / 900})`;
    context.stroke();
  }
}

function drawLiquidThumbnail(context: CanvasRenderingContext2D, width: number, height: number): void {
  for (let index = 0; index < 8; index += 1) {
    const x = width * (0.18 + (index % 4) * 0.2);
    const y = height * (0.35 + Math.sin(index * 1.8) * 0.2);
    const gradient = context.createRadialGradient(x, y, 2, x, y, 30 + index * 3);
    gradient.addColorStop(0, `rgba(245,243,239,${0.52 - index * 0.035})`);
    gradient.addColorStop(1, "rgba(79,134,151,0)");
    context.fillStyle = gradient;
    context.beginPath();
    context.ellipse(x, y, 20 + index * 2, 13 + index, index * 0.18, 0, Math.PI * 2);
    context.fill();
  }
}

function drawFlowThumbnail(context: CanvasRenderingContext2D, width: number, height: number): void {
  const params = createGeneratorParams("flow", "threads", "BEND-FLOW") as Extract<ProceduralGeneratorParams, { id: "flow" }>;
  for (let line = 0; line < 17; line += 1) {
    context.beginPath();
    let x = (line / 17) * width;
    let y = height * 0.05;
    context.moveTo(x, y);
    for (let step = 0; step < 22; step += 1) {
      const vector = sampleFlowVector(x / width, y / height, step * 0.05, params);
      x += vector.x * 3.6;
      y += 3.4 + vector.y * 2.2;
      context.lineTo(x, y);
    }
    context.strokeStyle = `rgba(183,220,212,${0.16 + (line % 4) * 0.04})`;
    context.lineWidth = line % 5 === 0 ? 1.4 : 0.7;
    context.stroke();
  }
}

function drawRefractionThumbnail(context: CanvasRenderingContext2D, width: number, height: number): void {
  const params = createGeneratorParams("refraction", "pool", "BEND-REFRACTION") as Extract<ProceduralGeneratorParams, { id: "refraction" }>;
  for (let row = 0; row < 18; row += 1) {
    context.beginPath();
    for (let x = 0; x <= width; x += 3) {
      const sample = sampleRefraction(x / width, row / 18, row * 0.08, params);
      const y = (row / 18) * height + sample.height * 6;
      x === 0 ? context.moveTo(x, y) : context.lineTo(x, y);
    }
    context.strokeStyle = `rgba(141,228,255,${0.14 + (row % 5) * 0.035})`;
    context.stroke();
  }
}

function formatParameterValue(key: string, value: number): string {
  if (["intensity", "opacity", "dyeAmount", "dyeDissipation", "turbulence", "particleDensity", "trailLength", "dispersion", "softness", "contrast"].includes(key)) return `${Math.round(value * 100)}%`;
  if (key === "duration") return `${value.toFixed(1)}s`;
  if (key === "direction") return `${Math.round(value)}°`;
  return Math.abs(value) >= 10 ? String(Math.round(value)) : value.toFixed(2);
}

function formatTemporalParameterValue(key: string, value: number): string {
  if (["decay", "opacity", "intensity", "blend", "feedbackAmount", "colorShift", "noise", "sliceJitter"].includes(key)) return `${Math.round(value * 100)}%`;
  if (["timeSpacing", "temporalOffset", "redDelay", "greenDelay", "blueDelay", "temporalRange"].includes(key)) return `${value.toFixed(2)}s`;
  if (["scale", "motionSpeed"].includes(key)) return `${value.toFixed(3)}×`;
  if (["rotation"].includes(key)) return `${value.toFixed(2)}°`;
  return Math.abs(value) >= 10 ? String(Math.round(value)) : value.toFixed(2);
}

function AnimatedRangeControl({ layer, currentTime, property, label, display, onPatch, fallbackValue }: { layer: BendLayer; currentTime: number; property: string; label: string; display: (value: number) => string; onPatch: (label: string, patch: (layer: BendLayer) => void) => void; fallbackValue?: number }) {
  const baseId = useId().replace(/:/g, "");
  const autoKey = useEditorStore((state) => state.autoKey);
  const definition = getPropertyDefinition(layer, property);
  if (!definition || definition.valueType !== "number") return null;
  const track = getAnimationTrack(layer, property);
  const evaluated = evaluateAnimatedProperty(layer, property, currentTime);
  const fallback = fallbackValue ?? Number(definition.defaultValue);
  const value = typeof evaluated === "number" && Number.isFinite(evaluated) ? evaluated : (Number.isFinite(fallback) ? fallback : 0);
  const min = definition.min ?? -1;
  const max = definition.max ?? 1;
  const step = definition.step ?? 0.01;
  const localTime = Math.min(Math.max(0, currentTime - layer.timeline.start), layer.timeline.duration);
  const keyframe = track?.keyframes.find((candidate) => Math.abs(candidate.time - localTime) < 0.0001);
  const rangeId = `${baseId}-range`;
  const valueId = `${baseId}-value`;
  const patchValue = (nextValue: number) => onPatch(`Adjust ${label}`, (target) => {
    if (autoKey) {
      target.animation = upsertKeyframe(target, property, localTime, nextValue);
    } else {
      Object.assign(target, setTargetValue(target, property, nextValue));
    }
  });
  const toggleKeyframe = () => onPatch(keyframe ? `Remove ${label} keyframe` : `Set ${label} keyframe`, (target) => {
    if (keyframe) target.animation = removeKeyframeAt(target.animation, property, localTime);
    else target.animation = upsertKeyframe(target, property, localTime, evaluateAnimatedProperty(target, property, currentTime));
  });
  const toggleModulator = () => onPatch(track?.modulator ? `Remove ${label} modulation` : `Add ${label} modulation`, (target) => {
    let animation = target.animation;
    if (!getAnimationTrack(target, property)) animation = upsertKeyframe(target, property, localTime, evaluateAnimatedProperty(target, property, currentTime));
    animation = {
      version: 1,
      tracks: animation.tracks.map((candidate) => candidate.property === property
        ? { ...candidate, modulator: candidate.modulator ? undefined : createDefaultModulator() }
        : candidate),
    };
    target.animation = animation;
  });
  const toggleAnimation = () => {
    if (!track) return;
    onPatch(`${track.enabled ? "Disable" : "Enable"} ${label} animation`, (target) => {
      target.animation = { version: 1, tracks: target.animation.tracks.map((candidate) => candidate.property === property ? { ...candidate, enabled: !candidate.enabled } : candidate) };
    });
  };
  return <>
    <div className={track ? "control-row animated-control is-animated" : "control-row animated-control"}>
      <label htmlFor={rangeId}>{label}</label>
      <input id={rangeId} className="control-range" type="range" min={min} max={max} step={step} value={value} aria-valuetext={display(value)} disabled={layer.locked} onChange={(event) => patchValue(Number(event.target.value))} onDoubleClick={() => patchValue(Number(definition.defaultValue) || 0)} />
      <input id={valueId} className="value-input" type="number" min={min} max={max} step={step} value={Number(value.toFixed(3))} aria-label={`${label} value`} disabled={layer.locked} onChange={(event) => patchValue(Number(event.target.value))} onDoubleClick={() => patchValue(Number(definition.defaultValue) || 0)} />
      {track ? <button type="button" className={track.enabled ? "animation-toggle is-on" : "animation-toggle"} aria-label={`${track.enabled ? "Disable" : "Enable"} animation for ${label}`} aria-pressed={track.enabled} disabled={layer.locked} onClick={toggleAnimation}>A</button> : <span className="animation-toggle-spacer" aria-hidden="true" />}
       <button type="button" className={keyframe ? "keyframe-toggle is-set" : "keyframe-toggle"} aria-label={`${keyframe ? "Remove" : "Set"} keyframe for ${label}`} aria-pressed={Boolean(keyframe)} title={`${keyframe ? "Remove" : "Set"} keyframe · ${label}`} disabled={layer.locked} onClick={toggleKeyframe}>◆</button>
       <button type="button" className={track?.modulator ? "modulator-toggle is-set" : "modulator-toggle"} aria-label={`${track?.modulator ? "Remove" : "Add"} modulation for ${label}`} aria-pressed={Boolean(track?.modulator)} title={`${track?.modulator ? "Remove" : "Add"} modulation · ${label}`} disabled={layer.locked} onClick={toggleModulator}>MOD</button>
      <span className="sr-only">{display(value)}</span>
    </div>
  </>;
}

function ModulationEditor({ layer, property, modulator, onPatch }: { layer: BendLayer; property: string; modulator: AnimationModulator; onPatch: (label: string, patch: (layer: BendLayer) => void) => void }) {
  const update = (label: string, patch: (modulator: AnimationModulator) => void) => onPatch(label, (target) => {
    target.animation = {
      version: 1,
      tracks: target.animation.tracks.map((track) => {
        if (track.property !== property || !track.modulator) return track;
        const next = structuredClone(track.modulator);
        patch(next);
        return { ...track, modulator: next };
      }),
    };
  });
  return <div className="modulation-editor" role="group" aria-label={`${getAnimationTrackLabel(layer, property)} modulation`}>
    <div className="modulation-editor-head"><span>Modulator</span><span className="inspector-kicker">{modulator.mode[0].toUpperCase() + modulator.mode.slice(1)}</span></div>
    <div className="modulation-row"><label htmlFor={`${property}-mod-type`}>Waveform</label><select id={`${property}-mod-type`} className="inspector-select" value={modulator.type} onChange={(event) => update("Change modulation waveform", (next) => { next.type = event.target.value as typeof next.type; })}><option value="sine">Sine</option><option value="triangle">Triangle</option><option value="pulse">Pulse</option><option value="smooth-noise">Smooth noise</option><option value="ramp">Ramp</option></select></div>
    <div className="modulation-row"><label htmlFor={`${property}-mod-mode`}>Mode</label><select id={`${property}-mod-mode`} className="inspector-select" value={modulator.mode} onChange={(event) => update("Change modulation mode", (next) => { next.mode = event.target.value as typeof next.mode; })}><option value="add">Add</option><option value="multiply">Multiply</option><option value="replace">Replace</option></select></div>
    <RangeControl label="Frequency" value={modulator.frequency} min={0} max={12} step={0.01} display={(value) => `${value.toFixed(2)} Hz`} defaultValue={1} onChange={(value) => update("Adjust modulation frequency", (next) => { next.frequency = value; })} />
    <RangeControl label="Amplitude" value={modulator.amplitude} min={-2} max={2} step={0.01} display={(value) => value.toFixed(2)} defaultValue={0.15} onChange={(value) => update("Adjust modulation amplitude", (next) => { next.amplitude = value; })} />
    <div className="modulation-editor-foot"><button type="button" className="small-action" onClick={() => update("Bypass modulation", (next) => { next.enabled = !next.enabled; })}>{modulator.enabled ? "Bypass" : "Enable"}</button><button type="button" className="small-action is-danger" onClick={() => onPatch("Remove modulation", (target) => { target.animation = { version: 1, tracks: target.animation.tracks.map((track) => track.property === property ? { ...track, modulator: undefined } : track).filter((track) => track.keyframes.length > 0) }; })}>Remove</button></div>
  </div>;
}

function RangeControl({ label, value, min, max, step, display, defaultValue, disabled, onChange }: { label: string; value: number; min: number; max: number; step: number; display: (value: number) => string; defaultValue: number; disabled?: boolean; onChange: (value: number) => void }) {
  const baseId = useId().replace(/:/g, "");
  const rangeId = `${baseId}-range`;
  const valueId = `${baseId}-value`;
  return <div className="control-row"><label htmlFor={rangeId}>{label}</label><input id={rangeId} className="control-range" type="range" min={min} max={max} step={step} value={value} aria-valuetext={display(value)} disabled={disabled} onChange={(event) => onChange(Number(event.target.value))} onDoubleClick={() => onChange(defaultValue)} /><input id={valueId} className="value-input" type="number" min={min} max={max} step={step} value={Number(value.toFixed(2))} aria-label={`${label} value`} disabled={disabled} onChange={(event) => onChange(Number(event.target.value))} onDoubleClick={() => onChange(defaultValue)} /><span className="sr-only">{display(value)}</span></div>;
}

function audioLabel(status: string | undefined): string {
  if (status === "available") return "Source audio detected · mixed on export";
  if (status === "none") return "No source audio track";
  if (status === "unsupported") return "Audio track found · browser cannot decode it";
  return "Audio track not confirmed yet";
}
