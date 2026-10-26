import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowUpRight, ChevronDown, ChevronUp, CircleCheck, Film, Image, Play, RotateCcw, Save, Trash2 } from "lucide-react";
import { createExampleProject, updateProjectDuration } from "../../engine/core/project";
import type { AspectPreset, BendProject } from "../../engine/core/types";
import { createBendIntegrationAdapter } from "../../integration/adapter";
import { createAndPersistHostLayer, createMockHostComposition, loadHostEditSource, loadHostVideoUrl, updateHostAspect } from "../../integration/host";
import type { BendHostComposition, BendHostLayer, BendIntegrationProgress } from "../../integration/contract";
import { loadHostComposition, loadHostMedia, saveHostComposition } from "../../storage/indexedDb";

interface IntegrationPageProps {
  onBack: () => void;
  onOpenEditor: (project: BendProject, assets: Record<string, import("../../engine/core/types").MediaAssetRecord>, urls: Record<string, string>, sessionId: string, layerId: string, sourceVersion: string) => void;
}

type BusyState = "loading" | "rendering" | "editing" | "saving" | null;

export function IntegrationPage({ onBack, onOpenEditor }: IntegrationPageProps) {
  const [composition, setComposition] = useState<BendHostComposition | null>(null);
  const [videoUrls, setVideoUrls] = useState<Record<string, string>>({});
  const [posterUrls, setPosterUrls] = useState<Record<string, string>>({});
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [busy, setBusy] = useState<BusyState>("loading");
  const [progress, setProgress] = useState<BendIntegrationProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [showStill, setShowStill] = useState(false);
  const urlsRef = useRef({ videoUrls, posterUrls });

  useEffect(() => { urlsRef.current = { videoUrls, posterUrls }; }, [posterUrls, videoUrls]);

  const loadComposition = async () => {
    setBusy("loading");
    setError(null);
    Object.values(urlsRef.current.videoUrls).forEach((url) => URL.revokeObjectURL(url));
    Object.values(urlsRef.current.posterUrls).forEach((url) => URL.revokeObjectURL(url));
    try {
      const stored = await loadHostComposition("bend-mock-instagram-composition");
      const next = stored?.composition ?? createMockHostComposition();
      if (!stored) await saveHostComposition(next);
      const nextVideos: Record<string, string> = {};
      const nextPosters: Record<string, string> = {};
      for (const layer of next.layers) {
        try {
          nextVideos[layer.id] = await loadHostVideoUrl(layer);
          const poster = await loadHostMedia(layer.posterMediaId);
          if (poster) nextPosters[layer.id] = URL.createObjectURL(poster.blob);
        } catch {
          // The layer remains visible in the host list so its missing-media state is inspectable.
        }
      }
      setComposition(next);
      setVideoUrls(nextVideos);
      setPosterUrls(nextPosters);
      setSelectedLayerId((current) => next.layers.some((layer) => layer.id === current) ? current : next.layers[0]?.id ?? null);
      setSavedAt(stored?.savedAt ?? Date.now());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The local host composition could not be opened.");
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    void loadComposition();
    return () => {
      Object.values(urlsRef.current.videoUrls).forEach((url) => URL.revokeObjectURL(url));
      Object.values(urlsRef.current.posterUrls).forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const selectedLayer = composition?.layers.find((layer) => layer.id === selectedLayerId) ?? null;
  const orderedLayers = useMemo(() => [...(composition?.layers ?? [])].sort((a, b) => a.stackingOrder - b.stackingOrder), [composition?.layers]);

  const persist = async (next: BendHostComposition) => {
    setComposition(next);
    setBusy("saving");
    try {
      await saveHostComposition(next);
      setSavedAt(Date.now());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The host composition could not be saved.");
    } finally {
      setBusy(null);
    }
  };

  const addLayer = async () => {
    if (!composition || busy) return;
    setBusy("rendering");
    setError(null);
    try {
      const project = createShortExampleProject(composition.aspect);
      const next = await createAndPersistHostLayer(composition, project, {}, createBendIntegrationAdapter(), setProgress);
      const layer = next.layers.at(-1);
      if (layer) {
        const videoUrl = await loadHostVideoUrl(layer);
        const poster = await loadHostMedia(layer.posterMediaId);
        setVideoUrls((current) => ({ ...current, [layer.id]: videoUrl }));
        if (poster) setPosterUrls((current) => ({ ...current, [layer.id]: URL.createObjectURL(poster.blob) }));
        setSelectedLayerId(layer.id);
      }
      setComposition(next);
      setSavedAt(Date.now());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The BEND layer could not be rendered for the host.");
    } finally {
      setBusy(null);
      setProgress(null);
    }
  };

  const editLayer = async (layer: BendHostLayer) => {
    if (!composition || busy) return;
    setBusy("editing");
    setError(null);
    try {
      const source = await loadHostEditSource(composition.id, layer.id, layer.sourceVersion);
      onOpenEditor(source.restored.project, source.restored.assets, source.restored.urls, composition.id, layer.id, layer.sourceVersion);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The editable BEND source could not be opened.");
      setBusy(null);
    }
  };

  const removeLayer = async (layer: BendHostLayer) => {
    if (!composition || busy) return;
    const next = { ...composition, layers: composition.layers.filter((candidate) => candidate.id !== layer.id), updatedAt: Date.now() };
    setVideoUrls((current) => { const copy = { ...current }; if (copy[layer.id]) URL.revokeObjectURL(copy[layer.id]); delete copy[layer.id]; return copy; });
    setPosterUrls((current) => { const copy = { ...current }; if (copy[layer.id]) URL.revokeObjectURL(copy[layer.id]); delete copy[layer.id]; return copy; });
    setSelectedLayerId(next.layers[0]?.id ?? null);
    await persist(next);
  };

  const updateLayer = async (layerId: string, update: Partial<BendHostLayer>) => {
    if (!composition) return;
    const next = { ...composition, layers: composition.layers.map((layer) => layer.id === layerId ? { ...layer, ...update } : layer), updatedAt: Date.now() };
    await persist(next);
  };

  if (!composition) return <main className="integration-page page-gutter"><div className="canvas-overlay-note">{error ? <><strong>Host unavailable</strong><span>{error}</span><button type="button" className="small-action" onClick={() => void loadComposition()}>Retry host</button></> : "Opening local host…"}</div></main>;

  return (
    <main className="integration-page">
      <header className="integration-nav page-gutter">
        <button className="wordmark" onClick={onBack} aria-label="Back to BEND home">BEND<span>.</span></button>
        <div className="integration-nav-title"><span className="eyebrow">LOCAL TEST HOST</span><strong>Instagram composition harness</strong></div>
        <button className="text-button" onClick={onBack}><ArrowLeft size={15} /> Back to BEND</button>
      </header>

      <div className="integration-shell page-gutter">
        <section className="integration-intro">
          <div><p className="eyebrow">PHASE 6A / HOST HANDOFF</p><h1>Place BEND<br /><em>inside the post.</em></h1><p>This independent local host owns canvas placement, playback policy, stacking, and persistence. BEND owns the editable source and rendered motion.</p></div>
          <div className="integration-intro-actions"><button className="button button-primary" onClick={() => void addLayer()} disabled={busy !== null}><Film size={15} /> {busy === "rendering" ? "Rendering layer…" : "Add BEND layer"}</button><button className="text-button" onClick={() => void loadComposition()} disabled={busy !== null}><RotateCcw size={15} /> Reload saved host</button></div>
        </section>

        {error && <div className="capability-banner integration-alert" role="alert">{error}</div>}
        {busy === "rendering" && progress && <div className="integration-progress" role="status" aria-live="polite"><span>{progress.label}</span><span>{progress.total ? Math.round((progress.completed / progress.total) * 100) : 0}%</span><div><i style={{ transform: `scaleX(${progress.total ? progress.completed / progress.total : 0})` }} /></div></div>}

        <section className="integration-board" aria-label="Mock Instagram post editor">
          <div className="integration-stage-column">
            <div className="integration-stage-head"><div><span className="eyebrow">HOST CANVAS</span><strong>{composition.aspect} / {composition.width} × {composition.height}</strong></div><select aria-label="Host canvas format" value={composition.aspect} onChange={(event) => void persist(updateHostAspect(composition, event.target.value as AspectPreset))}><option value="1:1">1:1 Square</option><option value="4:5">4:5 Portrait</option><option value="9:16">9:16 Reel / Story</option></select></div>
            <div className="integration-stage" style={{ aspectRatio: `${composition.width} / ${composition.height}` }}>
              {orderedLayers.map((layer) => videoUrls[layer.id] ? <video key={layer.id} className={selectedLayerId === layer.id ? "host-video-layer is-selected" : "host-video-layer"} src={videoUrls[layer.id]} poster={posterUrls[layer.id]} autoPlay muted={layer.audioPolicy === "muted"} loop={layer.playback === "loop"} playsInline controls={false} onClick={() => setSelectedLayerId(layer.id)} style={{ zIndex: 10 + layer.stackingOrder, transform: `translate(-50%, -50%) translate(${layer.transform.x}px, ${layer.transform.y}px) scale(${layer.transform.scale}) rotate(${layer.transform.rotation}deg)`, opacity: layer.opacity }} /> : <div key={layer.id} className="host-missing-layer" role="alert">Rendered media missing for {layer.id}</div>)}
              <div className="host-foreground" style={{ left: `${composition.foreground.x}%`, top: `${composition.foreground.y}%`, transform: `translate(-50%, -50%) scale(${composition.foreground.scale})` }}><span>◆</span>{composition.foreground.text}</div>
              {composition.layers.length === 0 && <div className="integration-stage-empty"><Image size={18} /><strong>No BEND layer yet.</strong><span>Add a rendered source to test the host handoff.</span></div>}
            </div>
            <div className="integration-stage-foot"><span><Play size={12} /> {selectedLayer ? `${selectedLayer.duration.toFixed(2)}s · ${selectedLayer.fps} FPS` : "Host playback idle"}</span><span>{savedAt ? `Saved ${new Date(savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Not saved"}</span></div>
          </div>

          <aside className="integration-controls" aria-label="Host layer controls">
            <div className="integration-control-heading"><div><span className="eyebrow">HOST LAYERS</span><strong>Placement stays here.</strong></div><span className="integration-version">BRIDGE v1</span></div>
            <div className="host-layer-list">
              {orderedLayers.map((layer) => <div key={layer.id} data-source-version={layer.sourceVersion} data-stacking-order={layer.stackingOrder} data-timeline-offset={layer.timelineOffset} className={selectedLayerId === layer.id ? "host-layer-row is-selected" : "host-layer-row"}><button className="host-layer-select" onClick={() => setSelectedLayerId(layer.id)}><span><strong>BEND / {layer.sourceProjectId.slice(0, 12)}</strong><small>{layer.renderedMimeType} · {layer.audioPresent ? "audio available" : "video-only"}</small></span><CircleCheck size={14} /></button><div className="host-layer-actions"><button className="host-mini-action" onClick={() => void editLayer(layer)} disabled={busy !== null}><ArrowUpRight size={13} /> Edit in BEND</button><button className="host-icon-action" onClick={() => void removeLayer(layer)} aria-label="Remove BEND layer"><Trash2 size={13} /></button></div></div>)}
              {orderedLayers.length === 0 && <p className="host-empty-copy">The BEND layer will arrive with an editable package and a rendered video. The foreground marker is owned by this host.</p>}
            </div>
            {selectedLayer && <div className="host-inspector">
              <div className="host-inspector-head"><div><span className="eyebrow">SELECTED BEND LAYER</span><strong>Host placement</strong></div><span>{selectedLayer.editStatus.toUpperCase()}</span></div>
              <HostRange label="X position" value={selectedLayer.transform.x} min={-540} max={540} step={1} onChange={(value) => void updateLayer(selectedLayer.id, { transform: { ...selectedLayer.transform, x: value } })} />
              <HostRange label="Y position" value={selectedLayer.transform.y} min={-960} max={960} step={1} onChange={(value) => void updateLayer(selectedLayer.id, { transform: { ...selectedLayer.transform, y: value } })} />
              <HostRange label="Scale" value={selectedLayer.transform.scale} min={0.25} max={2.5} step={0.01} onChange={(value) => void updateLayer(selectedLayer.id, { transform: { ...selectedLayer.transform, scale: value } })} />
              <HostRange label="Opacity" value={selectedLayer.opacity} min={0} max={1} step={0.01} onChange={(value) => void updateLayer(selectedLayer.id, { opacity: value })} />
              <div className="host-control-line"><label htmlFor="host-playback">Playback</label><select id="host-playback" value={selectedLayer.playback} onChange={(event) => void updateLayer(selectedLayer.id, { playback: event.target.value as BendHostLayer["playback"] })}><option value="loop">Loop shorter clips</option><option value="hold-last-frame">Hold last frame</option><option value="trim-to-host">Trim to host duration</option></select></div>
              <div className="host-control-line"><span>Stacking</span><div className="host-stack-actions"><button type="button" onClick={() => void updateLayer(selectedLayer.id, { stackingOrder: selectedLayer.stackingOrder + 1 })} aria-label="Raise BEND layer"><ChevronUp size={14} /></button><button type="button" onClick={() => void updateLayer(selectedLayer.id, { stackingOrder: Math.max(0, selectedLayer.stackingOrder - 1) })} aria-label="Lower BEND layer"><ChevronDown size={14} /></button><small>foreground stays above</small></div></div>
              <div className="host-output-meta"><span>RENDERED OUTPUT</span><strong>{selectedLayer.width} × {selectedLayer.height} · {selectedLayer.renderedCodec ?? "runtime codec"}</strong><small>{selectedLayer.renderedMimeType} · {selectedLayer.audioPresent ? "source audio available" : selectedLayer.audioMessage ?? "video-only output"}</small></div>
              <button type="button" className="still-toggle" onClick={() => setShowStill((show) => !show)}><Image size={13} /> {showStill ? "Hide still output" : "Show still output"}</button>
              {showStill && posterUrls[selectedLayer.id] && <img className="host-still-preview" src={posterUrls[selectedLayer.id]} alt="BEND current frame handoff" />}
            </div>}
            <div className="host-save-row"><span><Save size={13} /> Host composition saves independently.</span><button type="button" className="small-action" onClick={() => void persist(composition)} disabled={busy !== null}>Save</button></div>
          </aside>
        </section>
        <footer className="integration-contract-note"><span className="eyebrow">HANDOFF CONTRACT</span><p>Editable source remains a versioned <code>.bendpkg</code>. The host stores its own transform, timeline offset, stacking, playback, audio policy, and committed rendered media. Canceling an edit leaves this layer untouched.</p></footer>
      </div>
    </main>
  );
}

function HostRange({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void }) {
  return <label className="host-range"><span>{label}</span><input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} /><output>{step < 1 ? value.toFixed(2) : Math.round(value)}</output></label>;
}

function createShortExampleProject(aspect: AspectPreset): BendProject {
  const project = createExampleProject(aspect);
  const duration = 2;
  return updateProjectDuration({
    ...project,
    canvas: { ...project.canvas, duration },
    timeline: { inPoint: 0, outPoint: duration },
    layers: project.layers.map((layer) => layer.kind === "procedural"
      ? { ...layer, timeline: { ...layer.timeline, duration }, generator: { ...layer.generator, duration } }
      : { ...layer, timeline: { ...layer.timeline, duration } }),
  });
}
