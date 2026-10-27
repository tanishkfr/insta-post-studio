import type { Artboard, SharedLayer, StudioProject } from "@studio/contracts";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  downloadBlob,
  exportArtboardPng,
  exportCarouselZip,
  orderedArtboards,
  studioSlug,
  type ArtboardExportResult,
  type CarouselExportResult,
  type ExportBackground,
} from "../studio/compositionExport";
import { CompositionRenderError } from "../studio/compositionRenderer";

type ExportScope = "active" | "all";
type ExportStatus = "idle" | "working" | "success" | "error" | "cancelled";

interface ExportDialogProps {
  project: StudioProject;
  artboard: Artboard;
  onClose: () => void;
}

function isBendLayer(layer: SharedLayer): boolean {
  return layer.kind === "video" || layer.sourceTool === "bend";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Number((bytes / 1024).toFixed(1))} KB`;
  return `${Number((bytes / (1024 * 1024)).toFixed(2))} MB`;
}

function errorMessage(error: unknown): string {
  if (error instanceof CompositionRenderError) return error.message;
  if (error instanceof Error) return error.message;
  return "The composition could not be exported.";
}

export function ExportDialog({ project, artboard, onClose }: ExportDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [scope, setScope] = useState<ExportScope>("active");
  const [background, setBackground] = useState<ExportBackground>("artboard");
  const [status, setStatus] = useState<ExportStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("Ready to export");
  const [error, setError] = useState<string | null>(null);
  const [singleResult, setSingleResult] = useState<ArtboardExportResult | null>(null);
  const [carouselResult, setCarouselResult] = useState<CarouselExportResult | null>(null);

  const artboards = useMemo(() => orderedArtboards(project), [project]);
  const activeLayers = useMemo(
    () => project.layers.filter((layer) => layer.artboardId === artboard.id),
    [project.layers, artboard.id],
  );
  const bendLayers = useMemo(
    () =>
      (scope === "active"
        ? activeLayers
        : project.layers.filter((layer) =>
            artboards.some((candidate) => candidate.id === layer.artboardId),
          )
      ).filter(isBendLayer),
    [scope, activeLayers, project.layers, artboards],
  );
  const working = status === "working";

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    const close = dialog.querySelector<HTMLButtonElement>("[data-export-close]");
    close?.focus();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );

  function close() {
    if (working) return;
    onClose();
  }

  function cancelExport() {
    abortRef.current?.abort();
  }

  async function startExport() {
    if (working) return;
    setStatus("working");
    setError(null);
    setProgress(0);
    setStage(scope === "all" ? "Preparing artboards" : "Preparing artboard");
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      if (scope === "all") {
        const result = await exportCarouselZip({
          project,
          background,
          signal: controller.signal,
          onProgress: (value, label) => {
            setProgress(Math.min(1, Math.max(0, value)));
            setStage(label);
          },
        });
        if (controller.signal.aborted) return;
        downloadBlob(result.blob, result.filename);
        setCarouselResult(result);
        setSingleResult(null);
      } else {
        const result = await exportArtboardPng({
          project,
          artboard,
          background,
          signal: controller.signal,
          onProgress: (value, label) => {
            setProgress(Math.min(1, Math.max(0, value)));
            setStage(label);
          },
        });
        if (controller.signal.aborted) return;
        downloadBlob(
          result.blob,
          `${studioSlug(project.name)}-${studioSlug(artboard.name, "artboard")}-${result.width}x${result.height}.png`,
        );
        setSingleResult(result);
        setCarouselResult(null);
      }
      setProgress(1);
      setStatus("success");
      setStage("Export complete");
    } catch (caught) {
      if (controller.signal.aborted) {
        setStatus("cancelled");
        setStage("Export cancelled");
        return;
      }
      setStatus("error");
      setError(errorMessage(caught));
      setStage("Export failed");
    } finally {
      abortRef.current = null;
    }
  }

  const filename =
    scope === "all"
      ? `${studioSlug(project.name)}-carousel-${artboards.length}-artboards.zip`
      : `${studioSlug(project.name)}-${studioSlug(artboard.name, "artboard")}-${artboard.width}x${artboard.height}.png`;

  return (
    <dialog
      ref={dialogRef}
      className="export-dialog"
      aria-labelledby="export-dialog-title"
      data-testid="export-dialog"
      onCancel={(event) => {
        event.preventDefault();
        if (working) {
          cancelExport();
        } else {
          close();
        }
      }}
    >
      <header className="dialog-head">
        <div>
          <span className="eyebrow">Final output</span>
          <h2 id="export-dialog-title">Export composition</h2>
        </div>
        <button
          type="button"
          className="mini-button"
          data-export-close=""
          onClick={close}
          disabled={working}
          aria-label="Close export dialog"
        >
          ×
        </button>
      </header>

      <p className="dialog-copy">
        Render the real layer stack at the artboard&apos;s native resolution. This is a
        static PNG export from Studio, not a screenshot of the canvas.
      </p>

      <div className="export-summary" aria-label="Export target">
        <div>
          <span>Artboard</span>
          <strong>{scope === "all" ? `${artboards.length} artboards` : artboard.name}</strong>
        </div>
        <div>
          <span>Dimensions</span>
          <strong>
            {scope === "all"
              ? artboards.map((candidate) => `${candidate.width}×${candidate.height}`).filter((value, index, all) => all.indexOf(value) === index).join(" · ")
              : `${artboard.width}×${artboard.height} px`}
          </strong>
        </div>
        <div>
          <span>Visible layers</span>
          <strong>
            {scope === "all"
              ? project.layers.filter((layer) => layer.visible).length
              : activeLayers.filter((layer) => layer.visible).length}
          </strong>
        </div>
      </div>

      {artboards.length > 1 ? (
        <fieldset className="export-fieldset">
          <legend>Export</legend>
          <label>
            <input
              type="radio"
              name="export-scope"
              value="active"
              checked={scope === "active"}
              disabled={working}
              onChange={() => setScope("active")}
              data-testid="export-scope-active"
            />
            <span>
              Current artboard
              <small>{artboard.name} · one PNG</small>
            </span>
          </label>
          <label>
            <input
              type="radio"
              name="export-scope"
              value="all"
              checked={scope === "all"}
              disabled={working}
              onChange={() => setScope("all")}
              data-testid="export-scope-all"
            />
            <span>
              All artboards
              <small>{artboards.length} ordered PNGs in a ZIP with a manifest</small>
            </span>
          </label>
        </fieldset>
      ) : null}

      <fieldset className="export-fieldset">
        <legend>Background</legend>
        <label>
          <input
            type="radio"
            name="export-background"
            value="artboard"
            checked={background === "artboard"}
            disabled={working}
            onChange={() => setBackground("artboard")}
            data-testid="export-background-artboard"
          />
          <span>
            Authored background
            <small>
              {artboard.background.kind === "transparent"
                ? "This artboard has no authored fill, so the PNG stays transparent."
                : artboard.background.kind === "asset"
                  ? "Use the artboard background asset."
                  : `Solid ${artboard.background.color ?? "#ffffff"}.`}
            </small>
          </span>
        </label>
        <label>
          <input
            type="radio"
            name="export-background"
            value="transparent"
            checked={background === "transparent"}
            disabled={working}
            onChange={() => setBackground("transparent")}
            data-testid="export-background-transparent"
          />
          <span>
            Transparent
            <small>Preserve alpha; no background fill is added. Useful for overlays.</small>
          </span>
        </label>
      </fieldset>

      <div className="export-bend-note" role="note" data-testid="export-bend-note">
        <strong>BEND layers are static in this export.</strong>
        <span>
          {bendLayers.length === 0
            ? "No BEND video layers are in this export."
            : `${bendLayers.length} BEND video layer${bendLayers.length === 1 ? "" : "s"} use the saved poster frame. No animation or audio is included here; open the layer in BEND for full-quality video export.`}
        </span>
        {bendLayers.length > 0 ? (
          <ul>
            {bendLayers.slice(0, 4).map((layer) => (
              <li key={layer.id}>
                {layer.name}
                {layer.poster?.assetId ? "" : " · no poster saved"}
              </li>
            ))}
            {bendLayers.length > 4 ? <li>+{bendLayers.length - 4} more</li> : null}
          </ul>
        ) : null}
      </div>

      {status === "working" || status === "success" ? (
        <div className="export-progress" data-testid="export-progress">
          <div className="export-progress-head">
            <span role="status" aria-live="polite">
              {stage}
            </span>
            <strong>{Math.round(progress * 100)}%</strong>
          </div>
          <div
            className="progress-track"
            role="progressbar"
            aria-label="Export progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
          >
            <i style={{ transform: `scaleX(${progress})` }} />
          </div>
          {status === "working" ? (
            <button type="button" className="button small" onClick={cancelExport} data-testid="export-cancel">
              Cancel export
            </button>
          ) : null}
        </div>
      ) : null}

      {status === "error" && error ? (
        <p className="publish-error export-error" role="alert" data-testid="export-error">
          <strong>Export failed</strong>
          <span>{error}</span>
        </p>
      ) : null}

      {status === "cancelled" ? (
        <p className="inline-note" role="status">
          Export cancelled. No file was downloaded and the project was not changed.
        </p>
      ) : null}

      {status === "success" && singleResult ? (
        <div className="export-success" role="status" data-testid="export-success">
          <strong>PNG downloaded</strong>
          <span>
            {singleResult.width}×{singleResult.height} · {formatBytes(singleResult.byteLength)} ·{" "}
            {singleResult.drawnLayerIds.length} layer{singleResult.drawnLayerIds.length === 1 ? "" : "s"}
            {singleResult.posterLayerIds.length > 0
              ? ` · ${singleResult.posterLayerIds.length} poster frame${singleResult.posterLayerIds.length === 1 ? "" : "s"}`
              : ""}
            {singleResult.backgroundHex === null ? " · transparent" : ""}
          </span>
        </div>
      ) : null}

      {status === "success" && carouselResult ? (
        <div className="export-success" role="status" data-testid="export-success">
          <strong>ZIP downloaded</strong>
          <span>
            {carouselResult.artboards.length} artboards · {formatBytes(carouselResult.blob.size)} ·{" "}
            manifest.json included
          </span>
          <span className="export-file-list">
            {carouselResult.manifest.artboards.map((entry) => (
              <span key={entry.id}>
                {entry.file} · {entry.width}×{entry.height}
              </span>
            ))}
          </span>
        </div>
      ) : null}

      <p className="export-filename" aria-label="Download filename">
        <span>File</span>
        <code>{filename}</code>
      </p>

      <footer className="dialog-actions">
        <button type="button" className="button" onClick={close} disabled={working}>
          Close
        </button>
        <button
          type="button"
          className="button primary"
          onClick={() => void startExport()}
          disabled={working}
          data-testid="export-start"
        >
          {working
            ? "Exporting…"
            : scope === "all"
              ? `Export ${artboards.length} artboards (.zip)`
              : "Export PNG"}
        </button>
      </footer>
    </dialog>
  );
}
