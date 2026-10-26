# BEND. procedural motion engine

Date: 2026-10-13
Scope: Phase 2B local implementation

Phase 2B makes procedural motion a first-class, extensible part of a BEND project. A procedural layer now stores a versioned generator record, the inspector is driven by a registry, preview and export use the same renderer boundary, and every generator is deterministic from its seed and parameters.

## Generator registry

The registry lives in `src/engine/generators/registry.ts`. It is the single source for the generator id, display name, presets, parameter groups, capability notes, and normalizer.

| Generator | Id | Render mode | Presets | Seek behavior |
| --- | --- | --- | ---: | --- |
| Signal Field | `signal-field` | analytic | 4 | direct evaluation |
| Liquid | `liquid` | stateful | 4 | fixed-step replay with checkpoints |
| Flow | `flow` | analytic | 4 | direct evaluation |
| Refraction | `refraction` | analytic | 4 | direct evaluation |

The registry is consumed by both the editor and project normalization. Adding a generator therefore requires a typed parameter record, a generator module, one registry entry, and a renderer branch; the inspector does not need a new bespoke control panel.

## Stored parameter contract

Schema version 2 remains the project-document version. Each procedural generator has its own versioned record inside the layer:

```json
{
  "id": "flow",
  "version": 1,
  "preset": "threads",
  "seed": "BEND-FLOW",
  "particleDensity": 0.6,
  "fieldScale": 1,
  "flowSpeed": 0.8,
  "curl": 0.9,
  "trailLength": 0.72,
  "lineWidth": 0.28,
  "dispersion": 0.2,
  "opacity": 0.8,
  "palette": "acid",
  "renderQuality": "standard",
  "duration": 8
}
```

`normalizeGeneratorParams` accepts legacy Signal Field records without an `id`, clamps numeric controls, normalizes seeds, rejects unknown generator ids, and rejects unsupported generator versions. Existing Phase 1 procedural layers migrate to `signal-field` without changing their seed or authored controls.

All four systems expose grouped controls for Motion, Structure, Appearance, and Simulation where those groups apply. Presets are complete parameter snapshots, not partial overrides. Seed randomization is explicit and undoable through the existing editor history boundary.

## Runtime paths

Analytic generators are stateless GLSL fragment filters evaluated from layer-local time, normalized coordinates, seed-derived values, and stored parameters:

- Signal Field keeps the existing seeded ribbons/noise field and adds the expanded palette set.
- Flow traces a bounded set of seeded trail samples through a curl-like vector field in the fragment shader.
- Refraction evaluates moving interference, finite-difference surface normals, directional light, caustic response, contrast, softness, and palette output in the fragment shader.

Liquid uses a deterministic fixed-grid controller in `src/engine/generators/liquid.ts`. Its pass order follows the audited reference algorithm: seeded dye/force injection, velocity and dye advection, divergence, Jacobi pressure projection, gradient subtraction, and dye dissipation. The current implementation keeps the small simulation arrays on the CPU so backward seeking, export, and browser replay have an explicit portable state path; the resulting low-resolution canvas is uploaded as a Pixi texture for presentation. This is a deliberate deterministic fallback/portable implementation, not a claim that the solver is a full GPU multipass fluid implementation.

`PixiBendRenderer` remains the single preview/export compositor. It owns one procedural resource set per layer, removes stale filters and Liquid textures when a layer changes generator, and destroys all resources when a layer or renderer is removed. PNG and video export call the same `render(project, time)` path used by the editor.

## Determinism and seeking

- Analytic generators evaluate directly at the requested local timestamp.
- Liquid advances at a fixed `1/60` step and truncates requested time to a fixed step.
- Liquid captures the initial seeded state and keeps at most eight snapshots, writing one every 120 simulation steps.
- Seeking backward restores the nearest retained checkpoint and replays forward; if no checkpoint is retained, replay starts from the initial state.
- Changing any Liquid simulation parameter resets its state and re-injects the seed-derived initial dye.

This makes the output reproducible for a project JSON document, but it does not promise bit-identical pixels across GPU drivers for the analytic GLSL paths.

## Persistence and export

Generator ids, versions, presets, seeds, parameters, and durations are persisted in the existing IndexedDB project record. No binary simulation cache is stored; Liquid checkpoints are runtime state and are rebuilt from the project document. Export therefore starts from a clean renderer and evaluates the same layer at each frame time.

The browser coverage in `tests/browser/phase2b.spec.ts` exercises the library, presets, grouped controls, randomization, timeline seeking, and short PNG export for each generator. Existing project, export, accessibility, and media tests remain separate so Phase 2B does not hide regressions in the Phase 2A composition workflow.

## Extension checklist

1. Add a discriminated parameter interface and preset id to `src/engine/core/types.ts`.
2. Add `create...Params`, `normalize...Params`, preset definitions, and any deterministic sampling/state controller under `src/engine/generators/`.
3. Add one `GeneratorDefinition` with parameter ranges, groups, presets, and capability notes to `registry.ts`.
4. Add the renderer branch and make its resources participate in generator-switch and renderer-destroy cleanup.
5. Add a thumbnail path and browser coverage for controls, seeking, export, and console/page errors.
6. Update this document and the audit/performance notes with measured evidence and known limitations.
