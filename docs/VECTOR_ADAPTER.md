# Vector Adapter — Studio 2.0 Phase 1

## Status

The preserved Vector editor is fully integrated as Studio's first live tool.

- Original file: `tools/legacy/vector/arnav.html`
- Original SHA-256: `24633B7233A5E7AD088D1E4423AACD21D838F215654F838170077328C1CB5AA2`
- Integration entry: `/tools/vector/adapter.html` (generated at dev/build time)
- Host adapter: `apps/studio/src/adapters/iframe/IframeToolAdapter.ts`
- Tool bridge: `apps/studio/src/adapters/vector/vectorBridge.js`
- Publishing/sanitization: `apps/studio/src/adapters/vector/`

The original Vector file is **not edited**. The Vite plugin reads it, injects the bridge into the same classic script immediately after the editor boots, and serves/emits a separate page. A unit guard fails if the original file hash changes. The original standalone entry remains available at `tools/legacy/vector/arnav.html` and is covered by a browser regression test.

## Why this approach

The preserved editor keeps its real document in top-level `P`, `HIST`, `REDO`, `OV0`, `SEL`, `ZOOM`, `SNAP` and `curTab` bindings. The injected bridge runs in that same classic script, after `rebuild()`, so it can read and restore those bindings without copying generator code, adding an unofficial public API to the original, or flattening the tool into a static SVG viewer. All original controls, event handlers and algorithms continue to run.

```
Studio App (React 19 host)
├─ StudioProject store + IndexedDB persistence
├─ IframeToolAdapter (secure transport)
│  └─ exact-origin / exact-window / exact-scope messaging
└─ <iframe src="/tools/vector/adapter.html">
   └─ injected Studio bridge (same script scope as preserved state)
      └─ original Vector editor (unchanged)
```

## Launch and handshake

1. Vector session creates a unique `sessionId` and `channelId`.
2. Host creates an iframe and an `IframeToolAdapter` with exact host/tool origins.
3. Host writes a boot config into the iframe URL fragment:
   - protocol version
   - project/session/tool/channel scope
   - exact host and tool origins
4. The bridge validates its own origin and the boot config, then posts `ready` to the exact host origin.
5. Host accepts `ready` only when:
   - `event.source === iframe.contentWindow`
   - `event.origin === expected tool origin`
   - protocol and full scope match.
6. Host sends `tool/initialize`, then `tool/open` with `StudioGlobalContext` and project/artboard data.
7. When editing an existing layer, host loads the source-state blob, validates it and sends `state/restore`.

The iframe remains transparent/covered by a loading surface until initialization and restoration finish. Errors are shown in the host overlay with Retry and Back actions.

## Secure transport

Implemented in `apps/studio/src/adapters/iframe/IframeToolAdapter.ts` and `protocol.ts`.

- Exact HTTP(S) origins, no wildcard `postMessage`.
- Expected sender is the exact iframe `contentWindow`; messages from the parent, another frame or a popup are ignored.
- Exact project/session/tool/channel scope.
- Protocol version checks.
- Unique request IDs, request-to-method matching and one-pending-request guard.
- Handshake and request timeouts.
- Cancellation rejects pending work and sends `operation/cancel`.
- Stale/unsolicited responses are rejected and reported through an observable protocol callback.
- Listener, timers and pending requests are cleaned up on `close()` / `dispose()`.
- Binary bytes travel as `Uint8Array` through structured clone.
- Typed `ToolAdapterTransportError` values are translated into user-facing messages.
- Cleanup is idempotent and safe on unmount.

## Vector source state (`1.0.0`)

MIME: `application/vnd.studio.vector+json`

```json
{
  "tool": "vector",
  "schemaVersion": "1.0.0",
  "savedAt": "…",
  "params": { "mode": "s", "seed": 4242, "…": "full native P object", "ov": {}, "baked": null },
  "history": [],
  "redo": [],
  "initialOverrides": null,
  "view": {
    "zoom": 1,
    "snap": true,
    "activeTab": "gen",
    "selection": []
  }
}
```

This preserves:

- All generator parameters, seed, palette/colours and text.
- Full per-line overrides (`ov`).
- Baked/manual geometry including each object's transform matrix, fill, stroke, opacity, clipping and hidden state.
- Native undo/redo stacks and the original generated-state sentinel.
- Selection, zoom, snap and active inspector tab.

Every publish creates a new immutable source-state record (content-addressed) and increments `ToolSourceStateReference.revision`. Old records remain readable for project undo/history. Unsupported versions fail before the iframe opens and leave the existing layer untouched.

## SVG rendering and sanitization

Publishing always asks the editor for a fresh render; a prior DOM snapshot is never reused.

1. Bridge calls `drawNow()` so pending slider changes are reflected.
2. Clones the live `#stage svg`.
3. Removes `#ovl` (selection/editor overlay).
4. Preserves the native viewBox and artwork dimensions.
5. Serializes the SVG as bytes.
6. Host parses and sanitizes it with an allowlist:
   - removes scripts, event handlers, `foreignObject`, embedded/external images, `use`, links, styles and unknown elements;
   - permits only internal `url(#…)` references;
   - rejects malformed SVG, missing viewBox and unsafe references.
7. Host stores the sanitized SVG blob in IndexedDB and verifies the stored hash before the project references it.

The SVG is rendered inline by the host canvas using the stored sanitized markup. The Vector canvas's authored background is preserved as part of the artwork; the asset itself is not rasterized or flattened, and transparency outside/within the artwork is preserved where authored.

## Publish / update workflow

`captureVectorArtwork()`:

1. Requests the editable source document and validates tool/MIME/version.
2. Persists the source blob with the next revision.
3. Requests a fresh SVG render.
4. Sanitizes and stores the SVG asset.
5. Reads both records back to verify integrity.
6. Returns references; only then does the host commit the project/layer.

New artwork creates a `SharedLayer` with:

- recognizable name such as `Vector · Ribbons 4242`;
- centered, aspect-preserving initial transform;
- `sourceState`, `rendered`, project asset reference;
- source tool `vector`, layer kind `vector`, order at top of the active artboard.

Republishing an existing layer updates **only** source state and rendered output. The layer ID, name, transform, rotation, opacity, visibility, lock, artboard assignment and stacking order stay unchanged, so no duplicate layer is created. The host then saves the project and closes the session only after the project write succeeds.

## Host compositor scope

This is deliberately a minimal compositor:

- Active artboard, format background, SVG layers.
- Position, width/height (aspect-preserving resize), rotation, scale/flip rendering, opacity, visibility.
- Selection outline and direct move/resize with artboard clamping.
- Layer panel: select, rename, reorder, hide, lock, duplicate, delete, edit source.
- Inspector: source/version, name, X/Y, width/height, rotation, opacity, visibility, lock, Edit in Vector, Download SVG.
- Undo/redo for committed host-document mutations, persisted through autosave.
- New project creation; latest project auto-load.
- No final multi-layer export, raster compositor, artboard manager, masks or timeline yet.

## Known limitations

- Vector and host currently share an origin in deployment. The transport is origin-exact and ready for a dedicated tool origin, but a separate production origin/proxy is future work.
- The adapter's first version is Vector-specific at the session layer; the transport and contracts are generic.
- Vector consumes no external asset inputs in Phase 1 (receipts report not accepted). It imports inside its own preserved UI.
- Source version `1.0.0` is the only supported Vector schema; no source migration exists yet.
- Original Vector limits remain: no node/Bézier editing, text is not an independently selectable object, and browser fonts affect PNG/OTF rendering.
- Assets are never deleted after republish; this protects undo/history but requires a future reference-aware garbage collector.
- Browser acceptance is Chromium-only at 1440×900.
- Original Vector export/import/clipboard actions are preserved but not all are exercised by automated acceptance; see the feature matrix.
- Host undo history is in-memory only; the durable project and all referenced source/rendered assets survive reload.

## Commands

```powershell
cd apps/studio
npm run test:browser
npx playwright test tests/browser/vector-roundtrip.spec.ts --project=chromium
npx playwright test tests/browser/transport.spec.ts --project=chromium
```

The browser config starts three isolated servers:

- Studio host: `http://127.0.0.1:4175`
- Fake cross-origin adapter: `http://127.0.0.1:4189`
- Preserved standalone legacy vector: `http://127.0.0.1:4187/vector/arnav.html`
