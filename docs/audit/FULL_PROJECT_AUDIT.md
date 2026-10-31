# Full project audit

Status: PARTIAL — not a release qualification. Recovered `0763a9d44decaa28150c819ff5f6c895857e27c8` on `audit/full-closure`; `output/` was untracked before work and preserved. Remote `main` and Phase 6 were `0fca3a5bd84bdc72c765c1735be33491226901ea` at fetch; default branch remains `phase-0/foundation` (`e7b0297`). No merge or deployment performed.

See BUG_REGISTER.md, FIX_LOG.md, TEST_MATRIX.md, UI_UX_FINDINGS.md, REMAINING_LIMITATIONS.md and FINAL_QUALIFICATION.md. The audit is incomplete: do not interpret missing findings as a clean subsystem. Existing phase evidence and feature parity documentation are historical, not proof of current behavior.

Code inspection to date: `IframeToolAdapter.ts` checks the iframe window and exact origin; `assetRepository.ts` hashes data on reads; `projectRepository.ts` uses transactional revision comparisons. These are scoped observations, not a completed security review.

## Scope established so far

The focused clean-context portability journey created one layer from each of Image, Vector, Type Library, Shapes, Generate and Video, exported a package, imported it into a separate browser context, reopened each source, imported a duplicate as a new project, and rejected corrupt and future-version packages. Native functionality beyond the tested scenarios remains source-preserved, not exhaustively verified. The host suite additionally exercises Custom Type, Image→Vector, Image→Type, Shapes→Image, Generate Apply/Undo and static artwork→BEND. See the parity matrix for historical source-level inventory.

A focused export journey validated a real 1080×1350 PNG, the manifest and dimensions in a two-artboard ZIP, and an editable package. Other host tests exercise all three native dimensions, transparent background and selected error paths. The complete requested matrix of blend, transform, mask and asset combinations has not yet been manually audited.

## Measurements and environment

Windows 10.0.26300, Node 24.13.0, AMD Ryzen 7 7840HS, 16 logical CPUs, 15.2 GiB reported RAM. On this machine the 79-test host Chromium suite took 4.7 minutes, the six-source package round-trip test 24.1 seconds, and the production BEND gate 6.5 seconds for two tests. These are whole automated journey durations, not isolated latency or memory measurements. The host production build reported a 1,093 kB main JavaScript bundle (305 kB gzip), and BEND reported 1,566 kB (447 kB gzip); Vite warned about large chunks. No performance regression has been established. The requested separate cold-load, switching, export, memory and resource-cleanup measurements remain outstanding.

