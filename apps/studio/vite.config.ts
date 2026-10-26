import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vitest/config";

const VECTOR_ADAPTER_PATH = "/tools/vector/adapter.html";
const vectorSource = fileURLToPath(
  new URL("../../tools/legacy/vector/arnav.html", import.meta.url),
);
const vectorBridge = fileURLToPath(
  new URL("./src/adapters/vector/vectorBridge.js", import.meta.url),
);

/**
 * Serves a derived Vector integration page without touching the preserved file.
 * The bridge is injected into the same classic script as the editor so it can
 * access the original top-level P/HIST/REDO state. The original algorithms and
 * DOM remain intact.
 */
function vectorAdapterPlugin(): Plugin {
  const buildAdapterHtml = (): string => {
    const source = readFileSync(vectorSource, "utf8");
    const bridge = readFileSync(vectorBridge, "utf8");
    const closingScript = source.lastIndexOf("</script>");
    if (closingScript < 0) {
      throw new Error("Preserved Vector source has no closing script tag.");
    }
    return (
      source.slice(0, closingScript) +
      "\n/* ---- Studio integration bridge (generated; original source unchanged) ---- */\n" +
      bridge +
      "\n" +
      source.slice(closingScript)
    );
  };

  return {
    name: "studio-vector-adapter",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const pathname = new URL(
          request.url ?? "/",
          "http://studio.local",
        ).pathname;
        if (pathname !== VECTOR_ADAPTER_PATH) {
          next();
          return;
        }
        try {
          response.statusCode = 200;
          response.setHeader("Content-Type", "text/html; charset=utf-8");
          response.setHeader("Cache-Control", "no-store");
          response.end(buildAdapterHtml());
        } catch (error) {
          response.statusCode = 500;
          response.setHeader("Content-Type", "text/plain; charset=utf-8");
          response.end(
            `Vector adapter generation failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      });
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "tools/vector/adapter.html",
        source: buildAdapterHtml(),
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), vectorAdapterPlugin()],
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
