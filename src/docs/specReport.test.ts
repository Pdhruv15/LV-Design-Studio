import { Packer } from 'docx';
import { describe, expect, it } from 'vitest';
import { sampleProject } from '../data/sampleProject';
import { specView, starterSpec, type SpecDoc } from '../model/specDoc';
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
  });
});

describe('specification — Word file', () => {
  it('packs to a .docx', async () => {
    const buf = await Packer.toBuffer(buildSpecDocx(bare, starterSpec()));
    expect(buf.subarray(0, 2).toString()).toBe('PK');
    expect(buf.length).toBeGreaterThan(4000);
  });
});
