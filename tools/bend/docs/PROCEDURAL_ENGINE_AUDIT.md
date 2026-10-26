# BEND. Phase 2B procedural-engine audit

Date: 2026-10-13
Scope: algorithm/reference audit for the local Phase 2B implementation

## Reference reviewed

The fluid reference reviewed was Pavel Dobryakov's WebGL Fluid Simulation at pinned commit [`a2d292931f19d9b3b9f564e23e6c32729d2121c3`](https://github.com/PavelDoGreat/WebGL-Fluid-Simulation/tree/a2d292931f19d9b3b9f564e23e6c32729d2121c3). The implementation is MIT licensed; its license is preserved in the upstream repository at [`LICENSE`](https://github.com/PavelDoGreat/WebGL-Fluid-Simulation/blob/a2d292931f19d9b3b9f564e23e6c32729d2121c3/LICENSE). The source was used as algorithmic reference only; BEND does not vendor or copy the upstream application.

The reviewed pass sequence is:

1. curl/vorticity and force response;
2. advection of velocity and dye;
3. divergence calculation;
4. pressure initialization and Jacobi iterations;
5. gradient subtraction to restore a divergence-reduced field;
6. dye transport/dissipation and ping-pong state management.

BEND's Liquid controller follows that conceptual order with deterministic seeded injection and a fixed timestep. It uses a small typed-array grid and explicit snapshots because BEND's acceptance criteria include backward seeking, clean export replay, and portable browser behavior. That adaptation is intentionally documented as CPU state plus GPU texture presentation, not as a direct port of the upstream multipass GPU implementation.

## PixiJS boundary reviewed

The renderer uses PixiJS 8.22.0. The relevant official guidance reviewed was:

- [PixiJS v8 Filters](https://pixijs.com/8.x/guides/components/filters)
- [PixiJS v8 migration guide](https://pixijs.com/8.x/guides/migrations/v8)
- [PixiJS v8 performance tips](https://pixijs.com/8.x/guides/concepts/performance-tips)
- [PixiJS v8 Mesh](https://pixijs.com/8.x/guides/components/scene-objects/mesh)

The implementation keeps the existing `Filter`/`GlProgram` path for analytic generators, updates typed uniforms per layer-local time, and disposes filters/textures when a generator or layer is no longer active. A Mesh-based custom fluid surface was not introduced because the current Liquid state path is already a low-resolution texture presentation and does not need a second geometry abstraction.

## Audit decisions

| Decision | Reason |
| --- | --- |
| Keep Signal Field as a registry entry | Preserves the existing signature motion and legacy project compatibility. |
| Use analytic Flow and Refraction shaders | They are deterministic at arbitrary timestamps and fit the existing single-compositor boundary. |
| Keep Liquid stateful with explicit replay | Backward scrubbing and export must not depend on an opaque pointer-history cache. |
| Use generator-local quality controls | Draft/standard/high can bound work without adding global configuration. |
| Keep seed and parameters in project JSON | Persisted documents remain the source of truth; runtime checkpoints are disposable. |
| Reuse the existing render/export boundary | Preview, PNG, and video cannot drift into separate visual implementations. |

## Known gap

The strict “GPU-based fluid simulation” interpretation remains open: the current Liquid solver is CPU fixed-grid state feeding a GPU-presented texture. It was chosen to keep deterministic seeking and browser export reliable within the existing architecture. A future GPU multipass path must preserve the same stored parameter contract, produce an equivalent deterministic replay/checkpoint strategy, and demonstrate browser/export parity before replacing this path.
