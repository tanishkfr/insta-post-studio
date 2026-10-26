import { describe, expect, it } from "vitest";
import {
  assertRestorableImagePayload,
  decodeDataUrl,
  ImageSourceStateError,
  IMAGE_TOOL_STATE_MIME,
  IMAGE_TOOL_STATE_VERSION,
  parseImageSourceState,
  parseTransientImageSourceState,
  storedImageSourceDocument,
} from "./imageSourceState";

function document(photo: Record<string, unknown> = { assetId: "asset_photo" }) {
  return {
    tool: "image",
    schemaVersion: "1.0.0",
    savedAt: "2026-10-26T00:00:00.000Z",
    photo,
    settings: {
      color: { on: 1, mode: "Duotone" },
      medium: { on: 1, type: "Dots" },
      blur: { on: 1, type: "Glitch", strokes: [[[0.1, 0.2], [0.3, 0.4]]] },
      zone: { on: 1, paint: "Paint" },
      layers: [{ id: "styled", op: 0.8 }],
      order: ["trace", "blur", "medium"],
    },
    history: ["one", "two"],
    historyIndex: 1,
    mask: {
      width: 600,
      height: 750,
      dataUrl: "data:image/png;base64,AAAA",
    },
    view: {
      format: "1:1",
      tab: "edit",
      selectedLayer: "styled",
      openSections: ["medium"],
      advancedSections: [],
    },
  };
}

function payload(content: unknown) {
  return {
    tool: "image" as const,
    toolStateVersion: IMAGE_TOOL_STATE_VERSION,
    mimeType: IMAGE_TOOL_STATE_MIME,
    content: JSON.stringify(content),
  };
}

describe("Image source state", () => {
  it("preserves the complete native settings, mask, history and view", () => {
    const parsed = assertRestorableImagePayload(payload(document()));
    expect(parsed.photo.assetId).toBe("asset_photo");
    expect(parsed.settings.medium).toEqual({ on: 1, type: "Dots" });
    expect(parsed.settings.blur).toMatchObject({ type: "Glitch" });
    expect(parsed.history).toEqual(["one", "two"]);
    expect(parsed.historyIndex).toBe(1);
    expect(parsed.mask?.dataUrl).toBe("data:image/png;base64,AAAA");
    expect(parsed.view.format).toBe("1:1");
  });

  it("accepts the transient publish payload and strips the photo into an asset reference", () => {
    const transient = parseTransientImageSourceState(
      JSON.stringify(
        document({
          dataUrl: "data:image/png;base64,iVBORw0KGgo=",
          name: "photo.png",
          mimeType: "image/png",
          width: 640,
          height: 800,
        }),
      ),
    );
    const stored = storedImageSourceDocument(transient, {
      assetId: "asset_photo",
      name: "photo.png",
      mimeType: "image/png",
      width: 640,
      height: 800,
      contentHash: "hash",
    });
    expect(stored.photo.assetId).toBe("asset_photo");
    expect("dataUrl" in stored.photo).toBe(false);
    expect(JSON.stringify(stored.photo)).not.toContain("base64");
  });

  it("rejects unsupported versions, foreign tools and missing photos", () => {
    expect(() =>
      assertRestorableImagePayload({
        ...payload(document()),
        toolStateVersion: "9.9.9",
      }),
    ).toThrow(/Unsupported Image source state/);
    expect(() =>
      parseImageSourceState(JSON.stringify({ ...document(), tool: "vector" })),
    ).toThrow(/does not belong to Image/);
    expect(() =>
      parseImageSourceState(JSON.stringify(document({ assetId: "" }))),
    ).toThrow(/source-photo asset/);
  });

  it("decodes base64 photo data URLs without losing bytes", () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 255]);
    const dataUrl = `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`;
    const decoded = decodeDataUrl(dataUrl);
    expect(decoded.mimeType).toBe("image/png");
    expect(Array.from(decoded.bytes)).toEqual(Array.from(bytes));
    expect(() => decodeDataUrl("not-a-data-url")).toThrow(ImageSourceStateError);
  });
});
