import { describe, expect, it } from 'vitest';
import { boundaryOfItem, cropItems, cropNote, cropPieces, hatchLookup, itemLength, linetypeOf, pieceLength, type CadPiece, type CropBoundary } from './cadCrop';
import type { SketchItem } from '../types';

type P2 = [number, number];
const S = { layer: 'E-LIGHT' };
const rect: CropBoundary = { kind: 'polygon', pts: [[0, 0], [10, 0], [10, 10], [0, 10]] };
const line = (a: P2, b: P2): CadPiece => ({ ...S, kind: 'line', a, b });
const arc = (c: P2, r: number, a0: number, a1: number): CadPiece => ({ ...S, kind: 'arc', c, r, a0, a1 });
const circle = (c: P2, r: number): CadPiece => ({ ...S, kind: 'circle', c, r });
const items = (p: CadPiece[], b: CropBoundary = rect, side: 'inside' | 'outside' = 'inside') => {
  const r = cropPieces(p, b, side);
  if (r.error) throw new Error(r.error);
  return r.items!;
};
const close = (a: number[] | number, b: number[] | number, d = 1e-9) => {
  const x = [a].flat(), y = [b].flat();
  expect(x.length).toBe(y.length);
  x.forEach((v, i) => expect(Math.abs(v - y[i])).toBeLessThan(d));
};
const pts = (it: Omit<SketchItem, 'id'>) => it.pts.flat();
const sweep = (it: Omit<SketchItem, 'id'>) => { let w = (it.a1 ?? 0) - (it.a0 ?? 0); while (w <= 0) w += 2 * Math.PI; return w; };

describe('CROP: lines', () => {
  it('keeps a line inside, drops one outside (Outside: the other way round)', () => {
    const [kept] = items([line([2, 2], [8, 8])]);
    expect(kept.kind).toBe('line');
    close(pts(kept), [2, 2, 8, 8]);
    expect(items([line([20, 0], [30, 0])])).toEqual([]);
    expect(items([line([2, 2], [8, 8])], rect, 'outside')).toEqual([]);
    close(pts(items([line([20, 0], [30, 0])], rect, 'outside')[0]), [20, 0, 30, 0]);
  });

  it('cuts a crossing line at the outline, and one through a corner into one line', () => {
    close(pts(items([line([-5, 5], [15, 5])])[0]), [0, 5, 10, 5]);
    const corner = items([line([-5, -5], [15, 15])]);
    expect(corner).toHaveLength(1);
    expect(corner[0].kind).toBe('line');
    close(pts(corner[0]), [0, 0, 10, 10]);
  });

  it('a line along an edge is on the outline: kept inside, its ends beyond kept outside', () => {
    close(pts(items([line([-5, 0], [15, 0])])[0]), [0, 0, 10, 0]);
    const out = items([line([-5, 0], [15, 0])], rect, 'outside');
    expect(out.map(pts)).toEqual([[-5, 0, 0, 0], [10, 0, 15, 0]]);
  });

  it('keeps the layer, its colour and linetype', () => {
    const [it] = items([{ layer: 'E-SYM', color: 0xff0000, lt: 'DASHED2', kind: 'line', a: [1, 1], b: [2, 2] }]);
    expect(it).toMatchObject({ layer: 'E-SYM', color: '#ff0000', lt: 'dashed' });
    expect(linetypeOf('ACAD_ISO02W100')).toBeUndefined();
    expect(items([{ layer: '0', color: 0xff000007, kind: 'line', a: [1, 1], b: [2, 2] }])[0].color).toBe('idx:7');
  });
});

describe('CROP: arcs and circles', () => {
  it('an arc crossing a side twice keeps its middle as an arc', () => {
    const out = items([arc([5, 10], 3, Math.PI - 0.5, 2 * Math.PI + 0.5)]);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('arc');
    close([out[0].r!, out[0].a0!, sweep(out[0])], [3, Math.PI, Math.PI]);
  });

  it('an arc crossing the outline four times leaves three arcs', () => {
    const a = arc([5, 5], 6, -0.7, Math.PI / 2 + 0.7);
    const out = items([a]);
    const k = Math.acos(5 / 6);
    expect(out.map((x) => x.kind)).toEqual(['arc', 'arc', 'arc']);
    close(out.map((x) => x.r! * sweep(x)).reduce((s, v) => s + v, 0), 6 * ((-k + 0.7) + (Math.PI / 2 - 2 * k) + (0.7 - k)), 1e-9);
  });

  it('a circle inside stays a circle; crossing, an arc; around the outline, nothing (Outside: all of it)', () => {
    const [inner] = items([circle([5, 5], 2)]);
    expect(inner).toMatchObject({ kind: 'circle', r: 2 });
    const cut = items([circle([10, 5], 2)]);
    expect(cut).toHaveLength(1);
    expect(cut[0].kind).toBe('arc');
    close([cut[0].a0!, sweep(cut[0])], [Math.PI / 2, Math.PI]);
    expect(items([circle([5, 5], 20)])).toEqual([]);
    expect(items([circle([5, 5], 20)], rect, 'outside')).toEqual([expect.objectContaining({ kind: 'circle', r: 20 })]);
  });
});

describe('CROP: polylines and outlines', () => {
  it('a bulged polyline: its straight runs stay lines, its arc segment an arc', () => {
    const out = items([{ ...S, kind: 'pline', pts: [[-5, 5, 0], [3, 5, 1], [7, 5, 0], [15, 5, 0]], closed: false }]);
    expect(out.map((x) => x.kind)).toEqual(['line', 'arc', 'line']);
    close(pts(out[0]), [0, 5, 3, 5]);
    close([...out[1].pts[0], out[1].r!, out[1].a0!, sweep(out[1])], [5, 5, 2, Math.PI, Math.PI]);
    close(pts(out[2]), [7, 5, 10, 5]);
  });

  it('a closed polyline wholly inside stays one closed polyline; a cut one joins through its closing corner', () => {
    const box: CadPiece = { ...S, kind: 'pline', pts: [[2, 2, 0], [8, 2, 0], [8, 8, 0], [2, 8, 0]], closed: true };
    expect(items([box])).toEqual([expect.objectContaining({ kind: 'pline', closed: true, pts: [[2, 2], [8, 2], [8, 8], [2, 8]] })]);
    const across: CadPiece = { ...S, kind: 'pline', pts: [[5, 2, 0], [15, 2, 0], [15, 8, 0], [5, 8, 0]], closed: true };
    const [run] = items([across]);
    expect(run.kind).toBe('pline');
    expect(run.closed).toBeUndefined();
    expect(run.pts).toEqual([[10, 8], [5, 8], [5, 2], [10, 2]]);
  });

  it('a concave (L-shaped) outline', () => {
    const L: CropBoundary = { kind: 'polygon', pts: [[0, 0], [10, 0], [10, 5], [5, 5], [5, 10], [0, 10]] };
    close(pts(items([line([-1, 7.5], [11, 7.5])], L)[0]), [0, 7.5, 5, 7.5]);
    close(pts(items([line([7.5, -1], [7.5, 11])], L)[0]), [7.5, 0, 7.5, 5]);
    const out = items([line([-1, 7.5], [11, 7.5])], L, 'outside');
    expect(out.map(pts)).toEqual([[-1, 7.5, 0, 7.5], [5, 7.5, 11, 7.5]]);
  });

  it('a circle outline, and a bulged one', () => {
    const c: CropBoundary = { kind: 'circle', c: [0, 0], r: 5 };
    close(pts(items([line([-10, 0], [10, 0])], c)[0]), [-5, 0, 5, 0]);
    close(pts(items([line([-10, 3], [10, 3])], c)[0]), [-4, 3, 4, 3]);
    // A slot: two half circles joined by straight sides.
    const slot: CropBoundary = { kind: 'pline', pts: [[0, 0, 0], [10, 0, 1], [10, 4, 0], [0, 4, 1]], closed: true };
    close(pts(items([line([-5, 2], [15, 2])], slot)[0]), [-2, 2, 12, 2]);
  });

  it('clockwise and anticlockwise outlines give the same result', () => {
    const ccw: CropBoundary = { kind: 'polygon', pts: [[0, 0], [10, 0], [10, 5], [5, 5], [5, 10], [0, 10]] };
    const cw: CropBoundary = { kind: 'polygon', pts: [...ccw.pts].reverse() };
    const p = [line([-1, 7.5], [11, 7.5]), arc([5, 5], 6, -0.7, 2.3), circle([2, 2], 1)];
    expect(items(p, cw)).toEqual(items(p, ccw));
    expect(items(p, cw, 'outside')).toEqual(items(p, ccw, 'outside'));
  });

  it('refuses an outline that crosses itself, is not closed, or has no area', () => {
    expect(cropPieces([], { kind: 'polygon', pts: [[0, 0], [10, 10], [10, 0], [0, 10]] }).error).toMatch(/crosses itself/);
    expect(cropPieces([], { kind: 'pline', pts: [[0, 0, 0], [10, 0, 0], [10, 10, 0]], closed: false }).error).toMatch(/not closed/);
    expect(cropPieces([], { kind: 'polygon', pts: [[0, 0], [10, 0], [20, 0]] }).error).toMatch(/no area/);
    expect(cropPieces([], { kind: 'polygon', pts: [[0, 0], [10, 0]] }).error).toMatch(/three corners/);
  });
});

describe('CROP: texts, hatches, solids, dimensions', () => {
  it('a text stays when its insertion point is inside; an attribute becomes a plain text', () => {
    const t = (at: P2, tag?: string): CadPiece => ({ ...S, kind: 'text', at, h: 2, rot: 0, text: 'L1-01', tag });
    expect(items([t([5, 5], 'CCT')])).toEqual([{ ...S, kind: 'text', pts: [[5, 5]], text: 'L1-01', h: 2, rot: 0 }]);
    expect(items([t([12, 5])])).toEqual([]);
    expect(items([t([12, 5])], rect, 'outside')).toHaveLength(1);
  });

  it('a hatch wholly inside is kept; one crossing the outline is not, and is reported', () => {
    const h = (x: number): CadPiece => ({ ...S, kind: 'hatch', solid: true, pattern: 'SOLID', loops: [[[x, 2, 0], [x + 4, 2, 0], [x + 4, 6, 0], [x, 6, 0]]] });
    expect(items([h(2)])).toEqual([expect.objectContaining({ kind: 'pline', closed: true, hatch: { pattern: 'solid', scale: 1, angle: 0 } })]);
    const r = cropPieces([h(8)], rect);
    expect(r.items).toEqual([]);
    expect(cropNote(r)).toBe('0 pieces kept · 1 hatch crossing the outline, not kept');
    // Outside: a hatch around the cut-out would cover it.
    const around: CadPiece = { ...S, kind: 'hatch', solid: true, pattern: 'SOLID', loops: [[[-5, -5, 0], [15, -5, 0], [15, 15, 0], [-5, 15, 0]]] };
    expect(cropNote(cropPieces([around], rect, 'outside'))).toMatch(/1 hatch crossing/);
  });

  it('a pattern hatch keeps the open drawing\'s pattern lines, found by layer and outline; else its name\'s pattern', () => {
    const h = (pattern: string): CadPiece => ({ ...S, kind: 'hatch', solid: false, pattern, loops: [[[2, 2, 0], [6, 2, 0], [6, 6, 0], [2, 6, 0]]] });
    // The drawing: origin (1, 1), the same square as segments relative to it, its pattern 45° lines 0.5 apart.
    const sq = [[1, 1], [5, 1], [5, 5], [1, 5]], segs = sq.flatMap((p, i) => [...p, ...sq[(i + 1) % 4]]);
    const a = Math.PI / 4, lines = [{ angle: a, base: [7, 7] as P2, offset: [-Math.sin(a) * 0.5, Math.cos(a) * 0.5] as P2, dashes: [0.25, -0.25] }];
    const view = { info: { origin: [1, 1] as P2, extents: [0, 0, 100, 100] as [number, number, number, number], layers: [{ name: 'X' }, { name: 'E-LIGHT' }], fills: [{ layer: 1, rgb: 0, solid: false, loops: [[0, 4]] as [number, number][], lines }] }, segs };
    const look = hatchLookup(view as never, 0.1); // 0.1 units per paper mm: lines 5 mm apart
    const [it] = cropPieces([h('MYGRID')], rect, 'inside', look).items!;
    expect(it.hatch).toMatchObject({ pattern: 'MYGRID', angle: 0, custom: { name: 'MYGRID' } });
    expect(it.hatch!.scale).toBeCloseTo(5, 9);
    const [l] = it.hatch!.custom!.lines;
    close([l.angle, ...l.base, ...l.offset, ...l.dashes], [45, 0, 0, 0, 1, 0.5, -0.5]);
    // Another layer, or no drawing: the built-in pattern of its name, else ANSI31.
    expect(cropPieces([{ ...h('BRICK'), layer: 'X' }], rect, 'inside', look).items![0].hatch).toEqual({ pattern: 'brick', scale: 3, angle: 0 });
    expect(items([h('MYGRID')])[0].hatch).toEqual({ pattern: 'ansi31', scale: 3, angle: 0 });
  });

  it('a dimension (a group) is kept whole or not at all', () => {
    const dim = (x: number): CadPiece => ({ ...S, kind: 'group', items: [line([x, 1], [x + 3, 1]), { ...S, kind: 'text', at: [x + 1, 1.5], h: 0.5, rot: 0, text: '3' }] });
    expect(items([dim(2)])).toHaveLength(2);
    const r = cropPieces([dim(8)], rect);
    expect(r.items).toEqual([]);
    expect(cropNote(r)).toMatch(/1 dimension crossing/);
  });
});

describe('CROP: drawn items', () => {
  it('cuts drawn items keeping their own properties (a cable route stays on its feeder)', () => {
    const route = { id: 'S1', kind: 'pline' as const, layer: 'E-CABLE', pts: [[-5, 5], [5, 5], [5, 15]] as P2[], cable: { feederId: 'F1' }, lw: 0.35 };
    const r = cropItems([route], rect);
    expect(r.items).toEqual([{ kind: 'pline', layer: 'E-CABLE', pts: [[0, 5], [5, 5], [5, 10]], cable: { feederId: 'F1' }, lw: 0.35 }]);
  });

  it('a drawn ellipse wholly inside stays as it is; one crossing the outline is cut as a polyline', () => {
    const e = { id: 'S2', kind: 'ellipse' as const, layer: 'LV-SKETCH', pts: [[5, 5]] as P2[], ax: [3, 0] as P2, ratio: 0.5 };
    expect(cropItems([e], rect).items).toEqual([{ kind: 'ellipse', layer: 'LV-SKETCH', pts: [[5, 5]], ax: [3, 0], ratio: 0.5 }]);
    const cut = cropItems([{ ...e, pts: [[10, 5]] }], rect).items!;
    expect(cut).toHaveLength(1);
    expect(cut[0]).toMatchObject({ kind: 'pline', layer: 'LV-SKETCH' });
    expect(cut[0].ax).toBeUndefined();
    for (const [x] of cut[0].pts) expect(x).toBeLessThanOrEqual(10 + 1e-9);
  });

  it('a closed drawn polyline or circle is an outline', () => {
    expect(boundaryOfItem({ kind: 'pline', pts: [[0, 0], [1, 0], [1, 1]], closed: true })).toEqual({ kind: 'polygon', pts: [[0, 0], [1, 0], [1, 1]] });
    expect(boundaryOfItem({ kind: 'circle', pts: [[0, 0]], r: 2 })).toEqual({ kind: 'circle', c: [0, 0], r: 2 });
    expect(boundaryOfItem({ kind: 'pline', pts: [[0, 0], [1, 0], [1, 1]] })).toBeUndefined();
  });
});

/** A fixed-seed generator (no new dependency). */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2 ** 32; };
}
const midOf = (it: Omit<SketchItem, 'id'>): P2 => {
  if (it.kind === 'arc') { const a = (it.a0 ?? 0) + sweep(it) / 2; return [it.pts[0][0] + it.r! * Math.cos(a), it.pts[0][1] + it.r! * Math.sin(a)]; }
  if (it.kind === 'circle') return [it.pts[0][0] + it.r!, it.pts[0][1]];
  const L = itemLength(it) / 2;
  let s = 0;
  for (let i = 1; i < it.pts.length; i++) {
    const [a, b] = [it.pts[i - 1], it.pts[i]], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (s + l >= L) { const t = (L - s) / l; return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }
    s += l;
  }
  return it.pts[it.pts.length - 1];
};
/** Independent inside tests: even-odd for polygons (on an edge counts as inside), distance for circles. */
function insideOf(b: CropBoundary, p: P2): boolean {
  if (b.kind === 'circle') return Math.hypot(p[0] - b.c[0], p[1] - b.c[1]) <= b.r + 1e-7;
  const poly = b.pts as P2[];
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    const ex = xj - xi, ey = yj - yi, t = Math.max(0, Math.min(1, ((p[0] - xi) * ex + (p[1] - yi) * ey) / (ex * ex + ey * ey)));
    if (Math.hypot(p[0] - xi - t * ex, p[1] - yi - t * ey) < 1e-7) return true;
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < (ex * (p[1] - yi)) / ey + xi) inside = !inside;
  }
  return inside;
}

describe('CROP: property test (fixed seed)', () => {
  const r = rng(20261108);
  const box = () => -10 + 30 * r();
  const boundaries: CropBoundary[] = [];
  for (let n = 0; n < 6; n++) {
    // Convex: corners on a circle at sorted angles; concave: a star (radii in and out by turns); a circle.
    const k = 3 + Math.floor(r() * 6), c: P2 = [5 + 4 * r(), 5 + 4 * r()], rad = 4 + 6 * r();
    const angles = Array.from({ length: k }, () => r() * 2 * Math.PI).sort((a, b) => a - b);
    boundaries.push({ kind: 'polygon', pts: angles.map((a): P2 => [c[0] + rad * Math.cos(a), c[1] + rad * Math.sin(a)]) });
    const m = 5 + Math.floor(r() * 5);
    boundaries.push({ kind: 'polygon', pts: Array.from({ length: 2 * m }, (_, i): P2 => { const a = (i * Math.PI) / m, q = i % 2 ? rad * (0.3 + 0.3 * r()) : rad; return [c[0] + q * Math.cos(a), c[1] + q * Math.sin(a)]; }) });
    boundaries.push({ kind: 'circle', c, r: rad });
  }
  const pieces: CadPiece[] = Array.from({ length: 60 }, (_, i) => (i % 2
    ? line([box(), box()], [box(), box()])
    : arc([box(), box()], 1 + 10 * r(), r() * 2 * Math.PI, r() * 2 * Math.PI)));

  it('every kept piece is on its side; inside + outside is the whole; cropping again changes nothing', () => {
    for (const b of boundaries) {
      for (const p of pieces) {
        const inn = items([p], b), out = items([p], b, 'outside');
        for (const it of inn) expect(insideOf(b, midOf(it))).toBe(true);
        for (const it of out) expect(insideOf(b, midOf(it))).toBe(false);
        const L = pieceLength(p), sum = [...inn, ...out].reduce((s, it) => s + itemLength(it), 0);
        expect(Math.abs(sum - L)).toBeLessThanOrEqual(1e-6 * L);
        for (const [side, got] of [['inside', inn], ['outside', out]] as const) {
          const again = cropItems(got.map((it, i) => ({ ...it, id: `S${i}` })), b, side).items!;
          expect(again).toHaveLength(got.length);
          again.forEach((it, i) => close([...it.pts.flat(), it.r ?? 0, it.a0 ?? 0, it.a1 ?? 0], [...got[i].pts.flat(), got[i].r ?? 0, got[i].a0 ?? 0, got[i].a1 ?? 0], 1e-7));
        }
      }
    }
  });
});
