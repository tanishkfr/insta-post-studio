import type { Artboard, LayerTransform, SharedLayer } from "@studio/contracts";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { studioStore, useStudioStore } from "../state/projectStore";
import { assetRepository, objectUrls } from "../storage/instances";
import { loadRenderedSvg } from "../studio/renderedAssets";
import type { NavToolId } from "../project/defaultProject";

type LiveTool = Extract<
  NavToolId,
  "image" | "vector" | "typography" | "shapes" | "generate" | "bend"
>;

interface CanvasWorkspaceProps {
  onOpenTool: (tool: LiveTool) => void;
  onAnimateComposition?: () => void;
}

interface DragState {
  layerId: string;
  mode: "move" | "resize";
  pointerId: number;
  startClientX: number;
  startClientY: number;
  origin: LayerTransform;
  scale: number;
}

interface PreviewTransform {
  layerId: string;
  transform: LayerTransform;
}

function useRenderedSvg(assetId: string | undefined): {
  svg: string | null;
  error: string | null;
  loading: boolean;
} {
  const [result, setResult] = useState<{
    assetId: string | undefined;
    svg: string | null;
    error: string | null;
    loading: boolean;
  }>({ assetId, svg: null, error: null, loading: Boolean(assetId) });

  useEffect(() => {
    if (!assetId) {
      setResult({ assetId, svg: null, error: "No rendered asset.", loading: false });
      return;
    }
    let cancelled = false;
    setResult({ assetId, svg: null, error: null, loading: true });
    void loadRenderedSvg(assetId)
      .then((svg) => {
        if (!cancelled) setResult({ assetId, svg, error: null, loading: false });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setResult({
            assetId,
            svg: null,
            error:
              error instanceof Error
                ? error.message
                : "The rendered artwork could not be loaded.",
            loading: false,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [assetId]);

  return {
    svg: result.assetId === assetId ? result.svg : null,
    error: result.assetId === assetId ? result.error : null,
    loading: result.assetId === assetId ? result.loading : Boolean(assetId),
  };
}

function useRenderedRaster(assetId: string | undefined): {
  url: string | null;
  error: string | null;
  loading: boolean;
} {
  const [result, setResult] = useState<{
    assetId: string | undefined;
    url: string | null;
    error: string | null;
    loading: boolean;
  }>({ assetId, url: null, error: null, loading: Boolean(assetId) });

  useEffect(() => {
    if (!assetId) {
      setResult({ assetId, url: null, error: "No rendered asset.", loading: false });
      return;
    }
    let cancelled = false;
    let acquired = false;
    setResult({ assetId, url: null, error: null, loading: true });
    void assetRepository
      .getAsset(assetId)
      .then(({ reference, bytes }) => {
        if (cancelled) return;
        const copy = new Uint8Array(bytes.byteLength);
        copy.set(bytes);
        const blob = new Blob([copy.buffer], { type: reference.mimeType });
        const url = objectUrls.acquire(assetId, blob);
        acquired = true;
        setResult({ assetId, url, error: null, loading: false });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setResult({
            assetId,
            url: null,
            error:
              error instanceof Error
                ? error.message
                : "The rendered raster could not be loaded.",
            loading: false,
          });
        }
      });
    return () => {
      cancelled = true;
      if (acquired) objectUrls.release(assetId);
    };
  }, [assetId]);

  return {
    url: result.assetId === assetId ? result.url : null,
    error: result.assetId === assetId ? result.error : null,
    loading: result.assetId === assetId ? result.loading : Boolean(assetId),
  };
}

function useVideoPreview(
  assetId: string | undefined,
  active: boolean,
): { url: string | null; error: string | null } {
  const [result, setResult] = useState<{
    assetId: string | undefined;
    url: string | null;
    error: string | null;
  }>({ assetId, url: null, error: null });

  useEffect(() => {
    if (!assetId || !active) {
      setResult({ assetId, url: null, error: null });
      return;
    }
    let cancelled = false;
    let acquired = false;
    setResult({ assetId, url: null, error: null });
    void assetRepository
      .getAsset(assetId)
      .then(({ reference, bytes }) => {
        if (cancelled) return;
        const copy = new Uint8Array(bytes.byteLength);
        copy.set(bytes);
        const blob = new Blob([copy.buffer], { type: reference.mimeType });
        const url = objectUrls.acquire(assetId, blob);
        acquired = true;
        setResult({ assetId, url, error: null });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setResult({
            assetId,
            url: null,
            error:
              error instanceof Error
                ? error.message
                : "The temporal layer could not be loaded.",
          });
        }
      });
    return () => {
      cancelled = true;
      if (acquired) objectUrls.release(assetId);
    };
  }, [assetId, active]);

  return {
    url: result.assetId === assetId ? result.url : null,
    error: result.assetId === assetId ? result.error : null,
  };
}

function formatSeconds(value: number | undefined): string {
  if (!Number.isFinite(value)) return "—";
  return `${(value as number).toFixed(1)}s`;
}

function BendVideoControls({
  layer,
  playing,
  muted,
  onTogglePlay,
  onToggleMute,
  error,
}: {
  layer: SharedLayer;
  playing: boolean;
  muted: boolean;
  onTogglePlay: () => void;
  onToggleMute: () => void;
  error: string | null;
}) {
  return (
    <div className="bend-video-bar" data-video-control="">
      <button
        type="button"
        className="bend-video-play"
        aria-label={playing ? `Pause ${layer.name}` : `Play ${layer.name}`}
        aria-pressed={playing}
        data-testid={`bend-video-toggle-${layer.id}`}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          onTogglePlay();
        }}
      >
        {playing ? "Pause" : "Play video"}
      </button>
      <span className="bend-video-meta">
        {formatSeconds(layer.temporal?.durationSeconds)} · {layer.temporal?.frameRate ?? "—"} fps
      </span>
      <button
        type="button"
        className="bend-video-mute"
        aria-label={
          layer.temporal?.audioPresent
            ? muted
              ? `Unmute ${layer.name}`
              : `Mute ${layer.name}`
            : `${layer.name} has no source audio`
        }
        disabled={!layer.temporal?.audioPresent}
        title={
          layer.temporal?.audioPresent
            ? undefined
            : layer.temporal?.audioMessage ?? "The published video is video-only."
        }
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          onToggleMute();
        }}
      >
        {layer.temporal?.audioPresent ? (muted ? "Sound off" : "Sound on") : "No audio"}
      </button>
      {layer.temporal?.preview ? <span className="bend-video-preview">Preview</span> : null}
      {error ? <span className="bend-video-error">{error}</span> : null}
    </div>
  );
}

function formatRatio(artboard: Artboard): string {
  const ratio = artboard.width / artboard.height;
  if (Math.abs(ratio - 1) < 0.001) return "1:1";
  if (Math.abs(ratio - 0.8) < 0.001) return "4:5";
  if (Math.abs(ratio - 1080 / 1920) < 0.001) return "9:16";
  return ratio > 1 ? "Landscape" : "Portrait";
}

function LayerView({
  layer,
  artboard,
  selected,
  preview,
  drag,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onKeyDown,
}: {
  layer: SharedLayer;
  artboard: Artboard;
  selected: boolean;
  preview: LayerTransform | null;
  drag: DragState | null;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>, layer: SharedLayer) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerCancel: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>, layer: SharedLayer) => void;
}) {
  const isVideo = layer.kind === "video";
  const isSvg = !isVideo && layer.rendered?.kind === "svg";
  const rendered = useRenderedSvg(isSvg ? layer.rendered?.assetId : undefined);
  const raster = useRenderedRaster(
    isVideo
      ? layer.poster?.assetId ??
          (layer.rendered?.kind === "image" ? layer.rendered.assetId : undefined)
      : layer.rendered?.kind === "image"
        ? layer.rendered.assetId
        : undefined,
  );
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const video = useVideoPreview(isVideo ? layer.rendered?.assetId : undefined, playing);
  const muted = layer.temporal?.audio !== "source";
  const playback = layer.temporal?.playback ?? "loop";
  const transform = preview ?? layer.transform;
  const moving = drag?.layerId === layer.id;
  const displayWidth = Math.max(1, transform.width * Math.abs(transform.scaleX || 1));
  const displayHeight = Math.max(1, transform.height * Math.abs(transform.scaleY || 1));

  useEffect(() => {
    setPlaying(false);
  }, [layer.id]);

  useEffect(() => {
    if (!layer.visible) setPlaying(false);
  }, [layer.visible]);

  useEffect(() => {
    if (!playing) return;
    window.dispatchEvent(
      new CustomEvent("studio:bend-video-play", { detail: { layerId: layer.id } }),
    );
    const element = videoRef.current;
    if (element) void element.play().catch(() => setPlaying(false));
  }, [playing, video.url, layer.id]);

  useEffect(() => {
    const onOtherPlay = (event: Event) => {
      const detail = (event as CustomEvent<{ layerId?: string }>).detail;
      if (detail?.layerId && detail.layerId !== layer.id) setPlaying(false);
    };
    window.addEventListener("studio:bend-video-play", onOtherPlay);
    return () => window.removeEventListener("studio:bend-video-play", onOtherPlay);
  }, [layer.id]);

  useEffect(() => {
    const element = videoRef.current;
    if (element && !playing) element.pause();
  }, [playing]);
  const style = {
    left: `${(transform.x / artboard.width) * 100}%`,
    top: `${(transform.y / artboard.height) * 100}%`,
    width: `${(displayWidth / artboard.width) * 100}%`,
    height: `${(displayHeight / artboard.height) * 100}%`,
    transform: `rotate(${transform.rotationDegrees}deg) scale(${transform.flipHorizontal ? -1 : 1}, ${transform.flipVertical ? -1 : 1})`,
    transformOrigin: `${transform.anchorX * 100}% ${transform.anchorY * 100}%`,
    opacity: layer.opacity,
    mixBlendMode:
      layer.blendMode === "normal"
        ? undefined
        : (layer.blendMode as CSSProperties["mixBlendMode"]),
    display: layer.visible ? undefined : "none",
  } as const;

  const artworkError = isSvg ? rendered.error : raster.error;
  const loading = isSvg ? rendered.loading : raster.loading;

  return (
    <div
      className={`canvas-layer layer-kind-${layer.kind}${selected ? " is-selected" : ""}${layer.locked ? " is-locked" : ""}${moving ? " is-dragging" : ""}`}
      style={style}
      data-testid="canvas-layer"
      data-layer-id={layer.id}
      data-layer-name={layer.name}
      data-layer-kind={layer.kind}
      role="group"
      aria-label={`${layer.name} ${layer.kind} layer`}
      tabIndex={0}
      onPointerDown={(event) => onPointerDown(event, layer)}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onKeyDown={(event) => onKeyDown(event, layer)}
      onClick={(event) => {
        event.stopPropagation();
        studioStore.getState().selectLayer(layer.id);
      }}
    >
      <div className="layer-artwork" aria-hidden="true">
        {isSvg && rendered.svg ? (
          <div
            className="vector-svg"
            dangerouslySetInnerHTML={{ __html: rendered.svg }}
          />
        ) : !isSvg && raster.url ? (
          <img className="raster-artwork" src={raster.url} alt="" draggable={false} />
        ) : loading ? (
          <span className="layer-asset-state">Loading artwork…</span>
        ) : (
          <span className="layer-asset-state error" role="img" aria-label="Artwork unavailable">
            Artwork unavailable
          </span>
        )}
        {isVideo && playing && video.url ? (
          <video
            ref={videoRef}
            className="bend-video-preview-player"
            src={video.url}
            muted={muted || !layer.temporal?.audioPresent}
            playsInline
            loop={playback === "loop"}
            onEnded={() => {
              if (playback !== "hold-last-frame") setPlaying(false);
            }}
            onPointerDown={(event) => event.stopPropagation()}
            aria-label={`${layer.name} video preview`}
          />
        ) : null}
      </div>
      {isVideo && (selected || playing) ? (
        <BendVideoControls
          layer={layer}
          playing={playing}
          muted={muted}
          error={video.error}
          onTogglePlay={() => setPlaying((value) => !value)}
          onToggleMute={() =>
            studioStore.getState().updateLayer(layer.id, {
              temporal: {
                ...(layer.temporal ?? { kind: "video" }),
                kind: "video",
                audio: muted ? "source" : "muted",
              },
            })
          }
        />
      ) : null}
      {selected ? (
        <>
          <span className="selection-label">{layer.name}</span>
          {!layer.locked ? (
            <span
              className="resize-handle"
              data-handle="resize"
              aria-hidden="true"
            />
          ) : null}
        </>
      ) : null}
      {artworkError ? (
        <span className="layer-error" role="status">
          {artworkError}
        </span>
      ) : null}
    </div>
  );
}

export function CanvasWorkspace({ onOpenTool, onAnimateComposition }: CanvasWorkspaceProps) {
  const project = useStudioStore((state) => state.project);
  const activeArtboardId = useStudioStore((state) => state.activeArtboardId);
  const selectedLayerId = useStudioStore((state) => state.selectedLayerId);
  const artboard =
    project.artboards.find((candidate) => candidate.id === activeArtboardId) ??
    project.artboards[0];
  const artboardRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [preview, setPreview] = useState<PreviewTransform | null>(null);

  const layers = useMemo(() => {
    const byId = new Map(project.layers.map((layer) => [layer.id, layer]));
    return artboard.layerOrder
      .map((layerId) => byId.get(layerId))
      .filter((layer): layer is SharedLayer => Boolean(layer));
  }, [artboard.layerOrder, project.layers]);

  function beginDrag(
    event: ReactPointerEvent<HTMLDivElement>,
    layer: SharedLayer,
  ) {
    event.stopPropagation();
    studioStore.getState().selectLayer(layer.id);
    if (layer.locked || event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest("[data-video-control]")) return;
    const mode = target.dataset.handle === "resize" ? "resize" : "move";
    const rect = artboardRef.current?.getBoundingClientRect();
    if (!rect) return;
    const scale = rect.width / artboard.width;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const state: DragState = {
      layerId: layer.id,
      mode,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      origin: structuredClone(layer.transform),
      scale,
    };
    dragRef.current = state;
    setDrag(state);
    setPreview({ layerId: layer.id, transform: structuredClone(layer.transform) });
  }

  function moveDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const state = dragRef.current;
    if (!state || state.pointerId !== event.pointerId) return;
    event.preventDefault();
    const dx = (event.clientX - state.startClientX) / state.scale;
    const dy = (event.clientY - state.startClientY) / state.scale;
    let next: LayerTransform;
    if (state.mode === "move") {
      next = {
        ...state.origin,
        x: Math.round(
          Math.min(
            Math.max(0, state.origin.x + dx),
            Math.max(0, artboard.width - state.origin.width),
          ),
        ),
        y: Math.round(
          Math.min(
            Math.max(0, state.origin.y + dy),
            Math.max(0, artboard.height - state.origin.height),
          ),
        ),
      };
    } else {
      const aspect = state.origin.width / Math.max(1, state.origin.height);
      const maxWidth = Math.max(
        24,
        Math.min(
          artboard.width - state.origin.x,
          (artboard.height - state.origin.y) * aspect,
        ),
      );
      const width = Math.min(
        maxWidth,
        Math.max(24, Math.round(state.origin.width + dx)),
      );
      next = {
        ...state.origin,
        width,
        height: Math.max(24, Math.round(width / aspect)),
      };
    }
    setPreview({ layerId: state.layerId, transform: next });
  }

  function finishDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const state = dragRef.current;
    if (!state || state.pointerId !== event.pointerId) return;
    const committed = preview && preview.layerId === state.layerId ? preview.transform : null;
    if (committed) {
      const changed =
        committed.x !== state.origin.x ||
        committed.y !== state.origin.y ||
        committed.width !== state.origin.width ||
        committed.height !== state.origin.height;
      if (changed) {
        studioStore.getState().updateLayer(state.layerId, { transform: committed });
      }
    }
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture may already have been released.
    }
    dragRef.current = null;
    setDrag(null);
    setPreview(null);
  }

  function cancelDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDrag(null);
    setPreview(null);
  }

  function handleKey(event: ReactKeyboardEvent<HTMLDivElement>, layer: SharedLayer) {
    if (layer.locked) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      studioStore.getState().selectLayer(layer.id);
      return;
    }
    const step = event.shiftKey ? 10 : 1;
    const transform = layer.transform;
    let patch: Partial<LayerTransform> | null = null;
    if (event.key === "ArrowLeft") patch = { x: transform.x - step };
    if (event.key === "ArrowRight") patch = { x: transform.x + step };
    if (event.key === "ArrowUp") patch = { y: transform.y - step };
    if (event.key === "ArrowDown") patch = { y: transform.y + step };
    if (patch) {
      event.preventDefault();
      studioStore.getState().updateLayer(layer.id, {
        transform: { ...transform, ...patch },
      });
    }
  }

  return (
    <main className="workspace" aria-labelledby="workspace-title">
      <header className="workspace-head">
        <div>
          <span className="eyebrow">Project canvas</span>
          <h1 id="workspace-title">Canvas workspace</h1>
        </div>
        <div className="workspace-tools" aria-label="Workspace display">
          <span className="workspace-chip">{artboard.name}</span>
          <span className="workspace-zoom">{formatRatio(artboard)} · Fit</span>
          {layers.length >= 2 ? (
            <button
              type="button"
              className="button small generate-layouts-button"
              data-testid="generate-layouts"
              onClick={() => onOpenTool("generate")}
              title="Open Generate with these real layers"
            >
              Generate layouts
            </button>
          ) : null}
          {layers.length > 0 && onAnimateComposition ? (
            <button
              type="button"
              className="button small"
              data-testid="animate-composition-in-bend"
              onClick={onAnimateComposition}
              title="Render this composition as a starting clip in BEND"
            >
              Animate composition
            </button>
          ) : null}
          <button
            type="button"
            className="button small"
            data-testid="add-video-composition"
            onClick={() => onOpenTool("bend")}
            title="Open BEND to create a video layer in this composition"
          >
            Add video
          </button>
        </div>
      </header>

      <div
        className="canvas-stage"
        style={{ "--artboard-ratio": artboard.width / artboard.height } as CSSProperties}
      >
        <div className="artboard-ruler">
          <span>
            {artboard.name} · {artboard.width} × {artboard.height}
          </span>
          <span>{project.layers.length} layer{project.layers.length === 1 ? "" : "s"}</span>
        </div>

        <div
          ref={artboardRef}
          className="artboard-canvas"
          data-testid="artboard"
          aria-label={`${artboard.name} artboard`}
          style={{
            aspectRatio: `${artboard.width} / ${artboard.height}`,
            backgroundColor:
              artboard.background.kind === "solid"
                ? artboard.background.color ?? "#ffffff"
                : "#ffffff",
          }}
          onPointerDown={() => studioStore.getState().selectLayer(null)}
        >
          {layers.length === 0 ? (
            <div className="canvas-empty">
              <span className="canvas-empty-index">01 / Empty canvas</span>
              <h2>Make your first layer.</h2>
              <p>
                Start with a photo treatment, vector artwork or typography. Every tool
                publishes into this same composition and keeps its editable source.
              </p>
              <div className="canvas-empty-actions">
                <button
                  type="button"
                  className="button primary"
                  onClick={() => onOpenTool("image")}
                >
                  Open Image
                </button>
                <button
                  type="button"
                  className="button"
                  onClick={() => onOpenTool("vector")}
                >
                  Open Vector
                </button>
                <button
                  type="button"
                  className="button"
                  onClick={() => onOpenTool("typography")}
                >
                  Open Type
                </button>
                <button
                  type="button"
                  className="button"
                  onClick={() => onOpenTool("shapes")}
                >
                  Open Shapes
                </button>
                <button
                  type="button"
                  className="button"
                  onClick={() => onOpenTool("bend")}
                >
                  Add video
                </button>
              </div>
            </div>
          ) : null}

          {layers.map((layer) => (
            <LayerView
              key={layer.id}
              layer={layer}
              artboard={artboard}
              selected={layer.id === selectedLayerId}
              preview={
                preview?.layerId === layer.id ? preview.transform : null
              }
              drag={drag}
              onPointerDown={beginDrag}
              onPointerMove={moveDrag}
              onPointerUp={finishDrag}
              onPointerCancel={cancelDrag}
              onKeyDown={handleKey}
            />
          ))}
        </div>

        <div className="artboard-caption">
          <span>
            <i aria-hidden="true" />
            {artboard.name}
          </span>
          <span>{formatRatio(artboard)} · {artboard.width} × {artboard.height} px</span>
        </div>
      </div>
    </main>
  );
}
