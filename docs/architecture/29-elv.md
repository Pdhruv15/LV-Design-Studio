# 29 — ELV (extra-low voltage): devices, coverage, estimate, schedules, placement, outputs
[← Index](00-index.md) · [Integration map](99-integration-map.md)

## 1. What it does

ELV covers five systems (`src/elv/defaults.ts` `ELV_SYSTEMS`): **fire alarm**, **CCTV**, **access control**, **ICT (data and Wi-Fi)** and **public address (PA / voice alarm)**. The module has five parts:

1. **Room-area estimate** (`src/elv/estimate.ts` `estimateElv`). For every room in Building information: room type × floor area → field devices per room (detectors, sounders, cameras, doors, data outlets, access points, speakers) by a density rule "one per X m², at least N per room" (`DEFAULT_RULES`, `Density`). The devices are then grouped into the equipment that powers them, sized by capacity:
   - fire alarm: addressable loops (125 devices, 500 mA, 20 % spare), panels of 4 loops, one panel group per building; battery Ah = 1.25 × (Iq × 24 h + Ia × 0.5 h); panel AC input = (alarm current × 24 V + charging current × 27.6 V) ÷ 0.8;
   - CCTV: PoE switches per floor (20 ports used, 370 W PoE budget), NVR per 64 cameras per building, via UPS (90 %), 25 % spare;
   - access control: door controller + PSU per 4 doors per floor (reader 1.8 W, maglock 6 W at 12 V);
   - ICT: access switches per floor (40 ports, 740 W PoE), floor rack 100 W, core rack 600 W per building, via UPS;
   - PA: 480 W amplifiers sized for taps × 1.25 headroom, input at full output (evacuation).
   Each group of equipment becomes an **ELV supply** (`ElvSupply`) with its upstream AC kW, pf, normal/essential supply and a written demand basis. The result is the LV load each ELV system puts on the boards.
2. **Device placement on the floor plan** (`src/elv/placed.ts`). The engineer places devices on a level's plan in Design CAD (15 device types, `src/elv/devices.ts` `ELV_DEVICES`). Each device stores its position in metres and the room it falls in (smallest room outline around it, `roomAt`). **Once any device of a system is placed on a level, the estimate counts the placed devices there instead of the area rule** (`withPlaced`). "Fill room" lays a grid of devices at the coverage spacing (`fillPoints`); "Copy to level" copies the devices to another level at the same plan positions (`copyDevices`).
4. **Wiring schedules from placed devices** (`src/elv/schedules.ts` `elvSchedules`). These are worked out again on every change: fire detection zones (one floor, at most 2,000 m²), fire alarm loops with addresses in route order (nearest-neighbour from the plan corner), loop quiescent and alarm current, short-circuit isolators (≤ 32 devices between two); CCTV/ICT switch ports and PoE budget; door controllers; PA zones (one per floor) and amplifiers (first-fit).
5. **Outputs** (`src/elv/outputs.ts`, `pdf.ts`, `workbook.ts`, `planSheets.ts`, `package.ts`): five tables (device schedule, loop schedule, zones, ports/doors/PA zones, ELV BOQ) on screen, in a black-and-white A4 PDF and in an Excel workbook. Each row has an engineer's "Remarks" field that is saved with the project. Also: A3 ELV plan sheets (PDF), DXF of each level's devices, an **ELV loads package** (exchange contract) for the LV side, and ELV lines in the project BOQ.

**Module boundary** (`eslint.config.js:24-46`, decision note `docs/notes/Future development/ELV module boundary - decision - 2026-10-28.md`): ELV files (`src/elv/**`, `src/components/elv/{Elv,elv}*`) may import only the shared core (`types`, `calc/building`, `exchange`, `util`, `components/ui`). LV files may not import `src/elv/*`. ELV loads reach LV only through the exchange package (`src/exchange/inbox.ts` `acceptedElvLoads`).

## 2. Files, components, functions and stores

| File | Kind | Key functions or components | What they do |
|---|---|---|---|
| `src/elv/defaults.ts` | model (data) | `ELV_SYSTEMS`, `RoomRule`, `Density`, `DEFAULT_RULES`, `Catalogue`, `DEFAULT_CATALOGUE`, `DEFAULT_ASSUMPTIONS` | Typed-in room-type rules (devices per m² and per room for 16 room types + `default`), product data (mA at 24 V for fire alarm, W for others, capacities, efficiencies, battery hours) and the plain-text assumptions printed with every estimate. Header says "TYPICAL VALUES — VERIFY" against UAE Fire and Life Safety Code, SIRA, TDRA. |
| `src/elv/devices.ts` | model (data) + calc | `ELV_DEVICE_TYPES`, `ELV_DEVICES`, `DeviceLoad`, `Coverage`, `DORI_PX_PER_M`, `reachM`, `cameraRangeM`, `devicesOf` | The device library: 15 types, each with system, label, plan symbol (shape + letter code), load (from the catalogue) and coverage (radius / travel / spacing / camera cone). `reachM` turns coverage into a reach radius; `cameraRangeM` = pixelsH ÷ (px/m × 2 tan(FOV/2)). |
| `src/elv/estimate.ts` | calc | `elvSettings` (zod schema), `elvBasis`, `estimateElv`, `loopAlarmMa`, `loopDevices`, `loopMa`, `loopsForFloors`, `floorSupplies`, `buildingSupplies`, `withPlaced`, `countsOf` | Merges project overrides with the defaults, counts devices per room (area rule or placed), sizes equipment and works out upstream kW per supply, with totals, assumptions and warnings. |
| `src/elv/placed.ts` | model | `ElvDevice`, `newElvDevice`, `devicesOn`, `inside`, `roomAt`, `placeDevices`, `moveDevice`, `removeDevices`, `placedOnLevel`, `fillPoints`, `copyDevices` | Placed devices in `project.elvDevices`, with permanent IDs `E1, E2…` (`elvDeviceSeq`). Finds the room under a point (point-in-polygon), groups placed devices per room and level, makes the Fill-room grid and copies devices between levels. |
| `src/elv/coverage.ts` | calc | `COVERED_SYSTEMS`, `RoomCoverage`, `levelCoverage` | Grid-sample coverage check per room for fire alarm, ICT, PA. |
| `src/elv/schedules.ts` | calc | `elvSchedules`, `routeOrder`, `fireAlarm`, `switches`, `controllers`, `publicAddress` | Zones, loops/addresses/isolators, switch groups, door controllers, PA zones and amplifiers from the placed devices (typical levels repeated per floor). |
| `src/elv/pdf.ts` | report | `elvSchedulesHtml` | A4 landscape, black-and-white HTML of the schedules for the PDF renderer. |
| `src/elv/workbook.ts` | report | `elvWorkbook` | Excel workbook, one sheet per schedule, Arial 9, black borders. |
| `src/elv/planSheets.ts` | report | `planLevels`, `planSvg`, `legendSvg`, `symbolSvg`, `sheetInfo`, `planSheetHtml`, `levelUnits`, `planDxf` | One A3 sheet per level with devices (sheet numbers ELV-101…, scale NTS) in the project's title block (`src/docs/sldSheet.ts` `buildSldSheetHtml`). DXF R12 of each level's devices on layers `E-ELV-FA/CCTV/ACS/ICT/PA`, in the plan's own units. |
| `src/elv/package.ts` | report (exchange) | `elvLoadsPackage`, `ELV_CATALOGUE_REVISION` | Turns the estimate's supplies into an exchange "loads" package (`LoadItem` per supply) with SHA-256. |
| `src/components/elv/ElvView.tsx` | screen | `ElvView`, `RULE_COLUMNS`, `SYSTEM_LABEL` | The "ELV systems" page: system on/off, kW per system, total and essential kW, the supplies table, devices per room, the Assumptions editor (5 rule fields per room type), Export package…, Send to LV, Place on boards…. |
| `src/components/elv/ElvSchedules.tsx` | screen | `ElvSchedules`, `ProjectBoqDialog` | Tabs for the five tables with Remarks inputs; exports: Schedules PDF, Excel, Plan sheets PDF, DXF for CAD; Add to project BOQ (section P). |
| `src/components/elv/PlaceElvDialog.tsx` | screen (LV side) | `PlaceElvDialog` | Preview of board chosen per accepted ELV load, why, the circuit it would get; engineer can change the board; Apply adds circuits and the kW-change proposal. |
| `src/components/elv/elvPlan.ts` | screen helper | `elvLayer`, `coverageNote`, `deviceNear`, `placeAt`, `fillAt`, `moveTo`, `rotate`, `remove`, `copyTo` | What the ELV layer draws over the plan in Design CAD (symbols, coverage circles/cones, uncovered squares, Fill-room preview) and the tool actions. Coverage is cached per project version. |
| `src/components/elv/elvCadDevices.ts` | screen helper | `ELV_PALETTE`, `placeElv`, `moveElv`, `removeElv`, `elvPlacedOn`, `isElvType`, `elvAlike`, `replaceElv`, `copyElv`, `placeElvAt` | The CAD palette (9 of the 15 types) and edit-tool hooks used by `src/components/cad/CadPage.tsx` and `src/model/deviceEdit.ts`. |
| `src/components/elv/elvOverlay.ts` | type | `PlanSymbol`, `PlanCover`, `PlanCells` | Shapes passed to `CadCanvas`. |
| `src/components/elv/elvPlanSymbols.ts` | report helper | `elvPlanSymbols` | ELV symbols for the LV drawing-set plan sheets (`src/docs/planLayout.ts`). |
| `src/calc/elvPlacement.ts` | calc (LV side) | `planElvPlacement`, `chooseBoard`, `locate`, `onEssentialSide`, `addElvCircuits`, `lightestPhase` | Picks a board per accepted ELV load and adds a circuit: ≤ 3 kW single-phase on the lightest phase, else 3-phase. The circuit gets length 40 m and `loadType: 'it'`, and is then sized with `recommend(…, 'optimise')`. |
| `src/calc/elvPlace.ts` | calc (LV side) | `placeElvLoads` | Runs the plan, adds circuits, makes a modification record ("ELV load changes") for changed kW, and lists warnings. Shared by the app and the headless tool. |
| `src/headless/elvTools.ts` | CLI/MCP | `ELV_TOOLS` (`elv_devices`, `elv_schedules`, `elv_place_devices`, `elv_estimate`, `elv_place_loads`), `elvSettingsFor` | Headless access; the only place `project.elv` is validated with the zod schema. |
| Project fields (`src/types.ts:520-530`) | store | `elv`, `elvDevices`, `elvDeviceSeq`, `elvRemarks`, `elvBoq`; `Feeder.elvLoad` | All saved in the project file. |

## 3. Inputs — where its data comes from

| Data | From module (ID) | File + function |
|---|---|---|
| Buildings, levels (`count` = identical floors), rooms (type, area, outline, count, boardId) | 04-building-load-assessment | `src/calc/building.ts` `buildingInfoOf`, `floorsOf`, `roomTypesOf` |
| Room outlines read from the architect's CAD plan | 22-cad-electrical | rooms in `project.building.rooms[].outline` (used by `roomAt`, `levelCoverage`, `planSvg`) |
| Device positions, moves, rotations, Fill room, Copy to level | 21-cad-core (Design CAD canvas) | `src/components/cad/CadPage.tsx:573` (`elvLayer`), `:2080` (`placeElv`), `:2089` (`fillAt`), `:1074` (`copyTo`), `:1842` (`rotateElv`) |
| Edit tools (replace, move, copy, delete) on ELV devices | 22-cad-electrical | `src/model/deviceEdit.ts` → `elvCadDevices.ts` `replaceElv`, `moveElv`, `copyElv`, `removeElvs` |
| Plan units per drawing (for DXF) | 21-cad-core | `project.cadPlanUnits` read in `src/elv/planSheets.ts` `levelUnits` |
| Plan rescale when units change | 21-cad-core | `src/model/cadUnits.ts:64` rescales `elvDevices` |
| Sheet frame and title block | 23-cad-sheets-plot-titleblock / 24-drawings-sld-sheets | `src/docs/sldSheet.ts` `buildSldSheetHtml` |
| Print CSS, PDF render, file save | 25-reports-exports / 34-electron-desktop | `src/docs/printStyles.ts` `PRINT_BASE_CSS`; `src/util/files.ts` `savePdf`, `renderPdf`, `saveBinary` |
| Revision stamp on exports | 26-revisions-changes | `src/App.tsx:1655` `revisionStamp(project)` |
| Exchange schema, `LoadItem`, hash | 30-exchange-inbox | `src/exchange/contracts.ts` `EXCHANGE_SCHEMA`, `hashedText` |
| Accepted ELV loads (LV side) | 30-exchange-inbox | `src/exchange/inbox.ts:365` `acceptedElvLoads` |
| Boards, levels of boards, standby, existing feeders | 06-network-sld-editor / 07-load-schedule-panels | `src/calc/elvPlacement.ts` `chooseBoard`, `onEssentialSide`, `lightestPhase` (`src/model/phases.ts` `feederPhaseKw`) |

## 4. Outputs — where its results go

| Result | Used by module (ID) | File + function |
|---|---|---|
| ELV loads package (one load per supply: kW, pf, essential/normal, rooms, basis) | 30-exchange-inbox | `src/elv/package.ts` `elvLoadsPackage` → `ElvView.send` → `App.tsx:1656` inbox |
| ELV circuits on LV boards (`Feeder.elvLoad`), sized | 07-load-schedule-panels, 06-network-sld-editor, 11-breaker-cable-selection | `src/calc/elvPlacement.ts` `addElvCircuits` (uses `src/calc/sizing.ts` `recommend`, `applyRecommendation`) |
| kW-change proposal ("ELV load changes") | 26-revisions-changes | `src/calc/elvPlace.ts` `placeElvLoads` → `src/model/designChanges.ts` `newModification`, `addOp`, `transition` |
| ELV lines in project BOQ, section P | 20-equipment-boq-pricing | `src/elv/outputs.ts` `withProjectBoq` → `project.elvBoq` → `src/calc/bom.ts:354` |
| BOQ scope filter "ELV" | 20-equipment-boq-pricing | `src/model/boqScope.ts:24` |
| ELV symbols on drawing-set plan sheets (plan type `elv`) | 23-cad-sheets-plot-titleblock / 24-drawings-sld-sheets | `src/docs/planLayout.ts:119` → `elvPlanSymbols`; sheet hash `src/model/drawingSet.ts:516` |
| ELV schedules PDF / Excel, ELV plan sheets PDF, DXF | user files (25-reports-exports style) | `ElvSchedules.exportPdf`, `exportExcel`, `exportSheets`, `exportDxf` |
| `elvDevices` in the design export | 30-exchange-inbox | `src/exchange/designExport.ts:63`, `src/exchange/designContract.ts:69` |
| Headless estimate, schedules, device placement, load placement | 31-headless-cli-mcp | `src/headless/elvTools.ts` `ELV_TOOLS`; `src/headless/exportTools.ts:307` |
| Change class and revision labels for ELV fields | 26-revisions-changes | `src/model/changeClass.ts:24,34`, `src/model/revisions.ts:152` |

## 5. User flow — from button click to result

**A. Estimate and send loads**
1. The user adds buildings, levels and rooms with room types (04), or reads them from CAD (22).
2. The user opens **ELV systems** in the menu. `App.tsx:1655` renders `ElvView`, which runs `estimateElv(project)` (memoised per project version).
3. Optional: **Assumptions…** opens a table of 5 rule fields per room type (detector per m², camera per m², doors, data per m², speaker per m²). `setRule` saves a changed value in `project.elv.rules`. Unchanged values are dropped, so the project keeps only differences from the defaults.
4. The system tick boxes (`toggle`) set `project.elv.systems`.
5. **Send to LV**: `elvLoadsPackage` builds the package; `onSend` puts it in the Inbox (`App.tsx:1656`) and switches to the Inbox view (30). **Export package…** saves the same JSON to a file.
6. In the Inbox the user reviews and accepts the package (30: `src/exchange/inbox.ts` `decide`). Accepted loads are stored in `project.exchange.packages`.

**B. Design on the plan**
1. In Design CAD, the user picks an ELV device from the palette (`ELV_PALETTE`) and clicks the plan: `placeElv` → `placeDevices` stores the device with the room under it.
2. Fill room: `fillAt` → `fillPoints` lays a grid at √2 × radius (or speaker spacing).
3. With coverage on, `elvLayer` → `levelCoverage` draws reach circles, camera cones and uncovered squares. The status line shows "N rooms not fully covered" (`CadPage.tsx:3150`).
4. Copy to level (`copyTo` → `copyDevices`), rotate (`rotate`), replace/move/copy/delete through `src/model/deviceEdit.ts`.
5. Back on the ELV page, `withPlaced` makes the estimate count placed devices for each designed system. The schedules (`elvSchedules`) list loops, zones, ports, controllers and PA zones.

## 6. Linked to (working connections)

- **30-exchange-inbox**: the loads package (contract version 1, SHA-256), review and acceptance, and `acceptedElvLoads` for the LV side. The design export carries `elvDevices`.
- **11-breaker-cable-selection**: every new ELV circuit is sized by `recommend(..., 'optimise')`.
- **26-revisions-changes**: kW changes on circuits that are already placed become a "proposed" modification record. Checkpoint before placing (`App.tsx:1782`).
- **21-cad-core / 22-cad-electrical**: palette, placement, coverage overlay, edit tools, unit rescale of devices.
- **23/24 sheets**: ELV plan type in the drawing set uses the same symbols (`elvPlanSymbols` → `symbolSvg`).
- **31-headless-cli-mcp**: five ELV tools; the headless loads export.
- **02-project-storage**: all ELV data (`elv`, `elvDevices`, `elvDeviceSeq`, `elvRemarks`, `elvBoq`) is saved in the project file. Remarks and rule overrides persist.



---

*Public summary: describes what the module does and how it connects. The engineering review of open issues is kept separately.*
