# Third-party notices and source attribution

Studio 2.0 is a private integration workspace. It preserves source code from four upstream repositories. Upstream licence status must be resolved with the authors before any public distribution or commercial use.

## Insta-post (`tools/legacy`)

- Source: <https://github.com/nithilaprakash18/Insta-post> at `3eac3c7f5228e8324c6b245eb3011b86762b1d25`
- Files: Image editor (`janya.html`), Vector editor (`arnav.html`), Generate workspace (`generator.html`), legacy shell and builder.
- Licence: **none declared in the pinned repository**. The upstream README explicitly states that no licence is set and that the authors' permission is required for `janya.html` and `arnav.html`.
- Action: retain author attribution; obtain written permission before public release.

## Shapes (`tools/shapes`)

- Source: <https://github.com/rajshekharbasu/shapes> at `08fea0e00d43f2b955f34e6e341c4f2aaba427ca`
- Licence: **no LICENSE file in the pinned repository**. Treat as all rights reserved until clarified with the author.
- Runtime dependencies retain their own licences in the installed package tree (Three.js MIT, React MIT, three-bvh-csg MIT, and others reported by the upstream lockfile).

## Typography (`tools/typography`)

- Source: <https://github.com/anushkaaaajain/Online-Type-Tool> at `7a7fcfbcb97d4defc402f41da723c95b6de735ac`
- Licence: **none declared in the pinned repository**.
- Bundled font data (`fonts-data.js`) and on-screen credits are preserved unchanged. The upstream README credits the Typothèque of ESA le 75 and Fonderie Download. Custom Type also loads Google Fonts at runtime and opentype.js from cdnjs for OTF export.
- Action: keep font credits and upstream README; validate font redistribution rights before public release.

## BEND (`tools/bend`)

- Source: private repository <https://github.com/tanishkfr/Bend> at branch `polish/phase-8.1.1-ui`, commit `7f2d69c272d2a4607ff45f2575c650ac3b6cfb43`.
- Licence: private upstream project, all rights reserved unless separately agreed.
- Preserved notices: `tools/bend/THIRD_PARTY_NOTICES.md` and `tools/bend/docs/OSS_AUDIT.md`.
- Runtime packages retain their upstream licence files when dependencies are installed. Notable: PixiJS (MIT), Mediabunny (MPL-2.0).

## Vendored adapter dependencies

The derived Studio adapter pages use local copies so specialized exports remain deterministic without cdnjs:

- **JSZip 3.10.1** — MIT — <https://stuk.github.io/jszip/>. Used by the preserved Image layered-ZIP export.
- **opentype.js 1.3.4** — MIT — <https://opentype.js.org/>. Used by the preserved Custom Type OTF export.
- **@types/opentype.js** — MIT — TypeScript declarations used by host tests only.

Copies live in `apps/studio/public/vendor/`. The original standalone Image/Custom Type pages keep their upstream cdnjs script references. These notices do not change the unresolved licence status of the imported Legacy/Typography source repositories.

## Studio host and contracts

New Phase 0–2 host/contract code is part of this private repository. No public licence is granted by this document.

## Rule for future phases

Do not remove attribution, licence files, font credits or third-party notices from imported sources. Resolve licensing before making the combined application public.
