# 30 — Data exchange contracts, design export, inbox
[← Index](00-index.md) · [Integration map](99-integration-map.md)

## 1. What it does

This module is the door between LV Design Studio and other programs.

- **Incoming (the inbox).** Other programs send *exchange packages*: JSON files with room schedules (from CAD or IFC/BIM), luminaire schedules (lighting design program) or ELV upstream loads (from the app's own ELV estimate). A package is checked against a written *contract* (a fixed list of fields, units and limits), compared with the project, and nothing changes until the engineer ticks the rows to take and signs the decision with a name. Each decision is logged with the package's SHA-256 hash (a fingerprint of the file's contents), so the same file arriving again is recognised.
- **Outgoing.** Two exports: a *rooms package* (the project's rooms for ELV design) and a *design package* (`lvds.design`: boards, circuits, breaker, cable, load and calculated results, for BIM add-ins and scripts). Both are only reachable from the headless tools (the command-line / MCP interface, module 31-headless-cli-mcp), not from a screen.

Terms used below: *zod* = the library the code uses to describe and check the shape of data; *schema* = that description, also written out as JSON Schema files in `contracts/` for other programs; *store / project state* = the copy of the project the app keeps in memory; *undo step* = one entry in the undo history.

## 2. Files, components, functions and stores

| File | Kind | Key functions or components | What they do |
|---|---|---|---|
| `src/exchange/designExport.ts` | calc / report | `designExport`, `designHashedText`, `r3`, `opt` | Runs every study now (`runCalculations`), maps boards and circuits to the design contract, adds a study-input fingerprint and a sha256 (not covering `exportedAt`), then validates its own output with `designPackage.parse` before returning it. |
| `src/components/elv/InboxView.tsx` | screen | `InboxView` (default export), `InboxItem`, `act`, `open` | Inbox page: "Open package file…", list of waiting packages, change table with tick boxes, "Decided by" name, Reject / Accept selected, History table, "Place on boards…" after ELV loads. |
| `src/App.tsx:338-341, 1656-1659` | store | `inbox` state, `inboxKey`, `inboxHere`, `onSend`, `onOpen`, `onDecided` | Holds the waiting packages in memory per project (`project.id ?? project.name`); on a decision writes the new project as one undo step (`setProject(next, { step: true })`) and drops the package from the list. |
| `src/components/Ribbon.tsx:545` | screen | `view('inbox', …)`, `inboxCount` | Ribbon button with a "n to review" badge. |
| `src/headless/exchangeTools.ts` | headless | `EXCHANGE_TOOLS` (`exchange_check`, `exchange_review`, `exchange_apply`), `readFile`, `checked`, `summary` | Same check / review / decide from the CLI or MCP. Reads only inside the projects folder, max 20 MB; `exchange_apply` previews by default and needs `approvedBy`; writing keeps a backup and an `undo_change` entry (`src/headless/editTools.ts:edit`). |
| `src/headless/exportTools.ts:278-310` | headless | `export_rooms_package`, `export_design_package`, `export_elv_loads_package` | The three exports (preview first; exporting needs `approvedBy`). |
| `src/elv/package.ts` | model | `elvLoadsPackage`, `ELV_CATALOGUE_REVISION` | Builds the ELV loads package from the ELV estimate (module 29-elv) with `source.file = "<project name> — ELV estimate"`. |
| `src/util/sha256.ts` | util | `sha256Hex` | Synchronous SHA-256 used by the screens. |
| `tests/fixtures/exchange/` | test data | `villa-gf-rooms.ifc.json`, `villa-luminaires.dialux.json`, `villa-elv-loads.json` | Sample packages used by `inbox.test.ts`. |

Stored in the project file: `Project.exchange` (`src/types.ts:518`) = `{ log: ExchangeRecord[]; packages: AcceptedPackage[] }`. Rooms themselves are stored in `project.building.rooms` with a `source` link (`RoomSource`, `src/types.ts:746`).

## 3. Inputs — where its data comes from

| Data | From module (ID) | File + function |
|---|---|---|
| Package file chosen by the user (any JSON) | 01-app-shell (file picker) | `src/components/elv/InboxView.tsx:open` |
| ELV loads package sent from the ELV page | 29-elv | `src/components/elv/ElvView.tsx:send` → `src/elv/package.ts:elvLoadsPackage` → `src/App.tsx:1656 onSend` |
| Package file from the projects folder (CLI / MCP) | 31-headless-cli-mcp | `src/headless/exchangeTools.ts:readFile` (`findFile`, `readFileWithin`) |
| Buildings, levels, rooms, room types | 04-building-load-assessment | `src/calc/building.ts:buildingInfoOf`, `roomTypesOf`, `nextRoomId` (used in `inbox.ts:roomPlans`, `applyRooms`) |
| Room-type guess from a name | 22-cad-electrical | `src/model/cadRooms.ts:guessRoomType` |
| Boards, circuits, all study results (for the design export) | 06-network-sld-editor, 08-voltage-drop, 09-earthing, 11-breaker-cable-selection | `src/calc/runs.ts:runCalculations`, `fingerprint`; `src/calc/summary.ts:boardSummary`; `src/calc/earthing.ts:breakerTypeOf`; `src/calc/cableTable.ts:cpcOf`; `src/calc/electrical.ts:runsOf` |
| Permanent uids of boards/circuits | 02-project-storage | `src/model/stableIds.ts:withUids` |
| ELV devices on plans | 29-elv | `project.elvDevices` in `designExport.ts:designExport` |
| Engineer's name default | 03-parameters-rules (user profile) | `src/App.tsx:1657 prefs.profile.name` |

## 4. Outputs — where its results go

| Result | Used by module (ID) | File + function |
|---|---|---|
| Rooms added / changed / renamed / removed in Building information | 04-building-load-assessment (load assessment, room loads) | `inbox.ts:applyRooms` writes `project.building.rooms` |
| Accepted ELV loads with link `app:file#id` | 29-elv (placement on boards as circuits) | `inbox.ts:acceptedElvLoads` → `src/calc/elvPlacement.ts:planElvPlacement`, `src/components/elv/ElvView.tsx:59` |
| Decision log `X-NNN` | 26-revisions-changes (listed as "Exchange packages (imports)" in revision diffs) | `src/model/revisions.ts:152`, `src/model/changeClass.ts:34` |
| New project state as one undo step | 02-project-storage | `src/App.tsx:1659 setProject(next, { step: true })`; headless: `src/headless/editTools.ts:edit` (backup + `undo_change`) |
| Rooms package JSON | external ELV program | `src/headless/exportTools.ts:export_rooms_package` → `inbox.ts:roomsExport` |
| Design package JSON (`lvds.design`) | external BIM add-ins / scripts | `src/headless/exportTools.ts:export_design_package` → `designExport.ts:designExport` |
| Inbox badge count | 01-app-shell | `src/components/Ribbon.tsx:545` |

## 5. User flow — from button click to result

1. User opens **Inbox** from the ribbon (`Ribbon.tsx:545`) or is sent there by **Send to LV** on the ELV page (`ElvView.tsx:send` → `App.tsx:onSend`, which replaces any waiting package of the same kind and source file).
2. **Open package file…** → `InboxView.open` reads the text, `JSON.parse`, then `inbox.ts:readPackage`:
   - zod check of every field (`exchangePackage.safeParse`), errors reported by row number (first 200);
3. On every render `InboxView` calls `reviewPackage`:
   - **rooms** (`roomChanges` / `roomPlans`): only from `cad` or `ifc`; each row's building and level found by ID then by name (else a "problem" row); matched to a project room first by source link (same app, same file, same `sourceId`), else by same name on the same level; area difference ≥ 0.05 m², type, count or move → *changed*; different name → *renamed*; rooms linked to the same file but not in the package → *removed*.
   - **luminaires / ELV loads** (`itemChanges`): room references resolved to project room IDs; compared with the last accepted package **from the same source file** (not with the project's circuits) → added / changed / removed.
   - `seenBefore`: the log is searched for the same hash.
5. `App.tsx:onDecided` writes the new project as one undo step and removes the package from the waiting list. **Undo** (Ctrl+Z) restores the project, but not the waiting package.
7. Headless equivalent: `exchange_check` → `exchange_review` → `exchange_apply` (preview, then `mode: "apply"` with `approvedBy`).

## 6. Linked to (working connections)

- **29-elv** — ELV loads package in (`elv/package.ts:elvLoadsPackage`), accepted loads out (`acceptedElvLoads` → `calc/elvPlacement.ts:planElvPlacement`).
- **02-project-storage** — decision applied as one undo step (`App.tsx:1659`); the `exchange` field is saved in the project file (`types.ts:518`).
- **26-revisions-changes** — `exchange` is a tracked field in revision comparisons (`model/revisions.ts:152`, `model/changeClass.ts:34`).
- **31-headless-cli-mcp** — `EXCHANGE_TOOLS`, `export_rooms_package`, `export_design_package`, `export_elv_loads_package`.
- **06 / 08 / 09 / 11** — design export reads the full calculation run (`runCalculations`) and checks the result against its own contract.
- **27-review-submissions-authority** — Received documents page links to the inbox (`App.tsx:1660 onInbox`).



---

*Public summary: describes what the module does and how it connects. The engineering review of open issues is kept separately.*
