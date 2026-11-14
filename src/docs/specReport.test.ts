import { Packer } from 'docx';
import { describe, expect, it } from 'vitest';
import { sampleProject } from '../data/sampleProject';
import { addDetail, specView, starterSpec, withInfo, withSetup, type SpecDoc } from '../model/specDoc';
import type { Project } from '../types';
import { CATALOGUE, unavailable } from '../components/docs/exportCatalogue';
import { buildSpecHtml, missingList, specPlainText } from './specReport';
import { buildSpecDocx } from './specWord';

const bare: Project = { ...sampleProject, boards: sampleProject.boards.map((b) => ({ ...b, busbarMaterial: undefined, ipRating: undefined })), lightning: undefined, earthingPlan: undefined };
const doc: SpecDoc = { title: 'Electrical specification', sections: [
  { id: 'S1', title: 'General <scope>', included: true, clauses: [{ id: 'C1', kind: 'heading', text: 'Scope' }, { id: 'C2', kind: 'clause', text: 'For {{project.name}} at {{project.voltage}}.' }, { id: 'C3', kind: 'note', text: 'A note.' }] },
  { id: 'S2', title: 'Left out', included: false, clauses: [{ id: 'C4', kind: 'clause', text: 'Never printed.' }] },
  { id: 'S3', title: 'Switchboards', included: true, clauses: [{ id: 'C5', kind: 'clause', text: 'Busbars {{main.busbar}}; IP {{main.ip}}.' }, { id: 'C6', kind: 'clause', text: 'Again {{main.busbar}}.' }] }
] };

describe('specification — PDF document', () => {
  it('has the title, the contents, and every included section with its numbers; nothing of a section left out', () => {
    const html = buildSpecHtml({ ...sampleProject, name: 'Tower <A>' }, doc);
    expect(html).toContain('<h1>Electrical specification</h1>');
    expect(html).toContain('Tower &lt;A&gt;');
    expect(html).toContain('<li><span>1</span><span>General &lt;scope&gt;</span></li><li><span>2</span><span>Switchboards</span></li>');
    expect(html).toContain('<h2>2 Switchboards</h2>');
    expect(html).toContain(`<span>1.1.1</span><span>For Tower &lt;A&gt; at ${sampleProject.voltageV} V.</span>`);
    expect(html).toContain('class="cl h"');
    expect(html).toContain('class="cl n"');
    expect(html).not.toContain('Never printed');
    expect(html).not.toContain('{{');
  });

  it('is black-and-white', () => {
    expect(buildSpecHtml(sampleProject, starterSpec()).match(/#[0-9a-f]{3,6}\b/gi)!.every((c) => /^#000$/i.test(c))).toBe(true);
  });

  it('a value the project lacks prints as DATA REQUIRED, and the first page lists each one with its clauses', () => {
    const html = buildSpecHtml(bare, doc);
    expect(html).toContain('<span class="req">DATA REQUIRED: Busbar material</span>');
    expect(missingList(specView(doc, bare))).toEqual([{ label: 'Busbar material', clauses: ['2.1', '2.2'] }, { label: 'Degree of protection', clauses: ['2.1'] }]);
    expect(html).toContain('the project has no value for: Busbar material (2.1, 2.2); Degree of protection (2.1).');
    expect(buildSpecHtml(sampleProject, { ...doc, sections: [doc.sections[0]] })).not.toContain('class="missing"');
  });

  it('plain text: a number, a tab and the text on each line', () => {
    expect(specPlainText(sampleProject, doc).split('\n').slice(0, 4)).toEqual(['1\tGeneral <scope>', '1.1\tScope', `1.1.1\tFor ${sampleProject.name} at ${sampleProject.voltageV} V.`, '\tA note.']);
  });

  it('is in the Export centre once a specification is written', () => {
    const entry = CATALOGUE.find((e) => e.key === 'specification')!;
    const ctx = (project: Project) => ({ project }) as Parameters<typeof unavailable>[1];
    expect(unavailable(entry, ctx(sampleProject))).toBe('No specification written yet (Specification page)');
    expect(unavailable(entry, ctx({ ...sampleProject, spec: doc }))).toBeUndefined();
    const part = entry.build(ctx({ ...sampleProject, spec: doc }))[0];
    expect(part.title).toBe('Specification');
    expect(part.html).toContain('<h2>2 Switchboards</h2>');
    expect(part.page).toEqual({ pageSize: 'A4', landscape: false, cssPages: true, selfNumbered: true });
    expect(entry.build(ctx({ ...sampleProject, spec: withSetup(doc, { paper: 'A3' }) }))[0].page).toMatchObject({ pageSize: 'A3 portrait' });
  });
});

describe('specification — document information and page setup in the PDF', () => {
  const PNG = 'data:image/png;base64,iVBORw0KGgo=';
  it('prints on the default paper with the project, the title, the revision and page numbers in the margins', () => {
    const html = buildSpecHtml({ ...sampleProject, name: 'Tower "A"', info: undefined, drawing: undefined }, doc);
    expect(html).toContain('@page { size: A4 portrait; margin: 22mm 16mm 20mm 18mm;');
    expect(html).toContain('@top-left { content: "Tower \\"A\\"";');
    expect(html).toContain('@top-right { content: "Electrical specification";');
    expect(html).toContain('@bottom-right { content: "Page " counter(page) " of " counter(pages);');
    expect(html).toContain('@top-center { content: "";');
    expect(html).not.toContain('class="wm"');
    expect(html).not.toContain('class="info"');
  });

  it('follows the page setup: paper, margins, footer text, the logo in its place and the watermark', () => {
    let d = withInfo(doc, { number: 'E-001', status: 'For tender', mepContractor: 'MEP <Co>' });
    d = addDetail(addDetail(d, 'Plot number', '373'), 'Not filled');
    d = withSetup(d, { paper: 'A3', landscape: true, marginsMm: { top: 30, right: 20, bottom: 25, left: 20 }, footer: ['{{doc.number}} · {{doc.status}}', '', '{{page}}'], logo: PNG, logoPlace: 'header-right', watermark: 'DRAFT <1>' });
    const html = buildSpecHtml(sampleProject, d);
    expect(html).toContain('@page { size: A3 landscape; margin: 30mm 20mm 25mm 20mm;');
    expect(html).toContain('@bottom-left { content: "E-001 · For tender";');
    expect(html).toContain('@bottom-right { content: counter(page);');
    expect(html).toContain(`@top-right { content: ""; width: 45mm; background: url("${PNG}")`);
    expect(html).toContain('<div class="wm"><span>DRAFT &lt;1&gt;</span></div>');
    expect(html).toContain('<tr><td>Document number</td><td>E-001</td></tr><tr><td>Document status</td><td>For tender</td></tr>');
    expect(html).toContain('<tr><td>MEP contractor</td><td>MEP &lt;Co&gt;</td></tr><tr><td>Plot number</td><td>373</td></tr></table>');
    expect(html).not.toContain('Not filled');
    expect(html.match(/#[0-9a-f]{3,6}\b/gi)!.every((c) => /^#000$/i.test(c))).toBe(true);
  });

  it('a logo that is not a plain picture is left out', () => {
    expect(buildSpecHtml(sampleProject, withSetup(doc, { logo: 'javascript:alert(1)', logoPlace: 'header-left' }))).not.toContain('javascript');
  });
});

describe('specification — Word file', () => {
  it('carries the page setup: paper and margins, the header and footer slots with page numbers, and the watermark', async () => {
    const JSZip = (await import('jszip')).default;
    let d = withInfo(starterSpec(), { number: 'E-001' });
    d = withSetup(d, { paper: 'A3', marginsMm: { top: 30, right: 20, bottom: 25, left: 20 }, footer: ['{{doc.number}}', '', 'Page {{page}} of {{pages}}'], watermark: 'DRAFT & "CHECK"' });
    const zip = await JSZip.loadAsync(await Packer.toBuffer(buildSpecDocx(sampleProject, d)));
    const [body, header, footer] = await Promise.all(['word/document.xml', 'word/header1.xml', 'word/footer1.xml'].map((f) => zip.file(f)!.async('string')));
    expect(body).toMatch(/<w:pgSz w:w="16838" w:h="23811" w:orient="portrait"\/>/);
    expect(body).toMatch(/<w:pgMar w:top="1701" w:right="1134" w:bottom="1417" w:left="1134"/);
    expect(body).toContain('Document number');
    expect(header).toContain(sampleProject.name.replace(/&/g, '&amp;'));
    expect(header).toContain('string="DRAFT &amp; &quot;CHECK&quot;"');
    expect(footer).toContain('E-001');
    expect(footer).toMatch(/PAGE[\s\S]*NUMPAGES/);
    const plain = await JSZip.loadAsync(await Packer.toBuffer(buildSpecDocx(sampleProject, starterSpec())));
    expect(await plain.file('word/header1.xml')!.async('string')).not.toContain('v:textpath');
  });

  it('packs to a .docx', async () => {
    const buf = await Packer.toBuffer(buildSpecDocx(bare, starterSpec()));
    expect(buf.subarray(0, 2).toString()).toBe('PK');
    expect(buf.length).toBeGreaterThan(4000);
  });
});
