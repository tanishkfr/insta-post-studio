import type {
  Artboard,
  SharedLayer,
  StudioProject,
  ToolInputAsset,
  ToolSourceStatePayload,
} from "@studio/contracts";
import { useEffect, useMemo, useRef, useState } from "react";
import { assetRepository } from "../storage/instances";
import { sha256Hex } from "../lib/hash";
import {
  ToolSession,
  type ToolSessionCapture,
  type ToolSessionConfig,
} from "../adapters/session/toolSession";
import {
  assertRestorableBendPayload,
  bendAspectLabel,
  bendsAspectMatches,
  BEND_TOOL_STATE_MIME,
  BEND_TOOL_STATE_VERSION,
  withEphemeralPackageUrl,
  type BendSourceStateV1,
} from "../adapters/bend/bendSourceState";
import { captureBendArtwork } from "../adapters/bend/captureBendArtwork";
import type { StaticMotionHandoff } from "../adapters/bend/staticToVideo";
import { sourceRevisionForLayer } from "../adapters/vector/captureVectorArtwork";

interface BendEditorProps {
  project: StudioProject;
  artboard: Artboard;
  layer: SharedLayer | null;
  handoff?: StaticMotionHandoff | null;
  onPublish: (capture: ToolSessionCapture) => Promise<void>;
  onClose: () => void;
}

type FitDecision = "fit" | "reformat" | null;

interface PreparedSource {
  payload: ToolSourceStatePayload;
  source: BendSourceStateV1;
  packageUrl: string;
}

export function BendEditor({
  project,
  artboard,
  layer,
  handoff,
  onPublish,
  onClose,
}: BendEditorProps) {
  const [quality, setQuality] = useState<"preview" | "final">("preview");
  const qualityRef = useRef<"preview" | "final">("preview");
  const [prepared, setPrepared] = useState<PreparedSource | null>(null);
  const [fitDecision, setFitDecision] = useState<FitDecision>(null);
  const [prepareError, setPrepareError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(Boolean(layer));
  const packageUrlRef = useRef<string | null>(null);
  const handoffInputRef = useRef<ToolInputAsset | null>(null);
  const handoffUrlRef = useRef<string | null>(null);

  useEffect(() => {
    qualityRef.current = quality;
  }, [quality]);

  useEffect(() => {
    let cancelled = false;
    packageUrlRef.current = null;
    setPrepareError(null);
    setPrepared(null);
    setFitDecision(null);
    if (!layer) {
      setPreparing(false);
      return;
    }
    if (!layer.sourceState) {
      setPrepareError("This BEND layer has no saved editable source package.");
      setPreparing(false);
      return;
    }
    const sourceState = layer.sourceState;
    setPreparing(true);
    void (async () => {
      try {
        const payload = await assetRepository.getSourceState(sourceState);
        const source = assertRestorableBendPayload(payload);
        const record = await assetRepository.getAsset(source.package.assetId);
        const actualHash = record.reference.contentHash;
        if (!actualHash || actualHash !== source.package.sha256) {
          throw new Error("The stored .bendpkg source failed its integrity check.");
        }
        if (record.bytes.byteLength !== source.package.byteLength) {
          throw new Error("The stored .bendpkg byte length does not match its layer reference.");
        }
        const computed = await sha256Hex(record.bytes);
        if (computed !== source.package.sha256) {
          throw new Error("The stored .bendpkg content hash no longer matches the layer reference.");
        }
        const blob = new Blob([record.bytes.slice().buffer], {
          type: "application/vnd.bend.project",
        });
        const url = URL.createObjectURL(blob);
        packageUrlRef.current = url;
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        const decision: FitDecision = bendsAspectMatches(source, artboard.width, artboard.height)
          ? null
          : source.host.fitDecision;
        setFitDecision(decision);
        setPrepared({
          source,
          packageUrl: url,
          payload: {
            tool: "bend",
            toolStateVersion: BEND_TOOL_STATE_VERSION,
            mimeType: BEND_TOOL_STATE_MIME,
            content: withEphemeralPackageUrl(source, url, decision),
            label: `${source.projectName} source`,
          },
        });
      } catch (error) {
        if (!cancelled) {
          setPrepareError(
            error instanceof Error
              ? error.message
              : "The editable BEND source could not be loaded.",
          );
        }
      } finally {
        if (!cancelled) setPreparing(false);
      }
    })();
    return () => {
      cancelled = true;
      if (packageUrlRef.current) URL.revokeObjectURL(packageUrlRef.current);
      packageUrlRef.current = null;
    };
  }, [layer?.id, layer?.sourceState, artboard.width, artboard.height]);

  useEffect(() => {
    handoffInputRef.current = null;
    if (handoffUrlRef.current) URL.revokeObjectURL(handoffUrlRef.current);
    handoffUrlRef.current = null;
    return () => {
      if (handoffUrlRef.current) URL.revokeObjectURL(handoffUrlRef.current);
      handoffUrlRef.current = null;
    };
  }, [handoff]);

  async function buildHandoffInput(): Promise<ToolInputAsset | null> {
    if (!handoff) return null;
    if (!handoffInputRef.current) {
      const url = URL.createObjectURL(handoff.video);
      handoffUrlRef.current = url;
      // Short handoff clips are bounded (<= 10s). Sending their bytes alongside
      // the same-origin URL avoids object-URL lifetime races while the package /
      // rendered-video handoff continues to use URL transfer.
      const bytes =
        handoff.byteLength <= 24 * 1024 * 1024
          ? new Uint8Array(await handoff.video.arrayBuffer())
          : undefined;
      handoffInputRef.current = {
        layerId: handoff.sourceLayerIds[0] ?? "composition",
        role: "source",
        asset: {
          id: handoff.id,
          kind: "video",
          name: `studio-artwork-${handoff.id}.${handoff.container}`,
          mimeType: handoff.mimeType,
          storage: {
            backend: "external-url",
            url,
            requiresIngest: true,
          },
          byteSize: handoff.byteLength,
          width: handoff.width,
          height: handoff.height,
          durationSeconds: handoff.durationSeconds,
          contentHash: handoff.contentHash,
          createdAt: handoff.createdAt,
          sourceTool: "bend",
        },
        bytes,
      };
    }
    return handoffInputRef.current;
  }

  const source = prepared?.source ?? null;
  const aspectMismatch = Boolean(
    source && !bendsAspectMatches(source, artboard.width, artboard.height),
  );
  const needsFitDecision = aspectMismatch && !fitDecision;

  const sourceOverride = useMemo<ToolSourceStatePayload | undefined>(() => {
    if (!prepared || !source) return undefined;
    return {
      ...prepared.payload,
      content: withEphemeralPackageUrl(source, prepared.packageUrl, fitDecision),
    };
  }, [prepared, source, fitDecision]);

  const config = useMemo<ToolSessionConfig<ToolSessionCapture>>(
    () => ({
      toolId: "bend",
      label: "BEND",
      bridgePath: "tools/bend/index.html",
      iframeTitle: "BEND motion editor",
      testId: "bend-editor",
      newDocumentTitle: handoff ? "Animate Studio artwork" : "New BEND composition",
      handshakeTimeoutMs: 60_000,
      requestTimeoutMs: 180_000,
      parseSource: assertRestorableBendPayload,
      async loadInputs() {
        const input = await buildHandoffInput();
        return input ? [input] : [];
      },
      openOptions() {
        const host = source?.host;
        const editingLayerId = layer?.id ?? null;
        const mode = editingLayerId
          ? "edit"
          : handoff
            ? "static-handoff"
            : "new";
        return {
          mode,
          editingLayerId,
          fitDecision,
          expectedSourceVersion: source?.sourceRevision,
          expectedProjectId: source?.bendProjectId,
          hostAspect: { width: artboard.width, height: artboard.height },
          sourceLayerIds: handoff?.sourceLayerIds ?? host?.sourceLayerIds ?? [],
          sourceRevisions: handoff?.sourceRevisions ?? host?.sourceRevisions ?? {},
          handoff: handoff
            ? {
                kind: "static-artwork",
                scope: handoff.scope,
                sourceLayerIds: handoff.sourceLayerIds,
                sourceRevisions: handoff.sourceRevisions,
                background: handoff.background,
                backgroundHex: handoff.backgroundHex,
                width: handoff.width,
                height: handoff.height,
                durationSeconds: handoff.durationSeconds,
                fps: handoff.fps,
                hasAlpha: handoff.hasAlpha,
                codec: handoff.codec,
                container: handoff.container,
                contentHash: handoff.contentHash,
              }
            : host?.handoff,
        };
      },
      async capture({ adapter, artboard: currentArtboard, revision }) {
        const capture = await captureBendArtwork({
          adapter,
          assets: assetRepository,
          artboard: currentArtboard,
          revision,
          quality: qualityRef.current,
          expectedSourceVersion: source?.sourceRevision,
          host: {
            mode: layer ? "edit" : handoff ? "static-handoff" : "new",
            editingLayerId: layer?.id ?? null,
            fitDecision,
            sourceLayerIds: handoff?.sourceLayerIds ?? source?.host.sourceLayerIds ?? [],
            sourceRevisions:
              handoff?.sourceRevisions ?? source?.host.sourceRevisions ?? {},
            handoff: handoff
              ? {
                  kind: "static-artwork",
                  scope: handoff.scope,
                  sourceLayerIds: handoff.sourceLayerIds,
                  sourceRevisions: handoff.sourceRevisions,
                  background: handoff.background,
                  backgroundHex: handoff.backgroundHex,
                  width: handoff.width,
                  height: handoff.height,
                  durationSeconds: handoff.durationSeconds,
                  fps: handoff.fps,
                  hasAlpha: handoff.hasAlpha,
                  codec: handoff.codec,
                  container: handoff.container,
                  contentHash: handoff.contentHash,
                }
              : source?.host.handoff,
          },
        });
        return {
          sourceState: capture.sourceState,
          rendered: capture.rendered,
          renderedAsset: capture.renderedAsset,
          poster: capture.poster,
          posterAsset: capture.posterAsset,
          temporal: capture.temporal,
          guard: {
            ...capture.guard,
            expectedHostRevision: layer?.sourceState?.revision ?? 0,
          },
          sourceAssets: capture.sourceAssets,
          suggestedName: capture.suggestedName,
          tags: capture.tags,
        };
      },
    }),
    [handoff, layer, source, fitDecision, artboard.width, artboard.height],
  );

  if (prepareError) {
    return (
      <main className="vector-editor tool-session tool-bend" data-testid="bend-editor">
        <header className="vector-session-bar">
          <button type="button" className="back-button" onClick={onClose}>
            ← Canvas
          </button>
          <strong>BEND did not open</strong>
        </header>
        <div className="vector-overlay" role="alert">
          <strong>The editable BEND source is unavailable</strong>
          <p>{prepareError}</p>
          <p className="handoff-note">
            The prior committed video, cover and package were not changed.
          </p>
          <button type="button" className="button" onClick={onClose}>
            Back to canvas
          </button>
        </div>
      </main>
    );
  }

  if (preparing) {
    return (
      <main className="vector-editor tool-session tool-bend" data-testid="bend-editor">
        <div className="vector-overlay" role="status">
          <span className="loading-orbit" aria-hidden="true" />
          <strong>Verifying editable BEND source…</strong>
          <p>Checking the .bendpkg package, source media and committed revision.</p>
        </div>
      </main>
    );
  }

  if (needsFitDecision && source) {
    return (
      <main className="vector-editor tool-session tool-bend" data-testid="bend-editor">
        <header className="vector-session-bar">
          <button type="button" className="back-button" onClick={onClose}>
            ← Canvas
          </button>
          <strong>BEND project format</strong>
        </header>
        <div className="vector-overlay bend-format-gate" role="dialog" aria-label="BEND format decision">
          <strong>This BEND project uses a different aspect ratio</strong>
          <p>
            The saved project is {bendAspectLabel(source.canvas.width, source.canvas.height)} at{" "}
            {source.canvas.width}×{source.canvas.height}. The Studio artboard is{" "}
            {bendAspectLabel(artboard.width, artboard.height)} at {artboard.width}×{artboard.height}.
            Choose an explicit treatment; BEND will not silently stretch the composition.
          </p>
          <div className="overlay-actions">
            <button
              type="button"
              className="button primary"
              data-testid="bend-fit-inside"
              onClick={() => setFitDecision("fit")}
            >
              Fit inside artboard
            </button>
            <button
              type="button"
              className="button"
              data-testid="bend-reformat"
              onClick={() => setFitDecision("reformat")}
            >
              Reformat composition
            </button>
            <button type="button" className="button subtle" onClick={onClose}>
              Cancel
            </button>
          </div>
          <p className="handoff-note">
            Fit preserves the BEND canvas and places the exported layer inside the
            Studio artboard. Reformat changes the BEND canvas to the Studio format.
          </p>
        </div>
      </main>
    );
  }

  return (
    <ToolSession
      config={config}
      project={project}
      artboard={artboard}
      layer={layer}
      sourceOverride={sourceOverride}
      onPublish={onPublish}
      onClose={onClose}
      publishLabel={
        handoff ? "Publish motion derivative" : layer ? "Update BEND layer" : "Publish BEND video"
      }
      updateLabel="Update BEND layer"
      headerAddon={
        <label className="bend-quality-control" data-testid="bend-quality">
          <span>Export</span>
          <select
            aria-label="BEND export quality"
            value={quality}
            onChange={(event) => setQuality(event.target.value as "preview" | "final")}
          >
            <option value="preview">Preview · 720px</option>
            <option value="final">Final · full canvas</option>
          </select>
        </label>
      }
      sessionNote={
        <>
          The complete preserved BEND editor is running in an isolated React 19 /
          PixiJS / Mediabunny iframe. Publish produces a verified video, cover frame
          and editable <code>.bendpkg</code>. Studio stores one temporal layer and
          never replaces BEND&apos;s timeline, effects or audio mixer.
          {handoff ? (
            <>
              {" "}This session started from Studio artwork as a real video clip
              ({handoff.width}×{handoff.height}, {handoff.durationSeconds.toFixed(1)}s).
              The flat handoff background is deliberate because the video codec path
              does not claim alpha.
            </>
          ) : null}
        </>
      }
    />
  );
}
