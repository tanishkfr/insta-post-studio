#!/usr/bin/env node
/**
 * Content identity for the files Vercel uploads for the Bend project. This
 * mirrors .vercelignore so the deployment report can name the exact runtime
 * source snapshot even when documentation changes after the build.
 */
import { createHash } from "node:crypto";
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const excludedDirectories = new Set([
  ".git", ".vercel", "node_modules", "dist", "test-results", "output", "docs",
  "tests", ".audit-sources", ".playwright-mcp",
]);
const excludedFilePatterns = [/\.log$/i];
const files = [];

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!excludedDirectories.has(entry.name)) await walk(join(directory, entry.name));
      continue;
    }
    if (!entry.isFile()) continue;
    if (excludedFilePatterns.some((pattern) => pattern.test(entry.name))) continue;
    const absolute = join(directory, entry.name);
    files.push(relative(root, absolute).replaceAll("\\", "/"));
  }
}

await walk(root);
files.sort();
const entries = [];
const aggregate = createHash("sha256");
for (const relativePath of files) {
  const bytes = await readFile(join(root, relativePath));
  const hash = createHash("sha256").update(bytes).digest("hex");
  entries.push({ path: relativePath, sha256: hash, bytes: bytes.byteLength });
  aggregate.update(relativePath).update("\0").update(hash).update("\n");
}
const identity = {
  generatedAt: new Date().toISOString(),
  algorithm: "sha256(path\\0sha256(content))",
  digest: aggregate.digest("hex"),
  fileCount: entries.length,
  scope: "Vercel-uploaded source (mirrors .vercelignore; excludes docs/tests/output)",
  files: entries,
};
const outputPath = join(root, process.env.BEND_DEPLOY_IDENTITY_OUTPUT ?? "docs/PHASE8_1_DEPLOYED_SOURCE_IDENTITY.json");
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, JSON.stringify(identity, null, 2) + "\n");
console.log(JSON.stringify({ digest: identity.digest, fileCount: identity.fileCount, generatedAt: identity.generatedAt, outputPath }));
