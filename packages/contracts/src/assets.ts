import type { AssetId, IsoDateTime, LayerId, SourceToolId, ToolSourceStateId } from "./ids";

/**
 * Where a binary or editable payload lives. Project JSON stores locators only.
 * IndexedDB is the default host asset store; `inline` is reserved for adapter
 * transfers and tests, not durable project persistence.
 */
export type StorageLocator =
  | {
      backend: "indexeddb";
      database: string;
      objectStore: string;
      key: string;
    }
  | {
      backend: "inline";
      mimeType: string;
      dataUrl: string;
    }
  | {
      backend: "external-url";
      url: string;
      /** True when capture into IndexedDB is required for portability. */
      requiresIngest: boolean;
    };

export type AssetKind =
  | "source-image"
  | "rendered-image"
  | "vector"
  | "font"
  | "video"
  | "audio"
  | "project-package"
  | "other";

export interface AssetReference {
  id: AssetId;
  kind: AssetKind;
  name: string;
  mimeType: string;
  storage: StorageLocator;
  byteSize?: number;
  width?: number;
  height?: number;
  durationSeconds?: number;
  contentHash?: string;
  createdAt: IsoDateTime;
  sourceTool: SourceToolId;
}

export interface RenderedAssetReference {
  kind: "image" | "svg" | "video" | "audio";
  mimeType: string;
  /** Resolved only after the host has persisted the rendered bytes. */
  assetId?: AssetId;
  storage?: StorageLocator;
  width?: number;
  height?: number;
  durationSeconds?: number;
  /** Set when transparency is meaningful and preserved. */
  hasAlpha?: boolean;
  contentHash?: string;
}

/** Tool-specific editable state is opaque to the host. */
export interface ToolSourceStateReference {
  id: ToolSourceStateId;
  tool: SourceToolId;
  toolStateVersion: string;
  mimeType: string;
  storage: StorageLocator;
  updatedAt: IsoDateTime;
  /**
   * Monotonic host-side revision for this layer's source document. A new
   * revision must use a new storage key so project undo/history can still read
   * the prior document.
   */
  revision: number;
  contentHash?: string;
}

export interface ToolSourceStatePayload {
  tool: SourceToolId;
  /** Version of the tool's own document schema, not the Studio protocol version. */
  toolStateVersion: string;
  mimeType: string;
  /** JSON documents are strings; binary packages are bytes. */
  content: string | Uint8Array;
  /** Optional human-readable label for diagnostics. */
  label?: string;
}

export interface ToolInputAsset {
  layerId: LayerId;
  asset: AssetReference;
  role: "source" | "reference" | "rendered-input" | "audio-bed";
  /**
   * Bytes are only attached when the adapter requested them or when the host is
   * operating in the same runtime. Otherwise adapters resolve `asset.storage`.
   */
  bytes?: Uint8Array;
}

export interface ToolAssetReceipt {
  inputLayerId: LayerId;
  accepted: boolean;
  localAssetId?: string;
  message?: string;
}

export type ToolSourceStateRestoreResult = {
  restored: boolean;
  migratedFromVersion?: string;
  warnings: string[];
};
