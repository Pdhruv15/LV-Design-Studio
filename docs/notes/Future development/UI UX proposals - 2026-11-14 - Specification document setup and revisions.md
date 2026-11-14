# Specification — document setup, templates, Word files and revisions

Approved by the owner on 2026-11-14 ("Go ahead"), after the mockup "Document setup and revisions"
(Document editor mockup, second artboard). Concept and design stage only.

## What the owner asked for

1. Project headline and project information, the parties (client, consultant, main contractor, MEP
   contractor) and any further details the user wants to add.
2. Page setup; header and footer management with the company logo; watermark.
3. Cover page and index (contents) page, created and managed in the app.
4. Indent and outdent of clauses and headings; add pages; page breaks; appendices.
5. Tables and pictures in the document, pasted from Sheets or Excel — as blocks in the text flow.
6. Save as; open an existing Word document; save a product specification as a template and use it
   again; turn values of an opened document into live project fields.
7. The specification's own revisions, separate from the project's: issue, new revision, compare,
   change list, and optional highlight, revision cloud and revision mark on changed clauses.

## Rules

- Nothing of any standard is shipped. Wording is the engineer's own; a missing value prints
  DATA REQUIRED.
- Own code only, with the libraries the app already has (`docx` for Word files).
- Exports stay black-and-white (the watermark is light grey).
- A value the project already holds is not typed twice: a blank party is read from Project
  information, the logo from the drawing title block, unless the specification sets its own.

## Stages (one pull request each)

| Stage | Content | State |
|---|---|---|
| 1 + 2 | Specification tab of the page ribbon: document title, number, status, parties, own details (each a field); paper, orientation, margins; header and footer (left, centre, right, with fields and page numbers); logo and its position; watermark. Applied to the PDF and the Word file. | this change |
| 3 | Cover page and contents page options; revision table on the cover. | next |
| 4 | Indent / outdent, page breaks, appendices. | |
| 5 | Tables and pictures as blocks; paste from Sheets and Excel. | |
| 6 | Template library; Save as; open a Word document; values to fields. | |
| 7 | Specification revisions with highlight, cloud and revision marks. | |

## Changes to what is on screen (stage 1 + 2)

- The greyed "Specification" tab of the page ribbon is now live. It shows four cards in place of the
  section list and page: Document and parties; Additional details; Page setup; Header, footer, logo
  and watermark (with a small preview of the header and footer as printed).
- The top line of the page on the Home tab now shows the header slots (default: project name left,
  document title right) instead of "project — title" and "Section n".
- The summary strip also shows the document number, status, paper and watermark.
- Exports: the PDF now prints its own header, footer and page numbers; the Word file has the same
  three-slot header and footer in place of the fixed ones. With nothing set, both print the project
  name, the document title, the revision and "Page n of N" as before.

## Not checked on screen

Built and tested without launching the app. The Word file was opened in LibreOffice (header, footer,
logo, watermark and page size as expected); it has not been opened in Microsoft Word.
