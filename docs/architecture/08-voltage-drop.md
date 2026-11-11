# 08 — Voltage drop study
[← Index](00-index.md) · [Integration map](99-integration-map.md)

## 1. What it does

The voltage drop study (left menu → Voltage drop, `view === 'voltage-drop'` in `src/App.tsx:1580`) works out the source-to-load voltage drop of every panel-to-panel cable (MDB → SMDB → DB) and every equipment cable (motor, AHU, isolator…). It can also add each DB's worst final circuit and shows busbar risers.

How each cable is calculated (`src/calc/voltageDrop.ts` `vdRow`):

- **3-phase vs 1-phase** comes from the cable's core count: `cores >= 3` → 3-phase, `cores === 2` → single-phase (`vdRow` line 77; same rule in `src/calc/electrical.ts` `vdPctFor`).
- **R** = R20 (IEC 60228 DC value from the cable table) × a temperature factor (`src/calc/electrical.ts` `rOperatingOhmPerKm`, `resistanceFactor`). Factor = 1 + 0.00393 × (θ − 20) for copper when the project's conductor temperature `vdTempC` is set, otherwise a flat 1.2 (≈ 71 °C).
- **X** is one reactance per size for 4-core Cu/XLPE/SWA cable (`src/calc/cableTable.ts` `REFERENCE_CABLE_TABLE`, or Cables.xlsx).
- **Power factor**: for an equipment cable, the feeder's stored PF. For an incomer (a cable that feeds a board), the PF comes from the P and Q of everything below it, per phase. The phase with the largest drop sets the drop (`src/calc/electrical.ts` `incomerBasis`, ENG-005).
- **Parallel cables**: R and X are divided by the number of runs (`runsOf`).
- **Motor starting**: starting drop = upstream drop + cable drop × the starter's current multiple (DOL 6, S/D 2, SS 3, VFD 1.2 — `src/calc/motor.ts` `STARTERS`). It is compared with the database rule `motorStartVdLimitPct` (default 10 %).
- **Fix suggestion**: the smallest bigger size (same runs) that brings the total within the limit (`suggestCable`).
- **Profile chart**: the cumulative drop along the supply path of the selected or worst cable (`vdPath`, `VdProfile`).
- **Outputs**: on-screen table, CSV, and a black-and-white PDF report (`src/docs/voltageDropReport.ts` `buildVdReportHtml`), also offered in the Export centre.

The same drop (on the same basis) is also worked out for every circuit by the core feeder check (`src/calc/electrical.ts` `evaluateFeeder` → `FeederResult.vdPct / vdTotalPct / vdStatus`). The cable schedule, calculation report, compliance summary, SLD colouring and headless CLI use that copy (see §4).

## 2. Files, components, functions and stores

("Store" = the place the app keeps the project in memory. Here it is the `project` object passed in and changed through `onChange`. "Calc project" = the copy of the project saved at the last Run (F5); results are shown from it.)

| File | Kind | Key functions or components | What they do |
|---|---|---|---|
| `src/calc/voltageDrop.ts` | calc | `VdRow`, `vdRow`, `vdCandidates`, `isVdCable`, `vdRows`, `vdPath`, `suggestCable`, `worstFinalCircuits`, `vdFormula`, `groupByPanel`, `editVdCable`, `addVdCable`, `motorStartVdLimit` | One row per cable: Ib, PF, mV/A/m, Vd (V, %), upstream %, total %, limit, motor-start %, status; supply path; fix size; the written-out formula; edits written back to the feeders |
| `src/calc/electrical.ts` | calc | `rOperatingOhmPerKm`, `resistanceFactor`, `COPPER_ALPHA`, `runsOf`, `designCurrentA`, `incomerBasis`, `feederVdPctAt`, `vdPctFor` (private), `voltageDropPct`, `upstreamVoltageDropPct`, `upstreamVdOf` (private), `vdEvaluator`, `evaluateFeeder` | The core VD maths used by every other module; per-phase incomer basis; cumulative upstream drop; `FeederResult.vdStatus` |
| `src/calc/cableTable.ts` | calc / data | `CableSpec`, `REFERENCE_CABLE_TABLE`, `getCable`, `resolveCable`, `cables`, `setCables`, `cableDataNotice` | R20 and X per size (copper only); Cables.xlsx replaces the built-in rows |
| `src/calc/motor.ts` | calc | `STARTERS`, `starterInfo`, `starterOf`, `isMotor` | Starting-current multiple per starter type |
| `src/calc/busbar.ts` | calc | `riserVd` | Busbar riser drop, section by section (shown on this page; owned by 14-busbar) |
| `src/database/catalog.ts` | data | `RULES` (`motorStartVdLimitPct`), `rule` | Motor-start limit from Rules.xlsx (global, not per project) |
| `src/components/studies/VoltageDropStudy.tsx` | screen | `VoltageDropStudy`, `VdProfile`, `RiserVdCard`, `TEMPS`, `PHASES` | The page: limit and conductor temperature settings, cable picker, result cards, editable table, fix button, ƒ formula row, profile chart, riser cards, CSV/PDF export |
| `src/docs/voltageDropReport.ts` | report | `VD_HEADERS`, `vdCells`, `vdCsvCells`, `startText`, `scopeLabel`, `printedColumns` (private), `buildVdReportHtml` | Report table text, CSV cells, the plain PDF report |
| `src/components/docs/exportCatalogue.ts` | report | entry `key: 'voltage-drop'` (line 102) | Export centre entry: whole-system VD report from the calc project |
| `src/docs/studyReport.ts` | report | `lf` section (line 218–245) | Load-flow study section: feeders' ΔV and a motor-starting table (uses `vdRow`) |
| `src/types.ts` | model | `Project.vdLimitPct`, `vdTempC`, `vdFinalCircuits`, `vdSelection`, `vdReportDocNo`; `Feeder.cores`, `parallel`, `powerFactor`, `lengthM`, `cableCsaMm2`, `starter` | Saved project fields used by the study |

## 3. Inputs — where its data comes from

| Data | From module (ID) | File + function |
|---|---|---|
| Boards, supply tree (`upstreamId`), feeders, incomers (`feedsBoardId`) | 06-network-sld-editor | `src/calc/summary.ts` `boardsInSupplyOrder`; `src/calc/network` `boardOf`, `feedersOn`, `networkOf` |
| Feeder load kW, demand factor, PF, cores, length, size, runs, starter | 06-network-sld-editor / 07-load-schedule-panels | `src/types.ts` `Feeder`; read in `vdRow` |
| DB load (downstream P and Q per phase) | 07-load-schedule-panels | `src/calc/loadSchedule.ts` `boardPhasePQ`, `scheduleCircuits`, `isScheduleCircuit` |
| Recorded maximum demand of existing boards | 33-quick-calcs-existing | `src/model/existing.ts` `recordedPQ` (via `boardDemandKw`, `boardPhasePQ`) |
| Capacitor steps (negative kvar) in incomer PF | 13-power-factor-correction | `src/calc/loadSchedule.ts` `boardPhasePQOf` → `switchedOnBoard` |
| VD limit, conductor temperature, final-circuit option, selection | 03-parameters-rules | `Project.vdLimitPct`, `vdTempC` (also set in `src/components/ProjectSettings.tsx:74`, `PreferencesDialog.tsx:101`, presets in `src/model/designReference.ts`) |
| Motor start limit | 32-component-database | `src/database/catalog.ts` `rule('motorStartVdLimitPct')` |
| Cable R20 and X per size | 11-breaker-cable-selection / 32-component-database | `src/calc/cableTable.ts` `getCable` (Cables.xlsx via `setCables`) |
| Starting-current multiple | 33-quick-calcs-existing (motor data) | `src/calc/motor.ts` `starterInfo` |
| Busbar riser data | 14-busbar | `src/calc/busbar.ts` `riserVd` |

## 4. Outputs — where its results go

| Result | Used by module (ID) | File + function |
|---|---|---|
| Edited cable size, length, cores, PF, load, name, remarks | 06-network-sld-editor, 07-load-schedule-panels (same `project.feeders`) | `src/calc/voltageDrop.ts` `editVdCable`, `addVdCable` |
| VD PDF report (study page and Export centre) | 25-reports-exports | `src/docs/voltageDropReport.ts` `buildVdReportHtml`; `src/components/docs/exportCatalogue.ts:102` |
| VD CSV | 25-reports-exports | `vdCsvCells`, `saveCsv` in `VoltageDropStudy.exportCsv` |
| Motor-starting table in the load-flow study report | 25-reports-exports | `src/docs/studyReport.ts:221` (`vdRow(...).startPct`) |
| `FeederResult.vdPct / vdTotalPct / vdStatus` (core copy) → cable schedule | 19-cable-tray-containment | `src/docs/schedules.ts` `cableSchedule` (columns "Vd cable (%)", "Vd total (%)") |
| Same → calculation report, compliance summary | 25-reports-exports | `src/docs/calcSections.ts:62` ; `src/docs/compliance.ts:93` |
| Same → SLD colour by VD, board voltage | 06-network-sld-editor, 24-drawings-sld-sheets | `src/components/SystemDiagram.tsx:457` `feederRatio`, `:463` `boardRatio` |
| Same → quick fixes, sizing budget | 11-breaker-cable-selection | `src/calc/quickFix.ts:20`; `src/calc/sizing.ts:284` `recommend` |
| Same → existing-installation check | 33-quick-calcs-existing | `src/calc/existing.ts:105` |
| Same → headless CLI results / to-do | 31-headless-cli-mcp | `src/headless/tools.ts:292`, `:299`; VD report via `src/headless/exportTools.ts` (Export centre) |
| Same → engine compare (built-in vs OpenDSS/pandapower) | 16-load-flow-engines | `src/engines/builtin.ts:14`, `src/components/EngineCompare.tsx` |
| R factor for OpenDSS / external engines | 16-load-flow-engines | `src/engines/opendss/exportDss.ts:72,120`; `src/engines/external.ts:12` `resistanceFactor(project.vdTempC)` |

## 5. User flow — from button click to result

3. For each ticked cable, `vdRow(calcProject, feeder)` runs:
   `designCurrentA` / `incomerBasis` → `rOperatingOhmPerKm(csa, vdTempC)` + `getCable(csa).xOhmPerKm` → mV/A/m → Vd → `upstreamVoltageDropPct` → total → status and motor `startPct`.
4. If "Worst final circuit of each DB" is ticked (`project.vdFinalCircuits`), `worstFinalCircuits(calcProject)` adds one row per DB.
5. Result cards show the worst total, the limit, counts, the longest cable, the worst motor start and the worst riser (`riserVd`).
6. Clicking a row sets `focusId` → `vdPath` → `VdProfile` draws the cumulative chart. ƒ shows `vdFormula`.
8. The fix button (`suggestCable`) applies a bigger size through `editVdCable`.

## 6. Linked to (working connections)

- **06-network-sld-editor**: same feeders and boards. Edits on the VD page change the SLD (`editVdCable`). The SLD colours by `vdTotalPct ÷ vdLimitPct`.
- **07-load-schedule-panels**: a DB incomer's load comes from the DB's load schedule, per phase (`boardPhasePQ`). Final circuits are edited only on the schedule (locked cells).
- **03-parameters-rules**: `vdLimitPct` and `vdTempC` are project fields, editable on this page, in Project settings, Preferences and design-reference presets. The study reads them directly (`vdRow` line 89).
- **11-breaker-cable-selection**: cable selection uses the same VD basis (`vdEvaluator`, `feederVdPctAt`) and the same `vdTempC`.
- **13-power-factor-correction**: switched capacitor kvar reduces the incomer Q used for the drop.
- **14-busbar**: riser drops are shown and printed on the VD page/report (`riserVd`).
- **16-load-flow-engines**: the R factor is passed to the external engines. The engine compare checks `vdTotalPct`.
- **19-cable-tray-containment**: the cable schedule prints Vd cable % and Vd total % (`cableSchedule`), from `evaluateFeeder`.
- **25-reports-exports**: VD report in the Export centre; load-flow section with the motor-starting table; calc report verification table "worst circuit on each board".
- **26-revisions-changes**: `vdLimitPct`, `vdTempC`, `vdFinalCircuits` are classed as engineering changes (`src/model/changeClass.ts:34–35`, `src/model/designChanges.ts:73`).
- **31-headless-cli-mcp**: results and to-do include VD. The Export-centre VD report can be built headless.
- **02-project-storage**: `vdSelection`, `vdReportDocNo`, `vdFinalCircuits`, `vdTempC`, `vdLimitPct` are saved project fields (`src/types.ts:555–632`), validated in `src/model/projectValidate.ts:48–49`.



---

*Public summary: describes what the module does and how it connects. The engineering review of open issues is kept separately.*
