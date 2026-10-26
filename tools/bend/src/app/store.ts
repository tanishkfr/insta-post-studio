import { create } from "zustand";
import { clamp } from "../engine/core/timeline";
import { normalizeProject, updateProjectDuration } from "../engine/core/project";
import { pruneKeyframeSelection, type KeyframeRef } from "../engine/animation/keyframes";
import type { EffectStackClipboard } from "../engine/temporal/clipboard";
import type { LayerTreatmentClipboard } from "../engine/editing/treatment";
import type { BendProject, EditorTool, InspectorSection, MediaAssetRecord } from "../engine/core/types";

export type PreviewQuality = "draft" | "full";

export interface EditorNotice {
  id: number;
  message: string;
  tone: "info" | "warning" | "error";
}

export interface InspectorRequest {
  section: InspectorSection;
  target: "speed" | "transition" | "audio" | "appearance" | "mask" | "crop";
  nonce: number;
}

interface EditorStore {
  project: BendProject | null;
  activeLayerId: string | null;
  currentTime: number;
  isPlaying: boolean;
  activeTool: EditorTool;
  inspectorSection: InspectorSection;
  assetUrls: Record<string, string>;
  assetRecords: Record<string, MediaAssetRecord>;
  saveState: "idle" | "saving" | "saved" | "failed";
  saveError: string | null;
  history: BendProject[];
  future: BendProject[];
  autoKey: boolean;
  snapping: boolean;
  monitorAudio: boolean;
  canvasMode: "select" | "crop";
  cropBaseline: BendProject | null;
  compareLayerId: string | null;
  effectClipboard: EffectStackClipboard | null;
  treatmentClipboard: LayerTreatmentClipboard | null;
  keyframeSelection: KeyframeRef[];
  inspectorRequest: InspectorRequest | null;
  notice: EditorNotice | null;
  previewQuality: PreviewQuality;
  gestureActive: boolean;
  gestureEndedAt: number;
  setProject: (project: BendProject, assets?: Record<string, MediaAssetRecord>, urls?: Record<string, string>, activeLayerId?: string | null) => void;
  clearProject: () => void;
  setActiveLayer: (layerId: string | null) => void;
  setCurrentTime: (time: number) => void;
  setIsPlaying: (isPlaying: boolean) => void;
  setActiveTool: (tool: EditorTool) => void;
  setInspectorSection: (section: InspectorSection) => void;
  setAssetUrl: (assetId: string, url: string) => void;
  setAssetRecord: (asset: MediaAssetRecord) => void;
  removeAsset: (assetId: string) => void;
  commit: (label: string, updater: (project: BendProject) => BendProject) => void;
  updateTransient: (updater: (project: BendProject) => BendProject) => void;
  beginGesture: () => void;
  endGesture: () => void;
  cancelGesture: () => void;
  setAutoKey: (enabled: boolean) => void;
  setSnapping: (enabled: boolean) => void;
  setMonitorAudio: (enabled: boolean) => void;
  setCanvasMode: (mode: "select" | "crop") => void;
  startCrop: () => void;
  finishCrop: () => void;
  cancelCrop: () => void;
  setCompareLayer: (layerId: string | null) => void;
  setEffectClipboard: (clipboard: EffectStackClipboard | null) => void;
  setTreatmentClipboard: (clipboard: LayerTreatmentClipboard | null) => void;
  setKeyframeSelection: (selection: KeyframeRef[]) => void;
  requestInspector: (section: InspectorSection, target: InspectorRequest["target"]) => void;
  notify: (message: string, tone?: EditorNotice["tone"]) => void;
  dismissNotice: () => void;
  setPreviewQuality: (quality: PreviewQuality) => void;
  toggleKeyframeSelection: (ref: KeyframeRef) => void;
  clearKeyframeSelection: () => void;
  undo: () => void;
  redo: () => void;
  setSaveState: (state: EditorStore["saveState"], error?: string | null) => void;
}

const MAX_HISTORY = 40;

export const useEditorStore = create<EditorStore>((set) => ({
  project: null,
  activeLayerId: null,
  currentTime: 0,
  isPlaying: false,
  activeTool: "media",
  inspectorSection: "edit",
  assetUrls: {},
  assetRecords: {},
  saveState: "idle",
  saveError: null,
  history: [],
  future: [],
  autoKey: true,
  snapping: true,
  monitorAudio: false,
  canvasMode: "select",
  cropBaseline: null,
  compareLayerId: null,
  effectClipboard: null,
  treatmentClipboard: null,
  keyframeSelection: [],
  inspectorRequest: null,
  notice: null,
  previewQuality: "full",
  gestureActive: false,
  gestureEndedAt: 0,

  setProject: (project, assets = project.assets, urls = {}, activeLayerId = project.layers.at(-1)?.id ?? null) => set((state) => {
    revokeObjectUrls(state.assetUrls);
    return {
      project: normalizeProject(project),
      activeLayerId,
      currentTime: 0,
      isPlaying: false,
      activeTool: "media",
      inspectorSection: "edit",
      assetRecords: assets,
      assetUrls: urls,
      history: [],
      future: [],
      canvasMode: "select",
      cropBaseline: null,
      compareLayerId: null,
      effectClipboard: null,
      treatmentClipboard: null,
      keyframeSelection: [],
      inspectorRequest: null,
      notice: null,
      gestureActive: false,
      gestureEndedAt: 0,
      saveState: "saved",
      saveError: null,
    };
  }),

  clearProject: () => set((state) => {
    revokeObjectUrls(state.assetUrls);
    return {
      project: null,
      activeLayerId: null,
      currentTime: 0,
      isPlaying: false,
      assetUrls: {},
      assetRecords: {},
      history: [],
      future: [],
      canvasMode: "select",
      cropBaseline: null,
      compareLayerId: null,
      effectClipboard: null,
      treatmentClipboard: null,
      keyframeSelection: [],
      inspectorRequest: null,
      notice: null,
      gestureActive: false,
      gestureEndedAt: 0,
      saveState: "idle",
      saveError: null,
    };
  }),

  setActiveLayer: (activeLayerId) => set((state) => ({
    activeLayerId,
    compareLayerId: state.activeLayerId === activeLayerId ? state.compareLayerId : null,
    keyframeSelection: state.activeLayerId === activeLayerId ? state.keyframeSelection : [],
  })),
  setCurrentTime: (time) => set((state) => ({ currentTime: state.project ? clamp(time, 0, state.project.canvas.duration) : 0 })),
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  setActiveTool: (activeTool) => set({ activeTool, ...(activeTool === "effects" ? { inspectorSection: "effects" as const } : activeTool === "motion" ? { inspectorSection: "motion" as const } : activeTool === "media" ? { inspectorSection: "edit" as const } : {}) }),
  setInspectorSection: (inspectorSection) => set({ inspectorSection, inspectorRequest: null, activeTool: inspectorSection === "effects" ? "effects" : inspectorSection === "motion" ? "motion" : "media" }),
  setAssetUrl: (assetId, url) => set((state) => {
    const previous = state.assetUrls[assetId];
    if (previous && previous !== url) revokeObjectUrl(previous);
    return { assetUrls: { ...state.assetUrls, [assetId]: url } };
  }),
  setAssetRecord: (asset) => set((state) => ({ assetRecords: { ...state.assetRecords, [asset.id]: asset } })),
  removeAsset: (assetId) => set((state) => {
    const urls = { ...state.assetUrls };
    const records = { ...state.assetRecords };
    if (urls[assetId]) revokeObjectUrl(urls[assetId]);
    delete urls[assetId];
    delete records[assetId];
    return { assetUrls: urls, assetRecords: records };
  }),

  commit: (_label, updater) => set((state) => {
    if (!state.project) return state;
    const next = updateProjectDuration(normalizeProject(updater(structuredClone(state.project))));
    return {
      project: next,
      currentTime: clamp(state.currentTime, 0, next.canvas.duration),
      history: [...state.history, state.project].slice(-MAX_HISTORY),
      future: [],
      compareLayerId: null,
      keyframeSelection: pruneSelectionForProject(next, state.activeLayerId, state.keyframeSelection),
      gestureActive: false,
      saveState: "idle",
      saveError: null,
    };
  }),

  updateTransient: (updater) => set((state) => {
    if (!state.project) return state;
    const next = updateProjectDuration(normalizeProject(updater(structuredClone(state.project))));
    return {
      project: next,
      currentTime: clamp(state.currentTime, 0, next.canvas.duration),
      keyframeSelection: pruneSelectionForProject(next, state.activeLayerId, state.keyframeSelection),
      saveState: "idle",
    };
  }),

  beginGesture: () => set((state) => state.project ? {
    history: [...state.history, state.project].slice(-MAX_HISTORY),
    future: [],
    gestureActive: true,
  } : state),

  endGesture: () => set({ gestureActive: false, gestureEndedAt: Date.now() }),

  cancelGesture: () => set((state) => {
    if (!state.project || state.history.length === 0) return { ...state, gestureActive: false };
    return {
      project: state.history[state.history.length - 1],
      history: state.history.slice(0, -1),
      currentTime: clamp(state.currentTime, 0, state.history[state.history.length - 1].canvas.duration),
      gestureActive: false,
      saveState: "idle",
    };
  }),

  setAutoKey: (autoKey) => set({ autoKey }),
  setSnapping: (snapping) => set({ snapping }),
  setMonitorAudio: (monitorAudio) => set({ monitorAudio }),
  setCanvasMode: (canvasMode) => set({ canvasMode }),
  startCrop: () => set((state) => state.project ? { canvasMode: "crop", cropBaseline: structuredClone(state.project) } : state),
  finishCrop: () => set({ canvasMode: "select", cropBaseline: null }),
  cancelCrop: () => set((state) => {
    if (!state.cropBaseline) return { canvasMode: "select" as const, cropBaseline: null };
    const baseline = state.cropBaseline;
    const baselineIndex = state.history.map((entry) => JSON.stringify(entry)).lastIndexOf(JSON.stringify(baseline));
    const history = baselineIndex >= 0 ? state.history.slice(0, baselineIndex) : state.history;
    return { project: baseline, history, future: [], canvasMode: "select", cropBaseline: null, saveState: "idle", saveError: null };
  }),

  setCompareLayer: (compareLayerId) => set({ compareLayerId }),
  setEffectClipboard: (effectClipboard) => set({ effectClipboard }),
  setTreatmentClipboard: (treatmentClipboard) => set({ treatmentClipboard }),
  setKeyframeSelection: (keyframeSelection) => set({ keyframeSelection }),
  requestInspector: (section, target) => set((state) => ({
    inspectorSection: section,
    activeTool: section === "effects" ? "effects" : section === "motion" ? "motion" : "media",
    inspectorRequest: { section, target, nonce: (state.inspectorRequest?.nonce ?? 0) + 1 },
  })),
  notify: (message, tone = "info") => set((state) => ({ notice: { id: (state.notice?.id ?? 0) + 1, message, tone } })),
  dismissNotice: () => set({ notice: null }),
  setPreviewQuality: (previewQuality) => set({ previewQuality }),
  toggleKeyframeSelection: (ref) => set((state) => {
    const exists = state.keyframeSelection.some((candidate) => candidate.layerId === ref.layerId && candidate.property === ref.property && candidate.keyframeId === ref.keyframeId);
    const base = state.keyframeSelection.every((candidate) => candidate.layerId === ref.layerId) ? state.keyframeSelection : [];
    return {
      keyframeSelection: exists
        ? base.filter((candidate) => !(candidate.layerId === ref.layerId && candidate.property === ref.property && candidate.keyframeId === ref.keyframeId))
        : [...base, ref],
    };
  }),
  clearKeyframeSelection: () => set({ keyframeSelection: [] }),

  undo: () => set((state) => {
    if (!state.project || state.history.length === 0) return state;
    const previous = state.history[state.history.length - 1];
    return {
      project: previous,
      activeLayerId: reconcileActiveLayer(previous, state.activeLayerId),
      history: state.history.slice(0, -1),
      future: [state.project, ...state.future].slice(0, MAX_HISTORY),
      currentTime: clamp(state.currentTime, 0, previous.canvas.duration),
      compareLayerId: null,
      keyframeSelection: pruneSelectionForProject(previous, state.activeLayerId, state.keyframeSelection),
      gestureActive: false,
      saveState: "idle",
    };
  }),

  redo: () => set((state) => {
    if (!state.project || state.future.length === 0) return state;
    const next = state.future[0];
    return {
      project: next,
      activeLayerId: reconcileActiveLayer(next, state.activeLayerId),
      history: [...state.history, state.project].slice(-MAX_HISTORY),
      future: state.future.slice(1),
      currentTime: clamp(state.currentTime, 0, next.canvas.duration),
      compareLayerId: null,
      keyframeSelection: pruneSelectionForProject(next, state.activeLayerId, state.keyframeSelection),
      gestureActive: false,
      saveState: "idle",
    };
  }),

  setSaveState: (saveState, saveError = null) => set({ saveState, saveError }),
}));

function pruneSelectionForProject(project: BendProject, activeLayerId: string | null, selection: KeyframeRef[]): KeyframeRef[] {
  if (!activeLayerId || selection.length === 0) return [];
  const layer = project.layers.find((candidate) => candidate.id === activeLayerId);
  return pruneKeyframeSelection(layer, selection);
}

function reconcileActiveLayer(project: BendProject, activeLayerId: string | null): string | null {
  if (activeLayerId && project.layers.some((layer) => layer.id === activeLayerId)) return activeLayerId;
  return project.layers.at(-1)?.id ?? null;
}

function revokeObjectUrl(url: string): void {
  if (typeof URL !== "undefined") URL.revokeObjectURL(url);
}

function revokeObjectUrls(urls: Record<string, string>): void {
  Object.values(urls).forEach(revokeObjectUrl);
}

