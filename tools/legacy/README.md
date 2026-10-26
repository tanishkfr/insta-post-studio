# Legacy baseline (Insta-post)

Imported from:

- Repository: <https://github.com/nithilaprakash18/Insta-post>
- Branch: `main`
- Commit: `3eac3c7f5228e8324c6b245eb3011b86762b1d25`
- Imported: 2026-10-26

## Layout

```text
upstream/          The original checked-in repository root
  index.html       Prebuilt combined shell (Image + Vector + Generate in srcdoc iframes)
  shell.html       Original shell source
  build.py         Original single-file builder
  README.md        Original project README
image/janya.html   Verbatim standalone Image editor
vector/arnav.html  Verbatim standalone Vector editor
generate/generator.html  Verbatim standalone Generate workspace
```

The three tool copies are byte-identical to their upstream root files. The files in `upstream/` are byte-identical to the upstream checked-in files. No functionality was rewritten or removed.

## Serve

From the repository root:

```bash
npm run serve:legacy
```

- Combined app: <http://127.0.0.1:4173/upstream/>
- Image: <http://127.0.0.1:4173/image/janya.html>
- Vector: <http://127.0.0.1:4173/vector/arnav.html>
- Generate: <http://127.0.0.1:4173/generate/generator.html>

## Known build discrepancy

`build.py` and the upstream README expect this source layout:

```text
src/shell.html
src/apps/janya.html
src/apps/arnav.html
src/generator.html
```

Those paths do not exist in the pinned repository. Instead, the completed combined output is checked in at the repository root as `index.html`; `shell.html`, `janya.html`, `arnav.html` and `generator.html` are also at the root.

Consequences:

- Running `python build.py` from the pinned root fails because `src/apps/janya.html` cannot be opened.
- The checked-in `index.html` already contains the post-build hook patches, so it serves as the runnable legacy baseline.
- Studio 2.0 does not repair or adopt `build.py`. If the combined shell is ever rebuilt, the paths and patches must be audited against the generated file.

The separate `generate/generator.html` copy is the unpatched standalone generator. The combined shell contains a build-patched generator with an asset handoff listener. Both are preserved so that the original and integrated legacy behavior remain recoverable.
