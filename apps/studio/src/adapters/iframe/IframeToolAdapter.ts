import type {
  ScopedChannel,
  SourceToolId,
  StudioGlobalContext,
  ToolAdapterProtocolVersion,
  ToolAdapterV1,
  ToolAssetReceipt,
  ToolCapabilityReport,
  ToolCloseOptions,
  ToolContextReceipt,
  ToolEvent,
  ToolInputAsset,
  ToolIssue,
  ToolOpenRequest,
  ToolOpenResult,
  ToolProtocolMethod,
  ToolProtocolMethods,
  ToolRenderRequest,
  ToolRenderResult,
  ToolRequestMessage,
  ToolResponseMessage,
  ToolRuntimeContext,
  ToolSourceStatePayload,
  ToolSourceStateRestoreResult,
  ToolTransportError,
  ToolTransportErrorCode,
} from "@studio/contracts";
import {
  DEFAULT_REQUEST_TIMEOUT_MS,
  TOOL_ADAPTER_PROTOCOL_VERSION,
  TOOL_MESSAGING_PROTOCOL_VERSION,
} from "@studio/contracts";
import { createId } from "../../lib/ids";
import {
  isMessageScope,
  isProtocolMethod,
  isRecord,
  isSupportedProtocol,
  isToolEventMessage,
  isToolResponseMessage,
  scopesEqual,
} from "./protocol";

export interface IframeToolAdapterOptions {
  iframe: HTMLIFrameElement;
  bridgeUrl: string;
  toolId?: SourceToolId;
  adapterVersion?: string;
  hostOrigin?: string;
  /** Exact origin expected from the tool frame. Defaults to the bridge URL origin. */
  toolOrigin?: string;
  handshakeTimeoutMs?: number;
  requestTimeoutMs?: number;
  onEvent?: (event: ToolEvent) => void;
  /** Local protocol issues that should not be surfaced as tool errors can be observed here. */
  onProtocolViolation?: (error: ToolAdapterTransportError) => void;
}

interface PendingRequest {
  requestId: string;
  method: ToolProtocolMethod;
  resolve: (result: unknown) => void;
  reject: (error: ToolAdapterTransportError) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: ToolAdapterTransportError) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: ToolAdapterTransportError) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export class ToolAdapterTransportError extends Error implements ToolTransportError {
  readonly retryable: boolean;
  readonly details?: Record<string, unknown>;

  constructor(
    readonly code: ToolTransportErrorCode,
    message: string,
    options: { retryable?: boolean; details?: Record<string, unknown>; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "ToolAdapterTransportError";
    this.retryable = options.retryable ?? false;
    this.details = options.details;
  }
}

const DEFAULT_CAPABILITIES: ToolCapabilityReport = {
  toolId: "vector",
  adapterVersion: "1.0.0",
  protocolVersion: TOOL_ADAPTER_PROTOCOL_VERSION,
  integrationMode: "isolated-iframe",
  supported: ["open-canvas", "export-svg", "transparent-render", "editable-source"],
  limitations: [],
  outputFormats: ["svg"],
  runtimeRequirements: {},
};

/**
 * Secure host-side implementation of ToolAdapterV1 for a sandboxed/isolated
 * iframe. Every accepted message must come from the exact iframe window, the
 * exact expected origin, the current scope and a pending request ID.
 */
export class IframeToolAdapter implements ToolAdapterV1 {
  readonly protocolVersion: ToolAdapterProtocolVersion = TOOL_ADAPTER_PROTOCOL_VERSION;
  readonly toolId: SourceToolId;
  readonly adapterVersion: string;

  private readonly iframe: HTMLIFrameElement;
  private readonly bridgeUrl: URL;
  private readonly hostOrigin: string;
  private readonly toolOrigin: string;
  private readonly handshakeTimeoutMs: number;
  private readonly requestTimeoutMs: number;
  private readonly onEvent?: (event: ToolEvent) => void;
  private readonly onProtocolViolation?: (error: ToolAdapterTransportError) => void;
  private readonly pending = new Map<string, PendingRequest>();
  private scope: ScopedChannel["scope"] | null = null;
  private capabilities: ToolCapabilityReport;
  private initialized = false;
  private disposed = false;
  private handshake: Deferred<void> | null = null;

  constructor(options: IframeToolAdapterOptions) {
    if (!options.iframe) throw new Error("An iframe target is required.");
    this.iframe = options.iframe;
    this.toolId = options.toolId ?? "vector";
    this.adapterVersion = options.adapterVersion ?? "1.0.0";
    this.capabilities = { ...DEFAULT_CAPABILITIES, toolId: this.toolId };
    this.bridgeUrl = new URL(options.bridgeUrl, window.location.href);
    this.hostOrigin = normalizeOrigin(options.hostOrigin ?? window.location.origin);
    this.toolOrigin = normalizeOrigin(options.toolOrigin ?? this.bridgeUrl.origin);
    this.handshakeTimeoutMs = options.handshakeTimeoutMs ?? 15_000;
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.onEvent = options.onEvent;
    this.onProtocolViolation = options.onProtocolViolation;
    window.addEventListener("message", this.handleMessage);
  }

  async initialize(context: ToolRuntimeContext): Promise<ToolOpenResult> {
    this.assertUsable();
    if (this.initialized) {
      throw new ToolAdapterTransportError(
        "BAD_REQUEST",
        "This tool adapter is already initialized.",
      );
    }
    if (context.runtimeKind !== "iframe") {
      throw new ToolAdapterTransportError(
        "BAD_REQUEST",
        "IframeToolAdapter requires an iframe runtime context.",
      );
    }
    this.scope = {
      projectId: context.projectId,
      sessionId: context.sessionId,
      toolId: this.toolId,
      channelId: context.channelId,
    };

    const ready = deferred<void>();
    this.handshake = ready;
    const timeout = setTimeout(() => {
      if (this.handshake !== ready) return;
      this.handshake = null;
      ready.reject(
        new ToolAdapterTransportError(
          "TIMEOUT",
          "The Vector editor did not finish its secure handshake in time.",
          { retryable: true, details: { phase: "handshake" } },
        ),
      );
    }, this.handshakeTimeoutMs);

    const boot = {
      protocolVersion: TOOL_MESSAGING_PROTOCOL_VERSION,
      scope: this.scope,
      origins: {
        hostOrigin: this.hostOrigin,
        toolOrigin: this.toolOrigin,
        requireOriginMatch: true,
        allowNullOrigin: false,
      },
      hostOrigin: this.hostOrigin,
      toolOrigin: this.toolOrigin,
    };
    const url = new URL(this.bridgeUrl);
    url.hash = `studio=${encodeURIComponent(JSON.stringify(boot))}`;
    this.iframe.src = url.toString();

    try {
      await ready.promise;
    } finally {
      clearTimeout(timeout);
      if (this.handshake === ready) this.handshake = null;
    }

    const result = await this.request(
      "tool/initialize",
      { hostOrigin: this.hostOrigin, channelId: context.channelId },
      { allowBeforeInitialized: true },
    );
    if (result.capabilities) {
      this.capabilities = result.capabilities;
    }
    this.initialized = true;
    return result;
  }

  async open(request: ToolOpenRequest): Promise<ToolOpenResult> {
    this.assertInitialized();
    const result = await this.request("tool/open", request);
    if (result.capabilities) this.capabilities = result.capabilities;
    return result;
  }

  async receiveGlobalContext(context: StudioGlobalContext): Promise<ToolContextReceipt> {
    this.assertInitialized();
    return this.request("context/update", context);
  }

  async receiveInputAssets(assets: ToolInputAsset[]): Promise<ToolAssetReceipt[]> {
    this.assertInitialized();
    const result = await this.request("assets/input", assets);
    if (!Array.isArray(result)) {
      throw new ToolAdapterTransportError(
        "BAD_REQUEST",
        "The tool returned an invalid asset receipt.",
      );
    }
    return result;
  }

  async restoreSourceState(
    payload: ToolSourceStatePayload,
  ): Promise<ToolSourceStateRestoreResult> {
    this.assertInitialized();
    const result = await this.request("state/restore", payload);
    if (!result || typeof result.restored !== "boolean" || !Array.isArray(result.warnings)) {
      throw new ToolAdapterTransportError(
        "BAD_REQUEST",
        "The tool returned an invalid source-state restore result.",
      );
    }
    return result;
  }

  async render(request: ToolRenderRequest): Promise<ToolRenderResult> {
    this.assertInitialized();
    if (this.pending.has(request.requestId)) {
      throw new ToolAdapterTransportError(
        "BAD_REQUEST",
        `A request with ID ${request.requestId} is already pending.`,
      );
    }
    const result = await this.request("render", request, {
      requestId: request.requestId,
      timeoutMs: this.requestTimeoutMs,
    });
    if (!result || !result.rendered || typeof result.rendered.mimeType !== "string") {
      throw new ToolAdapterTransportError(
        "BAD_REQUEST",
        "The tool returned an invalid rendered asset.",
      );
    }
    return result;
  }

  async getEditableSourceState(): Promise<ToolSourceStatePayload> {
    this.assertInitialized();
    const result = await this.request("state/serialize", { reason: "publish" });
    if (!result || typeof result.content !== "string" && !(result.content instanceof Uint8Array)) {
      throw new ToolAdapterTransportError(
        "BAD_REQUEST",
        "The tool returned an invalid source document.",
      );
    }
    return result;
  }

  reportCapabilities(): ToolCapabilityReport {
    return this.capabilities;
  }

  async reportIssue(issue: ToolIssue): Promise<void> {
    // Surface host-observed adapter issues to the same local event channel used
    // for tool-originated progress/issue events. There is intentionally no
    // undefined wire method for host-to-tool diagnostics in protocol 1.0.0.
    this.onEvent?.({ type: "issue", issue });
  }

  async cancelOperation(requestId: string): Promise<boolean> {
    const pending = this.pending.get(requestId);
    if (!pending) return false;
    this.settlePending(
      requestId,
      new ToolAdapterTransportError("CANCELLED", "The tool operation was cancelled."),
    );
    const cancelRequestId = createId("cancel");
    this.postRequest("operation/cancel", { targetRequestId: requestId }, cancelRequestId);
    return true;
  }

  async close(options: ToolCloseOptions): Promise<void> {
    if (this.disposed) return;
    if (this.initialized) {
      try {
        await this.request("tool/close", options, {
          timeoutMs: Math.min(2_000, this.requestTimeoutMs),
        });
      } catch {
        // Closing must not strand host listeners even when the tool is unhealthy.
      }
    }
    this.dispose();
    try {
      this.iframe.src = "about:blank";
    } catch {
      // Iframe may already be detached.
    }
  }

  /** Remove listeners/timers and reject in-flight work. Safe to call repeatedly. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.removeEventListener("message", this.handleMessage);
    if (this.handshake) {
      this.handshake.reject(
        new ToolAdapterTransportError("CANCELLED", "The tool handshake was cancelled."),
      );
      this.handshake = null;
    }
    for (const [requestId, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(
        new ToolAdapterTransportError("CANCELLED", "The tool was closed.", {
          details: { requestId, method: pending.method },
        }),
      );
    }
    this.pending.clear();
  }

  private handleMessage = (event: MessageEvent): void => {
    if (this.disposed || !this.scope) return;
    // Sender validation is mandatory. Messages from the host window, another
    // iframe, or a popup are ignored even if their origin is trusted.
    if (event.source !== this.iframe.contentWindow) return;

    if (event.origin !== this.toolOrigin) {
      const error = new ToolAdapterTransportError(
        "ORIGIN_REJECTED",
        `Rejected a tool message from untrusted origin ${event.origin || "(none)"}.`,
        { details: { expectedOrigin: this.toolOrigin, receivedOrigin: event.origin } },
      );
      this.reportViolation(error);
      if (this.handshake) {
        const handshake = this.handshake;
        this.handshake = null;
        handshake.reject(error);
      }
      return;
    }

    const data: unknown = event.data;
    if (!isRecord(data) || typeof data.kind !== "string") return;

    if (data.kind === "event") {
      if (!isToolEventMessage(data)) return;
      if (!isSupportedProtocol(data.protocolVersion)) {
        const error = new ToolAdapterTransportError(
          "PROTOCOL_VERSION_MISMATCH",
          "The tool sent an unsupported protocol version.",
        );
        this.reportViolation(error);
        this.rejectHandshake(error);
        return;
      }
      if (!this.isCurrentScope(data.scope)) {
        const error = new ToolAdapterTransportError(
          "SCOPE_MISMATCH",
          "The tool event belongs to a different Studio session.",
        );
        this.reportViolation(error);
        this.rejectHandshake(error);
        return;
      }
      if (data.event.type === "ready") {
        if (this.handshake) {
          const handshake = this.handshake;
          this.handshake = null;
          if (data.event.capabilities) this.capabilities = data.event.capabilities;
          handshake.resolve();
        }
        return;
      }
      if (this.initialized) this.onEvent?.(data.event);
      return;
    }

    if (data.kind !== "response" || !isToolResponseMessage(data)) return;

    const pending = this.pending.get(data.requestId);
    if (!pending) {
      this.reportViolation(
        new ToolAdapterTransportError(
          "ADAPTER_ERROR",
          "Ignored an unsolicited or stale tool response.",
          { details: { reason: "stale-response", requestId: data.requestId } },
        ),
      );
      return;
    }

    if (!isSupportedProtocol(data.protocolVersion)) {
      this.settlePending(
        data.requestId,
        new ToolAdapterTransportError(
          "PROTOCOL_VERSION_MISMATCH",
          "The tool responded with an unsupported protocol version.",
        ),
      );
      return;
    }
    if (!this.isCurrentScope(data.scope)) {
      this.settlePending(
        data.requestId,
        new ToolAdapterTransportError(
          "SCOPE_MISMATCH",
          "The tool response belongs to a different Studio session.",
        ),
      );
      return;
    }
    if (!isProtocolMethod(data.method) || data.method !== pending.method) {
      this.settlePending(
        data.requestId,
        new ToolAdapterTransportError(
          "BAD_REQUEST",
          "The tool response does not match the requested operation.",
          { details: { expectedMethod: pending.method, receivedMethod: data.method } },
        ),
      );
      return;
    }

    clearTimeout(pending.timer);
    this.pending.delete(data.requestId);
    if (data.ok) {
      pending.resolve(data.result);
    } else {
      pending.reject(
        new ToolAdapterTransportError(
          data.error.code,
          data.error.message || "The tool operation failed.",
          { retryable: data.error.retryable, details: data.error.details },
        ),
      );
    }
  };

  private async request<M extends ToolProtocolMethod>(
    method: M,
    params: ToolProtocolMethods[M]["input"],
    options: {
      requestId?: string;
      timeoutMs?: number;
      allowBeforeInitialized?: boolean;
    } = {},
  ): Promise<ToolProtocolMethods[M]["output"]> {
    this.assertUsable();
    if (!options.allowBeforeInitialized) this.assertInitialized();
    if (!this.scope) {
      throw new ToolAdapterTransportError(
        "BAD_REQUEST",
        "The tool transport has no active session.",
      );
    }
    const requestId = options.requestId ?? createId("request");
    if (this.pending.has(requestId)) {
      throw new ToolAdapterTransportError(
        "BAD_REQUEST",
        `A request with ID ${requestId} is already pending.`,
      );
    }
    const timeoutMs = options.timeoutMs ?? this.requestTimeoutMs;
    const response = deferred<ToolProtocolMethods[M]["output"]>();
    const timer = setTimeout(() => {
      this.settlePending(
        requestId,
        new ToolAdapterTransportError(
          "TIMEOUT",
          `The tool did not respond to ${method} within ${Math.round(timeoutMs / 1000)}s.`,
          { retryable: true, details: { method, timeoutMs } },
        ),
      );
    }, timeoutMs);

    this.pending.set(requestId, {
      requestId,
      method,
      // The specific generic cannot be recovered from the map; the response
      // path resolves the same deferred through the untyped bridge below.
      resolve: response.resolve as (value: unknown) => void,
      reject: response.reject,
      timer,
    });

    this.postRequest(method, params, requestId);
    return response.promise;
  }

  private postRequest(method: ToolProtocolMethod, params: unknown, requestId: string): void {
    if (!this.scope) return;
    const message: ToolRequestMessage = {
      protocolVersion: TOOL_MESSAGING_PROTOCOL_VERSION,
      kind: "request",
      scope: this.scope,
      requestId,
      method,
      params: params as never,
      sentAt: new Date().toISOString(),
    };
    const target = this.iframe.contentWindow;
    if (!target) {
      this.settlePending(
        requestId,
        new ToolAdapterTransportError(
          "INTERNAL",
          "The tool iframe is not available.",
        ),
      );
      return;
    }
    try {
      target.postMessage(message, this.toolOrigin);
    } catch (error) {
      this.settlePending(
        requestId,
        new ToolAdapterTransportError(
          "INTERNAL",
          "Could not deliver a message to the tool iframe.",
          { cause: error },
        ),
      );
    }
  }

  private settlePending(requestId: string, error: ToolAdapterTransportError): void {
    const pending = this.pending.get(requestId);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(requestId);
    pending.reject(error);
  }

  private isCurrentScope(candidate: unknown): boolean {
    return (
      this.scope !== null &&
      isMessageScope(candidate) &&
      scopesEqual(candidate, this.scope)
    );
  }

  private reportViolation(error: ToolAdapterTransportError): void {
    this.onProtocolViolation?.(error);
  }

  private rejectHandshake(error: ToolAdapterTransportError): void {
    if (!this.handshake) return;
    const handshake = this.handshake;
    this.handshake = null;
    handshake.reject(error);
  }

  private assertUsable(): void {
    if (this.disposed) {
      throw new ToolAdapterTransportError("CANCELLED", "This tool session is closed.");
    }
  }

  private assertInitialized(): void {
    if (!this.initialized) {
      throw new ToolAdapterTransportError(
        "BAD_REQUEST",
        "The tool session has not completed initialization.",
      );
    }
  }
}

function normalizeOrigin(value: string): string {
  const origin = new URL(value).origin;
  if (origin === "null") {
    throw new Error("Tool origins must be explicit HTTP(S) origins.");
  }
  if (!/^https?:$/.test(new URL(origin).protocol)) {
    throw new Error("Tool origins must use HTTP or HTTPS.");
  }
  return origin;
}

export type { ToolEvent, ToolResponseMessage, ToolSourceStatePayload };
