# UI/UX proposal — BOQ approved makes, specification references and preambles (2026-11-10)

Item 3 of the BOQ plan. Mockup: `docs/mockups/boq-approved-makes-mockup.html` (light/dark toggle; new parts have a dashed outline).

## What changes on screen

1. **BOQ page, price list bar**: one new button, **Makes & preambles (n / m)**, between "BOQ document…" and "Use a saved price list…". It opens a dialog in place of the table, the same way Markup and BOQ document work today.
2. **Dialog, Approved makes tab**: one row per equipment category, grouped by BOQ section. Each row has Make 1–3 and a Specification ref. field, plus a count of the BOQ lines in that category.
   - The options are "Only categories used in this BOQ" and "Print 'or approved equal'".
   - The buttons are Load office list…, Save as office list, Excel template and Import Excel.
3. **Dialog, Preambles tab**: a general preamble plus one text per BOQ section, with Reset to office text.
4. **Edit item dialog** (pencil): an optional Approved makes / Spec ref. pair overrides the category for that one line.

Nothing else on the page moves.

## Outputs (black and white)

- **Excel BOQ sheet**: the general preamble goes above section A, and each section preamble goes under its heading. Two new columns, **Spec ref.** and **Approved makes**, go after Location. The eight existing columns keep their places, so priced returns still match by item number.
- **PDF BOQ**: no new columns. A small second line under the description reads "Spec … · Makes: A / B / C or approved equal". Preambles print under the section headings.

## Data (no UI)

- `BoqMakeList { id, name, date, categories: Record<categoryId, { makes: string[≤3], specRef?, preamble? }>, preambles: Record<sectionId|'general', string> }`. It is saved in the same library as saved price lists.
- The project copy goes in `project.boq.makes`, and the per-line override in `BoqOverride.makes / specRef`.
- Categories come from the BOQ line key prefixes (`mccb:` → MCCB, `cable:` → LV cables, and so on), defined in one table in `src/model/`.
- The app ships no manufacturer names. The office types them in.

## Decisions needed

1. Should the button sit in the price list bar, as in the mockup, or be a third item under "BOQ document…"?
2. Should the Excel get two new columns at the end (mockup), or the makes as a second line under the description, like the PDF?
3. Should "or approved equal" be on by default?
4. Is a per-line override needed in v1, or are categories enough to start with?
5. Should the office list starter text include default preambles (generic, standards-based wording), or start empty?

After approval: engine/model and Excel/PDF output in one PR, then the dialog in a second PR. Run `npm run test:pdf` for the PDF line.
