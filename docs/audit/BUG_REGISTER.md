# Bug register

## AUD-001 — BEND recovery browser test (P1 gate)
- Reproduction: run `bend-integration.spec.ts` cancellation/corruption case; cancel a publish and select Canvas.
- Expected: confirm discard, then verify corrupted source is rejected and the committed layer remains intact.
- Observed: test waited for Canvas while the application displayed its discard confirmation; subsequently expected an obsolete error label.
- Evidence/root cause: failure snapshot shows the confirmation and, after adapting the interaction, the actual hash-mismatch alert.
- Correction: interact with the application dialog and assert both current error wording and hash mismatch. Status: verified by the full 79-test Chromium suite with a clean exit outside the sandbox.

## AUD-002 — Portable-project browser test entry (P1 gate)
- Reproduction: run clean-context package round trip; open `/` in the independent context.
- Expected: enter Studio and import the package.
- Observed: test waited for project name on the landing page.
- Root cause: route changed to landing while test assumed the old default.
- Correction: click Open your workspace. Status: verified by the full 79-test Chromium suite, including all six source re-entries, duplicate import and corrupt/future package rejection.

## AUD-003 — Evidence browser test departure and artifact overwrite (P1 gate)
- Reproduction: run phase6-evidence; add BEND signal field and return to Canvas.
- Expected: confirm discard, continue exports, preserve committed historical evidence.
- Observed: journey stalls at the discard dialog; test overwrites tracked evidence paths while running.
- Root cause: helper predates the custom confirmation and writes directly to documentation.
- Correction: confirm discard and use isolated Playwright output directories. Status: verified by the full 79-test Chromium suite, including PNG, carousel ZIP and package checks.


## AUD-004 — Earlier evidence tests overwrite tracked screenshots (P2)
- Reproduction: run the full host browser suite from a clean checkout.
- Expected: test artifacts are isolated; historic evidence remains unchanged.
- Observed: Phase 1–3 screenshots were modified by the test run. Other Phase 4 writers targeted the same tracked directory.
- Evidence/root cause: direct paths under `docs/evidence` in browser test helpers.
- Correction: use Playwright per-test output paths and restore the previously clean screenshots changed by the run. Status: verified by the full host suite and production BEND gate; tracked historical screenshots remained clean.


## LIF-001 — Delayed landing audio startup outlives cleanup (P2)
- Reproduction: enable sound, leave the landing page before `AudioContext.resume()` resolves, then allow it to resolve.
- Expected: the audio context stays closed and no timer starts after departure.
- Observed: the continuation installed a 2.2-second interval after unmount cleanup had already run.
- Evidence/root cause: `Landing.test.tsx` reproduced the delayed completion and failed against the original implementation.
- Correction: verify the resumed context is still current before starting the timer; close a context if resume rejects.
- Status: fixed; three focused unit tests and the complete 79-test host browser regression pass.


## A11Y-001 — Landing copy lacks contrast over the scene (P2)
- Reproduction: open the landing at desktop or 390px width; inspect the supporting copy and orbit instruction over the bright sky/water.
- Expected: readable text against its actual background.
- Observed: the rendered detector reported approximately 2.1:1 for supporting copy and 2.5:1 for the orbit instruction at its default viewport; screenshots confirmed the visual issue. Orbit labels were 10px.
- Root cause: white text relied on a soft shadow over a bright variable image.
- Correction: dark ink over the sky, a white surface behind the instruction, and 11px orbit labels. Desktop and mobile rendered detector reruns no longer reported landing contrast issues; screenshots were visually inspected and all five landing-navigation tests passed. The detector is not a full contrast audit; no dedicated persistent contrast regression test was added.
- Status: fixed for the inspected landing states; full host browser regression rerunning.
