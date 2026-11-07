# UI / UX — External references (Xref) in Design CAD (2026-11-07)

Status: **approved 2026-11-07 ("Go ahead", all six recommended answers) and built in v2.046.** Mockup: `docs/mockups/cad-xref-mockup.html`.

## Decisions (approved)

1. Ribbon: a small **References** button in the Design CAD File group.
2. Type: both Overlay and Attach.
3. Printing: grey by default; structure (and architect's background) drawings print, other services do not.
4. Bind: only into Save DXF / DWG, never into the project.
5. Clip: rectangle and picked outline now; invert later.
6. Changed files: the desktop app checks when its window comes back to the front and shows "Changed — reload" (no automatic reload).

## Built (v2.046)

- `src/model/cadRefs.ts`: references per plan file (`Project.cadRefs`), placing, unit scale, clip, layer styles, snap index, sheet lines.
- `engines/cad-reader/src/doc.rs`: `info().xrefs` lists the external references inside a DWG/DXF (name, saved path, overlay flag, inserts).
- `src/components/cad/CadRefs.tsx`: reference manager (XR), Attach dialog (XA), the Layers panel's NAME|LAYER rows; Layer manager shows them too.
- Canvas draws references under the plan, faded; snaps reach their ends and midpoints.
- `cad:stat` (desktop) for Changed / Not found.
- Plan sheets: References pen (grey 30 %, 0.13 mm), legend line, a note naming the references shown or not printed.

## Not built yet

- A reference found inside the architect's DWG is not looked for on disk automatically: Repath… finds it.
- Attach and Overlay act the same here; Save DWG does not write an external-reference block (Bind writes the lines).
- Bind writes lines only (no texts or fills of the reference).
- Plan sheets print a reference only if it was read in this session (open the plan in Design CAD first); the sheet says so in its notes.
- Web version: a reference's file is not kept after a reload of the page; Repath… picks it again.
- Clip invert ("show outside").

## Why

The engineer often needs other drawings under a level's plan: the structure (grid and columns), other services (mechanical, plumbing), or a site plan. Today Design CAD opens each DWG/DXF as its own tab, so these cannot be seen together. A reference shows another file under the plan without copying it in.

## How Design CAD works today (what this builds on)

- Each open drawing has its own WASM engine (`src/engines/cad/cadEngine.ts`, `engines/cad-reader/src/doc.rs`). The engine flattens model space into segments, texts and fills, plus snap points and picking.
- The project keeps only file names. A level's plan is in `cadPlans` (`src/model/cadPlans.ts`), and file paths stay on this computer (`cadState.ts`, localStorage).
- Layer styles are kept per drawing file in `cadLayerStyle` (`src/model/cadLayerStyle.ts`).
- Plan sheets (`src/docs/planLayout.ts`) print the room outlines with the `arch` pen, the design, and the drawn work. They do not print the DWG's own lines.
- An Insert of an external-reference block draws nothing today, because the block has no entities of its own. The CAD library already reads the xref flags (`is_xref`, `is_xref_overlay`, `is_xref_unloaded`) and the block's `xref_path`.

## Proposal

1. **Ribbon:** add one small button, **References** (command XR), to the Design CAD File group after Layer roles. XA attaches a reference. Nothing else on the ribbon moves.
2. **Reference manager (XR):** a list of the references on this plan, each with its status:
   - Status is Loaded, Changed (reload), Unloaded or Not found.
   - Each row shows the type, insertion point, scale, rotation, fade and whether it prints.
   - Actions: Attach…, Reload / Reload all, Unload, Detach (undoable), Repath…, Clip and Bind….
   - References found inside the architect's DWG are listed too, so a missing one can be found with Repath and shown.
   - The reference files are never changed.
3. **Attach (XA):** file, name, type (Overlay / Attach), insertion point (same origin 0,0, or pick on the plan), scale (worked out from both files' units, for example m → mm gives ×1000), rotation, fade (0–90 %, default 50 %) and Prints on plan sheets.
4. **On the plan:**
   - References are drawn under the plan, faded. Snaps reach them, but they cannot be picked or edited.
   - Clip shows only the part inside a rectangle, or inside an outline picked on the plan.
   - In the desktop app, a changed file shows "Changed — reload".
5. **Layers:** each reference's layers show as FILE|LAYER, grouped in the Layers panel and the Layer manager, with on/off, screen colour and print on/off. They are kept per plan, like `cadLayerStyle`.
6. **Plan sheets:**
   - A new **References** pen in Plot setup, grey 30 % and 0.13 mm by default. Sheets stay black-and-white.
   - Each reference and each of its layers can be set to print or not.
   - References print under the room outlines.
7. **Save DXF / DWG:**
   - Without Bind, references are not written into the saved copy.
   - With Bind, their lines go into the saved copy on FILE$0$LAYER layers. Bind never puts them into the project.

## Technical notes (for the build)

- **Model:** add `cadRefs` to the project, keyed by the host plan file. Each reference has a name, file, type, insertion x/y, scale, rotation, fade, clip polygon, print setting, loaded / unloaded state, and layer styles. Paths stay on this computer, like plan paths.
- **Engine:**
  - A reference opens through `openDrawing`, then its segments are transformed onto the host plan.
  - To save memory, the engine is ended after reading. Snap points are kept in a small JS grid.
  - `doc.rs` gets an `xrefs()` call that lists external-reference blocks (name, path, overlay flag, insertion transform).
- **Sheets:** reference lines are only in memory, so a sheet can print a reference only while that reference is loaded. In the desktop app it can be reread from its path when the sheet is made. If a reference cannot be read, the sheet says so in its notes rather than leaving it out silently.
- **Tests:** model functions (attach, detach, repath, unit scale, transform, clip), the engine's `xrefs()` against a fixture with an xref block, and sheet output with the References pen (`npm run test:pdf`).
- **Version:** 2.046, with a What's new line.

## Asked of the user (answered above)

1. **Ribbon place:** a small References button in the File group (as in the mockup), or in View next to Layer manager?
2. **Type:** both Overlay and Attach, or Overlay only for now? Attach matters only when a saved DWG is opened elsewhere.
3. **Printing:** should references print in grey by default? Structure on and other services off?
4. **Bind:** only into Save DXF / DWG and never into the project. OK?
5. **Clip:** rectangle and picked outline now, with invert ("show outside") later. OK?
6. **Changed files:** the desktop app checks when its window comes back to the front and shows "Changed — reload". Or reload automatically?

## Not in this

- 3D and elevations.
- Image or PDF underlays.
- Editing a reference in place.
- Nested references more than one level deep: the plan's own xrefs are listed, but their own xrefs are not.
