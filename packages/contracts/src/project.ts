import type { ArtboardId, AssetId, IsoDateTime, LayerId, ProjectId, SourceToolId } from "./ids";
import type { AssetReference } from "./assets";
import type { SharedLayer } from "./layer";

/** Increment when a persisted Studio project shape changes incompatibly. */
export const STUDIO_PROJECT_SCHEMA_VERSION = 1 as const;

export interface PixelDimensions {
  width: number;
  height: number;
  unit: "px";
}

/**
 * The global export target. Artboards normally mirror these dimensions; the
 * host treats this format as authoritative for final composition export.
 */
export interface ProjectFormat extends PixelDimensions {
  id: string;
  label: string;
  aspectRatio: number;
  orientation: "square" | "portrait" | "landscape";
}

export interface BackgroundSpec {
  kind: "solid" | "transparent" | "asset";
  /** CSS colour when `kind` is `solid`. */
  color?: string;
  /** Project asset reference when `kind` is `asset`. */
  assetId?: AssetId;
}

/** Lightweight artboard description passed to tools. */
export interface ArtboardContext {
  id: ArtboardId;
  name: string;
  index: number;
  width: number;
  height: number;
  background: BackgroundSpec;
}

/** Persisted artboard. `layerOrder` is the authoritative bottom-to-top order. */
export interface Artboard extends ArtboardContext {
  layerOrder: LayerId[];
}

/**
 * Provenance for an imported source editor. This is how the preserved upstream
 * baseline remains recoverable after histories are flattened into the monorepo.
 */
export interface SourceProjectReference {
  tool: SourceToolId;
  repositoryUrl: string;
  branch: string;
  commitSha: string;
  importedPath: string;
  license: string;
}

export interface ProjectMetadata {
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  author?: string;
  appVersion: string;
  tags: string[];
  notes?: string;
  sourceProjects: SourceProjectReference[];
}

/** A project asset is a metadata record plus a storage locator; binaries never live in project JSON. */
export interface StudioProject {
  id: ProjectId;
  name: string;
  schemaVersion: typeof STUDIO_PROJECT_SCHEMA_VERSION;
  format: ProjectFormat;
  artboards: Artboard[];
  /** Layer definitions; `Artboard.layerOrder` determines composition order. */
  layers: SharedLayer[];
  assets: AssetReference[];
  layerOrder: LayerId[];
  metadata: ProjectMetadata;
}

/** Narrow immutable context a tool needs when opening or receiving global updates. */
export interface StudioGlobalContext {
  projectId: ProjectId;
  projectName: string;
  schemaVersion: number;
  format: ProjectFormat;
  artboards: ArtboardContext[];
  activeArtboard: ArtboardContext;
  colorScheme: "light" | "dark";
  accentColor: string;
}

export function formatAspectRatio(width: number, height: number): number {
  return width / height;
}
