# 03 — Project parameters, design rules, presets, user profile, design stage
[← Index](00-index.md) · [Integration map](99-integration-map.md)

## 1. What it does

This module holds the **design basis values** a project is calculated with, and the places they come from:

- **Project design values.** System voltage, frequency, design ambient, voltage-drop (VD) limit, VD conductor temperature, ground temperature and soil resistivity for buried cables, two strict-mode switches, and the **study settings**: PF target, future growth, transformer and generator maximum loading, minimum wire size and ELCB sensitivity for lighting and power circuits. These are fields on the `Project` object in `src/types.ts`. "Object" means one record in memory that is saved to the project file. The **Project settings** dialog (`src/components/ProjectSettings.tsx`) edits them.
- **Design rules.** Rows such as "power circuits, HVAC, from 5 kW → min wire 6 mm²" that override the minimum-wire and ELCB settings for particular circuits (`src/model/designRules.ts`, editor `src/components/docs/RuleRows.tsx`).
- **Text parameters** `{Name}`. Named values that are filled into title blocks, SLD notes and labels (`src/model/params.ts`, page `src/components/docs/ParametersView.tsx`). This is a text substitution system, **not** a calculation-parameter system.
- **Feeder presets.** A whole outgoing way in one drag: breaker, RCD, meter, isolator, and the load or sub-board (`src/model/presets.ts`, editor `src/components/PresetEditor.tsx`).
- **User profile and design defaults.** Kept on this computer and applied to every new project (`src/model/profile.ts`).
- **Setup templates.** A saved "kind of job" (role, authority, scope, deliverables and four system values) applied once at project creation (`src/model/setupTemplate.ts`). There is also the preview of where each starting value comes from (`src/model/setupPreview.ts`).
- **Design stage.** Concept → Schematic → Detailed → (Tender) → IFC, with stage gates that issue a revision and set a baseline. The stage also decides which to-do findings count (`src/model/designStage.ts`).

There are **five other sources** for the same values, owned by other modules: Parameters.xlsx (`src/database/database.ts`, module 32), Rules.xlsx (`src/database/catalog.ts`, module 32), design references and authority rule sets (`src/model/designReference.ts`, module 27), the profile defaults, and setup templates. Which one wins depends on the order in `App.tsx createProject` (§5).

## 2. Files, components, functions and stores

| File | Kind | Key functions or components | What they do |
|---|---|---|---|
| `src/types.ts:553-566, 1061-1085` | model | `Project.voltageV/frequencyHz/ambientC/vdLimitPct/vdTempC/groundTempC/soilResistivityKmW/strictFinalDisconnection/strictCableData`, `StudySettings`, `STUDY_DEFAULTS`, `settingsOf`, `newProject` | The parameter fields and app defaults: 415 V, 50 Hz, 45 °C, 4 %, PF target 0.95, 20 % growth, 80 % transformer and generator loading, 2.5 / 4 mm², 100 / 30 mA. Stored in the project file. |
| `src/components/ProjectSettings.tsx` | screen | `ProjectSettings` (tabs `system`, `targets`, `forms`, `schedule`) | Edits every parameter above except `strictFinalDisconnection`. Embeds `RuleRows`. Blocks Save while `ruleIssues` reports problems. |
| `src/model/designRules.ts` | model | `RULE_KINDS`, `resolveRule`, `matches`, `hasRules`, `ruleKey`, `normaliseRules`, `ruleIssues` | Rule rows for `minWireMm2` and `elcbMa`. The most specific matching row wins; a later row wins a tie. Stored in `Project.designRules`. |
| `src/components/docs/RuleRows.tsx` | screen | `RuleRows`, `appliesText`, `newRule` | Table editor for rule rows. Rows from a design reference are shown greyed and read-only. |
| `src/model/params.ts` | model | `paramList`, `PEOPLE`, `fillParams`, `boardValue`, `boardParamNames`, `evaluate` | `{Name}` and `{BOARD.Prop}` substitution in text. `evaluate` is a safe formula evaluator for user components. Values are stored in `Project.params`. |
| `src/components/docs/ParametersView.tsx` | screen | `ParametersView` | Home → Parameters. Edits people, dates and custom values, and the SLD notes (`drawing.notes`). "Save as" writes notes to localStorage `lvds.sldNotes`. |
| `src/model/presets.ts` | model | `BUILT_IN_PRESETS`, `loadUserPresets`, `saveUserPresets`, `mergePresets`, `presetFromFeeder`, `applyPreset`, `canDropPreset`, `presetCard`, `presetsFile`, `readPresetsFile` | Feeder presets. User presets are in localStorage `lvds.feederPresets`, with a copy in `Project.feederPresets`. `applyPreset` adds the board or load to the SLD and sizes it. |
| `src/components/PresetEditor.tsx` | screen | `PresetEditor` | Modal that edits one preset. |
| `src/model/profile.ts` | model | `UserProfile`, `DesignDefaults`, `AppPrefs`, `loadPrefs`, `savePrefs`, `applyDefaults`, `applyProfile`, `defaultsFromProject`, `readLogo` | The user's details and design defaults, in localStorage `lvds.preferences`. `applyDefaults` puts them into a new project. |
| `src/model/setupTemplate.ts` | model | `SetupTemplate`, `templateFrom`, `briefFromTemplate`, `applyTemplateSystem`, `templateOverrides`, `loadTemplates`, `saveTemplates` | Job setup templates, in localStorage `lvds.setupTemplates`. The `system` part holds only voltage, frequency, ambient and VD limit. |
| `src/model/setupPreview.ts` | model | `defaultsPreview`, `withTemplate` | Rows for the New project wizard: "value, and where it came from" (built-in / company database / your profile / setup template). |
| `src/model/designStage.ts` | model | `STAGE_INFO`, `stageOf`, `stagesOf`, `nextStage`, `prevStage`, `setStage`, `advanceStage`, `stepBackStage`, `splitByStage`, `viewStage` | Stage and stage gates in `Project.stage`. `advanceStage` issues a revision (`issueRevision`) and sets a baseline (`setBaseline`). `splitByStage` decides which to-do items count at this stage. |
| `src/database/database.ts:58-70, 337-353` | model (module 32) | `PARAMETERS`, `projectDefaults`, `applyParameters` | Parameters.xlsx: company defaults for 11 of the values. |
| `src/model/designReference.ts` | model (module 27) | `REF_FIELDS`, `applyReference`, `referenceSourceOf`, `settingSource`, `changedSinceApplied` | Authority / standard / company value sets. When applied, they write into the parameter fields and `designRules`. |

## 3. Inputs — where its data comes from

| Data | From module (ID) | File + function |
|---|---|---|
| App defaults for a new project | 02-project-storage | `src/types.ts newProject`, `STUDY_DEFAULTS` |
| Company defaults (Parameters.xlsx) | 32-component-database | `src/database/database.ts projectDefaults` / `applyParameters` |
| Global rules (Rules.xlsx) | 32-component-database | `src/database/catalog.ts rule` |
| Authority / standard values and rule rows | 27-review-submissions-authority | `src/model/designReference.ts applyReference`, `resolveReference` |
| Project brief (role, authority, scope) for templates | 04-building-load-assessment / 02-project-storage | `src/model/brief.ts deliverableCatalog`; `setupTemplate.ts templateFrom` |
| System totals for `{TCL}`, `{MaxDemand}`, `{PF}`, `{TransformerKVA}`, board values | 06-network-sld-editor | `src/calc/summary.ts systemSummary`, `boardTotals`, `boardSummary` (called in `params.ts paramList` / `boardValue`) |
| GFA for `{GFA}` | 04-building-load-assessment | `src/calc/building.ts builtUpAreaOf` |
| Revision for `{Rev}` | 26-revisions-changes | `src/model/revisions.ts currentRevision` |
| Feeder sizing when a preset is dropped | 11-breaker-cable-selection, 06-network-sld-editor | `src/calc/sizing.ts recommend`, `applyRecommendation`; `src/calc/electrical.ts selectCable`, `upstreamVoltageDropPct` |
| To-do findings to split by stage | 28-dashboard-readiness | `src/calc/dashboard.ts TodoItem` → `designStage.ts splitByStage` |

## 4. Outputs — where its results go

### 4a. Which calc modules read each parameter (working links)

| Parameter (field) | Read by (module ID) | File + function |
|---|---|---|
| `voltageV` | 06, 08, 09, 11, 12, 13, 15, 16, 07 | `electrical.ts designCurrentA:77-82`, `faultCurrentKA`, `supplyImpedance`; `voltageDrop.ts vdRow:85`; `earthing.ts disconnectionBasis:68`; `loadSchedule.ts elcbGroups:309`; `pfc.ts`; `SolarStudy.tsx sizePv(s, project.voltageV)`; `exportDss.ts`; `lvds_engine.py:140,346` |
| `ambientC` | 06, 11, 14, 28 | `electrical.ts deratedAmpacityA:134`, `selectCableRuns:243`; `installation.ts ratingBasis:47`; `busbar.ts sizeRiser:161`; `dashboard.ts:205 ambientCheck` |
| `vdLimitPct` | 06, 08, 11, 14, 16, 25 | `electrical.ts evaluateFeeder:412`; `voltageDrop.ts vdRow:89`; `sizing.ts recommend:286`; `busbar.ts:325`; `unbalancedFlow.ts:139`; `quickFix.ts:20`; `compliance.ts:94` |
| `vdTempC` | 06, 08, 09, 16 | `electrical.ts:104,127`; `voltageDrop.ts:80`; `unbalancedFlow.ts:78`; `external.ts:12 rFactor`; `exportDss.ts:120` |
| `groundTempC`, `soilResistivityKmW` | 11 | `installation.ts ratingBasis:43`, `groundChecks:75-76` |
| `strictFinalDisconnection` | 09 | `earthing.ts disconnectionBasis:72` |
| `strictCableData` | 11, 28 | `cableTable.ts cableDataFindings:210` |
| `studySettings.pfTarget` | 13, 12, 06, 07 | `pfc.ts:151`; `txGen.ts:138`; `summary.ts:62`; `loadSchedule.ts:213` (`switchedOnBoard`) |
| `futureGrowthPct`, `transformerMaxLoadingPct` | 12, 28, 33 | `sizing.ts:49`; `txGen.ts:116`; `parallelTx.ts:45`; `dashboard.ts:79`; `existing.ts:40` |
| `generatorMaxLoadingPct` | 12 | `sizing.ts:128,175`; `txGen.ts:244` |
| `minWire*`, `elcb*` + `designRules` | 07, 09, 20, 17 | `loadSchedule.ts minWireMm2:137`, `elcbGroups:330-335`; `schedule.ts refresh:21`; `earthing.ts rcdOf:240`; `bom.ts:135`; `enclosureLibrary.ts:136` |
| `info.mdDemandFactor` | 07, 24 (forms only) | `docs/mdSheet.ts:110`, `docs/riserForm.ts:48` |
| Rules.xlsx `motorStartVdLimitPct` | 08 | `voltageDrop.ts motorStartVdLimit:52`, `vdRow:110` |
| Rules.xlsx `pfMinimum` | 13 | `pfcCalc.ts:152`, `docs/pfcReport.ts:60` |

### 4b. Other outputs

| Result | Used by module (ID) | File + function |
|---|---|---|
| Design criteria table in the design basis report | 25-reports-exports | `src/docs/designBasis.ts:180-200` (`settingsOf`, `referenceSourceOf`) |
| Calc report criteria | 25-reports-exports | `src/docs/calcReport.ts:88`, `calcSections.ts:62,76,95` |
| `{Name}` text | 23-cad-sheets-plot-titleblock, 24-drawings-sld-sheets | `docs/sldSheet.ts`, `sheetDxf.ts`, `titleBlockDxf.ts`, `planLayout.ts:632`, `model/titleBlock.ts:191`, `model/components.ts:61` (`fillParams`) |
| Preset placed on the SLD | 06-network-sld-editor | `src/model/sldEdit.ts:414 → applyPreset`; `EquipmentPalette.tsx` (`presetCard`) |
| Stage status on sheets | 24-drawings-sld-sheets | `designStage.ts stampSheets` → `drawingSet.status` |
| Stage gate revision and baseline | 26-revisions-changes | `advanceStage` → `issueRevision`, `setBaseline` |
| Counted / later to-do items, readiness | 28-dashboard-readiness | `ProjectDashboard.tsx`, `calc/projectReadiness.ts` (`splitByStage`, `stageIndex`, `gateOf`) |
| Parameter change tracking | 26-revisions-changes | `model/revisions.ts:141-143`, `model/designChanges.ts:73`, `model/changeClass.ts:34-35` |
| Settings exposed to the CLI | 31-headless-cli-mcp | `src/headless/tools.ts:103` (read-only: voltage, frequency, ambient, VD limit) |
| Design export contract | 30-exchange-inbox | `exchange/designExport.ts:69` (voltage, frequency and VD limit only) |

## 5. User flow — from button click to result

**New project**
1. The wizard (`BriefEditor.tsx NewProjectWizard`) shows "The project will start with": `withTemplate(defaultsPreview(db, prefs), tpl)` (`BriefEditor.tsx:242`, `setupPreview.ts`).

**Edit the design basis**
1. Ribbon / Home → Project settings opens `ProjectSettings`. Edits go into a local copy `p`.
2. On the Load schedule tab, `RuleRows` edits the project's own rule rows. `ruleIssues` blocks Save.
4. The studies read the values through the functions in §4a.

**Feeder preset**
1. Drag a palette card (`EquipmentPalette.tsx presetCard`) onto a busbar → `sldEdit.ts:414` → `presets.ts applyPreset`.
2. For a load preset, the draft feeder goes through `recommend(..., 'optimise')` + `applyRecommendation`. If the preset fixes the breaker rating, the cable is reselected with `selectCable` against `vdLimitPct × 0.85 − upstream`.
4. Save as preset: `presetFromFeeder` → `saveUserPresets` (localStorage) and a copy in `Project.feederPresets` (`App.tsx:967`).

**Stage gate**
1. Dashboard / ribbon → `App.tsx:413 advanceStage` → `issueRevision` + `setBaseline` + gate record → the next stage's sheet status is stamped on the drawings.

## 6. Linked to (working connections)

- 06, 08, 09, 11, 12, 13, 14, 16 read voltage, ambient, VD limit, VD temperature and study settings through `settingsOf` and the `Project` fields (§4a).
- 07-load-schedule-panels: design rules and study settings set the minimum wire and ELCB sensitivity (`loadSchedule.ts minWireMm2`, `elcbGroups`). `schedule.ts refresh` enforces the minimum wire on auto-sized circuits.
- 27-review-submissions-authority: `applyReference` writes values and rules. `settingSource` shows "From DEWA v2 · clause" under the fields.
- 32-component-database: Parameters.xlsx (`applyParameters`, also applied from the Database page, `App.tsx:1560`) and Rules.xlsx (`rule`).
- 25-reports-exports: the design basis criteria table shows each value's source and flags app defaults (`designBasis.ts fromSettings`).
- 26-revisions-changes: parameter edits appear in revision diffs (`revisions.ts:141-143`). Stage gates issue revisions.
- 28-dashboard-readiness: `splitByStage` and `ambientCheck`.
- 23 / 24: `fillParams` in title blocks, notes and DXF.



---

*Public summary: describes what the module does and how it connects. The engineering review of open issues is kept separately.*
