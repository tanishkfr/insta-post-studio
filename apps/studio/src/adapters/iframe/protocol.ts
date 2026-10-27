import type {
  MessageOriginPolicy,
  MessageScope,
  ToolEventMessage,
  ToolProtocolMethod,
  ToolRequestMessage,
  ToolResponseMessage,
  ToolTransportError,
} from "@studio/contracts";
import {
  TOOL_ADAPTER_PROTOCOL_VERSION,
  TOOL_MESSAGING_PROTOCOL_VERSION,
} from "@studio/contracts";

export const TOOL_PROTOCOL_METHODS = [
  "tool/initialize",
  "tool/open",
  "context/update",
  "assets/input",
  "state/restore",
  "state/serialize",
  "render",
  "capabilities/report",
  "operation/cancel",
  "bend/publish",
  "bend/publish/ack",
  "tool/close",
] as const satisfies readonly ToolProtocolMethod[];

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isMessageScope(value: unknown): value is MessageScope {
  return (
    isRecord(value) &&
    typeof value.projectId === "string" &&
    typeof value.sessionId === "string" &&
    typeof value.toolId === "string" &&
    typeof value.channelId === "string"
  );
}

export function isOriginPolicy(value: unknown): value is MessageOriginPolicy {
  return (
    isRecord(value) &&
    typeof value.hostOrigin === "string" &&
    typeof value.toolOrigin === "string" &&
    value.requireOriginMatch === true &&
    value.allowNullOrigin === false
  );
}

export function scopesEqual(left: MessageScope, right: MessageScope): boolean {
  return (
    left.projectId === right.projectId &&
    left.sessionId === right.sessionId &&
    left.toolId === right.toolId &&
    left.channelId === right.channelId
  );
}

export function isSupportedProtocol(version: unknown): boolean {
  return (
    version === TOOL_MESSAGING_PROTOCOL_VERSION ||
    version === TOOL_ADAPTER_PROTOCOL_VERSION
  );
}

export function isProtocolMethod(value: unknown): value is ToolProtocolMethod {
  return (
    typeof value === "string" &&
    (TOOL_PROTOCOL_METHODS as readonly string[]).includes(value)
  );
}

function isEnvelopeBase(
  value: unknown,
): value is { protocolVersion: unknown; scope: MessageScope; kind: string; sentAt: unknown } {
  return (
    isRecord(value) &&
    typeof value.protocolVersion === "string" &&
    typeof value.kind === "string" &&
    typeof value.sentAt === "string" &&
    isMessageScope(value.scope)
  );
}

export function isToolResponseMessage(value: unknown): value is ToolResponseMessage {
  if (!isEnvelopeBase(value) || value.kind !== "response") return false;
  const record = value as Record<string, unknown>;
  if (typeof record.requestId !== "string" || !isProtocolMethod(record.method)) return false;
  if (record.ok === true) {
    return "result" in record;
  }
  if (record.ok === false) {
    const error = record.error;
    return (
      isRecord(error) &&
      typeof error.code === "string" &&
      typeof error.message === "string"
    );
  }
  return false;
}

export function isToolRequestMessage(value: unknown): value is ToolRequestMessage {
  return (
    isEnvelopeBase(value) &&
    value.kind === "request" &&
    typeof (value as Record<string, unknown>).requestId === "string" &&
    isProtocolMethod((value as Record<string, unknown>).method) &&
    isRecord((value as Record<string, unknown>).params)
  );
}

export function isToolEventMessage(value: unknown): value is ToolEventMessage {
  if (!isEnvelopeBase(value) || value.kind !== "event") return false;
  const event = (value as Record<string, unknown>).event;
  return isRecord(event) && typeof event.type === "string";
}

export function normalizeTransportError(
  error: unknown,
  fallbackCode: ToolTransportError["code"] = "ADAPTER_ERROR",
): ToolTransportError {
  if (isRecord(error) && typeof error.code === "string" && typeof error.message === "string") {
    return {
      code: error.code as ToolTransportError["code"],
      message: error.message,
      retryable: error.retryable === true,
      details: isRecord(error.details) ? error.details : undefined,
    };
  }
  return {
    code: fallbackCode,
    message: error instanceof Error ? error.message : "The tool adapter reported an unknown error.",
    retryable: false,
  };
}

export function makeErrorResponse(
  scope: MessageScope,
  requestId: string,
  method: ToolProtocolMethod | string,
  error: ToolTransportError,
): ToolResponseMessage {
  return {
    protocolVersion: TOOL_MESSAGING_PROTOCOL_VERSION,
    kind: "response",
    scope,
    requestId,
    method: method as ToolProtocolMethod,
    ok: false,
    error,
    sentAt: new Date().toISOString(),
  };
}
