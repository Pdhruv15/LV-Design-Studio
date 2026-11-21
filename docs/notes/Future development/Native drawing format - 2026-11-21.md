# Native drawing format – faster than DWG or DXF (2026-11-21)

Status: **D1 and D2 approved 2026-11-21** ("go with your recommendation"): Phase 0 (measure) first, then Phase 1 (a hidden cache of decoded drawings), as a chunked package. D3 (name) and D4 (where drawn work lives) wait for Phase 2. The user asked that sending a drawing as DWG or DXF stays: it does. Save As DWG / DXF is unchanged in every phase.

The user asked whether the app could have its own drawing format that is faster and more efficient than DWG or DXF, and built for the future.

## Short answer

Yes, for the app's own work. No, as a replacement for DWG and DXF when files are exchanged.

- Architects send DWG and DXF, and authorities and contractors expect them back, so Save As DWG / DXF stays (DWG is the default from PR 743).
- A native format can still open much faster and carry what DWG and DXF cannot: boards, circuits, devices and wiring as real records instead of tags on drawing objects.

## Why DWG and DXF are slow for this app

- **DWG** is compact but hard to read. It packs data at bit level, compresses its sections, and needs a full decoder. In the app, every open goes DWG bytes → Rust reader (WASM) → JSON text → `JSON.parse` → `CadDrawing` (`src/engines/cad/reader.ts`).
- **DXF** is plain text, several times larger than the same DWG. Every number has to be read from text.
- **Both are made for exchange, not for this app's data.** Electrical links ride as tag strings on objects (`feeder:`, `board:`, `route:`, `place:`, `tray:`… in `src/model/cadDrawing.ts`).
- **The project file is rewritten in full on each save.** What you draw, the devices and the wiring live in the `.lvds` project, which is pretty-printed JSON (`electron/projectFiles.cjs`, `JSON.stringify(…, null, 2)`). A large drawn plan makes every save larger.

Measured today on the test plans (average of 20 opens):

| File | Size | Open | Reader decode | JSON step |
|---|---|---|---|---|
| `plan-2018.dwg` | 26.5 KB | 2.05 ms | 1.66 ms | 0.04 ms |
| `plan-tagged.dxf` | 89.4 KB | 2.45 ms | 1.95 ms | 0.04 ms |

About 80 % of an open is the decode, so the gain is in **not decoding the DWG again**, not in removing the JSON step. These plans are small. A large real drawing has to be measured first (Phase 0), such as the 3.16 MB drawing that froze on 2026-11-17.

## What a future-focused native format looks like

1. **Geometry as binary number arrays.** Points are stored as little-endian 64-bit floats, the same precision as DWG. They load straight into memory with nothing to parse.
2. **Tiles and a spatial index.** The drawing is cut into tiles with a box index, so the part on screen opens first and the rest follows. Memory follows what is shown.
3. **Electrical data as real records.** Boards, circuits, devices, wiring, cable routes and trays, with their links to the load schedule and the SLD. No tag strings.
4. **Incremental and safe saves.** Only what changed is written. A save either completes or leaves the old file, so no half-written file is possible.
5. **Versioned and open.** It has a format version, readers skip parts they do not know (so it stays forward compatible), and the layout is documented in the repo so the files stay readable for decades.
6. **Received drawings kept as received.** The architect's DWG is never changed. The native file keeps a decoded copy keyed by the source file's hash and rebuilds it when the architect sends a new revision.
7. **Exchange stays standard.** DWG / DXF out (DWG default), PDF for sheets, and IFC (ISO 16739) with the BIM link later. 3D waits for that link, as agreed.

## Ready for AI tools

The user asked which choice fits best with the growing AI industry (2026-11-21). An AI tool works best when it gets meaning, not raw drawing data:

- **The records carry the meaning.** Boards, circuits, devices, routes and their links are stored as plain JSON, with a published JSON Schema in the repo. Any AI tool can read them, and anything an AI writes can be checked against the schema before it is kept. Raw coordinates stay binary, for speed: an AI tool gains little from reading them.
- **AI tools ask the app, not the file.** The app's own MCP server (`src/headless/mcp.ts`, bring-your-own-AI, already offers `cad_plan`) and the headless CLI get tools that read and change these records. The app's own checks still run, so an AI tool cannot leave a drawing the app cannot open.
- **Open standards for everything else.** DWG / DXF for drawings, PDF for sheets, and IFC (ISO 16739) with the BIM link. IFC is the open model that BIM and analysis tools share.
- **Offline and private.** A drawing goes to an AI tool only when the user connects one.

This fits the chunked package best. Its JSON parts can be read with no special tool, and its binary tiles stay fast. A database file would let an AI tool query records with SQL, but through the MCP server it does not need to.

## Container: two choices

| | Chunked package (recommended to start) | Single database file |
|---|---|---|
| What | A zip container: manifest (JSON), geometry tiles (binary arrays), index, electrical records | One SQLite file: tables for objects, layers, blocks, electrical records; built-in box index |
| New dependency | None (`jszip` is already used) | SQLite as a native module or about 1 MB of WASM |
| Open speed | Fast: arrays load as they are | Fast: reads only what is asked for |
| Save | Rewrites changed tiles; the whole package is written to a temporary file and swapped | True incremental save with transactions; strongest against crashes |
| Inspect | Any unzip tool | Any SQLite tool; its makers plan support to 2050 |
| Best for | The decoded-drawing cache and moderate drawings | Very large drawings and frequent saves |

## Phases

- **Phase 0. Measure.** Time each step (decode, index, first paint, save) on three large drawings, including one near the 3.16 MB case. Keep the results in this note. No change in the app.
- **Phase 1. Decoded-drawing cache.** After the first open, keep a binary copy of the decoded drawing beside the project and use it while the source file's hash matches. This is invisible to the user, with no UI change, and gives the open speed-up first.
- **Phase 2. Native drawing file.** Move what is drawn, the devices, the wiring and the layouts out of the project JSON into the native file, with incremental saves. The project file keeps only a link to it. Old projects open as before and move over on their next save.
- **Phase 3. Exchange.** Save As DWG / DXF from the native file (as today), then IFC export with the BIM link.

## Decisions for the user

- **D1.** Start with Phases 0 and 1 (measure, then a hidden cache), or go straight to a native drawing file? (Recommended: 0 and 1 first. They are safe, and they show the real gain before any format is fixed.)
- **D2.** Container: the chunked package (no new dependency) or a single database file? (Recommended: chunked package for Phase 1. Decide again at Phase 2 with the Phase 0 numbers.)
- **D3.** A name and file extension for the native drawing file (for example `.lvplan`).
- **D4.** Where the drawn work lives from Phase 2 on: in the native drawing file (recommended, so project saves stay small) or in the project file as today?
