import { describe, expect, it } from "vitest";
import { createGeneratedProject, createProject, getProjectDuration, normalizeProject } from "../../src/engine/core/project";
import { createDefaultMask } from "../../src/engine/core/mask";
import { createTemporalEffect } from "../../src/engine/temporal/registry";
import { upsertKeyframe } from "../../src/engine/animation/engine";
import { createBendPackage } from "../../src/engine/package/bendPackage";
import type { BendProject } from "../../src/engine/core/types";
import type { BendHostLayer, BendRenderedMedia, BendStillMedia } from "../../src/integration/contract";
import { createHostLayer, createMockHostComposition } from "../../src/integration/host";
import { getProjectVersion } from "../../src/integration/adapter";
import { verifyBendHandoff, verifyEditableSource } from "../../src/integration/conformance";
import { BendIntegrationContractError } from "../../src/integration/errors";
import {
  validateHostComposition,
  validateHostLayer,
  validateRenderedMedia,
  validateStillMedia,
} from "../../src/integration/validation";

function phase55Project(): BendProject {
  const project = createGeneratedProject("4:5", "pulse", "PHASE6B-CONFORMANCE");
  const layer = project.layers[0];
  layer.blendMode = "screen";
  layer.mask = {
    ...createDefaultMask(),
    type: "ellipse",
    x: 0.42,
    y: 0.58,
    width: 0.5,
    height: 0.36,
    rotation: 12,
    feather: 0.18,
    invert: true,
  };
  layer.effects = [createTemporalEffect("motion-echo", "ghost-trail")];
  layer.animation = upsertKeyframe(layer, "mask.x", 0, 0.2, "ease-out");
  layer.animation = upsertKeyframe({ ...layer, animation: layer.animation }, "mask.x", 2, 0.8, "cubic-bezier");
  project.loop = { enabled: true, start: 1, end: 4 };
  return normalizeProject(project);
}

function makeVideo(project: BendProject, overrides: Partial<BendRenderedMedia> = {}): BendRenderedMedia {
  return {
    kind: "video",
    blob: new Blob(["video"], { type: "video/webm" }),
    poster: new Blob(["poster"], { type: "image/png" }),
    width: 720,
    height: 900,
    fps: project.canvas.fps,
    duration: getProjectDuration(project),
    aspectRatio: 0.8,
    mimeType: "video/webm",
    container: "webm",
    codec: "vp8",
    audioPresent: false,
    sourceProjectId: project.id,
    sourceVersion: getProjectVersion(project),
    ...overrides,
  };
}

function makeStill(project: BendProject, overrides: Partial<BendStillMedia> = {}): BendStillMedia {
  return {
    kind: "still",
    blob: new Blob(["still"], { type: "image/png" }),
    width: project.canvas.width,
    height: project.canvas.height,
    timestamp: 1,
    mimeType: "image/png",
    sourceProjectId: project.id,
    sourceVersion: getProjectVersion(project),
    ...overrides,
  };
}

describe("integration source identity", () => {
  it("is stable across save metadata, local storage keys, and project identity regeneration", () => {
    const project = createProject("4:5", "Stable identity");
    project.assets["asset-1"] = {
      id: "asset-1",
      name: "source.mp4",
      mimeType: "video/mp4",
      size: 4,
      width: 2,
      height: 2,
      duration: 1,
      storageKey: "local-key-a",
    };
    const first = getProjectVersion(project);
    const reopened = structuredClone(project);
    reopened.id = "project-regenerated";
    reopened.metadata = { ...reopened.metadata, updatedAt: reopened.metadata.updatedAt + 60_000 };
    reopened.assets["asset-1"].storageKey = "local-key-b";
    expect(getProjectVersion(reopened)).toBe(first);
  });

  it("changes when Phase 5.5 creative state changes", () => {
    const project = phase55Project();
    const first = getProjectVersion(project);

    expect(getProjectVersion({ ...project, layers: [{ ...project.layers[0], blendMode: "multiply" }, ...project.layers.slice(1)] })).not.toBe(first);
    expect(getProjectVersion({ ...project, layers: [{ ...project.layers[0], mask: { ...project.layers[0].mask, feather: 0.31 } }, ...project.layers.slice(1)] })).not.toBe(first);
    expect(getProjectVersion({ ...project, loop: { enabled: true, start: 2, end: 4 } })).not.toBe(first);
    expect(getProjectVersion({ ...project, layers: [{ ...project.layers[0], animation: upsertKeyframe(project.layers[0], "mask.x", 4, 0.1, "linear") }, ...project.layers.slice(1)] })).not.toBe(first);
  });

  it("round-trips Phase 5.5 state through a portable package without changing the revision", async () => {
    const project = phase55Project();
    const created = await createBendPackage(project, []);
    const verified = await verifyEditableSource(created.blob, {
      sourceProjectId: project.id,
      sourceVersion: getProjectVersion(project),
    });

    expect(verified.sourceVersion).toBe(getProjectVersion(project));
    expect(verified.project.layers[0].blendMode).toBe("screen");
    expect(verified.project.layers[0].mask).toMatchObject({ type: "ellipse", invert: true, rotation: 12 });
    expect(verified.project.layers[0].effects[0].id).toBe("motion-echo");
    expect(verified.project.layers[0].animation.tracks.some((track) => track.property === "mask.x")).toBe(true);
    expect(verified.project.loop).toEqual({ enabled: true, start: 1, end: 4 });
    expect(verified.manifest.formatVersion).toBe(1);
  });

  it("rejects a package that does not match the expected source revision", async () => {
    const project = phase55Project();
    const created = await createBendPackage(project, []);
    await expect(verifyEditableSource(created.blob, { sourceVersion: "00000000" })).rejects.toBeInstanceOf(BendIntegrationContractError);
  });
});

describe("rendered media validation", () => {
  it("accepts a complete video handoff and rejects damaged metadata", () => {
    const project = phase55Project();
    const valid = makeVideo(project);
    expect(validateRenderedMedia(valid, project)).toEqual([]);
    expect(validateRenderedMedia({ ...valid, blob: new Blob([]) }, project)).toEqual(expect.arrayContaining([expect.objectContaining({ code: "media.blob" })]));
    expect(validateRenderedMedia({ ...valid, sourceVersion: "deadbeef" }, project)).toEqual(expect.arrayContaining([expect.objectContaining({ code: "media.sourceVersion" })]));
    expect(validateRenderedMedia({ ...valid, aspectRatio: 1 }, project)).toEqual(expect.arrayContaining([expect.objectContaining({ code: "media.aspectRatio" })]));
    expect(validateRenderedMedia({ ...valid, fps: 24 }, project)).toEqual(expect.arrayContaining([expect.objectContaining({ code: "media.fps" })]));
    expect(validateRenderedMedia({ ...valid, poster: new Blob(["x"], { type: "image/jpeg" }) }, project)).toEqual(expect.arrayContaining([expect.objectContaining({ code: "media.poster.mime" })]));
  });

  it("validates still timestamps and dimensions against the composition", () => {
    const project = phase55Project();
    const still = makeStill(project);
    expect(validateStillMedia(still, project)).toEqual([]);
    expect(validateStillMedia({ ...still, timestamp: getProjectDuration(project) + 1 }, project)).toEqual(expect.arrayContaining([expect.objectContaining({ code: "still.timestamp" })]));
    expect(validateStillMedia({ ...still, width: 1 }, project)).toEqual(expect.arrayContaining([expect.objectContaining({ code: "still.dimensions" })]));
  });
});

describe("host record validation", () => {
  it("accepts a valid layer and rejects host-owned values outside their contract", () => {
    const project = phase55Project();
    const layer = createHostLayer(makeVideo(project), "video", "poster", "package");
    expect(validateHostLayer(layer)).toEqual([]);
    expect(validateHostLayer({ ...layer, opacity: 1.4 })).toEqual(expect.arrayContaining([expect.objectContaining({ code: "host.layer.opacity" })]));
    expect(validateHostLayer({ ...layer, playback: "bounce" as BendHostLayer["playback"] })).toEqual(expect.arrayContaining([expect.objectContaining({ code: "host.layer.playback" })]));
    expect(validateHostLayer({ ...layer, transform: { ...layer.transform, scale: 0 } })).toEqual(expect.arrayContaining([expect.objectContaining({ code: "host.layer.transform.scale" })]));
  });

  it("rejects duplicate host layer ids and unsupported integration versions", () => {
    const project = phase55Project();
    const composition = createMockHostComposition();
    const layer = createHostLayer(makeVideo(project), "video", "poster", "package");
    expect(validateHostComposition({ ...composition, layers: [layer, { ...layer }] })).toEqual(expect.arrayContaining([expect.objectContaining({ code: expect.stringContaining("id") })]));
    expect(validateHostComposition({ ...composition, integrationVersion: 2 as 1 })).toEqual(expect.arrayContaining([expect.objectContaining({ code: "host.composition.integrationVersion" })]));
  });
});

describe("handoff conformance", () => {
  it("verifies that video, still, and editable source share one revision", async () => {
    const project = phase55Project();
    const created = await createBendPackage(project, []);
    const result = await verifyBendHandoff({
      project,
      video: makeVideo(project),
      still: makeStill(project),
      editableSource: created.blob,
    });
    expect(result.sourceVersion).toBe(getProjectVersion(project));
    expect(result.editable.project.layers[0].mask.type).toBe("ellipse");
  });

  it("rejects a still from another revision", async () => {
    const project = phase55Project();
    const created = await createBendPackage(project, []);
    await expect(verifyBendHandoff({
      project,
      video: makeVideo(project),
      still: makeStill(project, { sourceVersion: "11111111" }),
      editableSource: created.blob,
    })).rejects.toBeInstanceOf(BendIntegrationContractError);
  });
});
