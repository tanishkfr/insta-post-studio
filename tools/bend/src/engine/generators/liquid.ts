import type { LiquidParams, LiquidPresetId, PaletteId, ProceduralQuality } from "../core/types";
import { normalizeSeed, PALETTE_COLORS, seedToNumber } from "./signalField";

export interface LiquidPreset {
  id: LiquidPresetId;
  label: string;
  description: string;
  defaults: Omit<LiquidParams, "id" | "version" | "preset" | "seed">;
}

export const LIQUID_PRESETS: readonly LiquidPreset[] = [
  {
    id: "ink-spill",
    label: "Ink Spill",
    description: "Dense plumes that soften into slow diffusion.",
    defaults: { flowSpeed: 0.72, forceStrength: 1.1, swirl: 0.55, viscosity: 0.3, turbulence: 0.2, dyeAmount: 0.85, dyeDissipation: 0.12, palette: "mono", simulationQuality: "standard", duration: 8 },
  },
  {
    id: "vortex",
    label: "Vortex",
    description: "A tighter rotation with a stronger pull around the centre.",
    defaults: { flowSpeed: 1.12, forceStrength: 1.35, swirl: 1, viscosity: 0.16, turbulence: 0.4, dyeAmount: 0.8, dyeDissipation: 0.08, palette: "saturated", simulationQuality: "standard", duration: 8 },
  },
  {
    id: "tidal",
    label: "Tidal",
    description: "Broad currents that move like a long, shallow swell.",
    defaults: { flowSpeed: 0.46, forceStrength: 0.9, swirl: 0.28, viscosity: 0.48, turbulence: 0.12, dyeAmount: 0.72, dyeDissipation: 0.16, palette: "ice", simulationQuality: "standard", duration: 8 },
  },
  {
    id: "nebula",
    label: "Nebula",
    description: "Soft drifting clouds with a long atmospheric tail.",
    defaults: { flowSpeed: 0.34, forceStrength: 0.72, swirl: 0.2, viscosity: 0.62, turbulence: 0.32, dyeAmount: 0.64, dyeDissipation: 0.04, palette: "soft", simulationQuality: "standard", duration: 8 },
  },
] as const;

export function getLiquidPreset(id: LiquidPresetId): LiquidPreset {
  return LIQUID_PRESETS.find((preset) => preset.id === id) ?? LIQUID_PRESETS[0];
}

export function createLiquidParams(preset: LiquidPresetId = "ink-spill", seed = "BEND-LIQUID"): LiquidParams {
  return { id: "liquid", version: 1, preset, seed: normalizeSeed(seed), ...getLiquidPreset(preset).defaults };
}

export function normalizeLiquidParams(value: Partial<LiquidParams> & { seed?: string }): LiquidParams {
  const preset = isLiquidPreset(value.preset) ? value.preset : "ink-spill";
  const defaults = createLiquidParams(preset, typeof value.seed === "string" ? value.seed : "BEND-LIQUID");
  return {
    ...defaults,
    seed: normalizeSeed(typeof value.seed === "string" ? value.seed : defaults.seed),
    flowSpeed: clamp(value.flowSpeed, 0, 3, defaults.flowSpeed),
    forceStrength: clamp(value.forceStrength, 0, 3, defaults.forceStrength),
    swirl: clamp(value.swirl, 0, 2, defaults.swirl),
    viscosity: clamp(value.viscosity, 0, 1, defaults.viscosity),
    turbulence: clamp(value.turbulence, 0, 1, defaults.turbulence),
    dyeAmount: clamp(value.dyeAmount, 0, 1.5, defaults.dyeAmount),
    dyeDissipation: clamp(value.dyeDissipation, 0, 1, defaults.dyeDissipation),
    palette: isPalette(value.palette) ? value.palette : defaults.palette,
    simulationQuality: isQuality(value.simulationQuality) ? value.simulationQuality : defaults.simulationQuality,
    duration: clamp(value.duration, 0.5, 120, defaults.duration),
  };
}

export function getLiquidResolution(quality: ProceduralQuality, width: number, height: number): { width: number; height: number } {
  const base = quality === "draft" ? 48 : quality === "high" ? 96 : 72;
  const aspect = Math.max(0.35, Math.min(3, height / Math.max(1, width)));
  return { width: base, height: Math.max(24, Math.round(base * aspect)) };
}

interface LiquidSnapshot {
  step: number;
  velocityX: Float32Array;
  velocityY: Float32Array;
  dyeR: Float32Array;
  dyeG: Float32Array;
  dyeB: Float32Array;
}

/**
 * A deterministic fixed-grid fluid controller. The pass order mirrors the
 * audited GPU reference: vorticity/force injection, advection, divergence,
 * Jacobi pressure projection, gradient subtraction, and dye transport.
 * Keeping the arrays on the CPU makes seeking/replay explicit and portable;
 * the renderer can still present the resulting field as a GPU texture.
 */
export class LiquidSimulation {
  readonly width: number;
  readonly height: number;
  readonly fixedDelta = 1 / 60;
  private params: LiquidParams;
  private velocityX: Float32Array;
  private velocityY: Float32Array;
  private dyeR: Float32Array;
  private dyeG: Float32Array;
  private dyeB: Float32Array;
  private nextVelocityX: Float32Array;
  private nextVelocityY: Float32Array;
  private nextDyeR: Float32Array;
  private nextDyeG: Float32Array;
  private nextDyeB: Float32Array;
  private divergence: Float32Array;
  private pressure: Float32Array;
  private nextPressure: Float32Array;
  private initialSnapshot: LiquidSnapshot;
  private checkpoints = new Map<number, LiquidSnapshot>();
  private simulatedStep = 0;

  constructor(params: LiquidParams, width: number, height: number) {
    this.params = params;
    this.width = Math.max(8, Math.floor(width));
    this.height = Math.max(8, Math.floor(height));
    const size = this.width * this.height;
    this.velocityX = new Float32Array(size);
    this.velocityY = new Float32Array(size);
    this.dyeR = new Float32Array(size);
    this.dyeG = new Float32Array(size);
    this.dyeB = new Float32Array(size);
    this.nextVelocityX = new Float32Array(size);
    this.nextVelocityY = new Float32Array(size);
    this.nextDyeR = new Float32Array(size);
    this.nextDyeG = new Float32Array(size);
    this.nextDyeB = new Float32Array(size);
    this.divergence = new Float32Array(size);
    this.pressure = new Float32Array(size);
    this.nextPressure = new Float32Array(size);
    this.initialSnapshot = this.captureSnapshot(0);
    this.reset();
  }

  get currentTime(): number {
    return this.simulatedStep * this.fixedDelta;
  }

  get checkpointCount(): number {
    return this.checkpoints.size;
  }

  setParams(params: LiquidParams): void {
    const changed = this.params.seed !== params.seed || this.params.simulationQuality !== params.simulationQuality;
    this.params = params;
    if (changed) this.reset();
  }

  reset(): void {
    this.velocityX.fill(0);
    this.velocityY.fill(0);
    this.dyeR.fill(0);
    this.dyeG.fill(0);
    this.dyeB.fill(0);
    this.pressure.fill(0);
    this.nextPressure.fill(0);
    this.checkpoints.clear();
    this.simulatedStep = 0;
    this.injectInitialDye();
    this.initialSnapshot = this.captureSnapshot(0);
  }

  advanceTo(time: number, paramsAtTime?: (time: number) => LiquidParams): void {
    const targetStep = Math.max(0, Math.floor(Math.max(0, time) / this.fixedDelta + 1e-7));
    if (targetStep < this.simulatedStep) this.restoreNearest(targetStep);
    while (this.simulatedStep < targetStep) {
      const stepTime = this.simulatedStep * this.fixedDelta;
      if (paramsAtTime) this.params = paramsAtTime(stepTime);
      this.step(stepTime);
      this.simulatedStep += 1;
      if (this.simulatedStep % 120 === 0) this.saveCheckpoint();
    }
    if (paramsAtTime) this.params = paramsAtTime(Math.max(0, time));
  }

  sample(x: number, y: number): { velocityX: number; velocityY: number; dye: number } {
    const index = this.index(clampInt(x * this.width, 0, this.width - 1), clampInt(y * this.height, 0, this.height - 1));
    return {
      velocityX: this.velocityX[index] ?? 0,
      velocityY: this.velocityY[index] ?? 0,
      dye: Math.max(this.dyeR[index] ?? 0, this.dyeG[index] ?? 0, this.dyeB[index] ?? 0),
    };
  }

  renderToCanvas(canvas: HTMLCanvasElement): void {
    canvas.width = this.width;
    canvas.height = this.height;
    const context = canvas.getContext("2d");
    if (!context) return;
    const image = context.createImageData(this.width, this.height);
    const palette = paletteRgb(this.params.palette);
    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        const source = this.index(x, y);
        const dye = Math.min(1, (this.dyeR[source] + this.dyeG[source] + this.dyeB[source]) * 0.62);
        const speed = Math.min(1, Math.hypot(this.velocityX[source], this.velocityY[source]) * 0.08);
        const glow = Math.min(1, dye * 1.35 + speed * 0.18);
        const pixel = (y * this.width + x) * 4;
        image.data[pixel] = Math.round((palette[0][0] * (1 - glow) + palette[1][0] * glow) * 255);
        image.data[pixel + 1] = Math.round((palette[0][1] * (1 - glow) + palette[1][1] * glow) * 255);
        image.data[pixel + 2] = Math.round((palette[0][2] * (1 - glow) + palette[1][2] * glow) * 255);
        image.data[pixel + 3] = 255;
      }
    }
    context.putImageData(image, 0, 0);
  }

  private step(time: number): void {
    this.injectForces(time);
    const dt = this.fixedDelta * Math.max(0.05, this.params.flowSpeed);
    const damping = Math.exp(-this.params.viscosity * dt * 3.5);
    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        const index = this.index(x, y);
        const backX = clamp(x - this.velocityX[index] * dt * this.width * 0.42, 0, this.width - 1);
        const backY = clamp(y - this.velocityY[index] * dt * this.height * 0.42, 0, this.height - 1);
        const velocity = this.sampleBilinear(this.velocityX, this.velocityY, backX, backY);
        this.nextVelocityX[index] = velocity.x * damping;
        this.nextVelocityY[index] = velocity.y * damping;
        this.nextDyeR[index] = this.sampleScalar(this.dyeR, backX, backY);
        this.nextDyeG[index] = this.sampleScalar(this.dyeG, backX, backY);
        this.nextDyeB[index] = this.sampleScalar(this.dyeB, backX, backY);
      }
    }
    this.swapVelocity();
    this.swapDye();
    this.projectVelocity();
    const dyeDamping = Math.exp(-this.params.dyeDissipation * this.fixedDelta * 2.5);
    for (let index = 0; index < this.dyeR.length; index += 1) {
      this.dyeR[index] *= dyeDamping;
      this.dyeG[index] *= dyeDamping;
      this.dyeB[index] *= dyeDamping;
    }
  }

  private injectInitialDye(): void {
    const seed = seedToNumber(this.params.seed);
    for (let source = 0; source < 3; source += 1) {
      const x = 0.24 + ((seed * (source + 2) * 1.71) % 0.52);
      const y = 0.2 + ((seed * (source + 5) * 1.27) % 0.6);
      this.splat(x, y, (source + 1) * 0.7, source);
    }
  }

  private injectForces(time: number): void {
    const seed = seedToNumber(this.params.seed) * 17.31;
    const phase = time * this.params.flowSpeed;
    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        const nx = (x + 0.5) / this.width;
        const ny = (y + 0.5) / this.height;
        const wave = Math.sin((nx * 5.1 + seed) + phase * 1.7) + Math.cos((ny * 4.3 - seed * 0.7) - phase * 1.2);
        const sourceX = 0.5 + 0.22 * Math.sin(phase * 0.73 + seed);
        const sourceY = 0.5 + 0.24 * Math.cos(phase * 0.59 - seed * 1.2);
        const dx = sourceX - nx;
        const dy = sourceY - ny;
        const radius = Math.exp(-(dx * dx + dy * dy) * 35);
        const force = this.params.forceStrength * (0.35 + radius * 1.5) * this.fixedDelta;
        const index = this.index(x, y);
        this.velocityX[index] += (-dy * this.params.swirl + wave * this.params.turbulence * 0.18) * force;
        this.velocityY[index] += (dx * this.params.swirl + Math.cos(wave + seed) * this.params.turbulence * 0.18) * force;
        if (radius > 0.02) {
          this.dyeR[index] += radius * this.params.dyeAmount * (0.35 + 0.65 * Math.abs(Math.sin(seed)));
          this.dyeG[index] += radius * this.params.dyeAmount * (0.28 + 0.55 * Math.abs(Math.cos(seed)));
          this.dyeB[index] += radius * this.params.dyeAmount * (0.2 + 0.6 * Math.abs(Math.sin(seed * 1.7)));
        }
      }
    }
  }

  private splat(x: number, y: number, amount: number, index: number): void {
    const radius = 0.12 + index * 0.025;
    for (let cellY = 0; cellY < this.height; cellY += 1) {
      for (let cellX = 0; cellX < this.width; cellX += 1) {
        const dx = cellX / this.width - x;
        const dy = cellY / this.height - y;
        const influence = Math.exp(-(dx * dx + dy * dy) / (radius * radius));
        const target = this.index(cellX, cellY);
        this.dyeR[target] += influence * amount * (0.45 + index * 0.08);
        this.dyeG[target] += influence * amount * (0.3 + index * 0.1);
        this.dyeB[target] += influence * amount * (0.6 - index * 0.08);
      }
    }
  }

  private projectVelocity(): void {
    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        const index = this.index(x, y);
        const left = this.velocityX[this.index(Math.max(0, x - 1), y)];
        const right = this.velocityX[this.index(Math.min(this.width - 1, x + 1), y)];
        const bottom = this.velocityY[this.index(x, Math.max(0, y - 1))];
        const top = this.velocityY[this.index(x, Math.min(this.height - 1, y + 1))];
        this.divergence[index] = (right - left + top - bottom) * 0.5;
        this.pressure[index] = 0;
      }
    }
    const iterations = this.params.simulationQuality === "draft" ? 4 : this.params.simulationQuality === "high" ? 10 : 7;
    for (let iteration = 0; iteration < iterations; iteration += 1) {
      for (let y = 0; y < this.height; y += 1) {
        for (let x = 0; x < this.width; x += 1) {
          const index = this.index(x, y);
          this.nextPressure[index] = (
            this.pressure[this.index(Math.max(0, x - 1), y)]
            + this.pressure[this.index(Math.min(this.width - 1, x + 1), y)]
            + this.pressure[this.index(x, Math.max(0, y - 1))]
            + this.pressure[this.index(x, Math.min(this.height - 1, y + 1))]
            - this.divergence[index]
          ) * 0.25;
        }
      }
      const pressure = this.pressure;
      this.pressure = this.nextPressure;
      this.nextPressure = pressure;
    }
    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        const index = this.index(x, y);
        const gradientX = this.pressure[this.index(Math.min(this.width - 1, x + 1), y)] - this.pressure[this.index(Math.max(0, x - 1), y)];
        const gradientY = this.pressure[this.index(x, Math.min(this.height - 1, y + 1))] - this.pressure[this.index(x, Math.max(0, y - 1))];
        this.velocityX[index] = clamp(this.velocityX[index] - gradientX * 0.5, -4, 4);
        this.velocityY[index] = clamp(this.velocityY[index] - gradientY * 0.5, -4, 4);
      }
    }
  }

  private saveCheckpoint(): void {
    this.checkpoints.set(this.simulatedStep, this.captureSnapshot(this.simulatedStep));
    while (this.checkpoints.size > 8) {
      const oldest = this.checkpoints.keys().next().value;
      if (typeof oldest === "number") this.checkpoints.delete(oldest);
      else break;
    }
  }

  private restoreNearest(targetStep: number): void {
    let candidate = this.initialSnapshot;
    for (const checkpoint of this.checkpoints.values()) {
      if (checkpoint.step <= targetStep && checkpoint.step >= candidate.step) candidate = checkpoint;
    }
    this.restoreSnapshot(candidate);
  }

  private captureSnapshot(step: number): LiquidSnapshot {
    return { step, velocityX: this.velocityX.slice(), velocityY: this.velocityY.slice(), dyeR: this.dyeR.slice(), dyeG: this.dyeG.slice(), dyeB: this.dyeB.slice() };
  }

  private restoreSnapshot(snapshot: LiquidSnapshot): void {
    this.velocityX.set(snapshot.velocityX);
    this.velocityY.set(snapshot.velocityY);
    this.dyeR.set(snapshot.dyeR);
    this.dyeG.set(snapshot.dyeG);
    this.dyeB.set(snapshot.dyeB);
    this.pressure.fill(0);
    this.nextPressure.fill(0);
    this.simulatedStep = snapshot.step;
  }

  private sampleScalar(field: Float32Array, x: number, y: number): number {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = Math.min(this.width - 1, x0 + 1);
    const y1 = Math.min(this.height - 1, y0 + 1);
    const tx = x - x0;
    const ty = y - y0;
    return lerp(lerp(field[this.index(x0, y0)], field[this.index(x1, y0)], tx), lerp(field[this.index(x0, y1)], field[this.index(x1, y1)], tx), ty);
  }

  private sampleBilinear(xField: Float32Array, yField: Float32Array, x: number, y: number): { x: number; y: number } {
    return { x: this.sampleScalar(xField, x, y), y: this.sampleScalar(yField, x, y) };
  }

  private swapVelocity(): void {
    const x = this.velocityX;
    const y = this.velocityY;
    this.velocityX = this.nextVelocityX;
    this.velocityY = this.nextVelocityY;
    this.nextVelocityX = x;
    this.nextVelocityY = y;
  }

  private swapDye(): void {
    const r = this.dyeR;
    const g = this.dyeG;
    const b = this.dyeB;
    this.dyeR = this.nextDyeR;
    this.dyeG = this.nextDyeG;
    this.dyeB = this.nextDyeB;
    this.nextDyeR = r;
    this.nextDyeG = g;
    this.nextDyeB = b;
  }

  private index(x: number, y: number): number {
    return y * this.width + x;
  }
}

function paletteRgb(id: PaletteId): [[number, number, number], [number, number, number]] {
  const colors = PALETTE_COLORS[id] ?? PALETTE_COLORS.mono;
  return [hexToRgb(colors[0]), hexToRgb(colors[1])];
}

function hexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

function isLiquidPreset(value: unknown): value is LiquidPresetId {
  return ["ink-spill", "vortex", "tidal", "nebula"].includes(String(value));
}

function isQuality(value: unknown): value is ProceduralQuality {
  return ["draft", "standard", "high"].includes(String(value));
}

function isPalette(value: unknown): value is PaletteId {
  return ["acid", "ember", "ice", "mono", "contrast", "soft", "saturated"].includes(String(value));
}

function clamp(value: number | undefined, min: number, max: number, fallback = min): number {
  return Math.min(max, Math.max(min, typeof value === "number" && Number.isFinite(value) ? value : fallback));
}

function clampInt(value: number, min: number, max: number): number {
  return Math.floor(Math.min(max, Math.max(min, Number.isFinite(value) ? value : min)));
}

function lerp(a: number, b: number, amount: number): number {
  return a + (b - a) * amount;
}
