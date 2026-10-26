#!/usr/bin/env node
/**
 * Content identity for the exact working-tree snapshot used in a deployment.
 * A dirty checkout cannot be identified by git HEAD alone, so this manifest
 * hashes every source, test, config, and documentation file that would
 * reconstruct the snapshot.
 */
import { createHash } from "node:crypto";
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const excludedDirectories = new Set([".git", ".vercel", "node_modules", "dist", "test-results", "output", ".audit-sources", ".playwright-mcp"]);
const files = [];

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!excludedDirectories.has(entry.name)) await walk(join(directory, entry.name));
      continue;
    }
    if (!entry.isFile()) continue;
    const absolute = join(directory, entry.name);
    const relativePath = relative(root, absolute).replaceAll("\\", "/");
    if ([
      "docs/PHASE7_0_SOURCE_IDENTITY.json",
      "docs/PHASE8_0_SOURCE_IDENTITY.json",
      "docs/PHASE8_0_DEPLOYED_SOURCE_IDENTITY.json",
      "docs/PHASE8_1_SOURCE_IDENTITY.json",
      "docs/PHASE8_1_DEPLOYED_SOURCE_IDENTITY.json",
    ].includes(relativePath)) continue;
    files.push(relativePath);
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
  files: entries,
};
const outputPath = join(root, process.env.BEND_IDENTITY_OUTPUT ?? "docs/PHASE8_1_SOURCE_IDENTITY.json");
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, JSON.stringify(identity, null, 2) + "\n");
console.log(JSON.stringify({ digest: identity.digest, fileCount: identity.fileCount, generatedAt: identity.generatedAt, outputPath }));
