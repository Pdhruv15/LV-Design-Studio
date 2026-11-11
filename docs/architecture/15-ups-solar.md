# 15 — UPS & battery, solar PV, PV feeder
[← Index](00-index.md) · [Integration map](99-integration-map.md)

## 1. What it does

Two separate sizing studies and one SLD link:

- **UPS & battery** (`view === 'ups'`): for each UPS, finds the load (the demand of a UPS board on the SLD, or a typed list of loads), adds growth, divides by the design loading, and picks the smallest standard UPS whose kVA **and** kW (kVA × output PF) both cover it. It then sizes the battery for constant power over the backup time: `P_dc = kW × (1 + growth) ÷ η_inverter`, `Ah(C10) = P_dc × t ÷ V_string ÷ capacity-at-rate × ageing × temperature × design margin` (÷ usable SOC window for Li-ion). It also covers optional checks: a manufacturer constant-power table (W/block), Li-ion BMS current, the inverter starting surge, the recharge time, the battery-bus DC breaker, and the leading kvar from UPS input filters on a standby generator.
- **Solar PV** (`view === 'solar'`): sizes one PV array by target kWp, roof area or daily energy. String length comes from Voc at the minimum ambient (≤ inverter max DC V), Vmp at the hottest cell temperature (≥ MPPT min) and Vmp at the minimum ambient (≤ MPPT max), following IEC 62548. The MPPT current check is 1.25 × Isc × strings ≤ the inverter input limit. Yield = kWp × peak sun hours × performance ratio, plus the AC current and AC breaker (1.25 × I).
- **PV feeder**: "Add / Update PV-<board> on the SLD" writes one generation feeder (`generation: true`, `loadType: 'pv'`) and sizes its breaker and cable with the general SLD sizing.

Term used below: *store / project* = the in-memory `Project` object that is saved to the project file. *Feeder* = one outgoing circuit on a board in the SLD.

## 2. Files, components, functions and stores

| File | Kind | Key functions or components | What they do |
|---|---|---|---|
| `src/calc/ups.ts` | calc | `UpsSystem`, `UPS_DEFAULTS`, `upsLoad`, `sizeUps`, `capacityAtRate`, `checkUpsSurge`, `checkUpsLeading`, `upsSourceMissing`, constants `VRLA_BLOCK_AH`, `LI_MODULE_AH`, `DC_VOLTAGES`, `DC_BREAKERS`, `UPS_FILTER_KVAR_PCT`, `GEN_LEADING_KVAR_PCT` | All UPS and battery maths and the data type saved in the project |
| `src/calc/solar.ts` | calc | `PvSystem`, `PvPanel`, `PvInverter`, `PV_DEFAULTS`, `DEFAULT_PANEL`, `DEFAULT_INVERTER`, `INVERTER_KW`, `VMP_COEFF_ESTIMATE_PCT`, `sizePv`, `acConnection` | PV array, strings, inverters, yield and AC breaker |
| `src/model/pvFeeder.ts` | model | `pvToSld`, `pvConnection` | Creates/updates the `PV-<board>` generation feeder and previews its breaker/cable |
| `src/components/studies/UpsStudy.tsx` | screen | `UpsStudy`, `UpsCard`, `fromBoards`, `add`, `exportPdf`, `onApply` | UPS page: one card per UPS, writes `project.upsSystems`, can write `board.upsKva` back to the SLD |
| `src/components/studies/SolarStudy.tsx` | screen | `SolarStudy`, `addToSld`, `exportPdf` | Solar page: writes `project.pv`, adds the PV feeder |
| `src/docs/upsSolarReport.ts` | report | `buildUpsReportHtml`, `buildPvReportHtml` | A4 portrait black-and-white PDF sheets |
| `src/calc/sizing.ts` | calc (shared) | `STANDARD_UPS_KVA` (:82), `upsForBoard` (:136), `upsLoadingPct` (:141), `recommend` (:265) | UPS size list, SLD UPS loading, general breaker/cable sizing used by the PV feeder |
| `src/types.ts` | model | `Project.upsSystems` (:578), `Project.pv` (:580), `Board.upsKva` (:360) | Where the data lives in the project file |
| `src/App.tsx` | screen | lines 36–37, 1650–1651 | Lazy-loads and shows the two pages |

## 3. Inputs — where its data comes from

| Data | From module (ID) | File + function |
|---|---|---|
| UPS load from a board's demand kW / kvar (all downstream boards) | 06-network-sld-editor, 07-load-schedule-panels | `src/calc/ups.ts:upsLoad` → `src/calc/summary.ts:boardTotals` |
| UPS boards (`kind === 'UPS'`) and `board.upsKva` | 06-network-sld-editor | `UpsStudy.tsx:UpsStudy` (`upsBoards`), `ups.ts:filterKvar` |
| Standby generator kVA above a UPS (`board.standby.kva`) | 12-transformer-generator | `ups.ts:generatorBoard`, `checkUpsLeading` |
| Standard UPS sizes | 06-network-sld-editor (shared sizing) | `src/calc/sizing.ts:STANDARD_UPS_KVA` |
| Project voltage (`project.voltageV`) for the PV AC current | 03-parameters-rules / 02-project-storage | `SolarStudy.tsx` → `sizePv(s, project.voltageV)` |
| Shared breaker list for the PV AC breaker | 11-breaker-cable-selection | `solar.ts:breakers` → `STANDARD_BREAKER_A` |
| PV feeder breaker + cable sizing | 11-breaker-cable-selection / 06-network-sld-editor | `pvFeeder.ts:pvToSld` → `sizing.ts:recommend`, `applyRecommendation` |
| Boards in supply order (board picker) | 06-network-sld-editor | `summary.ts:boardsInSupplyOrder` |
| Revision stamp on reports | 26-revisions-changes | `upsSolarReport.ts:head` → `revisionStamp` |
| Panel, inverter, battery data | none: typed by the user, or the generic defaults in code | `solar.ts:DEFAULT_PANEL`, `DEFAULT_INVERTER`; `ups.ts:UPS_DEFAULTS` |
| Site irradiance and temperatures | none: Dubai defaults in code | `solar.ts:PV_DEFAULTS` (:94) |

## 4. Outputs — where its results go

| Result | Used by module (ID) | File + function |
|---|---|---|
| `project.upsSystems`, `project.pv` saved in the project file | 02-project-storage | `UpsStudy.tsx:set`, `SolarStudy.tsx:set`; labels in `src/model/saveSafety.ts:42` |
| Selected UPS kVA written to the SLD board (`board.upsKva`) | 06-network-sld-editor | `UpsStudy.tsx` `onApply` |
| PV generation feeder `PV-<board>` | 06-network-sld-editor, 16-load-flow-engines | `pvFeeder.ts:pvToSld`; `summary.ts:boardTotalsOf` (`generationKw`), `engines/python/lvds_engine.py:397` (`create_sgen`), `src/engines/opendss/exportDss.ts:160` |
| UPS and PV PDFs (page button, export centre, headless export) | 25-reports-exports, 31-headless-cli-mcp | `upsSolarReport.ts:buildUpsReportHtml`, `buildPvReportHtml`; `src/components/docs/exportCatalogue.ts:114–121` |
| UPS table in the compliance report | 25-reports-exports | `src/docs/compliance.ts:45, 62` |
| One-line UPS / PV entries in the design basis | 25-reports-exports | `src/docs/designBasis.ts:163–166` |
| Dashboard extras and to-do list (UPS failures, PV status) | 28-dashboard-readiness | `src/calc/dashboard.ts:113–115, 186–203, 212–215` |
| BOM: UPS (from `board.upsKva` only), PV modules, mounting, inverters, DC cable sets, connectors, DC isolators, DC SPDs, AC isolator | 20-equipment-boq-pricing | `src/calc/bom.ts:177`, `:263–284` |
| Proposals / design changes and revision compare for UPS systems | 26-revisions-changes, 27-review-submissions-authority | `src/model/designChanges.ts:81–91, 262`, `src/model/proposalPreview.ts:82–89`, `src/model/revisions.ts:264` |
| "Study needs re-run" flags | 26-revisions-changes | `src/model/designImpact.ts:83–87` |

## 5. User flow — from button click to result

UPS:
1. The user opens UPS & battery. `App.tsx:1650` renders `UpsStudy`.
2. **From UPS boards** → `UpsStudy.fromBoards` adds one `UpsSystem` (copied from `UPS_DEFAULTS`) for each `kind === 'UPS'` board that has none. **+ UPS** → `add` creates one with a typed load list.
3. Each `UpsCard` calls `sizeUps(project, s)` on every render. That runs `upsLoad` → `boardTotals`, picks the size from `STANDARD_UPS_KVA`, then does the battery sizing, `checkUpsSurge`, `checkUpsLeading`, the DC breaker and the recharge estimate.
4. Edits call `onPatch` → `UpsStudy.patch` → `onChange` → `setProject`, which updates the store and the undo history.
5. **Set <board> to N kVA on the SLD** → `onApply` writes `board.upsKva`.
6. **Export PDF** → `buildUpsReportHtml` → `savePdf`.

Solar PV:
1. `App.tsx:1651` renders `SolarStudy`. The page merges `PV_DEFAULTS` with `project.pv` and calls `sizePv(s, project.voltageV)` on every render.
2. Edits call `set` → `onChange({ ...project, pv })`.
3. `pvConnection` previews the SLD breaker/cable by running `pvToSld` on a throw-away copy.
4. **Add / Update PV-<board>** → `addToSld` → `pvToSld` → `recommend(p0, f, 'optimise')` → `applyRecommendation`, then the project is saved with the feeder and `pv.boardId`. The user must then press Run (F5).
5. **Export PDF** → `buildPvReportHtml`.

## 6. Linked to (working connections)

- 06-network-sld-editor: the UPS load is read live from the board demand (`upsLoad` → `boardTotals`). The UPS kVA is written back to `board.upsKva`. The PV feeder is written to `project.feeders`.
- 12-transformer-generator: the leading-kvar check walks up to the first board with `standby.kva` (`generatorBoard`).
- 11-breaker-cable-selection: the PV feeder uses the shared `recommend` and the shared breaker list.
- 16-load-flow-engines: PV feeders are static generators in the Python engine (`lvds_engine.py:397`) and `Generator` elements in the OpenDSS export (`exportDss.ts:160`). The built-in totals keep them separate (`generationKw`).
- 25-reports-exports / 31-headless-cli-mcp: both reports are in `exportCatalogue.ts` (headless `export_report`, tested in `src/headless/exportTools.test.ts:64, 101`).
- 28-dashboard-readiness: UPS failures and PV status reach the to-do list.
- 20-equipment-boq-pricing: PV items are in the BOM from `sizePv`.
- 26-revisions-changes: UPS systems are diffed, proposable and flagged for re-run. PV is flagged when its fields change.
- Tests: `src/calc/upsSolar.test.ts` (10 cases), `upsBatteryData.test.ts` (5), `upsSurge.test.ts` (5), `upsLeading.test.ts` (4). `pvToSld` and `pvConnection` are covered in `src/model/eng006.test.ts`.



---

*Public summary: describes what the module does and how it connects. The engineering review of open issues is kept separately.*
