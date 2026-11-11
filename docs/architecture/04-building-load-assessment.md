# 04 — Building model, load assessment (incl. MDB), concept brief and concept report
[← Index](00-index.md) · [Integration map](99-integration-map.md)

## 1. What it does

This module holds the architectural data of the project and the first, concept-stage estimate of the electrical load.

- **Building information**: buildings, levels (a "typical" level can stand for many identical floors), rooms with a room type and an area, flat/tenant layouts ("unit types") placed on levels, and room types with a W/m² density and a demand factor. It also generates DBs and load schedules from the rooms, adds common-area services as feeders, checks each DB against the rooms it serves, and prints a building load summary (TCL / MDL per floor).
- **Load assessment**: before any load schedule exists, it estimates maximum demand (MD) from a building type: area schedule × W/m² for lighting, small power and cooling, plus services (DHW, cooking, lifts, pumps, EV, special loads, fire and life safety), a diversity per category, a coincidence factor and spare. From the MD it picks the transformers (count × kVA, N or N+1) and a standby generator. "Create MDB + feeders" turns the result into one MDB per duty transformer with one feeder per load category.
- **Project brief** (the "concept brief"): role (consultant / contractor), authority, scope, parties and deliverables. It decides which screens count as "in scope".
- **Concept design report**: a one-page black-and-white A4 PDF built from the load assessment (or the SLD when there is none) and the substation room areas.

"Store" in this document means the project object kept in memory (`Project` in `src/types.ts`); every edit here replaces part of it (`project.building`, `project.loadAssessment`, `project.brief`) and is saved with the project file.

## 2. Files, components, functions and stores

| File | Kind | Key functions or components | What they do |
|---|---|---|---|
| `src/calc/building.ts` | calc | `DEFAULT_ROOM_TYPES`, `roomTypesOf`, `roomLoad`, `summarizeBuilding`, `builtUpAreaOf`, `dbChecks`, `nextRoomId`, `roomsFromTable`, `spaceAreasFromRooms`, `floorsOf`, `loadRoomTypeLibrary` | Room loads (area × W/m² × DF), per-level and per-building totals, GFA/BUA, floor list with tags (B1, G, L01…R), DB-vs-rooms check (±30 %), paste of an architect's area schedule, rooms → space-planning areas |
| `src/calc/buildingDesign.ts` | calc | `DEFAULT_RULES`, `plannedDbs`, `generateBuildingDbs`, `applyRiserLengths`, `incomerLengthM`, `defaultServices`, `addServices`, `roomDensities`, `floorLoads`, `unitLoads` | Generates a common DB per floor and a DB per flat with lighting/socket/AC/WH/cooker circuits from room rules; incomer length from the riser; common services as feeders; W/m² and LPD checks |
| `src/calc/loadAssessmentMdb.ts` | calc | `assessmentFeeders`, `spreadFeeders`, `createMdbFromAssessment`, `LA_MDB` | Assessment → MDB(s) tagged `generated: 'la:mdb'` and feeders tagged `fromRoom: 'la:<key>'`; feeders sized with `recommend(..., 'optimise')` |
| `src/model/buildingEdit.ts` | model | `findBuilding`, `addBuilding`, `addLevel` | Add buildings/levels without the UI (used by the headless CLI) |
| `src/model/buildingPreset.ts` | model | `bundleFrom`, `mergeBundle`, `roomTypeDiff`, `presetFromBuilding`, `loadBuildingPresets`/`saveBuildingPresets`, `importBuildingPresets`, `unitTypeLibrary`, `withLibraryUnits`, `missingRoomTypes` | Building presets and copying buildings from a past project; flat-layout library |
| `src/model/levels.ts` | model | `floorList`, `findFloor`, `floorLabel`, `matchFloor`, `boardLocation`, `boardsWithoutLevel` | The single list of floors that boards, rooms and drawings link to (by id, not name) |
| `src/model/brief.ts` | model | `ProjectBrief`, `newBrief`, `deliverableCatalog`, `withScope`, `withRole`, `resetToRole`, `applyBrief`, `inScope`, `viewInScope` | Project brief: role, authority, scope, parties, deliverables; fills the project header (owner, consultant…) |
| `src/components/docs/BuildingView.tsx` | screen | `BuildingView` | Building information page: levels, rooms, room types, paste rooms, presets, generate DBs, services, density panel, DB check, summary PDF/Excel |
| `src/components/docs/BuildingDesignPanels.tsx` | screen | `RoomRulesTable`, `UnitTypesCard`, `LevelUnitsDialog`, `GenerateDialog`, `ServicesDialog`, `DensityPanel` | Dialogs and panels used by `BuildingView` |
| `src/components/docs/BuildingReuse.tsx` | screen | `SavePresetDialog`, `ReuseDialog`, `UnitLibraryDialog` | Save/reuse building presets, copy from a past project |
| `src/components/docs/LoadAssessmentView.tsx` | screen | `LoadAssessmentView` (`pickType`, `createMdb`, `fromBuilding`, `rowsFromBuilding`) | The load assessment page |
| `src/components/docs/FurnitureFields.tsx` | screen | `FurnitureFields` | **Not part of this module**: drawing-sheet "furniture" (zones, legend, notes) — belongs to 23/24 |
| `src/components/BriefEditor.tsx` | screen | `NewProjectWizard`, `BriefDialog`, `PartiesStep`, `ScopeStep`, `DeliverablesStep` | Brief editing in the new-project wizard and later |
| `src/docs/buildingSummary.ts` | report | `buildingSheet`, `buildingSummaryHtml`, `buildingSummaryWorkbook` | Building load summary per building (PDF and Excel) |
| `src/docs/conceptReport.ts` | report | `conceptReport`, `conceptReportHtml`, `buildConceptReportHtml` | One-page concept design report |
| `src/docs/designBasis.ts` (callee) | report | `loadAssessmentBasis`, `laBandText`, `laTxText`, `laGenText` | Turns the assessment into the Design Basis section (used by the concept report) |
| Stores | store | `Project.building` (`BuildingInfo`), `Project.loadAssessment` (`LoadAssessment`), `Project.brief` (`ProjectBrief`) — `src/types.ts:651-653`; local libraries in `localStorage`: `lvds.loadAssessmentLibrary`, `lvds.roomTypes`, `lvds.buildingPresets`, `lvds.unitTypes` | Project data saved in the project file; libraries saved on this computer |

## 3. Inputs — where its data comes from

| Data | From module (ID) | File + function |
|---|---|---|
| Room types library (RoomTypes.xlsx), flat layouts (UnitTypes.xlsx), Transformers and Generators catalogues (sizes) | 32-component-database | `src/database/catalog.ts:catalog()` used in `building.ts:roomTypesOf`, `buildingPreset.ts:unitTypeLibrary`, `loadAssessment.ts:txSizesOf`/`genSizes` |
| Watts per point, max points per circuit, meter limits | 03-parameters-rules (Rules.xlsx via catalog) | `buildingDesign.ts:genPointWatts`, `maxPerCircuit`, `meterFor` → `rule()` |
| Rooms drawn on CAD plans (outline, area) | 22-cad-electrical | `src/model/cadRooms.ts` writes `project.building.rooms` (uses `roomTypesOf`) |
| Rooms from the inbox / exchange package | 30-exchange-inbox | `src/exchange/inbox.ts` (uses `roomTypesOf`) |
| Buildings and levels from the CLI | 31-headless-cli-mcp | `src/headless/buildingTools.ts` → `buildingEdit.ts:addBuilding`/`addLevel` |
| Board demand for DB check, building summary and "designed so far" | 06-network-sld-editor / 07-load-schedule-panels | `src/calc/summary.ts:boardTotals` in `building.ts:dbChecks`, `buildingDesign.ts:floorLoads`; `src/calc/dashboard.ts:buildDashboard` in `LoadAssessmentView` |
| Substation rooms for the concept report | 05-space-planning | `src/calc/dmSubstation.ts:substationsFromProject`, `dmSubstationAreas` in `conceptReport.ts:conceptReport` |
| Revision stamp, design stage | 26-revisions-changes / 03-parameters-rules | `model/revisions.ts:revisionStamp`, `model/designStage.ts:STAGE_INFO` in `conceptReport.ts` |
| Authority choice and templates for the brief | 27-review-submissions-authority | `BriefEditor.tsx:AuthorityPicker` |

## 4. Outputs — where its results go

| Result | Used by module (ID) | File + function |
|---|---|---|
| MDB(s) with transformer kVA and one feeder per load category | 06-network-sld-editor, 12-transformer-generator, 07-load-schedule-panels | `loadAssessmentMdb.ts:createMdbFromAssessment` (boards via `model/transformers.ts:planTransformers`/`applyTransformers`/`withTransformer`) |
| Feeder sizes on those MDBs | 11-breaker-cable-selection | `createMdbFromAssessment` → `sizing.ts:recommend(..., 'optimise')` |
| Generated DBs, circuits, incomers from rooms | 07-load-schedule-panels, 06-network-sld-editor | `buildingDesign.ts:generateBuildingDbs` |
| Common services feeders | 06-network-sld-editor | `buildingDesign.ts:addServices` |
| Floor list / level links | 24-drawings-sld-sheets, 09-earthing, 21-cad-core, 18-lighting-emergency, 07-load-schedule-panels | `levels.ts:floorList` (used in `diagram/riserLayout.ts`, `model/dbRiser.ts`, `model/earthRiser.ts`, `model/luminaireSchedule.ts`, `components/cad/CadPage.tsx`, `PanelsPage.tsx`…) |
| Space-planning areas from rooms | 05-space-planning | `building.ts:spaceAreasFromRooms` ← `SpacePlanView.tsx` |
| Building summary in busbar riser | 14-busbar | `src/calc/busbar.ts` uses `summarizeBuilding` |
| Built-up area for DEWA forms / MD sheet | 07-load-schedule-panels, 03-parameters-rules | `building.ts:builtUpAreaOf` ← `docs/mdSheet.ts`, `model/params.ts`, `ProjectSettings.tsx` |
| DB-vs-rooms check | 28-dashboard-readiness, 07-load-schedule-panels | `building.ts:dbChecks` ← `calc/dashboard.ts`, `LoadScheduleView.tsx` |
| Load assessment section in Design Basis (PDF and Word) | 25-reports-exports | `docs/designBasis.ts:loadAssessmentBasis` (when `inReport`), `docs/studyWord.ts:127` |
| Concept design report PDF | 25-reports-exports | `App.tsx:1309 onConceptReport` → `conceptReport.ts:buildConceptReportHtml` |
| Building summary PDF in export centre | 25-reports-exports | `components/docs/exportCatalogue.ts:188` → `buildingSummaryHtml` |
| Readiness checklist items | 28-dashboard-readiness | `calc/projectReadiness.ts:59-60` |
| Brief scope filtering of findings/screens | 01-app-shell, 28-dashboard-readiness | `brief.ts:inScope`, `viewInScope` |
| Change class / revision labels | 26-revisions-changes | `model/changeClass.ts:37`, `model/revisions.ts:148` |

## 5. User flow — from button click to result

**Load assessment → MDB**
1. Ribbon "Concept" tab → Load assessment (`Ribbon.tsx:515`) → `App.tsx:1623` mounts `LoadAssessmentView`.
2. User picks a building type → `pickType` (`LoadAssessmentView.tsx:52`) → `buildingFigures(project)` reads GFA above ground, floors and car park from the **first** building → `newAssessment(type, base, lib)` copies the type's rows, services, factors and diversities into `project.loadAssessment`.
3. Optional: "GFA from Building" (`fromBuilding`, line 114) re-reads `buildingFigures`; "From Building rooms" (`rowsFromBuilding`, line 120) replaces the area schedule with `rowsFromRooms(project, spaces)` (m² mode).
4. Every edit (rows, services, factors, diversity, supply) calls `set(...)` → `onChange` → `setProject(p, { step: true })` (one undo step). `assess(a)` re-runs on each render (`useMemo` on `a`).
5. Right column shows connected kW, MD kVA, VA/m² vs band, `tx` (count × kVA), generator, incomer A; and "Designed so far" from `buildDashboard`.
6. "Create MDB + feeders" → `createMdb` (line 73) → `createMdbFromAssessment(project, a, target)`: one MDB per duty transformer (`planTransformers`), feeders from `assessmentFeeders` spread by `spreadFeeders`, each sized by `recommend(..., 'optimise')`; earlier `la:` feeders on those boards are replaced. A status line reports transformer loading.
7. "Add to Design Basis report" sets `inReport: true` → printed by `designBasis.ts:loadAssessmentBasis`.

**Building → DBs**
1. Building view (`App.tsx:1622` → `BuildingView`): add building/levels/rooms, paste rooms (`roomsFromTable`), flats per level (`LevelUnitsDialog`).
2. "Generate DBs…" → `GenerateDialog` → `generateBuildingDbs(project, buildingId, sourceBoard)` (DBs, circuits, phase balance, incomer sized).
3. "Common services…" → `ServicesDialog` → `defaultServices` → `addServices(project, board, items)`.
4. "Summary PDF / Excel" → `buildingSummaryHtml` / `buildingSummaryWorkbook`.

**Concept report**: Ribbon "Concept report" → `App.tsx:1309` → `buildConceptReportHtml(project)` → `conceptReport` (assessment via `loadAssessmentBasis`, rooms via `substationsFromProject`/`dmSubstationAreas`) → `savePdf`.

**Brief**: New project wizard (`NewProjectWizard`) or `BriefDialog` → `applyBrief(project, brief)` writes `project.brief` and header fields in `project.info`.

## 6. Linked to (working connections)

- 32-component-database: transformer and generator sizes in `assess` come from the catalogue first (`txSizesOf`, `genSizes`); room types and flat layouts from RoomTypes.xlsx / UnitTypes.xlsx.
- 06/12: `createMdbFromAssessment` makes real MDBs with `sourceKva` = the assessment's transformer and feeders with load kW, demand factor = category diversity, `essential` for generator-backed shares — so the network, transformer and generator studies see the assessment once the button is pressed. Re-running updates the same boards (`generated: 'la:mdb'`) and replaces only `la:` feeders.
- 11: each assessment feeder and each generated incomer is sized by `recommend(..., 'optimise')`.
- 07: `generateBuildingDbs` writes load schedules; `dbChecks` compares DB demand with room-type demand.
- 05: `spaceAreasFromRooms` feeds space planning; concept report reads substation room areas.
- 25: Design Basis and Word study report print the assessment (`loadAssessmentBasis`); building summary is in the export catalogue.
- 28: readiness checklist uses `p.building` and `p.loadAssessment`.
- Levels: `levels.ts` is the single level list used by boards, CAD, risers and earthing (rename shows everywhere).
- The assessment is stored in the project file (`types.ts:653`) and is part of undo (`step: true`) and revision change classes (`changeClass.ts:37`).



---

*Public summary: describes what the module does and how it connects. The engineering review of open issues is kept separately.*
