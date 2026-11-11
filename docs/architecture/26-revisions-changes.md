# 26 — Revisions, checkpoints, design baseline, modifications, variations, change impact
[← Index](00-index.md) · [Integration map](99-integration-map.md)

## 1. What it does

This module keeps track of how the design changes over time. It has six parts:

3. **Design baseline** — `src/model/designBaseline.ts`, `src/components/BaselineBar.tsx`. A pointer to one issued revision (default: the latest) that the working draft is measured against. The bar above the workspace shows how many changes of each class the draft has.
4. **Checkpoints** — `src/model/checkpoints.ts`, `src/components/docs/CheckpointsPanel.tsx`. Private safety copies of the whole project, kept in the computer's browser storage (IndexedDB), **not** in the project file. The app takes one automatically before big changes (max. 20 automatic ones kept; named ones kept until deleted).
5. **Modification records (MOD-001…) and change impact** — `src/model/designChanges.ts`, `src/model/designImpact.ts`, `src/components/docs/ModificationsPanel.tsx`, `src/components/docs/ChangesView.tsx`. A proposed value change (circuit, panel, UPS or project setting) with reason, before/after values, a decision (accept/reject with a typed name) and an explicit, all-or-nothing "apply". The impact preview lists the panels affected, studies to run again, drawings and schedules that show the equipment, and BOQ design-quantity changes.
6. **Variations (VO-001…)** — `src/model/variations.ts`, `src/components/docs/VariationsView.tsx`, `src/docs/variationReport.ts`. The commercial change account: additions/omissions against the BOQ revision marked as the contract, with contract sum → revised sum → anticipated final sum, PDF register/VO sheets and Excel.

Also here: **SLD sheet revision clouds** — `src/model/sheetChanges.ts` keeps what each system SLD sheet drew at its last issue and lists the panels/circuits changed since, so the engineer can cloud them.

## 2. Files, components, functions and stores

("Store" = the place the app keeps the project in memory; here the project object passed through `onChange` / `setProject` in `src/App.tsx`. "Snapshot" = a frozen deep copy of the project.)

| File | Kind | Key functions or components | What they do |
|---|---|---|---|
| `src/model/revisions.ts` | model | `Snapshot` (:14), `snapshotOf` (:16), `nextRevisionId` (:22), `issueRevision` (:29), `currentRevision` (:41), `changedSinceRevision` (:45), `changeCountsSinceRevision` (:52), `restoreRevision` (:62), `revisionStamp` (:79), `Change`/`Diff` (:88), `countByClass` (:107), `FEEDER_FIELDS` (:117), `BOARD_FIELDS` (:128), `PROJECT_FIELDS` (:140), `DATA_SETS` (:147), `fieldChanges` (:176), `diffProjects` (:207) | Issue/restore revisions; field-by-field comparison of two project versions with per-board demand kW before/after. |
| `src/model/datasetDiff.ts` | model | `FieldChange`, `LEAF_LABELS` (:6), `leafLabel`, `isEmpty`, `show`, `canon` (:53), `same` (:68), `pairText` (:72), `leafChanges` (:95) | Generic nested diff: lists matched by `id`, exact numbers (no rounding), at most 40 lines then "… and n more". |
| `src/model/designBaseline.ts` | model | `DesignBaseline`, `baselineOf` (:15), `setBaseline` (:23), `clearBaseline` (:28), `draftSummary` (:40) | Baseline pointer and "draft vs baseline" counts. |
| `src/model/checkpoints.ts` | model / store | `Checkpoint`, `MAX_AUTO_CHECKPOINTS = 20` (:9), `CheckpointStore`, `newCheckpoint` (:18), `excess` (:26), `saveCheckpoint` (:31), `restoredFrom` (:41), `autoCheckpoint` (:49), `CHECKPOINTS_CHANGED`, `MemoryStore`, `idbStore` (:68) | Safety copies in IndexedDB; automatic pruning of the oldest automatic ones. |
| `src/model/designChanges.ts` | model | `ModificationRecord`, `ModOp`, `PROPOSABLE` (:64), `currentValue` (:79), `newModification` (:101), `addOp` (:110), `conflictsOf` (:133), `withProposal` (:144), `impactOfProposal` (:149), `transition` (:167), `reconcile` (:193), `applyModification` (:211), `recordFromDraft` (:242), `designFingerprint` (:275), `followUp` (:283), `appliedFollowUp` (:293) | Modification record life cycle (draft → proposed → review → accepted/rejected/superseded), conflict detection, atomic apply. |
| `src/model/proposalRules.ts` | model | `stableHash` (:9), `opProblem` (:24), `validateRecord` (:38), `baselineStatus` (:63), `baselineMessage` (:69) | Structural checks on records; detects a baseline revision whose content changed. |
| `src/model/proposalRegister.ts` | model | `registerRow` (:18), `filterRegister` (:30), `opView` (:45) | Rows of the modification register. |
| `src/model/proposalPreview.ts` | model | (preview builder, :123 uses `impactBetween`) | Fresh calculation preview of a proposal (shown by `ProposalPreviewPanel`). |
| `src/model/bulkEdit.ts` | model | `searchEquipment` and bulk-edit builders | Bulk edits built as draft modification records. |
| `src/model/designImpact.ts` | model | `DesignImpact`, `impactBetween` (:49), `chainUp` (:38) | Panels affected (changed / upstream / downstream), studies to re-run (via `fingerprint` from `src/calc/runs.ts`), documents, BOQ quantity changes (`buildBom`), assumptions. |
| `src/model/sheetChanges.ts` | model | `sheetItems` (:34), `sheetChanges` (:68), `changeText` (:87), `cloudChanges` (:91) | Revision clouds for system SLD sheets. |
| `src/model/variations.ts` | model | `Variation`, `VoLine`, `lineAmount`, `netOf`, `valueOf` (:58), `contractRevision` (:61), `setContractRevision`, `variationTotals` (:85), `saveVariation`, `deleteVariation`, `NEXT_STATUS` (:111), `contractRate` (:116), `foldVariations` (:128) | Variation account and folding approved VOs into the working BOQ. |
| `src/components/docs/RevisionsView.tsx` | screen | `RevisionsView` (:24), `issue` (:58), `exportChanges` (:72) | Reports → Revisions: issue, list, compare any two, filter by class, CSV export, set baseline, restore. |
| `src/components/docs/CheckpointsPanel.tsx` | screen | `CheckpointsPanel` (:13), `create`, `restore` (:43), `exportBackup` (:50), `importBackup` (:58), `del` | Below the Revisions page: create/restore/delete checkpoints, export/import `.lvds-backup`. |
| `src/components/BaselineBar.tsx` | screen | `BaselineBar` (:9) | Status bar on the design workspace ("Baseline: Rev B · Working draft: 3 engineering · 1 drawings changes"). |
| `src/components/docs/ChangesView.tsx` | screen | `ImpactPanel` (:16), `ChangesView` (:72) | Design changes page: modifications, bulk edit, draft-vs-baseline impact. |
| `src/components/docs/ModificationsPanel.tsx` | screen | `ModificationsPanel` (:25), `create`, `fromDraft`, `step`, `apply`, `addChange` | Modification register and editor. |
| `src/components/docs/VariationsView.tsx` | screen | `VariationsView` (:26), `VoEditor` (:114), `pdf`, `excel`, `fold` | BOM / Cost → Variations tab. |
| `src/docs/variationReport.ts` | report | `buildVariationHtml` (:27), `buildVariationWorkbook` (:102) | Variation register + VO sheets (PDF via HTML, black and white) and Excel. |

## 3. Inputs — where its data comes from

| Data | From module (ID) | File + function |
|---|---|---|
| Project object, boards, feeders, all data sets | 02-project-storage | `src/types.ts:Project`, `Revision` (:1038) |
| Board demand kW for the diff | 06-network-sld-editor | `src/calc/electrical.ts:boardDemandKw` (used in `diffProjects` :290, `RevisionsView.demandOf`) |
| Circuit reference / schedule circuit test / load items text | 07-load-schedule-panels | `src/calc/loadSchedule.ts:circuitRef`, `isScheduleCircuit`, `loadItemsText`; `src/calc/summary.ts:boardTotals` (`sheetItems`) |
| Earthing plan normalisation | 09-earthing | `src/model/earthingPlan.ts:withEarthPitIds` (`diffProjects` :274) |
| UPS systems | 15-ups-solar | `Project.upsSystems` (diff :264, `PROPOSABLE.ups` :70) |
| BOQ design quantities, BOQ revisions, price list | 20-equipment-boq-pricing | `src/calc/bom.ts:buildBom` (`impactBetween` :109), `src/model/boqRevisions.ts:boqRevisionsOf`, `nextBoqRevisionId`, `src/model/priceList.ts:designQty`, `validVat` |
| Drawing set, sheet layout | 24-drawings-sld-sheets | `src/model/drawingSet.ts:sheetProject`, `src/diagram/layout.ts:layoutSystem` (`sheetItems` :36) |
| Stage gate issuing a revision | 03-parameters-rules | `src/model/designStage.ts:advanceStage` (:82) calls `issueRevision` + `setBaseline` |
| User name / initials for "by" | 01-app-shell | `src/App.tsx:1664-1665` (`prefs.profile.name`, `initialsOf`) |
| Backup zip | 02-project-storage | `src/model/projectBackup.ts:buildBackup`, `readBackupFile`, `checkpointsFor` |
| Headless proposals | 31-headless-cli-mcp | `src/headless/editTools.ts` uses `newModification`, `addOp`, `transition`, `withProposal` |

## 4. Outputs — where its results go

| Result | Used by module (ID) | File + function |
|---|---|---|
| Revision letter + date stamp on forms, reports, workbooks | 25-reports-exports, 07-load-schedule-panels, 12-transformer-generator, 13-power-factor-correction, 15-ups-solar, 19-cable-tray-containment, 04-building-load-assessment | `revisionStamp` in `src/docs/report*.ts`, `pfcReport.ts`, `trayReport.ts`, `upsSolarReport.ts`, `buildingSummary.ts`, `conceptReport.ts`, `formWorkbook.ts`, `boqWorkbook.ts`, `xlsxTemplate.ts`, `MdSheetView.tsx`, `TxSummaryView.tsx`, `RiserFormView.tsx`, `ExportCentre.tsx` |
| Revision letter and history rows in SLD title blocks | 24-drawings-sld-sheets, 23-cad-sheets-plot-titleblock | `src/docs/sldSheet.ts:titleBlockOf` (:41), `sheetTitleBlock` (:63), `src/model/titleBlock.ts:titleBlockHtml` (:188 revision cell), `revRowValues` |
| Project revision as fallback sheet revision in register | 24-drawings-sld-sheets | `src/docs/registerWorkbook.ts:buildRegisterWorkbook` (:61), `src/model/drawingSet.ts:sheetRev` |
| Sheet changes / clouds / issued items | 24-drawings-sld-sheets | `src/components/sld/SheetWorkspace.tsx:448,539,665`, `src/components/docs/DrawingsView.tsx:469` (`sheetItems`, `sheetChanges`, `cloudChanges`) |
| "Save and issue" and "No change since IFC" readiness | 28-dashboard-readiness | `src/calc/projectReadiness.ts:37,85` (`changedSinceRevision`), `src/calc/dashboard.ts:72` |
| Modification summary + impact in review report | 27-review-submissions-authority | `src/docs/reviewReport.ts:41-77` (`baselineOf`, `impactBetween`, `modifications`) |
| VO PDF offered as a submission | 27-review-submissions-authority | `VariationsView.pdf` → `src/model/submissions.ts:offerSubmission` |
| Folded VOs change the working BOQ | 20-equipment-boq-pricing | `foldVariations` writes `Project.boq.manual`, `.overrides`, `.sections` |
| BOQ revision records the design revision | 20-equipment-boq-pricing | `src/model/boqRevisions.ts:147,157` (`designRev: currentRevision(...)`) |
| Latest revision in project listing / package stamp | 31-headless-cli-mcp, 25-reports-exports | `src/headless/project.ts:114`, `src/model/projectStore.ts:44`, `src/docs/issuePackage.ts:packageStamp` (:66) |
| Proposals waiting | 31-headless-cli-mcp | `src/headless/exportTools.ts:63` |

## 5. User flow — from button click to result

**Issue and compare a revision**
1. Reports → Revisions (`src/App.tsx:1665` renders `RevisionsView`).
2. Type description and initials → **Issue revision** → `RevisionsView.issue` → `issueRevision` (deep copy via `snapshotOf`) → `autoCheckpoint` (fire-and-forget) → `onChange` (= `setProject`).
3. The table lists revisions with circuits count and max demand (`demandOf`). **Compare with current** sets From/To → `diffProjects(a, b)` (memoised) → groups by board, class filter check boxes (`countByClass`), demand table (`Diff.boardKw`).
4. **Export changes (CSV)** → `exportChanges` → `saveCsv`.
5. **Use as baseline** → `setBaseline`. **Restore** → `ask` → `autoCheckpoint` → `restoreRevision` → `setProject` (no forced undo step).

**Baseline bar** — On every edit (deferred) `BaselineBar` → `draftSummary` → `diffProjects(baseline snapshot, project)`; "Impact…" opens the Design changes page, "Compare with baseline" opens Revisions.

**Checkpoint**
1. Revisions page → `CheckpointsPanel` → **Create checkpoint…** → `askText` → `newCheckpoint` (deep copy) → `saveCheckpoint` (IndexedDB put, prune with `excess`, list again).
2. **Restore…** → saves an automatic checkpoint of now → `restoredFrom` → `setProject(p, { step: true })`.
3. **Export / Import backup** → `buildBackup` / `readBackupFile` → replace the open project (with `autoCheckpoint` first) or open as copy (`copyProject`, `checkpointsFor`).

**Modification**
1. Design changes page (`ChangesView`) → `ModificationsPanel` → **New modification…** → `newModification` (records baseline id + `stableHash` of its snapshot).
2. Add changes → `addOp` (checks `PROPOSABLE` and type, captures "before"). Edits are buffered until **Save draft**.
3. **Propose / Start review / Accept… / Reject…** → `transition` (requires title, reason, ops, typed name; refuses accept on conflict or changed baseline).
4. Preview: `ImpactPanel` with `impactOfProposal` and `ProposalPreviewPanel`.
5. **Apply to the working design…** → confirm table (`opView`) → `applyModification` (stop / skip / overwrite on conflicts) → `onApply` = `setProject(p, { step: true })`.
6. Or **Record the draft's changes…** → `recordFromDraft` (ops from baseline values, marked `applied.source = 'draft'`).

**Variation**
1. BOM / Cost → Variations (`BomView.tsx:284`) → mark **Contract BOQ** → `setContractRevision`.
2. **+ Variation** → `VoEditor` (add BOQ items at `contractRate`, or new items) → Save → `saveVariation`.
3. **Bring n approved into BOQ** → `foldVariations` → working BOQ overrides/manual lines; VO gets `foldedInto` = next BOQ revision.
4. **Register PDF / ⎙ / Excel** → `buildVariationHtml` → `savePdf` → `offerSubmission`; `buildVariationWorkbook`.

**Revision clouds (SLD sheets)** — on sheet issue `issueSheets(..., sheetItems)` stores `issuedItems`; later `SheetWorkspace` shows `sheetChanges`, ticked items → `cloudChanges` at the next sheet revision.

## 6. Linked to (working connections)

- **03-parameters-rules** — stage gate issues a revision and sets the baseline (`designStage.ts:advanceStage`); `stepBackStage` keeps the revision.
- **06 / 07** — boards and circuits compared field by field; demand per board before/after.
- **09-earthing** — earthing plan compared after pit-ID normalisation.
- **16-load-flow-engines** — study fingerprints decide "studies to run again"; `appliedFollowUp` tells whether results are current after applying a modification.
- **20-equipment-boq-pricing** — BOQ design quantities in the impact; variations fold into the BOQ; BOQ revisions record `designRev`.
- **24-drawings-sld-sheets** — sheet clouds, sheet `issuedItems`, register falls back to project revision.
- **25-reports-exports** — `revisionStamp` on most printed documents.
- **27-review-submissions-authority** — review report modification summary + impact; VO PDF offered as a submission.
- **28-dashboard-readiness** — "Save and issue" / "No change since IFC" readiness items.



---

*Public summary: describes what the module does and how it connects. The engineering review of open issues is kept separately.*
