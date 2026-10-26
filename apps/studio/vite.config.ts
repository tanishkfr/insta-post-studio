import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vitest/config";

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
