# UI UX proposals - 2026-11-11 - Context-aware right-click menus

Status: proposal, waiting for approval. Nothing implemented.

Mockup: [cad-context-menus-mockup.html](../../mockups/cad-context-menus-mockup.html) (PNG beside it).

## Today

`contextAt` in `src/components/cad/CadPage.tsx` shows one of four menus:

- command running: Enter, the prompt's options, Cancel;
- device or drawn object picked: the edit menu (`menuAt`);
- object of an opened drawing: Erase only;
- nothing: Repeat and up to five recent commands.

## Proposal

The canvas right-click opens a menu chosen by what is under the cursor or picked.

| Context | Key items |
|---|---|
| Blank canvas | Repeat, Recent commands ▸, Paste, Undo/Redo, Isolate ▸, Pan, Zoom, Select all, Quick select, Count, Place device ▸, Properties |
| Command running | Enter, Cancel, Recent input ▸, prompt options, Snap overrides ▸ (adds device insertion point, route centreline), Ortho, Polar |
| Hot grip | Stretch, Move, Rotate, Scale, Mirror, Base point, Copy, Add/Remove vertex |
| Mixed selection | Clipboard, common edits, Filter by type ▸ with counts |
| Line / arc / circle | Clipboard, edits, Offset, Trim/Extend, Break, Fillet, Join |
| Polyline | Edit polyline ▸, Reverse, Explode, Area and length, Use as room boundary, Convert to cable route |
| Text / dimension / hatch | Edit text, Find and replace, Justify; Dimension style, Flip arrow, Reset text; Edit hatch, Set origin, Recreate boundary |
| Block / typical / group | Edit in place, Block editor, Edit attributes, Replace, Redefine, Explode, Select all instances, Count, Add to legend |
| Reference drawing | Open, Edit in place, Clip ▸, Fade ▸, Reload, Unload, Detach, Bind, Reference layers ▸, Compare with new revision, Detect rooms from walls |
| Image / PDF underlay | Calibrate scale, Clip, Fade, Monochrome, Snap to underlay, Reload, Detach |
| Viewport (layout) | Maximise, Activate, Viewport scale ▸, Lock display, Freeze layer in this viewport, Plot, Page setup |
| Title block | Edit fields, Add revision, Issue status ▸, Update from project info |
| LV device | Circuit ▸, Assign to board, Swap device type, Tag ▸, Select same circuit / type, Show in load schedule, Show in SLD, Align to wall |
| Distribution board | Open board, Load schedule, Show in SLD / riser, Select all fed devices, Draw home-runs, Feeder cable |
| Cable route / tray | Size tray from cables, Cables in this route, Add fitting ▸, Split, Join, Trace circuit, Fill ratio check |
| Room | Room lighting, Lux check, Emergency lighting, Room type ▸, Place devices in room ▸, Room loads |
| ELV device | System ▸, Loop / zone ▸, Assign to panel / rack, Select same loop, Show in ELV schedule, Coverage |

Order in every menu: repeat/recent, context actions, clipboard, common edits, selection, view, Properties.
Rarely used actions go in flyouts so no menu is longer than about 20 rows.

## Phases (approved 2026-11-11)

Rule for every phase: each menu item must run a working tool. Before a menu ships, every item is checked against
`src/components/cad/cadCommands.ts` and the page; a missing tool is built in the same phase (with tests), or the
item is left off the menu and listed below. No greyed-out placeholders.

### Phase 1 — blank canvas, command running, mixed selection

| Item | Tool today | Phase 1 work |
|---|---|---|
| Repeat, Recent commands ▸ | `recent` list | move into a flyout |
| Paste, Paste to original coordinates | PASTECLIP, PASTEORIG | none |
| Undo, Redo | app history (⌘Z, ⇧⌘Z) only | new UNDO / REDO commands; menu shows the next step's state |
| Isolate ▸ (Isolate objects, Hide objects, End isolation) | layers only (LAYISO) | new ISOLATEOBJECTS, HIDEOBJECTS, UNISOLATEOBJECTS (view only, not saved) |
| Pan | wheel, middle button, Space-drag | new PAN (P): left-drag pans until Esc or Enter |
| Zoom window / previous / extents | Z W, Z P, ZE | none |
| Select all | none | new SELECTALL (Ctrl+A): shown, unlocked drawn objects and devices |
| Quick select… | QSELECT | none |
| Count | none | new COUNT: picked (or all) objects by kind and block name, to the command history |
| Place device, Cable route, Cable tray | DEV, CR, CT | none |
| Properties, Options… | Ctrl+1 dock, DSETTINGS | none |
| Command: Enter, options, Cancel | prompt options | none |
| Command: Recent input ▸ | none | the last values typed at a prompt, re-entered on pick |
| Command: Snap overrides ▸ | none (modes only in DSETTINGS) | one-shot snap: the next point snaps to that mode only |
| Command: Ortho, Polar, Object snap | ORTHO, POLAR, OSNAP | none |
| Selection: Clipboard, edits, Filter, Draw order, Select similar | yes | none |
| Selection: Deselect all | Esc only | menu item |
| Selection: Add selected | none | new ADDSELECTED: the draw tool of the object picked, on its layer |
| Selection: Quick measure | none | new QUICKMEASURE (QM): total length and closed area of the objects picked |

### Phase 2 — LV and ELV objects

Device, distribution board, cable route / tray, room, ELV device. Tools to check first: circuit assign and
remove, swap device type, select same circuit / type / loop, show in load schedule / SLD / riser, draw home-runs,
size tray from cables, cables in route, fill ratio, trace circuit, room loads, place devices in room.

### Phase 3 — blocks, references and sheets

Block / typical / group, reference drawing, image / PDF underlay, viewport, title block. Tools to check first:
edit block in place, block editor, replace / redefine / reset block, reference reload / unload / bind / fade,
underlay fade / monochrome, viewport maximise / lock / freeze layer, title block revision and issue status.

### Phase 4 — drawn-object detail and grips

Line / arc / circle, polyline, text, dimension, hatch, hot grip. Tools to check first: polyline edit (width, fit,
straighten, add / remove vertex, reverse), find and replace, dimension flip / reset / override, hatch origin /
recreate boundary / separate, grip Base point / Copy / Reference.

## Decisions still open

1. Engine-heavy items (block editor, bind reference, compare revision, detect rooms from walls, fill ratio):
   build in their phase, or leave off and record here.
