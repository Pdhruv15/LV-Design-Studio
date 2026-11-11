# 32 — Component database, catalogue, library sync, standard loads
[← Index](00-index.md) · [Integration map](99-integration-map.md)

## 1. What it does

The "LV Database" is a folder of 14 Excel workbooks (default `LV Database` inside the projects folder, or a folder the user picks, e.g. on Google Drive) plus one `Library.json` file. It is the app's shared equipment and rules library: a team edits it in Excel (or on the Database screen) and every computer that opens the same folder picks up the changes.

| Workbook (`electron/databaseSpec.json` `books[].id`) | What the app does with it |
|---|---|
| `Loads.xlsx` (`loads`) | Equipment library: rows offered as "From library" on load schedules, circuit items, SLD palette and CAD block loads. Watts linked to a project follow later edits (`syncLibrary`). |
| `Cables.xlsx` (`cables`) | R (20 °C), X, method-E current rating and method A1…D2 ratings per conductor size; rate per m for the BOQ. Replaces the built-in reference cable table for every calculation (`setCables`). |
| `Breakers.xlsx` (`breakers`) | Breaker ratings the sizing may choose, Icu steps, breaker prices (`setBreakerLists`, `setBreakerPrices`). |
| `Parameters.xlsx` (`parameters`) | Defaults for new projects (voltage, ambient, VD limit, study settings) — "Apply to this project" button. |
| `Transformers.xlsx`, `Generators.xlsx` | Standard kVA lists for sizing, transformer %Z, generator kW, BOQ prices. |
| `Busbar.xlsx` | Busway catalogue for the riser study (replaces `TYPICAL_BUSBAR_DATA`). |
| `Equipment.xlsx`, `Prices.xlsx` | BOQ prices (by BOQ key) and price lists. |
| `RoomTypes.xlsx`, `UnitTypes.xlsx` | Room types (W/m², generation rules) and flat layouts for Building information. |
| `Luminaires.xlsx` | Luminaire list for "Light room" (lux). |
| `Rules.xlsx` | Authority/company rules: minimum PF, motor-start VD limit, points per circuit, kWh meter limits, watts per point on generated DBs. |
| `CableSchedule.xlsx` | Cable reference numbers on SLD sheets and the cable schedule. |

"Standard loads" is a 21-item starter set (LED downlight 12 W, 13 A socket 200 W, water heater 3000 W …) that the user can review and append to `Loads.xlsx` from the Database screen.

## 2. Files, components, functions and stores

| File | Kind | Key functions or components | What they do |
|---|---|---|---|
| `electron/databaseSpec.json` | model | `folderName`, `books[]` (id, file, sheet, about, columns with key/header/required/number/list/help) | One definition of every workbook, its columns and "Read me" text; shared by the Electron side and the screen. |
| `electron/main.cjs` | store (IPC) | `initDatabase` (:375), handlers `database:init`, `database:read`, `database:write`, `database:library:read`, `database:library:write` (:388–392) | Bridges the window to `database.cjs` ("IPC" = messages between the window and the desktop process). |
| `src/database/database.ts` | model / calc glue | `parseDatabase` (:96), `parseCatalog` (:197), `applyDatabase` (:291), `databaseSeeds` (:312), `projectDefaults` (:337), `applyParameters` (:350), `loadsForColumn` (:357), `findLibraryLoad` (:363), `loadItemFromLibrary` (:371), `syncLibrary` (:383), `PARAMETERS` (:59), types `Database`, `LibraryLoad`, `BreakerRow`, `RawDatabase` | Validates workbook rows (bad rows skipped and listed with Excel row number), pushes the data into the calculation modules, builds seed rows for new workbooks, and re-syncs library-linked watts in the open project. |
| `src/database/catalog.ts` | store | `catalog()`, `setCatalog` (:34), `RULES` (:37), `rule` (:50), `transformerFor`, `generatorFor` (:52–53), `catalogRate` (:56), `EMPTY_CATALOG` | In-memory catalogue (transformers, generators, busbar, equipment, room types, luminaires, unit types, price lists, rules, cable refs) read by calc modules. |
| `src/database/librarySync.ts` | store | `LIBRARY_KEYS` (:6), `pullLibrary` (:12), `pushLibrary` (:27) | Copies the 12 library keys between localStorage and `Library.json`. |
| `src/data/brandDevices.ts` | model (data) | `BRAND_DEVICES` (:28) | 16 built-in manufacturer device dimensions (MCB…ACB, SPD, meter) for enclosure sizing and BOQ "ref. … or approved equal". |
| `src/components/docs/DatabaseView.tsx` | screen | `DatabaseView` (:39), `save` (:88), `changes` memo (:69), `markSeen` (:82), `USED_FOR` (:14) | Database page: one tab per workbook, problems list, "changed since you last looked" (stored in `lvds.dbSeen`), Edit here / Save to Excel, Open in Excel, Database folder…, Apply to this project, Add standard loads… |
| `src/components/docs/StandardLoadsDialog.tsx` | screen | `StandardLoadsDialog` (:13), `add` (:27) | Lets the user edit watts and untick items, then writes `Loads.xlsx` via `database.write('loads', …)`. |
| `src/App.tsx` | store / shell | `receiveDatabase` (:355), `initDatabase` (:370), `db` state (:304), `hasDatabase` (:75), `'database'` view (:201, :1554) | Loads the database at start, re-applies it on every Excel save, syncs library watts in the open project, renders `DatabaseView`. |

## 3. Inputs — where its data comes from

| Data | From module (ID) | File + function |
|---|---|---|
| Workbook rows, folder path | 34-electron-desktop | `electron/database.cjs` `readDatabase`, `electron/main.cjs` `initDatabase` |
| Database folder setting (own folder vs projects folder) | 34-electron-desktop | `electron/main.cjs` `settings:chooseDatabaseFolder` (:177), `database.setFolder` (:57) |
| Built-in seed values (reference cables, breaker list, typical tx/gen, busbar, room types, luminaires, rules, cable refs) | 11-breaker-cable-selection, 12-transformer-generator, 14-busbar, 04-building-load-assessment, 18-lighting-emergency, 24-drawings-sld-sheets | `src/database/database.ts` `databaseSeeds` reads `REFERENCE_CABLE_TABLE`, `STANDARD_BREAKER_A`, `STANDARD_TRANSFORMER_KVA`, `typicalImpedancePct`, `TYPICAL_BUSBAR_DATA`, `DEFAULT_ROOM_TYPES`, `DEFAULT_RULES`, `LUMINAIRES`, `BUILT_IN_CABLES` |
| Library items saved by other screens (title blocks, components, presets, price lists, enclosure catalogues, device dims, building presets, CAD layer templates…) | 23-cad-sheets-plot-titleblock, 20-equipment-boq-pricing, 17-enclosure-form4, 03-parameters-rules, 27-review-submissions-authority, 04-building-load-assessment, 21-cad-core | each module writes localStorage then calls `pushLibrary` (e.g. `src/model/titleBlock.ts:320`, `src/model/components.ts:94`, `src/model/enclosureLibrary.ts:21`, `src/model/presets.ts:72`) |
| The open project (for `syncLibrary`, `applyParameters`) | 02-project-storage | `src/App.tsx` `receiveDatabase`, `onApplyParameters` |

## 4. Outputs — where its results go

| Result | Used by module (ID) | File + function |
|---|---|---|
| Cable R, X, ratings (`setCables` → `cables()`, `getCable`, `resolveCable`, `methodRating`) | 06-network-sld-editor, 08-voltage-drop, 09-earthing, 11-breaker-cable-selection, 16-load-flow-engines | `src/calc/cableTable.ts` `cables` (:124), `src/engines/external.ts:11` sends `cables()` to the external/Python engine |
| Source of cable data notice | 25-reports-exports, 24-drawings-sld-sheets | `src/calc/cableTable.ts` `cableDataNotice`, used in `src/docs/calcReport.ts`, `studyReport.ts`, `studyWord.ts`, `sldSheet.ts` |
| Breaker ratings and Icu steps (`breakerRatings()`, `icuSteps()`) | 06, 07-load-schedule-panels, 10, 11, 13, 33-quick-calcs-existing | `src/calc/sizing.ts` `setBreakerLists` (:23); readers: `quickFix.ts`, `pfc.ts`, `pfcCalc.ts`, `quick.ts`, `changeover.ts`, `dbSheet.ts`, `mdSheet.ts`, `CircuitEditDialog.tsx`, `LoadScheduleView.tsx` |
| Breaker and cable prices | 20-equipment-boq-pricing | `src/data/rates.ts` `setBreakerPrices` (:16), `cableRatePerM` (:21), `breakerRateAed` (:25) |
| Transformer / generator kVA lists (arrays changed in place) | 12-transformer-generator | `src/database/database.ts` `applyDatabase` (:300–301) → `STANDARD_TRANSFORMER_KVA`, `STANDARD_GENERATOR_KVA` |
| Transformer %Z | 12-transformer-generator, 06 | `src/calc/txGen.ts` `typicalImpedancePct` (:43) via `transformerFor`; `src/model/transformers.ts:50` copies it into `Board.sourceImpedancePct` |
| Generator kW | 12-transformer-generator | `src/calc/sizing.ts` `generatorRatedKw` (:95) via `generatorFor` |
| tx/gen kVA for the MDB load assessment | 04-building-load-assessment | `src/calc/loadAssessment.ts` `txSizesOf` (:309), `genSizes` (:314) read `catalog()` |
| Busway catalogue | 14-busbar | `applyDatabase` (:303–304) → `TYPICAL_BUSBAR_DATA` |
| Room types, unit types | 04-building-load-assessment | `src/calc/building.ts` `roomTypesOf` (:44), `src/model/buildingPreset.ts` `unitTypeLibrary` (:240), `src/calc/loadAssessment.ts` `rowsFromRooms` (:250) |
| Luminaires | 18-lighting-emergency, 22-cad-electrical | `src/calc/roomLighting.ts` `luminairesOf` (:22), `src/components/cad/RoomLightingPanel.tsx` |
| Rules (`rule()`) | 13-power-factor-correction, 08-voltage-drop, 04-building-load-assessment, 07-load-schedule-panels | `pfcCalc.ts:152`, `pfcReport.ts:60`, `voltageDrop.ts:52` `motorStartVdLimit`, `buildingDesign.ts:40–45` `genPointWatts`/`meterFor`, `deviceEdit.ts:159` |
| Equipment/tx/gen/busway prices, price lists | 20-equipment-boq-pricing | `src/model/priceList.ts` via `catalogRate`, `catalog().priceLists` (:31) |
| Cable reference numbers | 24-drawings-sld-sheets, 19-cable-tray-containment | `src/model/cableRefs.ts` `standardCables` (:48), `allCableRefs` (:61) |
| Library loads (`db.loads`) | 07-load-schedule-panels, 06-network-sld-editor, 22-cad-electrical | `LoadScheduleView.tsx:299`, `CircuitEditDialog.tsx:180–207`, `sldEdit.ts` `libraryEntries` (:144) / `applyDrop` (:350), `cadLoads.ts` `pullCadLoads` (:71), `App.tsx:1033, 1181, 1730, 1796` |
| Project defaults from Parameters.xlsx | 03-parameters-rules, 02-project-storage | `applyParameters` used in `App.tsx:889` (new project), `App.tsx:1560`, `src/model/setupPreview.ts:15` |
| Updated project (synced watts) | 07-load-schedule-panels, 02-project-storage | `syncLibrary` → `App.tsx` `receiveDatabase` (:361) |

## 5. User flow — from button click to result

**App start (desktop)**
1. `App` mounts; `useEffect` (App.tsx:377) calls `initDatabase` (:370) when `hasDatabase` is true.
3. `receiveDatabase` (App.tsx:355): `parseDatabase` validates rows → `applyDatabase` pushes cables, breaker lists, prices, catalogue and kVA/busway lists into the calc modules and clears the network cache (`forgetNetworks`) → `setDb`.
4. Same function runs `syncLibrary` on the open project and `refreshBoard` on changed boards; status bar shows "Database synced hh:mm".
5. `pullLibrary` copies `Library.json` keys into localStorage (or, if the file is empty, `pushLibrary` writes this computer's copy).

**Editing in Excel**
6. User saves a workbook in Excel → `fs.watch` in `watchDatabase` fires → `database:changed` message → `receiveDatabase` again (steps 3–4).

**Database screen** (left menu "Database", view `'database'`)
7. `DatabaseView` shows the tab's rows from `db.raw`; "Edit here" copies them into `draft`; "Save to Excel" → `save` (:88) checks required/number columns → `window.lvds.database.write` → `writeBook` (backup, then replace known-column cells) → `onRefresh` → `database.read()` → `receiveDatabase`.
8. "Apply to this project" (Parameters tab) → `applyParameters` + `refreshBoard` for every board.
9. "Add standard loads…" (Loads tab) → `StandardLoadsDialog` → `withStandardLoads` → `database.write('loads', rows)` → `onRefresh`.
10. "Database folder…" → `settings.chooseDatabaseFolder` then `location.reload()`.

**Using the library on a design**
11. Load schedule WATT/UNIT "From library" (`LoadScheduleView.tsx:302`) stores the watts in `Board.pointWatts` and the item name in `Board.pointItems`; circuit items (`CircuitEditDialog`) store `reference`, `name`, `unitWatts` via `loadItemFromLibrary`. Those stored watts are what the calculations use, and `syncLibrary` overwrites them on the next database event.

## 6. Linked to (working connections)

- **11-breaker-cable-selection / 08 / 09 / 06**: Cables.xlsx → `setCables` → `cables()` / `getCable` / `methodRating`; unknown sizes fall back to reference values and are reported (`resolveCable` `'fallback'`, `cableDataNotice`).
- **16-load-flow-engines**: external engine request includes `cables()` (`src/engines/external.ts:11`).
- **11 / 07 / 10 / 13 / 33**: Breakers.xlsx → `breakerRatings()`, `icuSteps()` (list above).
- **20-equipment-boq-pricing**: breaker prices, cable rate per m, Equipment/Prices/tx/gen/busway prices (`catalogRate`, `catalog().priceLists`).
- **12-transformer-generator**: kVA lists replaced in place, %Z (`typicalImpedancePct`), generator kW (`generatorRatedKw`).
- **14-busbar**: Busbar.xlsx replaces `TYPICAL_BUSBAR_DATA` in place.
- **04-building-load-assessment**: room types, unit types, tx/gen kVA for the assessment, rules for generated DBs (`genPointWatts`, `meterFor`).
- **18-lighting-emergency**: Luminaires.xlsx via `luminairesOf`.
- **13-power-factor-correction / 08**: `rule('pfMinimum')`, `rule('motorStartVdLimitPct')`.
- **24-drawings-sld-sheets**: CableSchedule.xlsx via `standardCables`.
- **07-load-schedule-panels / 06 / 22**: library loads in schedules, circuit items, SLD palette, CAD block loads.
- **03-parameters-rules / 02**: Parameters.xlsx defaults for new projects and "Apply to this project".
- **17-enclosure-form4**: `BRAND_DEVICES` and synced `lvds.deviceDims` / `lvds.enclosureCatalogues`; the board keeps a frozen copy of the enclosure chosen (`Board.enclosure`, `src/types.ts:383`).
- **34-electron-desktop**: IPC handlers, size limits (`LIMITS.workbookBytes` 20 MB, `workbookRows` 2000, `libraryBytes` 20 MB), safe file writes (`replaceFile`, `copyFileNoFollow`).



---

*Public summary: describes what the module does and how it connects. The engineering review of open issues is kept separately.*
