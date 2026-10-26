import { describe, expect, it } from "vitest";
import { createProceduralLayer, createProject, normalizeProject } from "../../src/engine/core/project";
import { LiquidSimulation, createLiquidParams } from "../../src/engine/generators/liquid";
import { createGeneratorParams, GENERATOR_REGISTRY, normalizeGeneratorParams } from "../../src/engine/generators/registry";
import { sampleFlowVector } from "../../src/engine/generators/flow";
import { sampleRefraction } from "../../src/engine/generators/refraction";

describe("Phase 2B procedural engine", () => {
  it("registers four distinct generators with bounded defaults and presets", () => {
    expect(GENERATOR_REGISTRY.map((definition) => definition.id)).toEqual(["signal-field", "liquid", "flow", "refraction"]);
    for (const definition of GENERATOR_REGISTRY) {
      const params = definition.createParams(definition.presets[0]?.id, "REGISTRY-01");
      expect(params.id).toBe(definition.id);
      expect(params.version).toBe(1);
      expect(params.seed).toBe("REGISTRY-01");
      expect(params.duration).toBeGreaterThan(0);
      expect(definition.presets.length).toBe(4);
      for (const parameter of definition.parameters) {
        if (parameter.type === "range") {
          const value = (params as unknown as Record<string, unknown>)[parameter.key];
          expect(typeof value).toBe("number");
          expect(value as number).toBeGreaterThanOrEqual(parameter.min ?? -Infinity);
          expect(value as number).toBeLessThanOrEqual(parameter.max ?? Infinity);
        }
      }
    }
  });

  it("keeps analytic generators deterministic for the same seed and timestamp", () => {
    const flow = createGeneratorParams("flow", "orbit", "DETERMINISTIC") as Extract<ReturnType<typeof createGeneratorParams>, { id: "flow" }>;
    const refraction = createGeneratorParams("refraction", "pool", "DETERMINISTIC") as Extract<ReturnType<typeof createGeneratorParams>, { id: "refraction" }>;
    expect(sampleFlowVector(0.25, 0.75, 1.2, flow)).toEqual(sampleFlowVector(0.25, 0.75, 1.2, flow));
    expect(sampleRefraction(0.25, 0.75, 1.2, refraction)).toEqual(sampleRefraction(0.25, 0.75, 1.2, refraction));
    expect(sampleFlowVector(0.25, 0.75, 1.2, flow)).not.toEqual(sampleFlowVector(0.25, 0.75, 1.2, { ...flow, seed: "DIFFERENT" }));
  });

  it("replays Liquid from fixed steps when seeking backward", () => {
    const params = createLiquidParams("vortex", "LIQUID-01");
    const first = new LiquidSimulation(params, 32, 40);
    first.advanceTo(1.5);
    const atEnd = first.sample(0.45, 0.5);
    first.advanceTo(0.4);
    first.advanceTo(1.5);
    expect(first.sample(0.45, 0.5)).toEqual(atEnd);
    expect(first.currentTime).toBeCloseTo(1.5, 2);
    expect(first.checkpointCount).toBeLessThanOrEqual(8);
  });

  it("persists generator identity and rejects unknown generator versions", () => {
    const project = createProject("1:1");
    const liquid = createProceduralLayer("liquid", "PERSIST-02");
    project.layers = [liquid];
    const restored = normalizeProject(JSON.parse(JSON.stringify(project)));
    expect(restored.layers[0]).toMatchObject({ kind: "procedural", generator: { id: "liquid", version: 1, preset: "ink-spill", seed: "PERSIST-02" } });
    expect(() => normalizeGeneratorParams({ id: "liquid", version: 99 })).toThrow(/unsupported liquid generator version/i);
    expect(() => normalizeGeneratorParams({ id: "future-fluid", version: 1 })).toThrow(/unknown generator/i);
  });
});
