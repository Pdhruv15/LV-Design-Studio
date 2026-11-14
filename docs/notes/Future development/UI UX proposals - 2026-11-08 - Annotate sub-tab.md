# UI / UX proposal — Design CAD Annotate sub-tab (2026-11-08)

Mockup: [cad-annotate-tab-mockup.html](../../mockups/cad-annotate-tab-mockup.html)

On 2026-11-08 the user shared a screenshot of a CAD program's Annotate ribbon (Text, Dimensions, Centre lines, Leaders, Tables, Markup, Annotation scaling) and asked what the app could have and for a mockup. The sub-tab and the dimension forms under Built are done; the rest waits for approval.

## Built

On 2026-11-08 the user chose to start with **Linear and Continue dimensions**. They are built under the existing Dimension ▾ menu, so the ribbon layout is unchanged:

- **Linear (DLI, DIMLINEAR):** two points, then where the line goes. Above or below the points it is horizontal, beside them it is vertical, and it measures along that line. `DLI` was the aligned dimension until then; `DIM`, `DAL` and `DIMALIGNED` still are.
- **Continue (DCO, DIMCONTINUE):** each click adds a dimension from the last one's second point. Its line is in line with and parallel to the last one, with the same style.
- **Baseline (DBA, DIMBASELINE):** each click adds a dimension from the last one's first point, one step further out: 3.75 mm on paper (ISO), or 1.5 × the text height if that is larger.
- A linear dimension keeps its direction (`dir`) when it is rotated or mirrored. It prints, saves to DXF / DWG and shows in Properties with the length it measures.

### The sub-tab (v2.126, 2026-11-14)

On 2026-11-14 the user sent a screenshot of the LVCAD row, where tool names ran into each other (Rectangle over Move, North arrow over Dim style). They asked to move the annotation tools to their own sub-tab beside LVCAD. That answers decision 1 below: a separate sub-tab.

- The Annotate panel moved to an **Annotate** sub-tab after LVCAD, with the same tools in the same order: Text ▾, Dimension ▾, Leader, Room tag, Keynote, North arrow, Revision cloud, Text style and Dim style. It moved in both ribbon modes, with or without Show labels.
- On a layout's paper, Annotate shows the Markup panel. With Show labels on, it also has the sheet markup, which LVCAD used to hold.
- The cause was width. LVCAD needed 2,164 px with Annotate and needs 1,764 px without it. Its panels used to squeeze below their own width, so the names overlapped. Now they keep their width, and on a narrower window the last panels fold into one button each.
- The panels in the Layout section below (Text · Dimensions · Leaders and tags · Tables · Markup · Annotation scale) still wait for a decision. For now the sub-tab holds the one Annotate panel.

## Before this work (main, v2.57)

The Annotate group on the LVCAD sub-tab: Text ▾ (Text style…), Dimension ▾ (Aligned, Dimension style…), Leader, Room tag, North arrow, Revision cloud. Text height and plan scale are in the tool's side panel (`src/components/cad/AnnotatePanel.tsx`). `MT` already runs single-line Text.

## Gap list

| Screenshot tool | In the app? | Proposal | Priority |
|---|---|---|---|
| Multiline text | No (`MT` = one-line Text) | **Notes (MT)**: a box of wrapped lines, numbered notes, saved standard notes | 1 |
| Text style list, text height box | In a dialog / side panel | Inline style list and height box on the ribbon | 1 |
| Find text | No | **Find and replace** in drawn text (circuit refs, room names) | 2 |
| Linear dimension | No (Aligned only) | **Linear** (horizontal / vertical) | 1 |
| Continue / Baseline | No | **Continue** and **Baseline**: socket and luminaire setting out | 1 |
| Quick dimension | No | Pick objects or devices, one dimension chain | 2 |
| Angular, radius, diameter | No | Under Dimension ▾ | 3 |
| Dimension style list, layer override | Dialog only; dims go on the current layer | Inline style list; dims on LV-DIMS by default | 2 |
| Adjust space | No | **Space evenly** for stacked dimensions | 3 |
| Multileader, style, add / align leaders | Leader only | Leader style; **Add arrow** (one note, several arrows); **Align notes** | 2 |
| Table, table style | No | **Table (TB)** typed by hand | 1 |
| Extract data / link data | No | **From project data…**: symbol legend with quantities, board schedule, circuit list, cable schedule; linked, refreshed by **Update tables** | 1 (the electrical win) |
| Wipeout | No | **Mask**: paper-colour fill to keep tags readable over trays and underlays | 1 |
| Revision cloud | Yes | Moves to Markup | — |
| Annotation scaling | One scale per project (`cadAnno.scale`) | Several scales per object, sized by the viewport | 3 (needs viewport work) |
| Centre mark / centre line | No | Not proposed: little use on electrical plans | — |
| Spell check | No | Not proposed now: needs an offline dictionary | — |

Also: **Tag all rooms** (the open question 2 of the 2026-11-07 Hatch and annotation note).

## Layout (see mockup)

Design CAD has two sub-tabs today: **LVCAD** (Draw, Modify, Annotate, Layers, Properties, Measure) and **Electrical, ELV & sheets** (Rooms, Cables, Devices, Edit devices, Wiring, Reference, Sheet set, Layouts). A new **Annotate** sub-tab goes between them, with panels Text · Dimensions · Leaders and tags · Tables · Markup · Annotation scale. LVCAD and Electrical keep every tool they have today, including LVCAD's Annotate group, so nothing moves for existing users. (Changed on 2026-11-14: the Annotate group moved to the sub-tab; see Built.) With Show labels on, Annotate is its own sub-tab there too (after LVCAD). Button sizes, icons and colours follow the current ribbon; new controls are the existing select and small-button types. On a layout's paper the Markup group still takes the place of Annotate.

## What is drawn

- Tables and notes are ordinary drawn objects (lines and text on LV-ANNO): they print black-and-white on plan sheets and save to DXF / DWG.
- A linked table remembers its source (legend / board / circuits / cables, level, board). When the project changes it shows a "needs update" mark; Update tables redraws it in one undo step.
- Mask is a closed polyline with a paper-colour fill drawn under the annotation, with an outline shown only when picked.

## Suggested order

1. Linear, Continue, Baseline dimensions (engine work in `cadSketch.ts`; no new object kind).
2. Notes (MT) — new `mtext` sketch kind with box width and wrapping.
3. Table and From project data (symbol legend first), Update tables.
4. Mask.
5. Inline style lists, Find and replace, leader extras, Tag all rooms.
6. Annotation scale (after the layout viewport scale work).

## Decisions for the user

1. A separate **Annotate sub-tab** (recommended), or grow the Annotate group on the LVCAD sub-tab? **Answered 2026-11-14: a separate sub-tab** (built in v2.126; see Built).
2. Which linked tables first: **symbol legend** (recommended), board schedule, circuit list or cable schedule?
3. "Mask" or "Wipeout" as the button name? (Command alias `WIPEOUT` works either way.)
4. Approve the order above, or pick a subset to start with.
