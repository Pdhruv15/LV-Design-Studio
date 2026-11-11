# 28 — Project dashboard, projects dashboard and readiness
[← Index](00-index.md) · [Integration map](99-integration-map.md)

## 1. What it does

This module is the "front page" of the app. It has four parts:

3. **Readiness** — a design-stage checklist (Concept → Schematic → Detailed → Tender → IFC) and six readiness stages (Setup, Design, Calculate, Resolve issues, Drawings, Save and issue). Everything is worked out from the current inputs each time; nothing is stored as an approval flag (`src/calc/projectReadiness.ts`, comment on line 14).

Plain-language terms used below:
- **Run** (`CalcRun`) = one press of Run (F5): the cable/breaker/VD checks, earth fault loop and discrimination results, together with a frozen copy of the project they were computed from.
- **Live** = computed again from the project on every screen refresh, without pressing Run (load sums, transformer loading, generator, PFC, UPS, PV, busbar risers).
- **Scope** = the job's brief: which systems are part of this job (`src/model/brief.ts`). **Stage** = the design stage the project is at (`src/model/designStage.ts`).

### Which studies the dashboard / readiness check

**Checked (items that can appear in To do):**

| # | Check | Source function | Live or from Run | Link (`go.view`) |
|---|---|---|---|---|
| 5 | Discrimination between breaker pairs (not / partly selective) | `run.selectivity` from `evaluateSelectivity` | Run | `coordination` |
| 6 | Life-safety circuit not on fire-rated cable | `fireRatingIssues` (`src/model/cableTypes.ts:64`) | live | `design` + feeder |
| 7 | Transformer loading vs project limit | own calc in `buildDashboard` (`dashboard.ts:76-80`) | live | `sizing` |
| 8 | Breaker Icu below transformer LV fault level | `sizeTransformers(...).checks.icuOk` (`src/calc/txGen.ts:101`) | live | `sizing` |
| 10 | Main board PF below target with **no** capacitor bank | `planPfc` (`src/calc/pfc.ts`) | live | `pfc` |
| 11 | Board designed far below its rooms' expected load | `dbChecks` (`src/calc/building.ts:163`) | live | `load-schedule` + board |
| 12 | Board busbar Icw below fault level | `busbarIcwChecks` (`src/calc/busbarIcw.ts:16`) | live | `design` + board |
| 13 | Busway riser above data / Icw below fault level | `sizeRiser` (`src/calc/busbar.ts`) | live | `busbar` |
| 14 | UPS: rating, battery string, runtime, DC breaker, BMS, surge, leading kvar, recharge | `sizeUps` (`src/calc/ups.ts`) | live | `ups` |
| 15 | Calculation inputs out of range (voltage, PF, kW, cores, Icu…) | `projectInputIssues` (`src/model/projectValidate.ts:43`) | live | `sizing` / `design` / none |
| 16 | Ambient outside derating table | `ambientCheck` (`src/calc/cableTable.ts:112`) | live | none |
| 17 | Strict cable data / reference values | `cableDataFindings` (`cableTable.ts:208`) | live | `database` |
| 18 | Ground temperature / soil resistivity for buried cables | `groundChecks` (`src/calc/installation.ts:67`) | live | none |
| 19 | Main board without transformer kVA / %Z / supply fault level | inline (`dashboard.ts:209`) | live | `sizing` |
| 20 | References to deleted panels / circuits | `checkReferences` (`src/model/integrity.ts`) | live | from the reference, often none |
| 21 | Solar PV design status | `sizePv` (`src/calc/solar.ts:148`) | live | `solar` |
| 22 | Drawing set sheet / title-block checks | `sheetChecks` (`src/model/drawingSet.ts:571`) | live | `drawings` |
| 23 | Submission-form fields (owner, plot, consultant, area) | inline (`dashboard.ts:217`) | live | none |
| 24 | Critical / re-review review comments (readiness only, not in To do) | `reviewSummary` (`src/model/reviewComments.ts`) | live | stage go `dashboard` |

## 2. Files, components, functions and stores

| File | Kind | Key functions or components | What they do |
|---|---|---|---|
| `src/calc/dashboard.ts` | calc | `buildDashboard` (:68), types `Dashboard`, `TodoItem`, `DashTransformer`, `DashBar`; `lengthText` (:240), `sizesText` (:243) | Builds every number and the To do list from the live project plus the last `CalcRun`. |
| `src/calc/projectReadiness.ts` | calc | `projectReadiness` (:22), `stageChecklist` (:50), `splitTodo` (:17), types `ReadinessStage`, `StageCard`, `StageCheck`; constants `CALC_SCOPE` (:12), `MAIN_KINDS` (:46), `STAGE_ORDER` (:94) | Six readiness stages, the per-design-stage checklist, and the scope split of To do. |
| `src/calc/statusText.ts` | calc | `STATUS_TEXT`, `REPORT_STATUS_TEXT`, `statusText`, `statusOfText`, `CALC_DISCLAIMER` | Fixed wording of results (used by 19 screens/reports). |
| `src/components/docs/ProjectDashboard.tsx` | screen | `ProjectDashboard` (default), `Tile` (:20), `Bars` (:31), `exportPdf` (:81) | Overview screen; stage cards, brief/deliverables, tiles, breakdowns, To do (scope + stage split). |
| `src/components/ProjectsDashboard.tsx` | screen | `ProjectsDashboard` (default), `Th` (:59) | Home screen with the project list. |
| `src/components/SystemSummaryCards.tsx` | screen | `SystemSummaryCards` (default) | System summary gauge and bus-voltage table shown under the SLD (results tabs). |
| `src/model/projectList.ts` | model | `filterProjects` (:30), `sortProjects` (:41), `facets` (:62), `matchesText` (:23), `detailsOf` (:85), `applyDetails` (:104), `parseTags` (:93), `withArchived` (:119) | Search / filter / sort of `ProjectMeta`, and the "Details" edit of name, status, client, tags, notes. |
| `src/model/designStage.ts` | model (shared with 03) | `splitByStage` (:51), `viewStage` (:47), `VIEW_STAGE` (:39), `stageOf`, `advanceStage` | Which To-do item belongs to which design stage. |
| `src/model/brief.ts` | model (shared with 03) | `viewInScope` (:157), `VIEW_SCOPE` (:150), `inScope`, `deliverableProgress` | Which To-do item belongs to the job's scope. |
| `src/App.tsx` | screen (shell) | `view === 'dashboard'` block (:1601-1619), `view === 'projects'` block (:1666-1688), `openProject` (:759), `issueStage` (:409), `stepBack` (:420), `setFileStatus` (:835), `patchProjectFile` (:813) | Wires the two dashboards into the app; `onGo` handler (:1614) opens the target screen, selecting a board or feeder. |

## 3. Inputs — where its data comes from

| Data | From module (ID) | File + function |
|---|---|---|
| Boards, feeders, demand totals | 06-network-sld-editor | `src/calc/summary.ts` `systemSummary`, `boardTotals`, `boardsInSupplyOrder`; `src/calc/sizing.ts` `boardDemandKva` |
| Circuit check results (VD, Iz, In, Icu) | 08-voltage-drop, 11-breaker-cable-selection | `src/calc/electrical.ts` `evaluateProject` (via `CalcRun.results`) |
| Earth fault loop results | 09-earthing | `src/calc/earthing.ts` `evaluateEarthingAll` (via `CalcRun.earthing`) |
| Discrimination results | 10-protection-coordination | `src/calc/protection.ts` `evaluateSelectivity` (via `CalcRun.selectivity`) |
| Transformer / generator sizing | 12-transformer-generator | `src/calc/txGen.ts` `sizeTransformers`, `sizeGeneratorByBoards` |
| PFC plan | 13-power-factor-correction | `src/calc/pfc.ts` `planPfc` |
| Busway risers, busbar Icw | 14-busbar | `src/calc/busbar.ts` `sizeRiser`; `src/calc/busbarIcw.ts` `busbarIcwChecks` |
| UPS, PV | 15-ups-solar | `src/calc/ups.ts` `sizeUps`; `src/calc/solar.ts` `sizePv` |
| Building GFA, levels, DB vs room load | 04-building-load-assessment | `src/calc/building.ts` `summarizeBuilding`, `dbChecks` |
| Space-plan areas (area fallback) | 05-space-planning | `project.spacePlan.areas` read in `buildDashboard` (:101) |
| Cable data, ambient, ground conditions | 11-breaker-cable-selection | `src/calc/cableTable.ts` `ambientCheck`, `cableDataFindings`; `src/calc/installation.ts` `groundChecks` |
| Input validation, references | 02-project-storage | `src/model/projectValidate.ts` `projectInputIssues`; `src/model/integrity.ts` `checkReferences` |
| Fire-rated cable rule | 19-cable-tray-containment / 11 | `src/model/cableTypes.ts` `fireRatingIssues` |
| Drawing set checks | 24-drawings-sld-sheets | `src/model/drawingSet.ts` `sheetChecks` |
| Revisions, change since revision | 26-revisions-changes | `src/model/revisions.ts` `currentRevision`, `changedSinceRevision`, `revisionStamp`; `src/model/proposalStatus.ts` `proposalOutstanding` |
| Review comments, tender queries, submissions | 27-review-submissions-authority | `src/model/reviewComments.ts` `reviewSummary`, `openTenderQueries`; `src/model/submissions.ts` `submissionCounts`, `isOverdue` |
| Scope, deliverables, design stage | 03-parameters-rules | `src/model/brief.ts` `viewInScope`, `deliverableProgress`; `src/model/designStage.ts` `splitByStage`, `stageOf`, `gateOf` |
| Project settings (limits) | 03-parameters-rules | `settingsOf` (`src/types.ts`) `transformerMaxLoadingPct` |
| Project file list, trash, recent | 02-project-storage | `src/model/projectStore.ts` `ProjectMeta`, `TrashedProject`, `whenText` |

## 4. Outputs — where its results go

| Result | Used by module (ID) | File + function |
|---|---|---|
| Overview screen | 01-app-shell | `src/App.tsx:1601` `ProjectDashboard` |
| Project summary PDF (Overview button) | 25-reports-exports | `ProjectDashboard.exportPdf` → `src/util/files.ts` `savePdf` |
| Project summary PDF in Export centre | 25-reports-exports | `src/components/docs/exportCatalogue.ts:184` |
| Project summary as first part of the issue package | 25-reports-exports | `src/components/docs/StudyReportsView.tsx:212` |
| To-do findings in the review report | 27-review-submissions-authority | `src/components/docs/ReviewView.tsx:39` `doc` |
| "Designed so far" demand on the load assessment | 04-building-load-assessment | `src/components/docs/LoadAssessmentView.tsx:41` |
| `project_summary`, `run_checks` tools | 31-headless-cli-mcp | `src/headless/tools.ts:98`, `:166` |
| Status wording | 25, 19, 06, 07 … (19 files) | `STATUS_TEXT` / `REPORT_STATUS_TEXT` importers, e.g. `src/docs/compliance.ts`, `src/docs/calcReport.ts`, `src/components/ResultsTable.tsx` |
| Project status / details / archive written to a file | 02-project-storage | `App.tsx` `setFileStatus`, `archiveFile`, `openDetails` → `patchProjectFile` |

## 5. User flow — from button click to result

**Projects (home)**
1. Opening the app or clicking "Projects" in the breadcrumb sets `view = 'projects'` (`App.tsx:1203`); `ProjectsDashboard` renders `list` sorted by `sortProjects(filterProjects(list, f), sort)`.
2. Typing in search / picking a filter calls `set(...)` → `filterProjects` / `matchesText` (`projectList.ts:23-38`).
3. Clicking a card or name calls `onOpen(file)` → `openProject` (`App.tsx:759`): the same, unsaved-free file goes straight to `dashboard`; otherwise `guard` asks about unsaved changes, `loadProjectStamped` → `loadIntoApp` → `setView('dashboard')` (`App.tsx:737`) and a fresh `runCalculations` (`App.tsx:726`).
4. Changing the status drop-down calls `onStatus` → `setFileStatus` → `patchProjectFile` (writes the file now, or marks the open project changed).

**Overview**
2. `stageChecklist` → `projectReadiness` build the stage cards (`:74`); `splitTodo` (scope) then `splitByStage` (stage) split To do into counted / later / outside (`:75-76`).
4. Clicking a To-do line or a tile calls `onGo(go)` (`App.tsx:1614`): with `feederId` → `design` + `selectFeeder`; with `boardId` → `setActiveBoardId`; then `setView(go.view)`.
5. Clicking a stage check calls `onOpen(x.go)` (`settings` opens the settings dialog; `dashboard` scrolls to To do).
6. "Issue … → next stage" calls `issueStage` (`App.tsx:409`) → `advanceStage` records a revision and moves the stage.
7. "1-page PDF summary" calls `exportPdf` → `buildDashboardHtml(project, d)` → `savePdf` (A4 landscape).

## 6. Linked to (working connections)

- 06-network-sld-editor: demand, PF and transformer kVA from `systemSummary` (same function as the SLD summary card — headline MD agrees with the SLD).
- 08 / 11 / 09 / 10: study tallies and To-do items read straight from the `CalcRun` arrays — not recomputed.
- 12, 13, 14, 15: live calls to the study functions `sizeTransformers`, `sizeGeneratorByBoards`, `planPfc`, `sizeRiser`, `busbarIcwChecks`, `sizeUps`, `sizePv` (the study code, not a copy).
- 24: drawing-set checks via `sheetChecks`; readiness "Drawings" stage.
- 26: revision label, "changed since revision", modifications card and To do; stage issue creates a revision.
- 27: review comments block "Resolve issues"; submissions card; tender queries in the Tender stage.
- 31: headless tools reuse `buildDashboard`.
- 02: project list metadata, archive, trash, details edit.



---

*Public summary: describes what the module does and how it connects. The engineering review of open issues is kept separately.*
