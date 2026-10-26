# BEND motion recipes

Recipes are portable, validated JSON descriptions of a motion treatment. They contain no media blobs, source files, JavaScript, or renderer objects.

## Schema

Required fields are `schemaVersion`, `id`, `name`, `description`, `targetCompatibility`, `requiresFootage`, `requiredCapabilities`, `effects`, `animation`, `seed`, and `timingPolicy`. Optional fields describe a generator, Wave Displacement, and attribution.

Animation properties may use effect placeholders such as `effects.motion-echo.decay`. When applied, BEND maps those placeholders to the generated effect instance ID. This keeps saved tracks stable without exposing runtime object references.

`timingPolicy` is `absolute` or `relative`. Relative recipes author their keyframes from the target layer's start; absolute recipes preserve the supplied layer-local timestamps. Invalid recipes are rejected during import and local storage load.

## Built-in library

The first library contains:

1. Analog Ghost — Motion Echo decay arc.
2. Liquid Bloom — Liquid flow and swirl animation.
3. Signal Breakdown — Signal Field complexity with Channel Delay.
4. Chromatic Delay — animated red/blue timing separation.
5. Recursive Dream — Frame Feedback scale and rotation drift.
6. Optical Tide — Refraction or Wave Displacement swell.

Each preview is rendered by the same Pixi and temporal engines used by the editor. Applying a recipe is undoable and supports replace or append. Local recipes can be saved from a layer, duplicated, renamed, deleted, imported, and exported as JSON; built-ins remain immutable.

## Compatibility

Recipe application checks the target layer kind, required footage, effect stack size, and generator compatibility before changing the project. A procedural recipe can create a new procedural layer when the selected layer is video; a video-only recipe reports the missing capability instead of silently substituting another source.
