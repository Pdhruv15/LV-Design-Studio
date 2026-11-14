import { describe, expect, it } from 'vitest';
import { sampleProject } from '../data/sampleProject';
import { annoOf, centreOf, hatchArea, hatchItem, hatchOutline, leaderItems, northArrowItems, roomTagItems, textUnits, unitsPerPaperMm } from './cadAnnotate';
import { placedLines } from './cadHatch';
import type { SketchItem } from '../types';

type Pt = [number, number];
const rect = (id: string, x0: number, y0: number, x1: number, y1: number): SketchItem => ({ id, kind: 'pline', layer: 'LV-SKETCH', closed: true, pts: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] });

describe('hatch', () => {
  it('fills the smallest closed object around the point, a circle as a circle, else the room', () => {
    const items = [rect('S1', 0, 0, 10, 10), rect('S2', 2, 2, 4, 4), { id: 'S3', kind: 'circle' as const, layer: 'L', pts: [[8, 8]] as Pt[], r: 1 }];
    expect(hatchOutline(items, [3, 3], [])).toMatchObject({ pts: items[1].pts, from: 'object' });
    expect(hatchOutline(items, [6, 3], [])!.pts).toEqual(items[0].pts);
    expect(hatchOutline(items, [8.2, 8.2], [])).toMatchObject({ circle: { c: [8, 8], r: 1 } });
    const room: Pt[] = [[20, 0], [30, 0], [30, 5], [20, 5]];
    expect(hatchOutline(items, [25, 2], [room])).toEqual({ pts: room, from: 'room', holes: [], islandIds: [] });
    expect(hatchOutline(items, [50, 50], [room])).toBeUndefined();
  });

  it('a hatch is a closed polyline on LV-HATCH with its pattern; its lines are spaced in paper mm at the scale', () => {
    const spec = { pattern: 'ansi37' as const, scale: 3, angle: 15 };
    expect(hatchItem({ pts: [[0, 0], [1, 0], [1, 1]] }, spec)).toEqual({ kind: 'pline', layer: 'LV-HATCH', pts: [[0, 0], [1, 0], [1, 1]], closed: true, hatch: spec });
    const perMm = unitsPerPaperMm({ textMm: 2.5, scale: 100 }, 0.001); // mm drawing: 100 units per paper mm
    expect(perMm).toBe(100);
    const step = (o: Pt, a: number) => Math.hypot(o[0], o[1]) * Math.cos(Math.atan2(o[1], o[0]) - a - Math.PI / 2);
    expect(placedLines(spec, perMm).map((f) => [+(f.angle * 180 / Math.PI).toFixed(6), +step(f.offset, f.angle).toFixed(6)])).toEqual([[60, 300], [150, 300]]);
    expect(placedLines({ ...spec, pattern: 'solid' }, perMm)).toEqual([]);
  });
});

describe('annotation', () => {
  it('text height is paper mm at the annotation scale: 2.5 mm at 1:100 is 0.25 m', () => {
    expect(annoOf({ ...sampleProject, cadAnno: undefined })).toEqual({ textMm: 2.5, scale: 100 });
    expect(textUnits({ textMm: 2.5, scale: 100 }, 0.001)).toBeCloseTo(250, 9);
    expect(textUnits({ textMm: 3.5, scale: 50 }, 1)).toBeCloseTo(0.175, 9);
  });

  it('a leader: an arrowed line and its text beside the last point (left of it when the line runs left)', () => {
    const [l, t] = leaderItems([[0, 0], [10, 5]], 'DB-GF1', 2);
    expect(l).toEqual({ kind: 'line', layer: 'LV-ANNO', pts: [[0, 0], [10, 5]], leader: true });
    expect(t).toMatchObject({ kind: 'text', text: 'DB-GF1', h: 2, pts: [[11, 4.2]] });
    expect(leaderItems([[0, 0], [-10, 5]], 'AB', 2)[1].pts[0][0]).toBeCloseTo(-13.4, 9);
    expect(leaderItems([[0, 0], [5, 5], [9, 5]], '', 2)).toEqual([{ kind: 'pline', layer: 'LV-ANNO', pts: [[0, 0], [5, 5], [9, 5]], leader: true }]);
  });

  it('a room tag (name over area) and a north arrow', () => {
    const [n, a] = roomTagItems('Living', 23.456, [10, 10], 1);
    expect([n.text, a.text]).toEqual(['LIVING', '23.46 m²']);
    expect(n.pts[0][1]).toBeGreaterThan(a.pts[0][1]);
    const north = northArrowItems([0, 0], 1);
    expect(north.map((x) => x.kind)).toEqual(['circle', 'pline', 'text']);
    expect(north[2].text).toBe('N');
    expect(centreOf([[0, 0], [4, 0], [4, 2], [0, 2]])).toEqual([2, 1]);
  });
});

describe('hatch islands, association and area', () => {
  const outerRect = rect('S1', 0, 0, 10, 10), hole = rect('S2', 2, 2, 4, 4), deep = rect('S3', 2.5, 2.5, 3.5, 3.5);
  const circle: SketchItem = { id: 'S4', kind: 'circle', layer: 'L', pts: [[7, 7]], r: 1 };

  it('finds the closed drawn objects wholly inside the outer as islands, with their ids', () => {
    const o = hatchOutline([outerRect, hole, circle], [6, 1], [])!;
    expect(o.pts).toEqual(outerRect.pts);
    expect(o.holes).toHaveLength(2);
    expect(o.holes[0]).toEqual(hole.pts);
    expect(o.holes[1]).toHaveLength(32);
    expect(o.ids).toEqual(['S1', 'S2', 'S4']);
    expect(o.islandIds).toEqual(['S2', 'S4']);
    // Off: no islands. An object crossing the outline, a hatch and a text are never islands.
    expect(hatchOutline([outerRect, hole], [6, 1], [], false)!.holes).toEqual([]);
    const cross = rect('S5', 8, 8, 12, 12), hatched: SketchItem = { ...rect('S6', 5, 5, 6, 6), hatch: { pattern: 'ansi31', scale: 3, angle: 0 } };
    const text: SketchItem = { id: 'S7', kind: 'text', layer: 'L', pts: [[1, 8]], text: 'x', h: 1 };
    expect(hatchOutline([outerRect, cross, hatched, text], [6, 1], [])!.holes).toEqual([]);
  });

  it('an island inside an island is found too (hatched again); a circle outer takes the islands inside the circle', () => {
    expect(hatchOutline([outerRect, hole, deep], [6, 1], [])!.holes).toHaveLength(2);
    const big: SketchItem = { id: 'C', kind: 'circle', layer: 'L', pts: [[0, 0]], r: 10 };
    const o = hatchOutline([big, rect('R', -1, -1, 1, 1), rect('Out', 8, 8, 9, 9)], [5, 0], [])!;
    expect(o.circle).toEqual({ c: [0, 0], r: 10 });
    expect(o.holes).toHaveLength(1);
    expect(o.ids).toEqual(['C', 'R']);
  });

  it('a room has islands but no ids: only a drawn outer is associative', () => {
    const room: Pt[] = [[20, 0], [30, 0], [30, 10], [20, 10]];
    const o = hatchOutline([rect('I', 22, 2, 24, 4)], [28, 8], [room])!;
    expect(o.from).toBe('room');
    expect(o.holes).toHaveLength(1);
    expect(o.ids).toBeUndefined();
    expect(o.islandIds).toEqual(['I']);
    // An object the same size as the outline is not an island of it.
    expect(hatchOutline([outerRect, { ...outerRect, id: 'Dup' }], [5, 5], [])!.holes).toEqual([]);
  });

  it('hatchItem writes the islands and the sources; hatchArea is the outline less the islands, a nested one counted back', () => {
    const spec = { pattern: 'ansi31' as const, scale: 3, angle: 0 };
    const item = hatchItem({ pts: outerRect.pts, holes: [hole.pts, deep.pts] }, spec, ['S1', 'S2', 'S3']);
    expect(item).toMatchObject({ holes: [hole.pts, deep.pts], assoc: ['S1', 'S2', 'S3'] });
    expect(hatchItem({ pts: outerRect.pts }, spec)).not.toHaveProperty('holes');
    expect(hatchItem({ pts: outerRect.pts }, spec)).not.toHaveProperty('assoc');
    expect(hatchArea({ kind: 'pline', pts: outerRect.pts })).toBeCloseTo(100);
    expect(hatchArea(item as SketchItem)).toBeCloseTo(100 - 4 + 1); // 100 less the island 4, the 1 inside it hatched again
    expect(hatchArea({ kind: 'circle', pts: [[0, 0]], r: 1, holes: [[[0, 0], [0.5, 0], [0.5, 0.5], [0, 0.5]]] })).toBeCloseTo(Math.PI - 0.25, 6);
  });
});
