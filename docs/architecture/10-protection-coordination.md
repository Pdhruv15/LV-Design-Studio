# 10 — Protection coordination, discrimination and TCC chart
[← Index](00-index.md) · [Integration map](99-integration-map.md)

## 1. What it does

Checks whether each protective device trips before the device above it (selectivity, also called discrimination), and draws time-current curves (TCC: trip time against fault current on log-log axes).

- **Pairs checked.** Each sub-board's incoming breaker is checked against every outgoing breaker on that sub-board (`src/calc/protection.ts:evaluateSelectivity`). Per circuit, the chain from the circuit's breaker up to the last sub-board incomer is checked (`discriminationChain`).
- **Method.** Selectivity is current-based only (`selectivityPair`):
  - Short-circuit region: "total" when the upstream breaker's magnetic no-trip threshold (lower edge of its instantaneous band) is at or above the maximum fault at the downstream breaker. Otherwise it is "partial up to" that threshold.
- **Curve models** (`genericTripTimeS`, `instantaneousNoTripA`, and `instantaneousTripA` in `src/calc/earthing.ts`):

| Device (`BreakerType`, `src/types.ts:22`) | Magnetic no-trip edge (used for selectivity) | Magnetic sure-trip edge (used for chart and earthing) | Thermal curve |
|---|---|---|---|
| MCB B | 3 In | 5 In | generic t = 500 ÷ ((I/In)² − 1) s, no trip ≤ 1.05 In |
| MCB C (default ≤ 63 A) | 5 In | 10 In | same generic curve |
| MCB D | 10 In | 20 In | same generic curve |
| MCCB (default > 63 A) | 0.8 × Im (Im = `breakerImMultiple`, default 10 In) | Im | same generic curve |
| ACB | 0.8 × Im (same as MCCB) | Im | same generic curve |

## 2. Files, components, functions and stores

| File | Kind | Key functions or components | What they do |
|---|---|---|---|
| `src/calc/protection.ts` | calc | `instantaneousNoTripA`, `genericTripTimeS`, `selectivityPair`, `upstreamBreakers`, `discriminationChain`, `evaluateSelectivity`, type `SelectivityResult` | Trip thresholds, generic curve, and the pair, chain and project-wide selectivity checks |
| `src/calc/earthing.ts` | calc (shared with 09) | `breakerTypeOf`, `instantaneousTripA` | Default device type (C ≤ 63 A, MCCB above) and the sure-trip magnetic current |
| `src/components/studies/CoordinationStudy.tsx` | screen | `CoordinationStudy` | "Protection coordination" study page: summary cards, board picker, TCC chart for one sub-board, table of all pairs |
| `src/components/DiscriminationPanel.tsx` | screen | `DiscriminationPanel` | Inspector panel for the selected circuit on the SLD: chain up to the main board plus a compact TCC chart |
| `src/components/TccChart.tsx` | screen | `TccChart`, `curvePath` | SVG log-log chart (10 A–100 kA, 10 ms–10 000 s), one line per breaker, Ik″ marker line |
| `src/types.ts` | model | `Feeder.breakerRatingA`, `breakerType`, `breakerImMultiple`, `breakerIcuKa` (`:209-218`) | The only device data the module reads |
| `src/components/FeederForm.tsx` | screen (06) | breaker type select (`:244`), "Instantaneous Im (× In)" (`:251`) | Where the user sets the device type and the MCCB/ACB Im multiple |
| `src/calc/protection.test.ts`, `src/calc/discrimination.test.ts` | test | — | Thresholds, generic curve, total/partial/bad cases, chain order, and study-vs-panel equality |

## 3. Inputs — where its data comes from

| Data | From module (ID) | File + function |
|---|---|---|
| Breaker rating In, type, Im multiple, Icu | 02-project-storage (entered in 06-network-sld-editor) | `src/types.ts:Feeder`; `src/components/FeederForm.tsx` |
| Board hierarchy (which feeder feeds which board) | 06-network-sld-editor | `Feeder.feedsBoardId`, `Board.upstreamId`; `src/calc/network:networkOf/withNetwork` (`feedersByBoard`) |
| Maximum fault at the downstream breaker (Ik″ at its supply busbar, c = 1.05) | 06-network-sld-editor | `src/calc/electrical.ts:evaluateFeeder` → `breakerFaultKA` (`:405`) → `impedanceToBoard` (`:281`), `faultCurrentKA` (`:343`) |
| Bus fault for the chart marker | 06-network-sld-editor | `CoordinationStudy.tsx:19` and `DiscriminationPanel.tsx:23` call `faultCurrentKA(impedanceToBoard(...))` directly |
| Device type defaults and sure-trip current | 09-earthing | `src/calc/earthing.ts:breakerTypeOf`, `instantaneousTripA` |

The fault current comes from the built-in network calculation (module 06), not from external load-flow engines (module 16). It uses transformer supply only.

## 4. Outputs — where its results go

| Result | Used by module (ID) | File + function |
|---|---|---|
| `SelectivityResult[]` in each calc run | 25-reports-exports | `src/calc/runs.ts:runCalculations`; `src/docs/calcReport.ts:calcReportData` (`:34`) |
| "Protection discrimination study" section: method text and a pairs table (no curves) | 25-reports-exports | `src/docs/studyReport.ts:buildSection` key `'disc'` (`:330-347`); section list `:69`; short-circuit report type `src/docs/reportTypes.ts:30` |
| Criteria lines in the calculation report | 25-reports-exports | `src/docs/calcSections.ts:structureSection` case `'disc'` (`:108-109`) |
| Compliance summary row "Selectivity" | 25-reports-exports | `src/docs/compliance.ts:buildResults` (`:48`, `:107-110`) |
| Limitation text | 25-reports-exports | `src/docs/calcRecord.ts:buildCalcRecord` (`:79`); `src/docs/calcReport.ts:buildReportHtml` (`:111`) |
| Snapshot reports | 25-reports-exports | `src/components/docs/StudyReportsView.tsx:93,205`; `src/components/docs/exportCatalogue.ts:92` |
| To-do items "not selective" / "only partly selective" | 28-dashboard-readiness | `src/calc/dashboard.ts:buildDashboard` (`:167-173`) |
| Start checklist "failing" flag | 01-app-shell | `src/help/guide.ts:startChecklist` (`:48`) |
| Per-circuit issues list (MCP/CLI) | 31-headless-cli-mcp | `src/headless/tools.ts:circuitIssues` (`:320`) |
| Chain colouring on the SLD | 06-network-sld-editor | `src/App.tsx:App` `chain` memo (`:485-495`) → `src/components/SystemDiagram.tsx` (`:311`, `:1248`) |
| Selectivity status changes in a proposal preview | 27-review-submissions-authority | `src/model/proposalPreview.ts:circuitChanges` (`:71-73`) |
| Change impact → opens the coordination view | 26-revisions-changes | `src/model/designImpact.ts:impactBetween` (`:81`) |

## 5. User flow — from button click to result

1. The user clicks the ribbon button "Protection" (`src/components/Ribbon.tsx:555`, `view('coordination', …)`). Or the user picks Studies → Protection coordination (`src/views.ts:11`).
2. `App` renders `<CoordinationStudy project={calcProject} board=… />` (`src/App.tsx:1585`). The component is loaded lazily (`:40`).
3. `CoordinationStudy` calls `evaluateSelectivity(project)` once per project change (`useMemo`, `:15`). Inside `withNetwork`, for every feeder with `feedsBoardId` it runs `selectivityPair(up, down)` for each feeder on the fed board.
4. `selectivityPair` computes the ratio. It reads `evaluateFeeder(down).breakerFaultKA` (memoised per run), compares it with `instantaneousNoTripA(up)/1000`, and sets the status:
   - `bad` when the ratio is under 1.6 and In(up) ≤ In(down);
   - `ok` when the ratio is ≥ 1.6 and the short-circuit result is total;
   - `warn` otherwise.
5. The user picks a sub-board in the select box, or clicks a table row. `TccChart` then draws the incomer plus that board's outgoing breakers (`curvePath` → `genericTripTimeS`) and a vertical Ik″ line at the busbar fault.
6. SLD flow: the user selects a circuit. `DiscriminationPanel` (`src/App.tsx:1541`) calls `discriminationChain`, which runs `upstreamBreakers` and then `selectivityPair` up the chain, and shows each level plus a compact chart. In parallel, `App` colours those breakers on the SLD.
7. When the user presses Run (F5), `runCalculations` stores `selectivity` in the run. Reports, dashboard, compliance and MCP read it from there.

## 6. Linked to (working connections)

- **06-network-sld-editor**:
  - The fault level comes from the core impedance and fault-current calculation: `evaluateFeeder`, `impedanceToBoard`, `faultCurrentKA`. That includes parallel transformers joined by closed couplers (`parallelGroup`).
  - Board topology comes from `networkOf`.
  - The chain highlight goes back onto the SLD.
- **09-earthing**: shares `breakerTypeOf` and `instantaneousTripA`, so the device-type defaults are the same in both studies.
- **25-reports-exports**: the discrimination section, calculation-report criteria, compliance row and limitation notes all read `run.selectivity`.
- **28-dashboard-readiness**: to-do counts for bad and partial pairs.
- **31-headless-cli-mcp**: `circuitIssues` lists selectivity issues per circuit.
- **26-revisions-changes** and **27-review-submissions-authority**: before/after status comparison.
- **Tests**: `discrimination.test.ts` proves that the study and the SLD panel give identical results for the same pair.



---

*Public summary: describes what the module does and how it connects. The engineering review of open issues is kept separately.*
