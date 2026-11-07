# UI / UX — Hatch and annotation in Design CAD (2026-11-07)

Phase 3 of the drafting list the user gave on 2026-11-06. On 2026-11-06 the user asked for all phases to be completed overnight. This phase was built without a separate mockup, using the CAD page's existing fields and buttons. It is in v2.043 (`src/model/cadAnnotate.ts`, `src/components/cad/AnnotatePanel.tsx`).

## Built

- **Hatch (H, in the Draw group).**
  - **Patterns:** Solid, ANSI31 (45° lines), ANSI37 (45° cross), Net (square grid) and Dots, with a spacing in paper mm and an angle.
  - **Placing:** click inside the smallest closed drawn object (polyline, rectangle or circle) around the point, or inside a room outline, or between the walls (as Room area finds them).
  - **What it makes:** the hatch is a closed polyline on LV-HATCH. Its outline shows only when it is picked.
- **Leader (LE):** click the arrow point, then the text point (more points bend the line), type the text and press Enter. Enter alone leaves a leader with no text.
- **Room tag (RT):** click inside a room to place its name, with its area below, at the room's centre.
- **North arrow (NORTH):** a circle, an arrow pointing up the plan and an N.
- **Text height:** set in paper mm at the plan scale (2.5 mm at 1:100 = 0.25 m), for Text, Dimension, Leader, Room tag and North arrow. It is kept with the project.

## Not built yet

- **Text and dimension styles** (font, arrow types): there is one style.
- **Hatch on printed sheets and in Save DXF / DWG:** the plan sheets draw only trays, routes and devices. In the DXF the hatch's outline is kept, but not its pattern.
- **Annotative scaling:** text that changes size by sheet scale on its own is not built; the height is set once for the plan scale.

## For the user to decide

1. Should hatches, leaders and room tags print on the plan sheets? That would mean drawing the app's sketch objects on the sheets.
2. Should room tags come from the room list automatically, for every room on the level at once?
