# UI UX proposals - 2026-11-09 - Project folders customisation

**Status:** proposal. Merging this note's PR approves the UI/UX in Part A (screens C1–C8).
**Mockups:** [LV-Design-Suite-Folder-Customisation-Mockups.html](LV-Design-Suite-Folder-Customisation-Mockups.html), in this folder. It shows screens C1–C8 in the Graphite theme, reading its data from [folder-templates.json](folder-templates.json).
**Build steps:** [CLAUDE-CODE-STEPS - Project folder customisation.md](CLAUDE-CODE-STEPS%20-%20Project%20folder%20customisation.md) (Steps 1–6).

## Open before Step 1

- The steps file says this work builds on `feat/project-folders-create` and `feat/project-folders-output-roles` (from `LV-Design-Suite-Project-Folders.html`). Neither branch exists, and main has no `src/model/folderTemplates.ts` or `src/model/outputRoles.ts`. The steps file also names main @ 9a90e23 (v2.57.0), but main is now at v2.067. Step 1 must either create the base model itself or wait for those two steps.
- `folder-templates.json` was not supplied, so it was written here in the Part B format: `{ format, formatVersion, templates: FolderTemplate[] }`, with five built-ins. Consultant full has 62 folders and all 50 roles. Villa has 11 folders, contractor 12, ISO 19650 20 and Multi-building 9.
- C1 adds a fourth Preferences tab, **Folder templates**, next to My details, New project defaults, and Appearance & saving.

## Part A — UI/UX spec

### Principles

- **Folders carry roles.** The app saves every output by role (`calcVd`, `drawingsIssued`, `boq`…), never by folder name. Users can rename, move, add or delete folders in a template freely.
- **One role → one folder; one folder → many roles.** A role that has no folder falls back to "ask where to save" (today's behaviour).
- **Never destructive on disk.** The app only creates folders. It never deletes, moves or renames user folders or files, not even when a template changes or a project override renames a folder.
- **Templates are portable JSON**, stored with the app settings and shareable between PCs and colleagues.
- **Per-project overrides** live in the project file and never change the office template unless the user asks.

### C1 — Template library (Preferences → Folder templates)

- Left list: **Built-in** (locked, 🔒): Electrical consultant full · Villa / small building · Contractor shop drawings · ISO 19650 · Multi-building. **My templates**: user templates; one is ★ the default for new projects.
- Each row shows the folder count; the user's templates also show how many projects use them.
- Actions: + New (opens C7), Duplicate, **Learn from folder…** (C5), Import JSON, Export JSON, ★ Set default, Delete (user templates only; refused while projects use it unless the user confirms that those projects keep their own copy).
- Right panel: name, "based on", last edited, folder count, roles assigned (e.g. "47 of 50"), file naming pattern, numbering style, a collapsed tree preview, and an **Edit** button.

### C2 — Tree editor

- Toolbar: + Folder, + Subfolder, Rename (F2 / double-click), Delete, ↑ ↓, Indent / Outdent, **Renumber ▾** (`01_` two-digit · `1.` · `A-` letters · none; renumbers the siblings at the selected level), Expand all.
- Drag-and-drop to reorder and nest; drop indicator line; Esc cancels a drag.
- Inspector for the selected folder: Name, Full path (with the sample project), **Role** (dropdown of the role catalogue, showing roles already used elsewhere as "move here"), **Only when** (Always · scope:pv · scope:standby · scope:fire · scope:elv · stage:tender · service:supervision · building:each), **Subfolders on use** (none · `{Stage}/Rev-{Rev}` · `Rev-{BoqRev}` · `TR-{TrNo}` · `{YYYYMMDD}_Rev{Rev}`), Note.
- Live checks: illegal characters `< > : " / \ | ? * & # %`, reserved names (CON, PRN, AUX, NUL, COM1–9, LPT1–9), trailing dot or space, duplicate sibling names (case-insensitive), path > 200 characters for a sample project, depth > 6, more than 300 folders, unassigned roles.
- Bottom tabs: Tree · Roles (C3) · File naming (C4) · Preview. Discard / Save template. An "Unsaved changes ●" marker appears in the title.

### C3 — Roles tab

- A table with one row per **role in the catalogue**: output name (human), role id, "Saves to folder" (folder picker: a dropdown of the template's folders, or "— ask each time —"), "Creates on save" (the subfolder pattern), and a status ✓ / ⚠.
- Filter: All · Unassigned. Button **Auto-assign by name** (the same matcher as C5) fills only the empty rows and highlights what it changed.
- Footer: "N roles · M assigned".

### C4 — File naming builder

- Preset: Office code `{ProjectNo}-{Discipline}-{Type}-{Seq}-{Rev}` · ISO 19650 `{Project}-{Originator}-{Volume}-{Level}-{Type}-{Role}-{Number}` · Simple `{ProjectShort}_{Type}_{Rev}` · Custom.
- Pattern field made of token chips plus literal text; drag to reorder, click × to remove; the extension is added automatically.
- Tokens: ProjectNo, ProjectShort, Client, Plot, Discipline (default `E`), Type, Seq (pad 2/3/4), Rev, Stage, Date (YYYYMMDD), Board, Level, Sheet, Study, Originator, BuildingCode, plus free text.
- Per-type override table (DWG, CAL, SCH, BOQ, SPC, TR, CRS, RFI, MOM): "default" or its own pattern.
- Separator (`-` `_` `.`) and Case (as typed · UPPER) options.
- Live preview with the current project's values (or sample values in Preferences), with checks for unique names and Windows-safe names.

### C5 — Learn from an existing folder (wizard)

1. **Choose folder**: a folder picker; the app reads **folder names only**, to depth 6 and at most 500 folders. It never opens, lists or reads files (it only counts them for a "files ignored" note).
2. **Review roles**: the scanned tree on the left. On the right, a table of suggested roles with a match bar and accept ✓ / reject; a dropdown for unmatched folders. Detects and offers to replace the project number and name in the root with `{ProjectNo}_{ProjectShort}`. Folders that look like revisions or dates (`Rev A 12-03`, `2024-05-01`) are suggested as **left out**. The numbering style (`01_`, `A-`, `1.`) is detected and kept.
3. **Name & save**: template name, set as default (optional), Save → opens it in C2.

The matcher is a pure function using a synonyms table, for example: VD / volt drop → calcVd; SC / short circuit / fault → calcFault; Arch / architect / received → receivedArch; Issued / IFC → drawingsIssued; DEWA → authDewa; BOQ / bill → boq; TR / transmittal → transmittals; MOM / minutes → minutes. It gives a 0–1 score; suggest when ≥ 0.6, and give each role at most once (highest score wins).

### C6 — Customise for this project (Overview → Project folder → Customise)

- The project's tree, with a status per folder: ✓ present, ＋ to create, renamed here, hidden for this project.
- Actions: add folder or subfolder, rename, hide (that template folder isn't created for this project), and per-project role reassignment.
- The overrides are stored in the project: `project.folder.overrides = { add[], rename[], hide[], roles{} }`.
- Rename creates the new folder name. The old folder, if it exists, is **left and listed**, never moved.
- Side panel: present / to create counts, **Save these changes back to the template…** (opens C2 with the changes applied, as a new template or into the current one), and **Reset to template**.
- Footer button: "Create N folders".

### C7 — New template: layout presets and multi-building

- Six cards: Discipline-first · Stage-first · Building/phase-first · ISO 19650 containers · Flat & simple · Blank.
- Building/phase-first: a **Repeat for** section with Source (Buildings in Building information · Phases typed by the user), a folder name pattern (`{BuildingCode}_{BuildingName}`), and the shared folders that stay once at the top (e.g. `00_Common` with Admin, DEWA, Transmittals).
- In the template, a node with `when: "building:each"` is repeated for each building; outputs that belong to a building (its DB schedules, its BOQ when it's split by building) save into that building's role folder.
- When a building is added to the project later, its folders are offered on the C6 card ("＋ B3_… auto when a building is added").

### C8 — Change template on an existing project

- Dialog: from → to template, then a diff tree: ＋ to create · = kept (with "role remapped" when the role's folder changes) · ○ not in the new template (left untouched, with a file count).
- Summary counts. An optional "Show where old files would go" **list only** (no moving).
- Apply: creates the new folders, updates `project.folder.templateId` and the version, and keeps the overrides that still apply (and lists the ones that no longer do).


## Part B — Data model

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

## Appendix — built-in templates ISO 19650 and Multi-building

In the same format as `folder-templates.json`, which also holds the three existing built-ins. In Multi-building, the `building:each` node repeats once per building in Building information; `repeat.shared` lists the node ids that stay once at the top.

```json
[
  {
    "id": "iso19650",
    "name": "ISO 19650",
    "version": 1,
    "builtIn": true,
    "layout": "iso19650",
    "root": "{ProjectNo}_{ProjectShort}",
    "numbering": "none",
    "naming": {
      "preset": "iso19650",
      "pattern": "{Project}-{Originator}-{Volume}-{Level}-{Type}-{Role}-{Number}",
      "separator": "-",
      "discipline": "E"
    },
    "folders": [
      {
        "id": "iso.wip",
        "name": "00_WIP",
        "children": [
          {
            "id": "iso.wip.electrical",
            "name": "E-Electrical",
            "roles": [
              "cadWorking",
              "drawingsWip",
              "calcLoad",
              "calcVd",
              "calcFault",
              "calcCable",
              "calcEarthing",
              "calcLighting",
              "calcPv",
              "calcStandby",
              "loadSchedules",
              "cableSchedule",
              "projectFile"
            ]
          },
          {
            "id": "iso.wip.architectural",
            "name": "A-Architectural"
          },
          {
            "id": "iso.wip.mechanical",
            "name": "M-Mechanical"
          },
          {
            "id": "iso.wip.structural",
            "name": "S-Structural"
          }
        ]
      },
      {
        "id": "iso.shared",
        "name": "01_SHARED",
        "children": [
          {
            "id": "iso.shared.electrical",
            "name": "E-Electrical",
            "roles": [
              "internalReview",
              "crs"
            ]
          },
          {
            "id": "iso.shared.architectural",
            "name": "A-Architectural",
            "role": "receivedArch"
          },
          {
            "id": "iso.shared.mechanical",
            "name": "M-Mechanical"
          },
          {
            "id": "iso.shared.structural",
            "name": "S-Structural"
          }
        ]
      },
      {
        "id": "iso.published",
        "name": "02_PUBLISHED",
        "children": [
          {
            "id": "iso.published.electrical",
            "name": "E-Electrical",
            "roles": [
              "drawingsIssued",
              "studyReports",
              "transmittals"
            ],
            "onUse": "{Stage}/Rev-{Rev}"
          },
          {
            "id": "iso.published.architectural",
            "name": "A-Architectural"
          },
          {
            "id": "iso.published.mechanical",
            "name": "M-Mechanical"
          },
          {
            "id": "iso.published.structural",
            "name": "S-Structural"
          }
        ]
      },
      {
        "id": "iso.archive",
        "name": "03_ARCHIVE",
        "children": [
          {
            "id": "iso.archive.electrical",
            "name": "E-Electrical",
            "roles": [
              "drawingsSuperseded",
              "archive"
            ]
          },
          {
            "id": "iso.archive.architectural",
            "name": "A-Architectural"
          },
          {
            "id": "iso.archive.mechanical",
            "name": "M-Mechanical"
          },
          {
            "id": "iso.archive.structural",
            "name": "S-Structural"
          }
        ]
      }
    ]
  },
  {
    "id": "multi-building",
    "name": "Multi-building",
    "version": 1,
    "builtIn": true,
    "layout": "building",
    "root": "{ProjectNo}_{ProjectShort}",
    "numbering": "none",
    "repeat": {
      "source": "buildings",
      "name": "{BuildingCode}_{BuildingName}",
      "shared": [
        "mb.common"
      ]
    },
    "naming": {
      "preset": "office",
      "pattern": "{ProjectNo}-{Discipline}-{Type}-{Seq:3}-{Rev}",
      "separator": "-",
      "discipline": "E"
    },
    "folders": [
      {
        "id": "mb.common",
        "name": "00_Common",
        "children": [
          {
            "id": "mb.common.admin",
            "name": "Admin",
            "roles": [
              "programme",
              "minutes",
              "timesheets",
              "projectFile",
              "backups"
            ]
          },
          {
            "id": "mb.common.dewa",
            "name": "DEWA",
            "roles": [
              "authDewa",
              "authDm",
              "authCd",
              "submissionResponses"
            ]
          },
          {
            "id": "mb.common.transmittals",
            "name": "Transmittals",
            "role": "transmittals",
            "onUse": "TR-{TrNo}"
          }
        ]
      },
      {
        "id": "mb.buildingcode-buildingname",
        "name": "{BuildingCode}_{BuildingName}",
        "when": "building:each",
        "children": [
          {
            "id": "mb.buildingcode-buildingname.calcs",
            "name": "Calcs",
            "roles": [
              "calcLoad",
              "calcVd",
              "calcFault",
              "calcCable",
              "calcEarthing",
              "calcLighting"
            ]
          },
          {
            "id": "mb.buildingcode-buildingname.drawings",
            "name": "Drawings",
            "roles": [
              "cadWorking",
              "drawingsWip",
              "drawingsIssued"
            ]
          },
          {
            "id": "mb.buildingcode-buildingname.schedules",
            "name": "Schedules",
            "roles": [
              "loadSchedules",
              "cableSchedule",
              "equipmentSchedule",
              "luminaireSchedule"
            ]
          },
          {
            "id": "mb.buildingcode-buildingname.boq",
            "name": "BOQ",
            "role": "boq"
          }
        ]
      }
    ]
  }
]
```
