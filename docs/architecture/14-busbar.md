# 14 — Busbar sizing and Icw check
[← Index](00-index.md) · [Integration map](99-integration-map.md)

## 1. What it does

The module has two separate parts:

1. **Busbar trunking risers (busway)** for high-rise buildings — `src/calc/busbar.ts`. A riser starts at a source board, runs horizontally to the riser foot, then up the building with one tap-off unit per floor. For each riser the app works out:
   - demand: floor loads (typed kW/PF, or a board's maximum demand) × a diversity factor (by default the IEC 61439-1 Table 101 "rated diversity factor" by number of tap-offs);
   - design current Ib, the next standard feeding-breaker In ≥ Ib, and the busway rating needed = In ÷ ambient derating (1 % per °C above 40 °C);
   - the smallest busway in the data table (copper or aluminium) with rating ≥ that value, plus the other material for comparison;
   - current density at Ib (A/mm², shown only);
   - voltage drop section by section (feed, riser foot → first tap-off, then floor to floor);
   - short-circuit withstand: the busway's Icw (1 s) against the 3-phase prospective fault current at the source board;
   - physical data: width × height, weight, length, number of straight lengths, tap-off unit rating per floor, and BOQ lines.
2. **Board busbar Icw check** — `src/calc/busbarIcw.ts`. For any board where the user typed the busbar Icw (kA, 1 s, from the panel builder), it is compared with the board's prospective fault current. Nothing is assumed when the field is blank.

## 2. Files, components, functions and stores

("Store" = the place the app keeps the project in memory; here the project object passed through `onChange`.)

| File | Kind | Key functions or components | What they do |
|---|---|---|---|
| `src/calc/busbar.ts` | calc | `TYPICAL_BUSBAR_DATA` (:34), `iecDiversity` (:98), `ambientFactor` (:101), `sizeRiser` (:160), `busbarTypeFrom` (:248), `riserFromBuilding` (:258), `riserVd` (:307), types `BusRiser`, `RiserFloor`, `BusbarType`, `RiserResult`, `RiserVd` | All riser sizing, VD, Icw-vs-fault, length/weight. `TYPICAL_BUSBAR_DATA` is a typed-in table of 10 Cu and 9 Al ratings (630–5000 A). |
| `src/calc/busbarIcw.ts` | calc | `busbarIcwCheck` (:9), `busbarIcwChecks` (:16) | Board busbar Icw ≥ fault level at the board (`boardSummary(...).faultKA`). |
| `src/components/studies/BusbarStudy.tsx` | screen | `BusbarStudy` (default export), `exportSheet` (:69), `fromBoards` (:60), `addG10Mockup` (:54), `setData` (:67) | "Busbar trunking risers" page: riser setup, floors table, results cards, Cu/Al comparison, editable busway data table, PDF/Excel sheet. |
| `src/components/BoardFields.tsx` | screen | busbar material select (:121–127), Busbar Icw input (:129–133) | Where the board's `busbarMaterial` and `busbarIcwKa` are typed. |
| `src/types.ts` | model | `Board.ratedCurrentA` (:321), `Board.busbarMaterial` (:322), `Board.busbarIcwKa` (:324), `Project.busRisers` (:658), `Project.busbarData` (:659) | Saved fields in the project file. |
| `src/database/catalog.ts` | model | `CatalogBusbar` (:13), `catalogRate` (:56, `busway` key) | Busbar rows from the component database workbook; rate per m for the BOQ. |
| `src/database/database.ts` | model | busbar row parser (:213–220), `applyDatabase` (:291, overwrites `TYPICAL_BUSBAR_DATA` in place :303–304), `databaseSeeds` (:320) | Loads `Busbar.xlsx` and replaces the built-in table. |
| `electron/databaseSpec.json` | model | sheet `busbar` (:483) | Column definition of `Busbar.xlsx`. |
| `src/model/riserMockup.ts` | model | `addG10RiserMockup` (:22) | Demo: G+10 building, 11 SMDBs, a riser and a riser sheet. |
| `src/docs/studyReport.ts` | report | `buildSection` branch `key === 'busbar'` (:348–371) | Busbar riser study report (PDF / Excel tables). |
| `src/docs/riserForm.ts` | report | `buildRiserForm` (:44) | Authority "busbar riser" connected load / MD form. |
| `src/docs/formWorkbook.ts` | report | `addRiserSheet` call (:439) | Riser form sheet in the load-schedule workbook. |
| `src/docs/voltageDropReport.ts` | report | uses `RiserVd` | Riser VD in the VD report. |
| `src/calc/bom.ts` | calc | busway lines (:321–330) | BOQ group G: straight length (m), elbows, feed unit, end cap, tap-offs, fixings. |
| `src/calc/dashboard.ts` | calc | risers in quantities (:111), to-do items (:184–185) | Dashboard to-do for failed board Icw and failed riser (no type / Icw). |
| `src/model/dbRiser.ts`, `src/diagram/feederRiserLayout.ts`, `src/diagram/riserLayout.ts`, `src/diagram/boardSheet.ts` | report (drawings) | `sizeRiser` callers (:262, :185, :116); `busbarIcwCheck` (:93) | Riser drawings label the busway rating and tap-off ratings; board sheet prints "Isc ≤ Icw". |

## 3. Inputs — where its data comes from

| Data | From module (ID) | File + function |
|---|---|---|
| Floor load from a board (demand kW and signed kvar) | 07-load-schedule-panels / 06-network-sld-editor | `src/calc/summary.ts` `boardTotals`, read in `sizeRiser` (:166–168) |
| Floors from building levels (demand per floor, typical floor count, height) | 04-building-load-assessment | `src/calc/building.ts` `summarizeBuilding`, read in `riserFromBuilding` (:258) |
| Fault current at the riser's source board | 06-network-sld-editor | `src/calc/electrical.ts` `faultCurrentKA(impedanceToBoard(...))` in `sizeRiser` (:189–192) |
| Fault current at a board (for board Icw) | 06-network-sld-editor | `src/calc/summary.ts` `boardSummary(...).faultKA` (:117) in `busbarIcwCheck` (:12) |
| Voltage drop upstream of the source board | 08-voltage-drop / 06-network-sld-editor | `src/calc/electrical.ts` `upstreamVoltageDropPct` in `riserVd` (:309) |
| System voltage, ambient, VD limit | 03-parameters-rules | `project.voltageV`, `project.ambientC`, `project.vdLimitPct` in `sizeRiser` / `riserVd` |
| Standard breaker ratings | 11-breaker-cable-selection | `src/calc/sizing.ts` `STANDARD_BREAKER_A` in `sizeRiser` (:184) |
| Busway catalogue (rating, area, R, X, Icw, size, weight, rate) | 32-component-database | `src/database/database.ts` `applyDatabase` (:303–304) mutates `TYPICAL_BUSBAR_DATA`; or `project.busbarData` typed on the page |
| Board Icw, busbar material | 06-network-sld-editor | `src/components/BoardFields.tsx` (:121–133) |

## 4. Outputs — where its results go

| Result | Used by module (ID) | File + function |
|---|---|---|
| Riser study report tables (PDF / Excel) | 25-reports-exports | `src/docs/studyReport.ts` `buildSection('busbar')` (:348); listed in `src/docs/reportTypes.ts` (:23) |
| Riser VD (exact + uniform) in VD study and VD report | 08-voltage-drop | `src/components/studies/VoltageDropStudy.tsx` (:67), `src/components/docs/exportCatalogue.ts` (:107) |
| BOQ / bill of materials busway lines | 20-equipment-boq-pricing | `src/calc/bom.ts` (:321–330); rate from `src/database/catalog.ts` `catalogRate` (:62) |
| Riser drawings (busway rating, tap-off ratings) | 24-drawings-sld-sheets | `src/model/dbRiser.ts` (:262–267), `src/diagram/feederRiserLayout.ts` (:185–190), `src/diagram/riserLayout.ts` (:116–118) |
| Board sheet Icw text "Isc ≤ Icw / > Icw — CHECK" | 24-drawings-sld-sheets | `src/diagram/boardSheet.ts` (:93, :133–143, :194) |
| Busbar riser authority form | 07-load-schedule-panels / 25-reports-exports | `src/docs/riserForm.ts` `buildRiserForm` (:44), `src/docs/formWorkbook.ts` (:439) |
| To-do items and riser quantities | 28-dashboard-readiness | `src/calc/dashboard.ts` (:111, :184–185) |
| Change tracking of `busRisers`, `busbarData`, `busbarIcwKa` | 26-revisions-changes | `src/model/revisions.ts` (:133, :148), `src/model/changeClass.ts` (:28, :37) |

## 5. User flow — from button click to result

1. Ribbon → **Busbar riser** (`src/components/Ribbon.tsx` :535) sets view `busbar`; `src/App.tsx` (:1624) renders `BusbarStudy`.
2. **+ Riser** → `add` → `newRiser` (`busbar.ts` :92): Cu, 10 m feed, 3.6 m floor height, 6 floors of 60 kW / 0.9 PF, fed from the first main board.
3. User sets source board, material, feed length, floor height, floors before the first tap-off, diversity (blank = auto), ambient (blank = project), straight length, elbows.
4. Floors: typed per row, or **Take floors from the boards** (`fromBoards`, one tap-off per board fed from the source), or **Take floors from <building>** (`riserFromBuilding`).
5. Every edit calls `onChange` → project saved in memory with an undo step (`App.tsx` :1624 `{ step: true }`); `sizeRiser` re-runs in `useMemo` (`BusbarStudy.tsx` :34) and again for the other material (:35).
6. Results cards show Ib, In, required rating, selected busway, area and A/mm², Icw vs fault, VD at the top tap-off (warn at > half the VD limit), size, weight, parts; notes list Icw failure, "above the data", auto diversity, derating.
7. Optional: edit the **Busway data** table (`setData`), saved as `project.busbarData`.
8. **PDF sheet / Excel** → `exportSheet` → `buildSection('busbar')` → `savePdf` / `saveBinary`.
9. Board Icw: in the board properties (`BoardFields.tsx` :129) the user types Icw; `busbarIcwCheck` runs when the board sheet is drawn and when the dashboard is built.

## 6. Linked to (working connections)

- 06-network-sld-editor → fault level at the source board (`faultCurrentKA(impedanceToBoard)`), same formula as `boardSummary.faultKA`.
- 07-load-schedule-panels → floor demand from a board (`boardTotals`), including signed (leading) kvar.
- 04-building-load-assessment → floors from building levels (`riserFromBuilding`).
- 08-voltage-drop → `riserVd` adds upstream VD and shows each riser on the VD study and report.
- 20-equipment-boq-pricing → busway straight length, elbows, feed unit, end cap, tap-offs, fixings; rate per m from the catalogue.
- 24-drawings-sld-sheets → riser drawings and board sheet Icw text.
- 25-reports-exports → study report section `busbar`; riser authority form.
- 28-dashboard-readiness → to-do for failed Icw (boards and risers) and risers above the data.
- 32-component-database → `Busbar.xlsx` replaces the typical table.
- 26-revisions-changes, 02-project-storage → fields tracked and integrity-checked.



---

*Public summary: describes what the module does and how it connects. The engineering review of open issues is kept separately.*
