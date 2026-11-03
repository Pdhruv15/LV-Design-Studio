# UI / UX proposal — Light room in Design CAD (2026-11-03)

Mockup: [cad-room-lighting-mockup.html](../../mockups/cad-room-lighting-mockup.html)

Item 5 of *CAD design tools - electrical and ELV - 2026-11-03*. The engine is built and tested (`src/calc/roomLighting.ts`, `src/model/roomLights.ts`); approved by the user on 2026-11-03 and built in v2.036 (same PR).

## Proposal

- **Plan → Devices → Light room** (LUX), next to Fill room.
- Point at a room that already has an outline (picked or traced): the luminaires are previewed on the plan at their grid positions inside the outline, L-shapes and angled walls too.
- Click to keep the preview; the side panel shows the room (area, perimeter), the inputs and the result:
  - target lux (from the room type), ceiling and working plane (from the level height), reflectances;
  - luminaire (lm, W, SHR limit), MF, UF (estimated when blank), circuit;
  - *Replace the lights already in this room* (on by default, so running it again does not double the room).
- Result: room index K, UF, needed, placed, achieved lux, spacing, SHR, W and W/m²; warnings for lux below target, SHR above the luminaire's limit, W/m² above the room type's LPD limit, estimated UF.
- **Place N lights** adds them as light points on the circuit (counted on the circuit, shown on the Lighting layout sheets as today).

## Decisions

1. Screen: **approved as in the mockup** (2026-11-03). Built with the CAD side panel's own fields and buttons, no new styles.
2. Luminaire list: not answered; v2.036 has the mockup's three typical LED luminaires (`LUMINAIRES` in `src/calc/roomLighting.ts`). Still open: a Luminaires database sheet, or typed per project.
3. *Light all rooms on the level*: not answered; left for later.
