import type { SketchItem } from '../types';
import { HATCH_START, type HatchPattern } from './cadAnnotate';
import type { LinetypeId } from './cadLayerStyle';
import type { Edit } from './cadEdit';
import { ellipsePoints } from './cadSketch';

/** Design CAD → CROP: a true crop of a block (or of drawn items), not a clip. The block's geometry is cut along a closed
 * boundary (rectangle, polygon, circle, or a closed polyline with arcs); what is inside stays as real geometry (sketch
 * items on the layers it draws on), the rest is gone. Outside keeps what is outside instead (a cut-out).
 *
 * Exact: a cut line stays a line, a cut arc or circle becomes arcs, straight polyline runs stay polylines (their arc
 * segments become arcs, as a sketch polyline has no bulges). The boundary's edges may be lines or arcs, it may be
 * concave, and it may run either way round. Texts and attributes stay when their insertion point is inside (as XCLIP
 * shows them); hatches, 2D solids and dimensions when wholly inside (a crossing hatch is not cut: see
 * docs/notes/Future development/). Points on the boundary count as inside; pieces shorter than the tolerance (about
 * 1e-9 × the extents) are dropped. Pure: no React. */

type P2 = [number, number];
type V3 = [number, number, number];

/** The style of an exploded piece: its layer, and its colour (0xRRGGBB, or 0xFF000007 for the foreground) and linetype
 * where they differ from its layer's. */
export interface PieceStyle { layer: string; color?: number; lt?: string }
/** One piece of an exploded drawing object, in world coordinates (engines/cad-reader/src/doc/explode.rs). Arcs run
 * anticlockwise a0 → a1 (radians); polyline vertices are [x, y, bulge]. */
export type CadPiece = PieceStyle & (
  | { kind: 'line'; a: P2; b: P2 }
  | { kind: 'arc'; c: P2; r: number; a0: number; a1: number }
  | { kind: 'circle'; c: P2; r: number }
  | { kind: 'pline'; pts: V3[]; closed: boolean }
  | { kind: 'text'; at: P2; h: number; rot: number; text: string; tag?: string }
  | { kind: 'hatch'; loops: V3[][]; solid: boolean; pattern: string }
  | { kind: 'solid'; pts: P2[] }
  | { kind: 'point'; at: P2 }
  | { kind: 'group'; items: CadPiece[] });

/** A crop outline: corners (a polygon), a circle, or polyline vertices [x, y, bulge] (closed). */
export type CropBoundary = { kind: 'polygon'; pts: P2[] } | { kind: 'circle'; c: P2; r: number } | { kind: 'pline'; pts: V3[]; closed: boolean };
export type CropSide = 'inside' | 'outside';
/** The kept items, how many, and what could not be kept. */
export type CropResult = Edit & { kept?: number; skipped?: string[] };

/** A path piece: a straight segment a → b, or an arc about c from angle s through the signed sweep w (radians). */
type Seg = { k: 's'; a: P2; b: P2 };
type Arc = { k: 'a'; c: P2; r: number; s: number; w: number };
type Curve = Seg | Arc;

const TAU = 2 * Math.PI;
const sub2 = (a: P2, b: P2): P2 => [a[0] - b[0], a[1] - b[1]];
const dot = (a: P2, b: P2) => a[0] * b[0] + a[1] * b[1];
const cross = (a: P2, b: P2) => a[0] * b[1] - a[1] * b[0];
const dist = (a: P2, b: P2) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const norm = (a: number) => { const x = a % TAU; return x < 0 ? x + TAU : x; };

function at(q: Curve, u: number): P2 {
  if (q.k === 's') return [q.a[0] + (q.b[0] - q.a[0]) * u, q.a[1] + (q.b[1] - q.a[1]) * u];
  const a = q.s + q.w * u;
  return [q.c[0] + q.r * Math.cos(a), q.c[1] + q.r * Math.sin(a)];
}
const lengthOf = (q: Curve) => (q.k === 's' ? dist(q.a, q.b) : q.r * Math.abs(q.w));
const part = (q: Curve, u0: number, u1: number): Curve => (q.k === 's' ? { k: 's', a: at(q, u0), b: at(q, u1) } : { ...q, s: q.s + q.w * u0, w: q.w * (u1 - u0) });
const isFull = (q: Curve) => q.k === 'a' && Math.abs(Math.abs(q.w) - TAU) < 1e-12;

/** Where a point at angle offset lies along an arc (0–1), within `tol` (length), or null when off it. */
function arcU(q: Arc, p: P2, tol: number): number | null {
  const W = Math.abs(q.w), ang = Math.atan2(p[1] - q.c[1], p[0] - q.c[0]);
  const off = q.w >= 0 ? norm(ang - q.s) : norm(q.s - ang), ta = tol / Math.max(q.r, tol);
  if (W >= TAU - 1e-12) return off / TAU;
  if (off <= W + ta) return Math.min(off / W, 1);
  if (off >= TAU - ta) return 0;
  return null;
}
/** The nearest point of a curve to p, as its parameter. */
function nearestU(q: Curve, p: P2): number {
  if (q.k === 's') { const d = sub2(q.b, q.a), l2 = dot(d, d); return l2 ? Math.max(0, Math.min(1, dot(sub2(p, q.a), d) / l2)) : 0; }
  const u = arcU(q, p, 0);
  if (u !== null) return u;
  return dist(p, at(q, 0)) <= dist(p, at(q, 1)) ? 0 : 1;
}
const distTo = (q: Curve, p: P2) => dist(p, at(q, nearestU(q, p)));

/** Where two curves meet: parameters on each. Collinear or co-circular overlaps give the overlap's ends. */
function meets(p: Curve, q: Curve, tol: number): [number, number][] {
  const out: [number, number][] = [];
  const lp = Math.max(lengthOf(p), tol), lq = Math.max(lengthOf(q), tol);
  const inP = (u: number) => u >= -tol / lp && u <= 1 + tol / lp, inQ = (v: number) => v >= -tol / lq && v <= 1 + tol / lq;
  const clamp = (u: number) => Math.max(0, Math.min(1, u));
  const ends = () => {
    for (const v of [0, 1]) { const x = at(q, v), u = nearestU(p, x); if (dist(at(p, u), x) <= tol) out.push([u, v]); }
    for (const u of [0, 1]) { const x = at(p, u), v = nearestU(q, x); if (dist(at(q, v), x) <= tol) out.push([u, v]); }
  };
  if (p.k === 's' && q.k === 's') {
    const r = sub2(p.b, p.a), d = sub2(q.b, q.a), den = cross(r, d), f = sub2(q.a, p.a);
    if (Math.abs(den) <= 1e-12 * Math.hypot(...r) * Math.hypot(...d)) {
      if (Math.abs(cross(r, f)) / Math.max(Math.hypot(...r), tol) <= tol) ends();
      return out;
    }
    const u = cross(f, d) / den, v = cross(f, r) / den;
    if (inP(u) && inQ(v)) out.push([clamp(u), clamp(v)]);
    return out;
  }
  if (p.k === 'a' && q.k === 'a') {
    const d = dist(p.c, q.c);
    if (d <= tol && Math.abs(p.r - q.r) <= tol) { ends(); return out; }
    if (d <= tol || d > p.r + q.r + tol || d < Math.abs(p.r - q.r) - tol) return out;
    const a = (p.r * p.r - q.r * q.r + d * d) / (2 * d), h = Math.sqrt(Math.max(0, p.r * p.r - a * a));
    const m: P2 = [p.c[0] + ((q.c[0] - p.c[0]) * a) / d, p.c[1] + ((q.c[1] - p.c[1]) * a) / d];
    const n: P2 = [(-(q.c[1] - p.c[1]) * h) / d, ((q.c[0] - p.c[0]) * h) / d];
    for (const x of h <= tol ? [m] : [[m[0] + n[0], m[1] + n[1]] as P2, [m[0] - n[0], m[1] - n[1]] as P2]) {
      const u = arcU(p, x, tol), v = arcU(q, x, tol);
      if (u !== null && v !== null) out.push([u, v]);
    }
    return out;
  }
  // A segment and an arc (either way round).
  const [s, c, swap] = p.k === 's' ? [p, q as Arc, false] : [q as Seg, p as Arc, true];
  const r = sub2(s.b, s.a), f = sub2(s.a, c.c), A = dot(r, r), B = 2 * dot(f, r), C = dot(f, f) - c.r * c.r;
  if (A === 0) return out;
  const off = Math.abs(cross(r, f)) / Math.sqrt(A); // distance from the centre to the line
  let disc = B * B - 4 * A * C;
  if (disc < 0 && Math.abs(off - c.r) <= tol) disc = 0;
  if (disc < 0) return out;
  const sq = Math.sqrt(disc), ts = sq <= 1e-15 * B * B || Math.abs(off - c.r) <= tol * 1e-3 ? [-B / (2 * A)] : [(-B - sq) / (2 * A), (-B + sq) / (2 * A)];
  const ls = Math.max(Math.sqrt(A), tol);
  for (const t of ts) {
    if (t < -tol / ls || t > 1 + tol / ls) continue;
    const x = at(s, Math.max(0, Math.min(1, t))), v = arcU(c, x, tol);
    if (v === null) continue;
    out.push(swap ? [v, Math.max(0, Math.min(1, t))] : [Math.max(0, Math.min(1, t)), v]);
  }
  return out;
}

/** A bulged segment a → b as an arc (centre, radius, start angle, signed sweep). */
function bulgeArc(a: P2, b: P2, bulge: number): Arc | null {
  const chord = dist(a, b);
  if (chord < 1e-12) return null;
  const theta = 4 * Math.atan(bulge), r = chord / (2 * Math.sin(Math.abs(theta) / 2));
  const h = Math.sqrt(Math.max(0, r * r - (chord / 2) ** 2)) * (Math.abs(theta) > Math.PI ? -1 : 1) * Math.sign(theta);
  const c: P2 = [(a[0] + b[0]) / 2 - (h * (b[1] - a[1])) / chord, (a[1] + b[1]) / 2 + (h * (b[0] - a[0])) / chord];
  return { k: 'a', c, r, s: Math.atan2(a[1] - c[1], a[0] - c[0]), w: theta };
}
/** Polyline vertices [x, y, bulge] as a path of segments and arcs. */
function plineCurves(v: V3[], closed: boolean): Curve[] {
  const out: Curve[] = [];
  for (let i = 0; i < (closed ? v.length : v.length - 1); i++) {
    const a: P2 = [v[i][0], v[i][1]], n = v[(i + 1) % v.length], b: P2 = [n[0], n[1]];
    if (dist(a, b) === 0) continue;
    const arc = Math.abs(v[i][2]) > 1e-12 ? bulgeArc(a, b, v[i][2]) : null;
    out.push(arc ?? { k: 's', a, b });
  }
  return out;
}

/** The boundary as a closed loop of edges, or why it cannot be one. */
function boundaryEdges(b: CropBoundary, tol: number): Curve[] | string {
  let edges: Curve[];
  if (b.kind === 'circle') {
    if (!(b.r > tol)) return 'The circle has no size.';
    edges = [{ k: 'a', c: b.c, r: b.r, s: 0, w: TAU }];
  } else {
    let v: V3[] = b.kind === 'polygon' ? b.pts.map(([x, y]): V3 => [x, y, 0]) : b.pts;
    v = v.filter((p, i) => i === 0 || dist([p[0], p[1]], [v[i - 1][0], v[i - 1][1]]) > tol);
    const closes = v.length > 1 && dist([v[0][0], v[0][1]], [v[v.length - 1][0], v[v.length - 1][1]]) <= tol;
    if (b.kind === 'pline' && !b.closed && !closes) return 'That outline is not closed. Pick a closed polyline, circle or room.';
    if (closes) v = v.slice(0, -1);
    edges = plineCurves(v, true);
    if (edges.length < 2 || (edges.length === 2 && edges.every((e) => e.k === 's'))) return 'The outline needs three corners or more.';
  }
  // All corners on one straight line (and no arcs): no area, rather than crossing itself.
  const ps = edges.map((e) => at(e, 0));
  if (edges.every((e) => e.k === 's') && ps.every((p) => Math.abs(cross(sub2(ps[1], ps[0]), sub2(p, ps[0]))) <= tol * Math.max(dist(ps[1], ps[0]), tol))) return 'The outline has no area.';
  // Self-intersecting: two edges meeting anywhere but the corner they share.
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      const next = j === i + 1, wrap = i === 0 && j === edges.length - 1;
      for (const [u, v] of meets(edges[i], edges[j], tol)) {
        const shared = (next && u * lengthOf(edges[i]) >= lengthOf(edges[i]) - tol && v * lengthOf(edges[j]) <= tol)
          || (wrap && u * lengthOf(edges[i]) <= tol && v * lengthOf(edges[j]) >= lengthOf(edges[j]) - tol);
        if (!shared) return 'The outline crosses itself. Draw it without crossings.';
      }
    }
  }
  if (Math.abs(loopArea(edges)) <= tol * tol) return 'The outline has no area.';
  return edges;
}
/** The signed area of a closed loop (anticlockwise positive), arcs included. */
function loopArea(edges: Curve[]): number {
  let a = 0;
  for (const e of edges) {
    const p = at(e, 0), q = at(e, 1);
    a += cross(p, q) / 2;
    if (e.k === 'a') a += (e.r * e.r * (e.w - Math.sin(e.w))) / 2; // the circular segment between chord and arc
  }
  return a;
}

/** The angle a curve sweeps as seen from p (its share of the winding number, × 2π). */
function windAngle(e: Curve, p: P2): number {
  const a = sub2(at(e, 0), p), b = sub2(at(e, 1), p);
  const chord = isFull(e) ? 0 : Math.atan2(cross(a, b), dot(a, b));
  if (e.k === 's') return chord;
  // Arc + chord back is a closed curve: p inside it (the circular segment on the arc's side) adds a turn.
  if (dist(p, e.c) >= e.r) return chord;
  if (isFull(e)) return Math.sign(e.w) * TAU;
  const s = at(e, 0), t = at(e, 1), m = at(e, 0.5), side = (x: P2) => Math.sign(cross(sub2(t, s), sub2(x, s)));
  return side(p) === side(m) ? chord + Math.sign(e.w) * TAU : chord;
}
/** Whether p is inside the loop; on its edges (within tol) counts as inside. */
function inside(edges: Curve[], p: P2, tol: number): boolean {
  if (edges.some((e) => distTo(e, p) <= tol)) return true;
  return Math.abs(edges.reduce((s, e) => s + windAngle(e, p), 0)) > Math.PI;
}

/** A curve cut where it meets the boundary: its spans (parameters) with whether each is inside. */
function spans(q: Curve, edges: Curve[], tol: number): { u0: number; u1: number; in: boolean }[] {
  const L = lengthOf(q), us = [0, 1];
  for (const e of edges) {
    for (const [u] of meets(q, e, tol)) us.push(u);
    const v = at(e, 0), u = nearestU(q, v);
    if (dist(at(q, u), v) <= tol) us.push(u); // the boundary's corners on it (through a corner, touching)
  }
  us.sort((a, b) => a - b);
  const cuts = [us[0]];
  for (const u of us) if ((u - cuts[cuts.length - 1]) * L > tol) cuts.push(u);
  if ((1 - cuts[cuts.length - 1]) * L <= tol) cuts[cuts.length - 1] = 1; else cuts.push(1);
  const out: { u0: number; u1: number; in: boolean }[] = [];
  for (let i = 0; i + 1 < cuts.length; i++) {
    const s = { u0: cuts[i], u1: cuts[i + 1], in: inside(edges, at(q, (cuts[i] + cuts[i + 1]) / 2), tol) };
    const last = out[out.length - 1];
    if (last && last.in === s.in) last.u1 = s.u1; else out.push(s);
  }
  return out;
}

/** The kept runs of a path (each a list of connected curves), and whether the whole path is kept uncut. */
function cropPath(path: Curve[], closed: boolean, edges: Curve[], keepIn: boolean, tol: number): { runs: Curve[][]; whole: boolean } {
  const runs: Curve[][] = [];
  let run: Curve[] = [], whole = true, firstKept = false, lastKept = false;
  path.forEach((q, i) => {
    const sp = spans(q, edges, tol);
    sp.forEach((s, j) => {
      const keep = s.in === keepIn;
      if (i === 0 && j === 0) firstKept = keep;
      lastKept = keep;
      if (!keep) { whole = false; if (run.length) runs.push(run); run = []; return; }
      if (sp.length > 1) whole = false;
      const piece = part(q, s.u0, s.u1);
      if (lengthOf(piece) > tol) run.push(piece);
    });
  });
  if (run.length) runs.push(run);
  if (whole) return { runs: path.length ? [path] : [], whole: true };
  // A closed path cut: its last run goes on into its first through the closing corner.
  if (closed && runs.length > 1 && firstKept && lastKept) runs[0] = [...runs.pop()!, ...runs[0]];
  return { runs, whole: false };
}

type Geo = { kind: 'line' | 'pline'; pts: P2[]; closed?: boolean } | { kind: 'arc'; c: P2; r: number; a0: number; a1: number } | { kind: 'circle'; c: P2; r: number };
/** A kept run as sketch geometry: straight chains as lines / polylines, arcs as arcs, a whole circle as a circle. */
function geometry(run: Curve[], closedWhole: boolean, tol: number): Geo[] {
  if (closedWhole && run.length === 1 && isFull(run[0])) { const c = run[0] as Arc; return [{ kind: 'circle', c: c.c, r: c.r }]; }
  if (closedWhole && run.every((q) => q.k === 's')) return [{ kind: 'pline', pts: run.map((q) => at(q, 0)), closed: true }];
  let r = run;
  if (closedWhole) { const i = r.findIndex((q) => q.k === 'a'); r = [...r.slice(i + 1), ...r.slice(0, i + 1)]; } // straight runs then never wrap
  const out: Geo[] = [];
  let chain: P2[] = [];
  const flush = () => { if (chain.length >= 2) out.push({ kind: chain.length > 2 ? 'pline' : 'line', pts: chain }); chain = []; };
  for (const q of r) {
    if (q.k === 's') { if (!chain.length || dist(chain[chain.length - 1], q.a) > tol) { flush(); chain = [q.a]; } chain.push(q.b); continue; }
    flush();
    const a0 = norm(q.w >= 0 ? q.s : q.s + q.w);
    out.push({ kind: 'arc', c: q.c, r: q.r, a0, a1: norm(a0 + Math.abs(q.w)) });
  }
  flush();
  return out;
}

/** The share of a closed loop's length that is kept (1: wholly kept). */
function keptShare(loop: Curve[], edges: Curve[], keepIn: boolean, tol: number): number {
  const total = loop.reduce((s, q) => s + lengthOf(q), 0);
  if (!total) return 0;
  const { runs } = cropPath(loop, true, edges, keepIn, tol);
  return runs.flat().reduce((s, q) => s + lengthOf(q), 0) / total;
}

const LINETYPES: [RegExp, LinetypeId][] = [[/^CONTINUOUS/, 'continuous'], [/^DASHDOT/, 'dashdot'], [/^DASHED|^DASH/, 'dashed'], [/^HIDDEN/, 'hidden'], [/^CENTER|^CENTRE/, 'center'], [/^DOT/, 'dot'], [/^PHANTOM/, 'phantom']];
/** A drawing's linetype name as the app's, when it has one like it (DASHED2 → dashed); else ByLayer. */
export function linetypeOf(name: string | undefined): LinetypeId | undefined {
  const n = name?.trim().toUpperCase();
  return n ? LINETYPES.find(([re]) => re.test(n))?.[1] : undefined;
}
/** A drawing colour (0xRRGGBB, or the foreground) as the app writes it. */
export const colourOf = (rgb: number | undefined): string | undefined => (rgb === undefined ? undefined : rgb === 0xff000007 ? 'idx:7' : `#${(rgb & 0xffffff).toString(16).padStart(6, '0')}`);
/** Points around a drawn ellipse when it is cut (about 1e-4 of its size between chord and curve). */
const ELLIPSE_STEPS = 256;
const HATCHES: Record<string, HatchPattern> = { SOLID: 'solid', ANSI31: 'ansi31', ANSI37: 'ansi37', NET: 'net', DOTS: 'dots' };

type Item = Omit<SketchItem, 'id'>;
const styled = (s: PieceStyle): Pick<SketchItem, 'layer' | 'color' | 'lt'> => {
  const lt = linetypeOf(s.lt), color = colourOf(s.color);
  return { layer: s.layer, ...(color ? { color } : {}), ...(lt ? { lt } : {}) };
};
const itemOf = (g: Geo, base: Partial<Item>): Item => (g.kind === 'circle' || g.kind === 'arc'
  ? { ...base, kind: g.kind, pts: [g.c], r: g.r, ...(g.kind === 'arc' ? { a0: g.a0, a1: g.a1 } : {}) } as Item
  : { ...base, kind: g.kind, pts: g.pts, ...(g.closed ? { closed: true } : {}) } as Item);

/** A loop with arcs as points for a fill outline (sketch hatches are polygons). */
function loopPoints(loop: Curve[]): P2[] {
  return loop.flatMap((q) => {
    if (q.k === 's') return [q.a];
    const n = Math.max(4, Math.ceil(Math.abs(q.w) / (Math.PI / 36)));
    return Array.from({ length: n }, (_, i) => at(q, i / n));
  });
}

/** The drawn items' extents (for the tolerance). */
function spanOf(pts: P2[]): number {
  if (!pts.length) return 0;
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
}
function piecePoints(p: CadPiece): P2[] {
  switch (p.kind) {
    case 'line': return [p.a, p.b];
    case 'arc': case 'circle': return [[p.c[0] - p.r, p.c[1] - p.r], [p.c[0] + p.r, p.c[1] + p.r]];
    case 'pline': return p.pts.map(([x, y]): P2 => [x, y]);
    case 'text': case 'point': return [p.at];
    case 'hatch': return p.loops.flat().map(([x, y]): P2 => [x, y]);
    case 'solid': return p.pts;
    case 'group': return p.items.flatMap(piecePoints);
  }
}
const boundaryPoints = (b: CropBoundary): P2[] => (b.kind === 'circle' ? [[b.c[0] - b.r, b.c[1] - b.r], [b.c[0] + b.r, b.c[1] + b.r]] : b.pts.map((p): P2 => [p[0], p[1]]));
/** The tolerance for a crop: about 1e-9 × the extents of the boundary and what is cut. */
export const cropTolerance = (pts: P2[]) => 1e-9 * Math.max(spanOf(pts), 1e-3);

/** One exploded piece cropped: the sketch items kept (empty when none), or why it is not kept. */
function cropPiece(p: CadPiece, edges: Curve[], keepIn: boolean, tol: number, skipped: string[]): Item[] {
  const base = styled(p);
  const curves = (path: Curve[], closed: boolean): Item[] => {
    const { runs, whole } = cropPath(path, closed, edges, keepIn, tol);
    return runs.flatMap((r) => geometry(r, whole && closed, tol).map((g) => itemOf(g, base)));
  };
  switch (p.kind) {
    case 'line': return dist(p.a, p.b) > tol ? curves([{ k: 's', a: p.a, b: p.b }], false) : [];
    case 'arc': { let w = p.a1 - p.a0; while (w <= 0) w += TAU; return curves([{ k: 'a', c: p.c, r: p.r, s: p.a0, w }], false); }
    case 'circle': return p.r > tol ? curves([{ k: 'a', c: p.c, r: p.r, s: 0, w: TAU }], true) : [];
    case 'pline': return curves(plineCurves(p.pts, p.closed), p.closed);
    case 'text': return inside(edges, p.at, tol) === keepIn ? [{ ...base, kind: 'text', pts: [p.at], text: p.text, h: p.h, rot: p.rot }] : [];
    case 'point': if (inside(edges, p.at, tol) === keepIn) skipped.push('point'); return [];
    case 'solid': {
      const loop = plineCurves(p.pts.map(([x, y]): V3 => [x, y, 0]), true);
      return loop.length >= 3 && keptShare(loop, edges, keepIn, tol) > 1 - 1e-9 ? [{ ...base, kind: 'pline', pts: p.pts, closed: true, hatch: { pattern: 'solid', scale: 1, angle: 0 } }] : [];
    }
    case 'hatch': {
      const loops = p.loops.map((l) => plineCurves(l, true)).filter((l) => l.length >= 2);
      if (!loops.length) return [];
      const kept = loops.map((l) => keptShare(l, edges, keepIn, tol));
      if (kept.every((k) => k < 1e-9)) return [];
      // Outside: a hatch around the cut-out would cover the hole, so it is not kept either.
      const covers = !keepIn && loops.some((l) => inside(l, at(edges[0], 0), tol));
      if (kept.some((k) => k < 1 - 1e-9) || covers) { skipped.push('hatch'); return []; }
      if (loops.length > 1) skipped.push('hatch island');
      const pattern = HATCHES[p.pattern.trim().toUpperCase()] ?? (p.solid ? 'solid' : 'ansi31');
      return [{ ...base, kind: 'pline', pts: loopPoints(loops[0]), closed: true, hatch: p.solid ? { pattern: 'solid', scale: 1, angle: 0 } : { ...HATCH_START, pattern } }];
    }
    case 'group': {
      const sub: string[] = [], items = p.items.map((x) => ({ x, out: cropPiece(x, edges, keepIn, tol, sub) }));
      // Kept as one when wholly on the kept side: every piece kept and none cut.
      const whole = items.every(({ x, out }) => x.kind === 'point' || (out.length > 0 && sameLength(x, out)));
      if (!whole) { if (items.some(({ out }) => out.length)) skipped.push('dimension'); return []; }
      return items.flatMap(({ out }) => out);
    }
  }
}
/** Whether the items kept of a piece are all of it (nothing cut away). */
function sameLength(p: CadPiece, out: Item[]): boolean {
  const L = pieceLength(p);
  return L === 0 || Math.abs(out.reduce((s, it) => s + itemLength(it), 0) - L) <= 1e-9 * Math.max(L, 1);
}

/** The length of a drawn piece or item (lines, polylines, arcs, circles). */
export function pieceLength(p: CadPiece): number {
  switch (p.kind) {
    case 'line': return dist(p.a, p.b);
    case 'arc': { let w = p.a1 - p.a0; while (w <= 0) w += TAU; return p.r * w; }
    case 'circle': return TAU * p.r;
    case 'pline': return plineCurves(p.pts, p.closed).reduce((s, q) => s + lengthOf(q), 0);
    case 'solid': return plineCurves(p.pts.map(([x, y]): V3 => [x, y, 0]), true).reduce((s, q) => s + lengthOf(q), 0);
    default: return 0;
  }
}
export function itemLength(it: Pick<SketchItem, 'kind' | 'pts' | 'closed' | 'r' | 'a0' | 'a1'>): number {
  if (it.kind === 'circle') return TAU * (it.r ?? 0);
  if (it.kind === 'arc') { let w = (it.a1 ?? 0) - (it.a0 ?? 0); while (w <= 0) w += TAU; return (it.r ?? 0) * w; }
  if (it.kind !== 'line' && it.kind !== 'pline') return 0;
  const pts = it.closed && it.pts.length > 2 ? [...it.pts, it.pts[0]] : it.pts;
  return pts.reduce((s, q, i) => (i ? s + dist(q, pts[i - 1]) : 0), 0);
}

/** Crops exploded pieces (a block of the drawing) along a boundary: the sketch items that stay, or why it cannot be
 * done. Inside keeps what is inside (on the boundary counts as inside); Outside what is outside. */
export function cropPieces(pieces: CadPiece[], boundary: CropBoundary, side: CropSide = 'inside'): CropResult {
  const tol = cropTolerance([...boundaryPoints(boundary), ...pieces.flatMap(piecePoints)]);
  const edges = boundaryEdges(boundary, tol);
  if (typeof edges === 'string') return { error: edges };
  const skipped: string[] = [];
  const items = pieces.flatMap((p) => cropPiece(p, edges, side === 'inside', tol, skipped));
  return { items, kept: items.length, skipped, ...(items.length ? {} : { note: `Nothing of it is ${side} the outline.` }) };
}

/** Drawn items as pieces, for cropping them like a block. */
function piecesOfItem(it: SketchItem): CadPiece[] {
  const s = { layer: it.layer };
  switch (it.kind) {
    case 'line': case 'pline': return it.pts.length === 2 && !it.closed ? [{ ...s, kind: 'line', a: it.pts[0], b: it.pts[1] }] : [{ ...s, kind: 'pline', pts: it.pts.map(([x, y]): V3 => [x, y, 0]), closed: !!it.closed }];
    case 'circle': return [{ ...s, kind: 'circle', c: it.pts[0], r: it.r ?? 0 }];
    case 'arc': return [{ ...s, kind: 'arc', c: it.pts[0], r: it.r ?? 0, a0: it.a0 ?? 0, a1: it.a1 ?? 0 }];
    case 'text': return [{ ...s, kind: 'text', at: it.pts[0], h: it.h ?? 0, rot: it.rot ?? 0, text: it.text ?? '' }];
    case 'dim': return it.pts.map((p): CadPiece => ({ ...s, kind: 'point', at: p }));
    // A drawn ellipse cut comes as a polyline within the chord tolerance (there is no elliptical arc item).
    case 'ellipse': return it.ax ? [{ ...s, kind: 'pline', pts: ellipsePoints(it, ELLIPSE_STEPS).map(([x, y]): V3 => [x, y, 0]), closed: true }] : [];
  }
}
/** Crops drawn items along a boundary. Each kept piece keeps its item's layer, colour, linetype, tray or cable; hatches
 * and dimensions stay only when wholly on the kept side. */
export function cropItems(items: SketchItem[], boundary: CropBoundary, side: CropSide = 'inside'): CropResult {
  const tol = cropTolerance([...boundaryPoints(boundary), ...items.flatMap((it) => it.pts), ...items.filter((it) => it.r).flatMap((it) => [[it.pts[0][0] + it.r!, it.pts[0][1] + it.r!] as P2])]);
  const edges = boundaryEdges(boundary, tol);
  if (typeof edges === 'string') return { error: edges };
  const keepIn = side === 'inside', skipped: string[] = [];
  const out = items.flatMap((it): Item[] => {
    const { id: _id, kind: _k, pts: _p, closed: _c, r: _r, a0: _a0, a1: _a1, ax: _ax, ratio: _ratio, ...rest } = it;
    if (it.kind === 'dim' || it.hatch) {
      const loop = it.hatch && it.kind === 'circle' ? [{ k: 'a', c: it.pts[0], r: it.r ?? 0, s: 0, w: TAU } as Curve] : plineCurves(it.pts.map(([x, y]): V3 => [x, y, 0]), !!it.hatch);
      const all = it.kind === 'dim' ? it.pts.every((p) => inside(edges, p, tol) === keepIn) : keptShare(loop, edges, keepIn, tol) > 1 - 1e-9;
      if (all) { const { id: _i, ...keep } = it; return [keep]; }
      if (it.kind === 'dim' ? it.pts.some((p) => inside(edges, p, tol) === keepIn) : keptShare(loop, edges, keepIn, tol) > 1e-9) skipped.push(it.kind === 'dim' ? 'dimension' : 'hatch');
      return [];
    }
    // A drawn ellipse wholly on the kept side stays as it is.
    if (it.kind === 'ellipse' && it.ax && keptShare(plineCurves(ellipsePoints(it, ELLIPSE_STEPS).map(([x, y]): V3 => [x, y, 0]), true), edges, keepIn, tol) > 1 - 1e-9) { const { id: _i, ...keep } = it; return [keep]; }
    return piecesOfItem(it).flatMap((p) => cropPiece(p, edges, keepIn, tol, skipped)).map((x) => {
      const { layer: _l, ...g } = x;
      return { ...rest, ...g };
    });
  });
  return { items: out, kept: out.length, skipped, ...(out.length ? {} : { note: `Nothing of it is ${side} the outline.` }) };
}

/** A closed drawn item, or an exploded closed object, as a crop boundary (CROP → Object); undefined when it is not one. */
export function boundaryOfItem(it: Pick<SketchItem, 'kind' | 'pts' | 'closed' | 'r'>): CropBoundary | undefined {
  if (it.kind === 'circle' && it.r) return { kind: 'circle', c: it.pts[0], r: it.r };
  if ((it.kind === 'pline' || it.kind === 'line') && it.closed && it.pts.length >= 3) return { kind: 'polygon', pts: it.pts };
  return undefined;
}
export function boundaryOfPiece(p: CadPiece): CropBoundary | undefined {
  if (p.kind === 'circle') return { kind: 'circle', c: p.c, r: p.r };
  if (p.kind === 'pline') return { kind: 'pline', pts: p.pts, closed: p.closed };
  if (p.kind === 'hatch' && p.loops[0]) return { kind: 'pline', pts: p.loops[0], closed: true };
  if (p.kind === 'solid') return { kind: 'polygon', pts: p.pts };
  return undefined;
}

/** "124 pieces kept · 2 hatches crossing the outline not kept" — what a crop did, for the command line. */
export function cropNote(r: CropResult): string {
  const n = r.kept ?? 0, counts = new Map<string, number>();
  for (const s of r.skipped ?? []) counts.set(s, (counts.get(s) ?? 0) + 1);
  const why: Record<string, string> = { hatch: 'crossing the outline, not kept', 'hatch island': 'kept without its islands', dimension: 'crossing the outline, not kept', point: 'not kept (no point object in drawn items)' };
  const extra = [...counts].map(([k, c]) => `${c} ${k}${c === 1 ? '' : k.endsWith('h') ? 'es' : 's'} ${why[k]}`);
  return [`${n} piece${n === 1 ? '' : 's'} kept`, ...extra].join(' · ');
}
