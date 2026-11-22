import { describe, expect, it } from 'vitest';
import { boardSummary, boardTotals, boardsInSupplyOrder, systemSummary } from './summary';
import { upstreamVoltageDropPct } from './electrical';
import type { Feeder, Project } from '../types';

const SQRT3 = Math.sqrt(3);

function feeder(over: Partial<Feeder>): Feeder {
  return {
    id: 'F', boardId: 'MDB', name: 'Feeder', loadKw: 10, demandFactor: 1, powerFactor: 1,
    lengthM: 30, cableCsaMm2: 95, cores: 4, breakerRatingA: 250, breakerIcuKa: 50, ...over
  };
}

// MDB ── SMDB ── two loads with different power factors
//    └── PV (generation) and a direct load
const project: Project = {
  name: 'T', voltageV: 415, frequencyHz: 50, ambientC: 45, vdLimitPct: 4, updatedAt: '',
  boards: [
    { id: 'MDB', name: 'Main', sourceKva: 1000, sourceImpedancePct: 5, ratedCurrentA: 1600 },
    { id: 'SMDB', name: 'Sub', upstreamId: 'MDB', ratedCurrentA: 250 }
  ],
  feeders: [
    feeder({ id: 'INC', feedsBoardId: 'SMDB', lengthM: 60 }),
    feeder({ id: 'A', boardId: 'SMDB', loadKw: 100, demandFactor: 0.8, powerFactor: 0.8 }), // 80 kW, 60 kvar
    feeder({ id: 'B', boardId: 'SMDB', loadKw: 40, demandFactor: 1, powerFactor: 1 }), // 40 kW, 0 kvar
    feeder({ id: 'PV', loadKw: 50, demandFactor: 1, generation: true }),
    feeder({ id: 'C', loadKw: 30, demandFactor: 0.5, powerFactor: 1 }) // 15 kW
  ]
};

describe('board totals', () => {
  it('sums P and Q separately and keeps generation apart', () => {
    const t = boardTotals(project, 'SMDB');
    expect(t.connectedKw).toBe(140);
    expect(t.demandKw).toBeCloseTo(120, 9);
    expect(t.demandKvar).toBeCloseTo(60, 9);
    expect(t.generationKw).toBe(0);

    const m = boardTotals(project, 'MDB');
    expect(m.demandKw).toBeCloseTo(135, 9);
    expect(m.generationKw).toBe(50);
  });
});

describe('board summary', () => {
  it('kVA, power factor, current and loading from P and Q', () => {
    const s = boardSummary(project, project.boards[1]);
    const kva = Math.hypot(120, 60); // 134.16 kVA
    expect(s.demandKva).toBeCloseTo(kva, 9);
    expect(s.powerFactor).toBeCloseTo(120 / kva, 9); // 0.894
    expect(s.currentA).toBeCloseTo((kva * 1000) / (SQRT3 * 415), 9); // 186.6 A
    expect(s.loadingPct).toBeCloseTo((s.currentA / 250) * 100, 9); // 74.7 %
    expect(s.loadingStatus).toBe('ok');
    expect(s.depth).toBe(1);
    expect(s.incomer?.id).toBe('INC');
  });

  it('busbar voltage = 100 % minus the incomer drops above it', () => {
    const main = boardSummary(project, project.boards[0]);
    const sub = boardSummary(project, project.boards[1]);
    expect(main.voltagePct).toBe(100);
    expect(sub.voltagePct).toBeCloseTo(100 - upstreamVoltageDropPct(project, 'SMDB'), 12);
    expect(sub.voltageV).toBeCloseTo(415 * (sub.voltagePct / 100), 9);
    expect(sub.faultKA).toBeLessThan(main.faultKA);
  });
});

describe('system summary', () => {
  it('totals across the network and loads the transformer', () => {
    const s = systemSummary(project);
    const kva = Math.hypot(135, 60);
    expect(s.demandKva).toBeCloseTo(kva, 9);
    expect(s.transformerKva).toBe(1000);
    expect(s.transformerLoadingPct).toBeCloseTo(kva / 10, 9);
    expect(s.generationKw).toBe(50);
  });

  it('orders boards the way they are supplied', () => {
    expect(boardsInSupplyOrder(project).map((b) => b.id)).toEqual(['MDB', 'SMDB']);
  });
});

describe('board loading against the supply rating', () => {
  const lv: Project = { ...project, boards: [{ id: 'MDB', name: 'Main', supply: { faultKa: 25, ratingA: 400 } }, project.boards[1]] };
  it('a first board with no busbar rating uses its supply rating', () => {
    const s = boardSummary(lv, lv.boards[0]);
    expect(s.loadingPct).toBeCloseTo((s.currentA / 400) * 100, 6);
    expect(s.loadingStatus).toBeDefined();
  });
  it('a busbar rating wins; a sub-board and a board with neither stay unrated', () => {
    const rated = { ...lv.boards[0], ratedCurrentA: 800 };
    expect(boardSummary({ ...lv, boards: [rated, lv.boards[1]] }, rated).loadingPct).toBeCloseTo((boardSummary(lv, lv.boards[0]).currentA / 800) * 100, 6);
    expect(boardSummary(lv, { ...lv.boards[1], supply: { ratingA: 100 }, ratedCurrentA: undefined }).loadingPct).toBeUndefined();
    expect(boardSummary({ ...lv, boards: [{ id: 'MDB', name: 'Main' }, lv.boards[1]] }, { id: 'MDB', name: 'Main' }).loadingPct).toBeUndefined();
  });
});

describe('board summary with values given from upstream', () => {
  // 24 kW at PF 0.9 on a board fed by a supply: Ib 37.1 A.
  const f = feeder({ id: 'L', loadKw: 24, powerFactor: 0.9, cableCsaMm2: 10, lengthM: 20, breakerRatingA: 40 });
  const lv = (supply: NonNullable<Project['boards'][number]['supply']>): Project => ({ ...project, boards: [{ id: 'MDB', name: 'Main', supply }], feeders: [f] });
  it('voltagePct starts below 100 % by the drop at the busbar; allowed load as a share of the demand current', () => {
    // 1.6 % used + 0.495 % in the 16 mm², 25 m incoming cable = 2.095 %; 37.1 A of 50 A allowed = 74.2 %.
    const p = lv({ faultKa: 12, vdUsedPct: 1.6, allowedA: 50, incomer: { cableCsaMm2: 16, lengthM: 25 } });
    const s = boardSummary(p, p.boards[0]);
    expect(s.voltagePct).toBeCloseTo(100 - 2.095, 3);
    expect(s.allowedA).toBe(50);
    expect(s.allowedLoadingPct).toBeCloseTo(74.2, 1);
  });
  it('without them: voltagePct 100, no allowed-load keys; a transformer board ignores allowedA', () => {
    const p = lv({ faultKa: 12 });
    const s = boardSummary(p, p.boards[0]);
    expect(s.voltagePct).toBe(100);
    expect('allowedA' in s || 'allowedLoadingPct' in s).toBe(false);
    const tx: Project = { ...project, boards: [{ id: 'MDB', name: 'Main', sourceKva: 1000, sourceImpedancePct: 5, supply: { allowedA: 10 } }], feeders: [f] };
    expect('allowedA' in boardSummary(tx, tx.boards[0])).toBe(false);
  });
});

describe('allowed load from the source rating', () => {
  // 24 kW at PF 0.9 on the board: Ib 37.1 A. A 250 kVA generator is rated 250 000 ÷ (√3 × 415) = 347.8 A: 37.1 ÷ 347.8 = 10.67 %.
  const f = feeder({ id: 'L', loadKw: 24, powerFactor: 0.9, cableCsaMm2: 10, lengthM: 20, breakerRatingA: 40 });
  const lv = (supply: NonNullable<Project['boards'][number]['supply']>): Project => ({ ...project, boards: [{ id: 'MDB', name: 'Main', supply }], feeders: [f] });
  it('with no allowed load typed, a calculated source gives its rated current; a typed allowed load wins', () => {
    const p = lv({ kind: 'generator', ratedKva: 250 });
    const s = boardSummary(p, p.boards[0]);
    expect(s.allowedA).toBeCloseTo(347.8, 1);
    expect(s.allowedLoadingPct).toBeCloseTo(10.67, 2);
    const typed = lv({ kind: 'generator', ratedKva: 250, allowedA: 50 });
    expect(boardSummary(typed, typed.boards[0]).allowedA).toBe(50);
  });
  it('a rating that gives no calculated level (utility, no rating) or a transformer board gives no allowed load', () => {
    for (const supply of [{ kind: 'utility' as const, ratedKva: 250 }, { kind: 'generator' as const }]) {
      const p = lv(supply);
      expect('allowedA' in boardSummary(p, p.boards[0])).toBe(false);
    }
  });
});
