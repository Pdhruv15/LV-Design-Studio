# 06 — Network design screen: SLD editor and core electrical calculation
[← Index](00-index.md) · [Integration map](99-integration-map.md)

## 1. What it does

The **Design** view (`view === 'design'` in `src/App.tsx`) is the main working screen. It shows the whole LV network as
one system single-line diagram (SLD), a per-board diagram, the earthing schematic and a riser view, with an equipment
palette on the left and an inspector (properties panel) on the right. The user adds boards, feeders (outgoing circuits),
transformers, generators, capacitor banks, bus couplers and accessories by drag-and-drop or forms. Boards can be copied,
pasted, moved, renamed and built in bulk (Build hierarchy).

Under the screen sits the **core electrical calculation** used by every study:

| Result | Where | Method (as coded) |
|---|---|---|
| Design current Ib | `src/calc/electrical.ts` `designCurrentA` | 3/4-core: P·DF ÷ (√3·U·cos φ); 2-core: P·DF ÷ (U0·cos φ); capacitor: Q ÷ (√3·U); incomer: most loaded phase S ÷ U0 from `incomerBasis` |
| Cable rating Iz | `feederRating` → `src/calc/installation.ts` `feederRatingBasis` | tabulated rating for the installation method × ambient/ground × grouping (tray or parallel runs) × runs |
| Voltage drop (own, upstream, total) | `voltageDropPct`, `upstreamVoltageDropPct`, `feederVdPctAt`, `vdPctFor` | 3-phase √3·I·(R cos φ + X sin φ)·L ÷ U; 1-phase 2·I·Z ÷ U0; R at `vdTempC` (or R20 × 1.2) |
| Prospective fault at breaker and at cable end | `impedanceToBoard`, `faultCurrentKA`, `cableImpedance` | Ik″ = c·U ÷ (√3·|Z|), c = 1.05, transformer Z from uk%, cable R at 20 °C, parallel transformers on closed couplers |
| Checks | `evaluateFeederOf` | VD total ≤ limit (warn > 85 %), Iz ≥ Ib, Ib ≤ In ≤ Iz, Icu ≥ Ik at the busbar, loading Ib/In (warn > 85 %) |
| Board summary | `src/calc/summary.ts` `boardSummary`, `boardTotals`, `systemSummary` | connected/demand kW, kvar, kVA, PF, current, loading vs rating, busbar voltage, Ik″ |
| Scenarios | `src/calc/scenario.ts` `generatorScenario`, `transformerOutage` | network re-built on standby generators (X″d 15 %) or with one transformer out and the bus tie closed |

## 2. Files, components, functions and stores

"Store" here means the React state in `App.tsx` that holds the project in memory (`useHistory`, the undo history).

| File | Kind | Key functions or components | What they do |
|---|---|---|---|
| `src/calc/electrical.ts` | calc | `designCurrentA`, `incomerBasis`, `voltageDropPct`, `upstreamVoltageDropPct`, `feederVdPctAt`, `feederRating`, `deratedAmpacityA`, `selectCable`, `selectCableRuns`, `transformerImpedance`, `supplyImpedance`, `supplySourceLevel` (typed, calculated from a source rating, or assumed fault level of a first board on an LV source; `GENERATOR_XR`, `INVERTER_FAULT_MULTIPLE`), `calculatedSourceText`, `cableImpedance`, `impedanceToBoard`, `parallelGroup`, `parallelZ`, `faultCurrentKA`, `evaluateFeeder`, `evaluateProject`, `boardDemandKw` | The core per-feeder calculation and its `FeederResult` (Ib, Iz, VD, fault levels, statuses) |
| `src/calc/network/index.ts` | calc (cache) | `NetworkIndex`, `withNetwork`, `networkOf`, `memoized`, `perProject`, `forgetNetworks`, `boardOf`, `feedersOn` | Look-up tables (board by id, feeders by board, incomer of a board) and a memo so tree walks are done once per project object; keeps the last 4 projects |
| `src/calc/summary.ts` | calc | `boardTotals`, `boardSummary`, `supplyAllowedA`, `systemSummary`, `boardsInSupplyOrder`, `loadingStatus`, `loadTypeOf` | Board and system totals, loading, busbar voltage and Ik″ |
| `src/calc/supplyIncomer.ts` | calc | `evaluateSupplyIncomer`, `supplyIncomers`, type `SupplyIncomerResult` | The incoming cable from the supply point to a first board on an LV supply (no transformer), checked like an incomer: Ib ≤ In ≤ Iz, voltage drop with the drop already used upstream, fault levels; in the run as `run.supplyIncomers` |
| `src/calc/scenario.ts` | calc | `generatorScenario`, `transformerOutage`, `GENERATOR_XD_SUBTRANSIENT_PCT` | Generator-supply and transformer-outage versions of the network for the SLD |
| `src/components/SystemDiagram.tsx` | screen | `SystemDiagram`, `sldLayout`, `nameBox`, hover card with quick fixes, cable label editor `saveCable`, drag/move handlers | The interactive system SLD |
| `src/components/SingleLineDiagram.tsx` | screen | `SingleLineDiagram`, `wrapText` | One board's SLD (Board tab, board sheets) |
| `src/components/BoardPanel.tsx` | screen | `BoardPanel` (tabs General / Supply / Electrical / Protection / Location) | Inspector for a board; edits apply as you type; the Supply tab of a first board is `SupplyFields`, "Supplied from" is `suppliedFromText` |
| `src/components/SupplyFields.tsx` | screen | `SupplyFields` | Supply fields of a first board: Fed from (transformer / LV source / board outside the project / not set), then the fields of that choice (Kind, the source rating rows of the kind: Rating (kVA), X″d (%), Fault current (× rated), Name, Reference, given values, upstream device, incoming cable); asks before a switch that removes typed values; used by `BoardPanel` and `BoardEditForm` |
| `src/model/supplyEdit.ts` | model | `setFedFrom`, `losesValues`, `setSupplyValue`, `setIncomerValue`, `suppliedFromText`, `FED_FROM` | Pure edits behind `SupplyFields`: change what feeds a first board, write or clear one supply value or incoming-cable value, the "Supplied from" wording |
| `src/components/BoardFields.tsx` | screen | `BoardFields`, `BOARD_FIELD_GROUPS` | Editable board fields shared by the inspector and the edit dialog |
| `src/components/BoardForm.tsx` | screen | `BoardForm` | "Add downstream board" dialog: board + incomer feeder |
| `src/components/BoardEditForm.tsx` | screen | `BoardEditForm` | Double-click edit dialog for a board (applies on Save); a first board's last tab is Supply (`SupplyFields`) |
| `src/components/FeederForm.tsx` | screen | `FeederForm`, `suggestCable` | Add / edit feeder dialog with live Ib and VD |
| `src/components/InspectorPanel.tsx` | screen | `InspectorPanel` | Resizable right-hand panel wrapper |
| `src/components/EquipmentPalette.tsx`, `paletteSymbols.tsx` | screen | `EquipmentPalette` | Drag source for `PaletteItem`s (loads, boards, devices, presets, components) |
| `src/components/SystemSummaryCards.tsx` | screen | `SystemSummaryCards` | Results drawer: system summary and bus voltages & loading table |
| `src/components/BuildHierarchyDialog.tsx`, `BranchPanel.tsx` | screen | `BuildHierarchyDialog`, `BranchPanel` | Bulk panel creation, repeat a branch on other floors, saved assemblies |
| `src/components/PasteBoardDialog.tsx` | screen | `PasteBoardDialog` | Rename rules when pasting a copied board |
| `src/model/sldEdit.ts` | model | `PALETTE`, `canDrop`, `applyDrop`, `dropMany`, `boardIncomer`, `sized`, `canMove`, `applyMove`, `removeTie`, `updateTie`, `tiePartner` | Every board type can also be dropped on the empty canvas as a first board (fed from a board outside the project). What a drop or a move does to the project |
| `src/model/startLevel.ts` | model | `applyStartLevel`, `START_LEVELS`, `startOpensMv`, `startLevelText` | The first board(s) of a new project for the six SLD starts (final DB, sub-main, LV source, transformer, RMU with one or two transformers, 11 kV ring); the DB and sub-main starts use `applyDrop` on the empty canvas. |
| `src/components/StartLevelPicker.tsx` | screen (wizard step) | `StartLevelPicker` | The six picture tiles and the RMU transformer count in the New project wizard (`BriefEditor.tsx`, step 2). |
| `src/model/sldScope.ts` | model | `onSld`, `splitSld`, `SLD_FINAL_CIRCUIT_MAX_A` | Which ways are drawn on the SLD vs left to the DB schedule |
| `src/model/hierarchy.ts` | model | `planHierarchy` (only tests), `applyHierarchy`, `levelRef`, `panelName`, `evenAssignment` | Older hierarchy planner; `applyHierarchy` still used |
| `src/model/copyBoard.ts` | model | `suggestRename`, `planPaste`, `pasteBoard` | Copy / paste a board and everything below it |
| `src/model/branchCopy.ts` | model | `extractBranch`, `planBranchCopies`, `applyBranchCopies`, assemblies (`loadAssemblies`, `saveAssemblies`) | Repeat a branch on other floors; assemblies kept in localStorage + Library.json |
| `src/model/moveBoard.ts` | model | `moveBlocked`, `moveBoard`, `indentTarget`, `outdentTarget`, `reorderBoard`, `moveSummary` | Panel-tree moves; a first board (`growBlocked` allows it) is moved with `connectTo`, so its typed incoming cable becomes the incomer feeder and its supply block goes |
| `src/model/growUp.ts` | model | `upstreamKind`, `growBlocked`, `upstreamPlan`, `addUpstreamBoard`, `connectBlocked`, `connectPlan`, `connectTo`, `FEEDING_KINDS` | Grow upward: Add upstream board… / Connect to… on a first board (the typed cable becomes a real way with a breaking capacity from the fault level, an isolator is not copied as the device, everything typed at the supply and the earth pits move to the new first board, an existing board stays existing, results at the old board unchanged); `stayOnBoardAfter` keeps the Board tab on its board |
| `src/model/renamePanels.ts` | model | `renameProblems`, `renamePanels`, `renameByLevel`, `proposeNumbers` | Rename boards and update every reference |
| `src/diagram/layout.ts` | diagram | `layoutSystem` | Positions of boards and ways on the system SLD |
| `src/diagram/mvArrangement.ts`, `MvRing.tsx` | diagram | `mvPlan`, `onMvSide`, `offMvSide`, `ssRank`, `mvGeometry`, `mvLeads`, `mvSheetKey` | The 11 kV ring through the RMUs, the substation frames, the normally open switch's N/O and the stubs to what is drawn elsewhere, once main boards name their RMU or substation; substations in their records' order (the Substations card's). `spareRmus` / `drawsRing`: RMU records that no main board names are items with all tee-offs spare (start at the 11 kV side), drawn after the RMUs that feed, only where every main board is drawn; `mvLeads` keeps main boards clear of them (they move with the board before them, else the last one on an earlier ring: `fixed` blocks, sorted by root then ring order; a spare RMU is on its grid source's ring and starts right of the rings drawn before it) |
| `src/calc/hvSupply.ts` | calc | `gridLabel`, `rmuLabel`, `rmuRatings`, `txKv`, `txRatio` | The MV labels: a grid source's voltage and fault level, an RMU's name, configuration and ratings, and each transformer's ratio from the grid source feeding it (its RMU's, else the project's first; 11 kV without one). The transformer schedule, the equipment schedule, the Board view and the BOQ take the same voltage; the BOQ's RMU line takes its ways and tee-off device from `rmuRecord` / `rmuWays` (doc 20) |
| `src/diagram/mvShow.ts` | diagram | `supplyTree`, `showRows`, `partProject`, `shownPart`, `partInfo`, `partSteps`, `treeGroups` | SLD ribbon → View → Show: the part of the network the system diagram draws (whole network, MV overview, a substation, RMU or transformer) and the chip on the drawing; the panel tree's Group → Substations rows (`PanelTree.tsx`; undefined until a main board names its substation or RMU, and the switch's Substations is greyed till then) |
| `src/model/mvGrow.ts` | model | `rmuAddPlan`, `addTransformerOnRmu`, `addRmu`, `removeRmu` | Add transformer and main board on an RMU (a new MDB with a 1000 kVA transformer put on it with `txRmu`, which grows RRT → RRTT / RRTT → RRTTT; the plan holds what the page asks first) Add ▸ RMU on the empty drawing (whole network and MV overview only) and Remove RMU-x on an RMU that feeds nothing (`sldMenu.ts` `addtx`, `sld/sldMenuRun.ts`, `App.tsx` `addTxOnRmu`) |
| `src/model/substations.ts` | model | `substationRows`, `moveSubstation`, `updateSubstation`, `renameSubstation`, `rmuChoices`, `txRmu`, `txSubstation`, `rmuConfig`, `rmuNormallyOpen` | The substations in ring order with their checks (Panels → Transformers → Substations, `SubstationsCard.tsx`), and the SLD's right-click Substation ▸, RMU ▸, Configuration ▸ and Normally open ▸ (`sldMenu.ts`, `sld/sldMenuRun.ts`) |
| `src/diagram/supplyPoint.ts`, `sourceSymbol.tsx` | diagram | `supplyMode`, `supplyPoint`, `SourceSym`, `sourceSymSvg` | A first board's supply point (source, board outside the project, unset; a transformer keeps its block): one model for the system SLD, Board tab and board sheet (a meter box only for a utility or a typed meter type; `refLine` separate for the sheet), and the symbol per `Board.supply.kind`; a first board with a supply but no name draws "Source" on the feeder riser (`feederRiserLayout`) |
| `src/diagram/sldDevices.ts`, `panelBox.ts`, `panelLabels.ts` | diagram | `sldDevices`, `panelSymbolOf`, `incomerTexts`, `cableLines`, `breakerText` | Devices, symbols and texts per way and board |
| `src/diagram/symbolLibrary.tsx`, `IecSymbols.tsx` | diagram | `Sym`, `SwitchSym`, `LoadSym`, `legendEntries` | IEC symbols and legend |
| `src/diagram/heatmap.ts` | diagram | `feederRatio`, `boardRatio`, `earthRatio`, `heatColor` | Screen colouring by VD / loading / utilisation / fault duty / earth loop |

## 3. Inputs — where its data comes from

| Data | From module (ID) | File + function |
|---|---|---|
| Boards, feeders, ties, trays, building, project fields | 02-project-storage | `src/types.ts` `Project`; `App.tsx` `useHistory` / `setProject` |
| System voltage, VD limit, conductor temperature, ambient, ground temperature, soil resistivity, PF target | 03-parameters-rules | `project.voltageV`, `vdLimitPct`, `vdTempC`, `ambientC`, `groundTempC`, `soilResistivityKmW`; `src/types.ts` `settingsOf` |
| Cable R, X, ampacity, method ratings | 32-component-database | `src/calc/cableTable.ts` `cables`, `getCable`, `resolveCable`, `setCables` |
| Installation method derating | 11-breaker-cable-selection | `src/calc/installation.ts` `feederRatingBasis` |
| Tray grouping factor | 19-cable-tray-containment | `src/calc/cableTray.ts` `trayGrouping` via `electrical.ts` `trayFactorOf` |
| Per-phase P and Q of a board (incomer basis) | 07-load-schedule-panels | `src/calc/loadSchedule.ts` `boardPhasePQ` |
| Recorded maximum demand of existing boards | 33-quick-calcs-existing | `src/model/existing.ts` `recordedPQ`, `existingLoad` |
| Capacitor switched steps | 13-power-factor-correction | `src/calc/capSwitching.ts` `switchedOnBoard`; `src/calc/pfc.ts` `sizePfc` (capacitor drop) |
| Breaker / cable recommendation for dropped items | 11-breaker-cable-selection | `src/calc/sizing.ts` `recommend`, `applyRecommendation` (used by `sldEdit.ts` `sized`, `applyMove`) |
| Standby generator choice | 12-transformer-generator | `src/calc/sizing.ts` `generatorForBoard`, `standbyBoards`, `boardDemandKva` |
| Library loads (Loads.xlsx) | 32-component-database | `App.tsx` `db.loads` → `dropItem` / `FeederForm` `fromLibrary` |
| Floors and riser lengths for hierarchy | 04-building-load-assessment | `src/model/levels.ts` `floorList`; `src/calc/buildingDesign.ts` `incomerLengthM` |
| External engine results (optional overlay) | 16-load-flow-engines | `App.tsx` `runSimulation`, `engineRun`; `src/diagram/annotations.ts` `buildAnnotations` |

## 4. Outputs — where its results go

| Result | Used by module (ID) | File + function |
|---|---|---|
| `FeederResult[]` of the run (`run.results`) | 07-load-schedule-panels | `App.tsx` `allResults` → `BoardSheetView`; `src/docs/loadScheduleDoc.ts`, `src/docs/schedules.ts` (`evaluateFeeder`) |
| Ib, VD, incomer basis, `boardDemandKw` | 08-voltage-drop | `src/calc/voltageDrop.ts` |
| Run earthing results (`run.earthing`) | 09-earthing | `runs.ts` `runCalculations` → `evaluateEarthingAll`; `EarthingStudy` gets `calcProject` |
| `evaluateFeeder`, fault at busbar | 10-protection-coordination | `src/calc/protection.ts` `evaluateSelectivity`; `DiscriminationPanel`, `CoordinationStudy` (`impedanceToBoard`, `faultCurrentKA`) |
| `evaluateFeeder`, `selectCableRuns`, evaluators | 11-breaker-cable-selection | `src/calc/sizing.ts`, `src/calc/quickFix.ts`, `SelectionStudy` |
| Fault levels, parallel transformers, `boardTotals` | 12-transformer-generator | `src/calc/txGen.ts`, `parallelTx.ts`, `src/model/changeover.ts`, `src/docs/txSummary.ts` |
| `boardTotals` | 13-power-factor-correction | `src/calc/pfc.ts` |
| Fault at board, upstream VD | 14-busbar | `src/calc/busbar.ts`, `src/calc/busbarIcw.ts` (`boardSummary`) |
| `boardTotals` | 15-ups-solar | `src/calc/ups.ts` |
| `evaluateProject`, `boardDemandKw` | 16-load-flow-engines | `src/engines/builtin.ts`, `src/engines/opendss/exportDss.ts`, `EngineCompare` |
| SLD component, results, annotations | 24-drawings-sld-sheets | `src/components/cad/CadSheets.tsx`, `src/components/sld/SheetWorkspace.tsx`, `src/components/docs/sheetRender.tsx` |
| `runCalculations` results | 30-exchange-inbox | `src/exchange/designExport.ts` |
| `runCalculations` results | 31-headless-cli-mcp | `src/headless/tools.ts`, `editTools.ts`, `exportTools.ts`, `rendererExport.ts` |
| `selectCableRuns`, `faultCurrentKA` | 33-quick-calcs-existing | `src/calc/quick.ts` |
| Status bar chip, F5, command palette, panel tree | 01-app-shell | `App.tsx` lines ~1709–1718, `commands()`, `PanelTree` `menu.onMove` |

## 5. User flow — from button click to result

1. App start or project open: `App.tsx` `useState(() => runCalculations(project))` (line 439) and `loadIntoApp` → `setRun(runCalculations(opened))` (line 726).
2. User drags a load from `EquipmentPalette` onto a busbar → `SystemDiagram` `onDropItem` → `App.tsx` `dropItem` → `sldEdit.ts` `dropMany` → `applyDrop` → `sized` (`sizing.ts` `recommend`) → `showResult` → `setProject(..., { step: true })` (one undo step).
3. Or user opens **+ Add → Feeder** → `FeederForm` (live Ib/VD from `designCurrentA`, `voltageDropPct`) → Save → `App.tsx` `saveFeeder`.
5. With Auto-run on, the `useEffect` at `App.tsx:441` calls `runCalculations` on every project change instead.
6. User presses F5 / Run → `runNow` → `runCalculations` → `withNetwork` → `evaluateProject` (`evaluateFeeder` per feeder), `evaluateEarthingAll`, `evaluateSelectivity`; status text shows the count of failing feeders.
7. `allResults` (results with the live feeder objects) feed `SystemDiagram` (labels via `buildAnnotations`, heat colours, hover cards), the results drawer (`ResultsTable`, `SystemSummaryCards`), and the inspector (`SidePanel`, `BoardPanel`, `DiscriminationPanel`).
8. Hover card on a failing way: `failReasons`, `quickFixes` → click → `App.tsx` `onFixFeeder` patches the live feeder.
9. Supply menu → generator / transformer outage → `generatorScenario` / `transformerOutage` → `evaluateProject(genScenario.project)` live (not part of the run).

## 6. Linked to (working connections)

- 02-project-storage: every edit goes through `setProject` (undo history, `src/model/history.ts` `record`); drops, moves, paste, ties, quick fixes use `{ step: true }`. Auto-run flag is saved in `project.calc.autoRun`.
- 03-parameters-rules: voltage, VD limit, conductor temperature and ambient are read live and are in the fingerprints (`runs.ts` `INPUTS`).
- 07-load-schedule-panels: incomer current and VD come from `boardPhasePQ` (per-phase P/Q including single-phase circuits).
- 09-earthing, 10-protection-coordination: computed in the same run (`runCalculations`) on one network index.
- 11-breaker-cable-selection: drops are sized with `recommend`; quick fixes evaluate candidate sizes with `evaluateFeeder`.
- 12-transformer-generator: closed couplers combine transformer impedances (`parallelGroup`, `parallelZ`); generator / outage scenarios on the SLD.
- 16-load-flow-engines: external results overlay the SLD only while `engineRun.project === project` (`engineFresh`).
- 19-cable-tray-containment: tray grouping factor feeds Iz (`trayFactorOf`), and trays are in the `checks` fingerprint.



---

*Public summary: describes what the module does and how it connects. The engineering review of open issues is kept separately.*
