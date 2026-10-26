import { describe, expect, it } from "vitest";
import {
  assertRestorableBendPayload,
  bendAspectLabel,
  bendLayerName,
  bendsAspectMatches,
  BEND_TOOL_STATE_MIME,
  BEND_TOOL_STATE_VERSION,
  parseBendSourceState,
  withEphemeralPackageUrl,
  type BendSourceStateV1,
} from "./bendSourceState";

function source(overrides: Partial<BendSourceStateV1> = {}): BendSourceStateV1 {
  return {
    tool: "bend",
    schemaVersion: BEND_TOOL_STATE_VERSION,
    savedAt: "2026-10-27T00:00:00.000Z",
    bendProjectId: "project-bend-1",
    projectName: "Motion study",
    sourceRevision: "abc12345",
    aspectPreset: "4:5",
    canvas: { width: 1080, height: 1350, fps: 30, duration: 4 },
    durationSeconds: 4,
    package: {
      assetId: "asset_pkg",
      format: "bendpkg",
      formatVersion: 1,
      projectId: "project-bend-1",
      sourceRevision: "abc12345",
      byteLength: 1024,
      sha256: "a".repeat(64),
      media: [
        {
          id: "asset-video",
          name: "clip.mp4",
          mimeType: "video/mp4",
          byteLength: 100,
          sha256: "b".repeat(64),
          width: 1080,
          height: 1350,
          durationSeconds: 4,
        },
      ],
    },
    exportQuality: "preview",
    isPreview: true,
    video: {
      mimeType: "video/mp4",
      codec: "avc",
      width: 720,
      height: 900,
      durationSeconds: 4,
      fps: 30,
      container: "mp4",
    },
    poster: { width: 1080, height: 1350, timestamp: 0 },
    audio: { present: true, message: "Mixed timeline audio included" },
    host: {
      mode: "edit",
      editingLayerId: "layer-1",
      fitDecision: null,
      sourceLayerIds: ["layer-source"],
      sourceRevisions: { "layer-source": 2 },
    },
    ...overrides,
  };
}

describe("BEND Studio source state", () => {
  it("parses a complete versioned package reference and host metadata", () => {
    const parsed = parseBendSourceState(JSON.stringify(source()));
    expect(parsed.tool).toBe("bend");
    expect(parsed.package.media[0].sha256).toBe("b".repeat(64));
    expect(parsed.host.sourceLayerIds).toEqual(["layer-source"]);
    expect(parsed.exportQuality).toBe("preview");
  });

  it("rejects unsupported tool/version/MIME combinations before the iframe opens", () => {
    expect(() =>
      assertRestorableBendPayload({
        tool: "bend",
        toolStateVersion: "2.0.0",
        mimeType: BEND_TOOL_STATE_MIME,
        content: JSON.stringify(source()),
      }),
    ).toThrow(/Unsupported BEND source state/);
    expect(() =>
      assertRestorableBendPayload({
        tool: "vector",
        toolStateVersion: BEND_TOOL_STATE_VERSION,
        mimeType: BEND_TOOL_STATE_MIME,
        content: JSON.stringify(source()),
      }),
    ).toThrow(/Unsupported BEND source state/);
    expect(() => parseBendSourceState(JSON.stringify({ ...source(), schemaVersion: "9" }))).toThrow(
      /not supported/,
    );
  });

  it("rejects incomplete package references and invalid hashes", () => {
    const missingAssets = source();
    missingAssets.package = {
      ...missingAssets.package,
      media: undefined as unknown as BendSourceStateV1["package"]["media"],
    };
    expect(() => parseBendSourceState(JSON.stringify(missingAssets))).toThrow(/media manifest/);
    const badHash = source();
    badHash.package = { ...badHash.package, sha256: "nope" };
    expect(() => parseBendSourceState(JSON.stringify(badHash))).toThrow(/SHA-256/);
    const badMedia = source();
    badMedia.package = {
      ...badMedia.package,
      media: [{ ...badMedia.package.media[0], byteLength: 0 }],
    };
    expect(() => parseBendSourceState(JSON.stringify(badMedia))).toThrow(/byte length/);
  });

  it("formats BEND aspect labels and layer names without Studio decorations", () => {
    expect(bendAspectLabel(1080, 1350)).toBe("4:5");
    expect(bendAspectLabel(1080, 1080)).toBe("1:1");
    expect(bendAspectLabel(1080, 1920)).toBe("9:16");
    expect(bendLayerName({ projectName: "Campaign / BEND motion", canvas: { width: 1080, height: 1080 } })).toBe(
      "Campaign · 1:1",
    );
    expect(bendsAspectMatches(source(), 1080, 1350)).toBe(true);
    expect(bendsAspectMatches(source(), 1080, 1080)).toBe(false);
  });

  it("injects an ephemeral package URL without changing the stored source revision", () => {
    const original = source();
    const content = withEphemeralPackageUrl(original, "blob:http://studio/package", "fit");
    const parsed = JSON.parse(content) as BendSourceStateV1 & { package: { url: string } };
    expect(parsed.package.url).toBe("blob:http://studio/package");
    expect(parsed.host.fitDecision).toBe("fit");
    expect(parsed.sourceRevision).toBe(original.sourceRevision);
    expect(parsed.package.sha256).toBe(original.package.sha256);
  });
});
