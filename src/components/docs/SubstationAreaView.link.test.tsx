// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { sampleProject } from '../../data/sampleProject';
import { emptyPlan } from '../../calc/spacePlan';
import { substationsFromProject } from '../../calc/dmSubstation';
import type { Project, SpacePlan } from '../../types';
import SubstationAreaView from './SubstationAreaView';

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

const plan = (kva: number): SpacePlan => ({ ...emptyPlan(), transformers: [{ id: 'T1', kva, rmu: 'RMU-1' }, { id: 'T2', kva, rmu: 'RMU-1' }] });
const base: Project = { ...sampleProject, spacePlan: plan(1500) };
const changed: Project = { ...base, substations: substationsFromProject(base).rooms, spacePlan: plan(1000) };

describe('Substation area: the plan link notice', () => {
  it('shows after a plan change and Keep mine saves the state it was kept against', async () => {
    const onChange = vi.fn();
    await act(async () => { root = createRoot(host); root.render(<SubstationAreaView project={changed} onChange={onChange} onStatus={() => {}} />); });
    await until('the notice', () => text().includes('The space plan now gives 1 substation: RMU-1 2 × 1,000 kVA'));
    expect(button('Update from the plan')).toBeTruthy();
    await act(async () => { button('Keep mine')!.click(); });
    const [next] = onChange.mock.calls[0] as [Project];
    expect(next.substationsKept).toBeTruthy();
    expect(next.substations).toEqual(changed.substations);
  });

  it('shows no notice when the page follows the plan', async () => {
    const p = { ...base, substations: substationsFromProject(base).rooms };
    await act(async () => { root = createRoot(host); root.render(<SubstationAreaView project={p} onChange={() => {}} onStatus={() => {}} />); });
    await until('the page', () => text().includes('Substations'));
    expect(text()).not.toContain('now gives');
  });
});
