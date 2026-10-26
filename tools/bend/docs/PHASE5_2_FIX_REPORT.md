# BEND Phase 5.2 fix report

Date: 2026-10-14
Branch: `main`
Starting SHA: `187126c9cc62c2bdeb077b387b67579c9d12a19b`
Ending SHA: final local commit reported at handoff
Scope: independent first-time user product-quality overhaul. No push or deployment.

## Verdict

**PARTIAL.** The primary local Chrome workflow is fixed and verified end to end. BEND can create, edit, persist, and export a layered motion composition with audio. The phase is not a universal release sign-off because the repository browser runner is unavailable on this host, manual assistive-technology and hardware gates remain open, and two renderer teardown warnings remain visible after export.

## What was observed

The black-box customer pass began in a fresh Chrome profile before reading the architecture. The main customer risks were:

- technical vocabulary appearing before a first result;
- the second-layer Add route becoming less obvious after a generator was added;
- a real renderer contract defect that produced warnings and incorrect late export frames;
- a real export cancellation race in the parallel audio path;
- small direct-manipulation targets;
- weak settled contrast in the export dialog.

The full issue register, reproduction steps, evidence, root causes, and retest results are in [`FIRST_TIME_USER_AUDIT.md`](FIRST_TIME_USER_AUDIT.md).

## Fix groups

### 1. Customer language and first action

Changed the empty canvas, Add menu descriptions, generator help, effect help, Motion explanation, recipe help, and first-move guide to use concrete customer language. The established white/seafoam identity and unified Edit / Effects / Motion architecture remain unchanged.

The language now states:

- a customer can add a clip or moving background;
- a keyframe is a deliberate change at a chosen moment;
- modulation is a repeating variation;
- a recipe is a ready-made combination that can be applied and edited.

### 2. Renderer correctness

Changed the crop shader uniform resources from scalar `f32` arrays to the vector type consumed by the shader. This is the smallest fix at the existing PixiJS boundary. It removed 109 warnings from the generator/effect probe and prevented the late-frame export dropout observed before the fix.

The sprite removal path now detaches filters and replaces the texture before destruction. Two BindGroup teardown warnings remain in the normal export path and are explicitly reported rather than hidden.

### 3. Export cancellation safety

Kept the existing parallel video/audio export design, but awaited the audio writer's rejection before disposing its input on cancellation or error. The cancellation path now presents a cancelled state without the prior `InputDisposedError` page error.

### 4. Touch-adjacent controls and contrast

Increased the reorder handle and anchor targets to 24px, and darkened only the affected export-dialog supporting text and primary action colors within the established palette. The targeted axe scan now reports zero violations across six rendered states.

## Verification results

| Check | Result | Evidence |
| --- | --- | --- |
| `npm test` | PASS — 11 files, 52 tests | Jest/Vitest output from final source state |
| `npm run typecheck` | PASS | TypeScript no-emit check |
| `npm run build` | PASS — 2,824 modules transformed | Existing Vite large-chunk warning remains |
| `git diff --check` | PASS | No whitespace errors |
| Fresh installed Chrome workflow | PASS | [`blackbox-journey.json`](../output/evidence/phase5-2/reports/blackbox-journey.json) |
| Generator/effect matrix | PASS | Four generators × four presets; five effects; zero page errors |
| Accessibility scan | PASS for covered surfaces | Six axe surfaces, zero violations |
| Responsive layout | PASS for overflow | 1440, 1280, 1024, 768, and 390 widths |
| Persistence | PASS for covered IndexedDB flow | Generator and footage restored; no missing-asset alert |
| PNG export | PASS | [`phase5-2-representative-frame.png`](../output/evidence/phase5-2/functional/phase5-2-representative-frame.png) |
| Video export | PASS | H.264/AAC, 720 × 900, 30 FPS, 8.000 seconds |
| Export cancellation | PASS for covered path | Cancel control and cancelled message; no page errors |
| Repository browser suite | BLOCKED | Configured headless Chromium executable missing on host |

## Before-and-after usability result

The before state required a new customer to infer what “procedural,” “composition,” and `◆ / MOD` meant before taking an action. After the copy pass, the same visible journey reached a Signal Field layer, imported real footage, opened all three inspector areas, applied Motion Echo and Analog Ghost, and completed export without documentation lookup.

No invented click-reduction or satisfaction metric is claimed. The measured evidence is task completion, elapsed run time, rendered screenshots, console/page-error capture, and independently inspected media.

## Functional artifacts

- MP4: [`phase5-2-workflow-export.mp4`](../output/evidence/phase5-2/functional/phase5-2-workflow-export.mp4)
- PNG: [`phase5-2-representative-frame.png`](../output/evidence/phase5-2/functional/phase5-2-representative-frame.png)
- Sampled frames: [`frame-01.png`](../output/evidence/phase5-2/functional/frame-01.png), [`frame-02.png`](../output/evidence/phase5-2/functional/frame-02.png), [`frame-03.png`](../output/evidence/phase5-2/functional/frame-03.png)
- Browser recording: [`page@932882b52fa297bca60020d6249a2e6a.webm`](../output/evidence/phase5-2/recordings/page@932882b52fa297bca60020d6249a2e6a.webm)
- Machine-readable verification: [`phase5-2-verification.json`](../output/evidence/phase5-2/reports/phase5-2-verification.json)

## Remaining work and release gates

1. Reproduce and eliminate the two Pixi BindGroup teardown warnings with a focused lifecycle test.
2. Restore the repository browser runtime and rerun the bundled browser suite, including Firefox where available.
3. Perform manual keyboard, screen-reader, true 200% zoom, forced-colors, touch-device, and hardware GPU/decoder checks.
4. Decide whether to add a compact persistent “Add layer” affordance near a populated canvas; the current top-bar Add menu is functional but not ideal for first-time discoverability.

No new dependency, hosted API, cloud service, renderer rewrite, or animation-engine rewrite was introduced.
