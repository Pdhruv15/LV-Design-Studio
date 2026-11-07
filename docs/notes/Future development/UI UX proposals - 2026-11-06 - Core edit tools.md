# UI / UX proposal — Core edit tools in Design CAD (2026-11-06)

Mockup: [cad-core-edit-mockup.html](../../mockups/cad-core-edit-mockup.html)

The user asked on 2026-11-06 for core edit tools after the device edit tools (PR 424, v2.039). Approved by the user on 2026-11-06 and built in v2.040 (`src/model/cadEdit.ts`, `src/components/cad/SketchEditPanel.tsx`).

## Proposal

These tools work on what is **drawn in the app**: lines, polylines, rectangles, arcs, cable trays and cable routes. The architect's drawing is never changed. Its walls (on shown layers) can be the cutting edge for Trim and the boundary for Extend.

| Tool | Command | What it does |
|---|---|---|
| Trim | TR | Click the part to cut away. It is cut at the nearest crossing lines, drawn or the architect's, with no edges to pick first (as AutoCAD's quick mode). Shift-click extends instead. Drag a fence to trim several at once. |
| Extend | EX | Click near an end. It runs on to the next line ahead, drawn or a wall. Shift-click trims instead. |
| Offset | O | Type the distance (or T for through a point), click the object, then click the side. A tray offsets as a tray of the same width, service and route; a cable route offsets as a line. |
| Fillet / Chamfer | F / CHA | Two lines: join the corner with a radius (0 gives a sharp corner) or cut it at a distance. On a tray run the radius is the bend's, and the bend counts as a fitting. |
| Break / Join / Explode | BR / J / X | Break: split at a point, or take out the part between two points. Join: merge lines and polylines that meet end to end. Explode: turn a polyline or rectangle into lines. |
| Mirror / Scale / Stretch | MI / SC / S | Mirror: about a line, keeping the originals or not. Scale: about a base point, by a factor or a reference length. Stretch: move the points inside a crossing window, so a tray run gets longer while its far end stays put. |
| Array | AR | Copies of drawn objects, rectangular (rows × columns) or polar. Devices use Array on line (ARL). |
| Grips | — | A picked drawn object shows square grips at its ends and corners and at each mid-point. Drag an end to move it; drag a mid-point to move that side. |

- **Toolbar beside what is picked**, as for devices. Right-click gives the same options as a menu.
  - Line or route: Trim, Extend, Offset, Break, Fillet, Mirror, Move, Copy, Rotate, Erase.
  - Tray: Offset, Break, Fillet (bend), Width ▾, Move, Copy, Erase.
  - Several: Join, Mirror, Scale, Array, Move, Copy, Erase.
- **Window selection** picks drawn objects and devices together. Filter keeps one kind.
- **Ribbon (Draw sub-tab):**
  - Mirror, Scale and Stretch join the Modify group.
  - Trim, Extend, Offset, Fillet, Chamfer, Break, Join, Explode and Array form a new **Edit** group.
- **Undo:** each edit is one step.
- **Trays and routes** keep their tray route, cable and width through every edit, so **Update schedules** gives the new lengths and fittings.

## Decisions for the user

1. Screen as in the mockup: **approved** (2026-11-06).
2. Edges for Trim and Extend: not answered; built as proposed, with every line on shown layers and no picking first. Still open.
3. One release or two: built in **one** (v2.040).
4. Built differently from the mockup: **TR** stays Trace (a room) as before, so Trim is **TRIM** or **TM** on the command line. Trays fillet into a sharp corner only (the bend is the fitting's). A cable route cannot be exploded; break it instead. Fence trim is not built yet.
