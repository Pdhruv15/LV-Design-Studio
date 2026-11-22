import { describe, expect, it } from 'vitest';
import { evaluateSupplyIncomer, supplyIncomers } from './supplyIncomer';
import type { Feeder, Project } from '../types';

// 415 V, 4 % drop limit, 45 °C. A first board on an LV supply: Ik 12 kA, X/R 3, 1.6 % already used at the supply point,
// a 63 A upstream device, the incoming cable 4C × 16 mm² copper, 25 m (method E: 105 A × 0.87 at 45 °C = 91.35 A),
// and a 24 kW load at PF 0.9 on the board: Ib = 24000 ÷ (√3 × 415 × 0.9) = 37.1 A.
const load: Feeder = { id: 'F', boardId: 'MDB', name: 'F', loadKw: 24, demandFactor: 1, powerFactor: 0.9, lengthM: 20, cableCsaMm2: 10, cores: 4, breakerRatingA: 40, breakerIcuKa: 36 };
const supply = { faultKa: 12, xr: 3, ratingA: 63, device: 'MCCB' as const, vdUsedPct: 1.6, incomer: { cableCsaMm2: 16, lengthM: 25 } };
const lv = (s: NonNullable<Project['boards'][number]['supply']> = supply, over: Partial<Project> = {}): Project =>
  ({ name: 'T', voltageV: 415, frequencyHz: 50, ambientC: 45, vdLimitPct: 4, updatedAt: '', boards: [{ id: 'MDB', name: 'M', supply: s }], feeders: [load], ...over });
const check = (p: Project) => evaluateSupplyIncomer(p, p.boards[0]);

describe('the incoming cable of a first board on an LV supply, checked', () => {
  it('Ib, Iz, the drop and the fault levels, from the app\'s own cable table', () => {
    const r = check(lv())!;
    expect(r.ibA).toBeCloseTo(37.1, 1);
    expect(r.inA).toBe(63);
    expect(r.izA).toBeCloseTo(91.35, 2);
    // √3 × 37.1 A × 0.025 km × (1.38 × 0.9 + 0.085 × 0.4359) ÷ 415 V = 0.495 %; total with the 1.6 % used = 2.095 % (limit 4 %, warn above 3.4 %).
    expect(r.vdPct).toBeCloseTo(0.495, 3);
    expect(r.vdUsedPct).toBe(1.6);
    expect(r.vdTotalPct).toBeCloseTo(2.095, 3);
    expect(r.faultSupplyKA).toBe(12);
    expect(r.faultBoardKA).toBeCloseTo(6.04, 2); // 12 kA behind X/R 3 and the cable's 0.0287 + j0.0021 Ω
    expect([r.vdStatus, r.ampacityStatus, r.protectionStatus, r.status]).toEqual(['ok', 'ok', 'ok', 'ok']);
    expect(r.reasons).toEqual([]);
    expect(r.faultAssumed).toBeUndefined();
  });

  it('Ib ≤ In ≤ Iz: a device below Ib, above Iz, or not given', () => {
    const low = check(lv({ ...supply, ratingA: 30 }))!;
    expect(low.protectionStatus).toBe('bad');
    expect(low.reasons.join(' ')).toMatch(/Ib 37\.1 A is above the supply device 30 A/);
    const high = check(lv({ ...supply, ratingA: 100 }))!; // 100 A > Iz 91.35 A
    expect(high.protectionStatus).toBe('bad');
    expect(high.reasons.join(' ')).toMatch(/not protected/);
    const none = check(lv({ ...supply, ratingA: undefined }))!;
    expect(none.inA).toBeUndefined();
    expect(none.protectionStatus).toBe('warn');
    expect(none.status).toBe('warn');
    expect(none.reasons).toEqual(['supply device rating not given: Ib ≤ In ≤ Iz not checked']);
  });

  it('an isolator gives no overload protection: the cable is not verified, whatever its rating', () => {
    const iso = check(lv({ ...supply, device: 'ISOL' }))!;
    expect(iso.protectionStatus).toBe('warn');
    expect(iso.status).toBe('warn');
    expect(iso.reasons).toEqual(['the supply device is an isolator: protection of the incoming cable not verified (Ib ≤ In ≤ Iz not checked)']);
    expect(check(lv({ ...supply, device: 'ISOL', ratingA: 30 }))!.protectionStatus).toBe('bad'); // its rating can still be below Ib
  });

  it('a cable with no rating for its method gives that one reason, not also "the device is above Iz"', () => {
    const none = check(lv({ ...supply, incomer: { cableCsaMm2: 16, lengthM: 25, installMethod: 'D2' } }))!; // the reference table has no D2 ratings
    expect(none.izA).toBeNaN();
    expect(none.ampacityStatus).toBe('bad');
    expect(none.reasons).toEqual(['no rating for the incoming cable (no D2 rating for 16 mm² (Cables.xlsx or reference))']);
  });

  it('a cable below Ib, and the voltage drop against the limit with the drop used added', () => {
    const small = check(lv({ ...supply, incomer: { cableCsaMm2: 2.5, lengthM: 25 } }))!; // 2.5 mm²: Iz = 36 × 0.87 = 31.3 A < 37.1 A
    expect(small.ampacityStatus).toBe('bad');
    expect(small.status).toBe('bad');
    expect(small.reasons[0]).toMatch(/Iz .* A is below Ib 37\.1 A/);
    expect(check(lv({ ...supply, vdUsedPct: 3.0 }))!.vdStatus).toBe('warn'); // 3.495 % > 85 % of 4 %
    const over = check(lv({ ...supply, vdUsedPct: 3.6 }))!; // 4.095 % > 4 %
    expect(over.vdStatus).toBe('bad');
    expect(over.reasons.join(' ')).toMatch(/voltage drop 4\.10 % \(3\.60 % used upstream\) above the 4 % limit/);
  });

  it('without a fault level the fault at the board is assumed', () => {
    expect(check(lv({ ...supply, faultKa: undefined }))!.faultAssumed).toBe(true);
  });

  it('nothing for a board without an incoming cable, without a supply, below another board, or with a transformer', () => {
    expect(check(lv({ faultKa: 12, ratingA: 63 }))).toBeUndefined();
    expect(check(lv({ ...supply, incomer: { cableCsaMm2: 0, lengthM: 25 } }))).toBeUndefined();
    expect(check({ ...lv(), boards: [{ id: 'MDB', name: 'M' }] })).toBeUndefined();
    expect(check({ ...lv(), boards: [{ id: 'MDB', name: 'M', sourceKva: 1000, sourceImpedancePct: 5, supply }] })).toBeUndefined();
    expect(check({ ...lv(), boards: [{ id: 'MDB', name: 'M', supply }, { id: 'SUB', name: 'S', upstreamId: 'MDB', supply }] }))!.toBeDefined();
    expect(supplyIncomers({ ...lv(), boards: [{ id: 'MDB', name: 'M', supply }, { id: 'SUB', name: 'S', upstreamId: 'MDB', supply }] }).map((x) => x.board.id)).toEqual(['MDB']);
    expect(supplyIncomers(lv({ faultKa: 12 }))).toEqual([]);
  });

  it('parallel runs, 3 cores and the installation method follow the same rules as a feeder', () => {
    const two = check(lv({ ...supply, incomer: { cableCsaMm2: 16, lengthM: 25, parallel: 2 } }))!;
    expect(two.vdPct).toBeCloseTo(0.495 / 2, 3); // half the drop on two runs
    expect(two.izA).toBeGreaterThan(91.35);
    expect(check(lv({ ...supply, incomer: { cableCsaMm2: 16, lengthM: 25, installMethod: 'D1' } }))!.rating.method).toBe('D1');
  });
});

describe('the incoming cable on a calculated source', () => {
  it('faultSupplyKA is the calculated level (250 kVA, X″d 15 %: 2.43 kA); an assumed source has none', () => {
    const r = check(lv({ kind: 'generator', ratedKva: 250, incomer: { cableCsaMm2: 16, lengthM: 25 } }))!;
    expect(r.faultSupplyKA).toBeCloseTo(2.43, 2);
    expect(r.faultAssumed).toBeUndefined();
    const a = check(lv({ kind: 'generator', incomer: { cableCsaMm2: 16, lengthM: 25 } }))!;
    expect(a.faultSupplyKA).toBeUndefined();
    expect(a.faultAssumed).toBe(true);
  });
});
