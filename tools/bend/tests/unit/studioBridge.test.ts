import { describe, expect, it } from "vitest";
import { studioTempProjectId } from "../../src/integration/studioSession";

describe("Studio BEND edit-session identity", () => {
  it("derives a deterministic, filesystem-safe temporary project id from the host layer", () => {
    expect(studioTempProjectId({ sessionId: "session-1", layerId: "layer/with spaces" })).toBe(
      "bend-studio-layer-with-spaces",
    );
    expect(studioTempProjectId({ sessionId: "session-1", layerId: "layer/with spaces" })).toBe(
      studioTempProjectId({ sessionId: "different", layerId: "layer/with spaces" }),
    );
  });

  it("falls back to the scoped session and stays inside the Studio-owned namespace", () => {
    const id = studioTempProjectId({ sessionId: "session_abc-123", layerId: null });
    expect(id.startsWith("bend-studio-")).toBe(true);
    expect(id).toContain("session_abc-123");
    expect(id).not.toContain("/");
  });
});
