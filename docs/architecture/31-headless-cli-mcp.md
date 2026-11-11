# 31 — Headless CLI (`lvds`) and MCP server tools
[← Index](00-index.md) · [Integration map](99-integration-map.md)

## 1. What it does

"Headless" means the app's calculation code runs **without the window**. One list of *tools* (a tool = a named command with checked inputs and a short JSON result) is offered three ways:

| Way in | Started by | Who uses it | Can change projects? |
|---|---|---|---|
| Command line `lvds <command>` | `src/headless/cli.ts` `main` | the engineer in a terminal, scripts, CI | yes, but every change tool previews unless `--apply` / `--propose` / `--export` is given |
| MCP server `lvds mcp` (MCP = Model Context Protocol, the way an AI assistant calls local tools over stdin/stdout) | `src/headless/mcp.ts` `createMcp` | Claude Desktop / Claude Code / a local model | only when started with `--write`; even then preview by default |
| Local HTTP API `lvds serve` | `src/headless/api.ts` `createApi` | Excel, Python, other local programs | only with `--write`, and only by POST with JSON |

All three call the same `callTool` (`src/headless/tools.ts:332`), which checks the arguments against the tool's input schema (zod = a library that checks the shape and range of each input; `.strict()` refuses unknown inputs) before the tool runs.

The bundle is built by `npm run build:cli` (`vite.cli.config.ts`) into one Node file `dist-cli/lvds.mjs` (dependencies and the CAD reader WebAssembly inlined).

### 1.1 Coverage — every study / feature and whether CLI/MCP exposes it

| Study / feature (module ID) | Exposed? | Tool(s) | Notes |
|---|---|---|---|
| Project list, summary, connected/maximum demand (28, 06) | Yes | `list_projects`, `project_summary` | `systemSummary`, `buildDashboard` |
| Panels and circuits, Ib/In/Iz, loading (06, 07) | Yes | `list_panels`, `get_panel`, `circuit_results` | `boardSummary`, `run.results` |
| Voltage drop (08) | Yes | `circuit_results` (vdPct, vdTotalPct), `calc_voltage_drop`, report `voltage-drop` | quick calc is copper only |
| Short circuit / fault level (06) | Yes | `list_panels` (faultKA), `circuit_results`, `calc_fault_level`, `calc_transformer` | |
| Discrimination / selectivity (10) | Partly | `run_checks` issues | no TCC curves, no device settings |
| Load flow engines, OpenDSS, Python (16) | No | — | |
| Enclosure / Form 4 (17) | No | — | |
| Lighting / emergency lighting (18) | No (except import) | luminaire rows via `exchange_apply` | no lux calc |
| Cable schedule, tray, containment (19) | Report only | reports `cable-schedule`, `tray-schedule`, `containment` | |
| Equipment schedule, BOQ, pricing (20) | Yes (export) | `export_boq_xlsx`, reports `boq`, `boq-summary`, `equipment-schedule` | |
| Load schedules, DEWA forms (07, 25) | Yes (export) | `export_forms_xlsx`, `export_schedule_template`, reports `load-schedules`, `md-forms` | no phase-balance tool |
| Space planning, DM substation (05) | Report only | report `dm-form` | |
| Building information: buildings, levels (04) | Yes (add only) | `add_building`, `add_level` | no load-assessment / concept-brief numbers |
| CAD floor plans DWG/DXF (21, 22) | Yes (read) | `cad_plan`, `rooms_from_cad` | 2D only; no device placement except ELV |
| Drawing set / SLD / riser sheets (24) | Yes (DXF, needs Electron) | `export_dxf drawing sld`, report `drawing-register` | |
| Reports / export centre (25) | Yes | `list_exports`, `export_report` (all 20 catalogue entries, HTML or PDF) | |
| Revisions, changes, variations (26) | Partly | proposals (`propose_changes`, `size_circuits`), `list_changes` (tool log only), report `variations` | no revision / checkpoint tool |
| ELV estimate, devices, schedules, loads (29) | Yes | `elv_estimate`, `elv_devices`, `elv_place_devices`, `elv_schedules`, `elv_place_loads`, `export_elv_loads_package` | |
| Existing-installation checks (33) | No | — | |

## 2. Files, components, functions and stores

There is no in-memory store here: each tool call opens the project file, works on a copy and (for change tools) writes it back.

| File | Kind | Key functions or components | What they do |
|---|---|---|---|
| `src/headless/main.ts` | entry | `main(...)` call, `DOMParser` stand-in | Entry of `dist-cli/lvds.mjs`; adds `@xmldom/xmldom` DOMParser for the DXF code. |
| `src/headless/mcp.ts` | server | `createMcp` (:13), `startMcp`, `READ_INSTRUCTIONS`, `WRITE_INSTRUCTIONS` | Registers every offered tool with the MCP SDK; read-only/write annotations; client name recorded. |
| `src/headless/api.ts` | server | `createApi` (:59), `startApi`, `tokenMatches`, `writeApiToken`, `fromQuery` (:24), `readBody` | 127.0.0.1-only HTTP JSON API with bearer token, refuses browser requests (Origin / Sec-Fetch-Site), writes only by POST JSON. |
| `src/headless/tools.ts` | tools (read) | `TOOLS`, `allTools`, `offeredTools`, `toolByName`, `callTool` (:332), `circuitRow` (:287), `circuitIssues` (:306), `clientLabel`, `r` | Read tools and 7 quick calcs; the one input-checking path. |
| `src/headless/editTools.ts` | tools (write) | `EDIT_TOOLS`, `edit` (:53), `proposal` (:92), `proposeTool`, `supplyOrder`, `BOARD_RATING` (:85), `authorOf` | Proposals, structure changes, delete with `approvedBy`, `list_changes`, `undo_change`; checks before/after every change. |
| `src/headless/buildingTools.ts` | tools (write) | `BUILDING_TOOLS` (`add_building`, `add_level`) | Buildings and levels so an exchange rooms package can be placed. |
| `src/headless/cadTools.ts` | tools | `CAD_TOOLS` (`cad_plan`, `rooms_from_cad`), `readPlan`, `layerMap`, `findLevel`, `withChosenUnits` | DWG/DXF read by the built-in Rust/WASM reader; rooms into Building information. |
| `src/headless/exchangeTools.ts` | tools | `EXCHANGE_TOOLS`, `readFile`, `checked`, `summary` | Exchange package check, review, apply with hash and approver. |
| `src/headless/elvTools.ts` | tools | `ELV_TOOLS`, `elvSettingsFor`, `elvInput`, `listDevices` | ELV estimate, devices on a level, schedules, place loads on LV boards. |
| `src/headless/exportTools.ts` | tools (export) | `EXPORT_TOOLS`, `runExport` (:68), `readiness` (:58), `sheetsDxf` (:137), `templateFile`, `SHEET_TYPES` (:131) | Preview → approval → write new files into `Exports/<project>/<date>/`, export log. |
| `src/headless/electronExport.ts` | bridge | `findRenderer` (:54), `runInRenderer` (:72), `asarHasHeadlessExport`, `appRoot` | Finds Electron (source folder or installed app) and runs one export job through temp files. |
| `src/headless/rendererExport.ts` | bridge (renderer side) | `ExportJob`, `runJob` (:17), `install` | Runs `dxfFiles` or `CATALOGUE.build` + `renderPdf` inside the hidden window. |
| `src/headless/project.ts` | file access | `projectsFolder`, `appDataDir`, `parseProject`, `resolveProject`, `openProject` (:82), `listProjects`, `unsavedCopyInApp` (:36), `redactPaths` | Find/open projects, same shape check and migration as the app, read-only. |
| `src/headless/write.ts` | file access | `commitText` (:110), `commitProject`, `undoChange` (:139), `writeBlocked` (:61), `writeAtomic` (:51), `readLog`, `changeEntry`, `MAX_BACKUPS` | Safe project writes: refuse if unsaved in app or changed since read, temp+rename+read-back, backup, change log. |
| `src/headless/safeFiles.ts` | file access | `confine` (:43), `readFileWithin`, `readFileLimited`, `realDirs`, `areRealDirs`, `writeNewFile` (:127), `openToAppend`, `findFile`, `isInside`, `MAX_PROJECT_BYTES` | Path confinement to the projects folder (MCP/API), no-follow opens, size limits, exclusive file creation. |
| `vite.cli.config.ts` | build | `defineConfig` | Bundles `src/headless/main.ts` to `dist-cli/lvds.mjs`, Node 20, WASM inlined. |
| `electron/headlessExport.cjs` | Electron | `run`, `finish` | Hidden sandboxed window on the built `dist/index.html?lvds-export`, own temp profile, no permissions, 10-min limit. |
| `electron/headlessPreload.cjs` | Electron | `contextBridge` `lvds.files.pdfBytes` | The single bridge the hidden window needs (HTML → PDF). |
| `electron/main.cjs` (:19-20, :135) | Electron | `headless` flag | Installed app with `--lvds-headless-export` runs only the export. |
| `src/main.tsx` (:12-13) | renderer | `?lvds-export` branch | Loads `rendererExport.install` instead of the app. |

## 3. Inputs — where its data comes from

| Data | From module (ID) | File + function |
|---|---|---|
| Project file, shape check, migration | 02-project-storage | `src/headless/project.ts` `parseProject` → `checkProjectShape`, `isFutureSchema`, `migrateProject` |
| "Project open with unsaved changes" signal | 34-electron-desktop | `project.ts` `unsavedCopyInApp` reads the app's `recovery/<id>.json` (same name rule as `electron/projectFiles.cjs` `safeId`) |
| Projects folder setting | 01-app-shell / 34-electron-desktop | `project.ts` `projectsFolder` reads the app's `settings.json` |
| Network results (Ib, Iz, VD, fault, Zs, selectivity) | 06-network-sld-editor, 08, 09, 10 | `src/calc/runs.ts` `runCalculations`; `src/calc/summary.ts` `boardSummary`, `systemSummary`, `boardsInSupplyOrder` |
| To-do list, studies tally, transformer loading | 28-dashboard-readiness | `src/calc/dashboard.ts` `buildDashboard` |
| Input range issues | 02-project-storage | `src/model/projectValidate.ts` `projectInputIssues` |
| Quick calcs | 33-quick-calcs-existing | `src/calc/quick.ts` `currentFromPower`, `voltageDrop`, `cableFor`, `transformer`, `faultFromTransformer`, `motor`, `pfCorrection`; `src/calc/motor.ts` `STARTERS` |
| Breaker / cable sizing | 11-breaker-cable-selection | `src/calc/sizing.ts` `recommend`, `applyRecommendation`; `src/calc/electrical.ts` `selectCable`, `evaluateFeeder`, `runsOf` |
| Proposals (modification records) | 26-revisions-changes | `src/model/designChanges.ts` `newModification`, `addOp`, `transition`, `withRecord`, `withProposal`, `PROPOSABLE` |
| Structure edits | 06-network-sld-editor, 07-load-schedule-panels | `src/model/moveBoard.ts`, `renamePanels.ts`, `copyBoard.ts`, `edit.ts` `deleteBoard`, `schedule.ts` `deleteCircuit`, `integrity.ts` `removeDanglingReferences`, `stableIds.ts` `withUids` |
| Buildings, levels | 04-building-load-assessment | `src/model/buildingEdit.ts` `addBuilding`, `addLevel`, `findBuilding`; `src/calc/building.ts` `LEVEL_KINDS`, `buildingInfoOf` |
| DWG/DXF reading, rooms | 21-cad-core, 22-cad-electrical | `src/engines/cad/reader.ts` `readCadDrawing`; `src/model/cadDrawing.ts` `planFromDrawing`; `src/model/cadRooms.ts` `roomsFromPlan`, `proposeRooms`, `applyRooms`, `layerMapFor`; `src/model/cadUnits.ts` `planUnits` |
| Exchange packages | 30-exchange-inbox | `src/exchange/inbox.ts` `readPackage`, `reviewPackage`, `decide`, `roomsExport`; `src/exchange/designExport.ts` `designExport` |
| ELV | 29-elv | `src/elv/estimate.ts` `estimateElv`, `elvSettings`; `src/elv/placed.ts`; `src/elv/schedules.ts` `elvSchedules`; `src/calc/elvPlace.ts` `placeElvLoads`; `src/elv/package.ts` `elvLoadsPackage` |
| Report catalogue, PDF render | 25-reports-exports | `src/components/docs/exportCatalogue.ts` `CATALOGUE`, `unavailable`; `src/util/files.ts` `renderPdf`, `safeFileName` |
| Forms, template, BOQ workbooks | 07, 20, 25 | `src/docs/formWorkbook.ts` `buildFormWorkbook`; `src/docs/xlsxTemplate.ts` `fillLoadScheduleTemplate`; `src/calc/bom.ts` `buildBom`; `src/model/priceList.ts` `priceBom`; `src/model/boqRevisions.ts` `numberBom`; `src/docs/boqWorkbook.ts` |
| Drawing set, sheet DXF | 24-drawings-sld-sheets, 23 | `src/model/drawingSet.ts` `setOf`, `drawable`, `autoSize`, `sheetRev`; `src/components/docs/sheetRender.tsx` `dxfFiles`; `src/docs/sheetDxf.ts` `buildSheetDxfPages` |
| Earthing drawing | 09-earthing | `src/diagram/earthingDrawing.ts` `earthingDrawing`; `src/model/earthingPlan.ts` `earthingLayout` |
| Electron hidden window, PDF IPC validation | 34-electron-desktop | `electron/headlessExport.cjs`, `electron/pdfRender.cjs` `htmlToPdf`, `electron/ipcValidate.cjs` `pdfArgs` |

## 4. Outputs — where its results go

| Result | Used by module (ID) | File + function |
|---|---|---|
| Changed project file (+ uids on new boards/circuits) | 02-project-storage (app opens it; save conflict by hash) | `write.ts` `commitProject` → app `electron/projectFiles.cjs` `decideSave` detects the change on next save |
| Proposal record MOD-00x (status proposed) | 26-revisions-changes (Reports → Changes, engineer accepts/applies) | `editTools.ts` `proposeTool` → `withRecord` |
| Backups and change log `<folder>/.lvds-agent/backups/<file>/<id>.json`, `log.jsonl` | this module (`list_changes`, `undo_change`) | `write.ts` `commitText`, `readLog` |
| Export files `<folder>/Exports/<project>/<date>/…` and `.lvds-agent/exports.jsonl` | the engineer / other programs | `exportTools.ts` `runExport`, `safeFiles.ts` `writeNewFile` |
| Rooms package / design package / ELV loads package JSON | 30-exchange-inbox, external BIM/ELV tools | `export_rooms_package`, `export_design_package`, `export_elv_loads_package` |
| Rooms on a level in Building information | 04-building-load-assessment, 29-elv | `rooms_from_cad` → `applyRooms` |
| ELV circuits on LV boards | 07-load-schedule-panels, 06 | `elv_place_loads` → `placeElvLoads` |
| Short JSON results to an AI client / program | external | `mcp.ts` `createMcp`, `api.ts` `createApi` |

## 5. User flow — from button click to result

There is no button: the "click" is a command or a tool call.

1. User runs `lvds size "Villa" --propose` (or an AI client calls `size_circuits` with `mode: "propose"`). `cli.ts` `main` → `parseArgs` turns flags into arguments; `--propose` sets `args.mode` to the tool's commit mode (`cli.ts:182`); the first plain argument becomes `project`.
2. `toolByName` finds the tool (alias `size` → `size_circuits`); `callTool` (`tools.ts:332`) checks the arguments with the tool's zod schema (strict) and fills defaults.
3. The tool calls `edit` (`editTools.ts:53`) → `openProject` (`project.ts:82`) → `resolveProject` / `findFile` / `confine` (MCP/API: inside the projects folder only, no links) → `readFileWithin` (size ≤ 50 MB) → `parseProject` (shape check + migration in memory).
4. The tool's plan runs: `proposeTool` → in-scope circuits by `evaluateFeeder`, sorted by `supplyOrder`, each sized with `recommend(…,'fix')` / `applyRecommendation`; changed fields become `ValueChange`s → `proposal` (`newModification`, `addOp`, `transition('proposed')`).
6. Preview: returns, nothing written. Commit: `commitProject` → `withUids` → `commitText` → `writeBlocked` (recovery copy in the app? file changed since read?) → backup written exclusively → `writeAtomic` (temp, fsync, rename, read back) → log line appended → old backups pruned (50 kept).
7. The engineer opens the project in the app; the proposal is in Reports → Changes to accept and apply (one undo step).

## 6. Linked to (working connections)

- 02-project-storage: same shape check and migration on read (`parseProject`); app save detects a headless write by hash (`electron/projectFiles.cjs` `decideSave`) and headless refuses to write while the app holds a recovery copy (`writeBlocked`).
- 06 / 08 / 09 / 10 / 11: all circuit results come from `runCalculations`, `evaluateFeeder`, `recommend` — the same functions the app uses.
- 28-dashboard-readiness: `run_checks` returns the dashboard to-do list from `buildDashboard`.
- 33-quick-calcs-existing: `calc_*` use `src/calc/quick.ts`, shared with `QuickCalcs.tsx`.
- 26-revisions-changes: value changes go through `designChanges.ts` rules (field list `PROPOSABLE`, `transition`).
- 21 / 22: `rooms_from_cad` matches the app's `floorPlanActions.ts` `planState` / `putRooms` sequence.
- 29-elv, 30-exchange-inbox: same `estimateElv`, `placeElvLoads`, `decide`, `reviewPackage` as `ElvView`, `PlaceElvDialog`, `InboxView`.
- 25-reports-exports, 24-drawings-sld-sheets: HTML/PDF reports and sheet DXF are made by the app's `CATALOGUE` and `dxfFiles` (PDF/sheets in hidden Electron).
- 34-electron-desktop: `electron/main.cjs:19-20` routes `--lvds-headless-export` to `headlessExport.cjs`; `src/main.tsx:12` loads `rendererExport`.



---

*Public summary: describes what the module does and how it connects. The engineering review of open issues is kept separately.*
