/* Studio Vector bridge.
 *
 * This file is injected by the Studio Vite adapter plugin immediately after the
 * preserved Vector editor boots, inside the same classic script. That gives the
 * bridge access to the editor's real top-level state (P/HIST/REDO/OV0/SEL/...) so
 * source re-entry is lossless without forking generator, selection or history
 * code. No original Vector source is modified.
 */
(function () {
  "use strict";

  const PROTOCOL_VERSION = "1.0.0";
  const TOOL_ID = "vector";
  const TOOL_STATE_VERSION = "1.0.0";
  const TOOL_STATE_MIME = "application/vnd.studio.vector+json";
  const MODE_NAMES = { s: "Ribbons", l: "Streamlines", c: "Contours" };

  function parseBootConfig() {
    const prefix = "#studio=";
    if (!location.hash.startsWith(prefix)) return null;
    try {
      return JSON.parse(decodeURIComponent(location.hash.slice(prefix.length)));
    } catch {
      return null;
    }
  }

  const boot = parseBootConfig();
  if (!boot || !boot.scope || !boot.origins) return;

  const hostOrigin = boot.origins.hostOrigin;
  const toolOrigin = boot.origins.toolOrigin;
  const scope = boot.scope;
  if (
    boot.protocolVersion !== PROTOCOL_VERSION ||
    scope.toolId !== TOOL_ID ||
    typeof hostOrigin !== "string" ||
    typeof toolOrigin !== "string"
  ) {
    return;
  }

  if (location.origin !== toolOrigin) {
    showFatal("This editor is not running on its expected origin.");
    return;
  }

  const capabilities = {
    toolId: TOOL_ID,
    adapterVersion: "1.0.0",
    protocolVersion: PROTOCOL_VERSION,
    integrationMode: "isolated-iframe",
    supported: [
      "open-canvas",
      "import-image",
      "export-svg",
      "export-image",
      "transparent-render",
      "editable-source",
    ],
    limitations: [
      {
        code: "NO_NODE_EDITING",
        summary:
          "The preserved Vector editor edits generated line objects, not SVG nodes or Bézier control points.",
        environmentDependent: false,
      },
      {
        code: "TEXT_NOT_OBJECTS",
        summary: "Title/body text is preserved SVG text but is not an independently selectable object.",
        environmentDependent: false,
      },
      {
        code: "BROWSER_FONTS",
        summary:
          "Source Sans 3 is loaded from Google Fonts; fallback typography may differ when offline.",
        environmentDependent: true,
      },
    ],
    outputFormats: ["svg", "png"],
    runtimeRequirements: {
      secureContext: false,
      indexedDb: false,
      networkOrigins: ["https://fonts.googleapis.com", "https://fonts.gstatic.com"],
    },
  };

  let initialized = false;
  let openRequest = null;
  let lastContext = null;

  installEmbedChrome();
  announceReady();

  window.addEventListener("message", handleMessage);

  // A lightweight dirty signal helps the Studio session communicate whether
  // there are uncommitted changes; publishing still always captures fresh state.
  let dirtyTimer = 0;
  function markDirty() {
    if (!initialized) return;
    clearTimeout(dirtyTimer);
    dirtyTimer = window.setTimeout(function () {
      postEvent({ type: "dirty", dirty: true });
    }, 60);
  }
  document.addEventListener("input", markDirty, true);
  document.addEventListener("change", markDirty, true);
  document.addEventListener("pointerup", markDirty, true);

  function announceReady() {
    postEvent({ type: "ready", capabilities: capabilities });
  }

  function postEvent(event) {
    const parent = window.parent;
    if (!parent || parent === window) return;
    parent.postMessage(
      {
        protocolVersion: PROTOCOL_VERSION,
        kind: "event",
        scope: scope,
        event: event,
        sentAt: new Date().toISOString(),
      },
      hostOrigin,
    );
  }

  function errorResponse(requestId, method, code, message, retryable) {
    return {
      protocolVersion: PROTOCOL_VERSION,
      kind: "response",
      scope: scope,
      requestId: requestId,
      method: method,
      ok: false,
      error: {
        code: code,
        message: message,
        retryable: !!retryable,
      },
      sentAt: new Date().toISOString(),
    };
  }

  function okResponse(requestId, method, result) {
    return {
      protocolVersion: PROTOCOL_VERSION,
      kind: "response",
      scope: scope,
      requestId: requestId,
      method: method,
      ok: true,
      result: result,
      sentAt: new Date().toISOString(),
    };
  }

  function reply(message) {
    if (window.parent === window) return;
    window.parent.postMessage(message, hostOrigin);
  }

  function scopesMatch(candidate) {
    return (
      candidate &&
      candidate.projectId === scope.projectId &&
      candidate.sessionId === scope.sessionId &&
      candidate.toolId === scope.toolId &&
      candidate.channelId === scope.channelId
    );
  }

  function handleMessage(event) {
    if (event.source !== window.parent) return;
    if (event.origin !== hostOrigin) return;
    const message = event.data;
    if (!message || typeof message !== "object" || message.kind !== "request") return;
    if (typeof message.requestId !== "string" || typeof message.method !== "string") return;
    if (
      message.protocolVersion !== PROTOCOL_VERSION ||
      !scopesMatch(message.scope)
    ) {
      reply(
        errorResponse(
          message.requestId,
          message.method,
          "SCOPE_MISMATCH",
          "The Studio session does not match this Vector editor.",
          false,
        ),
      );
      return;
    }

    Promise.resolve()
      .then(function () {
        return dispatch(message.method, message.params || {});
      })
      .then(function (result) {
        reply(okResponse(message.requestId, message.method, result));
      })
      .catch(function (error) {
        const structured = structuredError(error);
        reply(
          errorResponse(
            message.requestId,
            message.method,
            structured.code,
            structured.message,
            structured.retryable,
          ),
        );
      });
  }

  function structuredError(error) {
    if (error && typeof error === "object" && typeof error.code === "string") {
      return {
        code: error.code,
        message: error.message || "Vector operation failed.",
        retryable: error.retryable === true,
      };
    }
    return {
      code: "ADAPTER_ERROR",
      message:
        error instanceof Error
          ? error.message
          : "The Vector editor could not complete that operation.",
      retryable: false,
    };
  }

  function adapterError(code, message, retryable) {
    const error = new Error(message);
    error.code = code;
    error.retryable = !!retryable;
    return error;
  }

  function dispatch(method, params) {
    switch (method) {
      case "tool/initialize": {
        if (initialized) {
          return openResult();
        }
        if (params.hostOrigin !== hostOrigin) {
          throw adapterError(
            "ORIGIN_REJECTED",
            "The host origin supplied to initialize is not trusted.",
          );
        }
        initialized = true;
        return openResult();
      }
      case "tool/open": {
        openRequest = params;
        lastContext = params.global || null;
        updateContextChip();
        return openResult();
      }
      case "context/update": {
        lastContext = params;
        updateContextChip();
        return {
          applied: true,
          activeArtboardId: params && params.activeArtboard ? params.activeArtboard.id : "",
        };
      }
      case "assets/input":
        return receiveInputAssets(params);
      case "state/restore":
        return restoreSourceState(params);
      case "state/serialize":
        return serializeSourceState();
      case "render":
        postEvent({ type: "progress", operation: "render", progress: 0.35 });
        return renderArtwork(params);
      case "capabilities/report":
        return capabilities;
      case "operation/cancel":
        return { cancelled: false };
      case "tool/close":
        return { closed: true };
      default:
        throw adapterError("UNKNOWN_METHOD", "Unknown Vector bridge method: " + method);
    }
  }

  function openResult() {
    return {
      sessionId: scope.sessionId,
      capabilities: capabilities,
      warnings: [],
    };
  }

  async function receiveInputAssets(assets) {
    const receipts = [];
    for (const input of Array.isArray(assets) ? assets : []) {
      const mimeType = input && input.asset ? input.asset.mimeType : "";
      if (
        !input ||
        !input.bytes ||
        ["image/png", "image/jpeg", "image/webp"].indexOf(mimeType) === -1
      ) {
        receipts.push({
          inputLayerId: input && input.layerId,
          accepted: false,
          message:
            "Vector image tracing accepts PNG, JPEG or WebP rasters. This asset was not imported.",
        });
        continue;
      }
      const before = res && res.items ? res.items.length : 0;
      try {
        const copy = new Uint8Array(input.bytes.byteLength);
        copy.set(input.bytes);
        const file = new File(
          [copy.buffer],
          (input.asset && input.asset.name) || "studio-image.png",
          { type: mimeType },
        );
        await impFile(file);
      } catch (error) {
        receipts.push({
          inputLayerId: input.layerId,
          accepted: false,
          message: "The raster input could not be imported by the preserved Vector importer.",
        });
        continue;
      }
      const after = res && res.items ? res.items.length : 0;
      receipts.push({
        inputLayerId: input.layerId,
        accepted: after > before,
        message:
          after > before
            ? "Raster traced into " +
              String(after - before) +
              " editable contour lines. This is a conversion, not a live image link."
            : "The raster produced no editable contour lines. Try higher-contrast artwork.",
      });
      if (after > before) {
        postEvent({ type: "dirty", dirty: true });
      }
    }
    return receipts;
  }

  function restoreSourceState(payload) {
    if (
      !payload ||
      payload.tool !== TOOL_ID ||
      payload.mimeType !== TOOL_STATE_MIME ||
      payload.toolStateVersion !== TOOL_STATE_VERSION
    ) {
      return {
        restored: false,
        warnings: [
          "The saved source document is not a supported Vector 1.0.0 document.",
        ],
      };
    }
    let documentState;
    try {
      const text =
        typeof payload.content === "string"
          ? payload.content
          : new TextDecoder().decode(payload.content);
      documentState = JSON.parse(text);
    } catch {
      return { restored: false, warnings: ["The saved Vector document is invalid JSON."] };
    }
    if (!documentState || documentState.tool !== TOOL_ID) {
      return { restored: false, warnings: ["The saved document does not belong to Vector."] };
    }
    if (documentState.schemaVersion !== TOOL_STATE_VERSION) {
      return {
        restored: false,
        warnings: [
          "Vector source version " +
            String(documentState.schemaVersion) +
            " is not supported by this editor.",
        ],
      };
    }
    if (!documentState.params || typeof documentState.params !== "object") {
      return { restored: false, warnings: ["The saved Vector parameters are missing."] };
    }

    const params = deepClone(documentState.params);
    P = Object.assign({}, FlowEngine.defaults, params);
    P.ov = params.ov && typeof params.ov === "object" ? deepClone(params.ov) : {};
    P.baked = Array.isArray(params.baked) ? deepClone(params.baked) : null;
    HIST = Array.isArray(documentState.history) ? deepClone(documentState.history) : [];
    REDO = Array.isArray(documentState.redo) ? deepClone(documentState.redo) : [];
    OV0 =
      documentState.initialOverrides && typeof documentState.initialOverrides === "object"
        ? deepClone(documentState.initialOverrides)
        : null;
    const view = documentState.view || {};
    ZOOM = typeof view.zoom === "number" ? view.zoom : 1;
    SNAP = typeof view.snap === "boolean" ? view.snap : true;
    SEL = new Set(
      Array.isArray(view.selection)
        ? view.selection.filter(function (index) {
            return Number.isInteger(index) && index >= 0;
          })
        : [],
    );
    LASTRECT = null;
    PREV = null;
    pkey = "";
    clearTimeout(dirtyTimer);

    tab(view.activeTab === "edit" ? "edit" : "gen");
    const snapButton = $("#tSnap");
    snapButton.classList.toggle("on", SNAP);
    snapButton.setAttribute("aria-pressed", String(SNAP));
    refresh();
    // Guarantee the DOM is current before the host asks for a render.
    drawNow();
    SEL = new Set(
      Array.from(SEL).filter(function (index) {
        return res && res.items && index < res.items.length;
      }),
    );
    selChanged();

    return { restored: true, warnings: [] };
  }

  function serializeSourceState() {
    const documentState = {
      tool: TOOL_ID,
      schemaVersion: TOOL_STATE_VERSION,
      savedAt: new Date().toISOString(),
      params: deepClone(P),
      history: deepClone(HIST),
      redo: deepClone(REDO),
      initialOverrides: OV0 ? deepClone(OV0) : null,
      view: {
        zoom: ZOOM,
        snap: SNAP,
        activeTab: curTab === "edit" ? "edit" : "gen",
        selection: Array.from(SEL),
      },
    };
    return {
      tool: TOOL_ID,
      toolStateVersion: TOOL_STATE_VERSION,
      mimeType: TOOL_STATE_MIME,
      content: JSON.stringify(documentState),
      label:
        "Vector " +
        (MODE_NAMES[P.mode] || "artwork") +
        " · seed " +
        String(P.seed),
    };
  }

  function renderArtwork(request) {
    if (!res || !res.svg) {
      throw adapterError("RENDER_FAILED", "Vector has no artwork to publish.", true);
    }
    // Bring the rendered DOM in sync with the current editor state before
    // capturing. Selection overlays are removed by the host renderer as well.
    drawNow();
    const liveSvg = $("#stage svg");
    if (!liveSvg) {
      throw adapterError("RENDER_FAILED", "Vector's SVG canvas is unavailable.", true);
    }
    const clone = liveSvg.cloneNode(true);
    clone.querySelectorAll("#ovl").forEach(function (node) {
      node.remove();
    });
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const sourceWidth =
      (request && request.artboard && request.artboard.width) || res.W;
    const sourceHeight =
      (request && request.artboard && request.artboard.height) || res.H;
    void sourceWidth;
    void sourceHeight;
    const serialized = new XMLSerializer().serializeToString(clone);
    const bytes = new TextEncoder().encode(serialized);
    return {
      requestId: request && request.requestId ? request.requestId : "",
      rendered: {
        kind: "svg",
        mimeType: "image/svg+xml",
        width: res.W,
        height: res.H,
        hasAlpha: true,
      },
      bytes: bytes,
      warnings: [],
    };
  }

  function deepClone(value) {
    if (value === null || typeof value !== "object") return value;
    return JSON.parse(JSON.stringify(value));
  }

  function installEmbedChrome() {
    document.title = "Vector · Studio";
    document.body.classList.add("studio-embedded");
    const style = document.createElement("style");
    style.id = "studio-vector-embed-style";
    style.textContent = [
      "body.studio-embedded header .brand{display:none}",
      "body.studio-embedded .studio-embed-context{display:flex;align-items:baseline;gap:9px;min-width:0;margin-right:auto}",
      "body.studio-embedded .studio-embed-context strong{font-size:12px;font-weight:650;letter-spacing:.14em;text-transform:uppercase;color:var(--color-accent)}",
      "body.studio-embedded .studio-embed-context span{font-size:11px;color:var(--color-text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      "body.studio-embedded .studio-embed-context .dot{width:5px;height:5px;border-radius:50%;background:var(--color-accent);display:inline-block;margin-right:5px;vertical-align:1px}",
      "@media(max-width:767px){body.studio-embedded .studio-embed-context span{display:none}}",
    ].join("\n");
    document.head.appendChild(style);
    const header = document.querySelector("header");
    if (header) {
      const context = document.createElement("div");
      context.className = "studio-embed-context";
      context.setAttribute("data-testid", "vector-studio-context");
      const title = document.createElement("strong");
      title.textContent = "Vector";
      const meta = document.createElement("span");
      meta.id = "studioVectorContext";
      meta.textContent = "Studio session";
      context.append(title, meta);
      header.insertBefore(context, header.firstChild);
    }
    const bridgeBadge = document.createElement("span");
    bridgeBadge.hidden = true;
    bridgeBadge.id = "studioVectorBridgeReady";
    bridgeBadge.textContent = "ready";
    document.body.appendChild(bridgeBadge);
  }

  function updateContextChip() {
    const chip = document.getElementById("studioVectorContext");
    if (!chip) return;
    const artboard = lastContext && lastContext.activeArtboard;
    if (!artboard) {
      chip.textContent = "Studio session";
      return;
    }
    const ratio =
      artboard.width > artboard.height
        ? "Landscape"
        : artboard.width === artboard.height
          ? "Square"
          : artboard.width / artboard.height === 0.8
            ? "4:5"
            : "Portrait";
    chip.innerHTML = "";
    const dot = document.createElement("i");
    dot.className = "dot";
    dot.setAttribute("aria-hidden", "true");
    chip.appendChild(dot);
    chip.appendChild(
      document.createTextNode(
        "Artboard " +
          String((artboard.index || 0) + 1).padStart(2, "0") +
          " · " +
          ratio +
          " · " +
          artboard.width +
          "×" +
          artboard.height,
      ),
    );
  }

  function showFatal(message) {
    const node = document.createElement("div");
    node.setAttribute("role", "alert");
    node.style.cssText =
      "position:fixed;inset:0;z-index:9999;display:grid;place-items:center;background:#fff;color:#7a1f1f;font:500 14px/1.5 'Instrument Sans',sans-serif;padding:24px;text-align:center";
    node.textContent = message;
    document.body.appendChild(node);
  }

  window.__STUDIO_VECTOR_BRIDGE__ = {
    protocolVersion: PROTOCOL_VERSION,
    toolStateVersion: TOOL_STATE_VERSION,
    serializeSourceState: serializeSourceState,
  };
})();
