# Design CAD: the drawing file's own layouts, phase 2

Phase 1 (v2.093) reads a DWG/DXF file's paper-space layouts and shows them as tabs on every drawing. Each tab shows the paper, its printable area, its trim marks, the paper-space lines and texts, and the model through each viewport. These layouts are shown as they were saved, and saving the drawing keeps them (Rust test `paper_space_layouts`).

Waiting for a decision before building:

1. **+ on any drawing.** Make a new layout inside the file itself, written to DWG/DXF with `add_layout` and a viewport. Today **+** makes the project's plan sheets, and only on a drawing tied to a level.
2. **Edit a file layout.** Rename, copy, delete, move and Page setup on a file layout tab, written back when the drawing is saved.
3. **Viewports.** Pick, move and resize a viewport frame, set VPSCALE and VPLOCK, and work in the model through it (MS/PS). Today a file layout's viewports are only shown.
4. **Plot a file layout.** Plot or PDF a file layout with its own page setup (paper, margins, plot style table).
5. **What phase 1 leaves out:** layers frozen in a viewport, non-rectangular (clipped) viewports, colours and lineweights on the paper (shown black on white), fills and hatches on the paper, and text fonts and widths.

Proposal: do 3 first (most used), then 1 and 2 together, then 4.
