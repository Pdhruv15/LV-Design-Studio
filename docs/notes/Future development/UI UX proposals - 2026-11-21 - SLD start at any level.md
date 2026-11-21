# SLD start at any level — proposal (2026-11-21)

Status: **proposal, nothing built**. Decisions D1–D7 at the end are open.
Mockup: `docs/mockups/sld-start-level-mockup.html` + `.png`.
Related: [[UI UX proposals - 2026-11-11 - SLD supply sources, RMU and package substations]] (steps 2–5 still wait) and [[UI UX proposals - 2026-11-18 - SLD by substation, RMU and transformer]] (all built).

## What was asked

- An SLD does not always start at the authority's incoming line or the transformer. An engineer may be given only a final DB, an SMDB, an MDB or a substation, and must be able to work from there.
- From generation down to the final DB: which stages exist, can the app start at each one, and what must change where it cannot.

## The stages, from generation to the final circuit

| # | Stage | Usually by | Start here today (main, v2.252) |
|---|---|---|---|
| 1 | Generation and step-up | authority | Not modelled |
| 2 | Transmission and grid substation (400 / 132 kV) | authority | Not modelled |
| 3 | Primary substation (132 / 11 kV or 33 / 11 kV) and its 11 kV feeder | authority | Only as one line of data: the grid source's voltage and fault level |
| 4 | 11 kV ring at the plot (grid source) | authority | Record only. Nothing is drawn or calculated until a transformer board exists |
| 5 | RMU or MV switchgear | authority or consumer | Record only, as stage 4 |
| 6 | Transformer and LV main board | consumer | **Works.** The only start a new project offers |
| 7 | Main board on an authority LV supply (meter cabinet, feeder pillar, LV feeder from the authority's substation) | consumer | **Partly.** See below |
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
| Authority LV supply | stage 7 | exists (`Board.supply`), gains the values below |
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
3. Main board on an authority LV supply
4. Transformer and main board (today's start, stays the default)
5. RMU and transformer
6. 11 kV ring with several substations

Tiles 1–3 make one board of that type with an empty supply point. Tiles 5–6 open the MV supply and RMUs card after the project is made. Canvas drop accepts every board type as a first board.

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

Above the grid source (stages 1–3) the authority's network stays one equivalent: voltage and fault level. The primary substation name and feeder reference stay as text.

### 7. Calculations and outputs follow the supply point

- Earth fault loop reads the typed Ze; without one it is estimated from the fault level and marked "estimated".
- The 0.01 Ω source is shown as **assumed** wherever its fault level appears, and the Icu and Icw checks against it end "Not verified".
- Transformer sizing lists only first boards on a transformer. The others get a supply check: demand against the allowed load.
- OpenDSS gets a source with the given fault level.
- Equipment schedule "Fed from", the design-stage checklist and the substation count read the supply point.

## Build steps

One PR each, in this order. Steps A and B change no screen.

| Step | What | Screens |
|---|---|---|
| A | Calculation fixes: earth loop reads the supply fault level, OpenDSS source, loading from the supply rating, transformer sizing skips boards without a transformer, checklist for one board, "assumed" flag on the 0.01 Ω source | none |
| B | Data and calculations for the given values: drop used, Ze, X/R, upstream device, checked incoming cable; headless tools | none |
| C | Draw the supply point: system diagram, Board tab, sheets | drawing |
| D | Supply tab: Fed from and its fields | inspector |
| E | New project start level; any board type on the canvas | New project |
| F | Add upstream board and Connect to | right-click menu |
| G | Start at the 11 kV side: spare tee-offs, Add transformer and main board | MV overview |

Later, with the supply sources proposal: generator as the only source, PV and battery as sources, MV switchboard and MV cables.

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
