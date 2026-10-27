import type { SharedLayer, StudioProject } from "@studio/contracts";
import { createIdentityTransform } from "@studio/contracts";
import { describe, expect, it } from "vitest";
import { createStudioProject } from "../project/defaultProject";
import { artboardSequenceFile, studioSlug } from "./compositionExport";
import {
  CompositionRenderError,
  planComposition,
  resolveCompositionBackground,
} from "./compositionRenderer";

function makeLayer(
  project: StudioProject,
  id: string,
  name: string,
  overrides: Partial<SharedLayer> = {},
): SharedLayer {
  return {
    id,
    name,
    kind: "image",
    sourceTool: "image",
    artboardId: project.artboards[0].id,
    order: 0,
    sourceState: null,
    rendered: null,
    transform: createIdentityTransform(300, 300),
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: "normal",
    mask: null,
    clipToArtboard: true,
    metadata: {
      createdAt: "2026-10-26T00:00:00.000Z",
      updatedAt: "2026-10-26T00:00:00.000Z",
    },
    ...overrides,
  };
}

function fixture(): { project: StudioProject; bottom: SharedLayer; top: SharedLayer } {
  const project = createStudioProject({
    id: "project_compositor",
    name: "Compositor test",
    formatId: "instagram-4-5",
  });
  const bottom = makeLayer(project, "layer_bottom", "Bottom", { order: 4 });
  const top = makeLayer(project, "layer_top", "Top", { order: 0 });
  project.layers = [bottom, top];
  project.artboards[0].layerOrder = [bottom.id, top.id];
  project.layerOrder = [bottom.id, top.id];
  return { project, bottom, top };
}

describe("composition planning", () => {
  it("uses Artboard.layerOrder instead of layer.order", () => {
    const { project, bottom, top } = fixture();
    project.artboards[0].layerOrder = [top.id, bottom.id];
    const plan = planComposition(project, project.artboards[0]);
    expect(plan.layers.map((entry) => entry.layer.id)).toEqual([top.id, bottom.id]);
    expect(plan.warnings).toEqual([]);
  });

  it("skips hidden and audio layers unless includeHidden is requested", () => {
    const { project, bottom, top } = fixture();
    bottom.visible = false;
    top.kind = "audio";
    top.sourceTool = "bend";
    const plan = planComposition(project, project.artboards[0]);
    expect(plan.layers.filter((entry) => entry.include)).toHaveLength(0);
    expect(plan.layers).toHaveLength(2);

    const withHidden = planComposition(project, project.artboards[0], {
      includeHidden: true,
    });
    expect(
      withHidden.layers.filter((entry) => entry.include).map((entry) => entry.layer.id),
    ).toEqual([bottom.id]);
  });

  it("appends layers missing from the saved order rather than dropping them", () => {
    const { project, bottom } = fixture();
    project.artboards[0].layerOrder = ["layer_top"];
    const plan = planComposition(project, project.artboards[0]);
    expect(plan.layers.map((entry) => entry.layer.id)).toEqual(["layer_top", bottom.id]);
    expect(plan.warnings.some((warning) => warning.code === "MISSING_LAYER")).toBe(true);
  });

  it("fails a strict render when the order references a missing layer", () => {
    const { project } = fixture();
    project.artboards[0].layerOrder = ["layer_missing"];
    expect(() =>
      planComposition(project, project.artboards[0], { strict: true }),
    ).toThrowError(CompositionRenderError);
    try {
      planComposition(project, project.artboards[0], { strict: true });
    } catch (error) {
      expect((error as CompositionRenderError).code).toBe("MISSING_LAYER");
    }
  });

  it("resolves authored, transparent and explicit background policies", () => {
    const { project } = fixture();
    const artboard = project.artboards[0];
    expect(resolveCompositionBackground(artboard, "transparent")).toEqual({
      kind: "transparent",
    });
    expect(resolveCompositionBackground(artboard, "white")).toEqual({
      kind: "solid",
      color: "#ffffff",
    });
    expect(resolveCompositionBackground(artboard, "black")).toEqual({
      kind: "solid",
      color: "#000000",
    });
    expect(resolveCompositionBackground(artboard, "artboard")).toEqual({
      kind: "solid",
      color: "#ffffff",
    });
    artboard.background = { kind: "transparent" };
    expect(resolveCompositionBackground(artboard, "artboard")).toEqual({
      kind: "transparent",
    });
    artboard.background = { kind: "asset", assetId: "asset_bg" };
    expect(resolveCompositionBackground(artboard, "artboard")).toEqual({
      kind: "asset",
      assetId: "asset_bg",
    });
  });
});

describe("composition export filenames", () => {
  it("creates predictable, ordered carousel filenames", () => {
    expect(studioSlug("  My Project: Act I  ")).toBe("my-project-act-i");
    expect(studioSlug("???", "studio")).toBe("studio");
    expect(artboardSequenceFile(0, "Artboard 01", 1080, 1350)).toBe(
      "01-artboard-01-1080x1350.png",
    );
    expect(artboardSequenceFile(9, "Slide / Two", 1080, 1080)).toBe(
      "10-slide-two-1080x1080.png",
    );
  });
});
