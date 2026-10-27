import { describe, expect, it } from "vitest";
import {
  assertRestorableShapesPayload,
  parseShapesSourceState,
  ShapesSourceStateError,
} from "./shapesSourceState";
import { inspectPng, ShapesPngError } from "./pngValidation";

function shapesDocument(overrides: Record<string, unknown> = {}) {
  return {
    tool: "shapes",
    schemaVersion: "1.0.0",
    savedAt: "2026-10-26T00:00:00.000Z",
    document: {
      objects: [
        {
          id: "obj-1",
          kind: "box",
          name: "Box 1",
          form: "positive",
          color: "#C4A574",
          deform: { twist: 0, taper: 0, noise: 0 },
          array: null,
          stroke: null,
          remix: null,
          mesh: null,
          triangles: null,
          transform: {
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            scale: { x: 1, y: 1, z: 1 },
          },
        },
      ],
    },
    selection: "obj-1",
    activeFace: null,
    editTool: "move",
    shade: "toon",
    wireframe: true,
    inkColor: "#000000",
    showGizmo: true,
    light: "studio",
    camera: { theta: 0.72, phi: 1.08, radius: 9, target: { x: 0.4, y: 0.2, z: 0.4 } },
    history: { past: [], future: [] },
    nextSerial: 2,
    ...overrides,
  };
}

describe("Shapes host source validation", () => {
  it("accepts a complete 1.0.0 document and preserves object IDs/camera", () => {
    const parsed = parseShapesSourceState(JSON.stringify(shapesDocument()));
    expect(parsed.document.objects[0]?.id).toBe("obj-1");
    expect(parsed.camera.radius).toBe(9);
    expect(parsed.nextSerial).toBe(2);
  });

  it("rejects malformed transforms, versions, duplicate IDs and camera ranges", () => {
    const malformed = shapesDocument();
    (
      (malformed.document.objects[0] as Record<string, unknown>).transform as Record<
        string,
        Record<string, number>
      >
    ).position.x = Number.NaN;
    expect(() => parseShapesSourceState(JSON.stringify(malformed))).toThrow(
      ShapesSourceStateError,
    );
    expect(() =>
      parseShapesSourceState(
        JSON.stringify(shapesDocument({ schemaVersion: "2.0.0" })),
      ),
    ).toThrow("not supported");
    const duplicate = shapesDocument();
    (duplicate.document.objects as unknown[]).push(
      structuredClone(duplicate.document.objects[0]),
    );
    expect(() => parseShapesSourceState(JSON.stringify(duplicate))).toThrow(
      "duplicate object ID",
    );
    expect(() =>
      parseShapesSourceState(
        JSON.stringify(
          shapesDocument({
            camera: { theta: 0, phi: 5, radius: 9, target: { x: 0, y: 0, z: 0 } },
          }),
        ),
      ),
    ).toThrow("outside the supported range");
    expect(() =>
      assertRestorableShapesPayload({
        tool: "shapes",
        toolStateVersion: "0.9.0",
        mimeType: "application/vnd.studio.shapes+json",
        content: "{}",
      }),
    ).toThrow("Unsupported Shapes source state");
  });
});

describe("Shapes PNG inspection", () => {
  it("accepts a real RGBA PNG header", () => {
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
      "base64",
    );
    const info = inspectPng(new Uint8Array(png));
    expect(info.width).toBe(1);
    expect(info.height).toBe(1);
    expect(info.colorType).toBe(6);
    expect(info.hasAlpha).toBe(true);
  });

  it("rejects non-PNG and truncated data", () => {
    expect(() => inspectPng(new TextEncoder().encode("not a png"))).toThrow(
      ShapesPngError,
    );
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
      "base64",
    ).subarray(0, 20);
    expect(() => inspectPng(new Uint8Array(png))).toThrow();
  });
});
