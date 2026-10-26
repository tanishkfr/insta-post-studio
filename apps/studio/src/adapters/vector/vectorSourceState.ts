import type { ToolSourceStatePayload } from "@studio/contracts";

export const VECTOR_TOOL_STATE_VERSION = "1.0.0";
export const VECTOR_TOOL_STATE_MIME = "application/vnd.studio.vector+json";
export const VECTOR_TOOL_ID = "vector" as const;

export interface VectorSourceViewState {
  zoom: number;
  snap: boolean;
  activeTab: "gen" | "edit";
  selection: number[];
}

/**
 * Tool-owned Vector document. `params` intentionally remains the editor's full
 * native parameter object (including `ov`/`baked`), while history/redo preserve
 * native editing continuity. The host treats this as opaque after validation.
 */
export interface VectorSourceStateV1 {
  tool: typeof VECTOR_TOOL_ID;
  schemaVersion: typeof VECTOR_TOOL_STATE_VERSION;
  savedAt: string;
  params: Record<string, unknown>;
  history: unknown[];
  redo: unknown[];
  initialOverrides: unknown | null;
  view: VectorSourceViewState;
}

export class VectorSourceStateError extends Error {
  readonly code = "VECTOR_SOURCE_STATE_ERROR" as const;

  constructor(message: string) {
    super(message);
    this.name = "VectorSourceStateError";
  }
}

function asText(content: string | Uint8Array): string {
  return typeof content === "string" ? content : new TextDecoder().decode(content);
}

export function isVectorSourcePayload(payload: ToolSourceStatePayload): boolean {
  return (
    payload.tool === VECTOR_TOOL_ID &&
    payload.mimeType === VECTOR_TOOL_STATE_MIME &&
    payload.toolStateVersion === VECTOR_TOOL_STATE_VERSION
  );
}

export function parseVectorSourceState(content: string | Uint8Array): VectorSourceStateV1 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(asText(content));
  } catch {
    throw new VectorSourceStateError("The saved Vector document is not valid JSON.");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new VectorSourceStateError("The saved Vector document is empty.");
  }
  const candidate = parsed as Partial<VectorSourceStateV1>;
  if (candidate.tool !== VECTOR_TOOL_ID) {
    throw new VectorSourceStateError("Source state does not belong to Vector.");
  }
  if (candidate.schemaVersion !== VECTOR_TOOL_STATE_VERSION) {
    throw new VectorSourceStateError(
      `Vector source version ${String(candidate.schemaVersion)} is not supported by this host.`,
    );
  }
  if (!candidate.params || typeof candidate.params !== "object") {
    throw new VectorSourceStateError("Vector source state is missing editor parameters.");
  }
  if (!Array.isArray(candidate.history) || !Array.isArray(candidate.redo)) {
    throw new VectorSourceStateError("Vector source history is malformed.");
  }
  const view = candidate.view;
  if (!view || typeof view !== "object") {
    throw new VectorSourceStateError("Vector source view state is missing.");
  }
  return {
    tool: VECTOR_TOOL_ID,
    schemaVersion: VECTOR_TOOL_STATE_VERSION,
    savedAt:
      typeof candidate.savedAt === "string" ? candidate.savedAt : new Date(0).toISOString(),
    params: candidate.params,
    history: candidate.history,
    redo: candidate.redo,
    initialOverrides:
      candidate.initialOverrides && typeof candidate.initialOverrides === "object"
        ? candidate.initialOverrides
        : null,
    view: {
      zoom: typeof view.zoom === "number" ? view.zoom : 1,
      snap: typeof view.snap === "boolean" ? view.snap : true,
      activeTab: view.activeTab === "edit" ? "edit" : "gen",
      selection: Array.isArray(view.selection)
        ? view.selection.filter((value): value is number => Number.isInteger(value))
        : [],
    },
  };
}

export function vectorLayerName(state: VectorSourceStateV1): string {
  const mode = state.params.mode;
  const seed = state.params.seed;
  const modeName =
    mode === "l" ? "Streamlines" : mode === "c" ? "Contours" : "Ribbons";
  return `Vector · ${modeName}${typeof seed === "number" ? ` ${seed}` : ""}`;
}

export function assertRestorableVectorPayload(payload: ToolSourceStatePayload): VectorSourceStateV1 {
  if (!isVectorSourcePayload(payload)) {
    throw new VectorSourceStateError(
      `Unsupported Vector source state (${payload.tool} / ${payload.toolStateVersion}).`,
    );
  }
  return parseVectorSourceState(payload.content);
}
