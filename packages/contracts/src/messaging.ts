import type { ChannelId, IsoDateTime, ProjectId, RequestId, SessionId, SourceToolId } from "./ids";
import type {
  ToolCapabilityReport,
  ToolCloseOptions,
  ToolContextReceipt,
  ToolIssue,
  ToolOpenRequest,
  ToolOpenResult,
  ToolRenderRequest,
  ToolRenderResult,
  BendPublishAckRequest,
  BendPublishRequest,
  BendPublishResult,
} from "./adapter";
import type {
  ToolAssetReceipt,
  ToolInputAsset,
  ToolSourceStatePayload,
  ToolSourceStateRestoreResult,
} from "./assets";
import type { StudioGlobalContext } from "./project";

/**
 * Transport contract for iframe adapters and React bridges. The host must
 * validate the exact origin, scope and request ID before applying any message.
 */
export const TOOL_MESSAGING_PROTOCOL_VERSION = "1.0.0" as const;
export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

export interface MessageScope {
  projectId: ProjectId;
  sessionId: SessionId;
  toolId: SourceToolId;
  channelId: ChannelId;
}

export interface MessageOriginPolicy {
  /** Exact origin expected for the Studio host, e.g. https://studio.example. */
  hostOrigin: string;
  /** Exact origin expected for the iframe/tool runtime. */
  toolOrigin: string;
  /** Never infer trust from `event.source`; origin must be explicitly compared. */
  requireOriginMatch: true;
  allowNullOrigin: false;
}

export interface ScopedChannel {
  protocolVersion: typeof TOOL_MESSAGING_PROTOCOL_VERSION;
  scope: MessageScope;
  origins: MessageOriginPolicy;
}

export interface ToolProtocolMethods {
  "tool/initialize": {
    input: { hostOrigin: string; channelId: ChannelId };
    output: ToolOpenResult;
  };
  "tool/open": { input: ToolOpenRequest; output: ToolOpenResult };
  "context/update": { input: StudioGlobalContext; output: ToolContextReceipt };
  "assets/input": { input: ToolInputAsset[]; output: ToolAssetReceipt[] };
  "state/restore": { input: ToolSourceStatePayload; output: ToolSourceStateRestoreResult };
  "state/serialize": { input: { reason: "save" | "publish" | "diagnostics" }; output: ToolSourceStatePayload };
  "render": { input: ToolRenderRequest; output: ToolRenderResult };
  "capabilities/report": { input: Record<string, never>; output: ToolCapabilityReport };
  "operation/cancel": { input: { targetRequestId: RequestId }; output: { cancelled: boolean } };
  /** Dedicated BEND publishing controller over the same scoped transport. */
  "bend/publish": { input: BendPublishRequest; output: BendPublishResult };
  "bend/publish/ack": { input: BendPublishAckRequest; output: { released: true } };
  "tool/close": { input: ToolCloseOptions; output: { closed: true } };
}

export type ToolProtocolMethod = keyof ToolProtocolMethods;

export interface ToolRequestMessage<M extends ToolProtocolMethod = ToolProtocolMethod> {
  protocolVersion: typeof TOOL_MESSAGING_PROTOCOL_VERSION;
  kind: "request";
  scope: MessageScope;
  requestId: RequestId;
  method: M;
  params: ToolProtocolMethods[M]["input"];
  sentAt: IsoDateTime;
}

export type ToolTransportErrorCode =
  | "ORIGIN_REJECTED"
  | "SCOPE_MISMATCH"
  | "PROTOCOL_VERSION_MISMATCH"
  | "UNKNOWN_METHOD"
  | "BAD_REQUEST"
  | "UNSUPPORTED_CAPABILITY"
  | "TIMEOUT"
  | "CANCELLED"
  | "ADAPTER_ERROR"
  | "INTERNAL";

export interface ToolTransportError {
  code: ToolTransportErrorCode;
  message: string;
  retryable: boolean;
  details?: Record<string, unknown>;
}

export type ToolResponseMessage<M extends ToolProtocolMethod = ToolProtocolMethod> =
  | {
      protocolVersion: typeof TOOL_MESSAGING_PROTOCOL_VERSION;
      kind: "response";
      scope: MessageScope;
      requestId: RequestId;
      method: M;
      ok: true;
      result: ToolProtocolMethods[M]["output"];
      sentAt: IsoDateTime;
    }
  | {
      protocolVersion: typeof TOOL_MESSAGING_PROTOCOL_VERSION;
      kind: "response";
      scope: MessageScope;
      requestId: RequestId;
      method: M;
      ok: false;
      error: ToolTransportError;
      sentAt: IsoDateTime;
    };

export type ToolEvent =
  | { type: "ready"; capabilities: ToolCapabilityReport }
  | { type: "dirty"; dirty: boolean }
  | { type: "progress"; operation: string; progress: number; message?: string }
  | { type: "issue"; issue: ToolIssue }
  | { type: "selection"; layerIds: string[] };

export interface ToolEventMessage {
  protocolVersion: typeof TOOL_MESSAGING_PROTOCOL_VERSION;
  kind: "event";
  scope: MessageScope;
  event: ToolEvent;
  sentAt: IsoDateTime;
}

export type StudioToolMessage = ToolRequestMessage | ToolResponseMessage | ToolEventMessage;

/**
 * Adapters and hosts implement this guard before dispatching. It is declarative
 * here because Phase 0 defines contracts only.
 */
export interface MessageValidationPolicy {
  validateOrigin(receivedOrigin: string, policy: MessageOriginPolicy): boolean;
  validateScope(received: MessageScope, expected: MessageScope): boolean;
  validateRequestId(received: RequestId): boolean;
  isSupportedProtocol(version: string): version is typeof TOOL_MESSAGING_PROTOCOL_VERSION;
}

/** Host-side bookkeeping required to make request/response pairing safe. */
export interface PendingRequest {
  requestId: RequestId;
  method: ToolProtocolMethod;
  sentAt: number;
  timeoutMs: number;
  abort: AbortController;
}
