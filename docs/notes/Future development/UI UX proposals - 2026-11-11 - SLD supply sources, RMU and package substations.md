# SLD supply sources, RMU and package substations — proposal (2026-11-11)

Status: **step 1 approved 2026-11-11 and built in v2.107** (PR 529: grid source with its fault level in the LV fault levels, RMU records and checks, labels on the SLD). Steps 2–5 and decisions D2–D8 still wait. For step 1 the defaults were taken for D1 (drawn on the same SLD: the existing utility symbol and RMU box carry the new labels) and D5 (symbols unchanged until the legend is decided).
Mockup with the legend symbols and typical arrangements: `docs/mockups/sld-supply-sources-mockup.html` (black-and-white, IEC 60617 style).

## Why

The SLD starts today at the main board. Upstream of it the app only knows:

- a transformer on the main board (kVA, Uk %, X/R, vector group);
- an RMU **name** on that board, drawn as a labelled box "RMU-n · 11 kV";
- an authority supply at a meter cabinet / MDB (fed from, device, rating, fault kA, cable "BY DEWA");
- a standby generator through an ATS (kVA only), PV as a generation feeder, and UPS boards.

The MV network is taken as infinite in the fault calculation. That fits a single building, but not:

1. **Large projects** — primary substation → 11 kV ring → the project's own RMU → transformers → LV MDB.
2. **Villa communities** — authority package substation → LV feeder pillars → villa meter cabinets.
3. **Single villas** — fed from an existing authority substation's LV way.
4. **Temporary or mobile supply** — construction power, events, mobile generator hook-up.
5. **Off-grid or hybrid sites** — diesel sets in sync, PV, battery storage.

## Proposed components

### A. Sources (top of the SLD)

| Tag | Component | Key parameters | Calculations it improves |
|---|---|---|---|
| GRID | Authority HV supply (11 / 22 / 33 kV from a primary substation; DEWA, ADDC, SEWA, FEWA, EtihadWE or a private master-community network) | operator, primary substation, feeder ref, kV, Hz, Sk″ MVA or Ik″ kA, X/R, HV earthing (solid / resistance A / isolated), earth-fault kA and clearing time, ring or radial | real source impedance in the LV fault level (IEC 60909 Zq = c·Un²/Sk″), earth conductor and pit I²t, RMU and MV cable short-circuit ratings |
| EX-SS | Existing authority substation (LV feed) | substation name / no., transformer kVA, Uk %, X/R, spare kVA (NOC / load letter), LV way A and device, authority cable size / length (or declared Ze / Ik), earthing system offered | Ze and fault level at the meter cabinet, voltage drop to the villa, spare-capacity check (joins the existing shared-substation checks) |
| DG | Diesel generator set (permanent; prime or standby) | kVA / kW, PF, ESP / PRP / COP (ISO 8528-1), kV, xd″ / xd′ / xd %, X/R, excitation support (PMG / AREP, e.g. 300 % In for 10 s), step-load class (ISO 8528-5 G1–G3), neutral earthing, fuel tank / autonomy, enclosure | generator-only fault current and disconnection times, motor-start voltage dip, step-load check, the existing generator sizing |
| MG | Mobile / temporary generator | kVA / kW, PF, rating class, xd″ (typical if unknown), connection (camlock / plug / hard-wired), MGCP and cable length, earthing (own electrode, TN-S / IT), temporary flag (out of the permanent BOQ) | fault level and disconnection on the temporary supply, RCD need, hook-up cable |
| PV | Solar PV system at a board (array + grid-tied inverters) | kWp DC, kW AC, inverter count, strings / MPPT, fault contribution × In (1.1–1.5), export limit / zero export, anti-islanding, authority scheme (e.g. Shams Dubai), metering (net / gross / check) | reverse power and busbar rating (sum of sources), fault contribution, PV share of demand |
| BESS | Battery energy storage | kWh, kW, inverter kVA, chemistry (LFP / NMC), usable DoD %, mode (peak-shaving / backup island / PV self-use), backup autonomy h, fault contribution × In | backup time for the essential load, island fault level, inverter rating |
| SRC | Other source (gas set, CHP, fuel cell, wind, district network) | name / type, kVA, PF, kV, fault contribution × In or Sk″, prime / standby / parallel | treated as a generator or inverter source by its fault data |

### B. MV switchgear and substations

| Tag | Component | Key parameters | Calculations it improves |
|---|---|---|---|
| RMU | Ring main unit (first-class item instead of a name) | configuration of ring (R) and tee-off (T) ways — RRT, RRTT, RRRT, extensible; 12 / 24 / 36 kV; 630 A; Ik kA 1 s / 3 s; SF6 / solid / air / eco gas; T-off protection fuse-switch (fuse A) or VCB + self-powered relay (50/51, 50N/51N); earth switch, VPIS, fault passage indicator; motorised / SCADA; owner | RMU Ik against the grid fault level, HV fuse / relay versus transformer inrush and LV discrimination, transformers per RMU (existing planner), RMU earth pits (existing earthing schematic) |
| TX | Distribution transformer (stays on the main board) | as today + oil ONAN / cast resin AN / AF, tap changer (±2 × 2.5 %), no-load and load losses, neutral earthing | as today + losses and tap position in voltage drop |
| PSS | Package (compact) substation: RMU + transformer + LV board in one enclosure | kVA (500 / 1000 / 1500), HV/LV kV, Uk %, RMU configuration, LV incomer ACB A, LV outgoing ways (count, fuse / MCCB rating), enclosure (steel / GRP, IP, kiosk / walk-in), owner, existing / new, plot | one block for the chain: fault level, LV way loading, spare ways, villa allocations; one BOQ line, or none if authority-owned |
| FPL | LV feeder pillar (street pillar to villa meter cabinets) | incoming cable from the PSS way and length, busbar A, outgoing ways (count, gG / NH fuse A), villas per way, owner | modelled as a board: loading and diversity across villas, fuse discrimination with the villa incomer, voltage drop to the furthest villa |
| VCB | MV switchboard / VCB panel (consumer HV board, large plots) | panels (incomer, coupler, feeders), kV, busbar A, Ik kA 3 s, VCB withdrawable A, relays 50/51, 50N/51N, 87T and settings, interlocks | MV fault level; relay grading against the transformer and LV ACB (later) |
| MVC | MV cable | 1C / 3C, Cu / Al, XLPE, 6.35/11 or 12/20 kV, mm², runs, length, screen type and fault rating kA 1 s, installation | MV voltage drop, impedance added to the source, conductor and screen adiabatic check |
| HVM | HV metering unit | CT ratio / class (0.2S / 0.5S), VT ratio / class, meter, owner | labels only |

### C. Changeover and hook-up

| Tag | Component | Key parameters | Calculations it improves |
|---|---|---|---|
| MGCP | Mobile generator connection point | rating A, connector (camlock / plug), phase-rotation indicator, earth stud, fed board, changeover (MTS / ATS) | rating against the board it feeds; links a mobile generator to a board |
| MTS | Manual transfer switch (next to the existing ATS) | A, 4P switched neutral, I – 0 – II, AC-31B / AC-33B | rating check against the board (as the ATS) |
| SYNC | Generator synchronising panel | sets and ratings (N+1), common bus A and Ik kA, kW / kvar sharing, priority start, parallel with mains (no / short-time / continuous) | total and N−1 capacity, combined fault level on the generator bus |
| — | Ownership boundary (dash-dot line, AUTHORITY / CONSUMER) | position (RMU / PSS LV way / meter cabinet), text | everything above it left out of the BOQ, as EXISTING items are today |

## How it fits the current model (sketch)

- New `project.sources[]` (GRID, EX-SS, DG, MG, PV, BESS, SRC) and `project.rmus[]`; `Board.rmu` keeps the RMU name, so old projects open unchanged and the existing RMU-n names become RMU records on load.
- A source links to what it feeds: an RMU, a PSS, an MGCP, a changeover or a board.
- The PSS is one record holding its RMU, transformer and LV way data; its LV ways feed boards as feeders do today.
- The feeder pillar becomes a new board kind (`LV-FPL`), so the load schedule, loading, fault and voltage-drop engines work on it unchanged (the tag `FP` is already the fire pump panel).
- Standby generator: today's `standby` block stays; a DG source can be linked to it for xd″ and step-load data.
- Calculations: the grid Sk″ and X/R feed the main-board fault level; MV cable impedance adds to it; generator and inverter sources add an island (generator-only) fault case.

## Suggested build order

1. **Grid source + RMU as an item** — HV fault level in the LV fault calculation (calculation gain on every project), RMU configuration and ratings on the SLD.
2. **Villa communities** — package substation, feeder pillar, existing-substation LV feed with the authority cable, ownership boundary and BOQ exclusion.
3. **Generators** — DG data (xd″, step load), mobile generator + MGCP + MTS, synchronising panel, generator-only fault case.
4. **PV and BESS as sources** at a board (beyond the PV feeder), hybrid sites.
5. **MV switchboard, MV cable and HV metering**, relay grading.

Each step: model + calculations + tests first, then the SLD symbol and the property fields.

## Decisions needed

- **D1** — Where the upstream chain is drawn: above the main boards on the same SLD (proposed), or on a separate "MV network" sheet.
- **D2** — Default RMU for DEWA projects (e.g. RRT with fuse-switch T-off, or VCB T-off above a set kVA) — please confirm the authority's current standard.
- **D3** — Package substation drawn as one compact block (proposed, as in the mockup) or exploded into RMU + transformer + LV board.
- **D4** — Feeder pillar as a board kind with its own load schedule (proposed).
- **D5** — Symbols: IEC 60617 style as in the mockup, or the office's own legend.
- **D6** — Ownership boundary drawn on the SLD, with everything above it left out of the BOQ (proposed).
- **D7** — Authority defaults: DEWA values first; ADDC, SEWA, FEWA, EtihadWE copied and marked "to verify" (as the design references do today).
- **D8** — Which step to start with (proposed: step 1).
