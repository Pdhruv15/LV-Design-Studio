# 12 — Transformer & generator sizing, parallel transformers, changeover, transformer summary
[← Index](00-index.md) · [Integration map](99-integration-map.md)

## 1. What it does

- **Transformer sizing, one per main board (MDB).** It takes the demand of everything below each main board, can subtract the planned power-factor correction, adds future growth and divides by the design loading limit. It then picks the next standard size from the DEWA list (500 / 1000 / 1500 kVA) or the IEC list (100 … 3150 kVA). For that size it works out the LV full-load current (FLC), the main ACB, the LV busbar fault level from the impedance (uk %), the voltage regulation, the busbar rating check and the lowest Icu on the MDB. With a bus coupler it checks the outage case (one transformer carries both boards). "Apply to SLD" writes the size back into the network model (`src/calc/txGen.ts` `sizeTransformers`, `transformerChecks`, `applyTransformer`).
- **Standby generator sizing from whole boards.** The engineer ticks boards, or a % share of a board. EMDBs and boards with an ATS are added automatically, and so are circuits marked essential (fire pumps by default). The set must carry the running kVA and the running kW at the loading limit. It must also start the largest motor with a voltage dip of 15 % or less, using a transient reactance X′d of 25 % (`sizeGeneratorByBoards`, `chooseGenerator` in `src/calc/sizing.ts`).
- **Transformers in parallel through closed bus couplers.** Load sharing in proportion to kVA ÷ uk %, the coupler current, and checks on vector group, impedance (±10 %) and rating ratio (2 : 1) (`src/calc/parallelTx.ts` `parallelOperation`).
- **Transformer model helpers.** These create MDBs with transformers, number them TX-n, set RMU and substation, and move panels between transformers (`src/model/transformers.ts`).
- **Emergency changeover.** Either an ATS (4P, switched neutral, open or closed transition, AC-31B / AC-33B) or two interlocked incomers (ACB from 630 A, draw-out). The results feed the SLD symbol and the BOQ (`src/model/changeover.ts`, `src/diagram/ChangeoverSym.tsx`).
- **"Summary of the TCL at transformer level" (DEWA form).** One row per transformer, grouped by substation: main breaker and setting, fault duty, connected load per phase (TCL = total connected load), D.F (demand factor), MDL (maximum demand load), kWh meters and CT ratios (`src/docs/txSummary.ts` `buildTxSummary`, `src/components/docs/TxSummaryView.tsx`).

**Answer to "which demand source?":** transformer and generator sizing both use the **network model**, i.e. boards and feeders. Load-schedule circuits are stored as the same `project.feeders`, so DB schedules count too. The figure comes from `boardTotals` in `src/calc/summary.ts`: Σ (loadKw × demandFactor) with kW and kvar kept separate, minus the capacitor steps that are switched in. No board-level diversity is applied. The **load assessment** (module 04) runs a separate sizing of its own (`assess` in `src/calc/loadAssessment.ts:372-380`) and writes its result into the MDBs through `withTransformer` / `planTransformers`. The TCL summary uses a third figure, TCL × D.F (`panelDf`).

## 2. Files, components, functions and stores

"Store" here means the project object in memory; this module has no store of its own. Its choices are saved in `project.txGen` (`src/types.ts:660`) and `project.studySettings`.

| File | Kind | Key functions or components | What they do |
|---|---|---|---|
| `src/calc/txGen.ts` | calc | `TxGenPlan`, `TXGEN_DEFAULTS`, `txGenPlanOf`, `DEWA_TRANSFORMER_KVA`, `sizesOf`, `typicalImpedancePct`, `transformerChecks`, `sizeTransformers`, `applyTransformer`, `sizeGeneratorByBoards` | Main sizing engine for transformers per MDB and the generator from boards |
| `src/calc/sizing.ts` | calc | `STANDARD_TRANSFORMER_KVA`, `STANDARD_GENERATOR_KVA`, `chooseGenerator`, `generatorRatedKw`, `generatorForBoard`, `generatorChoiceForBoard`, `isEssential`, `standbyBoards`, `essentialFeeders`, legacy `sizeTransformer`, `sizeGenerator` | Standard size lists, generator selection rule (kVA, kW, motor start), and older whole-project sizing (used only by tests) |
| `src/calc/parallelTx.ts` | calc | `parallelOperation` | Load sharing, coupler current and parallel-operation conditions (IEC 60076-8) |
| `src/calc/motor.ts` | calc | `STARTERS`, `runningKva`, `startingKva`, `GENERATOR_XD_TRANSIENT_PCT` (25), `MOTOR_START_DIP_LIMIT_PCT` (15), `motorStartDipPct` | Motor starting kVA by starter type and the dip on a generator |
| `src/calc/electrical.ts` | calc (shared, module 06) | `transformerImpedance`, `parallelGroup`, `parallelZ`, `impedanceToBoard`, `faultCurrentKA`, `DEFAULT_TRANSFORMER_XR` (5), `C_MAX` (1.05) | Transformer impedance referred to LV, parallel source impedance, Ik″ |
| `src/calc/scenario.ts` | calc (shared) | `GENERATOR_XD_SUBTRANSIENT_PCT` (15), `generatorScenario` | Network on generator supply, using standby kVA and X″d 15 % |
| `src/components/studies/SizingStudy.tsx` | screen | `TransformerGeneratorStudy` (`apply`, `applyGen`, `exportSheet`) | Studies → Transformer and generator sizing page; PDF / Excel sheet |
| `src/components/TransformersTab.tsx` | screen | `TransformersTab` | Panels → Transformers: add DEWA transformers + MDBs, loading table, move panels |
| `src/model/transformers.ts` | model | `mainBoards`, `txTag`, `mainOf`, `supplyChain`, `withTransformer`, `planTransformers`, `applyTransformers`, `setTransformer`, `setRmu`, `setSubstation`, `nextRmus`, `moveUnder` | Edits to the project for transformers / MDBs / RMUs / bus ties |
| `src/model/changeover.ts` | model | `ACB_FROM_A`, `isInterlocked`, `incomersOf`, `boardRatingA`, `generatorFlcA`, `changeoverBreakers`, `atsOf`, `atsLines`, `breakerLines` | Changeover device data for SLD labels and BOQ |
| `src/diagram/ChangeoverSym.tsx` | screen (SLD drawing) | `CO_ROWS`, `CO_GEN_REACH`, `ChangeoverIncomers` | Draws the mains + generator incomers with instruments, PMU and SPD |
| `src/docs/txSummary.ts` | report | `CT_PRIMARIES`, `ctFor`, `breakerSetting`, `buildTxSummary`, `addTransformerRow`, `nextSubstationName`, `rowCtText`, `acbText` | Builds the DEWA TCL summary form |
| `src/components/docs/TxSummaryView.tsx` | screen / report | `TxSummaryView` | Editable TCL summary form (inside the load schedule view) |
| `src/components/docs/TxRowEditDialog.tsx` | screen | `TxRowEditDialog` | Double-click dialog for one transformer row |

## 3. Inputs — where its data comes from

| Data | From module (ID) | File + function |
|---|---|---|
| Boards, hierarchy, `sourceKva`, `sourceImpedancePct`, `sourceXr`, `vectorGroup`, `ratedCurrentA`, `standby`, bus ties | 06-network-sld-editor | `src/types.ts` Board / BusTie; `src/calc/summary.ts` `boardsInSupplyOrder` |
| Feeder / circuit demand (kW, PF, demand factor, essential, starter) | 06-network-sld-editor, 07-load-schedule-panels | `src/calc/summary.ts` `boardTotals` (load-schedule circuits are `project.feeders`) |
| Future growth, transformer / generator max loading, PF target | 03-parameters-rules | `src/types.ts` `StudySettings`, `settingsOf` (defaults 20 %, 80 %, 80 %) |
| Planned PF correction kvar per main board | 13-power-factor-correction | `src/calc/pfc.ts` `planPfc` → `mains[].plannedKvar` (used in `sizeTransformers`) |
| Switched capacitor steps on a board | 13-power-factor-correction | `src/calc/capSwitching.ts` `switchedOnBoard` (via `boardTotals`) |
| Transformer Z % and generator kW from the component catalogue | 32-component-database | `src/database/catalog.ts` `transformerFor`, `generatorFor` |
| Breaker ratings / Icu steps from the database | 32-component-database | `src/calc/sizing.ts` `breakerRatings`, `icuSteps` (used in `changeover.ts`) |
| Load-assessment transformer count and size | 04-building-load-assessment | `src/calc/loadAssessmentMdb.ts` `createMdbFromAssessment` → `withTransformer`, `planTransformers` |
| Existing-installation checks shown on the page | 33-quick-calcs-existing | `src/components/studies/ExistingChecks.tsx` `ExistingChecksCard` |
| Project info for the TCL form header | 02-project-storage / 03-parameters-rules | `src/docs/txSummary.ts` `buildTxSummary` (`project.info`) |
| Per-phase connected kW, panel D.F | 07-load-schedule-panels | `src/docs/mdSheet.ts` `connectedPhaseKw`, `panelDf` |

## 4. Outputs — where its results go

| Result | Used by module (ID) | File + function |
|---|---|---|
| `sourceKva`, `sourceImpedancePct`, busbar `ratedCurrentA` written to MDB | 06-network-sld-editor (fault levels), 10, 11, 14 | `src/calc/txGen.ts` `applyTransformer`; `src/model/transformers.ts` `withTransformer`, `setTransformer` → `src/calc/electrical.ts` `impedanceToBoard` |
| `standby.kva` written to the generator board | 06-network-sld-editor, 16-load-flow-engines (generator scenario) | `SizingStudy.tsx` `applyGen` → `src/calc/scenario.ts` `generatorScenario` |
| Transformer / generator rows in the study report (incl. parallel operation) | 25-reports-exports | `src/docs/studyReport.ts` (`key === 'sizing'`, ~line 375) |
| Capacity verification and load section in the calculation report | 25-reports-exports | `src/docs/calcSections.ts` `case 'sizing'`, `loadSection` |
| Design basis and compliance statements | 25-reports-exports | `src/docs/designBasis.ts:100`, `src/docs/compliance.ts:35` |
| Dashboard to-do items (Icu below LV fault; generator) | 28-dashboard-readiness | `src/calc/dashboard.ts:85`, `:178` |
| Transformer units per board for the earthing plan | 09-earthing | `src/model/earthingPlan.ts` `txUnits` |
| Changeover breakers / ATS lines on the SLD | 06-network-sld-editor, 24-drawings-sld-sheets | `src/components/SystemDiagram.tsx`, `src/diagram/panelLabels.ts`, `src/diagram/layout.ts` |
| Changeover breakers / ATS in the bill of materials | 20-equipment-boq-pricing | `src/calc/bom.ts:151` |
| TCL summary sheet in the Excel submission pack | 25-reports-exports | `src/docs/formWorkbook.ts:183` `buildTxSummary` |
| Generator auto-size when a generator is dropped on the SLD | 06-network-sld-editor | `src/model/sldEdit.ts:312` `generatorForBoard` |

## 5. User flow — from button click to result

**Transformer and generator sizing page (Studies → Sizing, `view === 'sizing'` in `src/App.tsx:1586`)**
1. `TransformerGeneratorStudy` reads the plan with `txGenPlanOf(project)` and runs `sizeTransformers` and `sizeGeneratorByBoards` in `useMemo`.
2. Settings inputs (Future growth, Max loading) call `setS`, which writes `project.studySettings`. Size list, "After PF correction", outage loading and board ticks call `setPlan`, which writes `project.txGen`.
3. `sizeTransformers`: for each main board, `boardTotals` gives P and Q. Planned PFC from `planPfc` is subtracted. Design kVA = S × (1 + g) ÷ L, then the next standard size is chosen, or a split when the design kVA is above the largest size. Then `transformerChecks` runs and gives FLC, ACB, Ik″ (from `transformerImpedance` and `parallelZ`), regulation, busbar and Icu. Finally the outage case is checked over the first bus tie.
4. "Apply to SLD" → `apply` → `applyTransformer`, which writes kVA, Z % and busbar. The status line asks the user to re-run the calculations (F5).
5. Generator: board ticks or % shares → `setGenBoard`. `sizeGeneratorByBoards` adds up the picked boards, adds the essential circuits outside them, finds the largest motor start and calls `chooseGenerator`.
6. "Set N kVA on <board>" (only when exactly one board has a standby set) → `applyGen`, which writes `board.standby = { kva }`.
7. "PDF sheet" / "Excel" → `exportSheet` → `buildSection('sizing')`, then `buildStudyReportHtml` / `buildStudyWorkbook`.

**Panels → Transformers tab (`src/components/PanelsPage.tsx:42`)**
1. Number of transformers and DEWA sizes, substation, RMU option and ties → `planTransformers`. "Create" → `applyTransformers`.
2. The kVA drop-down in the loading table → `setTransformer` → `withTransformer`.
3. "Move" → `moveUnder`, which re-parents the panels and flags their incomer lengths to check.

**TCL summary form (in `LoadScheduleView`)**
1. `buildTxSummary` builds the rows. Typing in a cell writes to `board.supply.*`, `summaryLoad`, `summaryMeters` or `mdDemandFactor`. Double-clicking a row opens `TxRowEditDialog`, whose `onSave` sends a patch.
2. "+ Transformer" → `addTransformerRow`; "+ Substation" → `nextSubstationName`.

## 6. Linked to (working connections)

- **06-network-sld-editor.** Sizes are written into the board fields that `impedanceToBoard` reads. Fault levels and Icu checks on every feeder follow after a recalculation.
- **03-parameters-rules.** The growth and loading limits come from `settingsOf`.
- **13-power-factor-correction.** Planned kvar are optionally taken off the transformer demand (`plan.includePfc`).
- **04-building-load-assessment.** The assessment creates or updates the MDB transformers through `withTransformer` / `planTransformers`.
- **25-reports-exports.** Study report, calculation report, design basis, compliance and the TCL summary in Excel.
- **28-dashboard-readiness.** Icu to-do items and the generator summary.
- **09-earthing.** `txUnits` uses the `n1` and `split` results.
- **20-equipment-boq-pricing.** `changeoverBreakers` and `atsOf` feed the BOM.
- **16-load-flow-engines / 06.** The generator kVA written by `applyGen` drives `generatorScenario`.
- **32-component-database.** Catalogue transformer Z % (`typicalImpedancePct`) and generator kW (`generatorRatedKw`).



---

*Public summary: describes what the module does and how it connects. The engineering review of open issues is kept separately.*
