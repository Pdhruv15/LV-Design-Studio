import { describe, expect, it } from 'vitest';
import { sampleProject } from '../data/sampleProject';
import type { Project } from '../types';
import { addClause, addSection, fieldKeys, lineText, moveClause, moveSection, removeClause, removeSection, specFields, specView, starterSpec, withClause, withSectionIncluded, withSectionTitle, type SpecDoc } from './specDoc';
import { mainBoards } from './transformers';

const field = (p: Project, key: string) => specFields(p).find((f) => f.key === key)!;
const doc: SpecDoc = { title: 'Spec', sections: [
  { id: 'S1', title: 'General', included: true, clauses: [{ id: 'C1', kind: 'clause', text: 'For {{project.name}}.' }, { id: 'C2', kind: 'note', text: 'A note.' }] },
  { id: 'S2', title: 'Fire alarm', included: false, clauses: [{ id: 'C3', kind: 'clause', text: 'Not included.' }] },
  { id: 'S3', title: 'LV switchboards', included: true, clauses: [
    { id: 'C4', kind: 'heading', text: 'Ratings' }, { id: 'C5', kind: 'clause', text: 'Rated {{main.rated}} at {{ project.voltage }}.' }, { id: 'C6', kind: 'clause', text: 'Busbars: {{main.busbar}}; cubicle colour {{office.colour}}.' },
    { id: 'C7', kind: 'heading', text: 'Testing' }, { id: 'C8', kind: 'clause', text: 'Tested.' }] }
] };

describe('specification — fields from the project', () => {
  it('takes its values from the design, with units', () => {
    const main = mainBoards(sampleProject)[0];
    expect(field(sampleProject, 'project.name').value).toBe(sampleProject.name);
    expect(field(sampleProject, 'project.voltage').value).toBe(`${sampleProject.voltageV} V`);
    expect(field(sampleProject, 'main.id').value).toBe(main.id);
    expect(field(sampleProject, 'main.rated').value).toBe(`${main.ratedCurrentA!.toLocaleString('en-US')} A`);
    expect(field(sampleProject, 'boards.count').value).toBe(String(sampleProject.boards.length));
  });

  it('a value the project does not have is left out, never guessed', () => {
    const p: Project = { ...sampleProject, boards: sampleProject.boards.map((b) => ({ ...b, busbarMaterial: undefined, ipRating: ' ' })), lightning: undefined, earthingPlan: undefined };
    for (const k of ['main.busbar', 'main.ip', 'lightning.class', 'lightning.method', 'earthing.system', 'earthing.conductor']) expect(field(p, k).value).toBeUndefined();
    expect(field({ ...sampleProject, boards: [], feeders: [] }, 'main.id').value).toBeUndefined();
  });

  it('follows the lightning protection study and the earthing schematic', () => {
    const p: Project = { ...sampleProject, earthingPlan: { conductorMm2: 95 }, lightning: { lengthM: 40, widthM: 25, heightM: 18, method: 'ese', lpsClass: 'II' } };
    expect(field(p, 'lightning.class').value).toBe('Class II');
    expect(field(p, 'lightning.method').value).toBe('ESE air terminal');
    expect(field(p, 'earthing.conductor').value).toBe('95 mm²');
    expect(field({ ...p, earthingPlan: {} }, 'earthing.conductor').value).toBe('70 mm²');
    expect(field(p, 'earthing.system').value).toBeTruthy();
  });

  it('every field has a key of its own, a label and a group', () => {
    const fs = specFields(sampleProject);
    expect(new Set(fs.map((f) => f.key)).size).toBe(fs.length);
    expect(fs.every((f) => f.label && f.group)).toBe(true);
  });
});

describe('specification — numbering and filling', () => {
  it('numbers the included sections, their headings and clauses; notes have no number', () => {
    const v = specView(doc, sampleProject);
    expect(v.blocks.map((b) => [b.no, b.title])).toEqual([['1', 'General'], ['2', 'LV switchboards']]);
    expect(v.blocks[0].lines.map((l) => l.no)).toEqual(['1.1', '']);
    expect(v.blocks[1].lines.map((l) => l.no)).toEqual(['2.1', '2.1.1', '2.1.2', '2.2', '2.2.1']);
  });

  it('including a section renumbers the ones after it', () => {
    const v = specView(withSectionIncluded(doc, 'S2', true), sampleProject);
    expect(v.blocks.map((b) => b.no + ' ' + b.title)).toEqual(['1 General', '2 Fire alarm', '3 LV switchboards']);
    expect(v.blocks[2].lines[1].no).toBe('3.1.1');
  });

  it('fills the fields from the project and lists the ones with no value', () => {
    const p: Project = { ...sampleProject, boards: sampleProject.boards.map((b) => ({ ...b, busbarMaterial: undefined })) };
    const v = specView(doc, p);
    expect(lineText(v.blocks[0].lines[0])).toBe(`For ${p.name}.`);
    expect(lineText(v.blocks[1].lines[1])).toBe(`Rated ${field(p, 'main.rated').value} at ${p.voltageV} V.`);
    expect(lineText(v.blocks[1].lines[2])).toBe('Busbars: DATA REQUIRED: Busbar material; cubicle colour DATA REQUIRED: office.colour.');
    expect(v.missing).toEqual([
      { sectionNo: '2', clauseNo: '2.1.2', key: 'main.busbar', label: 'Busbar material' },
      { sectionNo: '2', clauseNo: '2.1.2', key: 'office.colour', label: 'office.colour' }
    ]);
    expect(v.blocks[1].lines[1].runs).toEqual([{ text: 'Rated ' }, { field: 'main.rated', label: 'Rated current', value: field(p, 'main.rated').value }, { text: ' at ' }, { field: 'project.voltage', label: 'System voltage', value: `${p.voltageV} V` }, { text: '.' }]);
  });

  it('a section that is not included is not checked for missing data', () => {
    const d = addClause(doc, 'S2', 'clause', 'Colour {{office.colour}}.');
    expect(specView(d, sampleProject).missing.filter((m) => m.key === 'office.colour').length).toBe(1);
  });

  it('finds the fields a text uses', () => {
    expect(fieldKeys('{{a.b}} and {{ c-d }} but not {single} or {{ }}')).toEqual(['a.b', 'c-d']);
  });
});

describe('specification — editing', () => {
  it('adds a clause after another or at the end, with an id of its own', () => {
    const d = addClause(addClause(doc, 'S3', 'clause', 'After ratings.', 'C5'), 'S3', 'note', 'Last.');
    const s = d.sections[2].clauses;
    expect(s.map((c) => c.text)).toEqual(['Ratings', 'Rated {{main.rated}} at {{ project.voltage }}.', 'After ratings.', 'Busbars: {{main.busbar}}; cubicle colour {{office.colour}}.', 'Testing', 'Tested.', 'Last.']);
    const ids = d.sections.flatMap((x) => [x.id, ...x.clauses.map((c) => c.id)]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('changes, moves and removes a clause', () => {
    expect(withClause(doc, 'S1', 'C1', { text: 'New.' }).sections[0].clauses[0]).toEqual({ id: 'C1', kind: 'clause', text: 'New.' });
    expect(withClause(doc, 'S1', 'C2', { kind: 'clause' }).sections[0].clauses[1].kind).toBe('clause');
    expect(moveClause(doc, 'S3', 'C5', 1).sections[2].clauses.map((c) => c.id)).toEqual(['C4', 'C6', 'C5', 'C7', 'C8']);
    expect(moveClause(doc, 'S3', 'C4', -1)).toEqual(doc);
    expect(removeClause(doc, 'S3', 'C7').sections[2].clauses.map((c) => c.id)).toEqual(['C4', 'C5', 'C6', 'C8']);
  });

  it('adds, renames, moves and removes a section', () => {
    const d = addSection(doc, ' Generators ');
    expect(d.sections[3]).toMatchObject({ title: 'Generators', included: true, clauses: [] });
    expect(addSection(doc, ' ')).toBe(doc);
    expect(withSectionTitle(doc, 'S1', 'General requirements').sections[0].title).toBe('General requirements');
    expect(withSectionTitle(doc, 'S1', ' ')).toBe(doc);
    expect(moveSection(doc, 'S3', -1).sections.map((s) => s.id)).toEqual(['S1', 'S3', 'S2']);
    expect(moveSection(doc, 'S3', 1)).toBe(doc);
    expect(removeSection(doc, 'S2').sections.map((s) => s.id)).toEqual(['S1', 'S3']);
  });

  it('edits never change the document they were given', () => {
    const before = JSON.stringify(doc);
    addClause(doc, 'S1', 'clause', 'x'); withClause(doc, 'S1', 'C1', { text: 'y' }); removeClause(doc, 'S1', 'C1'); moveSection(doc, 'S1', 1); withSectionIncluded(doc, 'S2', true);
    expect(JSON.stringify(doc)).toBe(before);
  });
});

describe('specification — the starter', () => {
  const s = starterSpec();
  it('has ten sections, electrical ones included and the ELV ones ready to tick', () => {
    expect(s.sections.map((x) => x.title)).toEqual(['General requirements', 'LV switchboards', 'Distribution boards', 'Cables and wiring', 'Cable containment', 'Earthing and lightning protection',
      'Lighting and emergency lighting', 'Fire alarm', 'CCTV and access control', 'Structured cabling']);
    expect(s.sections.filter((x) => !x.included).map((x) => x.title)).toEqual(['Fire alarm', 'CCTV and access control', 'Structured cabling']);
  });

  it('uses only fields the app has, and ids of its own', () => {
    const known = new Set(specFields(sampleProject).map((f) => f.key));
    const used = s.sections.flatMap((x) => x.clauses.flatMap((c) => fieldKeys(c.text)));
    expect(used.length).toBeGreaterThan(8);
    expect(used.filter((k) => !known.has(k))).toEqual([]);
    const ids = s.sections.flatMap((x) => [x.id, ...x.clauses.map((c) => c.id)]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('shows for the sample project with every clause numbered', () => {
    const v = specView(s, sampleProject);
    expect(v.blocks.length).toBe(7);
    expect(v.blocks.every((b) => b.lines.every((l) => l.kind === 'note' || l.no.startsWith(`${b.no}.`)))).toBe(true);
    expect(lineText(v.blocks[0].lines[1])).toContain(sampleProject.name);
  });

  it('names no standard: the wording is plain text to edit', () => {
    const all = s.sections.flatMap((x) => x.clauses.map((c) => c.text)).join(' ');
    expect(all).not.toMatch(/\b(IEC|BS|EN|NFPA|IEEE|DEWA)\b/);
  });
});
