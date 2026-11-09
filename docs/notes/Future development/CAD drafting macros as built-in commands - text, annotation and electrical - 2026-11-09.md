# Design CAD — drafting macros as built-in commands: text, annotation and electrical (2026-11-09)

Status: **batch 1 approved by the user on 2026-11-09** ("Yes, batch 1"); the other batches wait. Built so far: see
"Built" at the end. Nothing else is built. Product names are not used; the routines
below are described by what they do, and every one is built from scratch in the app.

## What the user asked (2026-11-09)

1. What 2D work in Design CAD is still pending, and what comes next.
2. Draftsmen keep small script routines beside their drafting program for everyday jobs: text annotation, aligning
   and spacing texts, sizing text for the paper it prints on, numbering, tagging, summing lengths. Could the useful
   ones become **built-in commands** of Design CAD, rather than a script language?
3. Keep them to electrical LV / ELV work and to better documentation inside our CAD: text annotation, alignment,
   text size for different papers.

## Where Design CAD 2D stands (main, v2.058, 2026-11-09)

**Built** (v1.90 → v2.058): draw (line, polyline, rectangle, circle 4 ways, arc 2 ways, polygon, ellipse, revision
cloud, hatch with 18 patterns and .pat import), modify (move, copy, rotate, mirror, scale, stretch, trim, extend,
offset, fillet, chamfer, break, join, explode, array, match properties, grips), annotate (text, aligned / linear /
continued / baseline dimensions, text and dimension styles, leader, room tag, north arrow), layers (palette, states,
LAYOFF / LAYFRZ / LAYLCK / LAYISO…), properties palette, command line with history, options and repeat, dynamic
input, snaps with polar and object-snap tracking, references (xref, clip, bind), model and layouts with viewports,
page setups, pen tables, plot, publish, File menu, Output panel, 156 aliases in one registry
(`src/components/cad/cadCommands.ts`).

**Approved and queued — the 2D gap plan S1–S25** ([[UI UX proposals - 2026-11-09 - Design CAD 2D gap plan]],
approved 2026-11-09; one PR per step in "CLAUDE-CODE-STEPS - Design CAD 2D.md"):

| Phase | Steps | What |
| --- | --- | --- |
| 1 Everyday comfort | 1–8 | Clipboard, Zoom W/P/S, Quick select and Select similar, radius / diameter / angular dimensions, double-click text edit, Notes (MTEXT), draw order, Point / Divide / Measure out |
| 2 Blocks and annotation | 9–17 | Block, Insert and Blocks palette, attributes, multileader, Table, Find and replace, Wipeout, Purge, annotation scale |
| 3 Geometry depth | 18–22 | Spline, Edit polyline and Lengthen, Boundary / Region / associative hatch, associative dimensions, Fence / lasso / cycling |
| 4 References and more | 23–26 | Image and PDF underlays with calibration, UCS and named views, block editor, release batch |

**Proposals still waiting for a decision** (not in S1–S25):

- [[UI UX proposals - 2026-11-08 - Annotate sub-tab]]: the sub-tab itself; **linked tables from project data**
  (symbol legend with quantities, board schedule, circuit list, cable schedule, with Update tables); numbered notes
  and saved standard notes; Quick dimension; inline style lists; Tag all rooms.
- [[UI UX proposals - 2026-11-08 - Erase and edit objects of the opened drawing]]: stage 1 erase, stage 2 edit the
  architect's objects (they are read-only today).
- [[UI UX proposals - 2026-11-02 - title block templates]]: the company's own title block, decisions D1–D5.
- [[UI UX proposals - 2026-11-08 - Hatch editing and pattern library]]: the parts outside S20.
- [[CAD design tools - electrical and ELV - 2026-11-03]]: items 4 and 6–20 (room templates, bathroom zones, tray
  fill, risers, load density, DB location helper, fire-stopping list, lightning protection, 90 m data check, sounder
  and PA coverage, fire alarm loops, battery standby, access control door sets, Wi-Fi coverage, ELV risers).
  Built since: scale calibration and underlays (now S23), select similar (S3), lighting by the lumen method (LUX),
  emergency lighting (EM).
- Found while building, still open: text justification (none today: every text is left-bottom anchored); the boxes
  at the cursor take metres while the command line takes drawing units; Save DXF writes no text styles (texts take
  the drawing's Standard), so the text style font list is Arial only.

Out of scope, as decided: dynamic blocks, parametric constraints, 3D.

## The macro routines, and what covers them

The routines draftsmen script most often, grouped. "Covered" names the step or tool that already does it, so this
proposal adds only what is missing.

| Routine | Covered by | Gap |
| --- | --- | --- |
| Find and replace text | S14 | — |
| Multi-line notes, edit text in place | S5, S6 | — |
| Text mask / background | S15 Wipeout | a per-text mask toggle (A9) |
| Copy with base point, paste to original coordinates | S1 | — |
| Zoom window / previous | S2 | — |
| Divide / measure out with a block | S8 | the electrical version: tray tags along a run (C4) |
| Count blocks → legend table | S13 Table; Annotate sub-tab "From project data" | a quick count in the Output panel (C6) |
| Numbered keynotes with a legend | — | frame + numbering + table (A7, A4, S13) |
| Change text height, justify, case, align, space, rotate readable | — | **all missing** (group A) |
| Resize every annotation for a new plan scale or paper | S17 for new objects | existing objects (B2); a check against the paper (B3) |
| Sum lengths of picked lines, label a line with its length | — | missing (C1, C2) |
| Text along a line (cable description) | — | missing (C3) |
| Tag devices from their data | wire tags overlay (TAGS, not drawn) | drawn, linked tags (C5) |
| Move / copy objects to a layer, merge layers, layer walk, delete duplicates | layer palette (rename, delete) | missing (group D) |
| User's own aliases, play a command file | — | missing (group E) |
| Mirrored text stays readable | built (cadEdit.ts mirror) | — |
| Align and space devices | ALIGN / ALIGNV / SPACE (devices only) | texts (A2) |

## Proposed built-in commands

Rules for every command: typed on the command line with the existing prompt form `NAME  What to do [Options]
<default>:`; works on the app's drawn objects (texts, dimensions, leaders, tags) and placed devices, never on the
architect's drawing; one undo step with `· ⌘Z to undo`; the result saves to DXF / DWG and prints black-and-white;
sizes in paper mm at the annotation scale (or the viewport's scale in a layout, with S17). Right-click entries are
listed; **ribbon entries are optional and listed at the end**, so the first batches need no layout change.

### Group A — text and annotation

| # | Command | Prompts | What it does |
| --- | --- | --- | --- |
| A1 | `TH`, `TXTHEIGHT` | `Select texts:` → `Height on paper (mm) [1.8/2.5/3.5/5/7/10] <2.5>:` | Sets the height of the picked texts (and dimension texts, leaders, tags) at the annotation scale, keeping each text's anchor point. With nothing picked it sets the height for new text. The list is the ISO 3098 series (to verify). |
| A2 | `TA`, `TALIGN` | `Select texts:` → `Align [Left/Right/Centre/Top/Bottom/Spacing] <Left>:` → `Reference text or point:` (Spacing: `Gap <1.5 × height>:`) | Lines texts up on a picked text or point, or spaces them evenly top to bottom, as ALIGN / SPACE do for devices. |
| A3 | `TJ`, `TJUST` | `Select texts:` → `Justify [L/C/R/TL/TC/TR/ML/MC/MR/BL/BC/BR] <L>:` | Changes the justification without moving the text on the plan. Needs a `just` field on text items, which S6 (Notes) and S11 (attributes) need too — build it here first. |
| A4 | `TCOUNT`, `TNUM` | `Prefix <>:` → `Start <1>:` → `Step <1>:` → `Suffix <>:` → `Place text or [Select existing/Undo]:` | Places numbered texts click by click (L1, L2…; DB-GF-01…), or renumbers picked texts in the order picked. Drawn text only; device and circuit names in the model stay with the Naming schedule. |
| A5 | `TC`, `TCASE` | `Select texts:` → `[Upper/Lower/Title/Sentence] <Upper>:` | Changes case. |
| A6 | `TPREFIX`, `TSUFFIX` | `Select texts:` → `Text to add <>:` | Adds words before or after each text (for example ` /L1`, `EX.`). |
| A7 | `TFRAME` | `Select texts:` → `Frame [Circle/Box/Hexagon/None] <Circle>:` | A frame sized from the text height, kept with the text (a `frame` field), so it moves, copies and scales with it. Circuit references and keynote bubbles. |
| A8 | `TORIENT` | `Select texts:` → `Read from [Bottom/Right/Both] <Both>:` | Rotates texts so they read from the bottom or the right of the sheet, about their centre; dimension texts too. |
| A9 | `TMASK` | `Select texts:` → `Mask [On/Off] <On>:` | A paper-colour fill under the text so it stays readable over hatches, trays and underlays (a per-text wipeout; S15 does areas). |
| A10 | `TCEN`, `TCENTRE` | `Select text:` → `First point:` → `Second point:` | Moves the text to the midpoint of two points (or of a picked line), centred. Tags between two walls, labels on a corridor. |
| A11 | `TCOPY` | `Copy the words of:` → `To texts:` | Copies the words of one text into others, keeping their place and height. |
| A12 | `TSUM` | `Select texts:` → `[Write at a point/Show] <Show>:` | Sums the numbers found in the picked texts (loads in W, lengths in m) and shows or writes the total with the unit found. |
| A13 | `TXT2MTXT` | `Select texts:` | Joins single-line texts into one note, top to bottom (after S6). |
| A14 | `RTALL`, `ROOMTAGALL` | `Level <current>:` → `[All rooms/Untagged only] <Untagged>:` | Room tags for every room on the level at once (the open question of 2026-11-07). |

### Group B — text size for the paper it prints on

Text is drawn at a height in paper mm for the plan's annotation scale (2.5 mm at 1:100 = 0.25 m). It prints wrong
when the plan goes to another paper: a 1:100 plan set up for A1 and printed on A3 is 1:200, so 3.5 mm becomes
1.75 mm, below the 1.8 mm floor of the ISO series. The rule the app can check: **height on paper × (annotation
scale ÷ print scale) ≥ 1.8 mm**, and 2.5 mm for authority submissions (IEC 61082-1 and ISO 3098, to verify).

| # | Command | Prompts | What it does |
| --- | --- | --- | --- |
| B1 | `TH` list (A1) | — | The ISO series as the default heights offered everywhere a height is typed (Text, Notes, styles, leaders, tags). |
| B2 | `RESCALE`, `ANNORESCALE` | `From 1:<100> to 1:<200>:` → `[All annotation/Selection] <All>:` | Resizes the existing texts, dimension looks (arrows, offsets, text), leaders, room tags, north arrow, revision-cloud arcs and hatch spacing about their anchors so they print the same mm at the new scale, and sets the plan's annotation scale. One undo step. S17 does this for new objects; RESCALE fixes what is already drawn. |
| B3 | `ANNOCHECK`, `CHECKTEXT` | `Check for [Paper and scale/Each layout] <Each layout>:` → `Paper [A0/A1/A2/A3/A4] <A1>:` → `Print scale 1:<100>:` | Lists in the Output panel, with zoom-to on click: texts that print below 1.8 mm (2.5 mm option), heights outside the ISO series, mixed heights on one layer, texts not on LV-ANNO / LV-DIMS, texts overlapping other texts or devices, dimensions whose text was overridden. A fix button runs A1 on the listed texts. |
| B4 | Text style per paper | Text style dialog: `Heights <2.5 / 3.5 / 5>` | A style keeps a height per use (notes, titles, sub-titles), picked by the plan sheet's paper (A3: 2.5 / 3.5 / 5; A1: 3.5 / 5 / 7). Optional; needs a small change to the existing STYLE dialog. |

Recommended heights (paper mm), for the help text and B3's defaults (to verify against ISO 3098-2 and the
authority's drawing standards): general notes 2.5; room and device tags 2.5; dimensions 2.5; titles 5; sub-titles
3.5; minimum after any reduction 1.8.

### Group C — electrical LV / ELV

| # | Command | Prompts | What it does |
| --- | --- | --- | --- |
| C1 | `LENSUM` | `Select lines, polylines, trays or routes:` → `[Write at a point/Copy/Done] <Done>:` | Total length, with a breakdown per layer and per tray or route, in metres (drawing units converted); the project's vertical and termination allowances offered for routes. Writes the total as text if asked; otherwise in the Output panel. |
| C2 | `LENTXT`, `LABELLEN` | `Select trays, routes or polylines:` → `[Above/Below/Centre] <Above>:` | Writes each run's length at its midpoint, aligned with it, reading from the bottom or right; a tray adds its width and service (`CT 300×50 · 12.4 m`). |
| C3 | `LBL`, `LINELABEL` | `Select line or segment:` → `Text <from the model>:` → `[Above/Below/Centre] <Above>:` | Text along a line, aligned and readable. On a cable route the default text is the feeder's cable description from the model (`4C × 16 mm² Cu XLPE/SWA`); on a tray its size. Repeats for the next segment. |
| C4 | `TRAYTAG` | `Select trays:` → `Every <6 m> or [Once per run]:` | Tray size and service tags along the run at the spacing, using S8's measure-out logic. |
| C5 | `DTAG`, `DEVTAG` | `Select devices or boards:` → `Show [Circuit/Load/Type/Room/All] <Circuit>:` → `Place [Beside/Leader/Frame] <Beside>:` | Drawn tags from the device's data: circuit reference (`DB-GF-1/L3`), load, type code, room. A tag remembers its device uid; when the model changes it shows a "needs update" mark and `DTAG U` updates them (as the linked tables of the Annotate sub-tab proposal). The TAGS overlay stays for checking; DTAG is for what prints and saves. |
| C6 | `COUNT`, `BCOUNT` | `Select objects:` → `By [Device type/Layer/Kind/Block] <Device type>:` → `[Table/Done] <Done>:` | Counts in the Output panel; Table writes a legend with quantities at a point (lines and texts now; S13's table when it exists). |
| C7 | `JUMP`, `CROSSOVER` | `Select the line that jumps:` → `[Arc/Gap] <Arc>:` | A small half-circle (or gap) where two drawn lines cross, radius from the text height, for wiring and schematic drawings. |
| C8 | `SWLINK`, `CONTROL` | `Select the switch:` → `Select the lights it controls:` | A dashed control arc from a switch to its luminaires, saved on LV-ANNO. `src/model/cadWiring.ts` wires a circuit's devices to the board and has no switch groups, so this is new; it needs a decision on whether switch-to-light control belongs in the model (per circuit) or stays a drawn annotation. |
| C9 | `KN`, `KEYNOTE` | `Number <next>:` → `Place:` → `Note text:` | A hexagon with the number (A7 + A4) and one legend table per level (C6 / S13) that updates as keynotes are added. |

### Group D — layers and housekeeping (drawn objects only)

| # | Command | What it does |
| --- | --- | --- |
| D1 | `LAYCUR` | Moves the picked objects to the current layer. |
| D2 | `COPYTOLAYER` | Copies the picked objects to a layer picked from the list (or by clicking an object on it). |
| D3 | `LAYMRG` | Merges one drawn layer into another and removes the empty one; the architect's layers are refused. |
| D4 | `LAYWALK` | Steps through the layers one at a time (Up / Down, Esc restores), built on LAYISO / LAYUNISO. |
| D5 | `OVERKILL` | Deletes duplicate and overlapping drawn lines and polylines after tracing (tolerance in drawing units; trays and routes are never merged away). |
| D6 | `ID` | Shows a point's coordinates (brainstorm item 11); `ANGLE` measures the angle between two lines (the Drafting tab's unbuilt Measure entry). |

### Group E — the user's own shortcuts and command files

| # | Command | What it does |
| --- | --- | --- |
| E1 | `ALIASEDIT` | The user's own aliases, kept per user in the LV Database (`aliases.json`): add a short name for any command (`LL` → LBL), see conflicts with built-in aliases, reset. Built-in aliases cannot be removed. UI: a small dialog or a tab in Drafting settings — approval needed. |
| E2 | `SCRIPT`, `SCR` | Plays a plain text file: one command or value per line, exactly as if typed on the command line, with the Output panel showing each line's message and stopping at the first error. Replaces an office's script files for repeated setups (layers, styles, title block, standard notes). Points are typed as `x,y`. |
| E3 | `RECORD` / `STOP` | Later: records what is typed into a script file for E2. |
| E4 | MCP tools | Already there: `src/headless/cadTools.ts` lets a user's AI run the same jobs headless. Each command above that is a pure function in `src/model` can be exposed as a tool with no extra logic. |

## How it would be built

- **Pure functions first** in `src/model/cadText.ts` (A, B), `src/model/cadLabel.ts` (C), `src/model/cadLayerOps.ts`
  (D), unit-tested beside them. Text gains two optional fields: `just` (A3) and `frame` (A7); both must work in the
  canvas, snaps, grips, every edit tool, the properties palette, MATCHPROP, DXF / DWG save (justification as the
  text's alignment codes; the frame as lines) and the plan-sheet print, with a DXF round trip test — the gap plan's
  rule for a new field.
- **Commands** in `cadCommands.ts`, tools in `cadState.ts`, prompts in `CadPage.tsx`; each in HELP (F1) and the
  What's new entry.
- **Results and lists** go to the existing Output panel (v2.058), with zoom-to on click; no new panel.
- **Linked tags (C5)** reuse the permanent `uid` of boards and circuits (PR 439) and the "needs update" idea of the
  Annotate sub-tab's linked tables; the two should share one small "linked annotation" model.
- **DXF fidelity**: justification and text styles are not written today (Standard only). A1 / A3 / B2 are worth
  more if the writer learns text alignment and style names — a Rust change in `engines/cad-reader`, `npm run build:cad`.

## Suggested batches and order

| Batch | Commands | Why first | PRs |
| --- | --- | --- | --- |
| 1 Text essentials | A1, A2, A3, A5, A6, A8, A10, A11, A14 | Daily use; A3's `just` field is needed by S6 and S11, so it should land before Step 6 | 2 |
| 2 Numbering and frames | A4, A7, A9, C9 | Circuit references and keynotes; builds on batch 1 | 1 |
| 3 Lengths and labels | C1, C2, C3, C4, C6 | BOQ and cable schedules from the plan; C4 after Step 8 | 2 |
| 4 Linked device tags | C5 | The electrical win; after batch 3 and together with the linked-tables decision | 1 |
| 5 Paper and scale | B2, B3 (B4 optional) | After Step 17 (annotation scale), so they share one scale model | 1–2 |
| 6 Housekeeping | D1–D6, A12, A13, C7, C8 | Small, any time | 1 |
| 7 Shortcuts | E1, E2 (E3 later) | Needs the dialog approval | 1 |

Batch 1 can start now, in parallel with Steps 1–4 of the gap plan (new files, no overlap). Batches 3, 5 and 7 wait
for the steps named.

## Optional ribbon entries (approval needed; the commands work without them)

- LVCAD › Annotate ▾ overflow: **Text tools ▸** Height (TH) · Align (TA) · Justify (TJ) · Number (TCOUNT) · Case
  (TC) · Frame (TFRAME) · Orient (TORIENT) · Check annotation (ANNOCHECK).
- Electrical, ELV & sheets › Cables: **Label (LBL)**, **Lengths (LENSUM)**; › Devices: **Tag (DTAG)**.
- Right-click on texts: Text tools ▸ (the same list); on trays and routes: Label length · Sum lengths; on devices:
  Tag from data.

## Decisions for the user

1. Approve the command set, or strike items. In particular: C7 / C8 (schematic jumpers, switch control arcs) and E2
   (command files) are the least certain.
2. Order: start with batch 1 now, beside the gap plan's Steps 1–4, or run the gap plan first and this after Step 8?
3. Linked device tags (C5): together with the Annotate sub-tab's linked tables (one model), or on their own first?
4. Text heights: the ISO series and the recommended values above, or the office's own list (which the app would keep
   per user)?
5. Ribbon entries and the aliases dialog (E1): approve the optional entries above, or command line and right-click only?
6. Should the CAD engine's writer learn text justification and style names now (Rust change), so these texts save
   as drawn?

## Built

### Batch 1, part 1 (v2.059, branch `feat/cad-text-tools`)

- **Text justification** (A3): a text item has an optional `just` (L, C, R, TL … BR; `src/model/cadText.ts`), its anchor
  `pts[0]` sitting there on its box; left out, it is the left end of the baseline as before. The canvas and the plan
  sheets align by the real font width; picking uses the box; snaps and grips stay at the anchor; Move, Copy, Rotate,
  Mirror, Scale, Stretch and Crop carry it. **TJ / TJUST / JUSTIFYTEXT**: pick texts, Enter, then
  `TJUST  Justify [Left/Centre/Right/TL/TC/TR/ML/MC/MR/BL/BC/BR] <current>:` — each text stays where it is, one undo
  step. The Properties palette has a **Justify** row (a list).
- **TH / TXTHEIGHT / TEXTHEIGHT** (A1): pick texts and dimensions, Enter, then the height on paper in mm, the ISO series
  shown (1.8 · 2.5 · 3.5 · 5 · 7 · 10) and the first picked one's height as the default; each keeps its anchor. With
  nothing picked, Enter asks the height for new text (the annotation text height).
- **DXF / DWG**: a justified text is written with its horizontal and vertical alignment and its alignment point, and the
  left end of its baseline as the insertion point, as drafting programs write it (CAD engine, Rust). The reader now
  puts any text with an alignment other than left-baseline at its alignment point, brought down to its baseline, so
  texts read from the architect's drawings sit where that drawing put them (they were drawn at the baseline before).

### Batch 1, part 2 (v2.060, branch `feat/cad-text-tools-2`, on part 1)

All on the texts picked first, then Enter, then the value on the command line; one undo step; other objects picked
are left as they are (`src/model/cadText.ts`, pure, with tests; the flows in `CadPage.tsx`).

- **TA / TALIGN** (A2): `Align [Left/Right/Centre/Top/Bottom/Spacing] <Left>:`, then the text (its matching box edge)
  or point clicked or typed; Spacing asks the gap on paper in mm (default 1.5 × the first text's height) and spaces the
  texts' centres down the page, the topmost staying.
- **TC / TCASE** (A5): `Case [Upper/Lower/Title/Sentence] <Upper>:`.
- **TPREFIX / TPRE, TSUFFIX / TSUF** (A6): the words typed, spaces at the ends kept ("EX. ").
- **TOR / TORIENT** (A8): `Readable from [Bottom/Right/Both] <Both>:`, each text turned about its box's centre.
- **TCEN / TCENTRE / TCENTER** (A10): one text, two points (clicked or typed): its centre goes to their midpoint.
- **TCOPY / TCP** (A11): the texts picked take the words of the text clicked next.
- **RTALL / ROOMTAGALL** (A14): `Tag [All rooms/Untagged only] <Untagged>:` on the open plan's level; a room counts as
  tagged when a drawn text with its name lies inside its outline.
- Not built: ribbon entries and right-click items (optional in the proposal); TSUM (A12) and TXT2MTXT (A13) are
  batch 6.
