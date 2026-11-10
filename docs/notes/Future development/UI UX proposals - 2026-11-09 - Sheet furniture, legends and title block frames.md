# UI / UX proposal — Sheet furniture, legends and title block frames (2026-11-09)

Status: **step 1 (Legend at ISO height) approved by the user on 2026-11-09 and built in v2.059 (branch `feat/legend-iso-height`, PR 468); step 2 (Sheet furniture settings) approved 2026-11-09 ("Yes, step 2 next"): its first part built as v2.060 on branch `feat/sheet-furniture` (PR 470, merged into the step 1 branch, not main) and the rest ("Yes, finish step 2") on branch `feat/sheet-furniture-2`; both reach main together as v2.062 and v2.063 (2.060 went to the text tools); step 3 (Legend sheet, Board sheet with schedule) approved 2026-11-09 ("Yes, step 3 next") and built as v2.065 (branch `feat/sheet-kinds`); step 4 (title block frame as a CAD block) approved 2026-11-09 ("Yes, step 4 next") and its first part built as v2.066 (branch `feat/title-block-frame`); step 4's second part, *Edit in CAD*, approved 2026-11-10 ("Edit in CAD next") and built as v2.067 (branch `feat/title-block-edit-cad`); step 5, the whole-border mode and a logo area mocked up on 2026-11-10 ("give me mockup first"); the whole-border mode approved 2026-11-10 ("Whole border first", B1–B3 as recommended) and built as v2.068 (branch `feat/title-block-border`); the logo area approved 2026-11-10 ("Logo area next", L1–L2 as recommended) and built as v2.069 (branch `feat/title-block-logo`); step 5 approved 2026-11-10 ("Step 5 next", C1–C4 as recommended) and built as v2.070 (branch `feat/legend-table`); Freeze and rows from the whole level left out, see below.**

## Built in v2.070 (step 5: legend and notes tables placed on a layout)

- `src/model/sheetTables.ts`: `PlacedTable { id, kind: legend | notes, at [x, y] mm (drawing area, y down), widthMm, textMm 2.5 | 3.5, cols 1 | 2, title, hidden[], extra[] }` on `DrawingSheet.tables` of a plan sheet; `withTables`, `patchTable`, `tableName` ("Legend 2", "Notes"), `tableId`; the sheet's hash follows its tables.
- `src/docs/planLayout.ts`: the legend rows are built once (`legendRows`: symbols with counts, tray lengths and fittings, cable route, DB, wiring, home run, references) and drawn for the column as before or for a placed table (`sheetTables`: heading with a rule, rows at the table's text height, symbol 8 mm, count at the right edge, one or two columns, rows hidden by label and rows typed by hand; a notes table wraps the project's, the sheet's and the plan's notes with {Parameters}). `PlanDrawing.tables` carries them drawn with their height; `planLegendLabels` gives the palette the rows. A sheet with a legend table has `legendOff` (no column legend).
- `src/docs/sldSheet.ts` / `sheetDxf.ts`: `SheetInfo.tables` printed as `.ptab` boxes at their place over the drawing area (PDF) and as lines and text on E-LEGEND / E-NOTES at the same place (DXF / DWG, C4); `notesOff` leaves the notes box out when a notes table holds the notes.
- Design CAD (`CadPage.tsx`, `CadLayouts.tsx`): LEGEND / LG and NOTES on a layout tab (and Electrical → Legend / Notes in the ribbon beside Viewport): the next click on the paper places the table's top left corner; the table shows as a frame over the page (`.cad-ptab`, measured from the page), moved by its edges; picked, the Properties palette shows the Table panel: width (92 / 120 / 150 / 180 or custom), text height, columns, title, the rows with checkboxes, rows added, Delete. One undo step each.
- Rows come from the sheet's own legend (C2: the first viewport's window, as the column legend); the "whole level" choice and Freeze (C1) are not built: drawn objects live in the model, not on the paper, so a freeze would need paper-space objects — left for later. SLD, riser and earthing sheets keep the column or strip legend.
- Tests: `src/docs/sheetTables.test.ts`, cases in `planLayout.test.ts` and `CadPage.test.tsx` (LEGEND, NOTES, the panel, delete).

## Built in v2.069 (logo area in a drawn block)

- `src/model/titleBlock.ts`: `TitleTemplate.logo { x, y, w, h }` (mm, y down, one per block); `drawnTitleBlockHtml` prints the project's raster logo (Project → Drawing, L2: one per project) inside it as an SVG image, centred and in proportion, nothing without a logo and no rectangle of its own.
- `src/docs/titleBlockDxf.ts`: the block gets a LOGO attribute (ATTDEF `{Company}`, ATTRIB the company name) centred in the area, at most 3.5 mm and sized to fit the area's width (L1); a warning says the image prints in the PDF.
- `src/model/titleBlockImport.ts`: a closed rectangle on a layer named LOGO in an imported block becomes the area (its lines stay). The engine still reports no IMAGE entities.
- `src/model/titleBlockCad.ts`: `gridToDrawn` turns the first logo cell into the area (no LOGO word any more); in Design CAD the area is a dashed rectangle on TB-FIELD with the `{Logo}` field at its centre (`logoItems`); the palette's `{Logo}` chip places both about the click (`LOGO_BOX` 40 × 12 mm, stretch to size); TBSAVE takes the smallest closed rectangle round the field as the area (the standard box when there is none) and saves neither as lines or text.
- `src/components/docs/TitleBlockDesigner.tsx`: "Logo area" checkbox with x / y / w / h for a drawn block, the area dashed on the preview (the preview's SVG sanitizer drops images, so the logo itself shows on the sheets, not in the designer); `src/model/projectSafety.ts` checks it.
- Tests in `titleBlockCad.test.ts`, `titleBlockDxf.test.ts`, `titleBlockImport.test.ts`, `projectSafety.test.ts`; a sample sheet with a logo printed through the PDF check's renderer.
- Not done: step 5, raster images in DWG.

## Built in v2.068 (whole-border template, D4 of the 2026-11-02 note)

- `src/model/titleBlock.ts`: `Border { paper, area }` on a drawn template; `paperOf` (a size within 2 mm of A4–A1 or A3 portrait), `detectArea` (the largest rectangle bounded by the block's lines, at least 40 % of the paper each way, holding no text and no line; else the paper less the app's margins), `borderOf(project, paper)` through `drawing.borderByPaper` (one template per paper; an A3 border never serves A2 — B1, no scaling), the revision row fields `{Rev1} {RevDate1} {RevText1} {RevBy1}` … up to 12 (`revRowsIn`, `revRowValues`, newest first, blank past the issues).
- `src/docs/sldSheet.ts` `sheetBody`: with a border the frame is its drawing area, the furniture scale 1 and no block of its own; the sheet draws the border's SVG at the paper's origin (`.brd`), no `.frame` border, no zone strip or centring marks, no band; the revision rows fill from the issues; a border without rows gets the app's table at the foot of the legend column (`.rvb`, the notes join the column above it) or over the body's bottom right corner (B3). `legendColumnFits` uses the body's height.
- `src/docs/sheetDxf.ts`: the border as one INSERT with attributes at 0,0 at scale 1; E-FRAME carries the paper outline only; no band, zones or centring; the issues as REVISIONS lines of the column when the border has no rows.
- `src/model/drawingSet.ts` `scaleOn` / `autoSize` take an `AreaOf` (the border's area for that paper, else the frame's room as before); `src/docs/planLayout.ts` `drawingAreaMm` and the notes box follow the area, so layouts and viewports work inside the border.
- `src/model/titleBlockImport.ts`: a drawing or block the size of a paper comes in as that paper's border with its area found (the user can untick it); numbered tags REV_1 / DATE_1 / DESC_1 / BY_1 map to the row fields.
- `src/model/titleBlockCad.ts`: a border opens at the paper's origin (the paper outline on TB-REF as the file's line), its drawing area a dashed closed polyline on TB-REF as a drawn object (move or stretch it; TB-REF dashed, colour 8); TBSAVE keeps the paper and takes the area from that rectangle (or finds it again); TB-REF is never saved as lines. The title block drawing's tab says "Title block" (section 4 of the mockup).
- `src/components/docs/TitleBlockDesigner.tsx` (drawn editor): "Whole border of A3 sheets" checkbox for a paper-sized template, the drawing area x / y / w / h with Detect (B2), "Use on A3 sheets" per paper, the area dashed on the preview, the row fields in the field list, a line with the rows of its own; `src/model/projectSafety.ts` checks the border.
- Tests: `src/docs/sheetBorder.test.ts` (model, printed sheet, DXF, fit, plan area), cases in `titleBlockImport.test.ts`, `titleBlockCad.test.ts`, `projectSafety.test.ts`. Sample A3 prints checked through the PDF check's renderer: with rows of its own, and without.
- Not done: the logo area (section 2), step 5 (section 3), raster images in DWG.

## Mockup of 2026-11-10: the three open pieces

`docs/mockups/sheet-border-legend-table-logo-mockup.html` (PNG beside it). Not built; waits for the user's choice.

1. **Whole-border template (D4 of the 2026-11-02 note).** A drawn template whose size is a paper (within 2 mm) is a *border*, chosen per paper size (A4–A0, "Border by paper" in the designer). On such a sheet the app draws no frame, zone strip or 44 mm band: the border's INSERT sits at the paper's origin, its own references print, and the app works inside the border's *drawing area* (detected at import as the largest empty rectangle inside the outline, kept with the template, movable in the designer and in Edit in CAD on TB-REF). Revision rows through new tags {Rev*n*} {RevDate*n*} {RevText*n*} {RevBy*n*}, newest first; a border without them keeps the app's table in the column. A paper with no border falls back to the app frame and the kind's block; a border is never scaled. DWG: one INSERT at 0,0 with the values; E-FRAME only the paper outline.
   - B1 one border per paper, fall back otherwise (recommended) or scale the nearest? B2 drawing area detected with an override (recommended) or by hand? B3 revision rows by tags, app table otherwise (recommended) or always the app's table?
2. **Logo area in a drawn block.** A field chip *Logo area* draws a {Logo} rectangle on TB-FIELD (two clicks, one per block, grips resize); import offers one for an IMAGE entity or a rectangle on a layer named LOGO. Print: the project's logo (Project → Drawing) centred and in proportion inside it, nothing drawn round it. DWG: the engine writes no raster images, so the block carries a LOGO attribute with the company name at the area (L1, recommended) or leaves it blank; a vector logo drawn with lines works already. L2: logo per project as today (recommended) or per template.
3. **Legend (and notes) as table objects on a layout (step 5).** On a layout tab, LEGEND (LG) or Electrical › Sheet furniture › Legend places a table at a point: title, symbol and description rows at the set's legend height (2.5 mm), 92 mm wide, one or two columns, on E-LEGEND. A *live* paper-space object of the sheet (`DrawingSheet.tables: PlacedTable[]`, mm like a viewport): rows are the device types, cable tray, cable routes, emergency items and keynotes drawn on the level inside the layout's viewports (or the whole level), descriptions from the palette and editable per project, rows hidden, kept at 0 or added by hand, reordered by drag; the sheet's hash follows. The Properties palette shows Width, Text height, Columns, Title, Rows from, Layer and the row list; the sheet's "Legend in" gains *Placed table*, which turns the column legend off for that sheet. NOTES the same way with the set's general notes and {Parameters}. Print through legendRows / stringLegendSvg at the table's place; DWG as lines and TEXT on E-LEGEND (no TABLE entity); X freezes it to drawn objects. SLD, riser and earthing sheets keep the column or strip for now.
   - C1 live object with Freeze (recommended) or a snapshot? C2 rows from the viewports (recommended) or the whole level? C3 NOTES in the same step (recommended) or legend only? C4 DWG as lines and text (recommended) or wait for a TABLE entity?
4. Small fix for whichever is built first: the title block drawing's tab "Level? · Title block tb-2.dxf" becomes "Title block · <template name>".

Suggested order: whole border, logo area (can ride with it), then the legend and notes tables.

## Built in v2.067 (step 4, second part: Edit in CAD)

- `src/model/titleBlockCad.ts`: *Edit in CAD* (Project → Title block) opens the template as a drawing of its own, `Title block <id>.dxf`, an in-memory R12 DXF with `$INSUNITS` 4 holding only an A3 frame (390 × 277 mm) on TB-REF; the block's lines, polylines, circles and texts become the app's drawn objects (`cadSketch`) in the frame's bottom right corner, at 1 : 1 mm, y up: the outline on TB-FRAME (0.5 mm), the rest on TB-GRID (0.25 mm), fixed texts on TB-TEXT, fields on TB-FIELD (index colour 4 on screen). A grid template or the standard block becomes a drawn copy ("… (CAD)") first (`gridToDrawn`: each cell edge once, captions 1.4 mm, texts at their point size, LOGO for a logo cell; the revision table stands beside the block as before).
- In Design CAD every draw and modify tool works on them (they are app objects, not file entities). On a title block drawing a typed text keeps its height in mm (no annotation scale) and goes to TB-FIELD when it holds a `{Field}`, else TB-TEXT. With nothing picked, the Properties palette shows *Title block: <name>* with the field chips (`TB_FIELDS`: the sheet fields and the project parameters) and *Save as template*; a chip starts the text tool with the field preset (`cad.textPreset`) and the next click places it at 2.5 mm.
- `TBSAVE` (and the palette's button) runs `drawnFromSketch`: the drawn objects back as the template, its size from their extents, arcs as polylines, lineweights kept, fields with their tags, fit widths recomputed; the template then prints on the sheets that use it and goes to DWG as a block with attributes (v2.066).
- Verified in `CadPage.test.tsx` with the real engine: the drawing opens in mm, a field placed from the palette lands on TB-FIELD at the clicked point, TBSAVE writes the template back with the new field.
- Not done: the whole-border mode (D4), a logo area in a drawn block, the title block drawing's tab says "Level?" like any drawing that is not a level's plan.


## Built in v2.066 (step 4, first part: import a company block, write it back as a block)

- `TitleTemplate.kind: 'drawn'` (`src/model/titleBlock.ts`): size (mm), shapes (lines, polylines, circles, filled shapes) and texts (point, cap height, rotation, alignment, words or `{Fields}`, the attribute tag, the drawing's own words kept for a fixed text). `drawnTitleBlockHtml` draws it as SVG for the sheets, the report pages and the designer; the revision table beside it divides the block's height as with a grid template.
- Import (`src/model/titleBlockImport.ts`): Project → Title block → *Import DWG / DXF…* opens the file with the Design CAD engine; *The whole drawing* takes its lines and texts, or one of its inserted blocks is exploded by the engine so its attributes come with their tags. Units from $INSUNITS; coordinates flipped to y down from the block's top left. Tags and bracketed placeholders are mapped by name (`guessField`): DWG_NO → {SheetNo}, TITLE → {SheetTitle}, REV, DATE, DRN, CHK, APP, DSN, SCALE, SHEET → {SheetIndex} of {SheetCount}, PROJECT, CLIENT, COMPANY, STATUS, PLOT, AREA, DISCIPLINE, SIZE. The designer's *Texts and fields* list maps any text to a sheet field or a project parameter, or back to the drawing's words.
- DXF / DWG (`src/docs/titleBlockDxf.ts` `drawnTitleBlockDxf`, `src/docs/dxf.ts`): the block as a BLOCK with its geometry, fixed texts and ATTDEFs, one INSERT per sheet with the sheet's values as ATTRIBs; the DWG goes through the engine as before.
- The 2026-11-02 decisions as taken: D1 import first (done), D2 block with attributes (done), D3 per sheet kind (step 2), D4 a whole-border template replacing the frame: **not built** (an imported border is placed as a block in the frame's corner; a border wider than the frame is scaled to fit), D5 the designer stays at Project → Title block.
- Verified through the engine (`src/engines/cad/cadEngine.test.ts`): the DXF the app writes opens with the block and its attribute values, converts to DWG with them kept, and exploding the insert gives the template back with its fields. Not exercised: a real company DWG with nested blocks, MTEXT fields or images (they come in as plain lines and texts, or are left out).
- Fields fit their cells: on import a field's width runs to the block's next vertical line on the side it grows towards (`fitTexts`), so a long project name squeezes into its cell instead of running into the next.
- Not done of step 4: *Edit in CAD* (drawing a block in Design CAD and saving it as a template), the whole-border mode (D4), a logo area in a drawn block, raster images from the DWG.


## Built in v2.065 (step 3: two sheet kinds)

- **Legend sheet** (`kind: 'legend'`, `addLegendSheet`): one per set, first in the list, numbered `${prefix}000` (the SLDs keep their numbers). No drawing: the project's whole SLD legend across the sheet in as many columns as fit (A2 when it would take more than half of A3), the abbreviations of the whole SLD, the general notes (`SheetInfo.legendSheet`, `abbreviations`). The SLD and board sheets of a set with a legend sheet print no legend or abbreviations; their notes start with "LEGEND AND ABBREVIATIONS: SEE E-SLD-000" and the drawing takes the full width. Riser and earthing sheets keep their own legends (their symbols are not the SLD's). DXF: the legend across the top, abbreviations and notes in columns under it. Fingerprint: the symbols' sources and the general notes.
- **Board sheet with schedule** (`DrawingSheet.schedule` on `kind: 'board'`, `addBoardSheets`): the DB's circuit diagram with its load distribution schedule under it (`scheduleTable` in `src/docs/loadScheduleDoc.ts`, the same rows as the schedule document, flat: incomer, location and watt per unit above; Sl., circuit, ELCB group, MCB, wire, ECC, room, points, R / Y / B W, remarks; totals and maximum demand at the foot). `src/docs/sheetTable.ts` holds the table shape and height; the PDF prints it as an HTML table under the drawing, the DXF as lines and text (`tableDxf`); the paper fit leaves its height free. + New sheet → Board sheet with schedule (the picked panel, else every DB with circuits); a board sheet's settings have the switch. Board sheets of the set still count in the SLD number sequence, as before.
- Not done: the title block frame as a CAD block (step 4), the legend table object (step 5).


## Built in v2.063 (step 2, second part)

- **Revision rows** 6 or 8: a table of its own rows beside the standard block too (as a template already had), blank lines ruled, the band growing when 8 lines need 45 mm; the title block values take the latest N issues. PDF and DXF.
- **Title block per sheet kind** (`drawing.titleTemplateByKind`, `templateOf(p, kind)`): SLD and board sheets, riser and earthing sheets, plan sheets, report pages, each "Same", "Standard" or a template; a second row under the Title block choice on Title block & numbering.
- **Legend strip and columns**: `legendPlace: 'strip'` draws the legend along the foot of the drawing area in as many columns as fit (the Fit leaves its height free, the notes move to the column); `legendCols` 1 / 2, or by default two on A2 and A1 when one column would be taller than half the drawing area (`legendColsFor`); two columns widen the right column to 184 mm and split the abbreviations. `legendRows` lays out columns; `legendHeightMm` gives a legend's height before it is drawn.
- **Risers and earthing in the column** (`riserFurniture: 'column'`): the earthing schematic (15-item legend, 8 notes), the earthing riser (legend, notes), the floor earthing (notes) and the DB riser (notes) hand their legend items and notes to the sheet (`stringLegendSvg`, `plainNotes`); their schedules stay in the drawing. Default stays "in the drawing".
- The prepared sheets carry their layout (`PreparedSheet.info`) so the DXF / DWG files and the cable-schedule re-render use the same legend place, column width and notes as the PDF.
- Not done: a Legend sheet (step 3), the Board sheet with schedule (step 3), the title block frame as a CAD block (step 4), the legend table object (step 5). D3–D5 defaults remain today's output; the user can set them per set.


## Built in v2.062 (step 2, first part: the settings)

- `SheetFurniture` on the drawing set and on each sheet (`src/model/drawingSet.ts`, `furnitureOf`, `minMmPerPx`); a blank value is today's output, so nothing changes until a value is chosen.
- Choices: zone references (off / A2 and A1 / every paper; ISO 5457 fields of ≈ 50 mm, numbered along the top and bottom, lettered down the sides, in a 5 mm strip outside the frame), centring marks (10 mm, 0.7 mm), legend and column text 2.5 or 3.5 mm (the legend is drawn for it), notes above the title block (width in mm) or in the legend column, smallest drawing text 1.8 (as before) / 2.5 / 3.5 mm (the Fit's limit; Auto paper and the crowded check follow it).
- UI: a *Sheet furniture* card on Design CAD → Sheets → Title block & numbering (the set), and a *Sheet furniture* group in the open sheet's settings (this sheet; blank = as the set): `src/components/docs/FurnitureFields.tsx`. The Properties palette of the mockup was not used: the sheets page keeps its settings panel on the right, where paper, status and notes already are.
- PDF (`sldSheet.ts`) and DXF / DWG (`sheetDxf.ts`) follow the same values; the plot stamp moves under the zone strip.
- The rest of step 2 (revision rows, a title block per sheet kind, the legend strip and columns, the risers' and earthing drawings' legend and notes in the column) followed in v2.063, above.


## Built in v2.059 (step 1, legend and column at 2.5 mm)

- `src/diagram/legendLayout.ts`: a sheet legend is drawn at 4.2 px per mm of its column, so its 10.5 px labels print at 2.5 mm (ISO 3098); labels wrap at the column's width (≈ 48 characters in the 92 mm column) and rows grow by a line; `legendRows`, `wrapLabel`, `legendPxFor`.
- The SLD legend (`LegendSvg`, `widthMm`), the riser legends (`RiserLegendSvg`, `FeederRiserLegendSvg`) and the DB riser legend (`dbRiserLegend`, 62 mm column, was 2 mm) are drawn for their column; `sheetRender.tsx` passes the inner width (`sideInnerMm`).
- `src/docs/sldSheet.ts`: cable schedule, abbreviations, summary, notes and the revision band at 2.5 mm text (were 7–8 px, 1.9–2.1 mm); `legendColumnFits` estimates whether the column's contents fit the paper.
- `src/docs/sheetDxf.ts`: the legend written at the scale it was drawn for (labels 2.5 mm), the column's text at 2.5 mm; what does not fit goes on a continuation sheet as before.
- Publish readiness: a sheet whose legend column is full says so and asks for a larger paper (the column clips what does not fit, as before).
- Not in step 1 (left for steps 2–5 or a later PR): two legend columns on A2 / A1, a Legend sheet, the risers' and earthing drawings' notes and schedules moved into the column (their legends are done), zone references, revision rows, the minimum drawing text height.
- Decisions taken for step 1 as recommended: D1 2.5 mm; D2 one column for now, a full column is reported instead of shrunk.

Mockup: [sheet-furniture-legend-title-block-mockup.html](../../mockups/sheet-furniture-legend-title-block-mockup.html) (six sections: today's figures, a proposed A3 sheet, the Sheet furniture palette, the title block frame as a CAD block, the riser / earthing / load schedule outputs, the order of work).

The user asked (2026-11-09) to check the SLD, load schedule, riser and earthing riser outputs for the next enhancements: CAD output, legend size, text arrangement and title block management inside LVCAD, and whether a title block frame can be a built-in CAD function.

## What the code does today (measured 2026-11-09)

- **Papers:** A4, A3, A3 portrait, A2, A1 (`SHEET_MM`, `src/docs/sldSheet.ts`). No A0. Auto picks the smallest of A3 → A2 → A1 whose Fit scale is ≥ 0.2 mm per px (`MIN_MM_PER_PX`, `src/model/drawingSet.ts`).
- **Frame:** margins 20 / 10 / 10 / 10 mm, 0.7 mm line (pen table can change it). No zone references, no centring marks.
- **Title block:** the standard block is 180 mm wide, three 60 mm columns, six rows in a 44 mm band; captions 6.5 px, values 9.5 px, title 13 px. It keeps its size on A3–A1 and shrinks only on A4 (`furnitureScale`). Grid templates (`src/model/titleBlock.ts`) are a rectangle grid with `{Parameters}`.
- **Legend (SLD):** rows for the symbols in use (`legendEntries`, `src/diagram/IecSymbols.tsx`), 30 px rows, 10.5 px labels. The legend SVG is **scaled to the 92 mm column**, and its width grows ≈ 6.1 px per character of the longest label, so the printed text height depends on the labels: ≈ 1.9 mm with a 66-character label, ≈ 3.7 mm for a short list. One column only; a long legend hides the cable schedule and abbreviations below it (`overflow: hidden`).
- **Legend and notes (risers, earthing):** drawn inside the drawing SVG and scaled with the drawing: earthing schematic a fixed 15-row 520 px legend box and 8 notes (`src/diagram/earthingDrawing.ts`); earthing riser a 3-row legend, notes and the floor earth bar schedule (`earthRiserDrawing.ts`); DB riser its riser table and notes, with the legend in a 62 mm column at ≈ 2 mm (`dbRiserDrawing.ts`, `RISER_SIDE_MM`); feeder riser a 300 px legend.
- **Drawing text:** SLD 9 / 11 / 7.5 px at the Fit scale, so ≥ 1.8 / 2.2 / 1.5 mm on a sheet that just fits. ISO 3098 minimum for values is 2.5 mm.
- **Notes, cable schedule, abbreviations, summary:** fixed places (notes above the title block at the block's width, the rest in the column).
- **Revision table:** beside the block, rows from the sheet's issues (last 4) plus a "Generated by" line; no fixed row count.
- **Load schedule:** its own A4 landscape HTML page (`src/docs/loadScheduleDoc.ts`), no sheet frame or title block; the board sheet collapses final circuits into "REFER DB LOAD SCHEDULE".
- **DXF / DWG:** R12 DXF then DWG 2018 through the engine (`src/docs/sheetDxf.ts`): frame, block and texts as lines and TEXT; text styles STANDARD / ROMAND only; the app's text and dimension styles (`src/model/cadStyles.ts`) are not written; no BLOCK / INSERT / ATTDEF; logo left out.
- **Engine:** the Rust reader (`engines/cad-reader`, acadrust) reads INSERTs with attributes; on save it writes circles, text and basic entities only.
- **Design CAD → Sheets:** SLD, riser, earthing and board sheets are HTML / SVG previews with markups; only plan sheets are layouts with viewports (v2.050).

## Proposal

1. **Furniture in paper mm at ISO heights.** Legend, cable schedule, abbreviations, notes and the revision table are laid out in mm with 2.5 mm text (choice of 3.5), never scaled to fit. Long labels wrap; the legend takes two columns on A2 / A1, a bottom strip, or its own sheet. The risers and earthing drawings move their legend, notes and schedules into the same sheet column as the SLD.
2. **Sheet furniture settings** per sheet set, overridable per sheet, in the Properties palette when a sheet is open and as a tab of Sheets → Title block & numbering: zone references (off / A2–A1 / all) and centring marks; revision rows (issues / 6 / 8); block per sheet kind; legend text height, place, columns, and whether the cable schedule and abbreviations join it; notes place and width; minimum drawing text height (2.0 / 2.5 / 3.5 mm) below which the sheet is marked "does not fit". Defaults keep today's output.
3. **New sheet kinds:** "Legend and notes" (numbered first, every symbol of the set, abbreviations, general notes; other sheets say "LEGEND: SEE …") and "Board sheet with schedule" (the DB's SLD left, its Form 3 schedule right, one title block, issued with the set).
4. **Title block frame as a CAD block** (continues [[UI UX proposals - 2026-11-02 - title block templates]], D1–D5): a frame library with the standard block, grid templates and imported DWG / DXF blocks or whole borders per paper size; attribute tags mapped to `{Fields}`; the layout tab uses the frame as its paper border; DWG written as INSERT + ATTRIB on TB-FRAME / TB-GRID / TB-TEXT / TB-FIELD. Engine work: write BLOCK, INSERT, ATTDEF and text styles on save.
5. **Legend as a CAD table object** on layouts, placeable by hand and kept in step with the symbols used (after 4; needs the table entity and text styles in the engine).

Changes that need no approval (calculation and file output only): legend rows keyed by what is drawn on the sheet, labels kept to one line at 2.5 mm in a 92 mm column; the DXF legend written as lines and TEXT on E-LEGEND and notes as paragraphs; frame grid lines drawn once.

## Suggested order

1. Furniture at ISO height (item 1) — biggest visible gain, one renderer change.
2. Sheet furniture settings (item 2).
3. New sheet kinds (item 3).
4. Title block frame as a CAD block (item 4).
5. Legend table object (item 5).

## Decisions for the user

- **D1** Legend text 2.5 mm (ISO minimum, recommended) or 3.5 mm as the default?
- **D2** When a legend is too long for the column: wrap to two columns on A2 / A1 (recommended), a bottom strip, or always a Legend sheet?
- **D3** Revision table rows: follow the issues as today, or a fixed 6 rows (recommended; company sets usually have 6 or 8)?
- **D4** Zone references on by default on A2 / A1 only (recommended), or on every paper?
- **D5** Minimum drawing text height: 2.5 mm (recommended; more sheets will split) or keep today's 2.0 mm?
- **D6** Build the "Board sheet with schedule" kind (DB SLD + Form 3 schedule on one sheet)?
- **D7** Start the title block frame work with import and mapping (A of the 2026-11-02 note, recommended) and write the block back to DWG as a block with attributes?

Related: [[UI UX proposals - 2026-11-02 - title block templates]], [[UI UX proposals - 2026-11-07 - Model and layout space]], [[UI UX proposals - 2026-11-09 - Output panel]], [[DB riser for high-rise buildings - proposal - 2026-10-31]] (built v2.014; its header still says waiting), [[DEWA load schedule table proposal - 2026-10-23]].

Up: [[Future development]]
