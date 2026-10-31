# Fix log

- BEND recovery test uses the application discard confirmation and checks the current error plus hash mismatch. Verified in the 79-test host suite.
- Portability test enters Studio from its landing page and uses persistent navigation with discard confirmation. The complete clean-context round trip passed in the host suite.
- Phase 6 evidence test uses the current navigation and discard confirmation. Its export and package assertions passed in the host suite.
- Phase 1–4 and Phase 6 evidence writers now use isolated Playwright output paths. The historical screenshots overwritten by the initial run were restored to their clean pre-run state. Host and production gates passed without modifying them.
