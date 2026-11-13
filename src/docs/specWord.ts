import { AlignmentType, Document, Footer, Header, HeadingLevel, Packer, PageBreak, PageNumber, Paragraph, TabStopType, TextRun } from 'docx';
import { revisionStamp } from '../model/revisions';
import { specView, type SpecDoc, type SpecLine } from '../model/specDoc';
import type { Project } from '../types';
import { missingList } from './specReport';

// Kept apart from specReport.ts so the docx library loads only when the Word file is exported.
/** The specification as a Word file in the built-in format: title, contents, then each included section on a new
 * page with numbered clauses on a hanging indent, the project and revision in the header and the page number in
 * the footer. Headings use Word's own heading styles, so the engineer can restyle the file or build a table of
 * contents from it. A value the project does not have is written as DATA REQUIRED in bold. */

const INDENT = 850; // twips: where clause text starts, the number hanging before it
const runs = (l: SpecLine, more: { bold?: boolean; italics?: boolean } = {}) =>
  l.runs.map((r) => ('text' in r ? new TextRun({ text: r.text, ...more }) : r.value !== undefined ? new TextRun({ text: r.value, ...more }) : new TextRun({ text: `DATA REQUIRED: ${r.label}`, bold: true, underline: {} })));

export function buildSpecDocx(project: Project, doc: SpecDoc): Document {
  const v = specView(doc, project), missing = missingList(v);
  const body: Paragraph[] = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(doc.title)] }),
    new Paragraph({ children: [new TextRun({ text: `${project.name} · ${revisionStamp(project)}` })], spacing: { after: 300 } }),
    new Paragraph({ children: [new TextRun({ text: 'Contents', bold: true, size: 26 })], spacing: { after: 120 } }),
    ...v.blocks.map((b) => new Paragraph({ tabStops: [{ type: TabStopType.LEFT, position: INDENT }], children: [new TextRun(`${b.no}\t${b.title}`)] }))
  ];
  if (missing.length) {
    body.push(new Paragraph({ spacing: { before: 300 }, children: [new TextRun({ text: 'DATA REQUIRED', bold: true }), new TextRun(` — the project has no value for: ${missing.map((m) => `${m.label} (${m.clauses.join(', ')})`).join('; ')}.`)] }));
  }
  for (const b of v.blocks) {
    body.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new PageBreak(), new TextRun(`${b.no} ${b.title}`)] }));
    for (const l of b.lines) {
      if (l.kind === 'heading') body.push(new Paragraph({ heading: HeadingLevel.HEADING_2, tabStops: [{ type: TabStopType.LEFT, position: INDENT }], children: [new TextRun(`${l.no}\t`), ...runs(l)] }));
      else if (l.kind === 'note') body.push(new Paragraph({ indent: { left: INDENT }, spacing: { after: 100 }, children: runs(l, { italics: true }) }));
      else body.push(new Paragraph({ indent: { left: INDENT, hanging: INDENT }, tabStops: [{ type: TabStopType.LEFT, position: INDENT }], spacing: { after: 100 }, alignment: AlignmentType.LEFT, children: [new TextRun(`${l.no}\t`), ...runs(l)] }));
    }
  }
  return new Document({
    creator: 'LV Design Studio', title: `${project.name} — ${doc.title}`,
    // Black headings (Word's own are blue): the specification prints black-and-white.
    styles: {
      default: { document: { run: { font: 'Arial', size: 21 } } },
      paragraphStyles: [
        { id: 'Title', name: 'Title', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 40, bold: true, color: '000000' }, paragraph: { spacing: { after: 80 } } },
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 28, bold: true, color: '000000' }, paragraph: { spacing: { after: 160 } } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 22, bold: true, color: '000000' }, paragraph: { spacing: { before: 200, after: 80 } } }
      ]
    },
    sections: [{
      headers: { default: new Header({ children: [new Paragraph({ children: [new TextRun({ text: `${project.name} — ${doc.title}`, size: 16 })] })] }) },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `${revisionStamp(project)}   ·   Page `, size: 16 }), new TextRun({ children: [PageNumber.CURRENT], size: 16 }), new TextRun({ text: ' of ', size: 16 }), new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16 })] })] }) },
      children: body
    }]
  });
}

export async function specDocxBytes(project: Project, doc: SpecDoc): Promise<Uint8Array> {
  return new Uint8Array(await (await Packer.toBlob(buildSpecDocx(project, doc))).arrayBuffer());
}
