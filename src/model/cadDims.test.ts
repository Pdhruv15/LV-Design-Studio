import { describe, expect, it } from 'vitest';
import type { SketchItem } from '../types';
import { endTowards, linesCross, nearestPiece, nearestSegment, onRound, roundOfSegments } from './cadDims';

type Pt = [number, number];
const close = (a: Pt, b: Pt) => { expect(a[0]).toBeCloseTo(b[0], 6); expect(a[1]).toBeCloseTo(b[1], 6); };

describe('picking for radius, diameter and angular dimensions', () => {
  it('finds the circle a drawing object\'s segments lie on, and the segment nearest a click', () => {
    // A circle of radius 500 about (1000, 1000) as 36 segments.
    const segs: number[] = [];
    for (let i = 0; i < 36; i += 1) { const a0 = (i * Math.PI) / 18, a1 = ((i + 1) * Math.PI) / 18; segs.push(1000 + 500 * Math.cos(a0), 1000 + 500 * Math.sin(a0), 1000 + 500 * Math.cos(a1), 1000 + 500 * Math.sin(a1)); }
    const r = roundOfSegments(segs, 0, 36)!;
    close(r.c, [1000, 1000]); expect(r.r).toBeCloseTo(500, 6);
    expect(roundOfSegments(segs, 0, 1)).toBeUndefined();
    const s = nearestSegment(segs, 0, 36, [1500, 1010])!;
    close(s[0], [1500, 1000]);
    expect(nearestSegment(segs, 5, 5, [0, 0])).toBeUndefined();
  });
  it('finds the piece of a polyline nearest a click, and nothing on a circle', () => {
    const pl: SketchItem = { id: 'p', kind: 'pline', layer: 'L', pts: [[0, 0], [1000, 0], [1000, 1000]] };
    expect(nearestPiece(pl, [990, 600])).toEqual([[1000, 0], [1000, 1000]]);
    expect(nearestPiece({ id: 'c', kind: 'circle', layer: 'L', pts: [[0, 0]], r: 5 }, [0, 0])).toBeUndefined();
  });
  it('crosses two lines run on past their ends, and refuses parallel ones', () => {
    close(linesCross([[0, 0], [100, 0]], [[500, -50], [500, 50]])!, [500, 0]);
    close(linesCross([[0, 0], [100, 100]], [[0, 200], [100, 100]])!, [100, 100]);
    expect(linesCross([[0, 0], [100, 0]], [[0, 10], [100, 10]])).toBeUndefined();
  });
  it('takes the end on the clicked side of the vertex, else the far end; and the point of a circle towards a click', () => {
    const seg: [Pt, Pt] = [[-100, 0], [300, 0]], x: Pt = [0, 0];
    expect(endTowards(seg, x, [50, 5])).toEqual([300, 0]);
    expect(endTowards(seg, x, [-20, 5])).toEqual([-100, 0]);
    expect(endTowards([[10, 0], [300, 0]], x, [-20, 0])).toEqual([300, 0]); // clicked behind the vertex: the far end
    close(onRound([0, 0], 100, [30, 40]), [60, 80]);
  });
});
