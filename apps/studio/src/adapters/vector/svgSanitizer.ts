export interface SanitizedSvg {
  svg: string;
  width: number;
  height: number;
  viewBox: [number, number, number, number];
}

export class SvgSanitizationError extends Error {
  readonly code = "SVG_SANITIZATION_FAILED" as const;

  constructor(message: string) {
    super(message);
    this.name = "SvgSanitizationError";
  }
}

const ALLOWED_ELEMENTS = new Set([
  "svg",
  "g",
  "defs",
  "clippath",
  "mask",
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "text",
  "tspan",
  "title",
  "desc",
  "filter",
  "fegaussianblur",
  "femergenode",
  "feoffset",
  "fecolormatrix",
  "feblend",
  "linearGradient".toLowerCase(),
  "radialGradient".toLowerCase(),
  "stop",
]);

const ALLOWED_ROOT_ATTRIBUTES = new Set([
  "viewbox",
  "width",
  "height",
  "preserveaspectratio",
  "fill",
  "xmlns",
]);

const ALLOWED_ATTRIBUTES = new Set([
  "id",
  "fill",
  "fill-opacity",
  "fill-rule",
  "stroke",
  "stroke-width",
  "stroke-opacity",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-dasharray",
  "stroke-dashoffset",
  "opacity",
  "transform",
  "d",
  "x",
  "y",
  "x1",
  "y1",
  "x2",
  "y2",
  "dx",
  "dy",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "points",
  "width",
  "height",
  "offset",
  "stop-color",
  "stop-opacity",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "text-anchor",
  "dominant-baseline",
  "letter-spacing",
  "clip-path",
  "clip-rule",
  "clipPathUnits".toLowerCase(),
  "filter",
  "filterunits",
  "result",
  "in",
  "in2",
  "stddeviation",
  "mode",
  "values",
  "gradientunits",
  "gradienttransform",
  "spreadmethod",
  "preservealpha",
  "maskunits",
  "maskcontentunits",
]);

const URL_ONLY_ATTRIBUTES = new Set([
  "clip-path",
  "filter",
  "mask",
]);

function containsUnsafeReference(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return true;
  if (normalized.includes("javascript:") || normalized.includes("data:")) return true;
  const urlMatches = normalized.match(/url\(([^)]+)\)/g) ?? [];
  for (const match of urlMatches) {
    const target = match.slice(4, -1).trim();
    if (!/^['"]?#[a-z0-9_.:-]+['"]?$/.test(target)) {
      return true;
    }
  }
  // Reject CSS expressions and external URL syntax.
  if (/expression\s*\(|@import/i.test(normalized)) return true;
  return false;
}

function cleanAttributes(element: Element, isRoot: boolean): void {
  const allowed = isRoot
    ? new Set([...ALLOWED_ATTRIBUTES, ...ALLOWED_ROOT_ATTRIBUTES])
    : ALLOWED_ATTRIBUTES;
  for (const attribute of Array.from(element.attributes)) {
    const name = attribute.name.toLowerCase();
    if (!allowed.has(name)) {
      element.removeAttribute(attribute.name);
      continue;
    }
    const value = attribute.value;
    if (URL_ONLY_ATTRIBUTES.has(name)) {
      if (value.trim() !== "none" && !/^\s*url\(\s*['"]?#[a-z0-9_.:-]+['"]?\s*\)\s*$/i.test(value)) {
        element.removeAttribute(attribute.name);
      }
      continue;
    }
    if (name === "fill" || name === "stroke" || name === "stop-color") {
      if (containsUnsafeReference(value)) {
        element.removeAttribute(attribute.name);
      }
    }
    if (name === "font-family" && /url|expression|@import/i.test(value)) {
      element.removeAttribute(attribute.name);
    }
  }
}

function cleanElement(element: Element, isRoot = false): void {
  cleanAttributes(element, isRoot);
  for (const child of Array.from(element.children)) {
    if (!ALLOWED_ELEMENTS.has(child.localName.toLowerCase())) {
      child.remove();
      continue;
    }
    cleanElement(child, false);
  }
}

function parseViewBox(root: Element): [number, number, number, number] | null {
  const raw = root.getAttribute("viewBox");
  if (!raw) return null;
  const parts = raw
    .trim()
    .split(/[\s,]+/)
    .map((value) => Number(value));
  if (parts.length !== 4 || parts.some((value) => !Number.isFinite(value))) return null;
  const [x, y, width, height] = parts as [number, number, number, number];
  if (width <= 0 || height <= 0) return null;
  return [x, y, width, height];
}

/**
 * Sanitizes a published Vector SVG before storage/rendering.
 * Removes scripts, event handlers, external references, embedded media, styles
 * and arbitrary elements while preserving the generator's SVG primitives,
 * clip paths, filters and text styling.
 */
export function sanitizeVectorSvg(svgText: string): SanitizedSvg {
  if (typeof svgText !== "string" || !svgText.trim()) {
    throw new SvgSanitizationError("The editor returned an empty SVG.");
  }
  const parser = new DOMParser();
  const document = parser.parseFromString(svgText, "image/svg+xml");
  if (document.querySelector("parsererror")) {
    throw new SvgSanitizationError("The editor returned invalid SVG markup.");
  }
  const root = document.documentElement;
  if (!root || root.localName.toLowerCase() !== "svg") {
    throw new SvgSanitizationError("Published artwork must have an <svg> root.");
  }
  const viewBox = parseViewBox(root);
  if (!viewBox) {
    throw new SvgSanitizationError("Published artwork is missing a valid viewBox.");
  }

  cleanElement(root, true);
  root.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  // Keep the native viewBox; wrapper sizing is controlled by the host layer.
  root.setAttribute("viewBox", viewBox.join(" "));
  if (root.getAttribute("width")) root.removeAttribute("width");
  if (root.getAttribute("height")) root.removeAttribute("height");

  const serialized = new XMLSerializer().serializeToString(root);
  if (/<script|on[a-z]+\s*=|javascript:|<foreignObject|<iframe|<object|<embed|<image|<use|<style/i.test(serialized)) {
    throw new SvgSanitizationError("Published artwork contained unsafe content.");
  }
  return {
    svg: serialized,
    width: viewBox[2],
    height: viewBox[3],
    viewBox,
  };
}
