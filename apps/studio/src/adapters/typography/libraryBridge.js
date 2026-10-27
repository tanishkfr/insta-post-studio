/* Studio Type Library bridge.
 *
 * This block is inserted inside the preserved fonts.js DOMContentLoaded closure
 * by the Studio Vite plugin. It can therefore serialize the real S object and
 * the renderer's Float32 distortion field. fonts.js itself remains untouched.
 */
(function () {
  "use strict";

  const PROTOCOL_VERSION = "1.0.0";
  const TOOL_ID = "typography";
  const TOOL_STATE_VERSION = "1.0.0";
  const TOOL_STATE_MIME = "application/vnd.studio.typography+json";

  function parseBootConfig() {
    const prefix = "#studio=";
    if (!location.hash.startsWith(prefix)) return null;
    try {
      return JSON.parse(decodeURIComponent(location.hash.slice(prefix.length)));
    } catch (error) {
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
  if (location.origin !== toolOrigin) return;

  const capabilities = {
    toolId: TOOL_ID,
    adapterVersion: "1.0.0",
    protocolVersion: PROTOCOL_VERSION,
    integrationMode: "isolated-iframe",
    supported: [
      "open-canvas",
      "export-image",
      "transparent-render",
      "editable-source",
      "bridge",
    ],
    limitations: [
      {
        code: "LIBRARY_FONTS_ONLY",
        summary:
          "Type Library uses its preserved system/bundled font catalogue. Image-to-type motif import belongs to Custom Type.",
        environmentDependent: false,
      },
      {
        code: "FIXED_DISTORTION_PLANE",
        summary:
          "The edge-distortion field is canvas-space and only grows; source state stores its full sparse values.",
        environmentDependent: false,
      },
    ],
    outputFormats: ["png"],
    runtimeRequirements: {
      secureContext: false,
      indexedDb: false,
      networkOrigins: ["https://fonts.googleapis.com", "https://fonts.gstatic.com"],
    },
  };

  let initialized = false;
  let openRequest = null;
  let lastContext = null;
  let dirtyTimer = 0;

  installEmbedChrome();
  announceReady();
  window.addEventListener("message", handleMessage);
  document.addEventListener("input", markDirty, true);
  document.addEventListener("change", markDirty, true);
  document.addEventListener("pointerup", markDirty, true);

  function markDirty() {
    if (!initialized) return;
    clearTimeout(dirtyTimer);
    dirtyTimer = window.setTimeout(function () {
      postEvent({ type: "dirty", dirty: true });
    }, 80);
  }

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
      error: { code: code, message: message, retryable: !!retryable },
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
    if (message.protocolVersion !== PROTOCOL_VERSION || !scopesMatch(message.scope)) {
      reply(
        errorResponse(
          message.requestId,
          message.method,
          "SCOPE_MISMATCH",
          "The Studio session does not match this Type editor.",
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
        message: error.message || "Type operation failed.",
        retryable: error.retryable === true,
      };
    }
    return {
      code: "ADAPTER_ERROR",
      message:
        error instanceof Error
          ? error.message
          : "The Type editor could not complete that operation.",
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
      case "tool/initialize":
        if (initialized) return openResult();
        if (params.hostOrigin !== hostOrigin) {
          throw adapterError("ORIGIN_REJECTED", "The host origin supplied to initialize is not trusted.");
        }
        initialized = true;
        return openResult();
      case "tool/open":
        openRequest = params;
        lastContext = params.global || null;
        updateContextChip();
        return openResult();
      case "context/update":
        lastContext = params;
        updateContextChip();
        return {
          applied: true,
          activeArtboardId: params && params.activeArtboard ? params.activeArtboard.id : "",
        };
      case "assets/input":
        return (Array.isArray(params) ? params : []).map(function (asset) {
          return {
            inputLayerId: asset.layerId,
            accepted: false,
            message:
              "Type Library does not consume image inputs. Open Custom Type to use an image motif.",
          };
        });
      case "state/restore":
        return restoreSourceState(params);
      case "state/serialize":
        return serializeSourceState();
      case "render":
        return renderArtwork(params);
      case "capabilities/report":
        return capabilities;
      case "operation/cancel":
        return { cancelled: false };
      case "tool/close":
        clearTimeout(dirtyTimer);
        return { closed: true };
      default:
        throw adapterError("UNKNOWN_METHOD", "Unknown Type Library bridge method: " + method);
    }
  }

  function openResult() {
    return { sessionId: scope.sessionId, capabilities: capabilities, warnings: [] };
  }

  function fieldSnapshot() {
    if (!field || !FW || !FH) return { width: 0, height: 0, values: [] };
    const values = [];
    for (let i = 0; i < FW * FH; i += 1) {
      const fx = field[i * 2];
      const fy = field[i * 2 + 1];
      if (fx !== 0 || fy !== 0) {
        values.push([i, fx, fy]);
      }
    }
    return { width: FW, height: FH, values: values };
  }

  function restoreField(saved) {
    if (
      !saved ||
      !Number.isInteger(saved.width) ||
      !Number.isInteger(saved.height) ||
      saved.width <= 0 ||
      saved.height <= 0 ||
      !saved.width ||
      !saved.height
    ) {
      resetField();
      return;
    }
    const width = Math.min(16384, saved.width);
    const height = Math.min(16384, saved.height);
    field = new Float32Array(width * height * 2);
    FW = width;
    FH = height;
    for (const entry of Array.isArray(saved.values) ? saved.values : []) {
      if (!Array.isArray(entry) || entry.length !== 3) continue;
      const index = entry[0];
      if (!Number.isInteger(index) || index < 0 || index >= width * height) continue;
      field[index * 2] = Number(entry[1]) || 0;
      field[index * 2 + 1] = Number(entry[2]) || 0;
    }
    dirty = { x0: 0, x1: width, y0: 0, y1: height };
  }

  function setSliderValue(id, value) {
    const element = document.getElementById(id);
    if (!element) return;
    element.value = String(value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function findFont(identity) {
    return (
      fonts.find(function (font) {
        return font.name === identity.name && font.kind === identity.kind;
      }) || null
    );
  }

  async function restoreSourceState(payload) {
    if (
      !payload ||
      payload.tool !== TOOL_ID ||
      payload.mimeType !== TOOL_STATE_MIME ||
      payload.toolStateVersion !== TOOL_STATE_VERSION
    ) {
      return {
        restored: false,
        warnings: ["The saved source document is not a supported Type 1.0.0 document."],
      };
    }
    let documentState;
    try {
      const text =
        typeof payload.content === "string"
          ? payload.content
          : new TextDecoder().decode(payload.content);
      documentState = JSON.parse(text);
    } catch (error) {
      return { restored: false, warnings: ["The saved Type document is invalid JSON."] };
    }
    if (!documentState || documentState.tool !== TOOL_ID) {
      return { restored: false, warnings: ["The saved document does not belong to Type."] };
    }
    if (documentState.schemaVersion !== TOOL_STATE_VERSION) {
      return {
        restored: false,
        warnings: [
          "Type source version " +
            String(documentState.schemaVersion) +
            " is not supported by this editor.",
        ],
      };
    }
    if (documentState.mode !== "library") {
      return { restored: false, warnings: ["This is not a Type Library source document."] };
    }
    const state = documentState.state;
    if (!state || typeof state !== "object" || !state.font) {
      return { restored: false, warnings: ["The saved Type Library state is missing."] };
    }
    const font = findFont(state.font);
    if (!font) {
      return {
        restored: false,
        warnings: [
          "The saved font " + String(state.font.name) + " is not available in this Type Library.",
        ],
      };
    }
    if (font.kind === "open" && font.status !== "ready") {
      await loadOne(font);
      if (font.status !== "ready") {
        return {
          restored: false,
          warnings: [
            "The saved font " + font.name + " could not be loaded, so the layer was left unchanged.",
          ],
        };
      }
    }
    try {
      await document.fonts.ready;
    } catch (error) {
      // Fall back to the already loaded FontFace.
    }

    S.font = font;
    document.querySelectorAll(".font-row[aria-current]").forEach(function (row) {
      row.setAttribute("aria-current", String(rowEls.get(font) === row));
    });
    updateCredit();

    if (typeof state.text === "string") {
      S.text = state.text;
      document.getElementById("text").value = state.text;
    }
    if (typeof state.ink === "string") {
      S.ink = state.ink;
      document.getElementById("ink").value = state.ink;
    }
    setSliderValue("size", Number(state.size) || 160);
    setSliderValue("tracking", Math.round((Number(state.tracking) || 0) * 100));
    setSliderValue("weight", Number(state.weight) || 400);
    setSliderValue("strength", Number(state.strength) || 0);
    setSliderValue("brush", Number(state.brush) || 120);
    document.getElementById("preview").classList.toggle("distort", S.strength > 0);

    restoreField(state.field);
    draw();
    await nextFrame();
    await nextFrame();
    return { restored: true, warnings: [] };
  }

  async function serializeSourceState() {
    if (!S.font) throw adapterError("RENDER_FAILED", "Type Library has no selected font.");
    draw();
    const state = {
      tool: TOOL_ID,
      schemaVersion: TOOL_STATE_VERSION,
      mode: "library",
      savedAt: new Date().toISOString(),
      state: {
        text: S.text,
        font: {
          name: S.font.name,
          kind: S.font.kind,
          file: S.font.file,
          source: S.font.source,
          caps: !!S.font.caps,
          family: S.font.family,
        },
        size: S.size,
        tracking: S.tracking,
        weight: S.weight,
        ink: S.ink,
        strength: S.strength,
        brush: S.brush,
        field: fieldSnapshot(),
      },
    };
    return {
      tool: TOOL_ID,
      toolStateVersion: TOOL_STATE_VERSION,
      mimeType: TOOL_STATE_MIME,
      content: JSON.stringify(state),
      label: "Type · " + S.font.name,
    };
  }

  async function renderArtwork(request) {
    if (!S.font || !stackOf(S.font)) {
      throw adapterError(
        "RENDER_FAILED",
        "The selected Type Library font is still loading or unavailable.",
        true,
      );
    }
    try {
      await document.fonts.ready;
    } catch (error) {
      // Use whatever faces are available.
    }
    draw();
    if (!cv.width || !cv.height || cv.style.display === "none") {
      throw adapterError("RENDER_FAILED", "Type Library has no rendered canvas.", true);
    }
    const blob = await new Promise(function (resolve) {
      cv.toBlob(resolve, "image/png");
    });
    if (!blob) throw adapterError("RENDER_FAILED", "PNG encoding failed.");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return {
      requestId: request && request.requestId ? request.requestId : "",
      rendered: {
        kind: "image",
        mimeType: "image/png",
        width: cv.width,
        height: cv.height,
        hasAlpha: true,
      },
      bytes: bytes,
      warnings: [],
    };
  }

  function nextFrame() {
    return new Promise(function (resolve) {
      requestAnimationFrame(function () {
        requestAnimationFrame(resolve);
      });
    });
  }

  function installEmbedChrome() {
    document.title = "Type Library · Studio";
    document.body.classList.add("studio-embedded");
    const style = document.createElement("style");
    style.id = "studio-type-embed-style";
    style.textContent = [
      "body.studio-embedded .topbar .brand,body.studio-embedded .topbar .home-link{display:none}",
      "body.studio-embedded .studio-embed-context{display:flex;align-items:baseline;gap:9px;min-width:0;margin-right:auto}",
      "body.studio-embedded .studio-embed-context strong{font-size:12px;font-weight:650;letter-spacing:.14em;text-transform:uppercase;color:var(--color-accent)}",
      "body.studio-embedded .studio-embed-context span{font-size:11px;color:var(--color-text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      "body.studio-embedded .studio-embed-context .dot{width:5px;height:5px;border-radius:50%;background:var(--color-accent);display:inline-block;margin-right:5px;vertical-align:1px}",
      "@media(max-width:900px){body.studio-embedded .topbar{height:auto;flex-wrap:wrap;padding:8px 12px}}",
    ].join("\n");
    document.head.appendChild(style);
    const bar = document.querySelector(".topbar");
    if (bar) {
      const context = document.createElement("div");
      context.className = "studio-embed-context";
      context.setAttribute("data-testid", "type-studio-context");
      const title = document.createElement("strong");
      title.textContent = "Type Library";
      const meta = document.createElement("span");
      meta.id = "studioTypeContext";
      meta.textContent = "Studio session";
      context.append(title, meta);
      bar.insertBefore(context, bar.firstChild);
    }
    const badge = document.createElement("span");
    badge.hidden = true;
    badge.id = "studioTypeBridgeReady";
    badge.textContent = "ready";
    document.body.appendChild(badge);
  }

  function updateContextChip() {
    const chip = document.getElementById("studioTypeContext");
    if (!chip) return;
    const artboard = lastContext && lastContext.activeArtboard;
    chip.textContent = artboard
      ? "Artboard " +
        String((artboard.index || 0) + 1).padStart(2, "0") +
        " · typography keeps its native size"
      : "Studio session";
  }

  window.__STUDIO_TYPE_LIBRARY_BRIDGE__ = {
    protocolVersion: PROTOCOL_VERSION,
    toolStateVersion: TOOL_STATE_VERSION,
    snapshot: function () {
      const snapshot = fieldSnapshot();
      return {
        font: S.font ? S.font.name : null,
        fontKind: S.font ? S.font.kind : null,
        text: S.text,
        size: S.size,
        tracking: S.tracking,
        weight: S.weight,
        ink: S.ink,
        strength: S.strength,
        brush: S.brush,
        field: { width: snapshot.width, height: snapshot.height, nonZero: snapshot.values.length },
      };
    },
    canvasDataUrl: function () {
      return cv.toDataURL("image/png");
    },
  };
})();
