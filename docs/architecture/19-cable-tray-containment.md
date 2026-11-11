# 19 — Cable schedule, cable tray schedule and containment
[← Index](00-index.md) · [Integration map](99-integration-map.md)

## 1. What it does

This module covers three screens and their calculations:

- **Cable schedule**: a read-only table of every SLD cable (feeder). It shows the tag, from and to, cable reference number, type, cores × size, CPC (protective conductor), length, tray route, Ib, In, Iz, voltage drop and status. Export is CSV or PDF.
- **Cable tray schedule** ("From the design" mode of the *Cable trays* page). You give each SLD cable a route path once, for example `A-B-C`. The cable then appears on every route along that path. Each route is sized from the cable outer diameters (OD), either side by side with a spacing (single layer) or by fill % (bunched). The page then gives:
  - the next standard width and the number of tiers;
  - the spare %, the cable weight and the largest bending radius;
  - an IEC 60364-5-52 grouping factor (Table B.52.20 or B.52.17), which goes back into the cable current rating Iz;
  - a cross-section drawing and a tray BOQ (metres, bends, tees, reducers, risers, supports, couplers, covers).

  Export is PDF or Excel. Route paths, route lengths and fittings can also be filled from the Design CAD plans.
- **Containment calculator** ("Custom calculation" mode). This is a standalone calculation that needs no design. You list cables and choose a containment: tray, ladder, basket, trunking, conduit, a trench (direct buried) or a duct bank. It gives the size, the fill, a to-scale cross-section and, for buried cables, the ground-temperature × soil × grouping derating. Export is a PDF.

Terms used below: a *store* is the place the app keeps the project in memory. A *project object* is the in-memory project. A *pure function* is a calculation that only reads its inputs and returns a result.

## 2. Files, components, functions and stores

| File | Kind | Key functions or components | What they do |
|---|---|---|---|
| `src/components/docs/Documents.tsx` | screen | `CableScheduleView` (:50), `ScheduleTable`, `ExportCsvButton` | Cable schedule page; optional focus on a board subtree (`subtree` from `src/calc/pfc`) |
| `src/docs/schedules.ts` | report | `cableSchedule` (:23), `csvRows`, `equipmentSchedule` | Builds the cable schedule rows from `evaluateFeeder` results |
| `src/model/cableRefs.ts` | model | `BUILT_IN_CABLES`, `standardCables`, `feederBuild`, `withCableRefs`, `cableRefOf`, `cableRefsUsed`, `FIRE_NOTE` | Fixed cable reference numbers ("34" = the same build-up on every project), with project-own numbers added after them |
| `src/components/docs/TrayScheduleView.tsx` | screen | `TrayScheduleView` (:59), `TrayDesignView` (:72), `RouteCard` (:330), `Num` | Cable trays page: switches between design and custom mode; plan settings, routing grid, route cards, summary, BOQ, exports |
| `src/calc/cableTray.ts` | calc | `TRAY_DEFAULTS`, `trayPlanOf`, `lookupOd` (:81), `routeNames`, `onRoute`, `trayLines` (:214), `routeSettings`, `groupingFactor` (:297), `bunchedFactor`, `pickTray` (:345), `sizeRoute` (:357), `sizeAll` (:423), `trayGrouping` (:445), `trayQuantities` (:484), route edit helpers (`addFeedersToRoute`, `renameRoute`, `deleteRoute`, `ensureRoutes`, `unroutedFeeders`) | Route membership, tray sizing, grouping factors, the per-feeder worst grouping factor, tray quantities |
| `src/docs/traySection.ts` | report | `traySectionSvg` (:27), `lineNumbers` | To-scale cross-section as SVG (black and white when `mono`) |
| `src/docs/traySheet.ts` | model/screen helper | `buildOdSheet`, `applyOdEdits`, `buildRoutingSheet` (:107), `applyRoutingEdits` (:145) | Excel-style grids for the OD/weight/bend table and for the route path of each cable |
| `src/docs/trayReport.ts` | report | `buildTrayReportHtml` (:18) | Tray schedule PDF (A4 landscape) |
| `src/docs/trayWorkbook.ts` | report | `buildTrayWorkbook` (:48) | Tray schedule Excel workbook (schedule and summary sheets) |
| `src/components/docs/ContainmentCalculator.tsx` | screen | `ContainmentCalculator` (:24) | Custom containment inputs, results and PDF |
| `src/calc/containment.ts` | calc | `calcContainment` (:109), `containmentSvg`, `allocate`, `groundTempFactor`, `soilFactor`, `buriedGroupFactor`, `TRUNKING_SIZES`, `CONDUIT_SIZES` | Containment sizing; burial derating tables (also used by the cable rating) |
| `src/docs/containmentReport.ts` | report | `containmentReportHtml` (:9) | Containment PDF (A4) |
| `src/model/cadTrays.ts` | model | `pullCadTrays` (:86), `applyCadTrays` (:124), `chain`, `traysAlong`, `TRAY_TOLERANCE_M`, `TRAY_MIN_RUN_M` | Proposes each feeder's tray path, and each route's length, from CAD tray runs and cable routes |
| `src/model/cadTrayFittings.ts` | model | `trayFittings` (:41), `fittingLabel`, `fittingCounts` | Finds bends, tees, crosses and reducers from the drawn tray runs |
| `src/types.ts` | model | `TrayPlan`, `TrayRoute`, `TrayCable`, `TraySettings`, `CableOd` (:895–971), `Feeder.trayRoute` (:252), `Project.containmentCalc` (:657), `Project.cableRefs` (:648) | Saved data shapes |

## 3. Inputs: where the data comes from

| Data | From module (ID) | File + function |
|---|---|---|
| Feeders: size, cores, parallel runs, board, `feedsBoardId`, `trayRoute`, `lengthM`, `cableType` | 06-network-sld-editor | `src/types.ts:Feeder`; read in `src/calc/cableTray.ts:trayLines` |
| Final circuits (optional, "incl. final circuits") | 07-load-schedule-panels | `src/calc/cableTray.ts:trayFeeders` (feeders with `phase`) |
| Cable OD, weight and bending radius by brand (DUCAB default) | 32-component-database (data file, not the database) | `src/data/cableBrands.ts:brandOf`, `typicalKgPerM`; `src/calc/cableTray.ts:odsOf` |
| Cable types (code, fire-rated, armoured) | 11-breaker-cable-selection | `src/model/cableTypes.ts:cableTypeOf` (used in `trayLines`, `feederBuild`) |
| CPC/ECC size | 09-earthing / 11 | `src/calc/cableTable.ts:cpcOf` (re-exported by `src/calc/earthing.ts`) |
| Standard cable reference list (CableSchedule.xlsx) | 32-component-database | `src/database/catalog.ts:catalog().cableRefs`; `src/model/cableRefs.ts:standardCables` |
| Ib, Iz, VD, status per feeder | 06 / 08 / 11 | `src/calc/electrical.ts:evaluateFeeder` in `src/docs/schedules.ts:cableSchedule` |
| Tray route paths, route lengths, fittings, and feeder lengths measured on plans | 22-cad-electrical | `src/model/cadPlanSchedules.ts:updateSchedules` (called from `src/components/cad/CadPage.tsx:2156`); `src/model/floorPlanActions.ts:92` (`pullCadTrays`/`applyCadTrays`); `src/model/cadLengths.ts:pullCadLengths` |
| Drawing units to metres | 21-cad-core | `src/model/cadLengths.ts:metresPerUnit`, `src/model/cadUnits.ts:planScale` |
| Revision stamp on exports | 26-revisions-changes | `src/model/revisions.ts:revisionStamp` |
| Containment inputs (typed) | — (saved in project) | `Project.containmentCalc`, `ContainmentCalculator.set` |

## 4. Outputs: where the results go

| Result | Used by module (ID) | File + function |
|---|---|---|
| Worst tray grouping factor per feeder | 11-breaker-cable-selection, 06 | `src/calc/cableTray.ts:trayGrouping` → `src/calc/electrical.ts:trayFactorOf` (:150) → `feederRating` (:141) → `src/calc/installation.ts:feederRatingBasis` (:57, method E only) |
| Same factor fixed in the cable-size search | 11-breaker-cable-selection | `src/calc/sizing.ts:290` (`selectCableRuns(..., trayFactorOf(...))`, `izEvaluator`) |
| Grouping shown in the properties panel | 06-network-sld-editor | `src/components/SidePanel.tsx:54–58` |
| Tray metres and fittings for the BOQ (section H) | 20-equipment-boq-pricing | `src/calc/bom.ts:336–350` (`trayQuantities(sizeRoute…)`) |
| Burial derating factors (shared tables) | 11-breaker-cable-selection | `src/calc/installation.ts:ratingBasis` uses `groundTempFactor`, `soilFactor`, `buriedGroupFactor`; `bunchedFactor` from `cableTray.ts` |
| Cable schedule PDF/CSV, tray schedule PDF, containment PDF in the export centre | 25-reports-exports | `src/components/docs/exportCatalogue.ts:122–142` |
| Cable schedule inside the study report | 25-reports-exports | `src/docs/studyReport.ts:451` |
| Same exports from the CLI/MCP | 31-headless-cli-mcp | `src/headless/exportTools.ts:8`, `src/headless/rendererExport.ts:2` (`CATALOGUE`) |
| Cable reference numbers on SLDs and sheets | 24-drawings-sld-sheets | `src/components/SystemDiagram.tsx:1280` (`cableRefOf`), `src/components/docs/sheetRender.tsx:256`, `src/components/SldExportDialog.tsx:52` (`cableRefsUsed`) |
| Tray fitting labels on CAD canvas, CAD export, plan sheets | 21-cad-core, 23-cad-sheets-plot-titleblock | `src/components/cad/CadCanvas.tsx:406`, `src/model/cadSketch.ts:551`, `src/docs/planLayout.ts:485/551` |
| Design-change impact: "Cable tray schedule" listed when tray route, length or size changes | 26-revisions-changes | `src/model/designImpact.ts:104`, `src/model/designChanges.ts:67` |

## 5. User flow: from button click to result

**Cable schedule**
1. Ribbon → Reports → *Cable schedule* (`src/components/Ribbon.tsx:280`) sets `view = 'cable-schedule'`. `App.tsx:1626` renders `CableScheduleView` with `calcProject`.
2. `cableSchedule(project)` walks `boardsInSupplyOrder` → `feedersOn`, calls `evaluateFeeder` for each feeder and `cableRefOf` for the reference.
3. *Export CSV* → `saveCsv(csvRows)`. *Export PDF* → `scheduleHtml` → `savePdf` (A4 landscape).

**Cable tray schedule**
1. Ribbon → *Cable trays* (`Ribbon.tsx:770`) opens `TrayScheduleView`. It is in design mode if the project has feeders.
4. In a `RouteCard` you can add cables from a panel (`addFeedersToRoute`), add manual cables, override qty or OD, set a route method, spacing, fill or depth, choose the width and tiers, and type the length and fittings.
5. *Apply grouping to cable ratings* (`settings.applyGrouping`). On the next Run (F5), `trayGrouping` → `trayFactorOf` → `feederRating` derate method-E feeders.
6. *Export PDF* → `buildTrayReportHtml` → `savePdf`. *Export Excel* → `buildTrayWorkbook` → `workbookBytes` → `saveBinary`.
7. In Design CAD, the schedule update (`CadPage.tsx:2156` → `updateSchedules`) writes route lengths, bends, tees and reducers, the feeder tray paths and the feeder lengths in one undo step.

**Containment calculator**
1. Cable trays page → *Custom calculation* → `ContainmentCalculator`.
2. Every edit calls `set()`, which saves `project.containmentCalc`. `calcContainment(input)` and `containmentSvg` re-run.
3. *Report (PDF)* → `containmentReportHtml` → `savePdf`.

## 6. Linked to (working connections)

- **06-network-sld-editor → 19**: the feeders are the cables. Size, cores, parallel runs and fire rating come straight from the SLD (`trayLines`).
- **22-cad-electrical → 19**: CAD tray runs give route lengths and fittings. CAD cable routes give the tray path of each feeder (`pullCadTrays`, 0.5 m tolerance, 2 m minimum run) and the feeder length (`pullCadLengths`). So **cable lengths come from CAD routes when a cable route is drawn and the schedule update is run; otherwise they are the typed `Feeder.lengthM`.**
- **19 → 20-equipment-boq-pricing**: tray metres and fittings go into the BOQ section H (`bom.ts:336`).
- **19 → 25-reports-exports / 31-headless-cli-mcp**: cable, tray and containment exports are in `CATALOGUE`.
- **19 → 24-drawings-sld-sheets**: cable reference numbers and the fire note.



---

*Public summary: describes what the module does and how it connects. The engineering review of open issues is kept separately.*
