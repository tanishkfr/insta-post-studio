# BEND Phase 5.1D direct manipulation architecture

Date: 2026-10-13
Status: implemented locally; shared renderer/export path retained.

## Source of truth

The project document remains the only committed editing state. `BendLayerBase` now carries:

```ts
transform: {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  anchor: { x: number; y: number };
  flipX: boolean;
  flipY: boolean;
};
crop: { x: number; y: number; width: number; height: number };
color: {
  brightness: number;
  contrast: number;
  saturation: number;
  hue: number;
  enabled: boolean;
};
```

Crop values are normalized source coordinates. `x`/`y` are signed composition offsets for the normalized anchor from the canvas center; the default center anchor preserves the previous schema-v2 visual behavior. Existing projects without these additive fields normalize to full crop, neutral color, center anchor, and unflipped orientation.

## Geometry pipeline

`src/engine/core/transform.ts` is pure geometry and has no React, Motion, Pixi, storage, or browser-event dependency.

1. Pointer client coordinates are converted through the displayed canvas rect and current zoom into composition coordinates.
2. Composition points are mapped through the layer's inverse affine matrix into cropped local content coordinates.
3. Hit testing uses rotated geometry and layer eligibility, not pixel alpha. Layers are tested topmost first.
4. Pointer deltas update the transient project copy. Scale uses corner geometry and preserves aspect ratio; rotation uses the angle from the layer center and optionally snaps to 15 degrees.
5. Anchor changes calculate the visible center before changing the anchor, then compensate `x`/`y` so the visible content stays in place.
6. Snapping compares rotated bounds and centers to composition edges/center in screen-space. Shift disables it.

The renderer uses the same geometry semantics: it sets the Pixi sprite anchor, cropped content dimensions, signed flip scale, composition position, rotation, and opacity from the normalized layer. No DOM animation or spring value is part of pointer math.

## Gesture transaction

`EditorStore.beginGesture()` records one history snapshot. `updateTransient()` replaces the current project without writing a history entry or IndexedDB record. `finishGesture()` leaves one undoable edit. Escape and pointer-cancel restore the snapshot and remove the temporary history entry. The existing editor save effect remains debounced, so pointer moves do not flood persistence.

Crop mode uses the same boundary with a crop baseline. Confirm keeps the crop; cancel restores the crop and history state. Crop never modifies `trimStart`, `trimEnd`, layer timeline placement, or source media.

## Render order and parity

Each layer is evaluated at composition time, then rendered as:

`source/generator → temporal stack → Wave Displacement → crop → ColorMatrix → transform/composite`

Procedural Signal Field, Flow, and Refraction apply crop by remapping generator UVs; texture-backed paths use a crop filter. Reusable Pixi filters are reset and updated per layer. Preview and export both call `PixiBendRenderer.render(project, time)`, so direct edits are not preview-only.

## Animation policy

Auto-Key defaults on to preserve the existing editing contract. Transform position/scale/rotation/opacity and layer-local color values—including numeric quick actions such as rotate, center, fit/fill, and reset—update or insert a keyframe at the current layer-local time. Auto-Key off writes the base value. Crop, anchor, and flip are static in this phase because animating them would require a separate reliable structural-track policy. The inspector makes the Auto-Key behavior explicit near the controls.

## UI boundary

`CanvasStage` owns selection overlays, handles, guides, crop dimming, and pointer lifecycle. `Inspector` owns precision controls and semantic button labels. `global.css` owns the visual layer: white/seafoam surface, teal selection outline, compact handles, restrained guides, and no exported decoration. Phase 5.1C Motion remains limited to DOM presentation and does not wrap canvas geometry or numeric value updates.

## Persistence and security boundary

Projects continue through `normalizeProject` before storage. Media blobs stay in the asset store and are not copied into JSON. Crop, color, anchor, and flip are scalar/boolean data only; no HTML, shader source, URL, or executable payload is accepted from a project. The renderer uses fixed internal shader/filter definitions. Dependency findings are tracked separately in [DEPENDENCY_SECURITY_AUDIT.md](DEPENDENCY_SECURITY_AUDIT.md).
