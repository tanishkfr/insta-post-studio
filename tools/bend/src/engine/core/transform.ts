import type { BendLayer, BendProject, CropRect } from "./types";

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface LayerDimensions {
  width: number;
  height: number;
}

export interface LayerSelectionGeometry {
  center: Point;
  width: number;
  height: number;
  rotation: number;
}

export interface TransformMatrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

export interface SnapGuide {
  axis: "x" | "y";
  position: number;
  label: string;
}

export const FULL_CROP: CropRect = { x: 0, y: 0, width: 1, height: 1 };

export function getLayerSourceDimensions(project: BendProject, layer: BendLayer): LayerDimensions {
  if (layer.kind === "video") {
    const asset = project.assets[layer.assetId];
    return { width: Math.max(1, asset?.width ?? project.canvas.width), height: Math.max(1, asset?.height ?? project.canvas.height) };
  }
  return { width: project.canvas.width, height: project.canvas.height };
}

export function getLayerFullContentDimensions(project: BendProject, layer: BendLayer): LayerDimensions {
  if (layer.kind !== "video") return { width: project.canvas.width, height: project.canvas.height };
  const source = getLayerSourceDimensions(project, layer);
  const containScale = Math.min(project.canvas.width / source.width, project.canvas.height / source.height);
  const coverScale = Math.max(project.canvas.width / source.width, project.canvas.height / source.height);
  const scale = layer.fit === "cover" ? coverScale : containScale;
  return { width: source.width * scale, height: source.height * scale };
}

export function getLayerContentDimensions(project: BendProject, layer: BendLayer): LayerDimensions {
  const full = getLayerFullContentDimensions(project, layer);
  const crop = layer.crop ?? FULL_CROP;
  return { width: full.width * crop.width, height: full.height * crop.height };
}

/** x/y are the composition position of the layer's anchor. Legacy layers use the center anchor. */
export function getLayerAnchorPosition(project: BendProject, layer: BendLayer): Point {
  return { x: project.canvas.width / 2 + layer.transform.x, y: project.canvas.height / 2 + layer.transform.y };
}

export function getLayerVisualCenter(project: BendProject, layer: BendLayer): Point {
  const dimensions = getLayerContentDimensions(project, layer);
  const anchor = layer.transform.anchor ?? { x: 0.5, y: 0.5 };
  const scaleX = layer.transform.scale * (layer.transform.flipX ? -1 : 1);
  const scaleY = layer.transform.scale * (layer.transform.flipY ? -1 : 1);
  const offset = rotatePoint({
    x: (0.5 - anchor.x) * dimensions.width * scaleX,
    y: (0.5 - anchor.y) * dimensions.height * scaleY,
  }, layer.transform.rotation);
  const position = getLayerAnchorPosition(project, layer);
  return { x: position.x + offset.x, y: position.y + offset.y };
}

export function getLayerSelectionGeometry(project: BendProject, layer: BendLayer): LayerSelectionGeometry {
  const dimensions = getLayerContentDimensions(project, layer);
  return {
    center: getLayerVisualCenter(project, layer),
    width: dimensions.width * layer.transform.scale,
    height: dimensions.height * layer.transform.scale,
    rotation: layer.transform.rotation,
  };
}

export function getLayerTransformMatrix(project: BendProject, layer: BendLayer): TransformMatrix {
  const dimensions = getLayerContentDimensions(project, layer);
  const rotation = (layer.transform.rotation * Math.PI) / 180;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const scaleX = layer.transform.scale * (layer.transform.flipX ? -1 : 1);
  const scaleY = layer.transform.scale * (layer.transform.flipY ? -1 : 1);
  const anchor = layer.transform.anchor ?? { x: 0.5, y: 0.5 };
  const anchorLocal = { x: anchor.x * dimensions.width, y: anchor.y * dimensions.height };
  const position = getLayerAnchorPosition(project, layer);
  return {
    a: cos * scaleX,
    b: sin * scaleX,
    c: -sin * scaleY,
    d: cos * scaleY,
    e: position.x - (cos * scaleX * anchorLocal.x) + (sin * scaleY * anchorLocal.y),
    f: position.y - (sin * scaleX * anchorLocal.x) - (cos * scaleY * anchorLocal.y),
  };
}

export function transformPoint(matrix: TransformMatrix, point: Point): Point {
  return { x: matrix.a * point.x + matrix.c * point.y + matrix.e, y: matrix.b * point.x + matrix.d * point.y + matrix.f };
}

export function invertMatrix(matrix: TransformMatrix): TransformMatrix {
  const determinant = matrix.a * matrix.d - matrix.b * matrix.c;
  if (Math.abs(determinant) < 0.0000001) return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  return {
    a: matrix.d / determinant,
    b: -matrix.b / determinant,
    c: -matrix.c / determinant,
    d: matrix.a / determinant,
    e: (matrix.c * matrix.f - matrix.d * matrix.e) / determinant,
    f: (matrix.b * matrix.e - matrix.a * matrix.f) / determinant,
  };
}

export function compositionToLayerLocal(project: BendProject, layer: BendLayer, point: Point): Point {
  return transformPoint(invertMatrix(getLayerTransformMatrix(project, layer)), point);
}

export function layerLocalToComposition(project: BendProject, layer: BendLayer, point: Point): Point {
  return transformPoint(getLayerTransformMatrix(project, layer), point);
}

export function getLayerCorners(project: BendProject, layer: BendLayer): Point[] {
  const dimensions = getLayerContentDimensions(project, layer);
  return [
    layerLocalToComposition(project, layer, { x: 0, y: 0 }),
    layerLocalToComposition(project, layer, { x: dimensions.width, y: 0 }),
    layerLocalToComposition(project, layer, { x: dimensions.width, y: dimensions.height }),
    layerLocalToComposition(project, layer, { x: 0, y: dimensions.height }),
  ];
}

export function getLayerBounds(project: BendProject, layer: BendLayer): Rect {
  const corners = getLayerCorners(project, layer);
  const xs = corners.map((point) => point.x);
  const ys = corners.map((point) => point.y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  return { left, top, width: Math.max(...xs) - left, height: Math.max(...ys) - top };
}

export function hitTestLayer(project: BendProject, layer: BendLayer, point: Point): boolean {
  const dimensions = getLayerContentDimensions(project, layer);
  const local = compositionToLayerLocal(project, layer, point);
  return local.x >= 0 && local.x <= dimensions.width && local.y >= 0 && local.y <= dimensions.height;
}

export function compositionPointFromClient(clientX: number, clientY: number, canvasRect: DOMRect | Rect, project: BendProject): Point {
  return {
    x: ((clientX - canvasRect.left) / Math.max(1, canvasRect.width)) * project.canvas.width,
    y: ((clientY - canvasRect.top) / Math.max(1, canvasRect.height)) * project.canvas.height,
  };
}

export function compositionDeltaFromClient(deltaX: number, deltaY: number, canvasRect: DOMRect | Rect, project: BendProject): Point {
  return {
    x: (deltaX / Math.max(1, canvasRect.width)) * project.canvas.width,
    y: (deltaY / Math.max(1, canvasRect.height)) * project.canvas.height,
  };
}

export function rotatePoint(point: Point, degrees: number): Point {
  const angle = (degrees * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: point.x * cos - point.y * sin, y: point.x * sin + point.y * cos };
}

export function normalizeAngle(degrees: number): number {
  let result = degrees;
  while (result > 180) result -= 360;
  while (result < -180) result += 360;
  return result;
}

export function snapAngle(degrees: number, increment = 15): number {
  return Math.round(degrees / increment) * increment;
}

export function cropForAspect(project: BendProject, layer: BendLayer, aspect: "free" | "original" | "1:1" | "4:5" | "9:16" | "16:9"): CropRect {
  if (aspect === "free" || aspect === "original") return { ...FULL_CROP };
  const source = getLayerSourceDimensions(project, layer);
  const target = aspectRatio(aspect);
  const sourceRatio = source.width / source.height;
  let width = 1;
  let height = 1;
  if (sourceRatio > target) width = (source.height * target) / source.width;
  else height = source.width / target / source.height;
  return { x: (1 - width) / 2, y: (1 - height) / 2, width, height };
}

export function snapTranslation(project: BendProject, layer: BendLayer, nextX: number, nextY: number, threshold: Point, enabled = true): { x: number; y: number; guides: SnapGuide[] } {
  if (!enabled) return { x: nextX, y: nextY, guides: [] };
  const moved = structuredClone(layer);
  moved.transform.x = nextX;
  moved.transform.y = nextY;
  const bounds = getLayerBounds(project, moved);
  const xSources = [bounds.left, bounds.left + bounds.width / 2, bounds.left + bounds.width];
  const xTargets = [0, project.canvas.width / 2, project.canvas.width];
  const ySources = [bounds.top, bounds.top + bounds.height / 2, bounds.top + bounds.height];
  const yTargets = [0, project.canvas.height / 2, project.canvas.height];
  const x = chooseSnap(xSources, xTargets, threshold.x);
  const y = chooseSnap(ySources, yTargets, threshold.y);
  return {
    x: nextX + (x?.delta ?? 0),
    y: nextY + (y?.delta ?? 0),
    guides: [
      ...(x ? [{ axis: "x" as const, position: x.target, label: x.target === project.canvas.width / 2 ? "Center" : "Edge" }] : []),
      ...(y ? [{ axis: "y" as const, position: y.target, label: y.target === project.canvas.height / 2 ? "Center" : "Edge" }] : []),
    ],
  };
}

export function adjustAnchorPreservingCenter(project: BendProject, layer: BendLayer, nextAnchor: Point): { x: number; y: number } {
  const center = getLayerVisualCenter(project, layer);
  const dimensions = getLayerContentDimensions(project, layer);
  const scaleX = layer.transform.scale * (layer.transform.flipX ? -1 : 1);
  const scaleY = layer.transform.scale * (layer.transform.flipY ? -1 : 1);
  const offset = rotatePoint({
    x: (0.5 - nextAnchor.x) * dimensions.width * scaleX,
    y: (0.5 - nextAnchor.y) * dimensions.height * scaleY,
  }, layer.transform.rotation);
  return { x: center.x - offset.x - project.canvas.width / 2, y: center.y - offset.y - project.canvas.height / 2 };
}

function chooseSnap(sources: number[], targets: number[], threshold: number): { delta: number; target: number } | null {
  let best: { delta: number; target: number } | null = null;
  for (const source of sources) {
    for (const target of targets) {
      const delta = target - source;
      if (Math.abs(delta) > threshold || (best && Math.abs(delta) >= Math.abs(best.delta))) continue;
      best = { delta, target };
    }
  }
  return best;
}

function aspectRatio(aspect: Exclude<Parameters<typeof cropForAspect>[2], "free" | "original">): number {
  const [width, height] = aspect.split(":").map(Number);
  return width / height;
}
