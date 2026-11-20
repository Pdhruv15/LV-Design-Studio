import { describe, expect, it } from 'vitest';
import {
  aligned, alignOf, arrayPolar, arrayRect, breakAt, chamfer, edgesFor, explode, extend, fillet, gripMoved, gripsOf, isPath, join, mirrored, offset, pathLength,
  scaled, sketchInWindow, stretched, stretchPoints, trim, trimPiece, extendPiece, crossingsOf, reachesOf, type Seg
} from './cadEdit';
import type { SketchItem } from '../types';

type Pt = [number, number];
const line = (id: string, a: Pt, b: Pt, extra: Partial<SketchItem> = {}): SketchItem => ({ id, kind: 'line', layer: 'LV-SKETCH', pts: [a, b], ...extra });
const pts = (r: { items?: Omit<SketchItem, 'id'>[] }) => r.items!.map((x) => x.pts.map((q) => q.map((v) => +v.toFixed(3))));
// The architect's walls: a room 0..18 × 0..10 with a partition at x = 9 (up to y = 5.5) — fixed lines.
const walls: Seg[] = [[[0, 0], [18, 0]], [[18, 0], [18, 10]], [[18, 10], [0, 10]], [[0, 10], [0, 0]], [[9, 0], [9, 5.5]]];

describe('Trim and Extend — at drawn lines and the architect\'s walls', () => {
  it('trims the part clicked back to the wall it crosses', () => {
    const l = line('S1', [1, 2], [11, 2]);
    const r = trim(l, [10, 2], edgesFor([l], 'S1', walls));
    expect(pts(r)).toEqual([[[1, 2], [9, 2]]]);
    expect(r).toMatchObject({ cut: 2 });
  });

  it('a part between two crossings leaves two pieces; with nothing crossing it says so', () => {
    const l = line('S1', [1, 2], [17, 2]);
    const cross = line('S2', [13, 0.5], [13, 4]);
    expect(pts(trim(l, [11, 2], edgesFor([l, cross], 'S1', walls)))).toEqual([[[1, 2], [9, 2]], [[13, 2], [17, 2]]]);
    expect(trim(line('S3', [2, 7], [5, 7]), [3, 7], walls)).toEqual({ error: 'Nothing crosses it there to cut at: Erase it instead.' });
  });

  it('a closed shape opens where a piece is cut out between two crossings', () => {
    const sq: SketchItem = { id: 'S1', kind: 'pline', layer: 'L', pts: [[7, 1], [11, 1], [11, 3], [7, 3]], closed: true };
    const r = trim(sq, [10, 2], walls.slice(4)); // cut at the partition, the right-hand part clicked
    expect(r.items).toHaveLength(1);
    expect(r.items![0].closed).toBeUndefined();
    expect(pts(r)[0]).toEqual([[9, 3], [7, 3], [7, 1], [9, 1]]);
  });

  it('extends the nearer end to the next line ahead, wall or drawn; a tray stays a tray', () => {
    const l = line('S1', [2, 7], [6, 7]);
    const r = extend(l, [5.5, 7], walls);
    expect(pts(r)).toEqual([[[2, 7], [18, 7]]]);
    expect(r).toMatchObject({ gain: 12 });
    expect(pts(extend(l, [2.2, 7], walls))).toEqual([[[0, 7], [6, 7]]]);
    const tray = { ...line('T1', [3, 4], [7, 4]), kind: 'pline' as const, tray: { widthMm: 300, service: 'Power', route: 'TR-1' } };
    const t = extend(tray, [6.9, 4], walls);
    expect(t.items![0]).toMatchObject({ kind: 'pline', tray: { widthMm: 300, route: 'TR-1' }, pts: [[3, 4], [9, 4]] });
    expect(extend(line('S2', [2, 7], [6, 7]), [5, 7], [])).toEqual({ error: 'No line ahead of that end to reach.' });
  });

  it('uses an infinite construction line as a trim edge, beyond its two defining points', () => {
    const target = line('S1', [0, 0], [10, 0]);
    const xline = line('XL', [5, 10], [5, 11], { infinite: 'xline' });
    expect(pts(trim(target, [8, 0], edgesFor([target, xline], target.id, [])))).toEqual([[[0, 0], [5, 0]]]);
    expect(isPath(xline)).toBe(false);
  });

  it('the shadow before the click is the piece the click then cuts away or adds', () => {
    const long = (q: Pt[]) => q.slice(1).reduce((t, p, i) => t + Math.hypot(p[0] - q[i][0], p[1] - q[i][1]), 0);
    const r3 = (q: Pt[]) => q.map((p) => p.map((v) => +v.toFixed(3)));
    // An open line: the piece between two crossings, and the end pieces back to a crossing.
    const l = line('S1', [1, 2], [17, 2]), cross = line('S2', [13, 0.5], [13, 4]), edges = edgesFor([l, cross], 'S1', walls);
    expect(r3(trimPiece(l, [11, 2], crossingsOf(l, edges))!.pts)).toEqual([[9, 2], [13, 2]]);
    expect(trimPiece(l, [11, 2], crossingsOf(l, edges))).toMatchObject({ kind: 'line', layer: 'LV-SKETCH' });
    for (const at of [[11, 2], [2, 2], [15, 2]] as Pt[]) {
      const piece = trimPiece(l, at, crossingsOf(l, edges))!, r = trim(l, at, edges);
      expect(long(piece.pts)).toBeCloseTo(r.cut!);
      expect(long(piece.pts) + r.items!.reduce((t, x) => t + long(x.pts), 0)).toBeCloseTo(16); // the shadow and what stays: the whole line
    }
    // A tray's piece is still a tray, so its shadow is drawn as the tray is.
    const tray = { ...line('T1', [1, 4], [11, 4]), kind: 'pline' as const, tray: { widthMm: 300, service: 'Power', route: 'TR-1' } };
    expect(trimPiece(tray, [10, 4], crossingsOf(tray, edgesFor([tray], 'T1', walls)))).toMatchObject({ kind: 'pline', tray: { widthMm: 300 }, pts: [[9, 4], [11, 4]] });
    // A closed shape: the side clicked, also when that piece runs over the shape's start; it is the part the cut opens.
    const sq: SketchItem = { id: 'S1', kind: 'pline', layer: 'L', pts: [[7, 1], [11, 1], [11, 3], [7, 3]], closed: true };
    expect(r3(trimPiece(sq, [10, 2], crossingsOf(sq, walls.slice(4)))!.pts)).toEqual([[9, 1], [11, 1], [11, 3], [9, 3]]);
    expect(r3(trimPiece(sq, [7.5, 2], crossingsOf(sq, walls.slice(4)))!.pts)).toEqual([[9, 3], [7, 3], [7, 1], [9, 1]]);
    expect(trim(sq, [7.5, 2], walls.slice(4))).toMatchObject({ cut: 6 });
    expect(r3(trim(sq, [7.5, 2], walls.slice(4)).items![0].pts)).toEqual([[9, 1], [11, 1], [11, 3], [9, 3]]);
    expect(trimPiece(sq, [10, 2], crossingsOf(sq, walls.slice(4)))!.closed).toBeUndefined();
    // Nothing crossing it, or a shape Trim does not cut: no shadow.
    expect(trimPiece(line('S3', [2, 7], [5, 7]), [3, 7], crossingsOf(line('S3', [2, 7], [5, 7]), walls))).toBeNull();
    expect(trimPiece({ id: 'E1', kind: 'ellipse', layer: 'L', pts: [[5, 5]], ax: [2, 0], ratio: 0.5 }, [7, 5], [3])).toBeNull();
    // Extend: from the end nearer the click to the line ahead, as the click then lengthens it.
    const e = line('S1', [2, 7], [6, 7]);
    expect(r3(extendPiece(e, [5.5, 7], reachesOf(e, walls))!)).toEqual([[6, 7], [18, 7]]);
    expect(r3(extendPiece(e, [2.2, 7], reachesOf(e, walls))!)).toEqual([[2, 7], [0, 7]]);
    expect(extendPiece(e, [5, 7], reachesOf(e, []))).toBeNull();
    expect(extendPiece(sq, [10, 2], reachesOf(sq, walls))).toBeNull();
  });
});

describe('Trim — circles and arcs, cut and cutting on the curve itself', () => {
  const circle = (id: string, c: Pt, r: number, extra: Partial<SketchItem> = {}): SketchItem => ({ id, kind: 'circle', layer: 'LV-SKETCH', pts: [c], r, ...extra });
  const arc = (id: string, c: Pt, r: number, a0: number, a1: number): SketchItem => ({ id, kind: 'arc', layer: 'LV-SKETCH', pts: [c], r, a0, a1 });
  const rad = (d: number) => (d * Math.PI) / 180;
  /** An arc's start and end, in degrees. */
  const span = (x: Omit<SketchItem, 'id'>) => [x.a0!, x.a1!].map((a) => +((a * 180) / Math.PI).toFixed(6) + 0);
  const long = (x: Omit<SketchItem, 'id'>) => { const s = (x.a1! - x.a0!) % (2 * Math.PI); return x.r! * (s > 0 ? s : s + 2 * Math.PI); };
  const endsOf = (x: Omit<SketchItem, 'id'>) => [x.a0!, x.a1!].map((a): Pt => [x.pts[0][0] + x.r! * Math.cos(a), x.pts[0][1] + x.r! * Math.sin(a)]);

  it('a circle opens into the arc left on the far side of the click', () => {
    // A line through the centre crosses the circle at 0° (the circle's own start) and 180°.
    const c = circle('C1', [10, 10], 5, { color: '#ff0000' }), edges = edgesFor([c, line('S1', [0, 10], [20, 10])], 'C1', []);
    const top = trim(c, [10, 15], edges);
    expect(top.items).toHaveLength(1);
    expect(top.items![0]).toMatchObject({ kind: 'arc', layer: 'LV-SKETCH', color: '#ff0000', pts: [[10, 10]], r: 5 });
    expect(span(top.items![0])).toEqual([180, 0]); // the upper half clicked: the lower half stays
    expect(top.cut).toBeCloseTo(5 * Math.PI);
    const bottom = trim(c, [10, 5], edges); // the lower half runs over the circle's start
    expect(span(bottom.items![0])).toEqual([0, 180]);
    expect(bottom.cut).toBeCloseTo(5 * Math.PI);
    // The architect's lines cut it too: the partition at x = 9.
    expect(span(trim(circle('C2', [9, 2], 1), [10, 2], walls).items![0])).toEqual([90, 270]);
  });

  it('a circle needs two crossings; with none it says so', () => {
    const c = circle('C1', [10, 10], 5);
    const none = edgesFor([c, line('S0', [0, 20], [20, 20])], 'C1', []); // a line that passes it by
    expect(trim(c, [10, 15], none)).toEqual({ error: 'Nothing crosses it there to cut at: Erase it instead.' });
    const once = edgesFor([c, line('S1', [10, 10], [20, 10])], 'C1', []); // a line that ends inside it
    expect(trim(c, [10, 15], once)).toEqual({ error: 'A closed shape needs two crossings to cut a piece out.' });
    expect([trimPiece(c, [10, 15], crossingsOf(c, none)), trimPiece(c, [10, 15], crossingsOf(c, once))]).toEqual([null, null]);
  });

  it('two circles cut each other where the circles themselves meet', () => {
    // Radius 5 at (0, 0) and (6, 0): they meet at (3, ±4), 53.13° either side of the line of centres.
    const a = circle('A', [0, 0], 5), b = circle('B', [6, 0], 5);
    const r = trim(a, [5, 0], edgesFor([a, b], 'A', [])); // the part of A inside B
    expect(span(r.items![0])).toEqual([53.130102, 306.869898]);
    expect(r.cut).toBeCloseTo(10 * Math.atan2(4, 3));
    for (const p of endsOf(r.items![0])) expect(Math.hypot(p[0] - 6, p[1])).toBeCloseTo(5, 9); // its new ends are on B
  });

  it('an arc is cut like an open line: an end piece, or the middle leaving two arcs', () => {
    // The upper half of a circle of radius 10; lines at x = ±5 cross it at 60° and 120° (and miss it below).
    const a = arc('A1', [0, 0], 10, 0, Math.PI), ups = [line('U1', [5, -20], [5, 20]), line('U2', [-5, -20], [-5, 20])];
    const edges = edgesFor([a, ...ups], 'A1', []);
    const mid = trim(a, [0, 10], edges);
    expect(mid.items!.map(span)).toEqual([[0, 60], [120, 180]]);
    expect([mid.items![0].a0, mid.items![1].a1]).toEqual([0, Math.PI]); // its own ends stay as they were
    expect(mid.cut).toBeCloseTo((10 * Math.PI) / 3);
    const end = trim(a, [10 * Math.cos(rad(30)), 10 * Math.sin(rad(30))], edges);
    expect(end.items!.map(span)).toEqual([[60, 180]]);
    expect(trim(a, [0, 10], edgesFor([a, line('U3', [20, -20], [20, 20])], 'A1', []))).toEqual({ error: 'Nothing crosses it there to cut at: Erase it instead.' });
    // An arc over the 0° direction (270° to 90°), cut by a line along y = 0.
    const right = arc('A2', [0, 0], 10, -Math.PI / 2, Math.PI / 2);
    const low = trim(right, [10 * Math.cos(rad(45)), 10 * Math.sin(rad(45))], edgesFor([right, line('H', [0, 0], [20, 0])], 'A2', []));
    expect(low.items).toHaveLength(1);
    expect(low.items![0].a0).toBe(-Math.PI / 2);
    expect(span(low.items![0])).toEqual([-90, 0]);
  });

  it('the shadow before the click is the piece the click then cuts away', () => {
    const c = circle('C1', [10, 10], 5), a = arc('A1', [0, 0], 10, 0, Math.PI);
    const cases: [SketchItem, Pt, SketchItem[]][] = [
      [c, [10, 15], [line('S1', [0, 10], [20, 10])]], [c, [10, 5], [line('S1', [0, 10], [20, 10])]], [c, [15, 10.1], [line('S1', [0, 12], [20, 12]), line('S2', [0, 7], [20, 7])]],
      [a, [0, 10], [line('U1', [5, -20], [5, 20]), line('U2', [-5, -20], [-5, 20])]], [a, [9.9, 1], [line('U1', [5, -20], [5, 20])]],
    ];
    for (const [it, at, others] of cases) {
      const edges = edgesFor([it, ...others], it.id, []), piece = trimPiece(it, at, crossingsOf(it, edges))!, r = trim(it, at, edges);
      expect(piece).toMatchObject({ kind: 'arc', layer: 'LV-SKETCH', r: it.r });
      expect(long(piece)).toBeCloseTo(r.cut!);
      expect(long(piece) + r.items!.reduce((t, x) => t + long(x), 0)).toBeCloseTo(it.kind === 'circle' ? 2 * Math.PI * it.r! : Math.PI * it.r!); // the shadow and what stays: all of it
    }
  });

  it('a line is cut at, and extended to, the circle or arc itself, not a chord of it', () => {
    // y = 3 crosses a circle of radius 5 at x = ±4 exactly.
    const c = circle('C1', [0, 0], 5), l = line('S1', [-10, 3], [10, 3]);
    expect(pts(trim(l, [0, 3], edgesFor([l, c], 'S1', [])))).toEqual([[[-10, 3], [-4, 3]], [[4, 3], [10, 3]]]);
    const short = line('S2', [-10, 3], [-8, 3]), e = extend(short, [-8.2, 3], edgesFor([short, c], 'S2', []));
    expect(pts(e)).toEqual([[[-10, 3], [-4, 3]]]);
    expect(e.gain).toBeCloseTo(4, 9);
    // An arc cuts only where the arc is: the first quarter, so at x = 4 and not at x = -4.
    const q = arc('A1', [0, 0], 5, 0, Math.PI / 2);
    expect(pts(trim(l, [8, 3], edgesFor([l, q], 'S1', [])))).toEqual([[[-10, 3], [4, 3]]]);
    expect(extend(short, [-8.2, 3], edgesFor([short, arc('A2', [0, 0], 5, 0, rad(30))], 'S2', []))).toEqual({ error: 'No line ahead of that end to reach.' });
  });
});

describe('Offset', () => {
  it('a line to the side clicked; a polyline with mitred corners; a circle bigger or smaller', () => {
    expect(pts(offset(line('S1', [0, 0], [10, 0]), 0.3, [5, 1]))).toEqual([[[0, 0.3], [10, 0.3]]]);
    expect(pts(offset(line('S1', [0, 0], [10, 0]), 0.3, [5, -1]))).toEqual([[[0, -0.3], [10, -0.3]]]);
    const L: SketchItem = { id: 'S2', kind: 'pline', layer: 'L', pts: [[0, 0], [10, 0], [10, 5]] };
    expect(pts(offset(L, 1, [5, 1]))).toEqual([[[0, 1], [9, 1], [9, 5]]]);
    const c: SketchItem = { id: 'S3', kind: 'circle', layer: 'L', pts: [[0, 0]], r: 2 };
    expect(offset(c, 0.5, [5, 0]).items![0].r).toBe(2.5);
    expect(offset(c, 0.5, [0.1, 0]).items![0].r).toBe(1.5);
    expect(offset(c, 3, [0.1, 0])).toEqual({ error: 'Too far inside: the radius would be nothing.' });
  });

  it('a tray offsets as a tray of the same width and route; a cable route\'s copy has no cable', () => {
    const tray = { ...line('T1', [0, 0], [10, 0]), kind: 'pline' as const, tray: { widthMm: 300, route: 'TR-1' } };
    expect(offset(tray, 0.45, [5, 1]).items![0]).toMatchObject({ tray: { widthMm: 300, route: 'TR-1' } });
    const route = { ...line('C1', [0, 0], [10, 0]), kind: 'pline' as const, cable: { feederId: 'F1' } };
    expect(offset(route, 0.2, [5, 1]).items![0].cable).toBeUndefined();
  });
});

describe('Fillet and Chamfer', () => {
  it('two lines meeting short of each other: a sharp corner, or a radius with its arc', () => {
    const a = line('S1', [0, 0], [8, 0]), b = line('S2', [10, 2], [10, 10]);
    expect(pts(fillet(a, [4, 0], b, [10, 6], 0))).toEqual([[[0, 0], [10, 0]], [[10, 0], [10, 10]]]);
    const r = fillet(a, [4, 0], b, [10, 6], 1);
    expect(pts(r).slice(0, 2)).toEqual([[[0, 0], [9, 0]], [[10, 1], [10, 10]]]);
    expect(r.items![2]).toMatchObject({ kind: 'arc', r: 1, pts: [[9, 1]] });
    const arc = r.items![2];
    expect([Math.cos(arc.a0!), Math.sin(arc.a0!), Math.cos(arc.a1!), Math.sin(arc.a1!)].map((v) => +v.toFixed(6) + 0)).toEqual([0, -1, 1, 0]);
  });

  it('lines that cross: the parts clicked are kept', () => {
    const a = line('S1', [0, 5], [10, 5]), b = line('S2', [5, 0], [5, 10]);
    expect(pts(fillet(a, [2, 5], b, [5, 8], 0))).toEqual([[[0, 5], [5, 5]], [[5, 5], [5, 10]]]);
  });

  it('two trays meet in a sharp corner (a bend); chamfer cuts lines; parallel lines or one line make no corner', () => {
    const t = (id: string, a: Pt, b: Pt) => ({ ...line(id, a, b), kind: 'pline' as const, tray: { widthMm: 300 } });
    const f = fillet(t('T1', [0, 0], [8, 0]), [4, 0], t('T2', [10, 2], [10, 10]), [10, 6], 1);
    expect(f.items).toHaveLength(2);
    expect(f).toMatchObject({ note: 'Trays meet in a sharp corner; the bend is counted as a fitting.' });
    const c = chamfer(line('S1', [0, 0], [8, 0]), [4, 0], line('S2', [10, 2], [10, 10]), [10, 6], 1, 2);
    expect(pts(c)).toEqual([[[0, 0], [9, 0]], [[10, 2], [10, 10]], [[9, 0], [10, 2]]]);
    expect(fillet(line('S1', [0, 0], [8, 0]), [1, 0], line('S2', [0, 2], [8, 2]), [1, 2], 0)).toEqual({ error: 'The two lines are parallel: they make no corner.' });
    expect(fillet(line('S1', [0, 0], [8, 0]), [1, 0], line('S1', [0, 0], [8, 0]), [5, 0], 0)).toEqual({ error: 'Pick two different lines.' });
    expect(fillet(line('S1', [0, 0], [8, 0]), [4, 0], line('S2', [10, 2], [10, 10]), [10, 6], 12)).toEqual({ error: 'Too large for these lines: make it smaller.' });
  });
});

describe('Break, Join, Explode', () => {
  it('breaks at a point (two parts) or takes out the part between two points', () => {
    const l = line('S1', [0, 0], [10, 0]);
    expect(pts(breakAt(l, [4, 0.1]))).toEqual([[[0, 0], [4, 0]], [[4, 0], [10, 0]]]);
    expect(pts(breakAt(l, [3, 0], [6, 0]))).toEqual([[[0, 0], [3, 0]], [[6, 0], [10, 0]]]);
    expect(breakAt(l, [0, 0])).toEqual({ error: 'Break it away from its ends.' });
  });

  it('joins lines that meet end to end, either way round, and closes a loop', () => {
    const r = join([line('S1', [0, 0], [5, 0]), line('S2', [5, 5], [5, 0]), line('S3', [0, 5], [5, 5])], 0.01);
    expect(pts(r)).toEqual([[[0, 0], [5, 0], [5, 5], [0, 5]]]);
    expect(r.joined).toEqual(['S1', 'S2', 'S3']);
    const loop = join([line('S1', [0, 0], [5, 0]), line('S2', [5, 0], [5, 5]), line('S3', [5, 5], [0, 0])], 0.01);
    expect(loop.items![0]).toMatchObject({ kind: 'pline', closed: true, pts: [[0, 0], [5, 0], [5, 5]] });
    expect(join([line('S1', [0, 0], [5, 0]), line('S2', [7, 0], [9, 0])], 0.01)).toEqual({ error: 'None of them meet end to end.' });
  });

  it('explodes a rectangle into four lines; a cable route stays one', () => {
    const rect: SketchItem = { id: 'S1', kind: 'pline', layer: 'L', pts: [[0, 0], [4, 0], [4, 2], [0, 2]], closed: true };
    const r = explode(rect);
    expect(r.items!.map((x) => x.kind)).toEqual(['line', 'line', 'line', 'line']);
    expect(pts(r)[3]).toEqual([[0, 2], [0, 0]]);
    expect(explode({ ...rect, closed: false, cable: { feederId: 'F1' } })).toEqual({ error: 'A cable route stays one line: Break it instead.' });
  });
});

describe('Mirror, Scale, Stretch, Array, grips, window', () => {
  it('mirrors about a line; scales about a base point', () => {
    expect(mirrored(line('S1', [1, 1], [3, 2]), [0, 0], [0, 5]).pts).toEqual([[-1, 1], [-3, 2]]);
    const c = scaled({ id: 'S2', kind: 'circle', layer: 'L', pts: [[2, 0]], r: 1 }, [0, 0], 2);
    expect(c).toMatchObject({ pts: [[4, 0]], r: 2 });
  });

  it('stretch moves only the points inside the window: the tray gets longer, its far end stays', () => {
    const tray = { ...line('T1', [0, 0], [10, 0]), kind: 'pline' as const, tray: { widthMm: 300 } };
    expect(stretched(tray, [9, -1], [11, 1], 2, 0)!.pts).toEqual([[0, 0], [12, 0]]);
    expect(stretched(tray, [20, 20], [21, 21], 2, 0)).toBeNull();
  });

  it('the points a Stretch window moves, for its squares: those inside it, or all of a circle or text with its point inside', () => {
    const tray = { ...line('T1', [0, 0], [10, 0]), kind: 'pline' as const, tray: { widthMm: 300 } };
    expect(stretchPoints(tray, [9, -1], [11, 1])).toEqual([[10, 0]]);
    expect(stretchPoints(tray, [20, 20], [21, 21])).toEqual([]);
    const text: SketchItem = { id: 'T', kind: 'text', layer: 'L', pts: [[10, 0]], text: 'DB-G1', h: 0.3 };
    expect(stretchPoints(text, [9, -1], [11, 1])).toEqual([[10, 0]]);
    // Every point the squares mark is a point the click moves, and no other.
    const room: SketchItem = { id: 'R', kind: 'pline', layer: 'L', pts: [[0, 0], [4, 0], [4, 3], [0, 3]], closed: true };
    const moved = stretched(room, [3, -1], [5, 4], 1, 0)!.pts.filter((q, i) => q[0] !== room.pts[i][0]);
    expect(stretchPoints(room, [3, -1], [5, 4]).map((q) => [q[0] + 1, q[1]])).toEqual(moved);
  });

  it('arrays: rows × columns, and polar round a centre', () => {
    const l = line('S1', [0, 0], [1, 0]);
    expect(arrayRect(l, 2, 3, 2, 5).map((x) => x.pts[0])).toEqual([[2, 0], [4, 0], [0, 5], [2, 5], [4, 5]]);
    const p = arrayPolar(l, [0, 0], 4, 360);
    expect(p.map((x) => x.pts[1].map((v) => +v.toFixed(6) + 0))).toEqual([[0, 1], [-1, 0], [0, -1]]);
  });

  it('grips: drag an end, or a middle to move that side', () => {
    const l: SketchItem = { id: 'S1', kind: 'pline', layer: 'L', pts: [[0, 0], [10, 0], [10, 5]] };
    expect(gripsOf(l).map((g) => g.kind)).toEqual(['point', 'point', 'point', 'mid', 'mid']);
    expect(gripMoved(l, 2, [10, 8]).pts).toEqual([[0, 0], [10, 0], [10, 8]]);
    expect(gripMoved(l, 4, [11, 2.5]).pts).toEqual([[0, 0], [11, 0], [11, 5]]);
    const c: SketchItem = { id: 'S2', kind: 'circle', layer: 'L', pts: [[0, 0]], r: 1 };
    expect(gripMoved(c, 1, [3, 0]).r).toBe(3);
    expect(gripMoved(c, 0, [2, 2]).pts).toEqual([[2, 2]]);
  });

  it('grips: a polyline side\'s middle knows its direction; a circle has a centre and four quadrants; an arc its ends and middle', () => {
    const l: SketchItem = { id: 'S1', kind: 'pline', layer: 'L', pts: [[0, 0], [10, 0], [10, 5]] };
    expect(gripsOf(l).filter((g) => g.kind === 'mid').map((g) => g.along)).toEqual([[1, 0], [0, 1]]);
    const c: SketchItem = { id: 'S2', kind: 'circle', layer: 'L', pts: [[1, 1]], r: 2 };
    expect(gripsOf(c).map((g) => [g.at, g.kind])).toEqual([[[1, 1], 'point'], [[3, 1], 'radius'], [[1, 3], 'radius'], [[-1, 1], 'radius'], [[1, -1], 'radius']]);
    expect(gripMoved(c, 2, [1, 6]).r).toBe(5); // the 90° quadrant sizes it
    const a: SketchItem = { id: 'S3', kind: 'arc', layer: 'L', pts: [[0, 0]], r: 2, a0: 0, a1: Math.PI / 2 };
    const near = (p: Pt, q: Pt) => expect([p[0], p[1]].map((v) => +v.toFixed(6) + 0)).toEqual(q);
    const g = gripsOf(a);
    expect(g.map((x) => x.kind)).toEqual(['point', 'end', 'end', 'radius']);
    near(g[1].at, [2, 0]); near(g[2].at, [0, 2]); near(g[3].at, [Math.SQRT2, Math.SQRT2].map((v) => +v.toFixed(6)) as Pt);
    // An arc across 0 rad (from 300° to 60°): the middle is on the x axis.
    const x: SketchItem = { ...a, a0: (5 * Math.PI) / 3, a1: Math.PI / 3 };
    near(gripsOf(x)[3].at, [2, 0]);
    expect(gripMoved(a, 1, [0, -3])).toMatchObject({ a0: -Math.PI / 2, a1: Math.PI / 2, r: 2 }); // start turned
    expect(gripMoved(a, 2, [-4, 0])).toMatchObject({ a0: 0, a1: Math.PI, r: 2 }); // end turned
    expect(gripMoved(a, 3, [0, 7]).r).toBe(7); // the middle sizes it
  });

  it('a window picks what is wholly inside; a crossing window also what it touches', () => {
    const items = [line('S1', [1, 1], [3, 1]), line('S2', [2, 2], [8, 2]), { id: 'S3', kind: 'circle' as const, layer: 'L', pts: [[2, 5]] as Pt[], r: 0.5 }];
    expect(sketchInWindow(items, [0, 0], [4, 6], false).map((x) => x.id)).toEqual(['S1', 'S3']);
    expect(sketchInWindow(items, [4, 6], [0, 0], true).map((x) => x.id)).toEqual(['S1', 'S2', 'S3']);
    expect(pathLength(items[1])).toBe(6);
  });

  it('only crossing windows pick infinite construction geometry that crosses them', () => {
    const xline = line('XL', [10, 10], [11, 11], { infinite: 'xline' });
    const ray = line('R', [10, 10], [11, 10], { infinite: 'ray' });
    expect(sketchInWindow([xline, ray], [0, 0], [4, 4], false)).toEqual([]);
    expect(sketchInWindow([xline, ray], [4, 4], [0, 0], true).map((x) => x.id)).toEqual(['XL']);
    expect(sketchInWindow([ray], [4, 12], [0, 8], true)).toEqual([]); // the box is behind the ray
  });

  it('mirrors, scales and grips an ellipse by its axis; the path tools leave a revision cloud alone', () => {
    const e: SketchItem = { id: 'E', kind: 'ellipse', layer: 'L', pts: [[10, 0]], ax: [4, 0], ratio: 0.5 };
    const m = mirrored(e, [0, 0], [0, 1]); // about the y axis
    expect(m.pts).toEqual([[-10, 0]]);
    expect(m.ax!.map((v) => +v.toFixed(9) + 0)).toEqual([-4, 0]);
    expect(scaled(e, [0, 0], 2)).toMatchObject({ pts: [[20, 0]], ax: [8, 0], ratio: 0.5 });
    expect(gripsOf(e).map((g) => [g.at, g.kind])).toEqual([[[10, 0], 'point'], [[14, 0], 'radius'], [[10, 2], 'radius'], [[6, 0], 'radius'], [[10, -2], 'radius']]);
    expect(gripMoved(e, 1, [10, 6])).toMatchObject({ ax: [0, 6], ratio: 2 / 6 }); // turned and longer; the minor keeps 2
    expect(gripMoved(e, 2, [10, 3]).ratio).toBe(0.75);
    const big = gripMoved(e, 2, [10, 8]); // the minor now the longer: the axes swap
    expect([big.ax!.map((v) => +v.toFixed(9) + 0), big.ratio]).toEqual([[0, 8], 0.5]);
    expect(gripMoved(e, 0, [0, 0]).pts).toEqual([[0, 0]]);
    expect(gripMoved(e, 3, [10, -6])).toMatchObject({ ratio: 2 / 6 }); // the -major end, turned and longer
    expect(gripMoved(e, 3, [10, -6]).ax!.map((v) => +v.toFixed(9) + 0)).toEqual([0, 6]);
    expect(gripMoved(e, 4, [10, -3]).ratio).toBe(0.75); // the -minor end sizes the minor
    const cloud: SketchItem = { id: 'C', kind: 'pline', layer: 'LV-ANNO', pts: [[0, 0], [10, 0], [10, 4], [0, 4]], closed: true, cloud: 2 };
    expect(trim(cloud, [5, 0], walls).error).toBe('Trim works on lines, polylines, circles, arcs, trays and cable routes.');
    expect(offset(cloud, 1, [5, -2]).error).toBe('Offset works on lines, polylines, circles, arcs, trays and cable routes.');
    expect(explode(cloud).error).toBe('A revision cloud stays one object: erase it and draw it again to change it.');
    expect(scaled(cloud, [0, 0], 2).cloud).toBe(4);
    expect(gripMoved(cloud, 2, [12, 6]).pts).toEqual([[0, 0], [10, 0], [12, 6], [0, 4]]); // a corner moves alone
  });
});

describe('hatches keep their islands and pattern through mirror, scale and stretch', () => {
  const hatch: SketchItem = { id: 'H', kind: 'pline', layer: 'LV-HATCH', closed: true, pts: [[0, 0], [10, 0], [10, 10], [0, 10]], hatch: { pattern: 'ansi31', scale: 3, angle: 30, origin: [2, 1] },
    holes: [[[4, 4], [6, 4], [6, 6], [4, 6]]] };
  it('mirror: islands and origin mirrored, the pattern\'s angle as it was; a plain polyline unchanged', () => {
    const m = mirrored(hatch, [0, 0], [1, 0]);
    expect(m.holes).toEqual([[[4, -4], [6, -4], [6, -6], [4, -6]]]);
    expect(m.hatch).toEqual({ pattern: 'ansi31', scale: 3, angle: 30, origin: [2, -1] });
    const plain = mirrored({ id: 'P', kind: 'pline', layer: 'L', pts: [[0, 1], [1, 2]] }, [0, 0], [1, 0]);
    expect(plain).not.toHaveProperty('hatch');
    expect(plain).not.toHaveProperty('holes');
  });
  it('scale: islands and origin scaled about the base, the spacing by the factor', () => {
    const s = scaled(hatch, [0, 0], 2);
    expect(s.pts[1]).toEqual([20, 0]);
    expect(s.holes![0][0]).toEqual([8, 8]);
    expect(s.hatch).toEqual({ pattern: 'ansi31', scale: 6, angle: 30, origin: [4, 2] });
  });
  it('stretch: island corners inside the window move like the outline\'s, the origin stays', () => {
    const s = stretched(hatch, [3, 3], [11, 11], 1, 2)!;
    expect(s.pts).toEqual([[0, 0], [10, 0], [11, 12], [0, 10]]);
    expect(s.holes![0]).toEqual([[5, 6], [7, 6], [7, 8], [5, 8]]);
    expect(s.hatch!.origin).toEqual([2, 1]);
    // A window with no outline corner in it takes nothing.
    expect(stretched(hatch, [4, 4], [6, 6], 1, 1)).toBeNull();
  });
});

describe('Align', () => {
  const near = (a: Pt[], b: Pt[]) => a.forEach((q, i) => { expect(q[0]).toBeCloseTo(b[i][0], 9); expect(q[1]).toBeCloseTo(b[i][1], 9); });
  it('one pair of points only moves', () => {
    const t = alignOf([1, 1], [4, 5])!;
    expect(t).toEqual({ a: 0, k: 1, dx: 3, dy: 4 });
    expect(aligned(line('a', [1, 1], [3, 1]), [1, 1], t).pts).toEqual([[4, 5], [6, 5]]);
  });
  it('two pairs turn a line by 90° onto the destination', () => {
    const t = alignOf([0, 0], [10, 10], [4, 0], [10, 14])!;
    expect(t.a).toBeCloseTo(Math.PI / 2, 9);
    expect(t.k).toBe(1);
    near(aligned(line('a', [0, 0], [4, 0]), [0, 0], t).pts, [[10, 10], [10, 14]]);
  });
  it('scale on makes the line as long as the destination; off keeps its length', () => {
    const on = alignOf([0, 0], [0, 0], [4, 0], [0, 2], true)!;
    expect(on.k).toBeCloseTo(0.5, 9);
    near(aligned(line('a', [0, 0], [4, 0]), [0, 0], on).pts, [[0, 0], [0, 2]]);
    const off = alignOf([0, 0], [0, 0], [4, 0], [0, 2])!;
    expect(off.k).toBe(1);
    near(aligned(line('a', [0, 0], [4, 0]), [0, 0], off).pts, [[0, 0], [0, 4]]);
  });
  it('is null when the two source points, or the two destination points, are the same', () => {
    expect(alignOf([1, 1], [5, 5], [1, 1], [8, 9])).toBeNull();
    expect(alignOf([1, 1], [5, 5], [3, 1], [5, 5], true)).toBeNull();
  });
  it('turns a text\'s rot and an arc\'s angles with it', () => {
    const t = alignOf([0, 0], [0, 0], [1, 0], [0, 1])!;
    const text = aligned({ id: 't', kind: 'text', layer: 'L', pts: [[2, 0]], text: 'x', rot: 0.5 }, [0, 0], t);
    expect(text.rot).toBeCloseTo(0.5 + Math.PI / 2, 9);
    const arc = aligned({ id: 'r', kind: 'arc', layer: 'L', pts: [[0, 0]], r: 1, a0: 0, a1: 1 }, [0, 0], t);
    expect(arc.a0).toBeCloseTo(Math.PI / 2, 9);
    expect(arc.a1).toBeCloseTo(1 + Math.PI / 2, 9);
  });
});

describe('Polylines with arc segments: the straight-segment tools refuse and ask for Explode', () => {
  const arcs = (id: string, extra: Partial<SketchItem> = {}): SketchItem => ({ id, kind: 'pline', layer: 'L', pts: [[0, 0], [4, 0], [4, 4]], bulges: [0, 0.5, 0], ...extra });
  const plain = line('P', [0, 1], [4, 1]);
  const WHY = 'This polyline has arc segments: explode it first (X).';
  it('Trim, Extend, Offset, Break, Fillet, Chamfer and Join', () => {
    const a = arcs('A');
    expect(trim(a, [1, 0], walls).error).toBe(WHY);
    expect(extend(a, [4, 4], walls).error).toBe(WHY);
    expect([trimPiece(a, [1, 0], crossingsOf(a, walls)), extendPiece(a, [4, 4], reachesOf(a, walls))]).toEqual([null, null]); // and no shadow
    expect(offset(a, 1, [1, 1]).error).toBe(WHY);
    expect(breakAt(a, [1, 0]).error).toBe(WHY);
    expect(fillet(a, [1, 0], plain, [1, 1], 1).error).toBe(WHY);
    expect(chamfer(plain, [1, 1], a, [1, 0], 1, 1).error).toBe(WHY);
    expect(join([a, plain], 0.01).error).toBe(WHY);
  });
  it('a polyline with no real bulge (zeros) still works as a straight one', () => {
    expect(offset(arcs('B', { bulges: [0, 0, 0] }), 1, [1, 1]).error).toBeUndefined();
  });
  it('Explode still gives lines and arcs', () => {
    const r = explode(arcs('C'));
    expect(r.items!.map((x) => x.kind)).toEqual(['line', 'arc']);
  });
});

