import { describe, expect, it } from 'vitest';
import { newProject, type Board, type Feeder, type Project } from '../types';
import { upstreamVoltageDropPct } from './electrical';
import { txKv } from './hvSupply';
import { tapBoostPct, transformerKind, transformerPrimaryKv } from './transformerVoltage';

const main = (extra: Partial<Board> = {}): Board => ({ id: 'MDB', name: 'MDB', kind: 'MDB', sourceKva: 1000, sourceImpedancePct: 5, ...extra });
const sub: Board = { id: 'SMDB', name: 'SMDB', kind: 'SMDB', upstreamId: 'MDB' };
const feeder = (over: Partial<Feeder>): Feeder => ({ id: 'F', boardId: 'MDB', name: 'F', loadKw: 5, demandFactor: 1, powerFactor: 0.9, lengthM: 50, cableCsaMm2: 4, cores: 4, breakerRatingA: 32, breakerIcuKa: 36, ...over });
const project = (m: Board, extra: Partial<Project> = {}): Project => ({
  ...newProject('T'), voltageV: 400, boards: [m, sub],
  feeders: [feeder({ id: 'INC', boardId: 'MDB', feedsBoardId: 'SMDB', loadKw: 100, lengthM: 80, cableCsaMm2: 120 }), feeder({ id: 'L1', boardId: 'SMDB' })], ...extra
});
const grid = (kv: number) => ({ id: 'G', name: 'G', kv, faultMva: 500 });

describe('transformer primary voltage and tap', () => {
  it('takes the primary voltage from its own value, else the grid source, else 11 kV', () => {
    expect(transformerPrimaryKv(project(main()), main())).toBe(11);
    expect(transformerPrimaryKv(project(main(), { gridSources: [grid(22)] }), main())).toBe(22);
    const typed = main({ sourcePrimaryKv: 6.6 });
    expect(transformerPrimaryKv(project(typed, { gridSources: [grid(22)] }), typed)).toBe(6.6);
    expect(txKv(project(typed, { gridSources: [grid(22)] }), typed)).toBe('6.6'); // the labels follow
    expect(transformerPrimaryKv(project(main(), { gridSources: [grid(0)] }), main())).toBe(11);
  });

  it('works out the secondary boost of the tap', () => {
    expect(tapBoostPct(main())).toBe(0);
    expect(tapBoostPct(main({ sourceTapPct: 0 }))).toBe(0);
    expect(tapBoostPct(main({ sourceTapPct: -2.5 }))).toBeCloseTo(2.56, 2);
    expect(tapBoostPct(main({ sourceTapPct: 2.5 }))).toBeCloseTo(-2.44, 2);
    expect(tapBoostPct(main({ sourceTapPct: -5 }))).toBeCloseTo(5.26, 2);
  });

  it('calls it a step-up when the primary is below the project voltage', () => {
    expect(transformerKind(project(main()), main())).toBe('step-down');
    const lv = main({ sourcePrimaryKv: 0.208 });
    expect(transformerKind(project(lv), lv)).toBe('step-up');
  });

  it('changes the voltage drop only when a tap is set', () => {
    const at = (m: Board) => { const p = project(m); return ['MDB', 'SMDB'].map((id) => upstreamVoltageDropPct(p, id)); };
    const base = at(main());
    expect(base[0]).toBe(0);
    expect(base[1]).toBeGreaterThan(0); // the incomer's own drop
    expect(at(main({ sourceTapPct: 0 }))).toEqual(base); // tap 0 = unset
    const minus = at(main({ sourceTapPct: -2.5 })), plus = at(main({ sourceTapPct: 2.5 }));
    base.forEach((v, i) => { expect(minus[i]).toBeCloseTo(v - 2.56, 2); expect(plus[i]).toBeCloseTo(v + 2.44, 2); });
  });

  it('ignores the tap on a board with no transformer', () => {
    const p = project(main({ sourceKva: undefined, sourceTapPct: -2.5 }));
    expect(upstreamVoltageDropPct(p, 'MDB')).toBe(0);
  });
});
