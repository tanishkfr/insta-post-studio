import type {
  ChannelId,
  ProjectId,
  RequestId,
  SessionId,
  SourceToolId,
  ToolIntegrationMode,
  ToolRuntimeKind,
} from "./ids";
import type {
  RenderedAssetReference,
  ToolAssetReceipt,
  ToolInputAsset,
  ToolSourceStatePayload,
  ToolSourceStateReference,
  ToolSourceStateRestoreResult,
} from "./assets";
import type { ArtboardContext, StudioGlobalContext } from "./project";
import type { IsoDateTime } from "./ids";

export const TOOL_ADAPTER_PROTOCOL_VERSION = "1.0.0" as const;
export type ToolAdapterProtocolVersion = typeof TOOL_ADAPTER_PROTOCOL_VERSION;

export type ToolCapabilityId =
  | "open-canvas"
  | "import-image"
  | "import-project"
  | "import-3d"
  | "export-image"
  | "export-svg"
  | "export-otf"
  | "export-video"
  | "export-package"
  | "transparent-render"
  | "editable-source"
  | "temporal"
  | "audio"
  | "keyframes"
  | "bridge";

export interface ToolRuntimeRequirements {
  secureContext?: boolean;
  crossOriginIsolation?: boolean;
  indexedDb?: boolean;
  webCodecs?: boolean;
  webGpu?: boolean;
  wasm?: boolean;
  /** Origins the tool must be allowed to contact for fonts, models or media. */
  networkOrigins?: string[];
}

export interface ToolLimitation {
  code: string;
  summary: string;
  detail?: string;
  environmentDependent: boolean;
}

export interface ToolCapabilityReport {
  toolId: SourceToolId;
  adapterVersion: string;
  protocolVersion: ToolAdapterProtocolVersion;
  integrationMode: ToolIntegrationMode;
  supported: ToolCapabilityId[];
  limitations: ToolLimitation[];
  outputFormats: string[];
  runtimeRequirements: ToolRuntimeRequirements;
}

export type ToolIssueCode =
  | "CAPABILITY_UNSUPPORTED"
  | "STATE_RESTORE_FAILED"
  | "STATE_VERSION_UNSUPPORTED"
  | "INPUT_ASSET_REJECTED"
  | "RENDER_FAILED"
  | "RENDER_CANCELLED"
  | "INVALID_CONTEXT"
  | "PERMISSION_DENIED"
  | "ENVIRONMENT_UNSUPPORTED"
  | "INTERNAL";

export interface ToolIssue {
  code: ToolIssueCode;
  message: string;
  severity: "warning" | "error";
  recoverable: boolean;
  details?: Record<string, unknown>;
  occurredAt: IsoDateTime;
}

export interface ToolRuntimeContext {
  projectId: ProjectId;
  sessionId: SessionId;
  runtimeKind: ToolRuntimeKind;
  integrationMode: ToolIntegrationMode;
  hostOrigin: string;
  /** Exact origin expected for cross-origin iframe adapters. */
  toolOrigin: string;
  channelId: ChannelId;
}

export interface ToolOpenRequest {
  projectName: string;
  global: StudioGlobalContext;
  /** Empty for a first use; populated when reopening an existing layer. */
  inputAssets: ToolInputAsset[];
  sourceState?: ToolSourceStateReference;
  /** Tool-specific open options, validated by the adapter. */
  options?: Record<string, unknown>;
}

export interface ToolOpenResult {
  sessionId: SessionId;
  capabilities: ToolCapabilityReport;
  warnings: ToolIssue[];
}

export interface ToolContextReceipt {
  applied: boolean;
  activeArtboardId: string;
}

export interface ToolRenderRequest {
  requestId: RequestId;
  artboard: ArtboardContext;
  /** 1 = native artboard resolution. */
  scale: number;
  format: "png" | "webp" | "svg" | "mp4" | "mov" | "json";
  background: "transparent" | "artboard" | "custom";
  customBackgroundColor?: string;
  /** Optional temporal range for video tools. */
  timeRange?: { startSeconds: number; endSeconds: number };
}

export interface ToolRenderResult {
  requestId: RequestId;
  rendered: RenderedAssetReference;
  /** Present when the render carries pixels but the host has not yet stored them. */
  bytes?: Uint8Array;
  /** Version of the editable state that produced this render. */
  sourceRevision?: string;
  warnings: ToolIssue[];
}

export interface ToolCloseOptions {
  reason: "host" | "user" | "switch-tool" | "error";
  discardUnsavedChanges: boolean;
}

export interface ToolCapabilityRequest {
  capability: ToolCapabilityId;
}

/**
 * Versioned boundary for every editor. The same contract is used by isolated
 * iframe runtimes and React-hosted sub-apps. It deliberately does not prescribe
 * the editor's internal state model.
 */
export interface ToolAdapterV1 {
  readonly protocolVersion: ToolAdapterProtocolVersion;
  readonly toolId: SourceToolId;
  readonly adapterVersion: string;

  initialize(context: ToolRuntimeContext): Promise<ToolOpenResult>;
  open(request: ToolOpenRequest): Promise<ToolOpenResult>;
  receiveGlobalContext(context: StudioGlobalContext): Promise<ToolContextReceipt>;
  receiveInputAssets(assets: ToolInputAsset[]): Promise<ToolAssetReceipt[]>;
  restoreSourceState(payload: ToolSourceStatePayload): Promise<ToolSourceStateRestoreResult>;
  render(request: ToolRenderRequest): Promise<ToolRenderResult>;
  getEditableSourceState(): Promise<ToolSourceStatePayload>;
  reportCapabilities(): ToolCapabilityReport;
  reportIssue(issue: ToolIssue): Promise<void>;
  cancelOperation(requestId: RequestId): Promise<boolean>;
  close(options: ToolCloseOptions): Promise<void>;
}

export interface ToolAdapterDescriptor {
  toolId: SourceToolId;
  adapterVersion: string;
  protocolVersion: ToolAdapterProtocolVersion;
  runtime: ToolRuntimeKind;
  entryUrl?: string;
  /** BEND uses a dedicated bridge because its temporal engine owns the timeline. */
  integrationMode: ToolIntegrationMode;
}

/**
 * BEND publishing uses same-origin object URLs rather than sending multi-megabyte
 * blobs through one postMessage allocation. The host fetches, hashes and stores
 * each artifact before acknowledging release; the bridge keeps the URLs alive
 * until then (or until the session closes/cancels).
 */
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
  /** The package revision this edit session was restored from, when editing. */
  expectedSourceVersion?: string;
  includePackage?: boolean;
}

export interface BendPublishResult {
  sourceProjectId: string;
  sourceRevision: string;
  sourceProjectName: string;
  aspectPreset: "4:5" | "1:1" | "9:16" | "16:9";
  canvas: {
    width: number;
    height: number;
    fps: number;
    duration: number;
  };
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

export interface BendPublishAckRequest {
  artifacts: Array<"video" | "poster" | "package">;
}
