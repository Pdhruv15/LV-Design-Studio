# 18 — Lighting / lux design, room lighting, emergency lighting, luminaire schedule
[← Index](00-index.md) · [Integration map](99-integration-map.md)

## 1. What it does

The module has four parts:

1. **Quick lux calculator** (rectangular room) — `src/calc/lighting.ts` `lumenMethod`, shown in Quick calculators (`src/components/QuickCalcs.tsx`, card "Lighting — lux (lumen method)") with a 2D setting-out plan (`src/components/LuxLayoutPlan.tsx`). It works out:
   - mounting height above the working plane Hm = ceiling − suspension − working plane;
   - room index K = L·W ÷ (Hm·(L + W)) (`roomIndex`);
   - utilisation factor UF: typed by the user (manufacturer value) **or** estimated from a built-in table of UF against K for six ceiling/wall/floor reflectance sets (`estimateUf`, `UF_TABLE`, linear interpolation, clamped at K = 0.6 and K = 5);
   - number of luminaires N = E·A ÷ (Φ·UF·MF), rounded up and laid out as a rows × columns grid (`gridLayout`), then the achieved average E = N·Φ·UF·MF ÷ A;
   - spacing along L and W, spacing-to-height ratio SHR = max spacing ÷ Hm (warning above 1.5), total W, W/m² and W/m² per 100 lx.
2. **Light room on the CAD plan** (any room outline: rectangle, L-shape, angled walls) — `src/calc/roomLighting.ts` `roomLighting`. Same lumen method, but with the general room index K = 2A ÷ (Hm·P) (`roomIndexOf`), luminaire points placed on a grid inside the outline (`gridInOutline`), and warnings for: achieved lux below target, SHR above the luminaire's data-sheet maximum, lighting power density (W/m²) above the room type's limit, UF estimated. Starting values per room come from `roomLightingDefaults` (target lux from the room type, ceiling = floor-to-floor height − 0.6 m clamped 2.4–3.5 m, working plane 0.85 m or 0 m for lobby/parking/store/plant, MF 0.8, reflectances 0.5/0.3/0.2). The result is placed as lighting points on a chosen circuit (`src/model/roomLights.ts` `placeRoomLights`).
3. **Emergency escape lighting on the CAD plan** — `src/calc/emergencyLighting.ts`, after BS 5266-1:2016 / EN 1838:2013, by the **spacing-table method** (no illuminance calculation):
   - points of emphasis more than 2 m from any route get their own fitting (`emergencyLayout`);
   - open (anti-panic) areas: a grid of fittings in a room outline, cell ≤ min(open spacing, 2 × wall distance) (`openArea`);
   - exit signs at the exit end and direction signs at each change of direction; the farthest distance from any point of the route to a sign is checked against the sign's viewing distance d = z × h, z = 200 internally lit / 100 externally lit (`signViewingM`);
   - duration rule 3 h / 1 h (`durationH`) — shown only.
   The layout is placed as lighting points tagged as emergency fitting / exit sign / direction sign (`src/model/emergencyPlace.ts` `placeEmergency`).
4. **Luminaire schedule** — `src/model/luminaireSchedule.ts` `luminaireSchedule`: the typed lights on the plans grouped by type (L1, L2… per catalogue entry and wattage; EM1, EX1, DS1 for emergency items) with count per board and floors. It feeds the BOM/BOQ and a "Luminaire schedule" sheet in the BOQ workbook.

## 2. Files, components, functions and stores

| File | Kind | Key functions or components | What they do |
|---|---|---|---|
| `src/calc/lighting.ts` | calc | `LUX_TARGETS`, `REFLECTANCES`, `UF_TABLE` (private), `roomIndex`, `estimateUf`, `gridLayout`, `lumenMethod`, `LuxInput`, `LuxResult` | Rectangular lumen method, UF estimate table, target lux list for the quick calculator |
| `src/calc/roomLighting.ts` | calc | `LUMINAIRES`, `luminairesOf`, `roomIndexOf`, `gridInOutline`, `roomLighting`, `roomLightingDefaults` | Lumen method for any room outline on a CAD level; default inputs from room type and level height; built-in luminaire list |
| `src/calc/emergencyLighting.ts` | calc | `EMPHASIS_LABEL`, `EMPHASIS_REACH_M`, `TYPICAL_FITTING`, `project`, `pointAt`, `escapeRoute`, `OPEN_AREA_M2`, `needsOpenArea`, `openArea`, `signViewingM`, `durationH`, `emergencyLayout` | Escape-route, open-area and sign layout by spacing table |
| `src/model/roomLights.ts` | model | `placeRoomLights` | Puts the room's light points on one circuit; with `replace`, first removes every lighting point inside the room |
| `src/model/emergencyPlace.ts` | model | `placeEmergency` | Puts each emergency fitting and sign on one circuit as an `ltg` point with an `emergency` tag |
| `src/model/luminaireSchedule.ts` | model | `luminaireSchedule`, `LuminaireType` | Groups typed lights on the plans into L1…/EM1/EX1/DS1 with counts per board and floor |
| `src/model/cadDevices.ts` (shared with 22) | model | `LvPoint` (`emergency`, `luminaire` fields), `PointLuminaire`, `EMERGENCY_ITEMS`, `placeLvPoint`, `removeLvPoint`, `withCount` | The saved plan point; placing/removing one changes the circuit's `points.ltg` count |
| `src/components/QuickCalcs.tsx` (card `lux`) | screen | `lumenMethod` call at :288, card at :562 | Quick lux calculator inputs/outputs; validation via `src/components/quickInputs.ts` `quickInputErrors('lux')` |
| `src/components/LuxLayoutPlan.tsx` | screen | `LuxLayoutPlan` | SVG plan of the rows × columns grid with setting-out dimensions (quick calculator only) |
| `src/components/cad/RoomLightingPanel.tsx` | screen | `LuxSettings`, `LUX_START`, `lightingOf`, `RoomLightingPanel` | CAD "Light room" side panel: target lux, ceiling, working plane, reflectances, luminaire, MF, UF, circuit, Replace, result, Place |
| `src/components/cad/EmergencyPanel.tsx` | screen | `EmSettings`, `EM_START`, `EM_PROMPT`, `emFitting`, `EmergencyPanel` | CAD "Emergency" side panel: mode (route / open area / point of emphasis), spacing table values, sign height, premises duration, circuit, result, Place |
| `src/components/cad/CadPage.tsx` | screen / state | `luxRoom`, `luxSet` (:313–314), `em`, `emSet` (:316–317), `lit` (:588), `emLayout` (:591), `placeLux` (:1023), `finishRoute`, `placeEm` (:1042), click handlers (:2092–2107) | Wires the two panels to the canvas; all lighting/emergency inputs are component state only |
| `src/model/emergency.ts` | model (power, not lighting) | `PanelRole`, `PANEL_ROLES`, `prefixOf`, `roleOf`, `planEmergency` | EMDB/ESMDB/EDB board planner (see §1) |
| `src/calc/bom.ts` (:287–292) | calc (20) | `luminaireSchedule` loop | One BOM line "Luminaire type Lx …" per type per board |
| `src/docs/boqWorkbook.ts` (:251–271) | report (20/25) | "Luminaire schedule" worksheet | Type, description, manufacturer, W, lm, qty, boards, levels, total W |
| `src/docs/planLayout.ts` (:124–126) | report (23/24) | plan marks | Draws emergency symbols (E, EX, DS) on plan sheets |

## 3. Inputs — where its data comes from

| Data | From module (ID) | File + function |
|---|---|---|
| Room outline (metres on the level's plan), area, room type, level | 22-cad-electrical / 04-building-load-assessment | `src/calc/building.ts` `buildingInfoOf`; `src/components/cad/CadPage.tsx` `roomAtPointOf` |
| Floor-to-floor height (for default ceiling) | 04-building-load-assessment | `roomLightingDefaults` → `info.buildings[].levels[].heightM` |
| Luminaire lumens, watts, SHR max, manufacturer | 32-component-database | `src/database/catalog.ts` `catalog().luminaires` (Luminaires.xlsx, parsed in `src/database/database.ts` :235–239); fallback `LUMINAIRES` |
| MF, UF, reflectances, ceiling, working plane, target override | user (panel state) | `RoomLightingPanel.tsx` `LuxSettings`, `lightingOf` |
| Escape routes, points of emphasis, open-area rooms | user clicks on the CAD canvas (state) | `CadPage.tsx` `em` state, `finishRoute`, click handler :2099–2107 |
| Emergency fitting spacing table (route spacing, end, open spacing, wall) | user (panel state); default `TYPICAL_FITTING` | `EmergencyPanel.tsx` `emFitting` |
| Final circuits to place on | 07-load-schedule-panels | `src/model/cadDevices.ts` `finalCircuits` (CadPage :540) |
| Quick-calc inputs | user (saved in quick-calc inputs) | `QuickCalcs.tsx` `useInputs('lux', …)` |

## 4. Outputs — where its results go

| Result | Used by module (ID) | File + function |
|---|---|---|
| Light points (`LvPoint` with `luminaire`) and emergency points (`LvPoint` with `emergency`) saved in `project.lvPoints` | 02-project-storage, 22-cad-electrical | `placeLvPoint` (`src/model/cadDevices.ts` :94) |
| Circuit `points.ltg` count +1 per point → circuit load = count × DB WATT/UNIT for `ltg`, then MCB / cable re-sizing | 07-load-schedule-panels, 11-breaker-cable-selection | `withCount` → `src/model/schedule.ts` `updateCircuit` → `refresh` → `circuitWatts` |
| Luminaire schedule types and counts | 20-equipment-boq-pricing | `src/calc/bom.ts` :289; `src/docs/boqWorkbook.ts` :252 |
| Emergency symbols on plan sheets | 23-cad-sheets-plot-titleblock / 24-drawings-sld-sheets | `src/docs/planLayout.ts` :124 |
| Plan points wired into circuits (home runs) | 22-cad-electrical | `wireLevel` (CadPage `wireAll`) uses `lvPoints` |
| Quick-calc result and SVG plan | screen only | `QuickCalcs.tsx`, `LuxLayoutPlan` |

## 5. User flow — from button click to result

**Light room (LUX)**
1. Design CAD → Light room tool (`tool === 'lux'` in `CadPage.tsx`). Hovering a room computes a preview with `lightingOf(project, room, luxSet)` (:588).
2. Click a room → `roomAtPointOf` finds it; `setLuxRoom(room.id)` keeps it; target/ceiling/working-plane overrides are cleared (:2092–2098).
3. `RoomLightingPanel` shows defaults from `roomLightingDefaults`; the engineer changes luminaire, MF, UF, reflectances, picks a circuit. Each change re-runs `lightingOf` → `roomLighting` → `gridInOutline`.
4. Place → `placeLux` (:1023) → `placeRoomLights(project, level, roomId, feederId, points, replace, luminaire)`. With Replace (default on) every `ltg` point inside the room outline is removed first (`removeLvPoint`), then each point is placed by `placeLvPoint`, which adds `points.ltg + 1` to the circuit via `updateCircuit`.
5. `change(...)` stores the new project (undoable); the message reports lights placed and achieved lux.

**Emergency (EM)**
1. Design CAD → Emergency tool (`tool === 'em'`). Mode buttons in `EmergencyPanel` choose Escape route / Open area / Point of emphasis.
2. Route mode: clicks add vertices; Enter → `finishRoute` converts to metres and appends to `em.routes`. Point mode: click adds `{ at, kind }` to `em.points`. Open-area mode: click toggles a room in `em.rooms`.
3. Every change re-runs `emergencyLayout(routes, points, openRooms, fitting, signViewM)` (:591) → `escapeRoute` per route and `openArea` per room; ghosts are drawn on the canvas.
4. Place → `placeEm` (:1042) → `placeEmergency` → `placeLvPoint(…, 'ltg', feederId, x, y, 'fitting' | 'exit-sign' | 'direction-sign')` for each item. Routes, points of emphasis and settings are then cleared.

**Luminaire schedule / BOQ**
1. BOQ screen or BOQ Excel export → `buildBom` (`src/calc/bom.ts`) / BOQ workbook → `luminaireSchedule(project)` groups the typed points.

**Quick lux calculator**
1. Quick calculators → Lighting card → inputs validated by `quickInputErrors('lux')` (UF and MF in (0, 1]) → `lumenMethod` → outputs and `LuxLayoutPlan`.

## 6. Linked to (working connections)

- **22-cad-electrical** — room outlines and plan points: rooms picked with `roomAtPointOf`; placed points are ordinary `LvPoint`s, so move / delete / wire / circuit-change tools work on them (`src/model/deviceEdit.ts`).
- **04-building-load-assessment** — room type target lux and level height feed `roomLightingDefaults`.
- **07-load-schedule-panels** — each placed point adds 1 to the circuit's LTG count (`withCount`), so the schedule's point columns follow the plans.
- **20-equipment-boq-pricing** — typed luminaires and emergency items become BOQ lines and a Luminaire schedule sheet (`bom.ts` :289, `boqWorkbook.ts` :252).
- **23-cad-sheets-plot-titleblock / 24-drawings-sld-sheets** — emergency symbols drawn on plan sheets (`planLayout.ts` :124).
- **02-project-storage** — `lvPoints` with `luminaire` / `emergency` are saved in the project; undo through `change`.



---

*Public summary: describes what the module does and how it connects. The engineering review of open issues is kept separately.*
