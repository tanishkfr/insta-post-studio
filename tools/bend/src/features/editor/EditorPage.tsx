import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { AlertTriangle, FileArchive, FilePlus2, FileVideo, Film, FolderOpen, Keyboard, Library, Music2, Plus, Redo2, SlidersHorizontal, Sparkles, Undo2, Upload, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEditorStore } from "../../app/store";
import { ASPECT_PRESETS } from "../../engine/core/types";
import type { AspectPreset, BendLayer, BendProject, GeneratorId, MediaAssetRecord } from "../../engine/core/types";
import { createAssetRecord, inspectMediaFile, isSupportedAudioFile, isSupportedVideoFile, probeAudio, probeVideo } from "../../engine/media/media";
import { advanceLoopTime, isLoopUsable, isTimeInsideLoop } from "../../engine/core/loop";
import { applySourceReplacement, planSourceReplacement, type SourceDurationPolicy } from "../../engine/media/replacement";
import { createExampleProject, createProject, createProceduralLayer, createVideoLayer, createVideoProject, makeId } from "../../engine/core/project";
import { duplicateVideoClip, orderVideoClips, removeVideoClip, sequenceEnd, shiftClipsAfter, splitVideoClip } from "../../engine/editing/operations";
import { clamp, layerEndAt, layerStartAt } from "../../engine/core/timeline";
import { defaultSoundtrackDucking } from "../../engine/core/project";
import { GENERATOR_REGISTRY, getGeneratorDefinition } from "../../engine/generators/registry";
import { cleanupUnreferencedAssets, deleteProject, loadAsset, loadMostRecentProject, loadProject, listProjects, renameProject, saveAsset, saveProject, isLocalPersistenceAvailable } from "../../storage/indexedDb";
import { ProjectSaveCoordinator } from "../../storage/saveCoordinator";
import type { BendIntegrationProgress } from "../../integration/contract";
import { downloadBlob } from "../../engine/export/download";
import { CanvasStage } from "./CanvasStage";
import { Inspector } from "./Inspector";
import { Timeline } from "./Timeline";
import { ProjectLibraryDialog } from "./ProjectLibraryDialog";
import { ReplaceSourceDialog, type SourceReplacementCandidate } from "./ReplaceSourceDialog";
import { MediaLibraryDialog } from "./MediaLibraryDialog";
import { ShortcutDialog } from "./ShortcutDialog";
import { readEditableProjectPackage, restoreEditableProjectPackage } from "../../engine/package/portableProject";
import type { DecodedBendPackage } from "../../engine/package/bendPackage";
import { motionTokens } from "../../styles/motion";

const ExportDialog = lazy(() => import("./ExportDialog").then((module) => ({ default: module.ExportDialog })));

interface EditorPageProps {
  onExit: () => void;
  onNavigateHome: () => void;
  hostContext: { sessionId: string; layerId: string; sourceVersion: string | null } | null;
  onHostUpdated: () => void;
}

export function EditorPage({ onExit, onNavigateHome, hostContext, onHostUpdated }: EditorPageProps) {
  const project = useEditorStore((state) => state.project);
  const activeLayerId = useEditorStore((state) => state.activeLayerId);
  const currentTime = useEditorStore((state) => state.currentTime);
  const isPlaying = useEditorStore((state) => state.isPlaying);
  const inspectorSection = useEditorStore((state) => state.inspectorSection);
  const assetUrls = useEditorStore((state) => state.assetUrls);
  const assetRecords = useEditorStore((state) => state.assetRecords);
  const saveState = useEditorStore((state) => state.saveState);
  const saveError = useEditorStore((state) => state.saveError);
  const setProject = useEditorStore((state) => state.setProject);
  const setCurrentTime = useEditorStore((state) => state.setCurrentTime);
  const setIsPlaying = useEditorStore((state) => state.setIsPlaying);
  const setInspectorSection = useEditorStore((state) => state.setInspectorSection);
  const setActiveLayer = useEditorStore((state) => state.setActiveLayer);
  const setAssetUrl = useEditorStore((state) => state.setAssetUrl);
  const setAssetRecord = useEditorStore((state) => state.setAssetRecord);
  const commit = useEditorStore((state) => state.commit);
  const undo = useEditorStore((state) => state.undo);
  const redo = useEditorStore((state) => state.redo);
  const setSaveState = useEditorStore((state) => state.setSaveState);
  const setCompareLayer = useEditorStore((state) => state.setCompareLayer);
  const notify = useEditorStore((state) => state.notify);
  const notice = useEditorStore((state) => state.notice);
  const dismissNotice = useEditorStore((state) => state.dismissNotice);
  const gestureActive = useEditorStore((state) => state.gestureActive);
  const gestureEndedAt = useEditorStore((state) => state.gestureEndedAt);
  const historySize = useEditorStore((state) => state.history.length);
  const futureSize = useEditorStore((state) => state.future.length);
  const [loading, setLoading] = useState(project === null);
  const [showExport, setShowExport] = useState(false);
  const [exportSession, setExportSession] = useState(0);
  const [showProjectLibrary, setShowProjectLibrary] = useState(false);
  const [showNewProjectDialog, setShowNewProjectDialog] = useState(false);
  const [showExampleConfirm, setShowExampleConfirm] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showMediaLibrary, setShowMediaLibrary] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number; label: string } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [packageError, setPackageError] = useState<string | null>(null);
  const [packageNotice, setPackageNotice] = useState<string | null>(null);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [hostUpdateMessage, setHostUpdateMessage] = useState<string | null>(null);
  const [hostUpdateProgress, setHostUpdateProgress] = useState<BendIntegrationProgress | null>(null);
  const [hostUpdateWorking, setHostUpdateWorking] = useState(false);
  const [packageWorking, setPackageWorking] = useState(false);
  const [packagePreview, setPackagePreview] = useState<{ file: File; decoded: DecodedBendPackage } | null>(null);
  const [libraryRefreshKey, setLibraryRefreshKey] = useState(0);
  const [relinkAssetId, setRelinkAssetId] = useState<string | null>(null);
  const [replaceCandidate, setReplaceCandidate] = useState<SourceReplacementCandidate | null>(null);
  const [replaceLayerId, setReplaceLayerId] = useState<string | null>(null);
  const [isMobileInspectorOpen, setIsMobileInspectorOpen] = useState(false);
  const [isCompactLayout, setIsCompactLayout] = useState(() => window.matchMedia("(max-width: 820px)").matches);
  const [showGuide, setShowGuide] = useState(() => {
    try {
      return window.localStorage.getItem("bend-editor-guide-dismissed") !== "1";
    } catch {
      return true;
    }
  });
  const uploadInput = useRef<HTMLInputElement>(null);
  const mediaLibraryInput = useRef<HTMLInputElement>(null);
  const soundtrackInput = useRef<HTMLInputElement>(null);
  const packageInput = useRef<HTMLInputElement>(null);
  const relinkInput = useRef<HTMLInputElement>(null);
  const replaceInput = useRef<HTMLInputElement>(null);
  const exampleDialogRef = useRef<HTMLDivElement>(null);
  const exampleCloseButtonRef = useRef<HTMLButtonElement>(null);
  const packageDialogRef = useRef<HTMLDivElement>(null);
  const packageCloseButtonRef = useRef<HTMLButtonElement>(null);
  const urlsRef = useRef(assetUrls);
  const hostAbortRef = useRef<AbortController | null>(null);
  const saveCoordinatorRef = useRef<ProjectSaveCoordinator | null>(null);
  const startupCleanupRef = useRef(false);

  if (!saveCoordinatorRef.current) {
    saveCoordinatorRef.current = new ProjectSaveCoordinator(
      (nextProject, revision) => saveProject(nextProject, revision),
      (event) => {
        const current = useEditorStore.getState().project;
        if (!current || current.id !== event.job.projectId) return;
        if (event.state === "saving") setSaveState("saving");
        if (event.state === "saved") setSaveState("saved");
        if (event.state === "failed") setSaveState("failed", event.error instanceof Error ? event.error.message : "Local save failed.");
      },
    );
  }
  const saveCoordinator = saveCoordinatorRef.current;

  useEffect(() => { urlsRef.current = assetUrls; }, [assetUrls]);
  useEffect(() => { setShowAddMenu(false); }, [inspectorSection]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => dismissNotice(), notice.tone === "info" ? 5000 : 8000);
    return () => window.clearTimeout(timer);
  }, [dismissNotice, notice]);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 820px)");
    const onChange = () => setIsCompactLayout(media.matches);
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (isMobileInspectorOpen && isCompactLayout) document.querySelector<HTMLElement>(".editor-inspector.is-open [role='tab']")?.focus();
      if (!isMobileInspectorOpen && isCompactLayout) document.querySelector<HTMLElement>(".mobile-controls-toggle")?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isCompactLayout, isMobileInspectorOpen]);

  useEffect(() => {
    if (!showExampleConfirm) return;
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusFrame = window.requestAnimationFrame(() => exampleCloseButtonRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setShowExampleConfirm(false);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(exampleDialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex='-1'])") ?? []);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", onKeyDown);
      returnFocus?.focus();
    };
  }, [showExampleConfirm]);

  useEffect(() => {
    if (!packagePreview) return;
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusFrame = window.requestAnimationFrame(() => packageCloseButtonRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setPackagePreview(null);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(packageDialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex='-1'])") ?? []);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", onKeyDown);
      returnFocus?.focus();
    };
  }, [packagePreview]);

  useEffect(() => {
    if (project) {
      setLoading(false);
      return;
    }
    let alive = true;
    const load = hostContext
      ? import("../../integration/host")
        .then(({ loadHostEditSource }) => loadHostEditSource(hostContext.sessionId, hostContext.layerId, hostContext.sourceVersion ?? undefined))
        .then((source) => ({ project: source.restored.project, assets: source.restored.assets, urls: source.restored.urls }))
      : loadMostRecentProject().then(async (record) => {
        if (!record) return null;
        const assets: Record<string, MediaAssetRecord> = { ...record.project.assets };
        const urls: Record<string, string> = {};
        for (const asset of Object.values(record.project.assets)) {
          const stored = await loadAsset(asset.id);
          if (stored) urls[asset.id] = URL.createObjectURL(stored.blob);
          else assets[asset.id] = asset;
        }
        return { project: record.project, assets, urls };
      });
    void load.then((loaded) => {
      if (!alive) return;
      if (!loaded) {
        if (hostContext) {
          onExit();
          return;
        }
        setProject(createProject("4:5", "Untitled composition"), {}, {}, null);
      } else {
        setProject(loaded.project, loaded.assets, loaded.urls);
      }
      setLoading(false);
    }).catch(() => {
      if (hostContext) onExit();
      else setProject(createProject("4:5", "Untitled composition"), {}, {}, null);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [hostContext, onExit, project, setProject]);

  useEffect(() => {
    const flushOnPageHide = () => {
      const current = useEditorStore.getState().project;
      if (current) void saveCoordinator.flush(current.id).catch(() => undefined);
    };
    window.addEventListener("pagehide", flushOnPageHide);
    return () => {
      window.removeEventListener("pagehide", flushOnPageHide);
      const current = useEditorStore.getState().project;
      if (current) void saveCoordinator.flush(current.id).catch(() => undefined);
      for (const url of Object.values(urlsRef.current)) URL.revokeObjectURL(url);
      hostAbortRef.current?.abort();
    };
  }, [saveCoordinator]);

  useEffect(() => {
    if (!project) return;
    if (!isLocalPersistenceAvailable()) {
      setSaveState("failed", "IndexedDB is unavailable in this browser. Download a recovery copy before leaving.");
      return;
    }
    if (gestureActive) return;
    saveCoordinator.schedule(project);
  }, [gestureActive, gestureEndedAt, project, saveCoordinator, setSaveState]);

  useEffect(() => {
    if (!project || startupCleanupRef.current) return;
    startupCleanupRef.current = true;
    // Media removal keeps its blob and object URL for the current undo stack.
    // Orphans are reclaimed on the next studio load, after history is gone and
    // every saved project's references have been re-checked.
    void cleanupUnreferencedAssets(Object.keys(project.assets)).catch(() => undefined);
  }, [project]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      const state = useEditorStore.getState();
      if (state.saveState === "saving" || state.saveState === "idle" || state.saveState === "failed") {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, []);

  useEffect(() => {
    if (!project || !isPlaying) return;
    let frameId = 0;
    const loopActive = isLoopUsable(project.loop, project.canvas.duration);
    const loop = project.loop;
    let startAt = useEditorStore.getState().currentTime;
    if (loopActive && !isTimeInsideLoop(startAt, loop)) {
      startAt = loop.start;
      setCurrentTime(startAt);
    }
    const startTime = performance.now();
    const tick = (now: number) => {
      const next = startAt + (now - startTime) / 1000;
      if (loopActive) {
        if (next >= loop.end) {
          setCurrentTime(advanceLoopTime(next, loop));
        } else {
          setCurrentTime(Math.max(loop.start, next));
        }
        frameId = window.requestAnimationFrame(tick);
        return;
      }
      if (next >= project.canvas.duration) {
        setCurrentTime(project.canvas.duration);
        setIsPlaying(false);
        return;
      }
      setCurrentTime(next);
      frameId = window.requestAnimationFrame(tick);
    };
    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [isPlaying, project, setCurrentTime, setIsPlaying]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = Boolean(target?.closest("input, textarea, select, [contenteditable='true']"));
      const blockingSurface = Boolean(document.querySelector("[role='dialog'], [role='menu']"));
      if (event.key === "Escape") {
        setShowExport(false);
        setShowNewProjectDialog(false);
        setShowAddMenu(false);
        setShowShortcuts(false);
        setShowMediaLibrary(false);
        return;
      }
      if (typing || blockingSurface) return;
      const state = useEditorStore.getState();
      const current = state.project;
      const active = current?.layers.find((layer) => layer.id === state.activeLayerId) ?? null;
      if (!current) return;
      const meta = event.ctrlKey || event.metaKey;
      const lower = event.key.toLowerCase();
      if (meta && lower === "z") {
        event.preventDefault();
        if (event.shiftKey) redo(); else undo();
        return;
      }
      if (meta && lower === "y") {
        event.preventDefault();
        redo();
        return;
      }
      if (meta && lower === "d") {
        event.preventDefault();
        if (active?.kind === "video") {
          try {
            const result = duplicateVideoClip(current, active.id);
            commit("Duplicate clip", () => result.project);
            setActiveLayer(result.layerId);
            notify("Clip duplicated at the end of V1.", "info");
          } catch (error) {
            notify(error instanceof Error ? error.message : "This clip could not be duplicated.", "warning");
          }
        }
        return;
      }
      if (meta || event.altKey && !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      if (event.key === "?") {
        event.preventDefault();
        setShowShortcuts(true);
        return;
      }
      if (event.shiftKey && lower === "m") {
        event.preventDefault();
        setShowMediaLibrary(true);
        return;
      }
      if (event.shiftKey && lower === "f") {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent("bend:timeline-zoom-fit"));
        return;
      }
      if (event.key === " ") {
        const interactive = target?.closest("button, a, [role='button'], [role='tab']");
        const timelineTarget = target?.closest(".sequence-clip-hit, .sequence-music-clip, .timeline-clip, .timeline-ruler");
        if (interactive && !timelineTarget) return;
        event.preventDefault();
        setIsPlaying(!state.isPlaying);
        return;
      }
      if (event.altKey && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
        if (active?.kind !== "video") return;
        event.preventDefault();
        try {
          let droppedTransitions = 0;
          commit(event.key === "ArrowLeft" ? "Move clip earlier" : "Move clip later", (draft) => {
            const before = draft.layers.filter((layer) => layer.kind === "video" && layer.transitionIn).length;
            const next = orderVideoClips(draft, active.id, event.key === "ArrowLeft" ? -1 : 1);
            const after = next.layers.filter((layer) => layer.kind === "video" && layer.transitionIn).length;
            droppedTransitions = Math.max(0, before - after);
            return next;
          });
          if (droppedTransitions > 0) notify(`Clip moved once. ${droppedTransitions} transition${droppedTransitions === 1 ? " was" : "s were"} removed because the cut no longer shares an adjacent outgoing clip; Undo restores the sequence.`, "warning");
        } catch (error) {
          notify(error instanceof Error ? error.message : "This clip could not be reordered.", "warning");
        }
        return;
      }
      const arrowTarget = target?.closest("button, a, [role='button'], [role='slider'], [role='tab'], [role='menuitem']");
      const timelineTarget = target?.closest(".sequence-clip-hit, .sequence-music-clip, .timeline-clip, .timeline-ruler");
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
        const canvasActive = Boolean(document.activeElement?.closest(".canvas-area"));
        if ((arrowTarget && !timelineTarget) || canvasActive) return;
        event.preventDefault();
        if (event.key === "Home") { setCurrentTime(0); return; }
        if (event.key === "End") { setCurrentTime(current.canvas.duration); return; }
        if (event.key === "ArrowUp" || event.key === "ArrowDown") {
          const points = [...new Set([0, current.canvas.duration, ...current.layers.filter((layer) => layer.kind === "video").flatMap((layer) => [layerStartAt(layer), layerEndAt(layer)])])].sort((left, right) => left - right);
          const next = event.key === "ArrowDown"
            ? points.find((point) => point > state.currentTime + 0.001)
            : [...points].reverse().find((point) => point < state.currentTime - 0.001);
          if (next !== undefined) setCurrentTime(next);
          return;
        }
        const step = event.shiftKey ? 1 : 1 / Math.max(1, current.canvas.fps);
        setCurrentTime(clamp(state.currentTime + (event.key === "ArrowRight" ? step : -step), 0, current.canvas.duration));
        return;
      }
      if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (active?.kind !== "video") {
          notify("Select a video clip on V1 to split.", "warning");
          return;
        }
        try {
          const result = splitVideoClip(current, active.id, state.currentTime);
          commit("Split clip at playhead", () => result.project);
          setActiveLayer(result.rightId);
          notify(`Split at ${state.currentTime.toFixed(2)}s. Both segments share the source.`, "info");
        } catch (error) {
          notify(error instanceof Error ? error.message : "This clip could not be split here.", "warning");
        }
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        if (!active) return;
        if (active.kind === "video") {
          const clips = current.layers.filter((layer) => layer.kind === "video");
          const index = clips.findIndex((layer) => layer.id === active.id);
          const next = clips[index + 1]?.id ?? clips[index - 1]?.id ?? null;
          try {
            const nextProject = removeVideoClip(current, active.id, event.shiftKey);
            commit(event.shiftKey ? "Ripple delete clip" : "Delete clip", () => nextProject);
            setActiveLayer(next);
            notify(event.shiftKey ? "Clip removed and following clips closed the gap." : "Clip removed; the gap remains.", "info");
          } catch (error) {
            notify(error instanceof Error ? error.message : "This clip could not be removed.", "warning");
          }
        } else {
          const index = current.layers.findIndex((layer) => layer.id === active.id);
          const next = current.layers[index + 1] ?? current.layers[index - 1] ?? null;
          commit("Delete layer", (draft) => ({ ...draft, layers: draft.layers.filter((layer) => layer.id !== active.id) }));
          setActiveLayer(next?.id ?? null);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [commit, notify, redo, setActiveLayer, setCurrentTime, setIsPlaying, undo]);

  const settleCurrentProject = async (): Promise<boolean> => {
    const current = useEditorStore.getState().project;
    if (!current) return true;
    if (!isLocalPersistenceAvailable()) {
      setRecoveryError("Local storage is unavailable. Download a recovery copy before leaving this project.");
      return false;
    }
    try {
      await saveCoordinator.settle(current.id);
      setRecoveryError(null);
      return true;
    } catch (error) {
      setRecoveryError(error instanceof Error ? `BEND could not safely leave this project: ${error.message}` : "BEND could not safely leave this project.");
      return false;
    }
  };

  const loadProjectAssets = async (nextProject: BendProject) => {
    const assets: Record<string, MediaAssetRecord> = { ...nextProject.assets };
    const urls: Record<string, string> = {};
    for (const asset of Object.values(nextProject.assets)) {
      const stored = await loadAsset(asset.id);
      if (stored) urls[asset.id] = URL.createObjectURL(stored.blob);
    }
    return { assets, urls };
  };

  const switchToProject = async (id: string) => {
    if (id === useEditorStore.getState().project?.id) {
      setShowProjectLibrary(false);
      return;
    }
    if (!await settleCurrentProject()) return;
    const record = await loadProject(id);
    if (!record) throw new Error("That project is no longer available in local storage.");
    const loaded = await loadProjectAssets(record.project);
    setProject(record.project, loaded.assets, loaded.urls);
    setShowProjectLibrary(false);
    setPackageError(null);
  };

  const renameStoredProject = async (id: string, name: string) => {
    const current = useEditorStore.getState().project;
    if (current?.id === id) {
      commit("Rename project", (draft) => { draft.name = name; return draft; });
      const latest = useEditorStore.getState().project;
      if (latest) saveCoordinator.schedule(latest);
      await saveCoordinator.settle(id);
      return;
    }
    await renameProject(id, name);
  };

  const duplicateCurrentProject = async () => {
    const current = useEditorStore.getState().project;
    if (!current || !await settleCurrentProject()) return;
    const duplicate = structuredClone(current);
    duplicate.id = makeId("project");
    duplicate.name = `${current.name} copy`;
    duplicate.metadata = { ...duplicate.metadata, createdAt: Date.now(), updatedAt: Date.now() };
    await saveProject(duplicate);
    const loaded = await loadProjectAssets(duplicate);
    setProject(duplicate, loaded.assets, loaded.urls);
    setLibraryRefreshKey((key) => key + 1);
    setShowProjectLibrary(false);
  };

  const deleteStoredProject = async (id: string) => {
    const current = useEditorStore.getState().project;
    if (current?.id === id && !await settleCurrentProject()) return;
    await deleteProject(id);
    if (current?.id === id) {
      const remaining = await listProjects();
      if (remaining[0]) {
        const loaded = await loadProjectAssets(remaining[0].project);
        setProject(remaining[0].project, loaded.assets, loaded.urls);
      } else {
        setProject(createProject(getAspectFromProject(current), "Untitled composition"), {}, {}, null);
      }
    }
    // Keep the active project's media protected while deleting a non-active
    // project, then reclaim only assets no persisted project references.
    const activeProject = useEditorStore.getState().project;
    const activeAssets = activeProject ? Object.keys(activeProject.assets) : [];
    await cleanupUnreferencedAssets(activeAssets);
    setLibraryRefreshKey((key) => key + 1);
  };

  const importVideoFiles = async (files: File[], autoAdd = true) => {
    if (files.length === 0) return;
    setImportError(null);
    const failures: string[] = [];
    let imported = 0;
    let lastLayerId: string | null = null;
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      setImportProgress({ current: index + 1, total: files.length, label: file.name });
      if (!isSupportedVideoFile(file)) {
        failures.push(`${file.name}: unsupported video. Use browser-compatible MP4 or WebM.`);
        continue;
      }
      try {
        const metadata = await probeVideo(file);
        const asset = { ...createAssetRecord(file, metadata), ...await inspectMediaFile(file) };
        await saveAsset({ ...asset, blob: file });
        const url = URL.createObjectURL(file);
        if (!useEditorStore.getState().project) {
          const nextProject = createVideoProject(getAspectFromProject(project), asset, false);
          setProject(nextProject, { [asset.id]: asset }, { [asset.id]: url }, nextProject.layers[0]?.id ?? null);
          lastLayerId = nextProject.layers[0]?.id ?? null;
        } else {
          const layer = createVideoLayer(asset, false);
          setAssetRecord(asset);
          setAssetUrl(asset.id, url);
          commit(autoAdd ? "Import footage" : "Add media to library", (draft) => {
            const next = { ...draft, assets: { ...draft.assets, [asset.id]: asset } };
            if (autoAdd) {
              layer.timeline.start = sequenceEnd(draft);
              next.layers = [...draft.layers, layer];
              next.canvas = { ...draft.canvas, duration: Math.max(draft.canvas.duration, layer.timeline.start + layer.timeline.duration) };
            }
            return next;
          });
          if (autoAdd) lastLayerId = layer.id;
        }
        imported += 1;
      } catch (error) {
        failures.push(`${file.name}: ${error instanceof Error ? error.message : "could not be imported."}`);
      }
    }
    setImportProgress(null);
    if (lastLayerId) setActiveLayer(lastLayerId);
    if (autoAdd) {
      setInspectorSection("edit");
      setShowAddMenu(false);
    }
    if (failures.length > 0) {
      const message = `${imported} of ${files.length} source${files.length === 1 ? "" : "s"} imported. ${failures.join(" ")}`;
      setImportError(message);
      notify(message, "warning");
    } else if (files.length > 1) {
      notify(autoAdd ? `${imported} clips added to V1. Open Media to reuse any source.` : `${imported} sources added to Media. Add them to V1 when ready.`, "info");
    }
  };

  const importLibraryMedia = async (files: File[]) => {
    if (files.length === 0) return;
    setImportError(null);
    setShowMediaLibrary(true);
    const failures: string[] = [];
    let imported = 0;
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      setImportProgress({ current: index + 1, total: files.length, label: file.name });
      const audio = isSupportedAudioFile(file) && !isSupportedVideoFile(file);
      if (!audio && !isSupportedVideoFile(file)) {
        failures.push(`${file.name}: unsupported file.`);
        continue;
      }
      try {
        if (audio) {
          const metadata = await probeAudio(file);
          const inspection = await inspectMediaFile(file);
          const duration = Math.max(metadata.duration, inspection.duration ?? 0);
          if (!(duration >= 0.1) || inspection.audio.status !== "available") {
            throw new Error(inspection.audio.message || "BEND could not decode the audio duration.");
          }
          const asset = { ...createAssetRecord(file, { ...metadata, duration }, "audio"), ...inspection, duration };
          await saveAsset({ ...asset, blob: file });
          const url = URL.createObjectURL(file);
          setAssetRecord(asset);
          setAssetUrl(asset.id, url);
          commit("Add audio to media library", (draft) => ({ ...draft, assets: { ...draft.assets, [asset.id]: asset } }));
        } else {
          const metadata = await probeVideo(file);
          const asset = { ...createAssetRecord(file, metadata), ...await inspectMediaFile(file) };
          await saveAsset({ ...asset, blob: file });
          const url = URL.createObjectURL(file);
          setAssetRecord(asset);
          setAssetUrl(asset.id, url);
          commit("Add video to media library", (draft) => ({ ...draft, assets: { ...draft.assets, [asset.id]: asset } }));
        }
        imported += 1;
      } catch (error) {
        failures.push(`${file.name}: ${error instanceof Error ? error.message : "could not be imported."}`);
      }
    }
    setImportProgress(null);
    if (failures.length > 0) {
      const message = `${imported} of ${files.length} source${files.length === 1 ? "" : "s"} added to Media. ${failures.join(" ")}`;
      setImportError(message);
      notify(message, "warning");
    } else {
      notify(`${imported} source${imported === 1 ? "" : "s"} added to Media. Add a video to V1 or use audio as the soundtrack.`, "info");
    }
  };

  const importFile = (file: File | undefined) => {
    if (file) void importVideoFiles([file], true);
  };

  const addAssetToTimeline = (assetId: string) => {
    const current = useEditorStore.getState().project;
    const asset = current?.assets[assetId] ?? assetRecords[assetId];
    if (!current) return;
    if (!asset) {
      notify("That media source is no longer available in this project.", "warning");
      return;
    }
    if (asset.mediaType === "audio") {
      notify("Audio sources can be used as the soundtrack, not as a visual V1 clip.", "warning");
      return;
    }
    if (!assetUrls[assetId]) {
      notify("Relink this missing source before adding it to the timeline.", "warning");
      return;
    }
    const layer = createVideoLayer(asset, false);
    commit("Add media to V1", (draft) => {
      layer.timeline.start = sequenceEnd(draft);
      return { ...draft, layers: [...draft.layers, layer] };
    });
    setActiveLayer(layer.id);
    setCurrentTime(layer.timeline.start + 0.02);
    notify(`${asset.name} added at the end of V1.`, "info");
  };

  const replaceSelectedWithAsset = (assetId: string) => {
    const current = useEditorStore.getState().project;
    const asset = current?.assets[assetId];
    const target = current?.layers.find((layer): layer is Extract<BendLayer, { kind: "video" }> => layer.kind === "video" && layer.id === activeLayerId);
    if (!current || !asset || !target) {
      notify("Select a video clip on V1 before replacing its source.", "warning");
      return;
    }
    if (asset.mediaType === "audio" || !assetUrls[assetId]) {
      notify("Choose an available video source to replace this clip.", "warning");
      return;
    }
    if (target.assetId === asset.id) {
      notify("That source is already used by the selected clip.", "info");
      return;
    }
    const plan = planSourceReplacement(target, asset, "preserve-timing");
    commit("Replace selected clip source", (draft) => {
      const layer = draft.layers.find((candidate): candidate is Extract<BendLayer, { kind: "video" }> => candidate.kind === "video" && candidate.id === target.id);
      if (!layer) return draft;
      const previousEnd = layer.timeline.start + layer.timeline.duration;
      Object.assign(layer, applySourceReplacement(layer, asset.id, plan));
      layer.timeline.duration = plan.timelineDuration;
      draft.assets = { ...draft.assets, [asset.id]: asset };
      return shiftClipsAfter(draft, layer.id, layer.timeline.start + plan.timelineDuration - previousEnd);
    });
    notify(`Replaced ${target.name} with ${asset.name}. ${plan.policy === "preserve-timing" ? "Edit timing preserved." : "Clip fitted to the new source."}`, "info");
  };

  const useAssetAsSoundtrack = (assetId: string) => {
    const current = useEditorStore.getState().project;
    const asset = current?.assets[assetId];
    if (!current || !asset || asset.mediaType !== "audio") {
      notify("Choose an audio source for the music lane.", "warning");
      return;
    }
    const previous = current.soundtrack;
    const duration = Math.max(0.1, asset.duration);
    commit("Use media as soundtrack", (draft) => {
      draft.assets = { ...draft.assets, [asset.id]: asset };
      draft.soundtrack = {
        assetId: asset.id,
        timelineStart: 0,
        sourceIn: 0,
        sourceOut: duration,
        gainDb: previous?.gainDb ?? -6,
        muted: false,
        fadeIn: Math.min(previous?.fadeIn ?? 0.6, duration),
        fadeOut: Math.min(previous?.fadeOut ?? 0.8, duration),
        loop: previous?.loop ?? false,
        loopCrossfade: previous?.loopCrossfade ?? 0.04,
        ducking: previous?.ducking ?? defaultSoundtrackDucking(),
      };
      return draft;
    });
    setActiveLayer(null);
    setInspectorSection("edit");
    notify(`${asset.name} is now the soundtrack. Loop and ducking are available in Composition.`, "info");
  };

  const removeUnusedAsset = async (assetId: string) => {
    const current = useEditorStore.getState().project;
    const asset = current?.assets[assetId];
    if (!current || !asset) return;
    const used = current.layers.some((layer) => layer.kind === "video" && layer.assetId === assetId) || current.soundtrack?.assetId === assetId;
    if (used) {
      notify("This source is still used by the timeline. Remove those references before removing it from Media.", "warning");
      return;
    }
    commit("Remove unused media", (draft) => {
      const assets = { ...draft.assets };
      delete assets[assetId];
      return { ...draft, assets };
    });
    notify(`${asset.name} removed from this project. Undo restores it while the editor is open; the local blob is reclaimed on the next studio load if no saved project references it.`, "info");
  };

  const importSoundtrack = async (file: File | undefined) => {
    if (!file) return;
    setImportError(null);
    if (!isSupportedAudioFile(file)) {
      setImportError("Unsupported soundtrack. Choose a browser-compatible MP3, M4A, WAV, OGG, or WebM audio file.");
      return;
    }
    try {
      const metadata = await probeAudio(file);
      const inspection = await inspectMediaFile(file);
      const sourceDuration = Math.max(metadata.duration, inspection.duration ?? 0);
      if (!Number.isFinite(sourceDuration) || sourceDuration < 0.1) {
        throw new Error("BEND could not read this audio file's duration. Try re-encoding it as MP3 or WAV.");
      }
      if (inspection.audio.status !== "available") {
        throw new Error(inspection.audio.message || "This audio file does not expose a decodable track in this browser.");
      }
      const asset = { ...createAssetRecord(file, { ...metadata, duration: sourceDuration }, "audio"), ...inspection, duration: sourceDuration };
      await saveAsset({ ...asset, blob: file });
      const url = URL.createObjectURL(file);
      setAssetRecord(asset);
      setAssetUrl(asset.id, url);
      commit("Add soundtrack", (draft) => {
        draft.assets = { ...draft.assets, [asset.id]: asset };
        draft.soundtrack = {
          assetId: asset.id,
          timelineStart: 0,
          sourceIn: 0,
          sourceOut: sourceDuration,
          gainDb: -6,
          muted: false,
          fadeIn: 0.6,
          fadeOut: 0.8,
          loop: false,
          loopCrossfade: 0.04,
          ducking: defaultSoundtrackDucking(),
        };
        return draft;
      });
      setInspectorSection("edit");
      setShowAddMenu(false);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "BEND could not import that soundtrack.");
    }
  };

  const startNewProject = async () => {
    if (!await settleCurrentProject()) return;
    setProject(createProject(getAspectFromProject(project), "Untitled composition"), {}, {}, null);
    setInspectorSection("edit");
    setPackageNotice(null);
    setShowNewProjectDialog(false);
    setShowAddMenu(false);
    setShowProjectLibrary(false);
  };

  const handleNew = () => {
    if (project) {
      setShowNewProjectDialog(true);
      return;
    }
    startNewProject();
  };

  const replaceWithExample = async () => {
    if (!await settleCurrentProject()) return;
    setProject(createExampleProject(getAspectFromProject(project)));
    setInspectorSection("edit");
    setPackageNotice(null);
    setShowAddMenu(false);
    setShowProjectLibrary(false);
  };

  const openExample = async () => {
    if (project?.layers.length) {
      setShowExampleConfirm(true);
      return;
    }
    await replaceWithExample();
  };

  const addGenerator = (generatorId: GeneratorId) => {
    if (!project) return;
    const definition = getGeneratorDefinition(generatorId);
    const layer = createProceduralLayer(generatorId, `${project.name}-${generatorId.toUpperCase()}`, definition.name);
    layer.generator.duration = project.canvas.duration;
    layer.timeline.duration = project.canvas.duration;
    commit(`Add ${definition.name}`, (draft) => ({ ...draft, layers: [...draft.layers, layer] }));
    setActiveLayer(layer.id);
    setInspectorSection("edit");
    setShowAddMenu(false);
  };

  const openAddMenu = () => setShowAddMenu(true);

  const updateAspect = (aspect: AspectPreset) => commit("Change canvas format", (draft) => {
    const dimensions = ASPECT_PRESETS[aspect];
    draft.canvas.width = dimensions.width;
    draft.canvas.height = dimensions.height;
    return draft;
  });

  const retrySave = () => {
    if (!project) return;
    if (!isLocalPersistenceAvailable()) {
      setSaveState("failed", "IndexedDB is unavailable in this browser. Download a recovery copy before leaving.");
      return;
    }
    setSaveState("saving");
    void saveCoordinator.retry(project.id).catch(() => undefined);
  };

  const handleDownloadPackage = async () => {
    if (!project || packageWorking) return;
    setPackageError(null);
    setPackageNotice(null);
    const missingAssets = Object.values(project.assets).filter((asset) => !assetUrls[asset.id]);
    if (missingAssets.length > 0) {
      setPackageError(`This project still references ${missingAssets.length} source file${missingAssets.length === 1 ? "" : "s"} that are not available locally (${missingAssets.map((asset) => asset.name).join(", ")}). Relink the footage before downloading an editable package; a package without its media cannot be restored.`);
      return;
    }
    setPackageWorking(true);
    try {
      const { createBendIntegrationAdapter } = await import("../../integration/adapter");
      const result = await createBendIntegrationAdapter().exportEditableProject(project);
      downloadBlob(result.blob, `bend-${project.id}.bendpkg`);
    } catch (error) {
      setPackageError(error instanceof Error ? error.message : "BEND could not create the editable package.");
    } finally {
      setPackageWorking(false);
    }
  };

  const handlePackageFile = async (file: File | undefined) => {
    if (!file || packageWorking) return;
    setPackageError(null);
    setPackageNotice(null);
    setShowProjectLibrary(false);
    setShowExampleConfirm(false);
    setPackageWorking(true);
    try {
      const decoded = await readEditableProjectPackage(file);
      setPackagePreview({ file, decoded });
    } catch (error) {
      setPackageError(error instanceof Error ? error.message : "BEND could not validate that editable package.");
    } finally {
      setPackageWorking(false);
    }
  };

  const openProjectLibrary = async () => {
    if (await settleCurrentProject()) setShowProjectLibrary(true);
  };

  const confirmPackageImport = async () => {
    if (!packagePreview || packageWorking) return;
    if (!await settleCurrentProject()) return;
    setPackageWorking(true);
    try {
      const restored = await restoreEditableProjectPackage(packagePreview.file);
      setProject(restored.project, restored.assets, restored.urls);
      setPackagePreview(null);
      setShowProjectLibrary(false);
      setPackageError(null);
      setPackageNotice(restored.warnings.length > 0 ? `Package restored. ${restored.warnings.join(" ")}` : "Editable package restored with its source media.");
      setLibraryRefreshKey((key) => key + 1);
    } catch (error) {
      setPackageError(error instanceof Error ? error.message : "BEND could not restore that editable package.");
    } finally {
      setPackageWorking(false);
    }
  };

  const relinkFile = async (file: File | undefined, assetId: string) => {
    if (!file || !project) return;
    setImportError(null);
    const expectedAudio = (project.assets[assetId] ?? assetRecords[assetId])?.mediaType === "audio";
    if (expectedAudio ? !isSupportedAudioFile(file) : !isSupportedVideoFile(file)) {
      setImportError(expectedAudio ? "That replacement is not supported. Choose a browser-compatible audio file." : "That replacement is not supported. Choose a browser-compatible MP4 or WebM.");
      return;
    }
    try {
      const metadata = expectedAudio ? await probeAudio(file) : await probeVideo(file);
      const inspected = await inspectMediaFile(file);
      const previous = project.assets[assetId] ?? assetRecords[assetId];
      const differs = Boolean(previous && (previous.width !== metadata.width || previous.height !== metadata.height || Math.abs(previous.duration - metadata.duration) > 0.25));
      if (differs && !window.confirm(`This file is different from the missing source (${previous?.width} × ${previous?.height}, ${previous?.duration.toFixed(2)}s). Relink it anyway?`)) return;
      const nextAsset: MediaAssetRecord = {
        ...(previous ?? createAssetRecord(file, metadata)),
        ...createAssetRecord(file, metadata, expectedAudio ? "audio" : "video"),
        ...inspected,
        id: assetId,
        storageKey: previous?.storageKey ?? `${assetId}-relinked`,
      };
      await saveAsset({ ...nextAsset, blob: file });
      const url = URL.createObjectURL(file);
      setAssetRecord(nextAsset);
      setAssetUrl(assetId, url);
      commit("Relink footage", (draft) => ({ ...draft, assets: { ...draft.assets, [assetId]: nextAsset } }));
      setRelinkAssetId(null);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "BEND could not relink that media source.");
    }
  };

  const prepareReplaceSource = async (file: File | undefined, layerId: string) => {
    if (!file || !project) return;
    setImportError(null);
    if (!isSupportedVideoFile(file)) {
      setImportError("That replacement is not supported. Choose a browser-compatible MP4 or WebM.");
      return;
    }
    const layer = project.layers.find((candidate): candidate is Extract<BendLayer, { kind: "video" }> => candidate.id === layerId && candidate.kind === "video");
    if (!layer) {
      setImportError("Select a video layer before replacing its source.");
      return;
    }
    try {
      const metadata = await probeVideo(file);
      const inspection = await inspectMediaFile(file);
      setReplaceCandidate({
        layer: structuredClone(layer),
        assetId: layer.assetId,
        previous: project.assets[layer.assetId] ?? assetRecords[layer.assetId] ?? null,
        file,
        metadata,
        inspection,
      });
      setReplaceLayerId(layer.id);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "BEND could not read that replacement video.");
    }
  };

  const confirmReplaceSource = async (policy: SourceDurationPolicy) => {
    const candidate = replaceCandidate;
    if (!candidate || !replaceLayerId) return;
    const source = useEditorStore.getState().project;
    const layer = source?.layers.find((entry): entry is Extract<BendLayer, { kind: "video" }> => entry.id === replaceLayerId && entry.kind === "video");
    if (!source || !layer) {
      setReplaceCandidate(null);
      setReplaceLayerId(null);
      return;
    }
    try {
      const plan = planSourceReplacement(layer, candidate.metadata, policy);
      const nextAsset: MediaAssetRecord = {
        ...createAssetRecord(candidate.file, candidate.metadata),
        ...candidate.inspection,
      };
      await saveAsset({ ...nextAsset, blob: candidate.file });
      const url = URL.createObjectURL(candidate.file);
      setAssetRecord(nextAsset);
      setAssetUrl(nextAsset.id, url);
      commit("Replace source", (draft) => {
        const target = draft.layers.find((entry) => entry.id === layer.id);
        if (target?.kind === "video") {
          const replaced = applySourceReplacement(target, nextAsset.id, plan);
          Object.assign(target, replaced);
        }
        draft.assets = { ...draft.assets, [nextAsset.id]: nextAsset };
        return draft;
      });
      setReplaceCandidate(null);
      setReplaceLayerId(null);
      setInspectorSection("edit");
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "BEND could not replace that media source.");
    }
  };

  const requestReplaceSource = (layerId: string) => {
    setReplaceLayerId(layerId);
    replaceInput.current?.click();
  };

  const handleHostUpdate = async () => {
    if (!project || !hostContext || hostUpdateWorking) return;
    const controller = new AbortController();
    hostAbortRef.current = controller;
    setHostUpdateWorking(true);
    setHostUpdateMessage(null);
    setHostUpdateProgress({ phase: "video", completed: 0, total: 1, label: "Preparing updated post" });
    try {
      const { commitHostLayerEdit } = await import("../../integration/host");
      await commitHostLayerEdit({
        compositionId: hostContext.sessionId,
        layerId: hostContext.layerId,
        expectedSourceVersion: hostContext.sourceVersion ?? undefined,
        project,
        assetUrls,
        signal: controller.signal,
        onProgress: setHostUpdateProgress,
      });
      onHostUpdated();
    } catch (error) {
      setHostUpdateMessage(controller.signal.aborted ? "Update cancelled. The host still uses its previous committed layer." : error instanceof Error ? error.message : "BEND could not update the host layer.");
    } finally {
      hostAbortRef.current = null;
      setHostUpdateWorking(false);
    }
  };

  const dismissGuide = () => {
    setShowGuide(false);
    try {
      window.localStorage.setItem("bend-editor-guide-dismissed", "1");
    } catch {
      // Local storage is optional; the guide can still be dismissed for this session.
    }
  };

  const navigateAway = async () => {
    if (await settleCurrentProject()) onNavigateHome();
  };

  if (loading || !project) return <main className="editor-page editor-loading"><div className="canvas-overlay-note">Opening local studio…</div></main>;

  const missingAssetIds = [...new Set([
    ...project.layers.filter((layer): layer is Extract<BendLayer, { kind: "video" }> => layer.kind === "video" && !assetUrls[layer.assetId]).map((layer) => layer.assetId),
    ...(project.soundtrack && !assetUrls[project.soundtrack.assetId] ? [project.soundtrack.assetId] : []),
  ])];
  const missingAssetCount = missingAssetIds.length;
  const hasWorkspaceAlerts = Boolean(importError || importProgress || notice || packageError || packageNotice || recoveryError || hostUpdateMessage || missingAssetCount > 0 || saveError);
  const activeLayer = project.layers.find((layer) => layer.id === activeLayerId) ?? null;

  return (
    <main className="editor-page">
      <header className="editor-topbar">
        <div className="topbar-left"><button className="wordmark" onClick={() => void navigateAway()} aria-label="BEND home">BEND<span>.</span></button><span className="studio-label">Studio</span><input className="project-name-input" value={project.name} title={project.name} aria-label="Project name" onChange={(event) => commit("Rename project", (draft) => { draft.name = event.target.value; return draft; })} /><span className={`save-status is-${saveState}`} aria-live="polite">{saveState === "saving" ? "Saving" : saveState === "failed" ? "Save failed · recovery available" : saveState === "idle" ? "Unsaved changes" : "Saved locally"}</span>{hostContext && <span className="host-edit-label">Host edit</span>}</div>
        <div className="topbar-center"><select className="topbar-select" aria-label="Canvas format" value={getAspectFromProject(project)} onChange={(event) => updateAspect(event.target.value as AspectPreset)}><option value="4:5">4:5 Portrait</option><option value="1:1">1:1 Square</option><option value="9:16">9:16 Reel</option><option value="16:9">16:9 Landscape</option></select><span className="topbar-info">FIT · {project.canvas.width} × {project.canvas.height}</span></div>
        <div className="topbar-right">
          <button className="project-library-button" onClick={() => void openProjectLibrary()} aria-label="Open project library" title="Open the local project library"><FolderOpen size={14} /> <span>Projects</span></button>
          <button className="project-library-button" onClick={() => setShowMediaLibrary(true)} aria-label="Open media library" aria-keyshortcuts="Shift+M" title="Open the local media library (Shift+M)"><Library size={14} /> <span>Media</span></button>
          <div className="add-control">
            <button className="add-button" onClick={() => setShowAddMenu((open) => !open)} aria-haspopup="menu" aria-expanded={showAddMenu}><Plus size={15} /> Add</button>
            <AnimatePresence initial={false}>
            {showAddMenu && <motion.div key="add-menu" className="add-menu" role="menu" aria-label="Add to composition" initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.985 }} transition={motionTokens.transition.quick} style={{ transformOrigin: "top right" }}>
              <div className="add-menu-head"><span>Add to composition</span><button type="button" className="add-menu-close" onClick={() => setShowAddMenu(false)} aria-label="Close add menu"><X size={14} /></button></div>
              <button type="button" className="add-menu-item" role="menuitem" onClick={() => { uploadInput.current?.click(); setShowAddMenu(false); }}><FileVideo size={16} /><span><strong>Add video</strong><small>Import MP4 or WebM footage</small></span></button>
              <button type="button" className="add-menu-item" role="menuitem" onClick={() => { soundtrackInput.current?.click(); setShowAddMenu(false); }}><Music2 size={16} /><span><strong>Add soundtrack</strong><small>Local music or audio bed</small></span></button>
              <button type="button" className="add-menu-item" role="menuitem" onClick={() => { setShowMediaLibrary(true); setShowAddMenu(false); }}><Library size={16} /><span><strong>Media library</strong><small>Reuse imports, relink, add to V1</small></span></button>
              {isCompactLayout && <button type="button" className="add-menu-item" role="menuitem" onClick={() => { setShowShortcuts(true); setShowAddMenu(false); }}><Keyboard size={16} /><span><strong>Keyboard shortcuts</strong><small>Review every editing key</small></span></button>}
              <div className="add-menu-divider" />
              <span className="add-menu-label">Generate motion</span>
              {GENERATOR_REGISTRY.map((definition) => <button type="button" className="add-menu-item" role="menuitem" key={definition.id} onClick={() => addGenerator(definition.id)}><Sparkles size={16} /><span><strong>{definition.name}</strong><small>{definition.description}</small></span></button>)}
            </motion.div>}
            </AnimatePresence>
          </div>
          <button className={isMobileInspectorOpen ? "icon-button mobile-controls-toggle is-open" : "icon-button mobile-controls-toggle"} onClick={() => setIsMobileInspectorOpen((open) => !open)} aria-label={isMobileInspectorOpen ? "Close controls" : "Open controls"} aria-expanded={isMobileInspectorOpen} title={isMobileInspectorOpen ? "Close the inspector" : "Open the inspector"}><SlidersHorizontal size={16} /></button>
          <button className="icon-button" onClick={undo} disabled={historySize === 0} aria-label="Undo" title="Undo (Ctrl/Cmd+Z)"><Undo2 size={16} /></button>
          <button className="icon-button" onClick={redo} disabled={futureSize === 0} aria-label="Redo" title="Redo (Ctrl/Cmd+Shift+Z)"><Redo2 size={16} /></button>
          <button className="icon-button" onClick={handleNew} aria-label="New project" title="Start a new project"><FilePlus2 size={16} /></button>
          <button className="icon-button" onClick={() => setShowShortcuts(true)} aria-label="Keyboard shortcuts" aria-keyshortcuts="?" title="Keyboard shortcuts (?)"><Keyboard size={16} /></button>
          <button className="project-download-button" onClick={() => void handleDownloadPackage()} disabled={packageWorking} title="Download editable project"><FileArchive size={14} /> <span>{packageWorking ? "Packaging" : "Source"}</span></button>
          {hostContext && <button className="host-update-button" onClick={() => hostUpdateWorking ? hostAbortRef.current?.abort() : void handleHostUpdate()}>{hostUpdateWorking ? "Cancel update" : "Update Post"}</button>}
          <button className="export-button" title="Export MP4/WebM video or a PNG still" onClick={() => { setCompareLayer(null); setExportSession((session) => session + 1); setShowExport(true); }}>Export <Upload size={14} /></button>
          <input ref={uploadInput} className="sr-only" type="file" multiple accept="video/mp4,video/webm,video/*" aria-label="Add local video" onChange={(event) => { void importVideoFiles(Array.from(event.target.files ?? []), true); event.currentTarget.value = ""; }} />
          <input ref={mediaLibraryInput} className="sr-only" type="file" multiple accept="video/mp4,video/webm,video/*,audio/*,.mp3,.m4a,.wav,.ogg,.flac,.opus" aria-label="Import media to library" onChange={(event) => { void importLibraryMedia(Array.from(event.target.files ?? [])); event.currentTarget.value = ""; }} />
          <input ref={soundtrackInput} className="sr-only" type="file" accept="audio/*,.mp3,.m4a,.wav,.ogg,.flac,.opus" aria-label="Add local soundtrack" onChange={(event) => { void importSoundtrack(event.target.files?.[0]); event.currentTarget.value = ""; }} />
          <input ref={packageInput} className="sr-only" type="file" accept=".bendpkg,application/vnd.bend.project,application/octet-stream" aria-label="Open project package" onChange={(event) => { void handlePackageFile(event.target.files?.[0]); event.currentTarget.value = ""; }} />
          <input ref={relinkInput} className="sr-only" type="file" accept="video/mp4,video/webm,video/*,audio/*,.mp3,.m4a,.wav,.ogg,.flac,.opus" aria-label="Choose replacement media" onChange={(event) => { if (relinkAssetId) void relinkFile(event.target.files?.[0], relinkAssetId); event.currentTarget.value = ""; }} />
          <input ref={replaceInput} className="sr-only" type="file" accept="video/mp4,video/webm,video/*" aria-label="Choose new source footage" onChange={(event) => { if (replaceLayerId) void prepareReplaceSource(event.target.files?.[0], replaceLayerId); event.currentTarget.value = ""; }} />
        </div>
      </header>
      <h1 className="sr-only">BEND editor: {project.name}</h1>
      <section className={hasWorkspaceAlerts ? "editor-workspace has-workspace-alerts" : "editor-workspace"} aria-label="Canvas workspace">
        {hasWorkspaceAlerts && <div className="workspace-alerts">
          {importError && <div className="capability-banner" role="alert"><Upload size={14} />{importError}</div>}
          {importProgress && <div className="capability-banner import-progress-banner" role="status" aria-live="polite"><span>Importing {importProgress.current} of {importProgress.total}</span><strong>{importProgress.label}</strong><div className="import-progress-track"><span style={{ width: `${(importProgress.current / Math.max(1, importProgress.total)) * 100}%` }} /></div></div>}
          {notice && <div className={`capability-banner notice-banner is-${notice.tone}`} role="status"><Sparkles size={14} /><span>{notice.message}</span><button type="button" className="small-action" onClick={dismissNotice}>Dismiss</button></div>}
          {packageNotice && <div className="capability-banner package-notice" role="status"><FileArchive size={14} /><span>{packageNotice}</span></div>}
          {packageError && <div className="capability-banner is-save-error" role="alert"><FileArchive size={14} /><span><strong>Editable package unavailable.</strong> {packageError}</span></div>}
          {recoveryError && <div className="capability-banner is-save-error" role="alert"><AlertTriangle size={14} /><span><strong>Project recovery needs attention.</strong> {recoveryError}</span><button type="button" className="small-action" onClick={() => void handleDownloadPackage()}>Download recovery copy</button></div>}
          {hostUpdateMessage && <div className="capability-banner is-save-error" role="alert"><AlertTriangle size={14} />{hostUpdateMessage}</div>}
          {missingAssetCount > 0 && <div className="capability-banner missing-media-banner" role="alert"><Film size={14} /><span>{missingAssetCount} video source{missingAssetCount === 1 ? "" : "s"} need relinking. Layer edits remain intact.</span><div className="missing-media-actions">{missingAssetIds.map((assetId) => <button type="button" className="small-action" key={assetId} onClick={() => { setRelinkAssetId(assetId); relinkInput.current?.click(); }}>Relink {project.assets[assetId]?.name ?? "source"}</button>)}</div></div>}
          {saveError && <div className="capability-banner is-save-error" role="alert"><AlertTriangle size={14} /><span><strong>Local save failed.</strong> {saveError} Unsaved work remains in memory.</span><button type="button" className="small-action" onClick={retrySave}>Try again</button><button type="button" className="small-action" onClick={() => void handleDownloadPackage()}>Download recovery copy</button></div>}
          {hostUpdateWorking && hostUpdateProgress && <div className="capability-banner host-progress" role="status"><span>{hostUpdateProgress.label}</span><span>{hostUpdateProgress.total ? Math.round((hostUpdateProgress.completed / hostUpdateProgress.total) * 100) : 0}%</span></div>}
        </div>}
        {showGuide && project.layers.length > 0 && <div className="workspace-guide" role="note"><div><span className="eyebrow">First move</span><strong>{activeLayer?.name ?? "Your active layer"}</strong><p>Select a clip on V1. Use the quick action bar for split, duplicate, ripple, transition, speed, audio and color. Press <kbd>?</kbd> for every shortcut.</p></div><button type="button" className="workspace-guide-close" onClick={dismissGuide} aria-label="Dismiss editor guide">×</button></div>}
        <CanvasStage project={project} activeLayerId={activeLayerId} assetUrls={assetUrls} currentTime={currentTime} isPlaying={isPlaying} onTogglePlaying={() => setIsPlaying(!isPlaying)} onImportFile={(file) => void importFile(file)} onRequestImport={() => uploadInput.current?.click()} onOpenAddMenu={() => openAddMenu()} onOpenExample={openExample} />
      </section>
      <motion.div className={isMobileInspectorOpen ? "editor-inspector is-open" : "editor-inspector"} initial={false} animate={isCompactLayout ? { x: isMobileInspectorOpen ? 0 : "100%" } : { x: 0 }} transition={motionTokens.transition.panel} aria-hidden={isCompactLayout ? !isMobileInspectorOpen : undefined} inert={isCompactLayout && !isMobileInspectorOpen}>
        <Inspector project={project} activeLayerId={activeLayerId} currentTime={currentTime} assetUrls={assetUrls} onRelinkAsset={(assetId) => { setRelinkAssetId(assetId); relinkInput.current?.click(); }} onReplaceSource={requestReplaceSource} onRequestSoundtrack={() => soundtrackInput.current?.click()} />
      </motion.div>
      <Timeline project={project} currentTime={currentTime} isPlaying={isPlaying} onSetTime={setCurrentTime} onTogglePlaying={() => setIsPlaying(!isPlaying)} onSelectLayer={setActiveLayer} assetUrls={assetUrls} onRequestSoundtrack={() => soundtrackInput.current?.click()} />
      {saveError && <div className="sr-only" role="status">{saveError}</div>}
      <AnimatePresence initial={false}>
      {showNewProjectDialog && <motion.div key="new-project-dialog" className="dialog-backdrop" role="presentation" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={motionTokens.transition.quick} onMouseDown={(event) => { if (event.target === event.currentTarget) setShowNewProjectDialog(false); }}>
        <motion.div className="dialog dialog-compact" role="dialog" aria-modal="true" aria-labelledby="new-project-title" initial={{ opacity: 0, y: 8, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 4, scale: 0.99 }} transition={motionTokens.transition.standard}>
          <div className="dialog-header"><div><p className="eyebrow">Project</p><h2 id="new-project-title">Start a new project?</h2></div><button type="button" className="dialog-close" onClick={() => setShowNewProjectDialog(false)} aria-label="Close new project dialog"><X size={16} /></button></div>
          <p className="dialog-copy">Your current composition stays saved locally. The new project will start with the same canvas format.</p>
          <div className="dialog-actions"><button type="button" className="dialog-secondary" onClick={() => setShowNewProjectDialog(false)}>Keep working</button><button type="button" className="dialog-primary" onClick={startNewProject}>Start new project</button></div>
        </motion.div>
      </motion.div>}
      {showExampleConfirm && <motion.div key="example-confirm-dialog" className="dialog-backdrop" role="presentation" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={motionTokens.transition.quick} onMouseDown={(event) => { if (event.target === event.currentTarget) setShowExampleConfirm(false); }}>
        <motion.div className="dialog dialog-compact" ref={exampleDialogRef} role="dialog" aria-modal="true" aria-labelledby="example-confirm-title" initial={{ opacity: 0, y: 8, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 4, scale: 0.99 }} transition={motionTokens.transition.standard}>
          <div className="dialog-header"><div><p className="eyebrow">Learning example</p><h2 id="example-confirm-title">Open First Study?</h2></div><button type="button" ref={exampleCloseButtonRef} className="dialog-close" onClick={() => setShowExampleConfirm(false)} aria-label="Close First Study confirmation"><X size={16} /></button></div>
          <p className="dialog-copy">BEND will save this composition locally before opening the example. Your current work will remain available in Projects.</p>
          <div className="dialog-actions"><button type="button" className="dialog-secondary" onClick={() => setShowExampleConfirm(false)}>Keep working</button><button type="button" className="dialog-primary" onClick={() => { setShowExampleConfirm(false); void replaceWithExample(); }}>Open First Study</button></div>
        </motion.div>
      </motion.div>}
      </AnimatePresence>
      {showProjectLibrary && <ProjectLibraryDialog
        currentProjectId={project.id}
        refreshKey={libraryRefreshKey}
        packageWorking={packageWorking}
        onClose={() => setShowProjectLibrary(false)}
        onNew={() => { setShowProjectLibrary(false); handleNew(); }}
        onDuplicate={() => void duplicateCurrentProject()}
        onImportPackage={() => packageInput.current?.click()}
        onOpenExample={openExample}
        onOpen={switchToProject}
        onRename={renameStoredProject}
        onDelete={deleteStoredProject}
      />}
      <AnimatePresence initial={false}>
        {showMediaLibrary && <MediaLibraryDialog
          project={project}
          assetUrls={assetUrls}
          activeLayerId={activeLayerId}
          importProgress={importProgress}
          onClose={() => setShowMediaLibrary(false)}
          onImportMedia={() => mediaLibraryInput.current?.click()}
          onAddToTimeline={addAssetToTimeline}
          onReplaceSelected={replaceSelectedWithAsset}
          onUseAsSoundtrack={useAssetAsSoundtrack}
          onRelink={(assetId) => { setRelinkAssetId(assetId); relinkInput.current?.click(); }}
          onRemove={(assetId) => void removeUnusedAsset(assetId)}
        />}
        {showShortcuts && <ShortcutDialog onClose={() => setShowShortcuts(false)} />}
      </AnimatePresence>
      <AnimatePresence initial={false}>
        {replaceCandidate && <ReplaceSourceDialog key="replace-source-dialog" candidate={replaceCandidate} onCancel={() => { setReplaceCandidate(null); setReplaceLayerId(null); }} onConfirm={(policy) => void confirmReplaceSource(policy)} />}
      </AnimatePresence>
      {packagePreview && <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPackagePreview(null); }}>
        <div className="dialog dialog-compact package-preview-dialog" ref={packageDialogRef} role="dialog" aria-modal="true" aria-labelledby="package-preview-title">
          <div className="dialog-header"><div><p className="eyebrow">Editable source</p><h2 className="dialog-title" id="package-preview-title">Open {packagePreview.decoded.project.name}?</h2></div><button type="button" ref={packageCloseButtonRef} className="dialog-close" onClick={() => setPackagePreview(null)} aria-label="Close package preview"><X size={16} /></button></div>
          <p className="dialog-copy">BEND validated this package before writing local storage. It will open as editable layers, not a flattened video.</p>
          <div className="package-preview-stats"><span><b>Format</b> {packagePreview.decoded.manifest.formatVersion}</span><span><b>Canvas</b> {packagePreview.decoded.project.canvas.width} × {packagePreview.decoded.project.canvas.height}</span><span><b>Duration</b> {packagePreview.decoded.project.canvas.duration.toFixed(2)}s</span><span><b>Media</b> {Object.keys(packagePreview.decoded.assets).length} source file{Object.keys(packagePreview.decoded.assets).length === 1 ? "" : "s"}</span></div>
          <p className="package-preview-note">Project IDs and colliding asset IDs are rewritten when needed. Existing projects will not be overwritten.</p>
          <div className="dialog-actions"><button type="button" className="dialog-secondary" onClick={() => setPackagePreview(null)}>Cancel</button><button type="button" className="dialog-primary" disabled={packageWorking} onClick={() => void confirmPackageImport()}>{packageWorking ? "Restoring…" : "Open editable project"}</button></div>
        </div>
      </div>}
      <AnimatePresence initial={false}>
        {showExport && <Suspense key={`export-dialog-${exportSession}`} fallback={<div className="dialog-backdrop" role="presentation"><div className="dialog dialog-compact" role="status" aria-live="polite"><p className="dialog-copy">Loading local export controls…</p></div></div>}><ExportDialog project={project} assetUrls={assetUrls} currentTime={currentTime} onClose={() => setShowExport(false)} onSetCoverTime={(time) => commit("Set cover frame", (draft) => { draft.cover.time = clamp(time, 0, Math.max(0, draft.canvas.duration - 0.0001)); return draft; })} /></Suspense>}
      </AnimatePresence>
    </main>
  );
}

function getAspectFromProject(project: BendProject | null): AspectPreset {
  if (!project) return "4:5";
  const ratio = project.canvas.width / project.canvas.height;
  return (Object.keys(ASPECT_PRESETS) as AspectPreset[]).sort((a, b) => Math.abs(ASPECT_PRESETS[a].width / ASPECT_PRESETS[a].height - ratio) - Math.abs(ASPECT_PRESETS[b].width / ASPECT_PRESETS[b].height - ratio))[0] ?? "4:5";
}

