import { describe, expect, it } from "vitest";
import type { ToolSourceStatePayload } from "@studio/contracts";
import {
  assertRestorableVectorPayload,
  parseVectorSourceState,
  vectorLayerName,
  VECTOR_TOOL_STATE_MIME,
  VECTOR_TOOL_STATE_VERSION,
} from "./vectorSourceState";

const state = {
  tool: "vector",
  schemaVersion: VECTOR_TOOL_STATE_VERSION,
  savedAt: "2026-10-26T00:00:00.000Z",
  params: { mode: "s", seed: 42, ink: "#A33714", ov: {}, baked: null },
  history: [null],
  redo: [],
  initialOverrides: null,
  view: { zoom: 1, snap: true, activeTab: "gen", selection: [] },
};

function payload(overrides: Partial<ToolSourceStatePayload> = {}): ToolSourceStatePayload {
  return {
    tool: "vector",
    toolStateVersion: VECTOR_TOOL_STATE_VERSION,
    mimeType: VECTOR_TOOL_STATE_MIME,
    content: JSON.stringify(state),
    ...overrides,
  };
}

describe("Vector source state", () => {
  it("parses valid state and derives a recognizable layer name", () => {
    const parsed = parseVectorSourceState(JSON.stringify(state));
    expect(parsed.params.seed).toBe(42);
    expect(vectorLayerName(parsed)).toBe("Vector · Ribbons 42");
  });

  it("accepts state with manually baked geometry", () => {
    const baked = {
      ...state,
      params: {
        ...state.params,
        baked: [{ d: "M0 0L10 10", tf: [1, 0, 0, 1, 0, 0], fill: 0, col: "#000", sw: 1, op: 1 }],
      },
      history: [[]],
      view: { ...state.view, activeTab: "edit", selection: [0] },
    };
    const parsed = assertRestorableVectorPayload(
      payload({ content: JSON.stringify(baked) }),
    );
    expect(Array.isArray(parsed.params.baked)).toBe(true);
    expect(parsed.view.activeTab).toBe("edit");
    expect(parsed.view.selection).toEqual([0]);
  });

  it("rejects unsupported versions and wrong tools", () => {
    expect(() =>
      assertRestorableVectorPayload(payload({ toolStateVersion: "9.0.0" })),
    ).toThrow(/Unsupported Vector source state/);
    expect(() =>
      assertRestorableVectorPayload(payload({ tool: "image" })),
    ).toThrow(/Unsupported Vector source state/);

    const future = { ...state, schemaVersion: "2.0.0" };
    expect(() => parseVectorSourceState(JSON.stringify(future))).toThrow(
      /not supported/,
    );
  });

  it("rejects malformed source state", () => {
    expect(() => parseVectorSourceState("not json")).toThrow(/valid JSON/);
    expect(() =>
      parseVectorSourceState(JSON.stringify({ ...state, history: "nope" })),
    ).toThrow(/history/);
  });
});
