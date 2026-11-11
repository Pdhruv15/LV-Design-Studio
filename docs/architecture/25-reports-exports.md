# 25 — Reports and exports
[← Index](00-index.md) · [Integration map](99-integration-map.md)

## 1. What it does

This module turns calculation results into documents for submission. It has five main outputs:

1. **Calculation report** (`src/docs/calcReport.ts`, screen `ReportView` in `src/components/docs/Documents.tsx`). One compact A4-landscape PDF of the whole installation. Page 1 has a results summary, a "Needs attention" list and the design basis. Nine calculation sections follow, then assumptions and the calculation record.
2. **Study reports** (`src/docs/studyReport.ts`, `calcSections.ts`, `designBasis.ts`, `compliance.ts`, `appendices.ts`, `reportFrame.ts`; screen `StudyReportsView`). This is a submission report: you choose a scope (the whole installation, or chosen boards and what they feed) and up to 12 studies. It has a cover, document control, a calculation record, a contents page, the design basis, the study sections, results and compliance, and appendices (detail tables, A3 SLD sheets, references). It exports as PDF, Word (.docx) or Excel (.xlsx). A ready-made **report type** (`reportTypes.ts`) presets which studies are ticked.
3. **Issue package** (`issuePackage.ts`, `mergePdf.ts`, `exportPack` in `StudyReportsView`). One merged PDF built from **one frozen calculation run**. It contains a cover (with a snapshot ID, the contents, unresolved checks and assumptions), the project summary, the study report with SLDs, the drawing set and the panel schedules. Every page is stamped with the snapshot ID.
4. **Export centre** (`ExportCentre.tsx`, `exportCatalogue.ts`). A tick-list of 20 PDF documents in 7 groups, exported as a zip or as one bookmarked PDF. The headless CLI/MCP uses the same catalogue (`src/headless/exportTools.ts`, `rendererExport.ts`).
5. **PDF / Word / Excel engines.** These are `printStyles.ts`, `printDoc.ts` and `report.ts` (the shared black-and-white print look), `outline.ts` (PDF bookmarks), `pdfTools.ts` (page stamps, running header and footer, bookmarks), `mergePdf.ts`, `electron/pdfRender.cjs` (HTML → PDF with Chromium in a locked-down hidden window), `studyWord.ts` (docx), `studyWorkbook.ts`, `formWorkbook.ts` (authority MD/TCL forms) and `xlsxTemplate.ts` (fills a user's Excel load-schedule template).

### Study coverage — where each study appears

| Study (module) | Calculation report `CALC_REPORT_STUDIES` (`calcReport.ts:26`) | Study reports `STUDIES` (`studyReport.ts:59`) | Export centre `CATALOGUE` (`exportCatalogue.ts:81`) | Own-page export |
|---|---|---|---|---|
| Load assessment, network (board demand) — `load` (04/06) | Y | Y | via calc / study report | – |
| Building load assessment (04) | – | Design-basis sub-section, only when `loadAssessment.inReport` (`designBasis.ts:205`) | `building-summary` (building summary, not the assessment). The concept report is **not** in the catalogue (`App.tsx:1309` only) | Building summary PDF/Excel (`BuildingView.tsx:48`) |
| LV distribution — `dist` (06) | – | Y | via study report | – |
| Voltage drop / load flow — `lf` (08) | Y | Y | `voltage-drop` (separate VD report) + via reports | VD PDF + CSV (`VoltageDropStudy.tsx:100`) |
| Short circuit — `sc` (06) | Y | Y | via reports | – |
| Earth fault loop (EFLI) — `earth` (09) | Y | Y | via reports | none (`EarthingStudy.tsx` has no export) |
| Earth electrode / earthing system design (09) | – | – | – | – |
| Protection coordination / discrimination — `disc` (10) | Y (selectivity table only) | Y (table only) | via reports | none; **no TCC chart in any report** (`CoordinationStudy.tsx`) |
| Breaker and cable selection — `cable` (11) | Y | Y | via reports; `cable-schedule` | none (`SelectionStudy.tsx`) |
| Transformer and generator sizing — `sizing` (12) | Y | Y | via reports; the TCL summary sheet sits inside `md-forms` | PDF/Excel sheet (`SizingStudy.tsx:66`) |
| Power factor correction, network plan — `pfc` (13) | Y | Y | only `pfc-calc` (the standalone PFC calculator, not the network plan) | PDF/Excel sheet (`PfcStudy.tsx:63`) |
| Busbar risers — `busbar` (14) | – | Y | via study report; riser VD inside `voltage-drop` | PDF/Excel sheet (`BusbarStudy.tsx:78`) |
| Phase balance / unbalanced flow — `phase` (07/16) | – | Y | via study report | – |
| UPS and battery (15) | – | Equipment-summary row + design-basis text, only with "Results and compliance" on (`compliance.ts:48`, `designBasis.ts:162`) | `ups` | PDF (`UpsStudy.tsx:45`) |
| Solar PV (15) | – | One pointer line in the design basis (`designBasis.ts:166`) | `solar` | PDF (`SolarStudy.tsx:51`) |
| Enclosure / Form 4 (17) | – | – | – | Own HTML inside the screen (`EnclosureSizing.tsx:150`, `Form4Sizing.tsx:61`) |
| Space planning / DM substation (05) | – | – | `dm-form` (DM-D-013) | DM form PDF (`SubstationAreaView.tsx:46`) |
| ELV (29) | – | – | – | PDF/Excel/DXF on the ELV schedules page (`ElvSchedules.tsx:35-86`) |
| Containment / cable tray (19) | – | – | `containment`, `tray-schedule` | own pages |
| Cable schedule — `schedules` (19) | Y | Y | `cable-schedule` | Documents → Cable schedule |

## 2. Files, components, functions and stores

(The "store" is where the app keeps the project in memory. Here it is the `project` object passed down from `App.tsx`. The setup of the study reports is saved in the project as `project.studyReport` and `project.studyReportPresets`.)

| File | Kind | Key functions or components | What they do |
|---|---|---|---|
| `src/docs/calcReport.ts` | report | `CALC_REPORT_STUDIES` (:26), `calcReportData` (:33), `calcReportSections`, `buildReportHtml` (:67) | Standalone calculation report. It **re-runs** `evaluateProject` / `evaluateEarthingAll` / `evaluateSelectivity` itself and lays out the study sections. |
| `src/docs/studyReport.ts` | report | `STUDIES` (:59), `setupOf`, `scopeOf` (:105), `drawingProject`, `buildSection` (:173), `baseSection` (:179), `pfcSection` (:466), `planReport` (:547), `buildStudyReportHtml` (:566), `sldStudies`, `tableHtml`, `cellHtml` | Section builders for the 12 study kinds, report scope, and the full design-report HTML. |
| `src/docs/calcSections.ts` | report | `structureSection`, `loadSection`, `distributionSection`, `cableStatus` | Adds the standard Input → Criteria → Method → Result → Selection → Verification layout. Moves long tables to the appendices. |
| `src/docs/calcRecord.ts` | report | `buildCalcRecord`, `calcRecordHtml` | "Calculation record": what was calculated, when, from what data, and the validation status (PRELIMINARY / CALCULATED — FOR ENGINEERING REVIEW). |
| `src/docs/compliance.ts` | report | `buildResults` (:34), `resultsSections` (:162), `barChart` (:132) | Equipment, load and cable summaries, the master compliance table and grey/black bar charts. |
| `src/docs/appendices.ts` | report | `planAppendices` (:40), `equipmentData` (:65), `APPENDIX_TITLE` | Appendix lettering A, B, C…: load, cable, fault, equipment, SLD and reference documents. |
| `src/docs/reportFrame.ts` | report | `reportDoc`, `coverPageHtml`, `documentControlHtml`, `tocHtml`, `numberSections`, `numberSubsections`, `pageFrame`, `missingFields`, `ISSUE_STATUSES` | Cover, document control, contents, numbering, and the running header/footer data. |
| `src/docs/reportTypes.ts` | model | `REPORT_TYPES`, `applyReportType`, `matchingType` | Six preset report types: full, calc, load, cable, sc, authority ("DEWA submission"). |
| `src/docs/issuePackage.ts` | report | `snapshotId`, `unresolvedChecks` (:31), `assumptions`, `packageStamp`, `packageCoverHtml` (:73) | Issue-package cover and the "open items" list. `unresolvedChecks` also feeds the calc report's page-1 attention box. |
| `src/docs/studyWord.ts` | report | `buildStudyDocx`, `docxBytes` | Word version of the design report (no SLDs and no charts). |
| `src/docs/studyWorkbook.ts` | report | `buildStudyWorkbook` | Excel workbook: a cover sheet plus one sheet per study (summary and tables only). |
| `src/docs/formWorkbook.ts` | report | `buildFormWorkbook` (:425), `addMdSheet`, `addTxSheet`, `addRiserSheet`, `addDbSheet` | Authority connected-load / MD / TCL / riser / DB forms as Excel (and as PDF through `workbookHtml`). |
| `src/docs/report.ts` | report | `esc`, `tally`, `PLAIN_CSS`, `reportHead`, `REPORT_CSS`, `ATTENTION_MAX` | Shared escaping, page-1 document block, and the black-and-white CSS. |
| `src/docs/printDoc.ts` | report | `printDoc`, `cssStr`, `cssImage` | A4 print shell with a CSS running header/footer (BOQ style), used by the calc report. |
| `src/docs/outline.ts` | report | `destMarker`, `bookmarkMarkers`, `markerBookmarks` | PDF bookmark markers placed in the HTML. |
| `src/docs/pdfTools.ts` | report | `stampPages`, `stampFrame`, `destinationPages`, `finishPdf` | Post-processing with pdf-lib: page stamps, header/footer, named destinations, bookmarks. |
| `src/docs/mergePdf.ts` | report | `mergePdfs` | Joins PDFs, stamps every page, and adds a bookmark per part. |
| `electron/pdfRender.cjs` | report (desktop) | `htmlToPdf`, `htmlToPrinter`, `printerList`, `pdfSession` | Chromium `printToPDF` in a sandboxed hidden window with no network (`file:`/`data:`/`blob:` only). |
| `src/components/docs/Documents.tsx` | screen | `ReportView` (:77), `CableScheduleView`, `EquipmentScheduleView` | Calculation report page: preview, pre-export check, Export PDF. |
| `src/components/docs/StudyReportsView.tsx` | screen | `StudyReportsView` (:76), `captureSld` (:41), `exportPdf` (:129), `exportExcel`, `exportWord`, `exportPack` (:196), `savePreset` | Study-report setup tabs, preview, exports and issue package. |
| `src/components/docs/ExportCentre.tsx` | screen | `ExportCentre`, `exportAs` | Tick-list export as a zip or one merged PDF (desktop only). |
| `src/components/docs/exportCatalogue.ts` | model | `CATALOGUE`, `CATEGORIES`, `unavailable`, `calc` (:79) | The 20 export-centre entries and their `build` functions. |
| `src/components/docs/OutputDialogs.tsx`, `outputHost.ts` | screen | `PlotDialog`, `PageSetupsDialog`, `PrintersDialog`, `BatchPlotDialog`, `OutputHost`, `exportRegister` | Design CAD → Output dialogs (plot/print of drawing sheets; mostly module 23). |
| `src/components/docs/IssueDialog.tsx` | screen | `IssueDialog` | Issue sheets: date, purpose, revision bump, optional PDF (module 24). |
| `src/components/docs/TemplateExportDialog.tsx` | screen | `TemplateExportDialog` | Picks an Excel template (remembered on this computer) and runs `fillLoadScheduleTemplate`. |
| `src/components/docs/SheetPdfPreview.tsx` | screen | `SheetPdfPreview`, `canPreviewSheetPdf` | Renders one drawing sheet to PDF and shows it with PDF.js. |

## 3. Inputs — where its data comes from

| Data | From module (ID) | File + function |
|---|---|---|
| Feeder results (Ib, Iz, ΔV, Ik″, Icu status) | 06-network-sld-editor | `src/calc/electrical.ts:evaluateProject` (through `CalcRun.results`, or re-run in `calcReportData`) |
| Earth fault loop results | 09-earthing | `src/calc/earthing.ts:evaluateEarthingAll`, `disconnectionLabel`, `loopFigures`, `cpcOf` |
| Selectivity pairs | 10-protection-coordination | `src/calc/protection.ts:evaluateSelectivity` |
| Transformer / generator sizing, parallel transformers, existing installation | 12-transformer-generator | `src/calc/txGen.ts:sizeTransformers`, `sizeGeneratorByBoards`; `src/calc/parallelTx.ts:parallelOperation`; `src/calc/existing.ts:existingChecks` |
| PFC plan | 13-power-factor-correction | `src/calc/pfc.ts:planPfc`, `pfcPlanOf` |
| Busbar risers | 14-busbar | `src/calc/busbar.ts:sizeRiser`, `riserVd` |
| UPS / PV | 15-ups-solar | `src/calc/ups.ts:sizeUps`, `src/calc/solar.ts:sizePv` |
| Phase balance, unbalanced flow | 07-load-schedule-panels / 16-load-flow-engines | `src/calc/phaseBalance.ts:phaseBalance`, `src/calc/unbalancedFlow.ts:unbalancedFlow` |
| Board summaries (demand, fault, loading) | 06 | `src/calc/summary.ts:boardSummary`, `systemSummary`, `boardsInSupplyOrder` |
| Motor-start VD | 08-voltage-drop | `src/calc/voltageDrop.ts:vdRow`, `motorStartVdLimit` |
| Building load assessment | 04-building-load-assessment | `src/calc/loadAssessment.ts:assess` → `designBasis.ts:loadAssessmentBasis` |
| Study settings (growth, loading, PF target) | 03-parameters-rules | `src/calc/sizing.ts:settingsOf`, `STUDY_DEFAULTS` |
| Design reference / authority source | 27-review-submissions-authority | `src/model/designReference.ts:referenceSourceOf`; `project.receivedDocs` |
| Revisions | 26-revisions-changes | `src/model/revisions.ts:currentRevision`, `revisionStamp` |
| Cable data source, fire rating | 11-breaker-cable-selection / 32-component-database | `src/calc/cableTable.ts:cableDataStatus`, `cableDataNotice`; `src/model/cableTypes.ts:cableTypeOf`, `fireRatingIssues` |
| Cable schedule | 19-cable-tray-containment | `src/docs/schedules.ts:cableSchedule` |
| SLD drawing (SVG) | 06 / 24-drawings-sld-sheets | `SystemDiagram` + `src/diagram/exportSvg.ts:printableSvg`; title block `src/docs/sldSheet.ts:pageTitleBlock` |
| Input validation, references | 02-project-storage | `src/model/projectValidate.ts:projectInputIssues`, `src/model/integrity.ts:checkReferences` |

## 4. Outputs — where its results go

| Result | Used by module (ID) | File + function |
|---|---|---|
| Export catalogue (all PDFs) | 31-headless-cli-mcp | `src/headless/exportTools.ts` (`CATALOGUE`, `unavailable`), `src/headless/rendererExport.ts` |
| Merged PDF engine | 24-drawings-sld-sheets, 27-review-submissions-authority | `src/components/docs/sheetRender.tsx:339,417`, `src/components/docs/ReviewView.tsx:52` (`mergePdfs`) |
| Single-study PDF/Excel sheets | 12, 13, 14 | `SizingStudy.tsx:66`, `PfcStudy.tsx:63`, `BusbarStudy.tsx:78` (`buildStudyReportHtml`, `buildStudyWorkbook`) |
| Submission register entry offered after export | 27-review-submissions-authority | `StudyReportsView.tsx:exportPdf` → `src/model/submissions.ts:offerSubmission` |
| Issue package includes the project summary | 28-dashboard-readiness | `exportPack` → `src/docs/dashboardPdf.ts:buildDashboardHtml` |
| Anonymised sample report | 01-app-shell | `src/components/AnonymizedSampleDialog.tsx:22` (`buildReportHtml`) |
| PDF bytes | 34-electron-desktop | `window.lvds.files.pdfBytes` → `electron/pdfRender.cjs:htmlToPdf` |

## 5. User flow — from button click to result

**Calculation report**
2. `ReportView` (`Documents.tsx:79`) calls `buildReportHtml`. That calls `calcReportData`, which re-runs the network calculation and builds the nine sections with `buildSection`.
3. `ReportView` runs `calcReportData` a second time for `validateReport`, and shows the pre-export check.

**Study report / issue package**
2. The user picks the scope (`scopeOf`), a report type (`applyReportType`) or individual studies, and the document data. Each change is saved as `project.studyReport` through `onChange`.
3. The sections are built from the **run** (`data = run.*`) with `buildSection`. `validateReport` lists the issues.
6. **Word** (`exportWord`) uses `buildStudyDocx`. **Excel** (`exportExcel`) uses `buildStudyWorkbook`.

**Export centre**
2. The user ticks entries and chooses Zip or One PDF. `exportAs` calls each `entry.build(ctx)`, then `renderPdf` per part, then a jszip archive or `mergePdfs`.

## 6. Linked to (working connections)

- **06-network-sld-editor**: feeder results, fault levels and board summaries feed every network section. The study reports use the stored run, and the calc report re-runs the calculation.
- **08-voltage-drop**: `lf` section and the separate VD report in the export centre (`buildVdReportHtml`).
- **09-earthing**: `earth` section (Zs, If, disconnection, adiabatic CPC), plus the "supply loop incomplete" warning.
- **10-protection-coordination**: `disc` selectivity table.
- **11-breaker-cable-selection**: `cable` section, feeder cards, fire-rated cable warning (`fireRatingIssues`), cable-data source in the calculation record.
- **12-transformer-generator**: `sizing` section, executive summary, compliance rows, parallel transformers, existing installation.
- **13-power-factor-correction**: `pfc` section and compliance rows.
- **14-busbar**: `busbar` section (study reports only).
- **15-ups-solar**: UPS rows in the equipment summary; UPS and PV standalone PDFs in the export centre.
- **04-building-load-assessment**: a design-basis sub-section when the assessment is marked `inReport`.
- **26-revisions-changes**: revision on the cover, page-1 block and stamps.
- **27-review-submissions-authority**: received documents in the Reference appendix; the export offers a submission entry.
- **28-dashboard-readiness**: project summary in the issue package and in the export centre.
- **31-headless-cli-mcp**: the CLI/MCP reuses `CATALOGUE`.
- **34-electron-desktop**: PDF rendering in a locked-down window.
- **24-drawings-sld-sheets**: the issue package includes the drawing set and uses the shared `mergePdfs`.



---

*Public summary: describes what the module does and how it connects. The engineering review of open issues is kept separately.*
