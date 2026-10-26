import { describe, expect, it } from "vitest";
import { createVideoLayer, createProject, normalizeProject } from "../../src/engine/core/project";
import { createBendPackage, decodeBendPackage, BendPackageError, BendPackageIncompleteError } from "../../src/engine/package/bendPackage";
import { getProjectVersion } from "../../src/integration/adapter";

function videoProject() {
  const source = {
    id: "asset-source",
    name: "source.mp4",
    mimeType: "video/mp4",
    size: 4,
    width: 2,
    height: 2,
    duration: 1,
    storageKey: "origin-specific-key",
  };
  const project = createProject("4:5", "Portable test");
  project.assets[source.id] = source;
  project.layers = [createVideoLayer(source)];
  return normalizeProject(project);
}

describe("BEND portable project packages", () => {
  it("round-trips editable metadata and binary assets without the source storage key", async () => {
    const project = videoProject();
    const blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: "video/mp4" });
    const created = await createBendPackage(project, [{ record: project.assets["asset-source"], blob }]);
    const decoded = await decodeBendPackage(created.blob);

    expect(decoded.manifest.format).toBe("bendpkg");
    expect(decoded.manifest.formatVersion).toBe(1);
    expect(decoded.project.assets["asset-source"].storageKey).toBe("portable/asset-source");
    expect(decoded.assets["asset-source"].blob.size).toBe(4);
    expect(Array.from(new Uint8Array(await decoded.assets["asset-source"].blob.arrayBuffer()))).toEqual([1, 2, 3, 4]);
  });

  it("rejects a package when a referenced source asset is missing", async () => {
    await expect(createBendPackage(videoProject(), [])).rejects.toBeInstanceOf(BendPackageIncompleteError);
  });

  it("rejects newer package formats before attempting restoration", async () => {
    const project = createProject("1:1", "Future test");
    const created = await createBendPackage(project, []);
    const bytes = new Uint8Array(await created.blob.arrayBuffer());
    const view = new DataView(bytes.buffer);
    const manifestLength = view.getUint32(8, true);
    const manifestText = new TextDecoder().decode(bytes.slice(16, 16 + manifestLength));
    const mutated = new TextEncoder().encode(manifestText.replace('"formatVersion":1', '"formatVersion":9'));
    bytes.set(mutated, 16);
    await expect(decodeBendPackage(bytes)).rejects.toMatchObject({ code: "unsupported" });
  });

  it("enforces entry and total archive limits", async () => {
    const project = videoProject();
    const blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: "video/mp4" });
    await expect(createBendPackage(project, [{ record: project.assets["asset-source"], blob }], { maxEntryBytes: 3 })).rejects.toMatchObject({ code: "limit" });
    await expect(createBendPackage(project, [{ record: project.assets["asset-source"], blob }], { maxTotalBytes: 3 })).rejects.toMatchObject({ code: "limit" });
  });

  it("changes the source revision when editable state changes", () => {
    const project = createProject("4:5", "Version test");
    const first = getProjectVersion(project);
    const changed = { ...project, name: "Version changed" };
    expect(getProjectVersion(changed)).not.toBe(first);
  });

  it("exposes typed errors for malformed archives", async () => {
    await expect(decodeBendPackage(new Uint8Array(24))).rejects.toBeInstanceOf(BendPackageError);
  });
});
