import type {
  AssetKind,
  AssetReference,
  SourceToolId,
  StudioProject,
  ToolSourceStatePayload,
  ToolSourceStateReference,
} from "@studio/contracts";
import { sha256Hex } from "../lib/hash";
import { createId, nowIso } from "../lib/ids";
import { decodeBytes, encodeText, openDatabase, requestToPromise, transactionDone } from "./idb";

export const ASSET_DB_NAME = "studio-assets";
export const ASSET_DB_VERSION = 1;
export const ASSET_STORE = "assets";
export const SOURCE_STATE_STORE = "source-states";
const HASH_INDEX = "byContentHash";
const DEDUPE_INDEX = "byDedupeKey";

export interface PutAssetInput {
  bytes: Uint8Array;
  kind: AssetKind;
  name: string;
  mimeType: string;
  sourceTool: SourceToolId;
  width?: number;
  height?: number;
  durationSeconds?: number;
}

export interface StoredAssetRecord {
  id: string;
  bytes: Uint8Array;
  contentHash: string;
  dedupeKey: string;
  kind: AssetKind;
  name: string;
  mimeType: string;
  sourceTool: SourceToolId;
  width?: number;
  height?: number;
  durationSeconds?: number;
  createdAt: string;
}

export interface PutSourceStateInput {
  tool: SourceToolId;
  toolStateVersion: string;
  mimeType: string;
  content: string | Uint8Array;
  revision: number;
  label?: string;
}

export interface StoredSourceStateRecord {
  id: string;
  bytes: Uint8Array;
  contentHash: string;
  dedupeKey: string;
  tool: SourceToolId;
  toolStateVersion: string;
  mimeType: string;
  revision: number;
  label?: string;
  savedAt: string;
}

export interface MissingAssetReport {
  missingAssetIds: string[];
  missingSourceStateIds: string[];
  integrityErrors: string[];
}

export interface ImportAssetRecordInput {
  id: string;
  bytes: Uint8Array;
  contentHash: string;
  kind: AssetKind;
  name: string;
  mimeType: string;
  sourceTool: SourceToolId;
  width?: number;
  height?: number;
  durationSeconds?: number;
  createdAt?: string;
}

export interface ImportSourceStateRecordInput {
  id: string;
  bytes: Uint8Array;
  contentHash: string;
  tool: SourceToolId;
  toolStateVersion: string;
  mimeType: string;
  revision: number;
  label?: string;
  savedAt?: string;
}

export class AssetImportCollisionError extends Error {
  readonly code = "ASSET_IMPORT_COLLISION" as const;

  constructor(readonly recordId: string) {
    super(`An existing local record (${recordId}) has different content. Import was refused.`);
    this.name = "AssetImportCollisionError";
  }
}

export class MissingAssetError extends Error {
  readonly code = "MISSING_ASSET" as const;

  constructor(readonly assetId: string) {
    super(`Asset ${assetId} is missing from local storage.`);
    this.name = "MissingAssetError";
  }
}

export class AssetIntegrityError extends Error {
  readonly code = "ASSET_INTEGRITY_ERROR" as const;

  constructor(
    readonly assetId: string,
    message = "Stored asset content does not match its recorded hash.",
  ) {
    super(message);
    this.name = "AssetIntegrityError";
  }
}

function dedupeAssetKey(
  contentHash: string,
  kind: AssetKind,
  mimeType: string,
  sourceTool: SourceToolId,
  width?: number,
  height?: number,
): string {
  return [contentHash, kind, mimeType, sourceTool, width ?? 0, height ?? 0].join("|");
}

function dedupeSourceKey(
  contentHash: string,
  tool: SourceToolId,
  toolStateVersion: string,
  mimeType: string,
): string {
  return [contentHash, tool, toolStateVersion, mimeType].join("|");
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function toAssetReference(record: StoredAssetRecord): AssetReference {
  return {
    id: record.id,
    kind: record.kind,
    name: record.name,
    mimeType: record.mimeType,
    storage: {
      backend: "indexeddb",
      database: ASSET_DB_NAME,
      objectStore: ASSET_STORE,
      key: record.id,
    },
    byteSize: record.bytes.byteLength,
    width: record.width,
    height: record.height,
    durationSeconds: record.durationSeconds,
    contentHash: record.contentHash,
    createdAt: record.createdAt,
    sourceTool: record.sourceTool,
  };
}

function toSourceReference(record: StoredSourceStateRecord): ToolSourceStateReference {
  return {
    id: record.id,
    tool: record.tool,
    toolStateVersion: record.toolStateVersion,
    mimeType: record.mimeType,
    storage: {
      backend: "indexeddb",
      database: ASSET_DB_NAME,
      objectStore: SOURCE_STATE_STORE,
      key: record.id,
    },
    updatedAt: record.savedAt,
    revision: record.revision,
    contentHash: record.contentHash,
  };
}

/**
 * Durable immutable asset/source-state store. There is deliberately no
 * destructive cleanup in Phase 1: old revisions stay readable for undo/project
 * history, and future garbage collection must scan every retained project and
 * history reference before deleting content.
 */
export class AssetRepository {
  private databasePromise: Promise<IDBDatabase> | null = null;

  constructor(
    private readonly factory: IDBFactory | undefined =
      typeof indexedDB === "undefined" ? undefined : indexedDB,
  ) {}

  private database(): Promise<IDBDatabase> {
    if (!this.factory) {
      return Promise.reject(
        new Error("IndexedDB is unavailable in this browser context."),
      );
    }
    if (!this.databasePromise) {
      this.databasePromise = openDatabase(
        this.factory,
        ASSET_DB_NAME,
        ASSET_DB_VERSION,
        (database) => {
          if (!database.objectStoreNames.contains(ASSET_STORE)) {
            const store = database.createObjectStore(ASSET_STORE, { keyPath: "id" });
            store.createIndex(HASH_INDEX, "contentHash");
            store.createIndex(DEDUPE_INDEX, "dedupeKey");
          }
          if (!database.objectStoreNames.contains(SOURCE_STATE_STORE)) {
            const store = database.createObjectStore(SOURCE_STATE_STORE, {
              keyPath: "id",
            });
            store.createIndex(HASH_INDEX, "contentHash");
            store.createIndex(DEDUPE_INDEX, "dedupeKey");
          }
        },
      );
    }
    return this.databasePromise;
  }

  async putAsset(input: PutAssetInput): Promise<AssetReference> {
    if (!input.bytes.byteLength) {
      throw new Error("Refusing to store an empty asset.");
    }
    const bytes = new Uint8Array(input.bytes);
    const contentHash = await sha256Hex(bytes);
    const dedupeKey = dedupeAssetKey(
      contentHash,
      input.kind,
      input.mimeType,
      input.sourceTool,
      input.width,
      input.height,
    );
    const database = await this.database();
    const transaction = database.transaction(ASSET_STORE, "readwrite");
    const store = transaction.objectStore(ASSET_STORE);
    const operation = (async () => {
      const existing = (await requestToPromise(
        store.index(DEDUPE_INDEX).get(dedupeKey),
      )) as StoredAssetRecord | undefined;
      if (existing) return toAssetReference(existing);

      const record: StoredAssetRecord = {
        id: createId("asset"),
        bytes,
        contentHash,
        dedupeKey,
        kind: input.kind,
        name: input.name,
        mimeType: input.mimeType,
        sourceTool: input.sourceTool,
        width: input.width,
        height: input.height,
        durationSeconds: input.durationSeconds,
        createdAt: nowIso(),
      };
      store.add(record);
      return toAssetReference(record);
    })();
    try {
      const reference = await operation;
      await transactionDone(transaction);
      return reference;
    } catch (error) {
      try {
        transaction.abort();
      } catch {
        // The transaction may already be finished.
      }
      throw error;
    }
  }

  async getAsset(assetId: string): Promise<{ reference: AssetReference; bytes: Uint8Array }> {
    const database = await this.database();
    const transaction = database.transaction(ASSET_STORE, "readonly");
    const record = (await requestToPromise(
      transaction.objectStore(ASSET_STORE).get(assetId),
    )) as StoredAssetRecord | undefined;
    await transactionDone(transaction);
    if (!record) throw new MissingAssetError(assetId);
    const actualHash = await sha256Hex(record.bytes);
    if (record.contentHash && actualHash !== record.contentHash) {
      throw new AssetIntegrityError(assetId);
    }
    return { reference: toAssetReference(record), bytes: record.bytes };
  }

  async getAssetBytes(assetId: string): Promise<Uint8Array> {
    return (await this.getAsset(assetId)).bytes;
  }

  async putSourceState(input: PutSourceStateInput): Promise<ToolSourceStateReference> {
    const bytes =
      typeof input.content === "string"
        ? encodeText(input.content)
        : new Uint8Array(input.content);
    if (!bytes.byteLength) {
      throw new Error("Refusing to store empty tool source state.");
    }
    if (!Number.isInteger(input.revision) || input.revision < 1) {
      throw new Error("Source-state revision must be a positive integer.");
    }
    const contentHash = await sha256Hex(bytes);
    const dedupeKey = dedupeSourceKey(
      contentHash,
      input.tool,
      input.toolStateVersion,
      input.mimeType,
    );
    const database = await this.database();
    const transaction = database.transaction(SOURCE_STATE_STORE, "readwrite");
    const store = transaction.objectStore(SOURCE_STATE_STORE);
    const operation = (async () => {
      const existing = (await requestToPromise(
        store.index(DEDUPE_INDEX).get(dedupeKey),
      )) as StoredSourceStateRecord | undefined;
      if (existing) {
        return toSourceReference({
          ...existing,
          revision: input.revision,
          savedAt: nowIso(),
        });
      }
      const record: StoredSourceStateRecord = {
        id: createId("source"),
        bytes,
        contentHash,
        dedupeKey,
        tool: input.tool,
        toolStateVersion: input.toolStateVersion,
        mimeType: input.mimeType,
        revision: input.revision,
        label: input.label,
        savedAt: nowIso(),
      };
      store.add(record);
      return toSourceReference(record);
    })();
    try {
      const reference = await operation;
      await transactionDone(transaction);
      return reference;
    } catch (error) {
      try {
        transaction.abort();
      } catch {
        // The transaction may already be finished.
      }
      throw error;
    }
  }

  async getSourceState(reference: ToolSourceStateReference): Promise<ToolSourceStatePayload> {
    if (reference.storage.backend !== "indexeddb") {
      throw new Error("Only IndexedDB-backed source state can be loaded by the host.");
    }
    const database = await this.database();
    const transaction = database.transaction(SOURCE_STATE_STORE, "readonly");
    const record = (await requestToPromise(
      transaction.objectStore(SOURCE_STATE_STORE).get(reference.storage.key),
    )) as StoredSourceStateRecord | undefined;
    await transactionDone(transaction);
    if (!record) throw new MissingAssetError(reference.id);
    const actualHash = await sha256Hex(record.bytes);
    if (actualHash !== record.contentHash) {
      throw new AssetIntegrityError(reference.id);
    }
    if (!reference.contentHash || reference.contentHash !== actualHash) {
      throw new AssetIntegrityError(
        reference.id,
        "Source-state reference hash does not match its stored content.",
      );
    }
    if (record.tool !== reference.tool) {
      throw new AssetIntegrityError(reference.id, "Source-state tool mismatch.");
    }
    const isText = /json|text|svg/.test(record.mimeType);
    return {
      tool: record.tool,
      toolStateVersion: record.toolStateVersion,
      mimeType: record.mimeType,
      content: isText ? decodeBytes(record.bytes) : record.bytes,
      label: record.label,
    };
  }

  /**
   * Adds an asset under its original package ID without overwriting a local
   * record. Same-ID/same-content re-import is idempotent; different content is
   * rejected so a malicious or stale package cannot replace local data.
   */
  async importAssetRecord(input: ImportAssetRecordInput): Promise<AssetReference> {
    if (!input.id) throw new Error("Imported asset ID is required.");
    if (!input.bytes.byteLength) throw new Error("Refusing to import an empty asset.");
    const bytes = new Uint8Array(input.bytes);
    const actualHash = await sha256Hex(bytes);
    if (actualHash !== input.contentHash) {
      throw new AssetIntegrityError(
        input.id,
        "Imported asset content does not match its package hash.",
      );
    }
    const dedupeKey = dedupeAssetKey(
      input.contentHash,
      input.kind,
      input.mimeType,
      input.sourceTool,
      input.width,
      input.height,
    );
    const database = await this.database();
    const transaction = database.transaction(ASSET_STORE, "readwrite");
    const store = transaction.objectStore(ASSET_STORE);
    try {
      const existing = (await requestToPromise(store.get(input.id))) as
        | StoredAssetRecord
        | undefined;
      if (existing) {
        if (!bytesEqual(existing.bytes, bytes)) {
          throw new AssetImportCollisionError(input.id);
        }
        await transactionDone(transaction);
        return toAssetReference(existing);
      }
      const record: StoredAssetRecord = {
        id: input.id,
        bytes,
        contentHash: input.contentHash,
        dedupeKey,
        kind: input.kind,
        name: input.name,
        mimeType: input.mimeType,
        sourceTool: input.sourceTool,
        width: input.width,
        height: input.height,
        durationSeconds: input.durationSeconds,
        createdAt: input.createdAt ?? nowIso(),
      };
      store.add(record);
      await transactionDone(transaction);
      return toAssetReference(record);
    } catch (error) {
      try {
        transaction.abort();
      } catch {
        // The transaction may already be settled.
      }
      throw error;
    }
  }

  async importSourceStateRecord(
    input: ImportSourceStateRecordInput,
  ): Promise<ToolSourceStateReference> {
    if (!input.id) throw new Error("Imported source-state ID is required.");
    if (!input.bytes.byteLength) {
      throw new Error("Refusing to import empty tool source state.");
    }
    if (!Number.isInteger(input.revision) || input.revision < 1) {
      throw new Error("Imported source-state revision must be a positive integer.");
    }
    const bytes = new Uint8Array(input.bytes);
    const actualHash = await sha256Hex(bytes);
    if (actualHash !== input.contentHash) {
      throw new AssetIntegrityError(
        input.id,
        "Imported source state does not match its package hash.",
      );
    }
    const dedupeKey = dedupeSourceKey(
      input.contentHash,
      input.tool,
      input.toolStateVersion,
      input.mimeType,
    );
    const database = await this.database();
    const transaction = database.transaction(SOURCE_STATE_STORE, "readwrite");
    const store = transaction.objectStore(SOURCE_STATE_STORE);
    try {
      const existing = (await requestToPromise(store.get(input.id))) as
        | StoredSourceStateRecord
        | undefined;
      if (existing) {
        if (!bytesEqual(existing.bytes, bytes)) {
          throw new AssetImportCollisionError(input.id);
        }
        await transactionDone(transaction);
        return toSourceReference(existing);
      }
      const record: StoredSourceStateRecord = {
        id: input.id,
        bytes,
        contentHash: input.contentHash,
        dedupeKey,
        tool: input.tool,
        toolStateVersion: input.toolStateVersion,
        mimeType: input.mimeType,
        revision: input.revision,
        label: input.label,
        savedAt: input.savedAt ?? nowIso(),
      };
      store.add(record);
      await transactionDone(transaction);
      return toSourceReference(record);
    } catch (error) {
      try {
        transaction.abort();
      } catch {
        // The transaction may already be settled.
      }
      throw error;
    }
  }

  async listAssets(): Promise<AssetReference[]> {
    const database = await this.database();
    const transaction = database.transaction(ASSET_STORE, "readonly");
    const records = (await requestToPromise(
      transaction.objectStore(ASSET_STORE).getAll(),
    )) as StoredAssetRecord[];
    await transactionDone(transaction);
    return records.map(toAssetReference);
  }

  async listSourceStates(): Promise<ToolSourceStateReference[]> {
    const database = await this.database();
    const transaction = database.transaction(SOURCE_STATE_STORE, "readonly");
    const records = (await requestToPromise(
      transaction.objectStore(SOURCE_STATE_STORE).getAll(),
    )) as StoredSourceStateRecord[];
    await transactionDone(transaction);
    return records.map(toSourceReference);
  }

  async inspectProjectAssets(project: StudioProject): Promise<MissingAssetReport> {
    const database = await this.database();
    const transaction = database.transaction(
      [ASSET_STORE, SOURCE_STATE_STORE],
      "readonly",
    );
    const assetStore = transaction.objectStore(ASSET_STORE);
    const sourceStore = transaction.objectStore(SOURCE_STATE_STORE);
    const referencedAssetIds = new Set<string>();
    for (const asset of project.assets) referencedAssetIds.add(asset.id);
    for (const layer of project.layers) {
      if (layer.rendered?.assetId) referencedAssetIds.add(layer.rendered.assetId);
    }
    const sourceReferences = project.layers
      .map((layer) => layer.sourceState)
      .filter((reference): reference is ToolSourceStateReference => Boolean(reference));

    const missingAssetIds: string[] = [];
    const missingSourceStateIds: string[] = [];
    const integrityErrors: string[] = [];

    for (const assetId of referencedAssetIds) {
      const record = (await requestToPromise(assetStore.get(assetId))) as
        | StoredAssetRecord
        | undefined;
      if (!record) {
        missingAssetIds.push(assetId);
        continue;
      }
      const actualHash = await sha256Hex(record.bytes);
      if (actualHash !== record.contentHash) {
        integrityErrors.push(`Asset ${assetId} failed its content hash check.`);
      }
    }

    for (const reference of sourceReferences) {
      if (reference.storage.backend !== "indexeddb") {
        integrityErrors.push(`Source state ${reference.id} is not stored in IndexedDB.`);
        continue;
      }
      const record = (await requestToPromise(
        sourceStore.get(reference.storage.key),
      )) as StoredSourceStateRecord | undefined;
      if (!record) {
        missingSourceStateIds.push(reference.id);
        continue;
      }
      const actualHash = await sha256Hex(record.bytes);
      if (actualHash !== record.contentHash) {
        integrityErrors.push(`Source state ${reference.id} failed its content hash check.`);
      }
    }

    await transactionDone(transaction);
    return { missingAssetIds, missingSourceStateIds, integrityErrors };
  }

  close(): void {
    void this.databasePromise?.then((database) => database.close());
    this.databasePromise = null;
  }
}
