# SLD sheets menu — proposal (2026-11-19)

Status: **approved on 2026-11-20 with the recommended answers** (option A, "Sheet setup", ⌘5, the Earthing screen's Sheets button kept, "Make a sheet of … on its own"). The ⌘K fix went in as PR 707 (v2.220). Step 1, the menu, is v2.224.
Built differently from the mockup: the footer line ("Opens Design CAD → Sheets. Paper, scale and pens: Page setups there") is in the button's tooltip, because the menu has no footer style. A view with no sheet yet shows a greyed line that says where to add one.
Mockup: `docs/mockups/sld-sheets-menu-mockup.html` + `.png`.
Follows the 2026-10-29 decision that every submission sheet lives in Design CAD → Sheets (v2.4). That decision stays.

## What was asked

"Where is the sheet setup in the SLD, like the layout tab in the CAD? Previously it was there." The user then asked for a proposal to bring a way in back to the SLD page.

## Today (main, v2.211)

- Before v2.4 the SLD page had a sheet tab strip (Design, E-SLD-001, …), sheet outlines on the system diagram, and the open sheet's settings in the right panel.
- Since v2.4 (PR 379) the SLD page has only the four diagram tabs: System diagram, Board, Earthing and Riser. The sheets, with their markup, title block and issue tools, are in Design CAD → Sheets. The register tabs (All sheets, Layout, Title block, Issues) are buttons in its sheet-set ribbon group (`Ribbon.tsx`, sheet-set group).
- From the SLD the only way in is the **Sheets** button on the SLD ribbon (second group, after SLD). It opens the Sheets page on whatever it showed last. It does not open the sheet of the diagram on screen, or the Layout tab.
- The Earthing screen, also shown inside the SLD as the Earthing tab, has its own **Sheets** button. It opens, or adds, the sheet of the tab shown (`openEarthSheet` → `earthSheetFor`).
- Found in passing (a bug, not UI): in the ⌘K palette, picking a sheet under "Drawing sheets" runs `design(); setDiagramMode('system'); setSheetTab(id)` (`App.tsx`, palette items). That was right before v2.4. Now it shows the SLD and quietly selects the sheet for the next visit to Sheets. It should open Design CAD → Sheets on that sheet. It is a fix of its own, whatever is decided here.

## Proposal (option A, recommended)

One **Sheets** button, with a menu arrow, right after the four diagram tabs. It is a separate button, not a fifth tab, because it opens another page. Tooltip: "Sheets of this diagram and the sheet set, in Design CAD → Sheets".

The menu has two groups (mockup parts 1–3):

1. **The sheets of what is on screen.** Each row shows the number, title and status, and opens that sheet in Design CAD → Sheets.
   - System diagram: the system SLD sheets (kind `system`).
   - Board: every sheet that shows the board, and its own circuit-diagram sheet (kind `board`). If the board has no sheet of its own, the row reads "Make a sheet of MDB-1 on its own…": it adds the sheet as Sheets → Add does, then opens it.
   - Riser: the building's riser sheet(s).
   - Earthing: the sheet the Earthing screen's Sheets button opens today.
2. **The sheet set:** All sheets, Sheet setup (the Layout tab), Title block and numbering, Issues and transmittals. Each opens that register tab. A footer line points to Page setups for paper, scale and pens.

No sheet tools come back to the SLD page. The ribbon's Sheets button stays as it is.

## Other options

- **B — the old sheet strip** (mockup part B): a row of sheet tabs under the diagram tabs, each opening its sheet in Sheets. Every sheet is always in view, but it costs a row of height on every view, scrolls with 30 or more sheets, and only looks like before v2.4.
- **C — a fifth tab that shows the Sheets page inside the SLD page.** This reverses the 2026-10-29 decision. The sheet tools would have two homes, and the sheet code (109 KB) would load with the SLD again. Not recommended.

## Decisions

1. **Which option?** A (recommended), B or C.
2. **Name of the Layout item:** "Sheet setup" (the name it had on the SLD, recommended) or "Layout" (the Design CAD ribbon's name). The name on the Design CAD ribbon does not change.
3. **Key:** ⌘5 / Ctrl+5 opens the menu, after ⌘1–⌘4 for the four tabs (recommended), or no key.
4. **Earthing tab:** keep the Earthing screen's own Sheets button when it is shown inside the SLD (recommended: no change to the Earthing screen), or hide it there because the new menu covers it.
5. **Board with no sheet of its own:** show "Make a sheet of … on its own…" (recommended) or list only the existing sheets.

## Steps once approved

1. The menu and its jumps: open Sheets on a given sheet or register tab. This reuses `setSheetTab`, `setDrawingsTab` and `addBoardSheets`. Tests for the sheets listed per view and for each jump. Manual M02 text and captures refreshed. What's new line.
2. The ⌘K jump fix can go ahead of step 1 as its own PR. It is a bug fix and needs no decision.
