# Native drawing format – faster than DWG or DXF (2026-11-21)

Status: **D1 and D2 approved 2026-11-21** ("go with your recommendation"): Phase 0 (measure) first, then Phase 1 (a hidden cache of decoded drawings), as a chunked package. Later the same day the user approved the rest as recommended ("ok go with recommendation"): the AI-ready layout below, D4 = drawn work in the native drawing file, and D3 = `.lvplan` as the working name (to confirm when Phase 2 starts). The user asked that sending a drawing as DWG or DXF stays: it does. Save As DWG / DXF is unchanged in every phase.

Phase 2 plan, step by step: [Native drawing file - Phase 2 plan - 2026-11-22](Native%20drawing%20file%20-%20Phase%202%20plan%20-%202026-11-22.md) (waiting for the user's OK).

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

## Phase 0 results (2026-11-21)

Measured with `tests/performance/cadOpen.perf.ts` (run with `npm run bench -- cadOpen`) and a native timing test in `engines/cad-reader` (`cargo test --release --lib time_open_steps -- --ignored --nocapture`, drawings kept with `CAD_BENCH_DUMP=<folder>`). Machine: Apple M2, Node 24. The drawings are plan-2018.dwg plus a grid of rooms (walls, doors, a column, a text and two light blocks each), written as DWG and DXF from the same shapes.

Design CAD open (WebAssembly, as the worker does it; median of 5):

| | 1 MB DWG | 3 MB DWG | 10 MB DWG | 10 MB DXF (82.5 MB) |
|---|---:|---:|---:|---:|
| Whole open | 0.94 s | 2.09 s | 3.18 s | 4.07 s |
| Decode and draw (`new CadDoc`) | 0.65 s | 1.47 s | 2.43 s | 3.30 s |
| Drawing summary (`info`) | 0.25 s | 0.53 s | 0.61 s | 0.61 s |
| Segment arrays, outlines, blocks | 0.04 s | 0.08 s | 0.15 s | 0.16 s |

The same steps natively, split (median of 3):

| | 1 MB DWG | 3 MB DWG | 10 MB DWG |
|---|---:|---:|---:|
| Read the DWG | 57 ms | 179 ms | 649 ms |
| Turn it into segments, snaps and the index (`tessellate`) | 344 ms | 742 ms | 1,010 ms |
| Drawing summary (`info`) | 142 ms | 298 ms | 357 ms |

What this means:

1. **The app's own drawing step costs more than reading the DWG**: two to six times more natively. A cache of the raw DWG data would save little. The useful cache keeps the finished result.
2. **The finished result is large**: about 82 MB for a 1 MB DWG, 178 MB for 3 MB and 268 MB for 10 MB (segments, snap points, the pick index, texts, objects; before any compression).
3. **Reading it back is fast**: copying the segment arrays took 4–8 ms, and the file check (SHA-256) 0.4–4 ms for DWG. Reading 180 MB from an SSD adds about 0.1–0.2 s; a hard disk would add seconds.
4. **The floor plan path** (`electron/cadFile.cjs`) reads 0.12–1.40 s and parses 0.02–0.20 s of JSON that is 3.8 times the DWG.
5. **There is a limit of 3,000,000 segments** (`MAX_SEGMENTS`, `engines/cad-reader/src/doc.rs`). The 3 MB test drawing reaches it. Past it, the app says "very large: part of it shown". Tiles in the native format remove that limit later.
6. DXF is about 8 times larger than DWG for the same drawing, and opens 12–35 % slower.
7. Repeated opens without freeing the engine ran out of WebAssembly memory on the 3 MB DXF. The app frees the engine when a drawing closes. This is worth watching for the freeze of 2026-11-17, but it is not proven to be its cause.

## Phase 1 choice (waiting for the user)

- **(a) Finished-result cache.** Reopening an unchanged drawing would take about 0.1–0.3 s instead of 1–3 s. It costs 80–270 MB of disk for each large drawing, kept in the app's cache folder (not the project folder, so cloud sync is not loaded), capped at 2 GB with the oldest copies removed first. It is used only for drawings that take over 0.5 s to open. A first open is not faster.
- **(b) Faster drawing step.** Profile `tessellate` and `info` and speed them up in the engine. This helps every open, including the first one of a new revision, and uses no disk. The gain is not known until profiled.
- **Recommended: (b) first, then (a)** for large drawings only.

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
