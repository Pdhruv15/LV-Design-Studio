// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { sampleProject } from '../../data/sampleProject';
import { DEFAULT_TYPES, newAssessment } from '../../calc/loadAssessment';
import { emptyPlan } from '../../calc/spacePlan';
import type { BuildingInfo, Project, SpacePlan } from '../../types';
import { PlanLinkStrip } from './SpacePlanLink';

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
const button = (label: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.startsWith(label));
const press = async (label: string) => { await until(label, () => !!button(label)); await act(async () => { button(label)!.click(); }); };

const building: BuildingInfo = {
  buildings: [
    { id: 'T', name: 'Tower A', levels: [
      { id: 'T-G', name: 'Ground', kind: 'ground', heightM: 4.5, grossM2: 1200 },
      { id: 'T-T', name: 'Typical floors', kind: 'typical', heightM: 3.6, grossM2: 1200, count: 20 }
    ] },
    { id: 'P', name: 'Podium shops', levels: [{ id: 'P-G', name: 'Ground', kind: 'ground', heightM: 5, grossM2: 1200 }] }
  ],
  rooms: []
};
const a = newAssessment(DEFAULT_TYPES[0], { gfaM2: 26400, floors: 21, parkingM2: 8000 }, { types: [] });
const typed: SpacePlan = { ...emptyPlan(), areas: [{ id: 'a1', building: 'Tower A', name: 'Flats', use: 'residential', areaM2: 60000 }] };
const project = (loadAssessment?: Project['loadAssessment']): Project => ({ ...sampleProject, building, loadAssessment, spacePlan: typed });
const show = async (p: Project, onPlan = vi.fn()) => {
  await act(async () => { root = createRoot(host); root.render(<PlanLinkStrip project={p} plan={p.spacePlan!} onPlan={onPlan} onStatus={() => {}} />); });
  return onPlan;
};

describe('Space plan: the load assessment link', () => {
  it('shows the assessment beside the plan and says they differ', async () => {
    await show(project(a));
    await until('the strip', () => text().includes('Maximum demand'));
    expect(text()).toContain('The plan and the assessment differ');
    expect(text()).toContain('differs');
  });

  it('takes the loads and the settings after showing what changes', async () => {
    const onPlan = await show(project(a));
    await press('Take loads from the assessment');
    await until('the dialog', () => text().includes('load rows by building'));
    expect(document.querySelector('.la-result')?.textContent).toMatch(/^Result\s*MD/);
    await act(async () => { [...document.querySelectorAll('button')].find((b) => b.textContent === 'Take loads')!.click(); });
    const [next, step] = onPlan.mock.calls[0] as [SpacePlan, boolean];
    expect(next.areas.some((x) => x.from === 'la')).toBe(true);
    expect(next.areas.some((x) => x.id === 'a1')).toBe(true);
    expect(next.settings.coincidence).toBe(0.9);
    expect(step).toBe(true);
  });

  it('uses only the settings, or keeps the plan’s figures', async () => {
    const onPlan = await show(project(a));
    await press("Use the assessment's settings");
    expect((onPlan.mock.calls[0][0] as SpacePlan).settings.coincidence).toBe(0.9);
    await press('Keep my figures');
    expect((onPlan.mock.calls[1][0] as SpacePlan).kept).toBeTruthy();
  });

  it('says so when there is no load assessment', async () => {
    await show(project());
    await until('the sentence', () => text().includes('No load assessment yet'));
    expect(button('Take loads')).toBeUndefined();
  });
});
