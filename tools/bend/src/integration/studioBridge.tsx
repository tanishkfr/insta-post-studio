/* Studio 2.0 dedicated BEND bridge.
 *
 * This is the only Studio integration surface. It does not replace BEND's
 * editor: it mounts the complete preserved EditorPage, restores `.bendpkg`
 * sessions into a temporary project, runs the original render/export engine,
 * and returns verified same-origin artifact URLs instead of huge postMessage
 * allocations.
 */
import { useEffect, useRef, useState } from "react";
import type { BendPackageArtifactDescriptor, BendPublishRequest, BendPublishResult } from "./contract";
import type { StudioPublishArtifacts } from "./studioPublish";
import { EditorPage } from "../features/editor/EditorPage";
import { useEditorStore } from "../app/store";
import type { AspectPreset, BendProject, MediaAssetRecord } from "../engine/core/types";
import { createProject, createVideoLayer, getProjectDuration, updateProjectDuration } from "../engine/core/project";
import {
  createAssetRecord,
  inspectMediaFile,
  isSupportedAudioFile,
  isSupportedVideoFile,
  probeAudio,
  probeVideo,
} from "../engine/media/media";
import { saveAsset, saveProject } from "../storage/indexedDb";
import { exportStillFrame } from "../engine/export/exporter";
import { getProjectVersion } from "./version";
import { createStudioPublishArtifacts, sha256Hex } from "./studioPublish";
import { cleanupStudioSession, restoreStudioEditPackage, studioTempProjectId } from "./studioSession";

const PROTOCOL_VERSION = "1.0.0";
const BRIDGE_VERSION = "1.0.0";
const TOOL_ID = "bend";
const SOURCE_VERSION = "1.0.0";
const SOURCE_MIME = "application/vnd.studio.bend+json";

export interface StudioBendSourceV1 {
  tool: "bend";
  schemaVersion: typeof SOURCE_VERSION;
  savedAt: string;
  bendProjectId: string;
  projectName: string;
  sourceRevision: string;
  aspectPreset: AspectPreset;
  canvas: { width: number; height: number; fps: number; duration: number };
  durationSeconds: number;
  package: (BendPackageArtifactDescriptor & { assetId?: string; url?: string }) | null;
  exportQuality: "preview" | "final" | null;
  isPreview: boolean;
  video: {
    mimeType: string | null;
    codec: string | null;
    width: number;
    height: number;
    durationSeconds: number;
    fps: number;
    container: string | null;
  } | null;
  poster: { width: number; height: number; timestamp: number } | null;
  audio: { present: boolean; message?: string } | null;
  host: {
    mode: "new" | "edit" | "static-handoff";
    editingLayerId: string | null;
    fitDecision: "fit" | "reformat" | null;
    sourceLayerIds: string[];
    sourceRevisions: Record<string, number>;
    handoff?: Record<string, unknown>;
  };
}

interface BootScope {
  projectId: string;
  sessionId: string;
  toolId: string;
  channelId: string;
}

export interface StudioBootConfig {
  protocolVersion: string;
  scope: BootScope;
  origins: {
    hostOrigin: string;
    toolOrigin: string;
    requireOriginMatch: boolean;
    allowNullOrigin: boolean;
  };
  hostOrigin?: string;
  toolOrigin?: string;
}

interface StudioRequest {
  protocolVersion: string;
  kind: "request";
  scope: BootScope;
  requestId: string;
  method: string;
  params?: Record<string, unknown>;
}

interface OpenOptions {
  mode?: "new" | "edit" | "static-handoff";
  editingLayerId?: string | null;
  fitDecision?: "fit" | "reformat" | null;
  sourceLayerIds?: string[];
  sourceRevisions?: Record<string, number>;
  handoff?: Record<string, unknown>;
  expectedSourceVersion?: string;
  expectedProjectId?: string;
  hostAspect?: { width: number; height: number };
}

export function readStudioBoot(): StudioBootConfig | null {
  const prefix = "#studio=";
  if (!window.location.hash.startsWith(prefix)) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(window.location.hash.slice(prefix.length))) as StudioBootConfig;
    if (!parsed || typeof parsed !== "object" || !parsed.scope || !parsed.origins) return null;
    return parsed;
  } catch {
    return null;
  }
}

interface BridgeState {
  capabilities: Record<string, unknown>;
  postEvent: (event: Record<string, unknown>) => void;
  publish: (requestId: string, request: BendPublishRequest) => Promise<BendPublishResult>;
  cancel: (requestId: string) => boolean;
  close: () => Promise<void>;
  ack: (keys: Array<"video" | "poster" | "package">) => void;
}

function createCapabilities() {
  return {
    toolId: TOOL_ID,
    adapterVersion: BRIDGE_VERSION,
    protocolVersion: PROTOCOL_VERSION,
    integrationMode: "dedicated-bridge",
    supported: [
      "open-canvas",
      "import-image",
      "import-project",
      "export-video",
      "export-package",
      "editable-source",
      "temporal",
      "audio",
      "keyframes",
      "bridge",
    ],
    limitations: [
      {
        code: "BROWSER_MEDIA_CODECS",
        summary:
          "BEND renders with Mediabunny/WebCodecs. Current Chromium/Edge can produce MP4/AAC or WebM; Firefox/Safari support depends on the platform encoder.",
        environmentDependent: true,
      },
      {
        code: "PREVIEW_QUALITY",
        summary:
          "Studio defaults to BEND's 720px-wide preview export. Final quality uses the full composition canvas and is never upsampled from preview.",
        environmentDependent: false,
      },
      {
        code: "STATIC_HANDOFF_CODEC_ALPHA",
        summary:
          "The static-artwork handoff encodes a flat video clip. Alpha is not claimed; the handoff dialog requires an explicit background choice.",
        environmentDependent: true,
      },
      {
        code: "SINGLE_TEMPORAL_LAYER",
        summary:
          "Studio previews one BEND layer at a time with host mute by default; synchronized multi-video/audio composition is not part of this bridge.",
        environmentDependent: false,
      },
      {
        code: "SOURCE_AUDIO_CODEC",
        summary:
          "Audio is mixed by BEND's original exporter. Video-only output is reported honestly when no decodable source/encoder is available.",
        environmentDependent: true,
      },
    ],
    outputFormats: ["video/mp4", "video/webm", "image/png", "application/vnd.bend.project"],
    runtimeRequirements: {
      secureContext: true,
      indexedDb: true,
      webCodecs: true,
      crossOriginIsolation: false,
    },
  } as const;
}

export function StudioBendBridgeRoot({ boot }: { boot: StudioBootConfig }) {
  const project = useEditorStore((state) => state.project);
  const [bridgeError, setBridgeError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const bridgeRef = useRef<BridgeState | null>(null);

  useEffect(() => {
    let bridge: BridgeState | null = null;
    try {
      bridge = installStudioBendBridge(boot, {
        setError: setBridgeError,
        onReady: () => setMounted(true),
      });
      bridgeRef.current = bridge;
    } catch (error) {
      setBridgeError(
        error instanceof Error ? error.message : "The Studio bridge could not start.",
      );
    }
    return () => {
      if (bridge) void bridge.close();
      bridgeRef.current = null;
    };
  }, [boot]);

  if (bridgeError) {
    return (
      <main className="editor-page editor-loading">
        <div className="canvas-overlay-note" role="alert">
          <strong>BEND could not open the Studio session.</strong>
          <span>{bridgeError}</span>
        </div>
      </main>
    );
  }

  if (!project || !mounted) {
    return (
      <main className="editor-page editor-loading">
        <div className="canvas-overlay-note" id="studioBendBridgeReady">
          Preparing BEND for Studio…
        </div>
      </main>
    );
  }

  return (
    <EditorPage
      onExit={() => {
        useEditorStore.getState().notify(
          "Return to Studio with the Canvas button to keep or publish this draft.",
          "info",
        );
      }}
      onNavigateHome={() => {
        useEditorStore.getState().notify(
          "This BEND session belongs to Studio. Use the Canvas button in the Studio header to leave.",
          "info",
        );
      }}
      hostContext={null}
      onHostUpdated={() => undefined}
    />
  );
}

function installStudioBendBridge(
  boot: StudioBootConfig,
  hooks: { setError: (message: string | null) => void; onReady: () => void },
): BridgeState {
  if (
    boot.protocolVersion !== PROTOCOL_VERSION ||
    boot.scope.toolId !== TOOL_ID ||
    typeof boot.origins?.hostOrigin !== "string" ||
    typeof boot.origins?.toolOrigin !== "string"
  ) {
    hooks.setError("The Studio bridge handshake is malformed.");
    throw new Error("Malformed BEND Studio bridge handshake.");
  }
  const hostOrigin = boot.origins.hostOrigin;
  const toolOrigin = boot.origins.toolOrigin;
  const scope = boot.scope;
  if (window.location.origin !== toolOrigin) {
    hooks.setError("BEND is running on an unexpected origin.");
    throw new Error("BEND tool origin mismatch.");
  }

  const capabilities = createCapabilities();
  const store = useEditorStore;
  let initialized = false;
  let restoring = false;
  let dirtyTimer = 0;
  let tempProjectId: string | null = null;
  const sessionProjectIds = new Set<string>();
  let openOptions: OpenOptions = {};
  let baseSourceVersion: string | null = null;
  let lastContext: { activeArtboard?: { width?: number; height?: number; id?: string } } | null = null;
  let lastPublish: StudioPublishArtifacts | null = null;
  let lastPublishPackage: BendPackageArtifactDescriptor | null = null;
  let lastPublishMeta: AlignmentMeta | null = null;
  const publishControllers = new Map<string, AbortController>();
  let closed = false;

  const unsubscribe = store.subscribe(() => {
    if (!initialized || restoring || closed) return;
    window.clearTimeout(dirtyTimer);
    dirtyTimer = window.setTimeout(() => postEvent({ type: "dirty", dirty: true }), 80);
  });

  window.addEventListener("message", handleMessage);
  installEmbedChrome();
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      postEvent({ type: "ready", capabilities });
      hooks.onReady();
      const badge = document.getElementById("studioBendBridgeBadge");
      if (badge) badge.textContent = "Studio session ready";
    });
  });

  return {
    capabilities,
    postEvent,
    publish: handlePublish,
    cancel: (requestId) => {
      const controller = publishControllers.get(requestId);
      if (!controller) return false;
      controller.abort();
      publishControllers.delete(requestId);
      return true;
    },
    close: async () => {
      if (closed) return;
      closed = true;
      window.removeEventListener("message", handleMessage);
      unsubscribe();
      window.clearTimeout(dirtyTimer);
      for (const controller of publishControllers.values()) controller.abort();
      publishControllers.clear();
      lastPublish?.releaseAll();
      lastPublish = null;
      await cleanupStudioSession(sessionProjectIds).catch(() => undefined);
    },
    ack: (keys) => {
      lastPublish?.release(keys);
    },
  };

  function postEvent(event: Record<string, unknown>): void {
    if (window.parent === window || closed) return;
    window.parent.postMessage(
      {
        protocolVersion: PROTOCOL_VERSION,
        kind: "event",
        scope,
        event,
        sentAt: new Date().toISOString(),
      },
      hostOrigin,
    );
  }

  function reply(message: Record<string, unknown>): void {
    if (window.parent === window) return;
    window.parent.postMessage(message, hostOrigin);
  }

  function okResponse(requestId: string, method: string, result: unknown) {
    return {
      protocolVersion: PROTOCOL_VERSION,
      kind: "response",
      scope,
      requestId,
      method,
      ok: true,
      result,
      sentAt: new Date().toISOString(),
    };
  }

  function errorResponse(requestId: string, method: string, code: string, message: string, retryable = false) {
    return {
      protocolVersion: PROTOCOL_VERSION,
      kind: "response",
      scope,
      requestId,
      method,
      ok: false,
      error: { code, message, retryable },
      sentAt: new Date().toISOString(),
    };
  }

  function scopesMatch(candidate: unknown): candidate is BootScope {
    if (!candidate || typeof candidate !== "object") return false;
    const value = candidate as Record<string, unknown>;
    return (
      value.projectId === scope.projectId &&
      value.sessionId === scope.sessionId &&
      value.toolId === scope.toolId &&
      value.channelId === scope.channelId
    );
  }

  function handleMessage(event: MessageEvent): void {
    if (closed) return;
    if (event.source !== window.parent) return;
    if (event.origin !== hostOrigin) return;
    const message = event.data as StudioRequest | undefined;
    if (!message || typeof message !== "object" || message.kind !== "request") return;
    if (typeof message.requestId !== "string" || typeof message.method !== "string") return;
    if (message.protocolVersion !== PROTOCOL_VERSION || !scopesMatch(message.scope)) {
      reply(
        errorResponse(
          message.requestId,
          message.method,
          "SCOPE_MISMATCH",
          "The Studio session does not match this BEND editor.",
        ),
      );
      return;
    }
    void Promise.resolve()
      .then(() => dispatch(message.requestId, message.method, message.params ?? {}))
      .then((result) => reply(okResponse(message.requestId, message.method, result)))
      .catch((error: unknown) => {
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

  function dispatch(requestId: string, method: string, params: Record<string, unknown>): unknown {
    switch (method) {
      case "tool/initialize":
        initialized = true;
        return openResult();
      case "tool/open":
        openOptions = normalizeOpenOptions(params.options);
        if (params.global && typeof params.global === "object") lastContext = params.global as typeof lastContext;
        updateContextChip();
        ensureProjectForOpen(params);
        return openResult();
      case "context/update":
        lastContext = params as typeof lastContext;
        updateContextChip();
        return {
          applied: true,
          activeArtboardId:
            params && typeof params === "object" && params.activeArtboard && typeof params.activeArtboard === "object"
              ? String((params.activeArtboard as { id?: unknown }).id ?? "")
              : "",
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
      case "bend/publish":
        return handlePublish(requestId, params as unknown as BendPublishRequest);
      case "bend/publish/ack": {
        const keys = Array.isArray(params.artifacts)
          ? params.artifacts.filter((key): key is "video" | "poster" | "package" => key === "video" || key === "poster" || key === "package")
          : [];
        lastPublish?.release(keys);
        return { released: true as const };
      }
      case "operation/cancel": {
        const target = typeof params.targetRequestId === "string" ? params.targetRequestId : "";
        const controller = publishControllers.get(target);
        if (!controller) return { cancelled: false };
        controller.abort();
        publishControllers.delete(target);
        return { cancelled: true };
      }
      case "tool/close": {
        void closeBridge();
        return { closed: true as const };
      }
      default:
        throw adapterError("UNKNOWN_METHOD", `Unknown BEND Studio bridge method: ${method}`);
    }
  }

  function openResult() {
    return { sessionId: scope.sessionId, capabilities, warnings: [] };
  }

  function normalizeOpenOptions(value: unknown): OpenOptions {
    if (!value || typeof value !== "object") return {};
    const record = value as Record<string, unknown>;
    return {
      mode: record.mode === "edit" || record.mode === "static-handoff" ? record.mode : "new",
      editingLayerId: typeof record.editingLayerId === "string" ? record.editingLayerId : null,
      fitDecision: record.fitDecision === "fit" || record.fitDecision === "reformat" ? record.fitDecision : null,
      sourceLayerIds: Array.isArray(record.sourceLayerIds) ? record.sourceLayerIds.filter((id): id is string => typeof id === "string") : [],
      sourceRevisions: record.sourceRevisions && typeof record.sourceRevisions === "object"
        ? Object.fromEntries(Object.entries(record.sourceRevisions as Record<string, unknown>).filter((entry): entry is [string, number] => typeof entry[1] === "number"))
        : {},
      handoff: record.handoff && typeof record.handoff === "object" ? record.handoff as Record<string, unknown> : undefined,
      expectedSourceVersion: typeof record.expectedSourceVersion === "string" ? record.expectedSourceVersion : undefined,
      expectedProjectId: typeof record.expectedProjectId === "string" ? record.expectedProjectId : undefined,
      hostAspect: record.hostAspect && typeof record.hostAspect === "object"
        ? {
            width: Number((record.hostAspect as { width?: unknown }).width),
            height: Number((record.hostAspect as { height?: unknown }).height),
          }
        : undefined,
    };
  }

  function ensureProjectForOpen(params: Record<string, unknown>): void {
    const current = store.getState().project;
    const activeArtboard = (params.global as { activeArtboard?: { width?: number; height?: number } } | undefined)?.activeArtboard;
    const aspect = aspectForDimensions(
      openOptions.hostAspect?.width ?? activeArtboard?.width ?? current?.canvas.width ?? 1080,
      openOptions.hostAspect?.height ?? activeArtboard?.height ?? current?.canvas.height ?? 1350,
    );
    tempProjectId = studioTempProjectId({
      sessionId: scope.sessionId,
      layerId: openOptions.editingLayerId ?? null,
    });
    if (current && current.id.startsWith("bend-studio-")) {
      tempProjectId = current.id;
      return;
    }
    if (current) {
      // An in-session BEND project already exists (for example the user started
      // one before a retry). Keep it; the host still owns publish/cancel.
      return;
    }
    const name = typeof params.projectName === "string" && params.projectName.trim()
      ? `${params.projectName.trim()} / BEND motion`
      : "Studio BEND composition";
    const project = createProject(aspect, name);
    project.id = tempProjectId;
    sessionProjectIds.add(tempProjectId);
    store.getState().setProject(project, {}, {}, null);
    void saveProject(project, Date.now()).catch(() => undefined);
  }

  async function receiveInputAssets(params: Record<string, unknown>): Promise<Array<Record<string, unknown>>> {
    const inputs = Array.isArray(params) ? params : [];
    const receipts: Array<Record<string, unknown>> = [];
    for (const raw of inputs) {
      const layerId = raw && typeof raw === "object" && typeof (raw as { layerId?: unknown }).layerId === "string"
        ? (raw as { layerId: string }).layerId
        : "";
      try {
        const input = raw as {
          asset?: {
            id?: string;
            name?: string;
            mimeType?: string;
            byteSize?: number;
            contentHash?: string;
            storage?: { backend?: string; url?: string };
            durationSeconds?: number;
          };
          bytes?: Uint8Array;
          role?: string;
        };
        const asset = input.asset;
        if (!asset?.storage) throw new Error("The host did not supply a storage locator for this source.");
        let blob: Blob;
        if (input.bytes instanceof Uint8Array) {
          blob = new Blob([input.bytes.slice().buffer as ArrayBuffer], { type: asset.mimeType || "application/octet-stream" });
        } else {
          const url = asset.storage.backend === "external-url" ? asset.storage.url : undefined;
          if (!url) throw new Error("Only verified same-origin object-URL handoff is supported for large BEND inputs.");
          assertSameOriginUrl(url);
          const response = await fetch(url);
          if (!response.ok) throw new Error(`The host asset could not be fetched (${response.status}).`);
          blob = await response.blob();
        }
        if (asset.byteSize && blob.size !== asset.byteSize) {
          throw new Error("The supplied source byte length does not match its declaration.");
        }
        if (!asset.contentHash) throw new Error("The supplied source is missing its content hash.");
        const bytes = new Uint8Array(await blob.arrayBuffer());
        if (await sha256Hex(bytes) !== asset.contentHash) {
          throw new Error("The supplied source failed its content-hash check.");
        }
        const file = new File([blob], asset.name || "studio-input", { type: asset.mimeType || blob.type || "application/octet-stream" });
        const isAudio = input.role === "audio-bed" || asset.mimeType?.startsWith("audio/") || isSupportedAudioFile(file) && !isSupportedVideoFile(file);
        if (isAudio) {
          if (!isSupportedAudioFile(file)) throw new Error("BEND does not support that audio source format.");
          const metadata = await probeAudio(file);
          const inspection = await inspectMediaFile(file);
          const record: MediaAssetRecord = {
            ...createAssetRecord(file, metadata, "audio"),
            ...inspection,
          };
          await saveAsset({ ...record, blob: file });
          const url = URL.createObjectURL(file);
          applyInputMedia(record, url, "audio", layerId);
          receipts.push({ inputLayerId: layerId, accepted: true, localAssetId: record.id, message: "Audio added as the BEND soundtrack." });
          continue;
        }
        if (!isSupportedVideoFile(file)) throw new Error("BEND supports browser-decodable MP4/WebM video sources.");
        const metadata = await probeVideo(file);
        const inspection = await inspectMediaFile(file);
        const record: MediaAssetRecord = {
          ...createAssetRecord(file, metadata, "video"),
          ...inspection,
        };
        await saveAsset({ ...record, blob: file });
        const url = URL.createObjectURL(file);
        applyInputMedia(record, url, "video", layerId);
        receipts.push({ inputLayerId: layerId, accepted: true, localAssetId: record.id, message: "Clip added to the BEND timeline." });
      } catch (error) {
        receipts.push({
          inputLayerId: layerId,
          accepted: false,
          message: error instanceof Error ? error.message : "The host input could not be imported.",
        });
      }
    }
    return receipts;
  }

  function applyInputMedia(record: MediaAssetRecord, url: string, mediaType: "video" | "audio", hostLayerId: string): void {
    const state = store.getState();
    const current = state.project;
    if (!current) throw new Error("BEND is not ready to receive media.");
    const aspect = aspectForDimensions(current.canvas.width, current.canvas.height);
    if (mediaType === "audio") {
      const next: BendProject = {
        ...current,
        assets: { ...current.assets, [record.id]: record },
        soundtrack: {
          assetId: record.id,
          timelineStart: 0,
          sourceIn: 0,
          sourceOut: record.duration,
          gainDb: 0,
          muted: false,
          fadeIn: 0,
          fadeOut: 0,
          loop: false,
          loopCrossfade: 0,
          ducking: { enabled: false, amountDb: 10, thresholdDb: -36, attack: 0.08, release: 0.4 },
        },
      };
      state.setAssetRecord(record);
      state.setAssetUrl(record.id, url);
      state.commit("Import Studio soundtrack", () => next);
      state.notify("Studio artwork soundtrack added to BEND.", "info");
      return;
    }

    if (current.layers.length === 0) {
      const project = createProjectFromAsset(aspect, record, current.id, current.name);
      state.setProject(project, { [record.id]: record }, { [record.id]: url }, project.layers[0]?.id ?? null);
      state.notify(
        openOptions.mode === "static-handoff"
          ? `Studio artwork imported as a ${record.duration.toFixed(2)}s editable clip. Split, trim, add effects or animate it in BEND.`
          : "Host video imported into BEND.",
        "info",
      );
      return;
    }

    state.setAssetRecord(record);
    state.setAssetUrl(record.id, url);
    state.commit("Import Studio artwork", (draft) => {
      draft.assets = { ...draft.assets, [record.id]: record };
      const layer = createVideoLayerFromRecord(record);
      layer.timeline.start = Math.max(0, ...draft.layers.map((candidate) => candidate.timeline.start + candidate.timeline.duration));
      draft.layers = [...draft.layers, layer];
      return updateProjectDuration(draft);
    });
    state.notify("Host artwork added to the BEND timeline.", "info");
  }

  async function restoreSourceState(params: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (
      params.tool !== TOOL_ID ||
      params.mimeType !== SOURCE_MIME ||
      params.toolStateVersion !== SOURCE_VERSION
    ) {
      return {
        restored: false,
        warnings: ["The saved source document is not a supported Studio BEND 1.0.0 document."],
      };
    }
    const content = params.content;
    if (typeof content !== "string" && !(content instanceof Uint8Array)) {
      return { restored: false, warnings: ["The saved BEND source document is missing its content."] };
    }
    let parsed: StudioBendSourceV1;
    try {
      parsed = JSON.parse(typeof content === "string" ? content : new TextDecoder().decode(content)) as StudioBendSourceV1;
    } catch {
      return { restored: false, warnings: ["The saved BEND source document is not valid JSON."] };
    }
    const pkg = parsed.package;
    if (!pkg?.url) {
      return {
        restored: false,
        warnings: [
          "The editable .bendpkg bytes were not supplied by the host. BEND will not restore a flattened preview as editable source.",
        ],
      };
    }
    if (!openOptions.fitDecision) {
      const current = store.getState().project;
      const artboardWidth = lastContext?.activeArtboard?.width ?? current?.canvas.width ?? 0;
      const artboardHeight = lastContext?.activeArtboard?.height ?? current?.canvas.height ?? 0;
      const packageAspect = parsed.canvas.width / parsed.canvas.height;
      if (artboardWidth > 0 && artboardHeight > 0 && Math.abs(packageAspect - artboardWidth / artboardHeight) > 0.005) {
        return {
          restored: false,
          warnings: [
            `This editable BEND project is ${Math.round(packageAspect * 100) / 100}:1 but the Studio artboard is ${Math.round(artboardWidth)}×${Math.round(artboardHeight)}. Choose Fit inside the artboard or Reformat before opening.`,
          ],
        };
      }
    }
    restoring = true;
    try {
      assertSameOriginUrl(pkg.url);
      const response = await fetch(pkg.url);
      if (!response.ok) throw new Error(`The editable package could not be fetched (${response.status}).`);
      const blob = await response.blob();
      if (blob.size !== pkg.byteLength) throw new Error("The editable package byte length does not match its committed reference.");
      const bytes = new Uint8Array(await blob.arrayBuffer());
      if (await sha256Hex(bytes) !== pkg.sha256) throw new Error("The editable package failed its content-hash check.");
      tempProjectId = studioTempProjectId({
        sessionId: scope.sessionId,
        layerId: openOptions.editingLayerId ?? parsed.bendProjectId,
      });
      const restored = await restoreStudioEditPackage({
        blob,
        tempProjectId,
        expectedProjectId: parsed.bendProjectId,
        expectedSourceVersion: openOptions.expectedSourceVersion ?? parsed.sourceRevision,
      });
      tempProjectId = restored.tempProjectId;
      sessionProjectIds.add(tempProjectId);
      let project = restored.project;
      let reformatted = false;
      if (openOptions.fitDecision === "reformat") {
        const next = reformatProjectToHost(project, lastContext?.activeArtboard?.width ?? project.canvas.width, lastContext?.activeArtboard?.height ?? project.canvas.height);
        reformatted = next !== project;
        project = next;
      }
      baseSourceVersion = restored.sourceVersion;
      store.getState().setProject(project, restored.assets, restored.urls, project.layers.at(-1)?.id ?? null);
      if (reformatted) void saveProject(project, Date.now()).catch(() => undefined);
      return {
        restored: true,
        warnings: restored.warnings,
      };
    } catch (error) {
      return {
        restored: false,
        warnings: [error instanceof Error ? error.message : "The editable BEND package could not be restored."],
      };
    } finally {
      restoring = false;
      window.clearTimeout(dirtyTimer);
    }
  }

  function serializeSourceState(): Record<string, unknown> {
    const current = store.getState().project;
    if (!current) throw new Error("BEND has no editable project yet.");
    const source = buildStudioSource(current, openOptions, baseSourceVersion, lastPublishPackage, lastPublishMeta);
    return {
      tool: TOOL_ID,
      toolStateVersion: SOURCE_VERSION,
      mimeType: SOURCE_MIME,
      content: JSON.stringify(source),
      label: `BEND · ${current.layers.length} layer${current.layers.length === 1 ? "" : "s"}`,
    };
  }

  async function renderArtwork(params: Record<string, unknown>): Promise<Record<string, unknown>> {
    const current = store.getState().project;
    if (!current) throw new Error("BEND has no composition to render.");
    if (params.format === "mp4" || params.format === "mov") {
      throw adapterError(
        "CAPABILITY_UNSUPPORTED",
        "BEND video publication uses the dedicated bend/publish controller so it can return a verified video, poster and editable package together.",
      );
    }
    if (params.format !== "png") {
      throw adapterError("CAPABILITY_UNSUPPORTED", "BEND still renders only support PNG.");
    }
    const range = params.timeRange as { startSeconds?: unknown } | undefined;
    const time = typeof range?.startSeconds === "number" && Number.isFinite(range.startSeconds)
      ? range.startSeconds
      : store.getState().currentTime;
    const still = await exportStillFrame({
      project: current,
      assetUrls: store.getState().assetUrls,
      time,
    });
    return {
      requestId: typeof params.requestId === "string" ? params.requestId : "",
      rendered: {
        kind: "image",
        mimeType: "image/png",
        width: still.width,
        height: still.height,
      },
      bytes: new Uint8Array(await still.blob.arrayBuffer()),
      sourceRevision: getProjectVersion(current),
      warnings: [],
    };
  }

  async function handlePublish(requestId: string, request: BendPublishRequest): Promise<BendPublishResult> {
    if (publishControllers.size > 0) {
      throw adapterError("INTERNAL", "A BEND publish is already running. Cancel it before starting another.", true);
    }
    const current = store.getState().project;
    if (!current) throw new Error("BEND has no composition to publish.");
    if (request.expectedSourceVersion && baseSourceVersion && baseSourceVersion !== request.expectedSourceVersion) {
      throw adapterError(
        "STATE_VERSION_UNSUPPORTED",
        `This BEND layer was updated elsewhere after it was opened (expected ${baseSourceVersion}, package ${request.expectedSourceVersion}). Reopen the layer before committing a new revision.`,
      );
    }
    if (request.expectedSourceVersion && !baseSourceVersion && openOptions.mode === "edit") {
      throw adapterError(
        "STATE_VERSION_UNSUPPORTED",
        "The editable source package was not restored for this edit session, so BEND cannot safely update it.",
      );
    }
    if (!request.quality || (request.quality !== "preview" && request.quality !== "final")) {
      throw adapterError("BAD_REQUEST", "Choose a valid BEND publish quality.");
    }
    const controller = new AbortController();
    publishControllers.set(requestId, controller);
    try {
      const artifacts = await createStudioPublishArtifacts({
        project: current,
        assetUrls: store.getState().assetUrls,
        quality: request.quality,
        signal: controller.signal,
        onProgress: (progress) => {
          postEvent({
            type: "progress",
            operation: "bend/publish",
            progress: publishProgress(progress.phase, progress.completed, progress.total),
            message: progress.label,
          });
        },
      });
      if (controller.signal.aborted) {
        artifacts.releaseAll();
        throw new DOMException("BEND publish cancelled.", "AbortError");
      }
      lastPublish?.releaseAll();
      lastPublish = artifacts;
      lastPublishPackage = artifacts.result.package;
      lastPublishMeta = {
        width: artifacts.result.canvas.width,
        height: artifacts.result.canvas.height,
        fps: artifacts.result.canvas.fps,
        duration: artifacts.result.canvas.duration,
        videoWidth: artifacts.result.video.width,
        videoHeight: artifacts.result.video.height,
        mimeType: artifacts.result.video.mimeType,
        codec: artifacts.result.video.codec,
        container: artifacts.result.video.container,
        audioPresent: artifacts.result.audioPresent,
        audioMessage: artifacts.result.audioMessage,
      };
      return artifacts.result;
    } catch (error) {
      if (isAbortError(error)) {
        throw adapterError("CANCELLED", "BEND publish cancelled. The previous Studio layer was not changed.", true);
      }
      const message = error instanceof Error ? error.message : "BEND could not publish this composition.";
      postEvent({
        type: "issue",
        issue: {
          code: "RENDER_FAILED",
          message,
          severity: "error",
          recoverable: true,
          occurredAt: new Date().toISOString(),
        },
      });
      throw error;
    } finally {
      publishControllers.delete(requestId);
    }
  }

  async function closeBridge(): Promise<void> {
    if (closed) return;
    closed = true;
    window.removeEventListener("message", handleMessage);
    unsubscribe();
    window.clearTimeout(dirtyTimer);
    for (const controller of publishControllers.values()) controller.abort();
    publishControllers.clear();
    lastPublish?.releaseAll();
    lastPublish = null;
    // Let the close response leave the iframe before deleting local session data.
    window.setTimeout(() => {
      void cleanupStudioSession(sessionProjectIds).catch(() => undefined);
    }, 250);
  }

  function installEmbedChrome(): void {
    document.title = "BEND · Studio";
    document.body.classList.add("studio-embedded-bend");
    const style = document.createElement("style");
    style.id = "studio-bend-embed-style";
    style.textContent = [
      "body.studio-embedded-bend .studio-bend-context{display:flex;align-items:baseline;gap:8px;min-width:0;margin-left:12px;margin-right:auto}",
      "body.studio-embedded-bend .studio-bend-context strong{font-size:11px;font-weight:650;letter-spacing:.14em;text-transform:uppercase;color:#236F72}",
      "body.studio-embedded-bend .studio-bend-context span{font-size:11px;color:#526C6E;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      "body.studio-embedded-bend .studio-bend-context i{width:5px;height:5px;border-radius:50%;background:#236F72;display:inline-block;margin-right:5px;vertical-align:1px}",
      "body.studio-embedded-bend .studio-bend-quality{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#526C6E;border:1px solid rgba(35,111,114,.25);border-radius:999px;padding:3px 7px}",
    ].join("\n");
    document.head.appendChild(style);
    const badge = document.createElement("span");
    badge.hidden = true;
    badge.id = "studioBendBridgeReady";
    badge.textContent = "ready";
    document.body.appendChild(badge);
    const badge2 = document.createElement("span");
    badge2.hidden = true;
    badge2.id = "studioBendBridgeBadge";
    badge2.textContent = "preparing";
    document.body.appendChild(badge2);
    let attempts = 0;
    const attach = () => {
      if (closed) return;
      const topbarLeft = document.querySelector(".editor-topbar .topbar-left");
      if (!topbarLeft) {
        if (attempts++ < 40) window.setTimeout(attach, 100);
        return;
      }
      if (document.querySelector(".studio-bend-context")) return;
      const context = document.createElement("div");
      context.className = "studio-bend-context";
      context.setAttribute("data-testid", "bend-studio-context");
      const title = document.createElement("strong");
      title.textContent = "Studio · BEND";
      const meta = document.createElement("span");
      meta.id = "studioBendContext";
      meta.textContent = "motion layer";
      context.append(title, meta);
      topbarLeft.appendChild(context);
      updateContextChip();
    };
    attach();
  }

  function updateContextChip(): void {
    const chip = document.getElementById("studioBendContext");
    if (!chip) return;
    const artboard = lastContext?.activeArtboard;
    if (!artboard || !artboard.width || !artboard.height) {
      chip.textContent = "motion layer";
      return;
    }
    const ratio =
      Math.abs(artboard.width / artboard.height - 4 / 5) <= 0.01
        ? "4:5"
        : Math.abs(artboard.width / artboard.height - 1) <= 0.01
          ? "1:1"
          : Math.abs(artboard.width / artboard.height - 9 / 16) <= 0.01
            ? "9:16"
            : `${artboard.width}:${artboard.height}`;
    chip.innerHTML = "";
    const dot = document.createElement("i");
    dot.setAttribute("aria-hidden", "true");
    chip.appendChild(dot);
    chip.appendChild(
      document.createTextNode(`Artboard · ${ratio} · ${artboard.width}×${artboard.height}`),
    );
  }
}

interface AlignmentMeta {
  width: number;
  height: number;
  fps: number;
  duration: number;
  videoWidth: number;
  videoHeight: number;
  mimeType: string;
  codec: string | null;
  container: string;
  audioPresent: boolean;
  audioMessage?: string;
}

function buildStudioSource(
  project: BendProject,
  options: OpenOptions,
  baseSourceVersion: string | null,
  lastPackage: BendPackageArtifactDescriptor | null,
  meta: AlignmentMeta | null,
): StudioBendSourceV1 {
  const sourceRevision = getProjectVersion(project);
  return {
    tool: "bend",
    schemaVersion: SOURCE_VERSION,
    savedAt: new Date().toISOString(),
    bendProjectId: options.expectedProjectId ?? project.id,
    projectName: project.name,
    sourceRevision,
    aspectPreset: aspectForDimensions(project.canvas.width, project.canvas.height),
    canvas: {
      width: project.canvas.width,
      height: project.canvas.height,
      fps: project.canvas.fps,
      duration: project.canvas.duration,
    },
    durationSeconds: getProjectDuration(project),
    package: lastPackage
      ? {
          url: "",
          mimeType: lastPackage.mimeType,
          byteLength: lastPackage.byteLength,
          sha256: lastPackage.sha256,
          format: lastPackage.format,
          formatVersion: lastPackage.formatVersion,
          projectId: lastPackage.projectId,
          sourceRevision: lastPackage.sourceRevision,
          media: lastPackage.media,
        }
      : {
          url: "",
          mimeType: "application/vnd.bend.project",
          byteLength: 0,
          sha256: "",
          format: "bendpkg",
          formatVersion: 1,
          projectId: project.id,
          sourceRevision: baseSourceVersion ?? sourceRevision,
          media: Object.values(project.assets).map((asset) => ({
            id: asset.id,
            name: asset.name,
            mimeType: asset.mimeType,
            byteLength: asset.size,
            sha256: null,
            width: asset.width,
            height: asset.height,
            durationSeconds: asset.duration,
          })),
        },
    exportQuality: meta ? (meta.videoWidth < meta.width ? "preview" : "final") : null,
    isPreview: meta ? meta.videoWidth < meta.width : false,
    video: meta
      ? {
          mimeType: meta.mimeType,
          codec: meta.codec,
          width: meta.videoWidth,
          height: meta.videoHeight,
          durationSeconds: meta.duration,
          fps: meta.fps,
          container: meta.container,
        }
      : null,
    poster: meta ? { width: meta.width, height: meta.height, timestamp: 0 } : null,
    audio: meta ? { present: meta.audioPresent, message: meta.audioMessage } : null,
    host: {
      mode: options.mode ?? "new",
      editingLayerId: options.editingLayerId ?? null,
      fitDecision: options.fitDecision ?? null,
      sourceLayerIds: options.sourceLayerIds ?? [],
      sourceRevisions: options.sourceRevisions ?? {},
      handoff: options.handoff,
    },
  };
}

function createProjectFromAsset(
  aspect: AspectPreset,
  record: MediaAssetRecord,
  id: string,
  name: string,
): BendProject {
  const project = createProject(aspect, name);
  project.id = id;
  const layer = createVideoLayerFromRecord(record);
  project.assets = { [record.id]: record };
  project.layers = [layer];
  project.canvas.duration = layer.timeline.duration;
  project.timeline = { inPoint: 0, outPoint: layer.timeline.duration };
  project.loop = { ...project.loop, start: 0, end: layer.timeline.duration };
  project.cover = { time: 0 };
  return project;
}

function createVideoLayerFromRecord(record: MediaAssetRecord) {
  const duration = Math.max(0.5, record.duration || 3);
  const layer = createVideoLayer({ ...record, duration });
  layer.timeline.duration = duration;
  layer.trimEnd = duration;
  return layer;
}

function reformatProjectToHost(project: BendProject, width: number, height: number): BendProject {
  if (!width || !height) return project;
  const previousWidth = project.canvas.width;
  const previousHeight = project.canvas.height;
  if (previousWidth === width && previousHeight === height) return project;
  const xRatio = width / previousWidth;
  const yRatio = height / previousHeight;
  return {
    ...project,
    canvas: { ...project.canvas, width, height },
    layers: project.layers.map((layer) => ({
      ...layer,
      transform: {
        ...layer.transform,
        x: layer.transform.x * xRatio,
        y: layer.transform.y * yRatio,
      },
    })),
    metadata: { ...project.metadata, updatedAt: Date.now() },
  };
}

function aspectForDimensions(width: number, height: number): AspectPreset {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return "4:5";
  const ratio = width / height;
  if (Math.abs(ratio - 0.8) <= 0.01) return "4:5";
  if (Math.abs(ratio - 1) <= 0.01) return "1:1";
  if (Math.abs(ratio - 9 / 16) <= 0.01) return "9:16";
  if (Math.abs(ratio - 16 / 9) <= 0.01) return "16:9";
  throw new Error(`BEND has no preset for a ${width}×${height} Studio artboard.`);
}

function assertSameOriginUrl(value: string): void {
  let url: URL;
  try {
    url = new URL(value, window.location.href);
  } catch {
    throw new Error("The host supplied an invalid asset URL.");
  }
  if (url.protocol !== "blob:" && url.origin !== window.location.origin) {
    throw new Error("BEND only accepts same-origin or blob asset handoff URLs.");
  }
}

function publishProgress(phase: string, completed: number, total: number): number {
  const ratio = total > 0 ? Math.min(1, Math.max(0, completed / total)) : 0;
  if (phase === "video") return 0.05 + ratio * 0.72;
  if (phase === "poster") return 0.8 + ratio * 0.08;
  if (phase === "package") return 0.9 + ratio * 0.07;
  return 1;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function structuredError(error: unknown): { code: string; message: string; retryable: boolean } {
  if (error && typeof error === "object") {
    const candidate = error as { code?: unknown; message?: unknown; retryable?: unknown };
    if (typeof candidate.code === "string" && typeof candidate.message === "string") {
      return {
        code: candidate.code,
        message: candidate.message,
        retryable: candidate.retryable === true,
      };
    }
  }
  return {
    code: "ADAPTER_ERROR",
    message: error instanceof Error ? error.message : "BEND could not complete that operation.",
    retryable: false,
  };
}

function adapterError(code: string, message: string, retryable = false): Error & { code: string; retryable: boolean } {
  const error = new Error(message) as Error & { code: string; retryable: boolean };
  error.code = code;
  error.retryable = retryable;
  return error;
}

export { SOURCE_MIME as BEND_SOURCE_MIME, SOURCE_VERSION as BEND_SOURCE_VERSION };
