import { describe, expect, it } from 'vitest';
import { newProject, type Board, type Project } from '../types';
import { faultCurrentKA, gridImpedance, impedanceToBoard, transformerImpedance, zMagnitude } from './electrical';
import { earthLoopToBoard } from './earthing';
import { gridFaultKa, gridLabel, mvNetworkText, rmuChecks, rmuLabel, rmuRatings, rmuWays } from './hvSupply';
import { fingerprint } from './runs';
import { addGridSource, removeGridSource, updateGridSource, updateRmu } from '../model/hvSupply';
import { checkReferences } from '../model/integrity';
import { sizeTransformers } from './txGen';

const tx = (id: string, kva: number, extra: Partial<Board> = {}): Board => ({ id, name: id, kind: 'MDB', sourceKva: kva, sourceImpedancePct: 5, ...extra });
const project = (boards: Board[], extra: Partial<Project> = {}): Project => ({ ...newProject('HV'), voltageV: 400, boards, feeders: [], ...extra });
const ka = (p: Project, id: string) => faultCurrentKA(impedanceToBoard(p, id), p.voltageV);
const grid = (id: string, faultMva: number, extra = {}) => ({ id, name: id, operator: 'DEWA', kv: 11, faultMva, ...extra });

describe('grid source impedance (IEC 60909-0 §6.2)', () => {
  it('leaves the fault level as before without a grid source (infinite MV network)', () => {
    const p = project([tx('MDB-1', 1000)]);
    const zt = transformerImpedance(1000, 5, 400);
    expect(impedanceToBoard(p, 'MDB-1')).toEqual(zt);
    expect(ka(p, 'MDB-1')).toBeCloseTo(faultCurrentKA(zt, 400), 9);
    // A grid source without a fault level is still infinite.
    expect(ka(project([tx('MDB-1', 1000)], { gridSources: [{ id: 'G', name: 'G', kv: 11 }] }), 'MDB-1')).toBeCloseTo(faultCurrentKA(zt, 400), 9);
  });

  it('adds ZQt = cQ · U² ÷ S″kQ in series with the transformer', () => {
    const p = project([tx('MDB-1', 1000)], { gridSources: [grid('G', 500)] });
    const zq = gridImpedance(p.gridSources![0], 400)!;
    expect(zMagnitude(zq)).toBeCloseTo((1.1 * 400 * 400) / 500e6, 12); // 0.352 mΩ
    expect(zq.x / zq.r).toBeCloseTo(10, 9);
    const zt = transformerImpedance(1000, 5, 400);
    expect(impedanceToBoard(p, 'MDB-1')).toEqual({ r: zt.r + zq.r, x: zt.x + zq.x });
    // 1000 kVA, 5 %: 30.31 kA infinite → about 29.0 kA behind 500 MVA.
    expect(faultCurrentKA(zt, 400)).toBeCloseTo(30.31, 2);
    expect(ka(p, 'MDB-1')).toBeCloseTo(29.03, 1);
  });

  it('takes the fault level in kA when no MVA is given', () => {
    const byKa = project([tx('MDB-1', 1000)], { gridSources: [{ id: 'G', name: 'G', kv: 11, faultKa: 500 / (Math.sqrt(3) * 11) }] });
    const byMva = project([tx('MDB-1', 1000)], { gridSources: [grid('G', 500)] });
    expect(ka(byKa, 'MDB-1')).toBeCloseTo(ka(byMva, 'MDB-1'), 9);
    expect(gridFaultKa(byMva.gridSources![0])).toBeCloseTo(26.24, 2);
  });

  it('shares one grid impedance between transformers in parallel on the same source', () => {
    const p = project([tx('MDB-1', 1000, { rmu: 'RMU-1' }), tx('MDB-2', 1000, { rmu: 'RMU-1' })], { gridSources: [grid('G', 250)], ties: [{ id: 'T1', a: 'MDB-1', b: 'MDB-2', ratingA: 1600, closed: true }] });
    const zt = transformerImpedance(1000, 5, 400), zq = gridImpedance(p.gridSources![0], 400)!;
    const z = impedanceToBoard(p, 'MDB-1');
    expect(z.r).toBeCloseTo(zq.r + zt.r / 2, 12);
    expect(z.x).toBeCloseTo(zq.x + zt.x / 2, 12);
  });

  it('puts transformers on different grid sources in parallel, each behind its own source', () => {
    const p = project([tx('MDB-1', 1000, { rmu: 'RMU-1' }), tx('MDB-2', 1000, { rmu: 'RMU-2' })], {
      gridSources: [grid('A', 250), grid('B', 250)], rmus: [{ name: 'RMU-1', sourceId: 'A' }, { name: 'RMU-2', sourceId: 'B' }],
      ties: [{ id: 'T1', a: 'MDB-1', b: 'MDB-2', ratingA: 1600, closed: true }]
    });
    const zt = transformerImpedance(1000, 5, 400), zq = gridImpedance(p.gridSources![0], 400)!;
    const z = impedanceToBoard(p, 'MDB-1');
    expect(z.r).toBeCloseTo((zq.r + zt.r) / 2, 12); // two equal branches
    expect(z.x).toBeCloseTo((zq.x + zt.x) / 2, 12);
  });

  it('uses the RMU’s own source, else the first', () => {
    const p = project([tx('MDB-1', 1000, { rmu: 'RMU-1' }), tx('MDB-2', 1000)], { gridSources: [grid('A', 1000), grid('B', 100)], rmus: [{ name: 'RMU-1', sourceId: 'B' }] });
    expect(ka(p, 'MDB-1')).toBeLessThan(ka(p, 'MDB-2')); // 100 MVA is the weaker network
  });

  it('adds 2/3 of the grid impedance to the earth fault loop (zero sequence blocked by the Dyn transformer)', () => {
    const base = project([tx('MDB-1', 1000)]);
    const p = project([tx('MDB-1', 1000)], { gridSources: [grid('G', 500)] });
    const zq = gridImpedance(p.gridSources![0], 400)!;
    const z0 = earthLoopToBoard(base, 'MDB-1'), z = earthLoopToBoard(p, 'MDB-1');
    expect(z.r - z0.r).toBeCloseTo((2 / 3) * zq.r, 12);
    expect(z.x - z0.x).toBeCloseTo((2 / 3) * zq.x, 12);
  });

  it('gives the transformer sizing check the same fault level', () => {
    const p = project([tx('MDB-1', 1000)], { gridSources: [grid('G', 500)] });
    const row = sizeTransformers(p, { txBoards: [], sizeList: 'dewa', n1: [], includePfc: false, emergencyLoadingPct: 100, genBoards: {} })[0];
    const inf = sizeTransformers(project([tx('MDB-1', 1000)]), { txBoards: [], sizeList: 'dewa', n1: [], includePfc: false, emergencyLoadingPct: 100, genBoards: {} })[0];
    expect(row.checks!.faultKa).toBeLessThan(inf.checks!.faultKa);
    // At the size it checks (typical %Z): the transformer behind the same grid impedance.
    const zt = transformerImpedance(row.checks!.kva, row.checks!.impedancePct, 400), zq = gridImpedance(p.gridSources![0], 400)!;
    expect(row.checks!.faultKa).toBeCloseTo(faultCurrentKA({ r: zt.r + zq.r, x: zt.x + zq.x }, 400), 9);
  });
});

describe('RMU checks and labels', () => {
  const base = (rmu: Project['rmus'], boards = [tx('MDB-1', 1000, { rmu: 'RMU-1' }), tx('MDB-2', 1000, { rmu: 'RMU-1' })]) =>
    project(boards, { gridSources: [grid('G', 500, { faultDurationS: 3 })], rmus: rmu });

  it('counts the ring and tee-off ways', () => {
    expect(rmuWays('RRTT')).toEqual({ ring: 2, tOff: 2 });
    expect(rmuWays('rrt')).toEqual({ ring: 2, tOff: 1 });
  });

  it('checks tee-off ways, rated voltage and the short-time rating at the supply duration', () => {
    const c = rmuChecks(base([{ name: 'RMU-1', config: 'RRT', ratedKv: 12, ikKa: 25, ikDurationS: 1 }]))[0];
    expect(c.transformers).toEqual(['MDB-1', 'MDB-2']);
    expect(c.checks.find((k) => k.label === 'Tee-off ways')?.status).toBe('bad');
    expect(c.checks.find((k) => k.label === 'Rated voltage')?.status).toBe('ok');
    // 25 kA 1 s = 14.4 kA for 3 s, below the 26.2 kA supply.
    const st = c.checks.find((k) => k.label === 'Short-time rating')!;
    expect(st.status).toBe('bad');
    expect(st.text).toContain('14.4 kA for 3 s');
    const ok = rmuChecks(base([{ name: 'RMU-1', config: 'RRTT', ratedKv: 12, ikKa: 31.5, ikDurationS: 3 }]))[0];
    expect(ok.checks.map((k) => k.status)).toEqual(['ok', 'ok', 'ok']);
  });

  it('checks nothing that is not entered', () => {
    expect(rmuChecks(base(undefined))[0].checks).toEqual([]);
  });

  it('labels the SLD from the records', () => {
    const p = base([{ name: 'RMU-1', config: 'RRT', ratedKv: 12, ratedA: 630, ikKa: 21, ikDurationS: 3, insulation: 'SF6', tOff: 'fuse', fuseA: 100, owner: 'authority' }]);
    expect(rmuLabel(p, 'RMU-1')).toBe('RMU-1 · RRT · 11 kV');
    expect(rmuLabel(project([tx('MDB-1', 1000, { rmu: 'RMU-9' })]), 'RMU-9')).toBe('RMU-9 · 11 kV'); // as before
    expect(rmuRatings(p, 'RMU-1')).toBe('12 kV, 630 A, 21 kA 3 s, SF6, T-off switch-fuse 100 A, authority owned');
    expect(gridLabel(p.gridSources![0])).toBe('11 kV · 500 MVA');
    expect(mvNetworkText(p)).toContain('G (DEWA) 11 kV, S″kQ 500 MVA (26.2 kA), X/R 10');
    expect(mvNetworkText(project([tx('MDB-1', 1000)]))).toBeUndefined();
  });
});

describe('HV supply edits', () => {
  it('adds, changes and removes grid sources, clearing RMU links', () => {
    let p = addGridSource(project([tx('MDB-1', 1000, { rmu: 'RMU-1' })]));
    expect(p.gridSources).toEqual([{ id: 'GRID-1', name: 'GRID-1', operator: 'DEWA', kv: 11 }]);
    p = updateGridSource(p, 'GRID-1', { faultMva: 350, primarySubstation: '' });
    expect(p.gridSources![0]).toEqual({ id: 'GRID-1', name: 'GRID-1', operator: 'DEWA', kv: 11, faultMva: 350 });
    p = updateRmu(p, 'RMU-1', { sourceId: 'GRID-1', config: 'RRT' });
    expect(checkReferences(p)).toEqual([]);
    p = removeGridSource(p, 'GRID-1');
    expect(p.gridSources).toBeUndefined();
    expect(p.rmus).toEqual([{ name: 'RMU-1', config: 'RRT' }]);
  });

  it('drops an RMU record left with only its name', () => {
    let p = updateRmu(project([]), 'RMU-1', { ikKa: 21 });
    expect(p.rmus).toEqual([{ name: 'RMU-1', ikKa: 21 }]);
    p = updateRmu(p, 'RMU-1', { ikKa: undefined });
    expect(p.rmus).toBeUndefined();
  });

  it('reports an RMU naming a grid source that does not exist', () => {
    const p = project([], { rmus: [{ name: 'RMU-1', sourceId: 'GONE' }] });
    expect(checkReferences(p).map((x) => x.where)).toContain('RMU RMU-1');
  });

  it('keeps study fingerprints of older projects, and changes them with the grid fault level', () => {
    const p = project([tx('MDB-1', 1000)]);
    const withGrid = project([tx('MDB-1', 1000)], { gridSources: [grid('G', 500)] });
    expect(fingerprint(p, 'fault')).toBe(fingerprint({ ...p, rmus: undefined }, 'fault'));
    expect(fingerprint(withGrid, 'fault')).not.toBe(fingerprint(p, 'fault'));
    expect(fingerprint(withGrid, 'fault')).not.toBe(fingerprint(updateGridSource(withGrid, 'G', { faultMva: 250 }), 'fault'));
    expect(fingerprint(withGrid, 'vd')).toBe(fingerprint(p, 'vd'));
  });
});
