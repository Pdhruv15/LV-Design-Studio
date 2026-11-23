# UI UX proposal – Load schedule earth leakage: ELCB sizes, board schemes and devices (2026-11-23)

Status: **proposal, waiting for decisions A–G.** Nothing is built.

Mockup: `docs/mockups/load-schedule-earth-leakage-mockup.html` (image: `load-schedule-earth-leakage-mockup.png`).

![Earth leakage: ELCB sizes, schemes and devices on the DB load schedule](../../mockups/load-schedule-earth-leakage-mockup.png)

## What the user asked

The user sent a crop of the board bar's **ELCB per [6 circuits (2 ways)]** list: "this is not what I expected; it makes the ELCB 6 or 3 way in the load schedule, but I want to add an ELCB with 6 or 3 ways. Is 9 ways available? What do other countries use: an ELCB on each circuit, or only on the main board? What if I want an RCBO or another device? Give an idea and a mockup."

## Today (v2.262)

- **ELCB per** (`Board.elcbGroupSize`: 0, 3 or 6) is a rule for the whole DB. `elcbSections` cuts the ways into groups of 1 or 2 ways and `elcbGroups` sizes one 4P ELCB per group. It does not add a device, and there is no 9 or 12.
- **Add → ELCB / RCD → 3-phase ELCB over ways…** (`Board.elcbs`, `addBoardElcb`, since v2.201) already places one ELCB over any ways the user types: way 3 to way 5 is a 9-circuit ELCB. The dialog asks way numbers only, so the size is not obvious.
- **1-phase RCBO** (`Feeder.rcbo`) replaces one circuit's MCB. A 3-phase circuit cannot have an RCBO (`isRcbo` excludes RYB). There is no AFDD, RCD add-on block, RCD type (AC / A / F / B), whole-board ELCB or "no RCD" circuit.
- A **way** in this app is R + Y + B of one row number, 3 circuits. A UK "9-way" board means 9 single-phase circuits, which is 3 ways here. The proposal names every size by circuits first.

## What other countries use (summary for design only)

| Where | 30 mA protection required for | How DBs are usually arranged |
|---|---|---|
| Gulf countries (utility wiring rules, common practice) | Socket and power circuits 30 mA; lighting often 100 mA (the app's settings today) | 4P ELCB (RCCB) over 1 or 2 ways of a 3-phase DB, MCBs below; RCBO for single wet-area or outdoor circuits |
| UK and Ireland (BS 7671, I.S. 10101) | Sockets up to 32 A, mobile equipment outdoors, cables in walls less than 50 mm deep, all lighting in dwellings, bathrooms | Split-load board (two 30 mA RCCBs) or, now usual, an RCBO on every circuit. Since A2:2022, AFDDs on single-phase socket circuits up to 32 A in high-rise residential buildings, HMOs, student housing and care homes, so AFDD + RCBO there |
| Europe (IEC 60364; France NF C 15-100 and others) | Sockets up to 32 A for ordinary persons and outdoor mobile equipment (IEC 60364-4-41); many countries add lighting in dwellings | Groups of circuits per 30 mA RCCB, several RCCBs so one trip does not cut the whole home. France: at least two 30 mA RCDs (one Type A), at most 8 circuits per RCD |
| Australia and New Zealand (AS/NZS 3000:2018) | All final subcircuits in homes | At most 3 circuits per RCD, at least two RCDs, lighting circuits shared between them; an RCBO per circuit is often recommended |
| USA and Canada (NEC, CEC) | GFCI (about 5 mA) for receptacles in bathrooms, kitchens, outdoors, garages, basements, laundry; AFCI in dwelling rooms | No board-wide RCD: a GFCI, AFCI or dual-function breaker per circuit, or a GFCI receptacle; 120/240 V split-phase (outside the 230/400 V DB form) |
| Small DBs and TT supplies (parts of South and South-East Asia) | Whole installation, 30 or 100 mA | One RCCB at the DB incomer; on TT supplies a time-delayed (S-type) 100 mA RCD upstream lets 30 mA devices below trip first |

Check the edition and local rules of each project; the app applies no country by default and prints no authority name.

## Proposed

1. **Sizes by circuits.** The ELCB / RCD menu gets size buttons — 3 circuits (1 way), 6 (2 ways), 9 (3 ways), 12 (4 ways) — that add a 4P ELCB in one click from the selected circuit's way. "Other ways, poles, type, rating…" opens the dialog, which gets the same size buttons above From way (the To way follows the size; "Other" lets the user type it) and lists the circuits it covers.
2. **Board bar: "ELCB per" becomes "Earth leakage",** a scheme for the whole DB: ELCB per 3 / 6 / 9 / 12 circuits, One ELCB at the incomer, RCBO on every circuit, No earth leakage on this DB (an RCD upstream covers it). Devices placed by hand stay; the scheme fills the ways that are left, as today.
3. **More devices for one circuit:** AFDD + RCBO, MCB + RCD add-on block, No RCD (asks the reason: fire alarm panel, smoke extract), and a 4P RCBO for a 3-phase circuit. A circuit keeps one earth leakage device only (the user's rule of 2026-11-18).
4. **RCD type** (AC / A / F / B) on every ELCB and RCBO, Auto by load type: EV charging B (A when the charger has 6 mA DC detection), inverter AC F, otherwise A. A board-bar default sits beside Sensitivity.
5. **Grid and prints:** the ELCB column shows the device, rating, mA, poles and type; "No RCD" shows its reason and the earth fault check must pass on the MCB alone. PDF and Excel stay black and white. BOQ, enclosure list and earth fault check (`rcdOf`) count each device kind.

## Decisions for the user

- **A.** Rename "ELCB per" to **Earth leakage** with the scheme list (recommended), or keep "ELCB per" and only add 9 and 12?
- **B.** Sizes 3 / 6 / 9 / 12 circuits + Other (recommended), or only 3 / 6 / 9?
- **C.** A size button starts at the selected circuit's way (recommended), or at the first way with no device placed by hand?
- **D.** New devices: 4P RCBO, No RCD and RCD type first (recommended), then AFDD + RCBO and MCB + RCD add-on block; or all together?
- **E.** Print the RCD type in the PDF and Excel ELCB cell ("25 A 30 mA 4P Type A"): only when it is not the default A (recommended), or always?
- **F.** No country rule by default (recommended); add an optional design rule "most circuits per RCD" (3 or 8, for example) that only warns in the Check column?
- **G.** One ELCB at the incomer: one cell over all rows in the ELCB column and "+ ELCB 100 A 30 mA 4P" after the incomer (recommended); offer S-type when 30 mA devices sit below it?

## Suggested build steps (after approval, one PR each)

1. **Sizes:** `elcbGroupSize` gains 9 and 12; size buttons in the menu and the dialog. Hand ELCBs already take any ways.
2. **Devices:** one earth leakage device kind on the circuit (RCBO, AFDD + RCBO, MCB + RCD add-on, none) in place of the `rcbo` flag, with old projects read as RCBO; 4P RCBO for RYB circuits. PDF, Excel, BOQ, enclosure list and earth fault check follow.
3. **RCD type:** AC / A / F / B on `BoardElcb`, the board and the circuit device; Auto by load type; printed per E; counted in the BOQ.
4. **Schemes:** One ELCB at the incomer and RCBO on every circuit; S-type per G.

Each step adds tests for grouping, numbering, ratings and exports; Balance phases keeps circuits under devices placed by hand in their ways, as today.
