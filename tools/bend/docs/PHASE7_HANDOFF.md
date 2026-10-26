# BEND Phase 7 — Handoff

Date: 2026-10-25  
Phase 6B outcome: **BLOCKED for real group-toolset integration.**  
Phase 7 readiness: **NOT READY** for a real-host release; **READY WITH LIMITATIONS** as a BEND-side integration package.

## 1. State handed over

The BEND repository contains:

- the preserved Phase 5.3/5.4/5.5 working tree;
- the Phase 6A local reference host at `/integration` (still labeled **LOCAL TEST HOST**);
- a hardened framework-neutral adapter;
- stable content-derived source revisions;
- runtime validation for video, still, package and host records;
- conformance helpers for hosts;
- revision-safe staging, compare-and-set commit, reference-safe cleanup and abandoned-artifact sweep in the reference host;
- tests and documentation for all of the above.

It does **not** contain, and must not be represented as containing:

- a real group Instagram creative toolset;
- a real host insertion/round-trip;
- a cross-origin bridge;
- production origins, deployment or authentication.

## 2. What Phase 7 can start immediately

These are host-independent and complete:

1. **Adapter consumption** — `createBendIntegrationAdapter()`.
2. **Artifact validation** — `assertValidRenderedMedia`, `assertValidStillMedia`.
3. **Editable package verification** — `verifyEditableSource` / `verifyBendHandoff`.
4. **Source revision identity** — `getProjectVersion`.
5. **Reference lifecycle** — `src/integration/host.ts` demonstrates staging, CAS and cleanup; a real host should transplant the semantics, not the IndexedDB code.
6. **BEND regression** — unit, typecheck, build and Chromium browser suites.

## 3. Blocking dependency for real Phase 7

The group application must supply:

- repository URL/checkout and branch/SHA;
- framework/runtime/package manager and build commands;
- Compose document schema, host layer and timeline model;
- media storage and cleanup policy;
- host/BEND origins and embedding mechanism;
- authentication/authorization requirements;
- existing design-system tokens and test harness;
- sibling-tool artifact interfaces.

Without these, Phase 7 must not claim a real integration, a production security boundary, or end-to-end acceptance.

## 4. Ordered Phase 7 work once the host is available

1. Snapshot the host repository and record its branch/SHA.
2. Identify the host's create/edit/insert/update surfaces and storage API.
3. Choose the smallest mechanism from host evidence: same-origin route/module, iframe, popup or shared package.
4. Implement host-side artifact storage keyed by `sourceProjectId + sourceVersion + hostLayerId`.
5. Implement create → insert → save/reload with video/poster/package.
6. Implement **Edit in BEND** with the stored package and expected source version.
7. Implement update with staged writes and compare-and-set.
8. Preserve host transform, opacity, stacking, timeline offset, playback, audio policy and unrelated layers.
9. Add cancel, failure and stale-revision recovery.
10. Add the real host's media inspection, accessibility and browser journeys.
11. Only then mark Phase 6B/7 integration complete.

## 5. Known risks

| Severity | Risk | Mitigation |
|---|---|---|
| P0 | Real host absent; integration cannot be validated. | Do not ship a real-host claim. Obtain host access first. |
| P1 | Host storage may not support compare-and-set transactions. | Use the documented staged-write/commit/cleanup state machine; keep old artifacts until commit; reference-scan before deletion. |
| P1 | Multi-tab last-writer-wins could still occur in a host without atomic commit. | Add a server/DB-level conditional write or per-composition lock in the real host. |
| P1 | Cross-origin bridge unverified. | Implement exact origins, window validation, request IDs, replay/stale tests only with real origins. |
| P2 | Preview video is ≤720 px wide while still/poster is full canvas. | Host must treat them as separate artifacts with their own dimensions; this is intentional. |
| P2 | `sourceVersion` hashes project content, not binary asset bytes. | Hosts should also use package asset hashes/size for transport integrity; source replacement creates a new asset id. |
| P2 | SwiftShader console warnings in Phase 5.3. | Treat as environment limitation; verify on hardware GPU before production claims. |
| P3 | Historical Playwright specs and `phase6a.mjs` have stale selectors. | Use current manual harnesses until the specs are refreshed. |

## 6. Commands that reproduce the evidence

```powershell
npm run typecheck
npm test -- --reporter=dot
npm run build
node tests/manual/phase5-5-acceptance.mjs
node tests/manual/phase5-4-ui-acceptance.mjs
node tests/manual/phase5-3-acceptance.mjs
```

Do not use `node tests/manual/phase6a.mjs` as a gate until its removed `Generate` selector is updated.

## 7. Git/deployment state

- No commit, tag, push, release or deployment was created.
- Local HEAD remains `343260bb048a111475216ef2141eb5b89144de75`.
- `origin/main` remains `1cfbe6f244820599aaffd91a8f56cc301f1c8a58` (Phase 5.4).
- The Phase 5.5 work remains uncommitted in the original working tree.
- Pre-work snapshot: `C:\Users\User\AppData\Local\Temp\opencode\bend-snapshot-full-20261025`.
- Post-work snapshot: `C:\Users\User\AppData\Local\Temp\opencode\bend-phase6b-final-20261025`.

## 8. Definition of done for Phase 7

Phase 7 is complete only when the actual group application passes the create, insert, place, save/reload, fresh-context reopen, edit, update, cancel/failure, stale-revision, audio, accessibility and browser journeys in [PHASE6B_TEST_REPORT.md](PHASE6B_TEST_REPORT.md), with its own repository and media evidence.

Until then, the accurate description is:

> A hardened, integration-ready BEND adapter and reference lifecycle, with the real group host still unavailable.
