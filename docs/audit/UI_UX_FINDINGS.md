# UI and UX findings

The incumbent system is documented in `docs/phase-5a/DESIGN_SYSTEM.md`: Instrument Sans, white surfaces, seafoam and restrained borders. There is no root or Studio `DESIGN.md`. A systematic visual, keyboard, responsive and physical-device audit remains outstanding. No score or complete accessibility claim is justified yet.

Observed Chromium captures at 1440×900 and 390×844 show the artboard and workspace controls within the viewport; the compact layout exposes Layers and Inspector separately. The captured views are static evidence, not proof of keyboard, touch, screen-reader, zoom or all-editor behavior. Other required sizes were captured by the same journey but have not all been visually assessed.

Chromium capture inspection covered populated Canvas at 1440×900, 1024×768, 900×700 and 390×844. These show the intended artboard and controls without a blocking overlap in those states; this does not cover all panels, all tools or touch interaction. The landing navigation browser tests cover Vector entry, history and safe departure, not every requested accessibility and motion condition.
