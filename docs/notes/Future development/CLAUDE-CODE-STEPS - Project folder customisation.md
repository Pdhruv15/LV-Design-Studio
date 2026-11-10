# Project folder customisation — spec and Claude Code steps

**For:** LV Design Suite (github.com/Pdhruv15/LV-Design-Suit), base main @ 9a90e23 (v2.57.0)
**Mockups:** `LV-Design-Suite-Folder-Customisation-Mockups.html` (screens C1–C8), in the same folder as this file
**Builds on:** the project folder steps in `LV-Design-Suite-Project-Folders.html` (Step 1 `feat/project-folders-create` and Step 2 `feat/project-folders-output-roles`). Merge those first.

## How to use this file

1. Put this file, the mockups HTML and `folder-templates.json` in `docs/notes/Future development/`.
2. Open Claude Code in the repo, press **Shift+Tab twice** (plan mode), and say:
   `Read "docs/notes/Future development/CLAUDE-CODE-STEPS - Project folder customisation.md" and do Step 0.`
3. Review the PR, merge it (that is your UI approval), then do Step 1, Step 2 and so on, **one step per fresh session**, merging each before the next.
4. Claude Code must not launch the app (AGENTS.md). After each PR, run `npm run dev` yourself and go through that step's "You check" list.

---

# Part A — UI/UX spec (approved by merging Step 0)

## Principles

- **Folders carry roles.** The app saves every output by role (`calcVd`, `drawingsIssued`, `boq`…), never by folder name. Users can rename, move, add or delete folders in a template freely.
- **One role → one folder; one folder → many roles.** A role that has no folder falls back to "ask where to save" (today's behaviour).
- **Never destructive on disk.** The app only creates folders. It never deletes, moves or renames user folders or files, not even when a template changes or a project override renames a folder.
- **Templates are portable JSON**, stored with the app settings and shareable between PCs and colleagues.
- **Per-project overrides** live in the project file and never change the office template unless the user asks.

## C1 — Template library (Preferences → Folder templates)

- Left list: **Built-in** (locked, 🔒): Electrical consultant full · Villa / small building · Contractor shop drawings · ISO 19650 · Multi-building. **My templates**: user templates; one is ★ the default for new projects.
- Each row shows the folder count; the user's templates also show how many projects use them.
- Actions: + New (opens C7), Duplicate, **Learn from folder…** (C5), Import JSON, Export JSON, ★ Set default, Delete (user templates only; refused while projects use it unless the user confirms that those projects keep their own copy).
- Right panel: name, "based on", last edited, folder count, roles assigned (e.g. "47 of 50"), file naming pattern, numbering style, a collapsed tree preview, and an **Edit** button.

## C2 — Tree editor

- Toolbar: + Folder, + Subfolder, Rename (F2 / double-click), Delete, ↑ ↓, Indent / Outdent, **Renumber ▾** (`01_` two-digit · `1.` · `A-` letters · none; renumbers the siblings at the selected level), Expand all.
- Drag-and-drop to reorder and nest; drop indicator line; Esc cancels a drag.
- Inspector for the selected folder: Name, Full path (with the sample project), **Role** (dropdown of the role catalogue, showing roles already used elsewhere as "move here"), **Only when** (Always · scope:pv · scope:standby · scope:fire · scope:elv · stage:tender · service:supervision · building:each), **Subfolders on use** (none · `{Stage}/Rev-{Rev}` · `Rev-{BoqRev}` · `TR-{TrNo}` · `{YYYYMMDD}_Rev{Rev}`), Note.
- Live checks: illegal characters `< > : " / \ | ? * & # %`, reserved names (CON, PRN, AUX, NUL, COM1–9, LPT1–9), trailing dot or space, duplicate sibling names (case-insensitive), path > 200 characters for a sample project, depth > 6, more than 300 folders, unassigned roles.
- Bottom tabs: Tree · Roles (C3) · File naming (C4) · Preview. Discard / Save template. An "Unsaved changes ●" marker appears in the title.

## C3 — Roles tab

- A table with one row per **role in the catalogue**: output name (human), role id, "Saves to folder" (folder picker: a dropdown of the template's folders, or "— ask each time —"), "Creates on save" (the subfolder pattern), and a status ✓ / ⚠.
- Filter: All · Unassigned. Button **Auto-assign by name** (the same matcher as C5) fills only the empty rows and highlights what it changed.
- Footer: "N roles · M assigned".

## C4 — File naming builder

- Preset: Office code `{ProjectNo}-{Discipline}-{Type}-{Seq}-{Rev}` · ISO 19650 `{Project}-{Originator}-{Volume}-{Level}-{Type}-{Role}-{Number}` · Simple `{ProjectShort}_{Type}_{Rev}` · Custom.
- Pattern field made of token chips plus literal text; drag to reorder, click × to remove; the extension is added automatically.
- Tokens: ProjectNo, ProjectShort, Client, Plot, Discipline (default `E`), Type, Seq (pad 2/3/4), Rev, Stage, Date (YYYYMMDD), Board, Level, Sheet, Study, Originator, BuildingCode, plus free text.
- Per-type override table (DWG, CAL, SCH, BOQ, SPC, TR, CRS, RFI, MOM): "default" or its own pattern.
- Separator (`-` `_` `.`) and Case (as typed · UPPER) options.
- Live preview with the current project's values (or sample values in Preferences), with checks for unique names and Windows-safe names.

## C5 — Learn from an existing folder (wizard)

1. **Choose folder**: a folder picker; the app reads **folder names only**, to depth 6 and at most 500 folders. It never opens, lists or reads files (it only counts them for a "files ignored" note).
2. **Review roles**: the scanned tree on the left. On the right, a table of suggested roles with a match bar and accept ✓ / reject; a dropdown for unmatched folders. Detects and offers to replace the project number and name in the root with `{ProjectNo}_{ProjectShort}`. Folders that look like revisions or dates (`Rev A 12-03`, `2024-05-01`) are suggested as **left out**. The numbering style (`01_`, `A-`, `1.`) is detected and kept.
3. **Name & save**: template name, set as default (optional), Save → opens it in C2.

The matcher is a pure function using a synonyms table, for example: VD / volt drop → calcVd; SC / short circuit / fault → calcFault; Arch / architect / received → receivedArch; Issued / IFC → drawingsIssued; DEWA → authDewa; BOQ / bill → boq; TR / transmittal → transmittals; MOM / minutes → minutes. It gives a 0–1 score; suggest when ≥ 0.6, and give each role at most once (highest score wins).

## C6 — Customise for this project (Overview → Project folder → Customise)

- The project's tree, with a status per folder: ✓ present, ＋ to create, renamed here, hidden for this project.
- Actions: add folder or subfolder, rename, hide (that template folder isn't created for this project), and per-project role reassignment.
- The overrides are stored in the project: `project.folder.overrides = { add[], rename[], hide[], roles{} }`.
- Rename creates the new folder name. The old folder, if it exists, is **left and listed**, never moved.
- Side panel: present / to create counts, **Save these changes back to the template…** (opens C2 with the changes applied, as a new template or into the current one), and **Reset to template**.
- Footer button: "Create N folders".

## C7 — New template: layout presets and multi-building

- Six cards: Discipline-first · Stage-first · Building/phase-first · ISO 19650 containers · Flat & simple · Blank.
- Building/phase-first: a **Repeat for** section with Source (Buildings in Building information · Phases typed by the user), a folder name pattern (`{BuildingCode}_{BuildingName}`), and the shared folders that stay once at the top (e.g. `00_Common` with Admin, DEWA, Transmittals).
- In the template, a node with `when: "building:each"` is repeated for each building; outputs that belong to a building (its DB schedules, its BOQ when it's split by building) save into that building's role folder.
- When a building is added to the project later, its folders are offered on the C6 card ("＋ B3_… auto when a building is added").

## C8 — Change template on an existing project

- Dialog: from → to template, then a diff tree: ＋ to create · = kept (with "role remapped" when the role's folder changes) · ○ not in the new template (left untouched, with a file count).
- Summary counts. An optional "Show where old files would go" **list only** (no moving).
- Apply: creates the new folders, updates `project.folder.templateId` and the version, and keeps the overrides that still apply (and lists the ones that no longer do).

---

# Part B — Data model

```ts
// src/model/folderTemplates.ts (extends the model from feat/project-folders-create)
export type FolderWhen =
  | 'always' | 'scope:pv' | 'scope:standby' | 'scope:fire' | 'scope:elv'
  | 'stage:tender' | 'service:supervision' | 'building:each';

export interface FolderNode {
  id: string;              // stable inside the template (for editor + overrides)
  name: string;
  role?: string;           // from ROLE_CATALOGUE; may be omitted
  roles?: string[];        // a folder may hold several roles
  when?: FolderWhen;
  onUse?: string;          // subfolder pattern, e.g. "{Stage}/Rev-{Rev}"
  note?: string;
  children?: FolderNode[];
}

export interface NamingRule {
  preset: 'office' | 'iso19650' | 'simple' | 'custom';
  pattern: string;                         // "{ProjectNo}-{Discipline}-{Type}-{Seq:3}-{Rev}"
  perType?: Partial<Record<DocType, string>>;
  separator: '-' | '_' | '.';
  upper?: boolean;
  discipline?: string;                     // default "E"
}

export interface FolderTemplate {
  id: string; name: string; version: number;
  builtIn?: boolean; basedOn?: string; editedAt?: string;
  layout?: 'discipline' | 'stage' | 'building' | 'iso19650' | 'flat' | 'blank';
  root: string;                            // "{ProjectNo}_{ProjectShort}"
  numbering?: '01_' | '1.' | 'A-' | 'none';
  repeat?: { source: 'buildings' | 'phases'; name: string; shared: string[] }; // building-first
  naming: NamingRule;
  folders: FolderNode[];
}

export interface ProjectFolderOverrides {
  add: { parentId: string | null; node: FolderNode }[];
  rename: { id: string; name: string }[];
  hide: string[];                           // node ids
  roles: Record<string, string>;            // role -> node id
}
// Project.folder gains: overrides?: ProjectFolderOverrides
```

**Role catalogue (50 roles):** `src/model/folderRoles.ts` exports `ROLE_CATALOGUE: {id, label, group, docType?}[]` with these ids:
programme, minutes, timesheets, receivedArch, datasheets, projectFile, backups, cadWorking, calcLoad, calcVd, calcFault, calcCable, calcEarthing, calcLighting, calcPv, calcStandby, studyReports, drawingsWip, drawingsIssued, drawingsSuperseded, xrefs, titleBlocks, loadSchedules, cableSchedule, equipmentSchedule, luminaireSchedule, specs, boq, costEstimates, quotes, authDewa, authDm, authCd, transmittals, submissionResponses, internalReview, crs, shopDrawings, materialSubmittals, tenderIssued, bids, tenderEvaluation, rfis, siteInspections, snags, variations, valuations, testRecords, asBuilt, archive.

**Storage:** user templates in the Electron settings folder as `folder-templates.json` (atomic write via `electron/safeFs.cjs`, size limit in `electron/limits.cjs`). Built-ins are in code. The project keeps a **copy** of its template (`project.folder.template`), so it opens the same on another PC.

---

# Part C — Claude Code steps

> Every step's prompt ends with the **Rules block** at the bottom of this file. Paste the step plus the rules, or just tell Claude Code "do Step N of this file"; it should read the rules itself.

## Step 0 — Commit the approved UI proposal (docs only)
Branch: `docs/project-folders-customisation-proposal`

```text
Documentation only, no code changes.
Create "docs/notes/Future development/UI UX proposals - 2026-11-09 - Project folders customisation.md"
by copying Part A (C1–C8) and Part B of "docs/notes/Future development/CLAUDE-CODE-STEPS - Project folder
customisation.md" into it, with a link to "LV-Design-Suite-Folder-Customisation-Mockups.html" in the same folder.
Add the built-in templates ISO 19650 and Multi-building to the appendix as JSON in the same format as
folder-templates.json (ISO 19650: 00_WIP, 01_SHARED, 02_PUBLISHED, 03_ARCHIVE each with discipline subfolders;
Multi-building: 00_Common {Admin, DEWA, Transmittals} + a building:each node {Calcs, Drawings, Schedules, BOQ}).
Also commit the mockups HTML and folder-templates.json if they are not in the repo yet.
Branch: git fetch origin main && git checkout -b docs/project-folders-customisation-proposal origin/main
Commit, push, open a PR "docs: project folder customisation UI/UX proposal (C1–C8)". Do not merge.
```
**You check:** read the note on GitHub, then merge it. That merge is your approval.

## Step 1 — Model: roles, overrides, validation, storage
Branch: `feat/folders-custom-model`

```text
Feature: the data model for customisable folder templates (spec Part B; no UI in this step).
1. src/model/folderRoles.ts: ROLE_CATALOGUE (50 roles, label, group, docType). A test that every role used by
   src/model/outputRoles.ts exists in the catalogue and vice versa.
2. Extend src/model/folderTemplates.ts to Part B: node ids, roles[], when (incl. building:each), onUse,
   numbering, naming, repeat. Migrate the three existing built-ins and add ISO 19650 and Multi-building from the
   Step 0 appendix.
3. Pure functions + tests: validateTemplate (all C2 checks, returning {level, nodeId, message}[]);
   renumber(siblings, style); resolveRole(template, overrides, role) → path | undefined;
   applyOverrides(template, overrides) → effective tree; expandTemplate(template, vars, flags, buildings) with
   building:each repetition; diffTemplates(projectTree, newTemplate) → {create, keep, remap, untouched} for C8.
4. Storage: Electron IPC "folderTemplates:list|save|delete|import|export" with validation in ipcValidate.cjs,
   atomic writes, size limits; the project keeps a copy of its template (projectMigrate, schema bump).
5. Tests: validation cases, renumber styles, overrides (add/rename/hide/roles), building repetition, diff,
   IPC rejections (oversize, bad JSON, path tricks).
```
**You check:** nothing visible yet. The PR checks are green, and an existing project opens unchanged.

## Step 2 — Template library + tree editor (C1, C2)
Branch: `feat/folders-custom-editor`

```text
Feature: Preferences → Folder templates library (C1) and the tree editor (C2). Needs Step 1 merged.
1. Library panel exactly as C1: built-in (locked, Duplicate only) and my templates, search, ★ default, used-by
   count (from the project list summary), Import/Export JSON, Delete rules from the spec.
2. Tree editor as C2: toolbar actions, keyboard (F2 rename, Del delete, Alt+↑/↓ move, Tab/Shift+Tab indent),
   drag-and-drop with a drop line (pointer events; no new drag library unless one is already a dependency),
   the inspector fields, live checks from validateTemplate, Renumber menu, Unsaved changes marker, Discard/Save.
3. Bottom tabs Tree · Roles · File naming · Preview: Roles and File naming show "coming in the next update"
   placeholders in this step only if Step 3 isn't merged yet.
4. Reuse existing dialog, list and input components and the app's CSS; follow the mockup's layout.
5. Tests: editor reducer (add/rename/move/indent/delete/undo within the editor), keyboard mapping,
   save → validate → IPC call.
```
**You check:** duplicate the consultant template; rename, drag, indent and renumber folders; get a red error for a name with `&`; save; reopen Preferences and see the changes kept.

## Step 3 — Roles tab + file naming builder (C3, C4)
Branch: `feat/folders-custom-roles-naming`

```text
Feature: the Roles tab (C3) and the File naming builder (C4) in the template editor. Needs Step 2 merged.
1. Roles tab: a table from ROLE_CATALOGUE; the folder dropdown lists the template's folders; "ask each time"
   option; the onUse pattern per role; All/Unassigned filter; Auto-assign by name (uses the matcher from
   Step 4 if merged, otherwise a simple synonyms table in src/model/folderMatch.ts, which Step 4 will reuse).
2. Naming builder: presets, token chips with drag/reorder/remove, literal text, Seq padding, per-type
   overrides, separator/case, live preview with the current project or sample values, uniqueness and
   Windows-safety checks.
3. src/model/fileNaming.ts (pure): formatName(rule, docType, values) used by every export (replace the fixed
   pattern from feat/project-folders-output-roles). Tests for every token, padding, the ISO 19650 preset,
   and illegal characters stripped from values (e.g. client names with "/").
4. Exports: a role set to "ask each time" opens the save dialog in the project root.
```
**You check:** point all calculation roles at one `04_Calcs` folder; export a VD report and see it go there with the new name pattern; set a role to "ask each time" and see the dialog ask.

## Step 4 — Learn from an existing folder (C5)
Branch: `feat/folders-learn-from-folder`

```text
Feature: the "Learn from folder…" wizard (C5). Needs Step 3 merged.
1. Electron IPC "folders:scanNames" {root}: returns the folder tree only (names, depth ≤ 6, ≤ 500 folders,
   a file count per folder). It must never read file contents or follow links; it skips hidden and system
   folders. Validate in ipcValidate.cjs; tests for links, depth and count limits.
2. src/model/folderMatch.ts (pure): synonyms table + scoring (0–1), one role per best match, detection of the
   project number/name in the root, numbering style detection, revision/date folder detection (suggest
   leave out). Unit tests with realistic office trees (e.g. "C-Calc/VD", "Received/Arch/2024-05-01").
3. The three-step wizard UI exactly as C5; Accept all; manual dropdown for unmatched; Save opens C2.
4. The browser build: "Learn from folder" uses the File System Access API where available (directory names
   only); otherwise the action is hidden.
```
**You check:** point it at one of your old job folders; the suggested roles look right; the revision folders are suggested as left out; nothing in that folder changed (check its modified date).

## Step 5 — Per-project customise + change template (C6, C8)
Branch: `feat/folders-project-overrides`

```text
Feature: Overview → Project folder → Customise (C6) and Change template (C8). Needs Steps 1–3 merged.
1. C6 panel: the effective tree with the status per folder (present / to create / renamed here / hidden),
   add, rename, hide, per-project roles; stored in project.folder.overrides (one undo step per change);
   "Create N folders" through folders:create; "Save these changes back to the template…"; "Reset to template".
2. Rename: create the new name; if the old folder exists, list it as "left as is". No move, ever.
3. C8 dialog from diffTemplates: the create/keep/remap/untouched tree, counts, "Show where old files would go"
   as a read-only list, Apply (creates folders, switches templateId/version, re-checks overrides and lists the
   ones dropped).
4. Exports use resolveRole with the overrides.
5. Tests: the overrides round trip in the project file, resolveRole precedence (project > template > ask),
   C8 apply, the no-move guarantee (the IPC is never called with rename/move/delete).
```
**You check:** add a `Phase-2-Annex` folder to one project only, check the office template didn't change; switch an old project to your office template and see only new folders created.

## Step 6 — Layout presets + multi-building (C7)
Branch: `feat/folders-layouts-multibuilding`

```text
Feature: the New template start screen (C7) and building/phase repetition. Needs Steps 1–2 and 5 merged.
1. Six layout cards as C7. Each creates a starting template (discipline-first = the consultant built-in;
   stage-first = Concept/Schematic/Detailed/IFC with Calcs/Drawings inside; building-first = 00_Common +
   building:each; ISO 19650 built-in; flat = the villa built-in; blank = the root only).
2. Repeat for: Buildings in Building information (existing building model) or typed phases; the name pattern
   {BuildingCode}_{BuildingName}; the shared folders list.
3. Outputs that belong to a building (its DB schedules; its BOQ when split by building) resolve to that
   building's role folder. Everything else goes to the shared/common role folder.
4. When a building is added to a project that uses a building-first template, the C6 card offers its folders.
5. Tests: expansion for 3 buildings, a building rename (new folder created, old one listed), role resolution
   per building.
```
**You check:** make a building-first template, create a project with two buildings, see `B1_…` and `B2_…` created; add a third building and get the offer to create its folders.

---

## Rules block (append to every step's prompt)

```text
--- Rules (from AGENTS.md) ---
• Read AGENTS.md and follow it. One topic only on this branch.
• Start: git fetch origin main && git checkout -b <branch from the step> origin/main
• UI is approved in "docs/notes/Future development/UI UX proposals - 2026-11-09 - Project folders customisation.md"
  (sections named in the step). Build exactly that; match the mockups file; reuse existing components, CSS
  and wording style. Don't restyle anything else.
• Do not launch the app, take screenshots or use a browser. Verify only with:
  npm run typecheck && npm run lint && npm test
• Disk access only in the Electron main process via IPC validated in electron/ipcValidate.cjs, using
  electron/safeFs.cjs patterns: stay inside the chosen root, never follow links, and NEVER delete, move or
  rename user folders or files. Creating folders is the only write allowed (plus the templates settings file).
• Keep pure logic in src/model with unit tests beside it; React in src/components.
• Add a src/model/whatsNew.ts entry for user-visible changes.
• If the spec is unclear or needs a decision, write the question in docs/notes/Future development/ and stop.
• Commit, push, open a PR to main. Never merge. Report: what changed, the files, the test results.
```
