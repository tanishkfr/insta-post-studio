import type {
  Artboard,
  ArtboardId,
  AssetReference,
  LayerId,
  RenderedAssetReference,
  SharedLayer,
  StudioProject,
  ToolSourceStateReference,
} from "@studio/contracts";
import { createStore, type StoreApi } from "zustand/vanilla";
import { useStore } from "zustand";
import { nowIso, createId } from "../lib/ids";
import {
  defaultProject,
  findFormat,
  type NavToolId,
} from "../project/defaultProject";

export type ActiveTool = "canvas" | NavToolId;

export interface LayerArtworkUpdate {
  layerId: LayerId;
  sourceState: ToolSourceStateReference;
  rendered: RenderedAssetReference;
  renderedAsset: AssetReference;
  /** Additional binary inputs that the source document references (for example an Image source photo). */
  sourceAssets?: AssetReference[];
  /** Metadata tags replaced when a paint-mode tool changes its mode (for example Type Library → Custom). */
  tags?: string[];
}

export interface GeneratedLayoutTarget {
  hostLayerId: LayerId;
  centerXPercent: number;
  centerYPercent: number;
  widthPercent: number;
  aspectHOverW: number;
  rotationDegrees: number;
}

export interface StudioProjectState {
  project: StudioProject;
  activeArtboardId: ArtboardId;
  activeTool: ActiveTool;
  selectedLayerId: LayerId | null;
  past: StudioProject[];
  future: StudioProject[];
  hydrated: boolean;
}

export interface StudioProjectActions {
  hydrate(project: StudioProject): void;
  replaceProject(project: StudioProject): void;
  renameProject(name: string): void;
  setFormat(formatId: string): void;
  setActiveArtboard(artboardId: ArtboardId): void;
  setActiveTool(tool: ActiveTool): void;
  selectLayer(layerId: LayerId | null): void;
  addLayer(
    layer: SharedLayer,
    assets?: AssetReference[],
    options?: { position?: "top" | "back" },
  ): void;
  updateLayer(
    layerId: LayerId,
    patch: Partial<
      Pick<
        SharedLayer,
        "name" | "visible" | "locked" | "opacity" | "transform" | "blendMode"
      >
    >,
  ): void;
  applyLayerArtwork(update: LayerArtworkUpdate): void;
  /**
   * Applies a selected Generate alternative to unlocked, visible host layers in
   * one undoable commit. Native tool source documents are never touched.
   */
  applyGeneratedLayout(
    artboardId: ArtboardId,
    targets: GeneratedLayoutTarget[],
  ): number;
  deleteLayer(layerId: LayerId): void;
  duplicateLayer(layerId: LayerId): LayerId | null;
  moveLayer(layerId: LayerId, direction: "up" | "down"): void;
  undo(): void;
  redo(): void;
  /** Transactional rollback used when a publish commit cannot be durably saved. */
  rollbackLastCommit(): void;
}

export type StudioProjectStore = StudioProjectState & StudioProjectActions;
export type StudioProjectStoreApi = StoreApi<StudioProjectStore>;

const HISTORY_LIMIT = 50;

/**
 * Reconciles every layer with its artboard. `artboard.layerOrder` is
 * authoritative; `layer.order` and `project.layerOrder` are always derived from
 * it. Layers belonging to an artboard but missing from its order are appended in
 * their previous order rather than being silently dropped.
 */
export function synchronizeLayerOrder(project: StudioProject): StudioProject {
  const layersById = new Map(project.layers.map((layer) => [layer.id, layer]));
  const artboards: Artboard[] = project.artboards
    .slice()
    .sort((left, right) => left.index - right.index)
    .map((artboard) => {
      const seen = new Set<string>();
      const existing = artboard.layerOrder.filter((layerId) => {
        if (seen.has(layerId)) return false;
        const layer = layersById.get(layerId);
        if (!layer || layer.artboardId !== artboard.id) return false;
        seen.add(layerId);
        return true;
      });
      const missing = project.layers
        .filter(
          (layer) => layer.artboardId === artboard.id && !seen.has(layer.id),
        )
        .sort((left, right) => left.order - right.order)
        .map((layer) => layer.id);
      return { ...artboard, layerOrder: [...existing, ...missing] };
    });

  const artboardOrder = new Map(artboards.map((artboard, index) => [artboard.id, index]));
  const layers = project.layers
    .slice()
    .sort((left, right) => {
      const artboardDelta =
        (artboardOrder.get(left.artboardId) ?? Number.MAX_SAFE_INTEGER) -
        (artboardOrder.get(right.artboardId) ?? Number.MAX_SAFE_INTEGER);
      return artboardDelta || left.order - right.order;
    })
    .map((layer) => {
      const artboard = artboards.find((candidate) => candidate.id === layer.artboardId);
      return {
        ...layer,
        order: artboard ? artboard.layerOrder.indexOf(layer.id) : 0,
      };
    });

  return {
    ...project,
    artboards,
    layers,
    layerOrder: artboards.flatMap((artboard) => artboard.layerOrder),
  };
}

function touchProject(project: StudioProject): StudioProject {
  const normalized = synchronizeLayerOrder(project);
  return {
    ...normalized,
    metadata: {
      ...normalized.metadata,
      updatedAt: nowIso(),
    },
  };
}

function ensureExistingLayer(project: StudioProject, layerId: LayerId): SharedLayer {
  const layer = project.layers.find((candidate) => candidate.id === layerId);
  if (!layer) throw new Error(`Layer ${layerId} does not exist.`);
  return layer;
}

function clampTransformToArtboard(
  project: StudioProject,
  layer: SharedLayer,
  transform: SharedLayer["transform"],
): SharedLayer["transform"] {
  const artboard = project.artboards.find((candidate) => candidate.id === layer.artboardId);
  if (!artboard) return transform;
  const width = Math.min(Math.max(16, transform.width), artboard.width);
  const height = Math.min(Math.max(16, transform.height), artboard.height);
  const x = Math.min(Math.max(0, transform.x), Math.max(0, artboard.width - width));
  const y = Math.min(Math.max(0, transform.y), Math.max(0, artboard.height - height));
  return { ...transform, x, y, width, height };
}

export function createProjectStore(
  initialProject: StudioProject = defaultProject,
): StudioProjectStoreApi {
  return createStore<StudioProjectStore>()((set, get) => {
    const commit = (mutate: (project: StudioProject) => StudioProject): void => {
      const state = get();
      const next = touchProject(mutate(structuredClone(state.project)));
      const selectedLayerId =
        state.selectedLayerId && next.layers.some((layer) => layer.id === state.selectedLayerId)
          ? state.selectedLayerId
          : null;
      set({
        project: next,
        past: [...state.past, state.project].slice(-HISTORY_LIMIT),
        future: [],
        selectedLayerId,
      });
    };

    return {
      project: synchronizeLayerOrder(structuredClone(initialProject)),
      activeArtboardId: initialProject.artboards[0]?.id ?? "",
      activeTool: "canvas",
      selectedLayerId: null,
      past: [],
      future: [],
      hydrated: false,

      hydrate(project) {
        const normalized = synchronizeLayerOrder(structuredClone(project));
        set({
          project: normalized,
          activeArtboardId: normalized.artboards[0]?.id ?? "",
          activeTool: "canvas",
          selectedLayerId: null,
          past: [],
          future: [],
          hydrated: true,
        });
      },

      replaceProject(project) {
        const normalized = synchronizeLayerOrder(structuredClone(project));
        set({
          project: normalized,
          activeArtboardId: normalized.artboards[0]?.id ?? "",
          activeTool: "canvas",
          selectedLayerId: null,
          past: [],
          future: [],
          hydrated: true,
        });
      },

      renameProject(name) {
        const clean = name.trim().slice(0, 80) || "Untitled Project";
        if (clean === get().project.name) return;
        commit((project) => ({ ...project, name: clean }));
      },

      setFormat(formatId) {
        const nextFormat = findFormat(formatId);
        if (nextFormat.id === get().project.format.id) return;
        commit((project) => {
          // Layer coordinates are artboard pixel coordinates. Format changes
          // keep relative placement where possible and clamp so selection
          // handles remain reachable.
          const next: StudioProject = {
            ...project,
            format: nextFormat,
            artboards: project.artboards.map((artboard) => ({
              ...artboard,
              width: nextFormat.width,
              height: nextFormat.height,
            })),
          };
          return {
            ...next,
            layers: next.layers.map((layer) => ({
              ...layer,
              transform: clampTransformToArtboard(next, layer, layer.transform),
            })),
          };
        });
      },

      setActiveArtboard(artboardId) {
        if (get().project.artboards.some((artboard) => artboard.id === artboardId)) {
          set({ activeArtboardId: artboardId, selectedLayerId: null });
        }
      },

      setActiveTool(tool) {
        set({ activeTool: tool });
      },

      selectLayer(layerId) {
        set({ selectedLayerId: layerId });
      },

      addLayer(layer, assets = [], options = {}) {
        commit((project) => {
          if (project.layers.some((candidate) => candidate.id === layer.id)) {
            throw new Error(`Layer ${layer.id} already exists.`);
          }
          const artboard = project.artboards.find(
            (candidate) => candidate.id === layer.artboardId,
          );
          if (!artboard) throw new Error(`Artboard ${layer.artboardId} does not exist.`);
          const order = options.position === "back" ? 0 : artboard.layerOrder.length;
          const knownAssetIds = new Set(project.assets.map((asset) => asset.id));
          return {
            ...project,
            assets: [
              ...project.assets,
              ...assets.filter((asset) => !knownAssetIds.has(asset.id)),
            ],
            layers: [...project.layers, { ...structuredClone(layer), order }],
            artboards: project.artboards.map((candidate) =>
              candidate.id === artboard.id
                ? {
                    ...candidate,
                    layerOrder:
                      options.position === "back"
                        ? [layer.id, ...candidate.layerOrder]
                        : [...candidate.layerOrder, layer.id],
                  }
                : candidate,
            ),
          };
        });
        set({ selectedLayerId: layer.id });
      },

      updateLayer(layerId, patch) {
        commit((project) => {
          const layer = ensureExistingLayer(project, layerId);
          const patchCopy = structuredClone(patch);
          if (patchCopy.transform) {
            patchCopy.transform = clampTransformToArtboard(
              project,
              layer,
              patchCopy.transform,
            );
          }
          return {
            ...project,
            layers: project.layers.map((candidate) =>
              candidate.id === layerId
                ? {
                    ...layer,
                    ...patchCopy,
                    metadata: { ...layer.metadata, updatedAt: nowIso() },
                  }
                : candidate,
            ),
          };
        });
      },

      applyLayerArtwork(update) {
        commit((project) => {
          const layer = ensureExistingLayer(project, update.layerId);
          const assetMap = new Map(project.assets.map((asset) => [asset.id, asset]));
          assetMap.set(update.renderedAsset.id, update.renderedAsset);
          for (const asset of update.sourceAssets ?? []) assetMap.set(asset.id, asset);
          const tags = update.tags
            ? (() => {
                // Namespaced tags (for example `type-mode:library`) replace the
                // previous value with the same prefix; ordinary tags accumulate.
                const incomingPrefixes = new Set(
                  update.tags.map((tag) =>
                    tag.includes(":") ? `${tag.split(":")[0]}:` : null,
                  ),
                );
                const retained = (layer.metadata.tags ?? []).filter(
                  (tag) =>
                    !(tag.includes(":") && incomingPrefixes.has(`${tag.split(":")[0]}:`)),
                );
                return Array.from(new Set([...retained, ...update.tags]));
              })()
            : layer.metadata.tags;
          return {
            ...project,
            assets: Array.from(assetMap.values()),
            layers: project.layers.map((candidate) =>
              candidate.id === layer.id
                ? {
                    ...layer,
                    sourceState: update.sourceState,
                    rendered: update.rendered,
                    metadata: {
                      ...layer.metadata,
                      updatedAt: nowIso(),
                      toolVersion: `${update.sourceState.tool}@${update.sourceState.toolStateVersion}`,
                      tags,
                    },
                  }
                : candidate,
            ),
          };
        });
      },

      applyGeneratedLayout(artboardId, targets) {
        const state = get();
        const artboard = state.project.artboards.find(
          (candidate) => candidate.id === artboardId,
        );
        if (!artboard) return 0;
        const byId = new Map(targets.map((target) => [target.hostLayerId, target]));
        const nextTransforms = new Map<LayerId, SharedLayer["transform"]>();
        for (const layer of state.project.layers) {
          if (layer.artboardId !== artboardId) continue;
          if (layer.locked || !layer.visible) continue;
          const target = byId.get(layer.id);
          if (!target) continue;
          if (
            !Number.isFinite(target.centerXPercent) ||
            !Number.isFinite(target.centerYPercent) ||
            !Number.isFinite(target.widthPercent) ||
            !Number.isFinite(target.aspectHOverW) ||
            !Number.isFinite(target.rotationDegrees) ||
            target.widthPercent <= 0 ||
            target.aspectHOverW <= 0
          ) {
            continue;
          }
          let width = Math.max(16, (target.widthPercent / 100) * artboard.width);
          let height = Math.max(16, width * target.aspectHOverW);
          const fit = Math.min(1, artboard.width / width, artboard.height / height);
          width = Math.max(16, width * fit);
          height = Math.max(16, height * fit);
          const x = (target.centerXPercent / 100) * artboard.width - width / 2;
          const y = (target.centerYPercent / 100) * artboard.height - height / 2;
          const transform = clampTransformToArtboard(state.project, layer, {
            ...layer.transform,
            x: Math.round(x),
            y: Math.round(y),
            width: Math.round(width),
            height: Math.round(height),
            rotationDegrees: Math.round(target.rotationDegrees * 10) / 10,
          });
          const current = layer.transform;
          if (
            current.x !== transform.x ||
            current.y !== transform.y ||
            current.width !== transform.width ||
            current.height !== transform.height ||
            current.rotationDegrees !== transform.rotationDegrees
          ) {
            nextTransforms.set(layer.id, transform);
          }
        }
        if (nextTransforms.size === 0) return 0;
        commit((project) => ({
          ...project,
          layers: project.layers.map((layer) => {
            const transform = nextTransforms.get(layer.id);
            return transform
              ? {
                  ...layer,
                  transform,
                  metadata: { ...layer.metadata, updatedAt: nowIso() },
                }
              : layer;
          }),
        }));
        return nextTransforms.size;
      },

      deleteLayer(layerId) {
        if (!get().project.layers.some((layer) => layer.id === layerId)) return;
        commit((project) => ({
          ...project,
          layers: project.layers.filter((layer) => layer.id !== layerId),
          artboards: project.artboards.map((artboard) => ({
            ...artboard,
            layerOrder: artboard.layerOrder.filter((id) => id !== layerId),
          })),
        }));
        if (get().selectedLayerId === layerId) set({ selectedLayerId: null });
      },

      duplicateLayer(layerId) {
        const state = get();
        const source = state.project.layers.find((layer) => layer.id === layerId);
        if (!source) return null;
        const artboard = state.project.artboards.find(
          (candidate) => candidate.id === source.artboardId,
        );
        if (!artboard) return null;
        const timestamp = nowIso();
        const duplicate: SharedLayer = {
          ...structuredClone(source),
          id: createId("layer"),
          name: `${source.name} copy`.slice(0, 80),
          transform: clampTransformToArtboard(state.project, source, {
            ...structuredClone(source.transform),
            x: source.transform.x + 24,
            y: source.transform.y + 24,
          }),
          metadata: {
            ...source.metadata,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        };
        commit((project) => ({
          ...project,
          layers: [...project.layers, duplicate],
          artboards: project.artboards.map((candidate) => {
            if (candidate.id !== artboard.id) return candidate;
            const index = candidate.layerOrder.indexOf(layerId);
            const layerOrder = [...candidate.layerOrder];
            layerOrder.splice(index + 1, 0, duplicate.id);
            return { ...candidate, layerOrder };
          }),
        }));
        set({ selectedLayerId: duplicate.id });
        return duplicate.id;
      },

      moveLayer(layerId, direction) {
        commit((project) => {
          const layer = ensureExistingLayer(project, layerId);
          const artboard = project.artboards.find(
            (candidate) => candidate.id === layer.artboardId,
          );
          if (!artboard) throw new Error("Layer artboard is missing.");
          const layerOrder = [...artboard.layerOrder];
          const from = layerOrder.indexOf(layerId);
          const to = direction === "up" ? from + 1 : from - 1;
          if (from < 0 || to < 0 || to >= layerOrder.length) return project;
          [layerOrder[from], layerOrder[to]] = [layerOrder[to], layerOrder[from]];
          return {
            ...project,
            artboards: project.artboards.map((candidate) =>
              candidate.id === artboard.id ? { ...candidate, layerOrder } : candidate,
            ),
          };
        });
      },

      undo() {
        const state = get();
        const previous = state.past[state.past.length - 1];
        if (!previous) return;
        set({
          project: previous,
          past: state.past.slice(0, -1),
          future: [state.project, ...state.future].slice(0, HISTORY_LIMIT),
          selectedLayerId:
            state.selectedLayerId &&
            previous.layers.some((layer) => layer.id === state.selectedLayerId)
              ? state.selectedLayerId
              : null,
          activeArtboardId: previous.artboards.some(
            (artboard) => artboard.id === state.activeArtboardId,
          )
            ? state.activeArtboardId
            : previous.artboards[0]?.id ?? "",
        });
      },

      redo() {
        const state = get();
        const next = state.future[0];
        if (!next) return;
        set({
          project: next,
          past: [...state.past, state.project].slice(-HISTORY_LIMIT),
          future: state.future.slice(1),
          selectedLayerId:
            state.selectedLayerId &&
            next.layers.some((layer) => layer.id === state.selectedLayerId)
              ? state.selectedLayerId
              : null,
          activeArtboardId: next.artboards.some(
            (artboard) => artboard.id === state.activeArtboardId,
          )
            ? state.activeArtboardId
            : next.artboards[0]?.id ?? "",
        });
      },

      rollbackLastCommit() {
        const state = get();
        const previous = state.past[state.past.length - 1];
        if (!previous) return;
        set({
          project: previous,
          past: state.past.slice(0, -1),
          future: [],
          selectedLayerId:
            state.selectedLayerId &&
            previous.layers.some((layer) => layer.id === state.selectedLayerId)
              ? state.selectedLayerId
              : null,
          activeArtboardId: previous.artboards.some(
            (artboard) => artboard.id === state.activeArtboardId,
          )
            ? state.activeArtboardId
            : previous.artboards[0]?.id ?? "",
        });
      },
    };
  });
}

export const studioStore = createProjectStore();

export function useStudioStore<T>(selector: (state: StudioProjectStore) => T): T {
  return useStore(studioStore, selector);
}
