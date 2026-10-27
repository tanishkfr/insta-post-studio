import type { Artboard, SharedLayer, StudioProject } from "@studio/contracts";
import { useMemo } from "react";
import { assetRepository } from "../storage/instances";
import {
  ToolSession,
  type ToolSessionCapture,
  type ToolSessionConfig,
} from "../adapters/session/toolSession";
import { captureShapesArtwork } from "../adapters/shapes/captureShapesArtwork";
import { assertRestorableShapesPayload } from "../adapters/shapes/shapesSourceState";

interface ShapesEditorProps {
  project: StudioProject;
  artboard: Artboard;
  layer: SharedLayer | null;
  onPublish: (capture: ToolSessionCapture) => Promise<void>;
  onClose: () => void;
}

export function ShapesEditor({
  project,
  artboard,
  layer,
  onPublish,
  onClose,
}: ShapesEditorProps) {
  const config = useMemo<ToolSessionConfig<ToolSessionCapture>>(
    () => ({
      toolId: "shapes",
      label: "Shapes",
      bridgePath: "tools/shapes/index.html",
      iframeTitle: "Shapes editor",
      testId: "shapes-editor",
      newDocumentTitle: "New Shapes artwork",
      handshakeTimeoutMs: 45_000,
      // FBX parsing and a 2x supersampled WebGL render are synchronous/GPU work.
      requestTimeoutMs: 120_000,
      parseSource: assertRestorableShapesPayload,
      async capture({ adapter, artboard: currentArtboard, revision }) {
        const capture = await captureShapesArtwork({
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
          tags: ["shapes", "phase-3", "transparent-render"],
        };
      },
    }),
    [],
  );

  return (
    <ToolSession
      config={config}
      project={project}
      artboard={artboard}
      layer={layer}
      onPublish={onPublish}
      onClose={onClose}
      publishLabel={layer ? "Update Shapes layer" : "Publish transparent Shapes"}
      updateLabel="Update Shapes layer"
      sessionNote={
        <>
          The complete preserved 3D editor runs in an isolated React 18 / Three.js
          iframe. Publishing renders the real scene through an offscreen RGBA target:
          grid, gizmos, selection outlines and draft strokes are excluded. The
          editable 3D document stays attached to this layer.
        </>
      }
    />
  );
}
