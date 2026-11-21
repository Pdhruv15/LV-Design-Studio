import { describe, expect, it } from 'vitest';
import { sampleProject } from '../data/sampleProject';
import { evaluateFeeder } from './electrical';
import { failReasons, quickFixes } from './quickFix';

describe('quick fixes', () => {
  it('offers nothing for a passing circuit', () => {
    const f = sampleProject.feeders.find((x) => evaluateFeeder(sampleProject, x).status === 'ok')!;
    expect(quickFixes(sampleProject, f)).toEqual([]);
  });
  it('fixes an undersized cable, and every fix is checked', () => {
    const base = sampleProject.feeders.find((x) => !x.feedsBoardId && evaluateFeeder(sampleProject, x).status === 'ok')!;
    const f = { ...base, cableCsaMm2: 1.5, lengthM: 120 };
    const r = evaluateFeeder(sampleProject, f);
    expect(r.status).not.toBe('ok');
    expect(failReasons(sampleProject, r).length).toBeGreaterThan(0);
    const fixes = quickFixes(sampleProject, f);
    expect(fixes.length).toBeGreaterThan(0);
    for (const x of fixes) expect(evaluateFeeder(sampleProject, { ...f, ...x.patch }).status).not.toBe('bad');
  });
});

describe('quick fixes: unprotected cable', () => {
  it('offers a smaller breaker between Ib and Iz', () => {
    const base = sampleProject.feeders.find((x) => !x.feedsBoardId && evaluateFeeder(sampleProject, x).status === 'ok' && x.breakerRatingA >= 63)!;
    const r0 = evaluateFeeder(sampleProject, base);
    const f = { ...base, breakerRatingA: 1000 };
    const fixes = quickFixes(sampleProject, f);
    const brk = fixes.find((x) => x.label.startsWith('Breaker') && !x.label.includes('cable'));
    expect(brk).toBeDefined();
    expect(brk!.patch.breakerRatingA!).toBeGreaterThanOrEqual(r0.ib);
  });
});

describe('engines get the same cable data', async () => {
  const { engineCableData } = await import('../engines/external');
  const { cables } = await import('./cableTable');
  it('sends the active cable table and the temperature factor', () => {
    const d = engineCableData({ ...sampleProject, vdTempC: 90 });
    expect(d.cables).toHaveLength(cables().length);
    expect(d.cables[0]).toEqual([cables()[0].csaMm2, cables()[0].rOhmPerKm20C, cables()[0].xOhmPerKm, cables()[0].ampacityA]);
    expect(d.rFactor).toBeCloseTo(1 + 0.00393 * 70, 5);
    expect(engineCableData(sampleProject).rFactor).toBe(1.2);
  });
});

describe('quick fixes on an assumed fault level', () => {
  const assumed = { ...sampleProject, boards: sampleProject.boards.map((b) => (b.upstreamId ? b : { ...b, sourceKva: undefined, sourceImpedancePct: undefined })) };
  const f = { ...assumed.feeders.find((x) => !x.feedsBoardId && x.boardId === 'MDB-1')!, breakerIcuKa: 6 };
  it('says the breaking capacity is not verified and never offers a bigger Icu', () => {
    const r = evaluateFeeder(assumed, f);
    expect(r.faultAssumed).toBe(true);
    expect(failReasons(assumed, r)).toContain('Breaking capacity not verified: source fault level assumed');
    expect(quickFixes(assumed, f).some((x) => 'breakerIcuKa' in x.patch)).toBe(false);
  });
  it('a real fault level below the Icu still offers it', () => {
    const real = { ...sampleProject, boards: sampleProject.boards.map((b) => (b.upstreamId ? b : { ...b, sourceKva: 1500, sourceImpedancePct: 5 })) };
    const g = { ...f, boardId: 'MDB-1', breakerIcuKa: 6 };
    expect(evaluateFeeder(real, g).icuStatus).toBe('bad');
    expect(quickFixes(real, g).some((x) => 'breakerIcuKa' in x.patch)).toBe(true);
    expect(failReasons(real, evaluateFeeder(real, g)).join()).toMatch(/Breaking capacity: Icu 6 kA/);
  });
});
