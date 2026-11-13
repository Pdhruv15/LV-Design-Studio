# Lightning protection study — proposal (2026-11-13)

Concept-level external lightning protection for one building. Mockup approved by the owner on 2026-11-13 ("proceed"); surge arrester sizing is left for later.

## Rules it follows

- Concept and design stage only: no separation distance, no detailed risk calculation, no shop-drawing detail.
- No value of a standard is built in. The engineer enters the protection class, mesh size, rolling sphere radius, protection angle and down conductor spacing from their own risk assessment and copy of the standard, and the ESE advance time from the manufacturer's test certificate. A missing value shows DATA REQUIRED.
- Standards are named as method references only: IEC 62305-3; NFC 17-102 for ESE terminals.

## The page (Studies → Lightning protection)

Same layout as the other study pages: title and intro, result cards, then cards and tables.

1. **Result cards**: protection class (as entered, with the risk assessment reference), air termination (the selected method), down conductors, checks.
2. **Building**: length, width, height — from the roof outline in Design CAD, editable for a quick study.
3. **Design values — entered by you**: protection class, risk assessment reference, air termination method, mesh size, rolling sphere radius, down conductor spacing, rod / mast height, protection angle, ESE advance time, down conductors for each ESE terminal, earth pit at each down conductor. A note says the app does not ship values from the standards.
4. **Roof plan — concept layout**: the roof outline with the mesh or the rod / terminal positions and the down conductors. A "Place on roof plan" action puts the same 2D geometry on the Design CAD roof sheet, on its own layer.
5. **Air termination methods compared**: one row each for mesh, rods by protection angle, rods by rolling sphere, and ESE terminal — inputs, result, down conductors, coverage, status. The ESE row always carries "not an IEC 62305 method: confirm that the authority accepts it".
6. **Surge protection at the boards**: board, location, fed from, surge protection, shown on SLD, status. Listing only; sizing is a later phase.
7. **Export full report**: tick the sections (inputs with references, all four methods with formulas and working, roof layout, down conductors and earth pits, surge protection schedule, BOQ quantities, checks, assumptions and disclaimer), choose PDF, Word or Excel with live formulas, export, or add to the issue package. Black-and-white, on the project title block.

## Stages

1. **Engine** — `src/calc/lightningProtection.ts` with tests. No UI, no project data. (This PR.)
2. **Project data and the study page** — inputs saved with the project and on a design reference; the page above without the roof plan action.
3. **Report** — PDF, Word and Excel export, and the issue package entry. Needs PDF baselines made on the Mac.
4. **Links** — roof plan geometry in Design CAD, earth pits on the earthing schematic, surge protection on the SLD, quantities to the BOQ.

## Later

- Surge arrester selection and sizing.
- Roofs that are not a rectangle (from the CAD outline).
