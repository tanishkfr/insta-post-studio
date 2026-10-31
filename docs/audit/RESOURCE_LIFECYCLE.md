# Resource lifecycle review

Status: partial. The repeated empty-project navigation check is documented below; GPU, iframe-process and media-resource measurements requested for qualification have not been completed. No general leak-free claim is made.

## Confirmed issue LIF-001 (P2)

A delayed `AudioContext.resume()` could finish after the landing component unmounted or sound was toggled off. The continuation then installed a repeating 2.2-second timer after cleanup had already run. A controlled deferred-resume regression test failed before the fix and passed afterwards. The fix verifies the resumed context is still current before starting notes/timer, and closes it if startup rejects. This is a controlled unit reproduction of an asynchronous lifecycle race, not a memory measurement.

## Scoped source observations

The iframe adapter registers and removes its message listener; BEND source and handoff object URLs have cleanup paths. These observations do not prove all interruption races or native editor resources are cleaned up. Ten-cycle tool navigation, media decoder, WebGL and heap analysis remain outstanding.

## Repeated browser cycles

A separate Chromium 156 headless run used a fresh empty project and opened and closed Image, Vector, Type, Shapes, Generate and Video ten times each. Existing readiness checks passed and the host DOM contained zero iframes after every return to Canvas; both lifecycle and console/page-error assertions passed. The exposed host `performance.memory.usedJSHeapSize` value was 13,400,000 bytes before and after each group. This value was coarse/unchanged and does not account reliably for iframe processes, GPU memory, cached media, decoders or workers; it cannot establish absence of a leak. Existing-source editing, failed-load/export switching, in-flight publish cancellation and return-home resource measurements were not repeated in this experiment.

