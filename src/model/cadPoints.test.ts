import { describe, expect, it } from 'vitest';
import { canDivide, pdsizeOf, POINT_SHAPES, pointMark, pointRadius, pointsAlong, pointsEvery, pointShapeLabel, pointStyleOf } from './cadPoints';
import type { SketchItem } from '../types';

/** POINT, DIVIDE, MEASURE and the point style (S8 of the Design CAD 2D gap plan). */

const line: SketchItem = { id: 'L', kind: 'line', layer: 'LV-SKETCH', pts: [[0, 0], [10000, 0]] };
const bent: SketchItem = { id: 'P', kind: 'pline', layer: 'LV-SKETCH', pts: [[0, 0], [6000, 0], [6000, 4000]] };
const square: SketchItem = { id: 'S', kind: 'pline', layer: 'LV-SKETCH', closed: true, pts: [[0, 0], [10000, 0], [10000, 10000], [0, 10000]] };
const arc: SketchItem = { id: 'A', kind: 'arc', layer: 'LV-SKETCH', pts: [[0, 0]], r: 10000, a0: 0, a1: Math.PI / 2 };
const circle: SketchItem = { id: 'C', kind: 'circle', layer: 'LV-SKETCH', pts: [[0, 0]], r: 10000 };
const xy = (q: { at: [number, number] }) => [Math.round(q.at[0]) || 0, Math.round(q.at[1]) || 0];
const deg = (a: number) => Math.round((a * 180) / Math.PI);

describe('DIVIDE and MEASURE', () => {
  it('divides 10 m by 5 into 4 points 2 m apart, a bent polyline along its length, a closed one into n points from its start', () => {
    expect(pointsAlong(line, 5).map(xy)).toEqual([[2000, 0], [4000, 0], [6000, 0], [8000, 0]]);
    expect(pointsAlong(line, 5).map((q) => q.angle)).toEqual([0, 0, 0, 0]);
    expect(pointsAlong(bent, 2).map(xy)).toEqual([[5000, 0]]);
    expect(pointsAlong(bent, 5).map(xy)).toEqual([[2000, 0], [4000, 0], [6000, 0], [6000, 2000]]);
    expect(pointsAlong(square, 4).map(xy)).toEqual([[0, 0], [10000, 0], [10000, 10000], [0, 10000]]);
    expect(pointsAlong(square, 8).map(xy)).toEqual([[0, 0], [5000, 0], [10000, 0], [10000, 5000], [10000, 10000], [5000, 10000], [0, 10000], [0, 5000]]);
    expect(pointsAlong(line, 1)).toEqual([]);
    expect(pointsAlong(line, 2.5)).toEqual([]);
  });

  it('measures 10 m every 3 m into 3 points from the end nearer the pick, short of the far end', () => {
    expect(pointsEvery(line, 3000).map(xy)).toEqual([[3000, 0], [6000, 0], [9000, 0]]);
    expect(pointsEvery(line, 3000, [9900, 100]).map(xy)).toEqual([[7000, 0], [4000, 0], [1000, 0]]);
    expect(pointsEvery(line, 2500).map(xy)).toEqual([[2500, 0], [5000, 0], [7500, 0]]); // a point on the far end is not set out
    expect(pointsEvery(line, 20000)).toEqual([]);
    expect(pointsEvery(line, 0)).toEqual([]);
  });

  it('works round arcs, circles and ellipses, with the direction of the curve at each point', () => {
    const a = pointsAlong(arc, 3);
    expect(a.map(xy)).toEqual([[8660, 5000], [5000, 8660]]);
    expect(a.map((q) => deg(q.angle))).toEqual([120, 150]);
    const c = pointsEvery(circle, (2 * Math.PI * 10000) / 4);
    expect(c.map(xy)).toEqual([[0, 10000], [-10000, 0], [0, -10000]]);
    expect(pointsAlong(circle, 4).map(xy)).toEqual([[10000, 0], [0, 10000], [-10000, 0], [0, -10000]]);
    const e: SketchItem = { id: 'E', kind: 'ellipse', layer: 'LV-SKETCH', pts: [[0, 0]], ax: [10000, 0], ratio: 0.5 };
    expect(pointsAlong(e, 2).map(xy)).toEqual([[10000, 0], [-10000, 0]]); // closed: n points from its start
    // Not for texts, dimensions, notes, points or revision clouds.
    expect(canDivide({ id: 'T', kind: 'text', layer: 'LV-ANNO', pts: [[0, 0]], text: 'x', h: 1 })).toBe(false);
    expect(canDivide({ ...square, cloud: 500 })).toBe(false);
    expect(canDivide({ id: 'N', kind: 'point', layer: 'LV-SKETCH', pts: [[0, 0]] })).toBe(false);
  });
});

describe('Point style', () => {
  it('has the twenty shapes, their markers, and a size on the screen or in drawing units', () => {
    expect(POINT_SHAPES).toHaveLength(20);
    expect(POINT_SHAPES.slice(0, 5).map((s) => s.label)).toEqual(['Dot', 'None', 'Plus', 'Cross', 'Tick']);
    expect(pointShapeLabel(35)).toBe('Cross in a circle');
    expect(pointShapeLabel(97)).toBe('None in a circle and a square');
    expect(pointMark(0)).toEqual({ lines: [], circle: false, square: false, dot: true });
    expect(pointMark(2).lines).toEqual([[[-1, 0], [1, 0]], [[0, -1], [0, 1]]]);
    expect(pointMark(34)).toMatchObject({ circle: true, square: false, dot: false });
    expect(pointMark(65).lines).toHaveLength(4);
    expect(pointMark(99)).toMatchObject({ circle: true, square: true });
    expect(pointStyleOf({})).toEqual({ mode: 0, size: 5, relative: true });
    expect(pointStyleOf({ cadPointStyle: { mode: 34, size: 300, relative: false } })).toEqual({ mode: 34, size: 300, relative: false });
    // 5 % of a view 20 m high: 1 m across, half a metre in radius; absolute: half the size.
    expect(pointRadius({ mode: 0, size: 5, relative: true }, 20000)).toBe(500);
    expect(pointRadius({ mode: 0, size: 300, relative: false }, 20000)).toBe(150);
    expect([pdsizeOf({ mode: 0, size: 5, relative: true }), pdsizeOf({ mode: 0, size: 300, relative: false })]).toEqual([-5, 300]);
  });
});
