// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SpecPage from './SpecPage';

const saved: { name: string; bytes?: Uint8Array; html?: string }[] = [];
vi.mock('../../util/files', async (orig) => ({
  ...(await orig<typeof import('../../util/files')>()),
  saveBinary: async (name: string, bytes: Uint8Array) => { saved.push({ name, bytes }); return `Saved ${name}`; },
  savePdf: async (name: string, html: string) => { saved.push({ name, html }); return `Saved ${name}`; }
}));
import { sampleProject } from '../../data/sampleProject';
import { starterSpec } from '../../model/specDoc';
import type { Project } from '../../types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root, host: HTMLDivElement, last: Project, changes: number;
const status: string[] = [];
const undo = vi.fn();
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); changes = 0; status.length = 0; undo.mockClear(); });
afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ''; });

const render = (p: Project) => { last = p; act(() => root.render(<SpecPage project={p} onChange={(x) => { changes++; render(x); }} onStatus={(m) => status.push(m)} onUndo={undo} />)); };
const tool = (label: string) => [...document.querySelectorAll<HTMLButtonElement>('.prb button')].find((b) => (b.getAttribute('aria-label') ?? b.textContent) === label)!;
const press = (label: string) => act(() => tool(label).click());
const tabTo = (name: string) => act(() => [...document.querySelectorAll<HTMLButtonElement>('.prb-tab')].find((t) => t.textContent === name)!.click());
const sectionButton = (title: string) => [...document.querySelectorAll<HTMLButtonElement>('.spx-sec button')].find((b) => b.textContent?.endsWith(title))!;
const lines = () => [...document.querySelectorAll<HTMLDivElement>('.spx-line')];
const paper = () => document.querySelector('.spx-paper')!.textContent ?? '';
const edit = (text: string) => { const ta = document.querySelector<HTMLTextAreaElement>('.spx-line textarea')!; act(() => { ta.value = text; ta.setSelectionRange(text.length, text.length); ta.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); }); };
const spec = () => last.spec!;

describe('Specification page', () => {
  it('opens on the starter wording with the first section, filled from the project, and saves nothing yet', () => {
    render(sampleProject);
    expect(paper()).toContain('1 General requirements');
    expect(paper()).toContain(`electrical installation for ${sampleProject.name}`);
    expect(lines()[0].textContent).toBe('1.1Scope');
    expect(lines()[1].textContent!.startsWith('1.1.1')).toBe(true);
    expect(document.querySelectorAll('.spx-sec').length).toBe(10);
    expect(changes).toBe(0);
  });

  it('a value from the project is shaded; one the project lacks is DATA REQUIRED and counted', () => {
    const p: Project = { ...sampleProject, boards: sampleProject.boards.map((b) => ({ ...b, busbarMaterial: undefined, ipRating: undefined, busbarIcwKa: undefined })), lightning: undefined, earthingPlan: undefined };
    render(p);
    act(() => sectionButton('LV switchboards').click());
    expect(document.querySelectorAll('.spx-paper .spx-f').length).toBeGreaterThan(2);
    expect([...document.querySelectorAll('.spx-paper .spx-m')].map((m) => m.textContent)).toEqual(['DATA REQUIRED: Short-time withstand (1 s)', 'DATA REQUIRED: Degree of protection', 'DATA REQUIRED: Busbar material']);
    expect(document.querySelector('.spx-strip .bad')!.textContent).toContain('missing');
    expect([...document.querySelectorAll('.spx-field .bad')].length).toBe(3);
  });

  it('ticking a section includes it and renumbers the list', () => {
    render(sampleProject);
    expect(sectionButton('Structured cabling').textContent).toBe('–Structured cabling');
    act(() => document.querySelector<HTMLInputElement>('input[aria-label="Include Fire alarm"]')!.click());
    expect(spec().sections.find((s) => s.title === 'Fire alarm')!.included).toBe(true);
    expect(sectionButton('Fire alarm').textContent).toBe('8Fire alarm');
    expect(document.querySelector('.spx-strip')!.textContent).toContain('8 of 10 sections included');
  });

  it('a section that is not included can still be read and edited, and says so', () => {
    render(sampleProject);
    act(() => sectionButton('Fire alarm').click());
    expect(paper()).toContain('This section is not included in the specification');
    expect(lines().length).toBe(1);
  });

  it('click a clause to edit its wording; the field stays a field', () => {
    render(sampleProject);
    act(() => lines()[1].click());
    const ta = document.querySelector<HTMLTextAreaElement>('.spx-line textarea')!;
    expect(ta.value).toContain('{{project.name}}');
    edit('This document covers the electrical works for {{project.name}}.');
    expect(spec().sections[0].clauses[1].text).toBe('This document covers the electrical works for {{project.name}}.');
    expect(changes).toBe(1);
    act(() => lines()[2].click());
    expect(lines()[1].textContent).toBe(`1.1.1This document covers the electrical works for ${sampleProject.name}.`);
    expect(changes).toBe(1);
  });

  it('Insert field puts a project value where the cursor was', () => {
    render(sampleProject);
    act(() => lines()[1].click());
    const ta = document.querySelector<HTMLTextAreaElement>('.spx-line textarea')!;
    // Going to the ribbon takes the cursor out of the clause: where it was is remembered.
    act(() => { ta.value = 'Supply: .'; ta.setSelectionRange(8, 8); ta.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
    const select = document.querySelector<HTMLSelectElement>('select[aria-label="Insert field"]')!;
    act(() => { select.value = 'project.voltage'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(spec().sections[0].clauses[1].text).toBe('Supply: {{project.voltage}}.');
    expect(select.querySelector('option[value="project.voltage"]')!.textContent).toBe(`System voltage — ${sampleProject.voltageV} V`);
  });

  it('Home tools: add a clause after the one selected, change its style, move it and delete it', () => {
    render(sampleProject);
    act(() => lines()[1].click());
    press('Add clause');
    expect(spec().sections[0].clauses[2].text).toBe('New clause.');
    expect(lines()[2].className).toContain('sel');
    press('Note');
    expect(spec().sections[0].clauses[2].kind).toBe('note');
    expect(tool('Note').getAttribute('aria-pressed')).toBe('true');
    press('Move up');
    expect(spec().sections[0].clauses[1].kind).toBe('note');
    press('Delete clause');
    expect(spec().sections[0].clauses.map((c) => c.text)).toEqual(starterSpec().sections[0].clauses.map((c) => c.text));
    expect(tool('Delete clause').disabled).toBe(true);
    press('Undo');
    expect(undo).toHaveBeenCalledTimes(1);
  });

  it('File tools: add, rename, move and delete a section; back to the starter wording', () => {
    render(sampleProject);
    tabTo('File');
    press('Add section');
    const input = document.querySelector<HTMLInputElement>('input[aria-label="Section title"]')!;
    act(() => { input.value = 'Standby generator'; input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    expect(spec().sections.map((s) => s.title)[10]).toBe('Standby generator');
    expect(paper()).toContain('No clauses yet');
    press('Move section up');
    expect(spec().sections.map((s) => s.title)[9]).toBe('Standby generator');
    press('Delete section');
    expect(spec().sections.length).toBe(10);
    press('Starter wording');
    expect(spec()).toEqual(starterSpec());
    expect(status[0]).toContain('starter wording is back');
  });

  it('tools of later stages are greyed and say so', () => {
    render(sampleProject);
    for (const label of ['Paste', 'Bold', 'Find and replace', 'Bullets']) expect(tool(label).disabled).toBe(true);
    expect(tool('Paste').title).toBe('Comes in a later stage');
    expect([...document.querySelectorAll<HTMLButtonElement>('.prb-tab')].filter((t) => t.disabled).map((t) => t.textContent)).toEqual(['Insert', 'Review']);
    expect(document.querySelector<HTMLSelectElement>('select[aria-label="Insert field"]')!.disabled).toBe(true);
  });

  it('exports the specification to Word and to PDF, and says when values in it are DATA REQUIRED', async () => {
    saved.length = 0;
    render({ ...sampleProject, boards: sampleProject.boards.map((b) => ({ ...b, busbarMaterial: undefined })) });
    await act(async () => { tool('Export Word').click(); await vi.waitFor(() => expect(saved.length).toBe(1)); });
    expect(saved[0].name).toMatch(/Electrical-specification\.docx$/);
    expect(new TextDecoder().decode(saved[0].bytes!.subarray(0, 2))).toBe('PK');
    await vi.waitFor(() => expect(status.some((m) => m.includes('DATA REQUIRED'))).toBe(true));
    tabTo('File');
    await act(async () => { tool('Export PDF').click(); await vi.waitFor(() => expect(saved.length).toBe(2)); });
    expect(saved[1].name).toMatch(/Electrical-specification\.pdf$/);
    expect(saved[1].html).toContain('<h2>2 LV switchboards</h2>');
    expect(saved[1].html).toContain('DATA REQUIRED: Busbar material');
  });

  it('with no section included there is nothing to export', () => {
    const none = { ...starterSpec(), sections: starterSpec().sections.map((x) => ({ ...x, included: false })) };
    render({ ...sampleProject, spec: none });
    expect(tool('Export Word').disabled).toBe(true);
  });

  describe('Specification tab: document information and page setup', () => {
    const box = (label: string) => document.querySelector<HTMLInputElement>(`.spx-setup [aria-label="${label}"]`)!;
    const type = (label: string, v: string) => act(() => { const el = box(label); el.value = v; el.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
    const choose = (label: string, v: string) => act(() => { const el = document.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!; el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); });

    it('sets the number, status and a party; a blank party shows what the project has', () => {
      render({ ...sampleProject, info: { ...sampleProject.info, owner: 'Owner Co' } });
      tabTo('Specification');
      expect(box('Client').placeholder).toBe('From the project: Owner Co');
      type('Document number', 'E-001'); type('Status', 'For tender'); type('Main contractor', 'Build Co');
      expect(spec().info).toEqual({ number: 'E-001', status: 'For tender', mainContractor: 'Build Co' });
      expect(document.querySelector('.spx-strip')!.textContent).toContain('E-001 · For tender');
      expect(changes).toBe(3);
    });

    it('adds a detail, uses it in a clause, and says so when a detail in use is removed', () => {
      render(sampleProject);
      tabTo('Specification');
      press('Add detail');
      type('Detail D1 name', 'Plot number'); type('Detail D1 value', '373-1245');
      expect(spec().info!.details).toEqual([{ id: 'D1', name: 'Plot number', value: '373-1245' }]);
      tabTo('Home');
      act(() => lines()[1].click());
      act(() => { const sel = document.querySelector<HTMLSelectElement>('select[aria-label="Insert field"]')!; sel.value = 'detail.D1'; sel.dispatchEvent(new Event('change', { bubbles: true })); });
      act(() => lines()[0].click());
      expect(paper()).toContain('373-1245');
      tabTo('Specification');
      act(() => document.querySelector<HTMLButtonElement>('button[aria-label="Remove detail Plot number"]')!.click());
      expect(spec().info!.details).toEqual([]);
      expect(status[status.length - 1]).toContain('1 clause used it');
    });

    it('sets paper, margins, a footer slot, the logo position and the watermark; the preview and the PDF follow', async () => {
      saved.length = 0;
      render(sampleProject);
      tabTo('Specification');
      choose('Paper', 'A3'); choose('Orientation', 'landscape');
      type('Margin top', '30'); type('Margin left', '500');
      type('Footer left', '{{doc.title}} — {{page}}/{{pages}}'); type('Watermark', 'DRAFT');
      expect(spec().setup).toMatchObject({ paper: 'A3', landscape: true, watermark: 'DRAFT' });
      expect(spec().setup!.marginsMm).toMatchObject({ top: 30, left: 60 });
      expect(document.querySelector('.spx-foot')!.textContent).toContain('Electrical specification — 1/1');
      expect(document.querySelector('.spx-strip')!.textContent).toContain('A3 landscape · watermark DRAFT');
      await act(async () => { tool('Export PDF').click(); await vi.waitFor(() => expect(saved.length).toBe(1)); });
      expect(saved[0].html).toContain('size: A3 landscape; margin: 30mm');
      expect(saved[0].html).toContain('<div class="wm"><span>DRAFT</span></div>');
      press('Default page setup');
      expect(spec().setup).toBeUndefined();
    });

    it('the header on the page follows the header slots', () => {
      render({ ...sampleProject, spec: { ...starterSpec(), setup: { header: ['{{doc.number}}', 'Tender issue', ''] }, info: { number: 'E-9' } } });
      expect(document.querySelector('.spx-head')!.textContent).toBe('E-9Tender issue');
    });
  });
});
