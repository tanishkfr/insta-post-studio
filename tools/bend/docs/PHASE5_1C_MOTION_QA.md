# BEND Phase 5.1C motion QA

Date: 2026-10-13
Verdict: **PARTIAL — core interaction motion passes the available local evidence; release gates remain open.**

## Evidence runner

The reproducible targeted runner is:

```bash
node tests/manual/phase5-1c-motion.mjs
```

It starts Vite on `127.0.0.1:4177`, launches the installed Google Chrome executable with SwiftShader, waits for the cold compositor state to clear, records frame sequences, scans settled states with axe, and writes:

- machine-readable result: `output/evidence/phase5-1c/verification.json`;
- transition frames: `output/evidence/phase5-1c/<journey>/`.

The run used `1440×980` desktop and `390×844` mobile contexts. Reduced motion was explicitly enabled in a separate context and observed through `matchMedia`.

## Targeted results

| Journey | Result | Evidence |
| --- | --- | --- |
| Rapid Edit → Effects → Motion → Edit interruption | PASS | `01-inspector-rapid-switch/` |
| Selected-layer feedback | PASS | `02-selected-layer/` |
| Add popover open/close and generator insertion | PASS | `03-add-menu/`, `03-add-menu-close/`, `04-add-procedural-layer/` |
| Timeline animation-track collapse/expand | PASS | `05-timeline-collapse/`, `05-timeline-expand/` |
| Layer reorder drag + undo/redo | PASS — labels changed from `Signal Field / Liquid / Flow` to `Liquid / Signal Field / Flow` | `06-layer-reorder/` |
| Keyframe create + direct timestamp drag | PASS — moved from `0:00.00` to `0:02.55` | `07-keyframe-create/`, `07-keyframe-move/` |
| Modulator open | PASS | `08-modulator-open/` |
| Motion recipe application | PASS | `09-motion-recipe-apply/` |
| Export dialog open/close | PASS | `10-export-dialog-open/`, `10-export-dialog-close/` |
| Mobile controls drawer open/close | PASS | `11-mobile-drawer-open/`, `11-mobile-drawer-close/` |
| Reduced-motion Add and inspector transitions | PASS | `12-reduced-motion/`, `12-reduced-motion-inspector/` |

Representative frames were visually inspected after the run. The canvas remained present while DOM transitions ran; no Pixi renderer reset or blank canvas was observed in the targeted path.

## Automated and rendered checks

| Check | Result |
| --- | --- |
| Baseline `npm test` before implementation | PASS — 10 files, 42 tests |
| Final `npm test` | PASS — 10 files, 42 tests |
| Final `npm run typecheck` | PASS |
| Final `npm run build` | PASS — 2,823 modules transformed; existing large-chunk warning remains |
| Targeted Phase 5.1C Chrome runner | PASS — no console/page errors |
| Targeted axe scans | PASS — inspector, export dialog, mobile drawer, reduced-motion effects: zero violations |
| Existing Phase 5.1B system-Chrome harness | PASS — prior regression remains green |
| Canvas presence during targeted motion run | PASS — `canvasObserved: true` |

## Open verification gates

These are not converted into passes by the system-Chrome run:

- the configured repository Playwright browser executable is unavailable on this host;
- Firefox execution remains unavailable;
- manual screen-reader review, true 200% zoom, physical touch, and forced-colors review remain open;
- GPU memory, decoder allocation, frame pacing, physical-device FPS, and true forced-GC behavior remain unmeasured;
- full media/audio/export/cancellation acceptance was not repeated in this interaction-only phase;
- the new dependency install reported one moderate and two critical npm audit advisories; they were not auto-fixed in this phase.

## QA conclusion

The implementation meets the available Phase 5.1C interaction goal in the verified local browser path. The correct release label is **PARTIAL**, not complete, until the cross-browser, assistive-technology, physical-device, forced-colors, hardware-performance, and full export gates are run on an appropriate host.
