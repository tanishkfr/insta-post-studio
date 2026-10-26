#!/usr/bin/env node
/**
 * Build the pinned BEND editor for Studio's nested route.
 *
 * The BEND Vite config reads BEND_BASE. Standalone `npm run build` inside
 * tools/bend deliberately keeps the original "/" base; this wrapper is the only
 * path that opts into the `/tools/bend/` deployment.
 */
import { spawn } from "node:child_process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const child = spawn(npm, ["--prefix", "tools/bend", "run", "build"], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, BEND_BASE: "/tools/bend/" },
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
