# Earthing schematic: wrap width and continuation sheets (proposal, 2026-11-10)

Follows the v2.081 change (bands in columns, PR 501). Mockup: `docs/mockups/earthing-continuation-sheets-mockup.html`
(picture: `earthing-continuation-sheets-mockup.png`).

## What is left after v2.081

- **Blank space above and below.** A substation wraps only past `SUB_MAX_W` = 2,900 px, so the columns are wide. Two
  band columns plus the schedule fill the width before the height, and three are too wide.
- **Small text on big sites.** On the nine-substation example, 10 px labels print at about 1.0 mm on A1 (0.104 mm per
  px, with the 80 mm legend column) and about 0.45 mm on A3. The app's drawing limit `MIN_MM_PER_PX` = 0.2 (2 mm for a
  10 px label) is not met, and nothing tells the user.

## Step 1: choose the band wrap width with the layout (one sheet)

Try the wrap widths 2,900, 2,300, 1,800 and 1,400 px. For each, run the v2.081 column and schedule choice, and keep
whichever prints largest. A wide substation becomes two narrower rows, marked 1/2 and 2/2 in its zone. Links between
the rows use the existing "to EP-…" stubs.

I measured this with the v2.081 code by changing `SUB_MAX_W` and `MAX_W` (scale on A1 with the legend column):

| Wrap width | Nine substations | Large single site (10 transformers) |
|---|---|---|
| 2,900 (today) | 0.104 | 0.171 |
| 2,300 | 0.135 | 0.177 |
| 1,800 | 0.113 | 0.174 |
| 1,400 | 0.142 (+37%) | 0.193 (+13%) |

The best width differs by project, so trying several is needed. Putting narrow bands side by side on one line was also
considered. It gains little once the wrap width is chosen, so it is left out.

## Step 2: continuation sheets below a minimum label size

If Step 1's best layout would print labels under the minimum (2.0 mm proposed, the existing 0.2 mm per px), continue
onto more sheets:

- Each sheet holds as many whole band rows as fit at the minimum size.
- The pit schedule goes on the last sheet, or on its own sheet if it does not fit.
- A link to another sheet names that sheet: "to EP-TX(N)-04 (sheet 2)".
- Each sheet is a `part` of the earthing sheet in the drawing set, the same way `addEarthRiserSheet` handles the
  earthing riser. Each part is numbered with the set and listed in the register.
- Wrap widths are limited to what the paper holds at the minimum size (about 1,400 px on A3).

Estimate for the nine-substation example: an A1 drawing area at 0.2 mm per px holds about 3,600 × 2,600 px, so about 4
rows per sheet. That gives 3–4 A1 sheets. On A3 (about 1,500 × 1,150 px) it is one row per sheet, about 18–20 sheets,
which is not practical. So auto paper should go up to A1 before adding sheets.

## Decisions needed

1. Step 1 only, Step 2 only, or both?
2. Minimum printed label height: 2.0 mm (the existing limit) or 2.5 mm?
3. Auto paper for a big earthing schematic: A1 first, then more sheets (proposed), or stay on A3 and add sheets?
4. Continuation numbering: separate numbers E-EAR-001, -002, -003 (proposed, as the earthing riser parts), or one number
   with "sheet 1 of 3"?
5. Pit schedule on a big site: on the last drawing sheet when it fits (proposed), or always on its own sheet?

Status: waiting for approval. Nothing implemented.
