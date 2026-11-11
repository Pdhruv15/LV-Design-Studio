# 33 — Quick calculators, motor calc, existing-installation checks
[← Index](00-index.md) · [Integration map](99-integration-map.md)

## 1. What it does

The module has three parts.

   - Power & current: three modes. Power → current (`currentFromPower`), current → power (`powerFromCurrent`), and any two of kW / kVA / kVAr / PF (`triangle`).
   - Cable & breaker: the next standard breaker In ≥ Ib (`nextBreaker`). Then the smallest Cu cable, adding parallel runs when needed, with Iz ≥ max(Ib, In) after ambient × grouping derating and the voltage drop within the limit (`cableFor`, which calls `selectCableRuns` in `electrical.ts`). Also a table of nearby sizes (`cableCandidates`).
   - Voltage drop: ΔV = √3 (or 2 for 1-phase) · I · L · (R cosφ + X sinφ) ÷ runs (`voltageDrop`). Also max length, other sizes and a chart.
   - Transformer: FLC = S ÷ √3U. LV terminal fault Ik″ = c · In ÷ uk, with c = 1.05 and an infinite MV source (`transformer`).
   - Motor: FLC from output kW, PF and η. Starting current = FLC × starter multiple (`motor`, `STARTERS`). Screening voltage dip at the source = S_start ÷ (S_start + S_source ÷ Z) (`startingDip`).
   - PF correction: Q = P (tan φ1 − tan φ2) (`pfCorrection`) and a bank of equal steps (`pfcBank`).
   - Fault level at cable end: from a transformer (`faultFromTransformer`) or from a known fault level at the start (`faultAtCableEnd`, X/R = 5). Both use `cableImpedance` (R at 20 °C) and `faultCurrentKA`.
   - Lighting lux (lumen method, `lumenMethod` from `src/calc/lighting.ts`, owned by 18-lighting-emergency), Ohm's law (`ohm`), energy & cost (`energy`), unit conversions (`awgToMm2`, `mm2ToAwg`, `kcmilToMm2`, `HP_KW`).
2. **Motor starting data** (`src/calc/motor.ts`). The starter table (`STARTERS`: DOL 6×, star-delta 2×, soft starter 3×, VFD 1.2×), the motor test (`isMotor`), `starterOf`, `runningKva`, `startingKva` and the generator dip `motorStartDipPct` (fixed X′d = 25 %, limit 15 %). These are used by the quick motor card and by the network, voltage-drop, generator and scenario calculations.
3. **Existing-installation checks** (`src/model/existing.ts`, `src/calc/existing.ts`, `src/components/studies/ExistingChecks.tsx`). A board can be marked *existing* and given a recorded maximum demand (kVA, or A converted at √3·U), PF, margin %, date and source, spare ways found at the survey, and "other buildings" on a shared supply. The recorded MD **covers** all existing load at and below the board, and new load is added on top (`existingLoad`, `recordedPQ`, used inside the load totals of `electrical.ts`, `summary.ts`, `loadSchedule.ts`). `existingChecks` builds six kinds of check row:
   - transformer spare capacity against kVA × the design loading limit;
   - incomer / busbar loading;
   - each existing feeder's Ib ≤ In ≤ Iz, Icu and voltage drop;
   - new ways against spare ways;
   - load kept for each other building;
   - a new transformer on an existing RMU (at most 2 per RMU).

## 2. Files, components, functions and stores

("Store" = the place the app keeps data. Here the project object, plus browser `localStorage` for quick-calculator inputs.)

| File | Kind | Key functions or components | What they do |
|---|---|---|---|
| `src/components/QuickCalcs.tsx` | screen | `QuickCalcs` (default, :153), `useInputs` (:38), `restore` (:29), `useTab` (:122), `Card`, `Field`, `Pick`, `BreakerOutput` (:137), `sizeCable` (:234) | The "Quick calculators" page, its 11 tabs, input memory and the right-hand panels (steps, tables, charts). "Size the cable for … A" carries a current from the Power tab into the Cable tab. |
| `src/components/QuickAsides.tsx` | screen | `PowerTriangle` (:10), `Steps` (:33), `SupplyStrip` (:38), `CandidatesTable` (:59), `LineChart` (:94), `RefTable` (:133), `PfcTriangles` (:148) | Drawing and table helpers. `SupplyStrip` works out the current again and a capacitor for PF 0.95. |
| `src/calc/quick.ts` | calc | `currentFromPower` (:34), `powerFromCurrent` (:43), `triangle` (:60), `voltageDrop` (:93), `nextBreaker` (:112), `cableFor` (:125), `transformer` (:145), `motor` (:153), `pfCorrection` (:167), `faultAtCableEnd` (:179), `faultFromTransformer` (:190), `ohm` (:198), `energy` (:215), `awgToMm2`/`mm2ToAwg`/`kcmilToMm2` (:222–226), `cableCandidates` (:234), `TX_RATINGS_KVA` (:248), `pfcBank` (:252), `startingDip` (:264) | The quick formulas. Cable data, R/X, breaker list and fault formulas come from `cableTable.ts`, `electrical.ts` and `sizing.ts`. |
| `src/calc/motor.ts` | calc | `STARTERS` (:7), `isMotor` (:14), `starterOf` (:17), `starterInfo` (:19), `runningKva` (:22), `startingKva` (:25), `GENERATOR_XD_TRANSIENT_PCT` (:28), `MOTOR_START_DIP_LIMIT_PCT` (:30), `motorStartDipPct` (:34) | Starter multiples and motor starting kVA for the whole app. |
| `src/model/existing.ts` | model | `DEFAULT_EXISTING_PF` (:17), `isExisting` (:19), `otherKva` (:22), `recordedKva` (:25), `othersKva` (:34), `drawnExistingKva` (:37), `existingLoad` (:58), `recordedPQ` (:66), `recordedText` (:74) | Turns the survey data on a board into an existing load (kVA, or P/Q) that covers the load below it. Also the "MD 610 kVA (DEWA reading, …)" label. |
| `src/calc/existing.ts` | calc | `ExistingCheck` (:19), `newDemandKva` (:33), `newWaysOn` (:36), `existingChecks` (:38) | Builds the check rows. |
| `src/components/studies/ExistingChecks.tsx` | screen | `ExistingChecksCard` (:9) | "Existing installation" card at the top of the Transformer & generator sizing page. Shown only when a board is existing. |
| `src/types.ts` | model | `ExistingInfo` (:281), `OtherBuilding` (:301), `Board.existing` (:367), `Feeder.existing` (:215), `Feeder.starter` (:238), `StarterType` (:142) | Saved fields in the project file. |
| `src/components/BoardFields.tsx` | screen | existing block (:87–110) | Where the recorded MD, A, PF, margin, date, source, spare ways and other buildings are typed (owned by 06/07). |

## 3. Inputs — where its data comes from

| Data | From module (ID) | File + function |
|---|---|---|
| Default voltage, ambient, VD limit for the quick cards | 03-parameters-rules / 02-project-storage | `QuickCalcs.tsx:QuickCalcs` reads `project.voltageV`, `project.ambientC`, `project.vdLimitPct` (:154–155, :222, :237) |
| Cable sizes, R20, X, ampacity (method E), ambient factor | 11-breaker-cable-selection / 32-component-database | `cableTable.ts:cables`, `getCable`, `ambientCorrectionFactor` |
| R at operating temperature (always 1.2 × R20 in quick) | 06-network-sld-editor | `electrical.ts:rOperatingOhmPerKm` (:31), `resistanceFactor` (:38) |
| Cable search (sizes, runs, VD) | 06-network-sld-editor | `electrical.ts:selectCableRuns` (:220) |
| Standard breaker ratings | 11-breaker-cable-selection / 32-component-database | `sizing.ts:breakerRatings` (:18) |
| Transformer / cable impedance, c max, Ik″ | 06-network-sld-editor | `electrical.ts:transformerImpedance` (:253), `cableImpedance` (:271), `C_MAX` (:335), `faultCurrentKA` (:343) |
| Lumen method, lux targets, reflectances | 18-lighting-emergency | `lighting.ts:lumenMethod`, `LUX_TARGETS`, `REFLECTANCES` |
| Board survey data (recorded MD, PF, margin, spares, other buildings) | 06-network-sld-editor | `BoardFields.tsx` existing block → `Board.existing` |
| Existing flag on feeders | 06-network-sld-editor / 07-load-schedule-panels | `Feeder.existing` |
| Feeder results (Ib, Iz, Vd, Icu status) for existing feeders | 06-network-sld-editor | `electrical.ts:evaluateProject` (:427), called in `ExistingChecks.tsx:ExistingChecksCard` and `calcReport.ts:calcReportData` |
| Board totals and summary | 06-network-sld-editor / 07-load-schedule-panels | `summary.ts:boardSummary`, `boardTotals` |
| Transformer design loading limit | 03-parameters-rules | `settingsOf(project).transformerMaxLoadingPct` in `existing.ts:existingChecks` (:40) |
| Transformer units per board (for the RMU check) | 09-earthing / 12-transformer-generator | `earthingPlan.ts:txUnits` |
| Motor starter per feeder | 06-network-sld-editor | `FeederForm.tsx` starter select (:167), `sldEdit.ts` starter palette (:127, :460) |

## 4. Outputs — where its results go

| Result | Used by module (ID) | File + function |
|---|---|---|
| Recorded MD covering existing load (P, Q) | 06-network-sld-editor, 07-load-schedule-panels, 12-transformer-generator | `electrical.ts:boardDemandKw` (:62), `summary.ts` (:44), `loadSchedule.ts` (:190, :228) call `recordedPQ` |
| "MD … kVA (source, date)" label on the system diagram | 06-network-sld-editor | `SystemDiagram.tsx` (:371, :994, :1689) call `recordedKva`, `recordedText` |
| Existing checks on screen | 12-transformer-generator | `SizingStudy.tsx` (:89) renders `ExistingChecksCard` |
| Existing checks in the sizing study section (PDF / Word / Excel) | 25-reports-exports | `studyReport.ts:buildSection` 'sizing' (:382 filter, :398 method text, :422 table) |
| Existing checks in the calculation report | 25-reports-exports | `calcReport.ts:CALC_REPORT_STUDIES` includes 'sizing' (:26), with real results (:34) |
| Existing boards / feeders left out of the BOQ | 20-equipment-boq-pricing | `bom.ts` (:106, :194, :211, :221, :298) skip `b.existing` / `f.existing` |
| Starter multiples, running / starting kVA | 12-transformer-generator | `txGen.ts` (:248–271), `sizing.ts` (:179–181) |
| Starter multiple for motor-start voltage drop | 08-voltage-drop | `voltageDrop.ts` (:90) `starterInfo(starterOf(f)).multiple` |
| Generator dip in outage scenarios | 12-transformer-generator / 06-network-sld-editor | `scenario.ts` (:62–69), `SystemDiagram.tsx` (:1471, :1510) |
| Starter symbol / label on SLD | 24-drawings-sld-sheets / 06-network-sld-editor | `sldDevices.ts` (:27–30), `IecSymbols.tsx` (:83) |
| Quick formulas as CLI / MCP tools | 31-headless-cli-mcp | `headless/tools.ts` `calc_current`, `calc_voltage_drop`, `calc_cable_size`, `calc_transformer`, `calc_fault_level`, `calc_motor`, `calc_pf_correction` (:196–281) |
| Starter list in component / preset editors | 32-component-database / 03-parameters-rules | `ComponentEditor.tsx` (:46), `PresetEditor.tsx` (:69) |

## 5. User flow — from button click to result

**Quick calculators**
1. Left menu → Calculators: `App.tsx` (:1644) renders the lazily loaded `QuickCalcs` with the project (view `calculators`).
2. `useTab` restores the last tab from `localStorage` (`lvds.quick.tab`). `useInputs` restores each card's inputs. `restore` drops a saved value when its default (e.g. project voltage) has changed since it was saved.
3. The user types a value. `Field` → `set` → `useInputs` saves to `localStorage` and re-renders.
4. `quickInputErrors(card, values)` checks the inputs. If there is any error, `Card` shows "Correct the highlighted inputs" and no result.
5. Otherwise the card's calc runs. For example the Cable tab calls `cableFor` → `nextBreaker` → `selectCableRuns` → `voltageDrop`, and `cableCandidates` fills the side table.
6. Asides (`Steps`, `RefTable`, `LineChart`) show the worked steps. On the Power tab, "Size the cable for … A" (`SupplyStrip.onCable` → `sizeCable`) copies the current into the Cable tab.
7. Nothing is written to the project. "Reset inputs" clears the card's `localStorage` key.

**Existing installation**
1. On the system diagram the user opens a board and ticks Existing in its properties (`BoardFields.tsx`). They then enter the recorded MD, PF, margin, spares and other buildings → `Board.existing`.
2. Every load total reads `recordedPQ` (via `existingLoad`). The recorded MD replaces the existing feeders below that board, and new feeders are added on top.
3. Studies → Transformer & generator sizing: `SizingStudy` renders `ExistingChecksCard`. That runs `evaluateProject` and then `existingChecks`, and shows the table with status counts.
4. Reports: the sizing section of the study report / calculation report calls `existingChecks(p, data.results)`. For a partial scope it keeps only rows of the boards in scope.

## 6. Linked to (working connections)

- **06-network-sld-editor**: quick VD, fault and cable sums reuse `rOperatingOhmPerKm`, `cableImpedance`, `transformerImpedance`, `faultCurrentKA`, `C_MAX` and `selectCableRuns`. These are the same R/X data and fault formulas. The recorded MD enters every board total through `recordedPQ`.
- **11-breaker-cable-selection / 32-component-database**: the quick cards use the same cable table (`cables()`, which is Cables.xlsx when loaded) and breaker list (`breakerRatings()`).
- **12-transformer-generator**: `ExistingChecksCard` sits on the sizing page. `STARTERS`, `runningKva`, `startingKva` and `motorStartDipPct` drive generator sizing for motor starting.
- **08-voltage-drop**: the motor-start voltage drop uses `starterInfo(...).multiple`.
- **25-reports-exports**: existing checks appear in the sizing section of the calculation report and of the study reports.
- **20-equipment-boq-pricing**: existing boards and feeders are left out of the BOQ.
- **31-headless-cli-mcp**: seven quick formulas are exposed as MCP / CLI tools.
- **18-lighting-emergency**: the lux tab calls the shared `lumenMethod`.



---

*Public summary: describes what the module does and how it connects. The engineering review of open issues is kept separately.*
