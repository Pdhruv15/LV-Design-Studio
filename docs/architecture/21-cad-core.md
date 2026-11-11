# 21 — Design CAD core
[← Index](00-index.md) · [Integration map](99-integration-map.md)

## 1. What it does

Design CAD is the app's own 2D drafting screen for floor plans. It opens the architect's DWG or DXF plan, shows it, and lets the engineer draw and annotate on top of it. The core covers:

- **Reading drawings.** A Rust engine built on the acadrust library and compiled to WebAssembly reads DWG (R13–2018) and DXF. (WebAssembly = compiled code that runs inside the app window, so no other CAD program is needed.) It flattens model space into line segments, fills, texts and snap points. Blocks, colours (ByLayer, ByBlock, index, true colour), linetypes and hatches are resolved, and external references are listed (`engines/cad-reader/src/doc.rs` `CadDoc::new`).
- **Canvas.** The canvas draws the plan and the drawn work, and handles zoom and pan, grips and snaps (`src/components/cad/CadCanvas.tsx`).
- **Command line.** About 150 typed commands with aliases, each linked to a tool or a page action (`src/components/cad/cadCommands.ts` `CAD_COMMANDS`).
- **Drawing tools.** Line, polyline, rectangle, polygon, circle, arc, ellipse, revision cloud, point, text, notes (MTEXT), leader, keynote, room tag, north arrow, hatch, dimensions (aligned, linear, continue, baseline, radius, diameter, angular).
- **Editing tools.** Move, copy, rotate, mirror, scale, stretch, trim, extend, offset, fillet, chamfer, break, join, explode, array, divide, measure, draw order, match properties, CROP (cut a block along an outline), and erase (also for the architect's objects).
- **Blocks and attributes.** Block definitions, inserts, attribute definitions (ATTDEF), attribute edit, attribute export (ATTEXT), the Blocks palette with a library folder, and recent blocks (`src/model/cadBlocks.ts`, `src/model/cadBlockLibrary.ts`, `src/model/cadAttributes.ts`).
- **Measuring.** Distance, area, and room area found from the walls around a clicked point (`src/model/cadMeasure.ts`, `src/model/cadBoundary.ts`).
- **Clipboard, view history and references.** Copy and paste between drawings (`src/model/cadClipboard.ts`), ZOOM Previous (`src/components/cad/cadViewHistory.ts`), and external references: overlay or attach, clip, bind on save (`src/model/cadRefs.ts`, `src/components/cad/CadRefs.tsx`).

- `Project.cadSketch` (drawn objects)
- `cadErased` (handles of architect objects erased in the app)
- `cadBlockDefs`
- `cadLayerStyle` and `cadLayerFile`
- `cadRefs`
- `cadPlanUnits`
- `cadTextStyles`, `cadDimStyles`, `cadPointStyle` and `cadPatterns`

These fields are defined in `src/types.ts` (:594–620). A DWG is written only when the user runs SAVE, SAVE AS or SAVEDWG, and it goes to a separate copy (`src/components/cad/CadPage.tsx` `writeCopy` :905).

## 2. Files, components, functions and stores

("Store" = the place the app keeps the project in memory. Here that is the `project` object; each change goes through `onChange` to the app's project state, which keeps the undo history.)

| File | Kind | Key functions or components | What they do |
|---|---|---|---|
| `src/components/cad/CadPage.tsx` (3556 lines) | screen | `CadPage`, `change` (:629), `run` (:2295), `act` table (:2524), `writeCopy` (:905), `removeSelected` (:881), `copyClip`/`pasteClip` (:1592/:1601), `exportAs`, CROP handler (:860) | The whole Design CAD page: command dispatch, tools, every edit, save and export. |
| `src/components/cad/CadCanvas.tsx` | screen | `CadCanvas` (sketch drawing :462–525) | Draws the plan segments, drawn items (hatches, leaders with arrowheads, dashed cable routes), devices with their symbol shapes, wiring, grips and snaps. |
| `src/components/cad/cadCommands.ts` | model | `CAD_COMMANDS`, `CadAction`, `cadCommand`, `toolAlias` | Command and alias table. |
| `src/components/cad/cadState.ts` | store | `useCad`, `CadTool`, `SavedCopy`, `rememberPath`, `pathOfPlan`, `rememberedDrawing`, `markDirty` | Open drawing tabs, tool, toggles, the session-only saved-copy map, and drawing paths in local storage. |
| `src/components/cad/cadFileMenu.ts` | screen | `cadFileMenu`, `planLevel`, `setPlanLevel` | Plans per level, Replace plan, Units menu. |
| `src/components/cad/cadPrompt.ts`, `CadCommandLine.tsx`, `CadDynInput.tsx` | screen | prompts, command line, dynamic input | Command-line UI. |
| `src/components/cad/CadDialogs.tsx` | screen | text, dimension and point style dialogs; DIMSTYLE import (:234, `accept=".dxf"` :249) | Style dialogs. |
| `src/components/cad/CadLayerManager.tsx`, `CadProperties.tsx`, `CadQuickSelect.tsx`, `ColourPicker.tsx` | screen | layer palette, properties palette, QSELECT | Layer and object properties. |
| `src/components/cad/CadRefs.tsx`, `refFiles.ts` | screen | `useCadRefs`, `bound` (:100), `readRefFile`, `readSheetRefs` | External references: attach, clip, bind on save; references read for sheets. |
| `src/components/cad/BlocksPalette.tsx`, `AnnotatePanel.tsx`, `SketchEditPanel.tsx`, `CadTextEdit.tsx`, `CadNoteEdit.tsx`, `CadTabs.tsx`, `CadSaveAs.tsx`, `CadDraftSettings.tsx` | screen | panels and dialogs | Blocks palette, annotation, edit options, in-place text editing, tabs, Save As, drafting settings. |
| `src/components/cad/cadClipboardStore.ts` | store | `putClip`, `getClip` | Clipboard copy kept in memory, plus the system clipboard. |
| `src/components/cad/cadViewHistory.ts` | store | `rememberView`, `previousView` | ZOOM Previous history, per open drawing, in memory. |
| `src/model/cadSketch.ts` | model | `shapesOut` (:549), `ShapeOut` (:548), `blockDefsOut`, `pointStyleOut`, `dimOf`, `snapPoints`, `itemAt`, `typedPoint`, `trayLine` | Drawn-object geometry, and conversion to what the engine writes. |
| `src/model/cadEdit.ts` | model | `trim`, `extend`, `offset`, `fillet`, `chamfer`, `breakAt`, `join`, `explode`, `mirrored` (:270), `scaled`, `stretched`, `arrayRect`, `arrayPolar`, `gripMoved` | Edit operations on drawn objects (pure functions). |
| `src/model/cadBlocks.ts` | model | `CadBlockDef`, `blockDefsOf`, `withBlockDef`, `expandInsert`, `explodeInsert`, `attributePlacements` | Block table per drawing file. |
| `src/model/cadBlockLibrary.ts` | model | `defFromGeometry` (:43), `defFromPieces` (:59), `loadRecentBlocks`, `pushRecentBlock` | Blocks from a library drawing, or from an architect's block; recent blocks. |
| `src/model/cadAttributes.ts`, `cadText.ts`, `cadMtext.ts`, `cadDims.ts`, `cadHatch.ts`, `cadAnnotate.ts`, `cadPoints.ts`, `cadStyles.ts`, `dxfDimStyles.ts` | model | `leaderItems`, `textCorners`, `toDxfMtext`, `readDxfDimStyles` (:60), `currentTextStyle` | Annotation objects and styles. |
| `src/model/cadClipboard.ts` | model | `clipPayload` (:46), `parseClip` (:111), `itemOf` (:77), `KINDS` (:30), `pastedItems`, `withPasted` | Clipboard payload: written, then read back and checked. |
| `src/model/cadErased.ts` | model | `erasedOf`, `withErased`, `restoredErased`, `shownView` | Architect objects erased in the app, by handle. |
| `src/model/cadPlans.ts` | model | `replacePlan` (:38), `moveKey` (:49), `withLevelPlan` | Which drawing is each level's plan; replacing a plan with a new revision. |
| `src/model/cadUnits.ts`, `cadMeasure.ts`, `cadBoundary.ts` | calc | `planUnits`, `planScale`, `withPlanUnit`, `drawingUnits`, `areaOf`, `roomAround` (:68) | Drawing units, distances, areas, room outline from walls. |
| `src/model/cadLayerState.ts`, `cadLayerStyle.ts`, `cadLayerTemplates.ts`, `cadColours.ts`, `cadProps.ts`, `cadQuickSelect.ts`, `cadDrawOrder.ts`, `cadCrop.ts`, `cadView.ts`, `cadDraft.ts`, `cadExports.ts`, `cadDraw.ts` | model | layer states, styles, templates in the library, object properties, draw order, CROP, view stack, drafting settings, export lists, dash and hatch drawing | Supporting models. |
| `src/model/cadDrawing.ts` | model | `CadItem`, `parseReaderAnswer` (:174), `planFromDrawing` (:109), `curvePoints` | Plan entities from the simpler reader (CLI and Floor plan window). |
| `src/engines/cad/cadEngine.ts` | engine | `openDrawing` (:190), `CadView`, `drawingWithDevices` (:291), `explodeObjects` (:305), `dxfToDwg` (:317), `refGeometryOf`, `readRefGeometry` | TypeScript side of the engine: open, save, explode. |
| `src/engines/cad/cadOps.ts`, `cadWorker.ts` | engine | `engineOps`, `answerCall` | Runs the engine in a worker thread (or in the page as a fallback). |
| `src/engines/cad/reader.ts` | engine | `readCadDrawing`, `MAX_DRAWING_BYTES` | The simple plan reader, used by the CLI. |
| `engines/cad-reader/src/doc.rs` | engine (Rust) | `CadDoc::new` (:603), `Builder::entity_drawn` (:299), `describe` (:514), `entity_of` (:940), `define_block` (:1027), `with_additions` (:1051), `export_dxf` (:1126), `dwg_bytes` (:1135), `explode_objects` (:1151) | View reader, picking and snapping, and the DXF/DWG writer. |
| `engines/cad-reader/src/doc/explode.rs` | engine (Rust) | `explode` | Exact pieces of an object, for CROP and the Blocks palette. |
| `engines/cad-reader/src/lib.rs` | engine (Rust) | `item` (:65), `read`, `read_json`, `readDrawing` | Second, simpler reader: plan entities as JSON. |
| `electron/cadFile.cjs` | desktop | `readDrawingFile`, `readDrawingBytes`, `listDrawingFolder`, `engineBytes`, `MAX_BYTES` | Reads drawing files in the main process. |
| `electron/main.cjs` | desktop | `files:saveBinary` (:307), `files:overwriteBinary` (:319), `chosenDrawings` | Save dialog, and Save over a copy chosen this session. |

## 3. Inputs — where its data comes from

| Data | From module (ID) | File + function |
|---|---|---|
| Drawing bytes (open dialog, reopen by path, sample plans) | 34-electron-desktop | `electron/cadFile.cjs` `readDrawingBytes`; `src/engines/cad/cadEngine.ts` `chooseDrawing`, `reopenDrawing`, `sampleDrawing` |
| Project object (sketch, layers, blocks, styles, references, erased handles) and undo | 02-project-storage | `src/App.tsx:1621` `onChange={(next) => setProject(next, { step: true })}` |
| Levels and buildings (which level each plan belongs to) | 04-building-load-assessment | `src/model/cadPlans.ts` `withLevelPlan`, `src/components/cad/cadFileMenu.ts` `planLevel` |
| Devices placed, LV points, boards, circuit wiring, trays and cable routes | 22-cad-electrical | `src/components/cad/CadPage.tsx` `writeCopy` (uses `placed`, `wiring`) |
| Layouts and viewports (LAYOUT, MV and MS commands on the same page) | 23-cad-sheets-plot-titleblock | `src/components/cad/CadPage.tsx` `layoutCmd` (:733) |
| Feeders (for the CIRCUIT attribute in ATTEXT, and for cable routes) | 06-network-sld-editor | `src/components/cad/CadPage.tsx` `exportAs` → `attributeRows(..., project.feeders)` |
| Layer mapping templates (kept in the library) | 32-component-database | `src/model/cadLayerTemplates.ts` `pushLibrary` |

## 4. Outputs — where its results go

| Result | Used by module (ID) | File + function |
|---|---|---|
| Closed outlines, blocks with attributes, picking, wall segments | 22-cad-electrical | `src/model/cadViewPlan.ts` (`view.outlines()`), `src/components/CadLoadsDialog.tsx` (`view.blocks()`) |
| Drawn trays and cable routes (lengths to schedules) | 22-cad-electrical, 19-cable-tray-containment | `src/model/cadPlanSchedules.ts` (reads `cadSketch`) |
| Drawn work, blocks and references printed on plan sheets | 23-cad-sheets-plot-titleblock | `src/docs/planLayout.ts:262` `expandAll(sketchOf(...), blockDefsOf(...))`, `src/model/drawingSet.ts:504–507` |
| DXF → DWG conversion for exported SLD sheets | 24-drawings-sld-sheets | `src/components/SldExportDialog.tsx:55`, `src/components/docs/sheetRender.tsx:305` → `dxfToDwg` |
| Plan read by the CLI and MCP tools | 31-headless-cli-mcp | `src/headless/cadTools.ts` `readPlan` → `readCadDrawing` (lib.rs reader) |
| CAD fields in revision and change classes | 26-revisions-changes | `src/model/changeClass.ts:36`, `src/model/revisions.ts:151–152` |
| Saved DWG/DXF copy, PDF/PNG of the view, WBLOCK DXF, device, cable and attribute lists (Excel/CSV) | user file system | `src/components/cad/CadPage.tsx` `writeCopy`, `exportAs` |

## 5. User flow — from button click to result

1. **Open.** OPEN or Plans → a level calls `cadFileMenu.openFor`, then `chooseDrawing` or `reopenDrawing` (`cadEngine.ts`). The app starts a worker (`startEngine`), and `engineOps.open` builds a `CadDoc` (Rust `CadDoc::new`): model-space entities become segments, fills, texts and a snap grid. `useCad.open` adds a tab and remembers the path in local storage (`rememberPath`).
2. **Pick a level and units.** `setPlanLevel` → `withLevelPlan`. Units: `withPlanUnit`. Both go through `change`, so each is one undo step.
3. **Type a command.** `CadCommandLine` sends the text to `CadPage.run` (:2295). Typed points and options for the tool in use are read first, then layout commands, DRAWORDER, CLAYER, then `cadCommand(c)`. A tool command calls `cad.setTool(tool)`. An action runs `act[action]()`.
4. **Draw or edit.** Canvas clicks go to `CadPage.click`. Each tool builds a `SketchItem` (via `cadSketch.ts` / `cadAnnotate.ts`) or edits one (`cadEdit.ts`). Then `addSketch`, `updateSketch` or `removeSketch` → `change(next, message)` → `onChange` → `setProject(next, { step: true })`, which is one undo step (⌘Z).
5. **Erase or crop the architect's objects.** `removeSelected` → `withErased(project, file, handles)`. CROP → `explodeObjects` (Rust `explode_objects`) → `cropPieces` → new sketch items plus the original handle erased. The view hides erased objects through `view.erase` → `shownView`.
6. **Save.** SAVE / SAVE AS → `writeCopy`:
   - `shapesOut(sketch)`, `blockDefsOut(defs)`, `pointStyleOut`, the wiring as polylines, the wiring tags as texts, and the bound references (`xr.bound()`) are collected;
   - `drawingWithDevices` → the worker's `save` → Rust `export_dxf` / `export_dwg` → `with_additions`: the original bytes are read again, erased handles removed, and shapes and devices added;
   - `saveBinaryAt` (dialog) or `files:overwriteBinary` (a copy chosen this session) writes the file.

## 6. Linked to (working connections)

- 22-cad-electrical receives outlines, blocks (with CROP-erased ones left out, `CadLoadsDialog.tsx:44`), wall segments and drawn trays/routes.
- 23-cad-sheets-plot-titleblock prints the sketch with block inserts expanded and the printing references (`planLayout.ts:262`, `refFiles.ts` `readSheetRefs`).
- 24-drawings-sld-sheets uses the same engine for DXF → DWG (`dxfToDwg`).
- 26-revisions-changes lists every CAD field (`changeClass.ts:36`, `revisions.ts:151`).
- Engine memory is freed per drawing: a worker per drawing (`cadOps.ts`, `useCad.close`).



---

*Public summary: describes what the module does and how it connects. The engineering review of open issues is kept separately.*
