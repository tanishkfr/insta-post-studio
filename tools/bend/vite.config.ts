import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Standalone deployment keeps the original root base. Studio builds pass
  // BEND_BASE=/tools/bend/ so every chunk, worker and asset resolves under the
  // nested route in production as well as development.
  base: process.env.BEND_BASE ?? "/",
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
  },
});
