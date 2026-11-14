import { describe, expect, it } from 'vitest';
import {
  arrayPolar, arrayRect, breakAt, chamfer, edgesFor, explode, extend, fillet, gripMoved, gripsOf, join, mirrored, offset, pathLength,
  scaled, sketchInWindow, stretched, trim, type Seg
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

  it('a window picks what is wholly inside; a crossing window also what it touches', () => {
    const items = [line('S1', [1, 1], [3, 1]), line('S2', [2, 2], [8, 2]), { id: 'S3', kind: 'circle' as const, layer: 'L', pts: [[2, 5]] as Pt[], r: 0.5 }];
    expect(sketchInWindow(items, [0, 0], [4, 6], false).map((x) => x.id)).toEqual(['S1', 'S3']);
    expect(sketchInWindow(items, [4, 6], [0, 0], true).map((x) => x.id)).toEqual(['S1', 'S2', 'S3']);
    expect(pathLength(items[1])).toBe(6);
  });

  it('mirrors, scales and grips an ellipse by its axis; the path tools leave a revision cloud alone', () => {
    const e: SketchItem = { id: 'E', kind: 'ellipse', layer: 'L', pts: [[10, 0]], ax: [4, 0], ratio: 0.5 };
    const m = mirrored(e, [0, 0], [0, 1]); // about the y axis
    expect(m.pts).toEqual([[-10, 0]]);
    expect(m.ax!.map((v) => +v.toFixed(9) + 0)).toEqual([-4, 0]);
    expect(scaled(e, [0, 0], 2)).toMatchObject({ pts: [[20, 0]], ax: [8, 0], ratio: 0.5 });
    expect(gripsOf(e).map((g) => [g.at, g.kind])).toEqual([[[10, 0], 'point'], [[14, 0], 'radius'], [[10, 2], 'radius']]);
    expect(gripMoved(e, 1, [10, 6])).toMatchObject({ ax: [0, 6], ratio: 2 / 6 }); // turned and longer; the minor keeps 2
    expect(gripMoved(e, 2, [10, 3]).ratio).toBe(0.75);
    const big = gripMoved(e, 2, [10, 8]); // the minor now the longer: the axes swap
    expect([big.ax!.map((v) => +v.toFixed(9) + 0), big.ratio]).toEqual([[0, 8], 0.5]);
    expect(gripMoved(e, 0, [0, 0]).pts).toEqual([[0, 0]]);
    const cloud: SketchItem = { id: 'C', kind: 'pline', layer: 'LV-ANNO', pts: [[0, 0], [10, 0], [10, 4], [0, 4]], closed: true, cloud: 2 };
    expect(trim(cloud, [5, 0], walls).error).toBe('Trim works on lines, polylines, trays and cable routes.');
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
