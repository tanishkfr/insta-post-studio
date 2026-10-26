# Type tool

A static website (no build step, no server code) with two tools:

- **Type library** (`fonts.html`): set text in standard and open-source fonts, change weight, push the edges around.
- **Custom type** (`custom.html`): draw a pattern or upload an image, fill letters with it, blend serif / mono / script, stretch and slant. Export PNG or OTF.

## Files

All files sit in the same folder (no subfolders), so they upload to GitHub in one drag and drop.

| File | What it is |
| --- | --- |
| `index.html` | Start page |
| `fonts.html` | Type library page |
| `custom.html` | Custom type page |
| `style.css` | Design system and all page styles |
| `sliders.js` | Shared slider component (recommended-range tracks) |
| `fonts.js` | Type library logic |
| `fonts-data.js` | Open-source fonts packed as base64 (about 5 MB, generated) |
| `script.js` | Custom type logic |
| `vercel.json` | Vercel config (clean URLs: /fonts instead of /fonts.html) |

## Run locally

Open `index.html` directly, or serve the folder:

    python3 -m http.server 8000

then visit http://localhost:8000

## Deploy on Vercel

The repository root must contain `index.html` (as it does when you upload these files directly).

- Dashboard: New Project, import the repo, leave Framework Preset as "Other", leave Build Command and Output Directory empty.
- CLI: run `npx vercel --prod` from inside this folder.

A `404 DEPLOYMENT_NOT_FOUND` page means the URL points at a deployment that was deleted or
never existed. Open the project in the Vercel dashboard and use its current domain, or redeploy.

## Notes

- Custom type loads its serif, monospace and script faces from Google Fonts, and OTF export loads
  opentype.js from cdnjs, so those features need an internet connection.
- Open-source fonts are credited in the app (Typothèque of ESA le 75, Fonderie Download).
