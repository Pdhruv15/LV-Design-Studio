// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { sampleProject } from '../../data/sampleProject';
import { DEFAULT_TYPES, laSpaces, newAssessment, type LoadAssessment } from '../../calc/loadAssessment';
import type { BuildingInfo, Project } from '../../types';
import { AssessmentLine, LinkStrip } from './LoadAssessmentLink';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.setConfig({ testTimeout: 30000 });

let host: HTMLDivElement;
let root: Root;
beforeEach(() => { host = document.createElement('div'); document.body.append(host); });
afterEach(() => { act(() => root?.unmount()); host.remove(); });
const show = async (el: ReactElement) => { await act(async () => { root = createRoot(host); root.render(el); }); };
const text = () => document.body.textContent ?? '';
async function until(what: string, isTrue: () => boolean) {
  const giveUp = Date.now() + 20000;
  while (!isTrue()) {
    if (Date.now() > giveUp) throw new Error(`Still waiting for ${what}. On screen: ${text()}`);
    await act(async () => { await new Promise((r) => { setTimeout(r, 20); }); });
  }
}
const button = (label: string) => [...document.body.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === label);
const press = async (label: string) => { await until(`the “${label}” button`, () => !!button(label)); await act(async () => button(label)!.click()); };
const box = (name: string) => [...document.body.querySelectorAll('label')].find((l) => l.textContent?.includes(name))!.querySelector('input')!;


const building: BuildingInfo = {
  buildings: [
    { id: 'T', name: 'Tower A', levels: [
      { id: 'T-B', name: 'B1–B2', kind: 'basement', heightM: 3.5, grossM2: 4200, count: 2 },
      { id: 'T-G', name: 'Ground', kind: 'ground', heightM: 4.5, grossM2: 1200 },
      { id: 'T-T', name: 'Typical floors', kind: 'typical', heightM: 3.6, grossM2: 1150, count: 20, units: [{ unitTypeId: 'U2', count: 8 }] },
      { id: 'T-R', name: 'Roof', kind: 'roof', heightM: 3, grossM2: 1000 }
    ] },
    { id: 'P', name: 'Podium shops', levels: [{ id: 'P-G', name: 'Ground', kind: 'ground', heightM: 5, grossM2: 1200 }] }
  ],
  unitTypes: [{ id: 'U2', name: '2BR apartment', rooms: [{ name: 'Living', type: 'living', areaM2: 74 }, { name: 'Bedrooms', type: 'bedroom', areaM2: 44 }] }],
  rooms: [
    { id: 'r1', buildingId: 'T', levelId: 'T-T', name: 'Corridor', type: 'lobby', areaM2: 150 },
    { id: 'r2', buildingId: 'T', levelId: 'T-G', name: 'Lobby', type: 'lobby', areaM2: 300 },
    { id: 'r5', buildingId: 'P', levelId: 'P-G', name: 'Shops', type: 'retail', areaM2: 1100 }
  ]
};
const project: Project = { ...sampleProject, building };
const a = newAssessment(DEFAULT_TYPES[0], {}, { types: [] });
const spaces = laSpaces();

const strip = async (over: Partial<{ p: Project; a: LoadAssessment; onOpenBuilding: () => void }> = {}) => {
  const onChange = vi.fn(), onStatus = vi.fn();
  await show(<LinkStrip project={over.p ?? project} a={over.a ?? a} spaces={spaces} onChange={onChange} onStatus={onStatus} onOpenBuilding={over.onOpenBuilding} />);
  return { onChange, onStatus };
};

describe('LinkStrip', () => {
  it('shows Building beside the assessment and what differs', async () => {
    await strip();
    await until('the notice', () => text().includes('Building changed after these figures were taken'));
    expect(text()).toContain('26,400 m²');
    expect(text()).toContain('24,000 m²');
    expect(box('Tower A').checked && box('Podium shops').checked).toBe(true);
    expect(text()).toContain('differs · +10 %');
  });

  it('previews the update in a dialog and applies it', async () => {
    const { onChange, onStatus } = await strip();
    await press('Update from Building…');
    await until('the dialog', () => text().includes('GFA 24,000 to 26,400 m²'));
    expect(document.body.querySelector('.la-result')?.textContent).toContain('lifts 5 to 6');
    await press('Update');
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as LoadAssessment;
    expect(next).toMatchObject({ gfaM2: 26400, floors: 22, areaMode: 'm2' });
    expect(next.rows.every((r) => r.areaM2 !== undefined)).toBe(true);
    expect(onStatus.mock.calls[0][0]).toContain('Updated from Building information');
  });

  it('keeps the user’s figures and then stops asking', async () => {
    const { onChange } = await strip();
    await press('Keep my figures');
    expect((onChange.mock.calls[0][0] as LoadAssessment).from?.kept).toBeTruthy();
    await act(async () => root.unmount());
    await strip({ a: onChange.mock.calls[0][0] as LoadAssessment });
    await until('the kept pill', () => text().includes('Your own figures are kept'));
    expect(button('Keep my figures')).toBeUndefined();
  });

  it('counts only the ticked buildings', async () => {
    const { onChange } = await strip();
    await until('the boxes', () => text().includes('Podium shops'));
    await act(async () => box('Podium shops').click());
    expect((onChange.mock.calls[0][0] as LoadAssessment).from?.buildingIds).toEqual(['T']);
  });

  it('says so when there is no building information', async () => {
    await strip({ p: { ...sampleProject, building: undefined } });
    await until('the sentence', () => text().includes('No building information yet.'));
  });
});

describe('AssessmentLine', () => {
  it('summarises the assessment and opens it', async () => {
    const onOpen = vi.fn();
    await show(<AssessmentLine project={{ ...project, loadAssessment: a }} onChange={vi.fn()} onStatus={vi.fn()} onOpen={onOpen} />);
    await until('the MD', () => text().includes('MD '));
    await press('Open load assessment');
    expect(onOpen).toHaveBeenCalled();
  });

  it('starts an assessment from the buildings', async () => {
    const onChange = vi.fn(), onOpen = vi.fn();
    await show(<AssessmentLine project={project} use="Residential tower" onChange={onChange} onStatus={vi.fn()} onOpen={onOpen} />);
    await press('Start load assessment');
    expect((onChange.mock.calls[0][0] as Project).loadAssessment).toMatchObject({ typeId: 'res', gfaM2: 26400 });
    expect(onOpen).toHaveBeenCalled();
  });
});
