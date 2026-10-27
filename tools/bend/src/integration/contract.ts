import type { AspectPreset, BendProject } from "../engine/core/types";

export const BEND_INTEGRATION_VERSION = 1 as const;

export type HostPlaybackPolicy = "loop" | "hold-last-frame" | "trim-to-host";
export type HostEditStatus = "committed" | "editing" | "rendering" | "error";

export interface HostTransform {
  x: number;
  y: number;
  scale: number;
  rotation: number;
}

export interface BendRenderedMedia {
  kind: "video";
  blob: Blob;
  poster: Blob;
  width: number;
  height: number;
  fps: number;
  duration: number;
  aspectRatio: number;
  mimeType: string;
  container: string;
  codec: string | null;
  audioPresent: boolean;
  audioMessage?: string;
  sourceProjectId: string;
  sourceVersion: string;
}

export interface BendStillMedia {
  kind: "still";
  blob: Blob;
  width: number;
  height: number;
  timestamp: number;
  mimeType: "image/png";
  sourceProjectId: string;
  sourceVersion: string;
}

export interface BendHostLayer {
  id: string;
  sourceProjectId: string;
  sourceVersion: string;
  renderedMediaId: string;
  posterMediaId: string;
  editablePackageId: string;
  duration: number;
  fps: number;
  width: number;
  height: number;
  transform: HostTransform;
  opacity: number;
  stackingOrder: number;
  timelineOffset: number;
  playback: HostPlaybackPolicy;
  audioPolicy: "source" | "muted";
  editStatus: HostEditStatus;
  renderedMimeType: string;
  renderedCodec: string | null;
  audioPresent: boolean;
  audioMessage?: string;
}

export interface BendHostComposition {
  integrationVersion: typeof BEND_INTEGRATION_VERSION;
  id: string;
  aspect: AspectPreset;
  width: number;
  height: number;
  duration: number;
  layers: BendHostLayer[];
  foreground: {
    id: "foreground-note";
    text: string;
    x: number;
    y: number;
    scale: number;
  };
  updatedAt: number;
}

export interface BendIntegrationProgress {
  phase: "package" | "still" | "video" | "storage";
  completed: number;
  total: number;
  label: string;
}

export interface BendIntegrationAdapter {
  exportVideo(
    project: BendProject,
    assetUrls: Record<string, string>,
    onProgress?: (progress: BendIntegrationProgress) => void,
    signal?: AbortSignal,
  ): Promise<BendRenderedMedia>;
  exportStill(
    project: BendProject,
    assetUrls: Record<string, string>,
    timestamp: number,
    signal?: AbortSignal,
  ): Promise<BendStillMedia>;
  exportEditableProject(project: BendProject, onProgress?: (progress: BendIntegrationProgress) => void): Promise<{ blob: Blob; byteLength: number }>;
}

/* ---- Studio bridge publish descriptors (mirrored in @studio/contracts) ---- */

export type BendExportQuality = "preview" | "final";

export interface BendArtifactDescriptor {
  url: string;
  mimeType: string;
  byteLength: number;
  sha256: string;
}

export interface BendVideoArtifactDescriptor extends BendArtifactDescriptor {
  container: string;
  codec: string | null;
  width: number;
  height: number;
  durationSeconds: number;
  fps: number;
  audioPresent: boolean;
  audioMessage?: string;
  frameCount?: number;
}

export interface BendPosterArtifactDescriptor extends BendArtifactDescriptor {
  width: number;
  height: number;
  timestamp: number;
}

export interface BendPackageMediaDescriptor {
  id: string;
  name: string;
  mimeType: string;
  byteLength: number;
  sha256: string | null;
  width?: number;
  height?: number;
  durationSeconds?: number;
}

export interface BendPackageArtifactDescriptor extends BendArtifactDescriptor {
  format: "bendpkg";
  formatVersion: number;
  projectId: string;
  sourceRevision: string;
  media: BendPackageMediaDescriptor[];
}

export interface BendPublishRequest {
  quality: BendExportQuality;
  expectedSourceVersion?: string;
  includePackage?: boolean;
}

export interface BendPublishResult {
  sourceProjectId: string;
  sourceRevision: string;
  sourceProjectName: string;
  aspectPreset: "4:5" | "1:1" | "9:16" | "16:9";
  canvas: { width: number; height: number; fps: number; duration: number };
  coverTime: number;
  exportQuality: BendExportQuality;
  isPreview: boolean;
  video: BendVideoArtifactDescriptor;
  poster: BendPosterArtifactDescriptor;
  package: BendPackageArtifactDescriptor | null;
  audioPresent: boolean;
  audioMessage?: string;
  renderedAt: string;
}

