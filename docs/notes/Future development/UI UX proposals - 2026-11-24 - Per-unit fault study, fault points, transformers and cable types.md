# Per-unit fault study, fault points, transformers at any voltage and cable types — proposal (2026-11-24)

Status: **approved 2026-11-24: all ten decisions (A–J) with the recommended answers.** Build order 1 to 7, one PR each. Built: none yet.
Mockup: `docs/mockups/fault-study-pu-mockup.html` + `.png`.
Related: [[UI UX proposals - 2026-11-21 - SLD start at any level]] (built) and [[UI UX proposals - 2026-11-11 - SLD supply sources, RMU and package substations]] (steps 2–5 wait).

## What was asked

Check whether the app has these five things, report, then make all of them:

1. Calculation based on p.u. (per-unit) values.
2. Diesel generator.
3. Step-down and step-up transformers at the different voltages of the market.
4. Cable parameters: R and X for different types of cable.
5. Fault point marks.

## Today, checked in the code (main, v2.271)

| Item | Today |
|---|---|
| p.u. | Not there. Fault levels are worked in ohms referred to the LV side: `transformerImpedance`, `gridImpedance`, `impedanceToBoard`, `faultCurrentKA` in `src/calc/electrical.ts`, c = 1.05. No base MVA, no p.u. value anywhere. |
| Diesel generator | Mostly there. A first board can be on a generator source with its kVA and X″d (15 % when not typed, X/R 10), which gives a calculated fault level. Sizing checks the largest motor start (X′d 25 %, 15 % dip). A "network on generator" scenario exists. Missing: generator in parallel with a transformer, the sustained (lower) fault current, motor contribution. |
| Transformers | One kind only: the MV / LV step-down transformer on a main board (kVA, Z %, X/R, vector group). The MV voltage is a typed number on the grid source. The project has one LV voltage (`project.voltageV`) for every board. No step-up, no LV / LV transformer, no second voltage level, no voltage list, no tap. |
| Cable R and X | One table keyed by size only (`src/calc/cableTable.ts`, replaced by `Cables.xlsx`): R at 20 °C, X, ratings per installation method, pre-filled for Cu / XLPE multicore. `src/model/cableTypes.ts` lists 14 cable types, but its own note says the calculations use the copper data for every type. Temperature correction is for copper only. No aluminium, PVC, single-core or MV rows. |
| Fault point mark | Not there. The SLD prints Ik″ at each board and Ik on feeders, and flags Icu below the fault level. A fault point cannot be placed or named, and there is no table of fault points. Peak current is not calculated. |

## Proposal

### 1. Per-unit values

- A base power for the project, 100 MVA unless changed, in the study settings.
- One function gives every element's impedance in p.u. on that base and the base voltage of its level: source, transformer, generator, cable, busway.
- The short-circuit report gains two tables (mockup 2): the impedance data per element (base kV, base current, base Z, R, X, Z in p.u., and how each was worked), and the fault points.
- The results do not change: p.u. and ohms give the same currents. A test proves this on every sample project. The p.u. path becomes the one path once voltage levels differ (item 3), where referring ohms across several transformers is error-prone.

### 2. Diesel generator

- X′d and Xd beside X″d on a generator source, and in `Generators.xlsx`. The minimum fault current then comes from X′d (or the typed sustained multiple, usually 3 × rated with excitation support), in place of the note "type the minimum fault level".
- A generator in parallel with a transformer on the same board (synchronised running): the two sources add at the busbar for the maximum fault. Today a board has one source.
- Motor contribution to the maximum fault per IEC 60909-0: motors on a board add about 5 × their rated current when their sum is large enough to matter. A switch in the study settings, off unless turned on.

### 3. Transformers at any voltage

- Primary and secondary voltage on every transformer, from a list (mockup 3): 3.3, 6.6, 11, 13.8, 22, 33 kV and 208, 380, 400, 415, 433, 480, 690 V, with "Other" typed. Primary above secondary reads step-down, below reads step-up.
- Tap setting: 0, ±2.5, ±5 %.
- A transformer between two boards: LV / LV step-down (415 / 208 V), step-up (415 / 690 V), and LV / MV step-up for a generator or PV plant (0.415 / 11 kV).
- Each board takes the voltage of its level, from the nearest transformer above it. Every calculation that reads `project.voltageV` today (design current, voltage drop, fault, earth loop, sizing) reads the board's voltage. With no in-line transformer nothing changes.
- Vector groups in the list: Dyn11, Dyn5, YNd11, Yyn0, Dzn0.

This is the largest item: `project.voltageV` is read across all the studies and the reports.

### 4. Cable R and X by type

- Cable data keyed by family as well as size: conductor (Cu, Al) × insulation (XLPE 90 °C, PVC 70 °C) × form (multicore, single-core trefoil, single-core flat), plus MV cable (XLPE, 3-core and single-core) for the 11 kV side.
- `Cables.xlsx` gains three columns in front (mockup 4). Blank means Cu / XLPE / multicore, so existing files read as they do today.
- Each cable type in the app's list points to one family; aluminium types are added to the list.
- Aluminium temperature coefficient (0.00403 /K) beside copper; the adiabatic k by family (Cu XLPE 143, Cu PVC 115, Al XLPE 94, Al PVC 76) in place of the fixed 143; the PVC ambient correction for 70 °C.
- Built-in R values are IEC 60228. Built-in X and ratings for the new families are taken from a named standard table and checked by a second pass before they go in; none are typed from memory.

### 5. Fault point marks

- A Fault point tool on the SLD: click a busbar, or a cable at its start, its end or a typed distance. The mark is a flag with an arrow and a number F1, F2… (mockup 1). It can be moved, renamed and deleted.
- A fault points table: place, kV, R / X / Z in p.u., X/R, Ik″ 3-phase, peak ip (κ per IEC 60909-0), line-earth and minimum currents from the earth loop study, and the breaker's Icu / Icw against it.
- Marks and table print on the SLD sheet and in the short-circuit report, black and white, and go out with DXF / DWG.

## Decisions

| # | Question | Recommended |
|---|---|---|
| A | Base power for p.u. | 100 MVA, changeable per project |
| B | Where p.u. shows | In the short-circuit report and the fault points table only; SLD labels stay in kA |
| C | Generator minimum fault | From X′d; a typed sustained multiple overrides it |
| D | Motor contribution | A switch, off by default, so existing projects keep their numbers |
| E | Voltage lists | The lists above plus "Other" typed |
| F | In-line transformer | A new item on the SLD equipment strip, dropped on a feeder between two boards |
| G | Existing projects when cable data goes by type | Keep today's numbers; a "Cable data by type" switch in the project parameters, on for new projects, with a to-do line on older ones |
| H | Fault points | Hand-placed only; boards already print Ik″ |
| I | Fault kinds in the table | 3-phase, peak, line-earth, minimum; line-line (0.87 × 3-phase) left out |
| J | Where the Fault point tool sits | On the SLD ribbon beside the study layers switch |

## Build order

One PR each, version raised by one per step.

1. Cable data by type: database, engine, tests (item 4). No screen change apart from the type list and the switch of decision G.
2. Generator X′d, Xd and minimum fault (item 2, first part).
3. Per-unit function and the two report tables (item 1).
4. Fault point marks and table (item 5).
5. Generator in parallel with a transformer, motor contribution (item 2, rest).
6. Transformer voltage lists and tap (item 3, first part).
7. Voltage per board and the in-line transformer (item 3, rest), in two or three PRs.
