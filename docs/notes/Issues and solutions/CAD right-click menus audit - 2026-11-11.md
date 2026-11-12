# CAD right-click menus audit - 2026-11-11

Checks every right-click item proposed against the code on `main` after PRs 519, 523, 524 and 526, plus the
status bar mockup (`docs/mockups/cad-status-bar-icons-mockup.html`) and the layout tabs mockup
(`docs/mockups/cad-model-layout-tabs-mockup.html`).

Key: ✓ built as proposed · ◐ built differently or in part · ✗ not built · **fix** fixed in v2.105.

## Why menus looked missing

The installed app was **2.099**: Phase 1 only. Phases 2–4 (v2.101–v2.103) were merged but not installed, so
device, room, block, reference, layout, text, dimension, hatch and grip menus were not in the app yet.

Defects found in the code (fixed in v2.105):

- Dimension style ▸ never showed: the page did not pass the style list to the menu.
- No Properties entry on any drawn-object menu (line, polyline, text, dimension, hatch, block, tray).
- No Cut anywhere (Ctrl+X did nothing); no Repeat on object menus.
- Layouts of the drawing itself (Layout1 from the file, and those made with +) had no right-click menu inside the
  paper. Only the project's plan sheets (E-LTG-001…) had one.
- The layout tab menu had no New layout or Plot.
- A reference's Properties opened an empty palette.
- ELV devices had no Rotate on their menu (ROTATE works for them).

## Design CAD menus

| Menu | Proposed item | Status |
|---|---|---|
| Blank canvas | Repeat, Recent commands ▸, Paste, Paste to original, Undo, Redo, Isolate ▸, Pan, Zoom, Zoom extents, Zoom previous, Select all, Quick select, Count, Properties, Options | ✓ |
| | Place device ▸, Draw route / tray | ◐ Place device, Cable route, Cable tray start their tools (no device list in the menu) |
| Command running | Enter, Cancel, Recent input ▸, prompt options, Snap overrides ▸, Ortho, Polar, Zoom | ✓ (also Object snap) |
| | right-click opens the menu | ◐ right-click is Enter when the prompt has no options; Shift+right-click opens the menu |
| | Snap overrides: Device insertion point, Route centreline | ✗ (needs new snap kinds) |
| | Pan | ✗ (PAN would end the command; wheel / middle button pan during commands) |
| Hot grip | Move, Copy, Rotate (from the grip), Add vertex, Remove vertex, Undo, Exit | ✓ (a grip clicked without dragging turns hot) |
| | Enter, Stretch, Scale, Mirror, Base point, Reference, Convert to arc | ✗ (no grip modes; dragging stretches) |
| Mixed selection | Clipboard, Erase, Move, Copy, Select similar, Add selected, Deselect all, Isolate ▸, Quick measure | ✓ (Cut **fix**) |
| | Filter by type ▸ with counts | ✓ **fix** (counts added) |
| | Properties, Repeat | ✓ **fix** |
| | Rotate, Scale, Mirror, Array with devices in the pick | ✗ (devices cannot be scaled or mirrored; drawn-only picks have Mirror, Scale, Array) |
| | Draw order ▸ with devices in the pick | ✗ (drawn-only picks have it) |
| Line / arc / circle | Offset, Trim, Extend, Break, Fillet, Chamfer, Join, Move, Copy, Rotate, Mirror, Erase, Select similar, Isolate, Draw order, Quick measure | ✓ (Chamfer and Join on lines and polylines) |
| | Properties, Repeat, Cut | ✓ **fix** |
| | Scale and Array for one line | ✗ (on several, and on arcs and circles) |
| Polyline | Close / Open, Join, Reverse, Explode, Offset, Area and length (Quick measure), Use as room boundary, Convert to cable route | ✓ |
| | Edit polyline ▸ flyout | ◐ its entries are on the menu directly |
| | Add vertex | ◐ on a hot grip's menu |
| | Width, Fit curve, Straighten | ✗ (polylines drawn here have no widths or arcs) |
| Text | Edit text, Find and replace, Justify ▸, Make all caps (Case ▸), Background mask, Select similar | ✓ (also Text height ▸, Frame ▸) |
| | Text style ▸ | ✗ (texts keep no style of their own) |
| | Properties | ✓ **fix** |
| Note (mtext) | Edit text, Width, Justify, Find and replace | ✓ |
| | Case, mask, frame | ✗ (texts only) |
| Dimension | Edit dimension text, Precision ▸, Remove override | ✓ (also Text position ▸) |
| | Dimension style ▸ | ✓ **fix** (never showed before) |
| | Flip arrow, Reset text position | ✗ (no text place of its own) |
| Hatch | Recreate boundary, Send behind (Draw order ▸), Area (Quick measure) | ✓ (also Hatch scale ▸, angle ▸) |
| | Edit hatch… | ◐ Properties **fix** |
| | Set origin, Separate hatches | ✗ (one outline, no origin) |
| Block drawn here | Edit attributes, Replace with another block ▸, Reset (attributes), Explode, Select all instances, Count instances | ✓ |
| | Edit in place, Block editor, Redefine from file, Add to legend | ✗ |
| Block of the drawing | Count instances, Explode, Copy as a block, Crop, Erase | ✓ |
| | Select all instances | ✗ (the engine lists inserts without what the canvas needs to highlight them) |
| Reference | Open, Clip ▸ (New boundary, Remove clip), Fade ▸, Reload, Unload, Detach, Bind, Reference layers (palette) | ✓ (Polygonal boundary is New boundary with more corners) |
| | Properties | ✓ **fix** (opens the References palette; it showed an empty one) |
| | Invert clip, Isolate, Lock position, Move, Compare with new revision, Detect rooms from walls, Edit in place | ✗ |
| Image / PDF underlay | all | ✗ (the app has no underlays) |
| Viewport, plan sheet layout | Activate, Viewport scale ▸, Lock display, Plot, Page setup, Properties | ✓ (also Frame prints, Erase viewport) |
| | Maximise viewport | ◐ Show on the Model tab (zoomed to its area) |
| | Freeze layer, Layer overrides | ◐ Viewport layers… (the layer palette with its This viewport column) |
| | Clip viewport, Custom… scale | ✗ (VPSCALE takes any scale typed) |
| Viewport, drawing's own layouts and + layouts | — | ✓ **fix**: Show on the Model tab; Viewport scale ▸ (+ layouts); New layout; Rename, Copy, Delete (+ layouts); Model tab |
| Title block (plan sheet paper) | Issue status ▸, Sheet list | ✓ (right-click anywhere on the paper outside the viewports) |
| | Edit title block fields | ◐ Page setup and title block… (opens the sheet in Sheets) |
| | Add revision, Replace template, Update from project info | ✗ |
| LV device | Circuit ▸ (with Draw home-run), Swap device type ▸, Select same circuit, Select same type, Show in load schedule, Show in SLD, Erase, Move, Copy, Properties | ✓ |
| | Repeat | ✓ **fix** |
| | New circuit, Link with previous, Remove from circuit, Assign to board, Tag / label, Align to wall, Rotate, Cut / Copy to clipboard, Edit device | ✗ |
| Board | Open board, Load schedule, Show in SLD, Show in riser, Select all fed devices, Draw home-runs, Rename, Feeder cable (cable schedule), Erase, Move, Properties | ✓ |
| | Circuits on plan ▸ | ◐ Select all fed devices |
| ELV device | Swap device (System ▸), Select same type, Show in ELV schedule, Coverage, Erase, Move, Copy, Properties | ✓ |
| | Rotate | ✓ **fix** |
| | Loop / zone ▸, Assign to panel / rack, Tag, Select same loop | ✗ (no loops, zones or panels on ELV devices) |
| Tray / route | Size tray from cables, Cables in this route, Reverse, Trace circuit, Fill ratio check, Offset, Erase, Move, Copy | ✓ (Break and Fillet too) |
| | Properties | ✓ **fix** |
| | Add fitting ▸, Split at point, Join runs, Length and label | ✗ (fittings are found from the runs; Break splits) |
| Room (Room ▸ on the blank menu inside an outline) | Light room, Lux check, Emergency lighting, Rename, Room type, Select devices, Room loads, Area | ✓ (only for rooms with an outline) |
| | Place devices ▸ | ◐ Fill with an ELV device |
| | Edit boundary, Properties | ✗ |

## Status bar (cad-status-bar-icons-mockup)

| Item | Status |
|---|---|
| Switches as icons, lit when on, key in the tooltip; Fit and Drafting settings | ✓ (since v2.090) |
| Object snap ▾ with running modes, Select all, Clear all, Object snap settings… | ◐ 9 of the mockup's 12 modes: Extension, Tangent and Parallel are not in the snap engine |
| Polar ▾ with 90 / 45 / 30 / 22.5 / 15 / 10°, Tracking settings… | ✓ (also 18° and 5°) |
| Right-click a switch: its settings tab (Grid, Snap: Snap and grid; Ortho, Polar: Polar tracking; Object snap; DYN: Dynamic input; LWT: Cursor and display) | ✓ |
| Right-click Object snap tracking: Object snap tab | ◐ opens Polar tracking, where its Track along setting is |
| Snap ▾ (Grid snap · Polar snap) | ✗ (there is no polar snap; Snap is grid snap only) |

Open question: right-click on Object snap and Polar opens Drafting settings (as the mockup says). Many users expect
the ▾ list there instead. Decide which.

## Layout tabs (cad-model-layout-tabs-mockup)

| Item | Status |
|---|---|
| Model, the file's own layouts, layouts made with +, plan sheets, + | ✓ |
| New layout on the tab menu | ✓ **fix** |
| Rename, Delete, Move (left / right), Copy | ✓ (+ layouts and plan sheets; the file's own are shown as saved) |
| Page setup… | ✓ plan sheets only |
| Plot… | ✓ **fix** plan sheets |
| From template…, Select all layouts, Show tabs above the status bar, F2 to rename | ✗ |

## SLD

The right-click plan covered Design CAD only. The SLD diagram has no canvas right-click menu; right-click works
in the board tree (PanelTree) and on Sheets (sheet tabs). The CAD menus link to the SLD (Show in SLD, Open board,
Show in riser), and those open the Design page with the board or circuit selected.
