# BEND Phase 5.5 — Creative Workflow, Compositing & Motion Implementation

Date: 2026-10-25  
Local checkout: `C:\Dev\Projects\Bend`  
Starting HEAD: `343260b` (`feat: complete phase 5.2 product quality overhaul`) with the Phase 5.3/5.4 worktree preserved.  
Verdict: feature implementation complete; verification is Chromium/SwiftShader-first with the limits listed at the end.

## 1. Goals and product shape

Phase 5.5 adds a connected set of editing capabilities rather than a new workspace:

- Fast source/treatment comparison.
- Reusable effect stacks with fresh animation identities.
- Seeded, undoable parameter variation.
- Intentional source replacement with a duration policy.
- Layer-level blend modes.
- Editable rectangle, ellipse, and linear-gradient masks.
- Group keyframe editing and clearer easing.
- A loop/work range for preview and export.
- Correct state reconstruction for mid-composition export.
- A verified seamless-loop export path for supported procedural compositions.

The shared Pixi compositor, local-first storage, deterministic animation, undo/redo, editable `.bendpkg` packaging, and Phase 6A host contract remain in place. No new runtime dependency, backend, hosted AI service, second renderer, graph editor, or audio mixer was added.

## 2. Schema and migration decision

### Spreadsheet of new persistent data

| Data | Type | Default | Persistence |
|---|---|---|---|
| `BendLayer.blendMode` | `"normal" \| "multiply" \| "screen" \| "add" \| "overlay"` | `"normal"` | Project, package, undo/redo |
| `BendLayer.mask` | `LayerMask` | `type: "none"` | Project, package, undo/redo |
| `BendProject.loop` | `{ enabled, start, end }` | full duration, disabled | Project, package, undo/redo |

Mask fields are `type`, normalized composition-space `x/y/width/height`, `rotation`, `feather`, `invert`, `angle`, and `falloff`.

### Version decision

`SCHEMA_VERSION` remains **2**. The new fields are optional at every read boundary:

- `normalizeLayer` adds `normalizeBlendMode(layer.blendMode)` and `normalizeMask(layer.mask)`.
- `normalizeProject` adds `normalizeLoopRegion(project.loop, duration)`.
- Legacy v1 migration still routes through `migrateLegacyProject` and the existing v1 → v2 path.
- Invalid blend modes become `normal`; invalid masks become fully visible; invalid loop intervals become the disabled full-composition default.
- Existing project content is not visually changed by loading. A missing mask is fully visible, a missing blend mode is Normal, and a missing loop disables looping.

This avoids a storage-wide version bump for additive data while still making the defaults explicit and testable. Package format version remains 1 because the package manifest embeds the normalized project, including the new fields. `createBendPackage` and `decodeBendPackage` both call `normalizeProject`.

The full-composition loop window is extended when a project's declared duration grows because a layer was added. A deliberately disabled narrow work range is preserved.

## 3. Compositing order

The order is one contract for preview and export:

```
source sample
  → temporal effect stack
  → spatial effect (Wave Displacement)
  → crop
  → color matrix
  → sprite transform
  → mask alpha
  → layer blend / opacity
  → composition
```

Implementation notes:

- Temporal sampling now records the **raw procedurally generated source** with effects, transform, crop, color, mask, blend, and non-generator animation stripped. The final shared compositor applies the layer transform and treatment once. This fixes an existing order issue where procedural temporal frames could be transformed twice and crop/color could be applied in more than one place.
- Temporal state is reset when the project identity changes so a project switch cannot reuse feedback, raw frames, or internal procedural renderers from another project.
- Masks are applied after transform/crop/color, before blend. Crop continues to alter source framing and is never treated as a mask.

### Blend modes

Target modes implemented: Normal, Multiply, Screen, Add/Lighter, Overlay.

Pixi’s built-in leaf blend mode was not reliable for filtered procedural sprites: the filter pass draws with its own compositing state, so procedural layers showed no change. The renderer therefore uses a small custom `blendRequired` filter (`LAYER_BLEND_FRAGMENT`) that samples the current back buffer, applies the selected blend function in straight color space, and writes premultiplied front alpha. This composes correctly with filtered generators, masks, transforms, and video, and uses Pixi’s existing filter/compositor path. The WebGL renderer initializes with `useBackBuffer: true`.

The filter is appended only for non-Normal layers, so existing Normal projects and compositions do not pay for an extra pass. Normal is the default.

### Mask design

Masks are implemented as a generated alpha-mask `Sprite` attached to the layer:

- `rectangle`, `ellipse`, `gradient`.
- Texture generation is 192 × 192, aspect-independent, with soft edges generated from a signed-distance / gradient alpha.
- Position, size, and rotation are applied to the mask sprite’s transform, so animating those properties does not regenerate the texture.
- Feather (shape) and falloff/direction (gradient) are baked into the texture and cached by a shape signature.
- Invert is baked into the alpha.
- Mask textures are destroyed when the layer is removed, the mask is cleared, or the layer disappears.
- Mask geometry is in composition space; direct canvas handles are intentionally not shipped in this phase. The inspector is the precise accessible editing path. Crop remains source framing.

Mask animation reuses the existing typed track engine with `mask.x`, `mask.y`, `mask.width`, `mask.height`, `mask.rotation`, `mask.feather`, `mask.angle`, and `mask.falloff`.

## 4. Before/after comparison

`buildComparisonProject` creates a transient preview-only variant for one layer:

- Effects, crop, color, Wave Displacement, mask, and blend mode are bypassed.
- Transform, timing, generator source, and generator animation remain.
- Effect/mask/color/wave animation tracks are filtered out of the comparison variant.
- The project store itself is not modified; comparison state lives outside `BendProject` and outside history.

The compare control is hold-to-compare with pointer down/up/leave/cancel and keyboard Space/Enter down/up. It is cleared on layer switch, edits, project load, and leaving the editor. The canvas shows an "Original source" badge naming the compared layer. Temporal engine state is left untouched while comparison bypasses it, so releasing comparison resumes the previous deterministic state.

## 5. Effect clipboard semantics

Typed clipboard representation: `EffectStackClipboard` containing copied effects plus only the animation tracks that reference those effect instance IDs.

- Copy includes effect type, preset, parameter values, enabled state, and effect animation tracks.
- Paste Replace swaps the target stack and effect animation; unrelated target tracks remain.
- Paste Append skips effect types already present on the target, preserves existing instances, and appends new instances before a terminal Frame Feedback pass when necessary.
- Every pasted effect receives a fresh `instanceId`.
- Effect animation tracks are remapped by old instance ID → new instance ID and receive fresh track/keyframe IDs.
- Keyframe values, easing, Bézier values, and modulators are preserved.
- Maximum 8 effects, 64 animation tracks, and 128 keyframes per track are enforced.
- Locked layers, unsupported stacks, duplicate-only appends, and overflow are rejected with explanations.
- The UI reports whether animation was included and whether feedback ordering was adjusted.

## 6. Seeded variation

`randomizeLayerParameters` is a pure, seeded operation:

- Deterministic hash of `seed | target | parameter path` drives each decision.
- Subtle / Moderate / Wild set both change probability and bounded range span.
- Generator scope can be All, Motion, Structure, or Appearance.
- Generator ranges and step values come from the generator registry.
- Effect numeric parameters and supported select values come from the temporal registry.
- Duration, source seeds, quality, preset identity, IDs, enabled state, and structural metadata are excluded.
- Animated values for a parameter that changes are scaled with the same factor, so an existing track does not mask the variation; values are clamped to the documented range.
- The operation is a normal one-step undo commit. No random configuration is applied to IDs, layers, or project structure.
- The UI records the seed, allows re-entering it, and offers Reapply.

## 7. Source replacement

Existing missing-media Relink still reuses the missing asset ID so a missing reference is repaired.

Intentional Replace Source for an available video layer:

- Probes the new file, inspects audio/frame metadata, and shows a review dialog before any write.
- Creates a **new asset ID** so other layers sharing the old asset are untouched; the old asset remains available for undo and other references.
- Preserves layer ID, order, timeline start, transform, crop, appearance, effects, animation tracks, fit mode, Wave settings, lock, visibility, and mute.
- Duration policies:
  - **Keep edit timing** when the new source is at least as long as the current clip. Trim starts at 0 and keeps the existing clip duration.
  - **Fit layer to new source** always available; it uses the new source duration.
  - A shorter source disables Keep edit timing with an explanation.
- Keyframes beyond the fitted end are reported and preserved in the document (unreachable until the clip is extended); they are not silently deleted.
- Cancellation performs no asset or project write.
- Media cleanup remains conservative: replacement never deletes a potentially shared asset.

## 8. Multi-keyframe editing and easing

Selection is transient store state scoped to one layer, with cross-track support within that layer:

- Shift/Ctrl/Cmd click toggles a keyframe.
- Plain click selects one; clicking an already-selected keyframe keeps the group for drag.
- Selection is cleared on layer switch and invalid identities are pruned after project changes.
- Group drag preserves relative spacing and commits one history entry.
- Copy/paste uses relative timing anchored to the playhead; paste only into existing compatible tracks and clamps the whole group to the layer duration.
- Duplicate places the group later by its span plus one frame; insufficient room or overlap is rejected with an explanation.
- Delete removes the selected keys and empty tracks; one undo step.
- Move clamps the whole group; collisions with non-moving keyframes replace the destination predictably.
- Keyboard: arrows (one frame; Shift one second), Home/End, Ctrl/Cmd+C/V/D, Delete/Backspace.
- Maximum 128 keyframes per track and locked layers are enforced.

Easing uses the existing evaluator through newly exported `evaluateEasingProgress`; there is no second easing implementation. The Motion tab shows the selected keyframe count, mixed easing, a curve preview generated from the real evaluator, preset buttons, four numeric cubic-Bézier values, and a group Delete action. Hold explicitly renders as a held value until the next keyframe. Cubic values are bounded to 0–1 at persistence and editing boundaries.

## 9. Loop range

`BendProject.loop` is a playback/work window independent of composition duration:

- Disabled by default; default range is the full composition.
- Playback wraps at `end` to `start` without changing layer timing, canvas duration, or in/out points.
- Ruler band and draggable start/end handles provide direct manipulation; precise numeric inputs and Reset to full composition remain available.
- Starting playback outside the enabled interval moves to the loop start.
- Invalid persisted ranges fall back to a disabled full-composition window.
- Export can use the loop range even when loop playback is disabled.

## 10. Range export and time mapping

`resolveExportRange` validates finite, in-bounds, non-zero ranges and returns exact start/end/duration/frame count.

- Output frame timestamps begin at 0.
- Composition time for frame `n` is `range.start + n / fps`.
- Frame count is `ceil(duration × fps)` with the existing fractional-frame guard.
- Audio sampling clips to the intersection of the layer and range, maps source trims into the range, and subtracts the range start from output timestamps.
- Stateful temporal effects and Liquid reconstruct deterministically from the layer/composition start; the first exported frame is compared against the same frame in a full export.
- Cancellation aborts the encode, closes audio, disposes sources/renderers/temporal state, and leaves no partial result.
- Range filenames include the start/end seconds; full composition keeps the existing filename.

## 11. Seamless-loop scope

Seamless output is an **export mode**, not a claim that arbitrary loop playback is seamless.

- Offered only when every visible layer is an analytic procedural generator with registry support, and no visible layer has enabled temporal effects or imported footage.
- Liquid/stateful generators and temporal-effect stacks are rejected with reasons.
- Rendering uses a mirrored (ping-pong) time map over the selected range. Output frame values approach the start at the end, so repeat playback is frame-continuous without a second renderer.
- Source audio is omitted because mirrored time would not preserve audio semantics; the result reports this.
- Ordinary loop preview/export remains available for unsupported compositions.
- The mode is verified by boundary-vs-adjacent SSIM on decoded exported frames, not by a flag.

This is intentionally not described as generator-period discovery. It is a verified visual repeat for deterministic analytic sources. Motion direction reverses at the midpoint and loop point; that is the declared behavior of the mirrored map.

## 12. Performance work

Targeted changes, not a second engine:

- Mask textures are rebuilt only when shape/feather/invert/gradient parameters change; static mask textures are no longer re-uploaded every frame. Position/size/rotation use the mask sprite transform.
- Blend filters exist only for non-Normal layers.
- Temporal engine caches and internal procedural renderers are invalidated when the project identity changes.
- Comparison work exists only while the control is held.
- Canvas preview exposes an end-to-end pipeline duration in `data-render-ms` for measurement; no user-facing performance claims are inferred from a single frame.
- Export remains at the selected actual output dimensions; preview-quality export remains an explicit choice.

Measured on the final system Chrome + SwiftShader path (headless, 3 layered generators, top mask + Screen blend + Motion Echo, 1080 × 1350 preview): median 26.8 ms, p95 37.6 ms, nine scrub samples, JS heap ~27.5 MiB. The same 8-second composition at 720 × 900 preview export took 67.1 seconds. This is a deliberately heavy stateful composition in software WebGL, not a hardware-GPU benchmark; repeated runs ranged roughly 27–47 ms median depending on machine load. No pre-5.5 numeric baseline existed for this new combination, so this is recorded as current evidence rather than a claimed regression or speed-up. Existing idle browser baseline remains 61 rAF callbacks/s in the smoke harness.

## 13. Files changed

New engine modules:

- `src/engine/core/mask.ts`
- `src/engine/core/loop.ts`
- `src/engine/animation/keyframes.ts`
- `src/engine/animation/easing.ts`
- `src/engine/temporal/clipboard.ts`
- `src/engine/random/randomize.ts`
- `src/engine/media/replacement.ts`
- `src/engine/export/range.ts`
- `src/engine/render/maskTexture.ts`
- `src/engine/render/comparison.ts`

Updated engine/storage:

- `src/engine/core/types.ts`
- `src/engine/core/project.ts`
- `src/engine/animation/engine.ts`
- `src/engine/render/pixiRenderer.ts`
- `src/engine/render/shaders.ts`
- `src/engine/temporal/engine.ts`
- `src/engine/temporal/registry.ts`
- `src/engine/export/exporter.ts`
- `src/app/store.ts`

Updated UI:

- `src/features/editor/EditorPage.tsx`
- `src/features/editor/CanvasStage.tsx`
- `src/features/editor/Inspector.tsx`
- `src/features/editor/Timeline.tsx`
- `src/features/editor/ExportDialog.tsx`
- `src/features/editor/ReplaceSourceDialog.tsx`
- `src/styles/global.css`

No package dependency was added.

## 14. Known limits

- Mask direct manipulation on canvas is not shipped; inspector controls are the supported precise path.
- Seamless repeat is export-only and uses mirrored time; it is not a periodic-generator solver and omits audio.
- Ranges export with a fresh deterministic state reconstruction. For Frame Feedback and Liquid this can cost time proportional to the start offset; it is bounded by the layer/composition duration, not an unbounded preroll.
- Cross-layer keyframe selection is not supported; group editing is within one layer.
- Variation has no per-parameter lock UI; the documented structural exclusions are fixed rather than user-editable.
- Source replacement policies are Keep edit timing and Fit to new source; freeze-frame padding is not offered.
- Firefox, hardware GPU, screen readers, 200% zoom/text-spacing, forced colors, and physical touch were not verified in this environment.
- The historical Playwright browser specs in this worktree contain pre-Phase-5.4 routes and selectors (for example the removed `/studio` entry input and `.layer-select`). They are not used as a regression gate; the current Phase 5.3 and 5.4 manual harnesses and the new Phase 5.5 harness are.
