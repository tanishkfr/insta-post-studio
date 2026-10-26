import type { Artboard, SharedLayer, StudioProject } from "@studio/contracts";
import { useEffect, useRef, useState } from "react";
import {
  IframeToolAdapter,
  ToolAdapterTransportError,
} from "../adapters/iframe/IframeToolAdapter";
import type { CaptureVectorResult } from "../adapters/vector/captureVectorArtwork";
import {
  captureVectorArtwork,
  projectGlobalContext,
  sourceRevisionForLayer,
} from "../adapters/vector/captureVectorArtwork";
import { assertRestorableVectorPayload } from "../adapters/vector/vectorSourceState";
import { createId } from "../lib/ids";
import { assetRepository } from "../storage/instances";
import { primeRenderedSvg } from "../studio/renderedAssets";

interface VectorEditorProps {
  project: StudioProject;
  artboard: Artboard;
  layer: SharedLayer | null;
  onPublish: (capture: CaptureVectorResult) => Promise<void>;
  onClose: () => void;
}

type SessionState = "loading" | "ready" | "error";

function friendlyError(error: unknown): string {
  if (error instanceof ToolAdapterTransportError) {
    switch (error.code) {
      case "TIMEOUT":
        return "The Vector editor did not respond in time. Retry the session; your saved layer was not changed.";
      case "ORIGIN_REJECTED":
        return "The Vector editor was blocked because its origin did not match the trusted Studio origin.";
      case "SCOPE_MISMATCH":
        return "The Vector editor session did not match this Studio project. The message was rejected.";
      case "PROTOCOL_VERSION_MISMATCH":
        return "The Vector editor uses an incompatible adapter protocol. No project changes were made.";
      case "CANCELLED":
        return "The Vector session was cancelled before it finished.";
      case "ADAPTER_ERROR":
        return `The Vector editor reported a problem: ${error.message}`;
      default:
        return `The Vector editor could not complete the request: ${error.message}`;
    }
  }
  if (error instanceof Error) return error.message;
  return "The Vector editor could not be opened.";
}

export function VectorEditor({
  project,
  artboard,
  layer,
  onPublish,
  onClose,
}: VectorEditorProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const adapterRef = useRef<IframeToolAdapter | null>(null);
  const sessionIds = useRef({
    sessionId: createId("session"),
    channelId: createId("channel"),
  });
  const [attempt, setAttempt] = useState(0);
  const [sessionState, setSessionState] = useState<SessionState>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [activeArtboardLabel, setActiveArtboardLabel] = useState(artboard.name);

  useEffect(() => {
    let cancelled = false;
    let adapter: IframeToolAdapter | null = null;
    setSessionState("loading");
    setLoadError(null);
    setPublishError(null);
    setDirty(false);

    async function openSession() {
      try {
        let sourcePayload = null;
        if (layer) {
          if (!layer.sourceState) {
            throw new Error("This layer has no saved Vector source document.");
          }
          const payload = await assetRepository.getSourceState(layer.sourceState);
          assertRestorableVectorPayload(payload);
          sourcePayload = payload;
        }
        if (cancelled || !iframeRef.current) return;

        const hostOrigin = window.location.origin;
        const base = import.meta.env.BASE_URL.endsWith("/")
          ? import.meta.env.BASE_URL
          : `${import.meta.env.BASE_URL}/`;
        const bridgeUrl = new URL(
          `${base}tools/vector/adapter.html`,
          window.location.origin,
        ).toString();
        adapter = new IframeToolAdapter({
          iframe: iframeRef.current,
          bridgeUrl,
          hostOrigin,
          toolOrigin: hostOrigin,
          handshakeTimeoutMs: 15_000,
          requestTimeoutMs: 20_000,
          onEvent(event) {
            if (event.type === "dirty") setDirty(true);
            if (event.type === "progress") setProgress(event.progress);
            if (event.type === "issue" && event.issue.severity === "error") {
              setPublishError(event.issue.message);
            }
          },
          onProtocolViolation(error) {
            // Transport-level rejections are reported by the adapter's promise
            // path when they affect a request. Unsolicited frames are ignored.
            if (import.meta.env.DEV) {
              console.warn("[studio] rejected Vector protocol message", error.code, error.details);
            }
          },
        });
        adapterRef.current = adapter;
        const context = {
          projectId: project.id,
          sessionId: sessionIds.current.sessionId,
          runtimeKind: "iframe" as const,
          integrationMode: "isolated-iframe" as const,
          hostOrigin,
          toolOrigin: hostOrigin,
          channelId: sessionIds.current.channelId,
        };
        await adapter.initialize(context);
        const global = projectGlobalContext(project, artboard.id);
        const openResult = await adapter.open({
          projectName: project.name,
          global,
          inputAssets: [],
          sourceState: layer?.sourceState ?? undefined,
          options: { editingLayerId: layer?.id ?? null },
        });
        if (openResult.capabilities?.toolId !== "vector") {
          throw new Error("The embedded editor did not report itself as Vector.");
        }
        setActiveArtboardLabel(global.activeArtboard.name);
        if (sourcePayload) {
          const restored = await adapter.restoreSourceState(sourcePayload);
          if (!restored.restored) {
            throw new Error(
              restored.warnings[0] ??
                "The saved Vector document could not be restored by this editor version.",
            );
          }
        }
        if (!cancelled) setSessionState("ready");
      } catch (error) {
        if (!cancelled) {
          setLoadError(friendlyError(error));
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
    // Session identity is intentionally derived from the layer/project target;
    // attempt triggers an explicit retry with a fresh adapter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, project.id, layer?.id, artboard.id]);

  async function handleClose(reason: "cancel" | "published") {
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
    onClose();
  }

  async function handlePublish() {
    const adapter = adapterRef.current;
    if (!adapter || sessionState !== "ready" || publishing) return;
    setPublishing(true);
    setPublishError(null);
    try {
      const capture = await captureVectorArtwork({
        adapter,
        assets: assetRepository,
        artboard,
        revision: sourceRevisionForLayer(layer?.sourceState ?? null),
      });
      if (capture.rendered.assetId) {
        primeRenderedSvg(capture.rendered.assetId, capture.sanitizedSvg);
      }
      await onPublish(capture);
      await handleClose("published");
    } catch (error) {
      setPublishError(friendlyError(error));
      setPublishing(false);
    }
  }

  const title = layer ? layer.name : "New Vector artwork";
  const actionLabel = layer ? "Update layer" : "Add to composition";

  return (
    <main
      className={`vector-editor${sessionState === "ready" ? " is-ready" : ""}`}
      data-testid="vector-editor"
      aria-label="Vector editor session"
    >
      <header className="vector-session-bar">
        <button
          type="button"
          className="back-button"
          onClick={() => void handleClose("cancel")}
          disabled={publishing}
          title="Return to the canvas without publishing"
        >
          <span aria-hidden="true">←</span>
          Canvas
        </button>

        <div className="vector-session-title">
          <span className="eyebrow">Studio tool</span>
          <div>
            <strong>Vector</strong>
            <span className="session-divider" aria-hidden="true" />
            <span>{title}</span>
          </div>
        </div>

        <div className={`session-dirty${dirty ? " is-dirty" : ""}`}>
          {publishing && progress !== null && progress < 1
            ? `Rendering ${Math.round(progress * 100)}%`
            : dirty
              ? "Unpublished edits"
              : layer
                ? "Saved source"
                : "New document"}
        </div>

        <span className="session-context">
          {activeArtboardLabel} · {artboard.width}×{artboard.height}
        </span>

        <button
          type="button"
          className="button primary publish-button"
          onClick={() => void handlePublish()}
          disabled={sessionState !== "ready" || publishing}
        >
          {publishing ? "Publishing…" : actionLabel}
        </button>
      </header>

      <div className="vector-frame-wrap" aria-busy={sessionState === "loading"}>
        <iframe
          ref={iframeRef}
          className="vector-frame"
          title="Vector editor"
          allow="clipboard-read; clipboard-write; fullscreen"
        />
        {sessionState !== "ready" ? (
          <div className="vector-overlay" role={sessionState === "error" ? "alert" : "status"}>
            {sessionState === "loading" ? (
              <>
                <span className="loading-orbit" aria-hidden="true" />
                <strong>Opening preserved Vector editor…</strong>
                <p>Establishing the scoped bridge and restoring the source document.</p>
              </>
            ) : (
              <>
                <strong>Vector did not open</strong>
                <p>{loadError}</p>
                <div className="overlay-actions">
                  <button type="button" className="button" onClick={() => setAttempt((value) => value + 1)}>
                    Retry
                  </button>
                  <button type="button" className="button subtle" onClick={() => void handleClose("cancel")}>
                    Back to canvas
                  </button>
                </div>
              </>
            )}
          </div>
        ) : null}
      </div>

      {publishError ? (
        <div className="publish-error" role="alert">
          <strong>Could not publish</strong>
          <span>{publishError}</span>
          <button type="button" className="mini-button" onClick={() => setPublishError(null)} aria-label="Dismiss publish error">
            ×
          </button>
        </div>
      ) : null}
    </main>
  );
}
