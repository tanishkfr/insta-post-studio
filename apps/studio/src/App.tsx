import type { StudioProject } from "@studio/contracts";
import { useEffect, useState } from "react";
import type { CaptureVectorResult } from "./adapters/vector/captureVectorArtwork";
import { createVectorLayer } from "./adapters/vector/vectorLayer";
import { CanvasWorkspace } from "./components/CanvasWorkspace";
import { InspectorPanel } from "./components/InspectorPanel";
import { LayersPanel } from "./components/LayersPanel";
import { ToolRail } from "./components/ToolRail";
import { Topbar } from "./components/Topbar";
import { VectorEditor } from "./components/VectorEditor";
import { FORMAT_PRESETS } from "./project/defaultProject";
import { studioStore, useStudioStore } from "./state/projectStore";
import { useProjectPersistence } from "./state/useProjectPersistence";

function LoadingShell() {
  return (
    <div className="loading-shell" role="status">
      <div className="loading-mark" aria-hidden="true">
        ◈
      </div>
      <span className="eyebrow">Studio 2.0</span>
      <strong>Opening local project</strong>
      <p>Restoring the document and Vector source references from IndexedDB.</p>
    </div>
  );
}

export default function App() {
  const project = useStudioStore((state) => state.project);
  const activeTool = useStudioStore((state) => state.activeTool);
  const activeArtboardId = useStudioStore((state) => state.activeArtboardId);
  const selectedLayerId = useStudioStore((state) => state.selectedLayerId);
  const canUndo = useStudioStore((state) => state.past.length > 0);
  const canRedo = useStudioStore((state) => state.future.length > 0);
  const persistence = useProjectPersistence(studioStore);
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);

  const editingVector = activeTool === "vector";
  const activeArtboard =
    project.artboards.find((artboard) => artboard.id === activeArtboardId) ??
    project.artboards[0];
  const editingLayer = editingLayerId
    ? project.layers.find((layer) => layer.id === editingLayerId) ?? null
    : null;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (editingVector) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.matches("input, textarea, select") ||
          target.isContentEditable)
      ) {
        return;
      }
      const command = event.metaKey || event.ctrlKey;
      if (!command || event.key.toLowerCase() !== "z") return;
      event.preventDefault();
      if (event.shiftKey) studioStore.getState().redo();
      else studioStore.getState().undo();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editingVector]);

  function openNewVector() {
    setEditingLayerId(null);
    studioStore.getState().selectLayer(null);
    studioStore.getState().setActiveTool("vector");
  }

  function openExistingVector(layerId: string) {
    const layer = studioStore.getState().project.layers.find(
      (candidate) => candidate.id === layerId,
    );
    if (!layer?.sourceState) return;
    setEditingLayerId(layerId);
    studioStore.getState().selectLayer(layerId);
    studioStore.getState().setActiveTool("vector");
  }

  function closeVector() {
    studioStore.getState().setActiveTool("canvas");
    setEditingLayerId(null);
  }

  async function handlePublish(capture: CaptureVectorResult) {
    const state = studioStore.getState();
    const artboard = state.project.artboards.find(
      (candidate) => candidate.id === state.activeArtboardId,
    );
    if (!artboard) throw new Error("The active artboard no longer exists.");
    if (editingLayerId) {
      if (!state.project.layers.some((layer) => layer.id === editingLayerId)) {
        throw new Error("The original layer no longer exists.");
      }
      state.applyLayerArtwork({
        layerId: editingLayerId,
        sourceState: capture.sourceState,
        rendered: capture.rendered,
        renderedAsset: capture.renderedAsset,
      });
    } else {
      const layer = createVectorLayer({
        project: state.project,
        artboardId: artboard.id,
        capture,
      });
      state.addLayer(layer, [capture.renderedAsset]);
    }

    try {
      await persistence.saveNow();
    } catch (error) {
      throw new Error(
        `Artwork is captured in this session, but the project could not be saved. ${
          error instanceof Error ? error.message : ""
        }`.trim(),
      );
    }
  }

  if (!persistence.hydrated) {
    return <LoadingShell />;
  }

  return (
    <div className={`studio-shell${editingVector ? " is-vector-editing" : ""}`}>
      <Topbar
        project={project}
        formats={FORMAT_PRESETS}
        saveStatus={persistence.status}
        saveError={persistence.error}
        canUndo={canUndo}
        canRedo={canRedo}
        editingVector={editingVector}
        onSave={() => {
          void persistence.saveNow().catch(() => undefined);
        }}
        onUndo={() => studioStore.getState().undo()}
        onRedo={() => studioStore.getState().redo()}
        onRename={(name) => studioStore.getState().renameProject(name)}
        onFormatChange={(formatId) => studioStore.getState().setFormat(formatId)}
        onNewProject={() => {
          void persistence
            .newProject()
            .then(() => {
              setEditingLayerId(null);
              studioStore.getState().setActiveTool("canvas");
            })
            .catch(() => undefined);
        }}
      />

      {editingVector && activeArtboard ? (
        <VectorEditor
          key={`${editingLayerId ?? "new"}-${project.id}`}
          project={project}
          artboard={activeArtboard}
          layer={editingLayer}
          onPublish={handlePublish}
          onClose={closeVector}
        />
      ) : (
        <>
          <ToolRail
            layerCount={project.layers.length}
            activeView="canvas"
            onCanvas={() => studioStore.getState().setActiveTool("canvas")}
            onOpenVector={openNewVector}
          />

          <CanvasWorkspace onOpenVector={openNewVector} />

          <aside className="sidepanel" aria-label="Layers and inspector">
            <LayersPanel
              onOpenVector={openNewVector}
              onEditLayer={openExistingVector}
            />
            <InspectorPanel onEditLayer={openExistingVector} />
          </aside>

          <footer className="statusbar">
            <div className="status-left">
              <span className={`status-dot ${persistence.status === "error" ? "is-error" : ""}`} aria-hidden="true" />
              <span>{persistence.error ? "Local save needs attention" : "Local-first project"}</span>
            </div>
            <div className="status-center">
              <span>Vector integration</span>
              <span className="status-divider" />
              <span>
                {project.format.label} · {project.format.width} × {project.format.height}
              </span>
            </div>
            <div className="status-right">
              <span>{project.layers.length} layer{project.layers.length === 1 ? "" : "s"}</span>
              <span className="status-divider" />
              <span>{selectedLayerId ? "Layer selected" : "Shared contracts v1"}</span>
            </div>
          </footer>
        </>
      )}

      {persistence.error ? (
        <div className="storage-banner" role="alert">
          <strong>Project save failed</strong>
          <span>{persistence.error}</span>
          <button
            type="button"
            className="button small"
            onClick={() => void persistence.saveNow().catch(() => undefined)}
          >
            Retry save
          </button>
        </div>
      ) : null}
    </div>
  );
}
