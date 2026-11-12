import { describe, expect, it } from 'vitest';
import { sampleProject } from '../data/sampleProject';
import { scheduleCircuits } from '../calc/loadSchedule';
import { addCircuit, circuitRef, duplicateCircuit, fixCircuit, updateCircuit } from './schedule';

const BOARD = 'DB-GF1';
const byId = (p: typeof sampleProject, id: string) => p.feeders.find((f) => f.id === id)!;

describe('duplicate a circuit', () => {
  it('copies a single-phase circuit into the next free slot with its own id', () => {
    const src = byId(sampleProject, 'DB-GF1-R3');
    const { project, id } = duplicateCircuit(sampleProject, src.id);
    const copy = byId(project, id);
    expect(project.feeders).toHaveLength(sampleProject.feeders.length + 1);
    expect(id).not.toBe(src.id);
    expect(new Set(project.feeders.map((f) => f.id)).size).toBe(project.feeders.length);
    expect(copy.boardId).toBe(BOARD);
    expect(`${copy.phase}${copy.way}`).not.toBe(`${src.phase}${src.way}`);
    const slots = scheduleCircuits(project, BOARD).map((f) => `${f.phase}${f.way}`);
    expect(new Set(slots).size).toBe(slots.length);
    expect(copy.room).toBe(src.room);
    expect(copy.points).toEqual(src.points);
    expect(copy.points).not.toBe(src.points);
    expect(copy.lengthM).toBe(src.lengthM);
    expect(copy.loadKw).toBeCloseTo(src.loadKw, 6);
    expect(circuitRef(copy)).toBe(`${copy.phase}${copy.way}`);
  });

  it('copies everything that was typed: remarks, load items, factors', () => {
    let p = updateCircuit(sampleProject, 'DB-GF1-R3', { remarks: 'by others', powerFactor: 0.8, demandFactor: 0.7, lengthM: 33,
      loadItems: [{ name: 'Oven', pointType: 'cooker', quantity: 2, unitWatts: 3000 }] });
    const src = byId(p, 'DB-GF1-R3');
    const r = duplicateCircuit(p, src.id);
    p = r.project;
    const copy = byId(p, r.id);
    expect(copy).toMatchObject({ remarks: 'by others', powerFactor: 0.8, demandFactor: 0.7, lengthM: 33, room: src.room });
    expect(copy.loadItems).toEqual(src.loadItems);
    expect(copy.loadItems).not.toBe(src.loadItems);
    expect(copy.loadKw).toBeCloseTo(src.loadKw, 6);
  });

  it('keeps hand-chosen sizes', () => {
    const p = updateCircuit(sampleProject, 'DB-GF1-R3', { breakerRatingA: 63, cableCsaMm2: 16 });
    expect(byId(p, 'DB-GF1-R3').manualSize).toBe(true);
    const r = duplicateCircuit(p, 'DB-GF1-R3');
    expect(byId(r.project, r.id)).toMatchObject({ breakerRatingA: 63, cableCsaMm2: 16, manualSize: true });
  });

  it('copies a 3-phase circuit into the next free RYB way', () => {
    const a = addCircuit(sampleProject, BOARD, 'RYB');
    const r = duplicateCircuit(a.project, a.id);
    const first = byId(r.project, a.id), copy = byId(r.project, r.id);
    expect(copy.phase).toBe('RYB');
    expect(copy.way).not.toBe(first.way);
    expect(copy.cores).toBe(first.cores);
    expect(r.id).toBe(`${BOARD}-RYB${copy.way}`);
    const again = duplicateCircuit(r.project, r.id);
    expect(new Set(again.project.feeders.map((f) => f.id)).size).toBe(again.project.feeders.length);
  });

  it('says so when the circuit is gone', () => {
    expect(() => duplicateCircuit(sampleProject, 'nothing')).toThrow(/no longer/);
  });
});

describe('apply a quick fix to a schedule circuit', () => {
  it('sets the sizes and marks the circuit as sized by hand', () => {
    const p = fixCircuit(sampleProject, 'DB-GF1-R3', { cableCsaMm2: 16, cpcMm2: undefined });
    expect(byId(p, 'DB-GF1-R3')).toMatchObject({ cableCsaMm2: 16, manualSize: true });
    expect(fixCircuit(sampleProject, 'nothing', { cableCsaMm2: 16 })).toBe(sampleProject);
  });
});

describe('duplicate a circuit: what belongs to the original alone', () => {
  it('leaves out the permanent ID, the route on the plans and the ELV load', () => {
    const p = { ...sampleProject, feeders: sampleProject.feeders.map((f) => (f.id === 'DB-GF1-R3' ? { ...f, uid: 'u-1', trayRoute: 'A-B', cadVerticalM: 3, lengthToCheck: true, elvLoad: 'x:y#1' } : f)) };
    const { project, id } = duplicateCircuit(p, 'DB-GF1-R3');
    const copy = byId(project, id);
    expect(copy.uid).toBeUndefined();
    expect(copy.trayRoute).toBeUndefined();
    expect(copy.cadVerticalM).toBeUndefined();
    expect(copy.lengthToCheck).toBeUndefined();
    expect(copy.elvLoad).toBeUndefined();
    expect(byId(project, 'DB-GF1-R3')).toMatchObject({ uid: 'u-1', trayRoute: 'A-B', elvLoad: 'x:y#1' });
  });
});
