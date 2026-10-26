import type { StudioProject } from "@studio/contracts";
import { STUDIO_PROJECT_SCHEMA_VERSION } from "@studio/contracts";
import { nowIso } from "../lib/ids";
import { openDatabase, requestToPromise, transactionDone } from "./idb";

export const PROJECT_DB_NAME = "studio-projects";
export const PROJECT_DB_VERSION = 1;
export const PROJECT_STORE = "projects";
export const PROJECT_SAVED_AT_INDEX = "bySavedAt";

export interface StoredProjectRecord {
  id: string;
  revision: number;
  savedAt: string;
  schemaVersion: number;
  project: StudioProject;
}

export interface ProjectMigration {
  fromVersion: number;
  migrate(project: unknown): unknown;
}

export class ProjectRevisionConflictError extends Error {
  readonly code = "PROJECT_REVISION_CONFLICT" as const;

  constructor(
    readonly projectId: string,
    readonly expectedRevision: number,
    readonly actualRevision: number,
  ) {
    super(
      `Project ${projectId} changed on disk (expected revision ${expectedRevision}, found ${actualRevision}). Reload before saving.`,
    );
    this.name = "ProjectRevisionConflictError";
  }
}

export class UnsupportedProjectVersionError extends Error {
  readonly code = "UNSUPPORTED_PROJECT_VERSION" as const;

  constructor(
    readonly version: number,
    readonly supportedVersion: number = STUDIO_PROJECT_SCHEMA_VERSION,
  ) {
    super(
      `Project schema version ${version} is newer than supported version ${supportedVersion}.`,
    );
    this.name = "UnsupportedProjectVersionError";
  }
}

export class InvalidProjectError extends Error {
  readonly code = "INVALID_PROJECT" as const;

  constructor(message: string) {
    super(message);
    this.name = "InvalidProjectError";
  }
}

const DEFAULT_MIGRATIONS: ProjectMigration[] = [];

function validateProject(project: unknown): asserts project is StudioProject {
  if (!project || typeof project !== "object") {
    throw new InvalidProjectError("Project document is missing.");
  }
  const candidate = project as Partial<StudioProject>;
  if (typeof candidate.id !== "string" || !candidate.id) {
    throw new InvalidProjectError("Project ID is invalid.");
  }
  if (typeof candidate.name !== "string") {
    throw new InvalidProjectError("Project name is invalid.");
  }
  if (candidate.schemaVersion !== STUDIO_PROJECT_SCHEMA_VERSION) {
    throw new InvalidProjectError(
      `Project schemaVersion must be ${STUDIO_PROJECT_SCHEMA_VERSION}.`,
    );
  }
  if (
    !candidate.format ||
    !Number.isFinite(candidate.format.width) ||
    !Number.isFinite(candidate.format.height) ||
    candidate.format.width <= 0 ||
    candidate.format.height <= 0
  ) {
    throw new InvalidProjectError("Project format dimensions are invalid.");
  }
  if (!Array.isArray(candidate.artboards) || candidate.artboards.length === 0) {
    throw new InvalidProjectError("Project must contain at least one artboard.");
  }
  if (!Array.isArray(candidate.layers) || !Array.isArray(candidate.assets)) {
    throw new InvalidProjectError("Project layers/assets must be arrays.");
  }
  const artboardIds = new Set<string>();
  for (const artboard of candidate.artboards) {
    if (!artboard?.id || artboardIds.has(artboard.id)) {
      throw new InvalidProjectError("Artboard IDs must be present and unique.");
    }
    artboardIds.add(artboard.id);
    if (
      !Number.isFinite(artboard.width) ||
      !Number.isFinite(artboard.height) ||
      artboard.width <= 0 ||
      artboard.height <= 0
    ) {
      throw new InvalidProjectError(`Artboard ${artboard.id} has invalid dimensions.`);
    }
    if (!Array.isArray(artboard.layerOrder)) {
      throw new InvalidProjectError(`Artboard ${artboard.id} is missing layerOrder.`);
    }
  }
  const layerIds = new Set<string>();
  for (const layer of candidate.layers) {
    if (!layer?.id || layerIds.has(layer.id)) {
      throw new InvalidProjectError("Layer IDs must be present and unique.");
    }
    layerIds.add(layer.id);
    if (!artboardIds.has(layer.artboardId)) {
      throw new InvalidProjectError(
        `Layer ${layer.id} references unknown artboard ${layer.artboardId}.`,
      );
    }
  }
  for (const artboard of candidate.artboards) {
    for (const layerId of artboard.layerOrder) {
      if (!layerIds.has(layerId)) {
        throw new InvalidProjectError(
          `Artboard ${artboard.id} references unknown layer ${layerId}.`,
        );
      }
    }
  }
}

function migrateProject(
  rawProject: unknown,
  migrations: ProjectMigration[],
): StudioProject {
  if (!rawProject || typeof rawProject !== "object") {
    throw new InvalidProjectError("Stored project document is missing.");
  }
  let project = structuredClone(rawProject) as { schemaVersion?: number; [key: string]: unknown };
  const version = project.schemaVersion;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    throw new InvalidProjectError("Stored project has an invalid schemaVersion.");
  }
  if (version > STUDIO_PROJECT_SCHEMA_VERSION) {
    throw new UnsupportedProjectVersionError(version);
  }

  let current = version;
  while (current < STUDIO_PROJECT_SCHEMA_VERSION) {
    const migration = migrations.find((candidate) => candidate.fromVersion === current);
    if (!migration) {
      throw new InvalidProjectError(
        `No migration registered from project schema version ${current}.`,
      );
    }
    project = migration.migrate(project) as typeof project;
    current += 1;
    project.schemaVersion = current;
  }

  validateProject(project);
  return project;
}

/**
 * Durable Project repository. One project record is written in one IndexedDB
 * transaction with compare-and-set revision checking, so an interrupted or
 * stale write can never leave a partially updated document.
 */
export class ProjectRepository {
  private databasePromise: Promise<IDBDatabase> | null = null;

  constructor(
    private readonly factory: IDBFactory | undefined =
      typeof indexedDB === "undefined" ? undefined : indexedDB,
    private readonly migrations: ProjectMigration[] = DEFAULT_MIGRATIONS,
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
        PROJECT_DB_NAME,
        PROJECT_DB_VERSION,
        (database) => {
          if (!database.objectStoreNames.contains(PROJECT_STORE)) {
            const store = database.createObjectStore(PROJECT_STORE, { keyPath: "id" });
            store.createIndex(PROJECT_SAVED_AT_INDEX, "savedAt");
          }
        },
      );
    }
    return this.databasePromise;
  }

  async save(project: StudioProject, expectedRevision: number): Promise<StoredProjectRecord> {
    validateProject(project);
    if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
      throw new Error("Expected revision must be a non-negative integer.");
    }
    const database = await this.database();
    const transaction = database.transaction(PROJECT_STORE, "readwrite");
    const store = transaction.objectStore(PROJECT_STORE);
    let written: StoredProjectRecord | null = null;

    const completion = transactionDone(transaction);
    try {
      const existing = (await requestToPromise(store.get(project.id))) as
        | StoredProjectRecord
        | undefined;
      const actualRevision = existing?.revision ?? 0;
      if (actualRevision !== expectedRevision) {
        transaction.abort();
        await completion.catch(() => undefined);
        throw new ProjectRevisionConflictError(
          project.id,
          expectedRevision,
          actualRevision,
        );
      }
      written = {
        id: project.id,
        revision: actualRevision + 1,
        savedAt: nowIso(),
        schemaVersion: project.schemaVersion,
        // Structured clone of the project keeps binary-free document data only.
        project: structuredClone(project),
      };
      store.put(written);
      await completion;
      return written;
    } catch (error) {
      try {
        transaction.abort();
      } catch {
        // Transaction may have completed/aborted already.
      }
      await completion.catch(() => undefined);
      throw error;
    }
  }

  async load(projectId: string): Promise<StoredProjectRecord | null> {
    const database = await this.database();
    const transaction = database.transaction(PROJECT_STORE, "readonly");
    const record = (await requestToPromise(
      transaction.objectStore(PROJECT_STORE).get(projectId),
    )) as StoredProjectRecord | undefined;
    await transactionDone(transaction);
    if (!record) return null;
    return {
      ...record,
      project: migrateProject(record.project, this.migrations),
    };
  }

  async loadMostRecent(): Promise<StoredProjectRecord | null> {
    const database = await this.database();
    const transaction = database.transaction(PROJECT_STORE, "readonly");
    const records = (await requestToPromise(
      transaction.objectStore(PROJECT_STORE).getAll(),
    )) as StoredProjectRecord[];
    await transactionDone(transaction);
    if (records.length === 0) return null;
    records.sort((left, right) => right.savedAt.localeCompare(left.savedAt));
    const newest = records[0];
    return {
      ...newest,
      project: migrateProject(newest.project, this.migrations),
    };
  }

  async list(): Promise<StoredProjectRecord[]> {
    const database = await this.database();
    const transaction = database.transaction(PROJECT_STORE, "readonly");
    const records = (await requestToPromise(
      transaction.objectStore(PROJECT_STORE).getAll(),
    )) as StoredProjectRecord[];
    await transactionDone(transaction);
    return records.sort((left, right) => right.savedAt.localeCompare(left.savedAt));
  }

  close(): void {
    void this.databasePromise?.then((database) => database.close());
    this.databasePromise = null;
  }
}

export { migrateProject, validateProject };
