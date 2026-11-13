// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SpecPage from './SpecPage';
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
    for (const label of ['Export Word', 'Paste', 'Bold', 'Find and replace', 'Bullets']) expect(tool(label).disabled).toBe(true);
    expect(tool('Export Word').title).toBe('Comes in a later stage');
    expect([...document.querySelectorAll<HTMLButtonElement>('.prb-tab')].filter((t) => t.disabled).map((t) => t.textContent)).toEqual(['Specification', 'Insert', 'Review']);
    expect(document.querySelector<HTMLSelectElement>('select[aria-label="Insert field"]')!.disabled).toBe(true);
  });
});
