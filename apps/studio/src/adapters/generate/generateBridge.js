/* Studio Generate bridge.
 *
 * Injected into the byte-identical preserved generator by the Studio adapter
 * plugin. It keeps the original rule engine, presets and creative controls and
 * adds: scoped adapter messaging, real host-layer assets, aspect-aware layout
 * coordinates, versioned source state, decorative-background PNG rendering and
 * missing-layer detection. The original standalone generator is untouched.
 */
(function () {
  "use strict";

  const PROTOCOL_VERSION = "1.0.0";
  const TOOL_ID = "generate";
  const TOOL_STATE_VERSION = "1.0.0";
  const TOOL_STATE_MIME = "application/vnd.studio.generate+json";
  const MANIFEST_LAYER_ID = "__studio_generate_manifest__";

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
    showFatal("This Generate editor is not running on its expected origin.");
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
        code: "CLAUDE_ENVIRONMENT",
        summary:
          "Claude sampling and spec export require the Claude host environment. In Studio they fail honestly and rule-based layouts remain available.",
        environmentDependent: true,
      },
      {
        code: "DOM_CSS_RENDER",
        summary:
          "Generated backgrounds, accents and textures are rasterized from the selected variant's DOM/CSS treatment with Chromium foreignObject capture.",
        environmentDependent: true,
      },
      {
        code: "SINGLE_ARTBOARD_APPLY",
        summary:
          "Studio has one active artboard per project. Carousel previews remain available, while Apply layout targets the active host artboard only.",
        environmentDependent: false,
      },
      {
        code: "MOTION_FRAME",
        summary:
          "Motion-based backgrounds are captured as a representative still frame; temporal motion is not exported in this phase.",
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
  let restoring = false;
  let lastContext = null;
  let hostManifest = null;
  let frameHeight = 125;
  let artboard = null;
  let dirtyTimer = 0;
  let missingLayers = [];

  const hostThumbnails = {};
  const originalElHtml = elHtml;
  const originalRules = rules;

  // Host layers map onto the original hierarchy roles through a derived `kind`
  // helper in the generated page. Native asset types render through the exact
  // original code paths.
  elHtml = function (placement, asset, palette, controls, image) {
    if (asset && asset.hostLayerId) {
      return hostElementHtml(placement, asset, image);
    }
    return originalElHtml(placement, asset, palette, controls, image);
  };

  // The original engine remains the source of every placement. Only when the
  // host artboard is not 4:5 do we map its 100x125 result into the actual
  // normalized artboard space and run the same separation/boundary constants
  // again in that space.
  rules = function (assets, controls, rng, slideIndex, layout) {
    const placements = originalRules(assets, controls, rng, slideIndex, layout);
    return adaptPlacementsToArtboard(placements, assets, controls, rng, layout);
  };

  installEmbedChrome();
  installDirtyTracking();
  announceReady();
  window.addEventListener("message", handleMessage);

  function announceReady() {
    postEvent({ type: "ready", capabilities: capabilities });
  }

  function postEvent(event) {
    if (window.parent === window) return;
    window.parent.postMessage(
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

  function reply(message) {
    if (window.parent === window) return;
    window.parent.postMessage(message, hostOrigin);
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
          "The Studio session does not match this Generate editor.",
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
        message: error.message || "Generate operation failed.",
        retryable: error.retryable === true,
      };
    }
    return {
      code: "ADAPTER_ERROR",
      message:
        error instanceof Error
          ? error.message
          : "The Generate editor could not complete that operation.",
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
        initialized = true;
        return openResult();
      }
      case "tool/open": {
        lastContext = params.global || null;
        if (lastContext && lastContext.activeArtboard) {
          applyArtboard(lastContext.activeArtboard);
        }
        return openResult();
      }
      case "context/update": {
        lastContext = params;
        if (params && params.activeArtboard) applyArtboard(params.activeArtboard);
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
        return renderArtwork(params);
      case "capabilities/report":
        return capabilities;
      case "operation/cancel":
        return { cancelled: false };
      case "tool/close":
        return { closed: true };
      default:
        throw adapterError("UNKNOWN_METHOD", "Unknown Generate bridge method: " + method);
    }
  }

  function openResult() {
    return { sessionId: scope.sessionId, capabilities: capabilities, warnings: [] };
  }

  function applyArtboard(nextArtboard) {
    if (!nextArtboard || !nextArtboard.width || !nextArtboard.height) return;
    const changed =
      !artboard ||
      artboard.width !== nextArtboard.width ||
      artboard.height !== nextArtboard.height;
    artboard = {
      id: nextArtboard.id,
      name: nextArtboard.name,
      width: nextArtboard.width,
      height: nextArtboard.height,
    };
    frameHeight = (100 * artboard.height) / artboard.width;
    window.__studioGenFrameHeight = frameHeight;
    document.documentElement.style.setProperty(
      "--studio-gen-aspect",
      artboard.width + "/" + artboard.height,
    );
    updateContextBanner();
    if (changed) {
      // Re-run the preserved engine for the new aspect instead of reusing 4:5
      // vertical coordinates. Restoration may immediately replace S.vars.
      if (initialized && !restoring) gen();
    }
  }

  async function receiveInputAssets(assets) {
    const receipts = [];
    let manifest = null;
    for (const input of Array.isArray(assets) ? assets : []) {
      if (!input || !input.bytes || !input.asset) {
        receipts.push({
          inputLayerId: input && input.layerId,
          accepted: false,
          message: "Generate ignored an input without bytes.",
        });
        continue;
      }
      if (input.layerId === MANIFEST_LAYER_ID) {
        try {
          const text = new TextDecoder().decode(toUint8(input.bytes));
          manifest = JSON.parse(text);
          receipts.push({
            inputLayerId: input.layerId,
            accepted: true,
            message: "Studio layer manifest received.",
          });
        } catch (error) {
          receipts.push({
            inputLayerId: input.layerId,
            accepted: false,
            message: "The Studio layer manifest was not valid JSON.",
          });
        }
        continue;
      }
      const mime = input.asset.mimeType || "";
      if (
        mime.indexOf("image/") !== 0 &&
        mime !== "image/svg+xml"
      ) {
        receipts.push({
          inputLayerId: input.layerId,
          accepted: false,
          message: "Generate previews accept raster or SVG thumbnails only.",
        });
        continue;
      }
      hostThumbnails[input.layerId] = bytesToDataUrl(toUint8(input.bytes), mime);
      receipts.push({ inputLayerId: input.layerId, accepted: true });
    }
    if (manifest) {
      restoring = true;
      try {
        applyHostManifest(manifest, null);
      } finally {
        restoring = false;
      }
      // A new Studio session has no saved Generate document to restore after
      // this call, so the original rule engine must run against the new host
      // assets now. Existing sessions restore their saved variations next and
      // replace these fresh alternatives.
      if (initialized) {
        await gen();
      }
    }
    return receipts;
  }

  function toUint8(value) {
    if (value instanceof Uint8Array) return value;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (value && value.buffer instanceof ArrayBuffer) {
      return new Uint8Array(value.buffer, value.byteOffset || 0, value.byteLength || value.buffer.byteLength);
    }
    throw new Error("Generate received an unsupported binary representation.");
  }

  function bytesToDataUrl(bytes, mime) {
    let binary = "";
    for (let index = 0; index < bytes.length; index += 0x8000) {
      binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(index, index + 0x8000)));
    }
    return "data:" + (mime || "application/octet-stream") + ";base64," + btoa(binary);
  }

  function applyHostManifest(manifest, savedAssets) {
    hostManifest = manifest;
    if (manifest.artboard) applyArtboard(manifest.artboard);
    const savedByLayer = {};
    for (const asset of Array.isArray(savedAssets) ? savedAssets : []) {
      if (asset && asset.hostLayerId) savedByLayer[asset.hostLayerId] = asset;
    }
    const layers = Array.isArray(manifest.layers) ? manifest.layers : [];
    const present = {};
    const assets = layers.map(function (layer) {
      present[layer.id] = true;
      const saved = savedByLayer[layer.id] || {};
      return {
        id: "host:" + layer.id,
        hostLayerId: layer.id,
        hostKind: layer.kind,
        type: "img",
        name: layer.name,
        text: layer.text || "",
        src: hostThumbnails[layer.id] || "",
        aspectHOverW:
          typeof layer.aspectHOverW === "number" && layer.aspectHOverW > 0
            ? layer.aspectHOverW
            : 0.8,
        opacity: typeof layer.opacity === "number" ? layer.opacity : 1,
        locked: layer.locked === true,
        on: saved.on === 0 ? 0 : 1,
      };
    });
    missingLayers = [];
    for (const hostLayerId of Object.keys(savedByLayer)) {
      if (present[hostLayerId]) continue;
      const saved = savedByLayer[hostLayerId];
      missingLayers.push({ layerId: hostLayerId, name: saved.name || hostLayerId });
      assets.push({
        id: saved.id || "host:" + hostLayerId,
        hostLayerId: hostLayerId,
        hostKind: saved.hostKind,
        type: "img",
        name: (saved.name || "Missing layer") + " (missing)",
        src: "",
        aspectHOverW: saved.aspectHOverW || 0.8,
        opacity: 1,
        locked: true,
        missing: true,
        on: saved.on === 0 ? 0 : 1,
      });
    }
    if (layers.length === 0 && !savedAssets) {
      // No Studio layers yet: keep the original native sample bin usable.
      S.assets = S.assets;
      hostManifest = manifest;
      updateContextBanner();
      return;
    }
    const nativeAssets = (Array.isArray(savedAssets) ? savedAssets : [])
      .filter(function (asset) {
        return asset && !asset.hostLayerId;
      })
      .map(function (asset) {
        return deepCloneDocument(asset);
      });
    S.assets = assets.concat(nativeAssets);
    head();
    assetsPanel();
    updateContextBanner();
    if (initialized && !restoring) gen();
    else draw();
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
          "The saved source document is not a supported Generate 1.0.0 document.",
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
    } catch (error) {
      return { restored: false, warnings: ["The saved Generate document is invalid JSON."] };
    }
    if (!documentState || documentState.tool !== TOOL_ID) {
      return { restored: false, warnings: ["The saved document does not belong to Generate."] };
    }
    if (documentState.schemaVersion !== TOOL_STATE_VERSION) {
      return {
        restored: false,
        warnings: [
          "Generate source version " +
            String(documentState.schemaVersion) +
            " is not supported by this editor.",
        ],
      };
    }
    if (!documentState.controls || typeof documentState.controls !== "object") {
      return { restored: false, warnings: ["The saved Generate creative controls are missing."] };
    }
    restoring = true;
    try {
      S.mode =
        documentState.mode === "static" || documentState.mode === "claude"
          ? documentState.mode
          : "rules";
      S.fmt = documentState.format === "carousel" ? "carousel" : "post";
      S.slides = Math.max(1, Math.min(3, Number(documentState.slides) || 1));
      S.seed = Number.isFinite(documentState.seed) ? Number(documentState.seed) : 1;
      S.ctl = Object.assign({}, S.ctl, deepCloneDocument(documentState.controls));
      const savedAssets = Array.isArray(documentState.assets)
        ? documentState.assets
        : [];
      if (hostManifest) {
        applyHostManifest(hostManifest, savedAssets);
      } else {
        S.assets = deepCloneDocument(savedAssets);
      }
      const savedArtboard = documentState.artboard || {};
      const aspectChanged =
        artboard &&
        savedArtboard.width &&
        savedArtboard.height &&
        Math.abs(savedArtboard.width / savedArtboard.height - artboard.width / artboard.height) > 0.001;
      if (!aspectChanged && Array.isArray(documentState.variations) && documentState.variations.length > 0) {
        S.vars = deepCloneDocument(documentState.variations);
        S.sel = Math.max(0, Math.min(S.vars.length - 1, Number(documentState.selected) || 0));
        head();
        assetsPanel();
        draw();
        updateContextBanner(
          aspectChanged
            ? "Artboard aspect changed; regenerate to refit this composition."
            : "",
        );
      } else {
        head();
        assetsPanel();
        gen();
        updateContextBanner(
          aspectChanged
            ? "Artboard aspect changed; layouts were regenerated for the current artboard."
            : "",
        );
      }
      return {
        restored: true,
        warnings: missingLayers.length
          ? [
              "Missing Studio layers: " +
                missingLayers
                  .map(function (layer) {
                    return layer.name;
                  })
                  .join(", ") +
                ". Regenerate from current layers or remap before applying.",
            ]
          : [],
      };
    } catch (error) {
      return {
        restored: false,
        warnings: [
          error instanceof Error
            ? error.message
            : "The saved Generate document could not be restored.",
        ],
      };
    } finally {
      restoring = false;
      clearTimeout(dirtyTimer);
    }
  }

  function serializeSourceState() {
    const selected = S.vars[S.sel] || null;
    const assets = S.assets.map(function (asset) {
      if (asset.hostLayerId) {
        return {
          id: asset.id,
          hostLayerId: asset.hostLayerId,
          hostKind: asset.hostKind,
          type: asset.type,
          name: asset.name,
          text: asset.text || "",
          on: asset.on,
          aspectHOverW: asset.aspectHOverW,
          locked: asset.locked === true,
          missing: asset.missing === true,
        };
      }
      // Native assets added through the preserved asset bin, including their
      // data URLs, are part of the tool's own document.
      return deepCloneDocument(asset);
    });
    const documentState = {
      tool: TOOL_ID,
      schemaVersion: TOOL_STATE_VERSION,
      savedAt: new Date().toISOString(),
      mode: S.mode,
      format: S.fmt,
      slides: S.slides,
      seed: S.seed,
      selected: S.sel,
      controls: deepCloneDocument(S.ctl),
      variations: deepCloneDocument(S.vars),
      assets: assets,
      hostLayers: hostManifest && Array.isArray(hostManifest.layers)
        ? hostManifest.layers.map(function (layer) {
            return {
              layerId: layer.id,
              name: layer.name,
              kind: layer.kind,
              sourceTool: layer.sourceTool,
              aspectHOverW: layer.aspectHOverW,
              locked: layer.locked === true,
              visible: layer.visible !== false,
              text: layer.text || "",
            };
          })
        : [],
      missingLayers: missingLayers.map(function (layer) {
        return layer.layerId;
      }),
      artboard: artboard
        ? { id: artboard.id, width: artboard.width, height: artboard.height }
        : null,
      frameHeight: frameHeight,
      background: selected
        ? {
            controls: deepCloneDocument(selected.c),
            seed: selected.seed,
            slide: 0,
          }
        : null,
    };
    return {
      tool: TOOL_ID,
      toolStateVersion: TOOL_STATE_VERSION,
      mimeType: TOOL_STATE_MIME,
      content: JSON.stringify(documentState),
      label: "Generate · " + (selected ? "variation " + (S.sel + 1) : "no variation"),
    };
  }

  function deepCloneDocument(value) {
    if (value === null || typeof value !== "object") return value;
    return JSON.parse(JSON.stringify(value));
  }

  function adaptPlacementsToArtboard(placements, assets, controls, rng, layout) {
    if (!placements || !placements.length) return placements;
    if (Math.abs(frameHeight - 125) < 0.001) return placements;
    const H = frameHeight;
    const m = { "Generous margins": 16, Balanced: 9, "Tight / packed": 3 }[controls.negative] ?? 9;
    const freedom = controls.freedom === "Conservative" ? 0 : controls.freedom === "Balanced" ? 1 : 2;
    const overlap = {
      Separated: 1,
      "Moderate overlap": 0.18,
      "Heavy overlap": -0.04,
    }[controls.overlap] ?? 0.18;
    const mapped = placements.map(function (placement) {
      const asset = assets.find(function (candidate) {
        return candidate.id === placement.id;
      });
      const k = asset ? kind(asset) : "sub";
      const aspect =
        asset && typeof asset.aspectHOverW === "number" && asset.aspectHOverW > 0
          ? asset.aspectHOverW
          : AR[k] || 0.5;
      return {
        id: placement.id,
        x: placement.x,
        y: (placement.y / 125) * H,
        w: placement.w,
        h: placement.w * aspect,
        r: placement.r,
        z: placement.z,
      };
    });
    const lo = freedom === 2 ? -8 : m;
    const hiX = freedom === 2 ? 108 : 100 - m;
    const hiY = freedom === 2 ? H + 8 : H - m;
    for (let iteration = 0; iteration < 60; iteration += 1) {
      for (let i = 0; i < mapped.length; i += 1) {
        for (let j = i + 1; j < mapped.length; j += 1) {
          const a = mapped[i];
          const b = mapped[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const ox = (a.w + b.w) / 2 - Math.abs(dx);
          const oy = (a.h + b.h) / 2 - Math.abs(dy);
          if (overlap > 0 && ox > 0 && oy > 0) {
            const force = overlap * 0.06;
            if (ox < oy) {
              const sign = Math.sign(dx) || 1;
              a.x -= sign * ox * force;
              b.x += sign * ox * force;
            } else {
              const sign = Math.sign(dy) || 1;
              a.y -= sign * oy * force;
              b.y += sign * oy * force;
            }
          } else if (overlap < 0 && (Math.abs(dx) > a.w * 0.3 || Math.abs(dy) > a.h * 0.3)) {
            a.x += dx * 0.01;
            b.x -= dx * 0.01;
            a.y += dy * 0.01;
            b.y -= dy * 0.01;
          }
        }
      }
      mapped.forEach(function (placement) {
        const xPad = placement.w / 2 * (freedom === 2 ? 0.3 : 1);
        const yPad = placement.h / 2 * (freedom === 2 ? 0.3 : 1);
        placement.x = Math.max(lo + xPad, Math.min(hiX - xPad, placement.x));
        placement.y = Math.max(lo + yPad, Math.min(hiY - yPad, placement.y));
      });
    }
    void rng;
    void layout;
    return mapped.map(function (placement) {
      return {
        id: placement.id,
        x: +placement.x.toFixed(1),
        y: +placement.y.toFixed(1),
        w: +placement.w.toFixed(1),
        r: +placement.r.toFixed(1),
        z: placement.z,
      };
    });
  }

  function hostElementHtml(placement, asset, image) {
    const aspect =
      typeof asset.aspectHOverW === "number" && asset.aspectHOverW > 0
        ? asset.aspectHOverW
        : 0.8;
    const top = (placement.y / frameHeight) * 100;
    let style =
      "left:" +
      placement.x +
      "%;top:" +
      top +
      "%;width:" +
      placement.w +
      "%;aspect-ratio:" +
      1 / aspect +
      ";transform:translate(-50%,-50%) rotate(" +
      placement.r +
      "deg);z-index:" +
      placement.z +
      ";opacity:" +
      (typeof asset.opacity === "number" ? asset.opacity : 1) +
      ";";
    if (!asset.src) {
      style +=
        "background:rgba(25,52,56,.08);border:1px dashed rgba(25,52,56,.35);display:grid;place-items:center;font:600 3.2cqw/1.2 system-ui,sans-serif;color:#526C6E;text-align:center;padding:2cqw;";
    }
    const label = !asset.src
      ? '<span style="overflow:hidden;text-overflow:ellipsis">' + esc(asset.name) + "</span>"
      : '<img src="' +
        esc(asset.src) +
        '" alt="" draggable="false" style="display:block;width:100%;height:100%;object-fit:contain">';
    void image;
    return '<div class="el host-el" style="' + style + '">' + label + "</div>";
  }

  async function renderArtwork(request) {
    const variant = S.vars[S.sel];
    if (!variant) {
      throw adapterError("RENDER_FAILED", "Select a Generate alternative before publishing a background.", true);
    }
    const requestArtboard = request && request.artboard;
    const width = Math.round(
      ((requestArtboard && requestArtboard.width) || (artboard && artboard.width) || 1080) *
        (request && typeof request.scale === "number" ? request.scale : 1),
    );
    const height = Math.round(
      ((requestArtboard && requestArtboard.height) || (artboard && artboard.height) || 1350) *
        (request && typeof request.scale === "number" ? request.scale : 1),
    );
    postEvent({ type: "progress", operation: "render", progress: 0.2 });
    const png = await renderDecorativePng(variant, width, height);
    postEvent({ type: "progress", operation: "render", progress: 0.9 });
    return {
      requestId: request && request.requestId ? request.requestId : "",
      rendered: {
        kind: "image",
        mimeType: "image/png",
        width: width,
        height: height,
        hasAlpha: true,
      },
      bytes: png,
      sourceRevision: TOOL_STATE_VERSION,
      warnings: [],
    };
  }

  async function renderDecorativePng(variant, width, height) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      throw adapterError("RENDER_FAILED", "The generated background canvas is unavailable.", true);
    }
    const controls = variant.c;
    const palette = pal(controls, variant.seed);
    const rng = rngF(variant.seed * 13 + 5);
    const imageSource = (S.assets.find(function (asset) {
      return asset.hostKind === "image" && asset.src && !asset.missing;
    }) || {}).src;
    context.clearRect(0, 0, width, height);
    await drawGenerateBackground(context, width, height, controls, palette, rng, imageSource);
    drawGenerateAccents(context, width, height, controls, palette, rng);
    drawGenerateTexture(context, width, height, controls.texture, variant.seed);

    let visible = 0;
    let visited = 0;
    const pixels = context.getImageData(0, 0, width, height).data;
    const stride = Math.max(4, Math.floor((width * height) / 20_000) * 4);
    for (let index = 3; index < pixels.length; index += stride) {
      visited += 1;
      if (pixels[index] > 0) visible += 1;
    }
    if (visible === 0) {
      throw adapterError("RENDER_FAILED", "The generated background rendered no visible pixels.", true);
    }
    void visited;
    const blob = await new Promise(function (resolve, reject) {
      canvas.toBlob(function (png) {
        if (png) resolve(png);
        else reject(adapterError("RENDER_FAILED", "The generated background PNG could not be encoded.", true));
      }, "image/png");
    });
    return new Uint8Array(await blob.arrayBuffer());
  }

  function generateColorWithAlpha(color, alpha) {
    const a = Math.max(0, Math.min(1, alpha));
    if (typeof color !== "string" || !color.trim()) return "rgba(0,0,0," + a + ")";
    const value = color.trim();
    const hex6 = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value);
    if (hex6) {
      return (
        "rgba(" +
        parseInt(hex6[1], 16) +
        "," +
        parseInt(hex6[2], 16) +
        "," +
        parseInt(hex6[3], 16) +
        "," +
        a +
        ")"
      );
    }
    const hex8 = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value);
    if (hex8) {
      return (
        "rgba(" +
        parseInt(hex8[1], 16) +
        "," +
        parseInt(hex8[2], 16) +
        "," +
        parseInt(hex8[3], 16) +
        "," +
        (parseInt(hex8[4], 16) / 255) * a +
        ")"
      );
    }
    const hex3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(value);
    if (hex3) {
      return (
        "rgba(" +
        parseInt(hex3[1] + hex3[1], 16) +
        "," +
        parseInt(hex3[2] + hex3[2], 16) +
        "," +
        parseInt(hex3[3] + hex3[3], 16) +
        "," +
        a +
        ")"
      );
    }
    const hsl = /^hsl\(\s*([\d.]+)\s*[ ,]\s*([\d.]+)%\s*[ ,]\s*([\d.]+)%\s*\)$/i.exec(value);
    if (hsl) return "hsla(" + hsl[1] + ", " + hsl[2] + "%, " + hsl[3] + "%, " + a + ")";
    if (value === "transparent") return "rgba(0,0,0,0)";
    return value;
  }

  function linearGradientOn(context, width, height, angle, stops) {
    const radians = ((angle - 90) * Math.PI) / 180;
    const dx = Math.cos(radians);
    const dy = Math.sin(radians);
    const half = (Math.abs(width * dx) + Math.abs(height * dy)) / 2 || 1;
    const gradient = context.createLinearGradient(
      width / 2 - dx * half,
      height / 2 - dy * half,
      width / 2 + dx * half,
      height / 2 + dy * half,
    );
    for (const stop of stops) gradient.addColorStop(stop[0], stop[1]);
    return gradient;
  }

  function loadImageSafe(source) {
    return new Promise(function (resolve) {
      if (!source) {
        resolve(null);
        return;
      }
      const image = new Image();
      image.onload = function () {
        resolve(image);
      };
      image.onerror = function () {
        resolve(null);
      };
      image.src = source;
    });
  }

  async function drawGenerateBackground(context, width, height, controls, palette, rng, imageSource) {
    const mode = controls.background;
    context.save();
    context.globalAlpha = 1;
    context.globalCompositeOperation = "source-over";
    if (mode === "Atmospheric") {
      const x = 20 + rng() * 60;
      const y = rng() * 60;
      const angle = Math.floor(rng() * 360);
      context.fillStyle = linearGradientOn(context, width, height, angle, [
        [0, palette.b1],
        [1, palette.b2],
      ]);
      context.fillRect(0, 0, width, height);
      const cx = (x / 100) * width;
      const cy = (y / 100) * height;
      const radius = Math.max(width, height) * 0.62;
      const glow = context.createRadialGradient(cx, cy, 0, cx, cy, radius);
      glow.addColorStop(0, generateColorWithAlpha(palette.a2, 0.53));
      glow.addColorStop(1, generateColorWithAlpha(palette.a2, 0));
      context.fillStyle = glow;
      context.fillRect(0, 0, width, height);
    } else if (mode === "Abstract") {
      const angle = Math.floor(rng() * 360);
      context.fillStyle = linearGradientOn(context, width, height, angle, [
        [0, palette.b1],
        [1, palette.b2],
      ]);
      context.fillRect(0, 0, width, height);
      for (let index = 0; index < 5; index += 1) {
        const cx = rng() * width;
        const cy = rng() * height;
        const radius = (6 + rng() * 22) * (width / 100);
        context.fillStyle = generateColorWithAlpha(
          rng() > 0.5 ? palette.a1 : palette.a2,
          0.18,
        );
        context.beginPath();
        context.arc(cx, cy, radius, 0, Math.PI * 2);
        context.fill();
      }
      for (let index = 0; index < 4; index += 1) {
        const x = rng() * 80;
        const y = index * 30 + rng() * 8;
        const w = 15 + rng() * 40;
        context.fillStyle = generateColorWithAlpha(palette.fg, 0.25);
        context.fillRect(
          (x / 100) * width,
          (y / 125) * height,
          (w / 100) * width,
          Math.max(2, height * 0.012),
        );
      }
    } else if (mode === "Image-based") {
      const image = await loadImageSafe(imageSource);
      if (image) {
        const scale = Math.max(width / image.width, height / image.height);
        const drawWidth = image.width * scale;
        const drawHeight = image.height * scale;
        context.drawImage(
          image,
          (width - drawWidth) / 2,
          (height - drawHeight) / 2,
          drawWidth,
          drawHeight,
        );
      } else {
        const angle = 160;
        const base = linearGradientOn(context, width, height, angle, [
          [0, palette.b1],
          [1, palette.b2],
        ]);
        context.fillStyle = base;
        context.fillRect(0, 0, width, height);
        const fallback = linearGradientOn(context, width, height, 160, [
          [0, generateColorWithAlpha(palette.a2, 0.6)],
          [1, generateColorWithAlpha(palette.a1, 0.47)],
        ]);
        context.fillStyle = fallback;
        context.fillRect(0, 0, width, height);
      }
      const overlay = linearGradientOn(context, width, height, 180, [
        [0, generateColorWithAlpha(palette.b1, 0.4)],
        [1, generateColorWithAlpha(palette.b2, 0.67)],
      ]);
      context.fillStyle = overlay;
      context.fillRect(0, 0, width, height);
    } else if (mode === "Material-based") {
      context.fillStyle = palette.b1;
      context.fillRect(0, 0, width, height);
      const angle = Math.floor(rng() * 180);
      const diagonal = Math.hypot(width, height);
      context.save();
      context.translate(width / 2, height / 2);
      context.rotate((angle * Math.PI) / 180);
      const step = Math.max(4, width * 0.02);
      for (let x = -diagonal; x < diagonal; x += step) {
        context.fillStyle = palette.b2;
        context.fillRect(x, -diagonal, Math.max(2, step / 2), diagonal * 2);
      }
      context.restore();
    } else if (mode === "Depth-based") {
      const angle = Math.floor(rng() * 360);
      context.fillStyle = linearGradientOn(context, width, height, angle, [
        [0, palette.b1],
        [1, palette.b2],
      ]);
      context.fillRect(0, 0, width, height);
      for (let index = 0; index < 4; index += 1) {
        const x = rng() * 80;
        const y = rng() * 80;
        const size = (20 + index * 12) * (width / 100);
        context.save();
        context.filter = "blur(" + (3 + index * 3) * (width / 200) + "px)";
        context.fillStyle = generateColorWithAlpha(index % 2 ? palette.a1 : palette.a2, 0.35);
        context.beginPath();
        context.arc((x / 100) * width + size / 2, (y / 100) * height + size / 2, size / 2, 0, Math.PI * 2);
        context.fill();
        context.restore();
      }
    } else {
      context.fillStyle = linearGradientOn(context, width, height, 120, [
        [0, palette.b1],
        [0.33, generateColorWithAlpha(palette.a2, 0.47)],
        [0.66, palette.b2],
        [1, generateColorWithAlpha(palette.a1, 0.4)],
      ]);
      context.fillRect(0, 0, width, height);
    }
    context.restore();
  }

  function drawGenerateAccents(context, width, height, controls, palette, rng) {
    const accent = controls.accents;
    if (accent === "None" || !accent) return;
    const line = Math.max(1, width * 0.01);
    context.save();
    context.globalAlpha = 1;
    context.globalCompositeOperation = "source-over";
    if (accent === "Lines & borders") {
      context.fillStyle = palette.fg;
      context.fillRect(width * 0.06, height * 0.06, width * 0.88, line);
      context.fillRect(width * 0.06, height * 0.94 - line, width * 0.88, line);
    } else if (accent === "Geometric shapes") {
      const x = rng() * 70;
      const y = rng() * 80;
      const size = width * 0.12;
      context.strokeStyle = palette.a1;
      context.lineWidth = Math.max(1, width * 0.008);
      context.beginPath();
      context.arc((x / 100) * width + size / 2, (y / 100) * height + size / 2, size / 2, 0, Math.PI * 2);
      context.stroke();
      const right = rng() * 30;
      const top = rng() * 70;
      const second = width * 0.1;
      context.fillStyle = generateColorWithAlpha(palette.a2, 0.8);
      context.fillRect(
        width * (1 - right / 100) - second,
        (top / 100) * height,
        second,
        second,
      );
    } else if (accent === "Small marks") {
      context.fillStyle = palette.fg;
      context.font = "700 " + Math.max(10, width * 0.04) + "px monospace";
      context.textBaseline = "top";
      const marks = [
        [0.05, 0.04, "left"],
        [0.95, 0.04, "right"],
        [0.05, 0.96, "left"],
        [0.95, 0.96, "right"],
      ];
      for (const mark of marks) {
        context.textAlign = mark[2];
        context.fillText("+", width * mark[0], height * mark[1] - (mark[1] > 0.5 ? width * 0.04 : 0));
      }
    } else if (accent === "Frames & dividers") {
      const inset = width * 0.04;
      context.strokeStyle = palette.fg;
      context.lineWidth = Math.max(1, width * 0.007);
      context.strokeRect(inset, inset, width - inset * 2, height - inset * 2);
    }
    context.restore();
  }

  function drawGenerateTexture(context, width, height, texture, seed) {
    if (!texture || texture === "Smooth gradient") return;
    const settings = {
      "Film grain": [0.9, 0.35],
      Paper: [0.04, 0.3],
      Noise: [0.5, 0.5],
      Distressed: [0.6, 0.55],
    }[texture];
    if (!settings) return;
    const size = Math.min(512, Math.max(128, Math.round(Math.max(width, height) / 2)));
    const noiseCanvas = document.createElement("canvas");
    noiseCanvas.width = size;
    noiseCanvas.height = size;
    const noiseContext = noiseCanvas.getContext("2d");
    if (!noiseContext) return;
    const imageData = noiseContext.createImageData(size, size);
    const random = rngF(seed * 97 + 13);
    for (let index = 0; index < imageData.data.length; index += 4) {
      const value = Math.round(random() * 255);
      imageData.data[index] = value;
      imageData.data[index + 1] = value;
      imageData.data[index + 2] = value;
      imageData.data[index + 3] = 255;
    }
    noiseContext.putImageData(imageData, 0, 0);
    context.save();
    context.globalCompositeOperation = "multiply";
    context.globalAlpha = settings[1];
    if (texture === "Distressed") {
      const overlay = document.createElement("canvas");
      overlay.width = width;
      overlay.height = height;
      const overlayContext = overlay.getContext("2d");
      if (overlayContext) {
        overlayContext.drawImage(noiseCanvas, 0, 0, width, height);
        const mask = overlayContext.createRadialGradient(
          width * 0.3,
          height * 0.4,
          0,
          width * 0.3,
          height * 0.4,
          Math.max(width, height) * 0.9,
        );
        mask.addColorStop(0, "rgba(0,0,0,1)");
        mask.addColorStop(0.2, "rgba(0,0,0,1)");
        mask.addColorStop(1, "rgba(0,0,0,0)");
        overlayContext.globalCompositeOperation = "destination-in";
        overlayContext.fillStyle = mask;
        overlayContext.fillRect(0, 0, width, height);
        context.drawImage(overlay, 0, 0);
      }
    } else {
      context.drawImage(noiseCanvas, 0, 0, width, height);
    }
    context.restore();
  }

  function installDirtyTracking() {
    let suppress = false;
    const markDirty = function () {
      if (!initialized || restoring || suppress) return;
      clearTimeout(dirtyTimer);
      dirtyTimer = window.setTimeout(function () {
        postEvent({ type: "dirty", dirty: true });
      }, 80);
    };
    document.addEventListener("input", markDirty, true);
    document.addEventListener("change", markDirty, true);
    document.addEventListener("pointerup", markDirty, true);
    document.addEventListener(
      "click",
      function (event) {
        const target = event.target;
        if (target && target.closest && target.closest("#C,#regen,#ct,#al,#mode,#fmt")) {
          markDirty();
        }
      },
      true,
    );
    void suppress;
  }

  function installEmbedChrome() {
    document.title = "Generate · Studio";
    document.body.classList.add("studio-embedded");
    const style = document.createElement("style");
    style.id = "studio-generate-embed-style";
    style.textContent = [
      "body.studio-embedded{--studio-gen-accent:#236F72}",
      ".studio-generate-context{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:8px 16px;border-bottom:1px solid var(--ln);background:var(--pn);font:500 11px/1.4 var(--sf);color:var(--mu)}",
      ".studio-generate-context strong{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--ac)}",
      ".studio-generate-context .studio-generate-dot{width:5px;height:5px;border-radius:50%;background:var(--ac);display:inline-block;margin-right:5px}",
      ".studio-generate-context button{min-height:28px;padding:0 10px;font-size:11px}",
      ".studio-generate-warning{width:100%;padding:6px 8px;border-radius:6px;background:#fff4d6;color:#6b4b00;border:1px solid #f0d28a}",
      ".studio-generate-error{width:100%;padding:6px 8px;border-radius:6px;background:#fde8e9;color:#7a1f1f;border:1px solid #efc3c5}",
      "#C .slide{aspect-ratio:var(--studio-gen-aspect,4/5)}",
      ".host-el img{pointer-events:none}",
    ].join("\n");
    document.head.appendChild(style);
    const strip = document.createElement("div");
    strip.className = "studio-generate-context";
    strip.setAttribute("data-testid", "generate-studio-context");
    strip.innerHTML =
      '<strong>Studio · Generate</strong><span id="studioGenerateMeta">Composition assistant</span><span id="studioGenerateWarning"></span>';
    const header = document.querySelector("header");
    if (header && header.parentElement) header.parentElement.insertBefore(strip, header.nextSibling);
    const badge = document.createElement("span");
    badge.hidden = true;
    badge.id = "studioGenerateBridgeReady";
    badge.textContent = "ready";
    document.body.appendChild(badge);
    const note = document.querySelector("#L p");
    if (note) {
      note.textContent =
        "Studio layers are real host assets. Native samples, + Text and + Image remain available.";
    }
    updateContextBanner();
  }

  function updateContextBanner(message) {
    const meta = document.getElementById("studioGenerateMeta");
    if (meta) {
      if (!artboard) {
        meta.textContent = "Composition assistant";
      } else {
        meta.innerHTML =
          '<i class="studio-generate-dot" aria-hidden="true"></i>Artboard ' +
          String((artboard.index || 0) + 1).padStart(2, "0") +
          " · " +
          artboard.width +
          "×" +
          artboard.height +
          " · " +
          (hostManifest && hostManifest.layers ? hostManifest.layers.length : 0) +
          " Studio layer" +
          (hostManifest && hostManifest.layers && hostManifest.layers.length === 1 ? "" : "s") +
          (missingLayers.length ? " · " + missingLayers.length + " missing" : "");
      }
    }
    const warning = document.getElementById("studioGenerateWarning");
    if (!warning) return;
    warning.innerHTML = "";
    if (missingLayers.length) {
      const box = document.createElement("span");
      box.className = "studio-generate-warning";
      box.appendChild(
        document.createTextNode(
          "Missing Studio layers: " +
            missingLayers
              .map(function (layer) {
                return layer.name;
              })
              .join(", ") +
            ". ",
        ),
      );
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "Regenerate from current layers";
      button.onclick = function () {
        missingLayers = [];
        if (hostManifest) {
          const saved = S.assets.filter(function (asset) {
            return asset.hostLayerId && !asset.missing;
          });
          applyHostManifest(hostManifest, saved);
        }
        gen();
        updateContextBanner("Generate assets rebuilt from the current Studio layers.");
      };
      box.appendChild(button);
      warning.appendChild(box);
      return;
    }
    if (message) {
      const box = document.createElement("span");
      box.className = "studio-generate-warning";
      box.textContent = message;
      warning.appendChild(box);
    }
  }

  function showFatal(message) {
    const node = document.createElement("div");
    node.setAttribute("role", "alert");
    node.style.cssText =
      "position:fixed;inset:0;z-index:9999;display:grid;place-items:center;background:#fff;color:#7a1f1f;font:500 14px/1.5 'Instrument Sans',sans-serif;padding:24px;text-align:center";
    node.textContent = message;
    document.body.appendChild(node);
  }

  // The original editor already booted and generated its first variants. Expose
  // a debug/test hook without changing what the standalone page does.
  window.__STUDIO_GENERATE_BRIDGE__ = {
    protocolVersion: PROTOCOL_VERSION,
    toolStateVersion: TOOL_STATE_VERSION,
    serializeSourceState: serializeSourceState,
    getState: function () {
      return S;
    },
  };

  // `assets()` is the original UI updater. Alias it so the bridge can call it
  // from restoration code without depending on a function's display name.
  function assetsPanel() {
    assets();
  }
})();
