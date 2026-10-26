# BEND dependency and security audit

Date: 2026-10-13
Scope: Phase 5.1D local verification; no dependency upgrade or deployment performed.

## Result

`npm audit --json` reported **three advisories**: one moderate and two critical. All are in the development-only Vitest test chain:

| Package | Installed | Severity | Advisory | Available fix |
| --- | --- | --- | --- | --- |
| `@vitest/mocker` | 3.2.7 | Moderate | GHSA-82fw-gwwq-j7x9, path traversal/arbitrary file read in redirect mock | Vitest 5.0.4 major |
| `tinypool` | 1.1.1 | Critical | GHSA-5gmw-xhrv-c9v3 and GHSA-85c8-ppgw-ccpr, prototype-pollution/RCE paths in worker options | Vitest 5.0.4 major |
| `vitest` | 3.2.7 | Critical aggregate | Pulls the two transitive findings above | Vitest 5.0.4 major |

Dependency tree confirmation:

```text
bend-motion-studio@0.1.0
└─┬ vitest@3.2.7
  ├── @vitest/mocker@3.2.7
  └── tinypool@1.1.1
```

The production dependency set contains 28 packages; the audit reports 213 development packages and 243 total packages. The affected packages are not imported by the shipped Vite application path. This is a release risk for running untrusted test code or upgrading the test harness, not evidence that the browser runtime has a reachable production vulnerability.

## Decision

No automatic `npm audit fix --force` was run. The available fix is a Vitest 5 major upgrade and could change test-worker, mocking, and reporter behavior. Track it as a separate dependency maintenance task, run the complete unit/browser suite after the upgrade, and review lockfile changes before release.

## Phase security checks

- Project JSON is normalized before IndexedDB writes.
- Media blobs remain separate from project JSON and are resolved by storage keys.
- Crop/color/anchor/flip fields are bounded scalar data; no project-provided shader, HTML, URL, or executable code is evaluated.
- Direct manipulation does not add a network request, upload, account, analytics, or provider path.
- Export uses the existing local renderer and object-URL lifecycle.
- No dependency or public repository visibility change was made.
