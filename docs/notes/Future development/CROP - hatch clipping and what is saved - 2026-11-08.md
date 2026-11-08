# CROP: hatch clipping and what is saved (2026-11-08)

CROP (Design CAD, PR "CROP: a true crop of a block") cuts lines, arcs, circles and polylines exactly. Some parts were
left simple on purpose. Each needs a decision before it is built.

## 1. Hatches crossing the outline

Today a hatch (and a 2D solid, a dimension) is kept only when it is wholly on the kept side. A hatch that crosses the
outline is dropped, and the command line says so ("1 hatch crossing the outline, not kept").

Proposal: clip the hatch's loops to the outline (polygon against polygon with arcs, concave on both sides, islands
kept), and keep its pattern. This needs a robust polygon clipper (Greiner–Hormann or Martinez–Rueda with arc edges, or
arcs flattened within the chord tolerance for the fill only). No new dependency without approval.

## 2. Hatch patterns and islands

A drawn hatch in the app has five patterns (solid, ANSI31, ANSI37, net, dots) and one outline. A kept hatch of the
drawing with another pattern becomes ANSI31; a hatch with islands keeps its outer loop only (said on the command line).
Proposal: a custom pattern (the drawing's pattern lines, as Bind keeps them for references) and outlines with holes on
`SketchItem.hatch`. This is a data model change.

## 3. Points

Drawn items have no point object, so a POINT of a cropped block is not kept (said on the command line).
Proposal: a `point` sketch kind, drawn as the drawing's PDMODE / PDSIZE.

## 4. Colours and linetypes when saved

Kept pieces keep their colour and linetype where they differ from their layer (red arc on E-SYM, ByBlock green on
E-LIGHT). SAVE / SAVEDWG write drawn items by layer only (src/model/cadSketch.ts `shapesOut`), so a saved copy shows them
in their layer's colour. Proposal: write each item's own colour, linetype and lineweight in `with_additions`
(engines/cad-reader/src/doc.rs). This changes every saved drawing, not just crops, so it waits for approval.
