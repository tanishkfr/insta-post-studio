import { DEFAULT_WAVE_DISPLACEMENT, clampWaveDisplacement } from "../effects/waveDisplacement";
import { createDefaultModulator, createEmptyAnimation, normalizeAnimation, upsertKeyframe } from "../animation/engine";
import { createGeneratorParams, getGeneratorDefinition, isGeneratorId, normalizeGeneratorParams } from "../generators/registry";
import { createSignalFieldParams, getSignalPreset } from "../generators/signalField";
import { createTemporalEffect, normalizeTemporalEffects } from "../temporal/registry";
import { createDefaultLoop, normalizeLoopRegion } from "./loop";
import { createDefaultMask, normalizeMask } from "./mask";
import { clipDurationForSource, defaultClipPlayback, normalizeClipPlayback, sourceSpan, videoLayerDuration } from "./timeMapping";
import type {
  AspectPreset,
  ClipAudioSettings,
  ClipTransition,
  CoverFrame,
  ProjectSoundtrack,
  SafeAreaSettings,
  SoundtrackDuckingSettings,
  BendLayer,
  BendProject,
  BendTransform,
  CropRect,
  GeneratorId,
  LayerBlendMode,
  LayerColorAdjustments,
  LayerMask,
  MediaAssetRecord,
  ProceduralLayer,
  SignalPresetId,
  VideoLayer,
} from "./types";
import { ASPECT_PRESETS, LEGACY_SCHEMA_VERSION, PHASE7_SCHEMA_VERSION, SCHEMA_VERSION } from "./types";

export const DEFAULT_CANVAS_BACKGROUND = "#0C0C0E";

export function makeId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function defaultTransform(): BendTransform {
  return {
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
    opacity: 1,
    anchor: { x: 0.5, y: 0.5 },
    flipX: false,
    flipY: false,
  };
}

export function defaultCrop(): CropRect {
  return { x: 0, y: 0, width: 1, height: 1 };
}

export function defaultLayerColor(): LayerColorAdjustments {
  return {
    brightness: 0,
    contrast: 0,
    saturation: 0,
    hue: 0,
    temperature: 0,
    tint: 0,
    highlights: 0,
    shadows: 0,
    vignette: 0,
    grain: 0,
    sharpen: 0,
    enabled: true,
  };
}

export function defaultClipAudio(): ClipAudioSettings {
  return { enabled: true, gainDb: 0, fadeIn: 0, fadeOut: 0 };
}

export function defaultSoundtrackDucking(): SoundtrackDuckingSettings {
  return { enabled: false, amountDb: 10, thresholdDb: -36, attack: 0.08, release: 0.4 };
}

export function defaultSafeAreas(): SafeAreaSettings {
  return { enabled: false, titleSafe: true, captionSafe: true, grid: true };
}

export function defaultCover(time = 0): CoverFrame {
  return { time: Math.max(0, Number.isFinite(time) ? time : 0) };
}

export function defaultBlendMode(): LayerBlendMode {
  return "normal";
}

export function defaultLayerMask(): LayerMask {
  return createDefaultMask();
}

export function createProject(
  aspect: AspectPreset = "4:5",
  name = "Untitled signal",
): BendProject {
  const dimensions = ASPECT_PRESETS[aspect];
  const now = Date.now();
  return {
    schemaVersion: SCHEMA_VERSION,
    id: makeId("project"),
    name,
    canvas: {
      width: dimensions.width,
      height: dimensions.height,
      fps: 30,
      duration: 8,
      background: DEFAULT_CANVAS_BACKGROUND,
    },
    assets: {},
    layers: [],
    timeline: { inPoint: 0, outPoint: 8 },
    loop: createDefaultLoop(8),
    cover: defaultCover(0),
    safeAreas: defaultSafeAreas(),
    soundtrack: null,
    metadata: { createdAt: now, updatedAt: now },
  };
}

export function createProceduralLayer(
  generatorId: GeneratorId | SignalPresetId = "signal-field",
  seed = "BEND-01",
  name?: string,
): ProceduralLayer {
  const id = isGeneratorId(generatorId) ? generatorId : "signal-field";
  const generator = id === "signal-field"
    ? createSignalFieldParams(isGeneratorId(generatorId) ? "pulse" : generatorId, seed)
    : createGeneratorParams(id, undefined, seed);
  const definition = getGeneratorDefinition(id);
  return {
    id: makeId("layer"),
    name: name ?? definition.name,
    kind: "procedural",
    transform: defaultTransform(),
    timeline: { start: 0, duration: generator.duration },
    visible: true,
    locked: false,
    muted: true,
    effects: [],
    animation: createEmptyAnimation(),
    crop: defaultCrop(),
    color: defaultLayerColor(),
    blendMode: defaultBlendMode(),
    mask: defaultLayerMask(),
    generator,
  };
}

export function createVideoLayer(asset: MediaAssetRecord, remix = false): VideoLayer {
  const duration = Math.max(0.5, asset.duration || 5);
  return {
    id: makeId("layer"),
    name: displayNameForAsset(asset.name),
    kind: "video",
    assetId: asset.id,
    trimStart: 0,
    trimEnd: duration,
    fit: "contain",
    transform: defaultTransform(),
    timeline: { start: 0, duration },
    visible: true,
    locked: false,
    muted: false,
    trackId: "V1",
    playback: defaultClipPlayback(),
    audio: defaultClipAudio(),
    transitionIn: null,
    effects: [],
    animation: createEmptyAnimation(),
    crop: defaultCrop(),
    color: defaultLayerColor(),
    blendMode: defaultBlendMode(),
    mask: defaultLayerMask(),
    wave: clampWaveDisplacement({ ...DEFAULT_WAVE_DISPLACEMENT, enabled: remix }),
  };
}

export function createGeneratedProject(
  aspect: AspectPreset = "4:5",
  preset: SignalPresetId = "pulse",
  seed = "BEND-01",
): BendProject {
  const project = createProject(aspect, `${getSignalPreset(preset).label} field`);
  const layer = createProceduralLayer(preset, seed);
  project.layers = [layer];
  project.canvas.duration = layer.timeline.duration;
  project.timeline.outPoint = layer.timeline.duration;
  return project;
}

export function createExampleProject(aspect: AspectPreset = "4:5"): BendProject {
  const project = createGeneratedProject(aspect, "pulse", "BEND / First Study");
  const background = project.layers[0];
  if (!background || background.kind !== "procedural") return project;
  background.name = "Signal bed";

  const foreground = createProceduralLayer("refraction", "BEND-EXAMPLE-REFRACTION", "Refraction study");
  foreground.generator.duration = project.canvas.duration;
  foreground.timeline.duration = project.canvas.duration;
  foreground.transform.scale = 0.9;
  foreground.transform.opacity = 0.78;
  const effect = createTemporalEffect("motion-echo", "ghost-trail");
  foreground.effects = [effect];
  foreground.animation = upsertKeyframe(foreground, "transform.scale", 0, 0.82, "ease-out");
  foreground.animation = upsertKeyframe(foreground, "transform.scale", 3.2, 1.04, "ease-in-out");
  foreground.animation = upsertKeyframe(foreground, "transform.scale", project.canvas.duration, 0.9, "ease-in");
  foreground.animation = upsertKeyframe(foreground, `effects.${effect.instanceId}.decay`, 0, 0.76, "ease-out");
  foreground.animation = upsertKeyframe(foreground, `effects.${effect.instanceId}.decay`, project.canvas.duration, 0.42, "ease-in");
  foreground.animation = upsertKeyframe(foreground, "transform.opacity", 0, 0.68, "ease-out");
  foreground.animation = {
    version: 1,
    tracks: foreground.animation.tracks.map((track) => track.property === "transform.opacity"
      ? { ...track, modulator: { ...createDefaultModulator("sine"), amplitude: 0.08, frequency: 0.18, seed: "BEND-EXAMPLE-OPACITY" } }
      : track),
  };

  return updateProjectDuration({
    ...project,
    layers: [background, foreground],
    name: "BEND / First Study",
  });
}

export function createVideoProject(
  aspect: AspectPreset,
  asset: MediaAssetRecord,
  remix = false,
): BendProject {
  const project = createProject(aspect, remix ? "Remix / wave study" : asset.name.replace(/\.[^/.]+$/, ""));
  const layer = createVideoLayer(asset, remix);
  project.assets[asset.id] = asset;
  project.layers = [layer];
  project.canvas.duration = layer.timeline.duration;
  project.timeline.outPoint = layer.timeline.duration;
  return project;
}

export function appendVideoLayer(project: BendProject, asset: MediaAssetRecord, remix = false): BendProject {
  const layer = createVideoLayer(asset, remix);
  layer.timeline.start = videoSequenceEnd(project);
  return updateProjectDuration({
    ...project,
    assets: { ...project.assets, [asset.id]: asset },
    layers: [...project.layers, layer],
  });
}

export function videoSequenceEnd(project: Pick<BendProject, "layers">, trackId = "V1"): number {
  return project.layers
    .filter((layer): layer is VideoLayer => layer.kind === "video" && layer.trackId === trackId)
    .reduce((end, layer) => Math.max(end, layer.timeline.start + layer.timeline.duration), 0);
}

export function prependProceduralLayer(
  project: BendProject,
  generatorId: GeneratorId | SignalPresetId = "signal-field",
): BendProject {
  const layer = createProceduralLayer(generatorId, `${project.name}-FIELD`);
  layer.generator.duration = Math.max(project.canvas.duration, layer.generator.duration);
  layer.timeline.duration = layer.generator.duration;
  return updateProjectDuration({ ...project, layers: [layer, ...project.layers] });
}

export function getActiveLayer(project: BendProject, layerId?: string): BendLayer | null {
  if (project.layers.length === 0) return null;
  return project.layers.find((layer) => layer.id === layerId) ?? project.layers[0] ?? null;
}

export function getProjectDuration(project: BendProject): number {
  return Math.max(0.1, project.canvas.duration);
}

export function getLayerDuration(layer: BendLayer): number {
  return Math.max(0.1, layer.timeline.duration);
}

export function updateProjectDuration(project: BendProject): BendProject {
  const normalized = normalizeProject(project);
  const duration = normalized.layers.length > 0
    ? Math.max(0.1, ...normalized.layers.map((layer) => layer.timeline.start + getLayerDuration(layer)))
    : Math.max(0.1, normalized.canvas.duration);
  return {
    ...normalized,
    canvas: { ...normalized.canvas, duration },
    timeline: { ...normalized.timeline, inPoint: 0, outPoint: duration },
    loop: normalizeLoopRegion(normalized.loop, duration),
    metadata: { ...normalized.metadata, updatedAt: Date.now() },
  };
}

export function normalizeProject(value: unknown): BendProject {
  const project = structuredClone(migrateProject(value));
  const declaredDuration = Math.max(0.1, Number.isFinite(project.canvas.duration) ? project.canvas.duration : 0.1);
  project.name = project.name.trim() || "Untitled signal";
  project.canvas.width = clampNumber(project.canvas.width, 1, 16_384, 1080);
  project.canvas.height = clampNumber(project.canvas.height, 1, 16_384, 1350);
  project.canvas.fps = clampNumber(project.canvas.fps, 1, 120, 30);
  project.canvas.duration = Math.max(0.1, Number.isFinite(project.canvas.duration) ? project.canvas.duration : 8);
  project.assets = Object.fromEntries(Object.entries(project.assets).map(([id, asset]) => [id, normalizeAsset(asset, id)]));
  project.layers = project.layers.map((layer) => normalizeLayer(layer, project.assets));
  reconcileTransitions(project.layers);
  const layerEnd = project.layers.reduce((max, layer) => Math.max(max, layer.timeline.start + layer.timeline.duration), 0);
  project.canvas.duration = Math.max(project.canvas.duration, layerEnd, 0.1);
  project.timeline.inPoint = clampNumber(project.timeline.inPoint, 0, project.canvas.duration, 0);
  project.timeline.outPoint = clampNumber(project.timeline.outPoint, project.timeline.inPoint + 0.1, project.canvas.duration, project.canvas.duration);
  project.loop = normalizeLoopRegion(project.loop, project.canvas.duration);
  if (!project.loop.enabled && project.loop.start < 0.0001 && Math.abs(project.loop.end - declaredDuration) < 0.0001 && project.loop.end < project.canvas.duration) {
    project.loop = { ...project.loop, end: project.canvas.duration };
  }
  project.cover = normalizeCover(project.cover, project.canvas.duration);
  project.safeAreas = normalizeSafeAreas(project.safeAreas);
  project.soundtrack = normalizeSoundtrack(project.soundtrack, project.assets);
  project.metadata = {
    createdAt: Number.isFinite(project.metadata?.createdAt) ? project.metadata.createdAt : Date.now(),
    updatedAt: Number.isFinite(project.metadata?.updatedAt) ? project.metadata.updatedAt : Date.now(),
  };
  return { ...project, schemaVersion: SCHEMA_VERSION };
}

export function migrateProject(value: unknown): BendProject {
  if (!isRecord(value)) throw new Error("This project is not a valid BEND document.");
  if (value.schemaVersion === LEGACY_SCHEMA_VERSION) return migrateLegacyProject(value);
  if (value.schemaVersion === PHASE7_SCHEMA_VERSION) return migratePhase7Project(value);
  if (value.schemaVersion !== SCHEMA_VERSION || !isProjectShape(value)) {
    throw new Error("This BEND document is malformed or from an unsupported version.");
  }
  return value as unknown as BendProject;
}

export function isBendProject(value: unknown): value is BendProject {
  return isRecord(value) && value.schemaVersion === SCHEMA_VERSION && isProjectShape(value);
}

function migratePhase7Project(value: Record<string, unknown>): BendProject {
  if (!isProjectShape({ ...value, schemaVersion: SCHEMA_VERSION })) {
    throw new Error("This Phase 7 BEND project is malformed and could not be migrated.");
  }
  const canvas = isRecord(value.canvas) ? value.canvas : {};
  return {
    ...(value as unknown as BendProject),
    schemaVersion: SCHEMA_VERSION,
    cover: normalizeCover(value.cover, numberOr(canvas.duration, 0)),
    safeAreas: normalizeSafeAreas(value.safeAreas),
    soundtrack: normalizeSoundtrack(value.soundtrack, value.assets as Record<string, MediaAssetRecord>),
  };
}

function migrateLegacyProject(value: Record<string, unknown>): BendProject {
  if (!isProjectShape({ ...value, schemaVersion: SCHEMA_VERSION })) {
    throw new Error("This Phase 1 BEND project is malformed and could not be migrated.");
  }
  const layers = value.layers as unknown[];
  const canvas = isRecord(value.canvas) ? value.canvas : {};
  return {
    ...(value as unknown as BendProject),
    schemaVersion: SCHEMA_VERSION,
    cover: normalizeCover(value.cover, numberOr(canvas.duration, 0)),
    safeAreas: normalizeSafeAreas(value.safeAreas),
    soundtrack: normalizeSoundtrack(value.soundtrack, value.assets as Record<string, MediaAssetRecord>),
    layers: layers.map((rawLayer) => migrateLegacyLayer(rawLayer)),
  };
}

function migrateLegacyLayer(rawLayer: unknown): BendLayer {
  if (!isRecord(rawLayer) || (rawLayer.kind !== "video" && rawLayer.kind !== "procedural")) {
    throw new Error("This BEND project contains an invalid layer.");
  }
  const layer = rawLayer as Record<string, unknown>;
  const transform = isRecord(layer.transform) ? layer.transform : {};
  const base = {
    id: typeof layer.id === "string" ? layer.id : makeId("layer"),
    name: typeof layer.name === "string" ? layer.name : "Layer",
    transform: {
      x: numberOr(transform.x, 0),
      y: numberOr(transform.y, 0),
      scale: numberOr(transform.scale, 1),
      rotation: numberOr(transform.rotation, 0),
      opacity: numberOr(transform.opacity, 1),
      anchor: normalizeAnchor(transform.anchor),
      flipX: transform.flipX === true,
      flipY: transform.flipY === true,
    },
    timeline: { start: 0, duration: 0.1 },
    visible: true,
    locked: false,
    muted: layer.kind === "procedural",
    effects: normalizeTemporalEffects(layer.effects),
    animation: createEmptyAnimation(),
    crop: defaultCrop(),
    color: defaultLayerColor(),
    blendMode: defaultBlendMode(),
    mask: defaultLayerMask(),
  };
  if (layer.kind === "video") {
    const trimStart = numberOr(layer.trimStart, 0);
    const trimEnd = Math.max(trimStart + 0.1, numberOr(layer.trimEnd, trimStart + 0.1));
    const playback = normalizeClipPlayback(layer.playback);
    const migratedVideo: VideoLayer = {
      ...base,
      kind: "video",
      assetId: typeof layer.assetId === "string" ? layer.assetId : "missing-asset",
      trimStart,
      trimEnd,
      fit: layer.fit === "cover" ? "cover" : "contain",
      timeline: { start: 0, duration: clipDurationForSource(trimEnd - trimStart, playback) },
      muted: false,
      trackId: "V1",
      playback,
      audio: defaultClipAudio(),
      transitionIn: null,
      wave: isRecord(layer.wave) ? clampWaveDisplacement(layer.wave as never) : clampWaveDisplacement({}),
    };
    return migratedVideo;
  }
  const legacyGenerator = isRecord(layer.generator) ? layer.generator : {};
  const preset = ["pulse", "drift", "current", "fracture"].includes(String(legacyGenerator.preset))
    ? legacyGenerator.preset as SignalPresetId
    : "pulse";
  const generator = {
    ...createSignalFieldParams(preset, typeof legacyGenerator.seed === "string" ? legacyGenerator.seed : "BEND-01"),
    speed: numberOr(legacyGenerator.speed, 1),
    intensity: numberOr(legacyGenerator.intensity, 0.7),
    scale: numberOr(legacyGenerator.scale, 1),
    frequency: numberOr(legacyGenerator.frequency, 3),
    duration: numberOr(legacyGenerator.duration, 8),
    palette: ["acid", "ember", "ice", "mono"].includes(String(legacyGenerator.palette)) ? legacyGenerator.palette as ProceduralLayer["generator"]["palette"] : "acid",
  };
  const duration = generator.duration;
  const migratedProcedural: ProceduralLayer = {
    ...base,
    kind: "procedural",
    timeline: { start: 0, duration },
    generator: generator as ProceduralLayer["generator"],
  };
  return migratedProcedural;
}

function normalizeLayer(layer: BendLayer, assets: Record<string, MediaAssetRecord>): BendLayer {
  if (!isRecord(layer) || (layer.kind !== "video" && layer.kind !== "procedural")) {
    throw new Error("This BEND project contains an invalid layer.");
  }
  if (!isRecord(layer.transform)) {
    throw new Error("This BEND project contains a layer without a valid transform.");
  }
  const transform = isRecord(layer.transform) ? layer.transform as unknown as Record<string, unknown> : {};
  const base = {
    id: layer.id,
    name: typeof layer.name === "string" ? layer.name.trim() || "Layer" : "Layer",
    transform: {
      x: clampNumber(numberOr(transform.x, 0), -10_000, 10_000, 0),
      y: clampNumber(numberOr(transform.y, 0), -10_000, 10_000, 0),
      scale: clampNumber(numberOr(transform.scale, 1), 0.05, 8, 1),
      rotation: clampNumber(numberOr(transform.rotation, 0), -360, 360, 0),
      opacity: clampNumber(numberOr(transform.opacity, 1), 0, 1, 1),
      anchor: normalizeAnchor(transform.anchor),
      flipX: transform.flipX === true,
      flipY: transform.flipY === true,
    },
    timeline: {
      start: clampNumber(numberOr(layer.timeline?.start, 0), 0, 86_400, 0),
      duration: 0.1,
    },
    visible: layer.visible !== false,
    locked: layer.locked === true,
    muted: layer.muted === true,
    effects: normalizeTemporalEffects(layer.effects),
    animation: createEmptyAnimation(),
    crop: normalizeCrop(layer.crop),
    color: normalizeLayerColor(layer.color),
    blendMode: normalizeBlendMode(layer.blendMode),
    mask: normalizeMask(layer.mask),
  };
  if (layer.kind === "video") {
    if (typeof layer.assetId !== "string") throw new Error("This BEND project contains a video layer without a media reference.");
    const asset = assets[layer.assetId];
    const sourceDuration = Math.max(0.1, asset?.duration ?? Math.max(numberOr(layer.trimEnd, 0.1), 0.1));
    const trimStart = clampNumber(numberOr(layer.trimStart, 0), 0, Math.max(0, sourceDuration - 0.1), 0);
    const trimEnd = clampNumber(numberOr(layer.trimEnd, sourceDuration), trimStart + 0.1, Math.max(trimStart + 0.1, sourceDuration), sourceDuration);
    const playback = normalizeClipPlayback(layer.playback);
    if (playback.freeze) {
      playback.freeze = {
        sourceTime: clampNumber(playback.freeze.sourceTime, trimStart, trimEnd, trimStart),
        duration: clampNumber(playback.freeze.duration, 0.1, 3_600, 1),
      };
    }
    const normalizedVideo: VideoLayer = {
      ...base,
      kind: "video",
      assetId: layer.assetId,
      trimStart,
      trimEnd,
      fit: layer.fit === "cover" ? "cover" : "contain",
      timeline: { ...base.timeline, duration: clipDurationForSource(sourceSpan({ trimStart, trimEnd } as VideoLayer), playback) },
      wave: clampWaveDisplacement(layer.wave ?? {}),
      trackId: typeof layer.trackId === "string" && layer.trackId.trim() ? layer.trackId.trim().slice(0, 32) : "V1",
      playback,
      audio: normalizeClipAudio(layer.audio),
      transitionIn: normalizeClipTransition(layer.transitionIn),
    };
    return { ...normalizedVideo, animation: normalizeAnimation(layer.animation, normalizedVideo) };
  }
  const generator = normalizeGeneratorParams(layer.generator);
  const duration = generator.duration;
  const normalizedProcedural: ProceduralLayer = {
    ...base,
    kind: "procedural",
    timeline: { ...base.timeline, duration },
    generator,
  };
  return { ...normalizedProcedural, animation: normalizeAnimation(layer.animation, normalizedProcedural) };
}

function reconcileTransitions(layers: BendLayer[]): void {
  for (const layer of layers) {
    if (layer.kind !== "video" || !layer.transitionIn) continue;
    const outgoing = layers.find((candidate): candidate is VideoLayer => candidate.kind === "video" && candidate.id === layer.transitionIn?.fromLayerId);
    if (!outgoing) continue;
    const overlap = Math.min(layer.timeline.start + layer.timeline.duration, outgoing.timeline.start + outgoing.timeline.duration)
      - Math.max(layer.timeline.start, outgoing.timeline.start);
    if (overlap <= 0.0001) continue;
    if (layer.transitionIn.duration > overlap) {
      layer.transitionIn = { ...layer.transitionIn, duration: Math.max(0.1, Number(overlap.toFixed(4))) };
    }
  }
}

function normalizeClipAudio(value: unknown): ClipAudioSettings {
  const raw = isRecord(value) ? value : {};
  return {
    enabled: raw.enabled !== false,
    gainDb: clampNumber(numberOr(raw.gainDb, 0), -60, 12, 0),
    fadeIn: clampNumber(numberOr(raw.fadeIn, 0), 0, 60, 0),
    fadeOut: clampNumber(numberOr(raw.fadeOut, 0), 0, 60, 0),
  };
}

function normalizeClipTransition(value: unknown): ClipTransition | null {
  if (!isRecord(value)) return null;
  const types = ["crossfade", "dip-black", "wipe", "zoom", "glitch", "distortion"] as const;
  if (!types.includes(value.type as (typeof types)[number]) || typeof value.fromLayerId !== "string") return null;
  const directions = ["left", "right", "up", "down"] as const;
  const easings = ["hold", "linear", "ease-in", "ease-out", "ease-in-out", "cubic-bezier"] as const;
  return {
    id: typeof value.id === "string" ? value.id : makeId("transition"),
    type: value.type as (typeof types)[number],
    fromLayerId: value.fromLayerId,
    duration: clampNumber(numberOr(value.duration, 0.6), 0.1, 10, 0.6),
    direction: directions.includes(value.direction as (typeof directions)[number]) ? value.direction as (typeof directions)[number] : "left",
    intensity: clampNumber(numberOr(value.intensity, 0.5), 0, 1, 0.5),
    easing: easings.includes(value.easing as (typeof easings)[number]) ? value.easing as (typeof easings)[number] : "ease-in-out",
  };
}

function normalizeCover(value: unknown, duration: number): CoverFrame {
  const raw = isRecord(value) ? value : {};
  return { time: clampNumber(numberOr(raw.time, 0), 0, Math.max(0, duration - 0.0001), 0) };
}

function normalizeSafeAreas(value: unknown): SafeAreaSettings {
  const raw = isRecord(value) ? value : {};
  return {
    enabled: raw.enabled === true,
    titleSafe: raw.titleSafe !== false,
    captionSafe: raw.captionSafe !== false,
    grid: raw.grid !== false,
  };
}

function normalizeSoundtrack(value: unknown, assets: Record<string, MediaAssetRecord>): ProjectSoundtrack | null {
  if (!isRecord(value) || typeof value.assetId !== "string") return null;
  const asset = assets[value.assetId];
  const sourceDuration = Math.max(0.1, asset?.duration ?? 30);
  const sourceIn = clampNumber(numberOr(value.sourceIn, 0), 0, Math.max(0, sourceDuration - 0.1), 0);
  const sourceOut = clampNumber(numberOr(value.sourceOut, sourceDuration), sourceIn + 0.1, sourceDuration, sourceDuration);
  return {
    assetId: value.assetId,
    timelineStart: clampNumber(numberOr(value.timelineStart, 0), 0, 86_400, 0),
    sourceIn,
    sourceOut,
    gainDb: clampNumber(numberOr(value.gainDb, -6), -60, 12, -6),
    muted: value.muted === true,
    fadeIn: clampNumber(numberOr(value.fadeIn, 0), 0, 60, 0),
    fadeOut: clampNumber(numberOr(value.fadeOut, 0), 0, 60, 0),
    loop: value.loop === true,
    loopCrossfade: clampNumber(numberOr(value.loopCrossfade, 0.04), 0, 0.25, 0.04),
    ducking: normalizeSoundtrackDucking(value.ducking),
  };
}

function normalizeSoundtrackDucking(value: unknown): SoundtrackDuckingSettings {
  const raw = isRecord(value) ? value : {};
  return {
    enabled: raw.enabled === true,
    amountDb: clampNumber(numberOr(raw.amountDb, 10), 0, 24, 10),
    thresholdDb: clampNumber(numberOr(raw.thresholdDb, -36), -60, -6, -36),
    attack: clampNumber(numberOr(raw.attack, 0.08), 0.01, 1, 0.08),
    release: clampNumber(numberOr(raw.release, 0.4), 0.02, 3, 0.4),
  };
}

function displayNameForAsset(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "Imported footage";
  return trimmed.replace(/\.[^/.]+$/, "");
}

function normalizeAnchor(value: unknown): { x: number; y: number } {
  const raw = isRecord(value) ? value : {};
  return {
    x: clampNumber(numberOr(raw.x, 0.5), 0, 1, 0.5),
    y: clampNumber(numberOr(raw.y, 0.5), 0, 1, 0.5),
  };
}

function normalizeCrop(value: unknown): CropRect {
  const raw = isRecord(value) ? value : {};
  const x = clampNumber(numberOr(raw.x, 0), 0, 0.95, 0);
  const y = clampNumber(numberOr(raw.y, 0), 0, 0.95, 0);
  const width = clampNumber(numberOr(raw.width, 1), 0.05, 1 - x, 1);
  const height = clampNumber(numberOr(raw.height, 1), 0.05, 1 - y, 1);
  return { x, y, width, height };
}

function normalizeBlendMode(value: unknown): LayerBlendMode {
  return value === "multiply" || value === "screen" || value === "add" || value === "overlay" ? value : "normal";
}

function normalizeLayerColor(value: unknown): LayerColorAdjustments {
  const raw = isRecord(value) ? value : {};
  return {
    brightness: clampNumber(numberOr(raw.brightness, 0), -1, 1, 0),
    contrast: clampNumber(numberOr(raw.contrast, 0), -1, 1, 0),
    saturation: clampNumber(numberOr(raw.saturation, 0), -1, 1, 0),
    hue: clampNumber(numberOr(raw.hue, 0), -180, 180, 0),
    temperature: clampNumber(numberOr(raw.temperature, 0), -1, 1, 0),
    tint: clampNumber(numberOr(raw.tint, 0), -1, 1, 0),
    highlights: clampNumber(numberOr(raw.highlights, 0), -1, 1, 0),
    shadows: clampNumber(numberOr(raw.shadows, 0), -1, 1, 0),
    vignette: clampNumber(numberOr(raw.vignette, 0), 0, 1, 0),
    grain: clampNumber(numberOr(raw.grain, 0), 0, 1, 0),
    sharpen: clampNumber(numberOr(raw.sharpen, 0), 0, 1, 0),
    enabled: raw.enabled !== false,
  };
}

function normalizeAsset(asset: MediaAssetRecord, id: string): MediaAssetRecord {
  const audio = asset.audio ?? {
    status: "unknown" as const,
    codec: null,
    channels: null,
    sampleRate: null,
    startTime: 0,
  };
  return {
    ...asset,
    id: typeof asset.id === "string" ? asset.id : id,
    name: typeof asset.name === "string" ? asset.name : "Imported footage",
    mimeType: typeof asset.mimeType === "string" ? asset.mimeType : "video/mp4",
    size: Math.max(0, numberOr(asset.size, 0)),
    width: Math.max(1, numberOr(asset.width, 1)),
    height: Math.max(1, numberOr(asset.height, 1)),
    duration: Math.max(0.1, numberOr(asset.duration, 0.1)),
    storageKey: typeof asset.storageKey === "string" ? asset.storageKey : makeId("blob"),
    mediaType: asset.mediaType === "audio" || String(asset.mimeType ?? "").startsWith("audio/") ? "audio" : "video",
    audio: {
      ...audio,
      status: audio.status ?? "unknown",
      codec: audio.codec ?? null,
      channels: audio.channels ?? null,
      sampleRate: audio.sampleRate ?? null,
      startTime: numberOr(audio.startTime, 0),
    },
    frameRate: asset.frameRate ?? null,
    isVariableFrameRate: asset.isVariableFrameRate === true,
    videoStartTime: numberOr(asset.videoStartTime, 0),
  };
}

function isProjectShape(value: Record<string, unknown>): boolean {
  return typeof value.id === "string"
    && typeof value.name === "string"
    && isRecord(value.canvas)
    && isFiniteNumber(value.canvas.width)
    && isFiniteNumber(value.canvas.height)
    && isFiniteNumber(value.canvas.fps)
    && isFiniteNumber(value.canvas.duration)
    && typeof value.canvas.background === "string"
    && Array.isArray(value.layers)
    && isRecord(value.assets)
    && isRecord(value.timeline)
    && isFiniteNumber(value.timeline.inPoint)
    && isFiniteNumber(value.timeline.outPoint)
    && isRecord(value.metadata)
    && isFiniteNumber(value.metadata.createdAt)
    && isFiniteNumber(value.metadata.updatedAt);
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clampNumber(value: number, min: number, max: number, fallback: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : fallback));
}
