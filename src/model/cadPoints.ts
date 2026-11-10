import type { Project, SketchItem } from '../types';
import { ellipsePoints } from './cadSketch';

/** Design CAD → points (POINT, DIVIDE, MEASURE, PTYPE; S8 of the 2D gap plan): a drawn point is `kind: 'point'` at
 * pts[0], shown with the drawing's point style; DIVIDE and MEASURE set points out along a line, polyline, arc, circle
 * or ellipse. */

type Pt = [number, number];

/** The look of drawn points, as PDMODE / PDSIZE: the shape (0 dot, 1 none, 2 plus, 3 cross, 4 tick; +32 in a circle,
 * +64 in a square) and the size, a share of the view's height (%) while `relative`, else in drawing units. */
export interface PointStyle { mode: number; size: number; relative: boolean }
export const POINT_STYLE_DEFAULT: PointStyle = { mode: 0, size: 5, relative: true };
export const pointStyleOf = (p: Pick<Project, 'cadPointStyle'>): PointStyle => ({ ...POINT_STYLE_DEFAULT, ...p.cadPointStyle });
const BASES = ['Dot', 'None', 'Plus', 'Cross', 'Tick'];
const RINGS: [number, string][] = [[0, ''], [32, ' in a circle'], [64, ' in a square'], [96, ' in a circle and a square']];
/** The twenty shapes of the Point style dialog, a row per ring. */
export const POINT_SHAPES: { id: number; label: string }[] = RINGS.flatMap(([r, suffix]) => BASES.map((b, i) => ({ id: r + i, label: b + suffix })));
export const pointShapeLabel = (mode: number) => POINT_SHAPES.find((s) => s.id === mode)?.label ?? 'Dot';
/** PDSIZE as a DXF keeps it: negative, a share of the view's height (%); positive, drawing units. */
export const pdsizeOf = (s: PointStyle) => (s.relative ? -s.size : s.size);

/** The marker of a shape, within a unit radius about the point: its lines, and whether it has a circle, a square and
 * a dot at the point. */
export interface PointMark { lines: [Pt, Pt][]; circle: boolean; square: boolean; dot: boolean }
export function pointMark(mode: number): PointMark {
  const base = mode & 31, lines: [Pt, Pt][] = [];
  if (base === 2) lines.push([[-1, 0], [1, 0]], [[0, -1], [0, 1]]);
  else if (base === 3) lines.push([[-1, -1], [1, 1]], [[-1, 1], [1, -1]]);
  else if (base === 4) lines.push([[0, 0], [0, 1]]);
  if (mode & 64) lines.push([[-1, -1], [1, -1]], [[1, -1], [1, 1]], [[1, 1], [-1, 1]], [[-1, 1], [-1, -1]]);
  return { lines, circle: !!(mode & 32), square: !!(mode & 64), dot: base === 0 };
}
/** The marker's radius (drawing units) in a view `viewH` drawing units high. */
export const pointRadius = (s: PointStyle, viewH: number) => (s.relative ? (viewH * s.size) / 200 : s.size / 2);

// ---- DIVIDE and MEASURE

const dist = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1]);
/** The object as a polyline to measure along (a curve finely, a closed one back to its start), or undefined when it
 * is not one DIVIDE and MEASURE work on (a text, dimension, note, point or revision cloud). */
function pathPts(it: SketchItem): { pts: Pt[]; closed: boolean } | undefined {
  if ((it.kind === 'line' || it.kind === 'pline') && !it.cloud) {
    const closed = !!it.closed && it.pts.length > 2;
    return it.pts.length > 1 ? { pts: closed ? [...it.pts, it.pts[0]] : it.pts, closed } : undefined;
  }
  if ((it.kind === 'circle' || it.kind === 'arc') && it.r) {
    const c = it.pts[0], r = it.r, a0 = it.kind === 'circle' ? 0 : it.a0 ?? 0;
    let sw = it.kind === 'circle' ? 2 * Math.PI : (it.a1 ?? 0) - a0;
    while (sw <= 0) sw += 2 * Math.PI;
    const n = Math.max(32, Math.ceil(sw / (Math.PI / 360)));
    return { pts: Array.from({ length: n + 1 }, (_, i): Pt => [c[0] + r * Math.cos(a0 + (sw * i) / n), c[1] + r * Math.sin(a0 + (sw * i) / n)]), closed: it.kind === 'circle' };
  }
  if (it.kind === 'ellipse' && it.ax) { const pts = ellipsePoints(it, 720); return { pts: [...pts, pts[0]], closed: true }; }
  return undefined;
}
/** Whether DIVIDE and MEASURE work on the object. */
export const canDivide = (it: SketchItem) => !!pathPts(it);
const chain = (pts: Pt[]) => pts.reduce<number[]>((c, q, i) => [...c, i ? c[i - 1] + dist(pts[i - 1], q) : 0], []);
/** The point at chainage `s` and the direction of the path there (radians). */
function at(pts: Pt[], c: number[], s: number): { at: Pt; angle: number } {
  for (let i = 1; i < pts.length; i += 1) {
    if (s <= c[i] + 1e-9 || i === pts.length - 1) {
      const a = pts[i - 1], b = pts[i], l = c[i] - c[i - 1] || 1, t = Math.max(0, Math.min(1, (s - c[i - 1]) / l));
      return { at: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], angle: Math.atan2(b[1] - a[1], b[0] - a[0]) };
    }
  }
  return { at: pts[pts.length - 1], angle: 0 };
}
/** DIVIDE: the object in `n` equal parts: the n − 1 points between them (n points round a closed object, the first at
 * its start), each with the object's direction there (for blocks aligned with it later). */
export function pointsAlong(it: SketchItem, n: number): { at: Pt; angle: number }[] {
  const p = pathPts(it);
  if (!p || !Number.isInteger(n) || n < 2) return [];
  const c = chain(p.pts), L = c[c.length - 1];
  if (!(L > 0)) return [];
  const ks = Array.from({ length: p.closed ? n : n - 1 }, (_, i) => (p.closed ? i : i + 1));
  return ks.map((k) => at(p.pts, c, (k * L) / n));
}
/** MEASURE: a point every `d` along the object from the end nearer `from` (a closed object from its start), short of
 * the far end. */
export function pointsEvery(it: SketchItem, d: number, from?: Pt): { at: Pt; angle: number }[] {
  const p = pathPts(it);
  if (!p || !(d > 0)) return [];
  const pts = from && !p.closed && dist(from, p.pts[p.pts.length - 1]) < dist(from, p.pts[0]) ? [...p.pts].reverse() : p.pts;
  const c = chain(pts), L = c[c.length - 1], out: { at: Pt; angle: number }[] = [];
  for (let s = d; s < L - 1e-9 * Math.max(1, L) && out.length < 10000; s += d) out.push(at(pts, c, s));
  return out;
}
