# 20 — Equipment schedule, bill of materials, BOQ and pricing
[← Index](00-index.md) · [Integration map](99-integration-map.md)

## 1. What it does

This module turns the design into a priced tender bill of quantities (BOQ). It has four parts.

1. **Bill of materials (BOM)**: `src/calc/bom.ts` `buildBom`. It reads the project (boards, feeders, final circuits, spare ways, earthing schematic, RMUs, bus couplers, PV, EV chargers, CAD luminaires, busbar risers, cable trays and ELV lines) and adds every item to one list. Each item has a stable **key**: a text ID such as `cable:XLPE/PVC/SWA:4C:95` that also carries the specification. Items with the same key are added together. Each item is filed in a tender section, A–J (plus P for ELV).
2. **Pricing**: `src/model/priceList.ts` `priceBom`. Each BOM line gets a supply rate and an installation rate. The app takes the first rate it finds in this order: the project's price list, then the component database (Excel catalogue), then the built-in illustrative rates (`src/data/rates.ts`, `typicalRate`). On top of that it applies the per-section wastage %, quantity overrides, manual lines, scope (new / retain / relocate / remove / replace, and who supplies and who installs), packages, markup, discount and VAT.
3. **Scope review and revisions**:
   - `src/model/boqScope.ts` `boqReview` runs the pre-issue checks.
   - `src/model/boqRevisions.ts` records issued BOQ revisions (Rev 0, 1, 2…). Item numbers stay fixed once issued, and the "what changed" list is worked out by comparing lines.
4. **Outputs**:
   - the screen `src/components/docs/BomView.tsx`;
   - an Excel BOQ, a PDF BOQ and a price template, plus price import (`src/docs/boqWorkbook.ts`);
   - a "Per circuit" quick-cost table (`src/components/BoqTable.tsx`);
   - the separate **Equipment schedule** (`src/components/docs/Documents.tsx` `EquipmentScheduleView` → `src/docs/schedules.ts` `equipmentSchedule`), which lists transformers and boards only.

### What the BOQ counts (from `buildBom`)

| Section | Item (key prefix) | Quantity source | File + line |
|---|---|---|---|
| A | Panel / switchboard per new board (`panel:`), enclosure extra (`enc-extra:`) | 1 per board; enclosure / Form-4 data from the board | `src/calc/bom.ts:105-121` |
| B | Main-board incomer ACB/MCCB (`incomer:`), main boards only | `b.supply.device`, else ACB above 630 A | `bom.ts:123-127` |
| B | RCCB/ELCB groups (`rccb:`), SPD (`spd:`), relays (`relay:`) | load-schedule ELCB groups; SPD per incomer | `bom.ts:135-148` |
| B | Changeover ACB pair (`acb-il:`) or ATS (`ats:`) | board standby / changeover data | `bom.ts:150-160` |
| B | Bus couplers (`tie:`) | `project.ties` | `bom.ts:204-207` |
| B | Spare-way breakers; outgoing breakers (`mcb:`/`mccb:`/`acb:`/`switch-isol:`); RCDs (`rcd:`); local isolators (`iso:`) | `spareWaysOf`, every new feeder | `bom.ts:210-227` |
| C | kWh meters, PMU, CT sets, APFC relay, ammeter / voltmeter / lamps | board / feeder flags, × incomers | `bom.ts:128-166`, `226` |
| D | Generator (`gen:`), transformer (`tx:`, × `txUnits`), UPS (`ups:`, only a board of kind UPS with `upsKva`), RMU (`rmu:`, supply / install by others) | board fields | `bom.ts:161`, `176-177`, `193-202` |
| D | Capacitor banks (`cap:`) | feeders with `kvar` (added by the PFC study's `addPfcBanks`) | `bom.ts:228` |
| D | EV charger (`ev-charger:`) | load type EV, kW | `bom.ts:254-260` |
| D | Solar PV modules, mounting, inverters, DC cable sets, connectors, DC isolators, DC SPD, AC isolator | `sizePv(p.pv)` | `bom.ts:263-285` |
| E | Sub-main cable (`cable:<type>:<cores>C:<csa>`), metres = `lengthM × parallel runs` | `f.lengthM` | `bom.ts:231-243` |
| E | Final-circuit wiring (`wire-conductor:<csa>`), conductor metres = length × runs × cores | `f.lengthM` | `bom.ts:234-238` |
| F | Glands (2 per run) and lugs (2 × runs × cores) | per sub-main | `bom.ts:247-250` |
| G | Busbar trunking lengths, elbows, feed unit, end cap, tap-offs, hangers | `sizeRiser` | `bom.ts:322-333` |
| H | Tray / ladder lengths, bends, tees, reducers, risers, supports, couplers, covers | `trayQuantities(sizeRoute…)` | `bom.ts:336-351` |
| I | Earth pits (default 2 per main board, or from the earthing schematic), MET, pit links, body bonds; final-circuit CPC; ECC only on **armoured** sub-mains | `earthingLayout`, `cpcOf` | `bom.ts:168-190`, `239`, `245` |
| J | Luminaires and emergency fittings placed on the CAD plans, by type | `luminaireSchedule` (from `lvPoints`) | `bom.ts:289-292` |
| J | Load-schedule point counts (sockets, switches, spurs…), **opt-in** with `boq.includeSchedulePoints` | `scheduleCircuits` points / load items | `bom.ts:295-319` |
| P | ELV lines the engineer pushed from the ELV module | `p.elvBoq.lines` (stored copy) | `bom.ts:354` |

### Where prices come from (order used by `priceBom` → `fallbackPriceEntry`)

| Order | Source | Covers | File + function |
|---|---|---|---|
| 1 | Project price list `project.priceList.rates[key]` (typed in, imported from Excel, or a copied saved list) | any key | `priceList.ts:220` `priceBom` |
| 2 | Component database: Equipment.xlsx row with `boqKey`; Transformers / Generators.xlsx `price` (exact kVA); Busbar.xlsx `ratePerM` | exact key, `tx:`, `gen:`, `busway:` | `src/database/catalog.ts:56` `catalogRate` |
| — | No rate: panels, final-circuit wiring, busway accessories, trays, ELV, switch-isolators, body-bond conductors | — | `typicalRate` `default` |

All built-in rates are in AED (`rates.ts:36` `CURRENCY`). New database workbooks are seeded with the same illustrative prices (`src/database/database.ts:315-316` `databaseSeeds`).

### Lengths, wastage and rounding

| Topic | How it works | File + function |
|---|---|---|
| Cable length | `Feeder.lengthM`, typed by hand or accepted from CAD routes. A CAD length is already (route + vertical + termination) × (1 + `wastePct`, default 5 %), rounded up to whole metres | `src/model/cadLengths.ts:45` `pullCadLengths` |
| Parallel runs | `runsOf(f)` multiplies cable metres, glands, lugs and ECC | `bom.ts:231`, `src/calc/electrical.ts:41` |
| Rounding of metres | lines with unit `m` are rounded up (`Math.ceil`) **after** all circuits are added together | `bom.ts:356-358` |
| Wastage | a % per section A–J (not custom sections), applied to design quantities of **every unit** (m and no), then rounded up | `priceList.ts:177` `designQty`; `BomView.tsx:507` `WastageForm` |

## 2. Files, components, functions and stores

"Store" = the place the app keeps data: the project file (`Project` fields) or the browser `localStorage` of this computer.

| File | Kind | Key functions or components | What they do |
|---|---|---|---|
| `src/calc/bom.ts` | calc | `buildBom`, `breakerItem`, `polesOf`, `brandRef`, `BOM_SECTIONS` | Design → BOM lines with keys, sections, units, quantities, "where" |
| `src/model/priceList.ts` | model | `priceBom`, `fallbackPriceEntry`, `typicalRate`, `designQty`, `pricingBasis`, `compareBom`, `loadPriceLists`, `savePriceLists`, `EXTRAS` | Pricing, wastage, overrides, manual lines, totals; saved price-list library |
| `src/model/boqScope.ts` | model | `boqReview`, `packageTarget`, `coversScope`, `SCOPE_CHECKS`, `scopeSummary` | Pre-issue checks, package (included-in) logic, scope checklist |
| `src/model/boqRevisions.ts` | model | `numberBom`, `issueBoqRevision`, `compareLines`, `boqRevisionState`, `lineOf` | Issued revisions, fixed item numbers, change marks |
| `src/data/brandDevices.ts` | data | `BRAND_DEVICES` | 16 built-in manufacturer device dimensions; used for enclosure sizing and the BOQ "ref." text |
| `src/data/cableBrands.ts` | data | `CABLE_BRANDS`, `brandOf`, `typicalKgPerM` | Cable outer diameters / bend radii for tray sizing (no prices) |
| `src/docs/boqWorkbook.ts` | report | `buildBoqWorkbook`, `buildBoqHtml`, `buildPriceTemplate`, `readPriceWorkbook`, `amountInWords`, `boqBookmarks` | Excel and PDF BOQ, rates template and rate import |
| `src/components/docs/BomView.tsx` | screen | `BomView`, `ScopePage`, `RevisionsPage`, `ItemForm`, `DesignForm`, `WastageForm`, `IssueForm` | BOQ screen: tabs BOQ / Scope & review / Revisions / Variations / Per circuit |
| `src/components/BoqTable.tsx` | screen | `BoqTable`, `buildRows` | "Per circuit" quick cost: cable + breaker at the built-in rates only |
| `src/components/docs/Documents.tsx` | screen | `EquipmentScheduleView` (line 64) | Equipment schedule page and CSV / PDF export |
| `src/docs/schedules.ts` | report | `equipmentSchedule` (line 43) | Rows: transformer (`TX-<board id>`) + each board |
| `src/components/CatalogueManager.tsx` | screen | `CatalogueManager` | Enclosure catalogues + device dimension library (opened from Enclosure sizing) |
| `src/components/ComponentEditor.tsx`, `src/model/components.ts` | screen / model | `ComponentEditor`, `componentPreset`, `syncComponent`, `loadComponentLibrary` | User load templates with formulas; library in `localStorage` `lvds.components` |
| `src/database/catalog.ts` | model | `catalogRate`, `catalog` | Catalogue prices by BOQ key (store: Excel database, in memory) |
| `src/App.tsx` | screen | view `'boq'` (lines 1692-1695), `'equipment'` (line 1627) | Mounts `BomView` with the **live** `project`, and the equipment schedule with `calcProject` |

Stores in the project file: `project.priceList`, `project.boq` (`BoqCustom`: overrides, manual, sections, wastage, discount, VAT, document, scopeReview, projectType, includeSchedulePoints), `project.boqRevisions`, `project.elvBoq`, `project.components`. Stores on this computer: `localStorage` `lvds.priceLists` (synced by `pushLibrary`) and Prices.xlsx lists (`catalog().priceLists`, ids `xl-…`).

## 3. Inputs — where its data comes from

| Data | From module (ID) | File + function |
|---|---|---|
| Boards, feeders, sizes, lengths, parallel runs, devices, RCD, meters | 06-network-sld-editor | `src/types.ts` `Board`, `Feeder`; `src/calc/electrical.ts` `runsOf` |
| Final circuits, points, load items, ELCB groups, spare ways | 07-load-schedule-panels | `src/calc/loadSchedule.ts` `scheduleCircuits`, `elcbGroups`; `src/model/spareWays.ts` `spareWaysOf` |
| Cable construction (FR / LSZH / armoured) | 11-breaker-cable-selection | `src/model/cableTypes.ts` `cableTypeOf` |
| CPC size | 09-earthing | `src/calc/earthing.ts` `cpcOf` |
| Earth pits, links, body bonds | 09-earthing | `src/model/earthingPlan.ts` `earthingLayout` |
| Transformer count (N+1 / split), tags | 12-transformer-generator | `earthingPlan.ts` `txUnits`; `src/model/transformers.ts` `txTag` |
| Generator kVA, changeover / ATS | 12-transformer-generator | `Board.standby`; `src/model/changeover.ts` `changeoverBreakers`, `atsOf`, `incomersOf` |
| Capacitor banks | 13-power-factor-correction | `Feeder.kvar` (written by `src/calc/pfc.ts` `addPfcBanks`) |
| Busbar risers | 14-busbar | `src/calc/busbar.ts` `sizeRiser` |
| PV system | 15-ups-solar | `src/calc/solar.ts` `sizePv` |
| Enclosure / Form-4 data | 17-enclosure-form4 | `Board.enclosure`, `Board.form4`, `src/calc/form4.ts` `form4SizeText`; `src/model/enclosureLibrary.ts` `matchDevice` |
| Luminaires and emergency fittings on plans | 18-lighting-emergency, 22-cad-electrical | `src/model/luminaireSchedule.ts` `luminaireSchedule` |
| Tray quantities | 19-cable-tray-containment | `src/calc/cableTray.ts` `trayPlanOf`, `sizeRoute`, `trayQuantities` |
| Cable lengths from CAD | 22-cad-electrical | `src/model/cadLengths.ts` `pullCadLengths` / `applyCadLengths` → `Feeder.lengthM` |
| ELV BOQ lines | 29-elv | `src/elv/outputs.ts` `withProjectBoq` → `project.elvBoq` |
| Catalogue prices (Equipment, Transformers, Generators, Busbar, Cables, Breakers, Prices.xlsx) | 32-component-database | `src/database/catalog.ts` `catalogRate`; `src/database/database.ts` `applyDatabase` |
| Design revision id for the BOQ revision | 26-revisions-changes | `src/model/revisions.ts` `currentRevision` |
| Prepared / checked / approved defaults | 03-parameters-rules | `project.params` in `BomView` `DocumentForm` fallback |

## 4. Outputs — where its results go

| Result | Used by module (ID) | File + function |
|---|---|---|
| BOQ Excel / PDF / summary PDF | 25-reports-exports | `src/components/docs/exportCatalogue.ts:166-174`; `BomView.tsx` `exportBoq`, `exportPdf` |
| BOQ Excel through the CLI / MCP | 31-headless-cli-mcp | `src/headless/exportTools.ts:245` `export_boq_xlsx` |
| Submission offer after a PDF export | 27-review-submissions-authority | `BomView.tsx` `exportPdf` → `offerSubmission` |
| Design-quantity change between two projects | 26-revisions-changes | `src/model/designImpact.ts:109` `buildBom` |
| Proposal preview quantity change | 27-review-submissions-authority | `src/model/proposalPreview.ts:102` `buildBom` |
| Contract BOQ revision, variations | 26-revisions-changes | `src/model/variations.ts` `contractRevision`; `VariationsView` |
| "BOQ revision issued" readiness item | 28-dashboard-readiness | `src/calc/projectReadiness.ts:77` |
| Equipment schedule CSV / PDF | 25-reports-exports | `exportCatalogue.ts:138` `equipmentSchedule` |

## 5. User flow — from button click to result

1. The user opens **BOM / Cost → Bill of quantities**. The ribbon calls `onBom` (`App.tsx:1249`), which sets `view = 'boq'`, and `App` renders `BomView` with the live `project` (`App.tsx:1695`).
2. `BomView` runs `buildBom(project)` (line 51), which gives the raw BOM lines.
3. `priceBom(items, project.priceList, project.boq)` applies `designQty` (wastage), overrides, scope, the rate lookup (`list` → `catalogRate` → `rates.ts` → `typicalRate`), manual lines, packages, markup, discount and VAT. `numberBom` then fixes the item numbers against `project.boqRevisions`.
4. `boqReview` builds the "Scope & review" list. `compareLines` against the latest revision gives the △ change marks.
5. The user types rates in a row (`setRate` → `project.priceList`), adjusts quantities or scope with the pencil (`DesignForm` → `setOverride`), adds items or Extras (`ItemForm`, `ExtrasForm`), and sets wastage, markup and VAT (`WastageForm`, `MarkupForm`). Each change calls `onChange` → `setProject` (undo step).
6. Optional: **Rates sheet** → `buildPriceTemplate` (Excel). The user fills it in, then **Import rates** → `readPriceWorkbook` merges the rates into the project price list.
7. Optional: **Save list** → `saveToLibrary` → `savePriceLists` (`localStorage`). **Use a saved price list** → `applySavedList` copies a list into the project.
8. **Issue Rev N** → `IssueForm` → `issueBoqRevision` stores the lines, totals and design revision in `project.boqRevisions`.
9. **Excel BOQ** → `buildBoqWorkbook`; **PDF** → `buildBoqHtml` → `savePdf`, then `offerSubmission`.
10. **Equipment schedule** (separate view `equipment`) → `EquipmentScheduleView` → `equipmentSchedule(calcProject)` → table plus CSV / PDF.

## 6. Linked to (working connections)

- 06-network-sld-editor / 07-load-schedule-panels: every new board, feeder, spare way, ELCB group and (optionally) point count, read live by `buildBom`.
- 09-earthing: earth pits, links and body bonds from `earthingLayout`; CPC sizes from `cpcOf`.
- 12-transformer-generator: transformer kVA and unit count (`txUnits`), generator kVA (written to `Board.standby` by `SizingStudy`), changeover / ATS.
- 13-power-factor-correction: capacitor feeders added by `addPfcBanks` are counted as `cap:` lines.
- 14-busbar: riser lengths, elbows and tap-offs from `sizeRiser`; busway price from Busbar.xlsx.
- 15-ups-solar (PV part): `sizePv` modules, inverters, strings.
- 17-enclosure-form4: enclosure / Form-4 text and key in the panel line.
- 18-lighting-emergency / 22-cad-electrical: luminaires and emergency fittings by type from the plans.
- 19-cable-tray-containment: tray quantities.
- 29-elv: `project.elvBoq` lines in section P.
- 32-component-database: `catalogRate` and Cables / Breakers prices (desktop app only).
- 25 / 26 / 27 / 28 / 31: see §4.



---

*Public summary: describes what the module does and how it connects. The engineering review of open issues is kept separately.*
