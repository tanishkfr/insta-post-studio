import type {
  BendPackageArtifactDescriptor,
  BendPosterArtifactDescriptor,
  BendPublishResult,
  BendVideoArtifactDescriptor,
  BendExportQuality,
} from "./contract";
import { getProjectDuration, normalizeProject } from "../engine/core/project";
import type { BendProject } from "../engine/core/types";
import { exportStillFrame, exportVideoComposition } from "../engine/export/exporter";
import { createEditableProjectPackage, readEditableProjectPackage } from "../engine/package/portableProject";
import { verifyBendHandoff } from "./conformance";
import { getProjectVersion } from "./version";
import type { BendRenderedMedia, BendStillMedia } from "./contract";

export interface StudioPublishArtifacts {
  result: BendPublishResult;
  release(keys: Array<"video" | "poster" | "package">): void;
  releaseAll(): void;
}

interface ArtifactEntry {
  blob: Blob;
  url: string;
}

/**
 * Runs the complete, original BEND export engine for a Studio publish.
 *
 * Preview and final quality are explicit: preview uses the exporter's 720px
 * review path, final uses the project's full canvas. Nothing upsamples a
 * preview into a final claim. Video, poster and `.bendpkg` are verified as one
 * source revision before any URL is handed to Studio.
 */
export async function createStudioPublishArtifacts(options: {
  project: BendProject;
  assetUrls: Record<string, string>;
  quality: BendExportQuality;
  signal?: AbortSignal;
  onProgress?: (progress: { completed: number; total: number; label: string; phase: string }) => void;
}): Promise<StudioPublishArtifacts> {
  const project = normalizeProject(options.project);
  const quality = options.quality === "final" ? "high" : "preview";
  const sourceRevision = getProjectVersion(project);

  const videoResult = await exportVideoComposition({
    project,
    assetUrls: options.assetUrls,
    quality,
    signal: options.signal,
    onProgress: (progress) => {
      options.onProgress?.({
        phase: "video",
        completed: progress.completed,
        total: Math.max(1, progress.total),
        label: progress.label,
      });
    },
  });
  throwIfAborted(options.signal);

  options.onProgress?.({
    phase: "poster",
    completed: 0,
    total: 1,
    label: "Rendering cover frame",
  });
  const still = await exportStillFrame({
    project,
    assetUrls: options.assetUrls,
    time: project.cover.time,
    signal: options.signal,
  });
  throwIfAborted(options.signal);
  options.onProgress?.({
    phase: "poster",
    completed: 1,
    total: 1,
    label: "Cover frame ready",
  });

  options.onProgress?.({
    phase: "package",
    completed: 0,
    total: 1,
    label: "Collecting editable source package",
  });
  const editable = await createEditableProjectPackage(project);
  throwIfAborted(options.signal);
  const decoded = await readEditableProjectPackage(editable.blob);
  options.onProgress?.({
    phase: "package",
    completed: 1,
    total: 1,
    label: "Editable package ready",
  });

  const media: BendRenderedMedia = {
    kind: "video",
    blob: videoResult.blob,
    poster: still.blob,
    width: videoResult.width,
    height: videoResult.height,
    fps: project.canvas.fps,
    duration: videoResult.duration,
    aspectRatio: videoResult.width / videoResult.height,
    mimeType: videoResult.mimeType,
    container: videoResult.mimeType.includes("mp4") ? "mp4" : "webm",
    codec: videoResult.codec ?? null,
    audioPresent: videoResult.audioStatus === "included",
    audioMessage: videoResult.audioMessage,
    sourceProjectId: project.id,
    sourceVersion: sourceRevision,
  };
  const stillMedia: BendStillMedia = {
    kind: "still",
    blob: still.blob,
    width: still.width,
    height: still.height,
    timestamp: still.timestamp,
    mimeType: "image/png",
    sourceProjectId: project.id,
    sourceVersion: sourceRevision,
  };

  // One authoritative verification pass: video metadata, poster dimensions and
  // package completeness must all agree with the same editable revision.
  await verifyBendHandoff({
    project,
    video: media,
    still: stillMedia,
    editableSource: editable.blob,
  });
  throwIfAborted(options.signal);

  const video = await artifact(
    "video",
    videoResult.blob,
    {
      container: media.container,
      codec: media.codec,
      width: videoResult.width,
      height: videoResult.height,
      durationSeconds: videoResult.duration,
      fps: project.canvas.fps,
      audioPresent: media.audioPresent,
      audioMessage: media.audioMessage,
      frameCount: videoResult.verification?.frameCount,
    },
  );
  const poster = await artifact("poster", still.blob, {
    width: still.width,
    height: still.height,
    timestamp: still.timestamp,
  });
  const bendPackage: BendPackageArtifactDescriptor = {
    ...(await artifact("package", editable.blob, {})),
    format: "bendpkg",
    formatVersion: decoded.manifest.formatVersion,
    projectId: project.id,
    sourceRevision,
    media: Object.values(decoded.manifest.assets).map((asset) => {
      const record = project.assets[asset.id];
      return {
        id: asset.id,
        name: asset.name,
        mimeType: asset.mimeType,
        byteLength: asset.size,
        sha256: asset.sha256,
        width: record?.width,
        height: record?.height,
        durationSeconds: record?.duration,
      };
    }),
  };

  const registry = new Map<string, ArtifactEntry>();
  registry.set("video", { blob: videoResult.blob, url: video.url });
  registry.set("poster", { blob: still.blob, url: poster.url });
  registry.set("package", { blob: editable.blob, url: bendPackage.url });

  const result: BendPublishResult = {
    sourceProjectId: project.id,
    sourceRevision,
    sourceProjectName: project.name,
    aspectPreset: aspectPresetFor(project),
    canvas: {
      width: project.canvas.width,
      height: project.canvas.height,
      fps: project.canvas.fps,
      duration: getProjectDuration(project),
    },
    coverTime: project.cover.time,
    exportQuality: options.quality,
    isPreview: quality === "preview",
    video,
    poster,
    package: bendPackage,
    audioPresent: media.audioPresent,
    audioMessage: media.audioMessage,
    renderedAt: new Date().toISOString(),
  };

  options.onProgress?.({
    phase: "complete",
    completed: 1,
    total: 1,
    label: "Published artifacts ready",
  });

  return {
    result,
    release(keys) {
      for (const key of keys) {
        const entry = registry.get(key);
        if (!entry) continue;
        URL.revokeObjectURL(entry.url);
        registry.delete(key);
      }
    },
    releaseAll() {
      for (const entry of registry.values()) URL.revokeObjectURL(entry.url);
      registry.clear();
    },
  };
}

async function artifact<T extends object>(
  kind: "video" | "poster" | "package",
  blob: Blob,
  extra: T,
): Promise<{ url: string; mimeType: string; byteLength: number; sha256: string } & T> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const sha256 = await sha256Hex(bytes);
  return {
    url: URL.createObjectURL(blob),
    mimeType: blob.type || "application/octet-stream",
    byteLength: blob.size,
    sha256,
    ...extra,
  };
}

function aspectPresetFor(project: BendProject): "4:5" | "1:1" | "9:16" | "16:9" {
  const ratio = project.canvas.width / project.canvas.height;
  if (Math.abs(ratio - 4 / 5) <= 0.01) return "4:5";
  if (Math.abs(ratio - 1) <= 0.01) return "1:1";
  if (Math.abs(ratio - 9 / 16) <= 0.01) return "9:16";
  if (Math.abs(ratio - 16 / 9) <= 0.01) return "16:9";
  throw new Error(
    `BEND cannot publish a ${project.canvas.width}×${project.canvas.height} composition because it does not match a supported Studio aspect preset.`,
  );
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("Web Crypto is unavailable; BEND cannot verify published artifacts.");
  const digest = await subtle.digest("SHA-256", bytes.slice().buffer as ArrayBuffer);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("BEND publish cancelled.", "AbortError");
}

export type { BendVideoArtifactDescriptor, BendPosterArtifactDescriptor };
