# UI UX proposals - 2026-11-11 - Context-aware right-click menus

Status: approved 2026-11-11. Phase 1 shipped in v2.099, Phase 2 in v2.101, Phase 3 in v2.102, Phase 4 in v2.103.
Audit of what was built against this plan and the other mockups: [[CAD right-click menus audit - 2026-11-11]] (fixes in v2.105).

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

### Phase 2 — LV and ELV objects (built in v2.101)

| Item | Tool before | Phase 2 work |
|---|---|---|
| Device: Circuit ▸ | toolbar Circuit list | in the menu, with Draw / Remove home-run (Wire one) |
| Device: Swap device type ▸ | toolbar Replace | in the menu |
| Device: Select same circuit, Select same type | none | new |
| Device: Show in load schedule, Show in SLD | none | new: opens the board's load schedule, or the SLD at the circuit |
| Device: Align, Space, Array on line, Match, Move, Copy, Erase | yes | none |
| Board: Open board, Load schedule, Show in SLD, Show in riser, Feeder cables | none | new: the board diagram, load schedule, SLD, riser, cable schedule |
| Board: Select all fed devices, Rename | toolbar Circuits, Rename | none |
| Board: Draw home-runs | WC (whole level) | new: this board's circuits only |
| ELV: Swap device (same system), Coverage, Match | yes | none |
| ELV: Select same type, Show in ELV schedule | none | new |
| Tray: Size tray from cables | Cable tray page only | new: the drawn tray takes the width its route's cables need |
| Tray: Fill ratio check, Cables in this route | Cable tray page only | new: fill at the drawn width against the route's limit |
| Tray / route: Reverse direction | none | new |
| Cable route: Trace circuit, Show in SLD | none | new |
| Room ▸: Light room, Emergency lighting, Fill with an ELV device | LUX, EM, FILL | started on the room right-clicked |
| Room ▸: Lux check, Room loads, Select devices in room, Area | none | new |
| Room ▸: Rename room, Room type | Building information only | new: typed on the command line |

The room tools sit in a Room ▸ flyout at the top of the blank-canvas menu when the right-click is inside a room
with an outline, so the blank-canvas items stay on every right-click inside the building.

Left off (no tool yet; each needs a decision or a data-model change):

- Device: Align to wall (needs wall detection from the architect's lines), Tag / label ▸ (no device tags yet; wire
  tags stay TAGS), New circuit / Link with previous (circuits are made on the SLD).
- Device: Cut / Copy to the clipboard (devices stay on their plan; CO copies them).
- Tray: Add fitting ▸ (fittings are found from the drawn runs; none are placed by hand), Split / Join (BR and J
  on the drawn-object menu do it).
- Room: Edit boundary (Phase 4 grips), Place devices ▸ other than Fill.
- ELV: Loop / zone ▸, Assign to panel / rack, Select same loop: ELV devices have no loop, zone or panel yet.

### Phase 3 — blocks, references and sheets (built in v2.102)

| Item | Tool before | Phase 3 work |
|---|---|---|
| Block drawn here: Edit attributes, Select all of this block, Explode | ATE, menu, X | none (Explode now on the menu) |
| Block drawn here: Count instances | none | new |
| Block drawn here: Replace with another block ▸ | none | new: the drawing's blocks; attribute values with the same tag kept |
| Block drawn here: Reset attributes | none | new: back to the definition's default values |
| Block of the opened drawing: Erase | menu | none |
| Block of the opened drawing: Count instances | none | new |
| Block of the opened drawing: Explode into drawn objects | CROP only | new: its pieces become drawn objects, the block erased from the drawing (RESTOREDWG brings it back) |
| Block of the opened drawing: Copy as a block of this drawing, Crop… | INSERT palette, CROP | started on the block right-clicked |
| Reference: Clip ▸, Fade ▸, Reload, Unload / Load, Detach, Bind, Print on sheets | References palette (XR) | on the reference right-clicked (new hit test on its shown lines) |
| Reference: Open reference | none | new: its tab, or the file where it was found |
| Reference: Reference layers…, References… | LM, XR | none |
| Viewport: Activate, Scale ▸, Lock display, Viewport layers…, Erase | MS, VPSCALE, VPLOCK, LM, Viewport panel | on the viewport right-clicked |
| Viewport: Frame prints | Viewport panel | in the menu |
| Viewport: Show on the Model tab | none | new: the Model tab zoomed to the viewport's area |
| Paper: New viewport, Legend / Notes table, Plot, Page setup, Model tab | MV, LEGEND, NOTES, PLOT, PAGESETUP, MODEL | none |
| Paper: Issue status ▸ | drawing register | new: the sheet's status from the list of issue statuses |
| Paper: Sheet list | drawing register | new: opens it |

Left off (no tool yet; each needs a decision or engine work):

- Image / PDF underlay: the app has no image or PDF underlays in Design CAD, so the whole menu waits for an underlay
  feature (attach, calibrate, fade, clip, save to DWG).
- Block: Edit block in place, Block editor, Redefine from file; for the opened drawing's blocks, Select all
  instances (the engine lists inserts without what the canvas needs to highlight them).
- Reference: Edit in place, Invert clip, Isolate reference, Lock position, Move, Compare with new revision, Detect
  rooms from walls.
- Viewport: Clip viewport (polygonal viewports), Freeze layer by picking an object (Viewport layers… does it from
  the list).
- Title block: Add revision (issuing stays in the drawing register, with its transmittal), Replace template, Update
  from project info (the title block already reads the project's information).
- Layouts saved in the drawing file, and those made with +, have no paper menu yet: their viewports are not edited
  here (as MV / VPSCALE say).

### Phase 4 — drawn-object detail and grips (built in v2.103)

| Item | Tool before | Phase 4 work |
|---|---|---|
| Line: Offset, Trim / Extend, Break, Fillet | yes | none |
| Line / polyline: Join…, Chamfer | J, CHA | on the menu (Chamfer starts on the object picked) |
| Line / polyline: Reverse direction, Convert to cable route | trays and routes only, LR (lines of the drawing) | on every line and polyline; the cable chosen for CR |
| Polyline: Close / Open, Explode | X | new Close / Open; Explode on the menu |
| Polyline: Use as room boundary | Room area, Trace | new: a closed polyline's area as a room to add |
| Text: Edit text, Select similar | yes | none |
| Text: Find and replace… | none | new FIND: any case, in texts, notes, attributes and dimension texts drawn here, one undo step |
| Text: Justify ▸, Text height ▸, Case ▸, Frame ▸, Background mask | TJ, TH, TC, TFRAME, TMASK (pick, then type) | on the text right-clicked, at once |
| Dimension: Edit text, Dimension style ▸, Precision ▸, Text position ▸, Remove text override | ED; style for new ones only | new for the dimension right-clicked |
| Hatch: Hatch scale ▸, Hatch angle ▸, Recreate boundary | Properties | new on the menu |
| Hatch: Send behind, Area | Draw order ▸, Quick measure | none |
| Hot grip: Move / Copy / Rotate from this point | MOVE, CO, RO (base point clicked) | new: a grip clicked without dragging turns hot; its menu starts the tool from it |
| Hot grip: Add vertex, Remove vertex, Close / Open | none | new |
| Hot grip: Undo, Exit | UNDO, Esc | none |

Left off (no tool yet; each needs a decision or a data-model change):

- Polyline: Width, Fit curve, Straighten, Convert to arc (polylines drawn here have no widths or arcs).
- Text: Text style ▸ (texts keep no style of their own; the style is for new text).
- Dimension: Flip arrow, Reset text position (a dimension's text has no place of its own yet).
- Hatch: Set origin, Separate hatches (a hatch drawn here has one outline and no origin).
- Hot grip: Stretch / Scale / Mirror modes, Base point, Reference (dragging the grip stretches; the rest wait for
  grip modes). A hot grip shows on the command line, not in another colour.

## Decisions still open

1. Engine-heavy items (block editor and edit block in place, edit reference in place, compare with a new
   revision, detect rooms from walls): build them, or leave them off. Fill ratio (Phase 2) and Bind (Phase 3) were
   already there.
2. ELV loops, zones and panels / racks: add them to ELV devices (then Loop / zone ▸, Assign to panel and
   Select same loop can be built), or leave the ELV menu as it is.
3. Align to wall and device tags: build, or leave off.
4. An image / PDF underlay feature for Design CAD (attach, calibrate scale, fade, clip, save to DWG): build it as
   its own piece of work, then its menu.
5. Status bar: decided 2026-11-12 — right-click on Object snap and Polar opens their ▾ list (it ends with their
   settings); the other switches still open their Drafting settings tab (v2.106).
