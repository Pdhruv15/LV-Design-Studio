import { describe, expect, it } from 'vitest';
import { DEFAULT_FAMILY } from './cableFamily';
import { faultCurrentKA, impedanceToBoard } from './electrical';
import { puFaultAt } from './perUnit';
import { busVoltagesKv, scElements, solveSketch, type ScSketch } from './scSketch';
import type { Board, Feeder, Project } from '../types';

const sketch = (over: Partial<ScSketch> = {}): ScSketch => ({
  id: 'S', name: 'T', buses: [{ id: 'HV', name: '11 kV' }, { id: 'MDB', name: 'MDB' }],
  sources: [{ id: 'G1', busId: 'HV', kv: 11, faultMva: 500 }],
  transformers: [{ id: 'T1', name: 'T1', fromBusId: 'HV', toBusId: 'MDB', kva: 1000, primaryKv: 11, secondaryKv: 0.415, zPct: 5 }],
  cables: [], generators: [], motors: [], faultPoints: [], ...over
});
const cable = (id: string, from: string, to: string, over = {}) => ({ id, fromBusId: from, toBusId: to, csaMm2: 240, family: DEFAULT_FAMILY, lengthM: 50, ...over });
const bus = (s: ReturnType<typeof solveSketch>, id: string) => s.buses.find((b) => b.id === id)!;

describe('hand example', () => {
  it('500 MVA source, 1000 kVA 5 % transformer: 26.2 kA at 11 kV, 28.0 kA / peak 62 kA at 0.415 kV', () => {
    // 11 kV: the source Z = c·Sb/Sk carries c = 1.1, so Ik″ = 1.1·Ib/(1.1·Sb/Sk) = Sk/(√3·11) = 26.24 kA.
    // 0.415 kV: Z = 0.22 (X/R 10) + 5.0 (X/R 5) = 1.0025 + j5.1218 = 5.219 p.u.; Ik″ = 1.05 · 139.12 / 5.219 = 27.99 kA.
    const s = solveSketch(sketch());
    expect(bus(s, 'HV').ikMaxKa).toBeCloseTo(26.2, 1);
    expect(bus(s, 'MDB').zPu).toBeCloseTo(5.219, 3);
    expect(bus(s, 'MDB').ikMaxKa).toBeCloseTo(28.0, 1);
    expect(bus(s, 'MDB').ipKa).toBeCloseTo(62, 0);
    expect(bus(s, 'MDB').kv).toBe(0.415);
    expect(s.warnings).toEqual([]);
  });
  it('lists the elements in per unit', () => {
    const e = scElements(sketch({ cables: [cable('C1', 'MDB', 'MDB2')], buses: [...sketch().buses, { id: 'MDB2', name: 'SMDB' }] })).elements;
    expect(e.map((x) => x.kind)).toEqual(['source', 'transformer', 'cable']);
    expect(e[0].pu.z).toBeCloseTo(0.22, 6);
    expect(e[1].pu.z).toBeCloseTo(5, 6);
    expect(e[2].pu.r).toBeCloseTo(2.189, 3);
  });
});

const feeder: Feeder = { id: 'F1', boardId: 'MDB', name: 'To SMDB', feedsBoardId: 'SMDB', loadKw: 0, demandFactor: 1, powerFactor: 0.9, lengthM: 50, cableCsaMm2: 240, cores: 4, breakerRatingA: 400, breakerIcuKa: 50 };
const project = (boards: Board[], over: Partial<Project> = {}): Project => ({
  name: 'T', voltageV: 415, frequencyHz: 50, ambientC: 40, vdLimitPct: 4, updatedAt: '',
  gridSources: [{ id: 'G1', name: 'Ring', kv: 11, faultMva: 500 }], boards, feeders: [feeder], ...over
});
const twoBoards: Board[] = [{ id: 'MDB', name: 'M', sourceKva: 1000, sourceImpedancePct: 5 }, { id: 'SMDB', name: 'S', upstreamId: 'MDB' }];
const withSub = sketch({ buses: [...sketch().buses, { id: 'SMDB', name: 'SMDB' }], cables: [cable('C1', 'MDB', 'SMDB')] });

describe('same result as the board-by-board study', () => {
  it('main board and sub-board within 0.5 % of the ohm method and the p.u. table', () => {
    const p = project(twoBoards), s = solveSketch(withSub);
    for (const [id, board] of [['MDB', p.boards[0]], ['SMDB', p.boards[1]]] as const) {
      const ohm = faultCurrentKA(impedanceToBoard(p, id), 415);
      expect(Math.abs(bus(s, id).ikMaxKa / ohm - 1)).toBeLessThan(0.005);
      expect(Math.abs(bus(s, id).ikMaxKa / puFaultAt(p, board).ikKa - 1)).toBeLessThan(0.005);
      expect(Math.abs(bus(s, id).ipKa / puFaultAt(p, board).ipKa - 1)).toBeLessThan(0.005);
    }
  });
  it('a generator in parallel at the main bus equals the standby parallel source', () => {
    const p = project([{ ...twoBoards[0], standby: { kva: 800, parallel: true } }, twoBoards[1]]);
    const s = solveSketch({ ...withSub, generators: [{ id: 'GEN', name: 'Gen', busId: 'MDB', kva: 800 }] });
    for (const id of ['MDB', 'SMDB']) {
      const ohm = faultCurrentKA(impedanceToBoard(p, id), 415);
      expect(Math.abs(bus(s, id).ikMaxKa / ohm - 1)).toBeLessThan(0.005);
    }
    expect(bus(s, 'MDB').ikMaxKa).toBeGreaterThan(bus(solveSketch(withSub), 'MDB').ikMaxKa + 7);
  });
});

describe('transformers in line', () => {
  it('415 V bus, 250 kVA 4 % 0.415/0.69 kV: 0.69 kV bus below the infinite-bus limit 5.5 kA', () => {
    const s = solveSketch({
      id: 'S', name: 'T', buses: [{ id: 'A', name: 'A' }, { id: 'B', name: 'B' }], sources: [{ id: 'G', busId: 'A', kv: 0.415, faultMva: 20 }],
      transformers: [{ id: 'T2', name: 'T2', fromBusId: 'A', toBusId: 'B', kva: 250, primaryKv: 0.415, secondaryKv: 0.69, zPct: 4 }],
      cables: [], generators: [], motors: [], faultPoints: []
    });
    const b = bus(s, 'B');
    expect(b.kv).toBe(0.69);
    expect(b.ikMaxKa).toBeLessThan(((250 / (Math.sqrt(3) * 0.69)) / 0.04) * 1.05 / 1000);
    expect(b.ikMaxKa).toBeGreaterThan(3.5);
  });
});

describe('fault point on a cable', () => {
  const at = (d: number) => solveSketch({ ...withSub, faultPoints: [{ id: 'FP', name: 'FP', cableId: 'C1', distanceM: d }] }).faultPoints[0];
  it('lies between the bus values, and equals them at 0 and the full length', () => {
    const s = solveSketch(withSub), mdb = bus(s, 'MDB').ikMaxKa, sub = bus(s, 'SMDB').ikMaxKa;
    expect(mdb).toBeGreaterThan(sub);
    const mid = at(25).ikMaxKa;
    expect(mid).toBeLessThan(mdb);
    expect(mid).toBeGreaterThan(sub);
    expect(at(0).ikMaxKa).toBeCloseTo(mdb, 9);
    expect(at(50).ikMaxKa).toBeCloseTo(sub, 9);
    expect(at(25).place).toContain('25 m');
  });
  it('several points on one cable decrease with distance', () => {
    const s = solveSketch({ ...withSub, faultPoints: [10, 40, 20].map((d) => ({ id: `P${d}`, name: `P${d}`, cableId: 'C1', distanceM: d })) });
    const v = Object.fromEntries(s.faultPoints.map((f) => [f.id, f.ikMaxKa]));
    expect(v.P10).toBeGreaterThan(v.P20);
    expect(v.P20).toBeGreaterThan(v.P40);
  });
});

describe('minimum fault with a generator', () => {
  const gen = (over = {}): ScSketch => ({ id: 'S', name: 'T', buses: [{ id: 'B', name: 'B' }], sources: [], transformers: [], cables: [], motors: [], faultPoints: [], generators: [{ id: 'G', name: 'G', busId: 'B', kva: 500, ...over }] });
  it('uses X′d (lower than the X″d maximum); a typed sustained multiple overrides', () => {
    // generator only, but with no source the bus has a shunt: a generator is a source
    const sk = { ...gen(), buses: [{ id: 'B', name: 'B' }] };
    // voltage needs a source or a transformer: give the bus a voltage through a tiny 0.415 kV source far behind a transformer
    const full = (over = {}): ScSketch => ({ ...sk, sources: [{ id: 'G0', busId: 'B', kv: 0.415, faultMva: 0.0001 }], generators: [{ id: 'G', name: 'G', busId: 'B', kva: 500, ...over }] });
    const a = bus(solveSketch(full()), 'B'), b = bus(solveSketch(full({ sustainedMultiple: 3 })), 'B');
    expect(a.ikMinKa).toBeLessThan(a.ikMaxKa);
    // 500 kVA at 0.415 kV: rated 696 A; X′d 25 % -> 0.95 · 696 / 0.25 = 2.64 kA ; X″d 15 % -> 1.05 · 696 / 0.15 = 4.87 kA
    expect(a.ikMinKa).toBeCloseTo(2.6, 1);
    expect(a.ikMaxKa).toBeCloseTo(4.9, 1);
    expect(b.ikMinKa).toBeCloseTo(3 * 0.6956, 1); // 3 × rated current 0.696 kA = 2.09 kA
    expect(b.ikMaxKa).toBeCloseTo(a.ikMaxKa, 6);
  });
});

describe('warnings', () => {
  it('isolated bus: no result and a warning, no NaN', () => {
    const s = solveSketch({ ...sketch(), buses: [...sketch().buses, { id: 'X', name: 'Lone' }], faultPoints: [{ id: 'F', name: 'F', busId: 'X' }] });
    expect(bus(s, 'MDB').ikMaxKa).toBeGreaterThan(0);
    expect(s.buses.find((b) => b.id === 'X')).toBeUndefined();
    expect(s.faultPoints).toEqual([]);
    expect(s.warnings.join(' ')).toContain('Lone');
  });
  it('voltage mismatch and two voltages on one bus', () => {
    const w = busVoltagesKv(sketch({ transformers: [{ ...sketch().transformers[0], primaryKv: 22 }] })).warnings;
    expect(w.join(' ')).toContain('primary of 22 kV');
    const two = busVoltagesKv(sketch({ cables: [cable('C1', 'HV', 'MDB')] })).warnings;
    expect(two.join(' ')).toContain('two different voltages');
  });
  it('bad inputs give warnings and finite numbers', () => {
    const bad = sketch({ cables: [cable('C1', 'MDB', 'HV', { lengthM: NaN }), cable('C2', 'MDB', 'HV', { csaMm2: 0 })], sources: [{ id: 'G1', busId: 'HV', kv: 11, faultMva: 0 }, { id: 'G2', busId: 'HV', kv: 11, faultMva: 500 }], generators: [{ id: 'GX', name: 'GX', busId: 'MDB', kva: -1 }] });
    const s = solveSketch(bad);
    expect(s.warnings.length).toBeGreaterThanOrEqual(3);
    for (const r of [...s.buses, ...s.faultPoints]) for (const v of [r.ikMaxKa, r.ikMinKa, r.ipKa, r.zPu]) expect(Number.isFinite(v)).toBe(true);
  });
});

describe('meshes', () => {
  it('two cables in parallel equal one cable with runs = 2', () => {
    const two = sketch({ buses: [...sketch().buses, { id: 'S2', name: 'S2' }], cables: [cable('C1', 'MDB', 'S2'), cable('C2', 'MDB', 'S2')] });
    const one = sketch({ buses: [...sketch().buses, { id: 'S2', name: 'S2' }], cables: [cable('C1', 'MDB', 'S2', { runs: 2 })] });
    expect(bus(solveSketch(two), 'S2').ikMaxKa).toBeCloseTo(bus(solveSketch(one), 'S2').ikMaxKa, 9);
  });
  it('a ring of three buses solves without error', () => {
    const ring = sketch({ buses: [...sketch().buses, { id: 'A', name: 'A' }, { id: 'B', name: 'B' }], cables: [cable('C1', 'MDB', 'A'), cable('C2', 'A', 'B'), cable('C3', 'B', 'MDB')] });
    const s = solveSketch(ring);
    expect(bus(s, 'A').ikMaxKa).toBeGreaterThan(0);
    expect(s.warnings).toEqual([]);
  });
});
