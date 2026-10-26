import type { LayerMask } from "../core/types";
import { normalizeMask } from "../core/mask";

const TEXTURE_SIZE = 192;

export function renderMaskTexture(maskValue: LayerMask): HTMLCanvasElement {
  const mask = normalizeMask(maskValue);
  const canvas = document.createElement("canvas");
  canvas.width = TEXTURE_SIZE;
  canvas.height = TEXTURE_SIZE;
  const context = canvas.getContext("2d");
  if (!context) return canvas;
  const image = context.createImageData(TEXTURE_SIZE, TEXTURE_SIZE);
  const feather = Math.max(0, Math.min(1, mask.feather));
  const angle = (mask.angle * Math.PI) / 180;
  const dirX = Math.cos(angle);
  const dirY = Math.sin(angle);
  const gradientStart = 0.5 - mask.falloff / 2;
  const gradientEnd = 0.5 + mask.falloff / 2;
  for (let y = 0; y < TEXTURE_SIZE; y += 1) {
    const py = (y + 0.5) / TEXTURE_SIZE * 2 - 1;
    for (let x = 0; x < TEXTURE_SIZE; x += 1) {
      const px = (x + 0.5) / TEXTURE_SIZE * 2 - 1;
      let alpha: number;
      if (mask.type === "rectangle") {
        const distance = Math.max(Math.abs(px), Math.abs(py)) - 1;
        alpha = edgeAlpha(distance, feather * 1.4);
      } else if (mask.type === "ellipse") {
        const radius = Math.sqrt(px * px + py * py);
        alpha = edgeAlpha(radius - 1, feather * 1.4);
      } else if (mask.type === "gradient") {
        const distance = Math.max(Math.abs(px), Math.abs(py)) - 1;
        const containment = edgeAlpha(distance, 0.025);
        const projection = Math.min(1, Math.max(0, (px * dirX + py * dirY + 1) / 2));
        const gradient = smoothstep(gradientStart, gradientEnd, projection);
        alpha = containment * gradient;
      } else {
        alpha = 1;
      }
      if (mask.invert) alpha = 1 - alpha;
      const index = (y * TEXTURE_SIZE + x) * 4;
      image.data[index] = 255;
      image.data[index + 1] = 255;
      image.data[index + 2] = 255;
      image.data[index + 3] = Math.round(Math.min(1, Math.max(0, alpha)) * 255);
    }
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

function edgeAlpha(signedDistance: number, feather: number): number {
  if (feather <= 0.0001) return signedDistance <= 0 ? 1 : 0;
  const half = feather / 2;
  return 1 - smoothstep(-half, half, signedDistance);
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge1 <= edge0) return value < edge0 ? 0 : 1;
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
