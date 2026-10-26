# BEND Phase 5.2 customer review

Date: 2026-10-14
Perspective: first-time customer, senior product designer, QA engineer, and frontend engineer
Evidence: fresh Chrome profile, real MP4 import, real PNG/MP4 export, reload, direct controls, responsive and axe probes.

## Overall review

BEND feels like a real creative instrument once the first moving layer is on the canvas. Its strongest qualities are the live procedural systems, temporal effects, direct canvas manipulation, and a genuinely local-first workflow that can turn a seeded experiment into an editable export. The main unfinished feeling comes from the remaining renderer teardown warnings and the gap between a technically capable inspector and a beginner's mental model.

## Scores

Scores are based on observed behavior in this pass, not on the amount of engineering in the repository.

| Area | Score | Evidence-based reason |
| --- | ---: | --- |
| First impression | 8/10 | Calm white/seafoam studio with a clear canvas and Add action; initial terminology still asks for interpretation. |
| Ease of learning | 7/10 | A generator is immediate and the new copy helps; keyframes, modulation, recipes, and temporal effects remain advanced. |
| Discoverability | 7/10 | Add, Edit, Effects, Motion, and Export are visible; adding footage after a background relies on the top Add menu. |
| Visual quality | 8/10 | Strong canvas focus, consistent Instrument Sans/seafoam system, and readable mobile drawer; some inspector density remains. |
| Interaction quality | 8/10 | Direct transform, crop cancellation, locking, undo/redo, and cancellation behaved correctly in the covered path. |
| Editing capability | 8/10 | Multi-layer placement, trimming, color, crop, transforms, effects, keyframes, modulation, and recipes are all live. |
| Creative potential | 9/10 | Four distinct procedural systems, five temporal/spatial effects, and editable motion recipes create a distinctive sandbox. |
| Reliability | 7/10 | Reload and export passed; two Pixi teardown warnings remain and the broader browser matrix is open. |
| Performance | 6/10 | The covered generator callback sample was responsive, but no hardware GPU, decoder, memory, or physical-device budget was measured. |
| Export experience | 8/10 | The dialog explains still/video and quality choices; MP4/AAC output and cancellation were verified. |

Average observed score: **7.6/10**.

## Would I recommend BEND to a creative student making an experimental Instagram video?

Yes, with a local-Chrome caveat. A student can open a blank studio, choose a generator, add footage, apply Motion Echo, and export a real vertical video without understanding the rendering engine. The app's distinctive value is visible quickly. I would not describe it as broadly release-ready until the browser and manual accessibility gates are closed and the teardown warnings are removed.

## Could a complete beginner produce something interesting in five minutes?

Probably yes for a procedural composition, and yes for a layered composition if they notice the persistent top-bar Add menu. The simplest path is Add → Signal Field → choose a preset → Add → video → Effects → Motion Echo → Export. Keyframe animation and recipe editing are plausible next steps, but a beginner may still need one short guided example because the inspector exposes considerable depth at once.

## What would make me abandon the application?

- A video export that appeared finished but contained a flat or blank late section.
- An export cancellation that left an exception or an unresponsive editor.
- Losing a locally saved composition after reload or clearing browser data without a clear warning.
- Having to search documentation to understand whether a control changes a frame, a repeated variation, or an effect stack.
- A dense mobile inspector that obscured the canvas or made controls too small.

The first three risks were specifically exercised in the covered flow; the renderer dropout and cancellation exception were fixed. Browser-data clearing and all storage failure classes were not fully simulated here.

## What still makes the product feel unfinished?

The latest normal export still reports two Pixi BindGroup teardown warnings. They do not currently corrupt the inspected MP4, but they signal an incomplete resource-lifecycle boundary. The bundled browser suite also cannot launch on this host, so the evidence is strong in installed Chrome but not cross-browser complete. Finally, the inspector remains a powerful expert surface whose vocabulary and density could still be reduced through one carefully designed first-study path rather than more helper text.

## Which parts feel genuinely distinctive?

- Seeded, editable moving backgrounds that are not just static presets.
- Temporal effects that visibly sample and recombine motion history.
- Direct canvas editing connected to the same timeline/export model.
- Local-first projects that preserve editable source instead of only producing a flattened video.
- Recipes that bundle a creative starting point while leaving the underlying controls editable.

## Is BEND ready to integrate into the group's larger creative suite?

**Ready for Phase 6A integration planning, not ready to claim a completed group integration.** The local product surface, editable project model, renderer, export, and persistence boundaries are sufficiently coherent for a host contract to be tested. No real group-app origin, bridge, or runtime contract was supplied in this phase, so integration remains unverified. The mock/local harness must not be presented as production group-toolset integration.

## Release-readiness recommendation

**PARTIAL.** Ship the improvements to the local branch and continue with focused reliability/accessibility closure. Do not push or deploy from this phase. The highest-value next action is a deterministic Pixi resource-teardown reproduction followed by the missing browser and manual accessibility gates.
