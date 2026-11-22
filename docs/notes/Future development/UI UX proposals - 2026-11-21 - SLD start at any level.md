# SLD start at any level — proposal (2026-11-21)

Status: **approved 2026-11-22: all ten decisions with the recommended answers.** Build order A to H, one PR each. Built: A (v2.254), B (v2.255), C (v2.256), D (v2.257). Next: E.
Mockup: `docs/mockups/sld-start-level-mockup.html` + `.png`.
Related: [[UI UX proposals - 2026-11-11 - SLD supply sources, RMU and package substations]] (steps 2–5 still wait) and [[UI UX proposals - 2026-11-18 - SLD by substation, RMU and transformer]] (all built).

## What was asked

- An SLD does not always start at the authority's incoming line or the transformer. An engineer may be given only a final DB, an SMDB, an MDB or a substation, and must be able to work from there.
- From generation down to the final DB: which stages exist, can the app start at each one, and what must change where it cannot.
- Added 2026-11-22: one RMU can feed one transformer or two. Both must be offered.
- Added 2026-11-22: the design is not for one authority. Other countries have other suppliers and regulations, and an owner (a factory, say) may run on solar, wind or diesel generation. The drawing says **Source**, with no authority's name, and the user types the source name and picks its kind.

## The stages, from generation to the final circuit

| # | Stage | Usually by | Start here today (main, v2.252) |
|---|---|---|---|
| 1 | Generation and step-up | utility | Not modelled |
| 2 | Transmission and grid substation (400 / 132 kV) | utility | Not modelled |
| 3 | Primary substation (132 / 11 kV or 33 / 11 kV) and its 11 kV feeder | utility | Only as one line of data: the grid source's voltage and fault level |
| 4 | 11 kV ring at the plot (grid source) | utility | Record only. Nothing is drawn or calculated until a transformer board exists |
| 5 | RMU or MV switchgear, feeding one transformer or two | utility or consumer | Record only, as stage 4 |
| 6 | Transformer and LV main board | consumer | **Works.** The only start a new project offers |
| 7 | Main board on an LV source (utility LV supply, meter cabinet, feeder pillar, own generation) | consumer | **Partly.** See below |
| 8 | Sub-main board: SMDB, ESMDB, MCC, busway tap-off, fed from a board that is not in this project | consumer | **No.** Cannot be made on the screen; no place for the values given from upstream |
| 9 | Final DB fed from a board that is not in this project | consumer | **No**, as stage 8 |
| 10 | Final circuits and points | consumer | Works below any DB |

Sideways sources (standby generator, generator as the only source, PV, battery) belong to steps 3 and 4 of the supply sources proposal and stay there.

## Today, checked in the code

Every finding below was read in the code by a search pass and confirmed by a second pass.

**Starting a project**
- `newProject` always makes one board: MDB-1 with a 1,000 kVA, 5 % transformer and a 1,600 A busbar. The New project steps offer no other start.
- Dropping a board on the empty canvas works for MDB, LV-MDB, LV-ACB and meter cabinet only. A DB or SMDB can be dropped on a busbar only.
- A board's Type can be changed to DB or SMDB and its transformer kVA cleared. The board then has no source at all.
- Space plan → Create SLD leaves out every panel that has no transformer above it.
- One RMU with one transformer (RRT) or two (RRTT) exists in the data: `RMU_CONFIGS` has RT, RRT, RRRT, RRTT and RRTTT, and the Substations card flags more transformers than tee-offs. It can be set only after a transformer board exists; no start offers it.
- The supplier's name is fixed in places. With no name typed, the SLD prints "DEWA supply" and "CABLE BY DEWA" (`SystemDiagram.tsx`, `panelLabels.ts`, `sldMenu.ts`); a new grid source starts as operator DEWA and its operator list holds UAE names only (`hvSupply.ts`, `HvSupplyCard.tsx`); with no design reference chosen the forms say DEWA (`supplyAuthorityOf`).
- Source kinds: a standby generator sits on a board and a PV array is a generation feeder. Neither can be the only source of a first board, and there is no wind or battery source.
- No command adds a board **above** the first board. A board on an authority supply can be connected under another board (`connectPanel`); a transformer board cannot.

**Drawing**
- A first board with neither a transformer nor an authority supply is still drawn under a transformer symbol, with the text "no source data".
- The Board tab draws a transformer and "11 kV incoming" above every first board, also above one on an authority LV supply.
- The inspector's Supply tab says "Transformer" for every first board and shows transformer fields only. The authority supply's fault level is typed in the transformer summary form.
- "From … " with a chevron exists only for a board whose parent is on another sheet of the same project. Nothing says "fed from a board outside this project".

**Calculations**
- Fault level: without a transformer and without a typed supply fault level, the source is taken as 0.01 Ω. That gives 25.2 kA at 415 V for every project, and the breaker Icu and busbar Icw checks run against it. The only notice is one row in the Overview to-do list.
- Voltage drop: starts at 0 % at the first board. A drop already used upstream cannot be entered, so a DB fed from an SMDB elsewhere gets the whole 4 %.
- Earth fault loop: a first board without a transformer always ends "Not verified", also when its supply fault level is typed. There is no typed Ze.
- Incoming cable: the first board has no incomer circuit. Its incoming cable and breaker are text only, with no Ib ≤ In ≤ Iz or voltage drop check.
- Discrimination stops at the first board's outgoing ways. The device upstream of the project is never compared.
- Transformer sizing lists every first board as a transformer to buy, also a DB.
- The OpenDSS export leaves a first board without a transformer unconnected, while the built-in calculation energises it.

**Outputs**
- Equipment schedule: "Fed from" is empty for a first board without a transformer.
- Design-stage checklist: "Main boards entered" needs two boards and a main-board type, so a one-DB project can never tick it.
- Overview counts one substation for a project that is only a DB.

## Proposal

### 1. A supply point on every first board

The first board of a project (or each of them) gets a **supply point**: what feeds it. Four choices:

| Fed from | Meaning | Today |
|---|---|---|
| Transformer | stage 6 | as today |
| LV source: a utility, another supplier or own generation | stage 7 | exists as the authority supply (`Board.supply`), gains the values below and part 8 |
| A board outside this project | stages 8 and 9 | new |
| Not set yet | nothing known so far | exists silently; becomes visible |

For the two middle choices the engineer types the **values given from upstream**:

| Value | Used for |
|---|---|
| Name of the feeding board, drawing or letter reference | the drawing and the schedules |
| Fault level Ik″ (kA), optional X/R and minimum Ik | fault levels, Icu, Icw, minimum fault for disconnection |
| Voltage drop already used (%) | added to every circuit below; taken off the sizing budget |
| Earth loop impedance Ze (Ω) | earth fault loop study |
| Upstream device: type, rating, setting | discrimination with the first board's devices |
| Incoming cable: size, length, installation | becomes a checked incomer: Ib ≤ In ≤ Iz, voltage drop, fault at the board |
| Allowed load (A or kW), optional | loading check against what the upstream board can give |

A value left blank is shown as "not given" and the checks that need it end "Not verified", not pass or fail.

### 2. Start level in New project

New project asks once: **Start the SLD from**. Six tiles, each with a small drawing:

1. Final DB
2. Sub-main board (SMDB, ESMDB, MCC)
3. Main board on an LV source
4. Transformer and main board (today's start, stays the default)
5. RMU and one or two transformers
6. 11 kV ring with several substations

Tiles 1–3 make one board of that type with an empty supply point. Tile 5 asks **Transformers: 1 or 2**. One makes an RRT RMU, one transformer and one main board. Two makes an RRTT RMU, two transformers and two main boards with a bus coupler between them, drawn open. Tiles 5–6 open the MV supply and RMUs card after the project is made. Canvas drop accepts every board type as a first board.

### 3. Draw the supply point

- System diagram: a first board fed from outside the project is drawn under a **continuation marker** (chevron, as between sheets) with the feeding board's name, "not in this project", the given fault level and drop, the upstream device and the incoming cable.
- "Not set yet" is drawn as a dashed stub with "Supply not set". No transformer symbol appears unless a transformer is entered.
- Board tab: the same marker replaces the transformer block for a board without a transformer.
- Sheets print the marker in black, as on screen.

### 4. Supply tab in the inspector

The Supply tab of a first board starts with **Fed from** and shows the fields of that choice: the transformer fields as today, or the given values of part 1. "Supplied from" on the Electrical tab reads the same choice.

### 5. Grow upward

Right-click a first board → **Add upstream board…** makes the board that feeds it: a DB gets an SMDB above, an SMDB an MDB, an MDB a transformer. The typed incoming cable becomes the new board's outgoing way, the given values move up to the new first board, and the values at the old one are calculated from then on. **Connect to…** joins it to a board already in the project. Both are one undo step. A DB-only project can so grow into the full building without re-entering anything.

### 6. Start at the 11 kV side

A grid source and an RMU with no transformer yet are drawn on the MV overview with their tee-offs marked SPARE. Right-click a tee-off → **Add transformer and main board**. Design then runs top-down.

One RMU feeds one transformer (RRT) or two (RRTT); the mockup's part 5 shows both and an RMU with nothing below it yet. Adding a second transformer to an RRT RMU offers to change it to RRTT, as the Substations card does today. Three tee-offs (RRTTT) stay available from the RMU's Configuration menu.

Above the grid source (stages 1–3) the upstream network stays one equivalent: voltage and fault level. The primary substation name and feeder reference stay as text.

### 7. Calculations and outputs follow the supply point

- Earth fault loop reads the typed Ze; without one it is estimated from the fault level and marked "estimated".
- The 0.01 Ω source is shown as **assumed** wherever its fault level appears, and the Icu and Icw checks against it end "Not verified".
- Transformer sizing lists only first boards on a transformer. The others get a supply check: demand against the allowed load.
- OpenDSS gets a source with the given fault level.
- Equipment schedule "Fed from", the design-stage checklist and the substation count read the supply point.

### 8. Source: any kind, any name

- The drawing, the menus and the schedules use the neutral word **Source**. No authority's or supplier's name is printed unless the user typed it or chose it.
- Every source has a **Name**, free text: a utility, a private network, a landlord's board, "DG-1", "PV plant". Left blank, the drawing says "Source" (LV) or "MV source".
- A chosen design reference (an authority rule set) fills the name in as a suggestion; it stays editable. With no reference chosen nothing is filled in.
- Every source has a **Kind**, which sets the symbol and the values asked:

| Kind | Symbol | Values asked |
|---|---|---|
| Utility supply | circle with sine | fault level, or the MV fault level with a transformer |
| Diesel generator | circle G | kVA, sub-transient reactance X″d |
| Solar PV | array and inverter | inverter kVA, fault current as a multiple of rated current |
| Wind | generator with blades | as generator, or as inverter when inverter-coupled |
| Battery storage | battery and inverter | as inverter |
| Other | plain circle | fault level typed |

- The grid source's operator becomes free text with suggestions from the chosen design reference; a new grid source starts with no operator.
- Authority forms (the transformer summary, the connected load form) keep their own wording: they belong to that authority.
- Several sources on one board working together (grid with PV and a diesel set, synchronising, islanding) stay with the supply sources proposal, steps 3 and 4. This proposal gives each first board one main source; the standby generator and the PV feeder stay as they are.

## Build steps

One PR each, in this order. Steps A, B and H change no screen.

| Step | What | Screens |
|---|---|---|
| A | Calculation fixes: earth loop reads the supply fault level, OpenDSS source, loading from the supply rating, transformer sizing skips boards without a transformer, checklist for one board, "assumed" flag on the 0.01 Ω source | none |
| B | Data and calculations for the given values: drop used, Ze, X/R, upstream device, checked incoming cable; headless tools | none |
| C | Draw the supply point: system diagram, Board tab, sheets; "Source" where no name is typed; a symbol per source kind | drawing |
| D | Supply tab: Fed from and its fields; source Kind and Name; free-text operator on the grid source | inspector, MV supply card |
| E | New project start level; any board type on the canvas | New project |
| F | Add upstream board and Connect to | right-click menu |
| G | Start at the 11 kV side: spare tee-offs, Add transformer and main board, one RMU with one or two transformers | MV overview |
| H | Source kinds in the calculations: generator from kVA and X″d, inverter sources from rated current | none |

Later, with the supply sources proposal: generator as the only source, PV and battery as sources, MV switchboard and MV cables.

### Step C as built (v2.256)

- A source that is not a utility (generator, solar PV, wind, battery, other) is drawn without a meter cabinet unless a meter type is entered. A blank kind counts as a utility, so existing drawings keep their meter.
- The marker reads "From <name>", in the same letter case as the existing marker between sheets.
- A first board with nothing entered is no longer counted on the 11 kV side: the 11 kV line does not run over it, and a project whose first boards are all like that has no Boards / Substations grouping in the panel tree.
- Not drawn: a legend entry for the source symbols, and the "% left for the final circuits" note of the mockup.
- Known limit: in the standard style with the earth pits hidden, the supply lines of a first board that also has a standby generator through an ATS run into the ATS label. One supply line already did so before this step; it needs a lower first busbar in that case.

### Wording still naming one supplier (for step D or a separate sweep)

Found in the code on 2026-11-22; each needs the neutral word or the chosen design reference's authority:

- Data defaults: the grid source's operator and its fixed list; a new brief's authority; a saved setup template's authority.
- Forms and fields that fall back to one name when no design reference is chosen: the "Fed from" field of sheet formats, the connected-load sheet's "connected to" line, the TCL by transformer summary.
- Fixed text: the calculation record's status line, note 4 of the earthing drawing, the default BOQ fees line, the "Submitted" status option, the report type "submission" and its title, the standard general notes button.
- Page intros and tooltips: transformers tab, emergency panels, earthing, power factor, space plan and load assessment pickers, export centre, ribbon tooltips for the load schedule, the guide's forms task.
- The drawing style switch is labelled with one authority's name on the SLD toolbar and in Drawings; that style is on by default.


## Decisions

| # | Question | Recommended |
|---|---|---|
| D1 | Where do the given values apply? | At the **feeding board's busbar**; the incoming cable is then calculated in this project. The other choice: at this board's incoming terminals, cable left out |
| D2 | Fault level not given | Show the 25.2 kA as **assumed** and end the checks "Not verified". The other choice: keep pass / fail as today |
| D3 | Ze not given | **Estimate from the fault level**, marked estimated. The other choice: always "Not verified" until typed |
| D4 | Where to choose the start level | **In New project**, with the transformer start as default. The other choice: always start at the transformer and change afterwards |
| D5 | Stages 1–3 above the grid source | **Keep as one equivalent** (voltage and fault level). The other choice: model the primary substation; that is the MV switchboard step of the supply sources proposal |
| D6 | Board types as first board | **Any type**, no rule on which type feeds which, as in the model today |
| D7 | Step A now | **Yes**: it corrects results and changes no screen |
| D8 | Two transformers on one RMU, made from the start | **Two main boards with a bus coupler, open.** The other choice: two main boards with no coupler |
| D9 | Source name on the drawing | **Blank prints "Source"; a chosen design reference fills the name in and it stays editable.** The other choice: never fill it in, always typed |
| D10 | Source kinds in the calculations | **Typed values for every kind first (steps B–D), then step H** for generators and inverter sources. The other choice: hold the kinds back until step H is built |
