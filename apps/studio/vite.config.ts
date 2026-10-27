import { readFileSync, existsSync, cpSync } from "node:fs";
import { extname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { defineConfig, type Plugin } from "vitest/config";
import react from "@vitejs/plugin-react";

const VECTOR_SOURCE = fileURLToPath(
  new URL("../../tools/legacy/vector/arnav.html", import.meta.url),
);
const VECTOR_BRIDGE = fileURLToPath(
  new URL("./src/adapters/vector/vectorBridge.js", import.meta.url),
);
const IMAGE_SOURCE = fileURLToPath(
  new URL("../../tools/legacy/image/janya.html", import.meta.url),
);
const IMAGE_BRIDGE = fileURLToPath(
  new URL("./src/adapters/image/imageBridge.js", import.meta.url),
);
const TYPE_ROOT = fileURLToPath(new URL("../../tools/typography/", import.meta.url));
const TYPE_LIBRARY_BRIDGE = fileURLToPath(
  new URL("./src/adapters/typography/libraryBridge.js", import.meta.url),
);
const TYPE_CUSTOM_BRIDGE = fileURLToPath(
  new URL("./src/adapters/typography/customBridge.js", import.meta.url),
);
const SHAPES_DIST = fileURLToPath(new URL("../../tools/shapes/dist/", import.meta.url));
const BEND_DIST = fileURLToPath(new URL("../../tools/bend/dist/", import.meta.url));
const GENERATE_SOURCE = fileURLToPath(
  new URL("../../tools/legacy/generate/generator.html", import.meta.url),
);
const GENERATE_BRIDGE = fileURLToPath(
  new URL("./src/adapters/generate/generateBridge.js", import.meta.url),
);

const JSZIP_CDN =
  "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
const OPENTYPE_CDN =
  "https://cdnjs.cloudflare.com/ajax/libs/opentype.js/1.3.4/opentype.min.js";
const LOCAL_JSZIP = "/vendor/jszip.min.js";
const LOCAL_OPENTYPE = "/vendor/opentype.min.js";

interface GeneratedPage {
  path: string;
  html: string;
  assets?: Array<{ path: string; content: string; contentType: string }>;
}

function injectBridge(source: string, bridge: string, label: string): string {
  const closingScript = source.lastIndexOf("</script>");
  if (closingScript < 0) {
    throw new Error(`Preserved ${label} source has no closing script tag.`);
  }
  return (
    source.slice(0, closingScript) +
    `\n/* ---- Studio integration bridge (generated; original source unchanged) ---- */\n` +
    bridge +
    "\n" +
    source.slice(closingScript)
  );
}

function injectClosureBridge(source: string, bridge: string, label: string): string {
  // The Typography scripts wrap all state in a DOMContentLoaded closure. The
  // bridge must live inside that closure to access S/field/render/export state.
  const closing = source.lastIndexOf("});");
  if (closing < 0) {
    throw new Error(`Preserved ${label} script has no DOMContentLoaded closure.`);
  }
  return (
    source.slice(0, closing) +
    `\n/* ---- Studio integration bridge (generated; original source unchanged) ---- */\n` +
    bridge +
    "\n" +
    source.slice(closing)
  );
}

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function buildVectorPage(): string {
  return injectBridge(read(VECTOR_SOURCE), read(VECTOR_BRIDGE), "Vector");
}

function buildImagePage(): string {
  const source = read(IMAGE_SOURCE).replace(JSZIP_CDN, LOCAL_JSZIP);
  return injectBridge(source, read(IMAGE_BRIDGE), "Image");
}

function buildTypeLibraryPage(): string {
  return read(`${TYPE_ROOT}fonts.html`).replace(
    '<script src="fonts.js"></script>',
    '<script src="fonts-adapter.js"></script>',
  );
}

function buildTypeLibraryScript(): string {
  return injectClosureBridge(
    read(`${TYPE_ROOT}fonts.js`),
    read(TYPE_LIBRARY_BRIDGE),
    "Type Library",
  );
}

function buildCustomTypePage(): string {
  return read(`${TYPE_ROOT}custom.html`)
    .replace(OPENTYPE_CDN, LOCAL_OPENTYPE)
    .replace('<script src="script.js"></script>', '<script src="custom-adapter.js"></script>');
}

function buildCustomTypeScript(): string {
  return injectClosureBridge(
    read(`${TYPE_ROOT}script.js`),
    read(TYPE_CUSTOM_BRIDGE),
    "Custom Type",
  );
}

function replaceOnce(source: string, needle: string, replacement: string, label: string): string {
  if (!source.includes(needle)) {
    throw new Error(`Preserved ${label} source no longer contains an expected integration point.`);
  }
  return source.replace(needle, replacement);
}

/**
 * Generates the integrated Generate page from the byte-identical preserved
 * source. Only three narrowly scoped changes are applied: the slide aspect
 * ratio becomes format-driven, the rule engine receives an aspect-aware frame
 * height, and placement height prefers an authored asset aspect ratio.
 */
function buildGeneratePage(): string {
  let source = read(GENERATE_SOURCE);
  source = replaceOnce(
    source,
    ".slide{position:relative;width:200px;aspect-ratio:4/5;",
    ".slide{position:relative;width:200px;aspect-ratio:var(--studio-gen-aspect,4/5);",
    "Generate",
  );
  source = replaceOnce(
    source,
    "top:${p.y/1.25}%",
    "top:${p.y/(window.__studioGenFrameHeight||125)*100}%",
    "Generate",
  );
  source = replaceOnce(
    source,
    "h:w*AR[k]",
    "h:w*(a.aspectHOverW||AR[k])",
    "Generate",
  );
  source = replaceOnce(
    source,
    "const kind=a=>a.type==='text'?a.role||'sub':a.type;",
    "const kind=a=>{const base=a.type==='text'?a.role||'sub':a.type;if(!a.hostKind)return base;return ({image:'img',vector:'vec',typography:'head',shapes:'obj'})[a.hostKind]||base};",
    "Generate",
  );
  // The upstream texture helper embeds double quotes inside a double-quoted
  // HTML style attribute, producing malformed markup. The derived page uses
  // single-quoted CSS URL syntax and percent-encodes the SVG's single quotes so
  // the same feTurbulence texture survives DOM/XML serialization for capture.
  source = replaceOnce(
    source,
    "const GR=(f,o,b)=>`url(\"data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='${f}' numOctaves='3'/></filter><rect width='200' height='200' filter='url(%23n)' opacity='${o}'/></svg>`)}\")`;",
    "const GR=(f,o,b)=>`url('data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='${f}' numOctaves='3'/></filter><rect width='200' height='200' filter='url(%23n)' opacity='${o}'/></svg>`).replace(/'/g,'%27')}')`;",
    "Generate",
  );
  return injectBridge(source, read(GENERATE_BRIDGE), "Generate");
}

let generatedPagesCache: GeneratedPage[] | null = null;

function generatedPages(): GeneratedPage[] {
  if (generatedPagesCache) return generatedPagesCache;
  const typeAssets = (): Array<{
    path: string;
    content: string;
    contentType: string;
  }> => [
    {
      path: "tools/typography/fonts-adapter.js",
      content: buildTypeLibraryScript(),
      contentType: "text/javascript; charset=utf-8",
    },
    {
      path: "tools/typography/custom-adapter.js",
      content: buildCustomTypeScript(),
      contentType: "text/javascript; charset=utf-8",
    },
    {
      path: "tools/typography/style.css",
      content: read(`${TYPE_ROOT}style.css`),
      contentType: "text/css; charset=utf-8",
    },
    {
      path: "tools/typography/sliders.js",
      content: read(`${TYPE_ROOT}sliders.js`),
      contentType: "text/javascript; charset=utf-8",
    },
    {
      path: "tools/typography/fonts-data.js",
      content: read(`${TYPE_ROOT}fonts-data.js`),
      contentType: "text/javascript; charset=utf-8",
    },
  ];
  generatedPagesCache = [
    { path: "tools/vector/adapter.html", html: buildVectorPage() },
    { path: "tools/image/adapter.html", html: buildImagePage() },
    { path: "tools/generate/adapter.html", html: buildGeneratePage() },
    {
      path: "tools/typography/fonts-adapter.html",
      html: buildTypeLibraryPage(),
      assets: typeAssets(),
    },
    {
      path: "tools/typography/custom-adapter.html",
      html: buildCustomTypePage(),
    },
  ];
  return generatedPagesCache;
}

function contentTypeFor(path: string): string {
  if (path.endsWith(".html")) return "text/html; charset=utf-8";
  if (path.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (path.endsWith(".css")) return "text/css; charset=utf-8";
  return "application/octet-stream";
}

const STATIC_CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".wasm": "application/wasm",
  ".map": "application/json; charset=utf-8",
};

function staticTypeFor(path: string): string {
  return STATIC_CONTENT_TYPES[extname(path).toLowerCase()] ?? "application/octet-stream";
}

function bundledDistFile(pathname: string, prefix: string, dist: string): string | null {
  if (!pathname.startsWith(prefix)) return null;
  let relative = pathname.slice(prefix.length);
  if (!relative || relative.endsWith("/")) relative += "index.html";
  if (relative.includes("..")) return null;
  return join(dist, relative);
}

function serveBundledTool(
  request: { url?: string },
  response: {
    statusCode: number;
    setHeader(name: string, value: string): void;
    end(body?: string | Uint8Array): void;
  },
  options: { prefix: string; dist: string; label: string; buildCommand: string },
): boolean {
  const pathname = new URL(request.url ?? "/", "http://studio.local").pathname;
  const file = bundledDistFile(pathname, options.prefix, options.dist);
  if (!file) return false;
  if (!existsSync(file)) {
    response.statusCode = 503;
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end(
      `<!doctype html><meta charset='utf-8'><title>${options.label} bundle missing</title><body style='font:14px sans-serif;padding:24px;color:#193438'><h1>${options.label} is not built yet</h1><p>Run <code>${options.buildCommand}</code>; Studio serves the independently bundled ${options.label} app from <code>${options.dist}</code>.</p></body>`,
    );
    return true;
  }
  response.statusCode = 200;
  response.setHeader("Content-Type", staticTypeFor(file));
  response.setHeader("Cache-Control", "no-store");
  response.end(readFileSync(file));
  return true;
}

function serveShapesBundle(
  request: { url?: string },
  response: {
    statusCode: number;
    setHeader(name: string, value: string): void;
    end(body?: string | Uint8Array): void;
  },
): boolean {
  return serveBundledTool(request, response, {
    prefix: "/tools/shapes/",
    dist: SHAPES_DIST,
    label: "Shapes",
    buildCommand: "npm run tool:shapes:build",
  });
}

function serveBendBundle(
  request: { url?: string },
  response: {
    statusCode: number;
    setHeader(name: string, value: string): void;
    end(body?: string | Uint8Array): void;
  },
): boolean {
  return serveBundledTool(request, response, {
    prefix: "/tools/bend/",
    dist: BEND_DIST,
    label: "BEND",
    buildCommand: "npm run tool:bend:build",
  });
}

/**
 * Serves derived integration pages without touching preserved sources. Vector
 * and Image inject the bridge into the same classic script; Typography inserts
 * it inside the existing DOMContentLoaded closure via a derived script file.
 */
function studioAdapterPlugin(): Plugin {
  return {
    name: "studio-tool-adapters",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const pathname = new URL(request.url ?? "/", "http://studio.local").pathname;
        if (serveShapesBundle(request, response)) return;
        if (serveBendBundle(request, response)) return;
        const page = generatedPages().find((candidate) => `/${candidate.path}` === pathname);
        if (page) {
          try {
            response.statusCode = 200;
            response.setHeader("Content-Type", contentTypeFor(pathname));
            response.setHeader("Cache-Control", "no-store");
            response.end(page.html);
          } catch (error) {
            response.statusCode = 500;
            response.setHeader("Content-Type", "text/plain; charset=utf-8");
            response.end(
              `Tool adapter generation failed: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
          }
          return;
        }
        const asset = generatedPages()
          .flatMap((candidate) => candidate.assets ?? [])
          .find((candidate) => `/${candidate.path}` === pathname);
        if (asset) {
          response.statusCode = 200;
          response.setHeader("Content-Type", asset.contentType);
          response.setHeader("Cache-Control", "no-store");
          response.end(asset.content);
          return;
        }
        // The preserved Typography pages reference sibling font files. Serve the
        // original directory read-only so no asset is copied or rewritten.
        if (pathname.startsWith("/tools/typography/fonts/")) {
          const relative = pathname.slice("/tools/typography/".length);
          const file = `${TYPE_ROOT}${relative}`;
          if (existsSync(file)) {
            response.statusCode = 200;
            response.setHeader("Content-Type", "font/otf");
            response.end(readFileSync(file));
            return;
          }
        }
        next();
      });
    },
    generateBundle() {
      for (const page of generatedPages()) {
        this.emitFile({ type: "asset", fileName: page.path, source: page.html });
        for (const asset of page.assets ?? []) {
          this.emitFile({ type: "asset", fileName: asset.path, source: asset.content });
        }
      }
    },
    writeBundle(options) {
      const indexFile = join(SHAPES_DIST, "index.html");
      if (!existsSync(indexFile)) {
        this.error(
          "The Shapes bundle is missing. Run `npm run tool:shapes:build` before building Studio.",
        );
        return;
      }
      const bendIndex = join(BEND_DIST, "index.html");
      if (!existsSync(bendIndex)) {
        this.error(
          "The BEND bundle is missing. Run `npm run tool:bend:build` before building Studio.",
        );
        return;
      }
      const outDir = options.dir
        ? isAbsolute(options.dir)
          ? options.dir
          : resolve(process.cwd(), options.dir)
        : fileURLToPath(new URL("./dist", import.meta.url));
      cpSync(SHAPES_DIST, join(outDir, "tools", "shapes"), { recursive: true });
      cpSync(BEND_DIST, join(outDir, "tools", "bend"), { recursive: true });
      this.warn(
        `Copied the independently bundled Shapes and BEND apps into ${join(outDir, "tools")}.`,
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), studioAdapterPlugin()],
  resolve: {
    alias: {
      "@studio/contracts": fileURLToPath(
        new URL("../../packages/contracts/src/index.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
