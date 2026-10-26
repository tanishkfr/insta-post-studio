import { normalizeProject } from "../engine/core/project";
import type { BendProject, MediaAssetRecord } from "../engine/core/types";

/**
 * Stable identity for an editable source revision.
 *
 * The hash covers creative content only. Volatile storage and bookkeeping
 * fields are excluded so that saving, reloading, or reopening a `.bendpkg` in
 * a fresh context does not create a false "new revision":
 *
 * - `metadata` (`createdAt` / `updatedAt`) changes on save.
 * - `id` can change when a package is restored into a context that already
 *   contains the same project id.
 * - `assets[].storageKey` is a local IndexedDB key and is rewritten on import.
 * - `assets[].size` is derived from the packaged bytes and is rewritten on
 *   import; it is not creative state.
 *
 * Everything that affects the rendered result (canvas, layers, generators,
 * effects, masks, blend modes, animation, loop/range data, asset identity and
 * media metadata) remains part of the hash.
 */
export function getProjectVersion(project: BendProject): string {
  return hashString(stableStringify(getVersionedContent(project)));
}

export function getVersionedContent(project: BendProject): unknown {
  const normalized = normalizeProject(project);
  const { metadata: _metadata, id: _id, ...content } = normalized;
  return {
    ...content,
    assets: Object.fromEntries(
      Object.entries(normalized.assets)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([assetId, asset]) => [assetId, stripVolatileAssetFields(asset)]),
    ),
  };
}

function stripVolatileAssetFields(asset: MediaAssetRecord): Omit<MediaAssetRecord, "storageKey" | "size"> {
  const { storageKey: _storageKey, size: _size, ...content } = asset;
  return content;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function hashString(value: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
