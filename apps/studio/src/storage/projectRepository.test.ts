import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { createStudioProject } from "../project/defaultProject";
import {
  ProjectRepository,
  ProjectRevisionConflictError,
  UnsupportedProjectVersionError,
} from "./projectRepository";

function repository(factory = new IDBFactory()) {
  return { factory, repo: new ProjectRepository(factory) };
}

describe("ProjectRepository", () => {
  it("saves, reloads and preserves the project document", async () => {
    const { factory, repo } = repository();
    const project = createStudioProject({
      id: "project_save",
      name: "Saved composition",
      formatId: "instagram-4-5",
    });

    const record = await repo.save(project, 0);
    expect(record.revision).toBe(1);
    repo.close();

    const reopened = new ProjectRepository(factory);
    const loaded = await reopened.load("project_save");
    expect(loaded?.revision).toBe(1);
    expect(loaded?.project.name).toBe("Saved composition");
    expect(loaded?.project.format.id).toBe("instagram-4-5");
    expect(loaded?.project.artboards[0].height).toBe(1350);
    reopened.close();
  });

  it("returns the most recently saved project first", async () => {
    const { repo } = repository();
    const first = createStudioProject({ id: "project_a", name: "A" });
    const second = createStudioProject({ id: "project_b", name: "B" });
    await repo.save(first, 0);
    await new Promise((resolve) => setTimeout(resolve, 2));
    await repo.save(second, 0);

    const latest = await repo.loadMostRecent();
    expect(latest?.id).toBe("project_b");
    expect((await repo.list()).map((record) => record.id)).toEqual([
      "project_b",
      "project_a",
    ]);
    repo.close();
  });

  it("rejects stale writes and leaves the last durable revision intact", async () => {
    const { factory, repo } = repository();
    const project = createStudioProject({ id: "project_stale", name: "Original" });
    const first = await repo.save(project, 0);
    expect(first.revision).toBe(1);

    const changed = structuredClone(project);
    changed.name = "Uncommitted";
    await expect(repo.save(changed, 0)).rejects.toBeInstanceOf(
      ProjectRevisionConflictError,
    );

    repo.close();
    const reopened = new ProjectRepository(factory);
    const loaded = await reopened.load("project_stale");
    expect(loaded?.project.name).toBe("Original");
    expect(loaded?.revision).toBe(1);
    reopened.close();
  });

  it("advances revisions only with the correct expected revision", async () => {
    const { factory, repo } = repository();
    const project = createStudioProject({ id: "project_rev" });
    await repo.save(project, 0);
    const changed = { ...project, name: "Revision two" };
    const second = await repo.save(changed, 1);
    expect(second.revision).toBe(2);
    repo.close();

    const reopened = new ProjectRepository(factory);
    expect((await reopened.load("project_rev"))?.project.name).toBe("Revision two");
    reopened.close();
  });

  it("rejects a newer unsupported schema version on load", async () => {
    const factory = new IDBFactory();
    const project = createStudioProject({ id: "project_future" });
    const raw = structuredClone(project) as unknown as {
      schemaVersion: number;
    };
    raw.schemaVersion = 99;

    await new Promise<void>((resolve, reject) => {
      const request = factory.open("studio-projects", 1);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore("projects", { keyPath: "id" });
        store.createIndex("bySavedAt", "savedAt");
      };
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction("projects", "readwrite");
        tx.objectStore("projects").put({
          id: "project_future",
          revision: 1,
          savedAt: new Date().toISOString(),
          schemaVersion: 99,
          project: raw,
        });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      request.onerror = () => reject(request.error);
    });

    const repo = new ProjectRepository(factory);
    await expect(repo.load("project_future")).rejects.toBeInstanceOf(
      UnsupportedProjectVersionError,
    );
    repo.close();
  });

  it("fails an interrupted write without creating a partial record", async () => {
    const { factory, repo } = repository();
    const project = createStudioProject({ id: "project_interrupted" });
    await repo.save(project, 0);

    const failed = structuredClone(project);
    failed.name = "Must not persist";
    // A revision conflict aborts the transaction after the read but before any
    // successful project write. The prior complete document must survive.
    await expect(repo.save(failed, 0)).rejects.toThrow(/revision/i);

    repo.close();
    const reopened = new ProjectRepository(factory);
    const loaded = await reopened.load("project_interrupted");
    expect(loaded?.project.name).toBe(project.name);
    expect(loaded?.project.artboards).toHaveLength(1);
    reopened.close();
  });
});
