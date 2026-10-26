# BEND animation audit

Date: 2026-10-13
Decision: keep the runtime evaluator small, typed, and local to BEND.

## References checked

- [Motion Canvas](https://github.com/motion-canvas/motion-canvas) is a TypeScript, signal-oriented motion system released under the MIT license. Its public model is useful evidence for time-addressable values and scrubbable composition.
- [Motion Canvas easing](https://motioncanvas.io/docs/flow/easing/) documents named easing and cubic-bezier control points for transitions.
- [Theatre.js core](https://github.com/theatre-js/theatre) demonstrates an editor-friendly property/timeline model. The repository separates the Apache-2.0 core from the AGPL-3.0 studio package, so BEND does not copy studio runtime code or add it as a dependency.
- [CSS cubic-bezier](https://developer.mozilla.org/en-US/docs/Web/CSS/easing-function/cubic-bezier) provides the same four-control-point convention used by BEND's local evaluator.

## Adopted ideas

- Stable property paths instead of references to React controls or renderer objects.
- Keyframes are values at layer-local times; preview and export ask the same evaluator for a value.
- Per-segment easing supports hold, linear, named quadratic ease variants, and cubic-bezier.
- Stateful systems receive deterministic time samples and can restore from bounded checkpoints.

## Explicitly not adopted

- No external animation runtime, node graph, or studio package.
- No spring physics in the first animation version. It would complicate exact scrubbing and export parity before there is a product need.
- No source-file recipes or executable imports. Recipes are validated JSON data only.

## License boundary

The audit informed data-model and UX decisions only. BEND's implementation is original TypeScript in `src/engine/animation`, `src/engine/recipes`, and existing renderer/temporal modules. No audited package was added to `package.json`.
