import { describe, expect, it } from 'vitest';
import { solveSketch } from '../calc/scSketch';
import { addCable, addFault, addGenerator, addMotors, addSource, addTransformer, deleteCount, deleteItem, emptySketch, layoutSketch, type ScEdit } from './scSketchEdit';

const must = (e: ScEdit | undefined) => e!;
/** Source → TX-1 → B2 (generator, motors, cable → B3 with a fault), fault F1 on B1. */
function sample() {
  let e = must(addSource(emptySketch([])));
  const b1 = e.sketch.buses[0].id;
  e = must(addTransformer(e.sketch, b1));
  const b2 = e.sketch.buses[1].id;
  e = must(addGenerator(e.sketch, b2));
  e = must(addMotors(e.sketch, b2));
  e = must(addCable(e.sketch, b2));
  const b3 = e.sketch.buses[2].id;
  e = must(addFault(e.sketch, { kind: 'bus', id: b3 }));
  e = must(addFault(e.sketch, { kind: 'bus', id: b1 }));
  return { s: e.sketch, b1, b2, b3 };
}

describe('adding items', () => {
  it('starts with a source on bus B1 (11 kV, 500 MVA, X/R 10) and refuses a second one', () => {
    const e = addSource(emptySketch([]))!;
    expect(e.sketch.buses).toEqual([{ id: 'B1', name: 'B1' }]);
    expect(e.sketch.sources[0]).toMatchObject({ busId: 'B1', kv: 11, faultMva: 500, xr: 10 });
    expect(addSource(e.sketch)).toBeUndefined();
  });
  it('a transformer takes the primary from the bus voltage and adds a bus below it', () => {
    const e = addTransformer(addSource(emptySketch([]))!.sketch, 'B1')!;
    expect(e.sketch.transformers[0]).toMatchObject({ fromBusId: 'B1', toBusId: 'B2', kva: 1000, primaryKv: 11, secondaryKv: 0.415, zPct: 5, vectorGroup: 'Dyn11' });
    // a second transformer below the LV bus takes 0.415 kV as its primary
    const e2 = addTransformer(e.sketch, 'B2')!;
    expect(e2.sketch.transformers[1].primaryKv).toBe(0.415);
  });
  it('a fault point goes on a bus, or at the end of a cable; nothing else', () => {
    const { s, b2 } = sample();
    expect(s.faultPoints.map((f) => f.id)).toEqual(['F1', 'F2']);
    const c = addFault(s, { kind: 'cable', id: s.cables[0].id })!;
    expect(c.sketch.faultPoints[2]).toMatchObject({ cableId: 'C1', distanceM: 50 });
    expect(addFault(s, { kind: 'motors', id: 'M1' })).toBeUndefined();
    expect(addGenerator(s, 'nope')).toBeUndefined();
    expect(b2).toBe('B2');
  });
  it('gives the sketch a result at every fault point', () => {
    const { s } = sample();
    const r = solveSketch(s);
    expect(r.faultPoints).toHaveLength(2);
    expect(r.faultPoints.every((p) => p.ikMaxKa > 0)).toBe(true);
  });
});

describe('deleting', () => {
  it('a bus takes the branches, buses, generators, motors and fault points below it', () => {
    const { s, b2 } = sample();
    const d = deleteItem(s, { kind: 'bus', id: b2 });
    expect(d.buses.map((b) => b.id)).toEqual(['B1']);
    expect(d.transformers).toEqual([]); expect(d.cables).toEqual([]); expect(d.generators).toEqual([]); expect(d.motors).toEqual([]);
    expect(d.faultPoints.map((f) => f.id)).toEqual(['F2']); // F1 was on B3 below, F2 stays on B1
    expect(d.sources).toHaveLength(1);
  });
  it('a cable takes the bus below it, and the fault points on the cable', () => {
    const { s } = sample();
    const withCableFault = addFault(s, { kind: 'cable', id: 'C1' })!.sketch;
    const d = deleteItem(withCableFault, { kind: 'cable', id: 'C1' });
    expect(d.cables).toEqual([]);
    expect(d.buses.map((b) => b.id)).toEqual(['B1', 'B2']);
    expect(d.faultPoints.map((f) => f.id)).toEqual(['F2']);
    expect(deleteCount(withCableFault, { kind: 'cable', id: 'C1' })).toBe(4); // cable, B3, F1, F3
  });
  it('deleting the source empties the sketch; a generator removes only itself', () => {
    const { s } = sample();
    const d = deleteItem(s, { kind: 'source', id: 'S1' });
    expect([d.buses, d.sources, d.transformers, d.cables, d.generators, d.motors, d.faultPoints].map((a) => a.length)).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(deleteCount(s, { kind: 'generator', id: 'G1' })).toBe(1);
  });
});

describe('layout', () => {
  it('puts each bus once, children below parents, siblings side by side without overlap', () => {
    const { s } = sample();
    const l = layoutSketch(s);
    expect(l.buses.map((b) => b.id).sort()).toEqual(['B1', 'B2', 'B3']);
    const y = (id: string) => l.buses.find((b) => b.id === id)!.y;
    expect(y('B1')).toBeLessThan(y('B2')); expect(y('B2')).toBeLessThan(y('B3'));
    expect(l.branches).toHaveLength(2);
    expect(l.leaves).toHaveLength(2);
    expect(l.faults).toHaveLength(2);
    const [g, m] = l.leaves; expect(m.x - g.x).toBeGreaterThanOrEqual(120);
  });
  it('two cables from one bus do not overlap, and everything stays inside the canvas', () => {
    let e = must(addSource(emptySketch([])));
    e = must(addCable(e.sketch, 'B1')); e = must(addCable(e.sketch, 'B1'));
    e = must(addFault(e.sketch, { kind: 'bus', id: 'B2' })); e = must(addFault(e.sketch, { kind: 'bus', id: 'B3' }));
    const l = layoutSketch(e.sketch);
    const [a, b] = ['B2', 'B3'].map((id) => l.buses.find((x) => x.id === id)!);
    expect(a.x1).toBeLessThan(b.x0);
    expect(l.buses.every((x) => x.x0 >= 0 && x.x1 <= l.width)).toBe(true);
  });
  it('lays out a loaded file with a ring or an orphan bus without looping', () => {
    const s = emptySketch([]);
    s.buses = [{ id: 'A', name: 'A' }, { id: 'B', name: 'B' }, { id: 'Z', name: 'Z' }];
    s.cables = [{ id: 'C1', fromBusId: 'A', toBusId: 'B', csaMm2: 240, family: { conductor: 'cu', insulation: 'xlpe', form: 'multi' }, lengthM: 10 }, { id: 'C2', fromBusId: 'B', toBusId: 'A', csaMm2: 240, family: { conductor: 'cu', insulation: 'xlpe', form: 'multi' }, lengthM: 10 }];
    expect(layoutSketch(s).buses.map((b) => b.id).sort()).toEqual(['A', 'B', 'Z']);
  });
});
