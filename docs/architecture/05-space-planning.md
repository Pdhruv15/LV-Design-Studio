# 05 — Space planning, substation area and DM substation sizing
[← Index](00-index.md) · [Integration map](99-integration-map.md)

## 1. What it does

Two concept-stage pages (ribbon group "1 Concept", `src/components/Ribbon.tsx:519-520`, stage map `src/model/designStage.ts:40`):

| Page (view id) | What the engineer gets |
|---|---|
| **Space plan** (`space-planning`) | Power-density planning: each area = m² × W/m² (or a fixed kW) × demand factor. Areas are fed from MDBs/SMDBs, MDBs from transformers, transformers from RMUs (ring main units, the 11 kV switchgear). Gives the maximum demand (kW, kVA), the number of transformers and RMUs needed, an automatic assignment, and a **Create SLD** button that replaces the project's boards and feeders with a sized network. |
| **Substation area** (`substation-area`) | Minimum room sizes to Dubai Municipality form **DM-D-013**: substation / transformer room, RMU room and LV room (length × width, height, m²) by substation type and number of transformers, with the form's notes, and a one-page-per-substation A4 PDF of the form in English. |

"Store" below means the project object kept in memory by the app (`setProject` in `src/App.tsx`); everything this module saves lives in two project fields: `project.spacePlan` (`SpacePlan`, `src/types.ts:831`) and `project.substations` (`DmSubstationRoom[]`, `src/types.ts:841`).

Where the numbers come from — short answer:

| Value | Source | Where |
|---|---|---|
| Max loading %, PF, growth %, transformers per RMU | Space plan's **own** settings (default 80 %, 0.9, **0 %**, 2) — not the project design settings | `src/calc/spacePlan.ts:22` `DEFAULT_PLAN_SETTINGS` |
| Transformer count | Calculated: ceil(kVA ÷ (size × loading limit)) | `src/calc/spacePlan.ts:119` `transformersFor` |
| Transformer count per substation (DM page) | Space plan transformers grouped by RMU, else SLD main boards grouped by `board.rmu`, else typed by hand | `src/calc/dmSubstation.ts:138` `substationsFromProject` |

## 2. Files, components, functions and stores

| File | Kind | Key functions or components | What they do |
|---|---|---|---|
| `src/calc/spacePlan.ts` | calc | `DEFAULT_USES`, `DEFAULT_PLAN_SETTINGS`, `PLAN_TRANSFORMER_SIZES`, `emptyPlan`, `usesOf`, `areaLoad`, `panelLoad`, `transformerLoad`, `transformersFor`, `planTransformerKva`, `summarize`, `autoAssign` | Area load (m² × W/m² × DF), panel load (own areas + SMDBs below), transformer loading %, plan summary (MD, transformers/RMUs needed, unassigned items), automatic area → MDB → transformer → RMU packing. |
| `src/calc/dmSubstation.ts` | calc | `DM_TYPES`, `dmType`, `CONVENTIONAL`, `DETACHED`, `POCKET`, `OPEN_ROOF`, `DM_NOTES`, `NOTES_BY_TYPE`, `dmSubstationAreas`, `substationsFromProject` | DM-D-013 look-up tables, room list per type/count, error when the count exceeds the type's limit, and "one substation per RMU" derivation from the project. |
| `src/docs/dmForm.ts` | report | `buildDmFormHtml` | HTML (printed to PDF) of the DM form: header, project info, room table, notes, remarks, undertaking, signature box; black-and-white. |
| `src/docs/planSheet.ts` | screen helper | `buildPlanSheet`, `applyPlanEdits` | Excel-style grid model for the area schedule (paste from Excel), validation of typed values, linking floors to Building information levels. |
| `src/model/planToSld.ts` | model | `planToSld`, `USE_LOAD_TYPE`, `lvRating` | Builds boards + feeders from the plan (one LV switchboard per transformer, planned MDB/SMDB, one feeder per area) then sizes all breakers and cables via `applyAllRecommendations` (`src/calc/sizing.ts:331`). |
| `src/components/docs/SpacePlanView.tsx` | screen | `SpacePlanView` (`auto`, `createSld`, `addPanel`, `addTransformer`, `setUse`) | Settings bar, use-type editor, summary cards, area grid, panel table, transformer/RMU table, tree. |
| `src/components/docs/SubstationAreaView.tsx` | screen | `SubstationAreaView` (`fill`, `add`, `exportPdf`), `DmReferenceTable` | One card per substation (type, count, kVA, building, remarks), totals, PDF export, full DM reference table. |
| `src/calc/building.ts` | calc (other module) | `spaceAreasFromRooms` (`:241`) | "Take areas from the rooms": one area per Building-information room; room types replace the plan's use types. |
| `src/App.tsx` | screen wiring | lazy imports `:32`, `:34`; views `:1630-1642`, `:1649` | Mounts both pages; after Create SLD switches to the Network design system view. |
| `src/types.ts` | model | `SpaceUse` `:786`, `SpaceArea` `:793`, `PlanPanel` `:807`, `PlanTransformer` `:816`, `SpacePlanSettings` `:822`, `SpacePlan` `:831`, `DmSubstationRoom` `:841`; `Project.spacePlan` `:577`, `Project.substations` `:629` | Saved data shapes. |

## 3. Inputs — where its data comes from

| Data | From module (ID) | File + function |
|---|---|---|
| Areas typed or pasted in the grid | (this module) | `src/docs/planSheet.ts:77` `applyPlanEdits` |
| Rooms, room types (W/m², DF), buildings, levels | 04-building-load-assessment | `src/calc/building.ts:241` `spaceAreasFromRooms`; `src/docs/planSheet.ts:21` `findFloor`/`matchFloor` |
| Building names for the panel "Building" drop-down | 04-building-load-assessment | `src/components/docs/SpacePlanView.tsx:155` (`project.building.buildings`) |
| SLD main boards (`sourceKva`, `rmu`, `location`) when the plan has no transformers | 06-network-sld-editor | `src/calc/dmSubstation.ts:155-157` `substationsFromProject` |
| Project info (plot no., owner, consultant, contractor) for the DM form | 02-project-storage | `src/docs/dmForm.ts:15` `buildDmFormHtml` (`project.info`) |
| Revision stamp on the DM form | 26-revisions-changes | `src/docs/dmForm.ts:24` `revisionStamp` |
| System voltage for LV switchboard rating | 03-parameters-rules (`project.voltageV`) | `src/model/planToSld.ts:49` `lvRating` |
| Standard breaker list | 11-breaker-cable-selection | `src/model/planToSld.ts:3,22` `STANDARD_BREAKER_A` |

## 4. Outputs — where its results go

| Result | Used by module (ID) | File + function |
|---|---|---|
| Boards, feeders (sized), `ties: []`, `vdSelection` cleared — replaces the SLD | 06-network-sld-editor, 11-breaker-cable-selection | `src/model/planToSld.ts:92-93` `planToSld` → `applyAllRecommendations` |
| `board.rmu` and `board.sourceKva` on the new transformer boards | 09-earthing, 12-transformer-generator, 28-dashboard-readiness | `src/model/planToSld.ts:48`; read by `src/model/earthingPlan.ts:80`, `src/calc/dashboard.ts:76-81` |
| Space-plan transformers → substations (one per RMU) | (this module, DM page); 25-reports-exports (concept report) | `src/calc/dmSubstation.ts:138` `substationsFromProject`; `src/docs/conceptReport.ts:32-33` |
| DM room areas on the concept design report ("5. Space requirements") | 25-reports-exports | `src/docs/conceptReport.ts:34-38` `conceptReport` |
| DM-D-013 PDF in the Export centre ("Authority submission forms") | 25-reports-exports | `src/components/docs/exportCatalogue.ts:148-151` |
| DM-D-013 PDF from the page | 34-electron-desktop (PDF render) | `src/components/docs/SubstationAreaView.tsx:43` `exportPdf` → `savePdf` |
| Readiness tick "Substation and room areas" | 28-dashboard-readiness | `src/calc/projectReadiness.ts:62` `stageChecklist` |
| Space-plan total m² as GFA fallback on the dashboard | 28-dashboard-readiness | `src/calc/dashboard.ts:101-103` |
| Change tracking of `spacePlan` and `substations` | 26-revisions-changes | `src/model/revisions.ts:149-150` `DATA_SETS`; `src/model/changeClass.ts:36` `PROJECT_CLASS` |
| Help guide entry | 01-app-shell | `src/help/guide.ts:37` |

## 5. User flow — from button click to result

**Space plan**
1. Ribbon → 1 Concept → *Space plan* sets view `space-planning`; `src/App.tsx:1630` mounts `SpacePlanView` with the in-memory project.
2. Optional *Take areas from the rooms* → `spaceAreasFromRooms` (`src/calc/building.ts:241`) replaces areas and the use-type list.
3. Engineer types / pastes areas in the grid → `ClassicGrid` → `applyPlanEdits` (`src/docs/planSheet.ts:77`) → `setPlan` → `onChange` → `setProject` (saved in `project.spacePlan`).
4. Settings bar (size, max loading %, transformers per RMU, PF, growth %) → `setPlan` with new `settings` (`SpacePlanView.tsx:89-99`).
5. Summary cards recompute on every change: `summarize` (`src/calc/spacePlan.ts:129`) → `areaLoad`, `kvaOf`, `planTransformerKva`, `transformersFor`.
6. *Auto-assign* / *Re-plan from scratch* → `auto()` → `autoAssign` (`src/calc/spacePlan.ts:161`): areas → MDB per building (bin-packing to the loading limit), MDBs → transformers (largest first, same building preferred), transformers → RMUs (N each).
7. Manual edits in the Panels and Transformers tables (`setPanel`, transformer size / RMU inputs).
8. *Create SLD* → `createSld()` (`SpacePlanView.tsx:55`): blocks if `unassignedAreas`/`unfedPanels`, asks confirmation, `planToSld` (`src/model/planToSld.ts:30`), saves as an undo step, then `onCreated` in `App.tsx:1635` opens Network design (system view).

**Substation area**
1. Ribbon → *Substation area* → `SubstationAreaView` (`src/App.tsx:1649`).
2. *Fill from project* → `fill()` → `substationsFromProject` (`src/calc/dmSubstation.ts:138`); replaces `project.substations` after confirmation.
3. Or *+ Substation* → `add()`; then per card choose type / count / kVA / building / remarks → `patch()` → `project.substations`.
4. Each card shows `dmSubstationAreas(type, n)` (`src/calc/dmSubstation.ts:99`) rooms or an error.
5. *Export DM form (PDF)* or per-card *PDF* → `exportPdf` → `buildDmFormHtml` (`src/docs/dmForm.ts:14`) → `savePdf` (A4 portrait).

## 6. Linked to (working connections)

- **04-building-load-assessment** (in): rooms and room types become areas and use types (`spaceAreasFromRooms`); floor names checked against Building-information levels (`applyPlanEdits`, `src/docs/planSheet.ts:110-113`).
- **06-network-sld-editor** (both): Create SLD writes boards/feeders (`planToSld`); DM page reads SLD main boards when the plan has no transformers (`substationsFromProject`).
- **25-reports-exports** (out): DM form in the Export centre (`exportCatalogue.ts:148`); DM areas in the concept report (`conceptReport.ts:32-38`).
- **28-dashboard-readiness** (out): concept checklist (`projectReadiness.ts:62`); GFA fallback (`dashboard.ts:101`).
- **26-revisions-changes** (out): both fields diffed and classed (`revisions.ts:149-150`, `changeClass.ts:36`).
- **02-project-storage** (both): saved in the project file; Create SLD is one undo step (`setProject(p, { step: true })`).



---

*Public summary: describes what the module does and how it connects. The engineering review of open issues is kept separately.*
