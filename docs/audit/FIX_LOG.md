# Fix log

- BEND recovery test uses the application discard confirmation and checks the current error plus hash mismatch. Verified in the 79-test host suite.
- Portability test enters Studio from its landing page and uses persistent navigation with discard confirmation. The complete clean-context round trip passed in the host suite.
- Phase 6 evidence test uses the current navigation and discard confirmation. Its export and package assertions passed in the host suite.
- Phase 1–4 and Phase 6 evidence writers now use isolated Playwright output paths. The historical screenshots overwritten by the initial run were restored to their clean pre-run state. Host and production gates passed without modifying them.
- LIF-001: guarded delayed landing-audio startup and handled rejected resume. Deferred-resume, rapid-off and rejection unit tests passed; see RESOURCE_LIFECYCLE.md.
- A11Y-001: improved landing text contrast and orbit label size without changing the scene or interaction. Rendered desktop and 390px scans and five landing-navigation browser tests passed for the corrected scope.
