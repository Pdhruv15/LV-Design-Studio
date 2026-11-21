import { describe, expect, it } from 'vitest';
import { sampleProject } from '../data/sampleProject';
import { DEFAULT_TYPES, newAssessment } from './loadAssessment';
import { emptyPlan } from './spacePlan';
import type { Project, SpacePlan } from '../types';
import { newProject } from '../types';
import { createMdbFromAssessment } from './loadAssessmentMdb';
import { assess } from './loadAssessment';
import { generatorProgress, supplyProgress } from './supplyProgress';

const a = newAssessment(DEFAULT_TYPES[0], { gfaM2: 26400, floors: 21, parkingM2: 8000 }, { types: [] });
const plan: SpacePlan = {
  ...emptyPlan(),
  areas: [{ id: 'a1', building: 'Tower A', name: 'Flats', use: 'residential', areaM2: 60000 }],
  transformers: [{ id: 'T1', kva: 1000, rmu: 'RMU-1' }, { id: 'T2', kva: 1500, rmu: 'RMU-1' }]
};
const bare: Project = { ...sampleProject, boards: [], loadAssessment: undefined, spacePlan: undefined };

describe('Transformers: concept to design', () => {
  it('has no rows for a project with nothing', () => {
    expect(supplyProgress(bare)).toEqual([]);
  });

  it('gives the assessment row from its duty units', () => {
    const [r] = supplyProgress({ ...bare, loadAssessment: a });
    expect(r.key).toBe('assessment');
    expect(r.transformers).toMatch(/^\d+ × [\d,]+ kVA$/);
    expect(r.totalKva).toBeGreaterThan(0);
    expect(r.loadingPct).toBeCloseTo((r.demandKva / r.totalKva) * 100, 6);
    expect(r.differs).toBe(false);
  });

  it('gives the plan row with different sizes joined, and marks it as differing', () => {
    const rows = supplyProgress({ ...bare, loadAssessment: a, spacePlan: plan });
    const p = rows.find((r) => r.key === 'plan')!;
    expect(p.transformers).toBe('1,000 + 1,500 kVA');
    expect(p.count).toBe(2);
    expect(p.totalKva).toBe(2500);
    expect(p.rmus).toBe(1);
    expect(p.differs).toBe(true);
  });

  it('gives the needed transformers when the plan has none placed', () => {
    const p = supplyProgress({ ...bare, spacePlan: { ...plan, transformers: [] } })[0];
    expect(p.key).toBe('plan');
    expect(p.count).toBeGreaterThan(0);
    expect(p.rmus).toBeGreaterThan(0);
    expect(p.differs).toBe(false);
  });

  it('gives the network row from the main boards', () => {
    const rows = supplyProgress({ ...sampleProject, loadAssessment: a, spacePlan: plan });
    const n = rows.find((r) => r.key === 'network')!;
    expect(n.transformers).toBe('1 × 1,000 kVA');
    expect(n.totalKva).toBe(1000);
    expect(n.count).toBe(1);
    expect(n.differs).toBe(true);
    expect(rows.map((r) => r.key)).toEqual(['assessment', 'plan', 'network']);
  });
});

describe('This study row and the generator figures', () => {
  const made = { ...createMdbFromAssessment({ ...newProject('T'), boards: [], feeders: [] }, a).project, loadAssessment: a };

  it('adds the study row only when asked', () => {
    expect(supplyProgress(made).map((r) => r.key)).not.toContain('study');
    const rows = supplyProgress(made, true);
    const st = rows.find((r) => r.key === 'study')!;
    expect(st.count).toBeGreaterThan(0);
    expect(st.totalKva).toBeGreaterThan(0);
    expect(st.loadingPct).toBeCloseTo((st.demandKva / st.totalKva) * 100, 6);
  });

  it('gives the generator rows and the stand-in feeders', () => {
    const g = generatorProgress(made);
    expect(g.rows.map((r) => r.key)).toEqual(['assessment', 'study', 'network']);
    expect(g.rows[2].setText).toBe('none on the SLD');
    expect(g.rows[2].differs).toBe(true);
    expect(g.standInFeeders).toBeGreaterThan(0);
    expect(g.standInKw).toBeGreaterThan(0);
    expect(Math.abs(g.standInKw - assess(a).generatorKw)).toBeLessThan(1);
  });

  it('has no generator rows for an empty project', () => {
    expect(generatorProgress({ ...newProject('T'), boards: [], feeders: [] }).rows).toEqual([]);
  });
});
