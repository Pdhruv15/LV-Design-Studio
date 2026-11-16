# UI UX proposal – Design CAD right-click menu: look and order (2026-11-16)

Status: **approved 2026-11-16 with the five recommended answers** ("go ahead, … all the options we proposed"): one "Line tools ▸" list, electrical icons in amber, Undo / Redo name the step, Invert selection and Zoom to selection added, and the cut-off menu fixed first in its own PR. The user asked for every step to be completed, with a report of what is done and what is pending at each stage.

Progress: step 1 (menus kept inside the drawing) in PR 627 (v2.163). Steps 2 and 3 next.

On 2026-11-16 the user sent a picture of the right-click menu for picked objects in a current industrial 2D drafting product. It was a reference only, not to be copied. They asked why the app's right-click menus don't look like it, what is missing, what could be added, and how it would look in the app's own style.

Mockup: `docs/mockups/cad-right-click-redesign-mockup.html` (image: `cad-right-click-redesign-mockup.png`). Section 1 was drawn from the app's own menu code and stylesheet. It was not taken from a screenshot.

![Design CAD right-click menus, today and proposed](../../mockups/cad-right-click-redesign-mockup.png)

Related: [[UI UX proposals - 2026-11-11 - Context-aware right-click menus]] (which entries each menu has: approved and built in v2.099–v2.105) and [[UI UX proposals - 2026-11-15 - CAD selection, grips and opened drawings]] (its step 2 makes objects of an opened drawing editable).

## Today

`contextAt` (`src/components/cad/CadPage.tsx:1711`) picks the menu. Two different components draw it.

| Right-click on | Entries | Drawn by |
|---|---|---|
| Nothing picked | 19: Repeat, Recent commands ▸, Paste, Paste to original, Undo, Redo, Isolate ▸, Pan, three Zoom rows, Select all, Quick select…, Count, Place device, Cable route, Cable tray, Properties, Options… | `CadPromptMenu` (`CadCommandLine.tsx:84`) from `blankMenu` |
| A command waiting | Enter if the prompt has no options. Otherwise, or with Shift: 11 entries (Enter, Cancel, Recent input ▸, the options, Snap overrides ▸, Object snap, Ortho, Polar, Zoom previous, Zoom extents) | `CadPromptMenu` from `commandMenu` |
| One picked line | 26, in this order: Repeat, Join…, Chamfer, Reverse direction, Convert to cable route, Trim, Extend, Offset, Break, Fillet, Mirror, Move, Copy, Rotate, Erase, Draw order ▸, Make block…, Select similar, Quick select…, Clipboard ▸, Isolate ▸, Add selected, Quick measure, Count, Deselect all, Properties | the floating edit toolbar turned into a list (`SketchToolbar`, `SketchEditPanel.tsx:73`, entries built at `:109`) |
| Three picked lights | 18: Repeat, Circuit ▸, Swap device type ▸, Select same circuit / type, Show in load schedule, Show in SLD, Align ×2, Space equally, Match, Move, Copy, Erase, Isolate ▸, Count, Deselect all, Properties | `CadPromptMenu` from `deviceMenu` (`cadObjectMenus.ts:70`) |
| An object of an opened DWG / DXF | 3: Erase, Deselect all, Properties (a block also gets Count instances, Explode, Copy as a block, Crop) | `CadPromptMenu` from `drawingObjectMenu` (`cadSheetMenus.ts:21`) |
| Hot grip, reference, viewport, layout paper | as built in the 2026-11-11 plan | `CadPromptMenu` |

How these menus differ from the reference:

1. **The menu is cut off near the drawing's edges (a defect).** It opens 4 px from the cursor without checking the edges (`CadPage.tsx:4176`, `:4182`), and the drawing area clips what runs past them (`.cad-stage{overflow:hidden}`, `src/styles.css:1891`). After a right-click in the lower part of the drawing, the end of a long menu can't be reached. The picked-line menu is 716 px tall (measured in the mockup), so any right-click less than about 720 px above the bottom edge cuts some of it off, starting with Count, Deselect all and Properties. Lists (▸) always open at the menu's top-right (`styles.css:1907`), not beside their row, even at the right edge.
2. **No icons.** Every entry is text only. The ribbon's icons for the same tools aren't used.
3. **No fixed order.** Each kind's menu has its own order. On a picked line, Chamfer and Fillet are seven rows apart, Clipboard ▸ is in the middle, and there is one divider (before Move). The drawn-object menu shows no keys, while the other menus do. Picked drawn objects get a header naming them, but picked devices don't.
4. **Two entries are both called Copy:** the CO tool, and Copy under Clipboard ▸ (Ctrl+C).
5. **Missing compared with the reference:** Undo, Redo, Pan, Zoom and Options… on object menus. Invert selection (no command exists). A state on Properties (whether the palette shows). Scale for one line.
6. **Arrows and on/off are typed characters in the labels** ("Filter ▾", "Clipboard ▸", "F3 · on"). `docs/DESIGN-SYSTEM.md:71` rules these out in the app's chrome. The arrow keys don't move through the menu.
7. **An object of an opened drawing gets three entries.** This is probably what the user ran into, because it is furthest from the reference. Step 2 of the approved selection plan fixes it.

## Proposal

### One order for every menu

The order follows what CAD users expect (close to the reference, not copied). Groups are separated by dividers. A group shows only the entries that work for what is picked; one that never applies is left off rather than greyed (the rule of the 2026-11-11 plan).

| # | Group | Picked drawn objects | Picked devices |
|---|---|---|---|
| 0 | Header | kind icon, **Line** · 2.34 m · layer | **3 × Downlight** · DB-GF1/L3 |
| 1 | Repeat | Repeat LINE | Repeat DEV |
| 2 | The kind's own tools | one list: **Line tools ▸**: Trim, Extend, Offset, Fillet, Chamfer, Break, Join…, Reverse direction, Convert to cable route, Quick measure, Add selected, Make block… | up to five rows, icons in the accent amber: Circuit ▸, Swap device type ▸, Show in SLD, Show in load schedule, Arrange ▸ (align, space, array on line, match) |
| 3 | Clipboard, undo | Clipboard ▸, Undo, Redo | Undo, Redo (devices don't use the clipboard) |
| 4 | Modify | Erase, Move, Copy selection, Scale, Rotate, Mirror, Draw order ▸ | Erase, Move, Copy selection (Rotate for one ELV device) |
| 5 | View | Isolate ▸, Pan, Zoom ▸ (window, to selection, previous, extents) | same |
| 6 | Select | Select similar, Invert selection, Deselect all, Quick select…, Filter ▸ (when several kinds are picked), Count | Select same circuit, Select same type, Invert selection, Deselect all, Count |
| 7 | Palette | Properties (checked when the palette shows), Options… | same |

This gives 22 entries for a picked line (26 today; 615 px tall against 716 px, both measured in the mockup) and 21 for three lights (18 today, with Undo, Redo, Pan, Zoom, Invert selection and Options… added).

The rest keep their entries in the new look:

- **Nothing picked (17, or 18 inside a room):** Room ▸ on top inside a room outline. Then Repeat, Recent commands ▸, Paste, Paste to original coordinates, Undo, Redo, Isolate ▸, Pan, Zoom ▸, Select all, Quick select…, Count, Place device, Cable route, Cable tray, Properties, Options…. The three Zoom rows become one Zoom ▸ list.
- **A command waiting (10):** the header shows the prompt. Entries: Enter, Cancel, the prompt's options, Recent input ▸, Snap overrides ▸, then Object snap, Ortho and Polar, each with a check when on, and Zoom ▸. A right-click is still Enter when the prompt has no options.
- **Several kinds picked:** only what works for all of them. Filter ▸ narrows the pick by kind and shows the counts.
- **Hot grip, reference, viewport, paper and block menus:** same look, with the view, select and palette groups at the end where they apply.

Two things from the reference are left out on purpose. **Recent input** is not added to object menus: it lists values typed at a prompt, so it stays on the command menu. A separate **Filter… dialog** is not added either: Quick select… already picks by kind, layer and property, and Filter ▸ narrows the current pick.

### Look

- **Icons (16 px):** each entry uses the ribbon's own icon for the same tool (Move, Copy, Scale, Rotate, Mirror, Erase, Draw order, Isolate…), so the menu and the ribbon read alike. An entry without an icon keeps an empty slot, so the labels line up.
- **Colours:** electrical tools have their icon in the accent amber (`--acc`). Erase has its icon in `--bad`.
- **Right column (11 px, muted):** the shortcut (Ctrl+Z) or the typed command (M, CO, SC, RO, MI, QS, OP), so the menu teaches the commands.
- **Lists:** an entry with a list ends in a chevron icon (`ChevronRight`), and the list opens beside its row.
- **On/off:** an amber check icon (`Check`) after the key, with `role="menuitemcheckbox"` and `aria-checked`, as in the ribbon's split menus. In a list, the current choice shows the check and the word "now".
- **Greyed:** only entries not available at the moment, such as Paste with an empty clipboard or Redo with nothing to redo.
- **Panel:** the panel colour, 9 px radius, shadow, 24 px rows and 12 px text are today's tokens. The header is 28 px, with a divider under it.
- **Copy:** the CO entry is renamed **Copy selection**, so it doesn't read like the clipboard's Copy.

### Inside the drawing, and the keyboard

- The menu opens right and down from the cursor. Near the bottom edge it opens upward. Near the right edge it opens to the left, and so do its lists. If it is taller than the drawing, the list scrolls and the header stays.
- Keys: Up / Down move, Right opens a list, Left closes it, Enter runs, Esc closes. A letter jumps to the next entry starting with it. Shift+F10 or the menu key opens the menu at the picked objects.

### Work needed

| Entry or behaviour | Today | Work |
|---|---|---|
| Menu kept inside the drawing | no | placement after the menu has its size; lists beside their row; scrolling (fixes the defect) |
| Invert selection | no command | new `SELECTINVERT`: picks every shown, unlocked drawn object and device that isn't picked now, and drops what was picked |
| Zoom to selection | none | new `Z O` (`ZOOM O`): the view fits the picked objects |
| Undo / Redo with the step's name | history keeps no names (`src/model/history.ts`) | each step keeps the name of the command that made it; plain Undo when it has none |
| Undo, Redo, Pan, Zoom, Options… on object menus | blank menu only | entries only (the commands exist); check that Pan keeps the pick |
| Scale for one line or polyline | on several only | entry only (SCALE works) |
| Icons, keys, checks, header, keyboard | none | one menu component for every right-click menu; entries carry an icon name |

## Decisions

My recommendation is first in each.

1. **The kind's own tools on drawn-object menus:** one "Line tools ▸" list (22 entries for a line; the floating edit toolbar above the picked objects keeps Trim, Extend, Offset, Break and Fillet one click away), **or** flat as today (26 entries).
2. **Electrical tools:** icons in the accent amber, **or** grey like the rest.
3. **Undo / Redo:** name the step ("Undo Offset"), **or** plain Undo / Redo.
4. **Invert selection and Zoom to selection:** add both, **or** leave them off.
5. **Order of work:** fix the cut-off menu first as its own small PR (a defect, no change in look). Then the look and order. The opened drawing's objects get the same menu with step 2 of the selection plan. **Or** do all of it in one PR.

## Steps

1. **Kept inside the drawing** (the defect): placement for every `cad-ctx` menu and its lists, with tests for each edge.
2. **Look and order:** one menu component (header, icon, key, check, list, keyboard). Every menu builder returns its groups in the order above. Add `SELECTINVERT`, `Z O` and named undo steps if decided. Tests: the group order for each kind, every `cmd` resolves (the existing test), no entry that never applies, the keyboard.
3. **Opened drawings:** with step 2 of the selection plan, `dw:` picks use the drawn-object menu.
