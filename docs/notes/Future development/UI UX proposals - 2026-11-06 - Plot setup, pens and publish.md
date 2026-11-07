# UI / UX proposal — Plot setup, pen table and publish (2026-11-06)

Mockup: [cad-plot-setup-mockup.html](../../mockups/cad-plot-setup-mockup.html)

Phase 1 of the drafting and publishing list the user gave on 2026-11-06. Phase 2 is layers, linetypes and object properties; Phase 3 is hatch and annotation. Approved by the user on 2026-11-06 ("proceed phase one, and complete all other phases") and built in v2.041 (`src/model/plotSetup.ts`, `src/components/docs/PlotDialogs.tsx`).

## Proposal

**Ribbon:** a new **Plot** group on the Design CAD → Sheets sub-tab, beside Issue and export, with **Page setup**, **Pens** and **Preview**.

1. **Page setup**, kept per sheet; left blank, a sheet uses the set's default.
   - **Paper:** Auto, which is today's rule (the smallest of A3–A1 that fits), or A4, A3, A2, A1 or A0.
   - **Orientation:** landscape or portrait.
   - **Scale:** 1:50, 1:100, 1:200, 1:500 or Fit. It applies to plan sheets; SLD sheets stay on Fit as now.
   - **Plot area:** the whole sheet, the plan only, or a window.
   - **Pen table** and **lineweights:** which pen table to print with, and whether to print its lineweights or one thin line throughout.
   - **Plot stamp:** file name, date, revision and user, printed in the margin.
   - **Checks:** a warning when the plan does not fit the paper at the chosen scale, or when Fit makes it not to scale.
2. **Pen table**, one per project, chosen per sheet.
   - **The app's lines**, each with a width from the ISO series (0.13–2.0 mm) and black or a grey:
     - sheet frame and title block
     - devices
     - cable trays
     - cable routes and wiring
     - text and tags
     - dimensions and leaders
     - hatches
   - **The architect's drawing** prints in one of three ways:
     - one thin grey line (as today)
     - the lineweights stored in the DWG's layers
     - by colour, from a **CTB file**
   - **Import…** reads a .ctb from the AutoCAD Plot Styles folder: 255 colours, each with a lineweight and screening (grey). STB (named plot styles) can follow later.
   - The defaults match what the sheets print today, so nothing changes until the table is edited.
3. **Publish** (the existing dialog, extended).
   - **Sheets:** this sheet, the sheets ticked, or all of them. The list can be narrowed by kind (SLD, Board sheets, Plans, Earthing) and shows each sheet's paper and scale.
   - **Output:** one PDF for all sheets, or one PDF, DXF or DWG per sheet.
   - **Page setup:** each sheet's own, or one override for the run.
   - **File names:** "Number - Title", or the number only.
   - Today's readiness checks and Issue stay as they are.
4. **Preview** shows the sheet as it will print, at the pen widths. The PDF uses the same widths; DXF and DWG files carry the lineweights on their layers.

Printing stays black-and-white: the pen table only sets widths and greys.

## Decisions for the user

1. Screen: **approved** (2026-11-06). Built as Page setup and Pens dialogs from the new Plot group; Publish extended in place.
2. Plot stamp: not answered; built **off** by default (prints stay as they were), on per sheet or for the set.
3. A0 and A1 portrait: not answered; not built. The papers are today's (A4, A3, A3 portrait, A2, A1).
4. Built differently from the mockup:
   - The architect's DWG lines do not reach plan sheets, only the room outlines (drawn with the "architect's plan" pen). So a CTB maps the colours of the app's own DXF layers, not the architect's colours, and the DWG's own lineweights cannot be read (the CAD engine has no lineweights).
   - Plot area (plan only, window) and the separate Preview button are not built: the sheet on screen is the print preview, with the pens.
   - File names keep today's rule (number and revision).
   - DXF and DWG export does not carry lineweights yet: R12 DXF has none.
