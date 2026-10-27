/* Studio Custom Type bridge.
 *
 * Inserted inside the preserved script.js DOMContentLoaded closure by the
 * Studio Vite plugin. It serializes real motif strokes, image bytes and controls
 * without flattening the typography preview. Original source remains untouched.
 */
(function () {
  "use strict";

  const PROTOCOL_VERSION = "1.0.0";
  const TOOL_ID = "typography";
  const TOOL_STATE_VERSION = "1.0.0";
  const TOOL_STATE_MIME = "application/vnd.studio.typography+json";
  const IMAGE_MIMES = ["image/png", "image/jpeg", "image/webp"];

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
      "import-image",
      "export-image",
      "export-otf",
      "transparent-render",
      "editable-source",
      "bridge",
    ],
    limitations: [
      {
        code: "OTF_ASCII_LINES",
        summary:
          "Native OTF export remains line-segment based, ASCII 32–126, 1000 units/em; uploaded image motifs become one-bit dark runs.",
        environmentDependent: false,
      },
      {
        code: "NETWORK_FACES",
        summary:
          "Serif, monospace and script blending uses Google Fonts. Fallback faces render if the network is unavailable.",
        environmentDependent: true,
      },
    ],
    outputFormats: ["png", "otf"],
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
  let studioImage = null;
  let studioImagePromise = null;

  installEmbedChrome();
  announceReady();
  window.addEventListener("message", handleMessage);
  document.addEventListener("input", markDirty, true);
  document.addEventListener("change", markDirty, true);
  document.addEventListener("pointerup", markDirty, true);

  // Preserve the exact uploaded image bytes while the native upload handler
  // continues to build its normal object URL and motif rectangle.
  const upload = document.getElementById("upload");
  const nativeUploadChange = upload.onchange;
  upload.onchange = function (event) {
    const file = event.target.files && event.target.files[0];
    if (file && file.type && file.type.indexOf("image/") === 0) {
      rememberUploadedImage(file);
    }
    if (nativeUploadChange) return nativeUploadChange.call(this, event);
  };

  function rememberUploadedImage(file) {
    const previousImage = S.img;
    studioImagePromise = file.arrayBuffer().then(function (buffer) {
      const bytes = new Uint8Array(buffer);
      const dataUrl = bytesToDataUrl(bytes, file.type || "image/png");
      const record = {
        dataUrl: dataUrl,
        name: file.name || "motif-image",
        width: 0,
        height: 0,
      };
      studioImage = record;
      const waitForImage = function () {
        if (S.img !== previousImage && S.img && S.img.complete !== false) {
          record.image = S.img;
          record.width = S.img.naturalWidth || S.img.width || 0;
          record.height = S.img.naturalHeight || S.img.height || 0;
          return;
        }
        window.setTimeout(waitForImage, 25);
      };
      waitForImage();
      return record;
    });
  }

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
          "The Studio session does not match this Custom Type editor.",
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
        message: error.message || "Custom Type operation failed.",
        retryable: error.retryable === true,
      };
    }
    return {
      code: "ADAPTER_ERROR",
      message:
        error instanceof Error
          ? error.message
          : "The Custom Type editor could not complete that operation.",
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
        return receiveInputAssets(params);
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
        throw adapterError("UNKNOWN_METHOD", "Unknown Custom Type bridge method: " + method);
    }
  }

  function openResult() {
    return { sessionId: scope.sessionId, capabilities: capabilities, warnings: [] };
  }

  async function receiveInputAssets(assets) {
    const receipts = [];
    for (const input of Array.isArray(assets) ? assets : []) {
      const mime = input && input.asset ? input.asset.mimeType : "";
      if (!input || !input.bytes || IMAGE_MIMES.indexOf(mime) === -1) {
        receipts.push({
          inputLayerId: input && input.layerId,
          accepted: false,
          message:
            "Custom Type accepts PNG, JPEG or WebP motif images. This asset was not used.",
        });
        continue;
      }
      try {
        await setMotifImageFromBytes(
          input.bytes,
          mime,
          (input.asset && input.asset.name) || "studio-motif.png",
          true,
        );
        receipts.push({
          inputLayerId: input.layerId,
          accepted: true,
          localAssetId: "motif-image",
        });
      } catch (error) {
        receipts.push({
          inputLayerId: input.layerId,
          accepted: false,
          message: "The supplied motif image could not be decoded.",
        });
      }
    }
    return receipts;
  }

  async function setMotifImageFromBytes(bytes, mimeType, name, showTypeStage) {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const dataUrl = bytesToDataUrl(copy, mimeType);
    const image = await loadImage(dataUrl);
    const sc = 0.84 / Math.max(image.naturalWidth, image.naturalHeight);
    const w = image.naturalWidth * sc;
    const h = image.naturalHeight * sc;
    S.img = image;
    S.imgBase = { w: w, h: h };
    S.imgScale = 1;
    S.imgRect = { x: 0.5 - w / 2, y: 0.5 - h / 2, w: w, h: h };
    studioImage = {
      dataUrl: dataUrl,
      name: name,
      width: image.naturalWidth,
      height: image.naturalHeight,
      image: image,
    };
    motifChanged();
    updateImageControls();
    if (showTypeStage) showStage("type");
    await nextFrame();
    return true;
  }

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      const image = new Image();
      image.onload = function () {
        resolve(image);
      };
      image.onerror = function () {
        reject(new Error("The motif image could not be decoded."));
      };
      image.src = src;
    });
  }

  function bytesToDataUrl(bytes, mimeType) {
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return "data:" + mimeType + ";base64," + btoa(binary);
  }

  function setSliderValue(id, value) {
    const element = document.getElementById(id);
    if (!element) return;
    element.value = String(value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function currentImageRecord() {
    if (!S.img) return null;
    if (studioImage && studioImage.image === S.img) {
      return {
        dataUrl: studioImage.dataUrl,
        name: studioImage.name,
        width: studioImage.width,
        height: studioImage.height,
      };
    }
    const width = S.img.naturalWidth || S.img.width || 1;
    const height = S.img.naturalHeight || S.img.height || 1;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d").drawImage(S.img, 0, 0, width, height);
    return {
      dataUrl: canvas.toDataURL("image/png"),
      name: "motif-image.png",
      width: width,
      height: height,
    };
  }

  async function serializeSourceState() {
    if (studioImagePromise) {
      try {
        await studioImagePromise;
      } catch (error) {
        // The displayed image is re-encoded below.
      }
    }
    const state = {
      tool: TOOL_ID,
      schemaVersion: TOOL_STATE_VERSION,
      mode: "custom",
      savedAt: new Date().toISOString(),
      state: {
        strokes: S.strokes.map(function (stroke) {
          return {
            w: stroke.w,
            pts: stroke.pts.map(function (point) {
              return [point[0], point[1]];
            }),
          };
        }),
        thickness: S.thickness,
        img: currentImageRecord(),
        imgRect: S.imgRect ? Object.assign({}, S.imgRect) : null,
        imgBase: S.imgBase ? Object.assign({}, S.imgBase) : null,
        imgScale: S.imgScale,
        top: S.top,
        ink: S.ink,
        text: S.text,
        spacing: S.spacing,
        motifSize: S.motifSize,
        letterSize: S.letterSize,
        tracking: S.tracking,
        rotation: S.rotation,
        variation: S.variation,
        weight: S.weight,
        serif: S.serif,
        mono: S.mono,
        script: S.script,
        stretch: S.stretch,
        slant: S.slant,
        stage: panels.type.hidden ? "draw" : "type",
      },
    };
    return {
      tool: TOOL_ID,
      toolStateVersion: TOOL_STATE_VERSION,
      content: JSON.stringify(state),
      mimeType: TOOL_STATE_MIME,
      label: "Custom Type · " + S.text.slice(0, 24),
    };
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
    if (documentState.mode !== "custom") {
      return { restored: false, warnings: ["This is not a Custom Type source document."] };
    }
    const state = documentState.state;
    if (!state || typeof state !== "object" || !Array.isArray(state.strokes)) {
      return { restored: false, warnings: ["The saved Custom Type motif state is missing."] };
    }

    S.strokes = state.strokes.map(function (stroke) {
      return {
        w: Number(stroke.w) || 0.01,
        pts: (stroke.pts || []).map(function (point) {
          return [Number(point[0]), Number(point[1])];
        }),
      };
    });
    S.top = state.top === "image" ? "image" : "doodle";
    S.ink = typeof state.ink === "string" ? state.ink : "#193438";
    S.text = typeof state.text === "string" ? state.text : "Bend";
    document.getElementById("ink").value = S.ink;
    document.getElementById("text").value = S.text;
    document.getElementById("text").dispatchEvent(new Event("input", { bubbles: true }));

    setSliderValue("thickness", Number(state.thickness) || 8);
    setSliderValue("spacing", Math.round((Number(state.spacing) || 0.09) * 1000) / 10);
    setSliderValue("motifSize", Math.round((Number(state.motifSize) || 1.1) * 100));
    setSliderValue("letterSize", Number(state.letterSize) || 180);
    setSliderValue("tracking", Math.round((Number(state.tracking) || 0.02) * 1000) / 10);
    setSliderValue("rotation", Number(state.rotation) || 0);
    setSliderValue("variation", Math.round((Number(state.variation) || 0) * 100));
    setSliderValue("weight", Math.round((Number(state.weight) || 1) * 100));
    setSliderValue("serif", Math.round((Number(state.serif) || 0) * 100));
    setSliderValue("mono", Math.round((Number(state.mono) || 0) * 100));
    setSliderValue("script", Math.round((Number(state.script) || 0) * 100));
    setSliderValue("stretch", Math.round((Number(state.stretch) || 1) * 100));
    setSliderValue("slant", Number(state.slant) || 0);

    if (state.img && state.img.dataUrl) {
      try {
        const image = await loadImage(state.img.dataUrl);
        S.img = image;
        S.imgBase = state.imgBase
          ? { w: Number(state.imgBase.w), h: Number(state.imgBase.h) }
          : {
              w: 0.84,
              h: 0.84 * (image.naturalHeight / Math.max(1, image.naturalWidth)),
            };
        S.imgScale = Number(state.imgScale) || 1;
        S.imgRect = state.imgRect
          ? {
              x: Number(state.imgRect.x),
              y: Number(state.imgRect.y),
              w: Number(state.imgRect.w),
              h: Number(state.imgRect.h),
            }
          : { x: 0.5 - S.imgBase.w / 2, y: 0.5 - S.imgBase.h / 2, w: S.imgBase.w, h: S.imgBase.h };
        studioImage = {
          dataUrl: state.img.dataUrl,
          name: state.img.name || "motif-image",
          width: Number(state.img.width) || image.naturalWidth,
          height: Number(state.img.height) || image.naturalHeight,
          image: image,
        };
      } catch (error) {
        return {
          restored: false,
          warnings: ["The saved Custom Type motif image could not be decoded."],
        };
      }
    } else {
      S.img = null;
      S.imgRect = null;
      S.imgBase = null;
      S.imgScale = 1;
      studioImage = null;
    }

    S.motifVersion++;
    updateImageControls();
    redrawDraw();
    showStage(state.stage === "type" ? "type" : "draw");
    scheduleRender();
    await nextFrame();
    await nextFrame();
    return { restored: true, warnings: [] };
  }

  async function renderArtwork(request) {
    if (!hasMotif()) {
      throw adapterError(
        "RENDER_FAILED",
        "Custom Type has no motif or image to publish.",
        true,
      );
    }
    if (!S.text.replace(/\s/g, "")) {
      throw adapterError("RENDER_FAILED", "Custom Type needs some text to publish.", true);
    }
    try {
      await document.fonts.ready;
    } catch (error) {
      // Fall back to available faces.
    }
    const result = renderComposition(3, null);
    const canvas = result.canvas;
    const blob = await new Promise(function (resolve) {
      canvas.toBlob(resolve, "image/png");
    });
    if (!blob) throw adapterError("RENDER_FAILED", "PNG encoding failed.");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return {
      requestId: request && request.requestId ? request.requestId : "",
      rendered: {
        kind: "image",
        mimeType: "image/png",
        width: canvas.width,
        height: canvas.height,
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
    document.title = "Custom Type · Studio";
    document.body.classList.add("studio-embedded");
    const style = document.createElement("style");
    style.id = "studio-custom-type-embed-style";
    style.textContent = [
      "body.studio-embedded .topbar .home-link{display:none}",
      "body.studio-embedded .topbar .brand{display:none}",
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
      context.setAttribute("data-testid", "custom-type-studio-context");
      const title = document.createElement("strong");
      title.textContent = "Custom Type";
      const meta = document.createElement("span");
      meta.id = "studioCustomTypeContext";
      meta.textContent = "Studio session";
      context.append(title, meta);
      bar.insertBefore(context, bar.firstChild);
    }
    const badge = document.createElement("span");
    badge.hidden = true;
    badge.id = "studioCustomTypeBridgeReady";
    badge.textContent = "ready";
    document.body.appendChild(badge);
  }

  function updateContextChip() {
    const chip = document.getElementById("studioCustomTypeContext");
    if (!chip) return;
    const artboard = lastContext && lastContext.activeArtboard;
    chip.textContent = artboard
      ? "Artboard " +
        String((artboard.index || 0) + 1).padStart(2, "0") +
        " · pattern and letter sizes stay native"
      : "Studio session";
  }

  window.__STUDIO_CUSTOM_TYPE_BRIDGE__ = {
    protocolVersion: PROTOCOL_VERSION,
    toolStateVersion: TOOL_STATE_VERSION,
    snapshot: function () {
      return {
        strokes: S.strokes.map(function (stroke) {
          return { w: stroke.w, points: stroke.pts.length };
        }),
        text: S.text,
        ink: S.ink,
        thickness: S.thickness,
        spacing: S.spacing,
        motifSize: S.motifSize,
        letterSize: S.letterSize,
        tracking: S.tracking,
        rotation: S.rotation,
        variation: S.variation,
        weight: S.weight,
        serif: S.serif,
        mono: S.mono,
        script: S.script,
        stretch: S.stretch,
        slant: S.slant,
        top: S.top,
        stage: panels.type.hidden ? "draw" : "type",
        image: S.img
          ? {
              width: S.img.naturalWidth || S.img.width,
              height: S.img.naturalHeight || S.img.height,
              scale: S.imgScale,
            }
          : null,
        motifVersion: S.motifVersion,
      };
    },
    canvasDataUrl: function () {
      return renderComposition(Math.min(window.devicePixelRatio || 1, 2), null).canvas.toDataURL("image/png");
    },
  };
})();
