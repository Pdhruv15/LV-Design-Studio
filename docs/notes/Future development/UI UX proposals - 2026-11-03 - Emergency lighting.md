# UI / UX proposal — Emergency lighting in Design CAD (2026-11-03)

Mockup: [cad-emergency-lighting-mockup.html](../../mockups/cad-emergency-lighting-mockup.html)

Item 6 of *CAD design tools - electrical and ELV - 2026-11-03* (in PR 420). The engine is built and tested (`src/calc/emergencyLighting.ts`); approved by the user on 2026-11-03 and built in v2.037 (same PR).

## Proposal

- **Plan → Devices → Emergency** (EM), after Light room. Three modes in the side panel:
  - **Escape route:** click its points along the corridor centre line, from the far end to the exit, Enter to finish.
  - **Open area:** click inside a room (over 60 m², or one the route passes through).
  - **Point of emphasis:** choose what it is (call point, extinguisher, exit door, final exit, stair, change of level, intersection, first aid, safety sign), then click it.
- The app puts a fitting within the end distance of each end, at each change of direction (a turn of more than 30°) and at each point of emphasis within 2 m of the route (one further away gets its own fitting, noted). Gaps longer than the route spacing are split evenly. Open areas get a grid with no wall further than the wall distance.
- Exit signs go at the exit and at each change of direction. Viewing distance = 200 × sign height when internally lit, 100 × when externally lit (EN 1838), and any point of the route further than that from a sign is flagged.
- Duration: 3 h where people sleep or the building is reoccupied, 1 h only for immediate evacuation without reoccupation (BS 5266-1).
- Result: route length, largest gap, fittings by reason, open-area fittings, signs and viewing distance, duration, load (W). **Place N fittings and M signs** puts them on the chosen (unswitched) circuit.

## Decisions

1. Screen: **approved as in the mockup** (2026-11-03). Built with the CAD side panel's own fields and buttons, no new styles. The mockup's fitting *Type* (maintained / non-maintained) is left out: it changes nothing in the layout.
2. Load schedule: not answered; built as **lighting points on the circuit** (`LvPoint.emergency` tags them). The standard load EM1 is already a lighting point; a new Emergency column would change every load schedule form and PDF. Still open.
3. Spacing data: not answered; **typed in the panel** (typical 3 W LED values to start), kept while the page is open. Columns in the Luminaires sheet (PR 420) can follow once it is merged. Still open.
4. Plan sheets: not answered; on the **Lighting layout** sheet with their own symbols (E, EX, DS) and legend lines. Still open.
