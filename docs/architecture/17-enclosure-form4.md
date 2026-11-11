# 17 — Enclosure sizing, Form 4 sizing, enclosure library and workbook
[← Index](00-index.md) · [Integration map](99-integration-map.md)

## 1. What it does

1. **Distribution boards (DB / EDB): module counting against a supplier catalogue.** The check is `src/calc/enclosure.ts:sizeEnclosure`:
   *equipment modules + future spare modules ≤ usable modules of the enclosure for the allowance case that applies.*
   - A module is one 18 mm DIN-rail width.
   - An **allowance case** is the supplier's deduction for terminals and incoming-cable space. It depends on the ELCB (RCCB) count and, for fabricated boxes, on the incomer current.
   - Equipment modules can be typed by hand ("Manual"), or counted from the board's load schedule ("From schedule"). In schedule mode, each device takes its width from a **device dimension record**: the user's own record first, then the built-in manufacturer data, then the built-in "typical" widths.
   - Three built-in catalogues are typed into the code: modular (rows × 16/24), fabricated, and weatherproof (`MODULAR`, `FABRICATED`, `WEATHERPROOF`).
2. **MDB / SMDB: Form-4 line-up width (`src/calc/form4.ts:sizeForm4`).** This follows the owner's worksheet "LV PANEL SIZE SELECTION.xlsx — FORM-4 Design Work Sheet":
   - width = Σ(quantity × fixed cubicle width) for incomers, busbar risers, capacitor-bank breakers and large outgoings;
   - plus stacked 600 mm sections (1800 mm usable height each) for the smaller MCCBs;
   - plus 300 mm cable chambers.
   - Height H2100 + 100 mm plinth and depth D800 are fixed.
   - Quantities can be counted from the SLD (`src/model/form4Count.ts:form4FromSld`) or typed by hand.
   - The result is drawn as a dimensioned front view and plan view (`src/diagram/form4Drawing.ts`). The same geometry feeds the screen (SVG), the PDF and an R12 DXF.

The chosen size is kept on the board as a **frozen copy**: `Board.enclosure` or `Board.form4` (`src/types.ts:384–386`). It is then printed in the BOQ/BOM panel description (`src/calc/bom.ts:110–120`).

**No temperature-rise or heat-dissipation check exists anywhere.** That would be IEC 61439-1 §10.10 verification, or the IEC TR 60890 calculation method. Both tabs only print a disclaimer saying it is a separate check (`EnclosureSizing.tsx:161,168`, `Form4Sizing.tsx:72`, `enclosure.ts:13`, `form4.ts:14`).

## 2. Files, components, functions and stores

("Store" = the place the app keeps the project in memory. Here that is the project object passed through `onChange`. "localStorage" = a small per-computer browser store inside the app.)

| File | Kind | Key functions or components | What they do |
|---|---|---|---|
| `src/calc/enclosure.ts` | calc | `MODULAR` (:59), `FABRICATED` (:79), `WEATHERPROOF` (:106), `BUILTIN_CATALOGUES` (:125), `applicableRules` (:142), `sizeEnclosure` (:173), `selectionFrom` (:210), `spareFromPct` (:139), `DEFAULT_SPARE_PCT` (:137); types `EnclosureCatalogue`, `EnclosureConfig`, `AllowanceRule`, `SizingInput`, `Candidate`, `EnclosureSelection` | Built-in supplier charts, typed into the code. Finds which allowance cases apply, lists every size × case as fits / too-small / not-listed / confirm, and builds the frozen selection. |
| `src/calc/form4.ts` | calc | `FORM4_COLUMNS` (:34), `FORM4_GROUPS` (:58), `FORM4_HEIGHT/PLINTH/DEPTH/STACK` (:68–71), `sizeForm4` (:96), `stackSections` (:130), `form4Selection` (:154), `form4SizeText` (:160) | The Form-4 worksheet as code: 21 columns with fixed cubicle widths (500/600/800 mm) or stacked heights (200–400 mm). Gives the width build-up and the section count, and saves a frozen copy. |
| `src/model/form4Count.ts` | model | `FORM4_ROLES` (:7), `isForm4Board` (:8), `riserColumn` (:22), `capacitorColumn` (:33), `outgoingColumn` (:41), `form4IncomerA` (:55), `form4FromSld` (:61) | Sorts an MDB/SMDB's SLD breakers into worksheet columns by rating and role (incomer, riser ≥ 800 A to another board, capacitor, outgoing, spare). |
| `src/model/enclosureWorkbook.ts` | model (import/export) | `catalogueWorkbook` (:10), `readCatalogueWorkbook` (:32) | Excel template, export and import of a catalogue (sheets Catalogue, Cases, Sizes). |
| `src/data/brandDevices.ts` | data | `ROWS` (:11), `BRAND_DEVICES` (:30) | 16 built-in manufacturer device rows (W × H × D mm). DIN width ÷ 18 gives modules; chassis and door devices get 0 modules. |
| `src/diagram/form4Drawing.ts` | report / drawing | `FORM4_LAYERS` (:9), `hDim`/`vDim` (:21,:34), `form4Drawing` (:46), `form4Dxf` (:105), `form4DrawingSvg` (:111) | Front and plan views in real mm. Output as DXF primitives, R12 DXF, or SVG (colour on screen, black for the PDF). |
| `src/components/EnclosureSizing.tsx` | screen | `EnclosureSizing` (:60, tab switch), `DbSizing` (:68), `preview` (:22), `addWidth` (:87), `choosePanel` (:120), `use` (:139), `exportSheet` (:146) | DB tab: inputs, device list, catalogue matches, preview SVG, "Use for <panel>" (saves `Board.enclosure`), A4 PDF size sheet. |
| `src/components/Form4Sizing.tsx` | screen | `Form4Sizing` (:19), `CONFIRM` (:12), `use` (:47), `exportSheet` (:54), `exportDxf` (:79) | Form-4 tab: SLD or manual quantities, width build-up, drawing, "Use for <panel>" (saves `Board.form4`), A4 PDF and DXF export. |
| `src/components/CatalogueManager.tsx` | screen | `CatalogueManager` (:21), `persist` (:32), `exportJson` (:44), `exportXlsx` (:48) | Modal for editing catalogues (cases, sizes, usable figures) and device dimension records; JSON and Excel in and out. |
| `src/types.ts` | model | `Board.enclosure` (:384), `Board.form4` (:386) | Saved in the project file. |
| `src/components/BoardPanel.tsx` | screen | enclosure line (:77–81) | Shows the saved DB enclosure on the board's General tab (DB/EDB only), with a link to the page. |

## 3. Inputs — where its data comes from

| Data | From module (ID) | File + function |
|---|---|---|
| Boards, feeders, board role (DB/EDB/MDB/SMDB/…) | 02-project-storage, 06-network-sld-editor | `src/types.ts` `Board`/`Feeder`; `src/model/emergency.ts:roleOf` (:28) |
| Final circuits of a DB and their ELCB groups | 07-load-schedule-panels | `src/calc/loadSchedule.ts:scheduleCircuits`, `elcbGroups` (called in `enclosureLibrary.ts:neededDevices` :135–136) |
| Spare breakers and spaces | 07-load-schedule-panels | `src/model/spareWays.ts:spareWaysOf`, `spareBreaker` (used in `neededDevices` :144 and `form4FromSld` :88) |
| Breaker type default (MCB ≤ 63 A, else MCCB) | 09-earthing (function lives in earthing calc) | `src/calc/earthing.ts:breakerTypeOf` (:22) |
| Incomer rating | 06-network-sld-editor | feeder with `feedsBoardId` (`EnclosureSizing.tsx:96`, `form4Count.ts:form4IncomerA` :55), `Board.supply.ratingA`, `Board.ratedCurrentA` |
| Generator ACB changeover (2nd incomer cubicle) | 12-transformer-generator | `Board.standby.changeover === 'ACB'` (`form4Count.ts:78`) |

## 4. Outputs — where its results go

| Result | Used by module (ID) | File + function |
|---|---|---|
| `Board.enclosure` (frozen DB selection) | 02-project-storage (saved with project; undo step) | `EnclosureSizing.tsx:use` (:142); `App.tsx:1648` `setProject(p, { step: true })` |
| `Board.form4` (frozen Form-4 selection) | 02-project-storage | `Form4Sizing.tsx:use` (:50) |
| Enclosure text and key on the panel BOQ line; supplier "extra" busbar line | 20-equipment-boq-pricing | `src/calc/bom.ts` (:110–120); `src/model/boqScope.ts` (:165) warns about legacy panel rates whose key lacks the enclosure |
| Saved DB size shown on board | 06-network-sld-editor / 07-load-schedule-panels | `src/components/BoardPanel.tsx` (:79) |
| Change tracking of `enclosure` / `form4` fields | 26-revisions-changes | `src/model/revisions.ts` (:134), `src/model/changeClass.ts` (:29), `src/model/sheetChanges.ts:BOARD_DRAWN` (:20, `form4` only) |
| Design-stage gating of the page (detailed stage) | 03-parameters-rules | `src/model/designStage.ts` (:42) |
| A4 PDF size sheets (DB and Form-4) | 34-electron-desktop (PDF render), 25-reports-exports (not in export centre) | `EnclosureSizing.tsx:exportSheet`, `Form4Sizing.tsx:exportSheet` → `src/util/files.ts:savePdf` |
| Form-4 DXF (R12, 1:1 mm) | 24-drawings-sld-sheets (shares `toDxf`) | `form4Drawing.ts:form4Dxf` → `src/docs/dxf.ts:toDxf`; `Form4Sizing.tsx:exportDxf` |
| `matchDevice` / `BRAND_DEVICES` reused for BOQ brand references | 20-equipment-boq-pricing | `src/calc/bom.ts:brandRef` (:65) |

## 5. User flow — from button click to result

**DB tab**
1. The user opens Design → Enclosure sizing. `App.tsx:1648` mounts `EnclosureSizing`, keyed on the selected board. If the board's role is in `FORM4_ROLES`, the Form-4 tab opens (`EnclosureSizing.tsx:62`). Otherwise the DB tab opens.
2. `DbSizing` lists the DB/EDB boards (:70). The panel's saved selection (if any) sets the method, catalogue, mounting and inputs (:72–78).
3. **From schedule**: `neededDevices` (:85) builds the device list:
   - the incomer;
   - one breaker per circuit (RCBO if the circuit has its own RCD);
   - spares and spaces;
   - one RCCB per ELCB group.
   `matchDevice` maps each to a width record. `scheduleModules` (:95) sums the modules and counts the ELCBs. The user can type a width for an unmapped device. `addWidth` (:87) then saves a new device record to localStorage.
4. **Manual**: the user types equipment modules, ELCB count and incomer current.
5. Spare is a % of the equipment space (`spareFromPct`, default 20 %) or a module count (:101).
6. `sizeEnclosure` (:103) runs `applicableRules` and lists the candidates. The user can force rows or modules per row (:106–111) or click a row. `chosen` is the picked row, or else the first fit (:112).
7. `preview` (:113) draws the front and side views. The "Catalogue matches" table shows the other sizes.
9. **Export size sheet** → `exportSheet` (:146) → A4 PDF in black and white.

**Form-4 tab**
1. `Form4Sizing` lists boards where `isForm4Board` is true (:20). `form4FromSld` (:29) counts the SLD breakers into worksheet columns, with notes.
2. The user may switch to "Enter manually" and change quantities (`setQty` :41).
3. `sizeForm4` (:31) gives the width build-up. `form4DrawingSvg` (:32) draws the front and plan views.
5. **Export size sheet** (PDF, :54) or **Export DXF** (:79, `form4Dxf`).

## 6. Linked to (working connections)

- **07-load-schedule-panels**: circuits, ELCB groups and spare ways feed the DB device list (`neededDevices`). Spare ways also feed Form-4 (`form4FromSld` :88).
- **06-network-sld-editor**: feeders and ratings on the SLD give the Form-4 counts. The incomer is the feeder from the board above.
- **12-transformer-generator**: an ACB mains/generator changeover adds a second incomer cubicle (`form4Count.ts:78`).
- **20-equipment-boq-pricing**: the saved size is written into the panel BOQ description and key. The supplier "extra" (e.g. 800 mm busbar) becomes its own BOQ line (`bom.ts:120`).
- **02-project-storage**: `Board.enclosure` / `Board.form4` are saved in the project file. Each save is one undo step.
- **26-revisions-changes**: the fields are labelled and classed for change tracking.
- **32-component-database** (library sync only): the catalogues and device records travel in Library.json (`librarySync.ts:6`).
- **24-drawings-sld-sheets**: the Form-4 DXF uses the shared `toDxf` writer.



---

*Public summary: describes what the module does and how it connects. The engineering review of open issues is kept separately.*
