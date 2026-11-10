import type { SketchItem } from '../types';
import { circleThrough, segmentsOf } from './cadSketch';

/** Design CAD → DIMRADIUS, DIMDIAMETER, DIMANGULAR (S4 of the 2D gap plan): what the clicks pick for them. A drawn
 * object comes as a SketchItem; one of the opened drawing as a run of line segments (4 numbers each: x1, y1, x2, y2). */

type Pt = [number, number];
type Seg = [Pt, Pt];
const dist = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const segDist = (p: Pt, [a, b]: Seg) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  return dist(p, [a[0] + t * dx, a[1] + t * dy]);
};
const nearest = (segs: Seg[], at: Pt): Seg | undefined => {
  let best: { s: Seg; d: number } | undefined;
  for (const s of segs) { const d = segDist(at, s); if (!best || d < best.d) best = { s, d }; }
  return best?.s;
};

/** The segments s to e (exclusive) of a drawing's segment list. */
export function segmentsBetween(segs: ArrayLike<number>, s: number, e: number): Seg[] {
  const out: Seg[] = [];
  for (let i = s; i < e; i += 1) out.push([[segs[i * 4], segs[i * 4 + 1]], [segs[i * 4 + 2], segs[i * 4 + 3]]]);
  return out;
}
/** The segment of a drawing object nearest the point. */
export const nearestSegment = (segs: ArrayLike<number>, s: number, e: number, at: Pt): Seg | undefined => nearest(segmentsBetween(segs, s, e), at);
/** The straight piece of a drawn line or polyline nearest the point (undefined for other kinds). */
export const nearestPiece = (it: SketchItem, at: Pt): Seg | undefined => (it.kind === 'line' || it.kind === 'pline') && !it.cloud ? nearest(segmentsOf(it), at) : undefined;

/** The circle an arc or circle object's segments lie on: through three of their points a third of the way apart (a
 * closed circle's first and last points are one). */
export function roundOfSegments(segs: ArrayLike<number>, s: number, e: number): { c: Pt; r: number } | undefined {
  const n = e - s;
  if (n < 2) return undefined;
  const at = (i: number): Pt => [segs[i * 4], segs[i * 4 + 1]];
  return circleThrough(at(s), at(s + Math.floor(n / 3)), n < 3 ? [segs[(e - 1) * 4 + 2], segs[(e - 1) * 4 + 3]] : at(s + Math.floor((2 * n) / 3)));
}

/** Where two lines cross, run on past their ends; undefined when they are parallel. */
export function linesCross([a, b]: Seg, [c, d]: Seg): Pt | undefined {
  const r: Pt = [b[0] - a[0], b[1] - a[1]], q: Pt = [d[0] - c[0], d[1] - c[1]];
  const den = r[0] * q[1] - r[1] * q[0];
  if (Math.abs(den) < 1e-12 * Math.max(1, Math.hypot(...r) * Math.hypot(...q))) return undefined;
  const t = ((c[0] - a[0]) * q[1] - (c[1] - a[1]) * q[0]) / den;
  return [a[0] + r[0] * t, a[1] + r[1] * t];
}
/** The end of a line that lies on the side of `near` (where it was clicked) from the vertex x: the angle is measured
 * towards that end. When neither does (the click was behind the vertex), the end further from x. */
export function endTowards([a, b]: Seg, x: Pt, near: Pt): Pt {
  const side = (p: Pt) => (p[0] - x[0]) * (near[0] - x[0]) + (p[1] - x[1]) * (near[1] - x[1]);
  const sa = side(a), sb = side(b);
  if (sa > 0 !== sb > 0) return sa > 0 ? a : b;
  return dist(a, x) >= dist(b, x) ? a : b;
}
/** The point of a circle (centre c, radius r) in the direction of `at`. */
export const onRound = (c: Pt, r: number, at: Pt): Pt => { const d = dist(at, c) || 1; return [c[0] + ((at[0] - c[0]) / d) * r, c[1] + ((at[1] - c[1]) / d) * r]; };
