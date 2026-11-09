# UI / UX proposal — Sheet furniture, legends and title block frames (2026-11-09)

Status: **step 1 (Legend at ISO height) approved by the user on 2026-11-09 and built in v2.059 (branch `feat/legend-iso-height`, PR 468); step 2 (Sheet furniture settings) approved 2026-11-09 ("Yes, step 2 next") and its first part built in v2.060 (branch `feat/sheet-furniture`); the rest of step 2 and steps 3–5 wait.**

## Built in v2.060 (step 2, first part: the settings)

- `SheetFurniture` on the drawing set and on each sheet (`src/model/drawingSet.ts`, `furnitureOf`, `minMmPerPx`); a blank value is today's output, so nothing changes until a value is chosen.
- Choices: zone references (off / A2 and A1 / every paper; ISO 5457 fields of ≈ 50 mm, numbered along the top and bottom, lettered down the sides, in a 5 mm strip outside the frame), centring marks (10 mm, 0.7 mm), legend and column text 2.5 or 3.5 mm (the legend is drawn for it), notes above the title block (width in mm) or in the legend column, smallest drawing text 1.8 (as before) / 2.5 / 3.5 mm (the Fit's limit; Auto paper and the crowded check follow it).
- UI: a *Sheet furniture* card on Design CAD → Sheets → Title block & numbering (the set), and a *Sheet furniture* group in the open sheet's settings (this sheet; blank = as the set): `src/components/docs/FurnitureFields.tsx`. The Properties palette of the mockup was not used: the sheets page keeps its settings panel on the right, where paper, status and notes already are.
- PDF (`sldSheet.ts`) and DXF / DWG (`sheetDxf.ts`) follow the same values; the plot stamp moves under the zone strip.
- **Still to build of step 2:** revision table rows (6 / 8: the band's rows are the title block's rows today, so a taller band is needed), a title block per sheet kind, the legend in two columns or as a bottom strip, the risers' and earthing drawings' notes and schedules moved into the column. D3 (fixed revision rows) and D4 / D5 defaults are therefore still open: today's output stays the default.


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
