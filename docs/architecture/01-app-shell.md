# 01 — App shell
[← Index](00-index.md) · [Integration map](99-integration-map.md)

## 1. What it does

The app shell is the frame every screen sits in. It:

- keeps the **open project in memory** with undo / redo (`App` in `src/App.tsx`, through `useHistory`). "In memory" means the copy the app works on while it runs; it is written to disk only by Save or by the recovery copy;
- decides **which screen is shown** (the `view` state, one of the 44 names in `MainView`, `src/views.ts`) and keeps the **ribbon** (the tab bar of tool buttons at the top, `src/components/Ribbon.tsx`) on the matching tab;

Other modules own the screens themselves; this document only covers how the shell routes to them and what it passes in.

## 2. Files, components, functions and stores

| File | Kind | Key functions or components | What they do |
|---|---|---|---|
| `src/main.tsx` | screen (entry) | top-level script | `?lvds-export` → headless renderer (`src/headless/rendererExport`); otherwise `watchForErrors`, `loadPrefs` → `applyTheme` / `applyPalette`, renders `<ErrorBoundary level="app"><App/>` |
| `src/App.tsx` | screen + store | `App`, `normalised`, `setView`, `commands`, `runNow`, `loadIntoApp`, `saveProject`, `guard`, `pickBoard`, keyboard `onKey` effect (`:1081`) | The whole shell: ~100 `useState` values, the routing chain (`:1350`–`:1697`), all dialogs, the ribbon wiring (`:1243`–`:1335`) |
| `src/components/Ribbon.tsx` | screen | `Ribbon`, `RibbonActions`, `TAB_VIEWS`, `TAB_PAGE`, `HOME_TAB`, `tabForView`, `viewForTab`, `tabForStage`, `CAD_TABS`, `STAGE_TABS` | Ribbon tabs (Project, Load schedule, SLD, Design CAD, Stages 1–4, Documents, BOM / Cost, Standards) and which screens belong to which tab |
| `src/components/CommandPalette.tsx` | screen | `CommandPalette`, `filterCommands`, `SHORTCUTS`, `ShortcutHelp` | ⌘K search over boards, sheets, pages, commands; the shortcut list (also shown in Help) |
| `src/components/MenuButton.tsx` | screen | `MenuButton` | Drop-down button used on the SLD command bar (+ Add, feeder menu) |
| `src/components/PreferencesDialog.tsx` | screen | `PreferencesDialog` | My details, New project defaults, Appearance & saving (theme, palette, CAD labels, recovery interval) |
| `src/model/profile.ts` (shell use only) | store | `loadPrefs`, `savePrefs` (`localStorage['lvds.preferences']`), `applyDefaults`, `applyProfile` | Where preferences live; owned by 03 |
| `src/components/WhatsNewDialog.tsx` | screen | `WhatsNewDialog` | What's new window with "Open …" buttons |
| `src/model/whatsNew.ts` | model + store | `RELEASES`, `compareVersions`, `unseenReleases`, `pendingReleases`, `markSeen` (`localStorage['lvds.whatsNewSeen']`) | Release notes and "seen" bookkeeping |
| `src/model/appVersion.ts` | model | `displayVersion` | "2.83.0" → "2.083"; used by `vite.config.ts` to define `__APP_VERSION__` |
| `src/components/WebBanner.tsx` | screen | `WebBanner` | Web-version strip: install, offline ready, new version → reload, desktop download |
| `src/util/webApp.ts` | util | `isWebVersion`, `useWebApp`, `newerOffered`, `isLaterVersion`, `downloadProjectFile`, `chooseProjectFile`, `backupContents` | Service worker, install prompt, browser file open / download |
| `src/util/errorLog.ts` | store | `logError`, `readErrorLog`, `errorLogText`, `watchForErrors` (`localStorage['lvds.errorLog']`, last 30; desktop also `logs/errors.log` via `window.lvds.log.error`) | Error log |
| `src/components/HelpView.tsx` | screen | `HelpView`, `Checklist`, `ErrorLogNote` | Help page: workflow, start-here checklist, quick paths, shortcuts, Copy error log |
| `src/help/guide.ts` | model | `WORKFLOW`, `QUICK_PATHS`, `startChecklist`, `PHASE_LABEL` | Help content; checklist ticks itself from the project and `run` |
| `src/theme/theme.ts`, `src/theme/tokens.css` | util | `applyTheme`, `applyPalette`, `resolveTheme`, `THEME_LABEL`, `PALETTE_LABEL` | Screen colours only (Graphite / Blueprint, dark / light / system) |
| `src/model/history.ts`, `src/model/unsaved.ts` (shell use) | store | `useHistory`, `useUnsaved` | Undo (100 steps, edits within 600 ms merge) and the unsaved-changes flag (owned by 02) |

## 3. Inputs — where its data comes from

| Data | From module (ID) | File + function |
|---|---|---|
| Project opened / saved / recovered | 02-project-storage | `src/model/projectStore.ts` `loadProjectStamped`, `saveProjectFile`, `readRecoveries`, `writeRecovery`; `src/model/projectMigrate.ts` `migrateProject`; `src/model/projectValidate.ts` `checkProjectShape` (called in `App.loadIntoApp`) |
| Start-up project (sample) | 02-project-storage | `src/data/sampleProject.ts` `sampleProject` → `App` `useState(() => normalised(sampleProject))` (`App.tsx:207`) |
| Preferences, profile, new-project defaults | 03-parameters-rules | `src/model/profile.ts` `loadPrefs` (`App.tsx` `useState(loadPrefs)`), `applyDefaults` in `App.createProject` |
| Design stage, tender route | 03-parameters-rules | `src/model/designStage.ts` `stageOf`, `nextStage`, `advanceStage`, `stepBackStage` (`App.issueStage`, `App.stepBack`) |
| Feeder results, earthing, selectivity of a run | 06-network-sld-editor (with 09, 10) | `src/calc/runs.ts` `runCalculations` → `evaluateProject` (`src/calc/electrical.ts`), `evaluateEarthingAll`, `evaluateSelectivity` |
| Generator / transformer-outage scenario | 12-transformer-generator | `src/calc/scenario.ts` `generatorScenario`, `transformerOutage` → `evaluateProject` (`App.tsx:481`, live, not on demand) |
| External engine results | 16-load-flow-engines | `src/engines` `EXTERNAL_ENGINES[].run` (`App.runSimulation`) |
| Database (Excel workbooks) | 32-component-database | `window.lvds.database.init/read/onChange` → `App.receiveDatabase` → `parseDatabase`, `applyDatabase`, `syncLibrary` |
| CAD drawing state | 21-cad-core | `src/components/cad/cadState.ts` `useCad` (`cadS`), `rememberedDrawing`; `src/engines/cad/cadEngine.ts` `chooseDrawing`, `openDrawing` |
| Sheet set, sheet markup UI | 23-cad-sheets-plot-titleblock / 24-drawings-sld-sheets | `src/model/drawingSet.ts` `setOf`, `publishState`, `earthSheetFor`; `src/components/sld/sheetUi.ts` `useSheetUi` |
| "Record as submission" offer | 27-review-submissions-authority | `src/model/submissions.ts` `onSubmissionOffer`, `draftFromOffer` |
| ELV packages for the inbox | 29-elv / 30-exchange-inbox | `ElvView onSend`, `InboxView onOpen` → `App` `inbox` state (`App.tsx:338`) |
| Desktop bridge (files, settings, logs, pending CAD file) | 34-electron-desktop | `window.lvds` (`electron/preload.cjs`); `hasBridge`, `hasDatabase` (`App.tsx`) |
| Headless export window | 31-headless-cli-mcp | `src/main.tsx` `?lvds-export` → `src/headless/rendererExport.install` |

## 4. Outputs — where its results go

- `run` = `runCalculations(project)` — set at start (on the sample), on every `loadIntoApp`, on Run / F5 (`runNow`), and on every edit when `project.calc.autoRun` is on (effect at `:441`).
- `allResults` = `run.results` with each result's `feeder` replaced by the **live** feeder of the same id (`:453`).

| Result | Used by module (ID) | File + function |
|---|---|---|
| Screen routing (`view === …`) | all screen modules (table below) | `App.tsx:1350`–`:1697` |
| `calcProject` | 09-earthing | `EarthingStudy project={calcProject} focus` (`:1581`) |
| `calcProject` | 10-protection-coordination | `CoordinationStudy`, `DiscriminationPanel`, `chain` (`discriminationChain`) |
| `calcProject`, `allResults`, `annotations`, `run` | 24-drawings-sld-sheets | `CadSheets` (`:1587`) |
| `allResults` (run numbers on live feeders) | 06 / 07 | `SidePanel results={boardResults}`, `ResultsTable` |
| `calcProject` | 19-cable-tray-containment | `CableScheduleView` (`:1626`) |
| live `project` + `allResults` | 20-equipment-boq-pricing | `BomView command results` (`:1692`) |
| `run` | 26-revisions-changes | `ChangesView run` (`:1664`) |
| `run` | 21-cad-core | `CadPage run` (`:1621`), `OutputDialogs run` (23) |
| Stage gate revision | 26-revisions-changes | `App.issueStage` → `advanceStage`, `autoCheckpoint` |
| Concept report PDF | 04-building-load-assessment / 25 | Ribbon `onConceptReport` → `src/docs/conceptReport.ts` `buildConceptReportHtml` → `savePdf` |
| OpenDSS script | 16-load-flow-engines | `App.exportOpenDss` → `exportDss` |

### Routing: every `MainView` and its screen

| `MainView` | Screen (component) | Owner | Ribbon tab (`TAB_VIEWS`) | ⌘K | Notes |
|---|---|---|---|---|---|
| projects | `ProjectsDashboard` | 28 | home | no | Start screen; ribbon hidden (`home`) |
| help | `HelpView` | 01 | home | yes | |
| parameters | `ParametersView` | 03 | home | yes | |
| titleblock | `TitleBlockDesigner` | 23 | home | yes | |
| dashboard | `ProjectDashboard` | 28 | home, concept | yes | Every project opens here (`loadIntoApp`) |
| building | `BuildingView` | 04 | home, concept | yes | |
| load-assessment | `LoadAssessmentView` | 04 | concept | yes | |
| design | SLD workspace (`SystemDiagram`, `BoardSheetView`, `RiserView`, `EarthingView embedded`) | 06 | sld, home, schematic | yes | Renders only when a board exists |
| cad | `CadPage` | 21 | cad | yes | |
| space-planning | `SpacePlanView` | 05 | concept | yes | |
| substation-area | `SubstationAreaView` | 05 | concept | yes | |
| enclosure | `EnclosureSizing` | 17 | schedule, sld | yes | |
| earth-schematic | `EarthingView` | 09 | schematic | yes | |
| panels | `PanelsPage` | 07 | sld, schematic | yes | |
| load-schedule | `LoadScheduleView` | 07 | schedule, reports | yes | Renders only when a board exists |
| calculators | `QuickCalcs` | 33 | sld (More) | yes | |
| pfc | `PfcStudy` | 13 | schematic | yes | |
| busbar | `BusbarStudy` | 14 | schematic | yes | |
| ups | `UpsStudy` | 15 | schematic | yes | |
| solar | `SolarStudy` | 15 | schematic | yes | |
| engines | `EngineCompare` | 16 | sld (More) | yes | |
| drawings | `CadSheets` | 24 / 23 | cad | yes | |
| cable-tray | `TrayScheduleView` | 19 | reports | yes | |
| study-reports | `StudyReportsView` | 25 | reports | yes | |
| boq | `BomView` | 20 | cost | yes | Reached through `onBom` commands |
| export-centre | `ExportCentre` | 25 | reports | no | |
| revisions | `RevisionsView` + `CheckpointsPanel` | 26 | issue | yes | |
| modifications | `ChangesView` | 26 | issue | yes | |
| review | `ReviewView` | 27 | issue | yes | |
| received-docs | `ReceivedDocsView` | 27 | issue | yes | |
| submissions | `SubmissionsView` | 27 | issue | yes | |
| database | `DatabaseView` | 32 | standards | yes | |
| design-references | `DesignReferencesView` | 27 | standards | yes | |
| elv | `ElvView` | 29 | schematic | yes | |
| inbox | `InboxView` | 30 | schematic | yes | |

## 5. User flow — from button click to result

**Start-up**
1. `src/main.tsx` checks `?lvds-export`; otherwise `watchForErrors()`, `loadPrefs()` → `applyTheme` / `applyPalette`, renders `App` inside `ErrorBoundary level="app"`.
2. `App` loads `normalised(sampleProject)` into `useHistory`, runs `runCalculations` on it, reads `pendingReleases(__APP_VERSION__)` (What's new) and starts on `view = 'projects'`.
3. Effects: `refreshList`, `readRecoveries` (recovery bar), `window.lvds.settings.get` (projects folder), `initDatabase` → `receiveDatabase`, `cadFile.takePending` (a drawing opened from Finder / Explorer).

**Open a project**
1. Projects page `onOpen` → `App.openProject` → `guard` (asks about unsaved changes via `UnsavedDialog`).
2. `loadProjectStamped` → `App.loadIntoApp`: `checkProjectShape`, `normalised`, `history.load`, `cadS.projectOpened`, `setRun(runCalculations(opened))`, merge presets, `setView('dashboard')`.
3. `useEffect([project.id])` sets the ribbon tab of the design stage (`tabForStage`).

**Navigate**
1. A ribbon button calls `a.onView(v)` → `App.setView` → `setViewState(v)` and `setRibbonTab(tabForView(v, tab))`.
2. A ribbon tab click → `onTab` → `viewForTab(t, view)` (stays on the page if it belongs to the tab, else `TAB_PAGE[t]`).
3. The routing chain renders the matching screen inside `ErrorBoundary level="page"` and `Suspense` (page code loads on first use, `lazyPage`).

**Run the studies**

**⌘K palette**
1. `onKey` (⌘K, not on Projects) → `setPaletteOpen`.
2. `CommandPalette commands={commands()}` → `filterCommands` → `run()`.

## 6. Linked to (working connections)

- 03-parameters-rules: preferences and defaults (`PreferencesDialog`, `applyDefaults`, `applyProfile`), stage gate (`issueStage`, `stepBack`), project settings dialog (`ProjectSettings onSave` re-sizes schedule circuits with `refreshBoard`).
- 06-network-sld-editor: SLD workspace, panel tree, board / feeder forms, drag-and-drop (`dropItem`, `moveItem`), copy / paste board, delete.
- 16-load-flow-engines: external engine run and comparison (`runSimulation`, `resultsNote`).
- 21-cad-core: `useCad` state survives page changes; ribbon CAD tools run on the CAD page through `cadDo`.
- 23 / 24: sheet tabs and markup tools on the ribbon (`sheetRibbon`), Output dialogs (`OutputDialogs`).
- 27: submission offer bar after a PDF (`onSubmissionOffer`).
- 28: dashboard to-do items navigate with `onGo` (board, feeder, view).
- 32: database sync on start and on every Excel save (`receiveDatabase`).
- 34: desktop bridge; `will-prevent-unload` in `electron/main.cjs` shows the unsaved-changes question raised by `App`'s `beforeunload`.



---

*Public summary: describes what the module does and how it connects. The engineering review of open issues is kept separately.*
