import { describe, expect, it } from "vitest";
import {
  assertRestorableGeneratePayload,
  GenerateSourceStateError,
  parseGenerateSourceState,
  selectedGenerateTargets,
} from "./generateSourceState";

function document(overrides: Record<string, unknown> = {}) {
  return {
    tool: "generate",
    schemaVersion: "1.0.0",
    savedAt: "2026-10-26T00:00:00.000Z",
    mode: "rules",
    format: "post",
    slides: 1,
    seed: 12,
    selected: 0,
    controls: { layout: "Auto (mix)", style: "Minimal" },
    variations: [
      {
        c: { layout: "Auto (mix)", style: "Minimal" },
        seed: 1200,
        sl: [
          [
            { id: "host:layer_image", x: 30, y: 50, w: 45, r: 0, z: 2 },
            { id: "host:layer_type", x: 55, y: 90, w: 60, r: -3, z: 4 },
          ],
        ],
      },
    ],
    assets: [
      {
        id: "host:layer_image",
        hostLayerId: "layer_image",
        hostKind: "image",
        type: "img",
        name: "Photo",
        on: 1,
        aspectHOverW: 1.25,
      },
      {
        id: "host:layer_type",
        hostLayerId: "layer_type",
        hostKind: "typography",
        type: "img",
        name: "Headline",
        on: 1,
        aspectHOverW: 0.5,
      },
    ],
    hostLayers: [
      {
        layerId: "layer_image",
        name: "Photo",
        kind: "image",
        sourceTool: "image",
        aspectHOverW: 1.25,
        locked: false,
        visible: true,
      },
      {
        layerId: "layer_type",
        name: "Headline",
        kind: "typography",
        sourceTool: "typography",
        aspectHOverW: 0.5,
        locked: true,
        visible: true,
      },
    ],
    missingLayers: [],
    artboard: { id: "artboard_01", width: 1080, height: 1350 },
    frameHeight: 125,
    background: { controls: { background: "Atmospheric" }, seed: 1200, slide: 0 },
    ...overrides,
  };
}

describe("Generate source state 1.0.0", () => {
  it("parses host mappings and selects stable layer targets", () => {
    const parsed = parseGenerateSourceState(JSON.stringify(document()));
    expect(parsed.assets[0]?.hostLayerId).toBe("layer_image");
    const targets = selectedGenerateTargets(parsed);
    expect(targets).toHaveLength(2);
    expect(targets[0]).toMatchObject({
      hostLayerId: "layer_image",
      centerXPercent: 30,
      centerYPercent: 40,
      widthPercent: 45,
      aspectHOverW: 1.25,
    });
    expect(targets[1]?.rotationDegrees).toBe(-3);
  });

  it("rejects unsupported versions and malformed placements", () => {
    expect(() =>
      parseGenerateSourceState(
        JSON.stringify(document({ schemaVersion: "2.0.0" })),
      ),
    ).toThrow(GenerateSourceStateError);
    const malformed = document();
    (
      malformed.variations[0] as {
        sl: Array<Array<Record<string, unknown>>>;
      }
    ).sl[0][0].w = Number.NaN;
    expect(() => parseGenerateSourceState(JSON.stringify(malformed))).toThrow(
      "not finite",
    );
    expect(() =>
      assertRestorableGeneratePayload({
        tool: "generate",
        toolStateVersion: "0.9.0",
        mimeType: "application/vnd.studio.generate+json",
        content: "{}",
      }),
    ).toThrow("Unsupported Generate source state");
  });

  it("does not invent targets for missing or native demo assets", () => {
    const parsed = parseGenerateSourceState(
      JSON.stringify(
        document({
          assets: [
            {
              id: "a1",
              type: "text",
              role: "head",
              text: "Demo",
              on: 1,
            },
            {
              id: "host:gone",
              hostLayerId: "layer_gone",
              hostKind: "image",
              type: "img",
              missing: true,
              on: 1,
            },
          ],
        }),
      ),
    );
    expect(selectedGenerateTargets(parsed)).toEqual([]);
  });
});
