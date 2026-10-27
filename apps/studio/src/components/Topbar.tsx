import type { ProjectFormat, StudioProject } from "@studio/contracts";
import { useEffect, useState } from "react";
import type { SaveStatus } from "../state/useProjectPersistence";
import { StudioStatusAndFeedback } from "../phase5a/components";

interface TopbarProps {
  project: StudioProject;
  formats: ProjectFormat[];
  saveStatus: SaveStatus;
  saveError: string | null;
  canUndo: boolean;
  canRedo: boolean;
  editingTool: string | null;
  onSave: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onRename: (name: string) => void;
  onFormatChange: (formatId: string) => void;
  onNewProject: () => void;
}

function StudioMark() {
  return (
    <svg
      aria-hidden="true"
      className="studio-mark"
      viewBox="0 0 28 28"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="2.5" y="6.5" width="15" height="15" rx="1.5" stroke="currentColor" opacity="0.35" />
      <rect x="6.5" y="4" width="15" height="15" rx="1.5" stroke="currentColor" opacity="0.6" />
      <rect x="10.5" y="1.5" width="15" height="15" rx="1.5" stroke="currentColor" />
      <path d="M14.25 9h7.5v7.5" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  );
}

function saveLabel(status: SaveStatus): string {
  switch (status) {
    case "loading":
      return "Opening project";
    case "saved":
      return "Saved locally";
    case "dirty":
      return "Unsaved changes";
    case "saving":
      return "Saving";
    case "error":
      return "Save failed";
  }
}

function ProjectNameInput({
  project,
  onCommit,
}: {
  project: StudioProject;
  onCommit: (name: string) => void;
}) {
  const [name, setName] = useState(project.name);
  useEffect(() => {
    setName(project.name);
  }, [project.id, project.name]);

  function commit() {
    const next = name.trim() || "Untitled Project";
    setName(next);
    if (next !== project.name) onCommit(next);
  }

  return (
    <input
      id="project-name"
      className="project-name-input"
      value={name}
      maxLength={80}
      spellCheck={false}
      onChange={(event) => setName(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
        if (event.key === "Escape") {
          setName(project.name);
          event.currentTarget.blur();
        }
      }}
      aria-label="Project name"
    />
  );
}

export function Topbar({
  project,
  formats,
  saveStatus,
  saveError,
  canUndo,
  canRedo,
  editingTool,
  onSave,
  onUndo,
  onRedo,
  onRename,
  onFormatChange,
  onNewProject,
}: TopbarProps) {
  return (
    <header className={`topbar${editingTool ? " is-editing" : ""}`}>
      <div className="brand">
        <StudioMark />
        <div className="brand-wordmark">
          <span>STUDIO</span>
          <span className="brand-version">2.0</span>
        </div>
      </div>

      <div className="project-identity">
        <label className="project-label" htmlFor="project-name">
          Project
        </label>
        <ProjectNameInput project={project} onCommit={onRename} />
      </div>

      <div className="topbar-meta">
        <span
          className={`save-state is-${saveStatus}`}
          title={saveError ?? undefined}
          data-testid="save-state"
        >
          <span className="status-dot" aria-hidden="true" />
          <StudioStatusAndFeedback text={saveLabel(saveStatus)} />
        </span>

        {!editingTool ? (
          <div className="history-controls" aria-label="Project history">
            <button
              type="button"
              className="icon-button"
              aria-label="Undo"
              title="Undo (Ctrl/Cmd+Z)"
              onClick={onUndo}
              disabled={!canUndo}
            >
              ↶
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label="Redo"
              title="Redo (Shift+Ctrl/Cmd+Z)"
              onClick={onRedo}
              disabled={!canRedo}
            >
              ↷
            </button>
          </div>
        ) : null}

        {!editingTool ? (
          <label className="format-select-wrap">
            <span>Format</span>
            <select
              aria-label="Project format"
              value={project.format.id}
              onChange={(event) => onFormatChange(event.target.value)}
            >
              {formats.map((format) => (
                <option key={format.id} value={format.id}>
                  {format.label} · {format.width}×{format.height}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <span className="format-chip">
            {project.format.label} · {project.format.width}×{project.format.height}
          </span>
        )}

        {!editingTool ? (
          <>
            <button
              type="button"
              className="button subtle"
              onClick={onNewProject}
              disabled={saveStatus === "loading"}
              title="Create a new local project"
            >
              New
            </button>
            <button
              type="button"
              className="button"
              onClick={onSave}
              disabled={saveStatus === "saving" || saveStatus === "loading"}
            >
              Save
            </button>
          </>
        ) : null}
      </div>
    </header>
  );
}
