# UI / UX — Layer manager, linetypes and object properties (2026-11-07)

Phase 2 of the drafting list the user gave on 2026-11-06. On 2026-11-06 the user asked for all phases to be completed overnight ("proceed phase one, and complete all other phases also"). This phase was therefore built without a separate mockup, using the CAD page's existing fields and buttons. It is in v2.042 (`src/model/cadLayerStyle.ts`, `src/components/cad/CadLayerManager.tsx`).

## Built

- **Layer manager (LM, and View → Layer manager).** It is kept per drawing file.
  - **The app's drawn layers** (LV-SKETCH, LV-ANNO, LV-HATCH, E-TRAY, E-CABLE and any others in use): on, lock, colour, linetype and lineweight.
  - **The architect's layers:** on (the same switch as the Layers panel) and a screen colour of their own.
  - **Lock:** objects on a locked layer can be seen and snapped to, but not picked or edited. Hidden objects cannot be picked either.
- **Linetypes:** Continuous, Dashed, Hidden, Center, Dot, Dash dot and Phantom. The dashes are in paper mm at 1:100, and a pattern too fine to see at the current zoom shows continuous, as CAD does.
- **Object properties:** a side panel for the drawn objects picked, with layer, colour, linetype and lineweight. Blank is ByLayer. Trays and cable routes stay on their own layers.
- **Match properties (MP, in Modify):** click the source object, then each target. A target takes the source's layer, colour, linetype and lineweight.

## Not built yet

- **On the printed sheets:** the linetypes and lineweights are not carried over. Printing goes by the pen tables (Phase 1), and the plan sheets draw only trays, routes and devices.
- **In Save DXF / DWG:** the drawn objects keep their layers, but not their colour, linetype or lineweight.
- **Freeze:** not built, because Off already covers it in a 2D plan.

## For the user to decide

1. Should a layer's linetype and lineweight also print on the plan sheets? That would mean drawing the app's sketch lines on the sheets, not only the trays and routes.
2. The screen colours: is the list right (red, yellow, green, cyan, blue, magenta, greys)?
