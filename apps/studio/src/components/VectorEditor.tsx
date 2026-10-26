import type {
  Artboard,
  SharedLayer,
  StudioProject,
  ToolInputAsset,
} from "@studio/contracts";
import { useMemo } from "react";
import { assetRepository } from "../storage/instances";
import { primeRenderedSvg } from "../studio/renderedAssets";
import { captureVectorArtwork } from "../adapters/vector/captureVectorArtwork";
import { assertRestorableVectorPayload } from "../adapters/vector/vectorSourceState";
import { loadRasterInputForLayer } from "../adapters/session/inputAssets";
import {
  ToolSession,
  type ToolSessionCapture,
  type ToolSessionConfig,
} from "../adapters/session/toolSession";

interface VectorEditorProps {
  project: StudioProject;
  artboard: Artboard;
  layer: SharedLayer | null;
  inputLayerId?: string | null;
  onPublish: (capture: ToolSessionCapture) => Promise<void>;
  onClose: () => void;
}

export function VectorEditor({
  project,
  artboard,
  layer,
  inputLayerId,
  onPublish,
  onClose,
}: VectorEditorProps) {
  const config = useMemo<ToolSessionConfig<ToolSessionCapture>>(
    () => ({
      toolId: "vector",
      label: "Vector",
      bridgePath: "tools/vector/adapter.html",
      iframeTitle: "Vector editor",
      testId: "vector-editor",
      newDocumentTitle: "New Vector artwork",
      requestTimeoutMs: 20_000,
      parseSource: assertRestorableVectorPayload,
      async loadInputs({ sourcePayload, project: currentProject }) {
        if (sourcePayload) return [];
        if (inputLayerId) {
          return [
            await loadRasterInputForLayer(
              currentProject,
              inputLayerId,
              "rendered-input",
            ),
          ];
        }
        return [];
      },
      async capture({ adapter, artboard: currentArtboard, revision }) {
        const capture = await captureVectorArtwork({
          adapter,
          assets: assetRepository,
          artboard: currentArtboard,
          revision,
        });
        if (capture.rendered.assetId) {
          primeRenderedSvg(capture.rendered.assetId, capture.sanitizedSvg);
        }
        return {
          sourceState: capture.sourceState,
          rendered: capture.rendered,
          renderedAsset: capture.renderedAsset,
          suggestedName: capture.suggestedName,
          tags: ["vector", "phase-2"],
        };
      },
    }),
    [inputLayerId],
  );

  const inputName = inputLayerId
    ? project.layers.find((candidate) => candidate.id === inputLayerId)?.name
    : null;

  return (
    <ToolSession
      config={config}
      project={project}
      artboard={artboard}
      layer={layer}
      onPublish={onPublish}
      onClose={onClose}
      sessionNote={
        inputName && !layer ? (
          <>
            Image tracing input: <strong>{inputName}</strong>. The preserved Vector
            importer converts the raster into editable contour lines; it is not a live
            linked image. The original Image layer remains unchanged.
          </>
        ) : null
      }
    />
  );
}
