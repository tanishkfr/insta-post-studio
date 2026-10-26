import type { BendProject } from "../engine/core/types";

export type SaveCoordinatorState = "saving" | "saved" | "failed";

export interface SaveCoordinatorJob {
  projectId: string;
  revision: number;
  project: BendProject;
}

export interface SaveCoordinatorEvent {
  state: SaveCoordinatorState;
  job: SaveCoordinatorJob;
  error?: unknown;
}

type SaveWriter = (project: BendProject, revision: number) => Promise<void>;
type SaveListener = (event: SaveCoordinatorEvent) => void;

/**
 * Owns debouncing and the lifetime of project saves independently of React.
 * A new job may start while an older write is still in flight; the storage
 * writer is responsible for its atomic revision guard and listeners only
 * receive a successful state for the newest job of a project.
 */
export class ProjectSaveCoordinator {
  private readonly revisions = new Map<string, number>();
  private readonly inFlight = new Map<string, Set<Promise<void>>>();
  private pending: SaveCoordinatorJob | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private failed = new Map<string, SaveCoordinatorJob>();

  constructor(
    private readonly write: SaveWriter,
    private readonly listen: SaveListener,
    private readonly debounceMs = 650,
  ) {}

  schedule(project: BendProject): SaveCoordinatorJob {
    // Date-based revisions remain comparable with records written by older
    // builds that did not have a coordinator. The sequence component keeps
    // rapid same-millisecond edits ordered.
    const revision = Math.max(Date.now(), (this.revisions.get(project.id) ?? 0) + 1);
    this.revisions.set(project.id, revision);
    const job: SaveCoordinatorJob = {
      projectId: project.id,
      revision,
      project: structuredClone(project),
    };
    this.pending = job;
    if (this.timer !== null) clearTimeout(this.timer);
    this.listen({ state: "saving", job });
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, this.debounceMs);
    return job;
  }

  async flush(projectId?: string): Promise<void> {
    if (!this.pending || (projectId && this.pending.projectId !== projectId)) {
      await this.waitFor(projectId);
      return;
    }
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const job = this.pending;
    this.pending = null;
    // Normalize a synchronous writer failure into the same tracked promise
    // path as an async IndexedDB failure.
    const writePromise = Promise.resolve().then(() => this.write(job.project, job.revision));
    const writes = this.inFlight.get(job.projectId) ?? new Set<Promise<void>>();
    writes.add(writePromise);
    this.inFlight.set(job.projectId, writes);
    try {
      await writePromise;
      this.failed.delete(job.projectId);
      if (this.revisions.get(job.projectId) === job.revision) {
        this.listen({ state: "saved", job });
      }
    } catch (error) {
      this.failed.set(job.projectId, job);
      if (this.revisions.get(job.projectId) === job.revision) {
        this.listen({ state: "failed", job, error });
      }
      throw error;
    } finally {
      writes.delete(writePromise);
      if (writes.size === 0) this.inFlight.delete(job.projectId);
    }
  }

  async settle(projectId: string): Promise<void> {
    await this.flush(projectId);
    await this.waitFor(projectId);
  }

  async retry(projectId: string): Promise<void> {
    // A newer edit may already be waiting in the debounce window. Flushing it
    // is both safer and more current than replaying the older failed snapshot.
    if (this.pending?.projectId === projectId) {
      await this.flush(projectId);
      return;
    }
    const job = this.failed.get(projectId);
    if (!job) return;
    if ((this.revisions.get(projectId) ?? 0) > job.revision) return;
    this.pending = job;
    this.listen({ state: "saving", job });
    await this.flush(projectId);
  }

  hasPending(projectId?: string): boolean {
    return Boolean(this.pending && (!projectId || this.pending.projectId === projectId));
  }

  latestRevision(projectId: string): number {
    return this.revisions.get(projectId) ?? 0;
  }

  private async waitFor(projectId?: string): Promise<void> {
    const pendingWrites = [...this.inFlight.entries()]
      .filter(([id]) => !projectId || id === projectId)
      .flatMap(([, writes]) => [...writes]);
    if (pendingWrites.length > 0) await Promise.all(pendingWrites);
  }
}
