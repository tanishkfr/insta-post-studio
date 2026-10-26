import type { SharedLayer, StudioProject } from "@studio/contracts";
import { useEffect, useRef, useState } from "react";
import { studioStore, useStudioStore } from "../state/projectStore";
import { downloadRenderedAsset } from "../studio/renderedAssets";

interface InspectorProps {
  onEditLayer: (layerId: string) => void;
  onContinueInVector: (layerId: string) => void;
  onUseAsTypePattern: (layerId: string) => void;
  onUseAsImageInput: (layerId: string) => void;
  onGenerateLayouts: () => void;
}

function sourceLabel(layer: SharedLayer): string {
  if (layer.sourceTool === "image") return "Image editor";
  if (layer.sourceTool === "typography") return "Type editor";
  if (layer.sourceTool === "shapes") return "Shapes editor";
  if (layer.sourceTool === "generate") return "Generate editor";
  return "Vector editor";
}

function editLabel(layer: SharedLayer): string {
  if (layer.sourceTool === "image") return "Edit in Image";
  if (layer.sourceTool === "typography") return "Edit in Type";
  if (layer.sourceTool === "shapes") return "Edit in Shapes";
  if (layer.sourceTool === "generate") return "Edit in Generate";
  return "Edit in Vector";
}

function downloadLabel(layer: SharedLayer): string {
  return layer.rendered?.kind === "svg" ? "Download SVG" : "Download PNG";
}

function NumberField({
  id,
  label,
  value,
  min,
  max,
  step = 1,
  disabled,
  suffix,
  onCommit,
}: {
  id: string;
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  suffix?: string;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(Math.round(value * 100) / 100));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(String(Math.round(value * 100) / 100));
  }, [value]);

  function commit() {
    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) {
      setDraft(String(Math.round(value * 100) / 100));
      return;
    }
    let next = parsed;
    if (min !== undefined) next = Math.max(min, next);
    if (max !== undefined) next = Math.min(max, next);
    setDraft(String(Math.round(next * 100) / 100));
    if (next !== value) onCommit(next);
  }

  return (
    <label className="field" htmlFor={id}>
      <span>
        {label}
        {suffix ? <em>{suffix}</em> : null}
      </span>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        value={draft}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onFocus={() => {
          focused.current = true;
        }}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          focused.current = false;
          commit();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          }
          if (event.key === "Escape") {
            setDraft(String(Math.round(value * 100) / 100));
            focused.current = false;
            event.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}

function LayerNameField({ layer }: { layer: SharedLayer }) {
  const [draft, setDraft] = useState(layer.name);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(layer.name);
  }, [layer.id, layer.name]);

  function commit() {
    const name = draft.trim();
    if (name && name !== layer.name) {
      studioStore.getState().updateLayer(layer.id, { name: name.slice(0, 80) });
    } else {
      setDraft(layer.name);
    }
  }

  return (
    <label className="field wide-field" htmlFor="inspector-layer-name">
      <span>Layer name</span>
      <input
        id="inspector-layer-name"
        type="text"
        value={draft}
        maxLength={80}
        onFocus={() => {
          focused.current = true;
        }}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          focused.current = false;
          commit();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") {
            setDraft(layer.name);
            focused.current = false;
            event.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}

function FormatDetails({ project }: { project: StudioProject }) {
  return (
    <dl className="format-spec" aria-label="Project format">
      <div>
        <dt>Format</dt>
        <dd>{project.format.label}</dd>
      </div>
      <div>
        <dt>Dimensions</dt>
        <dd>
          {project.format.width} × {project.format.height} px
        </dd>
      </div>
      <div>
        <dt>Artboards</dt>
        <dd>{project.artboards.length.toString().padStart(2, "0")}</dd>
      </div>
      <div>
        <dt>Background</dt>
        <dd>
          <span className="swatch" aria-hidden="true" />
          #FFFFFF
        </dd>
      </div>
      <div>
        <dt>Storage</dt>
        <dd>IndexedDB · local</dd>
      </div>
    </dl>
  );
}

export function InspectorPanel({
  onEditLayer,
  onContinueInVector,
  onUseAsTypePattern,
  onUseAsImageInput,
  onGenerateLayouts,
}: InspectorProps) {
  const project = useStudioStore((state) => state.project);
  const activeArtboardId = useStudioStore((state) => state.activeArtboardId);
  const selectedLayerId = useStudioStore((state) => state.selectedLayerId);
  const layer = project.layers.find((candidate) => candidate.id === selectedLayerId) ?? null;
  const artboard = project.artboards.find((candidate) => candidate.id === activeArtboardId);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  function updateTransform(patch: Partial<SharedLayer["transform"]>) {
    if (!layer) return;
    studioStore.getState().updateLayer(layer.id, {
      transform: { ...layer.transform, ...patch },
    });
  }

  const aspect =
    layer?.rendered?.width && layer.rendered.height
      ? layer.rendered.width / layer.rendered.height
      : layer
        ? layer.transform.width / Math.max(1, layer.transform.height)
        : 1;

  return (
    <section className="panel inspector-panel" aria-labelledby="inspector-title">
      <header className="panel-head">
        <div>
          <span className="eyebrow">Properties</span>
          <h2 id="inspector-title">Inspector</h2>
        </div>
        <span className="panel-state">{layer ? layer.kind : "Empty"}</span>
      </header>

      {!layer ? (
        <>
          <div className="inspector-empty">
            <strong>Nothing selected</strong>
            <p>Select a layer to edit its transform or reopen its source editor.</p>
          </div>
          <FormatDetails project={project} />
          <p className="inspector-note">
            Layers are saved locally. Vector artwork keeps its native editor state.
          </p>
        </>
      ) : (
        <div className="inspector-content">
          <div className="layer-source">
            <span className="source-mark" aria-hidden="true">
              ◈
            </span>
            <div>
              <span>Source</span>
              <strong>{sourceLabel(layer)}</strong>
            </div>
            <span className="source-revision">
              rev {layer.sourceState?.revision ?? "—"}
            </span>
          </div>

          <LayerNameField layer={layer} />

          <fieldset className="inspector-fields" disabled={layer.locked}>
            <legend>Transform</legend>
            <div className="field-grid">
              <NumberField
                id="layer-x"
                label="X"
                value={layer.transform.x}
                step={1}
                disabled={layer.locked}
                onCommit={(value) => updateTransform({ x: value })}
              />
              <NumberField
                id="layer-y"
                label="Y"
                value={layer.transform.y}
                step={1}
                disabled={layer.locked}
                onCommit={(value) => updateTransform({ y: value })}
              />
              <NumberField
                id="layer-width"
                label="Width"
                value={layer.transform.width}
                min={16}
                step={1}
                disabled={layer.locked}
                onCommit={(value) =>
                  updateTransform({ width: value, height: Math.max(16, value / aspect) })
                }
              />
              <NumberField
                id="layer-height"
                label="Height"
                value={layer.transform.height}
                min={16}
                step={1}
                disabled={layer.locked}
                onCommit={(value) =>
                  updateTransform({ height: value, width: Math.max(16, value * aspect) })
                }
              />
              <NumberField
                id="layer-rotation"
                label="Rotation"
                value={layer.transform.rotationDegrees}
                min={-360}
                max={360}
                step={1}
                suffix="°"
                disabled={layer.locked}
                onCommit={(value) => updateTransform({ rotationDegrees: value })}
              />
              <NumberField
                id="layer-opacity"
                label="Opacity"
                value={Math.round(layer.opacity * 100)}
                min={0}
                max={100}
                step={1}
                suffix="%"
                disabled={layer.locked}
                onCommit={(value) => studioStore.getState().updateLayer(layer.id, { opacity: value / 100 })}
              />
            </div>
            <div className="field-meta">
              <span>
                {Math.round(layer.transform.width)} × {Math.round(layer.transform.height)} px
              </span>
              <span>Artboard {String((artboard?.index ?? 0) + 1).padStart(2, "0")}</span>
            </div>
          </fieldset>

          <div className="inspector-toggles">
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={layer.visible}
                onChange={(event) =>
                  studioStore.getState().updateLayer(layer.id, {
                    visible: event.target.checked,
                  })
                }
              />
              Visible
            </label>
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={layer.locked}
                onChange={(event) =>
                  studioStore.getState().updateLayer(layer.id, {
                    locked: event.target.checked,
                  })
                }
              />
              Locked
            </label>
          </div>

          <div className="inspector-actions">
            <button
              type="button"
              className="button primary"
              onClick={() => onEditLayer(layer.id)}
              disabled={!layer.sourceState}
              data-testid={
                layer.sourceTool === "vector"
                  ? "inspector-edit-vector"
                  : layer.sourceTool === "shapes"
                    ? "inspector-edit-shapes"
                    : layer.sourceTool === "generate"
                      ? "inspector-edit-generate"
                      : "inspector-edit-layer"
              }
            >
              {editLabel(layer)}
            </button>
            <button
              type="button"
              className="button small"
              disabled={!layer.rendered?.assetId}
              onClick={() => {
                if (!layer.rendered?.assetId) return;
                setDownloadError(null);
                const extension =
                  layer.rendered.kind === "svg" ? "svg" : "png";
                void downloadRenderedAsset(
                  layer.rendered.assetId,
                  `${layer.name.replace(/[^\w.-]+/g, "-").toLowerCase()}.${extension}`,
                ).catch((error: unknown) => {
                  setDownloadError(
                    error instanceof Error
                      ? error.message
                      : `Could not download ${extension.toUpperCase()}.`,
                  );
                });
              }}
            >
              {downloadLabel(layer)}
            </button>
          </div>
          {downloadError ? (
            <p className="inline-error" role="alert">
              {downloadError}
            </p>
          ) : null}

          {layer.sourceTool === "image" && layer.rendered?.kind === "image" ? (
            <div className="handoff-actions">
              <span className="handoff-heading">Continue in…</span>
              <button
                type="button"
                className="button small"
                onClick={() => onContinueInVector(layer.id)}
                data-testid="continue-in-vector"
              >
                Continue in Vector
              </button>
              <button
                type="button"
                className="button small"
                onClick={() => onUseAsTypePattern(layer.id)}
                data-testid="use-as-type-pattern"
              >
                Use as Type Pattern
              </button>
              <button
                type="button"
                className="button small"
                onClick={() => onUseAsImageInput(layer.id)}
                data-testid="use-as-image-input"
              >
                Use as Image Input
              </button>
              <p className="handoff-note">
                Vector traces the raster into editable contour lines. Custom Type uses
                it as a pattern motif. The original Image layer stays unchanged.
              </p>
            </div>
          ) : null}

          {layer.sourceTool === "shapes" && layer.rendered?.kind === "image" ? (
            <div className="handoff-actions">
              <span className="handoff-heading">Continue in…</span>
              <button
                type="button"
                className="button small"
                onClick={() => onUseAsImageInput(layer.id)}
                data-testid="shapes-continue-in-image"
              >
                Continue in Image
              </button>
              <button
                type="button"
                className="button small"
                onClick={onGenerateLayouts}
                data-testid="shapes-generate-layouts"
              >
                Generate layouts
              </button>
              <p className="handoff-note">
                The transparent Shapes render becomes a new Image input; the 3D source
                stays editable. Generate receives it as a real layer alongside the rest
                of the composition.
              </p>
            </div>
          ) : null}

          {layer.sourceTool === "generate" ? (
            <div className="handoff-actions">
              <span className="handoff-heading">Composition</span>
              <button
                type="button"
                className="button small"
                onClick={onGenerateLayouts}
                data-testid="generate-reopen-layouts"
              >
                Generate layouts
              </button>
              <p className="handoff-note">
                This is an independent generated background layer. Reopen it to adjust
                the treatment; Apply layout composes the current foreground layers
                without flattening them.
              </p>
            </div>
          ) : null}

          <p className="inspector-note">
            Host transform and stacking order are separate from {sourceLabel(layer)}'s
            internal document and are preserved when artwork is republished.
          </p>
        </div>
      )}
    </section>
  );
}
