# BEND animation engine

## Model

Every layer has a versioned animation document:

```ts
{
  version: 1,
  tracks: [{
    id,
    property: "transform.scale",
    valueType: "number",
    enabled: true,
    keyframes: [{ id, time, value, easing, bezier? }],
    modulator?: { type, mode, frequency, amplitude, ... }
  }]
}
```

Property paths are stable document paths. Current paths cover layer transforms, procedural generator parameters, video Wave Displacement parameters, and numeric temporal-effect parameters. Temporal effects have an `instanceId` so a track remains attached to the intended effect when two effect types eventually share a stack.

## Evaluation order

1. Read the layer base value.
2. Evaluate keyframes at the layer-local time (`projectTime - layer.timeline.start`).
3. Evaluate the optional deterministic modulator.
4. Combine modulation using add, multiply, or replace.
5. Clamp to the property's documented bounds.
6. Apply the evaluated layer to the renderer or temporal sampler.

Discrete values hold the previous keyframe. Numeric values interpolate. Rotation uses the shortest path between angles. All time inputs are safe for arbitrary scrubbing timestamps.

## Shared execution path

`evaluateAnimatedLayer` is called by `PixiBendRenderer` for preview and export. Temporal sampling resolves animated effect parameters at each sampled timestamp. Liquid receives a callback for each fixed simulation step, so an animated Flow Speed or Swirl changes the replayed simulation rather than only changing the final texture.

## Editing contract

- A diamond creates a keyframe at the current project time.
- Editing an animated property updates the keyframe at the current layer-local time.
- Editing an unanimated property changes the base value.
- A property has at most one track and one optional modulator.
- Tracks, keyframes, modulators, effect instance IDs, and layer timing persist through project normalization and local storage.
- Undo/redo is handled by the existing project commit boundary.

## Current bounds

The first version intentionally excludes structural values such as generator seed, simulation quality, effect order, effect type, and clip duration. Those values can invalidate a stateful replay or change the project topology; they remain ordinary inspector controls until a dedicated transition contract exists.
