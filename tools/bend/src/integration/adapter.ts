import { normalizeProject } from "../engine/core/project";
import { exportStillFrame, exportVideoComposition } from "../engine/export/exporter";
import { createEditableProjectPackage } from "../engine/package/portableProject";
import type { BendProject } from "../engine/core/types";
import type { BendIntegrationAdapter, BendIntegrationProgress, BendRenderedMedia, BendStillMedia } from "./contract";
import { BendIntegrationContractError } from "./errors";
import { assertValidRenderedMedia, assertValidStillMedia } from "./validation";
import { getProjectVersion } from "./version";

export { getProjectVersion } from "./version";

export function createBendIntegrationAdapter(): BendIntegrationAdapter {
  return {
    async exportVideo(project, assetUrls, onProgress, signal): Promise<BendRenderedMedia> {
      const normalized = normalizeProject(project);
      throwIfAborted(signal);
      const result = await exportVideoComposition({
        project: normalized,
        assetUrls,
        quality: "preview",
        signal,
        onProgress: (progress) => onProgress?.({ phase: "video", completed: progress.completed, total: progress.total, label: progress.label }),
      });
      onProgress?.({ phase: "still", completed: 0, total: 1, label: "Rendering poster frame" });
      throwIfAborted(signal);
      const poster = await exportStillFrame({ project: normalized, assetUrls, time: 0, signal });
      const media: BendRenderedMedia = {
        kind: "video",
        blob: result.blob,
        poster: poster.blob,
        width: result.width,
        height: result.height,
        fps: result.fps,
        duration: result.duration,
        aspectRatio: result.width / result.height,
        mimeType: result.mimeType,
        container: result.mimeType.includes("mp4") ? "mp4" : "webm",
        codec: result.codec ?? null,
        audioPresent: result.audioStatus === "included",
        audioMessage: result.audioMessage,
        sourceProjectId: normalized.id,
        sourceVersion: getProjectVersion(normalized),
      };
      assertValidRenderedMedia(media, normalized);
      onProgress?.({ phase: "still", completed: 1, total: 1, label: "Poster frame ready" });
      return media;
    },

    async exportStill(project, assetUrls, timestamp, signal): Promise<BendStillMedia> {
      const normalized = normalizeProject(project);
      throwIfAborted(signal);
      if (!Number.isFinite(timestamp) || timestamp < 0) {
        throw new BendIntegrationContractError("A still export requires a finite, non-negative timestamp.");
      }
      const result = await exportStillFrame({ project: normalized, assetUrls, time: timestamp, signal });
      const still: BendStillMedia = {
        kind: "still",
        blob: result.blob,
        width: result.width,
        height: result.height,
        timestamp: result.timestamp,
        mimeType: "image/png",
        sourceProjectId: normalized.id,
        sourceVersion: getProjectVersion(normalized),
      };
      assertValidStillMedia(still, normalized);
      return still;
    },

    async exportEditableProject(project, onProgress) {
      const normalized = normalizeProject(project);
      onProgress?.({ phase: "package", completed: 0, total: 1, label: "Collecting editable source" });
      const result = await createEditableProjectPackage(normalized);
      if (!result.blob || result.blob.size <= 0) {
        throw new BendIntegrationContractError("The editable BEND source package is empty.");
      }
      onProgress?.({ phase: "package", completed: 1, total: 1, label: "Editable source ready" });
      return result;
    },
  };
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("BEND integration export cancelled.", "AbortError");
}
