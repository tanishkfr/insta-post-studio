import JSZip from "jszip";
import type { Artboard, StudioProject } from "@studio/contracts";
import { sha256Hex } from "../lib/hash";
import { nowIso } from "../lib/ids";
import {
  renderCompositionToPng,
  type CompositionBackgroundPolicy,
  type CompositionLayerReport,
  type CompositionWarning,
} from "./compositionRenderer";

export type ExportBackground = Extract<
  CompositionBackgroundPolicy,
  "artboard" | "transparent"
>;

export interface ArtboardExportResult {
  artboardId: string;
  artboardName: string;
  index: number;
  width: number;
  height: number;
  backgroundHex: string | null;
  hasTransparency: boolean;
  blob: Blob;
  byteLength: number;
  contentHash: string;
  layers: CompositionLayerReport[];
  drawnLayerIds: string[];
  posterLayerIds: string[];
  warnings: CompositionWarning[];
}

export interface CompositionExportManifest {
  format: "studio-composition-export";
  formatVersion: 1;
  projectId: string;
  projectName: string;
  projectFormat: { id: string; label: string; width: number; height: number };
  generatedAt: string;
  background: ExportBackground;
  artboards: Array<{
    index: number;
    id: string;
    name: string;
    file: string;
    width: number;
    height: number;
    byteLength: number;
    sha256: string;
    layerCount: number;
    posterLayerIds: string[];
    hasTransparency: boolean;
  }>;
  notes: string[];
}

export interface CarouselExportResult {
  blob: Blob;
  filename: string;
  manifest: CompositionExportManifest;
  artboards: ArtboardExportResult[];
}

export class CompositionExportError extends Error {
  readonly code = "COMPOSITION_EXPORT_ERROR" as const;

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "CompositionExportError";
  }
}

export function studioSlug(value: string, fallback = "studio"): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || fallback;
}

export function artboardSequenceFile(index: number, name: string, width: number, height: number): string {
  const sequence = String(index + 1).padStart(2, "0");
  return `${sequence}-${studioSlug(name, "artboard")}-${width}x${height}.png`;
}

export async function exportArtboardPng(options: {
  project: StudioProject;
  artboard: Artboard;
  background: ExportBackground;
  signal?: AbortSignal;
  onProgress?: (value: number, label: string) => void;
}): Promise<ArtboardExportResult> {
  const { project, artboard, background } = options;
  const rendered = await renderCompositionToPng({
    project,
    artboard,
    background,
    strict: true,
    signal: options.signal,
    onProgress: (progress) => {
      const value =
        progress.total > 0 ? progress.completed / progress.total : progress.stage === "encode" ? 1 : 0;
      options.onProgress?.(value, progress.label);
    },
  });
  const bytes = new Uint8Array(await rendered.png.arrayBuffer());
  const contentHash = await sha256Hex(bytes);
  options.onProgress?.(1, "Artboard ready");
  return {
    artboardId: artboard.id,
    artboardName: artboard.name,
    index: artboard.index,
    width: rendered.width,
    height: rendered.height,
    backgroundHex: rendered.backgroundHex,
    hasTransparency: rendered.hasTransparency,
    blob: rendered.png,
    byteLength: rendered.png.size,
    contentHash,
    layers: rendered.layers,
    drawnLayerIds: rendered.drawnLayerIds,
    posterLayerIds: rendered.posterLayerIds,
    warnings: rendered.warnings,
  };
}

export function orderedArtboards(project: StudioProject): Artboard[] {
  return project.artboards
    .slice()
    .sort((left, right) => left.index - right.index);
}

export async function exportCarouselZip(options: {
  project: StudioProject;
  background: ExportBackground;
  signal?: AbortSignal;
  onProgress?: (value: number, label: string) => void;
}): Promise<CarouselExportResult> {
  const { project, background } = options;
  const artboards = orderedArtboards(project);
  if (artboards.length === 0) {
    throw new CompositionExportError("This project has no artboards to export.");
  }

  const results: ArtboardExportResult[] = [];
  for (let index = 0; index < artboards.length; index += 1) {
    throwIfAborted(options.signal);
    const artboard = artboards[index];
    const result = await exportArtboardPng({
      project,
      artboard,
      background,
      signal: options.signal,
      onProgress: (value, label) => {
        const overall = (index + value) / artboards.length;
        options.onProgress?.(overall, `${artboard.name}: ${label}`);
      },
    });
    results.push(result);
  }

  throwIfAborted(options.signal);
  options.onProgress?.(0.92, "Writing ZIP archive");

  const zip = new JSZip();
  const manifest: CompositionExportManifest = {
    format: "studio-composition-export",
    formatVersion: 1,
    projectId: project.id,
    projectName: project.name,
    projectFormat: {
      id: project.format.id,
      label: project.format.label,
      width: project.format.width,
      height: project.format.height,
    },
    generatedAt: nowIso(),
    background,
    artboards: results.map((result) => ({
      index: result.index,
      id: result.artboardId,
      name: result.artboardName,
      file: artboardSequenceFile(result.index, result.artboardName, result.width, result.height),
      width: result.width,
      height: result.height,
      byteLength: result.byteLength,
      sha256: result.contentHash,
      layerCount: result.drawnLayerIds.length,
      posterLayerIds: result.posterLayerIds,
      hasTransparency: result.hasTransparency,
    })),
    notes: [
      "One PNG per artboard, ordered by artboard index (bottom of the Studio artboard list first).",
      "BEND video layers use their saved poster frame. This package is a static carousel, not a motion export.",
      background === "transparent"
        ? "Transparent background was requested; alpha is preserved where no authored background exists."
        : "The authored artboard background was used.",
    ],
  };

  // Add files in manifest order so archive listing is deterministic.
  for (const [index, result] of results.entries()) {
    const entry = manifest.artboards[index];
    zip.file(entry.file, result.blob);
  }
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));

  const blob = await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
    mimeType: "application/zip",
  });
  throwIfAborted(options.signal);

  // Reopen the real archive bytes and verify every entry before the UI offers
  // it as a download. A missing or truncated slide must not pass silently.
  const verified = await JSZip.loadAsync(await blob.arrayBuffer());
  const expectedEntries = new Set(["manifest.json", ...manifest.artboards.map((entry) => entry.file)]);
  const actualEntries = Object.keys(verified.files).filter((name) => !verified.files[name].dir);
  if (actualEntries.length !== expectedEntries.size) {
    throw new CompositionExportError(
      `The carousel ZIP contains ${actualEntries.length} files, expected ${expectedEntries.size}.`,
    );
  }
  for (const name of expectedEntries) {
    if (!verified.files[name]) {
      throw new CompositionExportError(`The carousel ZIP is missing ${name}.`);
    }
  }
  for (const entry of manifest.artboards) {
    const bytes = await verified.files[entry.file].async("uint8array");
    const hash = await sha256Hex(bytes);
    if (hash !== entry.sha256 || bytes.byteLength !== entry.byteLength) {
      throw new CompositionExportError(
        `The carousel entry ${entry.file} failed its integrity check.`,
      );
    }
  }
  const manifestBytes = await verified.files["manifest.json"].async("uint8array");
  const reread = JSON.parse(new TextDecoder().decode(manifestBytes)) as CompositionExportManifest;
  if (reread.artboards.length !== manifest.artboards.length) {
    throw new CompositionExportError("The carousel manifest does not match the archive.");
  }

  options.onProgress?.(1, "Carousel ZIP ready");
  return {
    blob,
    filename: `${studioSlug(project.name)}-carousel-${artboards.length}-artboards.zip`,
    manifest,
    artboards: results,
  };
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new CompositionExportError("The composition export was cancelled.");
  }
}
