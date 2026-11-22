# Native drawing file (.lvplan): Phase 2 plan (2026-11-22)

Status: **plan only, waiting for the user's OK.** Follows [Native drawing format - 2026-11-21](Native%20drawing%20format%20-%202026-11-21.md). There, the user approved the chunked package, the layout for AI tools, drawn work in the native file (D4) and `.lvplan` as the working name (D3). Phase 1 (b), the faster engine, is merged (PRs 752, 756, 757). The cache, Phase 1 (a), waits until it is needed.

## Goal

Move what the engineer draws out of the `.lvds` project file and into a `.lvplan` file beside it. Project saves stay small, and drawn work gets a documented, versioned format.

Nothing changes on screen: no new buttons, dialogs or wording. Save As DWG / DXF works as today.

## Main design rule: only storage changes

The project in memory stays exactly as it is. Every screen, calculation, undo step, the BOQ and the headless tools keep reading `project.cadSketch` and the other fields as today. Only the desktop save and load change:

- **Save:** split the drawing fields off, write them to `.lvplan`, then write `.lvds` with a link to it.
- **Load:** read `.lvds`, read the `.lvplan` it links to, and merge the two back into one project.

This keeps the risk in two functions that can be tested on their own, instead of in hundreds of places that read the project.

## What moves to .lvplan

| Moves (drawing data, can be large) | Stays in .lvds (small, and calculations read it) |
|---|---|
| `cadSketch`: drawn objects per drawing | `lvPoints`, `cadAccessories`: devices on circuits |
| `cadBlockDefs`: the drawing's own blocks | Cable routes, trays, `Feeder.lengthM` |
| `cadErased`: handles of erased architect objects | Boards, circuits, loads, schedules |
| `cadLayouts`, viewports | Revisions, BOQ, submissions |
| `cadLayerStyle`, `cadLayerFile`, `cadRefs`, `cadPlanUnits` | `cadBlocks`, `cadLayers`, `cadLength`, `cadRoomLayer`, `cadRoomTypes`: what blocks and layers mean electrically |
| `cadTextStyles`, `cadDimStyles`, `cadPointStyle`, `cadPatterns` | |

Devices and wiring stay in the project for now (decision P1). The calculations, revision compare, MCP tools and BOQ all read them, and they are small. Moving them can come later, once the format has proved itself.

## Package layout

`Name.lvplan` is a zip, written with `jszip`, which the app already uses. It is one file, so it can be emailed or synced like the project.

```
manifest.json            format "lvds.plan", version 1, project id, list of parts with sha256 and size
drawings/<key>.json      one file per drawing: sketch, erased, layouts, blocks, layers, styles
shared.json              settings that belong to no single drawing (units, patterns…)
revisions/<sha256>.json  drawn work as it was at each issued revision, stored once per content (step 4)
```

- The parts are plain JSON, described by `contracts/plan.schema.json`. AI tools and scripts can read them, and anything written to them can be checked against the schema.
- A drawing's key is the same file-name key the project uses today, so nothing is renamed.
- In the `.lvds` file, the drawing fields are replaced by `plan: { file: "Name.lvplan", sha256, version: 1 }`.

## Safe saves

1. Write `.lvplan` to a temporary file, flush it, and rename it into place. The old copy is kept as `Name.lvplan.bak`, the same way `writeFileSafe` keeps `.lvds.bak` (`electron/projectFiles.cjs`).
2. Only then write `.lvds`, with the sha256 of the new `.lvplan`.
3. On load, the sha256 must match. If it doesn't, for example because a sync tool delivered one file but not the other, the app tries `.lvplan.bak`. If neither copy matches, the project opens with its drawings marked missing, and nothing is saved over them until the engineer chooses. Wording for that case is in decision P4.
4. If only one drawing changed, unchanged parts are copied as they are, so a save does not re-encode all the drawn work. Writing only the changed parts in place needs a folder or a database, not a zip (decision P2).

## Old projects and older app versions

- **Old projects** still open as today, with drawings inside `.lvds`. They move to `.lvplan` on their next save, with no question asked (decision P3).
- **Older app versions** know nothing about `.lvplan`. If an older version opened a moved project, it would show no drawn work, and its next save could drop the link. To stop that, the project's `schemaVersion` is raised (`CURRENT_SCHEMA`, `src/model/projectMigrate.ts`). Older versions then open the file read-only with their existing "saved by a newer version" message, so they cannot save over it. Step 2 tests this.
- **The web version** keeps its single stored copy of the project, unchanged. It has no files beside the project.

## Revisions

Today every issued revision stores a full copy of the project, drawn work included (`snapshotOf`, `src/model/revisions.ts`). Ten revisions of a large plan means ten copies inside `.lvds`.

In step 4, a revision keeps only the sha256 of each drawing's content. The content is stored once under `revisions/` in `.lvplan`, and revisions with the same drawing share it. Revision compare keeps working because it merges the content back first.

## Steps

Each step is its own PR. Every step except the docs step gets a version bump.

| Step | What | Files | Proof |
|---|---|---|---|
| 0 | **Measure.** Build a test project with 1, 3 and 10 MB of drawn work. Time saves and loads, and measure the file sizes, today and after the split. | `tests/performance/projectSave.perf.ts` | Numbers in this note |
| 1 | **Split and merge.** Pure functions `splitPlan(project)` → `{ project, plan }` and `mergePlan(project, plan)`, the schema and the format note. No change in the app. | `src/model/planPackage.ts`, `contracts/plan.schema.json`, `docs/formats/lvplan.md` | Round trip equals the original for every field; schema test |
| 2 | **Desktop save and load.** Write and read `.lvplan` with the safe-save order; raise `CURRENT_SCHEMA`; trash, restore and conflict copies also handle the `.lvplan`. | `electron/projectFiles.cjs`, `electron/main.cjs` | Tests: kill between the two writes, hash mismatch, `.bak` fallback, old project moved on save |
| 3 | **Headless CLI and MCP.** `lvds` reads and writes through the same functions. `cad_plan` and the other tools work unchanged. | `src/headless/project.ts` | Headless tests on a moved project |
| 4 | **Revisions stored once.** Snapshots keep sha256 references, and the content lives in `revisions/`. | `src/model/revisions.ts`, `planPackage.ts` | Compare and restore tests; size before and after |
| 5 | **Cache slot (only if needed).** Phase 1 (a): a decoded architect drawing, stored in the app cache, not in `.lvplan`. | — | Only if large drawings still feel slow |

Steps 1 → 2 → 3 must go in that order. Step 4 can follow at any time after step 2.

## Decisions for the user

- **P1.** Leave devices, wiring and routes in the project for now, and move only the drawing data? (Recommended: yes. They are small, and many tools read them.)
- **P2.** Zip, so one file sits beside the project (recommended), or a folder package, where only changed parts are written but which is awkward to email or sync?
- **P3.** Move old projects to `.lvplan` on their next save with no question (recommended), or ask once per project?
- **P4.** If `.lvplan` is missing or does not match, say "The drawn work for this project (Name.lvplan) is missing or out of date. Drawings open without it, and nothing is saved over it." Is that wording right? This is the only new text, and it shows only in this error case.
- **P5.** Keep `.lvplan` as the final extension? (Recommended: yes. It is short and says what the file is.)

## Risks

- **Two files instead of one.** Copying only the `.lvds` loses the drawn work. The error in P4 says what is missing. Moving to trash, restoring, and conflict copies always handle both files together.
- **Cloud sync delivering one file before the other.** The sha256 check catches it, and nothing is saved over the drawings until they match again.
- **No measured gain yet.** Step 0 measures first. If drawn work turns out to be a small share of real projects, the plan stops after step 1, and the format note is still useful for AI tools.
