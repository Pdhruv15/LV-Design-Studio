# 02 — Project storage (data model, open/save, autosave, backups, migration, validation, undo, project folders)
[← Index](00-index.md) · [Integration map](99-integration-map.md)

## 1. What it does

This module is the "filing cabinet" of the app. It defines what a project *is* (the `Project` type in `src/types.ts`:
panels, circuits and about 100 optional sections) and keeps that project safe:

- **Store** = the place the app keeps the open project in memory. Here it is a React state with undo/redo
  (`useHistory` in `src/model/history.ts`), created in `App` (`src/App.tsx:208`).
- **Open / save**: one JSON file per project in the projects folder (desktop, via the Electron main process,
  `electron/main.cjs` + `electron/projectFiles.cjs`), or the browser's own storage (`localStorage`) in the web version
  (`src/model/projectStore.ts`).
- **Migration** = bringing an older file up to the current file format (`migrateProject`, `CURRENT_SCHEMA = 3`).
  A file from a *newer* app opens read-only.
- **Trash** (30 days), **portable backup** (`.lvds-backup` zip with checkpoints and SHA-256 checks), **project list**
  (search, filter, archive, details), **anonymized sample** export, and **project folder templates** (model only so far).

## 2. Files, components, functions and stores

| File | Kind | Key functions or components | What they do |
|---|---|---|---|
| `src/types.ts:503` | model | `Project`, `ProjectStatus`, `Board`, `Feeder` | The project data model. Only `name`, `voltageV`, `frequencyHz`, `ambientC`, `vdLimitPct`, `boards`, `feeders`, `updatedAt` are required; everything else is optional. |
| `src/model/projectStore.ts` | store | `listProjects`, `loadProjectStamped`, `saveProjectFile`, `deleteProjectFile`, `listTrash`, `restoreProject`, `emptyTrash`, `writeRecovery`, `readRecoveries`, `clearRecovery`, `keepUnsavedWork`, `touchRecent`, `pickProject`, `metaOf` | One API for desktop (calls `window.lvds.projects.*`) and browser (`localStorage` keys `lvds.projects`, `lvds.project.<file>`, `lvds.trash`, `lvds.recovery.<id>`, `lvds.recent`). |
| `src/model/projectValidate.ts` | model | `checkProjectShape`, `ProjectFileError`, `projectInputIssues` | Refuses a file without boards/feeders/ids; lists impossible engineering inputs (V, Hz, VD %, kW, pf, mm², A, kA, cores, load items). |
| `src/model/saveSafety.ts` | model | `FileStamp`, `SaveOutcome`, `projectFingerprint`, `diffSections` | Content hash for "unsaved?" and the section-by-section diff shown in a conflict. |
| `src/model/unsaved.ts` | store | `useUnsaved` | "Unsaved" = content differs from last saved (fingerprint, 300 ms after the last edit). |
| `src/model/history.ts` | store | `useHistory`, `record`, `undo`, `redo`, `reset`, `MAX_STEPS = 100` | Undo/redo of whole-project snapshots; edits within 600 ms merge into one step; `patch` changes without an undo step. |
| `src/model/stableIds.ts` | model | `withUids` | Permanent `uid` on every board and circuit (survives rename); derived (deterministic) on open, random on copy. |
| `src/model/edit.ts` | model | `boardAndDescendants`, `deleteBoard` | Deletes a panel, everything below it and its incomer, then `removeDanglingReferences`. |
| `src/model/projectBackup.ts` | model | `buildBackup`, `readBackup`, `readBackupFile`, `checkpointsFor` | `.lvds-backup` zip: project + checkpoints + manifest with SHA-256; zip-bomb limits (200 MB zip, 512 MB unpacked, 500 files, ratio 100). |
| `src/model/checkpoints.ts` | store | `newCheckpoint`, `saveCheckpoint`, `restoredFrom`, `autoCheckpoint`, `idbStore` | Named safety copies in IndexedDB `lvds-checkpoints` (this computer only). Owned by 26-revisions-changes; used here by backups. |
| `src/model/projectList.ts` | model | `filterProjects`, `sortProjects`, `facets`, `detailsOf`, `applyDetails`, `parseTags`, `withArchived` | Projects list search/filter/sort and the details dialog. |
| `src/model/anonymize.ts` | model | `anonymizeProject`, `ANONYMIZED_NAME`, `anonymizedFileName` | Allowlist copy of the electrical model with ids replaced (P01…, C001…). |
| `src/model/folderRoles.ts` | model | `ROLE_CATALOGUE`, `isRole`, `roleById`, `DOC_TYPES` | What each project folder is for (calcVd, drawingsIssued, boq…). |
| `src/model/folderTemplates.ts` | model | `ProjectFolder`, `FolderTemplate`, `validateTemplate`, `applyOverrides`, `expandTemplate`, `resolveRole`, `readProjectFolder`, `diffTemplates` | Folder-template tree, naming rule, project overrides. Pure functions. |
| `src/model/folderTemplateBuiltins.ts` | model | `BUILT_IN_TEMPLATES`, `DEFAULT_TEMPLATE_ID`, `builtInTemplate`, `fromOutline` | Five built-in templates (consultant, villa, contractor, ISO 19650, multi-building). |
| `src/components/SaveDialogs.tsx` | screen | `ConflictDialog`, `CompareDialog`, `ExternalChangeBar` | Conflict choices (overwrite / save copy / use disk), compare two files, "file changed on disk" bar. |
| `src/components/ProjectSettings.tsx` | screen | `ProjectSettings` | Design-basis modal (V, Hz, ambient, VD limit, study targets, form header data, design rules). Mainly 03-parameters-rules. |
| `src/components/ProjectDetailsDialog.tsx` | screen | `ProjectDetailsDialog` | Name, status, parties, tags, notes from the Projects list. |
| `src/components/AnonymizedSampleDialog.tsx` | screen | `AnonymizedSampleDialog` | Saves the anonymized JSON or its calculation-report PDF. |
| `src/data/sampleProject.ts` | model | `sampleProject` | Demonstration project opened at start-up. |
| `src/util/files.ts` | report | `saveText`, `saveBinary`, `saveBinaryAt`, `toCsv`, `savePdf`, `renderPdf`, `pdfAuthor` | Save dialogs / downloads used by backup and anonymized export (mostly 25-reports-exports). |
| `src/util/webApp.ts:92` | store | `chooseProjectFile`, `downloadProjectFile`, `backupContents` | Browser open / download of a project JSON. |
| `src/util/sanitize.ts` | model | `sanitizeSvg`, `sanitizedSvgFragment` | DOMPurify "second line" before project text reaches the page. |
| `electron/projectFiles.cjs` | store | `writeFileSafe`, `stampOf`, `decideSave`, `uniqueFileName`, `conflictSiblings`, `writeRecovery`, `readRecoveries`, `listProjectsMeta`, `metaFromProject`, `moveToTrash`, `listTrash`, `restoreFromTrash`, `purgeTrash` | Disk side of projects, recovery copies, list cache and trash (plain Node, unit-tested). |
| `electron/main.cjs:189-286` | store | IPC `projects:list/read/load/stat/save/pick/delete/trashList/restore/emptyTrash`, `recovery:*`, `readProject`, `projectPath` | The IPC handlers (IPC = messages between the window and the desktop main process). `.bak` fallback for a damaged file. |
| `electron/folderTemplates.cjs` | store | `read`, `save`, `remove`, `setDefault`, `importText`, `exportText` | User folder templates in `folder-templates.json` (app settings folder). |
| `electron/limits.cjs`, `electron/ipcValidate.cjs:67` | store | `LIMITS.projectBytes = 50 MB`, `assertJsonWithin`, `projectSaveArgs`, `recoveryArgs` | Size limits on save, open and recovery. |

## 3. Inputs — where its data comes from

| Data | From module (ID) | File + function |
|---|---|---|
| Every edit to the project (boards, feeders, studies, CAD, sheets…) | all editing modules, e.g. 06-network-sld-editor, 07-load-schedule-panels, 21-cad-core | `src/App.tsx:setProject` → `useHistory.set` |
| User name for `createdBy` / `updatedBy`, autosave interval | 01-app-shell (preferences) | `src/model/profile.ts:DEFAULT_PREFS`, `App.saveProject` |
| Point counts from load items (used by migration) | 07-load-schedule-panels | `src/calc/loadSchedule.ts:pointsWithItems` via `projectMigrate.ts:withItemCounts` |
| Persistent earth pit IDs (added on open and every edit) | 09-earthing | `src/model/earthingPlan.ts:withEarthPitIds` in `App.normalised` / `setProject` |
| Cable reference numbers (added on open and every feeder change) | 19-cable-tray-containment | `src/model/cableRefs.ts:withCableRefs` in `App.normalised` and the `patchHistory(withCableRefs)` effect (`App.tsx:242`) |
| Current revision id for the project list | 26-revisions-changes | `src/model/revisions.ts:currentRevision` in `metaOf` |
| Checkpoints for a backup | 26-revisions-changes | `src/model/checkpoints.ts:idbStore` in `CheckpointsPanel.exportBackup` |
| File bytes, stamps, trash, recovery folder | 34-electron-desktop | `electron/main.cjs` IPC handlers, `electron/projectFiles.cjs` |

## 4. Outputs — where its results go

| Result | Used by module (ID) | File + function |
|---|---|---|
| The open `Project` (whole app reads it) | every module | `App.tsx: history.value` |
| Input issues / references in the calculation record | 25-reports-exports | `src/docs/calcRecord.ts:49-50` |
| Project list rows (`ProjectMeta`) | 28-dashboard-readiness (projects dashboard) | `projectStore.ts:listProjects`, `projectFiles.cjs:listProjectsMeta` |
| Shape check, migration, future-version refusal for the CLI/MCP | 31-headless-cli-mcp | `src/headless/project.ts:56-58` |
| `deleteBoard`, `removeDanglingReferences` | 06-network-sld-editor, 12-transformer-generator, 31-headless-cli-mcp | `App.tsx:939`, `TxSummaryView.tsx:26`, `headless/editTools.ts:320,342`, `model/mdFeeders.ts:43` |
| Anonymized calculation-report PDF | 25-reports-exports | `AnonymizedSampleDialog.tsx` → `docs/calcReport.ts:buildReportHtml` |
| Fingerprint for "changed since revision" | 26-revisions-changes | `saveSafety.ts:projectFingerprint` (also `unsaved.ts`) |

## 5. User flow — from button click to result

**Open (desktop)**
1. Projects list → click a project → `App.openProject(file)`; `guard()` asks `UnsavedDialog` if `dirty`.
2. `projectStore.loadProjectStamped` → IPC `projects:read` → `main.cjs:readProject` reads ≤ 50 MB (`readTextFileLimited`), hashes it (`stampOf`), parses. Parse error → opens `<file>.bak` and flags `_restoredFromBackup` (renderer shows an alert).
5. `isFutureSchema` → read-only banner; `runCalculations(opened)`; feeder presets in the file join this computer's presets (`mergePresets`).

**Save (Ctrl+S)**
1. `App.saveProject()` → blocked if read-only (unless Save as).
2. Adds `updatedAt`, `updatedBy`; `saveProjectFile(file, p, {expected: fileStamp})` → IPC `projects:save`.
3. `ipcValidate.projectSaveArgs` (compact JSON ≤ 50 MB) → `decideSave(expected, disk)`; different hash → `{conflict}` → `ConflictDialog`.
4. `writeFileSafe`: temp file → old file copied to `.bak` → rename → read back + SHA compare + `JSON.parse` → new stamp.
5. `setSaved`, `clearRecovery(id)`, recent list, status "Saved …".

## 6. Linked to (working connections)

- **34-electron-desktop**: all disk work goes through IPC handlers that validate names (`projectPath`), refuse links, limit sizes and write atomically (`writeFileSafe`).
- **28-dashboard-readiness**: `projectInputIssues` + `checkReferences` feed the To do list; `listProjectsMeta` with a cache (`projects-index.json`) feeds the Projects list; sync-tool conflicted copies are tagged (`conflictSiblings`).
- **31-headless-cli-mcp**: uses the same `checkProjectShape` + `migrateProject`, and refuses newer-version files.
- **06-network-sld-editor**: `withUids` gives every board/circuit a permanent uid on every edit (`App.setProject`).
- **25-reports-exports**: anonymized sample and its calculation report.



---

*Public summary: describes what the module does and how it connects. The engineering review of open issues is kept separately.*
