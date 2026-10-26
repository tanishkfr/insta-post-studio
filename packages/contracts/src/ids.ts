/**
 * Stable identifiers are opaque strings at the boundary.
 * Producers create them once; consumers must never infer meaning from their shape.
 */
export type ProjectId = string;
export type ArtboardId = string;
export type LayerId = string;
export type AssetId = string;
export type SessionId = string;
export type ChannelId = string;
export type RequestId = string;
export type ToolSourceStateId = string;

/** ISO-8601 UTC timestamps, for example `2026-10-26T12:00:00.000Z`. */
export type IsoDateTime = string;

/**
 * `host` owns composition/layout. The remaining identifiers map one-to-one to
 * the preserved standalone tools.
 */
export type SourceToolId =
  | "host"
  | "image"
  | "vector"
  | "generate"
  | "typography"
  | "shapes"
  | "bend";

export type ToolRuntimeKind = "iframe" | "react";

export type ToolIntegrationMode =
  | "isolated-iframe"
  | "react-hosted-subapp"
  | "dedicated-bridge";
