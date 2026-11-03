# CAD design tools — electrical and ELV (2026-11-03)

Principle (user, 2026-11-03): no automatic extraction from the architect's drawing — it is often messy. The engineer points (click a room, trace an outline, pick a block, draw a route); the app measures, calculates, checks and writes the results to the schedules.

Already built: rooms (click inside / trace / pick name), place board, trays and cable routes, circuit wiring with home runs and lengths, device fill-room and copy-to-level, fire detector radius (BS 5839-1), CCTV DORI cones (IEC 62676-4), plan sheets and containment sheets, revision clouds. Still open from *CAD and SLD tool ideas - 2026-10-29*: Offset/Mirror/Trim etc., compare plan revisions, DB front-access clearance.

## Help the engineer read the drawing (no auto-extraction)

1. **Scale calibration.** Pick two points and type the real distance; for PDF or image plans, and DWGs drawn at the wrong unit.
2. **PDF / image plan as an underlay** (architects often send PDF only), traced with the room tools after calibration.
3. **Select similar.** Pick one architect block or symbol (for example a door or a WC); the app selects the same blocks on the level for the engineer to confirm, then counts them or places a device at each.
4. **Room templates.** Room type → its standard devices (Bedroom: light points, sockets, TV, data, AC isolator), placed in the room for the engineer to move; loads go to the load schedule.

## Electrical design on the plan

5. **Lighting per room by the lumen method.** Room area and height from the outline, target lux from the room type (EN 12464-1), chosen luminaire (lm, W) and maintenance factor → number of fittings, placed on a grid, W/m² checked against the LPD limit. The quick lux calc already exists; this puts it on the plan.
6. **Emergency lighting.** Draw the escape route; the app places fittings at exits, changes of direction and stairs, checks spacing against the fitting's data (BS 5266-1 / EN 1838: 1 lx on the route centre line, 0.5 lx open area) and flags gaps.
7. **Bathroom zones (BS 7671 Section 701).** Mark the bath or shower; the app draws zones 0/1/2 and flags sockets, switches and fittings with the wrong IP or position.
8. **Tray fill along the route.** Each tray segment knows the cables routed through it → fill % and a suggested tray size per segment, coloured on the plan.
9. **Risers between levels.** A riser point at the same position on each level; vertical length from level heights is added to cable lengths, and feeds the DB riser sheet.
10. **Load density view.** Colour rooms by W/m² against the room-type value, to spot a missed or doubled load.
11. **DB location helper.** Show the load centre of a DB's circuits and the longest circuit's voltage drop if the DB moves to a picked point. Advice only; the engineer places the DB.
12. **Fire-stopping list.** Where a cable route or tray crosses a wall the engineer marked fire-rated, list each penetration for the BOQ.
13. **Lightning protection on the roof plan (BS EN 62305-3).** Trace the roof outline, pick the LPS class → mesh size (5/10/15/20 m), air-termination and down-conductor spacing (10/10/15/20 m), test joints and earth pits; lengths to the BOQ. 2D only.

## ELV design on the plan

14. **Data outlet 90 m check (ISO/IEC 11801, TIA-568).** Route length from each outlet to its comms room; outlets over 90 m permanent link are flagged.
15. **Sounder and PA coverage.** Sound level from each sounder or speaker (inverse-square, dB at 1 m), coloured by room against 65 dB(A) or ambient + 5 dB (BS 5839-1), and 0.5 dB / speech intelligibility notes for PA (BS 5839-8).
16. **Fire alarm loops.** Draw the loop through its devices: device count and spare against the loop limit, loop length, loop voltage drop from the panel's data.
17. **Battery standby calcs** for fire alarm (24 h + 30 min alarm, BS 5839-1 / EN 54-4), PA and access control, from the devices placed.
18. **Access control door sets.** Click a door → reader, lock, exit button, break-glass, door contact as one set; a door schedule is produced.
19. **Wi-Fi access point coverage** circles by AP type, to show gaps.
20. **ELV riser diagrams** per system, made from what is placed per level (like the DB riser).

## Suggested first

Scale calibration (1) and PDF underlay (2) unlock most projects; then lighting by the lumen method (5) and the 90 m data check (14), which reuse existing room and route data.

## Decisions for the user

- Which items, and in what order?
- Lighting: luminaire data from the database or typed per project?
- Lightning protection: on the existing earthing page or in Design CAD?
