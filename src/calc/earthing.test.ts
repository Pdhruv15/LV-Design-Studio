import { describe, expect, it } from 'vitest';
import { defaultCpcMm2, earthLoopPath, earthLoopToBoard, evaluateEarthing, instantaneousTripA, requiredDisconnectionS } from './earthing';
import { supplyImpedance, transformerImpedance, zMagnitude } from './electrical';
import type { Feeder, Project } from '../types';

const U0 = 415 / Math.sqrt(3);

function feeder(over: Partial<Feeder>): Feeder {
  return {
    id: 'F', boardId: 'MDB', name: 'F', loadKw: 5, demandFactor: 1, powerFactor: 0.9, lengthM: 50,
    cableCsaMm2: 4, cores: 4, breakerRatingA: 32, breakerIcuKa: 36, ...over
  };
}

const project = (feeders: Feeder[]): Project => ({
  name: 'T', voltageV: 415, frequencyHz: 50, ambientC: 45, vdLimitPct: 4, updatedAt: '',
  boards: [
    { id: 'MDB', name: 'M', sourceKva: 1000, sourceImpedancePct: 5 },
    { id: 'SUB', name: 'S', upstreamId: 'MDB' }
  ],
  feeders
});

describe('protective conductor size (IEC 60364-5-54 Table 54.2)', () => {
  it('follows S / 16 / S÷2', () => {
    expect(defaultCpcMm2(10)).toBe(10);
    expect(defaultCpcMm2(16)).toBe(16);
    expect(defaultCpcMm2(25)).toBe(16);
    expect(defaultCpcMm2(35)).toBe(16);
    expect(defaultCpcMm2(95)).toBe(50); // 47.5 → next standard 50
    expect(defaultCpcMm2(240)).toBe(120);
  });
});

describe('trip thresholds and required times', () => {
  it('uses the top of the magnetic band for MCBs and the Im setting for MCCBs', () => {
    expect(instantaneousTripA(feeder({ breakerType: 'B', breakerRatingA: 20 }))).toBe(100);
    expect(instantaneousTripA(feeder({ breakerRatingA: 32 }))).toBe(320); // defaults to type C
    expect(instantaneousTripA(feeder({ breakerRatingA: 250 }))).toBe(2500); // defaults to MCCB, 10 In
    expect(instantaneousTripA(feeder({ breakerRatingA: 250, breakerImMultiple: 6 }))).toBe(1500);
  });

  it('0.4 s for final circuits ≤ 63 A, 5 s otherwise', () => {
    expect(requiredDisconnectionS(feeder({ breakerRatingA: 32 }))).toBe(0.4);
    expect(requiredDisconnectionS(feeder({ breakerRatingA: 100 }))).toBe(5);
    expect(requiredDisconnectionS(feeder({ breakerRatingA: 32, feedsBoardId: 'SUB' }))).toBe(5);
  });
});

describe('earth fault loop', () => {
  it('uses a circuit RCD five-times residual-current threshold', () => {
    const f = feeder({ rcdMa: 30, lengthM: 120 });
    const r = evaluateEarthing(project([f]), f);
    // Ia = 5 × IΔn = 5 × 30 mA / 1000 = 0.15 A; max Zs = 0.95 × U0 / Ia.
    expect(r.tripA).toBeCloseTo(0.15, 12);
    expect(r.maxZsOhm).toBeCloseTo((0.95 * U0) / 0.15, 9);
    expect(r.disconnection).toBe('ok');
  });

  it('Zs = transformer + (R1 + R2) of the circuit; If = 0.95 U0 / Zs', () => {
    // 4 mm² with 4 mm² CPC, 50 m: R1+R2 = 2 × 4.61 × 1.2 × 0.05 = 0.5532 Ω, X = 0.0045 Ω
    const f = feeder({});
    const r = evaluateEarthing(project([f]), f);
    const zt = transformerImpedance(1000, 5, 415);
    const zs = Math.hypot(zt.r + 0.5532, zt.x + 0.0045);
    expect(r.cpcMm2).toBe(4);
    expect(r.zsOhm).toBeCloseTo(zs, 6);
    expect(r.faultA).toBeCloseTo((0.95 * U0) / zs, 3); // ≈ 390 A
    expect(r.tripA).toBe(320);
    expect(r.disconnection).toBe('ok'); // 390 A ≥ 320 A → instantaneous
    expect(r.maxZsOhm).toBeCloseTo((0.95 * U0) / 320, 9);
  });

  it('fails a long 0.4 s circuit that no longer reaches the magnetic trip', () => {
    const f = feeder({ lengthM: 120 });
    const r = evaluateEarthing(project([f]), f);
    expect(r.faultA).toBeLessThan(r.tripA);
    expect(r.disconnection).toBe('bad');
    expect(r.status).toBe('bad');
  });

  it('only warns for a 5 s circuit relying on the thermal region', () => {
    const f = feeder({ breakerRatingA: 100, cableCsaMm2: 35, lengthM: 400 });
    const r = evaluateEarthing(project([f]), f);
    expect(r.faultA).toBeLessThan(r.tripA);
    expect(r.disconnection).toBe('warn');
  });

  it('adds each incomer loop (phase + CPC) for sub-boards', () => {
    const inc = feeder({ id: 'INC', feedsBoardId: 'SUB', cableCsaMm2: 95, lengthM: 100, breakerRatingA: 250 });
    const p = project([inc]);
    const main = earthLoopToBoard(p, 'MDB');
    const sub = earthLoopToBoard(p, 'SUB');
    // 95 mm² phase (0.193) + 50 mm² CPC (0.387), × 1.2, × 0.1 km
    expect(sub.r - main.r).toBeCloseTo((0.193 + 0.387) * 1.2 * 0.1, 9);
    expect(zMagnitude(sub)).toBeGreaterThan(zMagnitude(main));
  });

  it('adiabatic check: S ≥ If·√t / 143', () => {
    const f = feeder({ cableCsaMm2: 1.5, lengthM: 2, breakerRatingA: 16 });
    const r = evaluateEarthing(project([f]), f);
    expect(r.adiabaticMinMm2).toBeCloseTo((r.faultA * Math.sqrt(0.1)) / 143, 9);
    expect(r.adiabatic).toBe(r.cpcMm2 >= r.adiabaticMinMm2 ? 'ok' : 'bad');
  });
});

describe('earth fault loop with values given from upstream (first board on an LV supply)', () => {
  // Incoming cable 4C × 16 mm² copper, 25 m, CPC 16 mm²: loop R (1.38 + 1.38) × 0.025 = 0.069 Ω, X 0.085 × 0.025 = 0.002125 Ω.
  const incomer = { cableCsaMm2: 16, lengthM: 25 };
  const lv = (supply: NonNullable<Project['boards'][number]['supply']>): Project => ({ ...project([feeder({})]), boards: [{ id: 'MDB', name: 'M', supply }] });
  it('a typed Ze is purely resistive, not estimated and not missing; the incoming cable loop is added', () => {
    const e = earthLoopPath(lv({ faultKa: 12, zeOhm: 0.08, incomer }), 'MDB');
    expect(e.z.r).toBeCloseTo(0.08 + 0.069, 6); // 0.149 Ω
    expect(e.z.x).toBeCloseTo(0.002125, 6);
    expect(e.estimated).toBeUndefined();
    expect(e.missing).toBeUndefined();
    expect(earthLoopPath(lv({ zeOhm: 0.08 }), 'MDB')).toEqual({ z: { r: 0.08, x: 0 } }); // no fault level needed
    const r = evaluateEarthing(lv({ faultKa: 12, zeOhm: 0.08, incomer }), feeder({}));
    expect(r.sourceEstimated).toBeUndefined();
    expect(r.zeOhm).toBeCloseTo(zMagnitude({ r: 0.149, x: 0.002125 }), 6);
  });
  it('without Ze: estimated from the minimum fault level when given, else the fault level, with the X/R', () => {
    // Ik,min 8 kA: Z = 1.05 × 415 ÷ (√3 × 8 kA) = 0.031447 Ω; X/R 3: R 0.009944, X 0.029833; plus the cable loop: R 0.078944, X 0.031958.
    const min = earthLoopPath(lv({ faultKa: 12, faultKaMin: 8, xr: 3, incomer }), 'MDB');
    expect(min.z.r).toBeCloseTo(0.078944, 5);
    expect(min.z.x).toBeCloseTo(0.031958, 5);
    expect(min.estimated).toMatch(/minimum fault level/);
    // Ik 12 kA, X/R 3: Z 0.020965 Ω, R 0.006630, X 0.019888.
    expect(earthLoopPath(lv({ faultKa: 12, xr: 3 }), 'MDB').z.r).toBeCloseTo(0.00663, 5);
    expect(earthLoopPath(lv({ faultKa: 12, xr: 3 }), 'MDB').z.x).toBeCloseTo(0.019888, 5);
    expect(earthLoopPath(lv({ faultKaMin: 8 }), 'MDB').estimated).toMatch(/minimum fault level/);
  });
  it('unchanged: the fault level alone is the step A estimate; no source data stays missing; a transformer board ignores the values', () => {
    const a = earthLoopPath(lv({ faultKa: 25 }), 'MDB');
    expect(a).toEqual({ z: supplyImpedance(25, 415), estimated: 'Ze estimated from the supply fault level at MDB' });
    expect(earthLoopPath(lv({ ratingA: 400 }), 'MDB').missing).toMatch(/no source data/);
    expect(earthLoopPath(lv({ ratingA: 400, incomer }), 'MDB').missing).toMatch(/no source data/);
    expect(earthLoopPath(lv({ ratingA: 400, incomer }), 'MDB').z.r).toBeCloseTo(0.069, 6); // the known part: the incoming cable loop, never dropped
    expect(earthLoopPath(lv({ ratingA: 400 }), 'MDB').z).toEqual({ r: 0, x: 0 });
    const tx: Project = { ...project([feeder({})]), boards: [{ id: 'MDB', name: 'M', sourceKva: 1000, sourceImpedancePct: 5, supply: { zeOhm: 5, faultKaMin: 1, xr: 20, incomer } }] };
    expect(earthLoopPath(tx, 'MDB')).toEqual(earthLoopPath(project([feeder({})]), 'MDB'));
  });
});
