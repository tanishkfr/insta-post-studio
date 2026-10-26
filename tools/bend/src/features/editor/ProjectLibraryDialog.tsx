import { useEffect, useRef, useState } from "react";
import { BookOpen, Check, Copy, FileArchive, FilePlus2, FolderOpen, LoaderCircle, Trash2, X } from "lucide-react";
import { listProjects, type StoredProjectRecord } from "../../storage/indexedDb";

interface ProjectLibraryDialogProps {
  currentProjectId: string;
  refreshKey: number;
  packageWorking: boolean;
  onClose: () => void;
  onNew: () => void;
  onDuplicate: () => void;
  onImportPackage: () => void;
  onOpenExample: () => Promise<void>;
  onOpen: (id: string) => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function ProjectLibraryDialog({ currentProjectId, refreshKey, packageWorking, onClose, onNew, onDuplicate, onImportPackage, onOpenExample, onOpen, onRename, onDelete }: ProjectLibraryDialogProps) {
  const [records, setRecords] = useState<StoredProjectRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
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

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      setRecords(await listProjects());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "BEND could not read the local project library.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, [refreshKey]);

  const openProject = async (id: string) => {
    setBusyId(id);
    setError(null);
    try {
      await onOpen(id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "BEND could not open that project.");
    } finally {
      setBusyId(null);
    }
  };

  const saveName = async (id: string) => {
    setBusyId(id);
    setError(null);
    try {
      await onRename(id, editingName);
      setEditingId(null);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "BEND could not rename that project.");
    } finally {
      setBusyId(null);
    }
  };

  const deleteProject = async (id: string) => {
    setBusyId(id);
    setError(null);
    try {
      await onDelete(id);
      setConfirmingId(null);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "BEND could not delete that project.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="dialog-backdrop project-library-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="dialog project-library-dialog" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="project-library-title">
        <div className="dialog-header">
          <div><p className="eyebrow">Local library</p><h2 className="dialog-title" id="project-library-title">Your projects</h2></div>
          <button type="button" ref={closeButtonRef} className="dialog-close" onClick={onClose} aria-label="Close project library"><X size={18} /></button>
        </div>
        <p className="dialog-copy">Projects and source media stay in this browser, scoped to this exact site address. A Vercel preview URL and the production domain do not share local projects. Use the editable package (Source) to move work between origins or devices. Duplicate projects share media safely until every project reference is gone.</p>
        <div className="project-library-actions">
          <button type="button" className="small-action is-primary" onClick={onNew}><FilePlus2 size={13} /> New project</button>
          <button type="button" className="small-action" onClick={onDuplicate} disabled={!currentProjectId}><Copy size={13} /> Duplicate current</button>
          <button type="button" className="small-action" onClick={() => void onOpenExample()}><BookOpen size={13} /> Open First Study</button>
          <button type="button" className="small-action" onClick={onImportPackage} disabled={packageWorking}><FileArchive size={13} /> {packageWorking ? "Validating…" : "Open project package"}</button>
        </div>
        {loading && <div className="project-library-state" role="status"><LoaderCircle size={15} className="spin" /> Reading saved projects…</div>}
        {!loading && error && <div className="project-library-state is-error" role="alert">{error}<button type="button" className="small-action" onClick={() => void refresh()}>Try again</button></div>}
        {!loading && !error && records.length === 0 && <div className="project-library-state"><FolderOpen size={20} /><strong>No saved projects yet.</strong><span>Start a new composition and it will appear here after the first local save.</span></div>}
        {!loading && !error && records.length > 0 && <div className="project-library-list" role="group" aria-label="Saved projects">
          {records.map((record) => {
            const current = record.id === currentProjectId;
            const editing = editingId === record.id;
            const deleting = confirmingId === record.id;
            return <article className={current ? "project-library-item is-current" : "project-library-item"} key={record.id}>
              <div className="project-library-thumb" role="img" aria-label={`Structural preview for ${record.project.name}`}>
                <span className="project-library-thumb-frame" aria-hidden="true" />
                {record.project.layers.slice(0, 4).map((layer, index) => <span className={`project-library-thumb-layer layer-${index + 1} is-${layer.kind}`} key={layer.id} aria-hidden="true" />)}
                <span className="project-library-thumb-count" aria-hidden="true">{record.project.layers.length}L</span>
              </div>
              <div className="project-library-info">
                {editing ? <input className="project-library-name-input" value={editingName} autoFocus aria-label={`Rename ${record.project.name}`} onChange={(event) => setEditingName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void saveName(record.id); if (event.key === "Escape") setEditingId(null); }} /> : <strong>{record.project.name}</strong>}
                <span>{formatAspect(record.project.canvas.width, record.project.canvas.height)} · {formatDuration(record.project.canvas.duration)} · edited {formatDate(record.savedAt)}</span>
                {current && <small><Check size={11} /> Currently open</small>}
              </div>
              <div className="project-library-item-actions">
                {editing ? <button type="button" className="layer-icon" aria-label={`Save name for ${record.project.name}`} disabled={busyId === record.id} onClick={() => void saveName(record.id)}><Check size={14} /></button> : <button type="button" className="layer-icon" aria-label={`Open ${record.project.name}`} disabled={busyId === record.id || current} onClick={() => void openProject(record.id)}><FolderOpen size={14} /></button>}
                {!editing && <button type="button" className="layer-icon" aria-label={`Rename ${record.project.name}`} disabled={busyId === record.id} onClick={() => { setEditingId(record.id); setEditingName(record.project.name); setConfirmingId(null); }}><span className="rename-glyph">Aa</span></button>}
                {!editing && <button type="button" className="layer-icon is-danger" aria-label={`Delete ${record.project.name}`} disabled={busyId === record.id} onClick={() => setConfirmingId(deleting ? null : record.id)}><Trash2 size={14} /></button>}
              </div>
              {deleting && <div className="project-library-confirm"><span>{current ? "Delete the open project? It will be closed after deletion." : "Delete this project?"}</span><button type="button" className="small-action is-danger" disabled={busyId === record.id} onClick={() => void deleteProject(record.id)}>Delete</button><button type="button" className="small-action" onClick={() => setConfirmingId(null)}>Cancel</button></div>}
            </article>;
          })}
        </div>}
      </div>
    </div>
  );
}

function formatAspect(width: number, height: number): string {
  const ratio = width / Math.max(1, height);
  if (Math.abs(ratio - 4 / 5) < 0.02) return "4:5";
  if (Math.abs(ratio - 9 / 16) < 0.02) return "9:16";
  if (Math.abs(ratio - 1) < 0.02) return "1:1";
  return `${width}×${height}`;
}

function formatDuration(duration: number): string {
  return `${Math.max(0, duration).toFixed(duration >= 10 ? 0 : 1)}s`;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
