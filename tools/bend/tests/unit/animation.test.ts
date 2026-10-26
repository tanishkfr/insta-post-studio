import { describe, expect, it } from "vitest";
import { createGeneratedProject } from "../../src/engine/core/project";
import type { AnimationTrack } from "../../src/engine/core/types";
import { createDefaultModulator, evaluateAnimatedLayer, evaluateAnimatedProperty, evaluateKeyframes, evaluateModulator, getPropertyDefinition, normalizeAnimation } from "../../src/engine/animation/engine";
import { applyMotionRecipe, BUILTIN_MOTION_RECIPES, recipeFromLayer } from "../../src/engine/recipes/recipes";

describe("BEND animation engine", () => {
  it("interpolates numeric keyframes and keeps discrete values held", () => {
    const project = createGeneratedProject("1:1", "pulse", "ANIM-01");
    const layer = project.layers[0];
    const definition = getPropertyDefinition(layer, "transform.x");
    if (!definition) throw new Error("missing transform definition");
    const track: AnimationTrack = {
      id: "track-x",
      property: "transform.x",
      valueType: "number",
      enabled: true,
      keyframes: [
        { id: "a", time: 0, value: 0, easing: "hold" },
        { id: "b", time: 2, value: 100, easing: "hold" },
      ],
    };
    expect(evaluateKeyframes(track, 1, definition, 0)).toBe(0);
    expect(evaluateKeyframes(track, 2, definition, 0)).toBe(100);
  });

  it("wraps rotation through the shortest path and clamps values", () => {
    const project = createGeneratedProject("1:1", "pulse", "ANIM-02");
    const layer = project.layers[0];
    const definition = getPropertyDefinition(layer, "transform.rotation");
    if (!definition) throw new Error("missing rotation definition");
    const track: AnimationTrack = { id: "rotation", property: "transform.rotation", valueType: "number", enabled: true, keyframes: [{ id: "a", time: 0, value: 350, easing: "linear" }, { id: "b", time: 1, value: 10, easing: "linear" }] };
    expect(evaluateKeyframes(track, 0.5, definition, 0)).toBeCloseTo(360);
    expect(evaluateKeyframes({ ...track, keyframes: [{ ...track.keyframes[0], value: -999 }] }, 0, definition, 0)).toBe(-360);
  });

  it("keeps modulators deterministic for arbitrary timestamps", () => {
    const modulator = { ...createDefaultModulator("smooth-noise"), seed: "SEED-7", frequency: 1.37 };
    const first = evaluateModulator(modulator, 1.234567);
    expect(evaluateModulator(modulator, 1.234567)).toBe(first);
    expect(evaluateModulator({ ...modulator, seed: "SEED-8" }, 1.234567)).not.toBe(first);
  });

  it("evaluates generator animation in layer-local time", () => {
    const project = createGeneratedProject("1:1", "pulse", "ANIM-03");
    const layer = project.layers[0];
    layer.timeline.start = 2;
    layer.animation = { version: 1, tracks: [{ id: "speed", property: "generator.speed", valueType: "number", enabled: true, keyframes: [{ id: "a", time: 0, value: 0, easing: "linear" }, { id: "b", time: 2, value: 2, easing: "linear" }] }] };
    const evaluated = evaluateAnimatedLayer(project, layer, 3);
    expect(evaluated.kind).toBe("procedural");
    if (evaluated.kind !== "procedural") throw new Error("expected procedural layer");
    if (evaluated.generator.id !== "signal-field") throw new Error("expected Signal Field generator");
    expect(evaluated.generator.speed).toBeCloseTo(1);
    expect(evaluateAnimatedProperty(layer, "generator.speed", 4)).toBeCloseTo(2);
  });

  it("registers and evaluates layer-local color animation", () => {
    const project = createGeneratedProject("1:1", "pulse", "ANIM-COLOR");
    const layer = project.layers[0];
    expect(getPropertyDefinition(layer, "color.hue")?.group).toBe("Appearance");
    layer.animation = { version: 1, tracks: [{ id: "hue", property: "color.hue", valueType: "number", enabled: true, keyframes: [{ id: "a", time: 0, value: 0, easing: "linear" }, { id: "b", time: 1, value: 90, easing: "linear" }] }] };
    const evaluated = evaluateAnimatedLayer(project, layer, 0.5);
    expect(evaluated.color.hue).toBeCloseTo(45);
  });

  it("maps recipe effect placeholders to stable effect instances", () => {
    const project = createGeneratedProject("1:1", "pulse", "RECIPE-01");
    const recipe = BUILTIN_MOTION_RECIPES.find((candidate) => candidate.id === "analog-ghost");
    if (!recipe) throw new Error("missing built-in recipe");
    const result = applyMotionRecipe(project, recipe, project.layers[0].id, "replace");
    const layer = result.project.layers[0];
    expect(layer.effects[0]?.instanceId).toMatch(/^effect-motion-echo/);
    expect(layer.animation.tracks[0]?.property).toBe(`effects.${layer.effects[0]?.instanceId}.decay`);
    expect(normalizeAnimation(layer.animation, layer).tracks).toHaveLength(1);
    const saved = recipeFromLayer(layer);
    const reapplied = applyMotionRecipe(result.project, saved, layer.id, "replace").project.layers[0];
    expect(reapplied.animation.tracks[0]?.property).toBe(`effects.${reapplied.effects[0]?.instanceId}.decay`);
  });
});
