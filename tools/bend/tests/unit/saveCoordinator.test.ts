import { describe, expect, it, vi } from "vitest";
import { createProject } from "../../src/engine/core/project";
import { ProjectSaveCoordinator } from "../../src/storage/saveCoordinator";

function waitForMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("project save coordinator", () => {
  it("does not report an older in-flight write as the latest saved state", async () => {
    const writes = new Map<number, { resolve: () => void }>();
    const events: string[] = [];
    const writer = vi.fn((_project, revision: number) => new Promise<void>((resolve) => {
      writes.set(revision, { resolve });
    }));
    const coordinator = new ProjectSaveCoordinator(writer, (event) => events.push(`${event.state}:${event.job.revision}`), 0);
    const firstProject = createProject("4:5", "First");
    const firstJob = coordinator.schedule(firstProject);
    const firstFlush = coordinator.flush(firstProject.id);
    await waitForMicrotasks();

    const secondProject = structuredClone(firstProject);
    secondProject.name = "Second";
    const secondJob = coordinator.schedule(secondProject);
    const secondFlush = coordinator.flush(secondProject.id);
    await waitForMicrotasks();

    writes.get(firstJob.revision)?.resolve();
    await firstFlush;
    expect(events).not.toContain(`saved:${firstJob.revision}`);

    writes.get(secondJob.revision)?.resolve();
    await secondFlush;
    expect(events).toContain(`saved:${secondJob.revision}`);
    expect(events.filter((event) => event.startsWith("saved:"))).toEqual([`saved:${secondJob.revision}`]);
  });

  it("keeps a failed job available for an explicit retry", async () => {
    const project = createProject("1:1", "Retry me");
    let attempts = 0;
    const writer = vi.fn(async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("quota");
    });
    const events: string[] = [];
    const coordinator = new ProjectSaveCoordinator(writer, (event) => events.push(event.state));

    coordinator.schedule(project);
    await expect(coordinator.flush(project.id)).rejects.toThrow("quota");
    expect(events.at(-1)).toBe("failed");

    await coordinator.retry(project.id);
    expect(events.at(-1)).toBe("saved");
    expect(writer).toHaveBeenCalledTimes(2);
  });
});
