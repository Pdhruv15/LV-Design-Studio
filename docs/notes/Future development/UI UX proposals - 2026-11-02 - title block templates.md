# Title block templates — what can be customised today, and a proposal — 2026-11-02

Status: **proposal only; wait for approval before building any of it.**

Mockup: `docs/mockups/title-block-templates-mockup.html` (three views: import and map a company DWG/DXF block, edit a block in Design CAD, the block on a printed sheet).

## What can be customised today

### The values (no layout work)

- **Design CAD → Sheets → Title block** (ribbon), tab *Title block & numbering*: company / consultant, project, owner, consultant, contractor, plot no., area, discipline, designed / drawn / checked / approved by, submission date, authority reference; the numbering (prefix, first number, digits, suffix, riser, earthing and board sheet prefixes); and which block the sheets use: *Standard*, or a template, with *Design…* to edit it.
- **Each sheet** carries its own number, title, revision, date, drawn / checked / approved, scale and issue status; its revision history comes from the issues.
- **Project → Parameters**: every `{Parameter}` a block can print — project (`{Project}`, `{Owner}`, `{Plot}`, `{Company}`, `{DrawingNo}`, `{Rev}`, `{RevDate}`, `{Today}` …), people and dates (`{DesignedBy}`, `{CheckedBy}`, `{SubmissionDate}`, `{AuthorityRef}` …), design values (`{Voltage}`, `{TCL}`, `{MaxDemand}`, a board's `{SMDB-GF.DemandKW}` …) and your own. On a sheet also `{SheetNo}`, `{SheetTitle}`, `{SheetIndex}`, `{SheetCount}`, `{SheetSize}`, `{Status}`, `{Scale}`.
- **Logo**: one raster image in the drawing settings (PDF; DXF / DWG show a *LOGO* placeholder).

### The layout (Project → Title block: the title block designer)

- A **grid**: column widths and row heights in mm; add or delete rows and columns; merge cells right or down; split them.
- Each **cell** holds text with `{Parameters}` (several lines), a small caption, a size (pt), bold and alignment; or the company logo; or the revision table (last 4 revisions).
- Several templates per project; *Use on the SLD* makes one the block of every sheet; *Use the standard block instead* goes back.
- A **library**: *Save to library* keeps a template in `LV Database/Library.json`, which syncs to every computer through Google Drive; *Export* / *Import* share one as a `.titleblock.json` file.
- **Where it prints**: every drawing sheet (SLD, board, riser, earthing and plan sheets) in PDF and in DXF / DWG (grid and text stay editable), and the SLD pages of the study report.

### What can't be customised today

- **Shape**: only a rectangular grid. No free lines, diagonals or arcs, no line weights per line, no rotated text, no second image (stamp, signature, QR).
- **Sheet furniture**: the frame (margins, line weight), the revision table beside the block (Rev / Date / Description, last 4), the legend column and the notes box are fixed.
- **Scope**: one block for the whole project; no block per sheet type (SLD, plans, report pages) or per authority.
- **Fonts**: Arial only.
- **CAD**: no import of a company's DWG / DXF block, no editing of the block in Design CAD.
- **DXF of a grid template**: each cell is drawn as its own closed rectangle, so shared edges lie on top of each other (it looks like one line; CAD's OVERKILL would remove the duplicates). The standard block now draws each line once (v2.031); a grid template should too.

## Proposal

**Goal:** the company's own title block, as its CAD team draws it, on every sheet, filled from the project, in PDF and DWG alike — without redrawing it as a grid.

Two ways in, one template format, one renderer for screen, PDF and DWG.

### A. Import the company's DWG / DXF block and map its fields (recommended first)

1. *Project → Title block → Import DWG / DXF…*: pick the company file. If it holds several blocks or a whole border, pick the block, or draw a window round the title block.
2. The Design CAD engine (acadrust, already in the app) reads it: lines, polylines, arcs, circles, hatches, texts, and the block's **attributes** (tags such as `PROJECT`, `DWG_NO`, `REV`).
3. **Map the fields** in a table: every attribute tag and every text is listed; each gets a project field or stays fixed. Tags are suggested by name (`DWG_NO` → `{SheetNo}`, `REV` → `{Rev}`, `DRN` / `DRAWN` → `{DrawnBy}`, `CHK` → `{CheckedBy}`, `SCALE` → `{Scale}`, `SHEET` → `{SheetIndex} of {SheetCount}`). A plain text is mapped by clicking it in the preview (for example the status line *FOR CONSTRUCTION* → `{Status}`).
4. **Place it**: size in mm from the drawing units; it sits in the frame's bottom-right corner like the standard block, or, when the file is a whole sheet border, it *is* the frame (per paper size: A3, A2, A1).
5. **Output**: PDF draws the vector geometry with the mapped values in the fields' places (height, alignment, rotation kept; long values shrink to fit). DXF / DWG writes the block back **as a block with attributes**, so the values stay editable in AutoCAD.
6. Saved as a template in the project and the library, beside the grid templates.

The engine needs, for this: block definitions and their attribute definitions (tag, prompt, default, position, height, alignment); paper space and layouts (company borders often live there); one block's geometry on its own; and writing a block with attributes to DXF / DWG.

### B. Draw or edit the block in Design CAD and save it as a template

1. *Design CAD → Sheets → Title block → Edit in CAD*: opens the block — the standard one, a grid template or an imported one — on a paper canvas at 1 : 1 mm, with the sheet frame shown.
2. Draw with the tools Design CAD has (line, polyline, rectangle, circle, arc, text) on title block layers: *TB-FRAME* (0.5 mm), *TB-GRID* (0.25 mm), *TB-TEXT*.
3. **Fields**: place a field from the field list (`{SheetNo}`, `{Rev}` …) where a value goes; it shows an example value and is drawn on *TB-FIELD*.
4. *Save as template*: the geometry and fields become a template.

Good for small changes to an imported block (move a field, add a stamp box) and for a block from scratch without a CAD package.

### One template format for both

`TitleTemplate` gains `kind: 'grid' | 'drawn'` (grid is today's). A drawn template holds:

- its size (w × h mm) and how it sits: in the frame's corner, or as the whole border;
- geometry: lines, polylines, arcs, circles, solid fills, each with a line weight (mm);
- fields: position, height, rotation, alignment, the source (a parameter, several, or fixed text) and a width to shrink to;
- image areas: logo, stamp;
- an optional revision area whose rows the app fills, else the revision table beside the block (as the standard block).

One function draws it as SVG (screen and PDF) and one as DXF entities (DXF and DWG), so the preview, the PDF and the DWG agree.

### Suggested order

1. **Small first steps** (low risk, on today's grid): draw each grid line once in DXF; an image cell for a stamp or signature; a block per sheet type (SLD, plans, report pages).
2. **Import** (A): needs the engine work above.
3. **Edit in CAD** (B): the paper canvas, field placing, *Save as template*.

### Decisions for you

- **D1** Start with import (A) or with drawing in Design CAD (B)? Recommended: A — the company's block already exists in CAD, and drawing one from scratch is rare.
- **D2** In DWG, write the company block back as a block with attributes (values editable in AutoCAD), or as plain lines and texts as today? Recommended: block with attributes.
- **D3** One block for the whole project (as today), or one per sheet type (SLD, plans, report pages)?
- **D4** Allow a template that is the whole sheet border (the company's frame with grid references), replacing the app's frame?
- **D5** Where the designer lives: *Project → Title block* (as today), or inside *Design CAD → Sheets → Title block*, next to where the block is used?

### Limits to expect

- **Fonts**: company blocks use SHX fonts; the PDF prints Arial, so widths differ. Fields shrink to fit; fixed texts are kept at their height.
- **First version reads**: lines, polylines, arcs, circles, solid hatches, TEXT, plain MTEXT and attributes. Not nested or dynamic blocks, AutoCAD FIELD codes, or rich MTEXT formatting; these come in as plain text or are left out, with a note.
- **Images** inside the DWG (IMAGE entities, external references) are not read; the logo comes from the drawing settings, placed in the block's logo area.

Up: [[Future development]]
