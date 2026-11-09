# UI / UX proposal — Erase and edit objects of the opened drawing (2026-11-08)

Status: **waiting for user approval**. This note records a requested change to how Design CAD behaves. Nothing here is approved or implemented yet.

## Request

A user opens a DXF/DWG and cannot select, edit or erase its objects. Only objects drawn in the app and placed devices respond to Erase, Move, Copy and the other edit tools.

## What happens today

- The geometry in the opened file is read-only. This includes lines, polylines, arcs, circles, blocks, text and hatches. `docs/notes/Status.md` documents this as "the architect's drawing stays read-only".
- Clicking one of these objects shows its details, as `LI` does: its kind, layer, length and area. It is highlighted, but it does not become the selected object. `E`, Delete, Move and Copy then reply "ERASE Select an object first (click it)."
- CROP (`BCROP`) is the only way to change the opened file's geometry. It cuts a block, erases the original by handle, and adds the pieces that are kept as drawn objects. The erased handles are stored per plan file in `project.cadErased`.
- The erase-by-handle mechanism already works from end to end for CROP:
  - the view stops showing erased objects;
  - pick, snap, Loads from CAD and room outlines ignore them;
  - SAVE / SAVEDWG leave them out of the copy that is saved;
  - ⌘Z brings them back.

  The original drawing file is never written.

## Proposal

### Stage 1: erase objects of the opened drawing (small, uses what exists)

- A click on a drawing object selects it in the usual way. Its details still appear on the right, and it gains an **Erase** button, like drawn objects have.
- `E`, Delete / Backspace and the right-click Erase item erase it. The prompt line says what was removed, for example "Line on A-WALL erased · ⌘Z to undo".
- A window or crossing selection and Shift-click can collect drawing objects as well as drawn objects and devices. Erase then removes all of them in one undo step.
- Erasing a block insert erases the whole block. Use CROP or Explode-to-pieces (Stage 2) to remove only part of it.
- Objects on locked, off or frozen layers cannot be selected. Objects in an attached reference (xref) cannot be erased from the host drawing.
- The erased objects are stored in `project.cadErased`, the same store CROP uses. The drawing file is never changed.
- A new **Restore erased objects** command (typed `RESTOREDWG`; no new button) brings back everything erased in the current file. This covers changes made before ⌘Z history was lost when the project was reopened.

Stage 1 changes interaction only, through existing controls. It adds no new panel, colour or layout.

### Stage 2: move, copy, rotate and modify drawing objects (larger)

- The first edit of a drawing object (Move, Copy, Rotate, Offset, Trim and so on) converts it into an editable drawn object on its original layer, using the explode/CROP conversion that already exists. The original is erased by handle.
- Copy leaves the original in place and adds the copy as a drawn object.
- After the conversion the object behaves like any drawn object. It is saved on its original layer in the copy, with its colour and linetype kept as far as the drawn-object model allows.
- Known limits:
  - Text, hatches and dimensions need conversion support of their own.
  - Proxy and other objects the engine cannot convert remain erase-only.

### Select all (links to the selection-shortcuts proposal)

If this is approved, `Ctrl+A` in *UI UX proposals - 2026-11-08 - CAD selection shortcuts and tracking* could also include visible, unlocked drawing objects. An option would be needed to keep Select all limited to app objects.

## Risks

- **Accidental damage to the architect's plan.** Mitigations:
  - the file is never written;
  - ⌘Z and RESTOREDWG undo erasures;
  - the prompt line names each erased object.
- **Loads from CAD and room detection** read the drawing. Erased blocks and outlines drop out of these, as they already do after CROP. Erasing a light block therefore removes it from a later Loads from CAD count. This is consistent, but it should be stated in the message.
- **Very large selections** of drawing objects with a crossing window could make the erase list long. Store handles only, as CROP does, and show the count.

## Decisions needed

1. Approve Stage 1 (erase only)?
2. Approve Stage 2 (move/copy/modify by converting to drawn objects), now or later?
3. Should Select all include drawing objects, or only app objects?
4. Should RESTOREDWG be added, or is ⌘Z enough?
