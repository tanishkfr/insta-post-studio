# Phase 5B test report

## Completed

- `npm run typecheck`: passed.
- `npm run verify`: passed, including production build and 73 host unit tests.
- `npm run tool:bend:typecheck`: passed.
- `npm run tool:bend:test`: 131 passed after setting TEMP and TMP to a writable workspace cache. The first attempt failed before running tests because its default sandbox temp path denied rename.
- `npm run tool:bend:build`: passed. Existing large-chunk and mixed dynamic/static import warnings remain.
- Focused Chromium checks before the user requested the browser gate be skipped: all six tools opened from the rail; host rename/duplicate/delete/transform/persistence; reorder/hide/cancel/undo/redo/reload; Image to Vector; Image to Custom Type; Shapes to Image in the mixed pipeline; static layer to BEND derivative; BEND publish/playback/source re-entry; and Image/Type narrow desktop sessions. All reported passing assertions.
- Compact empty-host checks at 390×844 exercised keyboard opening, Escape, explicit Close and opener focus restoration. Screenshots also captured 900×700, 1024×768 and 1440×900. The 900px overlap observed initially was corrected and reinspected. These checks do not establish physical-device or full editor mobile support.
- The isolated Phase 5A preview rendered after the stylesheet split. Strict console/page error collection in the focused six-tool and compact checks reported no errors.

## Baseline and omitted gates

On the unchanged Phase 4 baseline, all 54 Chromium cases reported passing after installing the matching Chromium and setting TEMP/TMP to a writable workspace directory. Playwright hung during server teardown and was interrupted, so the command did not produce a clean successful exit. Initial attempts without the writable temp directory showed canceled downloads; a parallel retry also disturbed trace artifacts, so those runs are not counted as a passing suite. No favicon failure was observed in the completed case assertions; the earlier Phase 5A report remains separate evidence.

The final host browser suite was interrupted at the user's request. `npm run tool:bend:test:browser` and `npm run test:browser:bend:production` were skipped at that request. Consequently there is no completed full final browser gate or production nested-route result for this head. The BEND browser and host regression results from Phase 4 remain historical evidence, not evidence for this head.

No screen-reader, forced-colors, full contrast, real touch-device, Safari or full keyboard audit was performed. The detector reported pre-existing danger accent borders and the specified Instrument Sans font; it does not replace visual or accessibility testing.
