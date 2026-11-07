# UI / UX — Model space and layout (paper) space in Design CAD (2026-11-07)

Status: **proposal, waiting for approval.** Mockup: `docs/mockups/cad-layout-space-mockup.html` (artifact: https://claude.ai/artifact/MECw4xynMvz82sJQYsbaHu).

## Why

The user asked for model space and layout (paper) space kept apart, as in industry CAD software. Today Design CAD has one drawing space, the plan in real units. Plan sheets are made automatically from it: the app picks the paper, splits the level into parts with match lines, and adds the title block. The engineer cannot place a viewport, set a second scale (a key plan), or lay out notes and legends on the paper.

## How it works today (what this builds on)

- `src/components/cad/CadPage.tsx` and `CadCanvas.tsx` show one drawing (model units); `CadTabs.tsx` has a tab per open drawing at the top.
- Plan sheets: `DrawingSheet` with `kind: 'plan'`, `plan` (lighting / power / ELV / containment), `scale`, `size`, `part` (`src/model/drawingSet.ts`). `src/docs/planLayout.ts` lays them out (`planFit`, match lines, pens, notes). They are listed and issued in Design CAD → Sheets (`CadSheets.tsx`, `SheetWorkspace.tsx`), with markups in paper mm (`markups`).
- Pens and plot setup: `src/model/plotSetup.ts`. Sheets print black and white.

## Proposal

1. **Model / layout tabs** under the drawing: Model, then one tab per layout of this plan (named by sheet number), then +. Right-click a layout tab for Rename, Copy, Move, Delete and Page setup. The Model tab is today's plan, unchanged.
2. **A layout** is a paper (size from Page setup), with the title block from the drawing set, and one or more **viewports**. Each viewport is a rectangle on the paper showing the model at a scale, around a centre. Paper objects are drawn in mm: text, notes, leaders, clouds, lines, rectangles, the legend and the north arrow.
3. **Inside a viewport:** double-click inside (or MS) to work in the model through it. Drawing, devices and wiring change the model, as on the Model tab. Pan and zoom move the viewport's view only when it is unlocked. Double-click outside (or PS) goes back to the paper.
4. **Viewport properties:**
   - **Scale:** the usual list (1:20 to 1:500) or a custom value.
   - **Locked:** on by default.
   - **Shows:** sets which layer roles show (Lighting, Power, ELV, Containment).
   - **References:** turns each reference (Xref) on or off.
   - **Frame prints:** off by default.
5. **Layer manager in a layout:** a "This viewport" column freezes a layer in this viewport only.
6. **Ribbon:** a Layout group (New layout, Viewport, Scale, Lock, Page setup, Plot PDF), shown only on a layout tab. Commands: LAYOUT, MV (MVIEW), MS, PS, VPSCALE, VPLOCK.
7. **Sheets:** a layout *is* a plan sheet of the drawing register. Its number, revisions, issues and PDF / DXF export work as today. Today's automatic plan sheets become layouts with one viewport each, and split levels keep their match lines, so nothing is lost. "Make layouts for the level" keeps today's automatic split.

## Technical notes (for the build)

- **Model:**
  - `DrawingSheet` (plan) gets `viewports: { id, box (paper mm), centre (model units), scale, locked, shows?, frozen?: string[], refsOff?: string[], framePrints? }[]`.
  - Paper objects reuse `markups` (paper mm).
  - Old plan sheets without viewports get one viewport, worked out from `planFit` / part when read (no migration file).
- **Drawing:**
  - The canvas gets a paper mode. It draws the paper, title block and markups in mm, and each viewport by clipping the model draw to its box with a transform (model → paper mm at its scale).
  - Hit-testing inside a viewport maps back to model units.
  - The PDF uses the same layout as `planLayout.ts`, so screen and sheet match.
- **Performance:** viewports reuse the model's drawn paths (one drawing per viewport, clipped), not a copy.
- **Phases:**
  - Phase 1: tabs, viewports, per-viewport layers, paper objects, layouts as sheets.
  - Phase 2: Save DXF / DWG writes real paper-space layouts with viewports.
- **Tests:**
  - Model: viewport transform, freeze and lock.
  - Layout to sheet output (`npm run test:pdf`).
  - Converting old plan sheets.
  - Page tests: MS/PS, MV, VPSCALE.

## Asked of the user

1. **Tabs:** Model / layout tabs under the drawing (recommended), or a fourth ribbon sub-tab "Layouts"?
2. **Sheets:** a layout is a plan sheet in the register, with one list and one numbering (recommended)?
3. **Today's plan sheets:** turn them into layouts automatically, keeping their numbers and revisions (recommended)?
4. **Viewport frames:** not printed by default (recommended)?
5. **On the paper first:** text, notes, leaders, clouds, lines, rectangles, legend and north arrow, with more later (recommended)?
6. **Save DWG / DXF:** real paper-space layouts in phase 2, after the screens work (recommended)?

## Not in this

- 3D, elevations and sections (they wait for a BIM link).
- Viewports with a polygon outline (rectangles only at first).
- SLD, riser and earthing sheets stay as they are: they are made from the design, not from a model.
