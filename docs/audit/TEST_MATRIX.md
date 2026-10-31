# Test matrix

| Check | Result | Evidence / limits |
| --- | --- | --- |
| `npm run typecheck` | PASS | Contracts and host |
| `npm run verify` | PASS | Full build; 80 host unit tests |
| `CI=1 npm run test:browser` | PASS | 79 Chromium tests, clean exit, 4.7 minutes |
| `npm run tool:shapes:test` | PASS | 23 tests |
| `npm run tool:shapes:build` | PASS | Included in verify and production build |
| `npm run tool:bend:typecheck` | PASS | TypeScript |
| `npm run tool:bend:test` | PASS | 131 tests, writable TEMP/TMP |
| `npm run tool:bend:build` | PASS | Included in verify and production build |
| `npm run tool:bend:test:browser` | PASS with skips | 35 passed, 3 existing Firefox codec/export skips |
| `npm run test:browser:bend:production` | PASS | 2 Chromium tests, nested route and bridge |

Browser gates ran outside the sandbox because Firefox exited at launch and browser-server teardown hung inside it. `PLAYWRIGHT_BROWSERS_PATH` selected the installed browsers and TEMP/TMP pointed to writable workspace storage. The initial BEND unit run failed before executing tests due to temp-file permissions; the isolated-temp rerun passed. The clean-context portability test includes six source re-entries, duplicate import, corrupt hash rejection and future-version rejection. Full manual, accessibility, physical-device and performance qualification remains outstanding.

## Qualification follow-up (2026-10-31)

| Check | Result |
| --- | --- |
| Pre-change `npm run typecheck`, `npm run verify` | PASS; 80 host unit tests |
| Post-change `npm run typecheck`, `npm run verify` | PASS; 82 host unit tests at the time, including two new lifecycle tests |
| Focused landing lifecycle regression | PASS; 3 tests, including the subsequently added rapid-off case |
| Host Chromium browser suite | PASS; 79 tests, 11.0 minutes |
| Isolated 10-cycle tool and emulated keyboard/responsive checks | PASS; 2 checks; limitations in RESOURCE_LIFECYCLE.md and ACCESSIBILITY_REVIEW.md |
| Shapes unit tests and build | PASS; 23 tests; build in verify |
| BEND typecheck, unit tests and build | PASS; 131 tests; build in verify |
| BEND browser | PASS with 3 existing Firefox skips; 35 passed |
| Production BEND browser | PASS; 2 tests |

The verified baseline GitHub run 41193174981 passed both jobs at `c94ce6a`; the follow-up branch's final CI must be checked separately.

After the 79-test run, A11Y-001 changed landing CSS. Five focused landing/navigation browser tests passed and the full host browser regression was restarted; final CI must be assessed at the last pushed SHA.
