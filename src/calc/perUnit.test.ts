import { describe, expect, it } from 'vitest';
import { baseMvaOf, lvBase, ohmFaultKa, peakFactor, puBase, puElements, puFaultAt } from './perUnit';
import { sampleProject } from '../data/sampleProject';
import type { Feeder, Project } from '../types';

const incomer: Feeder = { id: 'F1', boardId: 'MDB', name: 'To SMDB', feedsBoardId: 'SMDB', loadKw: 0, demandFactor: 1, powerFactor: 0.9, lengthM: 50, cableCsaMm2: 240, cores: 4, breakerRatingA: 400, breakerIcuKa: 50 };
const project = (over: Partial<Project> = {}): Project => ({
  name: 'T', voltageV: 415, frequencyHz: 50, ambientC: 40, vdLimitPct: 4, updatedAt: '',
  gridSources: [{ id: 'G1', name: 'Ring', kv: 11, faultMva: 500 }],
  boards: [{ id: 'MDB', name: 'M', sourceKva: 1000, sourceImpedancePct: 5 }, { id: 'SMDB', name: 'S', upstreamId: 'MDB' }],
  feeders: [incomer], ...over
});

describe('per-unit base', () => {
  it('100 MVA at 0.415 kV: base current 139.12 kA, base impedance 1.722 mΩ; at 11 kV 5.249 kA and 1.21 Ω', () => {
    const lv = lvBase(project());
    expect(lv.ika).toBeCloseTo(139.12, 2);
    expect(lv.zOhm * 1000).toBeCloseTo(1.722, 3);
    expect(puBase(100, 11).ika).toBeCloseTo(5.249, 3);
    expect(puBase(100, 11).zOhm).toBeCloseTo(1.21, 6);
  });
  it('takes the project base power, 100 MVA when none or not positive', () => {
    expect(baseMvaOf({})).toBe(100);
    expect(baseMvaOf({ baseMva: 0 })).toBe(100);
    expect(baseMvaOf({ baseMva: 10 })).toBe(10);
  });
});

describe('impedance data in per unit', () => {
  it('source 1.1 × 100 ÷ 500 = 0.22, transformer 5 % × 100 ÷ 1 = 5.0 (X/R 5), cable 0.0754 Ω/km × 50 m ÷ 1.722 mΩ = 2.189', () => {
    const [grid, tx, cable] = puElements(project());
    expect(grid.element).toBe('Source Ring');
    expect(grid.pu.z).toBeCloseTo(0.22, 6);
    expect(grid.pu.x / grid.pu.r).toBeCloseTo(10, 6);
    expect(tx.pu.z).toBeCloseTo(5, 6);
    expect(tx.pu.r).toBeCloseTo(0.981, 3);
    expect(tx.pu.x).toBeCloseTo(4.903, 3);
    expect(tx.baseKv).toBe('11 / 0.415');
    expect(cable.element).toBe('Cable MDB → SMDB');
    expect(cable.pu.r).toBeCloseTo(2.189, 3);
  });
  it('does not depend on the base: twice the base power gives twice every p.u. value and the same current', () => {
    const a = project(), b = project({ baseMva: 200 });
    expect(puElements(b)[1].pu.z).toBeCloseTo(2 * puElements(a)[1].pu.z, 9);
    expect(puFaultAt(b, b.boards[1]).ikKa).toBeCloseTo(puFaultAt(a, a.boards[1]).ikKa, 9);
  });
  it('lists a source with a typed fault level and its incoming cable; keeps to the boards asked for', () => {
    const p = project({ gridSources: [], boards: [{ id: 'MDB', name: 'M', supply: { faultKa: 25, incomer: { lengthM: 20, cableCsaMm2: 240 } } }, { id: 'SMDB', name: 'S', upstreamId: 'MDB' }] });
    expect(puElements(p).map((e) => e.element)).toEqual(['Source at MDB', 'Incoming cable of MDB', 'Cable MDB → SMDB']);
    expect(puElements(p, new Set(['MDB'])).map((e) => e.element)).toEqual(['Source at MDB', 'Incoming cable of MDB']);
  });
});

describe('fault in per unit', () => {
  it('gives the same Ik″ as the ohm method at every board', () => {
    for (const p of [project(), project({ gridSources: [] }), sampleProject]) {
      for (const b of p.boards) expect(puFaultAt(p, b).ikKa).toBeCloseTo(ohmFaultKa(p, b), 9);
    }
  });
  it('worked example: MDB 28.0 kA, peak 62 kA; SMDB 18.6 kA (cable X 0.07 Ω/km)', () => {
    const p = project(), mdb = puFaultAt(p, p.boards[0]), smdb = puFaultAt(p, p.boards[1]);
    expect(mdb.pu.z).toBeCloseTo(5.219, 3);
    expect(mdb.ikKa).toBeCloseTo(27.99, 2);
    expect(mdb.kappa).toBeCloseTo(1.565, 3);
    expect(mdb.ipKa).toBeCloseTo(61.9, 1);
    expect(smdb.ikKa).toBeCloseTo(18.65, 2);
  });
  it('peak factor: 1.02 for a resistive path, towards 2 for a reactive one', () => {
    expect(peakFactor(1, 0)).toBe(1.02);
    expect(peakFactor(0, 1)).toBe(2);
    expect(peakFactor(0.1, 1)).toBeCloseTo(1.746, 3);
  });
});
