import { describe, expect, it } from "vitest";
import { collectReferencedAssetIds, shouldAcceptProjectRevision } from "../../src/storage/indexedDb";
import { createProject } from "../../src/engine/core/project";

describe("project storage revisions", () => {
  it("rejects a late write that has an older revision", () => {
    expect(shouldAcceptProjectRevision({ savedAt: 200, revision: 12 }, 11)).toBe(false);
    expect(shouldAcceptProjectRevision({ savedAt: 200, revision: 12 }, 12)).toBe(true);
    expect(shouldAcceptProjectRevision({ savedAt: 200, revision: undefined }, 199)).toBe(false);
  });

  it("accepts the first write and preserves compatibility with legacy records", () => {
    expect(shouldAcceptProjectRevision(undefined, 1)).toBe(true);
    expect(shouldAcceptProjectRevision({ savedAt: 200 }, 201)).toBe(true);
  });

  it("keeps shared and active asset references protected during cleanup", () => {
    const first = createProject("4:5", "First");
    first.assets.shared = { id: "shared", storageKey: "blob-shared", name: "shared.mp4", mimeType: "video/mp4", size: 1, width: 1, height: 1, duration: 1 };
    const second = createProject("4:5", "Second");
    second.assets.other = { id: "other", storageKey: "blob-other", name: "other.mp4", mimeType: "video/mp4", size: 1, width: 1, height: 1, duration: 1 };
    const referenced = collectReferencedAssetIds([{ project: first }, { project: second }], ["active-unsaved"]);
    expect([...referenced].sort()).toEqual(["active-unsaved", "other", "shared"]);
  });
});
