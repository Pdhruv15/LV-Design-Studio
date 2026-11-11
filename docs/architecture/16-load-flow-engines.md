# 16 — Load flow engines
[← Index](00-index.md) · [Integration map](99-integration-map.md)

## 1. What it does

This module runs a project's network through more than one calculation method, so the engineer can check the app's own results.

- **Built-in engine.** This is the app's own TypeScript calculation (`evaluateProject` in `src/calc/electrical.ts`, module 06), wrapped so it can be called the same way as the other engines. It is a hand-calculation method: Ib at nominal voltage, voltage drop by the (R cos φ + X sin φ) formula, and Ik″ to IEC 60909 with c = 1.05.
- **External engines (OpenDSS, pandapower).** A Python helper (`engines/python/lvds_engine.py`) runs a true load flow (an iterative solution of the network voltages) and a fault study. OpenDSS and pandapower are free power-system programs. Both must be installed separately with `pip`, and they run only in the desktop app.
- **OpenDSS export.** This writes the network as an OpenDSS script (`.dss`, a text file of OpenDSS commands). The engineer can open the file in OpenDSS. The OpenDSS engine runs the same script.
- **Engine compare screen.** This is the "Load flow" left-menu view (`view === 'engines'`). It shows Ib, total voltage drop, Ik″ at the breaker and Ik″ at the cable end for every circuit: built-in value, external value and the difference between them.
- **SLD results source.** On the network SLD (single-line diagram), the results bar can switch the labels from the built-in values to OpenDSS or pandapower results.
- **Unbalanced flow.** This is a TypeScript per-phase load flow (`src/calc/unbalancedFlow.ts`). It models R, Y and B separately with the neutral conductor, and reports per-phase voltage drop, neutral current, neutral shift and voltage unbalance. Its results appear only in the "Phase balance" study report.

- a second translator from the project to a network model (`run_pandapower`), separate from `exportDss`;
- a hand voltage-drop estimate used only in error hints (`overload_hints`);
- its own topology checks (`check_project`).

| Quantity | Built-in (`electrical.ts`) | OpenDSS (Python) | pandapower (Python) | Unbalanced flow (TS) |
|---|---|---|---|---|
| Ib | Nominal-voltage formula. Incomer = most-loaded phase (`designCurrentA`, `incomerBasis`) | Load-flow line current, highest phase | Load-flow `i_from_ka`, balanced 3-phase only. Not given for 2-core circuits | Per-phase current internally. Not reported as Ib |
| Voltage drop | Formula summed from the main busbar (`voltageDropPct`, `upstreamVoltageDropPct`) | (V main busbar − V end) in pu | Same as OpenDSS | Per phase, (\|U main\| − \|U\|) ÷ U0, worst phase |
| Busbar voltage | 100 − drop from the main busbar (`boardSummary`) | Includes the transformer's own drop | Includes the transformer drop | Includes the transformer drop |
| Ik″ max | c = 1.05, cable R at 20 °C, infinite MV, no KT (`faultCurrentKA`, `cableImpedance`) | c = 1.0, **cable R at operating temperature**, 100 GVA MV | c = 1.10 + KT, **cable R at operating temperature** | — |
| Single-phase circuits | L-N, phase allocation used | All on node 1 (phase R) | Treated as balanced 3-phase | On their labelled phase, with the neutral |

## 2. Files, components, functions and stores

| File | Kind | Key functions or components | What they do |
|---|---|---|---|
| `src/engines/types.ts` | model | `CalcEngine`, `StudyResults`, `EngineFeederResult`, `EngineBoardResult`, `EngineProbe` | The shared "engine" interface. The per-feeder fields are optional: `ib`, `vdTotalPct`, `breakerFaultKA`, `endFaultKA`. The per-board fields are `voltagePct` and `faultKA`. |
| `src/engines/builtin.ts` | calc | `builtinEngine` | Wraps `evaluateProject` (module 06) as an engine. Always available. |
| `src/engines/external.ts` | calc | `openDssEngine`, `pandapowerEngine`, `pythonEngine`, `probeEngines`, `engineRequest`, `engineCableData` | Sends the project, the cable table (`cables()`) and the R factor (`resistanceFactor`) to the Python helper over IPC (inter-process messages between the screen and the desktop main process). The probe result is cached in `probeCache`. |
| `src/engines/index.ts` | model | `EXTERNAL_ENGINES`, `builtinEngine` | Lists the engines shown in the drop-downs. |
| `src/engines/opendss/exportDss.ts` | calc / export | `exportDss`, `dssName`, `uniqueDssNames`, `dssComment` | Builds the OpenDSS script and warnings, then runs a load flow and a fault study in it. |
| `engines/python/lvds_engine.py` | calc (Python) | `main`, `probe`, `run_opendss`, `run_pandapower`, `check_project`, `check_dss_line`, `overload_hints`, `supply_board_of`, `CABLES` | Reads one JSON request on stdin and writes one JSON answer on stdout. Allows only these OpenDSS commands: `ALLOWED_DSS`, `ALLOWED_DSS_SET`. |
| `engines/python/requirements.txt` | config | — | Pins pandapower 3.2.2, opendssdirect.py 0.9.4 and dss-python. `tested_versions` reads it to warn when a different version is installed. |
| `electron/engineRunner.cjs` | desktop process | `runJsonProcess` | Starts Python with no shell. Limits output size, applies a timeout (120 s for a run, 30 s for the probe), stops the child process, and always answers with JSON or `{error}`. |
| `electron/main.cjs` (:461–487) | desktop process | `engineScript`, `pythonPath`, `runEngine`, IPC `engines:probe`, `engines:run`, `settings:choosePython` | Finds the script (dev folder, or `resources/python` in the installed app). Uses the saved Python path, otherwise `python3` (`python` on Windows). |
| `electron/ipcValidate.cjs` | desktop process | `engineRequest` (:115) | Checks the engine name, the request size (≤ 20 MB) and that a project / dss script is present. |
| `electron/preload.cjs` (:52–54) | desktop process | `lvds.engines.probe/run`, `lvds.settings.choosePython` | The bridge the screen code calls. |
| `src/components/EngineCompare.tsx` | screen | `EngineCompare`, `delta`, `formatDelta`, `COLUMNS` | The comparison table. Tolerances: Ib 5 %, VD 0.25 points, Ik 5 %. Also shows install hints and "Choose Python…". |
| `src/components/DiagramResultsBar.tsx` (:79–86) | screen | "Results: … load flow" select, "Run simulation" | Chooses the SLD result source. |
| `src/diagram/annotations.ts` | calc / screen | `buildAnnotations` | Puts engine values in place of the built-in Ib, VD, end fault, busbar voltage and busbar fault on the SLD labels. |
| `src/calc/unbalancedFlow.ts` | calc | `unbalancedFlow`, `flow`, `cableZ`, `VOLTAGE_UNBALANCE_LIMIT_PCT` | Per-phase backward/forward sweep (an iterative method for radial networks) with the neutral. |
| `src/docs/studyReport.ts` (:293–330) | report | `buildSection` key `'phase'` | The only consumer of `unbalancedFlow`. |
| `tests/engines/engines.test.ts`, `tests/engines/referenceNetworks.ts`, `tests/engines/golden/*.json` | test | — | Golden results, hand calculation, OpenDSS vs pandapower agreement and error messages. CI installs the engines (`.github/workflows/ci.yml:59–73`). |
| `src/engines/opendss/exportDss.test.ts`, `src/calc/unbalancedFlow.test.ts`, `src/model/engineRunner.test.ts` | test | — | Unit tests. |

## 3. Inputs — where its data comes from

| Data | From module (ID) | File + function |
|---|---|---|
| Boards, feeders, ties, voltage, frequency, `vdTempC`, `vdLimitPct` | 02-project-storage | `src/types.ts` `Project`, `Board`, `Feeder`, `BusTie` |
| Transformer kVA, %Z, X/R per main board | 12-transformer-generator / 06-network-sld-editor | `Board.sourceKva`, `sourceImpedancePct`, `sourceXr` |
| Built-in results, R factor, X/R default, demand | 06-network-sld-editor | `src/calc/electrical.ts` `evaluateProject`, `resistanceFactor`, `rOperatingOhmPerKm`, `runsOf`, `DEFAULT_TRANSFORMER_XR`, `boardDemandKw`, `transformerImpedance`, `feederRating` |
| Cable R20, X, ampacity | 11-breaker-cable-selection / 32-component-database | `src/calc/cableTable.ts` `cables`, `getCable`, `cablesSource` |
| Per-phase demand of each board | 07-load-schedule-panels | `src/calc/loadSchedule.ts` `boardPhasePQ` |
| Board supply order | 06-network-sld-editor | `src/calc/summary.ts` `boardsInSupplyOrder`, `src/calc/network` `withNetwork` |
| Python executable path | 34-electron-desktop | `electron/main.cjs` `pythonPath`, `readSettings` |

## 4. Outputs — where its results go

| Result | Used by module (ID) | File + function |
|---|---|---|
| Comparison table (screen only) | this module | `src/components/EngineCompare.tsx` |
| Engine Ib / VD / end fault / busbar V / busbar Ik on SLD labels, and the "✕ Icu < Ik" tag | 06-network-sld-editor | `src/App.tsx` `annotations` → `src/diagram/annotations.ts` `buildAnnotations` → `src/components/SystemDiagram.tsx` `feederTags`, `icuShort`, `boardTags` |
| The same annotations in the system summary cards | 28-dashboard-readiness / 06 | `src/App.tsx:1521` `SystemSummaryCards annotations=` |
| The same annotations on the design shown beside CAD sheets | 23-cad-sheets-plot-titleblock | `src/App.tsx:1588` → `src/components/cad/CadSheets.tsx` `SystemDiagram annotations=` |
| `.dss` file saved to disk | 25-reports-exports | `src/App.tsx` `exportOpenDss` ← Ribbon "Export OpenDSS (.dss)" (`src/components/Ribbon.tsx:1191`) |
| Unbalanced flow tables (busbars, circuits) | 25-reports-exports | `src/docs/studyReport.ts` `buildSection('phase')` → `StudyReportsView`, Word / workbook |

## 5. User flow — from button click to result

**Compare screen**
1. The user opens "Load flow" in the left menu (`src/App.tsx:195` view list) and `EngineCompare` mounts.
2. `useEffect` → `probeEngines()` (`external.ts`) → `window.lvds.engines.probe()` → IPC `engines:probe` → `runEngine({engine:'probe'}, 30000)` → `runJsonProcess` starts `python3 lvds_engine.py`. `probe()` tries to import `opendssdirect` and `pandapower` and compares the versions with `requirements.txt`.
4. The user picks an engine and clicks "Run study". `runStudy` runs `builtinEngine.run(project)` and `engine.run(project)` together.
5. `engine.run` → `engineRequest(id, project)`. For OpenDSS this adds `exportDss(project).script`. For both engines it adds `engineCableData` → IPC `engines:run` → `ipcValidate.engineRequest` → Python `main` → `run_opendss` or `run_pandapower`.
7. The table shows each circuit with its difference. A cell is coloured `warn` when the difference is above the tolerance. Below the table come the engine messages and a fixed "Expected differences" note. If the project has changed since the run, a warning appears.

**SLD**
1. In the results bar, the user chooses "Results: OpenDSS load flow" and clicks "Run simulation" (`DiagramResultsBar`) → `runSimulation` → `setEngineRun`.
2. `engineFresh` is true while the project object is unchanged, so `buildAnnotations` uses the engine values. Any edit falls back to the built-in values and shows the note "Project changed — showing built-in values; run again".

**OpenDSS export**
1. Ribbon "Export OpenDSS (.dss)" → `exportOpenDss` → `exportDss(project)` → `saveText(name.dss)`. Warnings appear in the status line.

**Unbalanced flow**
1. Reports → Study reports → "Phase balance" → `buildSection('phase')` → `unbalancedFlow(p)`. The busbar and circuit tables are added to the report.

## 6. Linked to (working connections)

- **06-network-sld-editor (in):** `builtinEngine` calls `evaluateProject`. `exportDss` and `unbalancedFlow` reuse `rOperatingOhmPerKm`, `runsOf`, `DEFAULT_TRANSFORMER_XR` and `transformerImpedance`, so cable R and the transformer split match the built-in method.
- **06-network-sld-editor (out):** engine results replace the built-in SLD labels while they are fresh (`App.tsx:463`, `annotations.ts` `buildAnnotations`).
- **11 / 32 (in):** the cable table actually in use (Cables.xlsx or reference) and the R factor are sent with every run (`engineCableData`), so pandapower uses the same R and X as the app.
- **07-load-schedule-panels (in):** `unbalancedFlow` takes per-phase demand from `boardPhasePQ`, so circuits with R/Y/B allocation are modelled on their own phase.
- **25-reports-exports (out):** the unbalanced flow appears in the Phase balance study report (`studyReport.ts:293`). The `.dss` file is saved through `saveText`.
- **34-electron-desktop (both):** `runJsonProcess` sets the timeout and output limits, `ipcValidate.engineRequest` checks the request, and the Python path is kept in settings.
- **12-transformer-generator (in):** closed bus ties between main boards become parallel transformers in OpenDSS (`exportDss.ts:106`) and in pandapower (`lvds_engine.py:368`).



---

*Public summary: describes what the module does and how it connects. The engineering review of open issues is kept separately.*
