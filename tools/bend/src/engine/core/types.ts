export const SCHEMA_VERSION = 3 as const;
export const PHASE7_SCHEMA_VERSION = 2 as const;
export const LEGACY_SCHEMA_VERSION = 1 as const;

export const ASPECT_PRESETS = {
  "4:5": { width: 1080, height: 1350, label: "Portrait" },
  "1:1": { width: 1080, height: 1080, label: "Square" },
  "9:16": { width: 1080, height: 1920, label: "Reel / Story" },
  "16:9": { width: 1920, height: 1080, label: "Landscape" },
} as const;

export type AspectPreset = keyof typeof ASPECT_PRESETS;
export type LayerKind = "video" | "procedural";
export type FitMode = "contain" | "cover";
export type PaletteId = "acid" | "ember" | "ice" | "mono" | "contrast" | "soft" | "saturated";
export type GeneratorId = "signal-field" | "liquid" | "flow" | "refraction";
export type SignalPresetId = "pulse" | "drift" | "current" | "fracture";
export type LiquidPresetId = "ink-spill" | "vortex" | "tidal" | "nebula";
export type FlowPresetId = "threads" | "current" | "orbit" | "drift";
export type RefractionPresetId = "pool" | "glass" | "prism" | "mirage";
export type ProceduralQuality = "draft" | "standard" | "high";
export type LayerBlendMode = "normal" | "multiply" | "screen" | "add" | "overlay";
export type LayerMaskType = "none" | "rectangle" | "ellipse" | "gradient";
export type MediaKind = "video" | "audio";
export type ClipTransitionType = "crossfade" | "dip-black" | "wipe" | "zoom" | "glitch" | "distortion";
export type ClipTransitionDirection = "left" | "right" | "up" | "down";
export type ClipTrackId = string;

export type AnimationValue = number | string | boolean;
export type AnimationValueType = "number" | "color" | "enum" | "boolean";
export type AnimationEasing = "hold" | "linear" | "ease-in" | "ease-out" | "ease-in-out" | "cubic-bezier";
export type ModulatorType = "sine" | "triangle" | "pulse" | "smooth-noise" | "ramp";
export type ModulationMode = "add" | "multiply" | "replace";

export interface AnimationKeyframe {
  id: string;
  time: number;
  value: AnimationValue;
  easing: AnimationEasing;
  bezier?: [number, number, number, number];
}

export interface AnimationModulator {
  type: ModulatorType;
  enabled: boolean;
  mode: ModulationMode;
  frequency: number;
  amplitude: number;
  offset: number;
  phase: number;
  dutyCycle: number;
  intensity: number;
  seed: string;
  smoothness: number;
  start: number;
  end: number;
  duration: number;
  easing: AnimationEasing;
}

export interface AnimationTrack {
  id: string;
  property: string;
  valueType: AnimationValueType;
  enabled: boolean;
  keyframes: AnimationKeyframe[];
  modulator?: AnimationModulator;
}

export interface LayerAnimation {
  version: 1;
  tracks: AnimationTrack[];
}

export type MediaAudioStatus = "unknown" | "none" | "available" | "unsupported";

export interface MediaAudioInfo {
  status: MediaAudioStatus;
  codec: string | null;
  channels: number | null;
  sampleRate: number | null;
  startTime: number;
  message?: string;
}

export interface BendTransform {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  anchor: { x: number; y: number };
  flipX: boolean;
  flipY: boolean;
}

export interface CropRect {
  /** Normalized source-space left edge. */
  x: number;
  /** Normalized source-space top edge. */
  y: number;
  /** Normalized source-space width. */
  width: number;
  /** Normalized source-space height. */
  height: number;
}

/**
 * Masks are evaluated in composition space after the layer transform and before
 * layer blending. They never alter source framing (that remains Crop's job).
 */
export interface LayerMask {
  type: LayerMaskType;
  /** Normalized composition-space center. */
  x: number;
  y: number;
  /** Normalized composition-space size. */
  width: number;
  height: number;
  rotation: number;
  /** 0 = hard edge, 1 = fully soft. */
  feather: number;
  invert: boolean;
  /** Gradient direction in degrees, local to the mask shape. */
  angle: number;
  /** Gradient transition width. */
  falloff: number;
}

export interface LayerColorAdjustments {
  /** Brightness is a display multiplier offset, not photographic exposure. */
  brightness: number;
  /** Contrast is a display multiplier around the 0.5 midpoint. */
  contrast: number;
  /** Saturation is a multiplier offset; 0 preserves the source. */
  saturation: number;
  /** Hue rotation in degrees. */
  hue: number;
  /** Cool (-1) to warm (1) white-balance bias. */
  temperature: number;
  /** Green (-1) to magenta (1) white-balance bias. */
  tint: number;
  /** Lifts or lowers the upper tonal range. */
  highlights: number;
  /** Lifts or lowers the lower tonal range. */
  shadows: number;
  /** Corner darkening; 0 is off. */
  vignette: number;
  /** Animated deterministic film grain; 0 is off. */
  grain: number;
  /** Unsharp-mask amount; 0 is off. */
  sharpen: number;
  enabled: boolean;
}

export interface SpeedRampPoint {
  /** Normalized output progress through the clip, 0..1. */
  time: number;
  /** Playback speed multiplier at that progress, 0.25..4. */
  speed: number;
}

export interface ClipPlayback {
  /** Constant speed multiplier when no ramp is active. */
  speed: number;
  reverse: boolean;
  rampEnabled: boolean;
  /** Two to six normalized speed control points. */
  rampPoints: SpeedRampPoint[];
  /** A held source frame. When active it overrides speed/reverse for picture. */
  freeze: { sourceTime: number; duration: number } | null;
}

export interface ClipAudioSettings {
  enabled: boolean;
  gainDb: number;
  fadeIn: number;
  fadeOut: number;
}

export interface ClipTransition {
  id: string;
  type: ClipTransitionType;
  fromLayerId: string;
  duration: number;
  direction: ClipTransitionDirection;
  intensity: number;
  easing: AnimationEasing;
}

export interface CoverFrame {
  /** Composition timestamp used as the poster/cover frame. */
  time: number;
}

export interface SafeAreaSettings {
  enabled: boolean;
  titleSafe: boolean;
  captionSafe: boolean;
  grid: boolean;
}

export interface SoundtrackDuckingSettings {
  /** Off by default. Uses the audible clip mix as the sidechain. */
  enabled: boolean;
  /** Maximum music reduction when the sidechain is above the threshold, in dB. */
  amountDb: number;
  /** Sidechain RMS threshold in dBFS. */
  thresholdDb: number;
  /** Gain smoothing attack in seconds. */
  attack: number;
  /** Gain smoothing release in seconds. */
  release: number;
}

export interface ProjectSoundtrack {
  assetId: string;
  timelineStart: number;
  sourceIn: number;
  sourceOut: number;
  gainDb: number;
  muted: boolean;
  fadeIn: number;
  fadeOut: number;
  /** Repeat the trimmed source from timelineStart through the composition end. */
  loop: boolean;
  /** Short equal-power crossfade after each loop boundary, in seconds. */
  loopCrossfade: number;
  /** Level-driven music ducking. Disabled by default. */
  ducking: SoundtrackDuckingSettings;
}

export interface WaveDisplacementParams {
  enabled: boolean;
  intensity: number;
  frequency: number;
  speed: number;
  direction: number;
  phase: number;
}

export type TemporalEffectId = "motion-echo" | "time-slice" | "frame-feedback" | "channel-delay";
export type TemporalBlendMode = "normal" | "screen" | "lighter" | "lighten" | "multiply";
export type TemporalDirection = "backward" | "forward" | "both";
export type TemporalOrientation = "horizontal" | "vertical";
export type TemporalCurve = "linear" | "ease-in" | "ease-out" | "ease-in-out" | "wave";

export interface TemporalEffectBase {
  id: TemporalEffectId;
  instanceId: string;
  version: 1;
  enabled: boolean;
  preset: string;
}

export interface MotionEchoEffect extends TemporalEffectBase {
  id: "motion-echo";
  echoCount: number;
  timeSpacing: number;
  decay: number;
  opacity: number;
  direction: TemporalDirection;
  blendMode: TemporalBlendMode;
  offsetX: number;
  offsetY: number;
  tint: string;
  temporalRange: number;
}

export interface TimeSliceEffect extends TemporalEffectBase {
  id: "time-slice";
  sliceCount: number;
  temporalOffset: number;
  direction: "backward" | "forward";
  orientation: TemporalOrientation;
  sliceWidth: number;
  offsetCurve: TemporalCurve;
  sliceJitter: number;
  blend: number;
  motionSpeed: number;
  seed: string;
}

export interface FrameFeedbackEffect extends TemporalEffectBase {
  id: "frame-feedback";
  feedbackAmount: number;
  decay: number;
  scale: number;
  rotation: number;
  translationX: number;
  translationY: number;
  blendMode: TemporalBlendMode;
  colorShift: number;
  noise: number;
}

export interface ChannelDelayEffect extends TemporalEffectBase {
  id: "channel-delay";
  redDelay: number;
  greenDelay: number;
  blueDelay: number;
  intensity: number;
  spatialOffset: number;
  edgeBehavior: "clamp" | "transparent";
  temporalClamp: "clip" | "loop";
}

export type TemporalEffectInstance = MotionEchoEffect | TimeSliceEffect | FrameFeedbackEffect | ChannelDelayEffect;

export interface SignalFieldParams {
  id: "signal-field";
  version: 1;
  preset: SignalPresetId;
  seed: string;
  speed: number;
  intensity: number;
  scale: number;
  frequency: number;
  palette: PaletteId;
  duration: number;
}

export interface LiquidParams {
  id: "liquid";
  version: 1;
  preset: LiquidPresetId;
  seed: string;
  flowSpeed: number;
  forceStrength: number;
  swirl: number;
  viscosity: number;
  turbulence: number;
  dyeAmount: number;
  dyeDissipation: number;
  palette: PaletteId;
  simulationQuality: ProceduralQuality;
  duration: number;
}

export interface FlowParams {
  id: "flow";
  version: 1;
  preset: FlowPresetId;
  seed: string;
  particleDensity: number;
  fieldScale: number;
  flowSpeed: number;
  curl: number;
  trailLength: number;
  lineWidth: number;
  dispersion: number;
  opacity: number;
  palette: PaletteId;
  renderQuality: ProceduralQuality;
  duration: number;
}

export interface RefractionParams {
  id: "refraction";
  version: 1;
  preset: RefractionPresetId;
  seed: string;
  refraction: number;
  lightIntensity: number;
  waveScale: number;
  distortion: number;
  speed: number;
  direction: number;
  contrast: number;
  softness: number;
  palette: PaletteId;
  duration: number;
}

export type ProceduralGeneratorParams = SignalFieldParams | LiquidParams | FlowParams | RefractionParams;

export interface MediaAssetRecord {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  width: number;
  height: number;
  duration: number;
  storageKey: string;
  /** Video assets are the default for legacy records. */
  mediaType?: MediaKind;
  audio?: MediaAudioInfo;
  frameRate?: number | null;
  isVariableFrameRate?: boolean;
  videoStartTime?: number;
}

export interface LayerTimeline {
  start: number;
  duration: number;
}

export interface BendLayerBase {
  id: string;
  name: string;
  transform: BendTransform;
  timeline: LayerTimeline;
  visible: boolean;
  locked: boolean;
  muted: boolean;
  effects: TemporalEffectInstance[];
  animation: LayerAnimation;
  crop: CropRect;
  color: LayerColorAdjustments;
  blendMode: LayerBlendMode;
  mask: LayerMask;
}

export interface VideoLayer extends BendLayerBase {
  kind: "video";
  assetId: string;
  trimStart: number;
  trimEnd: number;
  fit: FitMode;
  wave: WaveDisplacementParams;
  /** Primary sequence lane. Legacy footage defaults to V1. */
  trackId: ClipTrackId;
  playback: ClipPlayback;
  audio: ClipAudioSettings;
  /** Transition into this clip from an adjacent clip on the same track. */
  transitionIn: ClipTransition | null;
}

export interface ProceduralLayer extends BendLayerBase {
  kind: "procedural";
  generator: ProceduralGeneratorParams;
}

export type BendLayer = VideoLayer | ProceduralLayer;

export interface ProjectLoopRegion {
  enabled: boolean;
  start: number;
  end: number;
}

export interface BendProject {
  schemaVersion: typeof SCHEMA_VERSION;
  id: string;
  name: string;
  canvas: {
    width: number;
    height: number;
    fps: number;
    duration: number;
    background: string;
  };
  assets: Record<string, MediaAssetRecord>;
  layers: BendLayer[];
  timeline: {
    inPoint: number;
    outPoint: number;
  };
  /** Optional playback/export work range. Missing data means the full composition. */
  loop: ProjectLoopRegion;
  cover: CoverFrame;
  safeAreas: SafeAreaSettings;
  soundtrack: ProjectSoundtrack | null;
  metadata: {
    createdAt: number;
    updatedAt: number;
  };
}

export interface StoredAssetRecord extends MediaAssetRecord {
  blob: Blob;
}

export type EditorTool = "media" | "generate" | "effects" | "motion" | "layers" | "recipes";
export type InspectorSection = "edit" | "effects" | "motion";

