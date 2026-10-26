import type { ToolSourceStatePayload } from "@studio/contracts";

export const BEND_TOOL_STATE_VERSION = "1.0.0";
export const BEND_TOOL_STATE_MIME = "application/vnd.studio.bend+json";
export const BEND_PACKAGE_MIME = "application/vnd.bend.project";
export type BendAspectPreset = "4:5" | "1:1" | "9:16" | "16:9";

export interface BendPackageMediaReference {
  id: string;
  name: string;
  mimeType: string;
  byteLength: number;
  sha256: string | null;
  width?: number;
  height?: number;
  durationSeconds?: number;
}

export interface BendPackageReference {
  assetId: string;
  format: "bendpkg";
  formatVersion: number;
  projectId: string;
  sourceRevision: string;
  byteLength: number;
  sha256: string;
  media: BendPackageMediaReference[];
}

export interface BendSourceStateV1 {
  tool: "bend";
  schemaVersion: typeof BEND_TOOL_STATE_VERSION;
  savedAt: string;
  bendProjectId: string;
  projectName: string;
  sourceRevision: string;
  aspectPreset: BendAspectPreset;
  canvas: { width: number; height: number; fps: number; duration: number };
  durationSeconds: number;
  package: BendPackageReference;
  exportQuality: "preview" | "final" | null;
  isPreview: boolean;
  video: {
    mimeType: string;
    codec: string | null;
    width: number;
    height: number;
    durationSeconds: number;
    fps: number;
    container: string;
  } | null;
  poster: { width: number; height: number; timestamp: number } | null;
  audio: { present: boolean; message?: string } | null;
  host: {
    mode: "new" | "edit" | "static-handoff";
    editingLayerId: string | null;
    fitDecision: "fit" | "reformat" | null;
    sourceLayerIds: string[];
    sourceRevisions: Record<string, number>;
    handoff?: Record<string, unknown>;
  };
}

/** Ephemeral handoff fields added by the host immediately before iframe restore. */
export interface BendRestorePayload extends BendSourceStateV1 {
  package: BendPackageReference & { url: string };
}

export class BendSourceStateError extends Error {
  readonly code = "BEND_SOURCE_STATE_ERROR" as const;

  constructor(message: string) {
    super(message);
    this.name = "BendSourceStateError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(message: string): never {
  throw new BendSourceStateError(message);
}

function text(content: string | Uint8Array): string {
  return typeof content === "string" ? content : new TextDecoder().decode(content);
}

function positive(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    fail(`${label} must be a finite positive number.`);
  }
  return value;
}

function nonEmpty(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) fail(`${label} is required.`);
  return value;
}

function hash(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    fail(`${label} must be a lowercase SHA-256 hash.`);
  }
  return value;
}

export function expectedBendAspect(
  width: number,
  height: number,
): { preset: BendAspectPreset; label: string } {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    fail("The host artboard dimensions are invalid.");
  }
  const ratio = width / height;
  if (Math.abs(ratio - 0.8) <= 0.01) return { preset: "4:5", label: "4:5" };
  if (Math.abs(ratio - 1) <= 0.01) return { preset: "1:1", label: "1:1" };
  if (Math.abs(ratio - 9 / 16) <= 0.01) return { preset: "9:16", label: "9:16" };
  fail(`Studio format ${width}×${height} has no BEND preset.`);
}

export function bendAspectLabel(width: number, height: number): string {
  const ratio = width / height;
  if (Math.abs(ratio - 0.8) <= 0.01) return "4:5";
  if (Math.abs(ratio - 1) <= 0.01) return "1:1";
  if (Math.abs(ratio - 9 / 16) <= 0.01) return "9:16";
  if (Math.abs(ratio - 16 / 9) <= 0.01) return "16:9";
  return `${Math.round(width)}×${Math.round(height)}`;
}

export function bendsAspectMatches(
  source: Pick<BendSourceStateV1, "canvas">,
  width: number,
  height: number,
): boolean {
  return Math.abs(source.canvas.width / source.canvas.height - width / height) <= 0.005;
}

export function isBendSourcePayload(payload: ToolSourceStatePayload): boolean {
  return (
    payload.tool === "bend" &&
    payload.mimeType === BEND_TOOL_STATE_MIME &&
    payload.toolStateVersion === BEND_TOOL_STATE_VERSION
  );
}

export function parseBendSourceState(content: string | Uint8Array): BendSourceStateV1 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text(content));
  } catch {
    fail("The saved BEND source document is not valid JSON.");
  }
  if (!isRecord(parsed) || parsed.tool !== "bend") {
    fail("Source state does not belong to BEND.");
  }
  if (parsed.schemaVersion !== BEND_TOOL_STATE_VERSION) {
    fail(`BEND source version ${String(parsed.schemaVersion)} is not supported by this host.`);
  }
  const pkg = parsed.package;
  if (!isRecord(pkg)) fail("BEND source state is missing its editable package reference.");
  if (pkg.format !== "bendpkg") fail("BEND source state does not reference a .bendpkg package.");
  if (pkg.formatVersion !== 1) fail("Only BEND package format version 1 is supported.");
  const media = Array.isArray(pkg.media) ? pkg.media : null;
  if (!media) fail("BEND source state is missing its packaged media manifest.");
  const canvas = parsed.canvas;
  if (!isRecord(canvas)) fail("BEND source state is missing its canvas metadata.");
  const host = parsed.host;
  if (!isRecord(host)) fail("BEND source state is missing host integration metadata.");
  if (host.mode !== "new" && host.mode !== "edit" && host.mode !== "static-handoff") {
    fail("BEND host integration mode is invalid.");
  }
  const sourceRevisions: Record<string, number> = {};
  if (isRecord(host.sourceRevisions)) {
    for (const [layerId, revision] of Object.entries(host.sourceRevisions)) {
      if (typeof revision === "number" && Number.isInteger(revision) && revision >= 0) {
        sourceRevisions[layerId] = revision;
      }
    }
  }
  return {
    tool: "bend",
    schemaVersion: BEND_TOOL_STATE_VERSION,
    savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : new Date(0).toISOString(),
    bendProjectId: nonEmpty(parsed.bendProjectId, "BEND project id"),
    projectName: nonEmpty(parsed.projectName, "BEND project name"),
    sourceRevision: nonEmpty(parsed.sourceRevision, "BEND source revision"),
    aspectPreset: parsed.aspectPreset as BendAspectPreset,
    canvas: {
      width: positive(canvas.width, "BEND canvas width"),
      height: positive(canvas.height, "BEND canvas height"),
      fps: positive(canvas.fps, "BEND frame rate"),
      duration: positive(canvas.duration, "BEND duration"),
    },
    durationSeconds: positive(parsed.durationSeconds, "BEND duration"),
    package: {
      assetId: nonEmpty(pkg.assetId, "Editable package asset id"),
      format: "bendpkg",
      formatVersion: 1,
      projectId: nonEmpty(pkg.projectId, "Editable package project id"),
      sourceRevision: nonEmpty(pkg.sourceRevision, "Editable package source revision"),
      byteLength: positive(pkg.byteLength, "Editable package byte length"),
      sha256: hash(pkg.sha256, "Editable package hash"),
      media: media.map((entry, index) => {
        if (!isRecord(entry)) fail(`Packaged media ${index} is malformed.`);
        return {
          id: nonEmpty(entry.id, `Packaged media ${index} id`),
          name: nonEmpty(entry.name, `Packaged media ${index} name`),
          mimeType: nonEmpty(entry.mimeType, `Packaged media ${index} MIME type`),
          byteLength: positive(entry.byteLength, `Packaged media ${index} byte length`),
          sha256:
            entry.sha256 === null
              ? null
              : hash(entry.sha256, `Packaged media ${index} hash`),
          width: typeof entry.width === "number" ? entry.width : undefined,
          height: typeof entry.height === "number" ? entry.height : undefined,
          durationSeconds:
            typeof entry.durationSeconds === "number" ? entry.durationSeconds : undefined,
        };
      }),
    },
    exportQuality:
      parsed.exportQuality === "preview" || parsed.exportQuality === "final"
        ? parsed.exportQuality
        : null,
    isPreview: Boolean(parsed.isPreview),
    video: isRecord(parsed.video)
      ? {
          mimeType: nonEmpty(parsed.video.mimeType, "Rendered video MIME type"),
          codec:
            parsed.video.codec === null
              ? null
              : nonEmpty(parsed.video.codec, "Rendered video codec"),
          width: positive(parsed.video.width, "Rendered video width"),
          height: positive(parsed.video.height, "Rendered video height"),
          durationSeconds: positive(parsed.video.durationSeconds, "Rendered video duration"),
          fps: positive(parsed.video.fps, "Rendered video frame rate"),
          container: nonEmpty(parsed.video.container, "Rendered video container"),
        }
      : null,
    poster: isRecord(parsed.poster)
      ? {
          width: positive(parsed.poster.width, "Poster width"),
          height: positive(parsed.poster.height, "Poster height"),
          timestamp:
            typeof parsed.poster.timestamp === "number" && parsed.poster.timestamp >= 0
              ? parsed.poster.timestamp
              : 0,
        }
      : null,
    audio: isRecord(parsed.audio)
      ? {
          present: Boolean(parsed.audio.present),
          message:
            typeof parsed.audio.message === "string" ? parsed.audio.message : undefined,
        }
      : null,
    host: {
      mode: host.mode,
      editingLayerId:
        typeof host.editingLayerId === "string" ? host.editingLayerId : null,
      fitDecision:
        host.fitDecision === "fit" || host.fitDecision === "reformat"
          ? host.fitDecision
          : null,
      sourceLayerIds: Array.isArray(host.sourceLayerIds)
        ? host.sourceLayerIds.filter((id): id is string => typeof id === "string")
        : [],
      sourceRevisions,
      handoff: isRecord(host.handoff) ? host.handoff : undefined,
    },
  };
}

export function assertRestorableBendPayload(payload: ToolSourceStatePayload): BendSourceStateV1 {
  if (!isBendSourcePayload(payload)) {
    throw new BendSourceStateError(
      `Unsupported BEND source state (${payload.tool} / ${payload.toolStateVersion}).`,
    );
  }
  return parseBendSourceState(payload.content);
}

export function bendLayerName(source: {
  projectName: string;
  canvas: { width: number; height: number };
}): string {
  const name = source.projectName.replace(/\s*\/\s*BEND motion$/i, "").trim();
  return `${name || "BEND motion"} · ${bendAspectLabel(source.canvas.width, source.canvas.height)}`;
}

export function withEphemeralPackageUrl(
  source: BendSourceStateV1,
  url: string,
  fitDecision: "fit" | "reformat" | null = source.host.fitDecision,
): string {
  const payload: BendRestorePayload = {
    ...source,
    package: { ...source.package, url },
    host: { ...source.host, fitDecision },
  };
  return JSON.stringify(payload);
}
