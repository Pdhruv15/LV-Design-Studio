import { describe, expect, it } from 'vitest';
import { followBoundaries, isAssociative, lostAssociation } from './cadHatchAssoc';
import { addSketch, moved, removeSketch, sketchOf, updateSketch, withSketchItems } from './cadSketch';
import { hatchItem, hatchOutline } from './cadAnnotate';
import { stretched } from './cadEdit';
import { sampleProject } from '../data/sampleProject';
import type { Project, SketchItem } from '../types';

const rect = (id: string, x0: number, y0: number, x1: number, y1: number): SketchItem => ({ id, kind: 'pline', layer: 'LV-SKETCH', closed: true, pts: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] });
const spec = { pattern: 'ansi31' as const, scale: 3, angle: 0 };
const F = 'plan.dxf';
/** A project with a 10 × 10 polyline S1 and a 2 × 2 island S2, and the hatch of them (S3) made as the tool makes it. */
function start(): { p: Project; hatch: () => SketchItem } {
  let p: Project = { ...sampleProject };
  p = withSketchItems(p, F, [rect('S1', 0, 0, 10, 10), rect('S2', 2, 2, 4, 4)]);
  const o = hatchOutline(sketchOf(p, F), [6, 6], [])!;
  p = addSketch(p, F, { ...hatchItem(o, spec, o.ids) }).project;
  return { p, hatch: () => sketchOf(p, F).find((x) => x.hatch)! };
}
const item = (p: Project, id: string) => sketchOf(p, F).find((x) => x.id === id)!;

describe('associative hatches', () => {
  it('a hatch made from a polyline with an island is associative', () => {
    const { p } = start(), h = item(p, 'S3');
    expect(h.assoc).toEqual(['S1', 'S2']);
    expect(isAssociative(h, sketchOf(p, F))).toBe(true);
    expect(isAssociative({ ...h, assoc: undefined }, sketchOf(p, F))).toBe(false);
    expect(isAssociative({ ...h, assoc: ['S1', 'Nope'] }, sketchOf(p, F))).toBe(false);
  });

  it('follows a moved boundary, with its island', () => {
    const { p } = start();
    const next = updateSketch(updateSketch(p, F, moved(item(p, 'S1'), 5, 0)), F, moved(item(p, 'S2'), 5, 0));
    const h = item(next, 'S3');
    expect(h.pts).toEqual(item(next, 'S1').pts);
    expect(h.holes).toEqual([item(next, 'S2').pts]);
    expect(h.assoc).toEqual(['S1', 'S2']);
    expect(h.hatch).toEqual(item(p, 'S3').hatch);
  });

  it('follows a stretched boundary and an island that is moved alone', () => {
    const { p } = start();
    const s = stretched(item(p, 'S1'), [9, -1], [11, 11], 3, 0)!;
    let next = updateSketch(p, F, s);
    expect(item(next, 'S3').pts).toEqual(s.pts);
    expect(item(next, 'S3').pts[1]).toEqual([13, 0]);
    next = updateSketch(next, F, moved(item(next, 'S2'), 1, 1));
    expect(item(next, 'S3').holes).toEqual([item(next, 'S2').pts]);
    expect(item(next, 'S3').assoc).toBeDefined();
  });

  it('follows a circle source as a circle', () => {
    let p: Project = withSketchItems({ ...sampleProject }, F, [{ id: 'C', kind: 'circle', layer: 'L', pts: [[0, 0]], r: 5 }]);
    const o = hatchOutline(sketchOf(p, F), [1, 1], [])!;
    p = addSketch(p, F, hatchItem(o, spec, o.ids)).project;
    p = updateSketch(p, F, { ...item(p, 'C'), pts: [[3, 3]], r: 6 });
    expect(item(p, 'S1')).toMatchObject({ kind: 'circle', pts: [[3, 3]], r: 6, assoc: ['C'] });
  });

  it('lets go, keeping its shape, when a source is erased or opened', () => {
    const { p } = start();
    const erased = removeSketch(p, F, 'S2');
    expect(item(erased, 'S3').assoc).toBeUndefined();
    expect(item(erased, 'S3').holes).toHaveLength(1);
    expect(lostAssociation(sketchOf(p, F), sketchOf(erased, F))).toBe(1);
    const { closed: _c, ...open } = item(p, 'S1');
    const opened = updateSketch(p, F, open as SketchItem);
    expect(item(opened, 'S3').assoc).toBeUndefined();
    expect(item(opened, 'S3').pts).toEqual(item(p, 'S3').pts);
    expect(removeSketch(p, F, 'S1')).toBeDefined();
    expect(item(removeSketch(p, F, 'S1'), 'S3').assoc).toBeUndefined();
  });

  it('lets go when the hatch alone is moved', () => {
    const { p } = start();
    const next = updateSketch(p, F, moved(item(p, 'S3'), 20, 0));
    expect(item(next, 'S3').assoc).toBeUndefined();
    expect(item(next, 'S3').pts[0]).toEqual([20, 0]);
    expect(item(next, 'S1').pts[0]).toEqual([0, 0]);
  });

  it('a copy of a hatch (its outline is not its sources\') is plain at once, and does not jump when they change', () => {
    const { p } = start();
    const { id: _id, ...copy } = moved(item(p, 'S3'), 30, 0);
    const withCopy = addSketch(p, F, { ...copy, assoc: ['S1', 'S2'] }).project;
    expect(item(withCopy, 'S4').assoc).toBeUndefined();
    expect(lostAssociation(sketchOf(p, F), sketchOf(withCopy, F))).toBe(0);
    const next = updateSketch(withCopy, F, moved(item(withCopy, 'S1'), 0, 5));
    expect(item(next, 'S4').assoc).toBeUndefined();
    expect(item(next, 'S4').pts[0]).toEqual([30, 0]);
    expect(item(next, 'S3').pts).toEqual(item(next, 'S1').pts);
  });

  it('returns the very same list when nothing changes, and leaves hatches without sources alone', () => {
    const { p } = start(), items = sketchOf(p, F);
    expect(followBoundaries(items, items)).toBe(items);
    const plain = items.map((x) => (x.hatch ? { ...x, assoc: undefined } : x));
    expect(followBoundaries(items, plain)).toBe(plain);
    const same = items.map((x) => ({ ...x }));
    expect(followBoundaries(items, same)).toBe(same);
  });

  it('an island added to the hatch and to its sources together stays associative', () => {
    const { p } = start();
    const r = addSketch(p, F, rect('x', 6, 6, 7, 7)), h = item(r.project, 'S3');
    const next = updateSketch(r.project, F, { ...h, holes: [...h.holes!, item(r.project, r.id).pts], assoc: [...h.assoc!, r.id] });
    expect(item(next, 'S3').assoc).toEqual(['S1', 'S2', r.id]);
    expect(item(next, 'S3').holes).toHaveLength(2);
  });
});
