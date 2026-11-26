# Short circuit sketch — proposal (2026-11-26)

Status: Approved 2026-11-26: all seven decisions (A–G) with the recommended answers. Built: none yet. Next: step 1 solver.
Mockup: `docs/mockups/sc-sketch-mockup.html` + `.png` (numbers illustrative).
Related: [[UI UX proposals - 2026-11-24 - Per-unit fault study, fault points, transformers and cable types]] (step 7, voltage per board and in-line transformer, is needed for Send to SLD of in-line transformers).

## What was asked

To check a short circuit today, too many details have to be filled in: panel name, isolator, busbar, breaker and more. Can the short circuit calculation use a simple SLD, like the example drawing (Source 11 kV 500 MVA → RMU-1 with F1 → TX-1 1000 kVA 11/0.415 kV Dyn11 5 % → MDB-1 with F2 and GEN-1 800 kVA X″d 15 % X′d 25 % → 4C 240 mm² Cu/XLPE 50 m → SMDB-1 with F3 → TX-2 250 kVA step-up 0.415/0.69 kV 4 % → MCC-1 with F4; TX-3 100 kVA step-down 0.415/0.208 kV 4 % → DB-IT 208 V)?

Then: after this study, can the sketch be moved to the SLD?

## Today, checked in the code

- The SLD short circuit study shows a fault level only when the boards are complete: name, busbar, incomer and circuits.
- Quick calculators (`src/components/QuickCalcs.tsx`, `src/calc/quick.ts`: `faultAtCableEnd`, `faultFromTransformer`) cover one transformer and one cable only.
- Per-unit code exists in `src/calc/perUnit.ts` (`puBase`, `toPu`, `peakFactor`, `puFaultAt`), but works on a project's boards at one project voltage.
- `project.voltageV` is one voltage for the whole project; in-line transformers at another voltage wait for step 7 of the 2026-11-24 proposal.

## Proposal

A **Short circuit sketch** page, separate from the project's boards: it does not touch the load schedule, breakers or BOQ.

### Seven items, fault data only

| Item | Fields |
|---|---|
| Source | kV, fault MVA or kA, X/R |
| Transformer | kVA, primary and secondary kV from the market lists (3.3, 6.6, 11, 13.8, 22, 33 kV; 208, 380, 400, 415, 433, 480, 690 V), Z %, X/R, vector group, tap; step-up or step-down is read from the voltages |
| Busbar | name only; voltage comes from the transformer above |
| Cable | size, Cu/Al, XLPE/PVC, multicore/single-core, length, runs; R and X from the app's cable data by type |
| Generator | kVA, X″d, X′d, optional sustained multiple |
| Motor group | total kW; adds about 5 × rated current |
| Fault point | on a busbar, or on a cable at a typed distance |

### Building it

Click a busbar, then "+ Transformer below", "+ Cable", "+ Generator", "+ Motors" or "+ Fault point". The tree lays itself out. A side form shows only the selected item's fields.

### Results

- Ik″ maximum (c 1.05 LV, 1.1 MV), peak ip (κ = 1.02 + 0.98 e^(−3R/X)), minimum fault (c 0.95, generator X′d), optional line-earth.
- Labels on the drawing in kA next to each fault point.
- A per-unit table (base 100 MVA, changeable).
- A short black-and-white PDF: one A3 sheet, drawing and table.

### Calculation

A new per-unit radial solver in `src/calc` for several voltage levels and sources anywhere: for each fault point the network is reduced to that point, sources in parallel. Later the main project's study can use the same solver (links to step 7 of the 2026-11-24 proposal, voltage per board).

### Send to SLD (two-way with Start from project)

A **Send to SLD** button creates real project items from the sketch:

- each busbar becomes a board (name from the sketch); busbar rating and incomer are left for the user, flagged as to-do lines;
- the source becomes the project's grid source / supply;
- transformers become the main board's transformer (kVA, Z %, X/R, vector group, primary kV, tap);
- cables become feeders between those boards (size, family, length, runs);
- generators become standby / parallel generator boards;
- each motor group becomes one motor circuit.

Busbars that already exist in the project (matched by name) are updated, not duplicated. A summary of what will be created and updated is shown before anything happens. In-line transformers (TX-2 step-up and TX-3 step-down in the example) and boards at another voltage need step 7 of the 2026-11-24 proposal; until then they are skipped with a note.

## Decisions

| # | Question | Recommended |
|---|---|---|
| A | Where | A new Short circuit sketch page beside the studies |
| B | Saving | Inside the project file as named sketches (alternative: its own file) |
| C | Start from project | A button copying the project's sources, transformers, busbars and cables into a sketch; a later step |
| D | Line-earth | Optional; asks earthing data only when ticked |
| E | Print | One A3 black-and-white sheet, drawing and fault table |
| F | Voltages | Busbar voltage from the transformer above |
| G | Move a sketch to the SLD | A Send to SLD button with a preview of what is created; existing boards matched by name are updated |

## Build order

1. Solver and tests: hand-worked examples, and the same result as the existing study on a sample project with one transformer.
2. Page: drawing, add buttons, side form, results.
3. PDF sheet.
4. Start from project.
5. Send to SLD (in-line transformers after step 7 of the 2026-11-24 proposal).
