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

## Decisions for the user

1. Approve the menu set, or pick which contexts to build first.
2. Suggested order: (a) blank canvas + command running + mixed selection, (b) LV device, board, route, room,
   (c) block, reference, underlay, (d) text, dimension, hatch, viewport, title block, hot grip.
3. Items that need new engine work (block editor, bind reference, compare revision, detect rooms from walls,
   fill ratio check) are listed but would ship greyed out or be left off until built. Which?
