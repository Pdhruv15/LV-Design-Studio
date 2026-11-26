// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ScSketchPage from './ScSketchPage';
import { sampleProject } from '../../data/sampleProject';
import type { Project } from '../../types';

vi.mock('../ConfirmDialog', () => ({ ask: vi.fn(async () => true), askText: vi.fn(async () => 'Sketch A') }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root, host: HTMLDivElement, project: Project;
beforeEach(() => {
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
  project = { ...sampleProject, scSketches: undefined };
  render();
});
afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ''; });

function render() { act(() => root.render(<ScSketchPage project={project} onChange={(p) => { project = p; render(); }} onStatus={() => {}} />)); }
const button = (text: string) => [...document.querySelectorAll('button')].find((b) => b.textContent === text) as HTMLButtonElement;
const click = (text: string) => act(() => { button(text).click(); });
const pick = (id: string) => act(() => { document.querySelector(`[data-lv-id="${id}"]`)!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
const field = (label: string) => [...document.querySelectorAll('label.nf')].find((l) => l.querySelector('span')?.textContent === label)!.querySelector('input')!;
const enter = (el: HTMLInputElement, value: string) => act(() => { el.value = value; el.focus(); el.blur(); });
const rows = () => [...document.querySelectorAll('table.schedule tbody tr')].map((r) => [...r.querySelectorAll('td')].map((c) => c.textContent));

describe('Short circuit sketch page', () => {
  it('starts with only Source enabled', () => {
    expect(button('Source').disabled).toBe(false);
    for (const t of ['Transformer', 'Cable', 'Generator', 'Motors', 'Fault point']) expect(button(t).disabled).toBe(true);
    expect(button('Send to SLD').disabled).toBe(true);
  });

  it('Source, Transformer and Fault point give a result row with a kA value', () => {
    click('Source');
    expect(project.scSketches).toHaveLength(1);
    pick('bus:B1'); click('Transformer');
    pick('bus:B2'); click('Fault point');
    expect(rows()).toHaveLength(1);
    const [point, place, kv, , , ik] = rows()[0];
    expect(point).toBe('F1'); expect(place).toBe('Bus B2'); expect(kv).toBe('0.42'); expect(+ik!).toBeGreaterThan(10);
    expect(document.querySelector('[data-testid="sc-drawing"]')!.textContent).toContain('kA');
    expect(document.querySelector('[data-testid="sc-drawing"]')!.textContent).toContain('TX-1 1,000 kVA');
  });

  it('editing the transformer rating changes the result', () => {
    click('Source'); pick('bus:B1'); click('Transformer'); pick('bus:B2'); click('Fault point');
    const before = +rows()[0][5]!;
    pick('transformer:T1');
    enter(field('Rating'), '2000');
    expect(project.scSketches![0].transformers[0].kva).toBe(2000);
    expect(+rows()[0][5]!).toBeGreaterThan(before);
  });

  it('deleting a bus removes what hangs below it, and its fault point', async () => {
    click('Source'); pick('bus:B1'); click('Transformer'); pick('bus:B2'); click('Fault point');
    pick('bus:B2');
    await act(async () => { button('Delete').click(); });
    const s = project.scSketches![0];
    expect(s.buses.map((b) => b.id)).toEqual(['B1']);
    expect(s.transformers).toEqual([]); expect(s.faultPoints).toEqual([]);
    expect(document.querySelector('table.schedule')).toBeNull();
  });

  it('a fault point on a cable takes its distance from the form', () => {
    click('Source'); pick('bus:B1'); click('Cable');
    pick('cable:C1'); click('Fault point');
    expect(project.scSketches![0].faultPoints[0]).toMatchObject({ cableId: 'C1', distanceM: 50 });
    const end = +rows()[0][5]!;
    enter(field('Distance from the start'), '10');
    expect(project.scSketches![0].faultPoints[0].distanceM).toBe(10);
    expect(+rows()[0][5]!).toBeGreaterThan(end);
  });

  it('renames and deletes a sketch through the header', async () => {
    click('Source');
    await act(async () => { button('Rename').click(); });
    expect(project.scSketches![0].name).toBe('Sketch A');
    await act(async () => { button('Delete sketch').click(); });
    expect(project.scSketches).toEqual([]);
  });
});
