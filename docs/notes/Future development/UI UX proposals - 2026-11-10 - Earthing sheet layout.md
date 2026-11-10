# Earthing schematic sheet layout — proposal (2026-11-10)

Mockup: `docs/mockups/earthing-sheet-layout-mockup.html` (picture: `earthing-sheet-layout-mockup.png`).

## Problem

`earthingDrawing` (src/diagram/earthingDrawing.ts) draws one band (BAND_H = 600) per substation / main
board group, stacked top to bottom, then the legend, notes and pit schedule underneath. On the
demonstration project that is 9 bands plus a 70-row schedule, so the drawing is about three times
taller than it is wide. The sheet scales it to fit the height (Scale NTS). It uses about 25–30% of the
landscape drawing area, and the text prints very small.

The sample the user sent was also made with Print → Adobe PDF on US Letter. That shrank the sheet
further and turned the text into Type 3 glyphs: 18,828 vector shapes, slow to open, and the text can't
be searched. That part is not a layout issue. Export PDF keeps the sheet size and real fonts.

## Option A (recommended): bands flow into columns

- Keep each band whole. Bands flow down column 1, then column 2 …; try 1, 2, 3 … columns and keep the
  count that gives the largest scale in the drawing area.
- Legend and notes go into the sheet's legend column (`furniture: 'column'`, already used for SLD sheets).
- The pit schedule gets its own column on the right of the drawing area.
- No change inside a band. PDF, DXF and Design CAD → Sheets use the same layout.

## Option B: Option A plus continuation sheets

- If the best column count would still print text below a minimum (proposed 2.0 mm at the chosen sheet
  size), split whole bands over continuation sheets (sheet 1 of 2 …), with the pit schedule on the last
  sheet. Numbering works like the riser continuation sheets.

## Decisions needed

1. Option A only, or A + B?
2. If B: the minimum printed text height (2.0 mm proposed; 2.5 mm is the usual A1 minimum).
3. Pit schedule: its own column on the earthing sheet (proposed), or always a separate schedule sheet?

Status: waiting for approval. Nothing implemented.
