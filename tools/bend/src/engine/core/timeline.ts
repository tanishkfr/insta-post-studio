import type { BendLayer, BendProject, VideoLayer } from "./types";
import { getLayerDuration } from "./project";
import { sourceTimeForVideoLayer } from "./timeMapping";

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

export function formatSeconds(seconds: number): string {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const remainder = safe - minutes * 60;
  return `${minutes}:${remainder.toFixed(2).padStart(5, "0")}`;
}

export function timeToPercent(time: number, duration: number): number {
  return duration > 0 ? clamp(time / duration, 0, 1) * 100 : 0;
}

export function percentToTime(percent: number, duration: number): number {
  return (clamp(percent, 0, 100) / 100) * Math.max(0, duration);
}

export function timeAtPointer(clientX: number, rect: DOMRect, duration: number): number {
  return percentToTime(((clientX - rect.left) / Math.max(1, rect.width)) * 100, duration);
}

export function layerStartAt(layer: BendLayer): number {
  return Math.max(0, layer.timeline.start);
}

export function layerEndAt(layer: BendLayer): number {
  return layerStartAt(layer) + getLayerDuration(layer);
}

export function isLayerActiveAt(layer: BendLayer, projectTime: number): boolean {
  return layer.visible && projectTime >= layerStartAt(layer) && projectTime < layerEndAt(layer) + 0.0001;
}

export function getRenderableLayers(project: BendProject, projectTime: number): BendLayer[] {
  return project.layers.filter((layer) => isLayerActiveAt(layer, projectTime));
}

export function layerLocalTimeAt(layer: BendLayer, projectTime: number): number {
  return clamp(projectTime - layerStartAt(layer), 0, Math.max(0, getLayerDuration(layer) - 0.001));
}

export function sourceTimeAt(layer: BendLayer, projectTime: number): number {
  const localTime = layerLocalTimeAt(layer, projectTime);
  if (layer.kind !== "video") return localTime;
  return sourceTimeForVideoLayer(layer, localTime);
}

export function sourceTimestampAt(layer: BendLayer, projectTime: number, sourceStart = 0): number {
  return sourceTimeAt(layer, projectTime) + (Number.isFinite(sourceStart) ? sourceStart : 0);
}

export function setTimelineTime(project: BendProject, time: number): number {
  return clamp(time, project.timeline.inPoint, project.timeline.outPoint);
}

export function isVideoLayer(layer: BendLayer | null): layer is VideoLayer {
  return layer?.kind === "video";
}

export function seekBy(current: number, delta: number, duration: number): number {
  return clamp(current + delta, 0, duration);
}
