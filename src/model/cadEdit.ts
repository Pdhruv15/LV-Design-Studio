import { arcMid, bulgeArc, constructionSegment, hasArcs, moved, rotated, scaleLook, segmentsOf } from './cadSketch';
import type { SketchItem } from '../types';
import { explodeNote, noteBox, noteCorners, noteWithWidth } from './cadMtext';
import { mleaderNote, mleaderSegments } from './cadMleader';
import { explodeInsert, type CadBlockDef } from './cadBlocks';

/** Design CAD → Draw → Modify / Edit: Trim, Extend, Offset, Fillet, Chamfer, Break, Join, Explode, Mirror, Scale, Stretch,
 * Array and grips, on what is drawn in the app (drawing units). The architect's drawing is never changed; its lines
 * (shown layers) are cutting edges and boundaries like the drawn ones. Each edit returns the items that replace the one
 * worked on (the first keeps its ID; the rest are new), or why it cannot be done. Trays and cable routes keep their
 * tray and cable through every edit. */

type Pt = [number, number];
export type Seg = [Pt, Pt];
export type Edit = { items: Omit<SketchItem, 'id'>[]; note?: string; error?: undefined } | { error: string; items?: undefined; note?: undefined };

const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
const add = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]];
const mul = (a: Pt, k: number): Pt => [a[0] * k, a[1] * k];
const dot = (a: Pt, b: Pt) => a[0] * b[0] + a[1] * b[1];
const cross = (a: Pt, b: Pt) => a[0] * b[1] - a[1] * b[0];
const len = (a: Pt) => Math.hypot(a[0], a[1]);
const unit = (a: Pt): Pt => { const l = len(a) || 1; return [a[0] / l, a[1] / l]; };
const EPS = 1e-9;

/** Lines and polylines (trays and cable routes are polylines): the ones Trim, Extend, Break and Fillet work on. */
/** A line or polyline the path tools work on (a revision cloud's sides are arcs: it is not one). */
export const isPath = (it: Pick<SketchItem, 'kind' | 'cloud' | 'infinite'>) => (it.kind === 'line' || it.kind === 'pline') && !it.cloud && !it.infinite;
/** The points of a path, the first repeated at the end when closed. */
const pathOf = (it: SketchItem): Pt[] => (it.closed && it.pts.length > 2 ? [...it.pts, it.pts[0]] : it.pts);
const chain = (pts: Pt[]) => pts.reduce<number[]>((c, q, i) => [...c, i ? c[i - 1] + len(sub(q, pts[i - 1])) : 0], []);
function pointAt(pts: Pt[], c: number[], s: number): Pt {
  for (let i = 1; i < pts.length; i += 1) if (s <= c[i] + EPS) { const l = c[i] - c[i - 1] || 1; return add(pts[i - 1], mul(sub(pts[i], pts[i - 1]), (s - c[i - 1]) / l)); }
  return pts[pts.length - 1];
}
/** The part of a path from chainage s0 to s1. */
function slice(pts: Pt[], c: number[], s0: number, s1: number): Pt[] {
  const out: Pt[] = [pointAt(pts, c, s0)];
  for (let i = 1; i < pts.length - 1; i += 1) if (c[i] > s0 + EPS && c[i] < s1 - EPS) out.push(pts[i]);
  out.push(pointAt(pts, c, s1));
  return out;
}
/** Where a point is along a path: chainage, distance off, and the segment. */
function along(pts: Pt[], c: number[], p: Pt): { s: number; off: number; seg: number } {
  let best = { s: 0, off: Infinity, seg: 0 };
  for (let i = 0; i + 1 < pts.length; i += 1) {
    const d = sub(pts[i + 1], pts[i]), l2 = dot(d, d);
    const t = l2 ? Math.max(0, Math.min(1, dot(sub(p, pts[i]), d) / l2)) : 0;
    const off = len(sub(p, add(pts[i], mul(d, t))));
    if (off < best.off) best = { s: c[i] + t * Math.sqrt(l2), off, seg: i };
  }
  return best;
}
/** Where a → b (t along it, 1 at b) meets segment c → d; null when parallel or off c → d. */
function meet(a: Pt, b: Pt, c: Pt, d: Pt): number | null {
  const r = sub(b, a), s = sub(d, c), den = cross(r, s);
  if (Math.abs(den) < EPS * Math.max(1, len(r) * len(s))) return null;
  const t = cross(sub(c, a), s) / den, u = cross(sub(c, a), r) / den;
  return u >= -1e-9 && u <= 1 + 1e-9 ? t : null;
}
/** Where the lines through a → b and c → d meet. */
function lineMeet(a: Pt, b: Pt, c: Pt, d: Pt): Pt | null {
  const r = sub(b, a), s = sub(d, c), den = cross(r, s);
  if (Math.abs(den) < EPS * Math.max(1, len(r) * len(s))) return null;
  return add(a, mul(r, cross(sub(c, a), s) / den));
}
const withPts = (it: SketchItem, pts: Pt[], closed = false): Omit<SketchItem, 'id'> => {
  const { id: _id, closed: _c, bulges: _b, ...rest } = it;
  return { ...rest, kind: it.kind === 'pline' || pts.length > 2 ? 'pline' : 'line', pts, ...(closed ? { closed: true } : {}) };
};
const box = (pts: Pt[]) => pts.reduce(([x0, y0, x1, y1], q) => [Math.min(x0, q[0]), Math.min(y0, q[1]), Math.max(x1, q[0]), Math.max(y1, q[1])], [Infinity, Infinity, -Infinity, -Infinity]);

/** A circle or arc as the curve it is: centre, radius, where it starts and how far it turns anticlockwise (2π: all the
 * way round). As a cutting edge it stays the curve, not its chords, so a cut or an end run on to it lands on it exactly. */
export type Round = { c: Pt; r: number; a0: number; sweep: number };
/** A cutting edge or boundary: a straight piece, or a circle or arc. */
export type Edge = Seg | Round;
const TAU = 2 * Math.PI;
/** An angle brought into 0 up to 2π (a hair under 2π is 0). */
const turn = (a: number) => { const t = a % TAU, u = t < 0 ? t + TAU : t; return u > TAU - 1e-12 ? 0 : u; };
/** The curve of a drawn circle or arc; null for anything else. */
const roundOf = (it: SketchItem): Round | null => {
  if ((it.kind !== 'circle' && it.kind !== 'arc') || !((it.r ?? 0) > EPS)) return null;
  if (it.kind === 'circle') return { c: it.pts[0], r: it.r!, a0: 0, sweep: TAU };
  return { c: it.pts[0], r: it.r!, a0: it.a0 ?? 0, sweep: turn((it.a1 ?? 0) - (it.a0 ?? 0)) || TAU };
};
/** How far round a circle or arc a point is from its start (0 up to 2π), by its direction from the centre. */
const turnTo = (q: Round, p: Pt) => { const t = turn(Math.atan2(p[1] - q.c[1], p[0] - q.c[0]) - q.a0); return t > TAU - 1e-9 ? 0 : t; };
/** True when a point of an arc's circle is on the arc itself. */
const onRound = (q: Round, p: Pt) => turnTo(q, p) <= q.sweep + 1e-9;
/** Where the line through a → b meets a circle (t along it, 1 at b): none, one where it only touches, or two. */
function meetCircle(a: Pt, b: Pt, c: Pt, r: number): number[] {
  const d = sub(b, a), f = sub(a, c), l2 = dot(d, d);
  if (l2 < EPS * EPS) return [];
  // mid: nearest the centre; k2: half the chord, squared.
  const mid = -dot(f, d) / l2, k2 = r * r - (dot(f, f) - mid * mid * l2);
  if (k2 < -1e-9 * r * r) return [];
  if (k2 <= 1e-9 * r * r) return [mid];
  const k = Math.sqrt(k2 / l2);
  return [mid - k, mid + k];
}
/** Where two circles meet: none, one point where they only touch, or two. */
function circlesMeet(c1: Pt, r1: number, c2: Pt, r2: number): Pt[] {
  const d = sub(c2, c1), l = len(d);
  if (l < EPS * Math.max(1, r1, r2) || l > (r1 + r2) * (1 + 1e-9) || l < Math.abs(r1 - r2) * (1 - 1e-9)) return [];
  const s = (l * l + r1 * r1 - r2 * r2) / (2 * l), h2 = r1 * r1 - s * s, u = mul(d, 1 / l), m = add(c1, mul(u, s));
  if (h2 <= 1e-9 * r1 * r1) return [m];
  const n = mul([-u[1], u[0]], Math.sqrt(h2));
  return [add(m, n), sub(m, n)];
}

/** The other lines an item can be cut at or extended to: the drawn items' pieces (a circle or arc as its curve) and the
 * architect's lines. */
export const edgesFor = (items: SketchItem[], except: string, drawing: Seg[]): Edge[] => {
  const others = items.filter((x) => x.id !== except);
  // An infinite construction line is cut to a box well beyond everything drawn (worked out only when there is one).
  let box: [number, number, number, number] = [0, 0, 1, 1];
  if (others.some((x) => x.infinite)) {
    let [x0, y0, x1, y1] = box;
    const grow = (p: Pt) => { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; };
    for (const x of items) x.pts.forEach(grow);
    for (const [a, b] of drawing) { grow(a); grow(b); }
    const span = Math.max(x1 - x0, y1 - y0, 1);
    box = [x0 - span, y0 - span, x1 + span, y1 + span];
  }
  const drawn = others.flatMap((x): Edge[] => {
    const s = x.infinite ? constructionSegment(x, box) : undefined, round = roundOf(x);
    return x.infinite ? (s ? [s] : []) : round ? [round] : segmentsOf(x);
  });
  return drawn.concat(drawing);
};

/** Polylines with arc segments (their bulges) are straight-segment geometry to these tools: they ask for Explode first. */
const ARCS = 'This polyline has arc segments: explode it first (X).';

/** Where the edges cross a path, circle or arc, as chainages along it in order (its ends left out): where Trim cuts.
 * Worked out once for the line under the cursor, so the shadow before the click costs little on each move. */
export function crossingsOf(it: SketchItem, edges: Edge[]): number[] {
  const round = roundOf(it);
  if (round) return roundCrossings(round, edges);
  if (!isPath(it) || hasArcs(it)) return [];
  const pts = pathOf(it), c = chain(pts), L = c[c.length - 1];
  const [x0, y0, x1, y1] = box(pts);
  const cuts: number[] = [];
  for (const e of edges) {
    if (!Array.isArray(e)) {
      // A circle or arc: where each side meets the curve itself.
      if (e.c[0] + e.r < x0 - EPS || e.c[0] - e.r > x1 + EPS || e.c[1] + e.r < y0 - EPS || e.c[1] - e.r > y1 + EPS) continue;
      for (let i = 0; i + 1 < pts.length; i += 1) for (const t of meetCircle(pts[i], pts[i + 1], e.c, e.r)) {
        if (t < -1e-9 || t > 1 + 1e-9 || !onRound(e, add(pts[i], mul(sub(pts[i + 1], pts[i]), t)))) continue;
        const s = c[i] + t * (c[i + 1] - c[i]);
        if (s > L * 1e-6 && s < L * (1 - 1e-6)) cuts.push(s);
      }
      continue;
    }
    const p = e[0], q = e[1];
    if (Math.max(p[0], q[0]) < x0 - EPS || Math.min(p[0], q[0]) > x1 + EPS || Math.max(p[1], q[1]) < y0 - EPS || Math.min(p[1], q[1]) > y1 + EPS) continue;
    for (let i = 0; i + 1 < pts.length; i += 1) {
      const t = meet(pts[i], pts[i + 1], p, q);
      if (t === null || t < -1e-9 || t > 1 + 1e-9) continue;
      const s = c[i] + t * (c[i + 1] - c[i]);
      if (s > L * 1e-6 && s < L * (1 - 1e-6)) cuts.push(s);
    }
  }
  return cuts.sort((a, b) => a - b).filter((s, i, x) => !i || s - x[i - 1] > L * 1e-9);
}

/** Where the edges cross a circle or arc, as lengths along it from its start, in order. An arc's ends are left out; a
 * circle has no ends, so a crossing at its start (its 0° point) counts. */
function roundCrossings(q: Round, edges: Edge[]): number[] {
  const L = q.r * q.sweep, whole = q.sweep >= TAU;
  const x0 = q.c[0] - q.r, y0 = q.c[1] - q.r, x1 = q.c[0] + q.r, y1 = q.c[1] + q.r;
  const cuts: number[] = [];
  const cutAt = (p: Pt) => {
    const t = turnTo(q, p), s = q.r * t;
    if (t <= q.sweep + 1e-9 && (whole || (s > L * 1e-6 && s < L * (1 - 1e-6)))) cuts.push(s);
  };
  for (const e of edges) {
    if (!Array.isArray(e)) { for (const p of circlesMeet(q.c, q.r, e.c, e.r)) if (onRound(e, p)) cutAt(p); continue; }
    const a = e[0], b = e[1];
    if (Math.max(a[0], b[0]) < x0 - EPS || Math.min(a[0], b[0]) > x1 + EPS || Math.max(a[1], b[1]) < y0 - EPS || Math.min(a[1], b[1]) > y1 + EPS) continue;
    for (const t of meetCircle(a, b, q.c, q.r)) if (t >= -1e-9 && t <= 1 + 1e-9) cutAt(add(a, mul(sub(b, a), t)));
  }
  return cuts.sort((a, b) => a - b).filter((s, i, x) => !i || s - x[i - 1] > L * 1e-9);
}

/** Where Trim cuts the path clicked: from chainage `lo` to `hi`, the nearest crossings on either side of the click; over
 * the start of a closed shape when `wrap` (then `lo` is the last crossing and `hi` the first). */
type Cut = { pts: Pt[]; c: number[]; L: number; lo: number; hi: number; wrap: boolean };
const NO_CUT = 'Nothing crosses it there to cut at: Erase it instead.', TWO_CUTS = 'A closed shape needs two crossings to cut a piece out.';
function cutOf(it: SketchItem, click: Pt, sorted: number[]): Cut | { error: string } {
  if (hasArcs(it)) return { error: ARCS };
  if (!isPath(it)) return { error: 'Trim works on lines, polylines, circles, arcs, trays and cable routes.' };
  if (!sorted.length) return { error: NO_CUT };
  const pts = pathOf(it), c = chain(pts), L = c[c.length - 1], at = along(pts, c, click).s;
  if (it.closed) {
    if (sorted.length < 2) return { error: TWO_CUTS };
    const lo = [...sorted].reverse().find((s) => s < at), hi = sorted.find((s) => s > at);
    if (lo === undefined || hi === undefined) return { pts, c, L, lo: sorted[sorted.length - 1], hi: sorted[0], wrap: true };
    return { pts, c, L, lo, hi, wrap: false };
  }
  const lo = [0, ...sorted].filter((s) => s < at).pop()!, hi = [...sorted, L].find((s) => s > at)!;
  return { pts, c, L, lo, hi, wrap: false };
}

/** Where Trim cuts the circle or arc clicked, as cutOf does a path, in lengths along it from its start. A circle (or an
 * arc all the way round) is a closed shape: it needs two crossings. */
function roundCutOf(q: Round, click: Pt, sorted: number[]): Pick<Cut, 'L' | 'lo' | 'hi' | 'wrap'> | { error: string } {
  if (!sorted.length) return { error: NO_CUT };
  // A click off the end of an arc counts at the nearer end.
  const L = q.r * q.sweep, t = turnTo(q, click), at = q.r * (t <= q.sweep ? t : t - q.sweep < TAU - t ? q.sweep : 0);
  const lo = [...sorted].reverse().find((s) => s < at), hi = sorted.find((s) => s > at);
  if (q.sweep < TAU) return { L, lo: lo ?? 0, hi: hi ?? L, wrap: false };
  if (sorted.length < 2) return { error: TWO_CUTS };
  if (lo === undefined || hi === undefined) return { L, lo: sorted[sorted.length - 1], hi: sorted[0], wrap: true };
  return { L, lo, hi, wrap: false };
}
/** The part of a circle or arc from length s0 round to s1, as an arc like it (its layer, colour…); an end that is the
 * arc's own keeps its angle as it was. */
function arcPiece(it: SketchItem, q: Round, s0: number, s1: number): Omit<SketchItem, 'id'> {
  const { id: _id, ...rest } = it, L = q.r * q.sweep;
  const angle = (s: number) => (it.kind === 'arc' && s <= 0 ? q.a0 : it.kind === 'arc' && s >= L ? it.a1 ?? 0 : turn(q.a0 + s / q.r));
  return { ...rest, kind: 'arc', a0: angle(s0), a1: angle(s1) };
}

/** Trim: the part of the path, circle or arc clicked, between the nearest crossings on either side of the click, is
 * cut away. A circle becomes the arc that is left. */
export function trim(it: SketchItem, click: Pt, edges: Edge[]): Edit & { cut?: number } {
  const round = roundOf(it);
  if (round) {
    const r = roundCutOf(round, click, roundCrossings(round, edges));
    if ('error' in r) return r;
    // All the way round: what stays runs from the crossing after the click round to the one before it.
    if (round.sweep >= TAU) return { items: [arcPiece(it, round, r.hi, r.lo)], cut: r.wrap ? r.L - (r.lo - r.hi) : r.hi - r.lo };
    const kept = [r.lo > 0 ? [0, r.lo] : null, r.hi < r.L ? [r.hi, r.L] : null].filter((x): x is [number, number] => !!x);
    return { items: kept.map(([s0, s1]) => arcPiece(it, round, s0, s1)), cut: r.hi - r.lo };
  }
  const k = cutOf(it, click, crossingsOf(it, edges));
  if ('error' in k) return k;
  const { pts, c, L, lo, hi } = k;
  // The piece clicked runs over the start: keep the part between the first and last crossings.
  if (k.wrap) return { items: [withPts(it, slice(pts, c, hi, lo))], cut: L - (lo - hi) };
  if (it.closed) return { items: [withPts(it, [...slice(pts, c, hi, L), ...slice(pts, c, 0, lo).slice(1)])], cut: hi - lo };
  const pieces = [lo > 0 ? slice(pts, c, 0, lo) : null, hi < L ? slice(pts, c, hi, L) : null].filter((x): x is Pt[] => !!x);
  return { items: pieces.map((q) => withPts(it, q)), cut: hi - lo };
}

/** The piece a Trim click there would cut away, as an object like the one clicked (its layer, colour, tray or cable),
 * for its shadow before the click; null where Trim would refuse. `crossings`: from crossingsOf. */
export function trimPiece(it: SketchItem, click: Pt, crossings: number[]): Omit<SketchItem, 'id'> | null {
  const round = roundOf(it);
  if (round) { const r = roundCutOf(round, click, crossings); return 'error' in r ? null : arcPiece(it, round, r.lo, r.hi); }
  const k = cutOf(it, click, crossings);
  if ('error' in k) return null;
  const { pts, c, L, lo, hi } = k;
  return withPts(it, k.wrap ? [...slice(pts, c, lo, L), ...slice(pts, c, 0, hi).slice(1)] : slice(pts, c, lo, hi));
}

/** The end of an open path nearer a point: 0 its start, 1 its end. */
const endNear = (pts: Pt[], click: Pt): 0 | 1 => { const c = chain(pts); return along(pts, c, click).s > c[c.length - 1] / 2 ? 1 : 0; };
/** Where an end of an open path runs on to: the first line ahead of it, or null when there is none. */
function reachFrom(pts: Pt[], end: 0 | 1, edges: Edge[]): Pt | null {
  const [a, b] = end ? [pts[pts.length - 2], pts[pts.length - 1]] : [pts[1], pts[0]];
  let best = Infinity;
  for (const e of edges) {
    if (Array.isArray(e)) { const t = meet(a, b, e[0], e[1]); if (t !== null && t > 1 + 1e-6 && t < best) best = t; }
    else for (const t of meetCircle(a, b, e.c, e.r)) if (t > 1 + 1e-6 && t < best && onRound(e, add(a, mul(sub(b, a), t)))) best = t;
  }
  return Number.isFinite(best) ? add(a, mul(sub(b, a), best)) : null;
}

/** Extend: the end nearer the click runs on to the first line ahead of it. */
export function extend(it: SketchItem, click: Pt, edges: Edge[]): Edit & { gain?: number } {
  if (hasArcs(it)) return { error: ARCS };
  if (!isPath(it) || it.closed) return { error: 'Extend works on open lines, polylines, trays and cable routes.' };
  const pts = it.pts.map((q) => [...q] as Pt), end = endNear(pts, click), to = reachFrom(pts, end, edges);
  if (!to) return { error: 'No line ahead of that end to reach.' };
  const k = end ? pts.length - 1 : 0, gain = len(sub(to, pts[k]));
  pts[k] = to;
  return { items: [withPts(it, pts, false)], gain };
}

/** Where both ends of an open path would run on to (its start, its end; null where no line is ahead). Worked out once
 * for the line under the cursor, so the shadow before the click costs little on each move. */
export function reachesOf(it: SketchItem, edges: Edge[]): [Pt | null, Pt | null] {
  return isPath(it) && !it.closed && !hasArcs(it) ? [reachFrom(it.pts, 0, edges), reachFrom(it.pts, 1, edges)] : [null, null];
}

/** The length an Extend click there would add, from the end nearer the click to where it meets the line ahead, for its
 * shadow before the click; null where Extend would refuse. `reaches`: from reachesOf. */
export function extendPiece(it: SketchItem, click: Pt, reaches: [Pt | null, Pt | null]): Seg | null {
  if (!isPath(it) || it.closed || hasArcs(it)) return null;
  const end = endNear(it.pts, click), to = reaches[end];
  return to ? [it.pts[end ? it.pts.length - 1 : 0], to] : null;
}

/** Offset: a copy at a distance, on the side of `side`. A polyline's corners are mitred; a circle or arc grows or
 * shrinks. A tray stays a tray of the same width and route; a cable route's copy is a plain line (no cable). */
export function offset(it: SketchItem, d: number, side: Pt): Edit {
  if (!(d > 0)) return { error: 'Type the offset distance first.' };
  const { id: _id, cable: _cable, ...rest } = it;
  if (it.kind === 'circle' || it.kind === 'arc') {
    const r = (it.r ?? 0) + (len(sub(side, it.pts[0])) < (it.r ?? 0) ? -d : d);
    return r > EPS ? { items: [{ ...rest, r }] } : { error: 'Too far inside: the radius would be nothing.' };
  }
  if (hasArcs(it)) return { error: ARCS };
  if (!isPath(it)) return { error: 'Offset works on lines, polylines, circles, arcs, trays and cable routes.' };
  const pts = pathOf(it), c = chain(pts), n = pts.length - 1;
  const seg = along(pts, c, side).seg;
  const sgn = Math.sign(cross(sub(pts[seg + 1], pts[seg]), sub(side, pts[seg]))) || 1;
  const shifted: Seg[] = [];
  for (let i = 0; i < n; i += 1) {
    const u = unit(sub(pts[i + 1], pts[i])), k = mul([-u[1], u[0]], d * sgn);
    shifted.push([add(pts[i], k), add(pts[i + 1], k)]);
  }
  const corner = (i: number, j: number) => lineMeet(shifted[i][0], shifted[i][1], shifted[j][0], shifted[j][1]) ?? shifted[i][1];
  const out: Pt[] = [];
  if (it.closed && n > 2) { for (let i = 0; i < n; i += 1) out.push(corner((i - 1 + n) % n, i)); }
  else { out.push(shifted[0][0]); for (let i = 1; i < n; i += 1) out.push(corner(i - 1, i)); out.push(shifted[n - 1][1]); }
  return { items: [{ ...rest, pts: out }] };
}

/** Offset Through: the distance from a point to the object, so that its copy passes through the point. */
export function throughDistance(it: SketchItem, p: Pt): number {
  if (it.kind === 'circle' || it.kind === 'arc') return Math.abs(len(sub(p, it.pts[0])) - (it.r ?? 0));
  const pts = pathOf(it);
  return pts.length > 1 ? along(pts, chain(pts), p).off : 0;
}

/** The end segment of a path clicked, the corner X with the other one, and which point of the path moves to it. */
function cornerEnd(it: SketchItem, click: Pt, X: Pt): { idx: number; dir: Pt; keep: number } | { error: string } {
  const pts = it.pts, c = chain(pts), seg = along(pts, c, click).seg;
  const a = pts[seg], b = pts[seg + 1];
  const dir = unit(sub(add(a, mul(sub(b, a), Math.max(0, Math.min(1, dot(sub(click, a), sub(b, a)) / (dot(sub(b, a), sub(b, a)) || 1))))), X));
  // The end on the far side of the corner from the click (or the nearer one when the corner is beyond the line) moves.
  const sa = dot(sub(a, X), dir), sb = dot(sub(b, X), dir);
  const idx = sa < sb ? seg : seg + 1, keep = Math.max(sa, sb);
  if (idx !== 0 && idx !== pts.length - 1) return { error: 'Click the lines near the ends that make the corner.' };
  return { idx, dir, keep };
}

/** Fillet: two lines joined at their corner with a radius (0: a sharp corner). Two trays always meet in a sharp corner
 * (the bend is the fitting's), counted as a bend. */
export function fillet(a: SketchItem, clickA: Pt, b: SketchItem, clickB: Pt, r: number): Edit {
  if (a.id === b.id) return { error: 'Pick two different lines.' };
  return corner(a, clickA, b, clickB, (X, da, db, ang) => {
    const rr = a.tray || b.tray ? 0 : Math.max(0, r);
    const t = rr ? rr / Math.tan(ang / 2) : 0;
    const ta = add(X, mul(da, t)), tb = add(X, mul(db, t));
    if (!rr) return { ta, tb, extra: [] };
    const centre = add(X, mul(unit(add(da, db)), rr / Math.sin(ang / 2)));
    let a0 = Math.atan2(ta[1] - centre[1], ta[0] - centre[0]), a1 = Math.atan2(tb[1] - centre[1], tb[0] - centre[0]);
    const norm = (x: number) => ((x % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    if (norm(a1 - a0) > Math.PI) [a0, a1] = [a1, a0];
    return { ta, tb, extra: [{ kind: 'arc' as const, layer: a.layer, pts: [centre], r: rr, a0, a1 }], need: t };
  }, a.tray || b.tray ? 'Trays meet in a sharp corner; the bend is counted as a fitting.' : undefined);
}

/** Chamfer: the corner of two lines cut at a distance along each. */
export function chamfer(a: SketchItem, clickA: Pt, b: SketchItem, clickB: Pt, d1: number, d2: number): Edit {
  if (a.id === b.id) return { error: 'Pick two different lines.' };
  if (a.tray || b.tray) return { error: 'A tray turns with Fillet (a bend), not Chamfer.' };
  return corner(a, clickA, b, clickB, (X, da, db) => {
    const ta = add(X, mul(da, Math.max(0, d1))), tb = add(X, mul(db, Math.max(0, d2)));
    return { ta, tb, extra: d1 > 0 || d2 > 0 ? [{ kind: 'line' as const, layer: a.layer, pts: [ta, tb] }] : [], need: Math.max(d1, d2) };
  });
}

function corner(a: SketchItem, clickA: Pt, b: SketchItem, clickB: Pt,
  make: (X: Pt, da: Pt, db: Pt, ang: number) => { ta: Pt; tb: Pt; extra: Omit<SketchItem, 'id'>[]; need?: number }, note?: string): Edit {
  if (hasArcs(a) || hasArcs(b)) return { error: ARCS };
  if (!isPath(a) || !isPath(b) || a.closed || b.closed) return { error: 'Pick two open lines, polylines, trays or cable routes.' };
  const sa = a.pts, sb = b.pts;
  const ia = along(sa, chain(sa), clickA).seg, ib = along(sb, chain(sb), clickB).seg;
  const X = lineMeet(sa[ia], sa[ia + 1], sb[ib], sb[ib + 1]);
  if (!X) return { error: 'The two lines are parallel: they make no corner.' };
  const ea = cornerEnd(a, clickA, X), eb = cornerEnd(b, clickB, X);
  if ('error' in ea) return ea;
  if ('error' in eb) return eb;
  const ang = Math.acos(Math.max(-1, Math.min(1, dot(ea.dir, eb.dir))));
  if (ang < 1e-6 || Math.PI - ang < 1e-6) return { error: 'The two lines are in line: they make no corner.' };
  const m = make(X, ea.dir, eb.dir, ang);
  if ((m.need ?? 0) > Math.min(ea.keep, eb.keep) + EPS) return { error: 'Too large for these lines: make it smaller.' };
  const pa = sa.map((q) => [...q] as Pt), pb = sb.map((q) => [...q] as Pt);
  pa[ea.idx] = m.ta; pb[eb.idx] = m.tb;
  return { items: [withPts(a, pa), withPts(b, pb), ...m.extra], ...(note ? { note } : {}) };
}

/** Break: split a path at a point (both parts kept), or take out the part between two points. A closed shape opens. */
export function breakAt(it: SketchItem, p1: Pt, p2?: Pt): Edit {
  if (hasArcs(it)) return { error: ARCS };
  if (!isPath(it)) return { error: 'Break works on lines, polylines, trays and cable routes.' };
  const pts = pathOf(it), c = chain(pts), L = c[c.length - 1];
  const s1 = along(pts, c, p1).s, s2 = p2 ? along(pts, c, p2).s : s1;
  const [lo, hi] = [Math.min(s1, s2), Math.max(s1, s2)];
  if (it.closed) {
    if (hi - lo < EPS) return { items: [withPts(it, [...slice(pts, c, lo, L), ...slice(pts, c, 0, lo).slice(1)])] };
    return { items: [withPts(it, [...slice(pts, c, hi, L), ...slice(pts, c, 0, lo).slice(1)])] };
  }
  if (lo < EPS && hi > L - EPS) return { error: 'That takes out the whole line: Erase it instead.' };
  const pieces = [lo > EPS ? slice(pts, c, 0, lo) : null, hi < L - EPS ? slice(pts, c, hi, L) : null].filter((x): x is Pt[] => !!x);
  if (pieces.length === 1 && hi - lo < EPS) return { error: 'Break it away from its ends.' };
  return { items: pieces.map((q) => withPts(it, q)) };
}

/** Join: open lines and polylines meeting end to end (within `tol`) become one, with the first one's layer, tray or
 * cable; it closes when its ends meet. */
export function join(items: SketchItem[], tol: number): Edit & { joined?: string[] } {
  if (items.some(hasArcs)) return { error: ARCS };
  const paths = items.filter((it) => isPath(it) && !it.closed);
  if (paths.length < 2) return { error: 'Pick two or more open lines or polylines that meet end to end.' };
  const first = paths[0];
  if (paths.some((it) => !!it.tray !== !!first.tray || (it.tray && it.tray.widthMm !== first.tray!.widthMm))) return { error: 'Join trays of one width, or lines with lines.' };
  if (paths.some((it) => it.cable && first.cable && it.cable.feederId !== first.cable.feederId)) return { error: 'These are routes of different cables.' };
  let pts = first.pts.map((q) => [...q] as Pt);
  const left = paths.slice(1), joined = [first.id];
  const near = (p: Pt, q: Pt) => len(sub(p, q)) <= tol;
  for (let found = true; found && left.length;) {
    found = false;
    for (let i = 0; i < left.length; i += 1) {
      const q = left[i].pts, head = pts[0], tail = pts[pts.length - 1];
      if (near(tail, q[0])) pts = [...pts, ...q.slice(1)];
      else if (near(tail, q[q.length - 1])) pts = [...pts, ...[...q].reverse().slice(1)];
      else if (near(head, q[q.length - 1])) pts = [...q.slice(0, -1), ...pts];
      else if (near(head, q[0])) pts = [...[...q].reverse().slice(0, -1), ...pts];
      else continue;
      joined.push(left[i].id); left.splice(i, 1); found = true; break;
    }
  }
  if (joined.length < 2) return { error: 'None of them meet end to end.' };
  const closed = pts.length > 3 && near(pts[0], pts[pts.length - 1]);
  if (closed) pts = pts.slice(0, -1);
  return { items: [{ ...withPts(first, pts, closed), kind: 'pline' }], joined };
}

/** Explode: a polyline (or rectangle) into its lines. A tray's lines stay trays; a cable route stays one route. */
export function explode(it: SketchItem, defs: CadBlockDef[] = []): Edit {
  // An insert: the objects its block shows, as drawn objects of their own.
  if (it.kind === 'insert') { const items = explodeInsert(it, defs); return items.length ? { items } : { error: `The drawing has no block "${it.block ?? ''}" to explode.` }; }
  if (it.cloud) return { error: 'A revision cloud stays one object: erase it and draw it again to change it.' };
  // A multileader: its lines, and its words as one note.
  if (it.kind === 'mleader') {
    const { id: _id, note: _n, ml: _m, w: _w, h: _h, pts: _p, kind: _k, ...base } = it, n = mleaderNote(it);
    return { items: [...mleaderSegments(it).map(([a, b]): Omit<SketchItem, 'id'> => ({ ...base, kind: 'line', pts: [a, b] })), ...(n ? [(({ id: _i, ...rest }) => rest)(n)] : [])] };
  }
  // A note: one single-line text per line.
  if (it.kind === 'mtext') { const items = explodeNote(it); return items.length ? { items } : { error: 'The note has no words to explode.' }; }
  if (it.kind !== 'pline' && !(it.kind === 'line' && it.pts.length > 2)) return { error: 'Explode works on polylines and rectangles.' };
  if (it.cable) return { error: 'A cable route stays one line: Break it instead.' };
  const pts = pathOf(it);
  // Arc segments become arcs (centre, radius, angles anticlockwise), the straight ones lines.
  if (hasArcs(it)) return { items: pts.slice(1).map((q, i): Omit<SketchItem, 'id'> => {
    const k = it.bulges?.[i] ?? 0, { pts: _p, ...rest } = withPts(it, [pts[i], q]);
    if (Math.abs(k) <= 1e-12) return { ...rest, pts: [pts[i], q], kind: it.tray ? 'pline' : 'line' };
    const a = bulgeArc(pts[i], q, k);
    return { ...rest, kind: 'arc', pts: [a.c], r: a.r, a0: a.a0, a1: a.a1 };
  }) };
  return { items: pts.slice(1).map((q, i) => ({ ...withPts(it, [pts[i], q]), kind: it.tray ? 'pline' as const : 'line' as const })) };
}

const reflect = (p: Pt, a: Pt, b: Pt): Pt => { const u = unit(sub(b, a)), v = sub(p, a), k = dot(v, u); return sub(mul(add(a, mul(u, k)), 2), p); };
/** Mirror about the line a → b. Texts stay readable (only their place is mirrored). */
export function mirrored(it: SketchItem, a: Pt, b: Pt): Omit<SketchItem, 'id'> {
  const { id: _id, ...rest } = it;
  const pts = it.pts.map((q) => reflect(q, a, b));
  // A polyline's arcs bulge to the other side once mirrored.
  if (it.bulges) rest.bulges = it.bulges.map((k) => -k || 0);
  // A hatch: its islands and the pattern's origin are mirrored; the pattern's angle stays.
  if (it.hatch) return { ...rest, pts, ...(it.holes ? { holes: it.holes.map((h) => h.map((q) => reflect(q, a, b))) } : {}), hatch: { ...it.hatch, origin: reflect(it.hatch.origin ?? [0, 0], a, b) } };
  if (it.kind === 'arc') { const th = Math.atan2(b[1] - a[1], b[0] - a[0]); return { ...rest, pts, a0: 2 * th - (it.a1 ?? 0), a1: 2 * th - (it.a0 ?? 0) }; }
  // An ellipse's axis is a direction: mirrored as one.
  if (it.kind === 'ellipse' && it.ax) return { ...rest, pts, ax: sub(reflect(add(it.pts[0], it.ax), a, b), pts[0]) };
  // A linear dimension's line is a direction too, and so is a dimension's turned text (kept reading from the bottom or
  // the right); an insert turns to face the mirror (its block is not flipped).
  if (it.kind === 'dim' && it.rot !== undefined) { let r = 2 * Math.atan2(b[1] - a[1], b[0] - a[0]) - it.rot; while (r > Math.PI / 2) r -= Math.PI; while (r <= -Math.PI / 2) r += Math.PI; rest.rot = r; }
  if (it.kind === 'dim' && it.dir !== undefined) { const th = Math.atan2(b[1] - a[1], b[0] - a[0]); return { ...rest, pts, dir: 2 * th - it.dir }; }
  if (it.kind === 'insert') { const th = Math.atan2(b[1] - a[1], b[0] - a[0]); return { ...rest, pts, rot: 2 * th - (it.rot ?? 0) }; }
  return { ...rest, pts };
}
/** Scale about a base point by a factor (radii and text heights too). */
export function scaled(it: SketchItem, base: Pt, k: number): SketchItem {
  const sc = (q: Pt): Pt => add(base, mul(sub(q, base), k));
  return {
    ...it, ...(it.holes ? { holes: it.holes.map((h) => h.map(sc)) } : {}), ...(it.hatch ? { hatch: { ...it.hatch, scale: it.hatch.scale * k, origin: sc(it.hatch.origin ?? [0, 0]) } } : {}), pts: it.pts.map((q) => add(base, mul(sub(q, base), k))), ...(it.r !== undefined ? { r: it.r * k } : {}), ...(it.h !== undefined ? { h: it.h * k } : {}), ...(it.w !== undefined ? { w: it.w * k } : {}), ...(it.kind === 'insert' ? { sc: (it.sc ?? 1) * k } : {}),
    ...(it.ml ? { ml: { ...it.ml, size: it.ml.size * k, land: it.ml.land * k, gap: it.ml.gap * k } } : {}),
    ...(it.ax ? { ax: mul(it.ax, k) } : {}), ...(it.cloud !== undefined ? { cloud: it.cloud * k } : {}),
    ...(it.look ? { look: scaleLook(it.look, k) } : {}), ...(it.brk ? { brk: it.brk.map(([e, t]): [0 | 1 | 2, number] => [e, t * k]) } : {})
  };
}
/** Align: the turn (radians), scale and move that take s1 to d1 and the direction s1→s2 to d1→d2 (one pair: a move); null when the two source points, or the two destination points, are the same. */
export function alignOf(s1: Pt, d1: Pt, s2?: Pt, d2?: Pt, scale = false): { a: number; k: number; dx: number; dy: number } | null {
  const [dx, dy] = [d1[0] - s1[0], d1[1] - s1[1]];
  if (!s2 || !d2) return { a: 0, k: 1, dx, dy };
  const [sx, sy, tx, ty] = [s2[0] - s1[0], s2[1] - s1[1], d2[0] - d1[0], d2[1] - d1[1]];
  const sl = Math.hypot(sx, sy), tl = Math.hypot(tx, ty);
  if (sl < 1e-12 || tl < 1e-12) return null;
  return { a: Math.atan2(ty, tx) - Math.atan2(sy, sx), k: scale ? tl / sl : 1, dx, dy };
}
/** The item turned and scaled about s1, then moved by (dx, dy). */
export function aligned(it: SketchItem, s1: Pt, t: { a: number; k: number; dx: number; dy: number }): SketchItem {
  const turned = t.a ? rotated(it, s1, t.a) : it;
  return moved(t.k !== 1 ? scaled(turned, s1, t.k) : turned, t.dx, t.dy);
}
/** Objects Stretch moves whole when one of their points is in the window. */
const STRETCH_WHOLE: SketchItem['kind'][] = ['circle', 'arc', 'text', 'mtext', 'point', 'insert', 'attdef'];
const inWindowOf = (a: Pt, b: Pt) => {
  const [x0, y0, x1, y1] = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])];
  return (q: Pt) => q[0] >= x0 && q[0] <= x1 && q[1] >= y0 && q[1] <= y1;
};
/** Stretch: the points inside the window move by (dx, dy); a circle, arc or text moves when its point is inside. */
export function stretched(it: SketchItem, a: Pt, b: Pt, dx: number, dy: number): SketchItem | null {
  const inBox = inWindowOf(a, b);
  if (!it.pts.some(inBox)) return null;
  const holes = it.holes ? { holes: it.holes.map((h) => h.map((q) => (inBox(q) ? add(q, [dx, dy]) : q))) } : {};
  if (STRETCH_WHOLE.includes(it.kind)) return { ...it, ...holes, pts: it.pts.map((q) => add(q, [dx, dy])) };
  return { ...it, ...holes, pts: it.pts.map((q) => (inBox(q) ? add(q, [dx, dy]) : q)) };
}
/** The points of an object a Stretch window moves, for the squares shown once the window is dragged: all of them for a
 * circle, text, block…, else those inside it (an island's too); none when no point of its outline is inside. */
export function stretchPoints(it: SketchItem, a: Pt, b: Pt): Pt[] {
  const inBox = inWindowOf(a, b);
  if (!it.pts.some(inBox)) return [];
  return [...(STRETCH_WHOLE.includes(it.kind) ? it.pts : it.pts.filter(inBox)), ...(it.holes ?? []).flat().filter(inBox)];
}
/** Rectangular array: rows × columns of copies, `dx` / `dy` apart (the original is the first). */
export function arrayRect(it: SketchItem, rows: number, cols: number, dx: number, dy: number): Omit<SketchItem, 'id'>[] {
  const { id: _id, ...rest } = it, out: Omit<SketchItem, 'id'>[] = [];
  for (let r = 0; r < Math.max(1, Math.round(rows)); r += 1) for (let c = 0; c < Math.max(1, Math.round(cols)); c += 1) {
    if (r || c) out.push({ ...rest, pts: it.pts.map((q) => [q[0] + c * dx, q[1] + r * dy] as Pt) });
  }
  return out;
}
/** Polar array: `n` in all (the original first) over `angleDeg` about a centre; a full circle shares it out evenly.
 * With `rotate` off each copy keeps the original's direction: it moves to where its first point turns to. */
export function arrayPolar(it: SketchItem, centre: Pt, n: number, angleDeg: number, rotate = true): Omit<SketchItem, 'id'>[] {
  const count = Math.max(1, Math.round(n)), full = Math.abs(Math.abs(angleDeg) - 360) < 1e-9;
  const step = ((angleDeg * Math.PI) / 180) / (full ? count : Math.max(1, count - 1));
  return Array.from({ length: count - 1 }, (_, i) => {
    const { id: _id, ...r } = rotated(it, centre, step * (i + 1));
    if (rotate) return r;
    const d = sub(r.pts[0], it.pts[0]), { id: _i, ...rest } = it;
    return { ...rest, pts: it.pts.map((q) => add(q, d)) };
  });
}

export type Grip = { at: Pt; kind: 'point' | 'mid' | 'radius' | 'width' | 'end'; along?: Pt };
/** Grips of a drawn item: its points (ends and corners, a centre, a text's place) and each segment's middle (with the
 * direction of its side in `along`); a circle's centre and four quadrants; an arc's centre, ends and middle. */
export function gripsOf(it: SketchItem): Grip[] {
  if (it.infinite) return it.pts.slice(0, 2).map((at) => ({ at, kind: 'point' as const }));
  if (isPath(it)) {
    const pts = pathOf(it);
    return [...it.pts.map((at) => ({ at, kind: 'point' as const })), ...pts.slice(1).map((q, i) => ({ at: it.bulges?.[i] ? arcMid(pts[i], q, it.bulges[i]) : mul(add(pts[i], q), 0.5), kind: 'mid' as const, along: unit(sub(q, pts[i])) }))];
  }
  if (it.kind === 'circle') { const c = it.pts[0], r = it.r ?? 0; return [{ at: c, kind: 'point' }, ...([[1, 0], [0, 1], [-1, 0], [0, -1]] as Pt[]).map((u) => ({ at: add(c, mul(u, r)), kind: 'radius' as const }))]; }
  if (it.kind === 'arc') {
    // Drawn anticlockwise from a0 through a sweep in (0, 2π] (as segmentsOf steps it).
    const c = it.pts[0], r = it.r ?? 0, a0 = it.a0 ?? 0;
    let s = (it.a1 ?? 0) - a0;
    while (s <= 0) s += 2 * Math.PI;
    const on = (a: number): Pt => [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)];
    return [{ at: c, kind: 'point' }, { at: on(a0), kind: 'end' }, { at: on(a0 + s), kind: 'end' }, { at: on(a0 + s / 2), kind: 'radius' }];
  }
  // A note: its anchor, and the width handle at the right end of its top edge.
  if (it.kind === 'mtext') return [{ at: it.pts[0], kind: 'point' }, { at: noteCorners(it)[1], kind: 'width' }];
  // An ellipse: its centre, then both ends of its major axis and of its minor axis.
  if (it.kind === 'ellipse' && it.ax) { const k = it.ratio ?? 1, c = it.pts[0], mn: Pt = [-it.ax[1] * k, it.ax[0] * k]; return [{ at: c, kind: 'point' }, { at: add(c, it.ax), kind: 'radius' }, { at: add(c, mn), kind: 'radius' }, { at: sub(c, it.ax), kind: 'radius' }, { at: sub(c, mn), kind: 'radius' }]; }
  return it.pts.map((at) => ({ at, kind: 'point' as const }));
}
/** The item with grip `i` dragged to `to`: a point moves; a middle moves its segment; a circle's radius grip sizes it;
 * the centre of a circle or arc, or a text's place, moves it all. */
export function gripMoved(it: SketchItem, i: number, to: Pt): SketchItem {
  const g = gripsOf(it)[i];
  if (!g) return it;
  const d = sub(to, g.at);
  if (it.infinite) return { ...it, pts: it.pts.map((q, k) => (k === i ? to : q)) };
  if (it.kind === 'ellipse' && it.ax && g.kind === 'radius') {
    // The major axis's grip turns and sizes it (the minor keeps its length); the minor's sizes the minor.
    const a = len(it.ax), b = a * (it.ratio ?? 1), v = i === 3 ? sub(it.pts[0], to) : sub(to, it.pts[0]);
    if (i === 1 || i === 3) { const na = Math.max(EPS, len(v)); return na >= b ? { ...it, ax: v, ratio: b / na } : { ...it, ax: mul([-v[1], v[0]], b / na), ratio: na / b }; }
    const nb = Math.max(EPS, Math.abs((v[0] * -it.ax[1] + v[1] * it.ax[0]) / a));
    return nb <= a ? { ...it, ratio: nb / a } : { ...it, ax: mul([-it.ax[1], it.ax[0]], nb / a), ratio: a / nb };
  }
  // An arc's end grip turns that end about the centre (the radius is kept).
  if (it.kind === 'arc' && g.kind === 'end') { const a = Math.atan2(to[1] - it.pts[0][1], to[0] - it.pts[0][0]); return i === 1 ? { ...it, a0: a } : { ...it, a1: a }; }
  if (g.kind === 'radius') return { ...it, r: Math.max(EPS, len(sub(to, it.pts[0]))) };
  // A note's width handle: the box as wide as the handle's distance along the top edge from the left.
  if (g.kind === 'width') { const b = noteBox(it), v = sub(to, b.tl); return noteWithWidth(it, dot(v, b.u)); }
  // A revision cloud's corner moves alone (the cloud follows its outline).
  if (it.cloud && g.kind === 'point') return { ...it, pts: it.pts.map((q, k) => (k === i ? to : q)) };
  if (!isPath(it)) return it.kind === 'dim' || it.kind === 'mleader' ? { ...it, pts: it.pts.map((q, k) => (k === i ? to : q)) } : { ...it, pts: it.pts.map((q) => add(q, d)) };
  if (g.kind === 'point') return { ...it, pts: it.pts.map((q, k) => (k === i ? to : q)) };
  const s = i - it.pts.length, n = it.pts.length;
  return { ...it, pts: it.pts.map((q, k) => (k === s || k === (s + 1) % n ? add(q, d) : q)) };
}

/** Drawn items in a window: wholly inside it, or (`crossing`) also those it touches. */
export function sketchInWindow(items: SketchItem[], a: Pt, b: Pt, crossing: boolean, defs: CadBlockDef[] = []): SketchItem[] {
  const [x0, y0, x1, y1] = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])];
  const inBox = (q: Pt) => q[0] >= x0 && q[0] <= x1 && q[1] >= y0 && q[1] <= y1;
  const sides: Seg[] = [[[x0, y0], [x1, y0]], [[x1, y0], [x1, y1]], [[x1, y1], [x0, y1]], [[x0, y1], [x0, y0]]];
  return items.filter((it) => {
    if (it.infinite) return crossing && !!constructionSegment(it, [x0, y0, x1, y1]);
    const segs = segmentsOf(it, 0.001, defs), pts = segs.length ? [...segs.flat(), ...(it.kind === 'mleader' ? noteCornersOf(it) : [])] : it.kind === 'mtext' ? noteCorners(it) : it.pts;
    if (pts.every(inBox)) return true;
    if (!crossing) return false;
    return pts.some(inBox) || segs.some(([p, q]) => sides.some(([c, d]) => { const t = meet(p, q, c, d); return t !== null && t >= 0 && t <= 1; }));
  });
}

const noteCornersOf = (it: SketchItem): Pt[] => { const n = mleaderNote(it); return n ? noteCorners(n) : []; };
/** The length of a path (drawing units). */
export const pathLength = (it: SketchItem) => { const c = chain(pathOf(it)); return c[c.length - 1] ?? 0; };
