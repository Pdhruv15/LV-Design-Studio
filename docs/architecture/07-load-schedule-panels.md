# 07 — Load schedule, panels and MD forms
[← Index](00-index.md) · [Integration map](99-integration-map.md)

## 1. What it does

This module is where the engineer fills and prints the panel schedules:

- **DB load distribution schedule** (DEWA style): final circuits with phase + way references (R1, Y1, B1 … RYB4),
  point counts per column (LTG, 13 A S/O, AC …), WATT / UNIT per column, MCB, wire, ECC, ELCB (RCCB) groups,
  spares and spaces, connected load per phase and maximum demand per phase.
- **Connected load / maximum demand (MD) form** for MDB, SMDB, MCC, meter cabinet: incomer, every outgoing feeder
  with its cable, connected load per phase, TCL (total connected load), MDL (maximum demand load) = TCL × DF, and kWh meters.
- **Circuit editing**: in-place grid with Excel keys (paste, fill down), a double-click edit dialog (points, mixed
  load items, sizes, length), add / delete circuit, spares and spaces, **Balance phases**.
- **Phase balance** of each board (per-phase current, neutral current, unbalance %) and phase moves from the board-wise SLD.
- **Panels page**: list of panels, set level / fed-from / location in bulk, rename by level, quick-create hierarchy.
- **Bulk edit**: search circuits or panels and set one field on many, as a modification record.
- **Standard loads dialog**: adds typical loads to the component library file Loads.xlsx.

Terms used below: *store* = the project object the app keeps in memory (with undo history, `src/model/history.ts`);
*feeder* = any circuit in the project (`Feeder` in `src/types.ts`); a *schedule circuit* is a feeder that has `phase`
and `way` set (`isScheduleCircuit`, `src/calc/loadSchedule.ts:14`).

## 2. Files, components, functions and stores

| File | Kind | Key functions or components | What they do |
|---|---|---|---|
| `src/calc/loadSchedule.ts` | calc | `circuitWatts`, `circuitWattsByType`, `normalizeLoadItems`, `pointColumns`, `wattUnitText`, `circuitCategory`, `minWireMm2`, `missingWatts`, `dominantLoadType`, `boardPhasePQ`, `boardPhaseKw`, `imbalancePct`, `scheduleCircuits`, `nextFreeSlot`, `elcbGroups` | Points × WATT/UNIT → watts; lighting vs power category; minimum wire; per-phase demand P/Q and kW of a board incl. everything downstream; ELCB grouping, rating and sensitivity |
| `src/calc/phaseBalance.ts` | calc | `phaseBalance`, `PHASE_UNBALANCE_CHECK_PCT` (10 %) | Per-phase current from `boardPhasePQ`, phasor neutral current, current unbalance %, list of 1-phase circuits with no phase |
| `src/model/schedule.ts` | model | `addCircuit`, `updateCircuit`, `deleteCircuit`, `refreshBoard`, `balancePhases`, private `refresh` | Create / edit / delete schedule circuits; re-derive `loadKw` from points and auto-size MCB / wire (min wire enforced); balance and renumber ways |
| `src/model/phases.ts` | model | `isSinglePhase`, `phaseTag`, `feederPhaseKw`, `setCircuitPhase`, `balanceBoardPhases` | Phase tags on the board-wise SLD, move one circuit to another phase, balance a whole board |
| `src/model/spareWays.ts` | model | `addSpareWay`, `updateSpareWay`, `deleteSpareWay`, `reslotSpares`, `dbSpares`, `spareBreaker`, `isDbBoard` | Spares / spaces kept on the board (`Board.spareWays`), not as feeders |
| `src/model/scheduleGroups.ts` | model | `scheduleGroupOf`, `scheduleGroups`, `incompleteSchedules` | Tabs MDB / SMDB / DB / Emergency / MCC / Others; which panels are still empty |
| `src/model/circuitEdit.ts` | model | `tabOfField`, `fitColumns`, `roomPresets`, `sameAsOptions`, `previewCircuit` | Helpers of the edit dialog; live preview runs `updateCircuit` + `evaluateFeeder` + `evaluateEarthing` |
| `src/model/mdFeeders.ts` | model | `addOutgoingFeeder`, `feederDeleteBlock`, `deleteOutgoingFeeder` | Add / delete outgoing feeders from the MD form |
| `src/docs/loadScheduleDoc.ts` | report | `loadScheduleRows`, `scheduleTable`, `buildLoadScheduleHtml`, `loadScheduleCsv`, `incomerLabel`, `incomerCableText` | Row model of the DB schedule shared by screen, PDF, CSV and CAD sheet table; connected and MD totals |
| `src/docs/dbSheet.ts` | report / model | `buildDbSheet`, `applySheetEdits`, `isEditable` | DB schedule as a spreadsheet model (cells, merges, styles) and applying typed / pasted values |
| `src/docs/mdSheet.ts` | report / model | `feederConnected`, `connectedPhaseKw`, `panelDf`, `panelSummary`, `buildMdSheet`, `applyMdEdits`, `mdFormOf`, `suggestedMeter` | MD form model, TCL per phase, DF and MDL, applying edits |
| `src/docs/panelScheduleDocs.ts` | report | `panelScheduleDocs` | MD form and / or DB schedule HTML per panel for the issue package |
| `src/docs/boardSheets.ts` | report | `boardSheetPages`, `boardSheetHtml` | Board-wise SLD sheets (A3) numbered E-DB-001 … |
| `src/components/docs/LoadScheduleView.tsx` | screen | `LoadScheduleView` | Load schedule page: tabs, DB grid, WATT/UNIT row, ELCB settings, Balance phases, exports |
| `src/components/docs/CircuitEditDialog.tsx` | screen | `CircuitEditDialog` | Double-click edit dialog (Loads / Protection / General tabs) |
| `src/components/docs/MdSheetView.tsx` | screen | `MdSheetView` | MD form grid (`ClassicGrid`), add feeder / spare / space |
| `src/components/docs/BulkEditPanel.tsx` | screen | `BulkEditPanel` | Bulk edit search, preview, save draft / apply |
| `src/components/docs/StandardLoadsDialog.tsx` | screen | `StandardLoadsDialog` | Writes the standard load set into Loads.xlsx |
| `src/components/BoardSheetView.tsx` | screen | `BoardSheetView` (`cyclePhase`, `balance`) | Board-wise SLD with phase tags and Balance |
| `src/components/PanelsPage.tsx` | screen | `PanelsPage`, `QuickCreate`, `PanelList`, `NamingTab` | Panel list, bulk level / fed-from / location, renaming |
| `src/components/PanelTree.tsx` | screen | `PanelTree` | Left tree of boards (uses `boardSummary`) |
| `src/components/grid/excelGrid.ts`, `useExcelGrid.ts` | screen helper | `pasteEdits`, `fillDownEdits`, `useExcelGrid` | Excel keys on HTML tables; paste follows visible rows only |
| `src/components/grid/ClassicGrid.tsx`, `RowEditDialog.tsx` | screen helper | `ClassicGrid`, `RowEditDialog` | Generic grid used by the MD form |
| `src/components/docs/SheetGrid.tsx` | screen | `SheetGrid` | Not part of this module: drawing-set sheet grid used by `DrawingsView` (module 24-drawings-sld-sheets) |
| `src/App.tsx:1552`, `:1645`, `:1482` | store wiring | `setProject` | Load schedule edits go through `setProject` (undo, merged within 600 ms); Panels page and board sheet use `{ step: true }` |

## 3. Inputs — where its data comes from

| Data | From module (ID) | File + function |
|---|---|---|
| Boards, feeders, spares, point watts | 02-project-storage | `src/types.ts` `Board`, `Feeder`, `SpareWay`; store `src/App.tsx` `setProject` |
| Minimum wire, ELCB mA, PF target, point template | 03-parameters-rules | `settingsOf`, `pointTemplateOf` (`src/types.ts`); `resolveRule` (`src/model/designRules.ts`) used in `minWireMm2`, `elcbGroups` |
| Library loads (watts per column) | 32-component-database | `loadsForColumn` (`src/database/database.ts`), library sync of `Board.pointItems` (`database.ts:412`) |
| Standard load set | 32-component-database | `STANDARD_LOADS` (`src/data/standardLoads.ts`), `withStandardLoads` (`src/database/standardLoads.ts`) |
| Auto sizing of MCB / wire | 11-breaker-cable-selection | `recommend`, `applyRecommendation` (`src/calc/sizing.ts`) called in `schedule.ts` `refresh` and `mdSheet.ts` `applyMdEdits` |
| Feeder check status | 06-network-sld-editor | `evaluateFeeder` (`src/calc/electrical.ts`) in `loadScheduleRowsOf` and `previewCircuit` |
| Earth fault result for preview | 09-earthing | `evaluateEarthing`, `cpcOf`, `defaultCpcMm2` (`src/calc/earthing.ts`) |
| Capacitor steps on a board | 13-power-factor-correction | `switchedOnBoard` (`src/calc/capSwitching.ts`) in `boardPhasePQ` |
| Recorded maximum demand of existing boards | 33-quick-calcs-existing | `recordedPQ` (`src/model/existing.ts`) in `boardPhasePQ`, `boardPhaseKw` |
| Board location / level | 04-building-load-assessment | `boardLocation` (`src/model/levels.ts`) |
| Rooms served and expected W/m² | 04-building-load-assessment | `dbChecks` (`src/calc/building.ts`) shown in `LoadScheduleView` |
| Circuits generated from rooms | 04-building-load-assessment | `src/calc/buildingDesign.ts:139` calls `addCircuit`, `updateCircuit`, `balancePhases` |
| Point counts from devices placed on plans | 22-cad-electrical | `src/model/cadDevices.ts` `withCount` → `updateCircuit`; `wiringLengths` used for length in `CircuitEditDialog` |
| Modification records for bulk edit | 26-revisions-changes | `newModification`, `addOp`, `applyModification`, `PROPOSABLE` (`src/model/designChanges.ts`) |
| Network index / memo | 06-network-sld-editor | `feedersOn`, `boardOf`, `memoized`, `withNetwork` (`src/calc/network/index.ts`) |

## 4. Outputs — where its results go

| Result | Used by module (ID) | File + function |
|---|---|---|
| Per-phase demand P/Q of a board | 06-network-sld-editor | `boardPhasePQ` → `incomerBasis` / `designCurrentA` (`src/calc/electrical.ts:94`) — incomer current and VD |
| Per-phase kW of a board | 06-network-sld-editor | `boardPhaseKw` in `src/components/SystemDiagram.tsx:1427` |
| Phase balance | 25-reports-exports, 24-drawings-sld-sheets | `phaseBalance` in `src/docs/studyReport.ts:294`, `src/diagram/boardSheet.ts` |
| ELCB groups (rating, mA) | 09-earthing, 20-equipment-boq-pricing, 17-enclosure-form4 | `elcbGroups` in `src/calc/earthing.ts:246`, `src/calc/bom.ts:135`, `src/model/enclosureLibrary.ts:136` |
| TCL per phase, DF, MDL | 12-transformer-generator, 04-building-load-assessment, 14-busbar | `connectedPhaseKw`, `panelDf` in `src/docs/txSummary.ts:80`, `src/docs/buildingSummary.ts`, `src/docs/riserForm.ts:58` |
| Panel summary box (TCL × DF = MDL) on SLD | 06-network-sld-editor, 24-drawings-sld-sheets | `panelSummary` in `src/components/SystemDiagram.tsx:382`, `src/components/SingleLineDiagram.tsx:181`, `src/diagram/boardSheet.ts:183`, `src/App.tsx:1484` |
| DB schedule PDF / CSV / table | 25-reports-exports, 23-cad-sheets-plot-titleblock | `buildLoadScheduleHtml` in `src/components/docs/exportCatalogue.ts`; `scheduleTable` in `src/components/docs/sheetRender.tsx`; `loadScheduleRows` in `src/docs/xlsxTemplate.ts` |
| DB and MD sheets in the submission workbook | 25-reports-exports, 31-headless-cli-mcp | `buildDbSheet`, `buildMdSheet` in `src/docs/formWorkbook.ts`; `src/headless/exportTools.ts:214` |
| Panel schedules for issue package | 25-reports-exports | `panelScheduleDocs` in `src/components/docs/StudyReportsView.tsx` |
| Delete circuit (headless) | 31-headless-cli-mcp | `deleteCircuit` in `src/headless/editTools.ts:342` |

## 5. User flow — from button click to result

1. Left menu → Load schedule: `App.tsx:1552` renders `LoadScheduleView` with `onChange={setProject}`.
2. `LoadScheduleView` builds `loadScheduleRows` (rows, ELCB groups, connected W, `boardPhaseKw`) and `buildDbSheet` (cell addresses for Excel keys).
3. User types a point count → `patch` → `updateCircuit` (`schedule.ts:45`) → `withLoadItems` keeps items and counts consistent → `refresh` sets `loadKw = circuitWatts / 1000`, `loadType`, and (unless `manualSize`) runs `recommend('optimise')` and raises wire to `minWireMm2`.
4. User changes WATT / UNIT or picks a library item → `setBoard(..., resize = true)` → `refreshBoard` re-sizes every auto-sized circuit.
5. Paste / fill down → `useExcelGrid` → `applySheetEdits` (`dbSheet.ts:281`) validates each cell (whole numbers, cable sizes from the table) and reports rejected cells in the status bar.
6. Double-click a row → `CircuitEditDialog` → live `previewCircuit` → Save → `updateCircuit`.
7. Add circuit / Add 3-phase → `addCircuit` → `nextFreeSlot` (respects spares) → defaults PF 0.9, DF 1, 20 m, 2.5 mm², 16 A C.
8. Balance phases → `balancePhases` (`schedule.ts:94`): lighting then power sections on ELCB boundaries, largest first onto lightest phase, **feeder ids renamed** to the new reference, `reslotSpares`.
9. Delete → `ask` confirm → `deleteCircuit` (filters the feeder out).
10. Export PDF / CSV → `buildLoadScheduleHtml` / `loadScheduleCsv`; Export Excel → `buildFormWorkbook`.
11. MD form tab → `MdSheetView` → `buildMdSheet`; typed cells → `applyMdEdits` (TCL of an equipment feeder sets `loadKw` and re-sizes).
12. Board-wise SLD → `BoardSheetView`: click phase tag → `setCircuitPhase`; Balance → `balanceBoardPhases`; status shows `phaseBalance` before/after.
13. Bulk edit → `BulkEditPanel` → `previewBulkEdit` → `introducedIssues` → `applyModification` (one undo step).

## 6. Linked to (working connections)

- 06-network-sld-editor: schedule circuits are ordinary feeders; the incomer of a DB uses `boardPhasePQ` from this module, so the per-phase **demand P** behind the incomer cable is the same figure as the load schedule MAXIMUM DEMAND row (`boardPhaseKw` gives the same P; both use `loadKw × demandFactor`, labelled 1-phase circuits on their phase, others spread evenly).
- 11-breaker-cable-selection: `refresh` and `applyMdEdits` size via `recommend` / `applyRecommendation`.
- 09-earthing: `elcbGroups` sensitivity is the RCD mA of each schedule circuit in `rcdOf` (`src/calc/earthing.ts:240`); preview shows earth fault result.
- 20-equipment-boq-pricing: ELCBs and spares (`spareBreaker`) counted in `bom.ts`.
- 17-enclosure-form4: ELCB groups and spares in enclosure device lists.
- 12-transformer-generator / 14-busbar / 04-building-load-assessment: TCL / DF / MDL from `connectedPhaseKw` / `panelDf`.
- 22-cad-electrical: plan devices update point counts through `updateCircuit`.
- 26-revisions-changes: bulk edit is a modification record; `pointWatts`, `spareWays`, ELCB fields are tracked in `src/model/revisions.ts:136` and `src/model/changeClass.ts:30`.
- 32-component-database: WATT / UNIT linked to library items, kept in sync (`database.ts:412`, `App.tsx:362`).
- 25-reports-exports / 31-headless-cli-mcp: PDF, CSV, workbook, issue package, headless export.



---

*Public summary: describes what the module does and how it connects. The engineering review of open issues is kept separately.*
