# 23 — CAD layouts, sheets, markup, plot setup and title block
[← Index](00-index.md) · [Integration map](99-integration-map.md)

## 1. What it does

This module covers the **paper side** of Design CAD and the drawing sheets:

2. **Sheets panel** (Design CAD → Sheets). It lists every submission sheet (SLD, board, riser, earthing and plan sheets). It opens one sheet with its markup tools, or the drawing register when no sheet is open. The panel is a container: the sheet workspace and register screens themselves belong to module 24.
3. **Sheet markup.** Revision clouds, boxes, lines, arrows, notes and callouts, drawn in paper mm on one sheet. They print in the PDF and are written to the DXF.
4. **Plot setup, pens and publish.** Pen tables give each kind of line a width in mm and an ink (black or a grey %). A CTB file can be imported as a pen table. Each sheet has a page setup, and the set has a default. Named page setups can be applied to many sheets at once. Batch-plot lists can be saved.
5. **Title block designer.** There are two kinds of template:
   - **grid templates**: cells that can be merged, holding text with `{Parameters}`, the logo, or a revision table;
   - **drawn templates**: a company block or a whole sheet border imported from a DWG/DXF. Its attribute tags are mapped to fields automatically (DWG_NO → `{SheetNo}`, REV → `{Rev}`, DRN → `{DrawnBy}` …).

   A template can be edited in Design CAD at 1:1 mm on the TB-* layers and brought back with TBSAVE. Sheets print templates as HTML/SVG (PDF). The DXF export writes them as lines and text, or as a BLOCK with ATTDEF/ATTRIB entries.

## 2. Files, components, functions and stores

("Store" = the place the app keeps the project in memory. Here every change goes back as a new `Project` through `onChange`. "Paper mm" = millimetres on the printed sheet, measured from its top-left corner, y down.)

| File | Kind | Key functions or components | What they do |
|---|---|---|---|
| `src/model/planViewports.ts` | model | `PlanViewport` (:10), `VP_SCALES` (:31), `vpWindow` (:36), `vpToPaper` (:41), `vpToModel` (:46), `insideVp`, `boxFrom`, `vpId`, `vpName`, `withViewports` (:64), `patchViewport` (:72), `toggleFrozen` (:81), `isFrozen` | Viewport data (`box` mm, `at` m, `scale`, `locked`, `shows`, `frozen`, `refsOff`, `frame`) and the model↔paper conversion (paper mm = model m × 1000 / scale). |
| `src/components/cad/CadLayouts.tsx` | screen | `layoutsOf` (:19), `newLayout` (:23), `moveLayout` (:36), `LayoutTabs` (:49), `layoutOverlay`/`Frames` (:117), `TablePanel` (:227), `ViewportPanel` (:267), `changeViewports` (:308) | Layout tabs and their right-click menu (Rename, Copy, Move, Page setup, Delete), dashed viewport frames over the page preview (drag, resize, double-click for MS), properties of viewports and placed tables. |
| `src/components/cad/CadPage.tsx` | screen | `layoutCmd` (:735), `addLayout` (:725), `setVps`/`patchVp` (:723), `writeCopy` (:903), LayoutTabs handlers (:3348–3353), `tbSave` (:2526) | Layout commands (LAYOUT, MV, MS, PS, VPSCALE, VPLOCK, LEGEND, NOTES, PAGESETUP, PLOT, paper markup tools). It also holds CAD Save (model only) and TBSAVE. |
| `src/components/cad/CadSheets.tsx` | screen | `CadSheets` (default) | Design CAD → Sheets: `SheetList` and `SheetWorkspace` (module 24) next to the system diagram with sheet outlines. With no sheet open it shows `DrawingsView` (the register). Dragging a panel onto another outline calls `movePanelToSheet`. |
| `src/components/cad/CadSaveAs.tsx` | screen | `formatOptions`, `CadSaveAs`, `CloseUnsaved` | SAVEAS dialog: DWG or DXF and version, and what goes in (drawn objects, devices, wiring, bind references). It has no option for layouts. |
| `src/components/cad/CadDraftSettings.tsx`, `CadNoteEdit.tsx` | screen | `CadDraftSettings`, `CadNoteEdit`, `fillDom`, `parasFromDom` | Drafting settings (snap, grid, object snap, units) and the in-place MTEXT editor. These are core CAD (module 21) and only listed here. They have nothing to do with sheets. |
| `src/model/sheetTables.ts` | model | `PlacedTable`, `TABLE_WIDTHS`, `tablesOf`, `hasTable`, `tableName`, `tableId`, `withTables`, `patchTable` | Legend and notes tables placed on a layout (paper mm, drawing area). The rows themselves are built in `src/docs/planLayout.ts`. |
| `src/model/sheetMarkup.ts` | model | `SheetMarkup` (:11), `MARKUP_COLORS` (:32), `markupSvg` (:158), `markupLayerHtml` (:166), `markupDxf` (:172), `markupFromDrag` (:215), `cloudPoints`, `dragHandle`, `moveMarkup` | Free markups in paper mm. The same geometry goes to the screen, the PDF (SVG layer) and the DXF (layers E-MARKUP, E-MARKUP-BLUE, E-MARKUP-BLACK). |
| `src/components/sld/SheetMarkupLayer.tsx`, `markupTools.ts` | screen | `SheetMarkupLayer`, `anchorAt`, `panelsIn`, `arrowFromDrag`, `MARKUP_TOOLS`, `ANCHORED_TOOLS` | Drawing and editing markups over the page. Panel clouds and panel arrows are anchored to boards and circuits; they are saved as `DrawingSheet.clouds` and `DrawingSheet.arrows`. |
| `src/model/plotSetup.ts` | model | `Pen`, `PenTable`, `PlotSetup`, `NamedSetup`, `BatchList`, `DEFAULT_PENS` (:36), `tablesOf`, `plotOf` (:50), `pensFor` (:52), `inkOf` (:59), `diagramPenCss` (:67), `plotStamp` (:73), `parseCtb` (:83), `tableFromCtb` (:105), `withTable`, `applySetup`, `withSetup`, `withoutSetup`, `projectForBatch` (:165) | Pen tables, page setups, named setups and batch lists. They are saved in `Project.plot` and `DrawingSheet.plot`. |
| `src/components/docs/PlotDialogs.tsx` | screen | `PageSetupDialog`, `PenTableDialog` | Page setup (paper, plan scale, pens, lineweights, drawn work, plot stamp) and the pen table editor with CTB import. |
| `src/components/docs/OutputDialogs.tsx` | screen | named setups, batch plot (`plotTo`) | Output → Page setups and Batch plot (uses `projectForBatch`). |
| `src/model/titleBlock.ts` | model | `TitleTemplate` (:43), `TbCell`, `DrawnShape`, `DrawnText`, `Border`, `PAPER_MM`, `borderOf` (:74), `detectArea` (:82), `revRowValues` (:119), `standardTemplate` (:132), `templateOf` (:167), `titleBlockHtml` (:179), `drawnTitleBlockHtml` (:216), grid helpers `mergeRight`/`mergeDown`/`split`/`addRow`/`addCol`/`removeRow`/`removeCol`, `loadTemplateLibrary`/`saveTemplateLibrary` | The template model and its HTML/SVG printing. Templates are chosen per kind of sheet and per paper (whole border). The library is kept on this computer (localStorage). |
| `src/model/params.ts` | model | `paramList` (:27), `fillParams` (:90) | The `{Name}` values a title block prints (the project's data). This file belongs to module 03 and is used here. |
| `src/model/titleBlockImport.ts` | model | `guessField` (:36), `drawnFromDrawing` (:57), `drawnFromPieces` (:71), `fitTexts` (:119), `SHEET_FIELDS` (:138), `REV_ROW_FIELD_LIST` (:140), `mapText` | Imports a DWG/DXF (the whole drawing or one exploded block) as a drawn template and guesses fields from tag names. |
| `src/model/titleBlockCad.ts` | model | `TB_LAYERS`, `TB_FRAME`, `TB_FIELDS`, `tbDrawingDxf` (:29), `gridToDrawn` (:44), `tbSketchItems` (:71), `openTitleBlockInCad` (:105), `drawnFromSketch` (:127), `saveTitleBlockFromCad` (:188) | Edit in CAD: the template becomes the app's drawn objects in the file "Title block <id>.dxf", and TBSAVE turns them back into the template. |
| `src/components/docs/TitleBlockDesigner.tsx` | screen | `TitleBlockDesigner` (default), `DrawnEditor` (:201) | The designer screen: grid editor, drawn-template field mapping, border drawing area, logo area, library, JSON import/export, DWG/DXF import, Edit in CAD. |
| `src/docs/titleBlockDxf.ts` | report | `drawnTitleBlockDxf` (:14), `templateTitleBlockDxf` (:58) | Writes a template to the sheet DXF. A drawn template becomes a BLOCK with ATTDEFs plus an INSERT with ATTRIBs; a grid template becomes lines and text. |
| `src/docs/sldSheet.ts` (module 24, used here) | report | `titleBlockOf` (:41), `sheetTitleBlock` (:63), `titleBlockFragment` (:152), `buildSldSheetHtml`, `sheetBody` (:370), `pageTitleBlock` (:390) | Prints the title block on the sheet PDF and on report pages. |
| `src/docs/sheetDxf.ts` (module 24, used here) | report | `sheetPages`, `buildSheetDxfPages` (:330) | The sheet DXF, including the title block, markups and placed tables. |
| `src/docs/planLayout.ts` (module 22/24, used here) | report | `layoutViewports` (:508), `layoutPaper` (:519), `viewportDrawing` (:530), `drawingAreaMm` (:64), `planScale` (:60) | Draws a plan sheet through its viewports, with pens applied. |
| `src/types.ts` | model | `Project.plot` (:612), `Project.titleTemplates` (:645), `DrawingInfo.titleTemplateId`/`titleTemplateByKind`/`borderByPaper` (:1028–1030) | Where the module's data is saved in the project file. |
| `src/model/drawingSet.ts` | model | `DrawingSheet.viewports`/`tables`/`plot`/`markups` (:60–63), `sheetHash` (:551), `planValues` (:499) | Sheet data and the "changed since issue" fingerprint (it includes viewports, tables and markups). |

## 3. Inputs — where its data comes from

| Data | From module (ID) | File + function |
|---|---|---|
| Plan sheets (layouts), sheet number, title, status, rev, people, scale, size, issue history | 24-drawings-sld-sheets | `src/model/drawingSet.ts` `DrawingSheet`, `renumber`, issue at :439; `src/components/docs/sheetRender.tsx:sheetInfo` |
| Project name, owner, plot, area, consultant, contractor | 02-project-storage | `Project.name`, `Project.info` via `src/model/params.ts:paramList` |
| People, submission date, authority ref, custom parameters | 03-parameters-rules | `Project.params` via `paramList` (`PEOPLE`) |
| Current revision (id, date, description, by) | 26-revisions-changes | `src/model/revisions.ts:currentRevision`; `Project.revisions` in `sldSheet.ts:titleBlockOf` |
| Voltage, frequency, TCL, max demand, transformer kVA (title block fields) | 06-network-sld-editor | `paramList` → `systemSummary` |
| DWG/DXF geometry for a title block import | 21-cad-core | `src/engines/cad/cadEngine.ts:chooseDrawing`, `explodeObjects` |
| Company logo | 03-parameters-rules (preferences / profile) | `src/model/profile.ts:readLogo` → `Project.drawing.logo` |

## 4. Outputs — where its results go

| Result | Used by module (ID) | File + function |
|---|---|---|
| Viewports and placed tables → the printed plan sheet (PDF) | 24-drawings-sld-sheets | `src/docs/planLayout.ts:viewportDrawing`, `layoutViewports` |
| Title block HTML/SVG on sheets and report pages | 24-drawings-sld-sheets, 25-reports-exports | `src/docs/sldSheet.ts:titleBlockFragment`, `pageTitleBlock` |
| Title block in DXF/DWG of sheets | 24-drawings-sld-sheets | `src/docs/sheetDxf.ts:sheetPages` → `templateTitleBlockDxf` / `drawnTitleBlockDxf` |
| Pens, lineweights and plot stamp → sheet PDF | 24-drawings-sld-sheets | `src/components/docs/sheetRender.tsx:fullSheetInfo` (:236–249), `src/docs/planLayout.ts` (:367–433) |
| Batch plot / print | 34-electron-desktop | `OutputDialogs.tsx:plotTo` → `electron/pdfRender.cjs` (`color: false`) |
| Markups → PDF and DXF | 24-drawings-sld-sheets | `src/docs/sldSheet.ts` (:326 `markupLayerHtml`), `src/docs/sheetDxf.ts` (`markupDxf`) |
| Viewports, tables and markups → "changed since issue" fingerprint | 26-revisions-changes | `src/model/drawingSet.ts:sheetHash` (:560), `planValues` (:510) |
| Issue package and set PDF (same drawings) | 25-reports-exports | `sheetRender.tsx:drawingSetPdfParts` |
| CAD Save (DWG/DXF) — model only | 21-cad-core | `CadPage.tsx:writeCopy` → `drawingWithDevices` |

## 5. User flow — from button click to result

**A. Make a layout and set its viewports**
1. In Design CAD, with a level chosen, click **+** under the drawing (or type `LAYOUT P`). `LayoutTabs` → `addLayout` → `newLayout` adds a plan sheet after the set's other sheets of that type and calls `renumber`.
2. Click the tab. `CadPage` shows the sheet page with `layoutOverlay` → `Frames`. With no viewports saved, `layoutViewports` works one out from the level (`planLayout.ts:508`).
3. Type `MV` and click two corners. `Frames.onPointerDown` → `boxFrom` → `onNew` → `changeViewports` → `withViewports`. The worked-out viewport becomes the sheet's own on the first change.
4. Pick a frame and use the **ViewportPanel**: scale (`VP_SCALES`), lock, plan type shown, references, frame prints, layers (`toggleFrozen`). Each change goes through `patchViewport` and is saved in `DrawingSheet.viewports`.
5. Double-click inside a viewport for MS (work in the model through it); `PS` or a double-click outside returns to the paper.
6. `LEGEND` / `NOTES` then a click places a `PlacedTable` (`withTables`). The `TablePanel` sets width, text height, columns, title and rows.

**B. Page setup, pens and plot**
1. Right-click the tab → **Page setup…** (or `PAGESETUP`). `PageSetupDialog` sets paper, scale (plan sheets), pen table, lineweights, drawn work and stamp.
2. **Save for this sheet** writes `DrawingSheet.plot`. **Save as the set's default** writes `Project.plot.defaults` (`withDefaults`).
3. Pen tables: `PenTableDialog` edits widths and inks. **Import CTB…** → `parseCtb` → `tableFromCtb` → `withTable`.
4. `PLOT` / Export → PDF of this layout → `onPlot`. The sheet is built by `sheetHtml` → `fullSheetInfo` (pens, stamp) → `buildSldSheetHtml`, then printed. A batch plot uses `projectForBatch` then `plotTo`.

**C. Title block**
1. Project → Title block opens `TitleBlockDesigner`. Choose **Start from the standard block** (`standardTemplate`), **Import DWG / DXF…** (`chooseDrawing` → `drawnFromDrawing` or `explodeObjects` → `drawnFromPieces`, with fields guessed by `guessField`), or the library.
2. Grid: click a cell and edit its text with `{Parameters}`, then merge or split. Drawn: map each text to a field (`mapText`). A paper-sized block can be ticked as a whole border and its drawing area found with `detectArea`.
3. **Use on the SLD** sets `drawing.titleTemplateId`. Per-kind and per-paper choices (`titleTemplateByKind`, `borderByPaper`) are made in the register (module 24).
4. **Edit in CAD** → `openTitleBlockInCad` (a grid template gets a drawn copy first) → draw on the TB-* layers → **TBSAVE** → `saveTitleBlockFromCad` → `drawnFromSketch`.
5. On every sheet: `sheetBody` picks the border or template, and `titleBlockFragment` / `drawnTitleBlockHtml` fill fields from `paramList` plus the sheet's `extra` values (register number, title, rev, people, revision rows).

**D. Markup**
1. Open a sheet in Design CAD → Sheets and pick a tool (`MARKUP_TOOLS`). `SheetMarkupLayer` → `markupFromDrag` → `onChange` saves `DrawingSheet.markups`.
2. The PDF prints them with `markupLayerHtml`; the DXF writes them with `markupDxf`.

## 6. Linked to (working connections)

- **03-parameters-rules / 02-project-storage**: `{Project}`, `{Owner}`, `{DesignedBy}`, `{SubmissionDate}`, `{AuthorityRef}` and custom parameters, through `paramList`.
- **26-revisions-changes**: `{Rev}`, `{RevDate}` and revision rows `{Rev1}…` from issues or project revisions (`revRowValues`). The viewports, tables and markups of a plan sheet count in `sheetHash`, so "changed since issue" sees them.
- **21-cad-core**: title block import uses the CAD engine (`chooseDrawing`, `explodeObjects`), and Edit in CAD uses the CAD drawn objects and layer styles.
- **34-electron-desktop**: printing forces monochrome (`electron/pdfRender.cjs:65`).
- **25-reports-exports**: the SLD pages of the study reports use the same title block (`pageTitleBlock`, template kind `report`).



---

*Public summary: describes what the module does and how it connects. The engineering review of open issues is kept separately.*
