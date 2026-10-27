import { useEffect, useRef, useState, type ReactNode } from "react";

export interface ToolItem { id: string; name: string; purpose: string; enabled: boolean; reason?: string }
export interface LayerItem { id: string; name: string; source: string; kind: string; visible: boolean; locked: boolean }
export interface RouteItem { id: string; label: string; description: string; enabled: boolean; reason?: string; testId?: string }

export function StudioStatusAndFeedback({ text, kind = "status" }: { text: string; kind?: "status" | "alert" }) {
  return <span className="p5a-status" role={kind}>{text}</span>;
}

export function StudioHeader(p: { children: ReactNode; className: string } | { project: string; status: string; format: string; formats: string[]; editing: boolean; onFormat: (value: string) => void; onSave: () => void; onUndo: () => void; onRedo: () => void; canUndo: boolean; canRedo: boolean }) {
  if ("children" in p) return <header className={p.className}>{p.children}</header>;
  return <header className="p5a-header"><div className="p5a-brand"><span className="p5a-mark" aria-hidden="true">S</span><strong>Studio</strong></div><div className="p5a-project"><small>Project</small><strong>{p.project}</strong></div><div className="p5a-header-actions"><StudioStatusAndFeedback text={p.status}/>{!p.editing && <><button onClick={p.onUndo} disabled={!p.canUndo}>Undo</button><button onClick={p.onRedo} disabled={!p.canRedo}>Redo</button><label className="p5a-format">Format <select value={p.format} onChange={e => p.onFormat(e.target.value)}>{p.formats.map(f => <option key={f}>{f}</option>)}</select></label><button onClick={p.onSave}>Save demo</button><button disabled title="Export is not part of this prototype">Export post</button></>}</div></header>;
}

export function StudioToolRail(p: { tools: ToolItem[]; active: string; canvasDetail?: string; showAvailability?: boolean; onCompose: () => void; onTool: (id: string) => void }) {
  return <aside className="p5a-root p5a-rail" aria-label="Tool navigation"><button type="button" className={p.active === "compose" ? "p5a-nav p5a-selected" : "p5a-nav"} onClick={p.onCompose} aria-current={p.active === "compose" ? "page" : undefined}><strong>Canvas</strong><small>{p.canvasDetail ?? "Project canvas"}</small></button><h2>Creative tools</h2><nav aria-label="Creative tools">{p.tools.map(t => <button type="button" key={t.id} data-testid={`tool-${t.id}`} className={p.active === t.id ? "p5a-nav p5a-selected" : "p5a-nav"} onClick={() => p.onTool(t.id)} disabled={!t.enabled} title={t.reason} aria-current={p.active === t.id ? "page" : undefined}><strong>{t.name}</strong>{p.showAvailability && <span className="p5a-availability">{t.enabled ? "Live" : "Soon"}</span>}<small>{t.purpose}{!t.enabled ? " · Coming later" : ""}</small></button>)}</nav></aside>;
}

export function StudioLayersPanel(p: { children: ReactNode; className: string; labelledBy: string } | { layers: LayerItem[]; selectedId: string | null; onSelect: (id: string) => void; onVisibility: (id: string) => void; onLock: (id: string) => void; onRename: (id: string, name: string) => void; onMove: (id: string, direction: "up" | "down") => void; onEdit: (id: string) => void }) {
  if ("children" in p) return <section className={p.className} aria-labelledby={p.labelledBy}>{p.children}</section>;
  return <section className="p5a-layers" aria-labelledby="p5a-layers-title"><div className="p5a-section-head"><h2 id="p5a-layers-title">Layers</h2><span>{p.layers.length}</span></div>{p.layers.length === 0 ? <StudioEmptyStates title="No layers yet" detail="Choose a creative tool to make the first layer."/> : <ul>{p.layers.map((l,i) => <li key={l.id} className={l.id === p.selectedId ? "p5a-layer p5a-selected" : "p5a-layer"}><button className="p5a-layer-main" onClick={() => p.onSelect(l.id)} aria-pressed={l.id === p.selectedId}><span className="p5a-thumb" aria-hidden="true">{l.kind === "video" ? "▶" : l.source.slice(0,1)}</span><span><strong>{l.name}</strong><small>{l.source}{l.kind === "video" ? " · Video demo" : ""}</small></span></button><div className="p5a-layer-controls"><button onClick={() => p.onVisibility(l.id)} aria-label={(l.visible ? "Hide " : "Show ") + l.name}>{l.visible ? "Hide" : "Show"}</button><button onClick={() => p.onLock(l.id)} aria-label={(l.locked ? "Unlock " : "Lock ") + l.name}>{l.locked ? "Unlock" : "Lock"}</button><button onClick={() => p.onMove(l.id,"up")} disabled={i === 0} aria-label={"Move " + l.name + " up"}>↑</button><button onClick={() => p.onMove(l.id,"down")} disabled={i === p.layers.length-1} aria-label={"Move " + l.name + " down"}>↓</button></div></li>)}</ul>}{p.selectedId && <label className="p5a-rename">Layer name<input aria-label="Selected layer name" value={p.layers.find(l => l.id === p.selectedId)?.name ?? ""} onChange={e => p.onRename(p.selectedId!, e.target.value)}/></label>}{p.selectedId && <button className="p5a-link" onClick={() => p.onEdit(p.selectedId!)}>Edit source</button>}</section>;
}

export function StudioInspectorLayout(p: { hostContent: ReactNode; className: string; labelledBy: string } | { layer: LayerItem | null; onEdit: () => void; values: { x: number; y: number; scale: number; rotation: number; opacity: number; blend: string }; onChange: (key: "x" | "y" | "scale" | "rotation" | "opacity" | "blend", value: string) => void; children?: ReactNode }) {
  if ("hostContent" in p) return <section className={p.className} aria-labelledby={p.labelledBy}>{p.hostContent}</section>;
  return <section className="p5a-inspector" aria-labelledby="p5a-inspector-title"><div className="p5a-section-head"><h2 id="p5a-inspector-title">Inspector</h2></div>{p.layer ? <><div className="p5a-source"><small>Selected layer</small><strong>{p.layer.name}</strong><span>Source · {p.layer.source}</span></div><div className="p5a-props"><h3>Transform</h3><div className="p5a-fields">{(["x","y","scale","rotation","opacity"] as const).map(key => <label key={key}>{key}<input type="number" value={p.values[key]} onChange={e => p.onChange(key,e.target.value)}/></label>)}</div><h3>Appearance</h3><label className="p5a-blend">Blend mode <select value={p.values.blend} onChange={e => p.onChange("blend",e.target.value)}><option>Normal</option><option>Multiply</option><option>Screen</option></select></label></div><button onClick={p.onEdit}>Edit source</button>{p.children}</> : <StudioEmptyStates title="Nothing selected" detail="Select a layer to see its properties."/>}</section>;
}

export function StudioToolSessionHeader(p: { tool: string; project: string; artboard: string; layer: string; status: string; publishing: boolean; updating: boolean; error?: string; onBack: () => void; onPublish: () => void; onRetry?: () => void }) {
  return <div className="p5a-session"><button onClick={p.onBack} disabled={p.publishing}>← Compose</button><div className="p5a-session-name"><strong>{p.tool}</strong><span>{p.project} / {p.artboard} / {p.layer}</span></div><StudioStatusAndFeedback text={p.error || p.status} kind={p.error ? "alert" : "status"}/>{p.error && p.onRetry && <button onClick={p.onRetry}>Retry</button>}<button className="p5a-primary" onClick={p.onPublish} disabled={p.publishing}>{p.publishing ? "Publishing…" : p.updating ? "Update layer" : "Add to composition"}</button></div>;
}

export function ContinueInMenu(p: { routes: RouteItem[]; onChoose: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const root = useRef<HTMLDivElement>(null);
  function close() { setOpen(false); trigger.current?.focus(); }
  return <div className="p5a-continue" ref={root} onKeyDown={e => { if (e.key === "Escape" && open) { e.preventDefault(); e.stopPropagation(); close(); } }} onBlur={e => { if (!root.current?.contains(e.relatedTarget)) setOpen(false); }}><button ref={trigger} type="button" aria-expanded={open} aria-controls="p5a-continue-options" onClick={() => setOpen(v => !v)}>Continue in…</button>{open && <div id="p5a-continue-options" className="p5a-menu">{p.routes.map(r => <div key={r.id}><button type="button" data-testid={r.testId} onClick={() => { close(); p.onChoose(r.id); }} disabled={!r.enabled} title={r.reason}><strong>{r.label}</strong><small>{r.enabled ? r.description : r.reason}</small></button></div>)}</div>}</div>;
}

/** A host controls visibility and restores focus to its invoking control. */
export function CompactPanel(p: { title: string; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const onClose = useRef(p.onClose); onClose.current = p.onClose;
  useEffect(() => { const node = dialog.current; node?.showModal(); return () => { if (node?.open) node.close(); }; }, []);
  return <dialog className="p5a-compact-panel" ref={dialog} aria-label={p.title} onCancel={e => { e.preventDefault(); onClose.current(); }}><div className="p5a-compact-head"><strong>{p.title}</strong><button type="button" onClick={p.onClose}>Close</button></div>{p.children}</dialog>;
}

export function StudioEmptyStates(p: { title: string; detail: string; action?: { label: string; onClick: () => void } }) {
  return <div className="p5a-empty"><strong>{p.title}</strong><p>{p.detail}</p>{p.action && <button onClick={p.action.onClick}>{p.action.label}</button>}</div>;
}
