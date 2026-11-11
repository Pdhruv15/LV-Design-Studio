# 24 — Drawings screen: SLD sheets, riser diagrams, DB riser, drawing set & register, DXF/SVG export
[← Index](00-index.md) · [Integration map](99-integration-map.md)

## 1. What it does

The module turns the network (boards, feeders, buildings) into a numbered **drawing set** and exports it.

- **Drawing set** (`Project.drawingSet`, type `DrawingSet` in `src/model/drawingSet.ts`): a list of sheets saved in the project file. Each sheet (`DrawingSheet`) has a kind:
  - `system` — part of the SLD (the panels ticked for the sheet; a feeder to a panel drawn elsewhere becomes "To X — sheet N");
  - `board` — one DB's circuit diagram (optionally with its load schedule under it);
  - `riser` — a building riser in one of three styles: busbar trunking / cable chain (blank `riserStyle`), individual feeders (`feeders`), or boards counted by level over several sheets (`byLevel`, the "DB riser");
  - `earthing`, `earthRiser`, `earthFloor` — earthing drawings (drawn by module 09);
  - `plan` — lighting / power / ELV / containment plan sheets (drawn by module 23);
  - `legend` — the set's legend, abbreviations and general notes on one sheet.
- **Sheet creation**: automatic sets (`autoSheets` — one per MDB, or overview + one per SMDB; `sheetsByCount` — at most n panels per sheet keeping branches together), or sheets added by hand.
- **Numbering** (`renumber`): own sequences per type — `E-SLD-`, `E-RSR-` (risers), `E-ERT-` (earthing), `E-LTG-/E-PWR-/E-ELV-/E-CNT-` (plans); prefix, start, digits, suffix are set per set.
- **Revision control**: `issueSheets` records an issue (transmittal T-001 …), moves each sheet to its next revision (`nextRev`: A→B, P1→P2), stores a fingerprint (`issuedHash`, from `sheetHash`) so a later change can be flagged ("changed since it was issued").
- **Output** (`src/components/docs/sheetRender.tsx`): every sheet is drawn off-screen from the **current** design (`evaluateProject`, not the stored calculation run), framed with the title block (`buildSldSheetHtml`), then saved as one PDF, PDF per sheet, DXF per sheet (R12, `buildSheetDxfPages`), DWG (DXF converted by the CAD engine), a ZIP of everything, or sent to a printer.
- **Drawing register**: built from the actual sheets of the set (`registerRows(set, …)`), as PDF (`registerHtml`), as the first page of the set PDF, or as Excel (`buildRegisterWorkbook`), with the issue history.
- **Riser views** (`RiserView`): working views of the three riser styles with "Add to sheet".
- **Busbar riser form** (`buildRiserForm`, `RiserFormView`): the DEWA "Bus bar riser — details of connected load / max. demand" table.
- **Other drawing exports kept outside the set**: the "Export SLD drawing" dialog (`SldExportDialog`, the SLD as on screen, own title block in `Project.drawing`) and the board-wise sheets of Design ▸ Board (`boardSheetPages`, numbered `E-DB-` on the fly).

Terms used below: *store* = the project object kept in memory and saved to the `.lvds` file; *fingerprint / hash* = a short code computed from what a sheet draws, used to detect change; *SVG* = the vector picture format the diagrams are drawn in; *DXF R12* = the plain CAD exchange format written by `src/docs/dxf.ts`.

## 2. Files, components, functions and stores

| File | Kind | Key functions or components | What they do |
|---|---|---|---|
| `src/model/drawingSet.ts` | model | `DrawingSheet`, `DrawingSet`, `setOf`, `renumber` (:138), `drawable`, `addBoardSheets`, `addLegendSheet`, `addEarthingSheet`, `addRiserSheet` (:203), `addDbRiserSheets` (:208), `addEarthRiserSheet`, `earthSheetGaps`, `autoSheets` (:275), `sheetsByCount` (:300), `sheetOfBoard`, `sheetRefs`, `fromSheetLabels`, `sheetProject` (:356), `scaleOn`, `autoSize`, `nextRev`, `sheetRev`, `issueSheets` (:430), `moveSheet`, `filterSheets`, `statusColor`, `SHEET_HASH_V`, `shownValues` (:535), `sheetHash` (:551), `sheetChecks` (:571), `publishState` (:181), sheet templates (`loadSheetTemplates`, `applyTemplate`), `addSheet`, `movePanelToSheet` | The whole sheet-set data model and its rules (numbering, issue, fingerprints, checks, paper choice). |
| `src/model/dbRiser.ts` | model | `dbRiserLayout` (:78), `dbRiserOffered` (:72), `dbRiserSummary` (:329), `dbRiserTitles` (:359), `refLines`, `rowsTotal`, `cablesAtGap` | "Boards by level" riser: floors as rows, typical floors on one row, board counts per kind, pages and sheet breaks. |
| `src/model/riserMockup.ts` | model | `addG10RiserMockup` (:22) | Adds a demo G+10 building, 11 SMDBs, 22 feeders, a busbar riser and a riser sheet to the **current** project. |
| `src/components/docs/DrawingsView.tsx` | screen | `DrawingsView`, `withEarthing`, tabs Sheets / Layout / Title block & numbering / Issues | Reports → Drawings: create, filter, bulk-edit, reorder, issue and export the sheets. |
| `src/components/docs/sheetRender.tsx` | report | `renderSheet` (:44), `sheetHtml` (:165), `fullSheetInfo` (:236), `prepareSheets` (:355), `drawingSetPdfParts` (:369), `exportDrawingSet` (:384), `dxfFiles` / `dxfOf` (:268/273), `exportSheetsDxf`, `exportSheetsDwg`, `exportEverythingZip` (:323), `printSheets`, `renderDrawingSetPdf`, `SheetPreview` | Draws each sheet off-screen and builds every export. |
| `src/components/docs/SheetGrid.tsx`, `FurnitureFields.tsx`, `IssueDialog.tsx` | screen | `SheetGrid`, `FurnitureFields` | Thumbnails view, sheet furniture fields, issue dialog. |
| `src/components/sld/SheetWorkspace.tsx` | screen | `SheetList` (:50), `SheetWorkspace` (:188), `CloudChanges` (:538), `ArrowAdd`, `CloudAdd`, `PublishDialog` (:584), `sheetOutlines` | Design CAD → Sheets: the live sheet with markups, clouds, callouts, settings; Publish with readiness checks. |
| `src/components/sld/sheetUi.ts` | screen | `useSheetUi`, `SheetActions` | Shared ribbon ↔ sheet state (markup tool, zoom). |
| `src/components/drawingView.tsx` | screen | `wheelAction`, `viewKey`, `ZoomChip`, `useSpaceHeld` | Common zoom / pan controls for all drawings. |
| `src/components/RiserView.tsx` | screen | `RiserView` | Design ▸ SLD ▸ Riser: working view of the three riser styles, Add to sheet. |
| `src/components/docs/RiserFormView.tsx` | screen | `RiserFormView` | On-screen busbar riser connected-load / MD form. |
| `src/components/SldExportDialog.tsx` | screen/report | `SldExportDialog`, `currentSvg`, `run` (:39) | Exports the SLD as on screen (PDF, SVG, DXF, DWG) with the project-level title block. |
| `src/components/PaperPreview.tsx` | screen | `pageOf`, `PaperPreview` | Paper preview of report HTML (used by Documents / Study reports). |
| `src/diagram/riserLayout.ts` | calc (layout) | `riserLayout` (:58), `U`, `ROW_H` | Busbar-trunking / cable-chain riser geometry. |
| `src/diagram/RiserDiagram.tsx` | screen/report | `RiserDiagram`, `RiserSym`, `RISER_LEGEND`, `RiserLegendSvg` | Draws `riserLayout`. |
| `src/diagram/feederRiserLayout.ts` | calc (layout) | `feederRiserLayout`, `leafSymbol` | Riser with one breaker and cable per fed board. |
| `src/diagram/FeederRiserDiagram.tsx` | screen/report | `FeederRiserDiagram`, `FEEDER_RISER_LEGEND` | Draws `feederRiserLayout`. |
| `src/diagram/dbRiserDrawing.ts` | report | `dbRiserDrawing` (:127), `dbRiserLegend` (:408), `dbRiserSheetNos` (:416) | Printable B&W SVG of each DB riser page. |
| `src/diagram/boardSheet.ts` | report | `boardSheetSvg` (:74) | String-SVG circuit diagram of one board (board-wise export only). |
| `src/docs/boardSheets.ts` | report | `boardSheetPages` (:17), `boardSheetNo`, `boardSheetHtml` | Board-wise A3 sheets numbered `E-DB-` in supply order (not part of the set). |
| `src/diagram/exportSvg.ts` | report | `printableSvg`, `printPalette` (:19), `PRINT_BLACK` (:15), `svgToDxf` (:121), `parseTransform`, `lvTag` | Live SVG → print SVG (colours mapped) and SVG → DXF primitives. |
| `src/diagram/annotations.ts` | calc | `buildAnnotations` (:60), `SHEET_LAYERS`, `DEFAULT_LAYERS` | Result labels (current, VD, fault, PF, loading) printed on the diagram. |
| `src/diagram/legendLayout.ts`, `tagPlacer.ts`, `deviceText.ts`, `svgPath.ts`, `svgDash.ts`, `dragItem.ts` | report helpers | `stringLegendSvg`, `legendHeightMm`, `placeTags`, `obstaclesFromSvg`, `devicePoles`, `deviceKind`, `pathPoints`, `dashedRuns`, `setDragItem` | Legend columns at 2.5 mm text, cable tags that avoid lines, device text, SVG path / dash conversion, palette drag state. |
| `src/docs/sldSheet.ts` | report | `buildSldSheetHtml` (:177), `sheetTitleBlock` (:63), `titleBlockOf`, `SHEET_MM`, `sheetBody`, `legendColumnFits`, `zonesOn` | Frame, title block, legend column, notes, cable schedule of a printed sheet (HTML for PDF). |
| `src/docs/sheetDxf.ts` | report | `sheetPages` (:67), `placeSvg` (:42), `buildSheetDxfPages` (:330), `SHEET_LAYERS` | Same sheet as paper-size R12 DXF with layers; overflow on continuation sheets. |
| `src/docs/dxf.ts`, `dxfFiles.ts`, `dxfLayout.ts` | report | `toDxf` (:136), `namedDxfFiles`, `uniqueDxfFiles`, `dxfExportNotice`, `textInBox`, `wrapDxfText` | DXF writer, file naming and text fitting. |
| `src/docs/drawingRegister.ts` | report | `registerRows` (:8), `registerHtml` (:15) | Register rows from the set; register PDF. |
| `src/docs/registerWorkbook.ts` | report | `buildRegisterWorkbook`, `buildTransmittalWorkbook` | Register and transmittal as Excel. |
| `src/docs/sldNotes.ts` | report | `ABBREVIATIONS`, `abbreviationsIn` (:52), `DEWA_GENERAL_NOTES` (:59) | Abbreviations found in the drawing; standard notes. |
| `src/docs/riserForm.ts` | report | `buildRiserForm` (:44) | DEWA busbar riser form rows and totals. |
| `src/model/integrity.ts` | store | `removeDanglingReferences` (:80) | Removes deleted panels from sheets, clouds and callouts. |
| `src/model/renamePanels.ts` | store | `renamePanels`, `BOARD_LIST_KEYS` | Renames board ids inside `sheet.boards` (not in titles). |

## 3. Inputs — where its data comes from

| Data | From module (ID) | File + function |
|---|---|---|
| Boards, feeders, ties, supply order, board totals and fault level | 06-network-sld-editor | `src/calc/summary.ts:boardsInSupplyOrder, boardSummary, boardTotals`; `src/calc/electrical.ts:evaluateProject, runsOf` |
| SLD and DB diagram pictures (drawn off-screen) | 06-network-sld-editor | `src/components/SystemDiagram.tsx`, `src/components/SingleLineDiagram.tsx` (via `sheetRender.tsx:renderSheet`) |
| Buildings, levels, typical floors | 04-building-load-assessment | `src/model/levels.ts:floorList, boardsWithoutLevel` (used by `riserLayout`, `dbRiserLayout`) |
| Busbar risers and busway rating | 14-busbar | `Project.busRisers`, `src/calc/busbar.ts:sizeRiser` (used by `riserLayout`, `feederRiserLayout`, `buildRiserForm`) |
| Earthing drawings | 09-earthing | `src/diagram/earthingDrawing.ts:earthingDrawing`, `src/diagram/earthRiserDrawing.ts`, `src/model/earthRiser.ts:earthSheetTitles` |
| Plan sheets, title-block templates, pens / plot stamp, markups | 23-cad-sheets-plot-titleblock | `src/docs/planLayout.ts:planDrawing`, `src/model/titleBlock.ts:borderOf`, `src/model/plotSetup.ts:pensFor, plotOf, diagramPenCss`, `src/model/sheetMarkup.ts` |
| Load schedule table on board sheets; connected kW per phase and panel DF for the riser form | 07-load-schedule-panels | `src/docs/loadScheduleDoc.ts:scheduleTable`; `src/docs/mdSheet.ts:connectedPhaseKw, panelDf` |
| Project revision, changed items for clouds | 26-revisions-changes | `src/model/revisions.ts:currentRevision`; `src/model/sheetChanges.ts:sheetItems` |
| Cable type (fire rated), cable reference numbers | 19-cable-tray-containment | `src/model/cableTypes.ts:cableTypeOf`; `src/model/cableRefs.ts:cableRefsUsed` |
| PDF rendering, printing | 34-electron-desktop | `electron/pdfRender.cjs:htmlToPdf, htmlToPrinter` via `src/util/files.ts:savePdf, renderPdf` |
| DXF → DWG conversion | 21-cad-core | `src/engines/cad/cadEngine.ts:dxfToDwg` |

## 4. Outputs — where its results go

| Result | Used by module (ID) | File + function |
|---|---|---|
| `Project.drawingSet` saved in the project file | 02-project-storage | `src/types.ts` (Project.drawingSet); `src/model/integrity.ts:removeDanglingReferences`; `src/model/projectMigrate.ts` |
| Sheet set PDF parts for the issue package / study reports | 25-reports-exports | `src/components/docs/StudyReportsView.tsx:219` → `drawingSetPdfParts` |
| Drawing register entry in the Export centre | 25-reports-exports | `src/components/docs/exportCatalogue.ts:154` → `registerHtml, registerRows` |
| Transmittals (issues) → submissions | 27-review-submissions-authority | `src/model/submissions.ts:submissionForIssue`, `src/docs/submissionReport.ts:buildTransmittalHtml` |
| Sheet readiness to-do items | 28-dashboard-readiness | `src/calc/dashboard.ts:216` → `sheetChecks` |
| Sheet DXF from the CLI | 31-headless-cli-mcp | `src/headless/rendererExport.ts:runJob` → `dxfFiles`; `src/headless/exportTools.ts:sheetsDxf` |
| Ribbon "Publish / Rev X…" state | 01-app-shell | `src/App.tsx:230` → `publishState` |
| Riser sheet added by the busbar study mock-up | 14-busbar | `src/components/studies/BusbarStudy.tsx:addG10Mockup` → `addG10RiserMockup` |
| Design CAD sheet list, layouts and panel drag between sheets | 23-cad-sheets-plot-titleblock | `src/components/cad/CadSheets.tsx` → `movePanelToSheet`; `SheetWorkspace` |

## 5. User flow — from button click to result

1. Reports → Drawings opens `DrawingsView`; `setOf(project)` gives the set (empty: prefix `E-SLD-`, register on).
2. With no sheets, the screen previews three automatic sets (`sheetsByCount`, `autoSheets('perMdb')`, `autoSheets('perSmdb')`, plus `withEarthing`). "Create sheets" calls `replaceSet` → `onChange({...project, drawingSet})`.
3. Risers are added from Design ▸ SLD ▸ Riser (`RiserView.addSheet` → `addRiserSheet` / `addDbRiserSheets`) or the Drawings "Add riser" select; earthing sheets from the earthing screen (`App.openEarthSheet` → `earthSheetFor`).
4. Editing a sheet (title, size, status, values printed, notes, clouds, callouts, markups) happens in `DrawingsView` side panel or Design CAD → Sheets (`SheetWorkspace`). The live page is redrawn when `key` (`sheetHash` + a few fields, SheetWorkspace.tsx:249) changes, debounced 350 ms, via `sheetHtml`.
5. Preview: `preview1` → `sheetHtml` → `renderSheet` (draws `SystemDiagram` / `SingleLineDiagram` / riser / earthing / plan off-screen) → `printableSvg` → `buildSldSheetHtml`.
6. Issue: Issues tab or Publish → `issueSheets(set, ids, …, sheetHash, sheetItems)` stores rev, date, status, history, `issuedHash`, `issuedItems` and a transmittal.
7. Export: "Export set (one PDF)" → `exportDrawingSet` → `renderDrawingSetPdf` → `drawingSetPdfParts` (register first when on) → `mergePdfs`. "DXF per sheet" → `exportSheetsDxf` → `prepareSheets` → `dxfOf` → `buildSheetDxfPages` → `svgToDxf` + `toDxf`. "Everything as ZIP" → `exportEverythingZip`. Register → `registerHtml` / `buildRegisterWorkbook`.
8. Before publishing, `PublishDialog` lists `sheetChecks` (also shown on the dashboard).

## 6. Linked to (working connections)

- **02-project-storage**: deleted panels are removed from sheets, clouds and callouts (`integrity.ts:removeDanglingReferences`); renamed panels are renamed in `sheet.boards` (`renamePanels.ts`, `BOARD_LIST_KEYS = ['boards']`).
- **14-busbar**: busbar risers drawn with their sized rating (`riserLayout` → `sizeRiser`); `p.busRisers` is part of the riser sheet fingerprint.
- **09-earthing**: earthing and earth riser sheets, with a count check (`earthSheetGaps`).
- **26-revisions-changes**: revision letters, history, "Cloud the changes" from `issuedItems` (`CloudChanges`).
- **27-review-submissions-authority**: each issue becomes a transmittal (`submissionForIssue`).
- **28-dashboard-readiness**: `sheetChecks` feed the to-do list.
- **31-headless-cli-mcp**: `export_dxf drawing=sld` uses the same `dxfFiles` path in a hidden renderer.
- **23-cad-sheets-plot-titleblock**: title-block templates, pens, plot stamp (PDF), plan sheets and markups share the same sheet objects.



---

*Public summary: describes what the module does and how it connects. The engineering review of open issues is kept separately.*
