import { Application, Filter, GlProgram, Sprite, Texture, VideoSource } from "pixi.js";
import { directionVector } from "../effects/waveDisplacement";
import { maskIsActive, maskSignature, normalizeMask } from "../core/mask";
import { getLiquidResolution, LiquidSimulation } from "../generators/liquid";
import { PALETTE_COLORS, seedToNumber } from "../generators/signalField";
import { animationSignature, evaluateAnimatedLayer } from "../animation/engine";
import { getRenderableLayers, layerLocalTimeAt } from "../core/timeline";
import { FULL_CROP, getLayerAnchorPosition, getLayerContentDimensions } from "../core/transform";
import type { BendLayer, BendProject, FlowParams, LayerBlendMode, LiquidParams, ProceduralLayer, RefractionParams, SignalFieldParams, VideoLayer } from "../core/types";
import type { TemporalFrame } from "../temporal/engine";
import { renderMaskTexture } from "./maskTexture";
import { COLOR_GRADE_FRAGMENT, CROP_FRAGMENT, FILTER_VERTEX, FLOW_FRAGMENT, LAYER_BLEND_FRAGMENT, REFRACTION_FRAGMENT, SIGNAL_FIELD_FRAGMENT, TRANSITION_FRAGMENT, WAVE_DISPLACEMENT_FRAGMENT } from "./shaders";
import { resolveTransition, transitionStyleForClip } from "../transitions/transition";

type NumericUniforms = Record<string, number | number[]>;
type RenderableMedia = HTMLVideoElement | HTMLCanvasElement | OffscreenCanvas;

type BendFilter = Filter & {
  resources: {
    bendUniforms: { uniforms: NumericUniforms };
  };
};

type CropFilter = Filter & {
  resources: {
    bendUniforms: { uniforms: NumericUniforms };
  };
};

type ColorGradeFilter = Filter & {
  resources: { bendGrade: { uniforms: NumericUniforms } };
};

type TransitionFilter = Filter & {
  resources: { bendTransition: { uniforms: NumericUniforms } };
};

export interface RendererOptions {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  /** Backing-store scale. Preview draft uses 0.5; export always uses 1. */
  resolution?: number;
}

interface MaskState {
  sprite: Sprite;
  texture: Texture;
  signature: string;
}

const LAYER_BLEND_MODES: Record<LayerBlendMode, number> = {
  normal: 0,
  multiply: 1,
  screen: 2,
  add: 3,
  overlay: 4,
};

type LayerBlendFilter = Filter & {
  resources: {
    bendBlend: { uniforms: { uMode: number } };
  };
};

export class PixiBendRenderer {
  private readonly app = new Application();
  private readonly canvas: HTMLCanvasElement;
  private width: number;
  private height: number;
  private resolution: number;
  private initialized = false;
  private readonly sprites = new Map<string, Sprite>();
  private readonly videoTextures = new Map<string, Texture>();
  private readonly videoSources = new Map<string, RenderableMedia>();
  private videoElements = new Map<string, HTMLVideoElement>();
  private videoFrames = new Map<string, RenderableMedia>();
  private temporalFrames = new Map<string, TemporalFrame>();
  private readonly temporalTextures = new Map<string, Texture>();
  private readonly temporalSources = new Map<string, TemporalFrame>();
  private readonly signalFilters = new Map<string, BendFilter>();
  private readonly flowFilters = new Map<string, BendFilter>();
  private readonly refractionFilters = new Map<string, BendFilter>();
  private readonly waveFilters = new Map<string, BendFilter>();
  private readonly cropFilters = new Map<string, CropFilter>();
  private readonly colorFilters = new Map<string, ColorGradeFilter>();
  private readonly transitionFilters = new Map<string, TransitionFilter>();
  private readonly liquidSimulations = new Map<string, LiquidSimulation>();
  private readonly liquidCanvases = new Map<string, HTMLCanvasElement>();
  private readonly liquidTextures = new Map<string, Texture>();
  private readonly liquidSignatures = new Map<string, string>();
  private readonly masks = new Map<string, MaskState>();
  private readonly blendFilters = new Map<string, LayerBlendFilter>();

  constructor(options: RendererOptions) {
    this.canvas = options.canvas;
    this.width = options.width;
    this.height = options.height;
    this.resolution = Math.min(1, Math.max(0.25, options.resolution ?? 1));
  }

  async init(): Promise<void> {
    await this.app.init({
      canvas: this.canvas,
      width: this.width,
      height: this.height,
      resolution: this.resolution,
      antialias: true,
      autoDensity: false,
      background: "#0C0C0E",
      backgroundAlpha: 1,
      preference: "webgl",
      preserveDrawingBuffer: true,
      useBackBuffer: true,
    });
    this.app.ticker.stop();
    this.initialized = true;
  }

  resize(width: number, height: number): void {
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));
    if (this.initialized) this.app.renderer.resize(this.width, this.height, this.resolution);
  }

  /** Change backing resolution without replacing the compositor or its cache. */
  setResolution(resolution: number): void {
    const next = Math.min(1, Math.max(0.25, resolution));
    if (Math.abs(next - this.resolution) < 0.001) return;
    this.resolution = next;
    if (this.initialized) this.app.renderer.resize(this.width, this.height, next);
  }

  setVideoElement(video: HTMLVideoElement | null, assetId = "default"): void {
    if (video) {
      this.setVideoElements({ ...Object.fromEntries(this.videoElements), [assetId]: video });
    } else {
      const next = Object.fromEntries(this.videoElements);
      delete next[assetId];
      this.setVideoElements(next);
    }
  }

  setVideoElements(elements: Record<string, HTMLVideoElement>): void {
    this.videoElements = new Map(Object.entries(elements));
  }

  setVideoFrames(frames: Record<string, RenderableMedia | null>): void {
    for (const [assetId, frame] of Object.entries(frames)) {
      if (frame) this.videoFrames.set(assetId, frame);
      else this.videoFrames.delete(assetId);
    }
  }

  setTemporalFrames(frames: Record<string, TemporalFrame | null>): void {
    this.temporalFrames = new Map(Object.entries(frames).filter((entry): entry is [string, TemporalFrame] => Boolean(entry[1])));
  }

  render(project: BendProject, time: number): void {
    if (!this.initialized) return;
    // FilterSystem keeps the last sampled texture source in a shared bind
    // group. Clear that ownership before a layer/asset can be destroyed.
    // Without this handoff Pixi reports a destroyed textureSource/textureSampler
    // during the next teardown even though the visible frame is correct.
    this.clearFilterInputBindings();
    const dipActive = project.layers.some((layer) => layer.kind === "video" && layer.transitionIn?.type === "dip-black" && Boolean(resolveTransition(project, layer, time)));
    this.app.renderer.background.color = dipActive ? "#000000" : project.canvas.background;
    if (this.app.renderer.width !== this.width || this.app.renderer.height !== this.height) {
      this.app.renderer.resize(this.width, this.height);
    }

    const activeIds = new Set(project.layers.map((layer) => layer.id));
    for (const [id, sprite] of this.sprites) {
      if (!activeIds.has(id)) this.removeSprite(id, sprite);
    }
    const usedVideoKeys = new Set(project.layers.filter((layer): layer is VideoLayer => layer.kind === "video").flatMap((layer) => [layer.id, layer.assetId]));
    for (const [sourceKey, texture] of this.videoTextures) {
      if (usedVideoKeys.has(sourceKey)) continue;
      texture.destroy(true);
      this.videoTextures.delete(sourceKey);
      this.videoSources.delete(sourceKey);
      this.videoFrames.delete(sourceKey);
    }
    const activeTemporalIds = new Set(project.layers.filter((layer) => layer.effects.some((effect) => effect.enabled)).map((layer) => layer.id));
    for (const [layerId, texture] of this.temporalTextures) {
      if (activeTemporalIds.has(layerId)) continue;
      texture.destroy(true);
      this.temporalTextures.delete(layerId);
      this.temporalSources.delete(layerId);
      this.temporalFrames.delete(layerId);
    }
    const activeMaskIds = new Set(project.layers.filter((layer) => maskIsActive(layer.mask)).map((layer) => layer.id));
    for (const [layerId] of this.masks) {
      if (activeMaskIds.has(layerId)) continue;
      const sprite = this.sprites.get(layerId);
      if (sprite) sprite.mask = null;
      this.removeMask(layerId);
    }

    const renderableLayers = new Set(getRenderableLayers(project, time).map((layer) => layer.id));
    project.layers.forEach((layer, index) => {
      const sprite = this.getOrCreateSprite(layer);
      const animatedLayer = evaluateAnimatedLayer(project, layer, time);
      this.app.stage.setChildIndex(sprite, index);
      sprite.visible = renderableLayers.has(layer.id);
      if (!sprite.visible) {
        this.applyLayerMask(project, animatedLayer, sprite);
        this.applyBlendMode(animatedLayer, sprite);
        return;
      }
      if (layer.kind === "procedural" && this.temporalFrames.has(layer.id)) {
        this.renderTemporalProcedural(project, animatedLayer as ProceduralLayer, sprite, time);
      } else if (layer.kind === "procedural") {
        this.renderProcedural(project, animatedLayer as ProceduralLayer, layer, time, sprite);
      } else {
        this.renderVideo(project, animatedLayer as VideoLayer, time, sprite);
        this.applyTransitionStyle(project, animatedLayer as VideoLayer, time, sprite);
      }
      this.applyLayerMask(project, animatedLayer, sprite);
      this.applyBlendMode(animatedLayer, sprite);
    });
    this.app.renderer.render({ container: this.app.stage, clear: true });
  }

  async toBlob(type = "image/png", quality?: number): Promise<Blob> {
    return await new Promise<Blob>((resolve, reject) => {
      this.canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("The browser could not capture the rendered canvas."));
      }, type, quality);
    });
  }

  getSurface(): HTMLCanvasElement {
    return this.canvas;
  }

  destroy(): void {
    this.clearFilterInputBindings();
    for (const [id, sprite] of this.sprites) this.removeSprite(id, sprite);
    for (const texture of this.videoTextures.values()) texture.destroy(true);
    for (const filter of this.signalFilters.values()) filter.destroy();
    for (const filter of this.flowFilters.values()) filter.destroy();
    for (const filter of this.refractionFilters.values()) filter.destroy();
    for (const filter of this.waveFilters.values()) filter.destroy();
    for (const filter of this.cropFilters.values()) filter.destroy();
    for (const filter of this.colorFilters.values()) filter.destroy();
    for (const filter of this.transitionFilters.values()) filter.destroy();
    for (const filter of this.blendFilters.values()) filter.destroy();
    for (const texture of this.liquidTextures.values()) texture.destroy(true);
    this.sprites.clear();
    this.videoTextures.clear();
    this.videoSources.clear();
    this.videoElements.clear();
    this.videoFrames.clear();
    this.temporalFrames.clear();
    for (const texture of this.temporalTextures.values()) texture.destroy(true);
    this.temporalTextures.clear();
    this.temporalSources.clear();
    for (const layerId of [...this.masks.keys()]) this.removeMask(layerId);
    this.signalFilters.clear();
    this.flowFilters.clear();
    this.refractionFilters.clear();
    this.waveFilters.clear();
    this.cropFilters.clear();
    this.colorFilters.clear();
    this.transitionFilters.clear();
    this.liquidSimulations.clear();
    this.liquidCanvases.clear();
    this.liquidTextures.clear();
    this.liquidSignatures.clear();
    if (this.initialized) {
      this.app.destroy({ removeView: false }, { children: true, texture: false, textureSource: false, context: true });
    }
    this.initialized = false;
  }

  private getOrCreateSprite(layer: BendLayer): Sprite {
    const existing = this.sprites.get(layer.id);
    if (existing) return existing;
    const sprite = new Sprite(layer.kind === "procedural" ? Texture.WHITE : Texture.EMPTY);
    sprite.anchor.set(0.5);
    this.sprites.set(layer.id, sprite);
    this.app.stage.addChild(sprite);
    return sprite;
  }

  private clearFilterInputBindings(): void {
    if (!this.initialized) return;
    const renderer = this.app.renderer as unknown as {
      filter?: {
        _globalFilterBindGroup?: { setResource: (resource: unknown, index: number) => void };
      };
    };
    const bindGroup = renderer.filter?._globalFilterBindGroup;
    if (!bindGroup) return;
    const source = Texture.EMPTY.source as unknown as { style?: unknown };
    bindGroup.setResource(source, 1);
    bindGroup.setResource(source.style ?? source, 2);
  }

  private removeSprite(id: string, sprite: Sprite): void {
    this.app.stage.removeChild(sprite);
    // Detach GPU bindings before disposing the layer resources. Pixi can keep
    // a filter or media texture bound until the next render tick otherwise,
    // which produces cleanup warnings during export teardown.
    sprite.filters = null;
    sprite.mask = null;
    sprite.texture = Texture.EMPTY;
    sprite.destroy({ children: true, texture: false, textureSource: false });
    this.sprites.delete(id);
    this.removeMask(id);
    const signal = this.signalFilters.get(id);
    const flow = this.flowFilters.get(id);
    const refraction = this.refractionFilters.get(id);
    const wave = this.waveFilters.get(id);
    const crop = this.cropFilters.get(id);
    const color = this.colorFilters.get(id);
    const transition = this.transitionFilters.get(id);
    const blend = this.blendFilters.get(id);
    signal?.destroy();
    flow?.destroy();
    refraction?.destroy();
    wave?.destroy();
    crop?.destroy();
    color?.destroy();
    transition?.destroy();
    this.signalFilters.delete(id);
    this.flowFilters.delete(id);
    this.refractionFilters.delete(id);
    this.waveFilters.delete(id);
    this.cropFilters.delete(id);
    this.colorFilters.delete(id);
    this.transitionFilters.delete(id);
    blend?.destroy();
    this.blendFilters.delete(id);
    const liquidTexture = this.liquidTextures.get(id);
    liquidTexture?.destroy(true);
    this.liquidTextures.delete(id);
    this.liquidSimulations.delete(id);
    this.liquidCanvases.delete(id);
    this.liquidSignatures.delete(id);
    const temporalTexture = this.temporalTextures.get(id);
    temporalTexture?.destroy(true);
    this.temporalTextures.delete(id);
    this.temporalSources.delete(id);
    this.temporalFrames.delete(id);
  }

  private renderProcedural(project: BendProject, layer: ProceduralLayer, sourceLayer: ProceduralLayer, time: number, sprite: Sprite): void {
    this.clearInactiveProceduralResources(layer.id, layer.generator.id);
    if (layer.generator.id === "liquid") {
      this.renderLiquid(project, sourceLayer, time, sprite, layer.generator);
      return;
    }
    sprite.texture = Texture.WHITE;
    this.applySpriteTransform(project, layer, sprite);
    const localTime = layerLocalTimeAt(layer, time);
    const filter = layer.generator.id === "signal-field"
      ? this.renderSignal(layer.generator, localTime, layer.id)
      : layer.generator.id === "flow"
        ? this.renderFlow(layer.generator, localTime, layer.id)
        : this.renderRefraction(layer.generator, localTime, layer.id);
    if (filter) filter.resources.bendUniforms.uniforms.uCrop = cropUniform(layer);
    sprite.filters = this.getLayerFilters(layer, filter ? [filter] : [], true, time);
  }

  private renderTemporalProcedural(project: BendProject, layer: ProceduralLayer, sprite: Sprite, time: number): void {
    const source = this.temporalFrames.get(layer.id);
    if (!source) {
      sprite.visible = false;
      return;
    }
    sprite.texture = this.getTemporalTexture(layer.id, source);
    this.applySpriteTransform(project, layer, sprite);
    sprite.filters = this.getLayerFilters(layer, [], false, time);
  }

  private clearInactiveProceduralResources(layerId: string, activeId: ProceduralLayer["generator"]["id"]): void {
    const filterEntries = [
      ["signal-field", this.signalFilters],
      ["flow", this.flowFilters],
      ["refraction", this.refractionFilters],
    ] as const;
    for (const [generatorId, filters] of filterEntries) {
      if (generatorId === activeId) continue;
      filters.get(layerId)?.destroy();
      filters.delete(layerId);
    }
    if (activeId !== "liquid") {
      this.liquidTextures.get(layerId)?.destroy(true);
      this.liquidTextures.delete(layerId);
      this.liquidSimulations.delete(layerId);
      this.liquidCanvases.delete(layerId);
    }
  }

  private renderSignal(params: SignalFieldParams, time: number, layerId: string): BendFilter {
    const filter = this.signalFilters.get(layerId) ?? createSignalFilter();
    this.signalFilters.set(layerId, filter);
    const uniforms = filter.resources.bendUniforms.uniforms;
    uniforms.uTime = time;
    uniforms.uSeed = seedToNumber(params.seed) * 100;
    uniforms.uSpeed = params.speed;
    uniforms.uIntensity = params.intensity;
    uniforms.uScale = params.scale;
    uniforms.uFrequency = params.frequency;
    uniforms.uPalette = paletteIndex(params.palette);
    return filter;
  }

  private renderFlow(params: FlowParams, time: number, layerId: string): BendFilter {
    const filter = this.flowFilters.get(layerId) ?? createFlowFilter();
    this.flowFilters.set(layerId, filter);
    const uniforms = filter.resources.bendUniforms.uniforms;
    uniforms.uTime = time;
    uniforms.uSeed = seedToNumber(params.seed) * 100;
    uniforms.uParticleDensity = params.particleDensity;
    uniforms.uFieldScale = params.fieldScale;
    uniforms.uFlowSpeed = params.flowSpeed;
    uniforms.uCurl = params.curl;
    uniforms.uTrailLength = params.trailLength;
    uniforms.uLineWidth = params.lineWidth;
    uniforms.uDispersion = params.dispersion;
    uniforms.uOpacity = params.opacity;
    uniforms.uPalette = paletteIndex(params.palette);
    return filter;
  }

  private renderRefraction(params: RefractionParams, time: number, layerId: string): BendFilter {
    const filter = this.refractionFilters.get(layerId) ?? createRefractionFilter();
    this.refractionFilters.set(layerId, filter);
    const uniforms = filter.resources.bendUniforms.uniforms;
    uniforms.uTime = time;
    uniforms.uSeed = seedToNumber(params.seed) * 100;
    uniforms.uRefraction = params.refraction;
    uniforms.uLightIntensity = params.lightIntensity;
    uniforms.uWaveScale = params.waveScale;
    uniforms.uDistortion = params.distortion;
    uniforms.uSpeed = params.speed;
    uniforms.uDirection = (params.direction * Math.PI) / 180;
    uniforms.uContrast = params.contrast;
    uniforms.uSoftness = params.softness;
    uniforms.uPalette = paletteIndex(params.palette);
    return filter;
  }

  private renderLiquid(project: BendProject, sourceLayer: ProceduralLayer, time: number, sprite: Sprite, params: LiquidParams): void {
    const layer = evaluateAnimatedLayer(project, sourceLayer, time) as ProceduralLayer;
    const resolution = getLiquidResolution(params.simulationQuality, Math.max(1, Math.round(this.width * this.resolution)), Math.max(1, Math.round(this.height * this.resolution)));
    const signature = JSON.stringify({ generator: sourceLayer.generator, animation: animationSignature(sourceLayer) });
    let simulation = this.liquidSimulations.get(layer.id);
    if (!simulation || simulation.width !== resolution.width || simulation.height !== resolution.height) {
      this.liquidTextures.get(layer.id)?.destroy(true);
      simulation = new LiquidSimulation(params, resolution.width, resolution.height);
      this.liquidSimulations.set(layer.id, simulation);
      this.liquidCanvases.set(layer.id, document.createElement("canvas"));
      this.liquidTextures.delete(layer.id);
      this.liquidSignatures.set(layer.id, signature);
    } else {
      simulation.setParams(params);
      if (this.liquidSignatures.get(layer.id) !== signature) {
        simulation.reset();
        this.liquidSignatures.set(layer.id, signature);
      }
    }
    const surface = this.liquidCanvases.get(layer.id) ?? document.createElement("canvas");
    this.liquidCanvases.set(layer.id, surface);
    simulation.advanceTo(layerLocalTimeAt(layer, time), (localTime) => {
      const evaluated = evaluateAnimatedLayer(project, sourceLayer, sourceLayer.timeline.start + localTime) as ProceduralLayer;
      return evaluated.generator.id === "liquid" ? evaluated.generator : params;
    });
    simulation.renderToCanvas(surface);
    let texture = this.liquidTextures.get(layer.id);
    if (!texture) {
      texture = Texture.from(surface, { updateFPS: 0 } as never);
      this.liquidTextures.set(layer.id, texture);
    } else {
      texture.source.update();
    }
    sprite.texture = texture;
    this.applySpriteTransform(project, layer, sprite);
    sprite.filters = this.getLayerFilters(layer, [], false, time);
  }

  private renderVideo(project: BendProject, layer: VideoLayer, time: number, sprite: Sprite): void {
    const temporalSource = this.temporalFrames.get(layer.id);
    const source = temporalSource
      ?? this.videoFrames.get(layer.id)
      ?? this.videoFrames.get(layer.assetId)
      ?? this.videoElements.get(layer.id)
      ?? this.videoElements.get(layer.assetId);
    if (!source) {
      sprite.visible = false;
      return;
    }
    const texture = temporalSource ? this.getTemporalTexture(layer.id, temporalSource) : this.getVideoTexture(layer.id, source);
    sprite.texture = texture;
    this.applySpriteTransform(project, layer, sprite);
    const filters: Filter[] = [];
    if (layer.wave.enabled) {
      const filter = this.waveFilters.get(layer.id) ?? createWaveFilter();
      this.waveFilters.set(layer.id, filter);
      const uniforms = filter.resources.bendUniforms.uniforms;
      const vector = directionVector(layer.wave.direction);
      uniforms.uTime = layerLocalTimeAt(layer, time);
      uniforms.uIntensity = layer.wave.intensity;
      uniforms.uFrequency = layer.wave.frequency;
      uniforms.uSpeed = layer.wave.speed;
      uniforms.uDirectionX = vector.x;
      uniforms.uDirectionY = vector.y;
      uniforms.uPhase = (layer.wave.phase * Math.PI) / 180;
      filters.push(filter);
    }
    sprite.filters = this.getLayerFilters(layer, filters, false, time);
    if (source instanceof HTMLVideoElement) this.videoTextures.get(layer.id)?.source.update();
  }

  private applySpriteTransform(project: BendProject, layer: BendLayer, sprite: Sprite): void {
    const dimensions = getLayerContentDimensions(project, layer);
    const anchor = layer.transform.anchor ?? { x: 0.5, y: 0.5 };
    sprite.anchor.set(anchor.x, anchor.y);
    sprite.width = Math.max(1, dimensions.width * layer.transform.scale);
    sprite.height = Math.max(1, dimensions.height * layer.transform.scale);
    sprite.scale.x = Math.abs(sprite.scale.x) * (layer.transform.flipX ? -1 : 1);
    sprite.scale.y = Math.abs(sprite.scale.y) * (layer.transform.flipY ? -1 : 1);
    const position = getLayerAnchorPosition(project, layer);
    sprite.position.set(position.x, position.y);
    sprite.rotation = (layer.transform.rotation * Math.PI) / 180;
    sprite.alpha = layer.transform.opacity;
  }

  /**
   * Layer compositing order:
   * source -> temporal effects -> spatial effect (wave) -> crop -> color ->
   * sprite transform -> mask -> layer blend/opacity -> stage.
   */
  private applyTransitionStyle(project: BendProject, layer: VideoLayer, time: number, sprite: Sprite): void {
    const style = transitionStyleForClip(project, layer, time);
    sprite.alpha = Math.min(1, Math.max(0, sprite.alpha * style.alphaFactor));
    if (Math.abs(style.scaleFactor - 1) > 0.0001) {
      sprite.scale.x *= style.scaleFactor;
      sprite.scale.y *= style.scaleFactor;
    }
    const current = sprite.filters ? [...sprite.filters] : [];
    let filter = this.transitionFilters.get(layer.id);
    if (!style.filter) {
      if (filter && current.includes(filter)) sprite.filters = current.filter((candidate) => candidate !== filter);
      return;
    }
    if (!filter) {
      filter = createTransitionFilter();
      this.transitionFilters.set(layer.id, filter);
    }
    const uniforms = filter.resources.bendTransition.uniforms;
    uniforms.uType = style.filter.type === "wipe" ? 0 : style.filter.type === "distortion" ? 1 : 2;
    uniforms.uProgress = style.filter.progress;
    const direction = style.filter.direction;
    uniforms.uDirection = direction === "left" ? [-1, 0] : direction === "right" ? [1, 0] : direction === "up" ? [0, -1] : [0, 1];
    uniforms.uIntensity = style.filter.intensity;
    uniforms.uTime = layerLocalTimeAt(layer, time);
    if (!current.includes(filter)) current.push(filter);
    sprite.filters = current;
  }

  private applyBlendMode(layer: BendLayer, sprite: Sprite): void {
    const mode = layer.blendMode && layer.blendMode in LAYER_BLEND_MODES ? layer.blendMode : "normal";
    sprite.blendMode = "normal";
    const existing = this.blendFilters.get(layer.id);
    if (mode === "normal") {
      if (existing && sprite.filters?.includes(existing)) sprite.filters = sprite.filters.filter((filter) => filter !== existing);
      return;
    }
    let filter = existing;
    if (!filter) {
      filter = createLayerBlendFilter();
      this.blendFilters.set(layer.id, filter);
    }
    filter.resources.bendBlend.uniforms.uMode = LAYER_BLEND_MODES[mode];
    const current = sprite.filters ? [...sprite.filters] : [];
    if (!current.includes(filter)) current.push(filter);
    sprite.filters = current;
  }

  private applyLayerMask(project: BendProject, layer: BendLayer, sprite: Sprite): void {
    const mask = normalizeMask(layer.mask);
    if (!maskIsActive(mask)) {
      sprite.mask = null;
      this.removeMask(layer.id);
      return;
    }
    let state = this.masks.get(layer.id);
    if (!state) {
      const canvas = document.createElement("canvas");
      const texture = Texture.from(canvas, { updateFPS: 0 } as never);
      const maskSprite = new Sprite(texture);
      maskSprite.anchor.set(0.5);
      this.app.stage.addChild(maskSprite);
      state = { sprite: maskSprite, texture, signature: "" };
      this.masks.set(layer.id, state);
    }
    const signature = maskSignature(mask);
    if (state.signature !== signature) {
      const nextCanvas = renderMaskTexture(mask);
      state.texture.destroy(true);
      state.texture = Texture.from(nextCanvas, { updateFPS: 0 } as never);
      state.sprite.texture = state.texture;
      state.signature = signature;
    }
    const maskSprite = state.sprite;
    maskSprite.visible = true;
    maskSprite.alpha = 1;
    maskSprite.position.set(mask.x * project.canvas.width, mask.y * project.canvas.height);
    maskSprite.width = Math.max(1, mask.width * project.canvas.width);
    maskSprite.height = Math.max(1, mask.height * project.canvas.height);
    maskSprite.rotation = (mask.rotation * Math.PI) / 180;
    sprite.mask = maskSprite;
  }

  private removeMask(layerId: string): void {
    const state = this.masks.get(layerId);
    if (!state) return;
    this.app.stage.removeChild(state.sprite);
    state.sprite.destroy({ children: false, texture: false, textureSource: false });
    state.texture.destroy(true);
    this.masks.delete(layerId);
  }

  private getLayerFilters(layer: BendLayer, baseFilters: Filter[], cropHandledInGenerator = false, time = layer.timeline.start): Filter[] | null {
    const filters = [...baseFilters];
    const crop = layer.crop ?? FULL_CROP;
    if (!cropHandledInGenerator && !isFullCrop(crop)) {
      const filter = this.cropFilters.get(layer.id) ?? createCropFilter();
      this.cropFilters.set(layer.id, filter);
      filter.resources.bendUniforms.uniforms.uCrop = [crop.x, crop.y, crop.width, crop.height];
      filters.push(filter);
    }
    const color = layer.color;
    const colorActive = color?.enabled && [
      color.brightness, color.contrast, color.saturation, color.hue,
      color.temperature, color.tint, color.highlights, color.shadows,
      color.vignette, color.grain, color.sharpen,
    ].some((value) => Math.abs(value ?? 0) > 0.0001);
    if (colorActive) {
      const filter = this.colorFilters.get(layer.id) ?? createColorGradeFilter();
      this.colorFilters.set(layer.id, filter);
      const uniforms = filter.resources.bendGrade.uniforms;
      uniforms.uBrightness = color.brightness;
      uniforms.uContrast = color.contrast;
      uniforms.uSaturation = color.saturation;
      uniforms.uHue = (color.hue * Math.PI) / 180;
      uniforms.uTemperature = color.temperature;
      uniforms.uTint = color.tint;
      uniforms.uHighlights = color.highlights;
      uniforms.uShadows = color.shadows;
      uniforms.uVignette = color.vignette;
      uniforms.uGrain = color.grain;
      uniforms.uSharpen = color.sharpen;
      uniforms.uTime = layerLocalTimeAt(layer, time);
      uniforms.uTexel = [1 / Math.max(1, this.width), 1 / Math.max(1, this.height)];
      filters.push(filter);
    } else {
      const stale = this.colorFilters.get(layer.id);
      if (stale && filters.includes(stale)) filters.splice(filters.indexOf(stale), 1);
    }
    return filters.length > 0 ? filters : null;
  }

  private getVideoTexture(sourceKey: string, source: RenderableMedia): Texture {
    const existing = this.videoTextures.get(sourceKey);
    if (existing && this.videoSources.get(sourceKey) === source) {
      existing.source.update();
      return existing;
    }
    existing?.destroy(true);
    // Pixi's default video texture auto-plays the media element. Preview
    // playback is owned by CanvasStage (including pause/seek gating), so an
    // extra hidden play() would race pause() and surface unhandled AbortErrors
    // when layers are duplicated or removed. Upload frames on demand instead.
    const texture = source instanceof HTMLVideoElement
      ? new Texture({ source: new VideoSource({ resource: source, autoPlay: false, autoLoad: true, updateFPS: 0 }) })
      : Texture.from(source as never, { updateFPS: 0 } as never);
    this.videoTextures.set(sourceKey, texture);
    this.videoSources.set(sourceKey, source);
    return texture;
  }

  private getTemporalTexture(layerId: string, source: TemporalFrame): Texture {
    const existing = this.temporalTextures.get(layerId);
    if (existing && this.temporalSources.get(layerId) === source) {
      existing.source.update();
      return existing;
    }
    existing?.destroy(true);
    const texture = Texture.from(source, { updateFPS: 0 } as never);
    this.temporalTextures.set(layerId, texture);
    this.temporalSources.set(layerId, source);
    return texture;
  }
}

function isFullCrop(crop: { x: number; y: number; width: number; height: number }): boolean {
  return Math.abs(crop.x) < 0.0001 && Math.abs(crop.y) < 0.0001 && Math.abs(crop.width - 1) < 0.0001 && Math.abs(crop.height - 1) < 0.0001;
}

function cropUniform(layer: BendLayer): number[] {
  const crop = layer.crop ?? FULL_CROP;
  return [crop.x, crop.y, crop.width, crop.height];
}

function createLayerBlendFilter(): LayerBlendFilter {
  return new Filter({
    glProgram: new GlProgram({ vertex: FILTER_VERTEX, fragment: LAYER_BLEND_FRAGMENT }),
    blendRequired: true,
    resources: {
      bendBlend: {
        uMode: { value: 0, type: "f32" },
      },
    },
  }) as unknown as LayerBlendFilter;
}

function createCropFilter(): CropFilter {
  return new Filter({
    glProgram: new GlProgram({ vertex: FILTER_VERTEX, fragment: CROP_FRAGMENT }),
    resources: {
      bendUniforms: {
        uCrop: { value: [0, 0, 1, 1], type: "vec4<f32>" },
      },
    },
  }) as unknown as CropFilter;
}

function createSignalFilter(): BendFilter {
  return new Filter({
    glProgram: new GlProgram({ vertex: FILTER_VERTEX, fragment: SIGNAL_FIELD_FRAGMENT }),
    resources: {
      bendUniforms: {
        uTime: { value: 0, type: "f32" },
        uSeed: { value: 0, type: "f32" },
        uSpeed: { value: 1, type: "f32" },
        uIntensity: { value: 0.7, type: "f32" },
        uScale: { value: 1, type: "f32" },
        uFrequency: { value: 3, type: "f32" },
        uPalette: { value: 0, type: "f32" },
        uCrop: { value: [0, 0, 1, 1], type: "vec4<f32>" },
      },
    },
  }) as unknown as BendFilter;
}

function createWaveFilter(): BendFilter {
  return new Filter({
    glProgram: new GlProgram({ vertex: FILTER_VERTEX, fragment: WAVE_DISPLACEMENT_FRAGMENT }),
    resources: {
      bendUniforms: {
        uTime: { value: 0, type: "f32" },
        uIntensity: { value: 0, type: "f32" },
        uFrequency: { value: 3, type: "f32" },
        uSpeed: { value: 1, type: "f32" },
        uDirectionX: { value: 1, type: "f32" },
        uDirectionY: { value: 0, type: "f32" },
        uPhase: { value: 0, type: "f32" },
      },
    },
  }) as unknown as BendFilter;
}

function createFlowFilter(): BendFilter {
  return new Filter({
    glProgram: new GlProgram({ vertex: FILTER_VERTEX, fragment: FLOW_FRAGMENT }),
    resources: {
      bendUniforms: {
        uTime: { value: 0, type: "f32" },
        uSeed: { value: 0, type: "f32" },
        uParticleDensity: { value: 0.6, type: "f32" },
        uFieldScale: { value: 1, type: "f32" },
        uFlowSpeed: { value: 1, type: "f32" },
        uCurl: { value: 0.8, type: "f32" },
        uTrailLength: { value: 0.7, type: "f32" },
        uLineWidth: { value: 0.3, type: "f32" },
        uDispersion: { value: 0.2, type: "f32" },
        uOpacity: { value: 0.8, type: "f32" },
        uPalette: { value: 0, type: "f32" },
        uCrop: { value: [0, 0, 1, 1], type: "vec4<f32>" },
      },
    },
  }) as unknown as BendFilter;
}

function createRefractionFilter(): BendFilter {
  return new Filter({
    glProgram: new GlProgram({ vertex: FILTER_VERTEX, fragment: REFRACTION_FRAGMENT }),
    resources: {
      bendUniforms: {
        uTime: { value: 0, type: "f32" },
        uSeed: { value: 0, type: "f32" },
        uRefraction: { value: 0.5, type: "f32" },
        uLightIntensity: { value: 0.7, type: "f32" },
        uWaveScale: { value: 1, type: "f32" },
        uDistortion: { value: 0.4, type: "f32" },
        uSpeed: { value: 0.5, type: "f32" },
        uDirection: { value: 0, type: "f32" },
        uContrast: { value: 0.6, type: "f32" },
        uSoftness: { value: 0.6, type: "f32" },
        uPalette: { value: 2, type: "f32" },
        uCrop: { value: [0, 0, 1, 1], type: "vec4<f32>" },
      },
    },
  }) as unknown as BendFilter;
}

function createColorGradeFilter(): ColorGradeFilter {
  return new Filter({
    glProgram: new GlProgram({ vertex: FILTER_VERTEX, fragment: COLOR_GRADE_FRAGMENT }),
    resources: {
      bendGrade: {
        uBrightness: { value: 0, type: "f32" },
        uContrast: { value: 0, type: "f32" },
        uSaturation: { value: 0, type: "f32" },
        uHue: { value: 0, type: "f32" },
        uTemperature: { value: 0, type: "f32" },
        uTint: { value: 0, type: "f32" },
        uHighlights: { value: 0, type: "f32" },
        uShadows: { value: 0, type: "f32" },
        uVignette: { value: 0, type: "f32" },
        uGrain: { value: 0, type: "f32" },
        uSharpen: { value: 0, type: "f32" },
        uTime: { value: 0, type: "f32" },
        uTexel: { value: [0.001, 0.001], type: "vec2<f32>" },
      },
    },
  }) as unknown as ColorGradeFilter;
}

function createTransitionFilter(): TransitionFilter {
  return new Filter({
    glProgram: new GlProgram({ vertex: FILTER_VERTEX, fragment: TRANSITION_FRAGMENT }),
    resources: {
      bendTransition: {
        uType: { value: 0, type: "f32" },
        uProgress: { value: 0, type: "f32" },
        uDirection: { value: [1, 0], type: "vec2<f32>" },
        uIntensity: { value: 0.5, type: "f32" },
        uTime: { value: 0, type: "f32" },
      },
    },
  }) as unknown as TransitionFilter;
}

function paletteIndex(palette: keyof typeof PALETTE_COLORS): number {
  return Math.max(0, Object.keys(PALETTE_COLORS).indexOf(palette));
}
