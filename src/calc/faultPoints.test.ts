import { describe, expect, it } from 'vitest';
import { addFaultPoint, faultPointResult, faultPointResults, nextFaultPointId, pruneFaultPoints, removeFaultPoint, updateFaultPoint } from './faultPoints';
import { evaluateFeeder } from './electrical';
import { evaluateEarthing } from './earthing';
import { puFaultAt } from './perUnit';
import type { Feeder, Project } from '../types';

const incomer: Feeder = { id: 'F1', boardId: 'MDB', name: 'To SMDB', feedsBoardId: 'SMDB', loadKw: 0, demandFactor: 1, powerFactor: 0.9, lengthM: 50, cableCsaMm2: 240, cores: 4, breakerRatingA: 400, breakerIcuKa: 50 };
const final: Feeder = { id: 'C1', boardId: 'SMDB', name: 'Socket', loadKw: 3, demandFactor: 1, powerFactor: 0.9, lengthM: 30, cableCsaMm2: 4, cores: 2, breakerRatingA: 20, breakerIcuKa: 10 };
const project = (over: Partial<Project> = {}): Project => ({
  name: 'T', voltageV: 415, frequencyHz: 50, ambientC: 40, vdLimitPct: 4, updatedAt: '',
  gridSources: [{ id: 'G1', name: 'Ring', kv: 11, faultMva: 500 }],
  boards: [{ id: 'MDB', name: 'M', sourceKva: 1000, sourceImpedancePct: 5 }, { id: 'SMDB', name: 'S', upstreamId: 'MDB' }],
  feeders: [incomer, final], ...over
});

describe('fault point numbers', () => {
  it('takes the lowest free number', () => {
    expect(nextFaultPointId(undefined)).toBe('F1');
    expect(nextFaultPointId([{ id: 'F1' }, { id: 'F3' }])).toBe('F2');
  });
  it('adds, changes, removes and prunes marks', () => {
    let p = addFaultPoint(project(), { boardId: 'MDB' });
    p = addFaultPoint(p, { feederId: 'F1', distanceM: 20 });
    expect(p.faultPoints).toEqual([{ id: 'F1', boardId: 'MDB' }, { id: 'F2', feederId: 'F1', distanceM: 20 }]);
    p = updateFaultPoint(p, 'F2', { name: 'Riser tap' });
    expect(p.faultPoints![1].name).toBe('Riser tap');
    const gone = pruneFaultPoints({ ...p, feeders: [final] });
    expect(gone.faultPoints).toEqual([{ id: 'F1', boardId: 'MDB' }]);
    expect(pruneFaultPoints(p)).toBe(p);
    expect(removeFaultPoint(removeFaultPoint(p, 'F1'), 'F2').faultPoints).toBeUndefined();
  });
});

describe('fault at a marked point', () => {
  it('on a busbar: the board\'s own fault, peak, and the weakest breaker on it', () => {
    const p = project(), r = faultPointResult(p, { id: 'F1', boardId: 'MDB' }), b = puFaultAt(p, p.boards[0]);
    expect(r.place).toBe('MDB busbar');
    expect(r.ikKa).toBeCloseTo(b.ikKa, 9);
    expect(r.ipKa).toBeCloseTo(b.ipKa, 9);
    expect(r.icuKa).toBe(50);
    expect(r.icuOk).toBe(true);
    expect(r.earthKa).toBeGreaterThan(0);
  });
  it('at the far end of a cable: the study\'s cable-end fault and the earth loop study\'s current', () => {
    const p = project();
    const r = faultPointResult(p, { id: 'F1', feederId: 'F1' });
    expect(r.place).toBe('F1 cable, far end (50 m)');
    expect(r.ikKa).toBeCloseTo(evaluateFeeder(p, incomer).endFaultKA, 9);
    expect(r.earthKa! * 1000).toBeCloseTo(evaluateEarthing(p, incomer).faultA, 6);
    const c = faultPointResult(p, { id: 'F2', feederId: 'C1' }); // 2-core: phase and neutral
    expect(c.ikKa).toBeCloseTo(evaluateFeeder(p, final).endFaultKA, 9);
    expect(c.icuKa).toBe(10);
    expect(c.icuOk).toBe(false); // 10 kA breaker on a busbar above 10 kA
  });
  it('part-way along a cable: between the two ends; at 0 m the busbar fault', () => {
    const p = project();
    const start = faultPointResult(p, { id: 'F1', feederId: 'F1', distanceM: 0 }), mid = faultPointResult(p, { id: 'F1', feederId: 'F1', distanceM: 25 }), end = faultPointResult(p, { id: 'F1', feederId: 'F1' });
    expect(start.place).toBe('F1 cable, at MDB');
    expect(start.ikKa).toBeCloseTo(puFaultAt(p, p.boards[0]).ikKa, 9);
    expect(mid.place).toBe('F1 cable, 25 m from MDB');
    expect(mid.ikKa).toBeLessThan(start.ikKa);
    expect(mid.ikKa).toBeGreaterThan(end.ikKa);
    expect(mid.pu.r).toBeCloseTo((start.pu.r + end.pu.r) / 2, 9);
  });
  it('says why there is no result', () => {
    const p = project();
    expect(faultPointResult(p, { id: 'F1', boardId: 'GONE' }).problem).toBe('board GONE is not in the project');
    expect(faultPointResult(p, { id: 'F1', feederId: 'X9' }).problem).toBe('circuit X9 is not in the project');
    expect(faultPointResult(p, { id: 'F1', feederId: 'F1', distanceM: 80 }).problem).toBe('80 m is not on the 50 m cable of F1');
    expect(Number.isNaN(faultPointResult(p, { id: 'F1' }).ikKa)).toBe(true);
  });
  it('lists the marks in number order', () => {
    const p = project({ faultPoints: [{ id: 'F10', boardId: 'MDB' }, { id: 'F2', boardId: 'SMDB' }, { id: 'F1', feederId: 'F1' }] });
    expect(faultPointResults(p).map((r) => r.point.id)).toEqual(['F1', 'F2', 'F10']);
  });
});

describe('placing a mark from the SLD', () => {
  it('a click on a busbar or a cable adds the next mark; the empty drawing takes none', async () => {
    const { applyDrop, canDrop, dropsOn } = await import('../model/sldEdit');
    const p = project();
    expect(dropsOn({ kind: 'faultPoint' })).toEqual(['bus', 'feeder']);
    expect(canDrop(p, { kind: 'faultPoint' }, { type: 'canvas' })).toBe(false);
    const a = applyDrop(p, { kind: 'faultPoint' }, { type: 'bus', boardId: 'SMDB' });
    expect(a.project.faultPoints).toEqual([{ id: 'F1', boardId: 'SMDB' }]);
    expect(a.message).toBe('Fault point F1 on SMDB busbar — its values are in the short circuit report');
    const b = applyDrop(a.project, { kind: 'faultPoint' }, { type: 'feeder', feederId: 'F1' });
    expect(b.project.faultPoints![1]).toEqual({ id: 'F2', feederId: 'F1' });
    expect(applyDrop(p, { kind: 'faultPoint' }, { type: 'bus', boardId: 'GONE' }).project).toBe(p);
  });
  it('a mark left by a deleted circuit is dropped when the next one is added, and its number is free again', () => {
    const p = project({ faultPoints: [{ id: 'F1', feederId: 'DELETED' }] });
    expect(addFaultPoint(p, { boardId: 'MDB' }).faultPoints).toEqual([{ id: 'F1', boardId: 'MDB' }]);
  });
});
