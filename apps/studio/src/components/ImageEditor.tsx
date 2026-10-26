import type {
  Artboard,
  SharedLayer,
  StudioProject,
  ToolInputAsset,
} from "@studio/contracts";
import { useMemo } from "react";
import { assetRepository } from "../storage/instances";
import { captureImageArtwork } from "../adapters/image/captureImageArtwork";
import {
  assertRestorableImagePayload,
  type ImageSourceStateV1,
} from "../adapters/image/imageSourceState";
import { loadRasterInputForLayer } from "../adapters/session/inputAssets";
import {
  ToolSession,
  type ToolSessionCapture,
  type ToolSessionConfig,
} from "../adapters/session/toolSession";

interface ImageEditorProps {
  project: StudioProject;
  artboard: Artboard;
  layer: SharedLayer | null;
  inputLayerId?: string | null;
  onPublish: (capture: ToolSessionCapture) => Promise<void>;
  onClose: () => void;
}

export function ImageEditor({
  project,
  artboard,
  layer,
  inputLayerId,
  onPublish,
  onClose,
}: ImageEditorProps) {
  const config = useMemo<ToolSessionConfig<ToolSessionCapture>>(
    () => ({
      toolId: "image",
      label: "Image",
      bridgePath: "tools/image/adapter.html",
      iframeTitle: "Image editor",
      testId: "image-editor",
      newDocumentTitle: "New Image artwork",
      requestTimeoutMs: 180_000,
      parseSource: assertRestorableImagePayload,
      async loadInputs({ sourcePayload, parsedSource, project: currentProject }) {
        if (sourcePayload) {
          const state = parsedSource as ImageSourceStateV1;
          const stored = await assetRepository.getAsset(state.photo.assetId);
          return [
            {
              layerId: layer?.id ?? state.photo.assetId,
              asset: stored.reference,
              role: "source",
              bytes: stored.bytes,
            } satisfies ToolInputAsset,
          ];
        }
        if (inputLayerId) {
          return [
            await loadRasterInputForLayer(
              currentProject,
              inputLayerId,
              "source",
            ),
          ];
        }
        return [];
      },
      async capture({ adapter, artboard: currentArtboard, revision }) {
        const capture = await captureImageArtwork({
          adapter,
          assets: assetRepository,
          artboard: currentArtboard,
          revision,
        });
        return {
          sourceState: capture.sourceState,
          rendered: capture.rendered,
          renderedAsset: capture.renderedAsset,
          sourceAssets: capture.sourceAssets,
          suggestedName: capture.suggestedName,
          tags: capture.tags,
        };
      },
    }),
    [inputLayerId, layer?.id],
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
            Source input: <strong>{inputName}</strong>. The original host layer stays
            unchanged; this session creates a new Image layer.
          </>
        ) : null
      }
    />
  );
}
