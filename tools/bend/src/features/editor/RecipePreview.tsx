import { useEffect, useRef } from "react";
import type { MotionRecipe } from "../../engine/recipes/recipes";

/**
 * A lightweight, deterministic cue for a recipe. This deliberately does not
 * create a second Pixi/WebGL compositor beside the live editor: doing so could
 * stall the page when switching between stateful recipes (Liquid) and effect
 * stacks. Applying the recipe still renders through the single shared
 * compositor, where the real output is visible and exportable.
 */
export function RecipePreview({ recipe }: { recipe: MotionRecipe }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const width = canvas.width;
    const height = canvas.height;
    let seed = 2166136261;
    for (const character of `${recipe.seed}:${recipe.id}:${recipe.effects.map((effect) => effect.id).join(",")}`) {
      seed ^= character.charCodeAt(0);
      seed = Math.imul(seed, 16777619);
    }
    const random = () => {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      return (seed >>> 0) / 4294967296;
    };
    const background = context.createLinearGradient(0, 0, width, height);
    background.addColorStop(0, "#173c3f");
    background.addColorStop(1, recipe.effects.length > 0 ? "#5b2c2f" : "#235f62");
    context.fillStyle = background;
    context.fillRect(0, 0, width, height);
    context.globalCompositeOperation = "screen";
    for (let index = 0; index < 7 + Math.min(8, recipe.effects.length * 3); index += 1) {
      const x = random() * width;
      const y = random() * height;
      const radius = 18 + random() * 90;
      const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, `rgba(${190 + Math.round(random() * 60)}, ${210 + Math.round(random() * 40)}, 180, 0.5)`);
      gradient.addColorStop(1, "rgba(35, 111, 114, 0)");
      context.fillStyle = gradient;
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
    }
    context.globalCompositeOperation = "source-over";
    context.strokeStyle = "rgba(245, 243, 239, 0.5)";
    context.lineWidth = 1.5;
    for (let index = 0; index < 3; index += 1) {
      context.beginPath();
      context.moveTo(0, height * (0.25 + index * 0.22));
      context.bezierCurveTo(width * 0.3, height * random(), width * 0.7, height * random(), width, height * (0.2 + index * 0.25));
      context.stroke();
    }
    context.fillStyle = "rgba(0, 0, 0, 0.45)";
    context.fillRect(0, height - 43, width, 43);
    context.fillStyle = "#f5f3ef";
    context.font = "600 12px 'Space Grotesk', sans-serif";
    context.fillText("RECIPE CUE · APPLY TO RENDER", 14, height - 17);
  }, [recipe]);

  return (
    <div className="recipe-preview">
      <canvas ref={canvasRef} width={320} height={320} aria-label={`${recipe.name} static recipe cue; apply to render the actual motion`} />
      <span className="recipe-preview-status">Static cue · apply to render</span>
    </div>
  );
}
