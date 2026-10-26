import type { LayerProvenance, StudioProject, SourceToolId } from "@studio/contracts";
import { useEffect, useState } from "react";
import { createRasterLayer } from "./adapters/session/layerFactory";
import type { ToolSessionCapture } from "./adapters/session/toolSession";
import { loadRasterInputForLayer } from "./adapters/session/inputAssets";
import { typographyModeFromLayer, type TypographyMode } from "./adapters/typography/typographySourceState";
import { createVectorLayer } from "./adapters/vector/vectorLayer";
import { CanvasWorkspace } from "./components/CanvasWorkspace";
import { GenerateEditor } from "./components/GenerateEditor";
import { ImageEditor } from "./components/ImageEditor";
import { InspectorPanel } from "./components/InspectorPanel";
import { LayersPanel } from "./components/LayersPanel";
import { ShapesEditor } from "./components/ShapesEditor";
import { ToolRail } from "./components/ToolRail";
import { Topbar } from "./components/Topbar";
import { TypeEditor } from "./components/TypeEditor";
import { VectorEditor } from "./components/VectorEditor";
import { nowIso } from "./lib/ids";
import { FORMAT_PRESETS } from "./project/defaultProject";
import { studioStore, useStudioStore } from "./state/projectStore";
import type { GeneratedLayoutTarget } from "./state/projectStore";
import { useProjectPersistence } from "./state/useProjectPersistence";

type EditableTool = "image" | "vector" | "typography" | "shapes" | "generate";

function LoadingShell() {
  return (
    <div className="loading-shell" role="status">
      <div className="loading-mark" aria-hidden="true">
        ◈
      </div>
      <span className="eyebrow">Studio 2.0</span>
      <strong>Opening local project</strong>
      <p>Restoring the document, layers and Image / Vector / Type / Shapes / Generate source references from IndexedDB.</p>
    </div>
  );
}

function isEditableTool(tool: SourceToolId | "canvas"): tool is EditableTool {
  return (
    tool === "image" ||
    tool === "vector" ||
    tool === "typography" ||
    tool === "shapes" ||
    tool === "generate"
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
  const [inputLayerId, setInputLayerId] = useState<string | null>(null);
  const [typeMode, setTypeMode] = useState<TypographyMode>("library");
  const [handoffError, setHandoffError] = useState<string | null>(null);

  const editingTool = isEditableTool(activeTool) ? activeTool : null;
  const activeArtboard =
    project.artboards.find((artboard) => artboard.id === activeArtboardId) ??
    project.artboards[0];
  const editingLayer = editingLayerId
    ? project.layers.find((layer) => layer.id === editingLayerId) ?? null
    : null;
  const inputLayer = inputLayerId
    ? project.layers.find((layer) => layer.id === inputLayerId) ?? null
    : null;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (editingTool) return;
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
  }, [editingTool]);

  function resetEditingState() {
    setEditingLayerId(null);
    setInputLayerId(null);
    setHandoffError(null);
    studioStore.getState().setActiveTool("canvas");
  }

  function openNewTool(tool: EditableTool) {
    setEditingLayerId(null);
    setInputLayerId(null);
    setHandoffError(null);
    setTypeMode("library");
    studioStore.getState().selectLayer(null);
    studioStore.getState().setActiveTool(tool);
  }

  function openExistingTool(layerId: string) {
    const layer = studioStore.getState().project.layers.find(
      (candidate) => candidate.id === layerId,
    );
    if (!layer?.sourceState || !isEditableTool(layer.sourceTool)) {
      setHandoffError("This layer does not have a supported editable source document.");
      return;
    }
    setEditingLayerId(layerId);
    setInputLayerId(null);
    setHandoffError(null);
    setTypeMode(typographyModeFromLayer(layer));
    studioStore.getState().selectLayer(layerId);
    studioStore.getState().setActiveTool(layer.sourceTool);
  }

  async function startHandoff(layerId: string, target: EditableTool) {
    const state = studioStore.getState();
    const layer = state.project.layers.find((candidate) => candidate.id === layerId);
    if (!layer) return;
    setHandoffError(null);
    try {
      await loadRasterInputForLayer(
        state.project,
        layerId,
        target === "vector" ? "rendered-input" : "reference",
      );
    } catch (error) {
      setHandoffError(
        error instanceof Error
          ? error.message
          : "That layer cannot be used as a raster input.",
      );
      return;
    }
    setEditingLayerId(null);
    setInputLayerId(layerId);
    setTypeMode(target === "typography" ? "custom" : "library");
    state.selectLayer(layerId);
    state.setActiveTool(target);
  }

  function useAsImageInput(layerId: string) {
    void startHandoff(layerId, "image");
  }

  function provenanceForNewLayer(): LayerProvenance | undefined {
    const source = inputLayer;
    if (!source) return undefined;
    return {
      relation: "derived-from",
      sourceLayerId: source.id,
      sourceAssetId: source.rendered?.assetId,
      createdAt: nowIso(),
    };
  }

  async function handlePublish(capture: ToolSessionCapture) {
    const state = studioStore.getState();
    const artboard = state.project.artboards.find(
      (candidate) => candidate.id === state.activeArtboardId,
    );
    if (!artboard) throw new Error("The active artboard no longer exists.");
    const tool = capture.sourceState.tool;
    try {
      if (editingLayerId) {
        if (!state.project.layers.some((layer) => layer.id === editingLayerId)) {
          throw new Error("The original layer no longer exists.");
        }
        state.applyLayerArtwork({
          layerId: editingLayerId,
          sourceState: capture.sourceState,
          rendered: capture.rendered,
          renderedAsset: capture.renderedAsset,
          sourceAssets: capture.sourceAssets,
          tags: capture.tags,
        });
      } else if (tool === "vector") {
        const layer = createVectorLayer({
          project: state.project,
          artboardId: artboard.id,
          capture,
          provenance: provenanceForNewLayer(),
          tags: capture.tags,
        });
        state.addLayer(layer, [capture.renderedAsset, ...(capture.sourceAssets ?? [])]);
      } else if (tool === "image" || tool === "typography" || tool === "shapes") {
        const layer = createRasterLayer({
          project: state.project,
          artboardId: artboard.id,
          capture,
          kind: tool === "image" ? "image" : tool === "typography" ? "typography" : "shapes",
          sourceTool: tool,
          toolVersion: `${tool}@${capture.sourceState.toolStateVersion}`,
          provenance: provenanceForNewLayer(),
          tags: capture.tags,
        });
        state.addLayer(layer, [capture.renderedAsset, ...(capture.sourceAssets ?? [])]);
      } else if (tool === "generate") {
        const layer = createRasterLayer({
          project: state.project,
          artboardId: artboard.id,
          capture,
          kind: "generated-layout",
          sourceTool: "generate",
          toolVersion: `generate@${capture.sourceState.toolStateVersion}`,
          tags: capture.tags,
        });
        // A generated treatment is a background by default. The user can still
        // reorder it at any time; the foreground layers remain untouched.
        state.addLayer(
          layer,
          [capture.renderedAsset, ...(capture.sourceAssets ?? [])],
          { position: "back" },
        );
      } else {
        throw new Error(`No Studio layer factory exists for ${String(tool)}.`);
      }

      await persistence.saveNow();
    } catch (error) {
      // The commit was in-memory only. Roll it back so a failed durable write
      // cannot leave a phantom/duplicate layer or replace an older source ref.
      studioStore.getState().rollbackLastCommit();
      throw new Error(
        `Artwork is captured in this session, but the project could not be saved. The previous durable layer was preserved. ${
          error instanceof Error ? error.message : ""
        }`.trim(),
      );
    }
    setInputLayerId(null);
  }

  async function handleApplyGenerateLayout(
    artboardId: string,
    targets: GeneratedLayoutTarget[],
  ): Promise<number> {
    const applied = studioStore.getState().applyGeneratedLayout(artboardId, targets);
    if (applied === 0) return 0;
    try {
      await persistence.saveNow();
    } catch (error) {
      studioStore.getState().rollbackLastCommit();
      throw new Error(
        `The generated layout could not be saved, so the previous composition was restored. ${
          error instanceof Error ? error.message : ""
        }`.trim(),
      );
    }
    return applied;
  }

  async function handleUndoGenerateLayout(): Promise<void> {
    studioStore.getState().undo();
    try {
      await persistence.saveNow();
    } catch (error) {
      throw new Error(
        `The layout was undone in memory but could not be saved. ${
          error instanceof Error ? error.message : ""
        }`.trim(),
      );
    }
  }

  if (!persistence.hydrated) {
    return <LoadingShell />;
  }

  return (
    <div
      className={`studio-shell${editingTool ? " is-vector-editing is-tool-editing" : ""}`}
    >
      <Topbar
        project={project}
        formats={FORMAT_PRESETS}
        saveStatus={persistence.status}
        saveError={persistence.error}
        canUndo={canUndo}
        canRedo={canRedo}
        editingTool={editingTool}
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
            .then(() => resetEditingState())
            .catch(() => undefined);
        }}
      />

      {editingTool === "vector" && activeArtboard ? (
        <VectorEditor
          key={`vector-${editingLayerId ?? "new"}-${project.id}-${inputLayerId ?? ""}`}
          project={project}
          artboard={activeArtboard}
          layer={editingLayer}
          inputLayerId={inputLayerId}
          onPublish={handlePublish}
          onClose={resetEditingState}
        />
      ) : editingTool === "image" && activeArtboard ? (
        <ImageEditor
          key={`image-${editingLayerId ?? "new"}-${project.id}-${inputLayerId ?? ""}`}
          project={project}
          artboard={activeArtboard}
          layer={editingLayer}
          inputLayerId={inputLayerId}
          onPublish={handlePublish}
          onClose={resetEditingState}
        />
      ) : editingTool === "typography" && activeArtboard ? (
        <TypeEditor
          key={`type-${editingLayerId ?? "new"}-${project.id}-${inputLayerId ?? ""}`}
          project={project}
          artboard={activeArtboard}
          layer={editingLayer}
          initialMode={typeMode}
          inputLayerId={inputLayerId}
          onPublish={handlePublish}
          onClose={resetEditingState}
        />
      ) : editingTool === "shapes" && activeArtboard ? (
        <ShapesEditor
          key={`shapes-${editingLayerId ?? "new"}-${project.id}`}
          project={project}
          artboard={activeArtboard}
          layer={editingLayer}
          onPublish={handlePublish}
          onClose={resetEditingState}
        />
      ) : editingTool === "generate" && activeArtboard ? (
        <GenerateEditor
          key={`generate-${editingLayerId ?? "new"}-${project.id}`}
          project={project}
          artboard={activeArtboard}
          layer={editingLayer}
          onPublish={handlePublish}
          onApplyLayout={handleApplyGenerateLayout}
          onUndoLayout={handleUndoGenerateLayout}
          onClose={resetEditingState}
        />
      ) : (
        <>
          <ToolRail
            layerCount={project.layers.length}
            activeView="canvas"
            onCanvas={() => studioStore.getState().setActiveTool("canvas")}
            onOpenTool={openNewTool}
          />

          <CanvasWorkspace onOpenTool={openNewTool} />

          <aside className="sidepanel" aria-label="Layers and inspector">
            <LayersPanel
              onOpenTool={openNewTool}
              onEditLayer={openExistingTool}
            />
            <InspectorPanel
              onEditLayer={openExistingTool}
              onContinueInVector={(layerId) => void startHandoff(layerId, "vector")}
              onUseAsTypePattern={(layerId) => void startHandoff(layerId, "typography")}
              onUseAsImageInput={useAsImageInput}
              onGenerateLayouts={() => openNewTool("generate")}
            />
          </aside>

          <footer className="statusbar">
            <div className="status-left">
              <span className={`status-dot ${persistence.status === "error" ? "is-error" : ""}`} aria-hidden="true" />
              <span>{persistence.error ? "Local save needs attention" : "Local-first project"}</span>
            </div>
            <div className="status-center">
              <span>Image · Vector · Type · Shapes · Generate</span>
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

      {handoffError ? (
        <div className="storage-banner handoff-banner" role="alert">
          <strong>Could not start handoff</strong>
          <span>{handoffError}</span>
          <button
            type="button"
            className="button small"
            onClick={() => setHandoffError(null)}
          >
            Dismiss
          </button>
        </div>
      ) : null}

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
