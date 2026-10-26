import { useEffect, useRef, useState } from "react";
import { createGeneratedProject } from "../engine/core/project";
import type { AspectPreset, SignalPresetId } from "../engine/core/types";
import type { PixiBendRenderer } from "../engine/render/pixiRenderer";

interface SignalCanvasProps {
  preset: SignalPresetId;
  seed?: string;
  aspect?: AspectPreset;
  className?: string;
}

export function SignalCanvas({ preset, seed = "BEND-HERO", aspect = "4:5", className = "" }: SignalCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const visibleRef = useRef(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const element = canvasRef.current?.parentElement;
    if (!element || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(([entry]) => {
      visibleRef.current = entry?.isIntersecting ?? true;
    }, { threshold: 0.01 });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let alive = true;
    let renderer: PixiBendRenderer | null = null;
    let frameId = 0;
    const project = createGeneratedProject(aspect, preset, seed);
    const sourceWidth = project.canvas.width;
    const sourceHeight = project.canvas.height;
    project.canvas.width = 720;
    project.canvas.height = Math.round(720 * sourceHeight / sourceWidth);
    const start = performance.now();

    const startRenderer = async () => {
      try {
        const { PixiBendRenderer: Renderer } = await import("../engine/render/pixiRenderer");
        renderer = new Renderer({ canvas, width: project.canvas.width, height: project.canvas.height });
        await renderer.init();
        if (!alive) {
          renderer.destroy();
          return;
        }
        renderer.render(project, 0);
        const draw = (now: number) => {
          if (!alive || !renderer) return;
          if (visibleRef.current) renderer.render(project, (now - start) / 1000);
          frameId = window.requestAnimationFrame(draw);
        };
        frameId = window.requestAnimationFrame(draw);
      } catch {
        setError(true);
      }
    };
    void startRenderer();
    return () => {
      alive = false;
      window.cancelAnimationFrame(frameId);
      renderer?.destroy();
    };
  }, [aspect, preset, seed]);

  return (
    <div className={`signal-canvas ${className}`} data-preset={preset}>
      <canvas ref={canvasRef} aria-label={`${preset} Signal Field preview`} />
      {error && <div className="canvas-capability-note">WebGL preview unavailable on this device.</div>}
    </div>
  );
}

