// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { sampleProject } from '../../data/sampleProject';
import { DEFAULT_TYPES, newAssessment } from '../../calc/loadAssessment';
import { emptyPlan } from '../../calc/spacePlan';
import type { Project, SpacePlan } from '../../types';
import { SupplyConceptTable } from './SupplyConcept';

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
const show = async (p: Project) => { await act(async () => { root = createRoot(host); root.render(<SupplyConceptTable project={p} heading={<h3>Heading</h3>} />); }); };

const a = newAssessment(DEFAULT_TYPES[0], { gfaM2: 26400, floors: 21, parkingM2: 8000 }, { types: [] });
const plan: SpacePlan = {
  ...emptyPlan(),
  areas: [{ id: 'a1', building: 'Tower A', name: 'Flats', use: 'residential', areaM2: 60000 }],
  transformers: [{ id: 'T1', kva: 1000, rmu: 'RMU-1' }, { id: 'T2', kva: 1500, rmu: 'RMU-1' }]
};

describe('Transformers: concept to design table', () => {
  it('shows the three figures and marks a plan that differs', async () => {
    await show({ ...sampleProject, loadAssessment: a, spacePlan: plan });
    await until('the table', () => text().includes('Space plan'));
    expect(text()).toContain('Heading');
    expect(text()).toContain('Assessment');
    expect(text()).toContain('Network');
    expect(text()).toContain('1 RMU');
    expect(document.querySelector('td.warn')?.textContent).toBe('1,000 + 1,500 kVA');
  });

  it('shows nothing with only one figure', async () => {
    await show({ ...sampleProject, boards: [], loadAssessment: a, spacePlan: undefined });
    await act(async () => { await new Promise((r) => { setTimeout(r, 50); }); });
    expect(host.innerHTML).toBe('');
  });
});
