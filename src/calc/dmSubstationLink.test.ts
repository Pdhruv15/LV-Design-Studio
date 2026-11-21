import { describe, expect, it } from 'vitest';
import { sampleProject } from '../data/sampleProject';
import { emptyPlan } from './spacePlan';
import type { Project, SpacePlan } from '../types';
import { keepSubstations, substationLink, substationsFromProject } from './dmSubstation';

const plan = (kva: number): SpacePlan => ({ ...emptyPlan(), transformers: [{ id: 'T1', kva, rmu: 'RMU-1' }, { id: 'T2', kva, rmu: 'RMU-1' }] });
const filled = (p: SpacePlan): Project => { const base = { ...sampleProject, spacePlan: p }; return { ...base, substations: substationsFromProject(base).rooms }; };

describe('Substation area follows the plan', () => {
  it('has no notice with no substations on the page', () => {
    const l = substationLink({ ...sampleProject, spacePlan: plan(1500), substations: undefined });
    expect(l.differs).toBe(false);
    expect(l.notice).toBe(false);
    expect(l.now).toBe('1 substation: RMU-1 2 × 1,500 kVA');
  });

  it('has no notice straight after filling', () => {
    expect(substationLink(filled(plan(1500))).notice).toBe(false);
  });

  it('has a notice after the plan transformers change, until kept', () => {
    const changed = { ...filled(plan(1500)), spacePlan: plan(1000) };
    const l = substationLink(changed);
    expect(l.differs).toBe(true);
    expect(l.notice).toBe(true);
    const kept = keepSubstations(changed);
    expect(substationLink(kept)).toMatchObject({ differs: true, notice: false });
    expect(substationLink({ ...kept, spacePlan: plan(2000) }).notice).toBe(true);
  });

  it('never differs when the project gives no substations', () => {
    const l = substationLink({ ...sampleProject, boards: [], spacePlan: undefined, substations: [{ id: 'x', name: 'SS-1', type: 'conventional', transformers: 1 }] });
    expect(l).toMatchObject({ source: 'none', differs: false, notice: false });
  });
});
