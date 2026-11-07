import { describe, expect, it } from 'vitest';
import { sampleProject } from '../data/sampleProject';
import { annoOf, centreOf, hatchFamilies, hatchItem, hatchOutline, leaderItems, northArrowItems, roomTagItems, textUnits, unitsPerPaperMm } from './cadAnnotate';
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
    expect(hatchOutline(items, [25, 2], [room])).toEqual({ pts: room, from: 'room' });
    expect(hatchOutline(items, [50, 50], [room])).toBeUndefined();
  });

  it('a hatch is a closed polyline on LV-HATCH with its pattern; its lines are spaced in paper mm at the scale', () => {
    const spec = { pattern: 'ansi37' as const, scale: 3, angle: 15 };
    expect(hatchItem({ pts: [[0, 0], [1, 0], [1, 1]] }, spec)).toEqual({ kind: 'pline', layer: 'LV-HATCH', pts: [[0, 0], [1, 0], [1, 1]], closed: true, hatch: spec });
    const perMm = unitsPerPaperMm({ textMm: 2.5, scale: 100 }, 0.001); // mm drawing: 100 units per paper mm
    expect(perMm).toBe(100);
    expect(hatchFamilies(spec, perMm).map((f) => [+(f.angle * 180 / Math.PI).toFixed(6), f.step])).toEqual([[60, 300], [150, 300]]);
    expect(hatchFamilies({ ...spec, pattern: 'solid' }, perMm)).toEqual([]);
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
