import { BorderStyle, Document, HeadingLevel, Packer, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType } from 'docx';
import { lightningProtection, type LpsInputs } from '../calc/lightningProtection';
import { revisionStamp } from '../model/revisions';
import type { Project } from '../types';
import { lightningReportBlocks, type LpsSectionKey } from './lightningReport';

// Kept apart from lightningReport.ts so the docx library loads only when the Word file is exported.
/** Word (.docx) output of the lightning protection report: the same sections as the PDF, for editing. The
 * roof layout drawing is in the PDF; the Word file describes it in a sentence. */

const border = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
const borders = { top: border, bottom: border, left: border, right: border };
const cell = (text: string, head = false) => new TableCell({
  borders, shading: head ? { type: ShadingType.CLEAR, color: 'auto', fill: 'F2F2F2' } : undefined,
  children: [new Paragraph({ children: [new TextRun({ text, bold: head, size: 18 })] })]
});
const table = (rows: TableRow[]) => new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows });

export function buildLightningDocx(project: Project, keys?: LpsSectionKey[]): Document {
  const i: LpsInputs = project.lightning ?? { lengthM: 0, widthM: 0, heightM: 0, method: 'mesh' };
  const children: (Paragraph | Table)[] = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun('Lightning protection — concept calculation')] }),
    new Paragraph({ children: [new TextRun({ text: `${project.name} · ${revisionStamp(project)}`, size: 20 })] })
  ];
  for (const b of lightningReportBlocks(project, i, keys, lightningProtection(i))) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(b.title)] }));
    if (b.pairs) children.push(table(b.pairs.map(([k, v]) => new TableRow({ children: [cell(k, true), cell(v)] }))));
    if (b.table) {
      children.push(b.table.rows.length
        ? table([new TableRow({ tableHeader: true, children: b.table.headers.map((h) => cell(h, true)) }), ...b.table.rows.map((row) => new TableRow({ children: row.map((c) => cell(c)) }))])
        : new Paragraph({ children: [new TextRun({ text: 'None.', size: 18 })] }));
    }
    for (const t of b.notes ?? []) children.push(new Paragraph({ children: [new TextRun({ text: t, size: 18 })] }));
  }
  return new Document({ creator: 'LV Design Studio', title: `${project.name} — Lightning protection`, sections: [{ children }] });
}

export async function lightningDocxBytes(project: Project, keys?: LpsSectionKey[]): Promise<Uint8Array> {
  return new Uint8Array(await (await Packer.toBlob(buildLightningDocx(project, keys))).arrayBuffer());
}
