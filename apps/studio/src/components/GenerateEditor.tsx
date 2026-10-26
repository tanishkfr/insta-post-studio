import type { Artboard, SharedLayer, StudioProject } from "@studio/contracts";
import { useMemo, useRef, useState } from "react";
import { assetRepository } from "../storage/instances";
import { studioStore } from "../state/projectStore";
import {
  ToolSession,
  type ToolSessionCapture,
  type ToolSessionConfig,
  type ToolSessionHandle,
} from "../adapters/session/toolSession";
import { captureGenerateArtwork } from "../adapters/generate/captureGenerateArtwork";
import { loadGenerateInputs } from "../adapters/generate/loadGenerateInputs";
import {
  assertRestorableGeneratePayload,
  parseGenerateSourceState,
  selectedGenerateTargets,
} from "../adapters/generate/generateSourceState";
import type { GeneratedLayoutTarget } from "../state/projectStore";

interface GenerateEditorProps {
  project: StudioProject;
  artboard: Artboard;
  layer: SharedLayer | null;
  onPublish: (capture: ToolSessionCapture) => Promise<void>;
  onApplyLayout: (
    artboardId: string,
    targets: GeneratedLayoutTarget[],
  ) => Promise<number>;
  onUndoLayout: () => Promise<void>;
  onClose: () => void;
}

export function GenerateEditor({
  project,
  artboard,
  layer,
  onPublish,
  onApplyLayout,
  onUndoLayout,
  onClose,
}: GenerateEditorProps) {
  const sessionRef = useRef<ToolSessionHandle>(null);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState<{ kind: "info" | "error"; message: string } | null>(
    null,
  );
  const [applying, setApplying] = useState(false);

  const config = useMemo<ToolSessionConfig<ToolSessionCapture>>(
    () => ({
      toolId: "generate",
      label: "Generate",
      bridgePath: "tools/generate/adapter.html",
      iframeTitle: "Generate composition assistant",
      testId: "generate-editor",
      newDocumentTitle: "New generated treatment",
      handshakeTimeoutMs: 30_000,
      requestTimeoutMs: 180_000,
      publishLabel: "Publish background layer",
      updateLabel: "Update background layer",
      parseSource: assertRestorableGeneratePayload,
      async loadInputs({ project: currentProject, artboard: currentArtboard }) {
        const { inputs } = await loadGenerateInputs(
          currentProject,
          currentArtboard,
          layer?.id ?? null,
        );
        return inputs;
      },
      async capture({ adapter, artboard: currentArtboard, revision }) {
        const capture = await captureGenerateArtwork({
          adapter,
          assets: assetRepository,
          artboard: currentArtboard,
          revision,
        });
        return {
          sourceState: capture.sourceState,
          rendered: capture.rendered,
          renderedAsset: capture.renderedAsset,
          suggestedName: capture.suggestedName,
          tags: ["generate", "phase-3", "generated-background"],
        };
      },
    }),
    [layer?.id],
  );

  async function applyLayout() {
    if (!sessionRef.current?.isReady() || applying) return;
    setApplying(true);
    setNotice(null);
    try {
      const payload = await sessionRef.current.serializeSource();
      const source = parseGenerateSourceState(payload.content);
      const state = studioStore.getState();
      const currentArtboard =
        state.project.artboards.find(
          (candidate) => candidate.id === state.activeArtboardId,
        ) ?? state.project.artboards[0];
      if (!currentArtboard) throw new Error("The active artboard no longer exists.");
      if (
        source.artboard &&
        (Math.abs(source.artboard.width / source.artboard.height -
          currentArtboard.width / currentArtboard.height) > 0.001)
      ) {
        throw new Error(
          "The artboard aspect changed after this Generate session opened. Regenerate inside Generate to refit the layouts before applying.",
        );
      }
      const allTargets = selectedGenerateTargets(source);
      if (allTargets.length === 0) {
        throw new Error(
          "This alternative has no Studio layers to apply. Select another variation or check that the source layers still exist.",
        );
      }
      const layerIds = new Set(state.project.layers.map((item) => item.id));
      const targets = allTargets.filter((target) => layerIds.has(target.hostLayerId));
      if (targets.length === 0) {
        throw new Error(
          "None of the layers used by this alternative still exist. Regenerate from current layers.",
        );
      }
      const applied = await onApplyLayout(currentArtboard.id, targets);
      if (applied === 0) {
        throw new Error(
          "No unlocked, visible layers were changed. Locked layers stay fixed unless you unlock them explicitly in the Layers panel.",
        );
      }
      setNotice({
        kind: "info",
        message: `Applied to ${applied} layer${applied === 1 ? "" : "s"} as one undoable action. Native Image, Vector, Type and Shapes source documents were not modified.`,
      });
    } catch (error) {
      setNotice({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "The selected layout could not be applied.",
      });
    } finally {
      setApplying(false);
    }
  }

  async function undoLayout() {
    try {
      await onUndoLayout();
      setNotice({
        kind: "info",
        message: "The generated layout was undone; the previous composition is restored.",
      });
    } catch (error) {
      setNotice({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "The layout could not be undone.",
      });
    }
  }

  const layerLabel = layer
    ? `Editing ${layer.name}. Reopening restores this Generate source without replacing the current host composition.`
    : "New Generate session. Foreground host layers stay unchanged until you choose Apply layout.";

  return (
    <ToolSession
      ref={sessionRef}
      config={config}
      project={project}
      artboard={artboard}
      layer={layer}
      onPublish={onPublish}
      onClose={onClose}
      onStateChange={(state) => setReady(state === "ready")}
      headerAddon={
        <button
          type="button"
          className="button apply-layout-button"
          onClick={() => void applyLayout()}
          disabled={!ready || applying}
          data-testid="generate-apply-layout"
          title="Apply the selected layout to existing host layers as one undoable action"
        >
          {applying ? "Applying…" : "Apply layout"}
        </button>
      }
      sessionNote={
        <>
          <span>{layerLabel}</span>
          <span className="session-note-divider" aria-hidden="true" />
          <span>
            <strong>Apply layout</strong> updates only position, size, rotation and
            keeps source documents intact. <strong>Publish background</strong> adds the
            selected visual treatment as its own editable layer. Locked layers stay
            fixed. Hidden layers are excluded. Claude sampling remains
            environment-dependent; rule-based and static modes work locally.
          </span>
          {notice ? (
            <span
              className={`generate-apply-notice is-${notice.kind}`}
              role={notice.kind === "error" ? "alert" : "status"}
              data-testid="generate-apply-notice"
            >
              {notice.message}
              {notice.kind === "info" && /Applied to/.test(notice.message) ? (
                <button
                  type="button"
                  className="mini-button generate-undo-layout"
                  onClick={() => void undoLayout()}
                  data-testid="generate-undo-layout"
                >
                  Undo layout
                </button>
              ) : null}
            </span>
          ) : null}
        </>
      }
    />
  );
}
