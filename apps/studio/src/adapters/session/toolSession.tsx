import type {
  Artboard,
  AssetReference,
  RenderedAssetReference,
  SharedLayer,
  SourceToolId,
  StudioProject,
  TemporalMetadata,
  ToolInputAsset,
  ToolSourceStatePayload,
  ToolSourceStateReference,
  ToolSourceStateRestoreResult,
} from "@studio/contracts";
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from "react";
import {
  IframeToolAdapter,
  ToolAdapterTransportError,
} from "../iframe/IframeToolAdapter";
import { createId } from "../../lib/ids";
import { assetRepository } from "../../storage/instances";
import { sourceRevisionForLayer } from "../vector/captureVectorArtwork";

export interface ToolSessionCapture {
  sourceState: ToolSourceStateReference;
  rendered: RenderedAssetReference;
  renderedAsset: AssetReference;
  /** Optional static cover/poster for a temporal layer. */
  poster?: RenderedAssetReference | null;
  posterAsset?: AssetReference;
  /** Host temporal preview metadata; BEND is the only producer in Phase 4. */
  temporal?: TemporalMetadata;
  /** Optional stale-revision guard consumed by the host publish handler. */
  guard?: {
    expectedHostRevision: number;
    expectedSourceRevision: string;
    sourceLayerIds: string[];
  };
  sourceAssets?: AssetReference[];
  suggestedName: string;
  tags?: string[];
}

export interface SourceLoadContext {
  project: StudioProject;
  artboard: Artboard;
  layer: SharedLayer | null;
  sourcePayload: ToolSourceStatePayload | null;
  parsedSource: unknown;
}

export interface CaptureContext<TCapture extends ToolSessionCapture> {
  adapter: IframeToolAdapter;
  project: StudioProject;
  artboard: Artboard;
  layer: SharedLayer | null;
  revision: number;
  assets: typeof assetRepository;
}

export interface ToolSessionConfig<TCapture extends ToolSessionCapture> {
  toolId: SourceToolId;
  label: string;
  bridgePath: string;
  iframeTitle: string;
  testId: string;
  /** Optimistic UI title for a new document. */
  newDocumentTitle: string;
  /** Parses and validates the tool's own source document. Throws on unsupported versions. */
  parseSource: (payload: ToolSourceStatePayload) => unknown;
  /** Resolves any binary assets the tool needs before restore (for example Image's source photo). */
  loadInputs?: (context: SourceLoadContext) => Promise<ToolInputAsset[]>;
  /** Tool-specific open options (validated by the adapter). */
  openOptions?: (context: {
    project: StudioProject;
    artboard: Artboard;
    layer: SharedLayer | null;
    parsedSource: unknown;
  }) => Record<string, unknown>;
  capture: (context: CaptureContext<TCapture>) => Promise<TCapture>;
  /** Prime host caches from a newly captured asset before the project commits. */
  primeCapture?: (capture: TCapture) => void;
  /** Primary action labels for specialized publish semantics. */
  publishLabel?: string;
  updateLabel?: string;
  handshakeTimeoutMs?: number;
  requestTimeoutMs?: number;
}

export interface ToolSessionProps<TCapture extends ToolSessionCapture> {
  config: ToolSessionConfig<TCapture>;
  project: StudioProject;
  artboard: Artboard;
  layer: SharedLayer | null;
  sessionToken?: string;
  /**
   * `undefined` restores the layer's own source, `null` starts blank, and a
   * payload restores that exact in-session draft (used by Type mode switching).
   */
  sourceOverride?: ToolSourceStatePayload | null;
  headerAddon?: ReactNode;
  sessionNote?: ReactNode;
  /** Optional labels override the generic add/update wording. */
  publishLabel?: string;
  updateLabel?: string;
  onPublish: (capture: TCapture) => Promise<void>;
  onClose: () => void;
  onStateChange?: (state: "loading" | "ready" | "error") => void;
}

export interface ToolSessionHandle {
  serializeSource(): Promise<ToolSourceStatePayload>;
  isReady(): boolean;
}

type SessionState = "loading" | "ready" | "error";

export function friendlyToolError(error: unknown, label: string): string {
  if (error instanceof ToolAdapterTransportError) {
    switch (error.code) {
      case "TIMEOUT":
        return `The ${label} editor did not respond in time. Retry the session; your saved layer was not changed.`;
      case "ORIGIN_REJECTED":
        return `The ${label} editor was blocked because its origin did not match the trusted Studio origin.`;
      case "SCOPE_MISMATCH":
        return `The ${label} editor session did not match this Studio project. The message was rejected.`;
      case "PROTOCOL_VERSION_MISMATCH":
        return `The ${label} editor uses an incompatible adapter protocol. No project changes were made.`;
      case "CANCELLED":
        return `The ${label} session was cancelled before it finished.`;
      case "ADAPTER_ERROR":
        return `The ${label} editor reported a problem: ${error.message}`;
      default:
        return `The ${label} editor could not complete the request: ${error.message}`;
    }
  }
  if (error instanceof Error) return error.message;
  return `The ${label} editor could not be opened.`;
}

function bridgeUrlFor(path: string): string {
  const base = import.meta.env.BASE_URL.endsWith("/")
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;
  return new URL(`${base}${path.replace(/^\/+/, "")}`, window.location.origin).toString();
}

export function useToolSession<TCapture extends ToolSessionCapture>(
  options: ToolSessionProps<TCapture>,
) {
  const { config, project, artboard, layer, sessionToken, sourceOverride } = options;
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const adapterRef = useRef<IframeToolAdapter | null>(null);
  const closingRef = useRef(false);
  const sessionIds = useRef({
    sessionId: createId("session"),
    channelId: createId("channel"),
  });
  const [attempt, setAttempt] = useState(0);
  const [sessionState, setSessionState] = useState<SessionState>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [inputWarning, setInputWarning] = useState<string | null>(null);
  const clearInputWarning = useCallback(() => setInputWarning(null), []);
  const [publishing, setPublishing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [activeArtboardLabel, setActiveArtboardLabel] = useState(artboard.name);
  const onStateChangeRef = useRef(options.onStateChange);
  onStateChangeRef.current = options.onStateChange;

  useEffect(() => {
    let cancelled = false;
    let adapter: IframeToolAdapter | null = null;
    setSessionState("loading");
    setLoadError(null);
    setPublishError(null);
    setInputWarning(null);
    setDirty(false);
    setProgress(null);
    closingRef.current = false;

    async function openSession() {
      try {
        // 1. Resolve the tool-owned editable document and validate it before
        //    touching the iframe. Unsupported versions must not disturb a layer.
        let sourcePayload: ToolSourceStatePayload | null = null;
        let parsedSource: unknown = null;
        if (sourceOverride !== undefined) {
          sourcePayload = sourceOverride;
        } else if (layer) {
          if (!layer.sourceState) {
            throw new Error(`This layer has no saved ${config.label} source document.`);
          }
          sourcePayload = await assetRepository.getSourceState(layer.sourceState);
        }
        if (sourcePayload) {
          parsedSource = config.parseSource(sourcePayload);
        }

        // 2. Resolve input asset bytes (source photo, selected host image, etc.)
        const inputs = config.loadInputs
          ? await config.loadInputs({
              project,
              artboard,
              layer,
              sourcePayload,
              parsedSource,
            })
          : [];

        if (cancelled || !iframeRef.current) return;

        // 3. Exact-origin handshake and scoped open.
        const hostOrigin = window.location.origin;
        adapter = new IframeToolAdapter({
          iframe: iframeRef.current,
          bridgeUrl: bridgeUrlFor(config.bridgePath),
          toolId: config.toolId,
          hostOrigin,
          toolOrigin: hostOrigin,
          handshakeTimeoutMs: config.handshakeTimeoutMs ?? 20_000,
          requestTimeoutMs: config.requestTimeoutMs ?? 60_000,
          onEvent(event) {
            if (event.type === "dirty") setDirty(true);
            if (event.type === "progress") setProgress(event.progress);
            if (event.type === "issue" && event.issue.severity === "error") {
              setPublishError(event.issue.message);
            }
          },
          onProtocolViolation(error) {
            if (import.meta.env.DEV) {
              console.warn(
                `[studio] rejected ${config.label} protocol message`,
                error.code,
                error.details,
              );
            }
          },
        });
        adapterRef.current = adapter;
        await adapter.initialize({
          projectId: project.id,
          sessionId: sessionIds.current.sessionId,
          runtimeKind: "iframe",
          integrationMode: "isolated-iframe",
          hostOrigin,
          toolOrigin: hostOrigin,
          channelId: sessionIds.current.channelId,
        });
        const global = globalContext(project, artboard.id);
        const openResult = await adapter.open({
          projectName: project.name,
          global,
          inputAssets: [],
          sourceState: layer?.sourceState ?? undefined,
          options: {
            editingLayerId: layer?.id ?? null,
            sourceMode: parsedSource && typeof parsedSource === "object"
              ? (parsedSource as { mode?: unknown }).mode ?? null
              : null,
            ...(config.openOptions?.({
              project,
              artboard,
              layer,
              parsedSource,
            }) ?? {}),
          },
        });
        if (openResult.capabilities?.toolId !== config.toolId) {
          throw new Error(
            `The embedded editor did not report itself as ${config.label}.`,
          );
        }
        setActiveArtboardLabel(global.activeArtboard.name);

        // 4. Binary inputs are delivered before source restore so the tool can
        //    decode the original photo/asset first and avoid re-initialisation.
        if (inputs.length > 0) {
          const receipts = await adapter.receiveInputAssets(inputs);
          const rejected = receipts.filter((receipt) => !receipt.accepted);
          if (rejected.length > 0) {
            setInputWarning(
              rejected
                .map((receipt) => receipt.message)
                .filter((message): message is string => Boolean(message))
                .join(" ") || "The editor rejected the supplied input asset.",
            );
          }
        }

        // 5. Restore only after the input media has decoded inside the editor.
        if (sourcePayload) {
          const restored: ToolSourceStateRestoreResult =
            await adapter.restoreSourceState(sourcePayload);
          if (!restored.restored) {
            throw new Error(
              restored.warnings[0] ??
                `The saved ${config.label} document could not be restored by this editor version.`,
            );
          }
        }
        if (!cancelled) setSessionState("ready");
      } catch (error) {
        if (!cancelled) {
          setLoadError(friendlyToolError(error, config.label));
          setSessionState("error");
        }
        adapter?.dispose();
        if (adapterRef.current === adapter) adapterRef.current = null;
      }
    }

    void openSession();
    return () => {
      cancelled = true;
      adapter?.dispose();
      if (adapterRef.current === adapter) adapterRef.current = null;
    };
    // A session is intentionally tied to its project/layer/artboard target and
    // explicit token. Project edits while the iframe is open must not reopen it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    attempt,
    project.id,
    layer?.id,
    artboard.id,
    sessionToken,
    sourceOverride,
  ]);

  useEffect(() => {
    onStateChangeRef.current?.(sessionState);
  }, [sessionState]);

  const closeSession = useCallback(
    async (reason: "cancel" | "published") => {
      if (closingRef.current) return;
      closingRef.current = true;
      const adapter = adapterRef.current;
      adapterRef.current = null;
      if (adapter) {
        try {
          await adapter.close({
            reason: "user",
            discardUnsavedChanges: reason === "cancel",
          });
        } catch {
          adapter.dispose();
        }
      }
      options.onClose();
    },
    [options],
  );

  const publish = useCallback(async () => {
    const adapter = adapterRef.current;
    if (!adapter || sessionState !== "ready" || publishing) return;
    setPublishing(true);
    setPublishError(null);
    try {
      const capture = await config.capture({
        adapter,
        project,
        artboard,
        layer,
        revision: sourceRevisionForLayer(layer?.sourceState ?? null),
        assets: assetRepository,
      });
      config.primeCapture?.(capture);
      await options.onPublish(capture);
      await closeSession("published");
    } catch (error) {
      setPublishError(friendlyToolError(error, config.label));
      setPublishing(false);
    }
  }, [config, layer, options, project, artboard, publishing, sessionState, closeSession]);

  const cancel = useCallback(async () => {
    if (publishing) return;
    await closeSession("cancel");
  }, [closeSession, publishing]);

  const cancelPublishing = useCallback(() => {
    const adapter = adapterRef.current;
    if (!adapter) return false;
    return adapter.cancelAllPending() > 0;
  }, []);

  const retry = useCallback(() => {
    closingRef.current = false;
    adapterRef.current?.dispose();
    adapterRef.current = null;
    setAttempt((value) => value + 1);
  }, []);

  const serializeSource = useCallback(async (): Promise<ToolSourceStatePayload> => {
    const adapter = adapterRef.current;
    if (adapter && sessionState === "ready") {
      return adapter.getEditableSourceState();
    }
    if (sourceOverride !== undefined) {
      if (sourceOverride) return sourceOverride;
      throw new Error("The new document has not finished opening.");
    }
    throw new Error("The editor session is not ready to serialize yet.");
  }, [sessionState, sourceOverride]);

  const isReady = useCallback(
    () => sessionState === "ready" && Boolean(adapterRef.current),
    [sessionState],
  );

  return {
    iframeRef,
    sessionState,
    loadError,
    publishError,
    inputWarning,
    publishing,
    dirty,
    progress,
    activeArtboardLabel,
    publish,
    cancel,
    retry,
    serializeSource,
    isReady,
    clearPublishError: () => setPublishError(null),
    clearInputWarning,
    cancelPublishing,
    toolId: config.toolId,
    label: config.label,
    iframeTitle: config.iframeTitle,
    testId: config.testId,
  };
}

function globalContext(project: StudioProject, activeArtboardId: string) {
  const artboard = project.artboards.find(
    (candidate) => candidate.id === activeArtboardId,
  );
  if (!artboard) throw new Error("The active artboard does not exist.");
  return {
    projectId: project.id,
    projectName: project.name,
    schemaVersion: project.schemaVersion,
    format: structuredClone(project.format),
    artboards: project.artboards.map((candidate) => ({
      id: candidate.id,
      name: candidate.name,
      index: candidate.index,
      width: candidate.width,
      height: candidate.height,
      background: structuredClone(candidate.background),
    })),
    activeArtboard: {
      id: artboard.id,
      name: artboard.name,
      index: artboard.index,
      width: artboard.width,
      height: artboard.height,
      background: structuredClone(artboard.background),
    },
    colorScheme: "light" as const,
    accentColor: "#236F72",
  };
}

export function ToolSession<TCapture extends ToolSessionCapture>(
  props: ToolSessionProps<TCapture> & { ref?: Ref<ToolSessionHandle> },
) {
  const {
    config,
    layer,
    headerAddon,
    sessionNote,
    ref,
  } = props;
  const session = useToolSession(props);
  const {
    iframeRef,
    sessionState,
    loadError,
    publishError,
    inputWarning,
    publishing,
    dirty,
    progress,
    activeArtboardLabel,
    publish,
    cancel,
    retry,
    serializeSource,
    isReady,
    clearPublishError,
    clearInputWarning,
    cancelPublishing,
  } = session;

  useImperativeHandle(
    ref,
    () => ({
      serializeSource,
      isReady,
    }),
    [serializeSource, isReady],
  );

  const title = layer ? layer.name : config.newDocumentTitle;
  const actionLabel = layer
    ? props.updateLabel ?? config.updateLabel ?? "Update layer"
    : props.publishLabel ?? config.publishLabel ?? "Add to composition";

  return (
    <main
      className={`vector-editor tool-session tool-${config.toolId}${sessionState === "ready" ? " is-ready" : ""}`}
      data-testid={config.testId}
      data-tool-id={config.toolId}
      aria-label={`${config.label} editor session`}
    >
      <header className="vector-session-bar tool-session-bar">
        <button
          type="button"
          className="back-button"
          onClick={() => void cancel()}
          disabled={publishing}
          title="Return to the canvas without publishing"
        >
          <span aria-hidden="true">←</span>
          Canvas
        </button>

        <div className="vector-session-title">
          <span className="eyebrow">Studio tool</span>
          <div>
            <strong>{config.label}</strong>
            <span className="session-divider" aria-hidden="true" />
            <span>{title}</span>
          </div>
        </div>

        {headerAddon ? <div className="tool-session-addon">{headerAddon}</div> : null}

        <div className={`session-dirty${dirty ? " is-dirty" : ""}`}>
          {publishing && progress !== null && progress < 1
            ? `Rendering ${Math.round(progress * 100)}%`
            : publishing
              ? "Publishing…"
              : dirty
                ? "Unpublished edits"
                : layer
                  ? "Saved source"
                  : "New document"}
        </div>

        <span className="session-context">
          {activeArtboardLabel} · {props.artboard.width}×{props.artboard.height}
        </span>

        <button
          type="button"
          className="button primary publish-button"
          onClick={() => void publish()}
          disabled={sessionState !== "ready" || publishing}
        >
          {publishing ? "Publishing…" : actionLabel}
        </button>
        {publishing ? (
          <button
            type="button"
            className="button small publish-cancel-button"
            onClick={() => {
              cancelPublishing();
            }}
            data-testid="cancel-publish"
          >
            Cancel publish
          </button>
        ) : null}
      </header>

      {sessionNote ? <div className="tool-session-note">{sessionNote}</div> : null}

      <div className="vector-frame-wrap tool-frame-wrap" aria-busy={sessionState === "loading"}>
        <iframe
          ref={iframeRef}
          className="vector-frame tool-frame"
          title={config.iframeTitle}
          allow="clipboard-read; clipboard-write; fullscreen"
        />
        {sessionState !== "ready" ? (
          <div
            className="vector-overlay tool-overlay"
            role={sessionState === "error" ? "alert" : "status"}
          >
            {sessionState === "loading" ? (
              <>
                <span className="loading-orbit" aria-hidden="true" />
                <strong>Opening preserved {config.label} editor…</strong>
                <p>Establishing the scoped bridge and restoring the source document.</p>
              </>
            ) : (
              <>
                <strong>{config.label} did not open</strong>
                <p>{loadError}</p>
                <div className="overlay-actions">
                  <button type="button" className="button" onClick={retry}>
                    Retry
                  </button>
                  <button
                    type="button"
                    className="button subtle"
                    onClick={() => void cancel()}
                  >
                    Back to canvas
                  </button>
                </div>
              </>
            )}
          </div>
        ) : null}
      </div>

      {inputWarning ? (
        <div className="publish-error input-warning" role="status">
          <strong>Input notice</strong>
          <span>{inputWarning}</span>
          <button
            type="button"
            className="mini-button"
            onClick={clearInputWarning}
            aria-label="Dismiss input notice"
          >
            ×
          </button>
        </div>
      ) : null}

      {publishError ? (
        <div className="publish-error" role="alert">
          <strong>Could not publish</strong>
          <span>{publishError}</span>
          <button
            type="button"
            className="mini-button"
            onClick={clearPublishError}
            aria-label="Dismiss publish error"
          >
            ×
          </button>
        </div>
      ) : null}
    </main>
  );
}
