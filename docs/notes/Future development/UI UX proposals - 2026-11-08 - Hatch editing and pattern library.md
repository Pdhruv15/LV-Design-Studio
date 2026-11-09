# UI / UX — Hatch editing and a hatch pattern library (2026-11-08)

Asked by the user on 2026-11-08: hatch editing, more built-in hatch patterns, and patterns that other users can share
and use. Follows "UI UX proposals - 2026-11-07 - Hatch and annotation.md" and item 2 of
"CROP - hatch clipping and what is saved - 2026-11-08.md".

## Where it stands today

- A drawn hatch (`SketchItem.hatch`, `src/model/cadAnnotate.ts`) has five fixed patterns: Solid, ANSI31, ANSI37, Net and
  Dots. A pattern is only a list of line angles with one spacing; no dashes, no base point, no offsets.
- A hatch has one outer outline, no islands.
- Once placed, a hatch cannot be edited: pattern, spacing and angle are chosen before the click only.
- SAVE / SAVEDWG write a drawn hatch as its outline only; the pattern is lost (`shapesOut`, `src/model/cadSketch.ts`).
- The DWG/DXF reader (`engines/cad-reader/src/doc.rs`) already reads and writes full pattern lines (angle, base, offset,
  dashes) for references and Bind. Drawn hatches do not use it yet.

## Proposal

### A. Pattern model (engine and data model; no visible change)

1. One pattern definition, the same shape as the DXF/.pat line families: `{ name, description, lines: { angle, base,
   offset, dashes }[] }`, plus `solid`. The five current patterns become definitions; their drawing is unchanged.
2. `HatchSpec` refers to a pattern by name, with scale, angle and an optional origin. Old projects read as before.
3. Canvas, PDF sheets and SAVE / SAVEDWG all draw from the definition, so dashes and offsets are honoured everywhere.
   SAVE writes the hatch with its pattern (the engine already supports this for Bind).
4. Islands: a hatch keeps its inner loops (holes), so a hatch picked inside a room with a column or a riser leaves it
   clear.
5. Tests: definitions, .pat parsing, canvas/PDF line generation, DXF round trip of a drawn hatch.

### B. More built-in patterns

About 15–20 patterns useful on LV and building-services plans, defined in-house (not copied from any vendor's .pat
file), for example:

| Group | Patterns |
| --- | --- |
| General | Solid, 45° lines, cross 45°, square grid, dots, horizontal lines, vertical lines, double 45° lines |
| Building | Concrete, brick, block work, earth, gravel, sand, insulation, steel section, timber |
| LV / services | Plant room, riser / shaft, no-go zone, cable trench, removed / demolition (dashed 45°) |

All print in black and white; Solid stays light grey on sheets.

### C. User patterns that others can use

1. **Import a .pat file** (the common text format used by most CAD programs): each pattern in it is added to the
   project's pattern list. Bad lines are reported, not silently dropped.
2. **Pattern from a drawing:** a hatch in an opened or referenced DWG/DXF with an unknown pattern keeps its real
   pattern instead of becoming ANSI31 (closes CROP item 2).
3. **Saved with the project:** a project carries the custom patterns it uses, so a colleague opening the project
   sees the same hatches with no extra files.
4. **Export patterns** to a .pat file, so a team can keep one shared office pattern file.
5. **Office library (optional):** a .pat file in the user's app data folder, loaded at start, so the office patterns
   are offered in every project.

### D. Hatch editing (needs UI approval)

1. **Edit a placed hatch:** pick a hatch and change its pattern, spacing, angle and origin in the side panel used today
   for the Hatch tool. Command `HATCHEDIT` / `HE`.
2. **Match properties:** copy one hatch's pattern, spacing and angle onto others.
3. **Recreate / follow the boundary:** when the outline it was made from is moved or stretched, the hatch follows
   (associative), or an explicit "update boundary" pick.
4. **Add / remove islands** on a placed hatch.
5. **Pattern preview** next to each name in the pattern list (small black-and-white swatch).

## Suggested order

1. A + B (engine and model, more patterns in the existing list) — one PR.
2. C.1–C.3 (import .pat, patterns from drawings, saved with the project) — one PR.
3. D.1–D.2 (edit a placed hatch, match properties) — one PR, after UI approval.
4. C.4–C.5, D.3–D.5 — later.

## Status (2026-11-08)

- **Step 1 built** (A.1–A.3, A.5, B): 18 patterns, dashes and dots on screen and sheets, SAVE writes the pattern.
  Islands (A.4) are not built yet.
- **Step 2 built** (C.1–C.3):
  - **Import .pat…** button in the Hatch panel (placed there, like Import CTB… in Pen tables). Bad lines are reported
    on the command line with their line numbers; that pattern is left out.
  - Imported patterns are kept in the project (`Project.cadPatterns`) and listed after the built-in ones. Each hatch
    also carries its own pattern lines, so a project or drawing sent to someone else draws the same.
  - CROP of a block keeps the drawing's own pattern lines (found by layer and outline in the open drawing), so a hatch
    is no longer turned into ANSI31. This includes hatches the app saved earlier (named `LVDS_REF` in the file).
  - Spacing for an imported pattern is the distance between its first family's lines in paper mm.
- **Engine limit:** the saved pattern name stays `LVDS_REF`; writing the real name needs a change in
  `engines/cad-reader` and a new engine build (no Rust toolchain on this machine).

## For the user to decide

1. ~~Is adding the new patterns to the existing Pattern list acceptable?~~ Yes (2026-11-08).
2. ~~Where should "Import .pat" live?~~ In the Hatch panel for now; "Export .pat" is still open.
3. Should an office library folder (C.5) be built, or are project-saved patterns enough?
4. Associative hatches (D.3): wanted now, or later?
5. Should pattern swatch previews (D.5) be added to the Pattern list?
