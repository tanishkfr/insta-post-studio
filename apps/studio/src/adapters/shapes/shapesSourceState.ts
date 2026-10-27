import type { ToolSourceStatePayload } from "@studio/contracts";

export const SHAPES_TOOL_STATE_VERSION = "1.0.0";
export const SHAPES_TOOL_STATE_MIME = "application/vnd.studio.shapes+json";

export interface ShapesSourceObject {
  id: string;
  kind: string;
  name: string;
  form: "positive" | "negative";
  color: string;
  transform: {
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number };
    scale: { x: number; y: number; z: number };
  };
  mesh: { positions: unknown[]; faces: unknown[] } | null;
  triangles: { positions: unknown[]; indices: unknown[] } | null;
  deform: { twist: number; taper: number; noise: number };
  array: Record<string, unknown> | null;
  stroke: Record<string, unknown> | null;
  remix: number | null;
  [key: string]: unknown;
}

export interface ShapesSourceStateV1 {
  tool: "shapes";
  schemaVersion: typeof SHAPES_TOOL_STATE_VERSION;
  savedAt: string;
  document: { objects: ShapesSourceObject[] };
  selection: string | null;
  activeFace: number | null;
  editTool: string;
  shade: string;
  wireframe: boolean;
  inkColor: string;
  showGizmo: boolean;
  light: string;
  camera: {
    theta: number;
    phi: number;
    radius: number;
    target: { x: number; y: number; z: number };
  };
  history: { past: unknown[]; future: unknown[] };
  nextSerial: number;
}

export class ShapesSourceStateError extends Error {
  readonly code = "SHAPES_SOURCE_STATE_ERROR" as const;

  constructor(message: string) {
    super(message);
    this.name = "ShapesSourceStateError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(message: string): never {
  throw new ShapesSourceStateError(message);
}

function finite(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) fail(`${label} is not a finite number.`);
  return value;
}

function vec3(value: unknown, label: string) {
  if (!isRecord(value)) fail(`${label} is malformed.`);
  return {
    x: finite(value.x, `${label}.x`),
    y: finite(value.y, `${label}.y`),
    z: finite(value.z, `${label}.z`),
  };
}

function text(content: string | Uint8Array): string {
  return typeof content === "string" ? content : new TextDecoder().decode(content);
}

export function isShapesSourcePayload(payload: ToolSourceStatePayload): boolean {
  return (
    payload.tool === "shapes" &&
    payload.mimeType === SHAPES_TOOL_STATE_MIME &&
    payload.toolStateVersion === SHAPES_TOOL_STATE_VERSION
  );
}

/**
 * Host-side validation happens before the React 18 Shapes iframe is opened.
 * The bridge repeats the complete validation before replacing its editor state;
 * this pass prevents an unsupported/malformed document from reaching the tool.
 */
export function parseShapesSourceState(
  content: string | Uint8Array,
): ShapesSourceStateV1 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text(content));
  } catch {
    throw new ShapesSourceStateError("The saved Shapes document is not valid JSON.");
  }
  if (!isRecord(parsed) || parsed.tool !== "shapes") {
    throw new ShapesSourceStateError("Source state does not belong to Shapes.");
  }
  if (parsed.schemaVersion !== SHAPES_TOOL_STATE_VERSION) {
    throw new ShapesSourceStateError(
      `Shapes source version ${String(parsed.schemaVersion)} is not supported by this host.`,
    );
  }
  const document = parsed.document;
  if (!isRecord(document) || !Array.isArray(document.objects)) {
    throw new ShapesSourceStateError("Shapes source state is missing its object document.");
  }
  if (document.objects.length > 120) {
    throw new ShapesSourceStateError("Shapes source state has too many objects.");
  }
  const ids = new Set<string>();
  const objects = document.objects.map((object, index) => {
    if (!isRecord(object) || typeof object.id !== "string" || !/^obj-\d+$/.test(object.id)) {
      throw new ShapesSourceStateError(`Shapes object ${index} has an invalid identity.`);
    }
    if (ids.has(object.id)) {
      throw new ShapesSourceStateError(`Shapes source state contains duplicate object ID ${object.id}.`);
    }
    ids.add(object.id);
    if (typeof object.kind !== "string" || typeof object.name !== "string") {
      throw new ShapesSourceStateError(`Shapes object ${object.id} is malformed.`);
    }
    if (!isRecord(object.transform)) {
      throw new ShapesSourceStateError(`Shapes object ${object.id} has no transform.`);
    }
    const scale = vec3(object.transform.scale, `${object.id}.scale`);
    if (scale.x <= 0 || scale.y <= 0 || scale.z <= 0) {
      throw new ShapesSourceStateError(`Shapes object ${object.id} has a non-positive scale.`);
    }
    vec3(object.transform.position, `${object.id}.position`);
    vec3(object.transform.rotation, `${object.id}.rotation`);
    if (!isRecord(object.deform)) {
      throw new ShapesSourceStateError(`Shapes object ${object.id} has no deform state.`);
    }
    finite(object.deform.twist, `${object.id}.deform.twist`);
    finite(object.deform.taper, `${object.id}.deform.taper`);
    finite(object.deform.noise, `${object.id}.deform.noise`);
    if (object.mesh !== null && !isRecord(object.mesh)) {
      throw new ShapesSourceStateError(`Shapes object ${object.id} has malformed quad geometry.`);
    }
    if (object.triangles !== null && !isRecord(object.triangles)) {
      throw new ShapesSourceStateError(`Shapes object ${object.id} has malformed triangle geometry.`);
    }
    return object as unknown as ShapesSourceObject;
  });
  const selection = parsed.selection;
  if (selection !== null && (typeof selection !== "string" || !ids.has(selection))) {
    throw new ShapesSourceStateError("Shapes source selection is not part of the document.");
  }
  if (parsed.activeFace !== null && !Number.isInteger(parsed.activeFace)) {
    throw new ShapesSourceStateError("Shapes active face is malformed.");
  }
  const camera = parsed.camera;
  if (!isRecord(camera)) throw new ShapesSourceStateError("Shapes camera state is missing.");
  const theta = finite(camera.theta, "camera.theta");
  const phi = finite(camera.phi, "camera.phi");
  const radius = finite(camera.radius, "camera.radius");
  if (phi < 0.12 || phi > Math.PI - 0.12 || radius < 2.2 || radius > 48) {
    throw new ShapesSourceStateError("Shapes camera state is outside the supported range.");
  }
  const target = vec3(camera.target, "camera.target");
  const history = parsed.history;
  if (
    !isRecord(history) ||
    !Array.isArray(history.past) ||
    !Array.isArray(history.future) ||
    history.past.length > 400 ||
    history.future.length > 400
  ) {
    throw new ShapesSourceStateError("Shapes undo/redo history is malformed.");
  }
  if (!Number.isInteger(parsed.nextSerial) || (parsed.nextSerial as number) < 1) {
    throw new ShapesSourceStateError("Shapes next object serial is malformed.");
  }
  return {
    tool: "shapes",
    schemaVersion: SHAPES_TOOL_STATE_VERSION,
    savedAt:
      typeof parsed.savedAt === "string" ? parsed.savedAt : new Date(0).toISOString(),
    document: { objects },
    selection: (selection as string | null) ?? null,
    activeFace: (parsed.activeFace as number | null) ?? null,
    editTool: typeof parsed.editTool === "string" ? parsed.editTool : "move",
    shade: typeof parsed.shade === "string" ? parsed.shade : "toon",
    wireframe: Boolean(parsed.wireframe),
    inkColor: typeof parsed.inkColor === "string" ? parsed.inkColor : "#000000",
    showGizmo: Boolean(parsed.showGizmo),
    light: typeof parsed.light === "string" ? parsed.light : "studio",
    camera: { theta, phi, radius, target },
    history: {
      past: history.past,
      future: history.future,
    },
    nextSerial: parsed.nextSerial as number,
  };
}

export function assertRestorableShapesPayload(
  payload: ToolSourceStatePayload,
): ShapesSourceStateV1 {
  if (!isShapesSourcePayload(payload)) {
    throw new ShapesSourceStateError(
      `Unsupported Shapes source state (${payload.tool} / ${payload.toolStateVersion}).`,
    );
  }
  return parseShapesSourceState(payload.content);
}

export function shapesLayerName(state: ShapesSourceStateV1): string {
  const count = state.document.objects.length;
  const kinds = Array.from(
    new Set(state.document.objects.map((object) => object.kind)),
  ).slice(0, 2);
  const detail = kinds.length ? ` · ${kinds.join(" + ")}` : "";
  return `Shapes · ${count} object${count === 1 ? "" : "s"}${detail}`;
}
