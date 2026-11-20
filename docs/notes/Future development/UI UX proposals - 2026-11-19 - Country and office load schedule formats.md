# Country and office load schedule formats — proposal (2026-11-19)

Status: proposal and mockup only. No UI, calculation, report or export behaviour is changed.

## Question

How should the built-in Sheets/Excel capability let an office customise load-schedule output for different countries and authorities, while keeping the app's calculations, checks and project data reliable?

## Clarified decision

The requirement is not to add a DEWA, UK, US or other country-specific table model. Those are only examples showing how differently an office may arrange the same design data.

The recommended feature is a **controlled output-template mapper**:

- the user designs the sheet in Excel;
- the user places project, panel, circuit and summary parameters where they want them;
- the app expands declared repeating regions and fills the mapped parameters;
- the app generates Excel and PDF from the validated layout;
- the project remains the source of all engineering data and calculations.

Do not build a general spreadsheet editor or allow arbitrary workbook programming inside LV Design Studio. This controlled approach provides most useful layout freedom without turning the app into Excel.

### Recommended freedom boundary

| Template requirement | Support | Notes |
|---|---|---|
| Put a project or panel value in any cell | Yes | A field may be displayed in more than one place |
| Choose circuit columns, order, headings and widths | Yes | The user controls presentation, not calculation meaning |
| Hide unused fields | Yes | Unmapped data remains in the project |
| Repeat one circuit row or a small circuit block | Yes | This is the main MVP capability |
| Put totals, notes and signatures in chosen cells | Yes | Totals come from typed read-only fields |
| Use merged headings, borders, fonts and page settings | Supported subset | The validator must identify unsupported formatting |
| Several independent repeating regions | Later | For sectioned schedules and multiple panel blocks |
| Two project records combined into one visual row | Later adapter | Only required when a real template needs this shape |
| Macros, VBA, scripts or arbitrary nested loops | No | Too difficult to validate and unsafe as a report contract |
| Let workbook formulas override sizing or compliance | No | Electrical results always come from LV Design Studio |

The first implementation should deliberately target the common 80–90% case: fixed header cells, one repeating circuit region, and fixed summary/footer cells.

## What the app already has

The current code is beyond a simple Excel export:

- **General app forms** for DB schedules and connected-load / maximum-demand panel forms.
- **My Excel template** for DB schedules. An `.xlsx` file can contain `{{project.…}}`, `{{board.…}}`, totals and one `{{row.…}}` pattern row. The app repeats that row for every circuit and spare.
- **Linked Sheets formats** for DB, SMDB, MDB and MCC categories. A user opens an Excel layout in Sheets, links cells and columns to project fields, and saves the layout as **My format**.
- **Office library and project copy.** My formats are kept in the office library through `Library.json`. A project can take a separate copied format for DBs, SMDBs, MDBs and MCCs. A new project can choose those copies beside the country, authority and rule set.
- **Two-way scheduling.** Supported linked cells can be applied to the project. The app then creates or updates the panel, circuits/feeders and SLD through the normal model and sizing paths.
- **Output in the user's layout.** A selected panel or all panels can be exported as black-and-white PDF or Excel in My format, with the selected paper size and repeated headings.

The main remaining gap is not Excel editing. It is **a clear mapping contract, a wider field catalogue, validation, PDF rendering and controlled sharing**. Country and authority metadata can help users discover the right saved template, but must not determine the table shape.

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

### 1A. Use four mapping scopes

Every available output parameter belongs to one of four scopes:

| Scope | Example | Template behaviour |
|---|---|---|
| Project | `project.name`, `project.client`, `project.location` | Written to any mapped fixed cell |
| Panel | `panel.reference`, `panel.voltage`, `panel.rating` | Written to any mapped fixed cell |
| Circuit | `circuit.number`, `circuit.description`, `circuit.breaker.rating` | Written inside the declared repeating region |
| Summary | `panel.connectedLoad`, `panel.maximumDemand`, `panel.phaseTotals` | Written to mapped fixed cells after the circuit region expands |

A typed field may be mapped more than once. Display labels are free text; the stable field key is what connects the template to project data.

### 1B. Make the repeating region explicit

The workbook cannot infer report behaviour from visual formatting alone. The template must declare:

- the worksheet and cell range forming one circuit record;
- whether the record repeats down or across;
- the spacing between repeated records;
- the maximum records per page and repeated page headings;
- the continuation behaviour when the circuit count exceeds the first page;
- the location of summary/footer content after expansion.

For the first version, support one downward-repeating row or block per worksheet. This can already represent many very different schedules because the fields may be arranged freely inside that block.

### 1C. Treat Excel as the design surface, not the runtime

The user prepares the appearance in Excel and imports it. LV Design Studio reads the supported cells, styles, merges, mappings and print settings into a validated internal layout model. The saved LVDS format package, rather than the original workbook alone, is the runtime report definition.

This is needed so the app can generate the same layout offline as both Excel and PDF without depending on Microsoft Excel being installed. PDF output should promise fidelity only for the supported and validated Excel subset.

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

## Layout possibilities

These are layout families, not hard-coded country modes and not claims that the mockup is an official authority form.

| Layout family | Example use | Fit with current model |
|---|---|---|
| One circuit per row, phase columns | UAE/IEC-style DB schedule with R/Y/B loads and point columns | Works now; extend the field catalogue |
| One circuit per row, protection/results emphasis | UK/IEC final-circuit schedule | Works after adding device, RCD, Ib and voltage-drop fields |
| Paired left/right circuits | Any schedule that places two circuit records on one visual line | Later layout adapter: two repeated records in one visual row |
| Sectioned official workbook | Authority workbook with several blocks, notes and summaries | Output-only first; needs repeated areas and controlled formulas |
| Several panels on one sheet | Compact contractor or facility schedule | Later: one repeated panel block containing repeated circuit rows |

Only verified official forms should ship as built-in authority formats. Where the official form has not been supplied and checked, the authority starts with **General**, and an office may add its own draft format.

## Options

### Option A — keep My formats only

Add more fields but leave formats as an unclassified office list.

- Small change.
- Does not solve discovery, authority defaults, verification or sharing.

### Option B — controlled template mapping and format packs (recommended)

Keep the existing Sheets designer and project copies, add an explicit repeating-region contract, metadata, versioning, typed links, validation and import/export of a format package.

- Reuses what is already built.
- Lets the same engine support office, client, country and authority layouts without hard-coding each table.
- Gives a controlled path from an office workbook to a reviewed reusable format.

### Option C — full Excel compatibility inside the app

Try to preserve every Excel feature and let arbitrary formulas drive the schedule.

- Highest effort and regression risk.
- Makes engineering results depend on workbook behaviour and weakens offline reviewability.
- Not recommended.

## Mockup workbook

The revised companion workbook `controlled-template-mapping-mockup.xlsx` demonstrates Option B without changing the product:

1. **Decision** — the supported flexibility boundary and the excluded unrestricted Excel features.
2. **Excel template** — a user-arranged black-and-white schedule with fixed fields, one circuit repeat region and summary fields.
3. **Mapping definition** — the cell ranges, stable keys, scopes, types and repeat behaviour understood by the app.
4. **Generated output** — sample project data filled into the template as the proposed Excel/PDF result.
5. **Field catalogue** — an illustrative first-release list of project, panel, circuit and summary parameters.

The example is deliberately general. It is not an official DEWA, ADDC, EtihadWE or other authority form.

### Proposed mapping example

The Excel cells may be visually arranged however the user wants. A separate mapping definition records their meaning:

| Excel location | Mapping | Behaviour |
|---|---|---|
| `B2` | `project.name` | Fixed project value |
| `F2` | `panel.reference` | Fixed panel value |
| `B3` | `panel.voltage` | Fixed panel value |
| `A8:H8` | Circuit repeating region | Copy this formatted block once per circuit |
| `A8` | `circuit.number` | Circuit value inside each repeated block |
| `B8:D8` | `circuit.description` | Circuit value may occupy a merged range |
| `E8` | `circuit.breaker.rating` | Circuit value inside each repeated block |
| `F8` | `circuit.cable.size` | Circuit value inside each repeated block |
| `G8` | `circuit.connectedLoad` | Circuit value inside each repeated block |
| `H8` | `circuit.remarks` | Circuit value inside each repeated block |
| `G10` | `panel.connectedLoad` | Summary cell placed after the expanded region |
| `G11` | `panel.maximumDemand` | Summary cell placed after the expanded region |

The interface should not require the user to type JSON or field keys manually. The existing sheet-linking interaction can offer **Link fixed cell**, **Define circuit region**, **Link circuit field**, and **Link summary cell**, followed by **Validate and preview**.

## Suggested implementation stages

Each stage should be a separate PR after approval.

1. **Mapping contract and typed field catalogue.** Consolidate project, panel, circuit and summary fields; define one fixed-cell area, one repeating circuit region and fixed summary cells.
2. **Template import, validation and sample preview.** Import the supported Excel subset; report missing links and unsupported features; preview small and multi-page sample panels.
3. **Common Excel/PDF layout model.** Generate both outputs from the validated mapping, with defined pagination, repeated headings and continuation behaviour.
4. **Shareable format package.** Export/import one reviewed format with version, status, source, conflict handling and `Library.json` compatibility.
5. **Office and authority discovery.** Add optional country/authority compatibility and per-category defaults. General remains the fallback.
6. **Editable-field expansion.** Only after output templates are stable, allow explicitly approved write links through Apply to project.
7. **Advanced layout adapters.** Add multiple repeat regions, two-record visual rows or repeated panel blocks only against real accepted customer templates.
8. **Legacy consolidation.** Read the old placeholder workbook into My formats where possible; keep the old exporter for existing users until migration is proven.

## Decisions needed

Recommended choices are in bold.

1. Should the feature be skipped because unrestricted Excel is too complex? **No. Implement the bounded mapper; skip unrestricted Excel compatibility.**
2. Should the first release support one circuit repeat region only? **Yes. Add other region shapes only from proven templates.**
3. Should an authority format be forced or recommended? **Recommended, with an explicit project override.**
4. Should an imported Excel file be allowed to write to the project immediately? **No; output-only until linked-edit validation is enabled.**
5. Should format updates change open projects automatically? **No; keep the project copy until an engineer reviews Update format.**
6. Should built-in country formats be invented when an official form is unavailable? **No; use General and mark office imports as draft.**
7. Should rules and layout live in one object? **No; keep them separate and record compatibility between them.**
8. Which advanced region shape should be added first after real template review?
9. Are logos and full Excel colours required, or is the existing black-and-white output rule sufficient?
10. Which two or three real office/authority workbooks may be used as acceptance fixtures?
