import type {
  AssetReference,
  BendPublishResult,
  RenderedAssetReference,
  TemporalMetadata,
  ToolSourceStateReference,
} from "@studio/contracts";
import type { IframeToolAdapter } from "../iframe/IframeToolAdapter";
import type { AssetRepository } from "../../storage/assetRepository";
import { sha256Hex } from "../../lib/hash";
import { nowIso } from "../../lib/ids";
import {
  BEND_PACKAGE_MIME,
  BEND_TOOL_STATE_MIME,
  BEND_TOOL_STATE_VERSION,
  bendLayerName,
  type BendSourceStateV1,
} from "./bendSourceState";
import { inspectBendPackage } from "./bendPackage";

const MAX_VIDEO_BYTES = 512 * 1024 * 1024;
const MAX_POSTER_BYTES = 64 * 1024 * 1024;
const MAX_PACKAGE_BYTES = 1024 * 1024 * 1024;

export interface BendCaptureOptions {
  adapter: IframeToolAdapter;
  assets: AssetRepository;
  artboard: { width: number; height: number };
  revision: number;
  quality: "preview" | "final";
  expectedSourceVersion?: string;
  host: BendSourceStateV1["host"];
}

export interface BendCapture {
  sourceState: ToolSourceStateReference;
  rendered: RenderedAssetReference;
  renderedAsset: AssetReference;
  poster: RenderedAssetReference;
  posterAsset: AssetReference;
  packageAsset: AssetReference;
  temporal: TemporalMetadata;
  suggestedName: string;
  tags: string[];
  sourceAssets: AssetReference[];
  guard: {
    expectedHostRevision: number;
    expectedSourceRevision: string;
    sourceLayerIds: string[];
  };
}

interface FetchedArtifact {
  bytes: Uint8Array;
  blob: Blob;
}

export async function captureBendArtwork(
  options: BendCaptureOptions,
): Promise<BendCapture> {
  const published = await options.adapter.publishBend({
    quality: options.quality,
    expectedSourceVersion: options.expectedSourceVersion,
    includePackage: true,
  });
  validatePublishMetadata(published, options.quality);
  if (
    options.expectedSourceVersion &&
    published.package &&
    published.package.sourceRevision !== published.sourceRevision
  ) {
    throw new Error("BEND returned a package from a different source revision.");
  }

  let video: FetchedArtifact | null = null;
  let poster: FetchedArtifact | null = null;
  let packageBytes: FetchedArtifact | null = null;
  try {
    [video, poster, packageBytes] = await Promise.all([
      fetchArtifact(published.video.url, published.video.byteLength, published.video.sha256, MAX_VIDEO_BYTES, "video"),
      fetchArtifact(published.poster.url, published.poster.byteLength, published.poster.sha256, MAX_POSTER_BYTES, "poster"),
      published.package
        ? fetchArtifact(published.package.url, published.package.byteLength, published.package.sha256, MAX_PACKAGE_BYTES, "editable package")
        : Promise.reject(new Error("BEND did not return an editable .bendpkg package.")),
    ]);
    if (!video || !poster || !packageBytes || !published.package) {
      throw new Error("BEND did not return all three publication artifacts.");
    }

    // Container honesty: never label WebM bytes as MP4 (or vice versa).
    const actualContainer = sniffContainer(video.bytes);
    if (actualContainer === "unknown") {
      throw new Error("The rendered BEND video is not a recognisable MP4 or WebM container.");
    }
    if (
      (published.video.container === "mp4" && actualContainer !== "mp4") ||
      (published.video.container === "webm" && actualContainer !== "webm")
    ) {
      throw new Error(
        `BEND declared a ${published.video.container} container but produced ${actualContainer} bytes.`,
      );
    }
    assertPng(poster.bytes, published.poster.width, published.poster.height);

    const decoded = await probeVideoBlob(video.blob, published.video.width, published.video.height, published.video.durationSeconds);
    const inspectedPackage = await inspectBendPackage(packageBytes.bytes);
    if (inspectedPackage.projectId !== published.sourceProjectId) {
      throw new Error("The editable package belongs to a different BEND project.");
    }
    if (
      inspectedPackage.canvas.width !== published.canvas.width ||
      inspectedPackage.canvas.height !== published.canvas.height
    ) {
      throw new Error(
        `The editable package canvas ${inspectedPackage.canvas.width}×${inspectedPackage.canvas.height} does not match the published composition ${published.canvas.width}×${published.canvas.height}.`,
      );
    }
    const packageAssetIds = [...inspectedPackage.assetIds].sort().join("\u0000");
    const declaredAssetIds = published.package.media.map((entry) => entry.id).sort().join("\u0000");
    if (packageAssetIds !== declaredAssetIds) {
      throw new Error("The editable package media table does not match BEND's published source manifest.");
    }
    if (inspectedPackage.byteLength !== published.package.byteLength) {
      throw new Error("The editable package byte length changed during transfer.");
    }

    const name = bendLayerName({
      projectName: published.sourceProjectName,
      canvas: published.canvas,
    });
    const slug = name.replace(/[^\w.-]+/g, "-").toLowerCase().slice(0, 64) || "bend-motion";
    const extension = actualContainer === "mp4" ? "mp4" : "webm";
    const videoMime =
      actualContainer === "mp4" ? "video/mp4" : "video/webm";

    const videoAsset = await options.assets.putAsset({
      bytes: video.bytes,
      kind: "video",
      name: `${slug}.${extension}`,
      mimeType: videoMime,
      sourceTool: "bend",
      width: decoded.width,
      height: decoded.height,
      durationSeconds: decoded.duration,
    });
    const posterAsset = await options.assets.putAsset({
      bytes: poster.bytes,
      kind: "rendered-image",
      name: `${slug}-cover.png`,
      mimeType: "image/png",
      sourceTool: "bend",
      width: published.poster.width,
      height: published.poster.height,
    });
    const packageAsset = await options.assets.putAsset({
      bytes: packageBytes.bytes,
      kind: "project-package",
      name: `${slug}.bendpkg`,
      mimeType: BEND_PACKAGE_MIME,
      sourceTool: "bend",
    });

    const sourceDocument: BendSourceStateV1 = {
      tool: "bend",
      schemaVersion: BEND_TOOL_STATE_VERSION,
      savedAt: nowIso(),
      bendProjectId: published.sourceProjectId,
      projectName: published.sourceProjectName,
      sourceRevision: published.sourceRevision,
      aspectPreset: published.aspectPreset,
      canvas: published.canvas,
      durationSeconds: published.canvas.duration,
      package: {
        assetId: packageAsset.id,
        format: "bendpkg",
        formatVersion: inspectedPackage.formatVersion,
        projectId: inspectedPackage.projectId,
        sourceRevision: published.package.sourceRevision,
        byteLength: packageAsset.byteSize ?? packageBytes.bytes.byteLength,
        sha256: packageAsset.contentHash ?? published.package.sha256,
        media: inspectedPackage.media,
      },
      exportQuality: published.exportQuality,
      isPreview: published.isPreview,
      video: {
        mimeType: videoAsset.mimeType,
        codec: published.video.codec,
        width: decoded.width,
        height: decoded.height,
        durationSeconds: decoded.duration,
        fps: published.video.fps,
        container: actualContainer,
      },
      poster: {
        width: published.poster.width,
        height: published.poster.height,
        timestamp: published.poster.timestamp,
      },
      audio: {
        present: published.audioPresent,
        message: published.audioMessage,
      },
      host: {
        ...options.host,
        editingLayerId: options.host.editingLayerId,
        fitDecision: options.host.fitDecision,
      },
    };
    const sourceRef = await options.assets.putSourceState({
      tool: "bend",
      toolStateVersion: BEND_TOOL_STATE_VERSION,
      mimeType: BEND_TOOL_STATE_MIME,
      content: JSON.stringify(sourceDocument),
      revision: options.revision,
      label: `${name} source`,
    });

    // Re-read every reference so a storage failure or hash drift cannot commit
    // a layer that points at unreachable bytes.
    const storedVideo = await options.assets.getAsset(videoAsset.id);
    const storedPoster = await options.assets.getAsset(posterAsset.id);
    const storedPackage = await options.assets.getAsset(packageAsset.id);
    if (
      storedVideo.reference.contentHash !== videoAsset.contentHash ||
      storedPoster.reference.contentHash !== posterAsset.contentHash ||
      storedPackage.reference.contentHash !== packageAsset.contentHash
    ) {
      throw new Error("A published BEND artifact changed after it was written to Studio storage.");
    }
    await options.assets.getSourceState(sourceRef);

    return {
      sourceState: sourceRef,
      rendered: {
        kind: "video",
        mimeType: videoAsset.mimeType,
        assetId: videoAsset.id,
        storage: videoAsset.storage,
        width: decoded.width,
        height: decoded.height,
        durationSeconds: decoded.duration,
        contentHash: videoAsset.contentHash,
      },
      renderedAsset: videoAsset,
      poster: {
        kind: "image",
        mimeType: "image/png",
        assetId: posterAsset.id,
        storage: posterAsset.storage,
        width: posterAsset.width,
        height: posterAsset.height,
        contentHash: posterAsset.contentHash,
      },
      posterAsset,
      packageAsset,
      temporal: {
        kind: "video",
        durationSeconds: decoded.duration,
        timelineStartSeconds: 0,
        sourceDurationSeconds: decoded.duration,
        frameRate: published.video.fps,
        playback: "loop",
        audio: "muted",
        preview: published.isPreview,
        container: actualContainer,
        codec: published.video.codec,
        audioPresent: published.audioPresent,
        audioMessage: published.audioMessage,
        bendSequenceId: published.sourceProjectId,
      },
      suggestedName: name,
      tags: [
        "bend",
        "phase-4",
        "temporal",
        published.exportQuality === "preview" ? "quality:preview" : "quality:final",
      ],
      sourceAssets: [posterAsset, packageAsset],
      guard: {
        expectedHostRevision: options.revision,
        expectedSourceRevision: options.expectedSourceVersion ?? published.sourceRevision,
        sourceLayerIds: options.host.sourceLayerIds,
      },
    };
  } finally {
    void options.adapter
      .acknowledgeBendArtifacts({
        artifacts: ["video", "poster", "package"],
      })
      .catch(() => undefined);
  }
}

function validatePublishMetadata(result: BendPublishResult, quality: "preview" | "final"): void {
  if (!result || typeof result !== "object") throw new Error("BEND returned no publish result.");
  for (const value of [
    result.canvas.width,
    result.canvas.height,
    result.canvas.fps,
    result.canvas.duration,
    result.video.width,
    result.video.height,
    result.video.durationSeconds,
    result.video.fps,
    result.poster.width,
    result.poster.height,
  ]) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error("BEND returned invalid publication metadata.");
    }
  }
  if (!result.sourceProjectId || !result.sourceRevision) {
    throw new Error("BEND returned no stable source project/revision identity.");
  }
  if (!result.package || result.package.format !== "bendpkg" || result.package.formatVersion !== 1) {
    throw new Error("BEND did not return a complete editable .bendpkg package.");
  }
  if (Math.abs(result.video.durationSeconds - result.canvas.duration) > 0.2) {
    throw new Error(
      `The published BEND video lasts ${result.video.durationSeconds.toFixed(2)}s but its composition is ${result.canvas.duration.toFixed(2)}s.`,
    );
  }
  if (quality === "preview") {
    if (!result.isPreview) {
      throw new Error("BEND did not label the requested preview export as a preview.");
    }
    if (result.video.width > 720) {
      throw new Error("BEND preview output exceeded the documented 720px review width.");
    }
  } else {
    if (result.isPreview) throw new Error("BEND returned a preview when final quality was requested.");
    if (result.video.width !== result.canvas.width || result.video.height !== result.canvas.height) {
      throw new Error(
        `BEND final output is ${result.video.width}×${result.video.height}, not the full ${result.canvas.width}×${result.canvas.height} canvas.`,
      );
    }
  }
  if (
    Math.abs(
      result.video.width / result.video.height -
        result.canvas.width / result.canvas.height,
    ) > 0.01
  ) {
    throw new Error("The published BEND video aspect ratio does not match its composition.");
  }
  if (
    Math.abs(
      result.poster.width / result.poster.height -
        result.canvas.width / result.canvas.height,
    ) > 0.01
  ) {
    throw new Error("The BEND cover frame aspect ratio does not match its composition.");
  }
}

async function fetchArtifact(
  url: string,
  expectedBytes: number,
  expectedHash: string,
  maximum: number,
  label: string,
): Promise<FetchedArtifact> {
  if (expectedBytes <= 0 || expectedBytes > maximum) {
    throw new Error(`The published BEND ${label} size is outside the host safety limit.`);
  }
  const parsed = new URL(url, window.location.href);
  if (parsed.protocol !== "blob:" && parsed.origin !== window.location.origin) {
    throw new Error(`The published BEND ${label} URL is not same-origin.`);
  }
  const response = await fetch(parsed);
  if (!response.ok) throw new Error(`The published BEND ${label} could not be fetched (${response.status}).`);
  const blob = await response.blob();
  if (blob.size !== expectedBytes) {
    throw new Error(`The published BEND ${label} byte length does not match its descriptor.`);
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const actualHash = await sha256Hex(bytes);
  if (actualHash !== expectedHash) {
    throw new Error(`The published BEND ${label} failed its content-hash check.`);
  }
  return { bytes, blob };
}

function sniffContainer(bytes: Uint8Array): "mp4" | "webm" | "unknown" {
  if (
    bytes.byteLength >= 4 &&
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  ) {
    return "webm";
  }
  if (
    bytes.byteLength >= 12 &&
    String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]) === "ftyp"
  ) {
    return "mp4";
  }
  return "unknown";
}

function assertPng(bytes: Uint8Array, expectedWidth: number, expectedHeight: number): void {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.byteLength < 24 || signature.some((value, index) => bytes[index] !== value)) {
    throw new Error("The BEND cover frame is not a valid PNG.");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16, false);
  const height = view.getUint32(20, false);
  if (width !== expectedWidth || height !== expectedHeight) {
    throw new Error(
      `The BEND cover frame is ${width}×${height}, not the declared ${expectedWidth}×${expectedHeight}.`,
    );
  }
}

function probeVideoBlob(
  blob: Blob,
  expectedWidth: number,
  expectedHeight: number,
  expectedDuration: number,
): Promise<{ width: number; height: number; duration: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const video = document.createElement("video");
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      video.load();
      callback();
    };
    const timer = window.setTimeout(
      () => finish(() => reject(new Error("The published BEND video did not decode in this browser."))),
      15_000,
    );
    video.preload = "metadata";
    video.muted = true;
    video.onloadedmetadata = () => {
      const width = video.videoWidth;
      const height = video.videoHeight;
      const duration =
        Number.isFinite(video.duration) && video.duration > 0
          ? video.duration
          : expectedDuration;
      finish(() => {
        if (width !== expectedWidth || height !== expectedHeight) {
          reject(
            new Error(
              `The published BEND video decodes at ${width}×${height}, not ${expectedWidth}×${expectedHeight}.`,
            ),
          );
          return;
        }
        if (duration <= 0) {
          reject(new Error("The published BEND video has no decodable duration."));
          return;
        }
        if (Math.abs(duration - expectedDuration) > 0.35) {
          reject(
            new Error(
              `The published BEND video decodes at ${duration.toFixed(2)}s, not ${expectedDuration.toFixed(2)}s.`,
            ),
          );
          return;
        }
        resolve({ width, height, duration });
      });
    };
    video.onerror = () =>
      finish(() => reject(new Error("The published BEND video is not decodable by this browser.")));
    video.src = url;
    video.load();
  });
}
