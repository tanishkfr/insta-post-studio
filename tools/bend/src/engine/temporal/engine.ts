import type { BendLayer, BendProject, ChannelDelayEffect, FrameFeedbackEffect, MotionEchoEffect, TemporalEffectInstance, TimeSliceEffect } from "../core/types";
import { evaluateAnimatedLayer } from "../animation/engine";
import { defaultCrop, defaultLayerColor, defaultTransform } from "../core/project";
import { createDefaultMask } from "../core/mask";
import { layerStartAt } from "../core/timeline";
import { PixiBendRenderer } from "../render/pixiRenderer";
import { isSupportedTemporalStack, motionEchoSampleTimes, offsetProjectTime, seededUnit, sourceTimeForTemporalSample, temporalStackSignature, timeSliceSampleTime } from "./time";

export type TemporalFrame = HTMLCanvasElement;
export type TemporalSourceSampler = (layer: BendLayer, projectTime: number, signal?: AbortSignal) => Promise<TemporalFrame>;

interface FeedbackCheckpoint {
  frameIndex: number;
  canvas: TemporalFrame;
}

interface FeedbackState {
  signature: string;
  frameIndex: number;
  frame: TemporalFrame | null;
  checkpoints: FeedbackCheckpoint[];
}

interface ProceduralRendererState {
  renderer: PixiBendRenderer;
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
}

/**
 * Temporal evaluation is deliberately separate from the Pixi compositor.
 * Source frames are sampled into a bounded canvas cache, effects are evaluated
 * from explicit composition timestamps, and the resulting one-frame canvas is
 * handed back to Pixi as a normal texture. This keeps preview and export on
 * the same effect contract without persisting decoded frames in a project.
 */
export class TemporalEngine {
  private readonly rawFrames = new BoundedCanvasCache(72, 192 * 1024 * 1024);
  private readonly signatures = new Map<string, string>();
  private readonly feedbackStates = new Map<string, FeedbackState>();
  private readonly proceduralRenderers = new Map<string, ProceduralRendererState>();
  private projectId: string | null = null;
  private renderResolution = 1;
  private previewSafety = false;

  /**
   * Interactive safety net for pathological nested stacks. It bounds how many
   * samples a preview may take per frame, but never changes project data or the
   * export engine (which stays on the full stack). The editor surfaces this as
   * a bounded heavy preview.
   */
  setPreviewSafety(enabled: boolean): void {
    if (this.previewSafety === enabled) return;
    this.previewSafety = enabled;
    this.invalidateAll();
  }

  /** Draft preview lowers the backing resolution without changing timing. */
  setRenderResolution(resolution: number): void {
    const next = Math.min(1, Math.max(0.25, resolution));
    if (Math.abs(next - this.renderResolution) < 0.001) return;
    this.renderResolution = next;
    this.disposeProceduralRenderers();
    this.invalidateAll();
  }

  async prepareFrame(options: {
    project: BendProject;
    time: number;
    sampleVideo?: TemporalSourceSampler;
    signal?: AbortSignal;
  }): Promise<Record<string, TemporalFrame>> {
    if (this.projectId !== options.project.id) {
      const previousProject = this.projectId;
      this.invalidateAll();
      if (previousProject !== null) this.disposeProceduralRenderers();
      this.projectId = options.project.id;
    }
    const frames: Record<string, TemporalFrame> = {};
    for (const layer of options.project.layers) {
      const enabledEffects = layer.effects.filter((effect) => effect.enabled);
      if (enabledEffects.length === 0 || !layer.visible) continue;
      const support = isSupportedTemporalStack(enabledEffects);
      if (!support.supported) throw new Error(support.reason);
      const signature = temporalStackSignature(options.project, layer);
      if (this.signatures.get(layer.id) !== signature) {
        this.invalidateLayer(layer.id);
        this.signatures.set(layer.id, signature);
      }
      frames[layer.id] = await this.evaluateStack(options.project, layer, options.time, layer.effects, options.sampleVideo, options.signal);
    }
    return frames;
  }

  invalidateLayer(layerId: string): void {
    this.rawFrames.deletePrefix(`${layerId}|`);
    this.feedbackStates.delete(layerId);
    this.signatures.delete(layerId);
    const procedural = this.proceduralRenderers.get(layerId);
    procedural?.renderer.destroy();
    this.proceduralRenderers.delete(layerId);
  }

  invalidateAll(): void {
    this.rawFrames.clear();
    this.signatures.clear();
    this.feedbackStates.clear();
  }

  dispose(): void {
    this.invalidateAll();
    this.disposeProceduralRenderers();
    this.projectId = null;
  }

  private disposeProceduralRenderers(): void {
    for (const state of this.proceduralRenderers.values()) state.renderer.destroy();
    this.proceduralRenderers.clear();
  }

  private async evaluateStack(project: BendProject, layer: BendLayer, time: number, effects: TemporalEffectInstance[], sampleVideo: TemporalSourceSampler | undefined, signal?: AbortSignal): Promise<TemporalFrame> {
    const memo = new Map<string, TemporalFrame>();
    return this.evaluateThrough(project, layer, time, effects, effects.length, memo, sampleVideo, signal);
  }

  private async evaluateThrough(project: BendProject, layer: BendLayer, time: number, effects: TemporalEffectInstance[], count: number, memo: Map<string, TemporalFrame>, sampleVideo: TemporalSourceSampler | undefined, signal?: AbortSignal): Promise<TemporalFrame> {
    throwIfAborted(signal);
    const key = `${count}|${time.toFixed(6)}`;
    const memoized = memo.get(key);
    if (memoized) return memoized;
    if (count <= 0) {
      const raw = await this.sampleRaw(project, layer, time, sampleVideo, signal);
      memo.set(key, raw);
      return raw;
    }
    const animatedLayer = evaluateAnimatedLayer(project, layer, time);
    const effect = animatedLayer.effects[count - 1] ?? effects[count - 1];
    let output: TemporalFrame;
    if (!effect.enabled) {
      output = await this.evaluateThrough(project, layer, time, effects, count - 1, memo, sampleVideo, signal);
    } else if (effect.id === "motion-echo") {
      output = await this.renderMotionEcho(project, layer, time, effect, count - 1, effects, memo, sampleVideo, signal);
    } else if (effect.id === "time-slice") {
      output = await this.renderTimeSlice(project, layer, time, effect, count - 1, effects, memo, sampleVideo, signal);
    } else if (effect.id === "channel-delay") {
      output = await this.renderChannelDelay(project, layer, time, effect, count - 1, effects, memo, sampleVideo, signal);
    } else {
      output = await this.renderFrameFeedback(project, layer, time, effect, count - 1, effects, sampleVideo, signal);
    }
    memo.set(key, output);
    return output;
  }

  private async sampleRaw(project: BendProject, layer: BendLayer, time: number, sampleVideo: TemporalSourceSampler | undefined, signal?: AbortSignal): Promise<TemporalFrame> {
    const sourceTime = sourceTimeForTemporalSample(layer, time);
    const key = `${layer.id}|${sourceTime.toFixed(5)}`;
    const cached = this.rawFrames.get(key);
    if (cached) return cached;
    throwIfAborted(signal);
    const source = layer.kind === "video"
      ? await (sampleVideo ? sampleVideo(layer, time, signal) : Promise.reject(new Error("BEND could not sample the video source for a temporal effect.")))
      : await this.sampleProcedural(project, layer, time, signal);
    const canvas = cloneCanvas(source);
    this.rawFrames.set(key, canvas);
    return canvas;
  }

  private async sampleProcedural(project: BendProject, layer: BendLayer, time: number, signal?: AbortSignal): Promise<TemporalFrame> {
    throwIfAborted(signal);
    const sampleScale = this.previewSafety ? 0.5 : 1;
    const width = Math.max(1, Math.round(project.canvas.width * sampleScale));
    const height = Math.max(1, Math.round(project.canvas.height * sampleScale));
    let state = this.proceduralRenderers.get(layer.id);
    if (!state || state.width !== width || state.height !== height) {
      state?.renderer.destroy();
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const renderer = new PixiBendRenderer({ canvas, width, height, resolution: this.renderResolution });
      await renderer.init();
      state = { renderer, canvas, width, height };
      this.proceduralRenderers.set(layer.id, state);
    }
    const baseLayer = structuredClone(layer);
    // Temporal sampling records the raw source, not its post-processed look.
    // Transform, crop, color, mask, and layer blending are applied once to the
    // resulting temporal frame by the shared Pixi compositor.
    baseLayer.effects = [];
    baseLayer.mask = createDefaultMask();
    baseLayer.crop = defaultCrop();
    baseLayer.color = defaultLayerColor();
    baseLayer.blendMode = "normal";
    baseLayer.transform = defaultTransform();
    baseLayer.animation = {
      version: 1,
      tracks: baseLayer.animation.tracks.filter((track) => track.property.startsWith("generator.")),
    };
    if (baseLayer.kind === "video") baseLayer.wave.enabled = false;
    state.renderer.render({ ...project, layers: [baseLayer], canvas: { ...project.canvas, width, height } }, time);
    return cloneCanvas(state.canvas);
  }

  private async renderMotionEcho(project: BendProject, layer: BendLayer, time: number, effect: MotionEchoEffect, prefixCount: number, effects: TemporalEffectInstance[], memo: Map<string, TemporalFrame>, sampleVideo: TemporalSourceSampler | undefined, signal?: AbortSignal): Promise<TemporalFrame> {
    const current = await this.evaluateThrough(project, layer, time, effects, prefixCount, memo, sampleVideo, signal);
    if (effect.echoCount <= 0 || effect.opacity <= 0) return cloneCanvas(current);
    const output = cloneCanvas(current);
    const context = getContext(output);
    const echoCount = this.previewSafety ? Math.min(2, Math.max(1, Math.round(effect.echoCount))) : effect.echoCount;
    const times = motionEchoSampleTimes(layer, time, echoCount, effect.timeSpacing, effect.direction, effect.temporalRange);
    for (let index = times.length - 1; index >= 0; index -= 1) {
      throwIfAborted(signal);
      const sample = await this.evaluateThrough(project, layer, times[index], effects, prefixCount, memo, sampleVideo, signal);
      const echoIndex = times.length - index;
      context.save();
      context.globalAlpha = effect.opacity * Math.pow(effect.decay, echoIndex);
      context.globalCompositeOperation = canvasBlendMode(effect.blendMode);
      context.translate(output.width * effect.offsetX * echoIndex, output.height * effect.offsetY * echoIndex);
      context.drawImage(sample, 0, 0, output.width, output.height);
      context.globalCompositeOperation = "source-atop";
      context.fillStyle = effect.tint;
      context.globalAlpha *= 0.18;
      context.fillRect(-output.width, -output.height, output.width * 3, output.height * 3);
      context.restore();
    }
    return output;
  }

  private async renderTimeSlice(project: BendProject, layer: BendLayer, time: number, effect: TimeSliceEffect, prefixCount: number, effects: TemporalEffectInstance[], memo: Map<string, TemporalFrame>, sampleVideo: TemporalSourceSampler | undefined, signal?: AbortSignal): Promise<TemporalFrame> {
    const current = await this.evaluateThrough(project, layer, time, effects, prefixCount, memo, sampleVideo, signal);
    const output = cloneCanvas(current);
    const context = getContext(output);
    const count = Math.max(2, Math.min(this.previewSafety ? 4 : 48, Math.round(effect.sliceCount)));
    const sliceWidth = Math.min(1, Math.max(0.2, effect.sliceWidth));
    for (let index = 0; index < count; index += 1) {
      throwIfAborted(signal);
      const position = (index + 0.5) / count;
      const jitter = (seededUnit(effect.seed, index) * 2 - 1) * effect.sliceJitter * effect.temporalOffset;
      const sliceTime = timeSliceSampleTime(layer, time, position, effect.temporalOffset + jitter, effect.direction, effect.offsetCurve, effect.motionSpeed);
      const sample = await this.evaluateThrough(project, layer, sliceTime, effects, prefixCount, memo, sampleVideo, signal);
      const feather = Math.min(0.45, effect.blend * 0.5);
      if (effect.orientation === "horizontal") {
        const sliceHeight = output.height / count;
        const sourceY = index * (sample.height / count);
        const inset = (1 - sliceWidth) * sliceHeight * 0.5;
        context.save();
        context.globalAlpha = 1;
        context.globalCompositeOperation = "source-over";
        context.drawImage(sample, 0, sourceY, sample.width, sample.height / count, 0, index * sliceHeight + inset, output.width, sliceHeight - inset * 2);
        if (feather > 0) drawSliceFeather(context, output, 0, index * sliceHeight, output.width, sliceHeight, feather, true);
        context.restore();
      } else {
        const sliceCanvasWidth = output.width / count;
        const sourceX = index * (sample.width / count);
        const inset = (1 - sliceWidth) * sliceCanvasWidth * 0.5;
        context.save();
        context.globalCompositeOperation = "source-over";
        context.drawImage(sample, sourceX, 0, sample.width / count, sample.height, index * sliceCanvasWidth + inset, 0, sliceCanvasWidth - inset * 2, output.height);
        if (feather > 0) drawSliceFeather(context, output, index * sliceCanvasWidth, 0, sliceCanvasWidth, output.height, feather, false);
        context.restore();
      }
    }
    return output;
  }

  private async renderChannelDelay(project: BendProject, layer: BendLayer, time: number, effect: ChannelDelayEffect, prefixCount: number, effects: TemporalEffectInstance[], memo: Map<string, TemporalFrame>, sampleVideo: TemporalSourceSampler | undefined, signal?: AbortSignal): Promise<TemporalFrame> {
    const current = await this.evaluateThrough(project, layer, time, effects, prefixCount, memo, sampleVideo, signal);
    if (effect.intensity <= 0 || (effect.redDelay === 0 && effect.greenDelay === 0 && effect.blueDelay === 0)) return cloneCanvas(current);
    // Keep source requests sequential. Preview sampling may use one shared
    // HTMLVideoElement, and concurrent seeks on that element are not safe.
    const red = await this.evaluateThrough(project, layer, offsetProjectTime(layer, time, effect.redDelay, effect.temporalClamp), effects, prefixCount, memo, sampleVideo, signal);
    const green = await this.evaluateThrough(project, layer, offsetProjectTime(layer, time, effect.greenDelay, effect.temporalClamp), effects, prefixCount, memo, sampleVideo, signal);
    const blue = await this.evaluateThrough(project, layer, offsetProjectTime(layer, time, effect.blueDelay, effect.temporalClamp), effects, prefixCount, memo, sampleVideo, signal);
    return combineChannels(current, red, green, blue, effect);
  }

  private async renderFrameFeedback(project: BendProject, layer: BendLayer, time: number, effect: FrameFeedbackEffect, prefixCount: number, effects: TemporalEffectInstance[], sampleVideo: TemporalSourceSampler | undefined, signal?: AbortSignal): Promise<TemporalFrame> {
    // A stateful replay pass needs history that can multiply into thousands of
    // upstream samples. Bound interactive preview by drawing the current frame;
    // export keeps the full deterministic feedback replay.
    if (this.previewSafety) {
      const current = await this.evaluateThrough(project, layer, time, effects, prefixCount, new Map(), sampleVideo, signal);
      return cloneCanvas(current);
    }
    const signature = temporalStackSignature(project, layer);
    let state = this.feedbackStates.get(layer.id);
    if (!state || state.signature !== signature) {
      state = { signature, frameIndex: -1, frame: null, checkpoints: [] };
      this.feedbackStates.set(layer.id, state);
    }
    const targetFrame = Math.max(0, Math.round((offsetProjectTime(layer, time, 0) - layerStartAt(layer)) * Math.max(1, project.canvas.fps)));
    if (state.frameIndex > targetFrame) {
      const checkpoint = [...state.checkpoints].reverse().find((candidate) => candidate.frameIndex <= targetFrame);
      if (checkpoint) {
        state.frameIndex = checkpoint.frameIndex;
        state.frame = cloneCanvas(checkpoint.canvas);
      } else {
        state.frameIndex = -1;
        state.frame = null;
      }
    }
    for (let frameIndex = state.frameIndex + 1; frameIndex <= targetFrame; frameIndex += 1) {
      throwIfAborted(signal);
      const frameTime = offsetProjectTime(layer, layerStartAt(layer) + frameIndex / Math.max(1, project.canvas.fps), 0);
      const current = await this.evaluateThrough(project, layer, frameTime, effects, prefixCount, new Map(), sampleVideo, signal);
      const frameEffect = (evaluateAnimatedLayer(project, layer, frameTime).effects[prefixCount] ?? effect) as FrameFeedbackEffect;
      state.frame = renderFeedbackFrame(current, state.frame, frameEffect, frameIndex);
      state.frameIndex = frameIndex;
      if (frameIndex % 30 === 0) state.checkpoints = [...state.checkpoints, { frameIndex, canvas: cloneCanvas(state.frame) }].slice(-8);
    }
    if (!state.frame) {
      const current = await this.evaluateThrough(project, layer, time, effects, prefixCount, new Map(), sampleVideo, signal);
      state.frame = cloneCanvas(current);
      state.frameIndex = targetFrame;
    }
    return cloneCanvas(state.frame);
  }
}

function canvasBytes(value: TemporalFrame): number {
  const width = Number.isFinite(value.width) ? value.width : 1;
  const height = Number.isFinite(value.height) ? value.height : 1;
  return Math.max(1, width * height * 4);
}

export class BoundedCanvasCache {
  private readonly entries = new Map<string, TemporalFrame>();
  private totalBytes = 0;

  constructor(private readonly limit: number, private readonly maxBytes = Number.POSITIVE_INFINITY) {}

  get(key: string): TemporalFrame | undefined {
    const value = this.entries.get(key);
    if (!value) return undefined;
    this.entries.delete(key);
    this.entries.set(key, value);
    return value;
  }

  set(key: string, value: TemporalFrame): void {
    const existing = this.entries.get(key);
    if (existing) this.totalBytes -= canvasBytes(existing);
    this.entries.delete(key);
    this.entries.set(key, value);
    this.totalBytes += canvasBytes(value);
    while (this.entries.size > this.limit || (this.totalBytes > this.maxBytes && this.entries.size > 1)) {
      const oldestKey = this.entries.keys().next().value as string | undefined;
      if (oldestKey === undefined || oldestKey === key) break;
      const oldest = this.entries.get(oldestKey);
      if (oldest) this.totalBytes -= canvasBytes(oldest);
      this.entries.delete(oldestKey);
    }
  }

  deletePrefix(prefix: string): void {
    for (const [key, value] of this.entries) {
      if (key.startsWith(prefix)) {
        this.totalBytes -= canvasBytes(value);
        this.entries.delete(key);
      }
    }
  }

  clear(): void {
    this.entries.clear();
    this.totalBytes = 0;
  }

  get size(): number {
    return this.entries.size;
  }

  get bytes(): number {
    return this.totalBytes;
  }
}

function renderFeedbackFrame(current: TemporalFrame, previous: TemporalFrame | null, effect: FrameFeedbackEffect, frameIndex: number): TemporalFrame {
  const output = cloneCanvas(current);
  if (!previous || effect.feedbackAmount <= 0) return output;
  const context = getContext(output);
  context.save();
  context.globalCompositeOperation = canvasBlendMode(effect.blendMode);
  context.globalAlpha = effect.feedbackAmount * effect.decay;
  context.translate(output.width / 2 + output.width * effect.translationX, output.height / 2 + output.height * effect.translationY);
  context.rotate((effect.rotation * Math.PI) / 180);
  context.scale(effect.scale, effect.scale);
  if (effect.colorShift > 0) context.filter = `hue-rotate(${effect.colorShift * 180}deg)`;
  context.drawImage(previous, -output.width / 2, -output.height / 2, output.width, output.height);
  context.restore();
  if (effect.noise > 0) {
    const noise = getContext(output);
    noise.save();
    noise.globalAlpha = Math.min(0.12, effect.noise * 0.12) * (0.5 + seededUnit(String(frameIndex), 1));
    noise.globalCompositeOperation = "screen";
    noise.fillStyle = "#F5F3EF";
    for (let index = 0; index < 12; index += 1) noise.fillRect(seededUnit(String(frameIndex), index) * output.width, seededUnit(String(frameIndex * 3), index) * output.height, 1 + output.width * 0.003, 1 + output.height * 0.003);
    noise.restore();
  }
  return output;
}

function combineChannels(current: TemporalFrame, red: TemporalFrame, green: TemporalFrame, blue: TemporalFrame, effect: ChannelDelayEffect): TemporalFrame {
  const output = createCanvas(current.width, current.height);
  const base = getContext(current).getImageData(0, 0, current.width, current.height);
  const r = getContext(red).getImageData(0, 0, current.width, current.height);
  const g = getContext(green).getImageData(0, 0, current.width, current.height);
  const b = getContext(blue).getImageData(0, 0, current.width, current.height);
  const result = new ImageData(current.width, current.height);
  const offset = Math.round(effect.spatialOffset * current.width);
  for (let y = 0; y < current.height; y += 1) {
    for (let x = 0; x < current.width; x += 1) {
      const index = (y * current.width + x) * 4;
      const sourceX = Math.min(current.width - 1, Math.max(0, x + offset));
      const sourceIndex = (y * current.width + sourceX) * 4;
      const alpha = base.data[index + 3];
      result.data[index] = mixChannel(base.data[index], r.data[sourceIndex], effect.intensity, effect.edgeBehavior === "transparent" && (x + offset < 0 || x + offset >= current.width));
      result.data[index + 1] = mixChannel(base.data[index + 1], g.data[sourceIndex + 1], effect.intensity, effect.edgeBehavior === "transparent" && (x + offset < 0 || x + offset >= current.width));
      result.data[index + 2] = mixChannel(base.data[index + 2], b.data[sourceIndex + 2], effect.intensity, effect.edgeBehavior === "transparent" && (x + offset < 0 || x + offset >= current.width));
      result.data[index + 3] = alpha;
    }
  }
  getContext(output).putImageData(result, 0, 0);
  return output;
}

function mixChannel(original: number, delayed: number, intensity: number, transparent: boolean): number {
  if (transparent) return Math.round(original * (1 - intensity));
  return Math.round(original * (1 - intensity) + delayed * intensity);
}

function drawSliceFeather(context: CanvasRenderingContext2D, canvas: TemporalFrame, x: number, y: number, width: number, height: number, feather: number, horizontal: boolean): void {
  const size = (horizontal ? height : width) * feather;
  const gradient = horizontal
    ? context.createLinearGradient(0, y, 0, y + height)
    : context.createLinearGradient(x, 0, x + width, 0);
  gradient.addColorStop(0, "rgba(245,243,239,0)");
  gradient.addColorStop(Math.min(0.5, size / Math.max(1, horizontal ? height : width)), "rgba(245,243,239,0.18)");
  gradient.addColorStop(1, "rgba(245,243,239,0)");
  context.save();
  context.globalCompositeOperation = "screen";
  context.globalAlpha = 0.16;
  context.fillStyle = gradient;
  context.fillRect(x, y, width, height);
  context.restore();
  void canvas;
}

function createCanvas(width: number, height: number): TemporalFrame {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

function cloneCanvas(source: CanvasImageSource & { width?: number; height?: number }): TemporalFrame {
  const width = source instanceof HTMLVideoElement ? source.videoWidth : source.width ?? 1;
  const height = source instanceof HTMLVideoElement ? source.videoHeight : source.height ?? 1;
  const canvas = createCanvas(width, height);
  getContext(canvas).drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function getContext(canvas: TemporalFrame): CanvasRenderingContext2D {
  const context = canvas.getContext("2d", { alpha: true, willReadFrequently: true });
  if (!context) throw new Error("BEND could not create a temporal canvas context.");
  return context;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("BEND temporal evaluation cancelled.", "AbortError");
}

function canvasBlendMode(mode: MotionEchoEffect["blendMode"]): GlobalCompositeOperation {
  return mode === "normal" ? "source-over" : mode;
}
