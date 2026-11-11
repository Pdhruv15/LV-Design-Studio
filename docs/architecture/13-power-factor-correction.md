# 13 — Power factor correction
[← Index](00-index.md) · [Integration map](99-integration-map.md)

## 1. What it does

The module sizes capacitor banks that raise the power factor (PF) to the project target (default 0.95). It has two calculators and one shared switching rule.

- **Design study ("From the design")**: reads the maximum demand (P kW, Q kvar) of each board from the network model. The user chooses where the banks go: central at the MDB, group at chosen boards, or individual fixed capacitors at motors and HVAC units. The study sizes the banks from the bottom up with Qc = P (tan φ1 − tan φ2). It also picks the step size, detuning reactor, capacitor voltage, breaker (≥ 1.43 × bank current) and cable. It can write the banks back onto the SLD as capacitor ways (a "way" = an outgoing feeder on a board).
- **Custom calculator ("Custom calculation")**: a standalone calculation for an existing installation. Inputs can be measured kW, kVA or V·A with PF, a utility bill (kWh and kvarh), or a list of loads. It gives the bank, the steps switched in at that load, detuning, a breaker size, a power triangle, phasor diagrams and an A4 PDF report.
- **Capacitor switching rule** (`src/calc/capSwitching.ts`): every capacitor bank on the SLD is treated as an automatic bank. An APFC relay (automatic power factor correction controller) switches whole steps, choosing the fewest that reach the target without going leading. All built-in network totals count this switched kvar, not the full nameplate kvar.

## 2. Files, components, functions and stores

| File | Kind | Key functions or components | What they do |
|---|---|---|---|
| `src/calc/pfc.ts` | calc | `PfcPlan`, `PFC_DEFAULTS`:35, `pfcPlanOf`:37, `planPfc`:150, `makeRow`:218, `addPfcBanks`:264, `capacitorFeeder`:138, `capVoltage`:134, `harmonicShare`:122, `subtree`:112 | Design study: places and sizes banks per strategy, computes before/after PF, kVA and current per board and per main board, and adds banks to the SLD |
| `src/calc/pfcCalc.ts` | calc | `PfcCalcInput`:12, `PFC_CALC_DEFAULT`:32, `loadOf`:84, `calcPfc`:104, `operatingState`:43, `powerTriangleSvg`:187, `phasorSvg`:245, `stepsSvg`:266, `triangleFrom`:286, `pfText`:57 | Standalone calculator: P and Q from typed values, bank in standard sizes, switched steps, detuning from a harmonics choice or measured THD, breaker, SVG diagrams |
| `src/calc/capSwitching.ts` | calc | `switchedKvar`:8, `switchedOnBoard`:22 | APFC switching rule used by the network totals (fixed banks always on, automatic banks switch steps) |
| `src/components/studies/PfcStudy.tsx` | screen | `PfcStudy`:26 (`setPlan`:29, `addToSld`:47, `exportSheet`:54) | The "Power factor correction" page: strategy, boards, step, detuning, light-load check, results table, "Add to SLD", PDF/Excel sheet |
| `src/components/studies/PfcCalculator.tsx` | screen | `PfcCalculator`:24 (`set`:26, `report`:31, `toDesign`:35) | The custom-calculation panel; saves inputs to `project.pfcCalc`; "Add bank" puts the result on a chosen board |
| `src/docs/pfcReport.ts` | report | `pfcReportHtml`:19 | A4 black-and-white PDF of the custom calculation |
| `src/docs/studyReport.ts` | report | `pfcSection`:466 | The design study as a section of the study/calculation report (PDF and Excel) |
| `src/calc/sizing.ts` | calc | `sizePfc`:213, `recommend`:263 (capacitor rule at :270) | A third, simpler kvar sizing (fixed 25 kvar steps) used by the SLD palette; `recommend` sets breaker In ≥ 1.43 × Ib for any feeder with `kvar` |
| `src/calc/quick.ts` | calc | `pfCorrection`:167, `pfcBank`:252 | Quick-calc kvar formula and step split (Quick calculators, CLI/MCP) |
| `src/types.ts` | model | `Feeder.kvar`:239, `Feeder.capSteps`:250, `Feeder.detunedPct`:251, `Board.protection.apfc`:352, `Project.pfcCalc`:656, `Project.pfc`:661, `StudySettings.pfTarget`:1063 | Where PFC data lives in the project file ("project file" = the saved JSON of the whole design) |

## 3. Inputs — where its data comes from

| Data | From module (ID) | File + function |
|---|---|---|
| Board maximum demand P, Q (demand factors applied; existing banks counted at switched kvar) | 06-network-sld-editor | `src/calc/summary.ts` `boardTotals`/`boardTotalsOf`:41–63 |
| Board tree and supply order (child boards before parents) | 06-network-sld-editor | `src/calc/summary.ts` `boardsInSupplyOrder`:125; `src/calc/network` `feedersOn` |
| Load type, starter (VFD, star-delta), kW, PF of each final circuit | 07-load-schedule-panels | `Feeder` in `src/types.ts`; `loadTypeOf` in `src/calc/summary.ts`:9 |
| PF target | 03-parameters-rules | `settingsOf(project).pfTarget` (`src/types.ts`:1063/1075), edited on the PFC page (`PfcStudy.tsx`:85) |
| Authority minimum PF (calculator warning, report footer) | 27-review-submissions-authority / 32-component-database | `rule('pfMinimum')` from `src/database/catalog` (Rules.xlsx), used in `pfcCalc.ts` `calcPfc`:152 and `pfcReport.ts`:60 |
| Transformer kVA at each main board (loading before/after) | 12-transformer-generator | `Board.sourceKva`, read in `pfc.ts` `planPfc`:249 |
| Breaker ratings, cable selection, fault level for the bank way | 11-breaker-cable-selection | `src/calc/sizing.ts` `recommend`, `applyRecommendation`, `breakerRatings` (called from `capacitorFeeder`:145) |
| System voltage | 03-parameters-rules / 02-project-storage | `project.voltageV` |
| Typed calculator inputs (kW/kVA/V·A/bill/loads, step, harmonics, THD, transformer kVA, losses) | user, saved in 02-project-storage | `project.pfcCalc` via `PfcCalculator.tsx` `set`:26 |
| Study plan (strategy, boards, step, detuning, min kW, light-load %) | user, saved in 02-project-storage | `project.pfc` via `PfcStudy.tsx` `setPlan`:29; read by `pfcPlanOf`:37 |

## 4. Outputs — where its results go

| Result | Used by module (ID) | File + function |
|---|---|---|
| Capacitor ways added to boards (kvar, capSteps, detunedPct, breaker, cable) | 06-network-sld-editor | `pfc.ts` `addPfcBanks`:264; `PfcCalculator.tsx` `toDesign`:35 |
| Switched kvar of banks in board totals and per-phase totals | 06-network-sld-editor, 07-load-schedule-panels | `capSwitching.ts` `switchedOnBoard` called from `summary.ts`:62 and `loadSchedule.ts`:213 |
| Planned kvar taken off transformer demand ("include PFC") | 12-transformer-generator | `src/calc/txGen.ts` `sizeTransformers`:106–110 |
| "No capacitor bank yet" warnings | 28-dashboard-readiness | `src/calc/dashboard.ts`:181–182 |
| Capacitor bank list for the compliance summary | 25-reports-exports | `src/docs/compliance.ts`:43–44 |
| PFC section in study/calculation report, PDF + Excel | 25-reports-exports | `studyReport.ts` `pfcSection`:466; `calcReport.ts` `CALC_REPORT_STUDIES`:26; `reportTypes.ts`:23 |
| Custom-calculation PDF in the export centre | 25-reports-exports | `src/components/docs/exportCatalogue.ts`:110–113 (`pfc-calc`) |
| BOQ line per capacitor way | 20-equipment-boq-pricing | `src/calc/bom.ts`:228 |
| Capacitor element in external load flow | 16-load-flow-engines | `engines/python/lvds_engine.py`:395; `src/engines/opendss/exportDss.ts`:155 |
| IEC 60831 listed in the design basis | 25-reports-exports | `src/docs/designBasis.ts`:93 |
| Plan/calculator changes recorded in revisions | 26-revisions-changes | `src/model/revisions.ts`:149–150; `src/model/changeClass.ts`:37 |
| Plan board references checked | 02-project-storage | `src/model/integrity.ts`:55 |

## 5. User flow — from button click to result

Design study:
1. Ribbon → "Power factor" (`src/components/Ribbon.tsx`:538) sets view `pfc`. `App.tsx`:1625 renders `PfcStudy`.
2. `PfcStudy` reads the plan with `pfcPlanOf` and runs `planPfc(project, plan)` again on every change, using `useMemo`, which reruns the calculation only when the project changes.
3. The user picks a strategy, ticks boards, picks step, detuning and light-load %. `setPlan` writes `project.pfc` and the page re-runs.
4. `planPfc`: for the individual strategy it first sizes fixed capacitors per motor/HVAC load (rounded **down**, 0 at VFDs) (:178–191). Then it sizes each chosen board bank, deepest board first. The bank is `Q − banks below − P·tan φ2`, rounded **up** to whole steps (:195–216). Detuning is 7 % when the non-linear share is ≥ 25 % (`harmonicShare`, `DETUNE_AT`:48). `makeRow` adds the capacitor voltage, bank current, and the breaker and cable from `capacitorFeeder` → `recommend`.
5. The page shows main-board cards (PF before → after, kVA released, transformer loading, mini power triangle via `triangleFrom` + `powerTriangleSvg`) and a row table.
6. "Add all to the SLD" or the per-row "Add to SLD" calls `addPfcBanks`. It enlarges an existing bank on that board or inserts a new `…-CAP` way. Then `onChange`, and the status bar asks the user to run calculations (F5).
7. "PDF sheet" / "Excel" calls `exportSheet`, which uses `pfcSection` with `buildStudyReportHtml` / `buildStudyWorkbook`.

Custom calculator:
1. Mode switch "Custom calculation" (`PfcStudy.tsx`:36,71) renders `PfcCalculator`.
2. Each input edit calls `set`, which saves the full input to `project.pfcCalc`. Then `calcPfc` runs: `loadOf` gives P and Q, then the required kvar, a standard bank (`STANDARD_BANKS`), the steps, `operatingState` (the steps switched in), detuning, `capVoltage`, the breaker and the before/after values.
3. "Report (PDF)" calls `pfcReportHtml` and then `savePdf`.
4. "Add bank" calls `toDesign`, which uses `capacitorFeeder` on the chosen board.

## 6. Linked to (working connections)

- 06-network-sld-editor: banks written to the SLD by `addPfcBanks`/`toDesign`. Board totals count them through `switchedOnBoard`. Running `planPfc` again after adding gives 0 kvar more (tested: `src/calc/pfc.test.ts` "add to SLD").
- 07-load-schedule-panels: per-phase P/Q uses the same switching rule (`loadSchedule.ts`:210–214).
- 11-breaker-cable-selection: breaker In ≥ 1.43 × Ib (IEC 60831: 1.3 × 1.1) in `recommend`:270. The cable is then chosen with Iz ≥ In, so the cable also carries ≥ 1.43 × bank current. This is inside the 1.3–1.5 × In range in the brief.
- 20-equipment-boq-pricing: each capacitor way becomes a BOQ line with kvar, steps and detuning (`bom.ts`:228).
- 25-reports-exports: study report section, calculation report, export catalogue, design basis (IEC 60831).
- 28-dashboard-readiness: dashboard warning; `projectReadiness.ts`:12 includes the `pfc` scope.
- 26-revisions-changes and 02-project-storage: `pfc` and `pfcCalc` are saved, tracked in revisions and integrity-checked.



---

*Public summary: describes what the module does and how it connects. The engineering review of open issues is kept separately.*
