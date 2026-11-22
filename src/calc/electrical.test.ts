import { describe, expect, it } from 'vitest';
import {
  cableImpedance,
  designCurrentA,
  evaluateFeeder,
  faultCurrentKA,
  impedanceToBoard,
  selectCable,
  sourceAssumed,
  supplySourceLevel,
  transformerImpedance,
  upstreamVoltageDropPct,
  voltageDropPct,
  zMagnitude
} from './electrical';
import { suggestCable } from './voltageDrop';
import type { Feeder, Project } from '../types';

const SQRT3 = Math.sqrt(3);

function project(feeders: Feeder[], extraBoards: Project['boards'] = []): Project {
  return {
    name: 'Test',
    voltageV: 415,
    frequencyHz: 50,
    ambientC: 45,
    vdLimitPct: 4,
    boards: [{ id: 'MDB', name: 'Main', sourceKva: 1000, sourceImpedancePct: 5 }, ...extraBoards],
    feeders,
    updatedAt: ''
  };
}

function feeder(over: Partial<Feeder>): Feeder {
  return {
    id: 'F1', boardId: 'MDB', name: 'Feeder', loadKw: 50, demandFactor: 1, powerFactor: 0.85,
    lengthM: 50, cableCsaMm2: 50, cores: 4, breakerRatingA: 100, breakerIcuKa: 50, ...over
  };
}

// Load (kW) that draws exactly `amps` on a balanced 415 V circuit.
const kwFor = (amps: number, pf: number) => (SQRT3 * 415 * amps * pf) / 1000;

describe('design current', () => {
  it('matches P / (√3 · U · cosφ)', () => {
    const p = project([]);
    // 100 kW, pf 0.85, 415 V → 163.7 A
    expect(designCurrentA(feeder({ loadKw: 100 }), p)).toBeCloseTo(163.68, 1);
  });

  it('incomer takes the downstream board demand, ignoring its own loadKw', () => {
    const incomer = feeder({ id: 'INC', loadKw: 999, feedsBoardId: 'SMDB' });
    const load = feeder({ id: 'L', boardId: 'SMDB', loadKw: 80, demandFactor: 0.5 });
    const p = project([incomer, load], [{ id: 'SMDB', name: 'Sub', upstreamId: 'MDB' }]);
    expect(designCurrentA(incomer, p)).toBeCloseTo((40 * 1000) / (SQRT3 * 415 * 0.85), 6);
  });
});

describe('transformer and fault level', () => {
  it('1000 kVA, 5% at 415 V → |Z| = 8.61 mΩ, Ik″ = 1.05 × 27.82 ≈ 29.22 kA (c max = 1.05)', () => {
    const z = transformerImpedance(1000, 5, 415);
    expect(zMagnitude(z)).toBeCloseTo(0.00861125, 8);
    expect(z.x / z.r).toBeCloseTo(5, 9);
    expect(faultCurrentKA(z, 415)).toBeCloseTo(29.22, 2);
    expect(faultCurrentKA(z, 415, 1)).toBeCloseTo(27.82, 2); // c = 1
  });

  it('adds cable impedance to the transformer as R+jX phasors', () => {
    const incomer = feeder({ id: 'INC', feedsBoardId: 'SMDB', cableCsaMm2: 95, lengthM: 60 });
    const p = project([incomer], [{ id: 'SMDB', name: 'Sub', upstreamId: 'MDB' }]);
    const zt = transformerImpedance(1000, 5, 415);
    const zc = cableImpedance(95, 60);
    const z = impedanceToBoard(p, 'SMDB');
    expect(z.r).toBeCloseTo(zt.r + zc.r, 12);
    expect(z.x).toBeCloseTo(zt.x + zc.x, 12);
    // Phasor sum is never larger than the old scalar sum.
    expect(zMagnitude(z)).toBeLessThan(zMagnitude(zt) + zMagnitude(zc));
  });

  it('checks breaker Icu against the fault at its own busbar, not the cable end', () => {
    // 25 kA breaker on a long feeder: fault at the cable end is well below
    // 25 kA, but the busbar sees ~29.2 kA, so the breaker is underrated.
    const f = feeder({ lengthM: 150, breakerIcuKa: 25 });
    const r = evaluateFeeder(project([f]), f);
    expect(r.breakerFaultKA).toBeCloseTo(29.22, 1);
    expect(r.endFaultKA).toBeLessThan(25);
    expect(r.icuStatus).toBe('bad');
    expect(r.status).toBe('bad');
  });

  it('treats an ideal zero-impedance source as an unbounded fault level', () => {
    // Ik″ = c × U / (√3 × |Z|); as |Z| → 0, Ik″ → ∞.
    expect(faultCurrentKA({ r: 0, x: 0 }, 415)).toBe(Infinity);
  });
});

describe('single-phase end fault', () => {
  it('flows through phase + neutral (2 × cable Z)', () => {
    // 2.5 mm², 25 m, maximum fault: cable R at 20 °C = 7.41 × 0.025 = 0.18525 Ω, X = 0.0025 Ω per conductor.
    const f = feeder({ loadKw: 3, cores: 2, cableCsaMm2: 2.5, lengthM: 25, breakerRatingA: 20, breakerIcuKa: 10 });
    const zt = transformerImpedance(1000, 5, 415);
    const z = { r: zt.r + 2 * 0.18525, x: zt.x + 2 * 0.0025 };
    const expected = (1.05 * 415) / SQRT3 / zMagnitude(z) / 1000; // ≈ 0.68 kA
    expect(evaluateFeeder(project([f]), f).endFaultKA).toBeCloseTo(expected, 3);
  });
});

describe('voltage drop', () => {
  it('3-phase: √3 · I · L · (R cosφ + X sinφ)', () => {
    // 100 A at unity pf over 100 m of 50 mm²: R = 0.387 × 1.2 = 0.4644 Ω/km
    // → 8.044 V → 1.938 % of 415 V.
    const f = feeder({ loadKw: kwFor(100, 1), powerFactor: 1, lengthM: 100, cableCsaMm2: 50 });
    expect(voltageDropPct(f, project([f]))).toBeCloseTo(1.938, 3);
  });

  it('single-phase (2-core): current on U0, 2·I·Z loop drop against U0', () => {
    // 3 kW at unity pf on 239.6 V → 12.52 A; over 25 m of 2.5 mm²
    // (R = 7.41 × 1.2 = 8.892 Ω/km): 2 × 12.52 × 0.025 × 8.892 = 5.567 V
    // → 2.323 % of 239.6 V.
    const f = feeder({ loadKw: 3, powerFactor: 1, cores: 2, cableCsaMm2: 2.5, lengthM: 25 });
    const p = project([f]);
    expect(designCurrentA(f, p)).toBeCloseTo(3000 / (415 / SQRT3), 9);
    expect(voltageDropPct(f, p)).toBeCloseTo(2.323, 3);
  });

  it('adds the incomer drop to feeders on a sub-board', () => {
    const incomer = feeder({ id: 'INC', feedsBoardId: 'SMDB', cableCsaMm2: 70, lengthM: 80 });
    const final = feeder({ id: 'FIN', boardId: 'SMDB', loadKw: 60, cableCsaMm2: 25, lengthM: 40, breakerRatingA: 100 });
    const onMain = feeder({ id: 'MAIN', loadKw: 20, cableCsaMm2: 16, breakerRatingA: 63 });
    const p = project([incomer, final, onMain], [{ id: 'SMDB', name: 'Sub', upstreamId: 'MDB' }]);

    expect(upstreamVoltageDropPct(p, 'MDB')).toBe(0);
    expect(upstreamVoltageDropPct(p, 'SMDB')).toBeCloseTo(voltageDropPct(incomer, p), 12);

    const r = evaluateFeeder(p, final);
    expect(r.vdUpstreamPct).toBeGreaterThan(0);
    expect(r.vdTotalPct).toBeCloseTo(voltageDropPct(incomer, p) + voltageDropPct(final, p), 12);
    expect(evaluateFeeder(p, onMain).vdUpstreamPct).toBe(0);
  });

  it('fails a feeder whose own drop is fine but total drop exceeds the limit', () => {
    const incomer = feeder({ id: 'INC', feedsBoardId: 'SMDB', cableCsaMm2: 35, lengthM: 200, breakerRatingA: 125 });
    const final = feeder({ id: 'FIN', boardId: 'SMDB', loadKw: 55, cableCsaMm2: 35, lengthM: 90, breakerRatingA: 125 });
    const p = project([incomer, final], [{ id: 'SMDB', name: 'Sub', upstreamId: 'MDB' }]);
    const r = evaluateFeeder(p, final);
    expect(r.vdPct).toBeLessThan(p.vdLimitPct);
    expect(r.vdTotalPct).toBeGreaterThan(p.vdLimitPct);
    expect(r.vdStatus).toBe('bad');
  });
});

describe('overload protection Ib ≤ In ≤ Iz', () => {
  it('fails when the breaker is larger than the cable rating, even at light load', () => {
    // 50 mm² at 45 °C: Iz = 200 × 0.87 = 174 A < 250 A breaker.
    const f = feeder({ loadKw: 20, cableCsaMm2: 50, breakerRatingA: 250 });
    const r = evaluateFeeder(project([f]), f);
    expect(r.ampacity).toBeCloseTo(174, 6);
    expect(r.ampacityStatus).toBe('ok'); // Iz ≥ Ib on its own passes...
    expect(r.protectionStatus).toBe('bad'); // ...but the cable isn't protected
    expect(r.status).toBe('bad');
  });

  it('passes a correctly coordinated circuit', () => {
    const f = feeder({ loadKw: 50, cableCsaMm2: 50, breakerRatingA: 125, lengthM: 30 });
    const r = evaluateFeeder(project([f]), f);
    expect(r.protectionStatus).toBe('ok');
    expect(r.status).toBe('ok');
  });
});

describe('cable selection', () => {
  it('sizes for the breaker rating, not just the design current', () => {
    expect(selectCable(50, 10, 415, 4, 0.85, 45, 4)).toBe(6); // Iz 60 × 0.87 = 52.2 A ≥ 50 A
    expect(selectCable(50, 10, 415, 4, 0.85, 45, 4, 160)).toBe(50); // needs Iz ≥ 160 A → 174 A
  });

  it('picks a larger cable when less voltage-drop budget is left', () => {
    const full = selectCable(100, 120, 415, 4, 0.85, 45, 4)!;
    const tight = selectCable(100, 120, 415, 4, 0.85, 45, 1.5)!;
    expect(tight).toBeGreaterThan(full);
  });

  it('returns null when nothing fits', () => {
    expect(selectCable(500, 2000, 415, 4, 0.85, 45, 4)).toBeNull();
  });

  it('selects the first cable that satisfies both Iz and voltage drop', () => {
    // At 45 °C: Iz(35) = 168 × 0.87 = 146.16 A, but ΔV(35) = √3 × 100 × 0.1 × (0.524 × 1.2) / 415 = 2.62 %;
    // 50 mm² gives ΔV = √3 × 100 × 0.1 × (0.387 × 1.2) / 415 = 1.94 %, so it is the first size within 2 %.
    expect(selectCable(100, 100, 415, 4, 1, 45, 2, 100)).toBe(50);
  });
});

describe('voltage-drop cable suggestion', () => {
  it('returns the hand-checked first larger cable within the total limit', () => {
    const f = feeder({ loadKw: kwFor(100, 1), powerFactor: 1, lengthM: 100, cableCsaMm2: 25 });
    const p = { ...project([f]), vdLimitPct: 2 };
    const result = suggestCable(p, f)!;
    // 35 mm² gives 2.62 %; 50 mm² gives √3 × 100 A × 0.1 km × 0.4644 Ω/km / 415 V × 100 = 1.94 %.
    expect(result.csaMm2).toBe(50);
    expect(result.totalPct).toBeCloseTo(1.938, 3);
  });
});

describe('assumed source (no transformer data and no supply fault level)', () => {
  const feeder = (over: Partial<Feeder> = {}): Feeder => ({ id: 'F', boardId: 'MDB', name: 'F', loadKw: 20, demandFactor: 1, powerFactor: 0.9, lengthM: 30, cableCsaMm2: 35, cores: 4, breakerRatingA: 63, breakerIcuKa: 36, ...over });
  const assumed = (b: Project['boards'][number], fs: Feeder[] = [feeder()]): Project => ({ ...project(fs), boards: [b] });

  it('sourceAssumed: only a root with neither a transformer nor a fault level, walked from below', () => {
    expect(sourceAssumed(assumed({ id: 'MDB', name: 'M' }), 'MDB')).toBe(true);
    expect(sourceAssumed(assumed({ id: 'MDB', name: 'M', sourceKva: 1000 }), 'MDB')).toBe(true); // no impedance
    expect(sourceAssumed(assumed({ id: 'MDB', name: 'M', supply: { faultKa: 25 } }), 'MDB')).toBe(false);
    expect(sourceAssumed(assumed({ id: 'MDB', name: 'M', sourceKva: 1000, sourceImpedancePct: 5 }), 'MDB')).toBe(false);
    const below = { ...assumed({ id: 'MDB', name: 'M' }), boards: [{ id: 'MDB', name: 'M' }, { id: 'SUB', name: 'S', upstreamId: 'MDB' }] };
    expect(sourceAssumed(below, 'SUB')).toBe(true);
    expect(sourceAssumed({ ...below, boards: [{ id: 'MDB', name: 'M', supply: { faultKa: 25 } }, below.boards[1]] }, 'SUB')).toBe(false);
    expect(sourceAssumed(below, 'NOPE')).toBe(true);
    expect(sourceAssumed({ ...below, boards: [{ id: 'A', name: 'A', upstreamId: 'B' }, { id: 'B', name: 'B', upstreamId: 'A' }] }, 'A')).toBe(true);
  });
  it('icuStatus is warn (not verified) with faultAssumed, even when Icu is far below the placeholder fault', () => {
    const r = evaluateFeeder(assumed({ id: 'MDB', name: 'M' }, [feeder({ breakerIcuKa: 6 })]), feeder({ breakerIcuKa: 6 }));
    expect(r.breakerFaultKA).toBeGreaterThan(20); // placeholder 25.2 kA
    expect(r.icuStatus).toBe('warn');
    expect(r.faultAssumed).toBe(true);
    expect(r.status).not.toBe('ok');
  });
  it('a transformer or a supply fault level: same statuses as before and no faultAssumed key', () => {
    for (const b of [{ id: 'MDB', name: 'M', sourceKva: 1000, sourceImpedancePct: 5 }, { id: 'MDB', name: 'M', supply: { faultKa: 10 } }]) {
      const ok = evaluateFeeder(assumed(b), feeder());
      expect(ok.icuStatus).toBe('ok');
      expect('faultAssumed' in ok).toBe(false);
      const weak = feeder({ breakerIcuKa: 6 });
      expect(evaluateFeeder(assumed(b, [weak]), weak).icuStatus).toBe('bad');
    }
  });
  it('a supply fault level that is not above zero is no fault level: assumed, placeholder impedance', () => {
    const neg = assumed({ id: 'MDB', name: 'M', supply: { faultKa: -5 } });
    expect(sourceAssumed(neg, 'MDB')).toBe(true);
    expect(evaluateFeeder(neg, feeder()).breakerFaultKA).toBeCloseTo(evaluateFeeder(assumed({ id: 'MDB', name: 'M' }), feeder()).breakerFaultKA, 6);
  });
});

describe('values given from upstream (first board on an LV supply)', () => {
  // 415 V, Ik 12 kA with X/R 3 at the supply point, 1.6 % already used there, incoming cable 4C × 16 mm² copper, 25 m
  // (R20 1.15, X 0.085 Ω/km; operating R 1.2 × 1.15 = 1.38 Ω/km), a 24 kW load at PF 0.9 on the board (Ib 37.1 A).
  const given = { faultKa: 12, ratingA: 63, xr: 3, vdUsedPct: 1.6, incomer: { cableCsaMm2: 16, lengthM: 25 } };
  const load = (over: Partial<Feeder> = {}): Feeder => ({ id: 'F', boardId: 'MDB', name: 'F', loadKw: 24, demandFactor: 1, powerFactor: 0.9, lengthM: 20, cableCsaMm2: 10, cores: 4, breakerRatingA: 40, breakerIcuKa: 36, ...over });
  const lv = (supply: NonNullable<Project['boards'][number]['supply']>, f = load()): Project => ({ ...project([f]), boards: [{ id: 'MDB', name: 'M', supply }] });

  it('B1 fault level: supply impedance with its X/R plus the incoming cable', () => {
    // Zs = 1.05 × 415 ÷ (√3 × 12 kA) = 0.020965 Ω; X/R 3: R 0.006630, X 0.019888. Cable at 20 °C: R 1.15 × 0.025 = 0.02875, X 0.085 × 0.025 = 0.002125.
    // Sum R 0.035380, X 0.022013: |Z| = 0.041670 Ω, Ik = 1.05 × 415 ÷ (√3 × 0.041670) = 6.04 kA.
    const z = impedanceToBoard(lv(given), 'MDB');
    expect(z.r).toBeCloseTo(0.03538, 5);
    expect(z.x).toBeCloseTo(0.022013, 5);
    expect(faultCurrentKA(z, 415)).toBeCloseTo(6.04, 2);
    expect(evaluateFeeder(lv(given), load()).breakerFaultKA).toBeCloseTo(6.04, 2);
    // Only the X/R: same |Z| and R + jX split as the supply alone with X/R 3: 12 kA at the busbar.
    expect(faultCurrentKA(impedanceToBoard(lv({ faultKa: 12, xr: 3 }), 'MDB'), 415)).toBeCloseTo(12, 6);
    // The incoming cable is not added to the placeholder source (no fault level: still assumed).
    expect(sourceAssumed(lv({ incomer: given.incomer }), 'MDB')).toBe(true);
    expect(impedanceToBoard(lv({ incomer: given.incomer }), 'MDB')).toEqual({ r: 0, x: 0.01 });
  });

  it('B2 voltage drop: the drop used upstream plus the incoming cable, added to every circuit', () => {
    // Incoming cable: √3 × 37.1 A × 0.025 km × (1.38 × 0.9 + 0.085 × 0.4359) ÷ 415 V = 0.495 %; busbar 1.6 + 0.495 = 2.095 %.
    // The 10 mm² circuit, 20 m: √3 × 37.1 × 0.020 × (2.196 × 0.9 + 0.09 × 0.4359) ÷ 415 = 0.624 %; total 2.719 %.
    const p = lv(given);
    expect(upstreamVoltageDropPct(p, 'MDB')).toBeCloseTo(2.095, 3);
    const r = evaluateFeeder(p, load());
    expect(r.vdUpstreamPct).toBeCloseTo(2.095, 3);
    expect(r.vdPct).toBeCloseTo(0.624, 3);
    expect(r.vdTotalPct).toBeCloseTo(2.719, 3);
    expect(upstreamVoltageDropPct(lv({ faultKa: 12, vdUsedPct: 1.6 }), 'MDB')).toBe(1.6); // the given drop alone
    expect(upstreamVoltageDropPct(lv({ faultKa: 12, vdUsedPct: -1 }), 'MDB')).toBe(0); // never a credit
    // The sub-boards below add their own incomers to the busbar's drop (here 10 kW only is on the supply's cable).
    const sub: Project = { ...p, boards: [...p.boards, { id: 'SUB', name: 'S', upstreamId: 'MDB' }], feeders: [{ ...load({ id: 'INC', feedsBoardId: 'SUB', lengthM: 10, cableCsaMm2: 16 }) }, load({ id: 'L2', boardId: 'SUB', loadKw: 10 })] };
    expect(upstreamVoltageDropPct(sub, 'SUB')).toBeCloseTo(upstreamVoltageDropPct(sub, 'MDB') + voltageDropPct(sub.feeders[0], sub), 9);
    expect(upstreamVoltageDropPct(sub, 'MDB')).toBeGreaterThan(1.6 + 0.2); // 1.6 % used + the cable's own drop at 10 kW (about 0.21 %)
  });

  it('a project that gives none of these values, and a transformer board, are unchanged', () => {
    const plain = lv({ faultKa: 12, ratingA: 63 });
    expect(upstreamVoltageDropPct(plain, 'MDB')).toBe(0);
    // Pinned to the step A figures, not to the new code: no upstream drop, 12 kA at the busbar, and no keys the result did not have.
    const r = evaluateFeeder(plain, load());
    expect(r.vdUpstreamPct).toBe(0);
    expect(r.vdTotalPct).toBe(r.vdPct);
    expect(r.vdPct).toBeCloseTo(0.624, 3);
    expect(r.breakerFaultKA).toBeCloseTo(12, 6);
    expect(Object.keys(r).sort()).toEqual(['ampacity', 'ampacityStatus', 'breakerFaultKA', 'endFaultKA', 'feeder', 'ib', 'icuStatus', 'limits', 'loadingPct', 'protectionStatus', 'rating', 'status', 'tray', 'vdPct', 'vdStatus', 'vdTotalPct', 'vdUpstreamPct']);
    expect(evaluateFeeder({ ...plain, boards: [{ id: 'MDB', name: 'M', supply: { faultKa: 12, ratingA: 63, fedBy: undefined } }] }, load())).toEqual(r);
    expect(faultCurrentKA(impedanceToBoard(plain, 'MDB'), 415)).toBeCloseTo(12, 6); // default X/R: |Z| is the stated level
    // With a transformer, the supply block and all its given values are ignored, as before.
    const tx: Project = { ...project([load()]), boards: [{ id: 'MDB', name: 'M', sourceKva: 1000, sourceImpedancePct: 5, supply: given }] };
    expect(evaluateFeeder(tx, load())).toEqual(evaluateFeeder(project([load()]), load()));
    expect(upstreamVoltageDropPct(tx, 'MDB')).toBe(0);
  });
});

describe('a source with its rating typed (first board on an LV supply, no fault level)', () => {
  const load = (): Feeder => ({ id: 'F', boardId: 'MDB', name: 'F', loadKw: 24, demandFactor: 1, powerFactor: 0.9, lengthM: 20, cableCsaMm2: 10, cores: 4, breakerRatingA: 40, breakerIcuKa: 36 });
  const lv = (supply: NonNullable<Project['boards'][number]['supply']>): Project => ({ ...project([load()]), boards: [{ id: 'MDB', name: 'M', supply }] });
  const ik = (p: Project) => faultCurrentKA(impedanceToBoard(p, 'MDB'), 415);
  const level = (p: Project) => supplySourceLevel(p, p.boards[0]);
  // 415 V: 250 kVA gives I = 250 000 ÷ (√3 × 415) = 347.8 A; 100 kVA gives 139.1 A.

  it('a generator: Ik″ = 1.05 × I ÷ x″d, from 250 kVA and the default X″d 15 %', () => {
    // 1.05 × 347.8 ÷ 0.15 = 2434 A. By impedance: Z = 415² × 0.15 ÷ 250 000 = 0.103335 Ω; Ik = 1.05 × 415 ÷ (√3 × 0.103335) = 2.43 kA.
    const p = lv({ kind: 'generator', ratedKva: 250 });
    expect(ik(p)).toBeCloseTo(2.43, 2);
    expect(zMagnitude(level(p).z)).toBeCloseTo(0.103335, 6);
    expect(level(p)).toMatchObject({ basis: 'calculated', text: '250 kVA · X″d 15 %' });
    expect(level(p).ka).toBeCloseTo(2.43, 2);
    expect(evaluateFeeder(p, load()).breakerFaultKA).toBeCloseTo(2.43, 2);
    // The default X/R of a generator is 10: R = 0.103335 ÷ √101 = 0.010282, X = 0.10282.
    expect(level(p).z.x / level(p).z.r).toBeCloseTo(10, 6);
  });
  it('a typed X″d and a typed X/R: X″d 20 % gives 1.05 × 347.8 ÷ 0.20 = 1.83 kA; X/R changes the split, not the level', () => {
    expect(ik(lv({ kind: 'generator', ratedKva: 250, xdPct: 20 }))).toBeCloseTo(1.83, 2);
    expect(level(lv({ kind: 'generator', ratedKva: 250, xdPct: 20 })).text).toBe('250 kVA · X″d 20 %');
    const p = lv({ kind: 'generator', ratedKva: 250, xr: 5 });
    expect(ik(p)).toBeCloseTo(2.43, 2);
    expect(level(p).z.x / level(p).z.r).toBeCloseTo(5, 6);
  });
  it('an incoming cable is added to a calculated source, so the board sees less', () => {
    // 16 mm² × 25 m at 20 °C: R 0.02875, X 0.002125 Ω. Source (X/R 10): R 0.010282, X 0.10282. Sum R 0.039032, X 0.104945:
    // |Z| = 0.11199 Ω, Ik = 1.05 × 415 ÷ (√3 × 0.11199) = 2.25 kA.
    const p = lv({ kind: 'generator', ratedKva: 250, incomer: { cableCsaMm2: 16, lengthM: 25 } });
    expect(ik(p)).toBeCloseTo(2.25, 2);
    expect(ik(p)).toBeLessThan(ik(lv({ kind: 'generator', ratedKva: 250 })));
  });
  it('wind: a generator without a fault multiple, an inverter with one', () => {
    expect(ik(lv({ kind: 'wind', ratedKva: 250 }))).toBeCloseTo(2.43, 2);
    // 100 kVA, k 1.5: 1.5 × 139.1 A = 208.7 A.
    const p = lv({ kind: 'wind', ratedKva: 100, faultMultiple: 1.5 });
    expect(ik(p)).toBeCloseTo(0.209, 3);
    expect(level(p).text).toBe('100 kVA · 1.5 × rated');
  });
  it('solar PV and battery: Ik = k × I_rated with no voltage factor (100 kVA, k 1.2 gives 1.2 × 139.1 = 166.9 A)', () => {
    for (const kind of ['pv', 'battery'] as const) {
      const p = lv({ kind, ratedKva: 100 });
      expect(level(p).ka).toBeCloseTo(0.1669, 4);
      expect(ik(p)).toBeCloseTo(0.1669, 4); // |Z| = 1.05 × 415 ÷ (√3 × 166.9) = 1.5075 Ω gives it back through the same formula
      expect(level(p).z.x).toBe(0);
      expect(level(p).text).toBe('100 kVA · 1.2 × rated');
    }
    expect(ik(lv({ kind: 'pv', ratedKva: 100, faultMultiple: 1.5 }))).toBeCloseTo(0.2087, 4); // 1.5 × 139.1 A
  });
  it('a typed fault level wins over the rating; utility, other and a source without a rating stay assumed', () => {
    const typed = lv({ kind: 'generator', ratedKva: 250, faultKa: 12 });
    expect(level(typed)).toMatchObject({ basis: 'given', ka: 12 });
    expect(ik(typed)).toBeCloseTo(12, 6);
    for (const supply of [{ kind: 'utility' as const, ratedKva: 250 }, { kind: 'other' as const, ratedKva: 250 }, { ratedKva: 250 }, { kind: 'generator' as const }, { kind: 'pv' as const, ratedKva: 0 }]) {
      const p = lv(supply);
      expect(level(p).basis).toBe('assumed');
      expect(sourceAssumed(p, 'MDB')).toBe(true);
      expect(impedanceToBoard(p, 'MDB')).toEqual({ r: 0, x: 0.01 });
    }
    // A board outside the project is the source: its own rating is not read.
    expect(level(lv({ kind: 'generator', ratedKva: 250, fedBy: 'board' })).basis).toBe('assumed');
  });
  it('a calculated source is not "assumed": checks run, and the result has no faultAssumed key', () => {
    const p = lv({ kind: 'generator', ratedKva: 250 });
    expect(sourceAssumed(p, 'MDB')).toBe(false);
    const r = evaluateFeeder(p, load());
    expect('faultAssumed' in r).toBe(false);
    // Icu 36 kA against 2.43 kA: ok, and a breaker of 2 kA is now a real failure.
    expect(r.icuStatus).toBe('ok');
    const weak = { ...load(), breakerIcuKa: 2 };
    expect(evaluateFeeder({ ...p, feeders: [weak] }, weak).icuStatus).toBe('bad');
  });
  it('a transformer board ignores the rating', () => {
    const tx: Project = { ...project([load()]), boards: [{ id: 'MDB', name: 'M', sourceKva: 1000, sourceImpedancePct: 5, supply: { kind: 'generator', ratedKva: 250 } }] };
    expect(evaluateFeeder(tx, load())).toEqual(evaluateFeeder(project([load()]), load()));
  });
  it('a project with none of the new values is unchanged', () => {
    for (const supply of [{ kind: 'generator' as const }, { faultKa: 12 }, {}]) {
      const a = lv(supply), b = lv({ ...supply, ratedKva: undefined, xdPct: undefined, faultMultiple: undefined });
      expect(evaluateFeeder(a, load())).toEqual(evaluateFeeder(b, load()));
    }
  });
});
