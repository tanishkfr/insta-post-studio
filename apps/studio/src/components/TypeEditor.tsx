import type {
  Artboard,
  SharedLayer,
  StudioProject,
  ToolSourceStatePayload,
} from "@studio/contracts";
import { useMemo, useRef, useState } from "react";
import { assetRepository } from "../storage/instances";
import { captureTypographyArtwork } from "../adapters/typography/captureTypographyArtwork";
import {
  assertRestorableTypographyPayload,
  typographyModeFromLayer,
  type TypographyMode,
} from "../adapters/typography/typographySourceState";
import { loadRasterInputForLayer } from "../adapters/session/inputAssets";
import {
  ToolSession,
  type ToolSessionCapture,
  type ToolSessionConfig,
  type ToolSessionHandle,
} from "../adapters/session/toolSession";

interface TypeEditorProps {
  project: StudioProject;
  artboard: Artboard;
  layer: SharedLayer | null;
  initialMode: TypographyMode;
  inputLayerId?: string | null;
  onPublish: (capture: ToolSessionCapture) => Promise<void>;
  onClose: () => void;
}

type SessionState = "loading" | "ready" | "error";

export function TypeEditor({
  project,
  artboard,
  layer,
  initialMode,
  inputLayerId,
  onPublish,
  onClose,
}: TypeEditorProps) {
  const [mode, setMode] = useState<TypographyMode>(initialMode);
  const [stash, setStash] = useState<Partial<Record<TypographyMode, ToolSourceStatePayload>>>({});
  const [sessionState, setSessionState] = useState<SessionState>("loading");
  const [switching, setSwitching] = useState(false);
  const [modeError, setModeError] = useState<string | null>(null);
  const controllerRef = useRef<ToolSessionHandle>(null);

  const layerMode = typographyModeFromLayer(layer);
  const sourceOverride: ToolSourceStatePayload | null | undefined = stash[mode]
    ? stash[mode]
    : layer
      ? layerMode === mode
        ? undefined
        : null
      : undefined;

  const config = useMemo<ToolSessionConfig<ToolSessionCapture>>(
    () => ({
      toolId: "typography",
      label: mode === "library" ? "Type Library" : "Custom Type",
      bridgePath:
        mode === "library"
          ? "tools/typography/fonts-adapter.html"
          : "tools/typography/custom-adapter.html",
      iframeTitle:
        mode === "library" ? "Type Library editor" : "Custom Type editor",
      testId: "type-editor",
      newDocumentTitle:
        mode === "library" ? "New Type Library artwork" : "New Custom Type artwork",
      requestTimeoutMs: 120_000,
      parseSource(payload) {
        return assertRestorableTypographyPayload(payload);
      },
      async loadInputs({ sourcePayload, project: currentProject }) {
        if (sourcePayload) return [];
        if (mode === "custom" && inputLayerId) {
          return [
            await loadRasterInputForLayer(
              currentProject,
              inputLayerId,
              "reference",
            ),
          ];
        }
        return [];
      },
      async capture({ adapter, artboard: currentArtboard, revision }) {
        const capture = await captureTypographyArtwork({
          adapter,
          assets: assetRepository,
          artboard: currentArtboard,
          revision,
          expectedMode: mode,
        });
        return {
          sourceState: capture.sourceState,
          rendered: capture.rendered,
          renderedAsset: capture.renderedAsset,
          suggestedName: capture.suggestedName,
          tags: capture.tags,
        };
      },
    }),
    [inputLayerId, mode],
  );

  async function switchMode(next: TypographyMode) {
    if (next === mode || switching || sessionState !== "ready") return;
    setSwitching(true);
    setModeError(null);
    try {
      const payload = await controllerRef.current?.serializeSource();
      if (payload) {
        setStash((current) => ({ ...current, [mode]: payload }));
      }
      setMode(next);
    } catch (error) {
      setModeError(
        error instanceof Error
          ? `Could not preserve the current ${mode === "library" ? "Type Library" : "Custom Type"} draft: ${error.message}`
          : "Could not preserve the current Type draft, so the mode was not switched.",
      );
    } finally {
      setSwitching(false);
    }
  }

  const inputName = inputLayerId
    ? project.layers.find((candidate) => candidate.id === inputLayerId)?.name
    : null;

  return (
    <ToolSession
      ref={controllerRef}
      config={config}
      project={project}
      artboard={artboard}
      layer={layer}
      sessionToken={`type:${mode}`}
      sourceOverride={sourceOverride}
      onPublish={onPublish}
      onClose={onClose}
      onStateChange={setSessionState}
      headerAddon={
        <div className="type-mode-switch" role="group" aria-label="Type mode">
          <button
            type="button"
            className={mode === "library" ? "is-active" : ""}
            aria-pressed={mode === "library"}
            disabled={switching || sessionState !== "ready"}
            onClick={() => void switchMode("library")}
            data-testid="type-mode-library"
          >
            Type Library
          </button>
          <button
            type="button"
            className={mode === "custom" ? "is-active" : ""}
            aria-pressed={mode === "custom"}
            disabled={switching || sessionState !== "ready"}
            onClick={() => void switchMode("custom")}
            data-testid="type-mode-custom"
          >
            Custom Type
          </button>
        </div>
      }
      sessionNote={
        modeError ? (
          <span className="inline-error" role="alert">
            {modeError}
          </span>
        ) : inputName && mode === "custom" && !layer ? (
          <>
            Motif input: <strong>{inputName}</strong>. The original Image layer stays
            unchanged and this Custom Type result becomes a new layer.
          </>
        ) : (
          <>
            Both type modes keep independent drafts while this session is open. Publishing
            saves the active mode; switching modes never replaces the other draft.
          </>
        )
      }
    />
  );
}
