import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, AudioLines, Film, FolderOpen, Music2, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import { motion } from "motion/react";
import { useEditorStore } from "../../app/store";
import type { BendLayer, BendProject, MediaAssetRecord } from "../../engine/core/types";
import { formatSeconds } from "../../engine/core/timeline";
import { motionTokens } from "../../styles/motion";
import { getThumbnail } from "./thumbnailService";

type MediaFilter = "all" | "video" | "audio" | "unused" | "missing";

interface MediaLibraryDialogProps {
  project: BendProject;
  assetUrls: Record<string, string>;
  activeLayerId: string | null;
  importProgress: { current: number; total: number; label: string } | null;
  onClose: () => void;
  onImportMedia: () => void;
  onAddToTimeline: (assetId: string) => void;
  onReplaceSelected: (assetId: string) => void;
  onUseAsSoundtrack: (assetId: string) => void;
  onRelink: (assetId: string) => void;
  onRemove: (assetId: string) => void;
}

export function MediaLibraryDialog({ project, assetUrls, activeLayerId, importProgress, onClose, onImportMedia, onAddToTimeline, onReplaceSelected, onUseAsSoundtrack, onRelink, onRemove }: MediaLibraryDialogProps) {
  const [filter, setFilter] = useState<MediaFilter>("all");
  const [query, setQuery] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const activeClip = project.layers.find((layer): layer is Extract<BendLayer, { kind: "video" }> => layer.kind === "video" && layer.id === activeLayerId) ?? null;
  const entries = useMemo(() => Object.values(project.assets).map((asset) => {
    const usage = project.layers.filter((layer) => layer.kind === "video" && layer.assetId === asset.id).length + (project.soundtrack?.assetId === asset.id ? 1 : 0);
    return { asset, usage, missing: !assetUrls[asset.id] };
  }).filter((entry) => {
    if (filter === "video" && entry.asset.mediaType !== "video") return false;
    if (filter === "audio" && entry.asset.mediaType !== "audio") return false;
    if (filter === "unused" && entry.usage > 0) return false;
    if (filter === "missing" && !entry.missing) return false;
    return entry.asset.name.toLowerCase().includes(query.trim().toLowerCase());
  }).sort((left, right) => left.asset.name.localeCompare(right.asset.name)), [assetUrls, filter, project.assets, project.layers, project.soundtrack?.assetId, query]);
  const total = Object.keys(project.assets).length;
  const used = Object.values(project.assets).filter((asset) => project.layers.some((layer) => layer.kind === "video" && layer.assetId === asset.id) || project.soundtrack?.assetId === asset.id).length;

  useEffect(() => {
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => closeRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex='-1'])") ?? []);
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
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
      returnFocus?.focus();
    };
  }, [onClose]);

  useEffect(() => {
    const onUndo = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "z") return;
      event.preventDefault();
      if (event.shiftKey) useEditorStore.getState().redo();
      else useEditorStore.getState().undo();
    };
    document.addEventListener("keydown", onUndo);
    return () => document.removeEventListener("keydown", onUndo);
  }, []);

  return <motion.div className="dialog-backdrop" role="presentation" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={motionTokens.transition.quick} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <motion.div className="dialog media-library-dialog" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="media-library-title" aria-describedby="media-library-description" initial={{ opacity: 0, y: 10, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 5, scale: 0.99 }} transition={motionTokens.transition.standard}>
      <div className="dialog-header">
        <div><p className="eyebrow">Media / local</p><h2 className="dialog-title" id="media-library-title">Media library</h2></div>
        <button type="button" ref={closeRef} className="dialog-close" onClick={onClose} aria-label="Close media library"><X size={18} /></button>
      </div>
      <p className="dialog-copy" id="media-library-description">Footage and audio stay in this browser. Add a source to V1, reuse it in the selected clip, or make it the soundtrack without importing the file again.</p>
      <div className="media-library-toolbar">
        <button type="button" className="button button-primary" onClick={onImportMedia}><Plus size={14} /> Import media</button>
        <label className="media-search"><Search size={13} aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search sources" aria-label="Search media library" /></label>
      </div>
      <div className="media-filters" role="group" aria-label="Media filters">
        {(["all", "video", "audio", "unused", "missing"] as MediaFilter[]).map((value) => <button type="button" key={value} className={filter === value ? "media-filter is-active" : "media-filter"} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value === "all" ? `All ${total}` : value === "video" ? "Video" : value === "audio" ? "Audio" : value === "unused" ? "Unused" : "Missing"}</button>)}
      </div>
      {importProgress && <div className="media-import-progress" role="status"><RefreshCw size={13} className="spin" /><span>{importProgress.current} of {importProgress.total} · {importProgress.label}</span></div>}
      {activeClip ? <p className="media-selection-note">Selected clip: <strong>{activeClip.name}</strong>. Video sources can replace its source without losing the edit.</p> : <p className="media-selection-note">Select a clip on V1 to enable source replacement.</p>}
      <div className="media-library-list" aria-live="polite">
        {entries.length === 0 && <div className="media-library-empty"><FolderOpen size={22} /><strong>{total === 0 ? "No media yet" : "No sources match this filter"}</strong><span>{total === 0 ? "Import video or audio to build a reusable local bin." : "Try All or clear the search."}</span>{total === 0 && <button type="button" className="button button-primary" onClick={onImportMedia}><Plus size={14} /> Import media</button>}</div>}
        {entries.map(({ asset, usage, missing }) => <MediaCard
          key={asset.id}
          asset={asset}
          url={assetUrls[asset.id]}
          usage={usage}
          missing={missing}
          canReplace={Boolean(activeClip && asset.mediaType === "video" && !missing)}
          onAddToTimeline={() => onAddToTimeline(asset.id)}
          onReplaceSelected={() => onReplaceSelected(asset.id)}
          onUseAsSoundtrack={() => onUseAsSoundtrack(asset.id)}
          onRelink={() => onRelink(asset.id)}
          onRemove={() => onRemove(asset.id)}
        />)}
      </div>
      <div className="media-library-footer"><span>{total} source{total === 1 ? "" : "s"}</span><span>{used} in use · {Math.max(0, total - used)} unused</span><span>Source files are never uploaded</span></div>
    </motion.div>
  </motion.div>;
}

function MediaCard({ asset, url, usage, missing, canReplace, onAddToTimeline, onReplaceSelected, onUseAsSoundtrack, onRelink, onRemove }: {
  asset: MediaAssetRecord;
  url?: string;
  usage: number;
  missing: boolean;
  canReplace: boolean;
  onAddToTimeline: () => void;
  onReplaceSelected: () => void;
  onUseAsSoundtrack: () => void;
  onRelink: () => void;
  onRemove: () => void;
}) {
  const audio = asset.mediaType === "audio";
  return <article className={`media-card${missing ? " is-missing" : ""}`}>
    {audio ? <div className="media-thumb is-audio" aria-hidden="true"><AudioLines size={25} /></div> : url ? <MediaThumb assetId={asset.id} url={url} /> : <div className="media-thumb is-missing" aria-hidden="true"><Film size={24} /></div>}
    <div className="media-card-main">
      <div className="media-card-title"><strong title={asset.name}>{asset.name}</strong><span>{audio ? <Music2 size={11} /> : <Film size={11} />}{audio ? "Audio" : "Video"}</span></div>
      <span className="media-card-meta">{audio ? `${formatSeconds(asset.duration)} · ${asset.audio?.codec ?? "audio"}` : `${asset.width} × ${asset.height} · ${formatSeconds(asset.duration)}`}{asset.audio?.status === "none" ? " · no audio" : ""}</span>
      <span className={usage > 0 ? "media-usage" : "media-usage is-unused"}>{missing ? "Missing source" : usage > 0 ? `Used in ${usage} place${usage === 1 ? "" : "s"}` : "Unused"}</span>
    </div>
    <div className="media-card-actions">
      {missing ? <button type="button" className="small-action is-primary" onClick={onRelink}><RefreshCw size={12} /> Relink</button> : <>
        {!audio && <button type="button" className="small-action is-primary" onClick={onAddToTimeline}><Plus size={12} /> Add to V1</button>}
        {!audio && canReplace && <button type="button" className="small-action" onClick={onReplaceSelected}>Replace selected</button>}
        {audio && <button type="button" className="small-action is-primary" onClick={onUseAsSoundtrack}><Music2 size={12} /> Use as music</button>}
      </>}
      {usage === 0 && <button type="button" className="small-action is-danger" onClick={onRemove}><Trash2 size={12} /> Remove</button>}
    </div>
  </article>;
}

function MediaThumb({ assetId, url }: { assetId: string; url: string }) {
  const [thumb, setThumb] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void getThumbnail(url, assetId, 0.15).then((value) => { if (alive) setThumb(value); });
    return () => { alive = false; };
  }, [assetId, url]);
  return thumb ? <div className="media-thumb" style={{ backgroundImage: `url(${thumb})` }} role="img" aria-label="Source thumbnail" /> : <div className="media-thumb is-empty" aria-hidden="true"><Film size={22} /><AlertTriangle size={12} /></div>;
}
