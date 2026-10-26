import type { Artboard, SharedLayer, StudioProject } from "@studio/contracts";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  createStaticMotionHandoff,
  type StaticHandoffBackground,
  type StaticHandoffScope,
  type StaticMotionHandoff,
} from "../adapters/bend/staticToVideo";

interface AnimateInBendDialogProps {
  project: StudioProject;
  artboard: Artboard;
  selectedLayer: SharedLayer | null;
  preferComposition?: boolean;
  onCancel: () => void;
  onOpen: (handoff: StaticMotionHandoff) => void;
}

export function AnimateInBendDialog({
  project,
  artboard,
  selectedLayer,
  preferComposition = false,
  onCancel,
  onOpen,
}: AnimateInBendDialogProps) {
  const staticSelected = Boolean(selectedLayer && selectedLayer.kind !== "video");
  const [scope, setScope] = useState<StaticHandoffScope>(
    staticSelected && !preferComposition ? "layer" : "composition",
  );
  const [background, setBackground] = useState<StaticHandoffBackground>(
    artboard.background.kind === "solid" ? "artboard" : "white",
  );
  const [duration, setDuration] = useState(3);
  const [status, setStatus] = useState<"idle" | "working" | "error" | "cancelled">("idle");
  const [stage, setStage] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const artboardLabel = useMemo(
    () => `${artboard.width}×${artboard.height}`,
    [artboard.width, artboard.height],
  );

  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );

  async function start() {
    if (status === "working") return;
    setStatus("working");
    setError(null);
    setStage("Rendering static artwork");
    setProgress(0);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const handoff = await createStaticMotionHandoff({
        project,
        artboard,
        scope,
        selectedLayerId: selectedLayer?.id ?? null,
        background,
        durationSeconds: duration,
        fps: 30,
        signal: controller.signal,
        onStage: (nextStage, value) => {
          setStage(nextStage);
          setProgress(value);
        },
      });
      if (controller.signal.aborted) return;
      onOpen(handoff);
    } catch (caught) {
      if (controller.signal.aborted) {
        setStatus("cancelled");
        setStage(null);
        return;
      }
      setStatus("error");
      setError(
        caught instanceof Error
          ? caught.message
          : "The static artwork could not be converted into a BEND clip.",
      );
    } finally {
      abortRef.current = null;
    }
  }

  return (
    <div className="dialog-backdrop bend-handoff-backdrop" role="presentation">
      <section
        className="dialog bend-handoff-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="animate-in-bend-title"
        data-testid="animate-in-bend-dialog"
      >
        <header className="dialog-head">
          <div>
            <span className="eyebrow">Static → motion</span>
            <h2 id="animate-in-bend-title">Animate in BEND</h2>
          </div>
          <button
            type="button"
            className="mini-button"
            onClick={onCancel}
            aria-label="Close Animate in BEND"
            disabled={status === "working"}
          >
            ×
          </button>
        </header>
        <p className="dialog-copy">
          Studio renders the chosen artwork at the exact artboard size, encodes a
          short interoperable clip, and imports it into the real BEND timeline as a
          normal video clip. Original source layers are never modified.
        </p>

        <div className="bend-handoff-grid">
          <fieldset className="bend-handoff-fieldset">
            <legend>Starting artwork</legend>
            <label>
              <input
                type="radio"
                name="bend-handoff-scope"
                value="layer"
                disabled={!staticSelected || status === "working"}
                checked={scope === "layer"}
                onChange={() => setScope("layer")}
              />
              <span>
                Selected layer
                <small>
                  {selectedLayer
                    ? selectedLayer.kind === "video"
                      ? "Temporal layers cannot be flattened into the handoff."
                      : selectedLayer.name
                    : "Select a static layer first."}
                </small>
              </span>
            </label>
            <label>
              <input
                type="radio"
                name="bend-handoff-scope"
                value="composition"
                checked={scope === "composition"}
                disabled={status === "working"}
                onChange={() => setScope("composition")}
              />
              <span>
                Active composition
                <small>
                  All visible layers composited in order at {artboardLabel}.
                </small>
              </span>
            </label>
          </fieldset>

          <fieldset className="bend-handoff-fieldset">
            <legend>Video background</legend>
            <label>
              <input
                type="radio"
                name="bend-handoff-background"
                value="artboard"
                checked={background === "artboard"}
                disabled={status === "working"}
                onChange={() => setBackground("artboard")}
              />
              <span>
                Artboard background
                <small>
                  {artboard.background.kind === "solid"
                    ? artboard.background.color ?? "#ffffff"
                    : "Transparent artboards use an explicit white treatment."}
                </small>
              </span>
            </label>
            <label>
              <input
                type="radio"
                name="bend-handoff-background"
                value="white"
                checked={background === "white"}
                disabled={status === "working"}
                onChange={() => setBackground("white")}
              />
              <span>White <small>Flat #FFFFFF behind the artwork.</small></span>
            </label>
            <label>
              <input
                type="radio"
                name="bend-handoff-background"
                value="black"
                checked={background === "black"}
                disabled={status === "working"}
                onChange={() => setBackground("black")}
              />
              <span>Black <small>Flat #000000 behind the artwork.</small></span>
            </label>
          </fieldset>

          <label className="bend-handoff-duration">
            <span>Clip duration</span>
            <input
              type="number"
              min={0.5}
              max={10}
              step={0.5}
              value={duration}
              disabled={status === "working"}
              aria-label="Handoff clip duration seconds"
              onChange={(event) => {
                const value = Number(event.target.value);
                if (Number.isFinite(value)) {
                  setDuration(Math.min(10, Math.max(0.5, value)));
                }
              }}
            />
            <small>seconds at 30 FPS · 1920-class source, no upscaling</small>
          </label>
        </div>

        <p className="bend-handoff-note" role="note">
          The handoff clip is encoded as MP4 when the browser supports H.264, or
          WebM otherwise. This path does not claim alpha preservation, so choose a
          background deliberately. The clip becomes editable footage in BEND with
          normal trim, split, effects, keyframes and audio controls.
        </p>

        {status === "working" ? (
          <div className="bend-handoff-progress" role="status" aria-live="polite">
            <div>
              <span>{stage ?? "Preparing handoff…"}</span>
              <strong>{Math.round(progress * 100)}%</strong>
            </div>
            <div className="progress-track">
              <i style={{ transform: `scaleX(${progress})` }} />
            </div>
            <button
              type="button"
              className="button small"
              onClick={() => abortRef.current?.abort()}
            >
              Cancel
            </button>
          </div>
        ) : null}

        {status === "error" && error ? (
          <p className="publish-error" role="alert">
            <strong>Handoff failed</strong>
            <span>{error}</span>
          </p>
        ) : null}
        {status === "cancelled" ? (
          <p className="inline-note" role="status">
            Handoff cancelled. The original layers were not changed.
          </p>
        ) : null}

        <footer className="dialog-actions">
          <button type="button" className="button" onClick={onCancel} disabled={status === "working"}>
            Cancel
          </button>
          <button
            type="button"
            className="button primary"
            onClick={() => void start()}
            disabled={status === "working" || (scope === "layer" && !staticSelected)}
            data-testid="start-bend-handoff"
          >
            {status === "working" ? "Encoding…" : "Open in BEND"}
          </button>
        </footer>
      </section>
    </div>
  );
}
