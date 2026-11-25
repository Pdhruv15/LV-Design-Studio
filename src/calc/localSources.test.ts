import { describe, expect, it } from 'vitest';
import { cableImpedance, evaluateFeeder, faultCurrentKA, impedanceToBoard, localSources, parallelZ, transformerImpedance, type Impedance } from './electrical';
import { earthLoopToBoard } from './earthing';
import { puElements, puFaultAt } from './perUnit';
import type { Board, Feeder, Project } from '../types';

const V = 415;
const add = (a: Impedance, b: Impedance): Impedance => ({ r: a.r + b.r, x: a.x + b.x });
const ka = (z: Impedance) => faultCurrentKA(z, V);
const way = (id: string, to: string, lengthM = 40): Feeder => ({ id, boardId: 'MDB', name: id, feedsBoardId: to, loadKw: 0, demandFactor: 1, powerFactor: 0.9, lengthM, cableCsaMm2: 240, cores: 4, breakerRatingA: 400, breakerIcuKa: 50 });
const motor = (id: string, boardId: string, over: Partial<Feeder> = {}): Feeder => ({ id, boardId, name: 'Pump', loadType: 'motor', loadKw: 100, demandFactor: 1, powerFactor: 0.85, lengthM: 30, cableCsaMm2: 95, cores: 4, breakerRatingA: 250, breakerIcuKa: 36, ...over });
const boards = (over: Partial<Record<string, Partial<Board>>> = {}): Board[] => [
  { id: 'MDB', name: 'M', sourceKva: 1000, sourceImpedancePct: 5, ...over.MDB },
  { id: 'MCC', name: 'C', upstreamId: 'MDB', ...over.MCC },
  { id: 'DB2', name: 'D', upstreamId: 'MDB', ...over.DB2 }
];
const project = (feeders: Feeder[], over: Partial<Project> = {}, b: Board[] = boards()): Project =>
  ({ name: 'T', voltageV: V, frequencyHz: 50, ambientC: 40, vdLimitPct: 4, updatedAt: '', boards: b, feeders, ...over });

const ZT = transformerImpedance(1000, 5, V);
const ZG = transformerImpedance(800, 15, V, 10);
const cab = (f: Feeder) => cableImpedance(f.cableCsaMm2, f.lengthM, 1);
const toMcc = way('W1', 'MCC'), toDb2 = way('W2', 'DB2', 60);
const zMotor = (f: Feeder): Impedance => {
  const kva = f.loadKw / f.powerFactor, zm = (V * V) / (5 * kva * 1000), x = zm / Math.sqrt(1 + 0.42 * 0.42);
  return add({ r: 0.42 * x, x }, cab(f));
};

describe('a generator in parallel with the supply', () => {
  it('is not a fault source unless marked as running in parallel', () => {
    const p = project([toMcc, toDb2], {}, boards({ MDB: { standby: { kva: 800 } } }));
    expect(localSources(p, p.boards[0])).toEqual([]);
    expect(ka(impedanceToBoard(p, 'MDB'))).toBeCloseTo(ka(ZT), 9); // 29.2 kA
    expect(ka(ZT)).toBeCloseTo(29.22, 2);
  });
  it('on the main board: transformer and generator in parallel, 29.2 kA and 7.8 kA give 36.9 kA', () => {
    const p = project([toMcc, toDb2], {}, boards({ MDB: { standby: { kva: 800, parallel: true } } }));
    expect(ka(ZG)).toBeCloseTo(7.79, 2);
    expect(ka(impedanceToBoard(p, 'MDB'))).toBeCloseTo(ka(parallelZ([ZT, ZG])), 9);
    expect(ka(impedanceToBoard(p, 'MDB'))).toBeGreaterThan(36.5);
    expect(ka(impedanceToBoard(p, 'MDB'))).toBeLessThan(ka(ZT) + ka(ZG) + 1e-9);
    // Below it: the joined sources behind the cable.
    expect(ka(impedanceToBoard(p, 'MCC'))).toBeCloseTo(ka(add(parallelZ([ZT, ZG]), cab(toMcc))), 9);
  });
  it('on a sub-board: its own board sees it directly, the main board and the other sub-board through the cable', () => {
    const p = project([toMcc, toDb2], {}, boards({ MCC: { standby: { kva: 800, parallel: true } } }));
    expect(ka(impedanceToBoard(p, 'MCC'))).toBeCloseTo(ka(parallelZ([add(ZT, cab(toMcc)), ZG])), 9);
    const atMdb = parallelZ([ZT, add(cab(toMcc), ZG)]);
    expect(ka(impedanceToBoard(p, 'MDB'))).toBeCloseTo(ka(atMdb), 9);
    expect(ka(impedanceToBoard(p, 'DB2'))).toBeCloseTo(ka(add(atMdb, cab(toDb2))), 9);
  });
  it('leaves the earth fault loop (minimum current) alone', () => {
    const plain = project([toMcc, toDb2]), gen = project([toMcc, toDb2], {}, boards({ MDB: { standby: { kva: 800, parallel: true } } }));
    expect(earthLoopToBoard(gen, 'MCC')).toEqual(earthLoopToBoard(plain, 'MCC'));
  });
});

describe('motor contribution to the fault level', () => {
  const m1 = motor('M1', 'MCC');
  it('is off unless the project asks for it: the results are the supply path alone', () => {
    const p = project([toMcc, toDb2, m1]);
    expect(localSources(p, p.boards[1])).toEqual([]);
    expect(ka(impedanceToBoard(p, 'MCC'))).toBeCloseTo(ka(add(ZT, cab(toMcc))), 9);
  });
  it('a 100 kW motor (117.6 kVA) gives 5 × 163.7 A × 1.05 = 0.86 kA at its terminals', () => {
    const z = zMotor({ ...m1, lengthM: 0 });
    expect(ka(z)).toBeCloseTo(0.859, 3);
    expect(z.r / z.x).toBeCloseTo(0.42, 9);
  });
  it('on: counted once at its own board, and through the cables at the main board and the other sub-board', () => {
    const p = project([toMcc, toDb2, m1], { motorContribution: true });
    expect(localSources(p, p.boards[1]).map((s) => [s.kind, s.label])).toEqual([['motor', 'Motor M1']]);
    expect(ka(impedanceToBoard(p, 'MCC'))).toBeCloseTo(ka(parallelZ([add(ZT, cab(toMcc)), zMotor(m1)])), 9);
    const atMdb = parallelZ([ZT, add(cab(toMcc), zMotor(m1))]);
    expect(ka(impedanceToBoard(p, 'MDB'))).toBeCloseTo(ka(atMdb), 9);
    expect(ka(impedanceToBoard(p, 'DB2'))).toBeCloseTo(ka(add(atMdb, cab(toDb2))), 9);
    // More than without, by less than the motor's own 0.86 kA.
    const off = project([toMcc, toDb2, m1]);
    for (const id of ['MDB', 'MCC', 'DB2']) {
      const gain = ka(impedanceToBoard(p, id)) - ka(impedanceToBoard(off, id));
      expect(gain, id).toBeGreaterThan(0);
      expect(gain, id).toBeLessThan(0.86);
    }
  });
  it('a motor on a variable speed drive adds nothing; two motors add as two branches', () => {
    const vfd = project([toMcc, toDb2, { ...m1, starter: 'VFD' }], { motorContribution: true });
    expect(ka(impedanceToBoard(vfd, 'MCC'))).toBeCloseTo(ka(add(ZT, cab(toMcc))), 9);
    const m2 = motor('M2', 'MCC', { loadKw: 55, lengthM: 20 });
    const two = project([toMcc, toDb2, m1, m2], { motorContribution: true });
    expect(ka(impedanceToBoard(two, 'MCC'))).toBeCloseTo(ka(parallelZ([add(ZT, cab(toMcc)), zMotor(m1), zMotor(m2)])), 9);
  });
  it('reaches the breaker check, the per-unit fault and the per-unit element list', () => {
    const p = project([toMcc, toDb2, m1], { motorContribution: true });
    expect(evaluateFeeder(p, m1).breakerFaultKA).toBeCloseTo(ka(impedanceToBoard(p, 'MCC')), 9);
    expect(puFaultAt(p, p.boards[1]).ikKa).toBeCloseTo(ka(impedanceToBoard(p, 'MCC')), 9);
    const row = puElements(p).find((e) => e.element === 'Motor M1')!;
    expect(row.data).toBe('117.65 kVA, 5 × rated, with its cable');
    expect(puElements(project([toMcc, toDb2, m1])).some((e) => e.element.startsWith('Motor'))).toBe(false);
  });
});
