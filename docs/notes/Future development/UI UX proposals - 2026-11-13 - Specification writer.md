# Specification writer — built-in document editor — proposal (2026-11-13)

A document editor made for project specifications, electrical and ELV, whose values come from the project. Mockup approved by the owner on 2026-11-13 ("go ahead"). It is to be a main ribbon tab of its own, like Sheets, not inside Documents.

## Rules it follows

- Built for specifications, not a general word processor: headings, numbered clauses, notes, tables and project fields. Page layout comes from the Word template on export.
- The clause wording is the engineer's or the office's. The starter set is plain wording to edit; the app ships no text of any standard.
- A value comes from the project or is shown as DATA REQUIRED; none is guessed.
- The app's own code for the editor. The only library is the one already used to write Word files (`docx`).

## Main tab name

The app already has a main tab called "Documents" (schedules, drawings and reports). The editor's tab is named **Specification** so the two are not confused. To be changed if the owner prefers another name.

## The page

1. **Ribbon**, spaced as the Sheets ribbon, five tabs: File, Home, Specification, Insert, Review.
   - **Home**: Clipboard (Paste, Cut, Copy, Copy format) · Font (Bold, Italic, Underline, Highlight, Text colour, Clear format) · Paragraph (Bullets, Numbered clauses, Align left, Outdent, Indent, Justify) · Styles (Section heading, Clause heading, Clause, Note) · Editing (Find and replace, Undo) · Output (Export Word).
   - **Specification**: Sections (Add section, Clause library, Renumber clauses, Section list) · Project data (Insert field, Refresh fields, Show fields, Schedule table) · Format (My office template, Built-in format, Header and footer) · Check (Check spec, Missing data, Compare with project) · Output (Export Word, Export PDF).
   - **File**: New specification, Open Word file as a template, Save, Export Word, Export PDF, Print.
   - **Insert**: Table, Schedule from the project (boards, cables, loads), Page break, Clause from library, Project field.
   - **Review**: Compare with project, Changes since last revision, Comments, Missing data list.
2. **Sections** (left): the section list with a tick to include each; clauses renumber by themselves.
3. **The page** (middle): a white page with header, numbered clauses, schedule tables and footer. A value from the project is shaded; one the project does not have is red, DATA REQUIRED.
4. **Clause library** and **Project fields in this section** (right).

## Stages

1. **The model** — `src/model/specDoc.ts` with tests: sections and clauses, fields from the project, numbering, missing data, editing, the starter specification. No UI. (This PR.)
2. **The page and the main tab** — sections list, the page with editing, Home tab, saved with the project.
3. **Export** — Word in the built-in format, and PDF.
4. **Clause library and the office template** — the engineer's own clauses; a Word file with placeholders as the format.
5. **Specification, Insert and Review tabs** — schedules from the project, check, compare.

## Stage 1 — fields a clause can use

Written in a clause as `{{key}}`: `project.name`, `project.revision`, `project.voltage`, `project.frequency`, `main.id`, `main.rated`, `main.icw`, `main.busbar`, `main.ip`, `main.location`, `main.transformer`, `boards.count`, `earthing.system`, `earthing.conductor`, `lightning.class`, `lightning.method`. More are added as sections need them.

Not in the project today, so not a field yet: the form of internal separation (shown in the mockup). It needs a board property first.
