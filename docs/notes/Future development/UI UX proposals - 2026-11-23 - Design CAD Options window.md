# UI UX proposal: one Options window for Design CAD (2026-11-23)

Status: **approved 2026-11-23** ("go ahead", every decision as recommended). Built in five steps; step 1 is v2.276.

## Today

Typing `OP` (or right-click → Options…) opens Drafting settings at its Cursor page. There is no Options window.

1. **Settings sit in six places.** Drafting settings (48 rows on eight pages); Profile & preferences (colour theme, palette, tool names, ribbon panel order, recovery copy); the ribbon (projects folder); the Database page (database folder); the Blocks palette (block library folder); the Plot dialogs (printer, page setups, pen tables).
2. **A setting cannot be found by its name.** The user has to know which page it is on.
3. **Nothing shows what was changed.** Reset is on two pages only (Selection, Cursor), and it resets the whole page.
4. **Typed names and keys are fixed lists** (180 commands). Mouse behaviour (right-click, wheel step) is fixed too.

## Proposed

One window, **Options** (`OP`), in the app's own dialog style: 660 px wide, a page list on the left, one body height for every page.

| Page | Holds | From |
|---|---|---|
| General | Ribbon tool names and panel order · Mouse · Your settings file | Profile & preferences · new · new |
| Files & saving | Folders: projects, LV Database, block library, recovery copies · Saving a drawing | ribbon, Database page, Blocks palette · Drafting settings › Saving |
| Display | Colour theme and palette · crosshair size, colour, outline · Show lineweights · a preview | Profile & preferences · Drafting settings › Cursor |
| Drafting | Tabs: Snap & grid, Polar tracking, Object snap, Dynamic input | Drafting settings (the snap aperture, marker size and snap name move from Cursor to Object snap) |
| Selection | Picking, picked objects, grips · a preview | Drafting settings › Selection |
| Plot & publish | What a new layout starts with · the printer · Page setups and Pen tables (Open…) | new · Plot dialogs |
| Shortcuts & aliases | Typed names and keys, which the user can add to | new |
| This drawing | Level, Units | Drafting settings › Drawing |

Typed: `OP`, `OPTIONS` open the page last used; `DS`, `SE` open Drafting at Snap & grid; `OS` opens Drafting at Object snap; `UN`, `UNITS` open This drawing. A right-click on a status-bar switch opens its page or tab, as before.

What makes it better than a list of pages:

- **Find a setting.** A box above the page list (Ctrl+F). Typing a few letters replaces the page with every matching setting from all pages. Each match is the real row, so the value can be changed there; "Go to page" opens where it lives.
- **What was changed.** An amber dot on every setting that is not at its default, a count beside each page, and a "Changed" page that lists them all.
- **Reset.** An arrow beside a changed setting puts that one back. Reset page is on every page.
- **Where it is kept.** Each section says: on this computer, the whole app, this project, or this drawing.
- **Previews** on Display and Selection: the cursor, pick box, grips, picked look, hover highlight and selection window at their real sizes and colours, before OK.
- **No page for 3D**, and no page that only holds buttons to other dialogs.

Kept as they are: all 48 rows of Drafting settings, with the same meaning and defaults; colour theme, palette, tool names and panel order also stay in Profile & preferences; the two plot managers open from Plot & publish and stay as they are. Nothing changes until OK; Esc, Cancel and × change nothing. A folder chosen with Change… is the one exception: it changes at once, as it does today from the ribbon.

New, not in the app before:

- **Mouse**: right-click in the drawing opens the menu or repeats the last command; the wheel's zoom step; reverse the wheel direction.
- **Your settings file**: Options, typed names, keys and the libraries on this computer (layer and layout templates, page setups, hatch patterns) exported to one file and imported on another computer; Reset all.
- **A new layout starts with**: a paper size, a page setup, and whether Page setup opens when a layout is made.
- **Typed names and keys**: a name of the user's own added to any command (the standard names stay); a name already in use is refused and the command that has it is named; the same for keys.

## Decisions (2026-11-23, all as recommended)

- **A.** One window. Drafting settings becomes the Drafting page of Options; `DS`, `OS` and `UN` open Options at their page.
- **B.** Find, the changed marks and reset are part of the first step.
- **C.** Previews on Display and Selection.
- **D.** All four new items are built, after the window itself.
- **E.** Colour theme and palette are shown in Options too, and stay in Profile & preferences.

## Build order

One PR per step.

1. **The window with every existing setting, Find, the changed marks and reset** (v2.276). `src/components/cad/CadOptions.tsx` replaces `CadDraftSettings.tsx`; `src/model/cadOptions.ts` lists every setting with its page, its default and how to reset it, so a setting added later cannot be left out (a test checks every drafting setting is listed). One new desktop channel shows a folder in the file manager.
2. **Previews** on Display and Selection.
3. **Shortcuts & aliases**: typed names and keys the user can add to.
4. **Your settings file**: export, import, reset all.
5. **Mouse and new-layout defaults.**
