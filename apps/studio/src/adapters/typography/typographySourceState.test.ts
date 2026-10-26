import { describe, expect, it } from "vitest";
import {
  assertRestorableTypographyPayload,
  parseTypographySourceState,
  typographyLayerName,
  typographyModeFromLayer,
  typographyTags,
  TYPOGRAPHY_TOOL_STATE_MIME,
  TYPOGRAPHY_TOOL_STATE_VERSION,
} from "./typographySourceState";
import type { SharedLayer } from "@studio/contracts";

function payload(content: unknown) {
  return {
    tool: "typography" as const,
    toolStateVersion: TYPOGRAPHY_TOOL_STATE_VERSION,
    mimeType: TYPOGRAPHY_TOOL_STATE_MIME,
    content: JSON.stringify(content),
  };
}

const library = {
  tool: "typography",
  schemaVersion: "1.0.0",
  mode: "library",
  savedAt: "2026-10-26T00:00:00.000Z",
  state: {
    text: "Studio",
    font: { name: "Goozette", kind: "open", family: "typefont3" },
    size: 220,
    tracking: 0.06,
    weight: 600,
    ink: "#193438",
    strength: 80,
    brush: 150,
    field: {
      width: 1920,
      height: 512,
      values: [
        [25, 1.25, -0.5],
        [26, 0, 2],
      ],
    },
  },
};

const custom = {
  tool: "typography",
  schemaVersion: "1.0.0",
  mode: "custom",
  savedAt: "2026-10-26T00:00:00.000Z",
  state: {
    strokes: [{ w: 0.01, pts: [[0.2, 0.2], [0.5, 0.4]] }],
    thickness: 8,
    img: {
      dataUrl: "data:image/png;base64,AAAA",
      name: "motif.png",
      width: 320,
      height: 420,
    },
    imgRect: { x: 0.1, y: 0.2, w: 0.5, h: 0.6 },
    imgBase: { w: 0.5, h: 0.6 },
    imgScale: 1.2,
    top: "image",
    ink: "#193438",
    text: "BEND",
    spacing: 0.09,
    motifSize: 1.1,
    letterSize: 180,
    tracking: 0.02,
    rotation: 15,
    variation: 0.2,
    weight: 1,
    serif: 0.35,
    mono: 0,
    script: 0,
    stretch: 1,
    slant: 8,
    stage: "type",
  },
};

describe("Typography source state", () => {
  it("preserves the Type Library font identity and sparse distortion field", () => {
    const parsed = assertRestorableTypographyPayload(payload(library), "library");
    expect(parsed.mode).toBe("library");
    if (parsed.mode !== "library") throw new Error("wrong mode");
    expect(parsed.state.font).toMatchObject({ name: "Goozette", kind: "open" });
    expect(parsed.state.field.values).toEqual([
      [25, 1.25, -0.5],
      [26, 0, 2],
    ]);
    expect(typographyLayerName(parsed)).toContain("Goozette");
  });

  it("preserves Custom Type strokes, motif image and all composition controls", () => {
    const parsed = assertRestorableTypographyPayload(payload(custom), "custom");
    expect(parsed.mode).toBe("custom");
    if (parsed.mode !== "custom") throw new Error("wrong mode");
    expect(parsed.state.strokes).toHaveLength(1);
    expect(parsed.state.img?.dataUrl).toContain("data:image/png");
    expect(parsed.state).toMatchObject({
      text: "BEND",
      letterSize: 180,
      serif: 0.35,
      slant: 8,
      rotation: 15,
      stage: "type",
      top: "image",
    });
  });

  it("rejects wrong modes, unsupported versions and malformed documents", () => {
    expect(() =>
      assertRestorableTypographyPayload(payload(library), "custom"),
    ).toThrow(/authored in Type Library/);
    expect(() =>
      assertRestorableTypographyPayload({
        ...payload(library),
        toolStateVersion: "9.9.9",
      }),
    ).toThrow(/Unsupported Type source state/);
    expect(() =>
      parseTypographySourceState(
        JSON.stringify({ ...custom, state: { ...custom.state, strokes: "bad" } }),
      ),
    ).toThrow(/motif strokes/i);
  });

  it("derives the correct mode and namespaced tags from a host layer", () => {
    const layer = {
      metadata: { createdAt: "", updatedAt: "", tags: ["typography", "type-mode:custom"] },
    } as unknown as SharedLayer;
    expect(typographyModeFromLayer(layer)).toBe("custom");
    expect(typographyTags("custom")).toContain("type-mode:custom");
    expect(typographyTags("library")).toContain("type-mode:library");
  });
});
