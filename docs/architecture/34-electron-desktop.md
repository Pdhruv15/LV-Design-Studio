# 34 — Electron desktop (main process, preload/IPC, safe file access, engine runner, PDF render, trust)
[← Index](00-index.md) · [Integration map](99-integration-map.md)

## 1. What it does

- **Main process** = the Node.js program Electron runs behind the window (`electron/main.cjs`). It opens the window,
  shows open/save dialogs, reads and writes files, runs the Python engine and prints PDFs.
- **Preload / bridge** = a small script (`electron/preload.cjs`) that gives the page one object, `window.lvds`, with
  named functions. Each function sends a message on a named **IPC channel** (inter-process communication = a message
  from the window to the main process, e.g. `projects:save`) and waits for the answer.
- **Trust check** (`electron/trust.cjs`, `trustedHandler`): every channel answers only the app's own page, in its main
  window, top frame. Anything else is refused before work starts.
- **Project files** (`electron/projectFiles.cjs`): save with `.bak`, conflict detection by content hash, recovery copies
  (autosave), 30-day trash, the project list cache.
- **LV Database** (`electron/database.cjs`): the Excel workbooks and `Library.json`, created, read, watched and written.
- **CI guards** (`scripts/check-audit.mjs`, `check-privacy.mjs`, `check-package.mjs`, `check-manual.mjs`, allowlists in
  `security/`): dependency advisories, personal paths/e-mails, package contents, manual consistency.

## 2. Files, components, functions and stores

| File | Kind | Key functions or components | What they do |
|---|---|---|---|
| `electron/main.cjs` | main process | `readSettings`, `writeSettings`, `ensureProjectsFolder`, `createWindow`, `projectPath`, `readProject`, `initDatabase`, `runEngine`, `planOpened`, `chosenDrawings` | Window, settings (`settings.json`: projects folder, database folder, Python path), every IPC handler (48 `handle(…)` channels). |
| `electron/preload.cjs` | bridge | `contextBridge.exposeInMainWorld('lvds', …)` | `window.lvds.settings / projects / recovery / log / database / folderTemplates / engines / cadFile / files` (48 invoke channels + 2 events `database:changed`, `cad:pending`). |
| `electron/ipcValidate.cjs` | validation | `saveTextArgs`, `saveBinaryArgs`, `overwriteBinaryArgs`, `pdfArgs`, `printArgs`, `projectSaveArgs`, `recoveryArgs`, `logText`, `workbookRows`, `libraryData`, `engineRequest`, `folderTemplate`, `folderTemplateId`, `folderTemplatesExportArgs`, `ALLOWED_PERMISSIONS`, `PAGE_SIZES` | Shape and size checks of IPC payloads. |
| `electron/limits.cjs` | validation | `LIMITS`, `readFileLimited`, `readTextFileLimited`, `readJsonLimited`, `assertTextWithin`, `assertJsonWithin`, `boundedCollector` | One table of size limits (project 50 MB, workbook 20 MB, PDF HTML 64 MB, binary export 128 MB, engine request 20 MB…). |
| `electron/safeFs.cjs` | file access | `assertNotLink`, `readFileNoFollow`, `writeNewFile`, `replaceFile`, `copyFileNoFollow`, `ensureRealDir`, `listFiles`, `makePrivateTempDir` | Link-safe reads, atomic replace, private temp folders. |
| `electron/trust.cjs` | security | `devUrlFrom`, `appUrlTest`, `appOriginTest`, `senderProblem`, `trustedHandler`, `permissionRequestOk`, `permissionCheckOk`, `externalUrl` | Who may call IPC; which permissions; which links open in the system browser (https only). |
| `electron/projectFiles.cjs` | file access | `writeFileSafe`, `stampOf`, `decideSave`, `uniqueFileName`, `conflictSiblings`, `listProjectsMeta`, `metaFromProject`, `writeRecovery`, `readRecoveries`, `clearRecovery`, `moveToTrash`, `listTrash`, `restoreFromTrash`, `purgeTrash`, `bestEffort` | Project save/backup/conflict, recovery copies, trash, list cache. |
| `electron/database.cjs` | file access | `ensureDatabase`, `createWorkbook`, `readDatabase`, `readBook`, `writeBook`, `backup`, `watchDatabase`, `readLibrary`, `writeLibrary`, `folderFor`, `setFolder` | LV Database workbooks (ExcelJS) and `Library.json`. Spec of books/columns: `electron/databaseSpec.json`. |
| `electron/folderTemplates.cjs` | file access | `read`, `write`, `save`, `remove`, `setDefault`, `importText`, `exportText` | User folder templates in `folder-templates.json` (settings folder). |
| `electron/pdfRender.cjs` | report output | `pdfSession`, `htmlToPdf`, `printerList`, `htmlToPrinter`, `SHEETS`, `MICRONS` | HTML → PDF bytes in a hidden window with no scripts and no network; silent print to a listed printer, black-and-white (`color: false`). |
| `electron/engineRunner.cjs` | engine | `runJsonProcess` | Runs `engines/python/lvds_engine.py` once per request: JSON on stdin/stdout, timeout, bounded output, kill on failure. |
| `electron/cadFile.cjs` | file access | `readDrawingBytes`, `listDrawingFolder`, `engineBytes`, `readDrawingFile`, `MAX_BYTES` | DWG/DXF bytes and the WebAssembly reader for Design CAD (100 MB cap). `readDrawingFile` is used only by `tests/cadFile.test.ts`. |
| `electron/headlessExport.cjs` | headless | `run`, `finish` | `--lvds-headless-export <job> <result>`: hidden window renders DXF sheets / PDF reports for `lvds`. |
| `electron/headlessPreload.cjs` | bridge | `lvds.files.pdfBytes` | The only bridge the headless window gets. |
| `src/global.d.ts` | types | `Window.lvds`, `FolderTemplatesState` | TypeScript description of the bridge for the screens. |
| `src/util/webApp.ts` | web fallback | `isWebVersion`, `useWebApp`, `newerOffered`, `downloadProjectFile`, `chooseProjectFile`, `backupContents` | Web version: offline service worker, install prompt, project file download/upload. |
| `security/audit-allowlist.json`, `security/privacy-allowlist.json` | CI data | `advisories`, `exceptions` | Accepted advisories (one: minimatch GHSA-g3hv-75wg-m249, expires 2027-01-17); privacy exceptions (none). |
| `scripts/check-audit.mjs` | CI | `advisoriesOf`, `allowlistProblems`, `evaluate`, `npmAudit` | `npm audit` (shipped and all) against the allowlist; 92-day expiry cap. |
| `scripts/check-privacy.mjs` | CI | `scanText`, `pdfText`, `scanRepo`, `scanCommits` | Personal paths / e-mails in tracked files and commit addresses. |
| `scripts/check-package.mjs` | CI | `asarFiles`, `packageProblems`, `badNoticesIn` | Built package: no `node_modules` in app.asar, needed files present, ≤ 20 MB, English locales, licence texts. |
| `scripts/check-manual.mjs` | CI | `records`, `scalar` | Manual index / component map / visuals consistency (run inside `npm run lint`). |

## 3. Inputs — where its data comes from

| Data | From module (ID) | File + function |
|---|---|---|
| Project to save, file name, expected stamp, force | 02-project-storage | `src/model/projectStore.ts` (`bridge()`, `b.projects.save/read/stat`) |
| Recovery copies (autosave) | 02-project-storage | `src/model/projectStore.ts:194` `writeRecovery` → `recovery:write` |
| Database seeds (default cable/breaker/transformer rows) | 32-component-database | `src/database/database.ts:312` `databaseSeeds` → `src/App.tsx:372` `initDatabase` |
| Workbook rows to write | 32-component-database, 04-building-load-assessment | `src/components/docs/DatabaseView.tsx:97` `save`; `src/components/docs/BuildingView.tsx:290`; `src/components/docs/BuildingReuse.tsx:253` |
| Library.json content (title blocks, components, price lists, CAD layer templates…) | 32-component-database | `src/database/librarySync.ts` `pushLibrary` |
| Report HTML for PDF, sheet size | 25-reports-exports | `src/util/files.ts` `renderPdf`, `savePdf` |
| Text / binary exports (CSV, DXF, xlsx, docx, zip) | 25-reports-exports, 24-drawings-sld-sheets | `src/util/files.ts` `saveText`, `saveBinaryAt` |
| Sheets to plot on a printer | 23-cad-sheets-plot-titleblock | `src/util/printers.ts` `canPrint`, `src/components/docs/sheetRender.tsx:404` |
| DWG/DXF save-over bytes | 21-cad-core | `src/components/cad/CadPage.tsx:915` `writeCopy` |
| Drawing paths to read (incl. xref paths found inside a drawing) | 21-cad-core | `src/engines/cad/cadEngine.ts:230-279`, `src/components/cad/CadRefs.tsx:164` `lookFor`, `src/model/cadRefs.ts:122` `xrefCandidates` |
| Engine request (project, OpenDSS script, cable data) | 16-load-flow-engines | `src/engines/external.ts` `engineRequest`, `pythonEngine.run` |
| Error log text | 01-app-shell | `src/util/errorLog.ts:46` `logError` |
| Export job (sheets DXF / report PDF) | 31-headless-cli-mcp | `src/headless/electronExport.ts:72` `runInRenderer` (writes `job.json`) |

## 4. Outputs — where its results go

| Result | Used by module (ID) | File + function |
|---|---|---|
| Project + file stamp, save result / conflict | 02-project-storage | `src/model/projectStore.ts:78` (`loadProjectStamped`), conflict dialog |
| Projects list (dashboard meta) | 28-dashboard-readiness, 02-project-storage | `projectFiles.listProjectsMeta` → `projects:list` |
| Recovery copies, newest first, `fileChangedSince` | 02-project-storage, 01-app-shell | `readRecoveries` → `src/App.tsx:1225` banner |
| Raw database (`books`, `readAt`, `created`) and `database:changed` | 32-component-database | `src/App.tsx:372-381` `receiveDatabase` → `parseDatabase`, `syncLibrary` |
| Library.json → localStorage | 32-component-database, 23-cad-sheets-plot-titleblock | `src/database/librarySync.ts` `pullLibrary` |
| PDF bytes | 25-reports-exports | `src/util/files.ts:99` `renderPdf` (merged/finished with pdf-lib) |
| Saved path messages | many screens | `src/util/files.ts` `saveText`, `saveBinaryAt`, `savePdf` |
| Printer list, print result | 23-cad-sheets-plot-titleblock | `src/util/printers.ts`, `src/components/docs/OutputDialogs.tsx:175` |
| DWG/DXF bytes, WebAssembly engine, folder listings, pending "Open with" plans | 21-cad-core | `src/engines/cad/cadEngine.ts`, `src/App.tsx:389` (`takePending`), `CadPage.tsx:379/1283` |
| Engine results / probe | 16-load-flow-engines | `src/engines/external.ts` `probeEngines`, `pythonEngine.run`; `src/components/EngineCompare.tsx` |
| Headless result files (base64) | 31-headless-cli-mcp | `src/headless/electronExport.ts:87-91` |

## 5. User flow — from button click to result

Example A, **Save project** (desktop):
1. The screen calls `saveProjectFile` in `src/model/projectStore.ts`, which calls `window.lvds.projects.save(file, data, expected, force)`.
2. `electron/preload.cjs` sends `projects:save`.
3. `trust.trustedHandler` checks the sender (`senderProblem`): main window, top frame, app page.
4. `check.projectSaveArgs` checks it is a project (boards + feeders arrays) and ≤ 50 MB.
5. `projectPath` makes sure the name is a plain `.json` inside the projects folder and not a link.
7. `projectFiles.writeFileSafe`: new temp file → `.bak` copy → rename → read back and compare hash → returns the new stamp.

Example B, **Export PDF report**:
1. Report screen calls `savePdf` (`src/util/files.ts:139`).
2. `renderPdf` → `window.lvds.files.pdfBytes` → `files:pdfBytes` → `check.pdfArgs` → `pdfRender.htmlToPdf` (hidden window, no JS, no network, private temp folder).
3. pdf-lib adds frame, bookmarks, metadata in the renderer.
4. `saveBinary` → `files:saveBinary` → save dialog → `fs.writeFileSync` to the chosen path.

Example C, **Run OpenDSS / pandapower**:
1. `EngineCompare` → `pythonEngine.run` (`src/engines/external.ts`) → `engines:run`.
2. `check.engineRequest` → `runEngine` → `engineRunner.runJsonProcess` (Python from settings, 120 s timeout, 50 MB output cap).
3. JSON answer or `{ error }` back to the screen.

Example D, **Open a DWG from Explorer/Finder while the app is closed**: `app.on('open-file')` (macOS) or `process.argv`
(Windows) → `pendingPlans` → the page asks `cad:takePending` (`src/App.tsx:389`) → `cadFile.readDrawingBytes`.

## 6. Linked to (working connections)

- 02-project-storage: open/save/stat/conflict, recovery copies, trash, project list — all through `projectFiles.cjs`; web fallback in `projectStore.ts` (browser storage).
- 32-component-database: workbooks created, read, watched (`database:changed`), written with a backup in `Backups/` (20 kept); `Library.json` read/write.
- 25-reports-exports: PDF bytes, text/binary exports; web fallback = print dialog / browser download (`src/util/files.ts`).
- 23-cad-sheets-plot-titleblock: printers and silent print (black-and-white).
- 21-cad-core: WebAssembly engine bytes, open/read/stat drawings, block-library folders, Save over a drawing chosen with Save As this session.
- 16-load-flow-engines: Python engine run/probe; web fallback returns a plain error message.
- 31-headless-cli-mcp: headless DXF / PDF export through the same renderer code and `htmlToPdf`.
- CI: `check-audit`, `check-privacy` and `check-package` run in `.github/workflows/ci.yml` (lines 29, 35, 84); `check-manual` runs in `npm run lint`.



---

*Public summary: describes what the module does and how it connects. The engineering review of open issues is kept separately.*
