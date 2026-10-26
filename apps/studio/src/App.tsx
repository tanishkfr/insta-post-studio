import { useState } from "react";
import { defaultProject, toolNav, type NavToolId } from "./project/defaultProject";

type ActiveWorkspace = "canvas" | NavToolId;

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

function LayerStackGlyph() {
  return (
    <svg
      aria-hidden="true"
      className="empty-layer-glyph"
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="9" y="24" width="26" height="14" rx="2" stroke="currentColor" opacity="0.22" />
      <rect x="13" y="17" width="26" height="14" rx="2" stroke="currentColor" opacity="0.45" />
      <rect x="17" y="10" width="26" height="14" rx="2" stroke="currentColor" />
      <path d="M22 17h9" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  );
}

function ArtboardCorners() {
  return (
    <span className="artboard-corners" aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}

export default function App() {
  const [activeWorkspace, setActiveWorkspace] = useState<ActiveWorkspace>("canvas");
  const [projectName, setProjectName] = useState(defaultProject.name);
  const activeTool = toolNav.find((tool) => tool.id === activeWorkspace);
  const artboard = defaultProject.artboards[0];
  const format = defaultProject.format;
  const width = String(format.width);
  const height = String(format.height);
  const baselineCount = defaultProject.metadata.sourceProjects.length;

  return (
    <div className="studio-shell">
      <header className="topbar">
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
          <input
            id="project-name"
            className="project-name-input"
            value={projectName}
            maxLength={80}
            spellCheck={false}
            onChange={(event) => setProjectName(event.target.value)}
            aria-label="Project name"
          />
        </div>

        <div className="topbar-meta">
          <span className="draft-pill">
            <span className="status-dot" aria-hidden="true" />
            Private draft
          </span>
          <div className="format-display" aria-label={`Format: ${format.label}, ${width} by ${height} pixels`}>
            <span className="format-eyebrow">Format</span>
            <span className="format-value">
              {width} × {height}
            </span>
            <span className="format-unit">px</span>
          </div>
        </div>
      </header>

      <aside className="toolrail" aria-label="Tool navigation">
        <button
          type="button"
          className="canvas-nav"
          aria-current={activeWorkspace === "canvas" ? "page" : undefined}
          onClick={() => setActiveWorkspace("canvas")}
        >
          <span className="canvas-nav-glyph" aria-hidden="true">
            <i />
            <i />
          </span>
          <span>
            <strong>Canvas</strong>
            <small>Project overview</small>
          </span>
        </button>

        <div className="rail-heading">
          <span>Tools</span>
          <span className="rail-count">{String(toolNav.length).padStart(2, "0")}</span>
        </div>

        <nav className="tool-list" aria-label="Editing tools">
          {toolNav.map((tool) => {
            const isActive = tool.id === activeWorkspace;
            return (
              <button
                key={tool.id}
                type="button"
                className={`tool-nav-item${isActive ? " is-active" : ""}`}
                aria-current={isActive ? "page" : undefined}
                onClick={() => setActiveWorkspace(tool.id)}
              >
                <span className="tool-index">{tool.index}</span>
                <span className="tool-copy">
                  <strong>{tool.label}</strong>
                  <small>{tool.discipline}</small>
                </span>
                <span className="tool-arrow" aria-hidden="true">
                  ↗
                </span>
              </button>
            );
          })}
        </nav>

        <div className="rail-footer">
          <div className="rail-status">
            <span className="status-dot" aria-hidden="true" />
            <span>{baselineCount} baselines preserved</span>
          </div>
          <p>Studio 2.0 foundation · Phase 0</p>
        </div>
      </aside>

      <main className="workspace">
        <header className="workspace-head">
          <div>
            <span className="eyebrow">Workspace</span>
            <h1>{activeTool ? `${activeTool.label} workspace` : "Canvas workspace"}</h1>
          </div>
          <div className="workspace-tools" aria-label="Workspace display">
            <span className="workspace-chip">{activeTool ? activeTool.discipline : "Composition"}</span>
            <span className="workspace-zoom">Fit · 100%</span>
          </div>
        </header>

        <div className="workspace-body">
          {activeTool ? (
            <div className="source-notice" role="status">
              <span className="notice-mark" aria-hidden="true" />
              <div>
                <strong>{activeTool.label} baseline is preserved</strong>
                <span>
                  <code>{activeTool.sourcePath}</code> · not mounted in Phase 0
                </span>
              </div>
              <span className="notice-state">Frozen baseline</span>
            </div>
          ) : null}

          <div className="artboard-wrap">
            <div className="artboard-ruler">
              <span>Artboard 01</span>
              <span>Post · 1:1</span>
            </div>

            <section className="artboard" aria-label="Empty square canvas placeholder">
              <ArtboardCorners />
              <div className="artboard-grid" aria-hidden="true" />

              <div className="artboard-empty">
                <span className="artboard-kicker">
                  <span>Canvas</span>
                  <span>1080 square</span>
                </span>
                <h2>
                  One canvas.
                  <br />
                  Every tool.
                </h2>
                <p>
                  {activeTool
                    ? `The ${activeTool.label} editor will be mounted here through its preserved adapter.`
                    : "Tool surfaces will mount here in Phase 1. Their output becomes independent, editable layers."}
                </p>
                <span className="placeholder-label">Workspace placeholder</span>
              </div>

              <div className="artboard-footer">
                <span>{width} × {height} px</span>
                <span>RGB · 72 dpi</span>
              </div>
            </section>

            <div className="artboard-caption">
              <span>
                <i aria-hidden="true" />
                {artboard.name}
              </span>
              <span>Background #FFFFFF</span>
            </div>
          </div>
        </div>
      </main>

      <aside className="sidepanel" aria-label="Layers and inspector">
        <section className="panel layers-panel">
          <header className="panel-head">
            <div>
              <span className="eyebrow">Structure</span>
              <h2>Layers</h2>
            </div>
            <span className="panel-count">0</span>
          </header>
          <div className="empty-layers">
            <LayerStackGlyph />
            <strong>No layers yet</strong>
            <p>Preserved tool output will appear here as compositable layers.</p>
          </div>
          <div className="layer-placeholder-rows" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        </section>

        <section className="panel inspector-panel">
          <header className="panel-head">
            <div>
              <span className="eyebrow">Properties</span>
              <h2>Inspector</h2>
            </div>
            <span className="panel-state">Empty</span>
          </header>
          <div className="inspector-empty">
            <strong>Nothing selected</strong>
            <p>Select a layer to inspect its transform, blending and source state.</p>
          </div>
          <dl className="format-spec">
            <div>
              <dt>Format</dt>
              <dd>{format.label}</dd>
            </div>
            <div>
              <dt>Dimensions</dt>
              <dd>{width} × {height} px</dd>
            </div>
            <div>
              <dt>Artboards</dt>
              <dd>{defaultProject.artboards.length.toString().padStart(2, "0")}</dd>
            </div>
            <div>
              <dt>Background</dt>
              <dd>
                <span className="swatch" aria-hidden="true" />#FFFFFF
              </dd>
            </div>
            <div>
              <dt>Color</dt>
              <dd>RGB / sRGB</dd>
            </div>
          </dl>
          <p className="inspector-note">Format controls arrive with the shared project store.</p>
        </section>
      </aside>

      <footer className="statusbar">
        <div className="status-left">
          <span className="status-dot is-muted" aria-hidden="true" />
          <span>Unsaved draft · in-memory only</span>
        </div>
        <div className="status-center">
          <span>Studio foundation</span>
          <span className="status-divider" />
          <span>{format.label} · {width} × {height}</span>
        </div>
        <div className="status-right">
          <span>Shared contracts v1</span>
          <span className="status-divider" />
          <span>Instrument Sans</span>
        </div>
      </footer>
    </div>
  );
}
