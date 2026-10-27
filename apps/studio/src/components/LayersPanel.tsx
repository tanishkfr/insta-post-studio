import type { SharedLayer } from "@studio/contracts";
import { useEffect, useRef, useState } from "react";
import { studioStore, useStudioStore } from "../state/projectStore";
import type { NavToolId } from "../project/defaultProject";
import { layerIcon } from "./ToolRail";
import { StudioEmptyStates } from "../phase5a/components";

type LiveTool = Extract<
  NavToolId,
  "image" | "vector" | "typography" | "shapes" | "generate" | "bend"
>;

interface LayersPanelProps {
  onOpenTool: (tool: LiveTool) => void;
  onEditLayer: (layerId: string) => void;
}

function toolLabel(layer: SharedLayer): string {
  if (layer.sourceTool === "image") return "Image";
  if (layer.sourceTool === "typography") return "Type";
  if (layer.sourceTool === "shapes") return "Shapes";
  if (layer.sourceTool === "generate") return "Generate";
  if (layer.sourceTool === "bend") return "BEND";
  return "Vector";
}

function LayerName({
  layer,
  onCommit,
}: {
  layer: SharedLayer;
  onCommit: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(layer.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setValue(layer.name);
    setEditing(false);
  }, [layer.id, layer.name]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  function commit() {
    const next = value.trim();
    if (next && next !== layer.name) onCommit(next);
    else setValue(layer.name);
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="layer-name-input"
        value={value}
        maxLength={80}
        aria-label="Layer name"
        onChange={(event) => setValue(event.target.value)}
        onBlur={commit}
        onClick={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          }
          if (event.key === "Escape") {
            setValue(layer.name);
            setEditing(false);
          }
        }}
      />
    );
  }

  return (
    <button
      type="button"
      className="layer-name-button"
      onClick={() => studioStore.getState().selectLayer(layer.id)}
      onDoubleClick={(event) => {
        event.stopPropagation();
        setEditing(true);
      }}
      title="Double-click to rename"
    >
      <span className="layer-icon" aria-hidden="true">
        {layerIcon(layer)}
      </span>
      <span className="layer-name-text">{layer.name}</span>
    </button>
  );
}

export function LayersPanel({ onOpenTool, onEditLayer }: LayersPanelProps) {
  const project = useStudioStore((state) => state.project);
  const activeArtboardId = useStudioStore((state) => state.activeArtboardId);
  const selectedLayerId = useStudioStore((state) => state.selectedLayerId);
  const artboard =
    project.artboards.find((candidate) => candidate.id === activeArtboardId) ??
    project.artboards[0];
  const layersById = new Map(project.layers.map((layer) => [layer.id, layer]));
  const orderedLayers = artboard.layerOrder
    .slice()
    .reverse()
    .map((layerId) => layersById.get(layerId))
    .filter((layer): layer is SharedLayer => Boolean(layer));
  const selectedLayer = selectedLayerId ? layersById.get(selectedLayerId) : null;
  const selectedIndex = selectedLayer
    ? artboard.layerOrder.indexOf(selectedLayer.id)
    : -1;

  return (
    <section className="panel layers-panel" aria-labelledby="layers-title">
      <header className="panel-head">
        <div>
          <span className="eyebrow">Structure</span>
          <h2 id="layers-title">Layers</h2>
        </div>
        <span className="panel-count">{project.layers.length}</span>
      </header>

      {orderedLayers.length === 0 ? (
        <div className="empty-layers">
          <span className="empty-layer-glyph" aria-hidden="true">
            ◈
          </span>
          <StudioEmptyStates title="No layers yet" detail="Open any integrated editor to create your first shared layer." />
          <div className="empty-layer-actions">
            <button
              type="button"
              className="button primary small"
              onClick={() => onOpenTool("image")}
            >
              Open Image
            </button>
            <button
              type="button"
              className="button small"
              onClick={() => onOpenTool("vector")}
            >
              Open Vector
            </button>
            <button
              type="button"
              className="button small"
              onClick={() => onOpenTool("typography")}
            >
              Open Type
            </button>
            <button
              type="button"
              className="button small"
              onClick={() => onOpenTool("shapes")}
            >
              Open Shapes
            </button>
          </div>
        </div>
      ) : (
        <ul className="layer-list" aria-label="Project layers">
          {orderedLayers.map((layer) => {
            const selected = layer.id === selectedLayerId;
            const displayIndex = artboard.layerOrder.indexOf(layer.id);
            return (
              <li
                key={layer.id}
                className={`layer-row${selected ? " is-selected" : ""}${layer.visible ? "" : " is-hidden"}`}
                data-testid={`layer-row-${layer.id}`}
                data-layer-id={layer.id}
              >
                <button
                  type="button"
                  className="layer-visibility"
                  aria-label={`${layer.visible ? "Hide" : "Show"} layer ${layer.name}`}
                  aria-pressed={!layer.visible}
                  onClick={() =>
                    studioStore.getState().updateLayer(layer.id, {
                      visible: !layer.visible,
                    })
                  }
                >
                  {layer.visible ? "◉" : "○"}
                </button>

                <LayerName
                  layer={layer}
                  onCommit={(name) =>
                    studioStore.getState().updateLayer(layer.id, { name })
                  }
                />

                <div className="layer-row-actions">
                  {selected ? (
                    <>
                      <button
                        type="button"
                        className="mini-button"
                        aria-label={`Move layer ${layer.name} up`}
                        disabled={displayIndex >= artboard.layerOrder.length - 1}
                        onClick={() =>
                          studioStore.getState().moveLayer(layer.id, "up")
                        }
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="mini-button"
                        aria-label={`Move layer ${layer.name} down`}
                        disabled={displayIndex <= 0}
                        onClick={() =>
                          studioStore.getState().moveLayer(layer.id, "down")
                        }
                      >
                        ↓
                      </button>
                    </>
                  ) : null}
                  <button
                    type="button"
                    className="layer-lock"
                    aria-label={`${layer.locked ? "Unlock" : "Lock"} layer ${layer.name}`}
                    aria-pressed={layer.locked}
                    onClick={() =>
                      studioStore.getState().updateLayer(layer.id, {
                        locked: !layer.locked,
                      })
                    }
                  >
                    {layer.locked ? "▪" : "▫"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <footer className="layer-actions">
        <button
          type="button"
          className="button small"
          onClick={() => {
            if (selectedLayer) onEditLayer(selectedLayer.id);
            else onOpenTool("image");
          }}
        >
          {selectedLayer ? `Edit in ${toolLabel(selectedLayer)}` : "Create artwork"}
        </button>
        <button
          type="button"
          className="mini-button"
          aria-label="Duplicate selected layer"
          disabled={!selectedLayer}
          onClick={() => {
            if (selectedLayer) studioStore.getState().duplicateLayer(selectedLayer.id);
          }}
        >
          ⧉
        </button>
        <button
          type="button"
          className="mini-button danger"
          aria-label="Delete selected layer"
          disabled={!selectedLayer}
          onClick={() => {
            if (selectedLayer) studioStore.getState().deleteLayer(selectedLayer.id);
          }}
        >
          ×
        </button>
      </footer>
    </section>
  );
}
