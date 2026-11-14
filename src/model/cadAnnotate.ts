import { inside } from './cadMeasure';
import { ellipsePoints } from './cadSketch';
import { hatchOutlinePts, loopOf } from './cadHatchAssoc';
export { hatchOutlinePts };
import type { Project, SketchItem } from '../types';
import type { HatchSpec } from './cadHatch';

/** Design CAD → Hatch and annotation (drawing units): a hatch is a closed outline filled with a pattern; a leader an
 * arrowed line with its text; a room tag the room's name and area; a north arrow. Text sizes are paper mm at the
 * annotation scale (2.5 mm at 1:100 = 0.25 m on the plan). */

type Pt = [number, number];
// The patterns themselves: src/model/cadHatch.ts.
export { HATCH_IDS, HATCH_PATTERNS, type HatchPattern, type HatchSpec } from './cadHatch';
export const HATCH_START: HatchSpec = { pattern: 'ansi31', scale: 3, angle: 0 };
export const HATCH_LAYER = 'LV-HATCH', ANNO = 'LV-ANNO';

/** Text height on paper (mm) and the scale the plan is annotated for. */
export interface AnnoSettings { textMm: number; scale: number }
export const ANNO_START: AnnoSettings = { textMm: 2.5, scale: 100 };
export const annoOf = (p: Project): AnnoSettings => ({ ...ANNO_START, ...(p.cadAnno ?? {}) });
/** Drawing units per paper mm at the annotation scale. */
export const unitsPerPaperMm = (a: AnnoSettings, metresPerUnit: number) => a.scale / 1000 / metresPerUnit;
/** Text height in drawing units. */
export const textUnits = (a: AnnoSettings, metresPerUnit: number) => a.textMm * unitsPerPaperMm(a, metresPerUnit);

const area = (pts: Pt[]) => Math.abs(pts.reduce((t, q, i) => { const r = pts[(i + 1) % pts.length]; return t + q[0] * r[1] - r[0] * q[1]; }, 0)) / 2;
/** What to hatch around a point: the smallest closed drawn object around it (polyline, rectangle, circle or ellipse), else the
 * smallest room outline (drawing units) around it; `holes` are the closed drawn objects wholly inside it (islands, when
 * `islands` is on), `ids` the outer object's id then the islands' (a drawn outer only: rooms are never associative). */
export function hatchOutline(items: SketchItem[], at: Pt, rooms: Pt[][], islands = true): { pts: Pt[]; circle?: { c: Pt; r: number }; from: 'object' | 'room' | 'lines'; holes: Pt[][]; ids?: string[]; islandIds: string[] } | undefined {
  let best: { a: number; pts: Pt[]; circle?: { c: Pt; r: number }; id: string } | undefined;
  for (const it of items) {
    if (it.hatch) continue;
    if (it.kind === 'circle' && it.r && Math.hypot(at[0] - it.pts[0][0], at[1] - it.pts[0][1]) < it.r) {
      const a = Math.PI * it.r * it.r;
      if (!best || a < best.a) best = { a, pts: it.pts, circle: { c: it.pts[0], r: it.r }, id: it.id };
    } else if (it.kind === 'ellipse' && it.ax) {
      // An ellipse: hatched as the closed outline round it.
      const pts = ellipsePoints(it);
      if (!inside(at, pts)) continue;
      const a = Math.PI * Math.hypot(it.ax[0], it.ax[1]) ** 2 * (it.ratio ?? 1);
      if (!best || a < best.a) best = { a, pts, id: it.id };
    } else if ((it.kind === 'pline' || it.kind === 'line') && it.closed && it.pts.length > 2 && inside(at, it.pts)) {
      const a = area(it.pts);
      if (!best || a < best.a) best = { a, pts: it.pts, id: it.id };
    }
  }
  const room = best ? undefined : rooms.filter((r) => r.length > 2 && inside(at, r)).sort((a, b) => area(a) - area(b))[0];
  if (!best && !room) return undefined;
  const outer = best?.pts ?? room!, c = best?.circle;
  const { holes, ids } = islands ? islandsIn(items, { pts: outer, circle: c }, best?.id) : { holes: [], ids: [] };
  return { pts: outer, ...(c ? { circle: c } : {}), from: best ? 'object' : 'room', holes, islandIds: ids, ...(best ? { ids: [best.id, ...ids] } : {}) };
}
/** The islands of an outline: the closed drawn objects (polyline, rectangle, circle, ellipse; never a hatch or text)
 * wholly inside it, other than `skip` (its own object), with their loops and ids. */
export function islandsIn(items: SketchItem[], outer: { pts: Pt[]; circle?: { c: Pt; r: number } }, skip?: string): { holes: Pt[][]; ids: string[] } {
  const c = outer.circle, outerArea = c ? Math.PI * c.r * c.r : area(outer.pts), holes: Pt[][] = [], ids: string[] = [];
  for (const it of items) {
    if (it.id === skip) continue;
    const l = loopOf(it);
    if (!l || area(l) >= outerArea * (1 - 1e-9) || !l.every((q) => (c ? Math.hypot(q[0] - c.c[0], q[1] - c.c[1]) < c.r : inside(q, outer.pts)))) continue;
    holes.push(l);
    ids.push(it.id);
  }
  return { holes, ids };
}
/** The hatch as a drawn object on LV-HATCH: a closed polyline (or circle) with its pattern, its islands and (once
 * associative) the ids of the objects it follows. */
export function hatchItem(o: { pts: Pt[]; circle?: { c: Pt; r: number }; holes?: Pt[][] }, spec: HatchSpec, assoc?: string[]): Omit<SketchItem, 'id'> {
  const extra = { ...(o.holes?.length ? { holes: o.holes } : {}), ...(assoc?.length ? { assoc } : {}) };
  return o.circle ? { kind: 'circle', layer: HATCH_LAYER, pts: [o.circle.c], r: o.circle.r, hatch: spec, ...extra } : { kind: 'pline', layer: HATCH_LAYER, pts: o.pts, closed: true, hatch: spec, ...extra };
}
/** A hatch's net area (drawing units²): the outline less its islands, an island inside an island counted back in. */
export function hatchArea(it: Pick<SketchItem, 'kind' | 'pts' | 'r' | 'holes'>): number {
  const loops: { pts: Pt[]; a: number }[] = [{ pts: hatchOutlinePts(it), a: it.kind === 'circle' ? Math.PI * (it.r ?? 0) ** 2 : area(it.pts) }, ...(it.holes ?? []).map((h) => ({ pts: h, a: area(h) }))];
  return loops.reduce((t, l, i) => t + (loops.filter((o, j) => j !== i && o.a > l.a && inside(l.pts[0], o.pts)).length % 2 ? -l.a : l.a), 0);
}

/** A leader: the arrowed line through its points (the arrow at the first) and its text beside the last. */
export function leaderItems(pts: Pt[], text: string, h: number): Omit<SketchItem, 'id'>[] {
  if (pts.length < 2) return [];
  const [a, b] = [pts[pts.length - 2], pts[pts.length - 1]], right = b[0] >= a[0];
  const line: Omit<SketchItem, 'id'> = { kind: pts.length > 2 ? 'pline' : 'line', layer: ANNO, pts, leader: true };
  if (!text.trim()) return [line];
  const w = 0.6 * h * text.length;
  return [line, { kind: 'text', layer: ANNO, pts: [[b[0] + (right ? 0.5 * h : -0.5 * h - w), b[1] - 0.4 * h]], text: text.trim(), h, rot: 0 }];
}
/** A room tag: its name over its area, centred at a point. */
export function roomTagItems(name: string, areaM2: number, at: Pt, h: number): Omit<SketchItem, 'id'>[] {
  const t = (s: string, dy: number, k: number): Omit<SketchItem, 'id'> => ({ kind: 'text', layer: ANNO, pts: [[at[0] - (0.6 * h * k * s.length) / 2, at[1] + dy]], text: s, h: h * k, rot: 0 });
  return [t(name.toUpperCase(), 0.2 * h, 1), t(`${areaM2.toFixed(2)} m²`, -1.3 * h, 0.8)];
}
/** A north arrow at a point: a circle, the arrow (pointing up the plan, +y) and N above. */
export function northArrowItems(at: Pt, h: number): Omit<SketchItem, 'id'>[] {
  const r = 1.8 * h, [x, y] = at;
  return [
    { kind: 'circle', layer: ANNO, pts: [at], r },
    { kind: 'pline', layer: ANNO, pts: [[x, y + r], [x + 0.6 * r, y - 0.7 * r], [x, y - 0.35 * r], [x - 0.6 * r, y - 0.7 * r]], closed: true },
    { kind: 'text', layer: ANNO, pts: [[x - 0.3 * h, y + r + 0.4 * h]], text: 'N', h, rot: 0 }
  ];
}
/** The centre of an outline (its vertices' mean). */
export const centreOf = (pts: Pt[]): Pt => [pts.reduce((t, q) => t + q[0], 0) / pts.length, pts.reduce((t, q) => t + q[1], 0) / pts.length];
