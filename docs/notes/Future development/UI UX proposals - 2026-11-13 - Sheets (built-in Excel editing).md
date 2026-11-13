# Sheets — built-in Excel-style editing — proposal (2026-11-13)

A page where the engineer opens their own Excel schedule, edits it in the same layout, and links its columns to the project. Mockup "B — roomier ribbon" approved by the owner on 2026-11-13 ("now it's ok, proceed"); more tools will be added to the ribbon as they are needed.

## Rules it follows

- Built for electrical and ELV schedules, not a general spreadsheet. Charts, pivot tables, macros and conditional formatting are left to Excel.
- The app's own code for the grid and the formulas. The only library is the one already used to read and write .xlsx files (`exceljs`).
- Nothing from the engineer's file is dropped: a column that is not linked stays as it is, and a formula the sheet cannot work out keeps its last value and is marked.
- The project is the source of truth. Linked cells change the project only through **Apply to project**.

## The page (Sheets)

1. **Ribbon**, six tabs: File, Home, Electrical, Formulas, Data, Review. Every tool has an icon (the app's existing Lucide set). Spacing as mockup B: labelled tools without boxes, 12 px inside, 20 px each side of a group divider; Font and Alignment as icon-only buttons; main tools 88 × 96 px.
   - **Home**: Clipboard (Paste, Cut, Copy, Paste values, Copy format) · Font (Bold, Italic, Underline, Fill, Text colour, Borders) · Alignment (Left, Centre, Right, Wrap text, Merge cells, Rotate heading) · Number (General, Decimals, Units, Percent) · Rows and columns (Insert row, Delete row, Insert column, Delete column, Column width) · Editing (Sum, Fill down, Sort, Filter, Find, Undo) · Project (Apply to project).
   - **Electrical**: Project link (Link columns, Apply to project, Refresh from project, Show linked cells) · Circuits (Add circuit, Add spare, Renumber, Balance phases, Move to board) · Look up (Catalogue, Cable size, Breaker rating, Demand factor, Load type) · Check (Check sheet, Voltage drop, Cable loading, Phase balance, Data required) · Sheets for a board (New from template, Load schedule, Cable schedule, My office format, Authority format).
   - **File**: Open Excel file, Save, Save as .xlsx, Export PDF, Print, column profiles.
   - **Formulas**: Insert function, the electrical functions (kW to A, A to kW, voltage drop %, power factor), Show formulas.
   - **Data**: Sort, Filter, Remove blank rows, Text to columns, Import CSV, Refresh from project.
   - **Review**: Compare with project, Changes since last revision, Comments, Lock linked columns.
2. **Formula bar**: the cell's name and its formula.
3. **Grid**: column letters and row numbers, the engineer's own headings, a line under each heading naming the project field it is linked to, formula cells shaded.
4. **Sheet tabs**: one per sheet, and New sheet.
5. **Side panel**: "Your column → project field", saved as a profile for the office format; what the sheet can do and what is left to Excel.

## Stages

1. **Formulas** — `src/calc/sheetFormula.ts` with tests. No UI. (This PR.)
2. **The page and the Home tab** — grid with formulas, formula bar, sheet tabs, saved with the project.
3. **Open and save .xlsx** — layout, widths, bold and formulas kept; last values kept for formulas the sheet does not have.
4. **Link columns** — the mapping panel, office profiles, Apply to project.
5. **The Electrical tab** — circuits, look-ups and checks, using the existing engines.
6. **Formulas, Data and Review tabs.**

After stage 2 the page needs a look on screen before going on. Stage 3 is best tested with two or three real office files.

## Stage 1 — what the formulas do

- Operators: + − * / ^, unary −, %, &, = <> < > <= >=, brackets.
- Functions: ABS, AND, AVERAGE, COUNT, COUNTA, IF, MAX, MIN, NOT, OR, ROUND, ROUNDDOWN, ROUNDUP, SQRT, SUM, VLOOKUP.
- Errors: #DIV/0!, #NAME?, #VALUE!, #REF!, #N/A, #CYCLE! (a formula that refers to itself), #ERROR! (a formula that cannot be read).
- Fill down and paste move relative references and leave `$` ones.
