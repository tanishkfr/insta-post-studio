import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowUpRight, BookOpen, FileArchive, FileVideo, Layers3, Sparkles, Waves } from "lucide-react";
import { createExampleProject, createVideoProject, createGeneratedProject } from "../../engine/core/project";
import { ASPECT_PRESETS } from "../../engine/core/types";
import type { AspectPreset, BendProject, MediaAssetRecord, SignalPresetId } from "../../engine/core/types";
import { createAssetRecord, inspectMediaFile, isSupportedVideoFile, probeVideo } from "../../engine/media/media";
import { loadAsset, loadMostRecentProject, saveAsset } from "../../storage/indexedDb";
import { restoreEditableProjectPackage } from "../../engine/package/portableProject";

interface EntryPageProps {
  onBack: () => void;
  onOpenIntegration: () => void;
  onProjectCreated: (project: BendProject, assets?: Record<string, MediaAssetRecord>, urls?: Record<string, string>) => void;
}

export function EntryPage({ onBack, onOpenIntegration, onProjectCreated }: EntryPageProps) {
  const [aspect, setAspect] = useState<AspectPreset>("4:5");
  const [busy, setBusy] = useState<"upload" | "remix" | null>(null);
  const [packageBusy, setPackageBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<{ project: BendProject; savedAt: number } | null>(null);
  const uploadInput = useRef<HTMLInputElement>(null);
  const remixInput = useRef<HTMLInputElement>(null);
  const packageInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void loadMostRecentProject().then((record) => {
      if (record) setRecent({ project: record.project, savedAt: record.savedAt });
    }).catch(() => undefined);
  }, []);

  const openGenerated = (preset: SignalPresetId = "pulse") => onProjectCreated(createGeneratedProject(aspect, preset));
  const openExample = () => onProjectCreated(createExampleProject(aspect));

  const handleFile = async (file: File | undefined, remix: boolean) => {
    if (!file) return;
    setError(null);
    if (!isSupportedVideoFile(file)) {
      setError("That file type is not supported. Try a browser-compatible MP4 or WebM.");
      return;
    }
    setBusy(remix ? "remix" : "upload");
    try {
      const metadata = await probeVideo(file);
      const asset = { ...createAssetRecord(file, metadata), ...await inspectMediaFile(file) };
      await saveAsset({ ...asset, blob: file });
      const project = createVideoProject(aspect, asset, remix);
      onProjectCreated(project, { [asset.id]: asset }, { [asset.id]: URL.createObjectURL(file) });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "BEND could not import that video.");
    } finally {
      setBusy(null);
    }
  };

  const resume = async () => {
    if (!recent) return;
    const urls: Record<string, string> = {};
    const assets: Record<string, MediaAssetRecord> = { ...recent.project.assets };
    for (const asset of Object.values(recent.project.assets)) {
      const stored = await loadAsset(asset.id);
      if (stored) {
        assets[asset.id] = asset;
        urls[asset.id] = URL.createObjectURL(stored.blob);
      }
    }
    onProjectCreated(recent.project, assets, urls);
  };

  const handlePackage = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setPackageBusy(true);
    try {
      const restored = await restoreEditableProjectPackage(file);
      onProjectCreated(restored.project, restored.assets, restored.urls);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "BEND could not restore that editable package.");
    } finally {
      setPackageBusy(false);
    }
  };

  return (
    <main className="entry-page">
      <header className="studio-nav page-gutter">
        <button className="wordmark" onClick={onBack} aria-label="Back to BEND home">BEND<span>.</span></button>
        <span className="studio-mode-label">STUDIO / NEW PROJECT</span>
        <div className="studio-nav-actions"><button className="text-button" onClick={onOpenIntegration}><Layers3 size={15} /> Test host</button><button className="text-button" onClick={onBack}><ArrowLeft size={16} /> Back to BEND</button></div>
      </header>
      <div className="entry-shell page-gutter">
        <div className="entry-intro">
          <p className="eyebrow">CREATE A NEW PROJECT</p>
          <h1>Where do you<br /><em>want to begin?</em></h1>
          <p>Pick a material, choose a format, and get to the part where it starts moving.</p>
        </div>
        <div className="aspect-picker" role="group" aria-label="Canvas format">
          <span className="eyebrow">CANVAS FORMAT</span>
          <div className="aspect-options">
            {(Object.keys(ASPECT_PRESETS) as AspectPreset[]).map((key) => (
              <button key={key} className={aspect === key ? "aspect-option is-active" : "aspect-option"} onClick={() => setAspect(key)}>
                <span>{key}</span><small>{ASPECT_PRESETS[key].label}</small>
              </button>
            ))}
          </div>
        </div>
        <section className="entry-options" aria-label="Project entry options">
          <article className="entry-option entry-option-upload">
            <div className="entry-option-icon"><FileVideo size={21} strokeWidth={1.5} /></div>
            <div className="entry-option-copy"><span className="eyebrow">01 / IMPORT</span><h2>Upload footage</h2><p>Start with a local video. MP4 and WebM are ready to go.</p></div>
            <button className="entry-option-action" onClick={() => uploadInput.current?.click()} disabled={busy !== null}>Choose file <ArrowUpRight size={16} /></button>
            <input ref={uploadInput} className="sr-only" type="file" accept="video/mp4,video/webm,video/*" aria-label="Choose local video footage" onChange={(event) => void handleFile(event.target.files?.[0], false)} />
          </article>
          <article className="entry-option entry-option-generate">
            <div className="entry-option-icon"><Sparkles size={21} strokeWidth={1.5} /></div>
            <div className="entry-option-copy"><span className="eyebrow">02 / PROCEDURAL</span><h2>Generate motion</h2><p>Open a Signal Field and begin with a deterministic pulse.</p></div>
            <button className="entry-option-action" onClick={() => openGenerated()} disabled={busy !== null}>Start field <ArrowUpRight size={16} /></button>
          </article>
          <article className="entry-option entry-option-remix">
            <div className="entry-option-icon"><Waves size={21} strokeWidth={1.5} /></div>
            <div className="entry-option-copy"><span className="eyebrow">03 / REMIX</span><h2>Remix footage</h2><p>Import a clip with Wave Displacement already in the chain.</p></div>
            <button className="entry-option-action" onClick={() => remixInput.current?.click()} disabled={busy !== null}>Choose file <ArrowUpRight size={16} /></button>
            <input ref={remixInput} className="sr-only" type="file" accept="video/mp4,video/webm,video/*" aria-label="Choose local video for remix" onChange={(event) => void handleFile(event.target.files?.[0], true)} />
          </article>
          <article className="entry-option entry-option-example">
            <div className="entry-option-icon"><BookOpen size={21} strokeWidth={1.5} /></div>
            <div className="entry-option-copy"><span className="eyebrow">04 / EXAMPLE</span><h2>Explore a study</h2><p>Open an editable two-layer composition with animation and a motion echo already wired in.</p></div>
            <button className="entry-option-action" onClick={openExample} disabled={busy !== null}>Open example <ArrowUpRight size={16} /></button>
          </article>
        </section>
        <section className="entry-transfer" aria-label="Portable project actions">
          <div><span className="eyebrow">PORTABLE SOURCE</span><strong>Move an editable BEND project between browsers.</strong><p>Import a <code>.bendpkg</code> package with its source media, effects, seeds, and animation.</p></div>
          <div className="entry-transfer-actions"><button className="text-button" onClick={() => packageInput.current?.click()} disabled={busy !== null || packageBusy}><FileArchive size={15} /> {packageBusy ? "Restoring…" : "Import .bendpkg"}</button><input ref={packageInput} className="sr-only" type="file" accept=".bendpkg,application/vnd.bend.project,application/octet-stream" aria-label="Import editable BEND project" onChange={(event) => void handlePackage(event.target.files?.[0])} /></div>
        </section>
        {busy && <p className="entry-status" role="status">{busy === "remix" ? "Preparing the remix…" : "Reading local footage…"}</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        {recent && (
          <button className="resume-project" onClick={() => void resume()}><Layers3 size={17} /><span><strong>Resume {recent.project.name}</strong><small>Saved locally {new Date(recent.savedAt).toLocaleString()}</small></span><ArrowUpRight size={17} /></button>
        )}
        <p className="local-note">Local-first by design. Your footage stays in this browser; BEND does not upload media.</p>
      </div>
    </main>
  );
}

