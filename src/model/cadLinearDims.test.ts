import { describe, expect, it } from 'vitest';
import type { SketchItem } from '../types';
import { dimLabel, dimMeasure, dimOf, dimensionLines, linearDir, nextDim, rotated, shapesOut } from './cadSketch';
import { mirrored } from './cadEdit';
import { propValue, textRows } from './cadProps';

type Pt = [number, number];
const close = (a: Pt, b: Pt) => { expect(a[0]).toBeCloseTo(b[0], 6); expect(a[1]).toBeCloseTo(b[1], 6); };
const H = 0, V = Math.PI / 2;
// Two points 3 m apart across and 1 m up (drawing units mm).
const p1: Pt = [0, 0], p2: Pt = [3000, 1000];
const lin = (at: Pt, dir: number, extra: Partial<SketchItem> = {}): SketchItem => ({ id: 'd', kind: 'dim', layer: 'LV-ANNO', pts: [p1, p2, at], dir, ...extra });

describe('linear dimensions (DLI)', () => {
  it('is horizontal dragged above or below the points, vertical beside them', () => {
    expect(linearDir(p1, p2, [1500, 2000])).toBe(H);
    expect(linearDir(p1, p2, [1500, -800])).toBe(H);
    expect(linearDir(p1, p2, [4000, 500])).toBe(V);
    expect(linearDir(p1, p2, [-600, 500])).toBe(V);
  });

  it('measures along its line: the horizontal or vertical distance, not the slope', () => {
    expect(dimMeasure(lin([1500, 2000], H))).toBeCloseTo(3000, 6);
    expect(dimMeasure(lin([4000, 500], V))).toBeCloseTo(1000, 6);
    expect(dimMeasure({ pts: [p1, p2] })).toBeCloseTo(Math.hypot(3000, 1000), 6); // aligned, as before
    expect(dimLabel(lin([1500, 2000], H), 0.001)).toBe('3.00');
  });

  it('draws a horizontal line through the point, with vertical extension lines from each point', () => {
    const d = dimensionLines(p1, p2, [1500, 2000], undefined, undefined, H);
    expect(d.length).toBeCloseTo(3000, 6);
    const [e1, e2, dimLine] = d.lines;
    // Extension lines: straight up from each point to past the line (2 % of the length).
    close(e1[0], [0, 0]); close(e1[1], [0, 2060]);
    close(e2[0], [3000, 1000]); close(e2[1], [3000, 2060]);
    close(dimLine[0], [0, 2000]); close(dimLine[1], [3000, 2000]);
    expect(d.angle).toBeCloseTo(0, 9);
  });

  it('places the line between the points when dragged there, each extension line running towards it', () => {
    const d = dimensionLines(p1, p2, [1500, 500], undefined, undefined, H);
    const [e1, e2] = d.lines;
    expect(e1[1][1]).toBeGreaterThan(500); // from p1 (below) up past the line
    expect(e2[1][1]).toBeLessThan(500); // from p2 (above) down past it
  });

  it('keeps the gap of its style at each point', () => {
    const look = { arrow: 'tick' as const, size: 100, off: 50, ext: 80 };
    const [e1, e2] = dimensionLines(p1, p2, [1500, 2000], look, undefined, H).lines;
    close(e1[0], [0, 50]); close(e1[1], [0, 2080]);
    close(e2[0], [3000, 1050]); close(e2[1], [3000, 2080]);
  });

  it('draws as before when aligned (no dir)', () => {
    const a = dimensionLines([0, 0], [4000, 0], [2000, 800]);
    const b = dimensionLines([0, 0], [4000, 0], [2000, 800], undefined, undefined, 0);
    expect(b.lines).toEqual(a.lines);
    expect(b.text).toEqual(a.text);
  });

  it('turns and mirrors its line with the drawing', () => {
    const r = rotated(lin([1500, 2000], H), [0, 0], Math.PI / 2);
    expect(r.dir).toBeCloseTo(Math.PI / 2, 9);
    expect(dimMeasure(r)).toBeCloseTo(3000, 6);
    const m = mirrored(lin([1500, 2000], H), [0, 0], [1, 1]); // about the 45° line: horizontal becomes vertical
    expect(m.dir).toBeCloseTo(Math.PI / 2, 9);
    expect(dimMeasure(m)).toBeCloseTo(3000, 6);
  });

  it('shows what it measures in Properties and saves its lines and length to DXF', () => {
    const d = lin([1500, 2000], H);
    expect(textRows('dim').some((x) => x.key === 'measured')).toBe(true);
    expect(propValue(d, 'measured', 0.001)).toBeCloseTo(3, 6);
    const out = shapesOut([d], 0.001);
    expect(out.find((s) => s.kind === 'text')!.text).toBe('3.00');
    expect(out.filter((s) => s.kind === 'line')).toHaveLength(dimOf(d, 0.001).lines.length);
  });
});

describe('continued and baseline dimensions (DCO, DBA)', () => {
  const base = lin([1500, 2000], H, { h: 200, look: { arrow: 'tick', size: 100, off: 50, ext: 80 } });

  it('continue: from the last one\'s second point, its line in line, parallel, same look', () => {
    const n = nextDim(base, [5000, 400], 'continue', 375)!;
    expect(n.pts[0]).toEqual(p2);
    expect(n.pts[1]).toEqual([5000, 400]);
    expect(n.dir).toBe(H);
    expect(n.look).toEqual(base.look);
    expect(n.h).toBe(200);
    expect(n.layer).toBe('LV-ANNO');
    expect(dimMeasure(n)).toBeCloseTo(2000, 6);
    const [, , line] = dimOf({ ...n, id: 'n' }, 0.001).lines;
    expect(line[0][1]).toBeCloseTo(2000, 6); // in line with the base's
    expect('id' in n).toBe(false);
  });

  it('baseline: from the last one\'s first point, one step further out, away from the points', () => {
    const n = nextDim(base, [5000, 400], 'baseline', 375)!;
    expect(n.pts[0]).toEqual(p1);
    expect(dimMeasure(n)).toBeCloseTo(5000, 6);
    expect(dimOf({ ...n, id: 'n' }, 0.001).lines[2][0][1]).toBeCloseTo(2375, 6);
    // Below the points, it steps further down.
    const below = nextDim(lin([1500, -800], H), [5000, 0], 'baseline', 375)!;
    expect(below.pts[2][1]).toBeCloseTo(-1175, 6);
  });

  it('goes on parallel to an aligned dimension, and from the one before each time', () => {
    const al: SketchItem = { id: 'a', kind: 'dim', layer: 'L', pts: [[0, 0], [3000, 3000], [-500, 500]] };
    const n = nextDim(al, [5000, 5000], 'continue', 375)!;
    expect(n.dir).toBeCloseTo(Math.PI / 4, 9);
    expect(dimMeasure(n)).toBeCloseTo(Math.hypot(2000, 2000), 6);
    const n2 = nextDim({ ...n, id: 'n' }, [6000, 6000], 'continue', 375)!;
    expect(n2.pts[0]).toEqual([5000, 5000]);
  });

  it('drops a typed-over text, and draws nothing for a point that measures nothing', () => {
    expect(nextDim({ ...base, text: 'TYP.' }, [5000, 400], 'continue', 375)!.text).toBeUndefined();
    expect(nextDim(base, [3000, 5000], 'continue', 375)).toBeUndefined();
  });
});
