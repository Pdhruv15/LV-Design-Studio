import { describe, expect, it } from 'vitest';
import { sampleProject } from '../data/sampleProject';
import { DEFAULT_TYPES, newAssessment } from './loadAssessment';
import { keepTxGenSettings, suggestedGeneratorKva, txGenLink } from './txGen';
import type { Project } from '../types';

const a = newAssessment(DEFAULT_TYPES[0], { gfaM2: 26400, floors: 21, parkingM2: 8000 }, { types: [] });
const bare: Project = { ...sampleProject, boards: [], feeders: [], loadAssessment: undefined, spacePlan: undefined };
const withA = (growth: number): Project => ({
  ...bare,
  loadAssessment: { ...a, supply: { ...a.supply, sparePct: 0, sizeList: 'dewa' } },
  studySettings: { futureGrowthPct: growth }
});

describe('txGenLink', () => {
  it('is undefined with neither an assessment nor a space plan', () => {
    expect(txGenLink(bare)).toBeUndefined();
  });

  it('puts the assessment beside the study and flags a different growth', () => {
    const l = txGenLink(withA(20))!;
    const g = l.rows.find((r) => r.key === 'growth')!;
    expect(g).toMatchObject({ assessment: '0 %', plan: '—', study: '20 %', differs: true });
    expect(l.differs).toBe(true);
    expect(l.notice).toBe(true);
    expect(l.rows.find((r) => r.key === 'sizes')!.differs).toBe(false);
  });

  it('keeping hides the notice until a setting changes', () => {
    const kept = keepTxGenSettings(withA(20));
    expect(kept.txGen?.kept).toBeTruthy();
    expect(txGenLink(kept)).toMatchObject({ differs: true, notice: false });
    expect(txGenLink({ ...kept, studySettings: { futureGrowthPct: 25 } })!.notice).toBe(true);
  });

  it('suggests the assessment generator when the study has none', () => {
    expect(suggestedGeneratorKva(bare)).toBeUndefined();
    expect(suggestedGeneratorKva(withA(10))).toBeGreaterThan(0);
  });
});
