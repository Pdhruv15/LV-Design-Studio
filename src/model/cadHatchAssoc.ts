import { ellipsePoints } from './cadSketch';
import type { SketchItem } from '../types';

type Pt = [number, number];

/** Design CAD → Associative hatches: a hatch made from drawn objects (`assoc`: the outer's id, then its islands') follows
 * them when they change, and lets go (keeps its shape) when it cannot: an object erased or opened, the hatch moved on
 * its own, or a copy of a hatch whose outline is not its sources'. Run on every change of the drawn objects. */

export const circlePts = (c: Pt, r: number, n: number): Pt[] => Array.from({ length: n }, (_, i): Pt => [c[0] + r * Math.cos((i * 2 * Math.PI) / n), c[1] + r * Math.sin((i * 2 * Math.PI) / n)]);
/** A hatch's outline as a polygon (a circle as 128 sides). */
export const hatchOutlinePts = (it: Pick<SketchItem, 'kind' | 'pts' | 'r'>): Pt[] => (it.kind === 'circle' ? circlePts(it.pts[0], it.r ?? 0, 128) : it.pts);
/** A drawn object's closed outline for hatching (a circle as 32 sides), or undefined when it does not close (hatches and
 * texts never do). */
export function loopOf(it: SketchItem): Pt[] | undefined {
  if (it.hatch) return undefined;
  if (it.kind === 'circle' && it.r) return circlePts(it.pts[0], it.r, 32);
  if (it.kind === 'ellipse' && it.ax) return ellipsePoints(it);
  if ((it.kind === 'pline' || it.kind === 'line') && it.closed && it.pts.length > 2) return it.pts;
  return undefined;
}

const sameAt = (a: Pt, b: Pt, tol: number) => Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol;
const sameLoop = (a: Pt[], b: Pt[], tol: number) => a.length === b.length && a.every((q, i) => sameAt(q, b[i], tol));
const sizeOf = (it: SketchItem) => {
  if (it.kind === 'circle') return (it.r ?? 0) * 2;
  const xs = it.pts.map((q) => q[0]), ys = it.pts.map((q) => q[1]);
  return Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
};
/** Whether the hatch's outline and islands are the outlines of its sources (about 1e-6 of its size). */
function matches(h: SketchItem, srcs: SketchItem[]): boolean {
  const [o, ...isl] = srcs, tol = 1e-6 * (sizeOf(h) || 1);
  if ((h.holes?.length ?? 0) !== isl.length) return false;
  if (h.kind === 'circle') { if (o.kind !== 'circle' || !o.r || !sameAt(h.pts[0], o.pts[0], tol) || Math.abs((h.r ?? 0) - o.r) > tol) return false; }
  else if (o.kind === 'circle' || !sameLoop(h.pts, loopOf(o) ?? [], tol)) return false;
  return isl.every((s, i) => sameLoop(h.holes![i], loopOf(s) ?? [], tol));
}
const sameGeom = (a: SketchItem, b: SketchItem) => a.kind === b.kind && a.closed === b.closed && a.r === b.r && a.ratio === b.ratio && a.ax?.[0] === b.ax?.[0] && a.ax?.[1] === b.ax?.[1]
  && a.pts.length === b.pts.length && a.pts.every((q, i) => q[0] === b.pts[i][0] && q[1] === b.pts[i][1]);
const noAssoc = (h: SketchItem): SketchItem => { const { assoc: _a, ...rest } = h; return rest; };

/** Whether the hatch is associative now: it has sources and its outline and islands are theirs. */
export function isAssociative(it: SketchItem, items: SketchItem[]): boolean {
  if (!it.assoc?.length) return false;
  const srcs = it.assoc.map((id) => items.find((x) => x.id === id));
  return srcs.every((s) => !!s) && matches(it, srcs as SketchItem[]);
}

/** The drawn objects after a change, with each associative hatch following its sources (outline and islands made again
 * from them) or, when it cannot, no longer associative. Returns `after` itself when nothing changes. */
export function followBoundaries(before: SketchItem[], after: SketchItem[]): SketchItem[] {
  if (before === after || !after.some((it) => it.assoc)) return after;
  const was = new Map(before.map((it) => [it.id, it])), now = new Map(after.map((it) => [it.id, it]));
  let changed = false;
  const out = after.map((h) => {
    if (!h.assoc) return h;
    const srcs = h.assoc.map((id) => now.get(id));
    const outer = srcs[0];
    // A source gone, or the outer no longer closed: the hatch keeps its shape.
    if (srcs.some((s) => !s) || !outer || !(outer.kind === 'circle' ? outer.r : loopOf(outer))) { changed = true; return noAssoc(h); }
    // A hatch that is still their outline (say an island added to it and to its sources together) stays as it is.
    if (matches(h, srcs as SketchItem[])) return h;
    const old = was.get(h.id);
    // A new hatch that is not its sources' outline (a copy, an array): plain from the start.
    if (!old) { changed = true; return noAssoc(h); }
    const oldSrcs = h.assoc.map((id) => was.get(id)), moved = srcs.some((s, i) => !oldSrcs[i] || !sameGeom(s!, oldSrcs[i]!));
    // The hatch moved on its own, none of its sources changed: it is no longer tied to them.
    if (!moved) { changed = true; return noAssoc(h); }
    // Follow only a hatch that matched its sources before the change (a copy of a hatch points at the original's).
    if (!oldSrcs.every((s) => !!s) || !matches(old, oldSrcs as SketchItem[])) { changed = true; return noAssoc(h); }
    const holes = srcs.slice(1).map((s) => loopOf(s!));
    if (holes.some((l) => !l)) { changed = true; return noAssoc(h); }
    const { r: _r, closed: _c, holes: _h, ...base } = h;
    changed = true;
    return outer.kind === 'circle'
      ? { ...base, kind: 'circle' as const, pts: [outer.pts[0]], r: outer.r, ...(holes.length ? { holes: holes as Pt[][] } : {}) }
      : { ...base, kind: 'pline' as const, pts: loopOf(outer)!, closed: true, ...(holes.length ? { holes: holes as Pt[][] } : {}) };
  });
  return changed ? out : after;
}

/** How many hatches had sources before and still exist without them after (they have let go of their boundary). */
export const lostAssociation = (before: SketchItem[], after: SketchItem[]): number => {
  if (before === after) return 0;
  const now = new Map(after.map((it) => [it.id, it]));
  return before.filter((h) => h.assoc && now.has(h.id) && !now.get(h.id)!.assoc).length;
};
