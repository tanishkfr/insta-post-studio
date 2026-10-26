import { describe, expect, it } from "vitest";
import { createGeneratedProject, createVideoProject } from "../../src/engine/core/project";
import {
  adjustAnchorPreservingCenter,
  compositionToLayerLocal,
  cropForAspect,
  getLayerBounds,
  getLayerVisualCenter,
  layerLocalToComposition,
  snapAngle,
  snapTranslation,
} from "../../src/engine/core/transform";

describe("direct manipulation geometry", () => {
  it("round-trips composition points through rotated, flipped layer space", () => {
    const project = createGeneratedProject("1:1", "pulse", "GEOMETRY-01");
    const layer = project.layers[0];
    layer.transform.x = 84;
    layer.transform.y = -32;
    layer.transform.scale = 0.7;
    layer.transform.rotation = 27;
    layer.transform.flipX = true;
    layer.transform.flipY = true;
    layer.transform.anchor = { x: 0.25, y: 0.75 };

    const point = { x: 140, y: 220 };
    const composition = layerLocalToComposition(project, layer, point);
    expect(compositionToLayerLocal(project, layer, composition).x).toBeCloseTo(point.x);
    expect(compositionToLayerLocal(project, layer, composition).y).toBeCloseTo(point.y);
  });

  it("keeps the visible center fixed when the anchor changes", () => {
    const project = createGeneratedProject("4:5", "pulse", "GEOMETRY-02");
    const layer = project.layers[0];
    layer.transform.x = 72;
    layer.transform.y = -44;
    layer.transform.scale = 0.62;
    layer.transform.rotation = -19;
    layer.transform.flipX = true;
    const before = getLayerVisualCenter(project, layer);
    const nextAnchor = { x: 0, y: 1 };
    const nextPosition = adjustAnchorPreservingCenter(project, layer, nextAnchor);
    const moved = structuredClone(layer);
    moved.transform.anchor = nextAnchor;
    moved.transform.x = nextPosition.x;
    moved.transform.y = nextPosition.y;
    const after = getLayerVisualCenter(project, moved);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it("computes centered aspect crops in source space", () => {
    const asset = { id: "asset-1", name: "wide.mp4", mimeType: "video/mp4", size: 1, width: 1920, height: 1080, duration: 4, storageKey: "asset-1" };
    const project = createVideoProject("1:1", asset);
    const crop = cropForAspect(project, project.layers[0], "1:1");
    expect(crop.x).toBeCloseTo(0.21875);
    expect(crop.y).toBe(0);
    expect(crop.width).toBeCloseTo(0.5625);
    expect(crop.height).toBe(1);
  });

  it("snaps rotated bounds to composition edges within the screen threshold", () => {
    const project = createGeneratedProject("1:1", "pulse", "GEOMETRY-03");
    const layer = project.layers[0];
    layer.transform.scale = 0.4;
    layer.transform.rotation = 18;
    const currentLeft = getLayerBounds(project, layer).left;
    const nextX = layer.transform.x + 12 - currentLeft;
    const result = snapTranslation(project, layer, nextX, 0, { x: 20, y: 0 });
    expect(result.guides[0]).toMatchObject({ axis: "x", position: 0 });
    expect(getLayerBounds(project, { ...layer, transform: { ...layer.transform, x: result.x } }).left).toBeCloseTo(0, 5);
  });

  it("uses fifteen-degree rotation increments for Shift snapping", () => {
    expect(snapAngle(22)).toBe(15);
    expect(snapAngle(23)).toBe(30);
    expect(snapAngle(-37)).toBe(-30);
  });
});
