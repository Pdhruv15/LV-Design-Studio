# CAD dimension styles: DWG import and DXF export (2026-11-08)

The Dimension style dialog (DIMSTYLE) now imports the DIMSTYLE table of an ASCII DXF. Two follow-ups need a decision:

1. **Import from DWG.** The built-in reader (`engines/cad-reader`, acadrust compiled to WebAssembly) does not return the
   DIMSTYLE or BLOCK_RECORD tables yet. Adding them to `readDrawing`'s answer and rebuilding with `npm run build:cad`
   (needs Rust and wasm-pack) would let a DWG be imported directly. Until then the dialog asks for a DXF.
2. **Write styles to Save DXF.** Dimensions are saved as lines and text, so another CAD program sees no DIMSTYLE and
   cannot re-edit them as dimensions. Writing DIMENSION entities with their DIMSTYLE would round-trip them.

Imported sizes are taken as paper mm (inches in an imperial drawing) and DIMSCALE is left to the project's annotation
scale. Box-round-text (negative DIMGAP), tolerances, alternate units and custom arrow blocks are not drawn; the import
message lists what was left out.
