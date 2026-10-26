# BEND. embedding decision

> **2026-10-25 update:** real Phase 6B host discovery is **BLOCKED**. No group application was found in accessible repositories, so no cross-origin or same-origin host binding has been implemented or claimed. The Phase 6A `/integration` route remains a local reference host. See [PHASE6B_IMPLEMENTATION.md](PHASE6B_IMPLEMENTATION.md).

## Phase 6A choice

The primary Phase 6A integration surface is a same-origin, isolated `/integration` route inside the standalone BEND app, backed by the framework-neutral integration adapter. It is a functional Instagram-shaped host harness, not the real group application.

The route was chosen because it proves the lifecycle with real browser storage, Blob media, video playback, still output, host transforms, reload, cancel, and round-trip editing without inventing a framework or repository that the group app has not supplied. The adapter keeps the actual boundary independent of this route's React UI.

## Why this is the smallest honest boundary

- It reuses BEND's existing compositor/export path instead of duplicating it in a mock host.
- It proves that the host consumes ordinary rendered media and an editable package, not object URLs or BEND's internal renderer state.
- It keeps local source media and host media in explicit stores with cleanup/error paths.
- It avoids a speculative postMessage protocol before the group app's deployment origins and lifecycle are known.
- It preserves BEND as a standalone motion studio and does not claim integration into the unavailable group website.

The trade-off is that this does not prove a cross-origin iframe or popup. That is intentionally a Phase 6B decision: a real origin boundary needs real origin values, deployment headers, lifecycle ownership, and browser tests against the actual host.

## Phase 6B bridge requirements

If the group app chooses an isolated iframe or popup, the bridge must add all of the following before production use:

1. An exact allowlisted sender origin and exact destination origin; no `*` trust.
2. Sender/source-window validation on every message.
3. A versioned discriminated message schema with runtime validation.
4. An explicit request/response handshake and request identifiers.
5. Timeout, cancellation, disposal, and editor-close behavior.
6. A validated archive or structured-clone-compatible binary handoff; never pass a temporary BEND Blob URL and expect another origin to resolve it.
7. Host-controlled authorization to open only the intended local project/layer.
8. Origin and schema negative tests, including malformed payloads and stale request ids.

The exact API and acceptance checklist are recorded in [PHASE6B_HANDOFF.md](PHASE6B_HANDOFF.md). Until those inputs exist, `/integration` is the only claimed integration demonstration.
