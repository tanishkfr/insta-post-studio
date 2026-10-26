# Generative Art Studio

A step-by-step flow for composing Instagram posts and carousels:
**Landing → how many posts → Text → Image → Vector → Generate.**

Open `index.html` in a browser (or serve the folder: `python3 -m http.server`).

## How it is put together
- `src/shell.html` – landing screen, format choice, step bar and the handoff code.
- `src/apps/janya.html` – Image tool (embedded unchanged in an iframe).
- `src/apps/arnav.html` – Vector tool (embedded unchanged in an iframe).
- `src/generator.html` – post-generation workspace (patched at build time to accept assets).
- `build.py` – inlines the three apps into `index.html` as `srcdoc` iframes.
  Rebuild with `python3 build.py`.

The shell reads the Image tool's `#cv` canvas (`toDataURL`) and the Vector tool's `#stage svg`
(`XMLSerializer`) when you press **Use in Generate**, and again on entering Generate, so
changes made in the tools carry over.

## Known limitations
- The Generate step uses a basic rule-based layout engine; the candidate-scoring engine is not built yet.
- "Claude" generation mode and "Export spec" only work inside claude.ai.
- No licence is set. Add one before others reuse the code, and get your teammates' permission for `janya.html` and `arnav.html`.
