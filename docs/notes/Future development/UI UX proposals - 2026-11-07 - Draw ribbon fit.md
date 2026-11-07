# UI / UX proposal — Design CAD Draw ribbon without sideways scrolling (2026-11-07)

Mockup: [cad-ribbon-fit-mockup.html](../../mockups/cad-ribbon-fit-mockup.html)

The user said on 2026-11-07 that the editing tools make the ribbon scroll sideways, which is not a good option. Since v2.040–2.043 the Draw sub-tab holds about 35 full-size buttons in File, Draw, Modify, Edit, Annotate and View: 2,446 px in one row. Option E was approved by the user on 2026-11-07 ("proceed with option E, but don't use the CAD product's name") and built in v2.044. No product names appear in the app's text: file formats read "DXF (R12)" and "DWG (2018 format)".

## Options

All widths were measured in the mockup at the app's button sizes.

| | Draw sub-tab | Modify sub-tab | Fits 1280 px (13″)? |
|---|---|---|---|
| Today | 2,446 px | — | No: scrolls 1,180 px |
| A: small buttons in stacks (one full-size button per group, the rest three to a column, with names) | 1,534 px | — | No: scrolls 268 px |
| B: Draw and Modify sub-tabs, all full size | 1,386 px | 1,127 px | No: Draw scrolls 120 px |
| C: grouped drop-downs (Fillet ▾ Chamfer, Break ▾ Join / Explode …) | 1,830 px | — | No: scrolls 564 px |
| D: B's sub-tabs, with A's small stacks on Draw | 912 px | 1,127 px | Yes |
| **E: the CAD-standard Home layout (the usual CAD Home tab)** | **1,414 px; 1,231 px with File collapsed** | — | **Yes** (File panel collapses to File ▾) |

The user said on 2026-11-07 that the ribbon should follow what industry CAD products do, so users are not confused. **Recommended: E.**

- **One Draw sub-tab, with the panel names, order and button sizes of the usual CAD programs:**
  - **Draw:** Line, Polyline, Circle ▾ and Arc ▾ large; Rectangle, Hatch and Room area small.
  - **Modify:** the familiar 3 × 4 grid of small buttons:
    - Move, Rotate, Trim ▾ (Extend), Erase
    - Copy, Mirror, Fillet ▾ (Chamfer), Explode
    - Stretch, Scale, Array ▾ (Rectangular, Polar), Offset
    - Break and Join are in the panel's ▾ slide-out, where CAD programs usually keep them.
  - **Annotation:** Text ▾ and Dimension ▾ large; Leader, Room tag and North arrow small.
  - **Layers:** Layer manager large; the Layers panel and Fit small.
  - **Properties:** Match properties.
  - **File:** our own panel, first.
- **Split buttons (▾):** as in the usual CAD programs, the main tool is on the button and the related tools are under its arrow. The last one used comes to the front.
- **Narrow windows:** a panel collapses to one button with ▾ that opens it, File first and then Layers, as the usual CAD panels do. Nothing scrolls at 1280 px and up.
- **Our own engineering tools** (Rooms, Cables, Devices, Edit devices, Wiring) stay on the Plan sub-tab, as dedicated electrical CAD products keep theirs on their own tabs. The command names already follow the usual CAD commands (TRIM, EX, O, F, CHA, BR, J, X, MI, SC, S, AR, MP, H, LE). The exception is TR, which stays Trace room, so Trim is TRIM / TM.

## Decisions for the user

1. Option: **E**, approved (2026-11-07).
2. Should TR become Trim, as in the usual CAD programs, with Trace room moving to TRACE only? Users who know other CAD programs will type TR for Trim. Not answered; TR stays Trace room for now.
3. Should the narrow-window collapse apply to the whole ribbon, or to Design CAD only? Not answered; built for Design CAD's Plan and Draw sub-tabs (File, then Layers).
