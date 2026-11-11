# 11 — Breaker & cable selection
[← Index](00-index.md) · [Integration map](99-integration-map.md)

## 1. What it does

This module chooses and checks the protective device and the cable of every circuit ("feeder" = one outgoing
circuit in the app's project data, from a board to a load or to another board).

- **Check** (`evaluateFeeder`, `src/calc/electrical.ts:382`): design current Ib, cable rating Iz after derating,
  overload rule Ib ≤ In ≤ Iz (IEC 60364-4-43), breaker loading (warn above 85 %), voltage drop source-to-load,
  and breaking capacity Icu ≥ prospective fault at the breaker's board busbar.
- **Rating Iz** (`ratingBasis`, `src/calc/installation.ts:38`): tabulated rating for the installation method ×
  ambient (or ground temperature and soil) factor × grouping factor × number of parallel runs.
- **Recommend** (`recommend`, `src/calc/sizing.ts:265`): smallest standard In ≥ Ib ÷ 0.85 (× 1.43 for capacitor
  banks), smallest Icu step ≥ fault, device type by rating (MCB ≤ 63 A, MCCB, ACB > 1600 A), and the smallest cable
  (1–4 runs, up to 8 above 1000 A) with Iz ≥ max(Ib, In) inside a voltage-drop budget.
- **Breaker and cable selection screen** (`SelectionStudy`, `src/components/studies/SelectionStudy.tsx`): current vs
  recommended breaker, Icu and cable per circuit, "Fix only" / "Optimise", Apply per row or Apply all.
- **Quick fixes** (`quickFixes`, `src/calc/quickFix.ts:25`): up to four one-click patches (breaker up/down, bigger
  cable, one more parallel run, higher Icu) offered on the system diagram for a failing circuit.
- **Cable data** (`src/calc/cableTable.ts`): built-in reference table (Cu/XLPE/SWA 4-core, method E, 30 °C), replaced
  machine-wide by `Cables.xlsx` from the LV Database; source tracking and "DATA REQUIRED" findings.

`sizing.ts` also holds transformer, generator, UPS and PFC sizing (modules 12-transformer-generator, 15-ups-solar,
13-power-factor-correction); only the "breaker & cable selection" part (lines 241–347) belongs here.

## 2. Files, components, functions and stores

| File | Kind | Key functions or components | What they do |
|---|---|---|---|
| `src/components/studies/SelectionStudy.tsx` | screen | `SelectionStudy` | Table of now → recommended (In + type, Icu, cable); mode toggle; Apply / Apply all. Optional board focus via `subtree`. |
| `src/calc/sizing.ts` | calc | `STANDARD_BREAKER_A`, `STANDARD_ICU_KA`, `breakerRatings`, `icuSteps`, `setBreakerLists`, `recommend`, `applyRecommendation`, `applyAllRecommendations`, `passes`, `INCOMER_VD_BUDGET_PCT` | Standard In / Icu lists (or Breakers.xlsx); the recommendation and applying it (top-down for Apply all). |
| `src/calc/installation.ts` | calc | `ratingBasis`, `feederRatingBasis`, `factorsText`, `groundChecks`, `REFERENCE_GROUND_C`, `REFERENCE_SOIL_KMW` | Iz per IEC 60364-5-52 installation method with the correction factors listed. |
| `src/calc/cableTable.ts` | calc / data | `REFERENCE_CABLE_TABLE`, `AMBIENT_POINTS`, `ambientCorrectionFactor`, `ambientCheck`, `INSTALL_METHODS`, `REFERENCE_METHOD_RATINGS` (empty), `cables`, `setCables`, `resolveCable`, `getCable`, `methodRating`, `cableDataStatus`, `cableDataNotice`, `cableDataFindings`, `defaultCpcMm2`, `cpcOf` | Cable data in use and where each value comes from; ambient factor table; CPC default per IEC 60364-5-54 Table 54.2. |
| `src/calc/quickFix.ts` | calc | `failReasons`, `quickFixes`, `QuickFix` | Plain-words failure reasons and verified one-click patches. |
| `src/calc/containment.ts` (lines 43–66) | calc / data | `groundTempFactor`, `soilFactor`, `buriedGroupFactor`, `GROUND_TEMP_RANGE_C`, `SOIL_RANGE_KMW` | Buried-cable factors (Tables B.52.15, B.52.16, B.52.18/19). Owned by 19-cable-tray-containment, used here. |
| `src/calc/cableTray.ts` (lines 270–300) | calc / data | `bunchedFactor`, `groupingFactor`, `trayGrouping` (via `trayFactorOf`) | Bunched (B.52.17 item 1) and tray (B.52.20) grouping factors. Owned by 19, used here. |
| `src/database/database.ts:145-161, 291-295` | store loader | `methodRatingsOf`, `applyDatabase` | Reads Cables.xlsx (`csaMm2, rOhmPerKm20C, xOhmPerKm, ampacityA, ratingC…ratingD2, manufacturer, referenceDoc`) and Breakers.xlsx; calls `setCables` / `setBreakerLists`. |
| `src/types.ts:195-240, 554-567` | model | `Feeder` (`breakerRatingA`, `breakerIcuKa`, `breakerType`, `cableCsaMm2`, `parallel`, `cores`, `installMethod`, `cableType`, `cpcMm2`, `manualSize`), `Project` (`ambientC`, `vdLimitPct`, `vdTempC`, `groundTempC`, `soilResistivityKmW`, `strictCableData`), `BreakerType` | The saved fields this module reads and writes. |

"Store" note: the cable table and breaker lists are **module-level variables** (`active` in `cableTable.ts:120`,
`breakerList` / `icuList` in `sizing.ts:14`) — memory shared by the whole app, filled from the LV Database, not from
the project file.

## 3. Inputs — where its data comes from

| Data | From module (ID) | File + function |
|---|---|---|
| Feeders, boards, hierarchy, cable length, cores, parallel runs, install method | 02-project-storage / 06-network-sld-editor | `src/types.ts` `Feeder`; `src/calc/network` `boardOf`, `feedersOn` |
| Ambient, VD limit, VD conductor temperature, ground temperature, soil resistivity, strict cable data | 03-parameters-rules | `Project.ambientC`, `vdLimitPct`, `vdTempC`, `groundTempC`, `soilResistivityKmW`, `strictCableData` |
| Cable R, X, ampacity, method ratings (Cables.xlsx) | 32-component-database | `src/database/database.ts` `applyDatabase` → `setCables` |
| Breaker ratings and Icu steps (Breakers.xlsx) | 32-component-database | `applyDatabase` → `setBreakerLists` |
| Tray grouping factor per feeder (worst route) | 19-cable-tray-containment | `src/calc/cableTray.ts` `trayGrouping` via `trayFactorOf` (`electrical.ts:150`) |
| Buried and bunched grouping, ground / soil factors | 19-cable-tray-containment | `containment.ts` `groundTempFactor`, `soilFactor`, `buriedGroupFactor`; `cableTray.ts` `bunchedFactor` |
| Incomer per-phase P / Q of the downstream board | 07-load-schedule-panels | `src/calc/loadSchedule.ts` `boardPhasePQ` (used by `incomerBasis`) |
| Upstream voltage drop, source impedance, fault level | 06-network-sld-editor / 08-voltage-drop | `upstreamVoltageDropPct`, `impedanceToBoard`, `faultCurrentKA` (`electrical.ts`) |
| Breaker type default | 09-earthing | `src/calc/earthing.ts` `breakerTypeOf` |
| Board subtree for focus | 13-power-factor-correction | `src/calc/pfc.ts` `subtree` |

## 4. Outputs — where its results go

| Result | Used by module (ID) | File + function |
|---|---|---|
| Changed feeders (In, Icu, type, cable, runs, CPC reset) | 02-project-storage | `SelectionStudy` `onChange` → `setProject` (`App.tsx:1584`) |
| Auto-sizing of new / edited feeders | 06-network-sld-editor | `src/model/sldEdit.ts:247` `sized`, `:617`; `src/model/presets.ts:207` |
| Auto-sizing on load-schedule edits and MD sheet | 07-load-schedule-panels | `src/model/schedule.ts:20`; `src/docs/mdSheet.ts:446` |
| Auto-sizing in building generation / MDB | 04-building-load-assessment | `src/calc/buildingDesign.ts:152, 222`; `src/calc/loadAssessmentMdb.ts:121` |
| Plan-to-SLD sizing | 22-cad-electrical | `src/model/planToSld.ts:93` `applyAllRecommendations(next, 'optimise')` |
| ELV power feeders | 29-elv | `src/calc/elvPlacement.ts:153` |
| PV feeder | 15-ups-solar | `src/model/pvFeeder.ts:32` |
| Capacitor bank feeder | 13-power-factor-correction | `src/calc/pfc.ts:145` |
| Headless "size circuits" / "add circuit" tools | 31-headless-cli-mcp | `src/headless/editTools.ts:149-176, 216-220, 254` |
| Rating basis table (method, factors, Ib, In, Iz) | 25-reports-exports | `src/docs/studyReport.ts:265-267` |
| Cable data notice on outputs | 25-reports-exports / 24-drawings-sld-sheets | `cableDataNotice` in `calcReport.ts:114`, `studyReport.ts:573`, `studyWord.ts:75`, `sldSheet.ts:222` |
| To-do findings (ambient, cable data, ground) | 28-dashboard-readiness | `src/calc/dashboard.ts:205-209` |
| Cable R / X / ampacity to engines | 16-load-flow-engines | `src/engines/external.ts:11`, `src/engines/opendss/exportDss.ts:72, 121` |
| Cable rate per metre, cable type for BOQ | 20-equipment-boq-pricing | `src/data/rates.ts:22` `getCable(...).ratePerM`; `src/calc/bom.ts:233` `cableTypeOf` |
| Cable type, install method in design export | 30-exchange-inbox | `src/exchange/designExport.ts:53` |

## 5. User flow — from button click to result

1. User opens Stages → Detailed design → **Selection** (`Ribbon.tsx:552` `view('selection', …)`).
3. `SelectionStudy` (`useMemo`, line 14) filters feeders to `subtree(project, focus)` when focused, and for each calls
   `recommend(project, f, mode)` and `evaluateFeeder(project, f)`.
4. `recommend` (`sizing.ts:265`): `designCurrentA` → Ib; `nextStandard(breakerRatings(), Ib/0.85)` → In;
   `faultCurrentKA(impedanceToBoard(...))` → fault kA → `nextStandard(icuSteps(), fault)` → Icu; type from In;
   voltage-drop budget (1 % for incomers, else 0.85 × limit − upstream drop); `selectCableRuns(...)` with
   `izEvaluator` (→ `feederRating` → `ratingBasis`) and `vdEvaluator`.
5. `ratingBasis` (`installation.ts:38`): `methodRating` (Cables.xlsx or reference) × ambient (`ambientCorrectionFactor`)
   or ground + soil factors × grouping (`trayFactor`, `groupFactor`, `bunchedFactor` or `buriedGroupFactor`) × runs.
6. Screen shows Ib, status, now → recommended; a row shows **Apply**, a note, or "Up to date".
8. **Apply all**: `applyAllRecommendations(project, mode)` sorts all feeders by board depth (incomers first) and applies
   `recommend` one by one on the updated project.
9. User re-runs (F5); `evaluateFeeder` statuses feed the dashboard to-do and reports.

Quick-fix path: the system diagram's feeder panel (`SystemDiagram.tsx:1830`) calls `failReasons` and `quickFixes`;
each fix is pre-checked with `evaluateFeeder` and only offered if it improves the status.

## 6. Linked to (working connections)

- 32-component-database: Cables.xlsx / Breakers.xlsx → `setCables`, `setBreakerLists`, with source tracking
  (`resolveCable`, `CABLE_SOURCE_TEXT`) and strict-final-design failures (`cableDataFindings`).
- 19-cable-tray-containment: tray route grouping replaces the own-runs grouping for method E (`trayFactorOf`);
  buried and bunched factor tables.
- 08-voltage-drop: the same `feederVdPctAt` basis for the displayed drop and every candidate size.
- 06-network-sld-editor: `evaluateFeeder`, fault level at the busbar, quick fixes on the diagram.
- 25-reports-exports: rating basis table and cable-data notice.
- 28-dashboard-readiness: `ambientCheck`, `cableDataFindings`, `groundChecks` to-do items.
- 07, 04, 22, 29, 15, 13, 31: all reuse `recommend` / `applyRecommendation` for auto-sizing, so one rule set.



---

*Public summary: describes what the module does and how it connects. The engineering review of open issues is kept separately.*
