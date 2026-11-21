# Drawing size limit in Design CAD (2026-11-22)

Status: **proposed**, waiting for the user's decisions L1–L3. Nothing is built.

Step 3 of the drawing speed work (see `Native drawing format - 2026-11-21.md`). Steps 1–2 are done: PR 752 made opening up to 3.6 times faster, and PR 754 removed an unused reader.

## Today

- The engine draws a drawing as straight line pieces (segments); arcs, circles and text become many short pieces. It stops at **3,000,000 segments** (`MAX_SEGMENTS`, `engines/cad-reader/src/doc.rs`).
- Past that, the rest of the drawing is not shown, picked or snapped to. The command line says "(very large: part of it shown)" (`src/components/cad/cadState.ts`).
- The canvas groups segments by layer, colour, linetype and screen tile, and draws only the tiles on screen (`lineBatches`, `src/model/cadDraw.ts`). Zoomed in, a big drawing stays quick. Zoomed out to the whole drawing, every segment is drawn on each pan and zoom.

## Measured (Apple M2, test drawings from `tests/performance/cadOpen.perf.ts`, the limit raised for the test)

| Test drawing | Segments in full | Shown today | Engine memory in full | Native drawing step |
|---|---:|---:|---:|---:|
| 1 MB DWG | 1.48 M | all | 82 MB | 117 ms |
| 3 MB DWG | 4.47 M | 67 % | 247 MB | 343 ms |
| 10 MB DWG | 15.05 M | 20 % | 832 MB | 1,142 ms |

- Each segment costs about 55 bytes in the engine (coordinates, layer, colour, object, linetype, its pick-index entries). The window keeps another 24 bytes for drawing it.
- The engine is 32-bit WebAssembly, so it has 4 GB at most. Working space comes on top of the figures above; the test run peaked at 3.7 GB of process memory for the 10 MB drawing.
- The app's two sample plans have 92–122 segments per KB (DXF). The synthetic DXF has about 180. A real 3 MB DWG therefore probably has 2–5 million segments, at or above today's limit. The 3.16 MB drawing that froze on 2026-11-17 may have reached it.
- Not measured: how long one zoomed-out frame takes with 5–15 million segments. That needs a canvas. Under the repo rules it means the user trying a drawing in the app, or an approved hidden test window with test drawings only.

## Options

- **(1) Raise the limit to 8,000,000 segments.** About 440 MB in the engine plus 190 MB in the window for a drawing that size, and a 3 MB DWG would be shown in full. Zoomed-out frames slow down on very large drawings (not measured).
- **(2) Option 1 plus a simpler zoomed-out view (recommended).** When zoomed out, skip segments shorter than half a screen pixel and draw small arcs as fewer pieces. Zoomed in, nothing changes. Snapping and picking always use every segment. Frames stay quick at any zoom.
- **(3) No fixed limit**, through tiles that load the part on screen. This is part of the native `.lvplan` file (Phase 2), not a quick change.

In every option the message stays when a drawing is still cut off. Its wording could say how much is shown (for example "62 % shown"); that is a wording change, so decision L3.

## Decisions for the user

- **L1.** Option 1, 2 or 3? (Recommended: 2 now, 3 with the native file.)
- **L2.** Can a hidden test window time zoomed-out frames with the test drawings only (no app, no user files, offline)? (Recommended: yes, before raising the limit.) Otherwise the user tries a large drawing in the app after the build.
- **L3.** Say how much is shown in the "part of it shown" message? (Recommended: yes.)
- **Question:** when the 3.16 MB drawing was opened, did the command line say "(very large: part of it shown)"?
