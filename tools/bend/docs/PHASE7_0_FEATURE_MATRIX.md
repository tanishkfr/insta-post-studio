# BEND. Phase 7.0 — Feature Verification Matrix

Legend:

- **PASS** — exercised in the final deployed preview and/or a deterministic unit test with the stated outcome; a control merely being present does not count.
- **PARTIAL** — implementation exists and at least one path was verified, but not every preset/mode/browser path was exercised end-to-end.
- **UNVERIFIED** — source-derived only; no runtime evidence.
- **BLOCKED** — requires an absent external system or hardware.

Final deployed preview: `https://bend-9b07efmjr-tanishkfrs-projects.vercel.app`  
Evidence: `output/evidence/phase7-0/` (not uploaded to Vercel)  
Deployed source digest: `e4f8cae96f62e0b0f640f9ce75a4b07f0e62301a088721d1dbe9b056599dbf83`

## 1. Procedural generators

| Feature | UI entry | Underlying implementation | Preview / export evidence | Status |
|---|---|---|---|---|
| Signal Field system | Add → Signal Field; generator library | `signalField.ts`, generator registry, Pixi shader/fragment | Deployed generator + PNG; 10s Project A; performance probe | PASS |
| Signal presets Pulse / Drift / Current / Fracture | Signal Field preset group | `SIGNAL_FIELD_PRESETS` | Fracture, Current exercised; all 4 UI selectable; registry unit coverage | PARTIAL |
| Liquid system | Add → Liquid | `liquid.ts`, fixed-step CPU simulation, texture presentation | Nebula performance preview; PNG path; stateful seek unit tests | PASS |
| Liquid presets Ink Spill / Vortex / Tidal / Nebula | Liquid preset group | `LIQUID_PRESETS` | Nebula exercised; all 4 UI selectable; deterministic-unit coverage | PARTIAL |
| Flow system | Add → Flow | `flow.ts`, shader + CPU reference | Project B, blend/mask tests, performance | PASS |
| Flow presets Threads / Current / Orbit / Drift | Flow preset group | `FLOW_PRESETS` | Orbit exercised; all 4 UI selectable | PARTIAL |
| Refraction system | Add → Refraction | `refraction.ts`, shader + CPU reference | Added in keyframe/effect stack test; registry unit coverage | PARTIAL |
| Refraction presets Pool / Glass / Prism / Mirage | Refraction preset group | `REFRACTION_PRESETS` | UI selectable; no dedicated exported visual per preset | UNVERIFIED |
| Seed input / normalize | Signal seed / generator seed | `normalizeSeed`, generator normalize | Deployed seed edits change canvas; deterministic unit test | PASS |
| Randomize seed | Randomize button | `randomSeed` / crypto | Source and UI; generator tests | PASS |
| Generator duration | Duration value | generator normalize + `updateProjectDuration` | Project A 10s composition | PASS |
| Seeded variation | Create a variation → Strength/Scope/Seed/Vary | `randomizeLayerParameters` | Deployed Vary + Undo; unit animated-keyframe scaling | PASS |
| Generator palette/select params | Palette select | generator registry | UI; exported variation spot checks | PARTIAL |
| Generator animation controls | ◆ / MOD per parameter | AnimatedRangeControl + animation engine | Project A mask/scale keys; unit wave/generator properties | PASS |

## 2. Effects

| Feature | UI entry | Underlying implementation | Evidence | Status |
|---|---|---|---|---|
| Temporal stack add/remove/reorder | Effects tab | `registry.ts`, `TemporalEngine`, Inspector | All four added individually; pair stack; reorder guard; deployed | PASS |
| Effect bypass | Stack eye / effect toggle | `effect.enabled` | Bypassed Channel Delay stayed bypassed through preset change | PASS |
| Motion Echo | Temporal library | `renderMotionEcho`, `motionEchoSampleTimes` | Long Exposure + Ghost Trail in Project C; deployed export | PASS |
| Motion Echo presets Ghost Trail / Long Exposure / Stutter / Afterimage | Preset group | registry presets | Ghost Trail and Long Exposure exercised; all UI selectable | PARTIAL |
| Time Slice | Temporal library | `renderTimeSlice` | Temporal Fracture preset selected and previewed; deployed | PASS |
| Time Slice presets Rolling Time / Time Stretch / Temporal Fracture / Wave Slice | Preset group | registry presets | Temporal Fracture exercised | PARTIAL |
| Channel Delay | Temporal library | channel sampling + `combineChannels` | Signal Drift + RGB Stutter; pair export; deployed | PASS |
| Channel Delay presets Chromatic Ghost / RGB Stutter / Signal Drift / Temporal Split | Preset group | registry presets | RGB Stutter + Signal Drift exercised | PARTIAL |
| Frame Feedback | Temporal library | chronological replay, checkpoints, ping-pong state | Recursive Drift selected; single-effect preview; terminal guard | PASS |
| Frame Feedback presets Infinite Tunnel / Residue / Smear / Recursive Drift | Preset group | registry presets | Recursive Drift exercised | PARTIAL |
| Frame Feedback terminal-order contract | Stack move/UI warning | `isSupportedTemporalStack` | Deployed move-up rejected with message; unit | PASS |
| Wave Displacement | Effects tab / Wave section | `waveDisplacement.ts`, shader | Project C and temporal stack still; deployed | PASS |
| Wave parameter persistence bounds | Wave sliders | `clampWaveDisplacement` + animation definitions | Unit ranges aligned; deployed controls | PASS |
| Effect presets preserve bypass | Preset group | Inspector preset handler | Deployed regression test | PASS |
| Effect stack clipboard copy / paste append / replace | Effect stack clipboard group | `temporal/clipboard.ts` | Deployed copy + paste append across layers; unit animation remap | PASS |
| Effect variation | Variation → Vary stack/selected | `randomizeLayerParameters` effects target | Unit deterministic/bounded; UI present | PARTIAL |
| Four-effect pathological stack | Add all four | Recursive temporal sampling | Not exported; warning + slow-render Stop preview implemented. Preview can take minutes. | PARTIAL / KNOWN LIMIT |
| Wave after temporal stack ordering | Inspector copy | renderer order | Source contract and rendered outputs consistent; no direct pixel-diff ordering test | PARTIAL |

## 3. Layer editing and compositing

| Feature | UI entry | Evidence | Status |
|---|---|---|---|
| Import MP4/WebM | Add video / Add local video | H.264/AAC and VP9/Opus; Chrome/Edge/Firefox; WebKit actionable codec error | PARTIAL (WebKit codec) |
| Add procedural layer | Add menu | New layers append on top; deployed tests | PASS |
| Select layer | Canvas / timeline | Timeline selector and canvas hit test | PASS |
| Visibility | Hide/Show layer | Missing-media hidden export and canvas update | PASS |
| Lock layer | Lock/Unlock | Controls disable; source/unit; no full browser matrix | PARTIAL |
| Mute layer | Mute/Unmute | Muted range export confirmed video-only | PASS |
| Reorder layers | Inspector raise/lower; timeline drag | Inspector order, timeline reversed mapping; unit/source | PARTIAL |
| Duplicate layer | Duplicate button | Inspector action; source | PARTIAL |
| Delete layer | Remove / Delete key | Undo active-layer test; source | PASS |
| Transform X/Y | Slider/value/canvas drag | Deployed direct manipulation and Project C reframe | PASS |
| Scale | Slider/value/corner handles | Project A/C; direct-manipulation unit | PASS |
| Rotation | Slider/value/rotation handle | Unit snap; source; preview | PARTIAL |
| Anchor | 9-point anchor grid | Unit center preservation; source | PARTIAL |
| Flip X/Y | Flip buttons | Deployed direct-manipulation/source | PARTIAL |
| Crop | Crop disclosure, presets, canvas crop | Project C 4:5 crop; unit crop geometry/cancel | PASS |
| Fit / Fill | Fit mode group | Project C Fill; deployed | PASS |
| Color brightness/contrast/saturation/hue | Appearance disclosure | Project C adjustments; deployed rendered output | PASS |
| Color bypass/reset | Appearance | Source + controlled state; not separately pixel-diffed | PARTIAL |
| Blend Normal | Default | Deployed baseline frames | PASS |
| Blend Multiply | Blend mode select | Deployed mask/blend test hash changed | PASS |
| Blend Screen | Blend mode select | Project B, Project A, mask test | PASS |
| Blend Add / Overlay | Blend mode select | UI selectable/source evaluate; no dedicated exported comparison | PARTIAL |
| Rectangle mask | Mask shape | UI/source; no dedicated deployed visual | PARTIAL |
| Ellipse mask | Mask shape | Deployed animated mask, Project A | PASS |
| Gradient mask | Mask shape | UI/source; no dedicated deployed visual | PARTIAL |
| Mask invert | Invert mask | Deployed mask test aria state + preview | PASS |
| Mask feather / falloff / angle | Mask controls | Deployed feather value; Project A; source | PASS |
| Animated mask parameters | Mask sliders + ◆ | Width keyframes retained across off/on; deployed | PASS |
| Mask keyframe retention when off | Mask None | Deployed regression test | PASS |
| Composition clear canvas | Empty state | Deployed routing/core | PASS |

## 4. Animation and creative iteration

| Feature | UI entry | Evidence | Status |
|---|---|---|---|
| Set/remove keyframes | ◆ controls/timeline | Deployed keyframe groups; Project A/C; unit | PASS |
| Hold / linear / ease / cubic Bézier | Motion → Selected keyframes | Unit easing; deployed Snappy cubic preset | PASS |
| Easing curve preview | SVG preview | Source | PARTIAL |
| Auto-Key | Auto-Key toggle | Project A/C; deployed mask/keyframe flows | PASS |
| Modulators (sine/triangle/pulse/smooth-noise/ramp) | MOD editor | Deployed add sine + multiply; unit determinism | PARTIAL (advanced fields not exposed) |
| Multi-keyframe selection | Shift/Ctrl click | Deployed 2-key group selection | PASS |
| Group move/copy/paste/duplicate/delete | Timeline group toolbar | Deployed copy/paste; group move/duplicate/delete unit | PARTIAL |
| Keyframe tracks expand/collapse | Timeline expander | Deployed keyframe lanes | PASS |
| Motion recipes apply / append | Motion → recipes | Deployed Signal Breakdown replace + Recursive Dream append | PASS |
| Recipe library built-ins | Recipe list | 6 built-ins visible; apply paths | PASS |
| Local recipe save/import/export/duplicate/rename/delete | Recipes actions | Source + unit storage; not all exercised in final browser | PARTIAL |
| Recipe cue | Motion recipe detail | Static Canvas2D cue; application uses shared compositor | PASS (deliberate replacement of live second renderer) |
| Compare original | Hold to compare | Deployed hash differs while held | PASS |
| Seeded variation | Vary | Deployed generator and unit effects | PASS |
| Effect stack clipboard | Copy/paste | Deployed cross-layer append | PASS |
| Replace source | Replace source | Unit duration policies; source; no final browser journey | PARTIAL |
| Relink missing source | Missing-media banner/Inspector | Deployed relink with preserved trim | PASS |
| Shared media ownership | Duplicate/delete cleanup | Unit/shared-media and deployed project library | PASS |

## 5. Timeline

| Feature | UI entry | Evidence | Status |
|---|---|---|---|
| Scrub | Ruler/track lanes | Deployed seek; performance scrub | PASS |
| Play/pause | Timeline/canvas/space | Deployed playback, cross-browser | PASS |
| Clip move | Drag/keyboard | Source; historical manual; not in final automated suite | PARTIAL |
| Source trim In/Out | Inspector values / trim handles | Deployed trims and exports | PASS |
| Snapping | Implicit while dragging | Unit canvas snapping; timeline snap source only | PARTIAL |
| Timeline zoom | Zoom buttons | Source; no final automated journey | PARTIAL |
| Keyframe lanes | Expand row | Deployed | PASS |
| Loop enable/start/end | Loop bar | Deployed keyboard + export range | PASS |
| Loop playhead wrap | Playback | Source/unit; manual evidence; no final deployed loop-play video | PARTIAL |
| Loop handle drag | Region handles | Historical manual; keyboard verified | PARTIAL |
| Named markers | — | Not implemented in current schema | NOT PRESENT |
| Loop/range preview | Export dialog range | Deployed range export | PASS |
| Range frame count/duration | Export readout | Deployed 0.5–1.5 / 1.5–?? outputs, ffprobe | PASS |

## 6. Exports

| Feature | UI entry | Evidence | Status |
|---|---|---|---|
| PNG still | Export → Still frame | Deployed 1080×1350 PNG in Chrome/Edge/Firefox/WebKit | PASS |
| Full-duration video | Export → Video | Deployed 2s MP4; creator 10s/4s MP4 | PASS |
| Partial-range video | Loop/work range | Deployed 1.0s/1.5s outputs; ffprobe | PASS |
| High/Canvas quality | Canvas option | Deployed 1080×1350 / 1080×1920 | PASS |
| Preview quality | Preview option | Deployed 720×900/720×1280 outputs | PASS |
| MP4/H.264 | Automatic | Deployed MP4 `avc1`; audio AAC | PASS |
| WebM fallback | Automatic second format | Code path present; tested browsers selected MP4 codecs when encoders available | PARTIAL |
| WebCodecs unavailable | Automatic error | Injected fault: explicit error; no false success; reload recovered | PASS (for error handling) |
| Source audio inclusion | Topmost visible source policy | Deployed AAC included in full/range/Project C; metadata checked | PASS |
| Muted / video-only | Mute + export | Deployed muted range WebM/MP4 file has no audio stream | PASS |
| Audio policy messaging | Dialog/result | Deployed “Source audio included” / “Video-only” messages | PASS |
| Range outside audio source | Dialog | Code now reports overlap; not separately exercised | PARTIAL |
| Cancellation | Cancel export | Deployed cancel then retry; no stale download | PASS |
| Dialog close / Escape cancellation | Close/Escape | Source handles abort; cancel button tested | PARTIAL |
| Retry | Retry export | Deployed cancel retry and encoder-fault recovery (reload) | PASS |
| Repeated exports | Multiple | Three preview exports; no growing heap trend | PASS |
| Empty/corrupt output guard | Internal | Encoded file size guard + MediaRecorder removal | PASS |
| Seamless mirrored loop | Loop range + Seamless repeat | Deployed 3.0s output, no audio, result policy text | PASS (mirrored, not mathematically periodic) |
| Mirrored boundary | Export | First vs last frame SSIM 0.707; frame 1 vs 89 SSIM 0.956 | PASS with documented semantics |
| Exporting video in Firefox | Browser | Not run end-to-end in final deployed full suite | UNVERIFIED |
| Exporting video in WebKit | Browser | No VideoEncoder/MediaRecorder; clear unsupported error expected | PARTIAL |
| PNG after hidden missing layer | Export | Deployed hidden-layer PNG succeeded | PASS |

## 7. Projects, storage, and portability

| Feature | UI entry | Evidence | Status |
|---|---|---|---|
| New project | Topbar / Project Library | Deployed library test | PASS |
| Open project | Project Library | Deployed library + duplicate test | PASS |
| Rename project | Topbar / library | Topbar rename and library rename source; export names | PARTIAL |
| Duplicate project | Project Library | Deployed duplicate; shared media | PASS |
| Delete project | Project Library | Deployed delete current; original restored | PASS |
| Autosave | Local save status | Reload after import/trim; save coordinator unit | PASS |
| Restore after reload | Automatic | Chrome/Edge/Firefox deployed; source project reload | PASS |
| Save failure/quota | Injected quota | Deployed failure banner; Try again; recovery after fault removal | PASS |
| Storage unavailable | IndexedDB blocked | Source states recovery copy; no final blocked-IDB browser test | PARTIAL |
| Undo/redo | Topbar/keyboard | Unit; active-layer reconciliation; deployed Vary undo | PASS |
| Shared media | Duplicate/delete | Deployed library; unit cleanup | PASS |
| Missing media | Banner/Inspector | Deployed delete-blob, hide-export, relink | PASS |
| `.bendpkg` export | Source button | Deployed package with video/effects; byte signature checked | PASS |
| `.bendpkg` import | Project Library | Deployed fresh context restore; media/layers/effects | PASS |
| Reimport identical package | Package import | Asset IDs unchanged; no duplicate local assets | PASS |
| Corrupt/incompatible package | Import | Unit/package tests; UX error path | PARTIAL |
| Legacy schema v1 | Automatic | Unit migration/media/generator | PASS (unit) |
| Pre-5.5 fields added | Automatic | Deployed mutate/delete + reload + normalized save | PASS |
| Origin-scoped storage disclosure | Project Library copy | Text explicitly explains preview vs production origin | PASS |
| Local recipes persistence | Motion recipes | Source; storage tests limited | PARTIAL |
| Large media/quota limits | Internal | Package limits unit; multi-MB fixtures imported | PARTIAL |

## 8. Browser, integration, accessibility, performance

| Area | Evidence | Status |
|---|---|---|
| Chrome 155.0.8059.85 | Import, decode, seek, play, trim, generator, PNG, MP4/AAC, full suite | PASS |
| Edge 156.0.4314.42 | Same smoke paths on actual Edge engine | PASS |
| Firefox 157.0 | Import/decode/seek/play/trim/generator/PNG; WebGL warnings remain | PARTIAL |
| WebKit 27.2 (Playwright) | Generator/PNG; MP4/WebM codec unavailable → actionable error; video export unsupported | PARTIAL |
| Touch/mobile | Pixel 7 emulation, 390 CSS px, touch add/open controls | PASS (emulated) |
| Direct routes/refresh | `/`, `/studio`, `/studio/edit`, `/integration` | PASS |
| Static assets/MIME/cache | Hashed JS/CSS; immutable cache; missing asset 404 plain text | PASS |
| Local test suite | Maintained Studio 2.0 Chromium + Firefox smoke | PASS |
| Local host harness | Add BEND layer, edit, update, preserve placement/opacity/playback | PASS (local mock only) |
| Real group toolset | Not present; Phase 6B remains blocked | BLOCKED |
| Cross-origin embed/bridge | Not implemented/verified | BLOCKED |
| Axe serious/critical | Zero on editor, effects, motion, export, library, forced colors | PASS |
| Keyboard/focus/dialogs/sliders | Deployed journey | PASS |
| Reduced motion / forced colors | Deployed | PASS |
| 200% zoom | 720×450 CSS viewport equivalent, no overflow | PARTIAL (equivalent, not native zoom automation) |
| Real screen reader | Not run | UNVERIFIED |
| Physical touch hardware | Not available; emulation only | UNVERIFIED |
| GPU warnings | Chrome/SwiftShader zero in tested workflows; Firefox warnings listed | PARTIAL |
| Performance | Chrome AMD 780M measured; heavy nested temporal stack warning | PARTIAL |
| Memory/resource lifecycle | No progressive heap growth after repeated preview exports | PASS |
| Creative acceptance A/B/C | All three generated and exported on deployed origin | PASS |

## 9. Phase 7.0 acceptance requirements

| ID | Requirement | Status | Note |
|---|---|---|---|
| P7-01 | Local work safely preserved | PASS | Durable pre/post snapshots outside repo; verified file hashes and Git status |
| P7-02 | Git/source state reconciled or explicitly isolated | PASS | Local working tree is an explicit superset; remote 5.4 files present; no commit/merge |
| P7-03 | Correct Vercel project and build configuration | PASS | Project ID verified; Vite/Node 24/npm ci/build/dist |
| P7-04 | Preview deployment from current source | PASS | `dpl_6JKYbspnxjrEiBw8xgNqfp9UU1K7`, READY, preview |
| P7-05 | Direct URL and refresh routing | PASS | Deployed route + refresh suite |
| P7-06 | Static assets and lazy loading | PASS | Hashed assets, exporter lazy, 404 for missing assets |
| P7-07 | Complete feature inventory | PASS | This matrix + implementation report |
| P7-08 | Four generators and all presets | PARTIAL | Systems pass; visual pass for subset of each preset set |
| P7-09 | Every effect and stack operation | PARTIAL | All effects exercised individually; some presets untested; pathological nested stack limited |
| P7-10 | Blend modes and masks | PARTIAL | Ellipse/multiply/screen deeply tested; rect/gradient/Add/Overlay source/UI only |
| P7-11 | Keyframes, easing, modulation, recipes | PASS | Deployed group editing, easing, sine modulation, recipe append/replace |
| P7-12 | Creative variation and source replacement | PARTIAL | Variation pass; Relink pass; Replace Source unit/source only |
| P7-13 | Timeline, loops, range playback | PARTIAL | Scrub/trim/loop/range/keyboard pass; clip drag/snap/zoom source only; no named markers |
| P7-14 | MP4/WebM import and playback | PASS | H.264/AAC and VP9/Opus; WebKit codec limitation explicit |
| P7-15 | Full-quality video export | PASS | 1080×1920/1350 H.264 outputs inspected |
| P7-16 | PNG export | PASS | 1080×1350 and 1080×1920 PNGs inspected |
| P7-17 | Range export and audio correctness | PASS | Range metadata, audio present/muted, seamless no audio |
| P7-18 | Cancellation and recovery | PASS | Cancel/retry, fault injection, empty-output guard |
| P7-19 | Save/reload/project management | PASS | Deployed library CRUD and reload; quota recovery |
| P7-20 | Editable `.bendpkg` portability | PASS | Fresh-context round trip, media/assets, identical reimport |
| P7-21 | Browser compatibility and fallbacks | PARTIAL | Chrome/Edge/Firefox pass core; WebKit playback codec and encoder gaps |
| P7-22 | Rendering correctness | PASS | SSIM + visual inspection; no false export success |
| P7-23 | GPU warnings investigated | PARTIAL | Chrome/SwiftShader clean in tested workflows; Firefox warnings remain |
| P7-24 | Performance and resource lifecycle | PARTIAL | No leak; heavy nested stacks measured and warned |
| P7-25 | Accessibility and responsive usability | PARTIAL | Automated/keyboard/zoom-equivalent pass; no manual screen-reader session |
| P7-26 | Maintained browser regression suite | PASS | New local + deployed suites, CI tiers |
| P7-27 | Three creator acceptance projects | PASS | A/B/C exported from deployed origin and inspected |
| P7-28 | Documentation and release readiness | PASS | Five Phase 7.0 documents + deployment evidence |
