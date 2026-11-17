# UI UX proposal – Design CAD edit previews and repeat (2026-11-16)

Status: **approved 2026-11-17** (the recommended answer, in bold, for all five decisions); **built** in three stacked PRs, to merge in order: step 1 PR 640 (v2.167), step 2 PR 642 (v2.168), step 3 PR 643 (v2.169); then PR 644 (v2.170, typed points in Mirror, Scale and Stretch).

The user asked on 2026-11-16 for these changes in Design CAD:

- Trim, Extend and Stretch show the object before the click, the way Rotate already shows the object turning with the cursor. For example, the part Trim will cut away shows as a shadow before it is cut.
- Move, Copy, Scale and Mirror get the same shadow, also when several objects are picked.
- Pressing Space twice continues with the previous command.

On the same day the user chose to leave out command options (Fence, Crossing, Undo, Copy, Reference…) and the angle or length shown beside the cursor.

Mockup: `docs/mockups/cad-edit-previews-mockup.html` (image: `cad-edit-previews-mockup.png`).

![Design CAD edit previews and repeat, today and proposed](../../mockups/cad-edit-previews-mockup.png)

## Today

All previews are drawn on the cursor layer of the canvas (`preview`, `src/components/cad/CadCanvas.tsx:887`). They are dashed 6 px on, 4 px off, 1.5 px wide, in the drawn-work colour (`--cad-sketch` = `--res-cur`, #7fd1ff on Graphite dark). The list of preview objects is built in `CadPage.tsx:4041`.

| Command | What shows before the click today |
|---|---|
| Trim | Nothing. The cut is seen only after the click (⌘Z undoes it). The cursor is the crosshair, because the prompt `TRIM  Click the part to cut away (Shift-click extends):` does not say "Select" (`cursorModeOf`, `src/model/cadDraft.ts:128`), so no pick box and no hover mark show. |
| Extend | Nothing, the same as Trim. |
| Stretch | The window disappears once dragged. After the base point, only a rubber line runs from the base point; the objects jump on the second click. |
| Rotate | One drawn object turns with the cursor, dashed. A camera or speaker turns to face the point clicked, with no preview. With several objects picked: `ROTATE  One object at a time.` (`CadPage.tsx:2072`). |
| Move, Copy | One drawn object follows the cursor, dashed. With several objects, or a device, only a rubber line shows. |
| Mirror | Only the rubber line of the mirror line; the mirrored objects show after the Yes/No answer. |
| Scale | Only a rubber line from the base point. The factor is typed; a click takes the factor shown in < >. |

What the commands do is already in place. `trim` and `extend` (`src/model/cadEdit.ts:86`, `:117`) find the piece between the nearest crossings, or the first edge ahead of the end. The edges are the other drawn objects and the shown layers of the opened drawing (`edgesFor`, `:73`). `stretched`, `mirrored` and `scaled` (`:317`, `:280`, `:294`) give the moved objects. A preview can call the same functions without changing the project.

**Repeat already works.** With no command running, Enter or Space starts the last command again (`repeat`, `CadPage.tsx:3371`, called from `run('')`, `:3629`). The right-click menu has Repeat and Recent commands. While a command keeps going (Trim, Extend, Offset, Fillet, Copy…), the first press ends it and the second starts it again. In Line the first press ends the line drawn and LINE stays on for the next one. Move, Rotate, Mirror, Scale, Stretch and Align end by themselves after one use, so one press starts them again. Nothing on screen says this; only the F1 help line ends with "Enter or Space ends a step or repeats the last command".

## Proposed

### 1. Trim and Extend: a shadow before the click

- With the cursor over a drawn line, polyline, tray or cable route, **the piece Trim would cut shows as a shadow**. The piece fades and turns dashed in its own colour, and the rest of the line stays as it is. The shadow is the same piece `trim` would remove, so what is seen is what the click does.
- **Extend** shows the new length, dashed in the drawn-work colour, from the end up to the edge it will reach, with a small cross where it meets that edge.
- Shift held shows the other command's shadow, as a Shift-click does the other command.
- Where nothing crosses the line (or no edge is ahead of the end), there is no shadow. The click still says why, as now.
- The prompts say "Select" (`TRIM  Select the part to cut away (Shift-click extends):`, `EXTEND  Select the end to lengthen (Shift-click trims):`). The cursor rule approved on 2026-11-13 then shows the pick box, because these commands pick an object rather than a point (decision 2). On the line under the cursor the shadow takes the place of the amber hover mark.

### 2. Stretch: the objects follow the cursor

- After the window is dragged, the objects with points inside it show the picked look (dashed + blue halo, approved 2026-11-15), and each point that will move gets a small blue square. So it is clear what the window caught.
- After the base point, the stretched objects follow the cursor, dashed: the points inside the window move, the rest stay. Devices inside the window follow as their own symbol, faded. The rubber line from the base point stays.

### 3. Move, Copy, Rotate, Mirror and Scale: a shadow for every object picked

- **Move and Copy:** every picked drawn object follows the cursor, dashed. A picked device follows as its own symbol, faded.
- **Rotate:** every picked object turns about the base point with the cursor (0° to the right, anticlockwise, as today). Rotate then works on several objects. Drawn objects turn, and devices picked with them move round the base point; a camera or speaker also turns by the angle (decision 3).
- **Mirror:** after the first point of the mirror line, the mirrored copies follow the cursor, the line from the first point to the cursor being the mirror line. At `Erase source objects? [Yes/No]` they stay where the line was chosen.
- **Scale:** after the base point, the objects show at the factor in < >, and change while a factor is typed, before Enter (decision 4).
- Mirror and Scale stay on drawn objects, as today (`applyMirror`, `applyScale`, `CadPage.tsx:2369`, `:2378`). Devices picked with them stay where they are, so their shadow shows no devices. A text's place is mirrored, not its letters, as `mirrored` does now.
- The shadow shows up to 2,000 objects, the limit PASTECLIP already uses. Above that only the rubber line shows; the command still works on every object picked.

### 4. One look for every shadow

- **What will be added or moved** (Move, Copy, Rotate, Mirror, Scale, Stretch, and Extend's new length): dashed 6/4 px, 1.5 px, in the drawn-work colour. This is the look Rotate and Move use today, so no new colour is added.
- **What will be cut away** (Trim): the piece fades to about 35 % and turns dashed in its own colour, over a band in the canvas colour that hides the solid line under it (decision 1).
- **Devices:** the symbol itself at 45 % at the new place. FILL already uses this look for the devices it is about to place (`ghost`, `CadCanvas.tsx:690`).

### 5. Space twice continues with the previous command

- The behaviour stays as it is today. A test checks every edit command: the first Space or Enter ends a command that keeps going, and the next press starts the same command again. A command found not to end on the first press is fixed in step 3.
- When a command ends, the command line says so: `Command: Click an object to see what it is · Space repeats TRIM` (decision 5). Repeat TRIM stays on the right-click menu.
- In a text prompt (TEXT contents, a name) Space types a space, as now; Enter still ends and repeats.

### Not in this proposal

- Command options (Fence, Crossing, Undo, Copy, Reference…) and the angle or length beside the cursor. The user chose to leave these out on 2026-11-16; they can follow later.
- Objects of an opened drawing. Trim, Extend and Stretch work on drawn objects only; the opened drawing's lines are edges. Once step 2 of the selection proposal makes those objects editable (taken over on the first edit), the shadows cover them too.

## Decisions

1. Trim's shadow: **the piece fades and turns dashed in its own colour**, the piece drawn dashed in red, or the amber hover mark on the piece only?
2. Trim and Extend cursor: **the pick box (prompts say "Select…")**, or keep the crosshair?
3. Rotate with several objects picked: **all of them; devices move round the base point, and cameras and speakers also turn**, drawn objects only, or one at a time as today?
4. Scale: **the factor stays typed, and the shadow shows it while typing**, or also drag to scale (factor from the cursor's distance)?
5. Repeat hint: **on the command line when a command ends**, or as the grey hint in the empty command box ("Type a command · Space repeats TRIM")?

Answered 2026-11-17: the answer in bold for all five.

## Steps once approved

1. **Trim and Extend shadows.** `trimPiece` and `extendPiece` in `cadEdit.ts`, sharing the cut code of `trim` and `extend`. A cut-away preview kind on the canvas. Prompts and cursor. Tests: the shadow is exactly what the click removes or adds, for open and closed paths, with and without Shift.
2. **Shadows for Stretch, Move, Copy, Rotate, Mirror and Scale.** Several objects, faded devices, the 2,000-object limit, and Rotate on several objects. Tests: each shadow equals the result the click then applies.
3. **Repeat.** The hint, and a test that each edit command ends on the first Space or Enter and starts again on the second.

Built 2026-11-17:
- Step 1 (PR 640): as proposed. Where the edges cross the line under the cursor, and where its ends would reach, are worked out once per line (`crossingsOf`, `reachesOf`); `trim` and `extend` use the same code. Trim and Extend keep the pick box after each cut, and mark drawn lines only.
- Step 2 (PR 642): as proposed. Device shadows are drawn on the cursor layer, so the plan is not redrawn for them. After the Stretch window, only the drawn objects it caught are marked, as in the mockup.
- Step 3 (PR 643): the hint as proposed. Enter with nothing picked did not end Mirror, Scale, Align, Array, Join, Draw order or the text tools, nor Move and Rotate with nothing selected; it now ends them.
- Found and fixed (the user's go-ahead, 2026-11-17): Mirror, Scale and Stretch did not take typed coordinates for their points ("Unknown command"), while Move, Copy, Rotate and Align did. They do from PR 644 (v2.170), stacked on PR 643.

Speed: Trim's shadow runs the cut on each cursor move over a line. The edges are worked out once per line hovered, not on every move. This will be measured on the largest sample drawing before merging. Measured 2026-11-17 on synthetic plans instead (the sample drawings are all under 100 KB): at 500,000 segments, 0.05 ms per cursor move and 4–44 ms once per line hovered.

Related: [[UI UX proposals - 2026-11-13 - CAD cursor and pick box]], [[UI UX proposals - 2026-11-15 - CAD selection, grips and opened drawings]].
