# Native drawing file (.lvplan): Phase 2 plan (2026-11-22)

Status: **approved 2026-11-22** ("Next" after the plan: P1–P5 as recommended). Step 0 measured the same day (results below). Step 1 built 2026-11-23 (`src/model/planPackage.ts`, layout in `contracts/README.md`). **Step 0 was corrected on 2026-11-23** (see Correction below). Step 2 waits for the user's decision on the corrected numbers (P6). Follows [Native drawing format - 2026-11-21](Native%20drawing%20format%20-%202026-11-21.md). There, the user approved the chunked package, the layout for AI tools, drawn work in the native file (D4) and `.lvplan` as the working name (D3). Phase 1 (b), the faster engine, is merged (PRs 752, 756, 757). The cache, Phase 1 (a), waits until it is needed.

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

In the app, every issued revision holds a full copy of the project, drawn work included (`snapshotOf`, `src/model/revisions.ts`). In the file, revisions are already packed: each distinct piece is stored once (`packRevisions`, `src/model/revisionStore.ts`, project file format version 4). This plan first missed that.

In the `.lvplan`, parts are named by their SHA-256 (step 1), so a revision whose drawing did not change shares the part. Revision compare keeps working because the drawn work is merged back first. Step 4 is therefore part of step 1.

## Step 0 results (2026-11-22)

Measured with `tests/performance/projectSave.perf.ts` (`npm run bench -- projectSave`; `BENCH_PLAN_MB`, `BENCH_REVS`). Machine: Apple M2, Node 24. The project is the 200-board test network with drawn work over 4 drawings (lines, polylines, texts, dimensions, inserts). Sizes are the drawn work as compact JSON. Save is `projectText`, as the desktop writes it, and load is `JSON.parse`. Disk, sync and IPC time come on top.

With 3 issued revisions:

| Drawn work | `.lvds` today | Save / load | `.lvds`, drawing fields moved | `.lvds` after step 4 | `.lvplan` (deflate) |
|---|---:|---:|---:|---:|---:|
| 1 MB | 17.0 MB | 37 / 27 ms | 14.2 MB | 3.4 MB | 0.15 MB |
| 3 MB | 44.1 MB | 94 / 67 ms | 35.8 MB | 3.4 MB | 0.43 MB |
| 10 MB | 139.1 MB | 288 / 251 ms | 111.6 MB | 3.4 MB | 1.45 MB |

With no revisions, the `.lvds` goes from 3.5, 9.0 and 28.3 MB to 0.71 MB, and save from 7, 20 and 61 ms to 1 ms.

Writing the `.lvplan` takes 18, 53 and 196 ms with deflate (9, 25 and 78 ms stored without compression). Reading it back takes 9, 24 and 86 ms. The sha256 check takes 1 ms or less.

What this means:

1. **Drawn work is most of the file.** The project's pretty-printed JSON makes each MB of drawn work about 3.6 MB in the `.lvds`, because every point is on its own lines.
2. **Revisions are the biggest part.** Each revision copies all drawn work. Moving the drawing fields alone shrinks the file by only about 20 %. Doing it together with step 4 shrinks it from 139 MB to under 5 MB.
3. **The gain is mainly size, not save time.** Turning the project into text takes at most 0.3 s today. A file 30 times smaller helps most with disk writes, `.bak` copies, cloud sync and sending the project.
4. **Deflate makes drawn work about 6.7 times smaller** for about twice the write time. It is worth it.

~~Change to the order: step 4 goes in with step 2.~~ Withdrawn: see the correction below.

## Correction (2026-11-23)

The step 0 test turned the project into text without packing its revisions. The desktop app packs them before every save (`packRevisions` in `saveProjectFile`, `src/model/projectStore.ts`), so points 2 and 3 above are wrong for real files: revisions do **not** copy the drawn work in the file. Measured again on the real save path (`npm run bench -- projectSave -t "really saves"`, 3 revisions, unpacking on load not timed):

| Drawn work | `.lvds` today | Save / load today | `.lvds` + `.lvplan` | Save / load |
|---|---:|---:|---:|---:|
| 1 MB | 3.6 MB | 8 / 6 ms | 0.85 + 0.15 MB | 20 / 10 ms |
| 3 MB | 9.1 MB | 20 / 16 ms | 0.85 + 0.44 MB | 54 / 25 ms |
| 10 MB | 28.4 MB | 72 / 51 ms | 0.85 + 1.45 MB | 182 / 78 ms |

With the `.lvplan`, save is a later save with nothing drawn changed since: a part is turned into text only when it is edited.

What this means now:

1. **Files are about 12 times smaller, not 30.** 28.4 MB becomes 2.3 MB. Point 1 above still holds: drawn work is most of the file, made 3.6 times larger by the pretty-printed JSON.
2. **A save that writes the `.lvplan` costs more work**: 0.18 s against 0.07 s at 10 MB, mostly the compression. Step 2 can skip the `.lvplan` when nothing drawn changed, which is most saves. Those saves would then write 0.85 MB instead of 28.4 MB, and be faster than today.
3. **The real gain is the size**: cloud sync, the `.bak` copies, sending the project, and a drawing file that AI tools can read. Save time stays small either way.
4. **A smaller alternative exists**: keep one file and write the drawn work without indentation. That needs no second file, but gives a file only about 3 times smaller (decision P6).


## Steps

Each step is its own PR. Every step that changes the app gets a version bump (step 1 does not: nothing uses it yet).

| Step | What | Files | Proof |
|---|---|---|---|
| 0 | **Measure.** Build a test project with 1, 3 and 10 MB of drawn work. Time saves and loads, and measure the file sizes, today and after the split. | `tests/performance/projectSave.perf.ts` | Numbers in this note |
| 1 | **Split and merge.** Pure functions `splitPlan(project)` → `{ project, plan }` and `mergePlan(project, plan)`, the schema and the format note. No change in the app. | `src/model/planPackage.ts`, `contracts/plan.schema.json`, `contracts/README.md` | Round trip equals the original for every field; schema test |
| 2 | **Desktop save and load.** Write and read `.lvplan` with the safe-save order; raise `CURRENT_SCHEMA`; trash, restore and conflict copies also handle the `.lvplan`. | `electron/projectFiles.cjs`, `electron/main.cjs` | Tests: kill between the two writes, hash mismatch, `.bak` fallback, old project moved on save |
| 3 | **Headless CLI and MCP.** `lvds` reads and writes through the same functions. `cad_plan` and the other tools work unchanged. | `src/headless/project.ts` | Headless tests on a moved project |
| 4 | **Revisions stored once.** Snapshots keep sha256 references, and the content lives in `revisions/`. | `src/model/revisions.ts`, `planPackage.ts` | Compare and restore tests; size before and after |
| 5 | **Cache slot (only if needed).** Phase 1 (a): a decoded architect drawing, stored in the app cache, not in `.lvplan`. | — | Only if large drawings still feel slow |

Steps 1 → 2 (with 4) → 3 go in that order. Step 0 showed that revisions hold most of the drawn work.

## Step 1 results (2026-11-23)

- **Parts are named by their SHA-256**, not by drawing name: `drawings/<sha256>.json` and `shared/<sha256>.json`. `manifest.json` names each part's drawing file. That gives the shared revision storage of step 4 for free, and the same drawn work always gives the same bytes.
- **The layout is described in `contracts/README.md`**, with `contracts/plan.schema.json` and `contracts/plan-drawing.schema.json` generated from the code, like the other contracts. It is not in a separate `docs/formats` note.
- **Timing** (`npm run bench -- projectSave`, same projects as step 0, 3 revisions):

| Drawn work | `splitPlan` | `.lvds` left | `.lvplan` / `planZip` | `readPlanZip` / `mergePlan` |
|---|---:|---:|---:|---:|
| 1 MB | 14 ms | 3.4 MB | 0.15 MB / 14 ms | 5 / 23 ms |
| 3 MB | 42 ms | 3.4 MB | 0.44 MB / 42 ms | 12 / 57 ms |
| 10 MB | 148 ms | 3.4 MB | 1.45 MB / 164 ms | 37 / 199 ms |

  The app's own SHA-256 made `splitPlan` take 1.0 s at 10 MB. It now hashes each different part once, with the system's SHA-256 (the app's is kept as a fallback). Each value's text is also kept between saves, and parts shared by revisions are read once, which gives the corrected table above. The `.lvds` sizes in this table are without packed revisions; see the correction.

## Decisions for the user

- **P6 (2026-11-23, after the correction).** Go on with step 2, the two files, about 12 times smaller, with the `.lvplan` written only when drawn work changed (recommended)? Or keep one file and only write the drawn work compactly, about 3 times smaller, with no second file?

- **P1.** Leave devices, wiring and routes in the project for now, and move only the drawing data? (Recommended: yes. They are small, and many tools read them.)
- **P2.** Zip, so one file sits beside the project (recommended), or a folder package, where only changed parts are written but which is awkward to email or sync?
- **P3.** Move old projects to `.lvplan` on their next save with no question (recommended), or ask once per project?
- **P4.** If `.lvplan` is missing or does not match, say "The drawn work for this project (Name.lvplan) is missing or out of date. Drawings open without it, and nothing is saved over it." Is that wording right? This is the only new text, and it shows only in this error case.
- **P5.** Keep `.lvplan` as the final extension? (Recommended: yes. It is short and says what the file is.)

## Risks

- **Two files instead of one.** Copying only the `.lvds` loses the drawn work. The error in P4 says what is missing. Moving to trash, restoring, and conflict copies always handle both files together.
- **Cloud sync delivering one file before the other.** The sha256 check catches it, and nothing is saved over the drawings until they match again.
- **No measured gain yet.** Step 0 measures first. If drawn work turns out to be a small share of real projects, the plan stops after step 1, and the format note is still useful for AI tools.
