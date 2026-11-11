# 09 — Earthing study, earth fault loop, earth schematic, earthing plan / earth riser
[← Index](00-index.md) · [Integration map](99-integration-map.md)

## 1. What it does

Two separate parts share the name "earthing":

1. **Earth fault loop study** (calculation). For every feeder and final circuit it works out the earth fault loop
   impedance Zs = Ze + (R1 + R2), the minimum earth fault current If = 0.95 × U0 / Zs, compares If with the current
   that trips the device instantly (Ia), decides the required disconnection time (0.4 s / 5 s, IEC 60364-4-41
   Table 41.1, TN system, U0 in the 230 V band) and checks the protective conductor (CPC) with the adiabatic
   equation S ≥ I·√t / k. It assumes a **TN-S** system only.
2. **Earthing schematic and earth riser drawings** (layout and drawings). From the transformers, RMUs, main boards,
   SMDBs and standby generators it lays out earth pits (RMU / transformer body, transformer neutral, LV MET,
   generator), links pits of the same kind, records site test results per pit and checks them against DEWA limits
   (2 Ω substation, 1 Ω LV). It also draws a building's earth riser (floor earth bars up the riser shaft) and floor
   earthing sheets (each panel earth bar to its floor earth bar with its incoming CPC size).

## 2. Files, components, functions and stores

| File | Kind | Key functions or components | What they do |
|---|---|---|---|
| `src/calc/cableTable.ts` | calc | `defaultCpcMm2` (:227), `cpcOf` (:233), `getCable` (:152) | CPC size per IEC 60364-5-54 Table 54.2 (S / 16 / S÷2) unless set on the feeder; cable R20 and X per km. Re-exported by `earthing.ts`. |
| `src/calc/electrical.ts` | calc | `rOperatingOhmPerKm` (:31), `resistanceFactor` (:38), `runsOf` (:41), `transformerImpedance` (:253), `zMagnitude` (:25) | Conductor resistance at operating temperature (flat 1.2 × R20 when no temperature is passed), parallel runs, transformer impedance from kVA, Z %, X/R. |
| `src/components/studies/EarthingStudy.tsx` | screen | `EarthingStudy` (:8) | Studies → Earthing page: summary cards and a table (Ze, Zs, max Zs, If, Ia, required time, disconnection, CPC min). Calls `evaluateEarthingAll` on the project it is given. |
| `src/model/earthingPlan.ts` | model | `txUnits` (:9), `EARTHING_SYSTEMS` (:41), `EARTH_KINDS` (:48, limits 2 Ω / 1 Ω), `equipmentOf` (:73), `withEarthPitIds` (:140), `earthingLayout` (:165), `patchEarthing` (:230), `pitStatus` (:238), `setPitTest` (:241) | Earth pit layout from the boards: items, pit IDs (kept stable), links, pit groups (nets) with parallel resistance estimate, checks; edits to `Project.earthingPlan`. |
| `src/model/earthRiser.ts` | model | `earthRiserLayout` (:78), `setRisers` (:150), `risersOf` (:174), `riserRows` (:228), `riserPages` (:234), `floorGroups` (:243), `earthSheetTitles` (:250), `DEFAULT_RISER_TAPE` / `DEFAULT_LV_ROOM_CABLE` (:16–17) | Building earth riser: floor earth bars per level and riser, each panel to its floor bar (or to the panel feeding it on the same floor) with the incoming CPC size (`cpcOf`). |
| `src/model/boardEarth.ts` | model | `earthSheetNo` (:18), `boardEarth` (:39) | One board's earthing text for the board view / board sheet: pits it reaches and their group test result, plus the incomer CPC I²t verdict from `evaluateEarthing`. |
| `src/diagram/earthingDrawing.ts` | report (drawing) | `earthingDrawing` (:126), `pitTags` (:115), `rmuSymbol` (:34) | Earthing schematic SVG (A3, black and white), legend, notes (DEWA, TN-S practice), pit schedule. |
| `src/diagram/earthRiserDrawing.ts` | report (drawing) | `earthRiserDrawing` (:110), `earthFloorDrawing` (:281), `earthSheetRefs` (:375) | Earth riser sheets and floor earthing sheets SVG. |
| `src/components/EarthingView.tsx` | screen | `EarthingView` (:75), `ShadowSvg` (:38) | Design → Earth pits (also embedded in the SLD workspace): Drawing / Earth riser / Floor earthing / Pits and tests / Checks tabs; settings drawer (pits per equipment, links, electrode, riser cable, LV room cable, riser name, link conductor, risers, bonding list). |
| `src/types.ts` | model | `Feeder.cpcMm2` (:219), `Feeder.circuitPurpose` (:247), `Feeder.rcdMa` (:248), `Board.earthing` (:356), `Board.earthRiser` (:332), `Project.strictFinalDisconnection` (:558), `Project.earthingPlan` / `earthPitIds` (:575–576), `EarthingPlan` (:976), `EarthRiserDef` (:974) | Saved data for both parts. |

## 3. Inputs — where its data comes from

| Data | From module (ID) | File + function |
|---|---|---|
| Board tree, incomers, feeders (length, size, parallel runs, breaker, Im) | 06-network-sld-editor | `src/calc/network` `boardOf`, `feedersOn`, `withNetwork`; `src/types.ts` `Feeder` |
| Transformer kVA, impedance %, X/R on root boards | 12-transformer-generator | `Board.sourceKva/sourceImpedancePct/sourceXr`, read in `earthing.ts` `earthLoopPath` :105 |
| Transformer units per board (N+1 / split) for the schematic | 12-transformer-generator | `src/calc/txGen.ts` `sizeTransformers`, `txGenPlanOf`; used by `earthingPlan.ts` `txUnits` :9 |
| Cable R20, X, CPC default size | 11-breaker-cable-selection | `src/calc/cableTable.ts` `getCable`, `cpcOf`, `defaultCpcMm2` |
| RCD on a feeder, ELCB groups of a DB (IΔn) | 07-load-schedule-panels | `src/calc/loadSchedule.ts` `elcbGroups` :299, `isScheduleCircuit`; `earthing.ts` `rcdOf` :240 |
| Circuit purpose (sockets / fixed), points | 07-load-schedule-panels | `Feeder.circuitPurpose`, `Feeder.points`; `earthing.ts` `circuitPurposeOf` :46; edited in `src/components/FeederForm.tsx` :254 |
| Supply voltage, strict 0.4 s rule, ELCB defaults / design rules | 03-parameters-rules | `Project.voltageV`, `Project.strictFinalDisconnection`, `settingsOf`, `designRules` (via `elcbGroups`) |
| Buildings and levels, panel level, chosen riser | 04-building-load-assessment | `src/model/levels.ts` `floorList`, `levelKey`; `Board.level`, `Board.earthRiser`; `earthRiser.ts` `earthRiserLayout` :78 |
| RMU name, substation, standby generator | 12-transformer-generator / 06-network-sld-editor | `Board.rmu`, `Board.substation`, `Board.standby`; `earthingPlan.ts` `equipmentOf` :73 |
| Earthing plan settings, pit IDs, pit tests | 02-project-storage | `Project.earthingPlan`, `Project.earthPitIds`; normalised on open/edit by `withEarthPitIds` in `src/App.tsx` :183, :212 |
| Drawing set sheet numbers | 24-drawings-sld-sheets | `src/model/drawingSet.ts` `setOf`, `sheetNumber`; `boardEarth.ts` `earthSheetNo` :18 |

## 4. Outputs — where its results go

| Result | Used by module (ID) | File + function |
|---|---|---|
| `CalcRun.earthing` (stored run) | 25-reports-exports | `src/docs/studyReport.ts` `baseSection` 'earth' :272; `src/docs/calcSections.ts` `structureSection` 'earth' :93; `src/docs/compliance.ts` :105; `src/components/docs/StudyReportsView.tsx` :93; `src/components/docs/exportCatalogue.ts` :92 |
| Fresh earthing results for the calculation report | 25-reports-exports | `src/docs/calcReport.ts` :34 (`evaluateEarthingAll`) |
| Earth status colour on the SLD | 06-network-sld-editor | `src/components/SystemDiagram.tsx` :451 (`colorBy === 'earth'`) |
| Circuit edit preview (earth fault result before save) | 07-load-schedule-panels | `src/model/circuitEdit.ts` `previewCircuit` :110 |
| `breakerTypeOf`, `instantaneousTripA` | 10-protection-coordination, 11-breaker-cable-selection, 20-equipment-boq-pricing | `src/calc/protection.ts` :3; `src/calc/sizing.ts` :3; `src/calc/bom.ts` :5 |
| Earth pits, links, MET conductor for BOQ | 20-equipment-boq-pricing | `src/calc/bom.ts` :168–189 (`earthingLayout`) |
| Planned pit IDs and counts on the SLD main earthing detail | 06-network-sld-editor | `src/components/SystemDiagram.tsx` `plannedEarthPits` :80, `lvPitCount` :78 |
| Board earth line + incomer CPC I²t on board sheets | 24-drawings-sld-sheets | `src/diagram/boardSheet.ts` :201, `src/components/BoardSheetView.tsx` :53, `src/model/drawingSet.ts` :542 (`boardEarth`) |
| Earthing / earth riser / floor earthing sheets | 23-cad-sheets-plot-titleblock, 24-drawings-sld-sheets | `src/components/docs/sheetRender.tsx` :23–24; `src/model/drawingSet.ts` :3, :17 |
| Earth failures in dashboard / to-do list | 28-dashboard-readiness | `src/calc/dashboard.ts` :121, :165 |
| Earth failures and schematic DXF in the CLI / MCP | 31-headless-cli-mcp | `src/headless/tools.ts` :316–318; `src/headless/exportTools.ts` :131 |
| Transformer unit count (side use of `txUnits`) | 12-transformer-generator, 33-quick-calcs-existing | `src/components/TransformersTab.tsx` :7; `src/calc/existing.ts` :5 |

## 5. User flow — from button click to result

**Earth fault loop study**
1. User edits a feeder (cable, CPC, breaker type, Im, RCD, "Circuit supplies") in `FeederForm` (`src/components/FeederForm.tsx` :216–261).
2. User presses Run calculations (F5): `runCalculations` (`src/calc/runs.ts` :76) calls `evaluateEarthingAll` inside one `withNetwork` index.
3. For each feeder `evaluateEarthing` (`src/calc/earthing.ts` :156): `earthLoopPath` walks up to the root board (transformer impedance, then each incomer's phase + CPC loop via `cableLoop`); adds the circuit's own loop; If = 0.95 U0 / Zs.
4. `rcdOf` finds an RCD / ELCB; `instantaneousTripA` gives Ia; `disconnectionBasis` gives 0.4 s or 5 s.
5. Disconnection status and adiabatic check (t = 0.1 s when instantaneous, else the required time).
7. Reports read `run.earthing` (`StudyReportsView` :93).

**Earthing schematic / risers**
1. Design → Earth pits opens `EarthingView` (`src/App.tsx` :1647, embedded at :1480).
2. `earthingLayout` (`src/model/earthingPlan.ts` :165) builds items, pits, links, nets and checks; `earthingDrawing` draws the SVG.
3. Settings drawer edits go through `patchEarthing` / `setRisers` → `onChange` → project store (undo step).
4. Clicking a pit opens the test pop-up; `setPitTest` saves measured Ω, date, tester.
5. Earth riser / Floor earthing tabs: `earthRiserLayout` → `earthRiserDrawing` / `earthFloorDrawing`.
6. "Sheets" opens the sheet in Design CAD → Sheets (`onSheets`, drawing set).

## 6. Linked to (working connections)

- **06-network-sld-editor** — board tree and feeders feed the loop walk (`earthLoopPath`); SLD earth colouring uses the same `evaluateEarthingAll` (`SystemDiagram.tsx` :451); SLD pit counts follow the plan (`plannedEarthPits`).
- **11-breaker-cable-selection** — same `cpcOf` / `getCable` as the cable checks; no copy of the CPC table.
- **07-load-schedule-panels** — ELCB groups give RCD protection to schedule circuits (`rcdOf`); circuit edit preview uses `evaluateEarthing`.
- **12-transformer-generator** — transformer impedance for Ze; transformer units for the schematic (`txUnits`).
- **24-drawings-sld-sheets** — board sheets use `boardEarth`, which calls `evaluateEarthing` (same result as the study, not a copy); floor earthing sheets use `cpcOf` (same CPC as the study).
- **25-reports-exports** — study report, calc sections, compliance table, calculation report.
- **20-equipment-boq-pricing** — pits and pit links from `earthingLayout`.
- **28-dashboard-readiness**, **31-headless-cli-mcp**, **26-revisions-changes** — see §4.



---

*Public summary: describes what the module does and how it connects. The engineering review of open issues is kept separately.*
