import type { StudioProject } from "@studio/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { createStudioProject, DEFAULT_FORMAT_ID } from "../project/defaultProject";
import { projectRepository } from "../storage/instances";
import { createProjectStore, studioStore, type StudioProjectStoreApi } from "./projectStore";

export type SaveStatus = "loading" | "saved" | "dirty" | "saving" | "error";

export interface ProjectPersistence {
  status: SaveStatus;
  error: string | null;
  hydrated: boolean;
  saveNow: () => Promise<void>;
  newProject: () => Promise<void>;
}

function saveErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "The project could not be saved.";
}

/**
 * Owns project hydration + debounced compare-and-set autosave. A failed save
 * leaves the last durable revision untouched; the in-memory project remains
 * available for retry. Assets are written before a layer references them.
 */
export function useProjectPersistence(
  store: StudioProjectStoreApi = studioStore,
): ProjectPersistence {
  const [status, setStatus] = useState<SaveStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const revisionRef = useRef<number | null>(null);
  const latestProjectRef = useRef<StudioProject | null>(null);
  const dirtyRef = useRef(false);
  const failedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runningRef = useRef<Promise<void> | null>(null);
  const mountedRef = useRef(true);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const pump = useCallback(async (): Promise<void> => {
    if (runningRef.current) {
      await runningRef.current;
      // A change may have arrived while the prior write was in flight.
      if (!dirtyRef.current || failedRef.current) return;
    }
    const task = (async () => {
      while (dirtyRef.current && !failedRef.current) {
        const project = latestProjectRef.current;
        if (!project) return;
        dirtyRef.current = false;
        if (mountedRef.current) setStatus("saving");
        try {
          const record = await projectRepository.save(project, revisionRef.current ?? 0);
          revisionRef.current = record.revision;
          if (mountedRef.current) {
            setError(null);
            setStatus(dirtyRef.current ? "dirty" : "saved");
          }
        } catch (saveError) {
          dirtyRef.current = true;
          failedRef.current = true;
          if (mountedRef.current) {
            setError(saveErrorMessage(saveError));
            setStatus("error");
          }
          break;
        }
      }
    })();
    runningRef.current = task;
    try {
      await task;
    } finally {
      if (runningRef.current === task) runningRef.current = null;
    }
  }, []);

  const schedule = useCallback(
    (project: StudioProject) => {
      latestProjectRef.current = project;
      dirtyRef.current = true;
      failedRef.current = false;
      if (mountedRef.current) {
        setStatus("dirty");
        setError(null);
      }
      clearTimer();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void pump();
      }, 300);
    },
    [clearTimer, pump],
  );

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;

    async function hydrate() {
      try {
        const record = await projectRepository.loadMostRecent();
        if (cancelled) return;
        if (record) {
          revisionRef.current = record.revision;
          latestProjectRef.current = record.project;
          store.getState().hydrate(record.project);
        } else {
          const project = createStudioProject({ formatId: DEFAULT_FORMAT_ID });
          latestProjectRef.current = project;
          store.getState().hydrate(project);
          const saved = await projectRepository.save(project, 0);
          revisionRef.current = saved.revision;
        }
        if (cancelled) return;
        dirtyRef.current = false;
        failedRef.current = false;
        setStatus("saved");
        setError(null);
        setHydrated(true);
        unsubscribe = store.subscribe((state, previous) => {
          if (!state.hydrated || state.project === previous.project) return;
          schedule(state.project);
        });
      } catch (loadError) {
        if (cancelled) return;
        setError(saveErrorMessage(loadError));
        setStatus("error");
        const fallback = createStudioProject({ formatId: DEFAULT_FORMAT_ID });
        latestProjectRef.current = fallback;
        store.getState().hydrate(fallback);
        setHydrated(true);
      }
    }

    void hydrate();
    return () => {
      cancelled = true;
      mountedRef.current = false;
      clearTimer();
      unsubscribe?.();
    };
  }, [clearTimer, schedule, store]);

  const saveNow = useCallback(async () => {
    clearTimer();
    failedRef.current = false;
    if (!dirtyRef.current) {
      if (status === "error") {
        // Retry the current project even when the previous attempt failed after
        // clearing the dirty bit.
        dirtyRef.current = true;
      } else {
        return;
      }
    }
    await pump();
    if (failedRef.current) {
      throw new Error(error ?? "The project could not be saved.");
    }
  }, [clearTimer, error, pump, status]);

  const newProject = useCallback(async () => {
    await saveNow();
    clearTimer();
    const project = createStudioProject({ formatId: DEFAULT_FORMAT_ID });
    revisionRef.current = 0;
    latestProjectRef.current = project;
    failedRef.current = false;
    dirtyRef.current = true;
    store.getState().replaceProject(project);
    setStatus("saving");
    await pump();
    if (failedRef.current) {
      throw new Error(error ?? "The new project could not be saved.");
    }
  }, [clearTimer, error, pump, saveNow, store]);

  return { status, error, hydrated, saveNow, newProject };
}
