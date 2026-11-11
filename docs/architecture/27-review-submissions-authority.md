# 27 — Review comments, received documents, submissions, authority rule sets and proposals
[← Index](00-index.md) · [Integration map](99-integration-map.md)

## 1. What it does

This module covers what goes on around the design rather than the design calculations:

- **Authority rule sets (design references).** These are named sets of design values from an authority (DEWA, ADDC, EtihadWE), a standard (IEC 60364, BS 7671) or your own company practice. Each value can carry a clause and a note. There are also "rule rows" (minimum wire and ELCB/RCD sensitivity by load type) and free "entries" that are for reading only. Applying a set writes its values into the project settings and records which set and version was used. A set can build on another ("extends") and store only what differs.
- **Review comments.** A person's findings, questions and tender queries about the design. Each one has a status workflow, and a closed comment is flagged when the item it refers to changes.
- **Received documents.** A register of documents received from others (number, revision, originator), with one marked as the baseline the work started from.
- **Submissions.** A register of everything sent out (BOQ, drawings, reports, variations), with recipient, due date, response, comments and resubmissions. It also produces a transmittal sheet and a register as PDF or Excel.
- **Proposals (modification records).** Rules that check whether a record is sound, a register row for each record, outstanding items for the Overview, and an impact preview. The preview runs the whole-network calculation on the working design and again with the proposal applied, then lists the circuit, status, UPS, drawing and BOQ differences. The records themselves belong to module 26.
- **Reports.** The design review report (PDF and Word), the contractor's technical clarification report, and the submission register and transmittal.

Terms used below:
- "store" means the place the app keeps the open project in memory (`Project` in `src/types.ts`).
- "library" means the user's own references kept in browser `localStorage` (the browser's built-in storage on this computer) and synced to `LV Database/Library.json`.

## 2. Files, components, functions and stores

| File | Kind | Key functions or components | What they do |
|---|---|---|---|
| `src/model/designReference.ts` | model | `REF_FIELDS`:26, `BUILT_IN_REFERENCES`:94, `resolveReference`:299, `applyReference`:372, `referenceChanges`:356, `appliedStatus`:407, `changedSinceApplied`:393, `settingSource`:454, `referenceSourceOf`:400, `startChoices`:442, `referenceIssues`:256, `importReferences`:323, `exportReferences`:317, `loadUserReferences`/`saveUserReferences`:223/229 | Authority, standard and company rule sets. Layering (`extends`), applying a set to a project, showing what changed since it was applied, and choosing a set at project start. |
| `src/model/designRules.ts` | model (shared with 03) | `RULE_KINDS`, `resolveRule`, `hasRules`, `ruleKey`, `normaliseRules`, `ruleIssues` | Rule rows (`minWireMm2`, `elcbMa`) with a condition (category, load type, minimum kW). The most specific matching row wins. |
| `src/model/reviewComments.ts` | model | `newComment`:64, `moveComment`:102, `stampOf`:51, `refState`:81, `needsReReview`:88, `reviewSummary`:117, `openTenderQueries`:128, `allowedNext`:97 | Review-comment records and their workflow. Records a "stamp" (fingerprint) of the item's engineering values when a comment is raised and when it is closed. |
| `src/model/receivedDocs.ts` | model | `addDoc`:36, `updateDoc`:50, `removeDoc`:55, `setBaselineDoc`:61, `baselineDoc`:68, `docIssues`:72 | Register of received documents, with automatic "superseded by" links and a single baseline document. |
| `src/model/submissions.ts` | model | `submissionsOf`:94, `issueAsSubmission`:74, `submissionForIssue`:87, `resubmit`:111, `dueOf`:63, `isOverdue`:64, `timeText`:66, `submissionCounts`:118, `recipientGroup`:47, `offerSubmission`/`onSubmissionOffer`/`draftFromOffer`:131–140, `RECIPIENTS`:17, `DEFAULT_DAYS`:46 | Submission records. Drawing transmittals are merged in automatically. Calculates due dates and overdue status, links resubmissions, and lets an export offer to record a submission. |
| `src/model/proposalRules.ts` | model | `stableHash`:9, `opProblem`:24, `validateRecord`:38, `baselineStatus`:63, `baselineMessage`:69 | Checks that a modification record is sound and that its baseline revision is still the same content. |
| `src/model/proposalRegister.ts` | model | `registerRow`:18, `filterRegister`:30, `affectedEquipment`:16, `opView`:45 | Register rows and the current / expected / proposed view of each change. |
| `src/components/BriefEditor.tsx` | screen (wizard step) | `AuthorityPicker`:107 | Country → authority → rule-set choice in the new-project wizard. |
| `src/components/docs/ReviewView.tsx` | screen | `ReviewView` (`raise`, `move`, `recordDecision`, `exportAs`) | Raise and move comments, set up the review report, record the reviewer's decision, and export review or clarification PDF/Word. |
| `src/components/docs/ReceivedDocsView.tsx` | screen | `ReceivedDocsView` (`add`) | Register documents, mark the baseline, add a link, remove. |
| `src/components/docs/SubmissionsView.tsx` | screen | `SubmissionsView`, `SubEditor`, `ResponseDays` | Submission register, editor, response times, and transmittal/register export. |
| `src/components/docs/ProposalPreviewPanel.tsx` | screen | `ProposalPreviewPanel` | The impact-preview tabs inside the modification panel (module 26). |
| `src/docs/reviewReport.ts` | report | `buildReviewDoc`:39, `reviewHtml`:117, `SECTION_IDS`:18 | Design review report document model built from a frozen copy of the project. |
| `src/docs/reviewWord.ts` | report | `buildReviewDocx`:8 | The same document model rendered to Word. |
| `src/docs/clarificationReport.ts` | report | `buildClarificationDoc`:14 | Contractor's technical clarification report: received design, discrepancies, proposed changes, questions. |
| `src/docs/submissionReport.ts` | report | `buildSubmissionRegisterHtml`:14, `buildTransmittalHtml`:50, `buildSubmissionWorkbook`:77 | Submission register (PDF, landscape), transmittal (PDF, portrait), register workbook (Excel). |
| `src/types.ts` | store fields | `reviewComments`:532, `reviewReport`:534, `submissions`:540, `submissionDays`:542, `receivedDocs`:544, `designReference`:637, `designRules`:639 | Where the records are saved in the project file. |

## 3. Inputs — where its data comes from

| Data | From module (ID) | File + function |
|---|---|---|
| Project settings changed by a rule set (voltage, frequency, ambient, VD limit, study settings, MD demand factor) | 03-parameters-rules | `src/model/designReference.ts:projectValue`, `STUDY_DEFAULTS` in `src/types.ts` |
| Rule-row engine | 03-parameters-rules | `src/model/designRules.ts:resolveRule`, `normaliseRules` |
| Feeders and boards (comment targets, stamps) | 06-network-sld-editor | `src/model/reviewComments.ts:stampOf` with `FEEDER_CLASS`/`BOARD_CLASS` from `src/model/changeClass.ts` |
| Drawing sheets and transmittals | 24-drawings-sld-sheets | `src/model/submissions.ts:issueAsSubmission` / `fromTransmittals` (reads `drawingSet.issues`); `src/model/drawingSet.ts:issueSheets`:430 |
| Revisions, baseline, design impact | 26-revisions-changes | `src/docs/reviewReport.ts:buildReviewDoc` (`baselineOf`, `currentRevision`, `impactBetween`); `src/model/proposalRules.ts:baselineStatus` (`p.revisions`) |
| Modification records and changes | 26-revisions-changes | `src/model/proposalPreview.ts:previewProposal` (`withProposal`, `designFingerprint`); `src/model/proposalStatus.ts` (`conflictsOf`, `appliedFollowUp`) |
| Whole-network calculation results | 06-network-sld-editor / 16-load-flow-engines | `src/model/proposalPreview.ts:previewProposal` → `runCalculations` (`src/calc/runs.ts`) |
| UPS sizing | 15-ups-solar | `src/model/proposalPreview.ts:upsChanges` → `sizeUps` |
| BOQ quantities and rates | 20-equipment-boq-pricing | `src/model/proposalPreview.ts:quantityEffects` → `buildBom`, `fallbackPriceEntry`; `ProposalPreviewPanel` → `loadPriceLists()[0]` |
| Dashboard findings (for the review report) | 28-dashboard-readiness | `src/components/docs/ReviewView.tsx:doc` → `buildDashboard` |
| Offers to record a submission after an export | 20-equipment-boq-pricing, 25-reports-exports, 26-revisions-changes | `offerSubmission` calls in `src/components/docs/BomView.tsx`:121, `StudyReportsView.tsx`:148/151, `VariationsView.tsx`:42 |
| Library sync of user references | 32-component-database | `src/model/designReference.ts:saveUserReferences` → `pushLibrary` (`src/database/librarySync.ts`) |
| Brief authority text | 04-building-load-assessment (brief) / 01-app-shell (wizard) | `src/model/brief.ts` `ProjectBrief.authority`; read by `reviewReport.ts:buildReviewDoc`:71 |
| PDF/Word saving | 34-electron-desktop | `savePdf`, `saveBinary`, `window.lvds.files.pdfBytes` in `ReviewView.tsx:exportAs` |

## 4. Outputs — where its results go

| Result | Used by module (ID) | File + function |
|---|---|---|
| Rule rows (min wire, ELCB) copied into `p.designRules` | 07-load-schedule-panels | `src/calc/loadSchedule.ts:minWireMm2`:137 (floor when sizing in `src/model/schedule.ts:refresh`:21; flagged in `src/docs/loadScheduleDoc.ts`:73), `elcbGroups` sensitivity :333 |
| MD demand factor (`info.mdDemandFactor`) | 07-load-schedule-panels | `src/docs/mdSheet.ts`:110, `src/docs/riserForm.ts`:48 |
| "From DEWA v1 · clause" source lines | 03-parameters-rules | `src/components/ProjectSettings.tsx`:30 → `settingSource` |
| Reference name and version in the design basis | 25-reports-exports | `src/docs/designBasis.ts`:173, :179 (`referenceSourceOf`) |
| Reference name in Excel templates | 25-reports-exports | `src/docs/xlsxTemplate.ts`:72 |
| Review summary and tender-query gates | 28-dashboard-readiness | `src/calc/projectReadiness.ts`:27, :55, :78 (`reviewSummary`, `openTenderQueries`) |
| Proposal to-do items | 28-dashboard-readiness | `src/calc/dashboard.ts`:160 (`proposalOutstanding`); `ProjectDashboard.tsx`:218 |
| Submission counts and overdue items | 28-dashboard-readiness | `src/components/docs/ProjectDashboard.tsx`:230 (`submissionCounts`, `isOverdue`) |
| Transmittal PDF of a drawing issue | 24-drawings-sld-sheets | `src/components/docs/DrawingsView.tsx`:122 → `buildTransmittalHtml(submissionForIssue)` |
| Submission register in the export centre | 25-reports-exports | `src/components/docs/exportCatalogue.ts`:192 |
| Proposal preview inside the modification panel | 26-revisions-changes | `src/components/docs/ModificationsPanel.tsx`:266 |
| Changes to references and rules shown in revision diffs | 26-revisions-changes | `src/model/revisions.ts`:142 (`designReference`, `designRules` labels) |

## 5. User flow — from button click to result

**A. Choose a rule set at project start**
1. New project wizard: `BriefEditor` → `AuthorityPicker` lists `startChoices()`, grouped by country, then authority, then the authority's own set and the user's copies.
2. Create: `App.tsx:createProject`:885 runs `applyDefaults` → `applyTemplateSystem` → `applyReference(base1, reference)` → `applyBrief`.
3. `applyReference` resolves the layers (`resolveReference`), writes the values into the project, study settings and info, replaces earlier reference rule rows in `designRules`, and stores `designReference = {id, name, version, appliedAt, values}`.

**B. Apply or update a rule set later**
1. Standards → Design references (`DesignReferencesView`). Pick a set. The "what changes" preview comes from `referenceChanges`.
2. "Apply N changes" → `onApply` → `App.tsx`:1569 `applyReference` followed by `refreshBoard` on every board (re-sizes circuits against the new minimum wire and ELCB values).
3. The project screen shows drift (`changedSinceApplied`) and "newer version" (`appliedStatus`).

**C. Review comment**
1. Design review → Raise: `ReviewView.raise` → `newComment` (stamps the item with `stampOf`; `revisionId` is the latest revision) → `withComment`.
2. Record response / request evidence / close / withdraw / reopen: `ReviewView.move` → `askForm` when needed → `moveComment` (closing needs a name and re-stamps the item).
3. The list shows "re-review" when `needsReReview` is true (the stamp has changed or the item is gone).
4. Export PDF/Word: `exportAs` → `buildReviewDoc` (frozen copy + `buildDashboard` findings) → `reviewHtml` / `buildReviewDocx`. When the "diagrams" section is ticked, the PDF also gets the sheets from `prepareSheets`, joined with `mergePdfs`.
5. Clarification PDF/Word: `buildClarificationDoc`.

**D. Received document**
2. "Use as baseline" → `setBaselineDoc`. Warnings come from `docIssues`.

**E. Submission**
1. After a BOQ, study report or variation PDF, the export calls `offerSubmission`. `App.tsx`:1234 shows "Record submission" → `draftFromOffer` → `SubmissionsView` opens the draft.
2. A drawing issue (`issueSheets`) appears in the register automatically through `submissionsOf` → `fromTransmittals`.
3. In `SubEditor` the user edits recipient, documents (number, title, rev typed as text), status, response and comments → `saveSubmission`.
4. Resubmit (↻): `resubmit` copies the documents with the same revs, links the old and new submissions, and marks the old one superseded if it was still open.
5. Transmittal (⎙): `buildTransmittalHtml`. Register PDF or Excel: `buildSubmissionRegisterHtml` / `buildSubmissionWorkbook`.

**F. Proposal preview**
1. Modifications → record → "Calculate preview": `ProposalPreviewPanel.run` → `previewProposal` (two full `runCalculations`, `sizeUps`, `buildBom`).

## 6. Linked to (working connections)

- **07-load-schedule-panels**: rule rows and min-wire/ELCB values set the circuit wire floor (`schedule.ts:refresh`). A hand-set wire below the minimum is shown as "warn" (`loadScheduleDoc.ts:73`, `LoadScheduleView.tsx:397`). The ELCB group sensitivity is chosen from the rules (`loadSchedule.ts:333`).
- **24-drawings-sld-sheets**: drawing transmittals become submissions with no extra step, and the transmittal sheet is shared (`DrawingsView.tsx:122`).
- **26-revisions-changes**: the review report compares the working design against the baseline revision (`impactBetween`). Proposal records are validated, listed, previewed and counted.
- **28-dashboard-readiness**: review summary, tender queries, proposal to-dos and submission counts all reach the Overview and readiness gates.
- **25-reports-exports**: the design basis prints the applied reference and, for each value, "Design reference: X vN" (`designBasis.ts:173/179`). The export centre includes the submission register.
- **32-component-database**: user references sync through `pushLibrary`.



---

*Public summary: describes what the module does and how it connects. The engineering review of open issues is kept separately.*
