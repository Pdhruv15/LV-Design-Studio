# SLD CAD export – issues and fix plan (2026-11-13)

Status: **proposed – waiting for your decisions (D1–D4 at the end)**. Nothing in the app, the PDF or the exports has changed yet.

User report: SLDs look right in the app and in the PDF. In the exported CAD files (DXF, DWG):
- text overlaps other text and objects, and the lines of multi-line text sit too close together;
- dashed frames are many small separate lines instead of one line with a dashed linetype;
- text is single-line TEXT, not multiline text (MTEXT);
- symbols are loose lines instead of blocks, and their sizes look wrong.

## How it was tested

Command-only: no CAD program and no app window was opened.

- **Test drawings.** Two fixture projects: "normal" (6 boards × 10 circuits) and "large" (25 boards × 24 circuits, long names, parallel cables). For each: the system sheet at A1 and A3, plus the main board and one DB at A3.
- **Export path.** The app's own path: `prepareSheets` → `printableSvg` → `dxfOf` → `buildSheetDxfPages`. The DWG went through the built-in engine (`dxfToDwg`).
- **Measurement.** A script read the DXF group codes and measured entity counts, dash pieces, text sizes, line pitch, text boxes and overlaps. It mapped each DXF text back to its SVG text.

Limits of the test:
- **Font sizes.** The test page computed styles itself. 302 of 1,053 texts got 16 px instead of the app's 8.5–11 px, so the overlap counts below were recomputed with the app's CSS sizes.
- **Font widths.** Arial widths come from standard metrics. CAD font widths are estimates; fitted text boxes are exact.
- **Large system sheet.** It is one 81,839 px row, so it is used for counts only.

## Findings

| # | What the CAD file has | Measured | Cause |
|---|---|---|---|
| 1 | Dashed frames and lines cut into separate pieces; rounded corners lost | Normal system A3: 3,806 of 6,012 entities (63 %) are dash pieces, from 7 dashed objects. The dashed frame round each board (`panel-frame`, `frame-ln` 5 4, `src/styles.css:1052`) is a median 376 pieces and at most 1,901. On paper a dash is 0.16 mm and a gap 0.13 mm. Board sheets: 11–27 % (`box` card frame 6 4: 48 pieces). | `svgToDxf` emits every dash as its own polyline (`src/diagram/exportSvg.ts:142-157`). The LTYPE table holds only CONTINUOUS (`src/docs/dxf.ts:160-162`). `rx` is ignored (`exportSvg.ts:171-176`). |
| 2 | Every text is single-line TEXT, each line separate | Normal system: 1,116 TEXT, 0 MTEXT, all Fit | The writer is R12 (`src/docs/dxf.ts:1-2`, `$ACADVER AC1009` at :152). R12 has no MTEXT. DWG is converted from that R12 file. |
| 3 | Notes, cable schedule, abbreviations and title text too big for their line spacing | CAD: cap 2.5 mm, line pitch 3.75 mm (1.5 × cap), free gap 0.63 mm. PDF: cap 1.79 mm, pitch 3.6 mm (2.0 × cap), gap 1.36 mm. CAD letters are 40 % taller and the gap 54 % smaller. | `sheetDxf.ts:171-174` uses the PDF *font size* as the CAD *cap height*, at 1.5 × pitch. `textInBox` packs lines at 1.5 × cap (`src/docs/dxfLayout.ts:31-44`). The PDF uses `line-height` 3.6 mm (`src/docs/sldSheet.ts:261`). |
| 4 | Cable label lines run into each other (CAD only) | Normal system: 71 of the 72 text–text overlaps; the PDF is clear | On DEWA-style cable labels with cable references on, the first cable line has a CAD-only 3 px shift (`data-dxf-dy`, `src/components/SystemDiagram.tsx:1345`, added 2026-10-04 to clear the glands), but the second line has none (:1363). Without references both lines shift (:1366). |
| 5 | Opened in Design CAD, every SLD label sits half its length to the right | Large system: median shift 2.8 text heights, max 43.9 mm | The reader places any aligned TEXT at its second point and treats Fit and Aligned as centred there (`engines/cad-reader/src/doc.rs:427-432`). All SLD labels are Fit. The files themselves are right: Fit and both points survive DXF → DWG → DXF for all 9,028 texts. |
| 6 | Symbols are loose lines and circles, not blocks | Normal system: 173 symbols, 3–4 loose entities each (max 7), 0 blocks | `Sym` draws each primitive already moved and scaled, in a plain `<g class="iec">` (`src/diagram/symbolLibrary.tsx:183-204`), so the converter cannot see a symbol (`src/docs/sheetDxf.ts:57`). The writer can already write blocks with attributes (`dxf.ts:200-246`, used for title blocks). |
| 7 | Symbol and text sizes change from sheet to sheet | Median symbol height: 0.51 mm (system A3), 1.24 mm (system A1), 2.28 mm (main A3), 3.92 mm (DB A3). Median text: about 0.24 / 0.59 / 1.23 / 2.12 mm. Large system A3: text 0.03 mm. The symbol-to-text ratio is the same on every sheet and as in the PDF (about 2). | Each sheet scales the whole drawing to fit its paper (`placeSvg`, `sheetDxf.ts:42-61`), as the PDF does. In CAD that gives sizes that are neither standard nor the same between sheets. The 1.5 mm warning (`sheetDxf.ts:281`) fires as soon as one label is small, so it cannot tell 4 small labels from all of them. |

Ruled out on these drawings:
- **White halos and mask boxes.** The PDF's halos on result labels (`text.res`, `src/styles.css:290`) and its mask boxes (`bg-fill`) caused none of the overlaps.
- **Fitted widths.** They match the Arial widths within ±5 %.
- **Line pitch in the diagram.** It equals the PDF's (1.67–1.72 × cap height).
- **DWG conversion.** 9,028 texts in and 9,028 out, with the same strings, heights, layers, Fit flag and both points.

Overlaps that are also in the PDF (long board names such as `SUB-MAIN BOARD ROOFTOP` running into the next board) are drawing-layout matters, not export faults. They are left for a separate layout decision.

## Fix plan

One topic per PR. Phase 1 keeps the current R12 format and changes nothing on screen or in the PDF.

### Phase 1 – current format

**F1. Cable label shift** (finding 4, small)
- Give the second cable line the same CAD-only shift as the first, or shift the whole label block.
- Test: no overlap between the cable lines, with and without cable references.

**F2. Fitted text in Design CAD** (finding 5, small)
- In the reader, Fit and Aligned text start at the first point, are as wide as the distance to the second point, and are rotated along it. Fit keeps the height; Aligned scales it.
- Rust test, then `npm run build:cad`, and a reader test in vitest.

**F3. Column and title text** (finding 3, small)
- Write sheet-column and title-block text at the PDF's proportions: line pitch 2.0 × cap.
- The cap height depends on D2.
- Tests: pitch ≥ 2.0 × cap on E-NOTES, E-LEGEND and E-TITLE, and the same lines per column as the PDF.

**F4. Real linetypes** (finding 1, medium)
- Write one LINE or POLYLINE per dashed SVG element, with a named linetype in the file's LTYPE table. POLYLINE uses flag 128 so the pattern runs round the corners.
- Keep rounded corners as arc vertices (bulges).
- Size each pattern for the paper, about 3 mm dash and 1.5 mm gap (D3), not scaled with the drawing, which gives 0.16 mm.
- The dashed bus-tie line keeps its filled pieces until Phase 2.
- Tests: one entity per dashed element, every linetype used is defined, and the normal system sheet drops by about 3,800 entities.

**F5. Symbols as blocks** (finding 6, medium)
- `<g class="iec">` gets data attributes for the symbol id, centre, scale and flip. They are invisible, so nothing changes on screen or in the PDF.
- The converter writes one BLOCK per symbol and orientation (e.g. `LV-MCCB`, `LV-MCCB-UP`), drawn once at library size on layer 0 with colour BYBLOCK.
- Each use becomes an INSERT on E-SYMBOL at the symbol centre, with a uniform scale and the feeder or board tag as extended data, as now.
- Legend symbols use the same blocks.
- Tests:
  - INSERT count = symbol count;
  - each block is defined once;
  - inserted geometry is within 0.01 mm of today's exploded geometry;
  - the DWG keeps the inserts.
- Later: attributes such as device tag and rating, for counts and schedules in CAD.

### Phase 2 – modern DXF and DWG from one writer (D1)

**F6. One writer for DXF and DWG** (finding 2, large)
- Build each sheet once as built-in-engine shapes, the route Design CAD already uses for its own saves. Save both DXF and DWG from it.
- **MTEXT** for each multi-line diagram label and each note or schedule paragraph:
  - the rows of one label are marked in the SVG, e.g. `data-dxf-para`;
  - the box width is the column width, so CAD wraps and edits the text as one paragraph;
  - the line spacing factor is exact, and there is no fitted squeezing.
- **Background mask** on the labels that the PDF shows over a white halo or box.
- **Also carried over:** linetypes (F4), blocks (F5), equipment tags as extended data, and a lineweight for busbars in place of filled strips.
- **Engine additions** (Rust): per-entity linetype with LTYPE definitions, extended data, MTEXT background fill, and lineweight. The engine's library already models all of them.

**F7. Real sizes in model space** (finding 7, D4, large)
- The diagram is drawn in model space at a fixed size: a 10.5 px label becomes 2.5 mm cap, so symbols are the same size on every sheet.
- The paper sheet (frame, title block, notes) goes in a paper-space layout, with a viewport scaled to fit. Printing the layout looks like today's PDF.
- This needs layouts and viewports in the writer. The Design CAD paper-space DWG export is still pending.

## Decisions needed

- **D1 – format.** Move SLD sheet exports to DXF 2013 + DWG from one writer, which MTEXT and masks need? *Recommended: yes.* An extra R12 copy for old readers would need an export option, which is a UI change and a separate proposal.
- **D2 – column text size.**
  - (a) Match the PDF: 1.8 mm caps (an ISO 3098 size) at 3.6 mm pitch. Same columns and continuation sheets as the PDF. *Recommended.*
  - (b) Keep 2.5 mm caps at 5.0 mm pitch. Fewer lines per column, so more continuation sheets than the PDF.
- **D3 – linetypes.** LV-prefixed names (`LV-DASHED` …), so they cannot clash with a DASHED of different length in a drawing the sheet is inserted into, and patterns sized for paper. *Recommended.* The alternative is plain names, scaled with the drawing.
- **D4 – sizes between sheets.**
  - (a) Keep fitting to the paper, as the PDF does.
  - (b) Model space at real size with a paper layout (F7). *Recommended, after Phase 2.*
  - (c) Split wide system drawings over more sheets so labels stay ≥ 1.8 mm. This changes the PDF too, so a mockup comes first.

Related: [[DXF export issues and solutions]] (2026-10-04 fixes: fitted text, CAD-only cable clearance, filled busbars).
