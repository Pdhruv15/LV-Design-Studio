# 22 — CAD electrical: devices on plans, rooms, plan links, wiring, CAD loads and lengths
[← Index](00-index.md) · [Integration map](99-integration-map.md)

## 1. What it does

The electrical layer on top of the Design CAD drawing (module 21-cad-core). On a level's floor plan the engineer can:

1. **Say which drawing is the plan of which level** (`cadPlans.ts`) — one file per level; devices and rooms are kept per level, not per file.
2. **Read rooms** from closed outlines on layers given the role "Room outline" (`cadRooms.ts`), or click/trace a room (`floorPlanActions.ts:pickedRoom`), and write them to Building information (module 04) with name, area and outline.
3. **Place LV points** (light, 13 A socket, twin socket, ceiling fan, exhaust fan, split A/C, water heater, emergency light / exit sign / direction sign) on a chosen circuit, and **place a DB** at a point (`cadDevices.ts`). Placing a point adds 1 to that circuit's point count in the load schedule; deleting it takes 1 off.
4. **Edit many devices at once** (`deviceEdit.ts`): align, space, array on a line, replace type, move to another circuit (with a warning against the Rules-sheet maximum points per circuit), match, copy, delete.
5. **Wire circuits** (`cadWiring.ts`): each wired circuit's devices are joined by drawn arcs plus a home run to the DB; a wiring length is worked out.
6. **Draw cable routes and tray runs** (drawn items in `project.cadSketch`, tools in `CadPage.tsx`) and **Update schedules** (`cadPlanSchedules.ts:updateSchedules`): tray route lengths and fittings, feeder lengths, feeder tray routes, wiring lengths go into the network model.
7. **Loads from CAD** (`cadLoads.ts`, `CadLoadsDialog.tsx`): fixture blocks with a circuit attribute (CCT = "DB-GF1/R3") in the open drawing are counted per circuit and, after review, replace the circuit's point counts / load items.
8. **Plan sheets** (`src/docs/planLayout.ts`): lighting, power, ELV and containment layouts drawn from the model at true scale (output side, shared with 23 and 24).

"Store" in this document = the project object the app keeps in memory and saves to the project file; every CAD action returns a new project (one undo step).

## 2. Files, components, functions and stores

| File | Kind | Key functions or components | What they do |
|---|---|---|---|
| `src/model/cadDevices.ts` | model | `LvPoint` (:15), `LV_PALETTE` (:44), `roomAt` (:56), `finalCircuits` (:71), `circuitLabel` (:74), `cableLabel`/`cablesOf` (:80–82), `withCount` (:86), `placeLvPoint` (:94), `moveLvPoint` (:101), `removeLvPoint` (:106), `placeBoard` (:116), `placedOn` (:125), `placeItem` (:139), `moveItem`/`removeItem` (:151–154) | Placed LV points (stored in `project.lvPoints`) and board positions (`Board.planPoint`, `Board.level`, `Board.location`). Keeps the circuit's `points` count in step. |
| `src/model/deviceEdit.ts` | model | `editsFor` (:36), `arranged` (:58), `moveDevices` (:73), `copyDevices` (:84), `deleteDevices` (:102), `replaceDevices` (:117), `toCircuit` (:137), `circuitAfter` (:152), `matchDevice` (:166), `alongLine`/`placeAlong` (:175–187), `onBoard` (:196), `renameBoard` (:200) | Multi-device edits; recounts circuits; checks `rule('maxLtgPerCircuit')`, `rule('maxS13PerCircuit')`. |
| `src/model/cadRooms.ts` | model | `LAYER_ROLES` (:8), `guessRole` (:21), `layerMapFor`/`withLayerMap` (:35–39), `outlineArea` (:46, arcs by bulge), `flattenOutline` (:65), `roomsFromPlan` (:94), `guessRoomType` (:145), `proposeRooms` (:172), `applyRooms` (:202) | Rooms from outlines; zone detection; room keeps its ID across drawing revisions by outline handle. |
| `src/model/cadPlans.ts` | model | `plansOf` (:15), `planOfLevel`, `levelOfPlan`, `withLevelPlan` (:32), `replacePlan` (:40), `withoutLevelPlan` | Level ↔ plan file (`project.cadPlans`); a revised plan takes over the drawn work and layer settings. |
| `src/model/floorPlanActions.ts` | model | `planState` (:24), `withPlan`, `putRooms` (:41), `pickedRoom` (:51), `renameRoom` (:58), `planRoutes` (:66), `putLengths` (:74), `trayPlan` (:80), `putTrays` (:91), `putBoards` (:99) | Only `putRooms`, `pickedRoom`, `renameRoom` are used (by `CadPage.tsx:2137, 3550`). The rest is used only by tests. |
| `src/model/cadWiring.ts` | model | `CadWiring` (:17), `arcPoints`/`arcLength`, `wiringOrder` (:53), `wiringLengthM` (:69), `wiringTag` (:77), `wiringLengths` (:95), `levelWiring` (:100), `wireLevel` (:125), `toggleWiring` (:132), `applyWiringLengths` (:140) | Wiring arcs and home run; length = (route + drop × devices) × (1 + allowance), rounded up. |
| `src/model/cadLengths.ts` | model | `CAD_LENGTH_DEFAULTS` (:6), `metresPerUnit` (:11), `pullCadLengths` (:45), `applyCadLengths` (:65), `lengthBreakdown` (:74) | Feeder length = (route + vertical + terminations) × (1 + waste), rounded up to a whole metre; writes `Feeder.lengthM`. |
| `src/model/cadPlanSchedules.ts` | model | `planDrawings` (:24), `updateSchedules` (:51), `scheduleSummary` (:119) | "Update schedules" (SCHED): tray lengths + fittings, feeder lengths, feeder tray routes, wiring lengths from every level's plan. |
| `src/model/cadLoads.ts` | model | `CIRCUIT_ATTRIBUTES` (:15), `resolveBlock` (:43), `findCircuit` (:53), `pullCadLoads` (:71), `applyCadLoads` (:131) | Fixture blocks → circuit load items and point counts (review first). |
| `src/model/cadViewPlan.ts` | model | `outlinePoints`, `objectPath`, `layerStatsOf`, `planOfView` (:43) | Turns the open Design CAD view into a `CadPlan` for the room reader. |
| `src/model/cadTrays.ts` | model | `chain`, `traysAlong`, `pullCadTrays` (:86), `applyCadTrays` (:124) | Which tray routes a cable runs along; tray route lengths (shared with 19). |
| `src/model/roomLights.ts`, `src/model/emergencyPlace.ts`, `src/model/luminaireSchedule.ts` | model | `placeRoomLights`, `placeEmergency…`, `luminaireSchedule` | Lighting placements that call `placeLvPoint`; luminaire schedule from placed points (module 18). |
| `src/components/cad/CadPage.tsx` | screen | `placeItem` call (:2081), `finishCable` (:2147), `link` tool (:1861), `schedules` (:2154), `addFound` (:2130), wire tools (:1054, :1065), device edits (:1490–1523, :1811) | The Design CAD page: all electrical tools on the Plan tab. |
| `src/components/cad/DeviceToolbar.tsx` | screen | `DeviceToolbar` | Floating toolbar for picked devices; circuit list with "before → after points" and ⚠ over the rule maximum. |
| `src/components/cad/DeviceEditPanel.tsx` | screen | `SelectionPanel`, `ArlSettings`, `MatchSettings` | Side panels for several devices, Array on line, Match. |
| `src/components/CadLoadsDialog.tsx` | screen | `CadLoadsDialog` (:13), `read` (:44), `apply` (:49) | "Loads from CAD floor plan" dialog (opened from `App.tsx:1794`). |
| `src/components/CadLayerTable.tsx` | screen | `CadLayerTable` (:14) | Layer roles table and layer templates. |
| `src/components/docs/CircuitEditDialog.tsx` | screen | `planM` (:71) | Shows the wiring length "from plan" in the circuit editor (module 07 screen). |
| `src/docs/planLayout.ts` | report | `contentOf` (:117), `addContainment` (~:100), `planLevels` (:144), `planFit` (:172) | Lighting / power / ELV / containment layout sheets from the model. |
| `src/types.ts` | model | `Project.lvPoints` (:622), `Project.cadWiring` (:624), `Project.cadPlanLinks` (:628), `Feeder.cadVerticalM` (:254), `Feeder.lengthToCheck` (:256), `CadLengthSettings.dropM` (:499) | Saved fields. |
| `src/model/planToSld.ts` | model (05) | `planToSld` (:30) | Space plan → boards and feeders (replaces them). |
| `src/docs/planSheet.ts` | report (05) | `buildPlanSheet` (:19), `applyPlanEdits` (:77) | Space-plan area sheet; not CAD. |

## 3. Inputs — where its data comes from

| Data | From module (ID) | File + function |
|---|---|---|
| Drawing geometry, layers, blocks, texts, handles, units | 21-cad-core | `src/engines/cad/cadEngine.ts` `CadView`; `cadViewPlan.ts:planOfView`; `cadDrawing.ts:planFromDrawing` |
| Drawn cable routes and tray runs (`SketchItem.cable`, `SketchItem.tray`) | 21-cad-core | `project.cadSketch`, read by `cadPlanSchedules.ts:planDrawings` |
| Plan units (mm / cm / m), user override per file | 21-cad-core | `src/model/cadUnits.ts:planScale`, `planUnits` |
| Buildings, levels, rooms with outlines | 04-building-load-assessment | `calc/building.ts:buildingInfoOf`, `model/levels.ts:floorList` |
| Boards, circuits (`Feeder`), phase/way, `points`, `loadItems` | 06-network-sld-editor, 07-load-schedule-panels | `types.ts Feeder`, `calc/loadSchedule.ts:circuitRef`, `model/schedule.ts:updateCircuit` |
| Max points per circuit | 03-parameters-rules | `database/catalog.ts:rule('maxLtgPerCircuit' / 'maxS13PerCircuit')` via `deviceEdit.ts:circuitAfter` |
| Library loads (block → item, watts, schedule column) | 32-component-database | `database/database.ts:findLibraryLoad`, `loadItemFromLibrary` via `cadLoads.ts:resolveBlock` |
| Luminaire chosen by Light room (LUX) | 18-lighting-emergency | `roomLights.ts:placeRoomLights` → `placeLvPoint(…, luminaire)` |
| Tray plan (routes, lengths) | 19-cable-tray-containment | `calc/cableTray.ts:trayPlanOf`, `routeNames`, `joinPath` |
| ELV device placement (same coordinates) | 29-elv | `components/elv/elvCadDevices.ts` (`moveElv`, `copyElv`, `removeElvs`, `replaceElv`) |

## 4. Outputs — where its results go

| Result | Used by module (ID) | File + function |
|---|---|---|
| Circuit point counts (`Feeder.points`) and re-sized MCB / cable | 07-load-schedule-panels | `cadDevices.ts:withCount` → `schedule.ts:updateCircuit` → `refresh` |
| Circuit load items / point counts from blocks | 07-load-schedule-panels | `cadLoads.ts:applyCadLoads` → `updateCircuit` |
| `Feeder.lengthM` (measured route or wiring length) | 08-voltage-drop, 11-breaker-cable-selection, 19-cable-tray-containment | `cadLengths.ts:applyCadLengths`, `cadWiring.ts:applyWiringLengths`; read by `calc/voltageDrop.ts:84`, `calc/electrical.ts:108` |
| `Feeder.trayRoute`, tray route lengths and fittings | 19-cable-tray-containment, 20-equipment-boq-pricing | `cadPlanSchedules.ts:updateSchedules` → `cadTrays.ts:applyCadTrays` |
| Board level, location (room), plan position | 06-network-sld-editor, 24-drawings-sld-sheets | `cadDevices.ts:placeBoard` (`Board.planPoint`, `level`, `location`) |
| Rooms with name, area, outline, type | 04-building-load-assessment, 18-lighting-emergency, 29-elv | `cadRooms.ts:applyRooms`, `floorPlanActions.ts:putRooms` |
| Luminaire schedule and BOQ group J luminaire lines | 18-lighting-emergency, 20-equipment-boq-pricing | `luminaireSchedule.ts:luminaireSchedule` (reads `lvPoints`), `calc/bom.ts:289` |
| Plan sheets (lighting, power, containment) | 23-cad-sheets-plot-titleblock, 24-drawings-sld-sheets, 25-reports-exports | `docs/planLayout.ts:contentOf`; `model/drawingSet.ts:526–531` |
| Device and cable lists (Excel) | 25-reports-exports | `model/cadExports.ts:deviceRows`, `cableRows` |
| Change classes / revision labels for `lvPoints`, `cadWiring`, `cadPlanLinks` | 26-revisions-changes | `model/changeClass.ts:36`, `model/revisions.ts:152` |

## 5. User flow — from button click to result

**A. Place a light on a circuit**
1. Design CAD → Plan → Devices → DEV; pick "Light" and a circuit from the list `circuits = finalCircuits(project)` (`CadPage.tsx:540`).
2. Click on the plan → `placeItem` (`CadPage.tsx:2081` → `cadDevices.ts:139`) → `placeLvPoint` (:94) adds `LvPoint {id:"P12", feederId, x, y, level}`.
3. `withCount` (:86) → `schedule.ts:updateCircuit` with `points.ltg + 1` → `refresh` recomputes `loadKw` from points × WATT/UNIT and re-sizes MCB and cable unless sized by hand.
4. Status line: "Light placed on DB-GF1/R1 · Living lighting — 7 on the circuit".

**B. Wire and measure**
1. WC (wire circuits) → `wireLevel` (`cadWiring.ts:125`) adds a `CadWiring {feederId}` for every circuit with devices on the level; W1 toggles one (`toggleWiring`).
2. The canvas draws `levelWiring` (:100): nearest-neighbour arcs, home run to the DB if the DB is placed on this level, tag "DB-GF1/L3 · 2C × 1.5 mm² · 23 m".
3. CR (cable route) → `finishCable` (`CadPage.tsx:2147`) draws a polyline with `cable: {feederId}`; LR copies a drawing line as such a route (`CadPage.tsx:1861`).
4. SCHED → `schedules()` (`CadPage.tsx:2154`) → `updateSchedules` (`cadPlanSchedules.ts:51`):
   - tray lengths and fittings per tray route → `applyCadTrays`;
   - cable route length per feeder (all plans) → `pullCadLengths` (+ vertical 6 m + terminations 3 m, + 5 % waste) → `applyCadLengths` sets `lengthM` for every feeder that differs;
   - wired circuits without a drawn route → `applyWiringLengths` sets `lengthM`.
5. Voltage drop and cable schedule re-run on the new `lengthM` like any length edit.

**C. Loads from CAD**
1. Open the plan in Design CAD; open "Loads from CAD floor plan" (`App.tsx:1794`).
2. Read → `view.blocks()` minus erased blocks (`CadLoadsDialog.tsx:44`) → `pullCadLoads` (`cadLoads.ts:71`) resolves each block to a library item and its CCT to a circuit (`findCircuit` :53).
3. Map unknown blocks; untick rows; Apply → `applyCadLoads` (:131) → `updateCircuit` per circuit; an automatic checkpoint is taken first.

**D. Rooms**
1. ROOMS → `addFound` (`CadPage.tsx:2130`) → `roomsFromPlan(planOfView(...))` → `putRooms` → `proposeRooms` + `applyRooms` (rooms keep their ID by outline handle).

## 6. Linked to (working connections)

- **07-load-schedule-panels** — placing, deleting, replacing, moving to another circuit and copying LV points keep `Feeder.points` in step (`cadDevices.ts:withCount`, `deviceEdit.ts:recount`), and the circuit is re-sized (`schedule.ts:refresh`).
- **06-network-sld-editor** — board rename (`renamePanels.ts:renamePanels`) re-keys `lvPoints[].feederId`, `cadWiring[].feederId`, `cadSketch[].cable.feederId` (generic `walk` on key `feederId`, :75–79) and `cadPlanLinks` routes/places (:98–102). Circuit *name* edits need nothing: devices hold the circuit ID and labels are read live (`circuitLabel`). `deviceEdit.ts:renameBoard` changes the board name only, the ID stays.
- **08-voltage-drop / 11-breaker-cable-selection / 19-cable-tray-containment** — measured lengths do replace the typed length: there is only one field, `Feeder.lengthM`, and `applyCadLengths` / `applyWiringLengths` overwrite it (and clear `lengthToCheck`). A drawn cable route wins over the wiring length (`applyWiringLengths(next, routed)`, `cadPlanSchedules.ts:111`). Voltage drop uses `f.lengthM` (`calc/voltageDrop.ts:84`).
- **19-cable-tray-containment** — tray route lengths, fittings (bends, tees, reducers) and each feeder's tray route from the plans (`updateSchedules`).
- **04-building-load-assessment** — rooms with outlines and areas; boards' level and room (`placeBoard`).
- **18-lighting-emergency** — Light room and Emergency place LV points through `placeLvPoint`; the luminaire schedule reads `lvPoints`.
- **20-equipment-boq-pricing** — luminaire lines in BOQ group J (`calc/bom.ts:289`).
- **29-elv** — ELV devices share the selection, move, copy, delete and replace tools (`deviceEdit.ts`).
- **24-drawings-sld-sheets / 23-cad-sheets-plot-titleblock** — plan sheets from the model (`planLayout.ts:contentOf`), so a design change shows on the sheet.
- **26-revisions-changes** — `lvPoints`, `cadWiring`, `cadPlanLinks` are tracked fields (`changeClass.ts:36`, `revisions.ts:152`).
- **31-headless-cli-mcp** — rooms only: `headless/cadTools.ts` uses `roomsFromPlan`, `proposeRooms`, `applyRooms`.



---

*Public summary: describes what the module does and how it connects. The engineering review of open issues is kept separately.*
