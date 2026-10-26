# Source Manifest — Studio 2.0 Phase 0

Imported on **2026-10-26**. These commits are the frozen non-regression baseline for all later phases.

## Pinned sources

| Tool | Repository | Branch | Commit | Imported path |
| --- | --- | --- | --- | --- |
| Image | [nithilaprakash18/Insta-post](https://github.com/nithilaprakash18/Insta-post) | `main` | `3eac3c7f5228e8324c6b245eb3011b86762b1d25` | `tools/legacy/image/janya.html` |
| Vector | [nithilaprakash18/Insta-post](https://github.com/nithilaprakash18/Insta-post) | `main` | `3eac3c7f5228e8324c6b245eb3011b86762b1d25` | `tools/legacy/vector/arnav.html` |
| Generate | [nithilaprakash18/Insta-post](https://github.com/nithilaprakash18/Insta-post) | `main` | `3eac3c7f5228e8324c6b245eb3011b86762b1d25` | `tools/legacy/generate/generator.html` |
| Legacy shell | [nithilaprakash18/Insta-post](https://github.com/nithilaprakash18/Insta-post) | `main` | `3eac3c7f5228e8324c6b245eb3011b86762b1d25` | `tools/legacy/upstream/` (byte-identical upstream root) |
| Shapes | [rajshekharbasu/shapes](https://github.com/rajshekharbasu/shapes) | `main` | `08fea0e00d43f2b955f34e6e341c4f2aaba427ca` | `tools/shapes/` |
| Typography | [anushkaaaajain/Online-Type-Tool](https://github.com/anushkaaaajain/Online-Type-Tool) | `main` | `7a7fcfbcb97d4defc402f41da723c95b6de735ac` | `tools/typography/` |
| BEND | [tanishkfr/Bend](https://github.com/tanishkfr/Bend) (private) | `polish/phase-8.1.1-ui` | `7f2d69c272d2a4607ff45f2575c650ac3b6cfb43` | `tools/bend/` |

BEND CI reference: [run 40325071662](https://github.com/tanishkfr/Bend/actions/runs/40325071662) — conclusion `success`, branch `polish/phase-8.1.1-ui`, head SHA `7f2d69c272d2a4607ff45f2575c650ac3b6cfb43`, verified through the GitHub API on import day. The repository is private; access is via the authenticated `tanishkfr` account.

## Verification performed

1. Public remote heads were checked with `git ls-remote`; each head equalled the required SHA.
2. BEND's branch head and CI run were checked through the GitHub API; both matched the required commit.
3. Each source was cloned at its pinned head into a clean staging directory, without importing `.git`.
4. File trees in `tools/shapes`, `tools/typography` and `tools/bend` were compared by SHA-256 against the staging clones after the documented excludes: **0 differing files**.
5. The three legacy tool files and `upstream/index.html` were confirmed byte-identical by SHA-256:

| File | SHA-256 |
| --- | --- |
| `janya.html` | `ACDD62C499A4FCD3C372918BC6AD96F3E0A6DFA6D583A1BAB74B4AFBF9EC9BF6` |
| `arnav.html` | `24633B7233A5E7AD088D1E4423AACD21D838F215654F838170077328C1CB5AA2` |
| `generator.html` | `8D8FBEF2ECD9A2F74F790652A3F46E567CA5AE97552011B117EC9CA790E00A6D` |
| `index.html` | `D9FCA40E82D962E552F1D13DBE6E2B5CAF2E7BC308A10135D42A0F6AEBD84EB6` |

6. The installed Shapes `package-lock.json` gained npm `peer` metadata during installation; it was restored to the committed upstream bytes so the baseline stays exact.
7. A clean clone of the private remote was tested after push: root `npm ci`, contracts typecheck, host build, host tests and dev server all passed. All four legacy hashes matched, and Shapes/Typography/BEND again showed **0 file differences** against the pinned staging clones. `.gitattributes` marks `tools/**` as byte-preserving so Windows line-ending conversion cannot alter imported baselines.
8. **Phase 1 re-check:** `tools/legacy/vector/arnav.html` remains byte-identical at SHA-256 `24633B7233A5E7AD088D1E4423AACD21D838F215654F838170077328C1CB5AA2`. `git diff phase-0/foundation -- tools` is empty. The automated `sourceIntegrity` unit guard enforces this hash. No other imported tool source was modified in Phase 1.

Full upstream histories are **not** included. History and provenance remain recoverable through the commit SHAs above and the original repositories. No original files were deleted or rewritten.

## Excluded material

| Source | Excluded |
| --- | --- |
| All | `.git/` |
| Shapes | `node_modules/`, `dist/` |
| Typography | no generated dirs in pinned tree |
| BEND | `node_modules/`, `dist/`, `output/`, `test-results/`, `playwright-report/`, `blob-report/`, `coverage/`, `.audit-sources/`, `.playwright-mcp/`, `.vercel/` |
| Everywhere | caches, local env files, secrets, local editor settings |

The excluded BEND `output/` tree is generated verification evidence, not source; it is also gitignored upstream. Required BEND fixtures under `tests/fixtures/` **are preserved**. Docs, tests, configs, lockfiles, notices and assets are preserved.

## Runtime isolation

| App | React version | Own lockfile | Own dependency tree |
| --- | --- | --- | --- |
| Studio host | 19.1 | root `package-lock.json` | root `node_modules` |
| Shapes | 18.3 | `tools/shapes/package-lock.json` | `tools/shapes/node_modules` |
| BEND | 19.1 | `tools/bend/package-lock.json` | `tools/bend/node_modules` |
| Legacy/Image/Vector/Generate | none | none | static |
| Typography | none | none | static |

The root workspace contains only `apps/*` and `packages/*`. Tools are deliberately excluded so npm cannot hoist or resolve conflicting React versions into a shared runtime.

## Re-import commands

```powershell
git clone https://github.com/nithilaprakash18/Insta-post.git legacy
git -C legacy checkout 3eac3c7f5228e8324c6b245eb3011b86762b1d25

git clone https://github.com/rajshekharbasu/shapes.git shapes
git -C shapes checkout 08fea0e00d43f2b955f34e6e341c4f2aaba427ca

git clone https://github.com/anushkaaaajain/Online-Type-Tool.git typography
git -C typography checkout 7a7fcfbcb97d4defc402f41da723c95b6de735ac

git clone --branch polish/phase-8.1.1-ui https://github.com/tanishkfr/Bend.git bend
git -C bend checkout 7f2d69c272d2a4607ff45f2575c650ac3b6cfb43
```

## Licensing / attribution

No public licence file exists in the Insta-post, Shapes or Typography pinned trees. The legacy README explicitly asks for the tool authors' permission. Font credits and BEND third-party notices are preserved. See [`../THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md) before any public distribution.
