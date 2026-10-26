import type { BendProject, StoredAssetRecord } from "../engine/core/types";
import type { BendHostComposition } from "../integration/contract";

const DATABASE_NAME = "bend-local";
const DATABASE_VERSION = 2;
const PROJECT_STORE = "projects";
const ASSET_STORE = "assets";
const HOST_COMPOSITION_STORE = "host-compositions";
const HOST_MEDIA_STORE = "host-media";

export interface StoredProjectRecord {
  id: string;
  savedAt: number;
  /** Monotonic per-project revision used to reject late writes. */
  revision?: number;
  project: BendProject;
}

export interface StoredHostCompositionRecord {
  id: string;
  savedAt: number;
  /** Monotonic per-composition revision used to reject stale host updates. */
  revision?: number;
  composition: BendHostComposition;
}

export interface StoredHostMediaRecord {
  id: string;
  kind: "video" | "still" | "package";
  mimeType: string;
  blob: Blob;
  /** Set by hosts that stage artifacts before committing a composition. */
  state?: "staged" | "committed";
  ownerLayerId?: string;
  sourceVersion?: string;
  createdAt?: number;
}

export function shouldAcceptProjectRevision(current: Pick<StoredProjectRecord, "revision" | "savedAt"> | null | undefined, incomingRevision: number): boolean {
  return (current?.revision ?? current?.savedAt ?? 0) <= incomingRevision;
}

let databasePromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  databasePromise ??= new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available in this browser."));
      return;
    }
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PROJECT_STORE)) db.createObjectStore(PROJECT_STORE, { keyPath: "id" });
      if (!db.objectStoreNames.contains(ASSET_STORE)) db.createObjectStore(ASSET_STORE, { keyPath: "id" });
      if (!db.objectStoreNames.contains(HOST_COMPOSITION_STORE)) db.createObjectStore(HOST_COMPOSITION_STORE, { keyPath: "id" });
      if (!db.objectStoreNames.contains(HOST_MEDIA_STORE)) db.createObjectStore(HOST_MEDIA_STORE, { keyPath: "id" });
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      resolve(database);
    };
    request.onerror = () => {
      databasePromise = null;
      reject(request.error ?? new Error("Could not open local storage."));
    };
  });
  return databasePromise;
}

function request<T>(storeName: string, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDatabase().then((db) => new Promise<T>((resolve, reject) => {
    let settled = false;
    let resultReady = false;
    let transactionComplete = false;
    let resultValue: T;
    const fail = (error: unknown, fallback: string) => {
      if (settled) return;
      settled = true;
      reject(error instanceof Error ? error : new Error(fallback));
    };
    const resolveIfComplete = () => {
      if (settled || !resultReady || !transactionComplete) return;
      settled = true;
      resolve(resultValue);
    };
    let transaction: IDBTransaction;
    try {
      transaction = db.transaction(storeName, mode);
      const result = run(transaction.objectStore(storeName));
      result.onsuccess = () => { resultValue = result.result; resultReady = true; resolveIfComplete(); };
      result.onerror = () => fail(result.error, "Local storage request failed.");
      transaction.onerror = () => fail(transaction.error, "Local storage transaction failed.");
      transaction.onabort = () => fail(transaction.error, "Local storage transaction was aborted.");
      transaction.oncomplete = () => { transactionComplete = true; resolveIfComplete(); };
    } catch (error) {
      fail(error, "Local storage transaction could not be started.");
    }
  }));
}

export async function saveProject(project: BendProject, revision = Date.now()): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const fail = (error: unknown, fallback: string) => {
      if (settled) return;
      settled = true;
      reject(error instanceof Error ? error : new Error(fallback));
    };
    let transaction: IDBTransaction;
    try {
      transaction = db.transaction(PROJECT_STORE, "readwrite");
      const store = transaction.objectStore(PROJECT_STORE);
      const currentRequest = store.get(project.id);
      currentRequest.onerror = () => fail(currentRequest.error, "Local project read failed before save.");
      currentRequest.onsuccess = () => {
        const current = currentRequest.result as StoredProjectRecord | undefined;
        if (shouldAcceptProjectRevision(current, revision)) {
          store.put({ id: project.id, savedAt: Date.now(), revision, project: structuredClone(project) } satisfies StoredProjectRecord);
        }
      };
      transaction.onerror = () => fail(transaction.error, "Local project save failed.");
      transaction.onabort = () => fail(transaction.error, "Local project save was aborted.");
      transaction.oncomplete = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
    } catch (error) {
      fail(error, "Local project save could not be started.");
    }
  });
}

export async function loadProject(id: string): Promise<StoredProjectRecord | null> {
  return (await request<StoredProjectRecord | undefined>(PROJECT_STORE, "readonly", (store) => store.get(id))) ?? null;
}

export async function loadMostRecentProject(): Promise<StoredProjectRecord | null> {
  const records = await request<StoredProjectRecord[]>(PROJECT_STORE, "readonly", (store) => store.getAll());
  return records.sort((a, b) => b.savedAt - a.savedAt)[0] ?? null;
}

export async function listProjects(): Promise<StoredProjectRecord[]> {
  const records = await request<StoredProjectRecord[]>(PROJECT_STORE, "readonly", (store) => store.getAll());
  return records.sort((a, b) => b.savedAt - a.savedAt);
}

export async function renameProject(id: string, name: string): Promise<StoredProjectRecord | null> {
  const record = await loadProject(id);
  if (!record) return null;
  const project = structuredClone(record.project);
  project.name = name.trim() || "Untitled signal";
  project.metadata.updatedAt = Date.now();
  await saveProject(project, Math.max(record.revision ?? record.savedAt, Date.now()));
  return loadProject(id);
}

export async function saveAsset(asset: StoredAssetRecord): Promise<void> {
  await request(ASSET_STORE, "readwrite", (store) => store.put(asset));
}

export async function loadAsset(id: string): Promise<StoredAssetRecord | null> {
  return (await request<StoredAssetRecord | undefined>(ASSET_STORE, "readonly", (store) => store.get(id))) ?? null;
}

export async function deleteAsset(id: string): Promise<void> {
  await request(ASSET_STORE, "readwrite", (store) => store.delete(id));
}

export async function deleteProject(id: string): Promise<void> {
  await request(PROJECT_STORE, "readwrite", (store) => store.delete(id));
}

export function collectReferencedAssetIds(projects: Array<Pick<StoredProjectRecord, "project">>, protectedAssetIds: Iterable<string> = []): Set<string> {
  const referenced = new Set(protectedAssetIds);
  for (const record of projects) Object.keys(record.project.assets).forEach((assetId) => referenced.add(assetId));
  return referenced;
}

/**
 * Media cleanup is intentionally conservative. A layer removal never calls
 * this function; project history and other saved projects may still need the
 * blob. Callers should settle the active project's save before using it.
 */
export async function cleanupUnreferencedAssets(protectedAssetIds: Iterable<string> = []): Promise<string[]> {
  const projects = await listProjects();
  const referenced = collectReferencedAssetIds(projects, protectedAssetIds);
  const assets = await request<StoredAssetRecord[]>(ASSET_STORE, "readonly", (store) => store.getAll());
  const orphaned = assets.map((asset) => asset.id).filter((assetId) => !referenced.has(assetId));
  await Promise.all(orphaned.map((assetId) => deleteAsset(assetId)));
  return orphaned;
}

export async function deleteProjectAndCleanup(id: string, protectedAssetIds: Iterable<string> = []): Promise<string[]> {
  await deleteProject(id);
  return cleanupUnreferencedAssets(protectedAssetIds);
}

export function isLocalPersistenceAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

/**
 * Save a host composition. When `expectedRevision` is supplied, the write only
 * succeeds if the stored revision still matches. This gives the local host a
 * compare-and-set commit across tabs without changing the storage backend.
 */
export async function saveHostComposition(composition: BendHostComposition, expectedRevision?: number): Promise<boolean> {
  const db = await openDatabase();
  return new Promise<boolean>((resolve, reject) => {
    let settled = false;
    let accepted = false;
    const fail = (error: unknown, fallback: string) => {
      if (settled) return;
      settled = true;
      reject(error instanceof Error ? error : new Error(fallback));
    };
    let transaction: IDBTransaction;
    try {
      transaction = db.transaction(HOST_COMPOSITION_STORE, "readwrite");
      const store = transaction.objectStore(HOST_COMPOSITION_STORE);
      const currentRequest = store.get(composition.id);
      currentRequest.onerror = () => fail(currentRequest.error, "Host composition read failed before save.");
      currentRequest.onsuccess = () => {
        const current = currentRequest.result as StoredHostCompositionRecord | undefined;
        const currentRevision = current?.revision ?? 0;
        if (expectedRevision !== undefined && expectedRevision !== currentRevision) {
          accepted = false;
          return;
        }
        accepted = true;
        store.put({
          id: composition.id,
          savedAt: Date.now(),
          revision: currentRevision + 1,
          composition: structuredClone(composition),
        } satisfies StoredHostCompositionRecord);
      };
      transaction.onerror = () => fail(transaction.error, "Host composition save failed.");
      transaction.onabort = () => fail(transaction.error, "Host composition save was aborted.");
      transaction.oncomplete = () => {
        if (settled) return;
        settled = true;
        resolve(accepted);
      };
    } catch (error) {
      fail(error, "Host composition save could not be started.");
    }
  });
}

export async function loadHostComposition(id: string): Promise<StoredHostCompositionRecord | null> {
  return (await request<StoredHostCompositionRecord | undefined>(HOST_COMPOSITION_STORE, "readonly", (store) => store.get(id))) ?? null;
}

export async function listHostCompositions(): Promise<StoredHostCompositionRecord[]> {
  return request<StoredHostCompositionRecord[]>(HOST_COMPOSITION_STORE, "readonly", (store) => store.getAll());
}

export async function saveHostMedia(media: StoredHostMediaRecord): Promise<void> {
  await request(HOST_MEDIA_STORE, "readwrite", (store) => store.put(media));
}

export async function loadHostMedia(id: string): Promise<StoredHostMediaRecord | null> {
  return (await request<StoredHostMediaRecord | undefined>(HOST_MEDIA_STORE, "readonly", (store) => store.get(id))) ?? null;
}

export async function listHostMedia(): Promise<StoredHostMediaRecord[]> {
  return request<StoredHostMediaRecord[]>(HOST_MEDIA_STORE, "readonly", (store) => store.getAll());
}

export async function deleteHostMedia(id: string): Promise<void> {
  await request(HOST_MEDIA_STORE, "readwrite", (store) => store.delete(id));
}

