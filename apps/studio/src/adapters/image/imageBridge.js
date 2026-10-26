/* Studio Image bridge.
 *
 * Injected by the Studio Vite adapter plugin at the end of the preserved Image
 * editor's classic script. It therefore reads and restores the editor's real
 * top-level S/img/hist/mk/PH state without copying any filter or export code.
 * The original file remains byte-identical.
 */
(function () {
  "use strict";

  const PROTOCOL_VERSION = "1.0.0";
  const TOOL_ID = "image";
  const TOOL_STATE_VERSION = "1.0.0";
  const TOOL_STATE_MIME = "application/vnd.studio.image+json";
  const IMAGE_MIMES = ["image/png", "image/jpeg", "image/webp"];

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
      "export-image",
      "transparent-render",
      "editable-source",
      "bridge",
    ],
    limitations: [
      {
        code: "SINGLE_SOURCE_PHOTO",
        summary:
          "The preserved Image editor has one source photo. Replacing it inside the editor replaces the layer's input photo.",
        environmentDependent: false,
      },
      {
        code: "SYNCHRONOUS_EFFECTS",
        summary:
          "Heavy pattern/trace effects run synchronously. Full-resolution publishing may take several seconds.",
        environmentDependent: false,
      },
      {
        code: "MOTION_GIF",
        summary:
          "Animated GIF export uses the editor's native 10/12/15 fps and 360/480/600 px controls.",
        environmentDependent: false,
      },
    ],
    outputFormats: ["png", "zip", "gif"],
    runtimeRequirements: {
      secureContext: false,
      indexedDb: false,
    },
  };

  let initialized = false;
  let openRequest = null;
  let lastContext = null;
  let hostArtboard = null;
  let hostFormat = null;
  let studioPhoto = null;
  let studioPhotoPromise = null;
  let dirtyTimer = 0;

  installEmbedChrome();
  announceReady();
  window.addEventListener("message", handleMessage);
  document.addEventListener("input", markDirty, true);
  document.addEventListener("change", markDirty, true);
  document.addEventListener("pointerup", markDirty, true);

  // Capture the exact bytes of photos imported through the editor's normal
  // upload/drop/paste path. The native loader continues to run untouched.
  const nativeLoadFile = loadFile;
  loadFile = function (file) {
    if (file && file.type && file.type.indexOf("image/") === 0) {
      rememberImportedFile(file);
    }
    return nativeLoadFile(file);
  };

  function rememberImportedFile(file) {
    const previousImage = img;
    studioPhotoPromise = file.arrayBuffer().then(function (buffer) {
      const bytes = new Uint8Array(buffer);
      const record = {
        bytes: bytes,
        mimeType: file.type || "image/png",
        name: file.name || "Pasted image",
      };
      studioPhoto = record;
      const waitForNewImage = function () {
        if (img !== previousImage && img) {
          record.width = img.naturalWidth || img.width || 0;
          record.height = img.naturalHeight || img.height || 0;
          record.image = img;
          return;
        }
        window.setTimeout(waitForNewImage, 25);
      };
      waitForNewImage();
      return record;
    });
  }

  function markDirty() {
    if (!initialized) return;
    clearTimeout(dirtyTimer);
    dirtyTimer = window.setTimeout(function () {
      postEvent({ type: "dirty", dirty: true });
    }, 60);
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
          "The Studio session does not match this Image editor.",
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
        message: error.message || "Image operation failed.",
        retryable: error.retryable === true,
      };
    }
    return {
      code: "ADAPTER_ERROR",
      message:
        error instanceof Error
          ? error.message
          : "The Image editor could not complete that operation.",
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
        applyHostContext(lastContext);
        updateContextChip();
        return openResult();
      case "context/update":
        lastContext = params;
        applyHostContext(lastContext);
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
        throw adapterError("UNKNOWN_METHOD", "Unknown Image bridge method: " + method);
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
            "Image accepts PNG, JPEG or WebP source-photo inputs. This asset was not used.",
        });
        continue;
      }
      try {
        await loadPhotoFromBytes(
          input.bytes,
          mime,
          (input.asset && input.asset.name) || "Studio image input",
        );
        receipts.push({
          inputLayerId: input.layerId,
          accepted: true,
          localAssetId: "source-photo",
        });
      } catch (error) {
        receipts.push({
          inputLayerId: input.layerId,
          accepted: false,
          message: "The supplied source photo could not be decoded.",
        });
      }
    }
    return receipts;
  }

  async function loadPhotoFromBytes(bytes, mimeType, name) {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const blob = new Blob([copy.buffer], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const image = new Image();
    try {
      await new Promise(function (resolve, reject) {
        image.onload = resolve;
        image.onerror = reject;
        image.src = url;
      });
    } finally {
      URL.revokeObjectURL(url);
    }
    img = image;
    studioPhoto = {
      bytes: copy,
      mimeType: mimeType,
      name: name,
      width: image.naturalWidth,
      height: image.naturalHeight,
      image: image,
    };
    imgV++;
    document.getElementById("hn").value = name.replace(/\.[^.]+$/, "");
    build();
    draw();
  }

  function applyHostContext(context) {
    const artboard = context && context.activeArtboard;
    if (!artboard || !artboard.width || !artboard.height) return;
    hostArtboard = artboard;
    const ratio = artboard.width / artboard.height;
    const format =
      Math.abs(ratio - 0.8) < 0.001
        ? "4:5"
        : Math.abs(ratio - 1) < 0.001
          ? "1:1"
          : Math.abs(ratio - 9 / 16) < 0.001
            ? "9:16"
            : null;
    if (!format) return;
    hostFormat = format;
    const select = document.getElementById("fmt");
    if (select.value !== format) {
      select.value = format;
      mkFit();
      go();
    }
  }

  function requiredArtboardFormat(request) {
    const artboard = request && request.artboard;
    if (!artboard || !artboard.width || !artboard.height) {
      throw adapterError("RENDER_FAILED", "No Studio artboard was supplied for Image rendering.");
    }
    const ratio = artboard.width / artboard.height;
    if (Math.abs(ratio - 0.8) < 0.001) return "4:5";
    if (Math.abs(ratio - 1) < 0.001) return "1:1";
    if (Math.abs(ratio - 9 / 16) < 0.001) return "9:16";
    throw adapterError(
      "RENDER_FAILED",
      "The preserved Image renderer supports 4:5, 1:1 and 9:16 artboards. This artboard was not stretched or cropped.",
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
        warnings: ["The saved source document is not a supported Image 1.0.0 document."],
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
      return { restored: false, warnings: ["The saved Image document is invalid JSON."] };
    }
    if (!documentState || documentState.tool !== TOOL_ID) {
      return { restored: false, warnings: ["The saved document does not belong to Image."] };
    }
    if (documentState.schemaVersion !== TOOL_STATE_VERSION) {
      return {
        restored: false,
        warnings: [
          "Image source version " +
            String(documentState.schemaVersion) +
            " is not supported by this editor.",
        ],
      };
    }
    if (!documentState.photo || !documentState.photo.assetId) {
      return { restored: false, warnings: ["The saved Image document has no source photo."] };
    }
    if (!studioPhoto || !img) {
      return {
        restored: false,
        warnings: [
          "The original source photo was not supplied to the Image editor. The layer was left untouched.",
        ],
      };
    }
    if (!documentState.settings || typeof documentState.settings !== "object") {
      return { restored: false, warnings: ["The saved Image settings are missing."] };
    }

    S = deepClone(documentState.settings);
    if (!S.layers) S.layers = defLayers();
    if (!S.order) S.order = ["trace", "medium", "blur"];
    if (!S.zone) S.zone = init("zone");
    if (!S.finish) S.finish = init("finish");

    const view = documentState.view || {};
    if (!hostFormat && (view.format === "4:5" || view.format === "1:1" || view.format === "9:16")) {
      document.getElementById("fmt").value = view.format;
    }
    hostFormat = hostFormat || document.getElementById("fmt").value;
    tab = typeof view.tab === "string" ? view.tab : "effects";
    selL = typeof view.selectedLayer === "string" ? view.selectedLayer : "styled";
    openS = new Set(Array.isArray(view.openSections) ? view.openSections : ["medium"]);
    advS = new Set(Array.isArray(view.advancedSections) ? view.advancedSections : []);
    before = false;
    playing = false;
    PH = null;
    clearTimeout(_t);

    await restoreMask(documentState.mask);
    mkFit();
    build();
    draw();
    hist = Array.isArray(documentState.history) ? deepClone(documentState.history) : [];
    hi =
      typeof documentState.historyIndex === "number"
        ? Math.max(-1, Math.min(hist.length - 1, documentState.historyIndex))
        : hist.length - 1;
    updHist();
    clearTimeout(_t);
    await nextFrame();
    return { restored: true, warnings: [] };
  }

  async function restoreMask(mask) {
    const W = dims(1).W;
    const H = dims(1).H;
    if (!mask || !mask.dataUrl) {
      mk.width = W;
      mk.height = H;
      mk.getContext("2d").clearRect(0, 0, W, H);
      return;
    }
    const image = await loadImageElement(mask.dataUrl);
    mk.width = W;
    mk.height = H;
    const context = mk.getContext("2d");
    context.clearRect(0, 0, W, H);
    context.drawImage(image, 0, 0, W, H);
  }

  function loadImageElement(src) {
    return new Promise(function (resolve, reject) {
      const image = new Image();
      image.onload = function () {
        resolve(image);
      };
      image.onerror = function () {
        reject(new Error("The saved painted mask could not be decoded."));
      };
      image.src = src;
    });
  }

  async function currentPhotoRecord() {
    if (studioPhotoPromise) {
      try {
        await studioPhotoPromise;
      } catch (error) {
        // Fall back to re-encoding the displayed image.
      }
    }
    if (studioPhoto && studioPhoto.image === img && studioPhoto.bytes) {
      return {
        dataUrl:
          "data:" +
          studioPhoto.mimeType +
          ";base64," +
          bytesToBase64(studioPhoto.bytes),
        name: studioPhoto.name,
        mimeType: studioPhoto.mimeType,
        width: studioPhoto.width || 0,
        height: studioPhoto.height || 0,
      };
    }
    if (!img) throw adapterError("RENDER_FAILED", "Image has no source photo to save.");
    const width = img.naturalWidth || img.width || 1;
    const height = img.naturalHeight || img.height || 1;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d").drawImage(img, 0, 0, width, height);
    return {
      dataUrl: canvas.toDataURL("image/png"),
      name: (document.getElementById("hn").value || "Source photo") + ".png",
      mimeType: "image/png",
      width: width,
      height: height,
    };
  }

  async function serializeSourceState() {
    clearTimeout(_t);
    draw();
    const photo = await currentPhotoRecord();
    const state = {
      tool: TOOL_ID,
      schemaVersion: TOOL_STATE_VERSION,
      savedAt: new Date().toISOString(),
      photo: photo,
      settings: deepClone(S),
      history: deepClone(hist),
      historyIndex: hi,
      mask: {
        width: mk.width,
        height: mk.height,
        dataUrl: mk.toDataURL("image/png"),
      },
      view: {
        format: document.getElementById("fmt").value,
        tab: tab,
        selectedLayer: selL,
        openSections: Array.from(openS),
        advancedSections: Array.from(advS),
      },
    };
    return {
      tool: TOOL_ID,
      toolStateVersion: TOOL_STATE_VERSION,
      mimeType: TOOL_STATE_MIME,
      content: JSON.stringify(state),
      label: "Image · " + (S.medium && S.medium.on ? S.medium.type : "Photo"),
    };
  }

  async function renderArtwork(request) {
    if (!img) throw adapterError("RENDER_FAILED", "Image has no source photo to render.", true);
    const format = requiredArtboardFormat(request);
    const targetWidth = request.artboard.width;
    const targetHeight = request.artboard.height;
    const previousFormat = document.getElementById("fmt").value;
    const previousPhase = PH;
    const previousBefore = before;
    postEvent({ type: "progress", operation: "render", progress: 0.1 });
    try {
      document.getElementById("fmt").value = format;
      const base = dims(1);
      const k = targetWidth / base.W;
      const expected = dims(k);
      if (expected.W !== targetWidth || expected.H !== targetHeight) {
        throw adapterError(
          "RENDER_FAILED",
          "The preserved Image renderer could not match the requested artboard dimensions exactly.",
        );
      }
      PH = null;
      before = false;
      const canvas = document.createElement("canvas");
      render(k, canvas);
      if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        throw adapterError(
          "RENDER_FAILED",
          "The preserved Image renderer returned unexpected dimensions.",
        );
      }
      postEvent({ type: "progress", operation: "render", progress: 0.75 });
      const blob = await new Promise(function (resolve) {
        canvas.toBlob(resolve, "image/png");
      });
      if (!blob) throw adapterError("RENDER_FAILED", "PNG encoding failed.");
      const bytes = new Uint8Array(await blob.arrayBuffer());
      postEvent({ type: "progress", operation: "render", progress: 1 });
      return {
        requestId: request && request.requestId ? request.requestId : "",
        rendered: {
          kind: "image",
          mimeType: "image/png",
          width: canvas.width,
          height: canvas.height,
          hasAlpha: false,
        },
        bytes: bytes,
        warnings: [],
      };
    } finally {
      document.getElementById("fmt").value = previousFormat;
      PH = previousPhase;
      before = previousBefore;
      draw();
    }
  }

  function bytesToBase64(bytes) {
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  function nextFrame() {
    return new Promise(function (resolve) {
      requestAnimationFrame(function () {
        requestAnimationFrame(resolve);
      });
    });
  }

  function deepClone(value) {
    if (value === null || typeof value !== "object") return value;
    return JSON.parse(JSON.stringify(value));
  }

  function installEmbedChrome() {
    document.title = "Image · Studio";
    document.body.classList.add("studio-embedded");
    const style = document.createElement("style");
    style.id = "studio-image-embed-style";
    style.textContent = [
      "body.studio-embedded header > b,body.studio-embedded header .crumb,body.studio-embedded header input.proj{display:none}",
      "body.studio-embedded .bar #fmt{display:none}",
      "body.studio-embedded .studio-embed-context{display:flex;align-items:baseline;gap:9px;min-width:0;margin-right:auto;padding-left:2px}",
      "body.studio-embedded .studio-embed-context strong{font-size:12px;font-weight:650;letter-spacing:.14em;text-transform:uppercase;color:var(--ac)}",
      "body.studio-embedded .studio-embed-context span{font-size:11px;color:var(--mut);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      "body.studio-embedded .studio-embed-context .dot{width:5px;height:5px;border-radius:50%;background:var(--ac);display:inline-block;margin-right:5px;vertical-align:1px}",
      "@media(max-width:900px){body.studio-embedded header{height:auto;flex-wrap:wrap;padding:8px 12px}body.studio-embedded header .studio-embed-context{width:100%;order:-1}}",
    ].join("\n");
    document.head.appendChild(style);
    const header = document.querySelector("header");
    if (header) {
      const context = document.createElement("div");
      context.className = "studio-embed-context";
      context.setAttribute("data-testid", "image-studio-context");
      const title = document.createElement("strong");
      title.textContent = "Image";
      const meta = document.createElement("span");
      meta.id = "studioImageContext";
      meta.textContent = "Studio session";
      context.append(title, meta);
      header.insertBefore(context, header.firstChild);
    }
    const bridgeBadge = document.createElement("span");
    bridgeBadge.hidden = true;
    bridgeBadge.id = "studioImageBridgeReady";
    bridgeBadge.textContent = "ready";
    document.body.appendChild(bridgeBadge);
  }

  function updateContextChip() {
    const chip = document.getElementById("studioImageContext");
    if (!chip) return;
    const artboard = lastContext && lastContext.activeArtboard;
    if (!artboard) {
      chip.textContent = "Studio session";
      return;
    }
    const ratio =
      artboard.width === artboard.height
        ? "1:1"
        : Math.abs(artboard.width / artboard.height - 0.8) < 0.001
          ? "4:5"
          : Math.abs(artboard.width / artboard.height - 9 / 16) < 0.001
            ? "9:16"
            : "Custom";
    chip.textContent =
      "Artboard " +
      String((artboard.index || 0) + 1).padStart(2, "0") +
      " · " +
      ratio +
      " · " +
      artboard.width +
      "×" +
      artboard.height +
      " · full-resolution publish";
  }

  function showFatal(message) {
    const node = document.createElement("div");
    node.setAttribute("role", "alert");
    node.style.cssText =
      "position:fixed;inset:0;z-index:9999;display:grid;place-items:center;background:#fff;color:#7a1f1f;font:500 14px/1.5 'Instrument Sans',sans-serif;padding:24px;text-align:center";
    node.textContent = message;
    document.body.appendChild(node);
  }

  window.__STUDIO_IMAGE_BRIDGE__ = {
    protocolVersion: PROTOCOL_VERSION,
    toolStateVersion: TOOL_STATE_VERSION,
    snapshot: function () {
      return {
        format: document.getElementById("fmt").value,
        settings: deepClone(S),
        historyIndex: hi,
        historyLength: hist.length,
        photo: studioPhoto
          ? {
              name: studioPhoto.name,
              mimeType: studioPhoto.mimeType,
              width: studioPhoto.width,
              height: studioPhoto.height,
              byteLength: studioPhoto.bytes.byteLength,
            }
          : null,
        mask: (function () {
          const width = mk.width;
          const height = mk.height;
          let nonZero = 0;
          try {
            const data = mk.getContext("2d").getImageData(0, 0, width, height).data;
            for (let i = 3; i < data.length; i += 4) {
              if (data[i] > 0) nonZero += 1;
            }
          } catch (error) {
            nonZero = -1;
          }
          return { width: width, height: height, nonZero: nonZero };
        })(),
        tab: tab,
        selectedLayer: selL,
        before: before,
      };
    },
    canvasDataUrl: function () {
      return cv.toDataURL("image/png");
    },
  };
})();

