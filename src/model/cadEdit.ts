import { rotated, scaleLook, segmentsOf } from './cadSketch';
import type { SketchItem } from '../types';
import { explodeNote, noteBox, noteCorners, noteWithWidth } from './cadMtext';

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
export const isPath = (it: Pick<SketchItem, 'kind' | 'cloud'>) => (it.kind === 'line' || it.kind === 'pline') && !it.cloud;
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
  const { id: _id, closed: _c, ...rest } = it;
  return { ...rest, kind: it.kind === 'pline' || pts.length > 2 ? 'pline' : 'line', pts, ...(closed ? { closed: true } : {}) };
};
const box = (pts: Pt[]) => pts.reduce(([x0, y0, x1, y1], q) => [Math.min(x0, q[0]), Math.min(y0, q[1]), Math.max(x1, q[0]), Math.max(y1, q[1])], [Infinity, Infinity, -Infinity, -Infinity]);

/** The other lines an item can be cut at or extended to: the drawn items' pieces and the architect's lines. */
export const edgesFor = (items: SketchItem[], except: string, drawing: Seg[]): Seg[] => [...items.filter((x) => x.id !== except).flatMap((x) => segmentsOf(x)), ...drawing];

/** Trim: the part of the path clicked, between the nearest crossings on either side of the click, is cut away. */
export function trim(it: SketchItem, click: Pt, edges: Seg[]): Edit & { cut?: number } {
  if (!isPath(it)) return { error: 'Trim works on lines, polylines, trays and cable routes.' };
  const pts = pathOf(it), c = chain(pts), L = c[c.length - 1];
  const [x0, y0, x1, y1] = box(pts);
  const cuts: number[] = [];
  for (const [p, q] of edges) {
    if (Math.max(p[0], q[0]) < x0 - EPS || Math.min(p[0], q[0]) > x1 + EPS || Math.max(p[1], q[1]) < y0 - EPS || Math.min(p[1], q[1]) > y1 + EPS) continue;
    for (let i = 0; i + 1 < pts.length; i += 1) {
      const t = meet(pts[i], pts[i + 1], p, q);
      if (t === null || t < -1e-9 || t > 1 + 1e-9) continue;
      const s = c[i] + t * (c[i + 1] - c[i]);
      if (s > L * 1e-6 && s < L * (1 - 1e-6)) cuts.push(s);
    }
  }
  const at = along(pts, c, click).s;
  const sorted = cuts.sort((a, b) => a - b).filter((s, i, x) => !i || s - x[i - 1] > L * 1e-9);
  if (!sorted.length) return { error: 'Nothing crosses it there to cut at: Erase it instead.' };
  if (it.closed) {
    if (sorted.length < 2) return { error: 'A closed shape needs two crossings to cut a piece out.' };
    const lo = [...sorted].reverse().find((s) => s < at), hi = sorted.find((s) => s > at);
    // The piece clicked runs over the start: keep the part between the first and last crossings.
    if (lo === undefined || hi === undefined) return { items: [withPts(it, slice(pts, c, sorted[0], sorted[sorted.length - 1]))], cut: L - (sorted[sorted.length - 1] - sorted[0]) };
    const keep = [...slice(pts, c, hi, L), ...slice(pts, c, 0, lo).slice(1)];
    return { items: [withPts(it, keep)], cut: hi - lo };
  }
  const lo = [0, ...sorted].filter((s) => s < at).pop()!, hi = [...sorted, L].find((s) => s > at)!;
  const pieces = [lo > 0 ? slice(pts, c, 0, lo) : null, hi < L ? slice(pts, c, hi, L) : null].filter((x): x is Pt[] => !!x);
  return { items: pieces.map((q) => withPts(it, q)), cut: hi - lo };
}

/** Extend: the end nearer the click runs on to the first line ahead of it. */
export function extend(it: SketchItem, click: Pt, edges: Seg[]): Edit & { gain?: number } {
  if (!isPath(it) || it.closed) return { error: 'Extend works on open lines, polylines, trays and cable routes.' };
  const pts = it.pts.map((q) => [...q] as Pt), c = chain(pts), L = c[c.length - 1];
  const atEnd = along(pts, c, click).s > L / 2;
  const [a, b] = atEnd ? [pts[pts.length - 2], pts[pts.length - 1]] : [pts[1], pts[0]];
  let best = Infinity;
  for (const [p, q] of edges) { const t = meet(a, b, p, q); if (t !== null && t > 1 + 1e-6 && t < best) best = t; }
  if (!Number.isFinite(best)) return { error: 'No line ahead of that end to reach.' };
  const to = add(a, mul(sub(b, a), best)), gain = len(sub(to, b));
  if (atEnd) pts[pts.length - 1] = to; else pts[0] = to;
  return { items: [withPts(it, pts, false)], gain };
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
export function explode(it: SketchItem): Edit {
  if (it.cloud) return { error: 'A revision cloud stays one object: erase it and draw it again to change it.' };
  // A note: one single-line text per line.
  if (it.kind === 'mtext') { const items = explodeNote(it); return items.length ? { items } : { error: 'The note has no words to explode.' }; }
  if (it.kind !== 'pline' && !(it.kind === 'line' && it.pts.length > 2)) return { error: 'Explode works on polylines and rectangles.' };
  if (it.cable) return { error: 'A cable route stays one line: Break it instead.' };
  const pts = pathOf(it);
  return { items: pts.slice(1).map((q, i) => ({ ...withPts(it, [pts[i], q]), kind: it.tray ? 'pline' as const : 'line' as const })) };
}

const reflect = (p: Pt, a: Pt, b: Pt): Pt => { const u = unit(sub(b, a)), v = sub(p, a), k = dot(v, u); return sub(mul(add(a, mul(u, k)), 2), p); };
/** Mirror about the line a → b. Texts stay readable (only their place is mirrored). */
export function mirrored(it: SketchItem, a: Pt, b: Pt): Omit<SketchItem, 'id'> {
  const { id: _id, ...rest } = it;
  const pts = it.pts.map((q) => reflect(q, a, b));
  if (it.kind === 'arc') { const th = Math.atan2(b[1] - a[1], b[0] - a[0]); return { ...rest, pts, a0: 2 * th - (it.a1 ?? 0), a1: 2 * th - (it.a0 ?? 0) }; }
  // An ellipse's axis is a direction: mirrored as one.
  if (it.kind === 'ellipse' && it.ax) return { ...rest, pts, ax: sub(reflect(add(it.pts[0], it.ax), a, b), pts[0]) };
  // A linear dimension's line is a direction too.
  if (it.kind === 'dim' && it.dir !== undefined) { const th = Math.atan2(b[1] - a[1], b[0] - a[0]); return { ...rest, pts, dir: 2 * th - it.dir }; }
  return { ...rest, pts };
}
/** Scale about a base point by a factor (radii and text heights too). */
export function scaled(it: SketchItem, base: Pt, k: number): SketchItem {
  return {
    ...it, pts: it.pts.map((q) => add(base, mul(sub(q, base), k))), ...(it.r !== undefined ? { r: it.r * k } : {}), ...(it.h !== undefined ? { h: it.h * k } : {}), ...(it.w !== undefined ? { w: it.w * k } : {}),
    ...(it.ax ? { ax: mul(it.ax, k) } : {}), ...(it.cloud !== undefined ? { cloud: it.cloud * k } : {}),
    ...(it.look ? { look: scaleLook(it.look, k) } : {})
  };
}
/** Stretch: the points inside the window move by (dx, dy); a circle, arc or text moves when its point is inside. */
export function stretched(it: SketchItem, a: Pt, b: Pt, dx: number, dy: number): SketchItem | null {
  const [x0, y0, x1, y1] = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])];
  const inBox = (q: Pt) => q[0] >= x0 && q[0] <= x1 && q[1] >= y0 && q[1] <= y1;
  if (!it.pts.some(inBox)) return null;
  if (it.kind === 'circle' || it.kind === 'arc' || it.kind === 'text' || it.kind === 'mtext' || it.kind === 'point') return { ...it, pts: it.pts.map((q) => add(q, [dx, dy])) };
  return { ...it, pts: it.pts.map((q) => (inBox(q) ? add(q, [dx, dy]) : q)) };
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

/** Grips of a drawn item: its points (ends and corners, a centre, a text's place) and each segment's middle. */
export function gripsOf(it: SketchItem): { at: Pt; kind: 'point' | 'mid' | 'radius' | 'width' }[] {
  if (isPath(it)) {
    const pts = pathOf(it);
    return [...it.pts.map((at) => ({ at, kind: 'point' as const })), ...pts.slice(1).map((q, i) => ({ at: mul(add(pts[i], q), 0.5), kind: 'mid' as const }))];
  }
  if (it.kind === 'circle') return [{ at: it.pts[0], kind: 'point' }, { at: add(it.pts[0], [it.r ?? 0, 0]), kind: 'radius' }];
  // A note: its anchor, and the width handle at the right end of its top edge.
  if (it.kind === 'mtext') return [{ at: it.pts[0], kind: 'point' }, { at: noteCorners(it)[1], kind: 'width' }];
  // An ellipse: its centre, the end of its major axis and of its minor axis.
  if (it.kind === 'ellipse' && it.ax) { const k = it.ratio ?? 1; return [{ at: it.pts[0], kind: 'point' }, { at: add(it.pts[0], it.ax), kind: 'radius' }, { at: add(it.pts[0], [-it.ax[1] * k, it.ax[0] * k]), kind: 'radius' }]; }
  return it.pts.map((at) => ({ at, kind: 'point' as const }));
}
/** The item with grip `i` dragged to `to`: a point moves; a middle moves its segment; a circle's radius grip sizes it;
 * the centre of a circle or arc, or a text's place, moves it all. */
export function gripMoved(it: SketchItem, i: number, to: Pt): SketchItem {
  const g = gripsOf(it)[i];
  if (!g) return it;
  const d = sub(to, g.at);
  if (it.kind === 'ellipse' && it.ax && g.kind === 'radius') {
    // The major axis's grip turns and sizes it (the minor keeps its length); the minor's sizes the minor.
    const a = len(it.ax), b = a * (it.ratio ?? 1), v = sub(to, it.pts[0]);
    if (i === 1) { const na = Math.max(EPS, len(v)); return na >= b ? { ...it, ax: v, ratio: b / na } : { ...it, ax: mul([-v[1], v[0]], b / na), ratio: na / b }; }
    const nb = Math.max(EPS, Math.abs((v[0] * -it.ax[1] + v[1] * it.ax[0]) / a));
    return nb <= a ? { ...it, ratio: nb / a } : { ...it, ax: mul([-it.ax[1], it.ax[0]], nb / a), ratio: a / nb };
  }
  if (g.kind === 'radius') return { ...it, r: Math.max(EPS, len(sub(to, it.pts[0]))) };
  // A note's width handle: the box as wide as the handle's distance along the top edge from the left.
  if (g.kind === 'width') { const b = noteBox(it), v = sub(to, b.tl); return noteWithWidth(it, dot(v, b.u)); }
  // A revision cloud's corner moves alone (the cloud follows its outline).
  if (it.cloud && g.kind === 'point') return { ...it, pts: it.pts.map((q, k) => (k === i ? to : q)) };
  if (!isPath(it)) return it.kind === 'dim' ? { ...it, pts: it.pts.map((q, k) => (k === i ? to : q)) } : { ...it, pts: it.pts.map((q) => add(q, d)) };
  if (g.kind === 'point') return { ...it, pts: it.pts.map((q, k) => (k === i ? to : q)) };
  const s = i - it.pts.length, n = it.pts.length;
  return { ...it, pts: it.pts.map((q, k) => (k === s || k === (s + 1) % n ? add(q, d) : q)) };
}

/** Drawn items in a window: wholly inside it, or (`crossing`) also those it touches. */
export function sketchInWindow(items: SketchItem[], a: Pt, b: Pt, crossing: boolean): SketchItem[] {
  const [x0, y0, x1, y1] = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])];
  const inBox = (q: Pt) => q[0] >= x0 && q[0] <= x1 && q[1] >= y0 && q[1] <= y1;
  const sides: Seg[] = [[[x0, y0], [x1, y0]], [[x1, y0], [x1, y1]], [[x1, y1], [x0, y1]], [[x0, y1], [x0, y0]]];
  return items.filter((it) => {
    const segs = segmentsOf(it), pts = segs.length ? segs.flat() : it.kind === 'mtext' ? noteCorners(it) : it.pts;
    if (pts.every(inBox)) return true;
    if (!crossing) return false;
    return pts.some(inBox) || segs.some(([p, q]) => sides.some(([c, d]) => { const t = meet(p, q, c, d); return t !== null && t >= 0 && t <= 1; }));
  });
}

/** The length of a path (drawing units). */
export const pathLength = (it: SketchItem) => { const c = chain(pathOf(it)); return c[c.length - 1] ?? 0; };
