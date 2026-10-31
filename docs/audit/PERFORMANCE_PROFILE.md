# Performance profile

Status: incomplete. Windows 10.0.26300, Node 24.13.0, AMD Ryzen 7 7840HS, 16 logical processors and 15.2 GiB reported RAM. At the prior verified `c94ce6a` audit, the full host Chromium suite took 4.7 minutes, the six-source portability journey 24.1 seconds, and two production BEND browser tests 6.5 seconds. These are full test durations, not individual operation latency or a benchmark. Host and BEND production builds reported main JS bundles around 1,093 kB and 1,566 kB respectively before gzip; bundle size alone does not establish a performance defect.

Cold and warm load, each editor, publish, export, import, memory and BEND operation timings with repeated samples remain unmeasured. No performance optimization is justified by the evidence gathered here.

## 2026-10-31 real-browser navigation sample

Chromium 156.0.8078.4 headless, Playwright 1.64.1, Windows 10.0.26300; Ryzen 7 7840HS, 16 logical CPUs, 15.2 GiB RAM. Local Vite development server, fresh browser context, empty project, no imported assets. Timing is from click to the existing editor readiness helper, not an isolated renderer measurement. Ten consecutive opens per tool yielded (first; range of subsequent nine), milliseconds:

| Tool | First | Subsequent range |
| --- | ---: | ---: |
| Image | 1375 | 725–862 |
| Vector | 573 | 317–412 |
| Type | 635 | 388–473 |
| Shapes | 615 | 437–564 |
| Generate | 355 | 258–356 |
| Video | 757 | 554–650 |

One cold-context navigation to the landing page took 472 ms and keyboard entry to a visible empty artboard took 106 ms, with reduced motion and forced colors emulated. These are single samples, include automation overhead and are not repeated cold benchmarks. The loaded-project, publication, export, package and video timings requested in the brief remain unmeasured individually. The previous 57-second portability journey in this run is an end-to-end test duration, not a per-operation timing. No bottleneck is established by these figures.
