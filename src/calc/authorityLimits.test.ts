import { describe, expect, it } from 'vitest';
import type { Feeder, Project } from '../types';
import { cableLimitsOf, combinationAllowed, dewaTableFor, DEWA_TABLE1_1PH, DEWA_TABLE1_3PH, DEWA_TABLE2, DEWA_TABLE3, isLimitRemark, rowFor } from './authorityLimits';
import { evaluateFeeder } from './electrical';
import { applyRecommendation, recommend } from './sizing';
import { failReasons, quickFixes } from './quickFix';

const project = (feeders: Feeder[], extra: Partial<Project> = {}): Project => ({
  name: 'T', voltageV: 415, frequencyHz: 50, ambientC: 45, vdLimitPct: 4, updatedAt: '',
  boards: [{ id: 'MDB', name: 'M', sourceKva: 1000, sourceImpedancePct: 5 }, { id: 'DB1', name: 'DB1', upstreamId: 'MDB' }],
  feeders,
  ...extra
});
const feeder = (o: Partial<Feeder>): Feeder => ({
  id: 'F', boardId: 'MDB', name: 'Load', loadKw: 40, demandFactor: 1, powerFactor: 0.85, lengthM: 20,
  cableCsaMm2: 16, cores: 4, breakerRatingA: 80, breakerIcuKa: 50, ...o
});
const ref = (id: string, name: string) => ({ designReference: { id, name, version: 1, appliedAt: '', values: {} } });

describe('DEWA Appendix 5 cable tables', () => {
  it('holds the regulation values', () => {
    expect(DEWA_TABLE3.rows.map((r) => [r.csaMm2, r.maxBreakerA])).toEqual([
      [10, 50], [16, 60], [25, 80], [35, 100], [50, 125], [70, 160], [95, 200], [120, 225], [150, 250], [185, 300], [240, 350], [300, 400]
    ]);
    // Table 2: "65 mm²" in the regulation is read as 95 mm²; "10/15 A" on 2.5 mm² as today's 16 A MCB.
    expect(DEWA_TABLE2.rows.map((r) => [r.csaMm2, r.maxBreakerA])).toEqual([
      [2.5, 16], [4, 20], [6, 30], [10, 40], [16, 50], [25, 60], [35, 80], [50, 100], [70, 125], [95, 160], [120, 180], [150, 200], [185, 250], [240, 300], [300, 350], [400, 400]
    ]);
    expect(DEWA_TABLE1_1PH.rows.map((r) => [r.csaMm2, r.maxBreakerA])).toEqual([[2.5, 16], [4, 20], [6, 30], [10, 40], [16, 50], [25, 60], [35, 80]]);
    expect(DEWA_TABLE1_3PH.rows.map((r) => [r.csaMm2, r.maxBreakerA])).toEqual([[2.5, 16], [4, 20], [6, 25], [10, 30], [16, 40], [25, 60], [50, 80], [70, 100], [95, 125], [120, 160]]);
    for (const t of [DEWA_TABLE1_1PH, DEWA_TABLE1_3PH, DEWA_TABLE2, DEWA_TABLE3]) expect(t.rows.every((r) => r.maxLoadA === r.maxBreakerA)).toBe(true);
  });

  it('a size between two rows takes the smaller row; outside the table the calculation decides', () => {
    expect(rowFor(DEWA_TABLE1_3PH, 35)?.maxBreakerA).toBe(60); // 3-phase 35 mm² is not listed: the 25 mm² row
    expect(rowFor(DEWA_TABLE3, 6)).toBeUndefined();
    expect(rowFor(DEWA_TABLE1_1PH, 50)).toBeUndefined();
  });

  it('applies to DEWA projects and projects with no reference, not to other authorities', () => {
    expect(cableLimitsOf(project([]))).toBeDefined();
    expect(cableLimitsOf(project([], ref('builtin-dewa', 'DEWA (Dubai)')))).toBeDefined();
    expect(cableLimitsOf(project([], ref('my-1', 'Company DEWA')))).toBeDefined();
    expect(cableLimitsOf(project([], ref('builtin-addc', 'ADDC (Abu Dhabi)')))).toBeUndefined();
    expect(cableLimitsOf(project([], ref('builtin-iec', 'IEC 60364')))).toBeUndefined();
  });

  it('picks the table by cable type; DB schedule circuits are single-core PVC in conduit unless set', () => {
    expect(dewaTableFor({ cores: 4 })).toBe(DEWA_TABLE3);
    expect(dewaTableFor({ cores: 4, cableType: 'XLPE/PVC/SWA' })).toBe(DEWA_TABLE3);
    expect(dewaTableFor({ cores: 4, cableType: 'XLPE/SWA/LSZH' })).toBe(DEWA_TABLE3);
    expect(dewaTableFor({ cores: 4, cableType: 'PVC/SWA/PVC' })).toBe(DEWA_TABLE2);
    expect(dewaTableFor({ cores: 2, cableType: 'PVC 1C' })).toBe(DEWA_TABLE1_1PH);
    expect(dewaTableFor({ cores: 4, cableType: 'PVC 1C' })).toBe(DEWA_TABLE1_3PH);
    expect(dewaTableFor({ cores: 2, phase: 'R' })).toBe(DEWA_TABLE1_1PH);
    expect(dewaTableFor({ cores: 4, phase: 'RYB' })).toBe(DEWA_TABLE1_3PH);
    expect(dewaTableFor({ cores: 2, phase: 'R', cableType: 'XLPE/PVC/SWA' })).toBe(DEWA_TABLE3);
    expect(dewaTableFor({ cores: 4, cableType: 'PVC/PVC' })).toBeUndefined();
    expect(dewaTableFor({ cores: 4, cableType: 'XLPE/PVC/SWA AL' })).toBeUndefined();
  });

  it('allows a size up to its breaker and load limit; parallel runs count as runs × the table value', () => {
    const lim = cableLimitsOf(project([]))!;
    expect(combinationAllowed(lim, { cores: 4 }, 25, 1, 80, 70)).toBe(true);
    expect(combinationAllowed(lim, { cores: 4 }, 25, 1, 100, 70)).toBe(false);
    expect(combinationAllowed(lim, { cores: 4 }, 25, 1, 80, 81)).toBe(false); // load above the table's max load current
    expect(combinationAllowed(lim, { cores: 4 }, 150, 2, 500, 350)).toBe(true); // 2 × 250 A
    expect(combinationAllowed(lim, { cores: 4 }, 300, 1, 500, 350)).toBe(false);
    expect(combinationAllowed(lim, { cores: 4 }, 6, 1, 40, 30)).toBe(true); // below 10 mm²: the calculation decides
  });
});

describe('sizing with DEWA Table 3', () => {
  it('sizes the cable up to the table and writes a remark', () => {
    const f = feeder({ loadKw: 40, breakerRatingA: 100, cableCsaMm2: 16 });
    const p = project([f]);
    const r = recommend(p, f, 'fix');
    expect(r.breakerRatingA).toBe(100);
    expect(r.cableCsaMm2).toBe(35); // 25 mm² carries 100 A by Iz, but the table allows it 80 A
    expect(r.remarks).toBe('DEWA Table 3: 35 mm² for 100 A (25 mm² max 80 A)');
    expect(r.note).toBe(r.remarks);
    const sized = applyRecommendation(f, r);
    expect(sized.remarks).toBe(r.remarks);
    expect(evaluateFeeder({ ...p, feeders: [sized] }, sized).limits).toMatchObject({ status: 'ok' });
  });

  it('leaves other authorities and the IEC sizing alone', () => {
    const f = feeder({ loadKw: 40, breakerRatingA: 100, cableCsaMm2: 16 });
    const r = recommend(project([f], ref('builtin-addc', 'ADDC (Abu Dhabi)')), f, 'fix');
    expect(r.cableCsaMm2).toBe(25);
    expect(r.remarks).toBeUndefined();
  });

  it('keeps the user\'s own remark and clears its own when the table no longer sets the size', () => {
    const f = feeder({ loadKw: 40, breakerRatingA: 100, cableCsaMm2: 16, remarks: 'Spare way for future' });
    expect(recommend(project([f]), f, 'fix').remarks).toBe('Spare way for future');
    const old = feeder({ loadKw: 10, breakerRatingA: 100, cableCsaMm2: 16, remarks: 'DEWA Table 3: 35 mm² for 100 A (25 mm² max 80 A)' });
    const r = recommend(project([old]), old, 'optimise');
    expect(r.breakerRatingA).toBeLessThan(63);
    expect(r.remarks).toBeUndefined();
    expect(isLimitRemark(old.remarks)).toBe(true);
  });

  it('a feeder to a DB is at least 10 mm² on a 40 A breaker', () => {
    const f = feeder({ id: 'INC', loadKw: 0, feedsBoardId: 'DB1', breakerRatingA: 20, cableCsaMm2: 4 });
    const load = feeder({ id: 'L', boardId: 'DB1', loadKw: 5, powerFactor: 1, breakerRatingA: 16, cableCsaMm2: 2.5 });
    const p = project([f, load]);
    const r = recommend(p, f, 'optimise');
    expect(r.breakerRatingA).toBe(40);
    expect(r.cableCsaMm2).toBe(10);
    expect(r.remarks).toBe('DEWA: DB feeder minimum 10 mm²');
    expect(evaluateFeeder(p, f).limits).toMatchObject({ status: 'bad', message: 'DEWA: a feeder to a DB is at least 10 mm² (has 4 mm²)' });
  });

  it('final circuits below 10 mm² follow the calculation', () => {
    const f = feeder({ loadKw: 3, powerFactor: 1, cores: 2, breakerRatingA: 20, cableCsaMm2: 2.5 });
    const p = project([f]);
    expect(evaluateFeeder(p, f).limits).toBeUndefined();
    expect(recommend(p, f, 'fix').remarks).toBeUndefined();
  });
});

describe('DB circuits with DEWA Table 1', () => {
  it('a 40 A single-phase circuit on 6 mm² wires goes to 10 mm²; 2.5 mm² may carry 16 A', () => {
    const f = feeder({ id: 'C1', boardId: 'DB1', loadKw: 6, powerFactor: 1, cores: 2, phase: 'R', breakerRatingA: 40, cableCsaMm2: 6 });
    const p = project([f]);
    expect(evaluateFeeder(p, f).limits).toMatchObject({ status: 'bad', message: 'DEWA Table 1: 40 A breaker on 6 mm² (max 30 A)' });
    const r = recommend(p, f, 'fix');
    expect(r.cableCsaMm2).toBe(10);
    expect(r.remarks).toBe('DEWA Table 1: 10 mm² for 40 A (4 mm² max 20 A)'); // 4 mm² carries the load by Iz
    const skt = feeder({ id: 'C2', boardId: 'DB1', loadKw: 2, powerFactor: 1, cores: 2, phase: 'Y', breakerRatingA: 16, cableCsaMm2: 2.5 });
    expect(evaluateFeeder(project([skt]), skt).limits?.status).toBe('ok');
    const big = { ...skt, breakerRatingA: 20 };
    expect(evaluateFeeder(project([big]), big).limits?.message).toBe('DEWA Table 1: 20 A breaker on 2.5 mm² (max 16 A)');
  });
});

describe('checks with DEWA Table 3', () => {
  it('flags a hand-set combination that breaks the table and offers fixes that meet it', () => {
    const f = feeder({ loadKw: 30, breakerRatingA: 80, cableCsaMm2: 16 });
    const p = project([f]);
    const e = evaluateFeeder(p, f);
    expect(e.protectionStatus).toBe('ok'); // Iz carries 80 A …
    expect(e.limits).toMatchObject({ status: 'bad', message: 'DEWA Table 3: 80 A breaker on 16 mm² (max 60 A)' });
    expect(e.status).toBe('bad'); // … but DEWA does not allow it
    expect(failReasons(p, e)).toContain('DEWA Table 3: 80 A breaker on 16 mm² (max 60 A)');
    const fixes = quickFixes(p, f);
    expect(fixes.map((x) => x.label)).toEqual(expect.arrayContaining(['Cable 25 mm²']));
    for (const x of fixes) expect(evaluateFeeder(p, { ...f, ...x.patch }).limits?.status).not.toBe('bad');
  });
});
