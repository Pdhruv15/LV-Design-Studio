// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { sampleProject } from '../../data/sampleProject';
import { DEFAULT_TYPES, newAssessment, type LoadAssessment } from '../../calc/loadAssessment';
import type { Project } from '../../types';
import LoadAssessmentView from './LoadAssessmentView';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.setConfig({ testTimeout: 30000 });

let host: HTMLDivElement;
let root: Root;
beforeEach(() => { host = document.createElement('div'); document.body.append(host); });
afterEach(() => { act(() => root?.unmount()); host.remove(); });
const text = () => document.body.textContent ?? '';
async function until(what: string, isTrue: () => boolean) {
  const giveUp = Date.now() + 20000;
  while (!isTrue()) {
    if (Date.now() > giveUp) throw new Error(`Still waiting for ${what}. On screen: ${text()}`);
    await act(async () => { await new Promise((r) => { setTimeout(r, 20); }); });
  }
}

const base = newAssessment(DEFAULT_TYPES[0], { gfaM2: 1000, floors: 3, parkingM2: 0 }, { types: [] });
const a: LoadAssessment = { ...base, areaMode: 'm2', rows: [
  { id: 'fnb', label: 'F&B — indoor seating', ltg: 12, pwr: 60, clg: 200, areaM2: 1000 },
  { id: 'fnb', label: 'F&B — outdoor seating', ltg: 6, pwr: 15, clg: 200, areaM2: 250, location: 'oc' }
] };

describe('Load assessment: where a space is', () => {
  it('closes the cooling cell of an outdoor space and keeps it out of the total', async () => {
    const onChange = vi.fn();
    const project: Project = { ...sampleProject, building: undefined, loadAssessment: a };
    await act(async () => { root = createRoot(host); root.render(<LoadAssessmentView project={project} onChange={onChange} onStatus={() => {}} />); });
    await until('the area schedule', () => text().includes('F&B') || !!document.querySelector('select[aria-label="Location"]'));
    const rows = [...document.querySelectorAll('table.la-table tbody tr')].filter((tr) => tr.querySelector('select[aria-label="Location"]'));
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).not.toContain('none');
    expect(rows[1].textContent).toContain('none');
    expect(text()).toContain('+ 250.00 outdoor');
    // Moving the first row outdoors is one change of the assessment.
    const sel = rows[0].querySelector<HTMLSelectElement>('select[aria-label="Location"]')!;
    await act(async () => { sel.value = 'oo'; sel.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect((onChange.mock.calls[0][0] as Project).loadAssessment!.rows[0].location).toBe('oo');
  });

  it('switches the A/C figures to the electrical load, converting them', async () => {
    const onChange = vi.fn();
    const project: Project = { ...sampleProject, building: undefined, loadAssessment: a };
    await act(async () => { root = createRoot(host); root.render(<LoadAssessmentView project={project} onChange={onChange} onStatus={() => {}} />); });
    await until('the A/C switch', () => text().includes('Electrical load'));
    expect(text()).toContain('Cooling W/m²');
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent === 'Electrical load')!;
    await act(async () => b.click());
    const next = (onChange.mock.calls[0][0] as Project).loadAssessment!;
    // 200 W/m² thermal × the VRF factor 0.3.
    expect(next).toMatchObject({ acBasis: 'electrical', rows: [{ clg: 60 }, { clg: 60 }] });
    act(() => root.unmount());
    await act(async () => { root = createRoot(host); root.render(<LoadAssessmentView project={{ ...project, loadAssessment: next }} onChange={onChange} onStatus={() => {}} />); });
    await until('the A/C heading', () => text().includes('A/C W/m²'));
    expect(text()).toContain('the system factor is not applied');
  });
});
