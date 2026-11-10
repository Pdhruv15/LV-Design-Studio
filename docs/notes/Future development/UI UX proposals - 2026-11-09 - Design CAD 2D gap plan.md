# UI / UX proposal — Design CAD 2D gap plan, S1–S25 (2026-11-09)

Status: **approved by the user on 2026-11-09** as the UI/UX spec for the next Design CAD 2D drafting features. Each
section is built in its own branch and PR, in the order of "CLAUDE-CODE-STEPS - Design CAD 2D.md" (Step N builds SN).
Anything not written here stays as it is today. **Built:** S1 (v2.068, `feat/cad-clipboard`); S2, S3 and S4 together
(v2.076, `feat/cad-gap-steps-1-4`, at the user's "go ahead" on 2026-11-10); S5 (v2.077, `feat/cad-text-inplace-edit`,
"Yes, Step 5" on 2026-11-10); S6 (v2.078, `feat/cad-mtext`, "Yes, Step 6" on 2026-11-10); S7 (v2.079,
`feat/cad-draworder`, "Yes, Step 7" on 2026-11-10) — see the end of this note.

## Built in v2.079 (S7)

- **S7** `src/model/cadDrawOrder.ts` (`toFront`, `toBack`, `above`, `under`, `textToFront`; tested): the order of a
  drawing's drawn objects in its list is their paint order, later on top. `CadCanvas.tsx` now paints each object's
  words in its turn, in one pass (texts, notes and dimension labels no longer always over the lines; the devices and
  their labels still sit over everything drawn, so a hatch cannot hide a symbol); the plan sheets and the PDF already
  printed in list order (tested); the DXF / DWG writer writes the entities in that order — it has no SORTENTSTABLE, and
  entity order is what every reader paints by, so nothing more is needed. **DR / DRAWORDER:** `Select objects:` →
  Enter → `[Above objects/Under objects/Front/Back] <Back>:`; Above and Under then `Select reference objects:` (a
  click); with objects picked first the options come at once; `DR F`, `DR B`, `DR A`, `DR U` typed (what the ribbon
  entries send) skip the question. **TEXTTOFRONT** `[Text/Dimensions/Leaders/All] <All>:`. **Ribbon:** Modify's ▾
  (the panel's overflow, where Quick select… is) lists **Draw order:** Bring to front · Send to back · Above object ·
  Under object · Text to front (TEXTTOFRONT) after a separator — the overflow lists a tool's entries flat, so the
  spec's "after Join" became "after Quick select…" there. **Right-click** with drawn objects picked: **Draw order ▸**
  the four. **Decisions taken:** the selection is dropped once the order changed, as after Join; a reference among the
  objects picked is refused; an order already in place says so and changes nothing (no undo step).

## Built in v2.078 (S6)

- **S6** `src/model/cadMtext.ts` (tested in `cadMtext.test.ts`): a note is `kind: 'mtext'` on `SketchItem` with its
  paragraphs of plain, bold and underlined runs (`note`, never HTML), its box width `w`, line spacing `lsp` (lines
  5/3 of the height apart at 1) and `just` as its attachment (the nine positions, TL by default); the lines wrap to the
  width with the same 0.6 × height per letter that measures texts, so the canvas, the plan sheets and the PDF read
  alike. `CadNoteEdit.tsx` is the editor over the box: the bar with **B**, **U**, Height (mm on paper), Justify and
  **OK**; Enter a new line, Ctrl/⌘+Enter or OK keeps the words, Esc leaves them, a click outside keeps them; the grip
  at the right edge drags the width. **MT / MTEXT**: `MTEXT  First corner:` → `MTEXT  Opposite corner or
  [Height/Justify/Width]:` (H and J set the new note's height and attachment for the session, W takes the width typed
  in metres instead of the corner). **Notes (MT)** sits under Annotate › Text ▾ after Text (T). A double-click, ED /
  TEXTEDIT and **Edit text** open the editor on a note; its right-click menu adds **Width…** (metres, typed on the
  command line) and **Justify ▸** (the nine positions, the box staying where it is). Snaps: the anchor and the box's
  corners; grips: the anchor and a width handle; Move, Copy, Rotate, Scale, Mirror, Stretch, CROP (whole or not at
  all) and MATCHPROP as for texts; Properties: Contents (plain lines), Height, Width, Rotation, Justify; EXPLODE gives
  one single-line text per line. DXF / DWG save a native MTEXT with its width, attachment and the `\P \L \l \H \f`
  codes (`engines/cad-reader/src/doc.rs`, the WebAssembly rebuilt); `fromDxfMtext` reads such codes back for a later
  import. **Decisions taken:** numbered and bulleted paragraphs are in the model and the codes but not on the bar
  (they stay in the Annotate sub-tab proposal, with saved standard notes); a note takes no text style of its own
  (texts have none either, only the style's height); TBSAVE leaves notes out of a title block template; a note on a
  locked layer is refused like a text.

## Built in v2.077 (S5)

- **S5** `withText` and `MEASURED` (`<>`) in `src/model/cadSketch.ts` (tested in `cadTextEdit.test.ts`): a dimension's
  label reads `<>` as its measure wherever it is drawn (canvas, sheets, DXF / DWG writer). `CadTextEdit.tsx` is the box
  (one input, class `cad-edtext`, at the left end of the text's baseline, the text's height and angle on the screen,
  the text selected; Enter commits, Esc cancels, losing focus commits). `CadCanvas.tsx` reports a left double-click
  (`onDouble`; the wheel's still fits); `CadPage.tsx` opens the box on a drawn text or dimension with no tool running,
  on ED / TEXTEDIT / DDEDIT after a click (the tool stays for the next one; with one text or dimension picked first it
  opens at once), and from **Edit text** at the top of the right-click menu of a text or dimension. A text on a locked
  layer is refused with a message. A leader's text is a drawn text, so it edits the same way. Blocks with attributes
  (S11) and Notes (S6) are not here yet: a double-click on them does nothing.

## Built in v2.076 (S2, S3, S4)

- **S2** `src/model/cadView.ts` (window, scale, the history of 20, tested), `src/components/cad/cadViewHistory.ts`
  (per drawing, remembered by the canvas 400 ms after the view rests), `CadCanvas.tsx` (`zoom` request, `onZoomMenu`),
  `ZoomChip` in `drawingView.tsx` (the ▾ and right-click menu, Design CAD only), `CadPage.tsx` (Z / ZOOM with its
  options, Z W with two clicks or a dragged box, Z P, Z S, the right-click entries). On a layout ZOOM says that the
  paper fits the pane and the viewports keep their scale (the spec's "paper view" has no zoom of its own today).
- **S3** `src/model/cadQuickSelect.ts` (the filter and Select similar, tested), `CadQuickSelect.tsx` (the dialog in
  the CAD dialog frame, with the count of objects found beside OK), Modify ▾ overflow entry, QS / QSELECT and
  SELECTSIMILAR, Select similar and Quick select… on the right-click menu of a selection. SELECTSIMILAR's `Settings`
  (left open in the spec) asks `Also match [Colour/Linetype/Both/None] <None>` and keeps the answer for the session.
  Devices are not selected by either (v1, as the step says); only pickable drawn objects (unlocked, shown layers).
- **S4** `dimKind` on a drawn dimension (`src/types.ts`), `radialDimLines`, `angularDimLines`, `angularArc` and
  `dimAngle` in `src/model/cadSketch.ts` (tested in `cadRadialDims.test.ts`), the picks in `src/model/cadDims.ts`
  (the architect's circles, arcs and lines come as segments), Dimension ▾ entries, DRA / DDI / DAN. Properties shows
  the measure (degrees for an angle) and the text override. **Saved as drawn** — lines, an arc and the text, as the
  linear dimensions are today — not as native DIMENSION entities: that waits on the decision in
  [[CAD dimension styles - DWG import and DXF export - 2026-11-08]] (write DIMENSION entities with their DIMSTYLE for
  every dimension at once).

This spec builds on the proposals below and points to them instead of repeating them:

- [Annotate sub-tab](UI%20UX%20proposals%20-%202026-11-08%20-%20Annotate%20sub-tab.md): Notes (MT), dimensions, tables, mask
- [CAD selection shortcuts and tracking](UI%20UX%20proposals%20-%202026-11-08%20-%20CAD%20selection%20shortcuts%20and%20tracking.md): Select all, Quick select, Select similar, snaps and tracking
- [CAD underlays and calibration](UI%20UX%20proposals%20-%202026-11-08%20-%20CAD%20underlays%20and%20calibration.md): PDF and image underlays
- [Hatch editing and pattern library](UI%20UX%20proposals%20-%202026-11-08%20-%20Hatch%20editing%20and%20pattern%20library.md): patterns, islands, associative hatch

## General rules for every section

- **Ribbon wording** as in `src/components/Ribbon.tsx`: a short label; the tooltip is `Name (ALIAS): what to do`; a
  dropdown entry is `Name (ALIAS)` with a short tooltip. Icons from lucide-react, the existing button sizes and classes.
- **Where things go.** New tools join the existing groups of the **LVCAD** sub-tab (Draw, Modify, Annotate, Layers,
  Properties, Measure) as dropdown entries or as overflow entries (`more`, shown under the group's ▾). The only new
  group is **Blocks** (S9–S11, S25), between Annotate and Layers. The separate Annotate sub-tab of the 2026-11-08
  proposal is not part of this plan and stays a proposal.
- **Command line.** Prompts read like the existing ones: `NAME  What to do [Option/Option] <default>:`, the option keys
  in capitals, Enter accepts the default, Esc cancels with `*Cancel*`. Each command is one undo step and says what it
  did with `· ⌘Z to undo`.
- **Right-click.** With a tool running: Enter, the prompt's options, Cancel (as today). With a selection: the edit
  tools, then the entries named in each section. With nothing: Repeat and the recent commands, then the entries named.
- **Keyboard chords** act only while the drawing or the command line has focus; a text field, table cell, palette field
  or dialog keeps its own Ctrl/⌘ keys.
- **Output** stays black-and-white on sheets and PDFs. Everything drawn saves to DXF / DWG.

## Alias changes against today

| Typed | Today | After this plan |
| --- | --- | --- |
| `MT`, `MTEXT` | `MT` runs single-line Text | Notes, multi-line (S6). `T`, `DT`, `TEXT` stay single-line |
| `I`, `INSERT` | Add a device | Insert a block (S10). `DEV`, `DEVICE` stay Add a device |
| `F` | Fillet | Still Fillet. Inside a "Select objects" prompt only, `F` is Fence (S22) |
| `P` | — | Inside a "Select objects" prompt only: Previous selection (S22) |
| `ME` | — | Measure out along an object (S8). The ribbon's Measure (`DI`) is unchanged |

---

## S1 — Clipboard

- **Ribbon:** none (keyboard and right-click only).
- **Keys and commands:**
  - `Ctrl/⌘+C` — **COPYCLIP**: copies the selected drawn objects; the base point is the lower-left of their extents.
  - `Ctrl/⌘+Shift+C` — **COPYBASE**: `COPYBASE  Base point:` then copies.
  - `Ctrl/⌘+V` — **PASTECLIP**: `PASTECLIP  Insertion point:` with the objects following the cursor.
  - **PASTEORIG** (no chord): pastes at the same coordinates. In the drawing it came from it is refused:
    `PASTEORIG  Not in the drawing the objects came from — use PASTECLIP`.
- **Messages:** `COPYCLIP  5 objects copied`; when trays, cable routes or devices go to another drawing:
  `PASTECLIP  12 objects pasted · 2 trays pasted as polylines (tray data stays in its own drawing) · ⌘Z to undo`.
- **Right-click** (with a selection, and with nothing picked while something is on the clipboard): **Clipboard ▸**
  Copy (Ctrl+C) · Copy with base point (Ctrl+Shift+C) · Paste (Ctrl+V) · Paste to original coordinates.
- No dialog.

## S2 — Zoom Window, Previous, Scale

- **Commands:** `Z`, `ZOOM`: `ZOOM  [Window/Previous/Scale/Extents] <Window>:`.
  - `Z W`, `ZOOM W`: `ZOOM  First corner:` then `ZOOM  Opposite corner:` with a rubber-band rectangle.
  - `Z P`, `ZOOM P`: the view before; at the start of the history: `ZOOM  No previous view`.
  - `Z S`, `ZOOM S`: `ZOOM  Scale factor (2, 0.5 or 2x):`.
  - `FIT`, `ZE`, `Z E`, `ZOOM E` stay as today.
- **Zoom chip** (the `100 %` button at the drawing's bottom right): a click still fits; a right-click or its small ▾
  opens a menu: Window (Z W) · Previous (Z P) · Scale… (Z S) · Extents (ZE).
- **History:** the last 20 views per open drawing (and per layout's paper). A wheel zoom or pan is kept once it rests.
- **Right-click** with nothing picked and no tool: **Zoom ▸** Window · Previous · Extents.

## S3 — Quick select and Select similar

Behaviour as in the selection proposal; this section fixes the screen.

- **Ribbon:** Modify ▾ overflow: **Quick select… (QSELECT)** — tooltip `Quick select (QS): pick objects by type,
  layer and property`.
- **Commands:** `QSELECT`, `QS` open the dialog. `SELECTSIMILAR`: `SELECTSIMILAR  Select objects or [Settings]:`
  then selects every editable, visible, unlocked object of the same kind and layer (and service and circuit for
  electrical and ELV objects). `SE` stays Drafting settings.
- **Quick select dialog** (the existing CAD dialog frame):
  - Apply to: Whole drawing / Current selection
  - Object type: Multiple, or one kind found in the drawing (Line, Polyline, Circle, Text, Dimension, Hatch, Block, Device…)
  - Property: the properties of that type as in the Properties palette (Layer, Colour, Linetype, Lineweight, Text, Height…)
  - Operator: `=`, `≠`, `>`, `<`, `*` (wildcard, text only), Select all
  - Value: a list for layer / colour / linetype, else a text box
  - How to apply: Include in new selection / Exclude from new selection; tick "Add to the current selection"
  - Buttons: OK · Cancel. The result: `QSELECT  14 objects selected`.
- **Right-click** with a selection: **Select similar**, **Quick select…** (in the Selection section of the selection proposal).

## S4 — Radius, diameter and angular dimensions

- **Ribbon:** Annotate › Dimension ▾ gains, after Baseline and before Dimension style…:
  - **Radius (DRA)** — `Click an arc or circle, then where the text goes`
  - **Diameter (DDI)** — `Click an arc or circle, then where the text goes`
  - **Angular (DAN)** — `Two lines (or an arc, or a vertex and two points), then where the arc goes`
- **Commands and prompts:**
  - `DRA`, `DIMRADIUS`: `DIMRADIUS  Select arc or circle:` → `DIMRADIUS  Dimension line location:`; text `R1250`.
  - `DDI`, `DIMDIAMETER`: same prompts; text `Ø2500`.
  - `DAN`, `DIMANGULAR`: `DIMANGULAR  Select arc, circle, line or <specify vertex>:` → (a line) `Select second
    line:` → `Dimension arc line location:`; text `90°` with the dimension style's decimals.
- Uses the current dimension style; Properties shows the measured value. No new dialog.

## S5 — Double-click to edit text in place

- **Interaction:** double-click a drawn text, a leader's text or a dimension's text: an edit box opens over it, at its
  height and angle, with the text selected. Enter commits (one undo step), Esc cancels, a click outside commits.
  A dimension's `<>` stands for the measured value; empty text gives the measured value back.
- **Command:** `ED`, `TEXTEDIT`: `TEXTEDIT  Select a text or dimension:` then the same box.
- **Right-click** on a text or dimension: **Edit text**.
- Double-click on a block with attributes opens S11's dialog; on Notes (MT), S6's editor.

## S6 — Notes (MTEXT)

- **Ribbon:** Annotate › Text ▾ becomes: Text (T) · **Notes (MT)** · Text style… (ST). Tooltip
  `Notes (MT): two corners for the box, then type; lines wrap to its width`.
- **Commands:** `MT`, `MTEXT`: `MTEXT  First corner:` → `MTEXT  Opposite corner or [Height/Justify/Width]:`. `T`, `DT`,
  `TEXT` stay single-line.
- **In-place editor** over the box: a small bar above it with **B** (bold), **U** (underline), Height (mm on paper, a
  number box), Justify (Top left, Top centre, Top right, Middle left … Bottom right), and **OK**. Enter is a new line;
  Ctrl/⌘+Enter or OK commits; Esc cancels. The box width can be dragged by its right-edge grip.
- **Right-click** on a note: Edit text · Width… · Justify ▸ (the nine positions).
- Numbered notes and saved standard notes stay in the Annotate sub-tab proposal.

## S7 — Draw order

- **Ribbon:** Modify ▾ overflow, after Join with a separator: **Draw order (DR)** with entries Bring to front ·
  Send to back · Above object · Under object · Text to front (TEXTTOFRONT).
- **Commands:** `DR`, `DRAWORDER`: `DRAWORDER  Select objects:` → `DRAWORDER  [Above objects/Under objects/Front/Back]
  <Back>:`; Above / Under then `Select reference objects:`. `TEXTTOFRONT`: `TEXTTOFRONT  [Text/Dimensions/Leaders/
  All] <All>:`.
- **Right-click** with a selection: **Draw order ▸** Bring to front · Send to back · Above object · Under object.
- The order is kept per drawing, prints on sheets and saves to DXF / DWG.

## S8 — Point, Divide, Measure out, Point style

- **Ribbon:** Draw ▾ overflow: **Point (PO)** — `Click each point; Enter stops` · **Divide (DIV)** — `Pick an object,
  then the number of parts: points (or a block) at the divisions` · **Measure out (ME)** — `Pick an object, then the
  length: points (or a block) every length along it` · **Point style… (PTYPE)**.
- **Commands:**
  - `PO`, `POINT`: `POINT  Specify a point:` (repeats until Enter).
  - `DIV`, `DIVIDE`: `DIVIDE  Select object to divide:` → `DIVIDE  Number of segments or [Block]:` (Block: name,
    then `Align block with object? [Yes/No] <Yes>:`).
  - `ME`, `MEASURE`: `MEASURE  Select object to measure:` → `MEASURE  Segment length or [Block]:`.
  - `PTYPE`, `DDPTYPE` open the dialog.
- **Point style dialog:** a grid of 20 point shapes (dot, none, plus, cross, tick, each with circle / square / both);
  Point size (number) with **Size relative to screen** or **Size in absolute units**; OK · Cancel.
- Points snap with Node (as today for drawing nodes).

## S9 — Block definition

- **Ribbon:** new **Blocks** group between Annotate and Layers. Its first small button: **Create** (Box icon) —
  `Create block (B): name it, pick its base point and objects`.
- **Commands:** `B`, `BLOCK` open the dialog; `-BLOCK` runs it on the command line: `BLOCK  Block name:` →
  `BLOCK  Base point:` → `BLOCK  Select objects:`.
- **Block definition dialog:**
  - Name (text, with a list of the drawing's blocks to redefine)
  - Base point: Pick point button · X · Y
  - Objects: Select objects button with the count · **Retain** / **Convert to block** (default) / **Delete**
  - Description (text)
  - Units of the block (the drawing's unit, shown)
  - Buttons: OK · Cancel. Redefining asks `Block "DB-TYPE-A" exists. Redefine it? Yes / No`.
- **Right-click** with a selection of drawn objects: **Make block…**

## S10 — Insert a block and the Blocks palette

- **Ribbon:** Blocks group, the large button: **Insert** — `Insert (I): the Blocks palette — blocks of this drawing,
  recent ones and the library folder`. Its ▾ lists the drawing's blocks by name (up to 12) and **More blocks…**.
- **Commands:** `I`, `INSERT` show the palette; `-INSERT`: `INSERT  Block name:` → `INSERT  Insertion point or
  [Scale/Rotate]:`. Electrical devices stay on `DEV`, `DEVICE` and their own ribbon buttons.
- **Blocks palette** (docks beside the drawing like the layer palette): tabs **Current drawing** · **Recent** ·
  **Library**; a search box; a grid of black-and-white previews with names; below: Insertion point (Pick on plan,
  ticked), Scale (number, Uniform ticked), Rotation (degrees), **Repeat placement**, **Explode**. A click or a drag onto
  the drawing places the block. Library: **Folder…** chooses a local folder of DWG / DXF files, each file one block.
- **Right-click** on a block: Edit block (S25) · Edit attributes (S11) · Select all of this block.

## S11 — Attribute definition and editing

- **Ribbon:** Blocks group, small button **Attribute** — `Attribute definition (ATT): a tag, prompt and default
  value, drawn as text for a block`. Overflow: **Edit attributes (EATTEDIT)**.
- **Commands:** `ATT`, `ATTDEF` open the definition dialog; `ATE`, `ATTEDIT`, `EATTEDIT`: `ATTEDIT  Select a block:`
  then the edit dialog.
- **Attribute definition dialog:** Mode: Invisible · Constant · Verify · Preset · Lock position · Multiple lines;
  Attribute: Tag · Prompt · Default; Text: Justify · Text style · Height · Rotation; Insertion point: Pick on plan /
  X · Y; OK · Cancel.
- **Edit attributes dialog** (also on double-click of a block with attributes): the block name; a table of Tag · Prompt
  · Value, the Value cell editable; tabs **Attribute** (values) · **Text options** (style, height, justify) ·
  **Properties** (layer, colour); OK · Cancel · Apply. One undo step.
- On insert (S10) a block with attributes asks each prompt on the command line, or in the dialog when "Attribute
  prompts in a dialog" is ticked in Drafting settings.

## S12 — Multileader

- **Ribbon:** Annotate › Leader becomes a split button. Leader ▾: Leader (LE) · **Multileader (MLD)** · **Add leader
  (MLEADERADD)** · **Align (MLA)** · **Collect (MLC)** · **Multileader style… (MLS)**.
- **Commands and prompts:**
  - `MLD`, `MLEADER`: `MLEADER  Leader arrowhead location or [leader Landing first/Content first/Options] <Options>:`
    → `Leader landing location:` → the S6 editor for the text.
  - `MLEADERADD`: `Select a multileader:` → `Arrowhead location:` (repeats).
  - `MLA`, `MLEADERALIGN`: `Select multileaders:` → `Multileader to align to:` → `Direction:`.
  - `MLC`, `MLEADERCOLLECT`: `Select multileaders (with blocks):` → `[Vertical/Horizontal/Wrap] <Horizontal>:` →
    `Location:`.
  - `MLS`, `MLEADERSTYLE` open the style dialog.
- **Multileader style dialog:** a list of styles (Standard, plus the project's) with New… · Set current · Delete; tabs
  **Leader format** (straight / spline, arrowhead, size, break size) · **Leader structure** (max points, first and
  second segment angle, landing on / length, Annotative) · **Content** (Notes / Block / None; text style, height,
  attachment left and right, frame on / off); a black-and-white preview; OK · Cancel.
- **Right-click** on a multileader: Add leader · Remove leader · Edit text.

## S13 — Table

- **Ribbon:** Annotate overflow: **Table (TB)** — `Table (TB): rows and columns, then where it goes; double-click a cell
  to type`.
- **Commands:** `TB`, `TABLE` open the dialog, then `TABLE  Insertion point:`.
- **Insert table dialog:** Columns · Column width (mm on paper) · Data rows · Row height (lines); First row: Title /
  Header / Data; Second row: Header / Data; Text style and height; OK · Cancel.
- **Cell editing:** double-click a cell: an edit box in the cell; Tab / Shift+Tab next / previous cell, Enter the cell
  below, Esc leaves. A click on a cell selects it; the cell's right-click: Insert row above / below · Insert column
  left / right · Delete row · Delete column · Merge cells · Unmerge · Alignment ▸.
- Linked tables "From project data…" stay in the Annotate sub-tab proposal.

## S14 — Find and replace

- **Ribbon:** Annotate › Text ▾ adds, after Text style…, with a separator: **Find and replace… (FIND)**.
- **Command:** `FIND` opens the dialog (with a selection, "Search in" starts at "Current selection").
- **Find and replace dialog:** Find what (text, with the last 10) · Replace with · Search in: Whole drawing / Current
  selection · Look in: ☑ Drawn text and notes ☑ Attribute values ☑ Dimension text ☑ Leaders and tables · Options:
  Match case · Whole words only · Wildcards; a list of matches (text · object · layer); buttons **Find next** ·
  **Replace** · **Replace all** · **Zoom to** · Close. Replace all is one undo step:
  `FIND  6 replaced · ⌘Z to undo`.
- Device and circuit names in project data are not changed by FIND.

## S15 — Wipeout

Named **Wipeout** (this settles decision 3 of the Annotate sub-tab proposal).

- **Ribbon:** Annotate overflow: **Wipeout (WIPEOUT)** — `Wipeout: the corners of an area, or a closed polyline,
  painted in the paper colour under the notes over it`.
- **Command:** `WIPEOUT`: `WIPEOUT  First point or [Frames/Polyline] <Polyline>:`; points until Enter or C; Polyline:
  `Select a closed polyline:` → `Erase polyline? [Yes/No] <No>:`; Frames: `[ON/OFF/Display but not plot] <ON>:`.
- Frames off hides the outlines everywhere (shown when picked). Draw order (S7) sets what it covers.
- **Right-click** on a wipeout: Frames ▸ On · Off · Display but not plot · Draw order ▸.

## S16 — Purge

- **File menu** of Design CAD, after Publish…: **Purge… (PU)**.
- **Commands:** `PU`, `PURGE` open the dialog; `-PURGE`: `PURGE  [Blocks/Layers/Text styles/Dim styles/Linetypes/
  All] <All>:` → `Names to purge <*>:` → `Purge? [Yes/No] <No>:`.
- **Purge dialog:** a tree with counts: Blocks · Layers · Text styles · Dimension styles · Multileader styles ·
  Linetypes; each unused name with a tick; ☑ Confirm each item · ☑ Purge nested items; buttons **Purge checked** ·
  **Purge all** · Close. Layer 0, the current layer, the app's LV- layers in use and the Standard styles are never
  offered. One undo step: `PURGE  3 blocks, 2 layers removed · ⌘Z to undo`.

## S17 — Annotation scale

- **Status bar** of Design CAD (model space): a new `cad-tg` button after ⚙, showing the current annotation scale,
  e.g. `1:100`. A click opens a list of scales (1:1, 1:5, 1:10, 1:20, 1:50, 1:100, 1:200, 1:500, Custom…) with ticks;
  a second small toggle **Show all scales** beside it. In a layout's viewport the viewport's scale is used and the
  button shows it read-only.
- **Commands:** `CANNOSCALE` (`Annotation scale <1:100>:`), `OBJECTSCALE`: `Select annotative objects:` → `[Add/
  Delete] <Add>:` → scale list.
- **Styles:** an **Annotative** tick in the Text style, Dimension style, Multileader style (S12) and Hatch settings;
  an annotative object shows a small scale mark beside its grip when picked.
- **Properties palette:** Annotative Yes / No and Annotative scales (a list) for those objects.

## S18 — Spline and Edit spline

- **Ribbon:** Draw › Polyline becomes a split button. Polyline ▾: Polyline (PL) · **Spline (SPL)**.
- **Commands:** `SPL`, `SPLINE`: `SPLINE  First point or [Method/Knots/Object]:` (Method: `[Fit/CV] <Fit>:`) →
  `Next point or [start Tangency/toLerance]:` → `Next point or [end Tangency/toLerance/Undo/Close]:`; Enter finishes.
- `SPE`, `SPLINEDIT`: `SPLINEDIT  Select spline:` → `[Close/Join/Fit data/Edit vertex/convert to Polyline/Reverse/
  Undo/eXit] <eXit>:`.
- **Grips:** fit points (squares) or control vertices (squares on the frame); a ▾ grip toggles which are shown.
- **Right-click** on a spline: Edit spline ▸ (the options above) · Convert to polyline.

## S19 — Edit polyline and Lengthen

- **Ribbon:** Modify ▾ overflow: **Edit polyline (PE)** — `Edit polyline (PE): close, join, width, fit or
  straighten a polyline` · **Lengthen (LEN)** — `Lengthen (LEN): change a line or arc's length by a delta, a percent,
  a total or by dragging`.
- **Commands:** `PE`, `PEDIT`: `PEDIT  Select polyline or [Multiple]:` (a line or arc: `Turn it into one? [Yes/No]
  <Yes>:`) → `[Close/Open/Join/Width/Edit vertex/Fit/Spline/Decurve/Ltype gen/Reverse/Undo]:`.
- `LEN`, `LENGTHEN`: `LENGTHEN  Select an object or [DElta/Percent/Total/DYnamic] <Total>:` → the value → `Select an
  object to change:` (repeats; the end nearest the click changes).
- **Right-click** on a polyline: Edit polyline ▸ Close · Join · Width · Reverse.

## S20 — Boundary, Region and associative hatch

- **Ribbon:** Draw › Hatch becomes a split button. Hatch ▾: Hatch (H) · **Boundary (BO)** — `Click inside an area:
  a closed polyline round it` · **Region (REG)** — `Pick closed objects: each becomes a region`.
- **Commands:** `BO`, `BOUNDARY`: `BOUNDARY  Pick internal point or [Islands] <Islands on>:` (repeats; Enter stops).
  `REG`, `REGION`: `REGION  Select objects:` → `REGION  3 regions made`.
- **Associative hatch:** as part D.3 of the hatch proposal. The hatch settings gain an **Associative** tick (on by
  default); a hatch made from a picked outline follows that outline when it is moved, stretched or edited; erasing
  the outline makes the hatch plain (`HATCH  No longer associative`). Right-click on a hatch: Edit hatch ·
  Recreate boundary.

## S21 — Associative dimensions

- **Behaviour:** a dimension whose points were snapped to drawn objects follows them when they move, stretch, rotate
  or scale. Snapped to the architect's drawing or a reference it stays where it is. In the Properties palette:
  Associative Yes / No.
- **Commands:** `DRE`, `DIMREASSOCIATE`: `DIMREASSOCIATE  Select dimensions:` → for each point `Specify the first
  extension line origin or [Select object] <next>:` (an × marks the point asked). `DDA`, `DIMDISASSOCIATE`: `Select
  dimensions:`. `DED`, `DIMEDIT`: `DIMEDIT  [Home/New/Rotate/Oblique] <Home>:` → `Select dimensions:`.
- **Right-click** on a dimension: Reassociate · Disassociate · Text home.

## S22 — Fence, Lasso, Previous and cycling

Behaviour as in the selection proposal; this section fixes the inputs.

- **At any "Select objects:" prompt:** `F` Fence (points until Enter; picks what the line crosses), `WP` Window
  polygon, `CP` Crossing polygon, `P` Previous, `L` Last, `ALL` All, `R` Remove, `A` Add.
- **Lasso:** press and drag with the mouse (not a click-and-click window): left to right a window lasso, right to
  left a crossing lasso; the Space bar while dragging cycles Window / Crossing / Fence.
- **Cycling:** Shift+Space with the cursor over overlapping objects, or the **SELCYCLING** toggle in Drafting
  settings › Selection: a small list "3 objects here" shows each kind and layer; hover highlights, click picks.
- **Right-click** with nothing picked: Previous selection (as in the selection proposal).

## S23 — Image and PDF underlays

As written in the underlays proposal, unchanged. Approving this plan approves that proposal and reverses the
2026-11-06 decision not to open PDFs. The commands: `IMAGEATTACH`, `PDFATTACH` (both start the `UA` flow of that
proposal with the file filter set), `UC` to calibrate.

## S24 — UCS and named views

- **Commands:** `UCS`: `UCS  Origin or [World/3point/Object/Previous/Named] <World>:`. World: back to the drawing's
  axes; 3point: origin, a point on X, a point on the XY side; Object: the line or polyline segment picked sets X;
  Previous: the last 10. Named: `[Save/Restore/Delete/?]`.
- **Axis icon** at the drawing's bottom left: X and Y arrows in the drawing's line colour, a small square at the origin
  in World. `UCSICON`: `[ON/OFF/ORigin] <ON>:`. Typed and shown coordinates follow the UCS; saved files keep World.
- **Ribbon:** none. Drafting settings › Units gains **UCS icon** (On / Off / At origin).
- `V`, `VIEW` open the **View manager** dialog: a list of named views (Name · Layer state · UCS); buttons New… (name,
  Current display / Define window, save layer state, save UCS) · Set current · Update layers · Delete · Close.
  The zoom chip's menu (S2) adds **Named views ▸** with the saved names.

## S25 — Block editor

- **Ribbon:** Blocks group, small button **Edit** — `Edit block (BE): open a block's own drawing to change it`.
  `BE`, `BEDIT` open a list of the drawing's blocks with a preview; OK opens the editor.
- **Block editor:** a contextual ribbon tab **Block editor** appears after the last tab (the others stay) with three
  buttons: **Save block (BSAVE)** · **Attribute definition (ATT)** · **Close block editor (BCLOSE)**. The drawing
  area shows only the block, its base point marked with a small cross, and a light grey background band with the
  block's name. All draw and modify tools work.
- **Close** with changes asks `Save the changes to "DB-TYPE-A"? Save / Discard / Cancel`. Saving updates every insert
  (one undo step). `BSAVEAS` saves under a new name.
- **Right-click** on a block: Edit block (as S10).

---

## Out of scope

- Dynamic blocks (parameters, actions, visibility states)
- Parametric constraints (geometric and dimensional)
- 3D: solids, surfaces, elevations and 3D views (they wait for a BIM link)
