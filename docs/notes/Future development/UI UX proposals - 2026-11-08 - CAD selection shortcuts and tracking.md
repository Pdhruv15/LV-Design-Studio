# UI / UX proposal — Design CAD selection, shortcuts and tracking (2026-11-08)

Status: **waiting for user approval**. This note records the requested interaction changes. It does not approve or implement them.

## Request interpreted

- `Ctrl+A` / `Cmd+A` selects all appropriate objects in the current drawing.
- A left-to-right window selects only objects fully inside it; a right-to-left crossing window also selects objects that it touches.
- Right-click offers selection and edit tools for the current selection.
- Keep short drafting commands for Erase, Move, Copy, Mirror, Offset and the other common edit operations.
- Add object-snap tracking, polar tracking at selectable angles, and tracking from centres and intersections.

The unclear word in the request has provisionally been interpreted as **Fillet**, command `F`. Confirm before implementation if a different tool was meant.

## What already exists

- Window selection already uses the requested directions: left to right is fully enclosed; right to left is crossing.
- Right-click on an editable object or an existing selection already opens its applicable edit tools.
- `E` / `ERASE`, `M` / `MOVE`, `CO` / `COPY`, `MI` / `MIRROR`, `O` / `OFFSET` and `F` / `FILLET` are already typed commands. Delete and Backspace erase a selection when focus is on the drawing.
- Object snap already recognises endpoint, midpoint, centre, intersection, insertion, node and quadrant points. `F3` toggles object snap; `F8` toggles ortho.

The missing parts are select-all and richer selection commands, perpendicular/nearest/tangent snaps, acquired-point tracking, and configurable polar tracking.

## Proposed selection behaviour

### Select all

`Ctrl+A` on Windows/Linux and `Cmd+A` on macOS selects every **editable, visible and unlocked** device and app-drawn object in the current model or layout.

- It does not select geometry in the architect's drawing or an attached reference because those objects cannot currently be edited in Design CAD.
- It does not select objects on off, frozen or locked layers.
- It applies only while the Design CAD drawing or command area has focus. A text field, table, palette field or dialog keeps its normal select-all behaviour.
- The typed command `A` remains Arc. The modifier chord and the typed command do not conflict.

### Window and crossing selection

- Drag left to right: select only objects wholly inside the window.
- Drag right to left: select objects wholly inside or touched by the window.
- Shift-click or Shift-drag adds or removes objects from the current selection.
- `Esc` first cancels an active command, then clears the selection, matching the current staged cancel behaviour.
- Selection is limited to the active model or paper-space layout; it never reaches through to another tab or layout.

### Right-click selection tools

When there is a selection, keep the applicable edit actions first and add a **Selection** section:

- Select all
- Select similar
- Quick select by object type, layer, service or circuit
- Previous selection
- Invert selection
- Clear selection

When nothing is selected, right-click keeps Repeat/recent commands and adds Select all, Previous selection and Quick select. Commands provide the same operations so they remain usable without the menu:

- `SELECT` / `SEL` with All, Window, Crossing, Previous, Last and Similar options
- `QSELECT` / `QS` for filtered selection
- `SELECTSIMILAR` for objects matching the picked object's type and layer, with service and circuit included for electrical and ELV objects

Quick Select and Select Similar operate only on editable objects under the same visible/unlocked rules as Select all.

## Edit commands to keep consistent

These aliases are already registered and should be shown consistently in command help, tooltips and the right-click menu rather than gaining separate keyboard chords:

| Action | Command |
| --- | --- |
| Erase | `E` or Delete / Backspace |
| Move | `M` |
| Copy by displacement | `CO` or `CP` |
| Mirror | `MI` |
| Offset | `O` |
| Rotate | `RO` |
| Scale | `SC` |
| Stretch | `S` |
| Trim | `TRIM` or `TM` (`TR` remains Trace) |
| Extend | `EX` |
| Fillet | `F` |
| Chamfer | `CHA` |
| Break | `BR` |
| Join | `J` |
| Array | `AR` |
| Match properties | `MP` |

`Ctrl/Cmd+C` and `Ctrl/Cmd+V` are reserved for a later clipboard design across drawings and projects. They should not silently become aliases for displacement Copy.

## Proposed snap and tracking behaviour

### Additional object snaps

Add Perpendicular, Nearest and Tangent to the existing Endpoint, Midpoint, Centre, Intersection, Insertion, Node and Quadrant snaps. The object-snap settings control which types are active; `F3` continues to toggle the complete configured set.

### Polar tracking

- `F10` and the `POLAR` command toggle polar tracking.
- The default increment is 45°. Settings offer 5°, 10°, 15°, 18°, 22.5°, 30°, 45°, 90° and a custom increment.
- From the last confirmed point, a temporary guide appears at the nearest enabled angle. Typed distance follows that guide.
- Ortho has priority when it is on; turning Ortho off exposes polar tracking again without losing the chosen polar angles.

### Object-snap tracking

- `F11` and the `OTRACK` command toggle object-snap tracking.
- Pausing over an enabled snap point acquires it. A small acquired marker remains while temporary horizontal, vertical and enabled polar guides extend from it.
- Endpoint, midpoint, centre, quadrant and intersection points can be acquired. A circle or arc centre therefore becomes a tracking origin without drawing construction geometry.
- The cursor snaps where two acquired guides intersect, or where an acquired guide meets the active polar guide. This supplies the requested centre and intersection tracking.
- Moving back over an acquired marker removes it. `Esc`, completing the command, changing drawings or changing layouts clears all acquired points.
- Tracking guides are transient: they are not drawing objects and are never saved, exported or printed.

### Snap priority

When several candidates are in range, use this order:

1. A direct enabled object snap under the cursor
2. An object-snap tracking intersection or guide
3. Ortho, otherwise polar tracking
4. Grid snap
5. The unrestricted cursor point

The existing snap marker and label show the winning type. Tracking intersections use a distinct temporary marker so they cannot be mistaken for real geometry.

## Implementation order after approval

Keep the code changes as two focused PRs after this proposal is approved:

1. Selection: select-all scoping, selection-set operations, commands, right-click entries and regression tests.
2. Precision input: new snap types, polar tracking, object-snap acquisition/tracking, precedence and geometry tests.

Required regression coverage:

- fully enclosed versus touched objects in both drag directions;
- Shift add/remove, previous, inverse, similar and filtered selections;
- Select all excludes hidden, frozen, locked and reference objects and does not intercept text-field select-all;
- direct snap wins over tracking, polar and grid candidates;
- centre, intersection, perpendicular, nearest and tangent cases;
- polar increments, typed distances, Ortho priority and tracking-state clearing;
- no transient tracking data enters the project file or DXF/DWG output.

## Decisions needed

1. Approve the selection behavior and right-click tools above?
2. Approve `F10` for Polar and `F11` for Object-snap tracking, with 45° as the default polar increment?
3. Confirm that the unclear word meant **Fillet (`F`)**, or name the intended tool.
4. Confirm that Select all should select editable app objects only, not non-editable architect/reference geometry.
