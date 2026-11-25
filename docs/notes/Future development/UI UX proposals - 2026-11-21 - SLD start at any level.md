# SLD start at any level — proposal (2026-11-21)

Status: **approved 2026-11-22: all ten decisions with the recommended answers.** Build order A to H, one PR each. Built: A (v2.254), B (v2.255), C (v2.256), D (v2.257), E (v2.258), F (v2.259), G (v2.260), H (v2.261). All steps built.
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

### Step E as built (v2.258)

- The wizard has a new second step, **SLD start** (seven steps now): six picture tiles, the transformer start chosen. Quick create makes the transformer start.
- What each start makes:

| Start | Boards | Supply |
|---|---|---|
| Final DB | `DB-1`, 63 A | Fed from a board outside the project |
| Sub-main board | `SMDB-1`, 250 A | Fed from a board outside the project |
| Main board, LV source | `MDB-1`, 1600 A, no transformer | LV source, name from the design reference when one is applied |
| Transformer and main board | `MDB-1`, 1000 kVA | Transformer (today's start) |
| RMU, one transformer | `MDB-1` | RMU-1 (RRT) |
| RMU, two transformers | `MDB-1`, `MDB-2` | RMU-1 (RRTT), bus coupler normally open |
| 11 kV ring | `MDB-1`, `MDB-2` | Grid source, SS-1 and SS-2, RMU-1 and RMU-2 (RRT each) |

- The two 11 kV starts open Panels with the MV supply and RMUs card after the project is made.
- Differs from the mockup: two rows of three tiles instead of one row (the dialog is 780 px wide so that the seven step tabs fit); the 1 / 2 transformer choice sits below the tiles; no Default badge (the note says it); the tile title is "RMU, one or two transformers" (one line); the sub-main tile makes an SMDB (the type is changed afterwards); the ring start makes two substations; the coupler of the two-transformer start is named `BC-1`.
- Canvas rule: every board type can be dropped on the empty canvas. Main boards and meter cabinets are made as before; any other kind is a first board fed from a board outside the project.
- Corrected with it: a bus coupler is no longer offered on a first board fed from a board outside the project; the Overview counts only transformer-fed first boards as substations; the calculation report, the design basis and the per-substation sheet title say "fed from a board outside this project" for such a board.
- Open after step E (each needs a decision):
  - A first board fed from a board outside the project is still drawn and priced with its own earth pits and main earth terminal (the default "earthing shown on every first board" is older than this proposal). It can be unticked on the board. Proposed: off by default for such a board.
  - After an 11 kV start the page with the MV supply and RMUs card opens, but the ribbon shows the tab of the project's stage (Concept), as after opening any project.
  - A coupler between two boards with no outgoing ways is drawn through the "NO OUTGOING WAYS" text of the left board (older drawing rule; clears once the board has ways).

### Step F as built (v2.259)

- Rows: **Add upstream board…** on the system diagram and the Board tab, **Connect to…** on the system diagram only (and only when another board can take it). Both sit first in the group where a fed board has Move and Supply from…. No rows for a board with a board above it, a transformer board, a meter cabinet or an end of a bus coupler.
- Board above, by type: DB → SMDB, EDB → ESMDB, SMDB / MCC / FP / UPS / EMDB / LV-EMDB → MDB, ESMDB / EMCC → EMDB, MDB / LV-MDB / LV-ACB / no type → a transformer (the same as Fed from → Transformer on the Supply tab). The type can be changed in the question. A name typed for a board outside the project ("From SMDB-3F") becomes the new board's reference when free.
- What moves where:

| Value | Goes to |
|---|---|
| Typed incoming cable and upstream device | The real way from the new board to the old one (default way, 30 m, marked to check, when no cable was typed). Its breaking capacity is the next standard step above the fault level at its busbar, never below 36 kA (no fault level known: 36 kA). A device typed as an isolator is not copied: the way gets a breaker by rating, and the question and the message say to set the real device. With no supply rating typed the board's rating is used, and the question says so. A size typed without a length keeps its size and gets 30 m, marked to check |
| Given values (Ik″, X/R, minimum Ik″, drop used, Ze, allowed load) | The new first board |
| Everything else typed at the supply: source name and kind (source start), reference, meter, CT ratio, cable and earth text; also for a board outside the project (its own name excepted: that becomes the new reference) | The new first board |
| Ir setting | Stays at the old board (as its protection setting) |
| Earth pits (the board's pit settings, and the pit numbers and test records kept under the old board's number) | The new first board: the numbers move with them, so the pit count and the BOQ quantity do not change |
| Existing board with a typed cable | The way is marked existing (the installed cable), and the new board above it is marked existing too, so nothing is priced as new |

- Fault level, voltage drop and earth loop at the old board are the same before and after when a cable was typed (proved to 6 decimals in `growUp.test.ts`, also with parallel runs, protective conductor and Ze). With no typed cable the default way is new, so the fault level falls and the drop grows by its cable; the message says to check the length. A second step on a board that has no typed cable therefore changes the results at the DB; the question says so ("the fault level and voltage drop at <board> change by this cable"). A rating of 0 on the board is not used for the way; a supply rating typed on a board with no rating of its own becomes the board's rating.
- Questions: Add upstream board… asks for board type and reference (a transformer start asks to confirm "Add a transformer"); Connect to… asks only when values given for the supply would be removed, and names what is removed (the given values, or only "the name, reference and meter typed for its supply"). Its list reads the whole project also while only a part of the network is drawn, and shows "below it" for a board fed from the one being connected. On the Board tab, Add upstream board… keeps the view on that board (it shows its new incomer); the status line names the new board. One undo step each.
- Panel tree and `move_panel`: moving a first board used to leave its supply block and add no incomer. It now uses Connect to, so the typed cable becomes the incomer and the given values are calculated from the new source; the confirmation text carries the same lines as Connect to…, and the status ends with "check the incomer cable length" only when the new incomer is marked to check. `move_panel` does the same only for a first board that Connect to accepts (not a meter cabinet, not an end of a bus coupler), and its warnings carry those lines.

- Checks on the new way: a typed incoming cable was checked only for current, voltage drop and fault level. As a real way it gets every feeder check (the cable / breaker limits table, earth-fault disconnection, discrimination with the ways below), so a cable that showed no finding before can show one after the step. That is intended: the values are calculated from then on.

#### Open after step F

- An isolator typed as a feeder's device is still checked as a breaker of that rating by the feeder checks (engine change, not done).
- A second Add upstream board with no typed cable adds a default 30 m way, so the results at the boards below change by it.
- Closed in v2.262 (approved 2026-11-22): a first board with a typed incoming cable but no fault level given now counts the cable on top of the placeholder source, as it does with a given fault level. The assumed level at such a board is lower by the cable (16 mm², 25 m: 8.06 kA instead of 25.16 kA); it stays marked assumed. Add upstream board… on such a board no longer changes the fault level at the old board.

### Step G as built (v2.260)

- Scope: a project keeps at least one board (the Design page needs one). "Start at the 11 kV side" therefore means: in a project with any board, a grid source and RMU records that feed no transformer yet are drawn, and transformers with their main boards are added from the RMU. A project with no board at all is not covered.
- Drawn: every RMU record that no main board on the 11 kV side names becomes an item of the plan with all its tee-offs spare (as many as its configuration has, 2 without one), marked SPARE. It stands in the substation its record names (else alone), after the RMUs that feed transformers and by name, on the ring of its grid source (the same rule as an RMU with a board, so it does not change ring when a transformer is added). Ring line, ring switches, N/O mark, name and configuration texts are those of any RMU; nothing hangs below a spare tee-off. A tooltip on a spare tee-off says to right-click it. The grid source head is drawn as soon as a ring has any item.
- Where: in ring order, its box starts after the item before it (that item's transformer labels included) by the usual gap (14 inside a substation frame, 20 between frames); first on a ring it starts at the ring's left, clear of the grid source labels, or, when another ring is already drawn, right of everything drawn before it (rings stand left to right in grid source order, none on another). The main boards after it are moved right by the existing lead rule, which now also sees the width of such an RMU (it has no board of its own, so it moves with the board before it, else the last board before it on an earlier ring; blocks that share a root keep ring order). A transformer after such an RMU is kept out of its frame by its left edge. A substation holding only such RMUs gets its frame and title.
- Drawn only where every main board is: the whole network and the MV overview (and a sheet that holds all main boards). On a part (one transformer, one RMU, one substation) such an RMU is left out, or is the "to RMU-x" stub next to the drawn items, as any item drawn elsewhere. A project whose only boards are off the 11 kV side (one DB fed from outside, a meter cabinet) plus an RMU record draws the ring above them, at the left; the board stays where it is.
- Show: a record-only RMU or substation has no "Show only" (nothing to draw; its rows are greyed and the steps skip it); the MV overview row is enabled when the ring is drawn. The panel tree lists such an RMU as a group with nothing to show. A part that shows a substation also draws that substation's own spare RMUs (no stub to them). "One sheet per substation" and the sheet fingerprint follow the new ring.
- Menu: an RMU feeding nothing yet has a menu: **Add transformer and main board**, Configuration ▸, Normally open ▸, MV supply and RMUs… (head: configuration, substation, "no transformer yet"). The same row in the menu of an RMU that feeds boards (after Show … only); its key text reads `n free`, `→ RRTT` (the unit grows) or `full` (greyed, RT / RRRT / RRTTT). Every main board on the 11 kV side that names the RMU counts as using a tee-off, with or without a kVA. An RMU that feeds nothing also has **Remove RMU-x** (last in its group, red like the Delete rows): it drops the record, one undo step, no question; refused while a board names it. The empty drawing's Add ▸ has **RMU** after Meter cabinet (a new RRT record, feeding nothing, on the first grid source), only on the whole network and the MV overview, since a part does not draw it.
- Add transformer and main board: a new MDB-n with a 1000 kVA transformer (typical impedance, rated current from the kVA) is put on the RMU, in the RMU's substation, one undo step, selected. A full RRT or RRTT unit asks first ("RMU-1 is full (RRT): it becomes RRTT.") and then changes its configuration; a unit that cannot grow is refused with the Substations card's message. No question when a tee-off is spare.
- Also: the RMU box is drawn without a fill colour (asked by the user on 2026-11-22; prints are unchanged, they force it white). A DB-only project draws the ring above its board, and the board moves right to make room for it. Existing projects that hold an RMU record no board names now draw it (ring, Group switch in the panel tree, "One sheet per substation"), and issued sheets that draw the ring are flagged as changed.
- Not counted: an RMU with no transformer is not priced in the BOQ and is not counted as a substation on the dashboard (unchanged). The Substations card lists it once, as before, and it is now on its ring (so ▲ ▼ move its substation among the others).
- Open: a substation frame that holds only spare RMUs has no right-click menu (a substation menu needs a board to show); the 11 kV start of New project still opens the MV supply card first.

### Step H as built (v2.261)

- Data: `Board.supply` gets `ratedKva` (rating of the source, kVA), `xdPct` (X″d of a generator, % on its rating, default 15) and `faultMultiple` (fault current of an inverter source as a multiple of its rated current, default 1.2). They move up with the source to a new first board, and are listed in the given-values text (`250 kVA`, `X″d 15 %`, `fault current 1.2 × rated`). A board outside this project (`fedBy` board) does not read them.
- Calculation, `supplySourceLevel` in `src/calc/electrical.ts` (basis `given`, `calculated` or `assumed`): a typed fault level always wins. Else with a rating, by kind. A machine (diesel generator, wind with no fault multiple): Z = U² · x″d ÷ S with X/R 10 (the standby-generator formula), so Ik″ = c · I_rated ÷ x″d; 250 kVA at 415 V, X″d 15 %: I_rated = 347.8 A, Ik″ = 1.05 × 347.8 ÷ 0.15 = 2.43 kA. An inverter source (solar PV, battery, wind with a fault multiple): Ik = k · I_rated with no voltage factor, carried as the resistive impedance |Z| = c · U ÷ (√3 · k · I_rated); 100 kVA, k 1.2: I_rated = 139.1 A, Ik = 0.167 kA. Utility and other with a rating, and a generator or inverter with no rating, stay assumed.
- Follows the calculated level (as it follows a given one): the busbar level and the incoming cable (added to the source), the not-assumed state (breaking capacity, busbar and riser checks run, no `faultAssumed` key), the earth loop Ze estimate (a machine: "Ze estimated from the generator's sub-transient reactance at <board> (its sustained fault current is lower: type the minimum fault level)", and a disconnection that would pass is then not verified (warning); an inverter: "… from the inverter fault current at <board>"; a typed Ze or minimum level still wins), the changeover breakers (next standard step above the larger of the normal supply and the standby set's own level), the OpenDSS Vsource (x1r1 10 for a machine, 0.1 for an inverter; a warning and a comment line say it is for the fault study only), the allowed load (the rated current of the source when none is typed), the dashboard to-do (no "no fault level" row), the incoming cable result (`faultSupplyKA`), the breaking capacity of the way of Add upstream board.
- Screen: the Supply tab asks the values part 8 lists per kind (the plan called step H "no screen"): Rating (kVA) for generator, solar PV, wind, battery; X″d (%) for generator and wind; Fault current (× rated) for solar PV, battery and wind, with one hint line for wind. The Fault level placeholder reads "<x> calculated" (two decimals below 1 kA), the X/R placeholder 10 for a machine and "not used" for an inverter, the Allowed load placeholder "<n> from the rating". The hints for a source with no level add ", or the source rating" for a kind that takes one. The values hidden by the kind (X″d of a PV source, the fault multiple of a generator) are not listed as given. The SLD fault line reads "Ik″ 2.4 kA calculated" (two decimals below 1 kA) with the basis line after it. The calculation report and the design basis print the kind, rating and basis.
- Limits (also in `docs/engineering/calculation-methods.md`): one source per first board (no sources in parallel); a generator's minimum fault current is taken from the same X″d, its sustained fault current is lower (type the minimum fault level to check disconnection against it); motor contribution is not applied; downstream of the incoming cable an inverter source gives slightly less than k · I_rated (the safe side for disconnection, immaterial for breaking capacity).
- Also in the review fixes: a fault current at or below the breaker rating can never trip it (disconnection fails, any source).
- Open points: a generator's sustained fault current is not modelled (type the minimum fault level); parallel sources are not modelled; the MD form documents print only a typed fault level (closed in v2.292: the TCL summary and the maximum-demand form print the calculated level, marked "(calc.)").

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
