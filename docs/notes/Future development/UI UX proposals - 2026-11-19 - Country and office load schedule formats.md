# Country and office load schedule formats — proposal (2026-11-19)

Status: proposal and mockup only. No UI, calculation, report or export behaviour is changed.

## Question

How should the built-in Sheets/Excel capability let an office customise load-schedule output for different countries and authorities, while keeping the app's calculations, checks and project data reliable?

## What the app already has

The current code is beyond a simple Excel export:

- **General app forms** for DB schedules and connected-load / maximum-demand panel forms.
- **My Excel template** for DB schedules. An `.xlsx` file can contain `{{project.…}}`, `{{board.…}}`, totals and one `{{row.…}}` pattern row. The app repeats that row for every circuit and spare.
- **Linked Sheets formats** for DB, SMDB, MDB and MCC categories. A user opens an Excel layout in Sheets, links cells and columns to project fields, and saves the layout as **My format**.
- **Office library and project copy.** My formats are kept in the office library through `Library.json`. A project can take a separate copied format for DBs, SMDBs, MDBs and MCCs. A new project can choose those copies beside the country, authority and rule set.
- **Two-way scheduling.** Supported linked cells can be applied to the project. The app then creates or updates the panel, circuits/feeders and SLD through the normal model and sizing paths.
- **Output in the user's layout.** A selected panel or all panels can be exported as black-and-white PDF or Excel in My format, with the selected paper size and repeated headings.

The main remaining gap is not Excel editing. It is **country/authority ownership, a wider field catalogue, controlled sharing and support for schedule shapes that are not one circuit per row**.

## Current limits that matter

| Area | Current position | Effect on country formats |
|---|---|---|
| Country and authority | A schedule format has no country or authority metadata | The new-project wizard lists every office format together; it cannot recommend or verify the right one |
| Relationship to rules | Design references hold engineering values, rule rows and cable/breaker limits; formats are separate | This is safe, but there is no declared compatibility between a rule set and a format |
| Panel categories | Project formats cover DB, SMDB, MDB and MCC | The load summary and busbar-riser forms stay in the app's general format |
| Row shape | One circuit or feeder per repeated row; one panel per sheet | Paired left/right panelboards, two circuits per line and several panels on one worksheet need another layout model |
| DB linked fields | Project/board header data, circuit reference and phase, MCB, wire, CPC, length, room, point counts, phase watts, row watts, ELCB, status and remarks | Many international schedules also need DF, PF, poles, device type/curve/Icu, cable type/cores/runs/method, RCD/RCBO, Ib and voltage drop |
| Excel fidelity in Sheets | Values, formulas, basic font/alignment/wrap/number formats, widths, merges and borders are kept | Images, charts, comments, complete colours and other Excel-only objects are not a safe basis for a format |
| Legacy template export | The placeholder exporter is DB-only and remembers one file on the computer | It overlaps with My formats and should eventually become a compatibility path, not a second format system |
| Sharing | Office formats travel in `Library.json`; a project stores a copy | There is no small reviewed format package that an office or authority can exchange independently |

## Recommended model

### 1. Keep one authoritative electrical model

The project remains the source of truth for load, phase, demand, protection, cable, CPC, length and calculated results. A worksheet may display those values and may submit supported edits through **Apply to project**, but Excel formulas do not select cable or breaker sizes and do not override the calculation engines.

This gives three clear layers:

1. **Rules** — voltage, limits, sizing policy and engineering checks.
2. **Project data** — panels, circuits, loads, selected devices and calculated results.
3. **Format** — headings, column order, repeated areas, print paper and field links.

### 2. Make an authority format a recommendation, not a forced rule

A layout should declare the countries, authorities and rule-set families it is intended for. That declaration controls discovery, defaulting and warnings. It must not change engineering values.

Resolve a format for each panel category in this order:

1. The format explicitly copied into this project.
2. The office default for the project's authority and panel category.
3. A verified built-in format recommended for that authority.
4. The app's General form.

The chosen format is copied into the project. Library or app updates do not silently change an issued project. **Update format** must show the version difference and affected panel categories before replacing the copy.

### 3. Add a versioned schedule-format package

Suggested data, independent of the design-reference rules:

| Field | Purpose |
|---|---|
| ID, name and version | Stable identity and controlled updates |
| Status | Draft office format, office-approved, or built-in verified |
| Country and authority IDs | Discovery and recommended defaults; optional for a general office format |
| Compatible rule-set IDs or families | Warn when the layout expects fields or wording not supplied by the selected rules |
| Panel category | DB, SMDB, MDB, MCC; later load summary and busbar riser |
| Layout kind | Repeated row, paired left/right, sectioned form or fixed official workbook |
| Paper and print settings | A4/A3, portrait/landscape, fit-to-width, repeated headings |
| Sheet model and field bindings | Cells, repeated rows/areas, formulas, borders and merges |
| Editable-field policy | Output-only, or the exact fields that Apply to project may change |
| Source and review date | Authority document/template reference and the date it was checked |

For sharing, use a small LVDS format package containing the metadata and the sheet model. The user may still design the layout in `.xlsx`, but plain Excel does not safely carry all LVDS links, permissions, provenance and review status.

### 4. Separate output-only and linked-edit formats

This avoids giving every imported workbook permission to change a project.

| Mode | Use | Behaviour |
|---|---|---|
| Output format | Authority submission, client issue, office print style | Project fills the sheet. Cells are not pushed back. Free formulas and display-only fields are allowed. |
| Linked-edit format | Office scheduling sheet used to build/update the design | Only mapped editable fields are accepted. Changes remain pending until Apply to project; normal validation, sizing and checks run. |

Imported formats should default to **Output format**. The user deliberately enables linked editing after all required fields and write permissions pass validation.

### 5. Use a typed field catalogue

Every link should have a stable key, label, unit, value type, direction and applicable panel categories. This is safer than deriving meaning from a column heading.

First additions worth exposing:

- circuit connected load, demand factor, maximum-demand load and power factor;
- design current and calculated per-phase current;
- breaker device, curve/type, poles and Icu;
- cable type, cores, parallel runs and installation method;
- CPC, RCD sensitivity and RCBO flag;
- voltage-drop result and limit status;
- load-item reference, quantity and unit watts;
- rule/check source text as a read-only output field.

Calculation results, rule sources and compliance statuses are **read only**. Load, demand factor, description, phase/way, selected protection/cable, length, point counts and remarks may be editable where the existing project model permits it.

### 6. Validate before a format can be selected

A format check should report:

- panel category and layout kind;
- required header and row fields that are missing;
- duplicate or conflicting links;
- unsupported write links;
- fields unavailable in the current app version;
- formulas or Excel objects that will be kept only as displayed values or dropped;
- print area, paper, repeated headings and expected pages for small and large sample panels;
- whether all circuits, spares and failed checks remain visible;
- compatibility with the selected authority/rule set.

A built-in format should also have regression samples for zero rows, one row, a long multi-page schedule, three-phase circuits, spares/spaces, mixed point loads and failed checks.

## Country-format possibilities

These are layout families, not claims that the mockup is an official authority form.

| Layout family | Example use | Fit with current model |
|---|---|---|
| One circuit per row, phase columns | UAE/IEC-style DB schedule with R/Y/B loads and point columns | Works now; extend the field catalogue |
| One circuit per row, protection/results emphasis | UK/IEC final-circuit schedule | Works after adding device, RCD, Ib and voltage-drop fields |
| Paired left/right circuits | North American panelboard with odd/even circuit numbers | Later layout engine: two repeated records in one visual row |
| Sectioned official workbook | Authority workbook with several blocks, notes and summaries | Output-only first; needs repeated areas and controlled formulas |
| Several panels on one sheet | Compact contractor or facility schedule | Later: one repeated panel block containing repeated circuit rows |

Only verified official forms should ship as built-in authority formats. Where the official form has not been supplied and checked, the authority starts with **General**, and an office may add its own draft format.

## Options

### Option A — keep My formats only

Add more fields but leave formats as an unclassified office list.

- Small change.
- Does not solve discovery, authority defaults, verification or sharing.

### Option B — authority-aware format packs (recommended)

Keep the existing Sheets designer and project copies, add metadata, versioning, typed links, validation and import/export of a format package.

- Reuses what is already built.
- Supports country/authority recommendations without coupling layout to calculations.
- Gives a controlled path from an office workbook to a reviewed reusable format.

### Option C — full Excel compatibility inside the app

Try to preserve every Excel feature and let arbitrary formulas drive the schedule.

- Highest effort and regression risk.
- Makes engineering results depend on workbook behaviour and weakens offline reviewability.
- Not recommended.

## Mockup workbook

The companion workbook demonstrates Option B without changing the product:

1. **Example output** — a black-and-white international DB schedule populated with sample circuits.
2. **Template links** — the same structure using the current `{{project.…}}`, `{{board.…}}` and repeated `{{row.…}}` placeholders.
3. **Format setup** — proposed country, authority, category, mode, paper, version and source metadata, plus format-selection priority.
4. **Field catalogue** — fields available today and the first proposed additions, including read/write direction.

The example is deliberately general. It is not an official DEWA, ADDC, EtihadWE or other authority form.

## Suggested implementation stages

Each stage should be a separate PR after approval.

1. **Format metadata and resolution only.** Add country/authority compatibility, version, status and per-category defaults. Preserve all current outputs and General fallback.
2. **Shareable format package.** Export/import one reviewed format with validation and conflict handling; keep `Library.json` sync.
3. **Typed field catalogue.** Consolidate DB and panel field definitions, add units/direction, and expose the first read-only calculation/result fields.
4. **Editable-field expansion.** Add only fields that already have a safe normal project edit path; keep Apply to project explicit.
5. **Validation and sample preview.** Small/large sample panels, missing/unsupported field report, print/pagination preview and regression fixtures.
6. **Authority defaults.** Ship built-in formats only from supplied, reviewed official workbooks. General remains the fallback.
7. **Advanced layout kinds.** Paired left/right circuits, repeated panel blocks, load summary and busbar-riser formats.
8. **Legacy consolidation.** Read the old placeholder workbook into My formats where possible; keep the old exporter for existing users until migration is proven.

## Decisions needed

Recommended choices are in bold.

1. Should an authority format be forced or recommended? **Recommended, with an explicit project override.**
2. Should an imported Excel file be allowed to write to the project immediately? **No; output-only until linked-edit validation is enabled.**
3. Should format updates change open projects automatically? **No; keep the project copy until an engineer reviews Update format.**
4. Should built-in country formats be invented when an official form is unavailable? **No; use General and mark office imports as draft.**
5. Should rules and layout live in one object? **No; keep them separate and record compatibility between them.**
6. Which advanced layout is needed first: paired left/right circuits, several panels per sheet, load summary, or busbar riser?
7. Are logos and full Excel colours required, or is the existing black-and-white output rule sufficient?
8. Which two or three real office/authority workbooks may be used as acceptance fixtures?
