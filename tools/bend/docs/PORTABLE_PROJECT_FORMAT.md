# BEND. portable project format

## Status

Phase 6A defines the version-1 `.bendpkg` format. It is a dependency-free framed binary archive designed for local browser handoff. It is not a ZIP file and it never puts media bytes in the JSON manifest as base64.

The implementation is in `src/engine/package/bendPackage.ts`; storage-aware export/import is in `src/engine/package/portableProject.ts`.

## Archive layout

All integers are little-endian:

```text
8 bytes     ASCII magic: BENDPKG1
uint32      manifest byte length
uint32      entry count
N bytes     UTF-8 JSON manifest
repeat entry count times:
  uint32    UTF-8 path byte length
  uint64    raw entry byte length
  P bytes   UTF-8 entry path
  B bytes   raw entry bytes
```

The manifest contains:

```ts
{
  format: "bendpkg",
  formatVersion: 1,
  createdAt: number,
  complete: true,
  project: BendProject,
  assets: Record<string, {
    id: string,
    path: string,
    name: string,
    mimeType: string,
    size: number,
    sha256: string | null
  }>
}
```

Each source asset is a separate `assets/<encoded-stable-id>` entry. The embedded project is normalized schema-v2 data, but its `storageKey` values are rewritten to `portable/<asset-id>` so they cannot point back to the exporting browser's IndexedDB. Blob URLs are never serialized.

Thumbnails are not required for source portability. The current host handoff stores a rendered poster separately as host media; the editable package stays focused on editable project data and source media.

## Validation and safety

Import fails closed before any local project or asset is written. Validation covers:

- magic, archive bounds, UTF-8, manifest JSON, format version, and `complete` state;
- project/manifest asset identity agreement and video-layer references;
- duplicate entries, missing entries, declared sizes, SHA-256 hashes when Web Crypto is available;
- entry paths containing backslashes, absolute paths, drive prefixes, empty components, `.` or `..`;
- manifest, entry, total-byte, and entry-count limits.

The default limits are 8 MiB for the manifest, 512 MiB per entry, 1 GiB total entry bytes, and 2,048 entries. Callers can provide narrower limits. The archive has no executable content or plugin loading path; imported JSON is treated as data and still passes the existing project normalizer.

Format versions newer than `1` return a typed `BendPackageError` with code `unsupported`. A package marked incomplete or missing a referenced source asset returns code `incomplete`; the exporter refuses to silently omit missing media. Schema-v1 projects remain supported through the existing project migration/normalization path before they are packaged or after they are decoded.

## Import lifecycle

`restoreEditableProjectPackage()` performs the following local transaction-like sequence:

1. Decode and validate the archive.
2. Generate collision-safe local asset ids when the destination already contains an asset with the same id.
3. Generate a new project id when the source id is already present locally.
4. Rewrite layer asset references and portable storage keys.
5. Save every binary asset, then save the project record.
6. Create preview object URLs and open the restored project.
7. Delete newly written assets and revoke URLs if a later write fails.

The current editor exposes `Import .bendpkg` from the entry screen and `Download editable project` from the editor. Standalone BEND still uses ordinary local export for PNG/video; it does not show a non-functional host button.

## Interchange boundary

The package is the editable source handoff. A host should keep it alongside the rendered video and poster, but it should not attempt to interpret Pixi state or BEND's internal IndexedDB records. See [HOST_INTEGRATION_API.md](HOST_INTEGRATION_API.md) for the paired rendered-media contract.
