# UI UX proposal: the Hatch strip (2026-11-23)

Status: **approved 2026-11-23** ("go ahead", recommended options). Mockup: `docs/mockups/cad-hatch-strip-mockup.html` and `.png`.

## What

While Hatch (H) or Edit hatch (HE) runs, a "Hatch" strip takes the ribbon's place and goes away on Done. It gathers what was in the side panel and adds the missing tools. Groups, left to right:

| Group | Controls |
|---|---|
| Boundary | Pick point, Select, Remove, Outline |
| Pattern | Swatch strip with live thumbnails and plain names; scroll; All patterns (built in, own, import, export) |
| Properties | Type (Solid, Pattern, Own), Angle, Scale with − / + |
| Origin | Set point; list: bottom left, centre, reset |
| Options | Follow boundary, Islands, Match, Sheet scale |
| Finish | Done (Enter); Esc cancels |

## Decisions (all as recommended)

1. Placement: a temporary strip in place of the ribbon, not a docked panel.
2. Steps: step 1 is the layout and everything that works with today's saved hatch. Step 2 adds Line colour, Back colour and Opacity, which need the saved hatch, the screen drawing and the DXF / DWG writer changed.
3. Sheet scale: shown greyed until annotation scale exists.
4. Swatches carry plain names (Diagonal, Cross, Grid…); pattern ids and exchange files are unchanged.

## Steps

- **Step 1** (v2.263): the strip, swatches, Select, Outline, Match, Set point for new hatches, Done.
- **Step 2** (waits for "go ahead"): Line colour, Back colour (None = transparent), Opacity 0–100 %.
- **Step 3** (with annotation scale): Sheet scale. Fold Origin and Options into a "More" button on narrow windows if scrolling proves awkward.
