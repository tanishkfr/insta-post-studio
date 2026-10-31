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
