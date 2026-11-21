// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { sampleProject } from '../../data/sampleProject';
import type { BuildingInfo, Project } from '../../types';
import BuildingView from './BuildingView';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.setConfig({ testTimeout: 30000 });

let host: HTMLDivElement;
let root: Root;
beforeEach(() => { localStorage.clear(); host = document.createElement('div'); document.body.append(host); });
afterEach(() => { act(() => root?.unmount()); host.remove(); localStorage.clear(); });
const text = () => document.body.textContent ?? '';
async function until(what: string, isTrue: () => boolean) {
  const giveUp = Date.now() + 20000;
  while (!isTrue()) {
    if (Date.now() > giveUp) throw new Error(`Still waiting for ${what}. On screen: ${text()}`);
    await act(async () => { await new Promise((r) => { setTimeout(r, 20); }); });
  }
}
const button = (label: string) => [...document.body.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === label);

const building: BuildingInfo = {
  buildings: [{ id: 'T', name: 'Tower A', levels: [{ id: 'T-G', name: 'Ground', kind: 'ground', heightM: 4.5, grossM2: 1200 }] }],
  rooms: [{ id: 'r1', buildingId: 'T', levelId: 'T-G', name: 'Toilets', type: 'toilet', areaM2: 40 }],
  roomTypes: [
    { id: 'toilet', label: 'Toilet / pantry', wPerM2: 30, demandFactor: 0.8 },
    { id: 'living', label: 'Flat — living / dining', wPerM2: 150, demandFactor: 0.7 },
    { id: 'lab', label: 'Laboratory', wPerM2: 200, demandFactor: 0.8 },
    { id: 'parking', label: 'Car park', wPerM2: 10, demandFactor: 0.9 }
  ]
};

describe('Building: the assessment space of a room type', () => {
  it('shows the space each room type counts as and sets another one', async () => {
    const onChange = vi.fn();
    const project: Project = { ...sampleProject, building, loadAssessment: undefined };
    await act(async () => { root = createRoot(host); root.render(<BuildingView project={project} onChange={onChange} onStatus={() => {}} />); });
    await until('the Room types button', () => !!button('Room types'));
    await act(async () => button('Room types')!.click());
    await until('the Assessment space column', () => text().includes('Assessment space'));
    // By name: a toilet is back of house, a flat room is part of the apartment, a car park has its own line.
    expect(text()).toContain('Back of house: 7 / 25 / 90');
    expect(text()).toContain('Apartment: 8 / 35 / 110 · dwelling');
    expect(text()).toContain('no space: a row of its own');
    expect(text()).toContain('car park: lighting and fans');
    const sel = document.querySelector<HTMLSelectElement>('select[aria-label="Assessment space of Laboratory"]')!;
    expect([...sel.options].map((o) => o.textContent)).toEqual(expect.arrayContaining(['By name', 'Office', 'Basement car park']));
    await act(async () => { sel.value = 'office'; sel.dispatchEvent(new Event('change', { bubbles: true })); });
    const next = (onChange.mock.calls[0][0] as Project).building!.roomTypes!;
    expect(next.find((t) => t.id === 'lab')!.laSpace).toBe('office');
    expect(next.find((t) => t.id === 'toilet')!.laSpace).toBeUndefined();
  });
});
