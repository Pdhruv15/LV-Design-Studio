import { AlignmentType, BorderStyle, Document, ImportedXmlComponent, Footer, Header, HeadingLevel, ImageRun, Packer, PageBreak, PageNumber, PageOrientation, Paragraph, TabStopType, Table, TableCell, TableRow, TextRun, WidthType, type ParagraphChild } from 'docx';
import { revisionStamp } from '../model/revisions';
import { slotRuns, specSetup, specView, SPEC_PAPER_MM, type SpecDoc, type SpecLine, type SpecPage } from '../model/specDoc';
import type { Project } from '../types';
import { missingList, specInfoRows } from './specReport';

// Kept apart from specReport.ts so the docx library loads only when the Word file is exported.
/** The specification as a Word file in the built-in format: title, contents, then each included section on a new
 * page with numbered clauses on a hanging indent, and the paper, margins, header, footer, logo and
 * watermark of the page setup. Headings use Word's own heading styles, so the engineer can restyle the file or build a table of
 * contents from it. A value the project does not have is written as DATA REQUIRED in bold. */

const INDENT = 850; // twips: where clause text starts, the number hanging before it
const runs = (l: SpecLine, more: { bold?: boolean; italics?: boolean } = {}) =>
  l.runs.map((r) => ('text' in r ? new TextRun({ text: r.text, ...more }) : r.value !== undefined ? new TextRun({ text: r.value, ...more }) : new TextRun({ text: `DATA REQUIRED: ${r.label}`, bold: true, underline: {} })));

const TWIP = 1440 / 25.4; // twips per mm
const NONE = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
function logoRun(logo: string | undefined): ImageRun | undefined {
  const m = logo?.match(/^data:image\/(png|jpe?g);base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return undefined;
  const bin = atob(m[2]), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new ImageRun({ type: m[1] === 'png' ? 'png' : 'jpg', data: bytes, transformation: { width: 108, height: 36 } });
}
/** A header or footer: its three slots as one row of a borderless table (left, centre, right). */
function slotRow(edge: 'header' | 'footer', slots: readonly string[], doc: SpecDoc, project: Project, s: SpecPage): Table {
  const logo = logoRun(s.logo);
  const cell = (text: string, i: number) => {
    const side = ['left', 'center', 'right'][i];
    const children: ParagraphChild[] = logo && s.logoPlace === `${edge}-${side}` ? [logo]
      : slotRuns(text, doc, project).map((r) => ('text' in r ? new TextRun({ text: r.text, size: 16 }) : new TextRun({ children: [r.page === 'page' ? PageNumber.CURRENT : PageNumber.TOTAL_PAGES], size: 16 })));
    return new TableCell({ width: { size: 100 / 3, type: WidthType.PERCENTAGE }, borders: { top: NONE, bottom: NONE, left: NONE, right: NONE }, children: [new Paragraph({ alignment: [AlignmentType.LEFT, AlignmentType.CENTER, AlignmentType.RIGHT][i], children })] });
  };
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: { top: NONE, bottom: NONE, left: NONE, right: NONE, insideHorizontal: NONE, insideVertical: NONE }, rows: [new TableRow({ children: slots.map(cell) })] });
}
/** The watermark, written the way Word writes its own (Design > Watermark): word art across the middle of the
 * page in light grey, behind the text. It sits in the header, so it repeats on every page, and Word's own
 * watermark tools can change or remove it. */
const WORDART = '<v:shapetype id="_x0000_t136" coordsize="21600,21600" o:spt="136" adj="10800" path="m@7,l@8,m@5,21600l@6,21600e"><v:formulas><v:f eqn="sum #0 0 10800"/><v:f eqn="prod #0 2 1"/><v:f eqn="sum 21600 0 @1"/><v:f eqn="sum 0 0 @2"/><v:f eqn="sum 21600 0 @3"/><v:f eqn="if @0 @3 0"/><v:f eqn="if @0 21600 @1"/><v:f eqn="if @0 0 @2"/><v:f eqn="if @0 @4 21600"/><v:f eqn="mid @5 @6"/><v:f eqn="mid @8 @5"/><v:f eqn="mid @7 @8"/><v:f eqn="mid @6 @7"/><v:f eqn="sum @6 0 @5"/></v:formulas><v:path textpathok="t" o:connecttype="custom" o:connectlocs="@9,0;@10,10800;@11,21600;@12,10800" o:connectangles="270,180,90,0"/><v:textpath on="t" fitshape="t"/><v:handles><v:h position="#0,bottomRight" xrange="6629,14971"/></v:handles><o:lock v:ext="edit" text="t" shapetype="t"/></v:shapetype>';
const xmlText = (v: string) => v.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
function watermark(text: string): Paragraph {
  const wide = Math.min(460, Math.max(150, text.length * 62)); // points: about the page diagonal for a long word
  const run = ImportedXmlComponent.fromXmlString(`<w:r><w:rPr><w:noProof/></w:rPr><w:pict>${WORDART}<v:shape id="PowerPlusWaterMarkObject1" o:spid="_x0000_s2049" type="#_x0000_t136" style="position:absolute;margin-left:0;margin-top:0;width:${wide}pt;height:${Math.round(wide / Math.max(2.4, text.length * 0.55))}pt;rotation:320;z-index:-251658752;mso-position-horizontal:center;mso-position-horizontal-relative:margin;mso-position-vertical:center;mso-position-vertical-relative:margin" o:allowincell="f" fillcolor="silver" stroked="f"><v:fill opacity=".5"/><v:textpath style="font-family:&quot;Arial&quot;;font-size:1pt" string="${xmlText(text)}"/></v:shape></w:pict></w:r>`);
  return new Paragraph({ children: [run as unknown as ParagraphChild] }); // a ready-made run: the library has no watermark of its own
}

export function buildSpecDocx(project: Project, doc: SpecDoc): Document {
  const v = specView(doc, project), missing = missingList(v), setup = specSetup(doc, project);
  const [w, h] = SPEC_PAPER_MM[setup.paper], m = setup.marginsMm;
  const info = specInfoRows(doc, project);
  const body: Paragraph[] = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(doc.title)] }),
    new Paragraph({ children: [new TextRun({ text: `${project.name} · ${revisionStamp(project)}` })], spacing: { after: info.length ? 120 : 300 } }),
    ...info.map(([k, x], i) => new Paragraph({ tabStops: [{ type: TabStopType.LEFT, position: 2600 }], spacing: { after: i === info.length - 1 ? 300 : 0 }, children: [new TextRun({ text: `${k}\t`, bold: true }), new TextRun(x)] })),
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
      // Word swaps width and height itself for landscape.
      properties: { page: { size: { width: Math.round(w * TWIP), height: Math.round(h * TWIP), orientation: setup.landscape ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT }, margin: { top: Math.round(m.top * TWIP), right: Math.round(m.right * TWIP), bottom: Math.round(m.bottom * TWIP), left: Math.round(m.left * TWIP) } } },
      headers: { default: new Header({ children: [slotRow('header', setup.header, doc, project, setup), ...(setup.watermark ? [watermark(setup.watermark)] : [])] }) },
      footers: { default: new Footer({ children: [slotRow('footer', setup.footer, doc, project, setup)] }) },
      children: body
    }]
  });
}

export async function specDocxBytes(project: Project, doc: SpecDoc): Promise<Uint8Array> {
  return new Uint8Array(await (await Packer.toBlob(buildSpecDocx(project, doc))).arrayBuffer());
}
