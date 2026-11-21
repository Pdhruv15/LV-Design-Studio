import { describe, expect, it } from 'vitest';
import { evaluateSelectivity, evaluateSupplySelectivity, genericTripTimeS, instantaneousNoTripA } from './protection';
import type { Feeder, Project } from '../types';

function feeder(over: Partial<Feeder>): Feeder {
  return {
    id: 'F', boardId: 'SUB', name: 'F', loadKw: 10, demandFactor: 1, powerFactor: 0.9, lengthM: 20,
    cableCsaMm2: 16, cores: 4, breakerRatingA: 63, breakerIcuKa: 25, ...over
  };
}

const project = (feeders: Feeder[], incomerLength = 60): Project => ({
  name: 'T', voltageV: 415, frequencyHz: 50, ambientC: 45, vdLimitPct: 4, updatedAt: '',
  boards: [
    { id: 'MDB', name: 'M', sourceKva: 1000, sourceImpedancePct: 5 },
    { id: 'SUB', name: 'S', upstreamId: 'MDB' }
  ],
  feeders: [
    feeder({ id: 'INC', boardId: 'MDB', feedsBoardId: 'SUB', breakerRatingA: 250, cableCsaMm2: 95, lengthM: incomerLength, breakerIcuKa: 36 }),
    ...feeders
  ]
});

describe('trip thresholds', () => {
  it('magnetic no-trip edge: 3/5/10 In for MCB B/C/D, 0.8 Im for MCCB', () => {
    expect(instantaneousNoTripA(feeder({ breakerType: 'B', breakerRatingA: 20 }))).toBe(60);
    expect(instantaneousNoTripA(feeder({ breakerRatingA: 32 }))).toBe(160);
    expect(instantaneousNoTripA(feeder({ breakerType: 'D', breakerRatingA: 32 }))).toBe(320);
    expect(instantaneousNoTripA(feeder({ breakerRatingA: 250 }))).toBe(2000);
  });

  it('generic curve: no trip ≤ 1.05 In, inverse-time above, 20 ms once magnetic', () => {
    const f = feeder({ breakerRatingA: 100, breakerType: 'MCCB' }); // Im = 1000 A
    expect(genericTripTimeS(f, 100)).toBe(Infinity);
    expect(genericTripTimeS(f, 300)).toBeCloseTo(500 / 8, 9);
    expect(genericTripTimeS(f, 200)).toBeGreaterThan(genericTripTimeS(f, 300));
    expect(genericTripTimeS(f, 1000)).toBe(0.02);
  });
});

describe('selectivity', () => {
  it('returns no pairs when an incomer supplies an empty board', () => {
    // Number of selectivity pairs = Σ outgoing breakers below each incomer = 0 for an empty SUB board.
    expect(evaluateSelectivity(project([]))).toEqual([]);
  });

  it('total when the upstream magnetic threshold exceeds the downstream fault level', () => {
    // Long incomer → low fault at SUB; 250 A MCCB no-trip edge = 2 kA
    const r = evaluateSelectivity(project([feeder({ id: 'D1', breakerRatingA: 63 })], 600))[0];
    expect(r.ratio).toBeCloseTo(250 / 63, 9);
    expect(r.ratioOk).toBe(true);
    expect(r.faultKA).toBeLessThan(2);
    expect(r.shortCircuit).toBe('total');
    expect(r.status).toBe('ok');
  });

  it('partial when the downstream fault exceeds the upstream threshold', () => {
    const r = evaluateSelectivity(project([feeder({ id: 'D1', breakerRatingA: 63 })], 20))[0];
    expect(r.faultKA).toBeGreaterThan(2);
    expect(r.shortCircuit).toBe('partial');
    expect(r.limitKA).toBe(2);
    expect(r.status).toBe('warn');
  });

  it('fails when the downstream breaker is as large as the upstream one', () => {
    const r = evaluateSelectivity(project([feeder({ id: 'D1', breakerRatingA: 250 })]))[0];
    expect(r.ratioOk).toBe(false);
    expect(r.status).toBe('bad');
  });
});

describe('discrimination with the supply device (first board on an LV supply)', () => {
  // The supply's device rating is the upstream In: In ratio ≥ 1.6 as between an incomer and the ways below it.
  // 100 A upstream: 40 A way ratio 2.5; 63 A way ratio 1.59 < 1.6; 100 A way ratio 1.0 (not above it: fails).
  // The short-circuit region needs the instantaneous setting, which the supply does not give: never 'ok'.
  const ways = [feeder({ id: 'A', boardId: 'MDB', breakerRatingA: 40 }), feeder({ id: 'B', boardId: 'MDB', breakerRatingA: 63 }), feeder({ id: 'C', boardId: 'MDB', breakerRatingA: 100 })];
  const lv = (supply: NonNullable<Project['boards'][number]['supply']>): Project => ({ ...project([]), boards: [{ id: 'MDB', name: 'M', supply }], feeders: ways });
  it('the ratio is judged as for an incomer; the short-circuit region is not verified', () => {
    const r = evaluateSupplySelectivity(lv({ faultKa: 25, ratingA: 100, device: 'MCCB', vdUsedPct: 1 }));
    expect(r.map((x) => [x.downstream.id, +x.ratio.toFixed(2), x.ratioOk, x.status])).toEqual([['A', 2.5, true, 'warn'], ['B', 1.59, false, 'warn'], ['C', 1, false, 'bad']]);
    expect(r[0].reasons).toEqual(['short circuit: the upstream device setting is not given']);
    expect(r[1].reasons[0]).toBe('In ratio 1.59 is below 1.6');
    expect(r[2].reasons[0]).toMatch(/not above C \(100 A\)/);
    expect(r[0].upstream).toEqual({ device: 'MCCB', ratingA: 100 });
    expect(r[0].faultKA).toBeGreaterThan(0);
  });
  it('an isolator gives no protective device to discriminate with', () => {
    expect(evaluateSupplySelectivity(lv({ faultKa: 25, ratingA: 400, device: 'ISOL', zeOhm: 0.1 }))[0].reasons).toEqual(['the supply device is an isolator: no protective device to discriminate with']);
  });
  it('nothing without a device rating or given values (unchanged), and not for a transformer or a sub-board', () => {
    expect(evaluateSupplySelectivity(lv({ faultKa: 25, ratingA: 100 }))).toEqual([]); // only the stated device: left as it was
    expect(evaluateSupplySelectivity(lv({ faultKa: 25, vdUsedPct: 1 }))).toEqual([]);
    expect(evaluateSupplySelectivity({ ...lv({ ratingA: 100, zeOhm: 0.1 }), boards: [{ id: 'MDB', name: 'M', sourceKva: 1000, sourceImpedancePct: 5, supply: { ratingA: 100, zeOhm: 0.1 } }] })).toEqual([]);
    // The ordinary pairs are not touched.
    expect(evaluateSelectivity(lv({ faultKa: 25, ratingA: 100, zeOhm: 0.1 }))).toEqual([]);
  });
});
