import type { Project, SketchItem } from '../types';
import { layerFileOf, withLayerFile } from './cadLayerState';
import { roundOfSegments, segmentsBetween } from './cadDims';
import { dimDir, dimMeasure, linearDir } from './cadSketch';
import { dimStylesOf, fullDimStyle, lookOf, STANDARD, type CadDimStyle } from './cadStyles';

/** Design CAD → Annotate → Dimensions: the layer new dimensions go on (DIMLAYER), the style a dimension was drawn with
 * (the ribbon's style list; DIMSTYLE A gives the dimensions picked the current one), what DIM makes of a click, the
 * row of dimensions Quick dimension (QDIM) draws over the objects picked, and Adjust space (DIMSPACE). */

/** The app's annotation layer, where new dimensions go until another is set. */
export const ANNO_LAYER = 'LV-ANNO';
/** DIMLAYER's value for "the current layer". */
export const USE_CURRENT = '.';
type Pt = [number, number];
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** The drawing's DIMLAYER: a layer's name, USE_CURRENT, or undefined for the annotation layer (as before). */
export const dimLayerSetting = (p: Project, file: string | undefined): string | undefined => layerFileOf(p, file).dimLayer;
/** The layer a new dimension goes on, with `current` the drawing's current layer. */
export function dimLayerOf(p: Project, file: string | undefined, current: string): string {
  const s = dimLayerSetting(p, file);
  return !s ? ANNO_LAYER : s === USE_CURRENT ? current : s;
}
/** The project with the drawing's DIMLAYER set; the annotation layer (or blank) is kept as no setting. */
export const withDimLayer = (p: Project, file: string, value: string | undefined): Project =>
  withLayerFile(p, file, { dimLayer: value && value.trim() && !same(value.trim(), ANNO_LAYER) ? value.trim() : undefined });

/** The style a dimension was drawn with (Standard when it records none). */
export const styleOfDim = (it: Pick<SketchItem, 'dimStyle'>): string => it.dimStyle ?? STANDARD;
/** The style of the dimensions among the objects picked: its name, 'varies' when they differ, or undefined with none. */
export function pickedDimStyle(items: readonly SketchItem[]): string | undefined {
  const names = new Set(items.filter((it) => it.kind === 'dim').map(styleOfDim));
  return names.size === 0 ? undefined : names.size === 1 ? [...names][0] : 'varies';
}
/** A dimension redrawn in a style at k drawing units per paper mm: its look, text height and the style's name. A text
 * it was drawn with before styles (its length in metres) goes, so the style measures it; words typed over it stay. */
export function restyledDim(it: SketchItem, style: CadDimStyle, k: number, metresPerUnit: number): SketchItem {
  const { dimStyle: _s, ...rest } = it;
  const legacy = !it.look && !it.dimKind && it.text !== undefined && it.text === (dimMeasure(it) * metresPerUnit).toFixed(2);
  const { text: _t, ...noText } = rest;
  return { ...(legacy ? noText : rest), look: lookOf(style, k), h: style.textMm * k, ...(style.name !== STANDARD ? { dimStyle: style.name } : {}) } as SketchItem;
}
/** The dimensions picked given a style by name (others are left as they are); undefined when there is no such style. */
export function restyledDims(p: Project, items: readonly SketchItem[], name: string, k: number, metresPerUnit: number): SketchItem[] | undefined {
  const st = dimStylesOf(p).styles.find((x) => same(x.name, name));
  if (!st) return undefined;
  const full = fullDimStyle(st, p);
  return items.filter((it) => it.kind === 'dim').map((it) => restyledDim(it, full, k, metresPerUnit));
}

/** DIM's first click: a snap (endpoint, midpoint, centre…) is a point to measure from; a click with no snap, or only
 * Nearest, picks the line, arc or circle under it. */
export const dimPicksObject = (snap: string | undefined): boolean => !snap || snap === 'Nearest';
/** The direction of a dimension between two points placed through `at`: aligned with them while `at` is beside an
 * oblique pair (between the lines square to it through each point), else horizontal or vertical as DIMLINEAR places it.
 * Undefined means aligned. */
export function dimDirFor(a: Pt, b: Pt, at: Pt): number | undefined {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
  const oblique = l2 > 0 && Math.abs(dx) > 1e-9 * Math.sqrt(l2) && Math.abs(dy) > 1e-9 * Math.sqrt(l2);
  if (oblique) {
    const t = ((at[0] - a[0]) * dx + (at[1] - a[1]) * dy) / l2;
    if (t >= 0 && t <= 1) return undefined;
  }
  return linearDir(a, b, at);
}

/** QDIM's two ways of laying the dimensions: one after another, or each from the first. */
export type QdimMode = 'continuous' | 'baseline';
type Seg = [Pt, Pt];
/** What Quick dimension measures of a drawn object: a line's or polyline's points, the centre of a circle or arc (an
 * arc's ends too) and a point's place. Texts, dimensions, leaders, blocks, ellipses and infinite lines give none. */
export function qdimPointsOf(it: SketchItem): Pt[] {
  if ((it.kind === 'line' && !it.infinite) || it.kind === 'pline') return it.pts;
  if (it.kind === 'circle' || it.kind === 'point') return it.pts.slice(0, 1);
  if (it.kind !== 'arc' || !it.pts.length) return [];
  const [c] = it.pts, r = it.r ?? 0, end = (a: number): Pt => [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)];
  return [c, end(it.a0 ?? 0), end(it.a1 ?? 0)];
}
/** The same of an object of the opened drawing, which comes as its segments: a circle's or arc's centre (and an arc's
 * ends) when `round` is given; else the ends of its run and each corner where it turns more than 10° (an arc drawn as
 * short segments turns less at each, so its steps are left out) or breaks off. */
export function qdimPointsOfRun(segs: readonly Seg[], round?: { c: Pt; ends?: [Pt, Pt] }): Pt[] {
  if (round) return [round.c, ...(round.ends ?? [])];
  const s = segs.filter(([a, b]) => a[0] !== b[0] || a[1] !== b[1]);
  if (!s.length) return [];
  const out: Pt[] = [s[0][0]];
  const turn = Math.cos((10 * Math.PI) / 180);
  for (let i = 1; i < s.length; i += 1) {
    const [a, b] = s[i - 1], [c, d] = s[i];
    if (Math.hypot(c[0] - b[0], c[1] - b[1]) > 1e-9 * (1 + Math.abs(b[0]) + Math.abs(b[1]))) { out.push(b, c); continue; }
    const u = [b[0] - a[0], b[1] - a[1]], v = [d[0] - c[0], d[1] - c[1]];
    if ((u[0] * v[0] + u[1] * v[1]) / (Math.hypot(u[0], u[1]) * Math.hypot(v[0], v[1])) < turn) out.push(b);
  }
  out.push(s[s.length - 1][1]);
  return out;
}
/** What Quick dimension measures of objects of the opened drawing (their kind and range in the drawing's segments, 4
 * numbers each): lines and polylines by their runs, circles and arcs by their centres (an arc's ends too); blocks,
 * texts, hatches and the rest give none. */
export function qdimPointsOfDrawing(objs: readonly { kind: string; seg_start: number; seg_end: number }[], segs: ArrayLike<number>): Pt[] {
  return objs.flatMap((o) => {
    const kind = o.kind.toLowerCase(), s = o.seg_start, e = o.seg_end;
    if (e <= s) return [];
    if (kind === 'line' || kind === 'polyline') return qdimPointsOfRun(segmentsBetween(segs, s, e));
    if (kind !== 'circle' && kind !== 'arc') return [];
    const q = roundOfSegments(segs, s, e);
    if (!q) return [];
    return qdimPointsOfRun([], { c: q.c, ...(kind === 'arc' ? { ends: [[segs[s * 4], segs[s * 4 + 1]], [segs[(e - 1) * 4 + 2], segs[(e - 1) * 4 + 3]]] as [Pt, Pt] } : {}) });
  });
}
/** Quick dimension: the dimensions over the points measured, with their line through `at`: horizontal when `at` is
 * above or below the points, vertical beside them, as Linear places one. Points at one place along the line (within
 * `tol`) are one, measured from the one nearest the line. Continuous: a dimension from each to the next, all in one
 * line; baseline: each from the first, the first through `at` and each next `spacing` further out. */
export function quickDims(points: readonly Pt[], at: Pt, mode: QdimMode, tol: number, spacing: number): { dir: number; dims: [Pt, Pt, Pt][] } {
  if (!points.length) return { dir: 0, dims: [] };
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
  const lo: Pt = [Math.min(...xs), Math.min(...ys)], hi: Pt = [Math.max(...xs), Math.max(...ys)];
  const dir = linearDir(lo, hi, at), k = dir === 0 ? 0 : 1, j = 1 - k;
  const sorted = [...points].sort((a, b) => a[k] - b[k]);
  const groups: Pt[] = [];
  let start = Number.NEGATIVE_INFINITY;
  for (const p of sorted) {
    const last = groups[groups.length - 1];
    if (last && p[k] - start <= tol) { if (Math.abs(p[j] - at[j]) < Math.abs(last[j] - at[j])) groups[groups.length - 1] = p; continue; }
    groups.push(p); start = p[k];
  }
  const out = Math.sign(at[j] - (lo[j] + hi[j]) / 2) || 1;
  const line = (i: number): Pt => { const q: Pt = [at[0], at[1]]; q[j] += out * spacing * i; return q; };
  const dims: [Pt, Pt, Pt][] = groups.slice(1).map((p, i) => (mode === 'continuous' ? [groups[i], p, line(0)] : [groups[0], p, line(i)]));
  return { dir, dims };
}

/** Adjust space: Auto spaces the dimension lines twice the base dimension's text apart (`h` when it has none). */
export const autoDimGap = (base: Pick<SketchItem, 'h'>, h: number): number => 2 * (base.h ?? h);
/** Adjust space: the linear and aligned dimensions picked that lie parallel to the base one, moved across their line
 * so each row of them (dimensions in line with each other, as Continue draws them) lies `gap` beyond the row before
 * it, out from the base on the side it is on; rows in line with the base stay there, and a gap of 0 puts every row in
 * line with it. `moved` holds those whose place changed; radius, diameter and angular ones, and those at another
 * angle, are left as they are and counted as `skipped`. */
export function spacedDims(base: SketchItem, items: readonly SketchItem[], gap: number): { moved: SketchItem[]; spaced: number; skipped: number } {
  const a = dimDir(base), nx = -Math.sin(a), ny = Math.cos(a);
  const off = (it: SketchItem) => it.pts[2][0] * nx + it.pts[2][1] * ny;
  const dims = items.filter((it) => it.kind === 'dim' && it.id !== base.id);
  const ok = dims.filter((it) => !it.dimKind && it.pts.length > 2 && Math.abs(Math.sin(dimDir(it) - a)) < 1e-6).sort((p, q) => off(p) - off(q));
  const b = off(base), tol = 1e-6 * (1 + Math.max(Math.abs(b), ...ok.map((it) => Math.abs(off(it)))));
  // The rows: offsets in line with each other within tol, then numbered out from the base on each side.
  const rows: SketchItem[][] = [];
  for (const it of ok) { const r = rows[rows.length - 1]; if (r && off(it) - off(r[r.length - 1]) <= tol) r.push(it); else rows.push([it]); }
  const side = (r: SketchItem[]) => { const d = off(r[0]) - b; return Math.abs(d) <= tol ? 0 : Math.sign(d); };
  const target = new Map<SketchItem, number>();
  for (const s of [1, -1]) {
    const these = rows.filter((r) => side(r) === s).sort((p, q) => s * (off(p[0]) - off(q[0])));
    these.forEach((r, i) => { for (const it of r) target.set(it, b + s * gap * (i + 1)); });
  }
  for (const r of rows) if (side(r) === 0) for (const it of r) target.set(it, b);
  const moved = ok.flatMap((it) => {
    const d = target.get(it)! - off(it);
    if (Math.abs(d) <= tol) return [];
    const [p1, p2, at, ...rest] = it.pts;
    return [{ ...it, pts: [p1, p2, [at[0] + nx * d, at[1] + ny * d] as Pt, ...rest] }];
  });
  return { moved, spaced: ok.length, skipped: dims.length - ok.length };
}
