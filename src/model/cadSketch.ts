import { fittingLabel, trayFittings } from './cadTrayFittings';
import { atOrigin, defOf, placedLines } from './cadHatch';
import { followBoundaries, hatchOutlinePts } from './cadHatchAssoc';
import { MASK_LAYER, textBox, textCorners, textFrameOf, textWidth } from './cadText';
import { noteCorners, noteHit, toDxfMtext } from './cadMtext';
import { mleaderNote, mleaderParts, mleaderSegments } from './cadMleader';
import { pdsizeOf, type PointStyle } from './cadPoints';
import { attdefAsText, attributePlacements, expandInsert, type CadBlockDef } from './cadBlocks';
import { colourOut } from './cadColours';
import { LINETYPES } from './cadLayerStyle';
import type { CadSketch, Project, SketchItem } from '../types';

type Pt = [number, number];

/** What the engineer draws in the CAD view over the architect's drawing (which stays as received): lines, polylines,
 * rectangles, circles, arcs, texts and dimensions, in drawing units, kept in the project per drawing file and written
 * into the drawing by Save DXF. Move, copy, rotate and erase work on them; they snap like the drawing. */

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
export const sketchOf = (p: Project, file: string): SketchItem[] => p.cadSketch?.find((s) => same(s.file, file))?.items ?? [];

/** The project with the drawing's drawn objects replaced. */
export function withSketchItems(p: Project, file: string, items: SketchItem[]): Project {
  // Associative hatches follow the objects they were made from.
  items = followBoundaries(sketchOf(p, file), items);
  const rest = (p.cadSketch ?? []).filter((s) => !same(s.file, file));
  const all: CadSketch[] = items.length ? [...rest, { file, items }] : rest;
  const { cadSketch: _old, ...base } = p;
  return all.length ? { ...base, cadSketch: all } : base;
}
const nextId = (p: Project) => (p.cadSketch ?? []).flatMap((s) => s.items).reduce((m, it) => Math.max(m, Number(/^S(\d+)$/.exec(it.id)?.[1] ?? 0)), 0) + 1;

export function addSketch(p: Project, file: string, item: Omit<SketchItem, 'id'>): { project: Project; id: string } {
  const id = `S${nextId(p)}`;
  return { project: withSketchItems(p, file, [...sketchOf(p, file), { ...item, id } as SketchItem]), id };
}
export const updateSketch = (p: Project, file: string, item: SketchItem) => withSketchItems(p, file, sketchOf(p, file).map((it) => (it.id === item.id ? item : it)));
export const removeSketch = (p: Project, file: string, id: string) => withSketchItems(p, file, sketchOf(p, file).filter((it) => it.id !== id));

// ---- geometry

export const dist = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const rot = (p: Pt, c: Pt, a: number): Pt => { const s = Math.sin(a), k = Math.cos(a), x = p[0] - c[0], y = p[1] - c[1]; return [c[0] + x * k - y * s, c[1] + x * s + y * k]; };

/** The visible part of an XLINE or RAY inside an axis-aligned box. Its two stored points define the base and direction,
 * not finite ends. Undefined for an ordinary line, a nil direction, or a ray pointing away from the box. */
export function constructionSegment(it: Pick<SketchItem, 'infinite' | 'pts'>, box: [number, number, number, number]): [Pt, Pt] | undefined {
  if (!it.infinite || it.pts.length < 2) return undefined;
  const p = it.pts[0], d: Pt = [it.pts[1][0] - p[0], it.pts[1][1] - p[1]];
  if (Math.hypot(d[0], d[1]) < 1e-12) return undefined;
  let lo = it.infinite === 'ray' ? 0 : -Infinity, hi = Infinity;
  for (const k of [0, 1] as const) {
    const a = box[k], b = box[k + 2];
    if (Math.abs(d[k]) < 1e-12) { if (p[k] < a || p[k] > b) return undefined; continue; }
    let t0 = (a - p[k]) / d[k], t1 = (b - p[k]) / d[k];
    if (t0 > t1) [t0, t1] = [t1, t0];
    lo = Math.max(lo, t0); hi = Math.min(hi, t1);
    if (lo > hi) return undefined;
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return undefined;
  const at = (t: number): Pt => [p[0] + d[0] * t, p[1] + d[1] * t];
  return [at(lo), at(hi)];
}

/** Perpendicular distance from a point to an XLINE or RAY (a ray clamps behind its base to that base). */
export function constructionDistance(it: Pick<SketchItem, 'infinite' | 'pts'>, q: Pt): number {
  if (!it.infinite || it.pts.length < 2) return Infinity;
  const p = it.pts[0], d: Pt = [it.pts[1][0] - p[0], it.pts[1][1] - p[1]], l2 = d[0] ** 2 + d[1] ** 2;
  if (l2 < 1e-24) return Infinity;
  let t = ((q[0] - p[0]) * d[0] + (q[1] - p[1]) * d[1]) / l2;
  if (it.infinite === 'ray') t = Math.max(0, t);
  return dist(q, [p[0] + d[0] * t, p[1] + d[1] * t]);
}

/** The item moved by (dx, dy). */
export const moved = (it: SketchItem, dx: number, dy: number): SketchItem => {
  const m = (q: Pt): Pt => [q[0] + dx, q[1] + dy];
  // A hatch's islands and pattern go with it.
  return { ...it, pts: it.pts.map(m), ...(it.holes ? { holes: it.holes.map((h) => h.map(m)) } : {}), ...(it.hatch ? { hatch: { ...it.hatch, origin: m(it.hatch.origin ?? [0, 0]) } } : {}) };
};
/** The item rotated by `a` radians about `c`. */
export function rotated(it: SketchItem, c: Pt, a: number): SketchItem {
  const pts = it.pts.map((q) => rot(q, c, a));
  if (it.hatch) {
    const deg = (((it.hatch.angle + (a * 180) / Math.PI) % 360) + 360) % 360;
    return { ...it, pts, ...(it.holes ? { holes: it.holes.map((h) => h.map((q) => rot(q, c, a))) } : {}), hatch: { ...it.hatch, angle: Math.round(deg * 1e9) / 1e9 % 360, origin: rot(it.hatch.origin ?? [0, 0], c, a) } };
  }
  if (it.kind === 'arc') return { ...it, pts, a0: (it.a0 ?? 0) + a, a1: (it.a1 ?? 0) + a };
  if (it.kind === 'text' || it.kind === 'mtext' || it.kind === 'insert' || it.kind === 'attdef') return { ...it, pts, rot: (it.rot ?? 0) + a };
  if (it.kind === 'ellipse' && it.ax) return { ...it, pts, ax: rot(it.ax, [0, 0], a) };
  if (it.kind === 'dim' && it.dir !== undefined) return { ...it, pts, dir: it.dir + a };
  return { ...it, pts };
}

/** A rectangle from two opposite corners, as a closed polyline. */
export const rectangle = (a: Pt, b: Pt): Pt[] => [a, [b[0], a[1]], b, [a[0], b[1]]];

/** The circle through three points (centre, radius), or undefined when they are in line. */
export function circleThrough(a: Pt, b: Pt, c: Pt): { c: Pt; r: number } | undefined {
  const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
  if (Math.abs(d) < 1e-9) return undefined;
  const a2 = a[0] ** 2 + a[1] ** 2, b2 = b[0] ** 2 + b[1] ** 2, c2 = c[0] ** 2 + c[1] ** 2;
  const x = (a2 * (b[1] - c[1]) + b2 * (c[1] - a[1]) + c2 * (a[1] - b[1])) / d;
  const y = (a2 * (c[0] - b[0]) + b2 * (a[0] - c[0]) + c2 * (b[0] - a[0])) / d;
  return { c: [x, y], r: dist([x, y], a) };
}

/** An arc through start, a point on it, and end: centre in pts[0], start / end angles (anticlockwise). */
export function arcThrough(s: Pt, m: Pt, e: Pt): Omit<SketchItem, 'id' | 'layer'> | undefined {
  const c = circleThrough(s, m, e);
  if (!c) return undefined;
  const ang = (p: Pt) => Math.atan2(p[1] - c.c[1], p[0] - c.c[0]);
  let a0 = ang(s), a1 = ang(e);
  const am = ang(m);
  const norm = (x: number) => ((x % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  // Anticlockwise from a0 to a1 must pass the middle point; else the arc runs the other way.
  if (norm(am - a0) > norm(a1 - a0)) [a0, a1] = [a1, a0];
  return { kind: 'arc', pts: [c.c], r: c.r, a0, a1 };
}

/** The circle with two points at the ends of a diameter. */
export const circle2P = (a: Pt, b: Pt): { c: Pt; r: number } => ({ c: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], r: dist(a, b) / 2 });
/** An arc from its start, round its centre, anticlockwise to the direction of `end` (its radius is the start's). */
export function arcStartCentreEnd(s: Pt, c: Pt, e: Pt): Omit<SketchItem, 'id' | 'layer'> | undefined {
  const r = dist(s, c);
  if (r < 1e-9 || dist(e, c) < 1e-9) return undefined;
  return { kind: 'arc', pts: [c], r, a0: Math.atan2(s[1] - c[1], s[0] - c[0]), a1: Math.atan2(e[1] - c[1], e[0] - c[0]) };
}
/** A regular polygon of `n` sides round a centre: its corners on the circle through `at` (inscribed), or the middles
 * of its sides there (circumscribed); one corner (or side middle) towards `at`. */
export function polygonPts(c: Pt, at: Pt, n: number, inscribed = true): Pt[] {
  const r0 = dist(c, at), a0 = Math.atan2(at[1] - c[1], at[0] - c[0]);
  const r = inscribed ? r0 : r0 / Math.cos(Math.PI / n), start = inscribed ? a0 : a0 + Math.PI / n;
  return Array.from({ length: n }, (_, i) => [c[0] + r * Math.cos(start + (2 * Math.PI * i) / n), c[1] + r * Math.sin(start + (2 * Math.PI * i) / n)] as Pt);
}
/** An ellipse from its centre, the end of one axis, and a point at the distance of the other: the longer is the major
 * axis. Undefined when either is nil. */
export function ellipseOf(c: Pt, axisEnd: Pt, other: Pt): Omit<SketchItem, 'id' | 'layer'> | undefined {
  const u: Pt = [axisEnd[0] - c[0], axisEnd[1] - c[1]], a = Math.hypot(u[0], u[1]);
  if (a < 1e-9) return undefined;
  const b = Math.abs(((other[0] - c[0]) * -u[1] + (other[1] - c[1]) * u[0]) / a);
  if (b < 1e-9) return undefined;
  if (b <= a) return { kind: 'ellipse', pts: [c], ax: u, ratio: b / a };
  return { kind: 'ellipse', pts: [c], ax: [(-u[1] / a) * b, (u[0] / a) * b], ratio: a / b };
}
/** An ellipse's outline, `n` points round it (as a closed outline). */
export function ellipsePoints(it: Pick<SketchItem, 'pts' | 'ax' | 'ratio'>, n = 72): Pt[] {
  const c = it.pts[0], [ux, uy] = it.ax ?? [0, 0], k = it.ratio ?? 1, vx = -uy * k, vy = ux * k;
  return Array.from({ length: n }, (_, i) => { const t = (2 * Math.PI * i) / n; return [c[0] + ux * Math.cos(t) + vx * Math.sin(t), c[1] + uy * Math.cos(t) + vy * Math.sin(t)] as Pt; });
}
/** The bulge of a revision cloud's arcs: the tangent of a quarter of their angle (0.5: about 106°). */
export const CLOUD_BULGE = 0.5;
/** A revision cloud's arcs: each side of its outline split into pieces about `cloud` long; each piece an arc bulging out
 * of the outline. The points in order (closed) and the bulge after each (positive: anticlockwise). */
export function cloudLobes(it: Pick<SketchItem, 'pts' | 'cloud'>): { pts: Pt[]; bulge: number } {
  const o = it.pts, n = o.length, step = Math.max(it.cloud ?? 0, 1e-9);
  const area = o.reduce((t, q, i) => { const r = o[(i + 1) % n]; return t + q[0] * r[1] - r[0] * q[1]; }, 0);
  const pts: Pt[] = [];
  for (let i = 0; i < n; i += 1) {
    const a = o[i], b = o[(i + 1) % n], k = Math.max(1, Math.round(dist(a, b) / step));
    for (let j = 0; j < k; j += 1) pts.push([a[0] + ((b[0] - a[0]) * j) / k, a[1] + ((b[1] - a[1]) * j) / k]);
  }
  // Anticlockwise outline: out is to the right of each side, which a positive bulge bulges to.
  return { pts, bulge: area >= 0 ? CLOUD_BULGE : -CLOUD_BULGE };
}
/** The arc from a to b of a bulge: centre, radius and its angles anticlockwise. */
export function bulgeArc(a: Pt, b: Pt, bulge: number): { c: Pt; r: number; a0: number; a1: number } {
  const th = 4 * Math.atan(Math.abs(bulge)), chord = dist(a, b) || 1e-9, r = chord / (2 * Math.sin(th / 2));
  const ux = (b[0] - a[0]) / chord, uy = (b[1] - a[1]) / chord, h = r * Math.cos(th / 2) * Math.sign(bulge);
  const c: Pt = [(a[0] + b[0]) / 2 - uy * h, (a[1] + b[1]) / 2 + ux * h];
  const ang = (q: Pt) => Math.atan2(q[1] - c[1], q[0] - c[0]);
  return bulge > 0 ? { c, r, a0: ang(a), a1: ang(b) } : { c, r, a0: ang(b), a1: ang(a) };
}
/** True when a polyline has arc segments (a non-zero bulge): the tools that only handle straight sides refuse it. */
export const hasArcs = (it: Pick<SketchItem, 'bulges'>) => !!it.bulges?.some((b) => Math.abs(b) > 1e-12);
/** The middle of the arc from a to b of a bulge, on the arc itself. */
export function arcMid(a: Pt, b: Pt, bulge: number): Pt {
  const q = bulgeArc(a, b, bulge), m = q.a0 + 2 * Math.atan(Math.abs(bulge));
  return [q.c[0] + q.r * Math.cos(m), q.c[1] + q.r * Math.sin(m)];
}

/** The ends a dimension line can have: the usual CAD arrowheads, drawn as lines (filled ones filled with lines) so
 * they print and save the same. */
export type DimArrow = 'closed' | 'filled' | 'open' | 'open30' | 'open90' | 'tick' | 'archTick' | 'dot' | 'dotFilled' | 'dotSmall' | 'box' | 'boxFilled' | 'none';
export type DimUnit = 'm' | 'cm' | 'mm';
/** How a dimension writes its length: unit and decimal places, a measurement scale (DIMLFAC), rounding to a step (in
 * the unit), trailing zeros dropped, a decimal comma, and text before and after. */
export interface DimFormat { unit?: DimUnit; decimals?: number; scale?: number; round?: number; trimZeros?: boolean; comma?: boolean; prefix?: string; suffix?: string }
/** A dimension drawn with a dimension style (drawing units): its arrows (a tick, a closed arrow, a dot…; the second
 * end's when it differs) and their size, the gap left at the points measured, how far the extension lines run past
 * the dimension line, how the length is written, and where the text goes. Fields left out draw as before they were
 * added: text over the line on the side away from the points, aligned with it and centred along it. */
export interface DimLook extends DimFormat {
  arrow: DimArrow; size: number; off: number; ext: number;
  arrow2?: DimArrow;
  /** Above the line (as the text reads), centred in a break of it, or below it. */
  textPos?: 'above' | 'centered' | 'below';
  /** Next to the first or the second extension line rather than centred. */
  textAlong?: 'first' | 'second';
  /** Text horizontal whatever the line's angle. */
  textFlat?: boolean;
  /** Gap between the text and the dimension line. */
  gap?: number;
  /** The dimension line past the extension lines (with ticks). */
  dle?: number;
  hideExt1?: boolean;
  hideExt2?: boolean;
}
const UNIT_PER_M: Record<DimUnit, number> = { m: 1, cm: 100, mm: 1000 };
/** A length in metres as a dimension of a style writes it. */
export function dimLength(lengthM: number, s: DimFormat): string {
  const dec = Math.max(0, Math.min(4, Math.round(s.decimals ?? 2)));
  let v = lengthM * UNIT_PER_M[s.unit ?? 'm'] * (s.scale && s.scale > 0 ? s.scale : 1);
  if (s.round && s.round > 0) v = Math.round(v / s.round) * s.round;
  let t = v.toFixed(dec);
  if (/^-0(\.0*)?$/.test(t)) t = t.slice(1);
  if (s.trimZeros && t.includes('.')) t = t.replace(/\.?0+$/, '');
  if (s.comma) t = t.replace('.', ',');
  return `${s.prefix ?? ''}${t}${s.suffix ?? ''}`;
}
/** A look at k times its size (scaled, or in metres for the sheets). */
export const scaleLook = (l: DimLook, k: number): DimLook => ({
  ...l, size: l.size * k, off: l.off * k, ext: l.ext * k, ...(l.gap !== undefined ? { gap: l.gap * k } : {}), ...(l.dle !== undefined ? { dle: l.dle * k } : {})
});
/** In a dimension's typed text, stands for its measured value ("<> mm" reads the measure, then mm, as the points move). */
export const MEASURED = '<>';
/** A dimension's text: its own when it has one (typed over, or one drawn before styles, which keeps the text it was
 * drawn with), with `<>` in it standing for the measure; else, for one of a style, its length measured now in the
 * style's unit and decimals. */
export function dimLabel(it: SketchItem, metresPerUnit: number): string {
  if (it.text && !it.text.includes(MEASURED)) return it.text;
  const measured = it.dimKind === 'angular' ? dimAngle(dimMeasure(it), it.look) : (() => {
    const len = dimMeasure(it) * metresPerUnit, pre = it.dimKind === 'radius' ? 'R' : it.dimKind === 'diameter' ? 'Ø' : '';
    return pre + (it.look ? dimLength(len, it.look) : len.toFixed(2));
  })();
  return it.text ? it.text.split(MEASURED).join(measured) : measured;
}
/** A text or dimension with the text typed over it (TEXTEDIT, a double-click on it): a text keeps its own when nothing
 * is typed; a dimension's typed text is its override, and blank (or `<>` alone) gives the measured value back — one of a
 * style, or a radius, diameter or angle, is measured again as drawn; one drawn before styles gets its length (metres). */
export function withText(it: SketchItem, s: string, metresPerUnit = 1): SketchItem {
  const t = s.trim();
  if (it.kind === 'text') return t && s !== it.text ? { ...it, text: s } : it;
  if (it.kind !== 'dim') return it;
  if (t && t !== MEASURED) return t === it.text ? it : { ...it, text: t };
  if (it.look || it.dimKind) { if (it.text === undefined) return it; const { text: _t, ...rest } = it; return rest; }
  return { ...it, text: (dimMeasure(it) * metresPerUnit).toFixed(2) };
}
/** An angle in degrees as a dimension writes it: the style's decimals (2 without a style), trailing zeros dropped and a
 * decimal comma as the style says, then °. */
export function dimAngle(deg: number, s?: DimFormat): string {
  const dec = Math.max(0, Math.min(4, Math.round(s?.decimals ?? 2)));
  let t = deg.toFixed(dec);
  if (s?.trimZeros && t.includes('.')) t = t.replace(/\.?0+$/, '');
  return `${s?.comma ? t.replace('.', ',') : t}°`;
}

/** What a dimension measures (drawing units): its points' distance, or for a linear one the distance along its line. */
export const dimMeasure = (it: Pick<SketchItem, 'pts' | 'dir' | 'dimKind'>): number => it.pts.length < 2 ? 0
  : it.dimKind === 'angular' ? (it.pts.length < 3 ? 0 : (angularArc(it).sweep * 180) / Math.PI)
  : it.dimKind ? dist(it.pts[0], it.pts[1]) * (it.dimKind === 'diameter' ? 2 : 1)
  : it.dir === undefined ? dist(it.pts[0], it.pts[1])
    : Math.abs((it.pts[1][0] - it.pts[0][0]) * Math.cos(it.dir) + (it.pts[1][1] - it.pts[0][1]) * Math.sin(it.dir));

/** The lines of one arrowhead with its tip at d, pointing out along dir (at2 steps along and across the line). */
export function arrowLines(kind: DimArrow, d: Pt, dir: number, size: number, at2: (d: Pt, a: number, b: number) => Pt): [Pt, Pt][] {
  const out: [Pt, Pt][] = [];
  const circle = (r: number) => {
    const k = 12;
    for (let i = 0; i < k; i += 1) {
      const t0 = (2 * Math.PI * i) / k, t1 = (2 * Math.PI * (i + 1)) / k;
      out.push([at2(d, r * Math.cos(t0), r * Math.sin(t0)), at2(d, r * Math.cos(t1), r * Math.sin(t1))]);
    }
  };
  const vee = (half: number, fill: boolean) => {
    const a = at2(d, dir * size, half), b = at2(d, dir * size, -half);
    out.push([d, a], [b, d]);
    if (fill) { out.push([a, b]); for (let i = 1; i < 6; i += 1) out.push([d, at2(d, dir * size, half - (2 * half * i) / 6)]); }
  };
  switch (kind) {
    case 'tick': case 'archTick': {
      const t = size / (2 * Math.SQRT2);
      out.push([at2(d, -t, -t), at2(d, t, t)]);
      // The architectural tick drawn heavier: two more strokes beside it.
      if (kind === 'archTick') { const w = size * 0.05; out.push([at2(d, -t + w, -t), at2(d, t + w, t)], [at2(d, -t - w, -t), at2(d, t - w, t)]); }
      break;
    }
    case 'closed': {
      const a = at2(d, dir * size, size / 6), b = at2(d, dir * size, -size / 6);
      out.push([d, a], [a, b], [b, d]);
      break;
    }
    case 'filled': vee(size / 6, true); break;
    case 'open': vee(size / 6, false); break;
    case 'open30': vee(size * Math.tan(Math.PI / 12), false); break;
    case 'open90': vee(size, false); break;
    case 'dot': circle(size / 4); break;
    case 'dotFilled': for (const f of [1, 0.75, 0.5, 0.25]) circle((size / 4) * f); break;
    case 'dotSmall': for (const f of [1, 0.5]) circle((size / 8) * f); break;
    case 'box': case 'boxFilled': {
      const h = size / 4, c = [at2(d, -h, -h), at2(d, h, -h), at2(d, h, h), at2(d, -h, h)];
      c.forEach((q, i) => out.push([q, c[(i + 1) % 4]]));
      if (kind === 'boxFilled') for (let i = 1; i < 4; i += 1) out.push([at2(d, -h + (h * i) / 2, -h), at2(d, -h + (h * i) / 2, h)]);
      break;
    }
    case 'none': break;
  }
  return out;
}

/** A dimension's text as laid out (drawing units): for a break in the line, or to keep horizontal text clear of it. */
export interface DimTextBox { w: number; h: number }

/** The lines of a dimension from p1 to p2 placed through `at`: extension lines, the dimension line, its ticks (or the
 * arrows of its look), and where its text goes (the middle of its baseline). Aligned with p1 → p2, or with a linear
 * dimension's line at angle `dir` (its extension lines square to it). With no look its sizes follow its length. */
export function dimensionLines(p1: Pt, p2: Pt, at: Pt, look?: DimLook, box?: DimTextBox, dir?: number): { lines: [Pt, Pt][]; text: Pt; angle: number; length: number } {
  let ux: number, uy: number, len: number;
  if (dir === undefined) { len = dist(p1, p2) || 1e-9; ux = (p2[0] - p1[0]) / len; uy = (p2[1] - p1[1]) / len; } // along
  else {
    ux = Math.cos(dir); uy = Math.sin(dir);
    const s = (p2[0] - p1[0]) * ux + (p2[1] - p1[1]) * uy;
    if (s < 0) { ux = -ux; uy = -uy; }
    len = Math.abs(s) || 1e-9;
  }
  const nx = -uy, ny = ux; // across
  // How far p2 is across the line from p1 (0 when aligned); the dimension line's side is away from both points.
  const t2 = dir === undefined ? 0 : (p2[0] - p1[0]) * nx + (p2[1] - p1[1]) * ny;
  const off = (at[0] - p1[0]) * nx + (at[1] - p1[1]) * ny, side = Math.sign((off - t2 / 2) || 1);
  const d1: Pt = [p1[0] + nx * off, p1[1] + ny * off], d2: Pt = [p2[0] + nx * (off - t2), p2[1] + ny * (off - t2)];
  // Each extension line runs from its point towards the dimension line and past it.
  const s1 = Math.sign(off || 1), s2 = Math.sign((off - t2) || 1), extLen = look ? look.ext : len * 0.02;
  const gap1 = look ? s1 * Math.min(look.off, Math.abs(off)) : 0, gap2 = look ? s2 * Math.min(look.off, Math.abs(off - t2)) : 0;
  const at2 = (d: Pt, a: number, b: number): Pt => [d[0] + ux * a + nx * b, d[1] + uy * a + ny * b];
  const ends: [Pt, Pt][] = [];
  if (!look) {
    const tick = len * 0.015;
    for (const d of [d1, d2]) ends.push([at2(d, -tick, -tick), at2(d, tick, tick)]);
  } else ends.push(...arrowLines(look.arrow, d1, 1, look.size, at2), ...arrowLines(look.arrow2 ?? look.arrow, d2, -1, look.size, at2));
  let lineAngle = Math.atan2(uy, ux);
  if (lineAngle > Math.PI / 2 || lineAngle < -Math.PI / 2) lineAngle += Math.PI; // keep the text readable
  const angle = look?.textFlat ? 0 : lineAngle;
  const size = look ? look.size : len * 0.015;
  const w = box?.w ?? 0, h = box?.h ?? 0, tgap = look?.gap ?? size * 0.25;
  // Along the line: centred, or next to an extension line (inside its arrow). Horizontal text takes up its width
  // along a horizontal line and its height (its capitals) along a vertical one.
  const half = look?.textFlat ? (Math.abs(ux) * w) / 2 + (Math.abs(uy) * h) / 2 : w / 2;
  const s = look?.textAlong === 'first' ? Math.min(len / 2, size * 1.5 + half) : look?.textAlong === 'second' ? Math.max(len / 2, len - size * 1.5 - half) : len / 2;
  const base: Pt = [d1[0] + ux * s, d1[1] + uy * s];
  const pos = look?.textPos;
  let text: Pt;
  if (!pos) {
    // Over the line on the side away from the points, its nearest edge half a size off the line. The text's point is
    // the middle of its baseline, so where that side is down as the text reads, the baseline goes a text height further
    // out; horizontal text beside a steep line also clears it by half its width across the line.
    const fx = nx * side, fy = ny * side;
    const up = -Math.sin(angle) * fx + Math.cos(angle) * fy, across = Math.cos(angle) * fx + Math.sin(angle) * fy;
    const lift = size * 0.5 + Math.max(0, -up) * h + (Math.abs(across) * w) / 2;
    text = [base[0] + fx * lift, base[1] + fy * lift];
  } else {
    // The side of the line that is up as the text reads, and how far the text's middle sits from the line.
    const upx = -Math.sin(lineAngle), upy = Math.cos(lineAngle);
    const clear = pos === 'centered' ? 0 : (tgap + (look?.textFlat ? (Math.abs(upx) * w) / 2 + (Math.abs(upy) * h) / 2 : h / 2)) * (pos === 'below' ? -1 : 1);
    // The baseline sits half the height below the middle (the capitals are the height), as the text reads.
    const bx = -Math.sin(angle), by = Math.cos(angle);
    text = [base[0] + upx * clear - (bx * h) / 2, base[1] + upy * clear - (by * h) / 2];
  }
  // The dimension line: past the extension lines by dle, broken round centred text.
  const dle = look?.dle ?? 0, a0 = -dle, a1 = len + dle;
  const dimLine: [Pt, Pt][] = [];
  if (pos === 'centered' && (w > 0 || h > 0)) {
    const g = half + tgap;
    if (s - g > a0) dimLine.push([at2(d1, a0, 0), at2(d1, s - g, 0)]);
    if (s + g < a1) dimLine.push([at2(d1, s + g, 0), at2(d1, a1, 0)]);
  } else dimLine.push(dle ? [at2(d1, a0, 0), at2(d1, a1, 0)] : [d1, d2]);
  const extLines: [Pt, Pt][] = [];
  if (!look?.hideExt1) extLines.push([[p1[0] + nx * gap1, p1[1] + ny * gap1], [d1[0] + nx * s1 * extLen, d1[1] + ny * s1 * extLen]]);
  if (!look?.hideExt2) extLines.push([[p2[0] + nx * gap2, p2[1] + ny * gap2], [d2[0] + nx * s2 * extLen, d2[1] + ny * s2 * extLen]]);
  return { lines: [...extLines, ...dimLine, ...ends], text, angle, length: len };
}

export { textWidth };
/** A dimension item laid out, its text measured with metresPerUnit: its lines, where its text goes, the text and its
 * height. */
export function dimOf(it: SketchItem, metresPerUnit: number) {
  const look = it.look;
  const label = look || it.dimKind || it.text?.includes(MEASURED) ? dimLabel(it, metresPerUnit) : it.text ?? '';
  const h = it.h ?? (it.dimKind === 'angular' ? angularArc(it).r : dimMeasure(it)) * 0.04;
  const box = { w: textWidth(label, h), h };
  const g: DimLines = it.dimKind === 'angular' ? angularDimLines(it, look, h) : it.dimKind ? radialDimLines(it, look)
    : { ...dimensionLines(it.pts[0], it.pts[1], it.pts[2], look, box, it.dir), arcs: [] };
  return { ...g, label, h };
}

/** What a dimension draws: its lines (extension lines, the dimension line, arrowheads), its arcs (an angular one's),
 * where its text sits and the angle it reads at, and what it measures (drawing units; degrees for an angle). */
export interface DimLines { lines: [Pt, Pt][]; arcs: { c: Pt; r: number; a0: number; a1: number }[]; text: Pt; angle: number; length: number }
/** A text angle that reads from the bottom or the right of the sheet. */
const readable = (a: number) => (a > Math.PI / 2 || a <= -Math.PI / 2 ? a + Math.PI : a);

/** A radius or diameter dimension (pts: the centre, a point on the arc or circle, the text's place): its line runs
 * along the radius through the text's place — a diameter's right across — with an arrowhead where it meets the arc or
 * circle (both ends for a diameter), and on out to the text when that lies outside. */
export function radialDimLines(it: SketchItem, look?: DimLook): DimLines {
  const [c, p, at] = it.pts, r = dist(c, p) || 1e-9, dia = it.dimKind === 'diameter';
  const d = dist(at, c), [ux, uy] = d > 1e-9 ? [(at[0] - c[0]) / d, (at[1] - c[1]) / d] : [(p[0] - c[0]) / r, (p[1] - c[1]) / r];
  const nx = -uy, ny = ux, size = look ? look.size : r * 0.1, outside = d > r;
  const q: Pt = [c[0] + ux * r, c[1] + uy * r], q2: Pt = [c[0] - ux * r, c[1] - uy * r];
  const at2 = (o: Pt, a: number, b: number): Pt => [o[0] + ux * a + nx * b, o[1] + uy * a + ny * b];
  const lines: [Pt, Pt][] = [[dia ? q2 : outside ? q : c, outside ? at : q]];
  // The arrowhead's tip at the arc or circle, its head along the line on the side the line comes from.
  if (look) {
    lines.push(...arrowLines(look.arrow, q, outside ? 1 : -1, size, at2));
    if (dia) lines.push(...arrowLines(look.arrow2 ?? look.arrow, q2, 1, size, at2));
  } else {
    const t = size / (2 * Math.SQRT2);
    for (const e of dia ? [q, q2] : [q]) lines.push([at2(e, -t, -t), at2(e, t, t)]);
  }
  // The text at its place, lifted off the line as it reads (flat when the style says so).
  const angle = look?.textFlat ? 0 : readable(Math.atan2(uy, ux)), lift = look?.gap ?? size * 0.25;
  return { lines, arcs: [], text: [at[0] - Math.sin(angle) * lift, at[1] + Math.cos(angle) * lift], angle, length: dia ? 2 * r : r };
}

/** An angular dimension's arc (pts: the vertex, a point on each line, the arc's place): anticlockwise from the first
 * line's direction to the second's when the arc's place lies within that sweep, else the other way round; its radius
 * is the arc place's distance from the vertex. */
export function angularArc(it: Pick<SketchItem, 'pts'>): { a0: number; sweep: number; r: number } {
  const [v, p1, p2, at] = it.pts;
  const ang = (q: Pt) => Math.atan2(q[1] - v[1], q[0] - v[0]), turn = (a: number) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const a1 = ang(p1), ccw = turn(ang(p2) - a1) || 2 * Math.PI, r = dist(at ?? p1, v) || 1e-9;
  if (!at || turn(ang(at) - a1) <= ccw) return { a0: a1, sweep: ccw, r };
  return { a0: a1 + ccw, sweep: 2 * Math.PI - ccw, r };
}

/** An angular dimension: an arc about the vertex through the arc's place, from one line round to the other the way the
 * place lies, arrowheads at its ends along it, extension lines from the points out to the arc where it lies beyond
 * them, and the angle written outside the middle of the arc (text height h). */
export function angularDimLines(it: SketchItem, look?: DimLook, h = 0): DimLines {
  const [v, p1, p2] = it.pts, { a0, sweep, r } = angularArc(it);
  const size = look ? look.size : r * 0.1, ext = look ? look.ext : r * 0.05, off = look ? look.off : 0;
  const onArc = (a: number, k = r): Pt => [v[0] + k * Math.cos(a), v[1] + k * Math.sin(a)];
  const lines: [Pt, Pt][] = [];
  for (const [p, hide] of [[p1, look?.hideExt1], [p2, look?.hideExt2]] as [Pt, boolean | undefined][]) {
    const dp = dist(p, v);
    if (hide || dp < 1e-9 || r <= dp + 1e-9) continue;
    const a = Math.atan2(p[1] - v[1], p[0] - v[0]);
    lines.push([onArc(a, dp + Math.min(off, r - dp)), onArc(a, r + ext)]);
  }
  // At an end of the arc: s steps along it (anticlockwise), b out along the radius.
  const along = (a: number) => (o: Pt, s: number, b: number): Pt => [o[0] - Math.sin(a) * s + Math.cos(a) * b, o[1] + Math.cos(a) * s + Math.sin(a) * b];
  const e0 = onArc(a0), a1 = a0 + sweep, e1 = onArc(a1);
  if (look) lines.push(...arrowLines(look.arrow, e0, 1, size, along(a0)), ...arrowLines(look.arrow2 ?? look.arrow, e1, -1, size, along(a1)));
  else { const t = size / (2 * Math.SQRT2); for (const [e, a] of [[e0, a0], [e1, a1]] as [Pt, number][]) lines.push([along(a)(e, -t, -t), along(a)(e, t, t)]); }
  // The text outside the middle of the arc, along it and readable: its baseline a gap out, or a text height further
  // when it reads towards the vertex, so it never lies over the arc.
  const am = a0 + sweep / 2, angle = look?.textFlat ? 0 : readable(am - Math.PI / 2), lift = look?.gap ?? size * 0.25;
  const inward = -Math.sin(angle) * Math.cos(am) + Math.cos(angle) * Math.sin(am) < 0;
  return { lines, arcs: [{ c: v, r, a0, a1 }], text: onArc(am, r + lift + (inward ? h : 0)), angle, length: (sweep * 180) / Math.PI };
}

/** A linear dimension's line from where it is dragged: horizontal when the point is above or below the two points,
 * vertical when it is beside them (whichever it is further out of the box round them). */
export function linearDir(p1: Pt, p2: Pt, at: Pt): number {
  const out = (k: 0 | 1) => Math.abs(at[k] - (p1[k] + p2[k]) / 2) - Math.abs(p2[k] - p1[k]) / 2;
  return out(1) >= out(0) ? 0 : Math.PI / 2;
}

/** The angle of a dimension's line: a linear one's own, an aligned one's along its points. */
export const dimDir = (it: Pick<SketchItem, 'pts' | 'dir'>): number => it.dir ?? Math.atan2(it.pts[1][1] - it.pts[0][1], it.pts[1][0] - it.pts[0][0]);

/** The next dimension of a chain from `base` to the point `to`, parallel to it with the same look:
 * - continue: from its second point, its line in line with the base's;
 * - baseline: from its first point, its line `spacing` further out than the base's.
 * Undefined when `to` measures nothing along the line. */
export function nextDim(base: SketchItem, to: Pt, mode: 'continue' | 'baseline', spacing: number): Omit<SketchItem, 'id'> | undefined {
  const [p1, p2, at] = base.pts;
  const dir = dimDir(base), ux = Math.cos(dir), uy = Math.sin(dir), nx = -uy, ny = ux;
  const from = mode === 'continue' ? p2 : p1;
  if (Math.abs((to[0] - from[0]) * ux + (to[1] - from[1]) * uy) < 1e-9) return undefined;
  // Across the line from p1: the base's line, and p2. Baseline steps out on the side away from the points.
  const off = (at[0] - p1[0]) * nx + (at[1] - p1[1]) * ny, t2 = (p2[0] - p1[0]) * nx + (p2[1] - p1[1]) * ny;
  const o = mode === 'continue' ? off : off + Math.sign((off - t2 / 2) || 1) * spacing;
  const { id: _id, text: _text, ...rest } = base;
  return { ...rest, pts: [from, to, [p1[0] + nx * o, p1[1] + ny * o]], dir };
}

/** The straight pieces an item is drawn with (arcs and circles stepped every 5°). A dimension's text is measured with
 * metresPerUnit (for the break round centred text). */
export function segmentsOf(it: SketchItem, metresPerUnit = 0.001, defs: CadBlockDef[] = []): [Pt, Pt][] {
  // An insert: the segments of what its block shows.
  if (it.kind === 'insert') return expandInsert(it, defs).flatMap((x) => segmentsOf(x, metresPerUnit, defs));
  const out: [Pt, Pt][] = [];
  const poly = (pts: Pt[], closed: boolean) => { for (let i = 0; i + 1 < pts.length; i += 1) out.push([pts[i], pts[i + 1]]); if (closed && pts.length > 2) out.push([pts[pts.length - 1], pts[0]]); };
  const arc = (c: Pt, r: number, a0: number, a1: number) => {
    let s = a1 - a0;
    while (s <= 0) s += 2 * Math.PI;
    const n = Math.max(8, Math.ceil(s / (Math.PI / 36)));
    const pts = Array.from({ length: n + 1 }, (_, i) => [c[0] + r * Math.cos(a0 + (s * i) / n), c[1] + r * Math.sin(a0 + (s * i) / n)] as Pt);
    poly(pts, false);
  };
  if (it.cloud) { const { pts, bulge } = cloudLobes(it); pts.forEach((a, i) => { const q = bulgeArc(a, pts[(i + 1) % pts.length], bulge); arc(q.c, q.r, q.a0, q.a1); }); }
  // A polyline with arc segments: each arc stepped, the straight sides as they are.
  else if (it.kind === 'pline' && hasArcs(it)) {
    const n = it.pts.length, m = it.closed && n > 2 ? n : n - 1;
    for (let i = 0; i < m; i += 1) { const a = it.pts[i], b = it.pts[(i + 1) % n], k = it.bulges?.[i] ?? 0; if (Math.abs(k) > 1e-12) { const q = bulgeArc(a, b, k); arc(q.c, q.r, q.a0, q.a1); } else out.push([a, b]); }
  }
  else if (it.kind === 'line' || it.kind === 'pline') poly(it.pts, !!it.closed);
  else if (it.kind === 'ellipse') poly(ellipsePoints(it), true);
  else if (it.kind === 'circle') arc(it.pts[0], it.r ?? 0, 0, 2 * Math.PI);
  else if (it.kind === 'arc') arc(it.pts[0], it.r ?? 0, it.a0 ?? 0, it.a1 ?? 0);
  else if (it.kind === 'dim') { const d = dimOf(it, metresPerUnit); out.push(...d.lines); for (const a of d.arcs) arc(a.c, a.r, a.a0, a.a1); }
  // A multileader: its legs, landing, arrowheads and frame (its words are drawn as a note's).
  else if (it.kind === 'mleader') out.push(...mleaderSegments(it));
  else if (it.kind === 'text' && it.frame) { const f = textFrameOf(it); if (f?.circle) arc(f.circle.c, f.circle.r, 0, 2 * Math.PI); else if (f?.pts) poly(f.pts, true); }
  for (const h of it.holes ?? []) poly(h, true);
  return out;
}

/** Layer of the cable tray runs drawn in Design CAD, and the usual tray widths (mm). */
export const TRAY_LAYER = 'E-TRAY';
export const TRAY_WIDTHS = [50, 100, 150, 200, 300, 450, 600, 750, 900];
/** Height of a tray run's label (mm, in the drawing's scale). */
export const TRAY_TEXT_MM = 150;

/** What a tray run carries, written in its label ("CT 300 POWER"). */
export const TRAY_SERVICES = ['Power', 'Lighting', 'ELV', 'Data', 'Fire alarm'];

/** The label of a tray run, "CT 300 POWER" (with its route once assigned), at the middle of its middle piece, along it
 * and never upside down. */
export function trayLabel(it: SketchItem): { at: Pt; text: string; rot: number } {
  const mid = Math.max(0, Math.floor((it.pts.length - 2) / 2)), a = it.pts[mid], b = it.pts[mid + 1] ?? a;
  let rot = Math.atan2(b[1] - a[1], b[0] - a[0]);
  if (rot > Math.PI / 2) rot -= Math.PI; else if (rot <= -Math.PI / 2) rot += Math.PI;
  const t = it.tray;
  return { at: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], text: `CT ${t?.widthMm ?? ''}${t?.service ? ` ${t.service.toUpperCase()}` : ''}${t?.route ? ` · ${t.route}` : ''}`, rot };
}

/** A tray run as a single line (design stage, not a shop drawing): its centreline broken at the middle for the label,
 * text `h` high, and where the label starts (bottom left) so it sits centred in the gap. A middle piece too short for
 * the label is not broken. */
export function trayLine(it: SketchItem, h: number): { pieces: Pt[][]; textAt: Pt } {
  const l = trayLabel(it), pts = it.pts;
  const w = textWidth(l.text, h), c = Math.cos(l.rot), s = Math.sin(l.rot);
  const textAt: Pt = [l.at[0] - (w / 2) * c + (h / 2) * s, l.at[1] - (w / 2) * s - (h / 2) * c];
  const mid = Math.max(0, Math.floor((pts.length - 2) / 2)), a = pts[mid], b = pts[mid + 1];
  const len = b ? dist(a, b) : 0, gap = w + h;
  if (!b || len <= gap) return { pieces: [pts], textAt };
  const at = (k: number): Pt => [a[0] + ((b[0] - a[0]) * k) / len, a[1] + ((b[1] - a[1]) * k) / len];
  return { pieces: [[...pts.slice(0, mid + 1), at((len - gap) / 2)], [at((len + gap) / 2), ...pts.slice(mid + 1)]], textAt };
}

/** Length of a tray run along its centreline (drawing units). */
export const trayLength = (it: SketchItem) => it.pts.slice(1).reduce((t, p, i) => t + dist(it.pts[i], p), 0);

/** Points the cursor snaps to on drawn items: endpoint (1), midpoint (2), centre (4), insertion (16), quadrant (64). */
export function snapPoints(items: SketchItem[], defs: CadBlockDef[] = []): { x: number; y: number; kind: number }[] {
  const out: { x: number; y: number; kind: number }[] = [];
  for (const it of items) {
    if (it.infinite) {
      // A ray has one true endpoint. An XLINE has no ends; its base is exposed as a node for useful construction snaps.
      out.push({ x: it.pts[0][0], y: it.pts[0][1], kind: it.infinite === 'ray' ? 1 : 32 });
    } else if (it.kind === 'line' || it.kind === 'pline') {
      it.pts.forEach((q) => out.push({ x: q[0], y: q[1], kind: 1 }));
      const n = it.pts.length;
      // A cloud's sides are arcs: no middles of its outline.
      if (!it.cloud) for (let i = 0; i + 1 < n + (it.closed ? 1 : 0); i += 1) {
        const a = it.pts[i], b = it.pts[(i + 1) % n], k = it.kind === 'pline' ? it.bulges?.[i] ?? 0 : 0;
        // An arc segment: its middle on the arc, and its centre.
        if (Math.abs(k) > 1e-12) { const m = arcMid(a, b, k), c = bulgeArc(a, b, k).c; out.push({ x: m[0], y: m[1], kind: 2 }, { x: c[0], y: c[1], kind: 4 }); }
        else out.push({ x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2, kind: 2 });
      }
    } else if (it.kind === 'circle') out.push({ x: it.pts[0][0], y: it.pts[0][1], kind: 4 });
    else if (it.kind === 'ellipse') {
      const c = it.pts[0], [ux, uy] = it.ax ?? [0, 0], k = it.ratio ?? 1;
      out.push({ x: c[0], y: c[1], kind: 4 }, ...[[ux, uy], [-ux, -uy], [-uy * k, ux * k], [uy * k, -ux * k]].map(([dx, dy]) => ({ x: c[0] + dx, y: c[1] + dy, kind: 64 })));
    }
    else if (it.kind === 'arc') {
      const c = it.pts[0], r = it.r ?? 0;
      out.push({ x: c[0], y: c[1], kind: 4 }, { x: c[0] + r * Math.cos(it.a0 ?? 0), y: c[1] + r * Math.sin(it.a0 ?? 0), kind: 1 }, { x: c[0] + r * Math.cos(it.a1 ?? 0), y: c[1] + r * Math.sin(it.a1 ?? 0), kind: 1 });
    } else if (it.kind === 'text') out.push({ x: it.pts[0][0], y: it.pts[0][1], kind: 16 });
    else if (it.kind === 'point') out.push({ x: it.pts[0][0], y: it.pts[0][1], kind: 32 }); // node
    else if (it.kind === 'attdef') out.push({ x: it.pts[0][0], y: it.pts[0][1], kind: 16 });
    // An insert: its insertion point, and the snaps of what its block shows.
    else if (it.kind === 'insert') out.push({ x: it.pts[0][0], y: it.pts[0][1], kind: 16 }, ...snapPoints(expandInsert(it, defs), defs));
    // A note: its anchor, and the corners of its box.
    else if (it.kind === 'mtext') out.push({ x: it.pts[0][0], y: it.pts[0][1], kind: 16 }, ...noteCorners(it).map((q) => ({ x: q[0], y: q[1], kind: 1 })));
    else if (it.kind === 'dim') out.push({ x: it.pts[0][0], y: it.pts[0][1], kind: 1 }, { x: it.pts[1][0], y: it.pts[1][1], kind: 1 });
    // A multileader: its arrowheads, the start of its landing and the landing's end.
    else if (it.kind === 'mleader') { const l = mleaderParts(it).landing; out.push(...it.pts.map((q) => ({ x: q[0], y: q[1], kind: 1 })), ...(l ? [{ x: l[1][0], y: l[1][1], kind: 1 }] : [])); }
    // A hatch's islands: their corners.
    for (const h of it.holes ?? []) h.forEach((q) => out.push({ x: q[0], y: q[1], kind: 1 }));
  }
  return out;
}

/** The drawn item nearest the point within `tol` (drawing units), or undefined. Texts by their box. */
export function itemAt(items: SketchItem[], at: Pt, tol: number, defs: CadBlockDef[] = []): SketchItem | undefined {
  let best: { it: SketchItem; d: number } | undefined;
  const segDist = (p: Pt, a: Pt, b: Pt) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
    return dist(p, [a[0] + t * dx, a[1] + t * dy]);
  };
  for (const it of items) {
    let d = Infinity;
    if (it.infinite) d = constructionDistance(it, at);
    else if (it.kind === 'text') {
      // By its box, wherever its anchor sits on it (justification).
      const { origin, w, h } = textBox(it);
      const a = -(it.rot ?? 0), x = at[0] - origin[0], y = at[1] - origin[1];
      const px = x * Math.cos(a) - y * Math.sin(a), py = x * Math.sin(a) + y * Math.cos(a);
      d = px >= -tol && px <= w + tol && py >= -tol && py <= h + tol ? 0 : Infinity;
    } else if (it.kind === 'mtext') d = noteHit(it, at, tol) ? 0 : Infinity;
    // A multileader: its words by their box, else its lines.
    else if (it.kind === 'mleader') { const n = mleaderNote(it); d = n && noteHit(n, at, tol) ? 0 : segmentsOf(it).reduce((m, [a, b]) => Math.min(m, segDist(at, a, b)), Infinity); }
    else if (it.kind === 'point') d = dist(at, it.pts[0]);
    else if (it.kind === 'insert') d = itemAt(expandInsert(it, defs), at, tol, defs) ? 0 : Infinity;
    // An attribute definition on the drawing: by the box of its tag.
    else if (it.kind === 'attdef') d = itemAt([attdefAsText(it)], at, tol) ? 0 : Infinity;
    else for (const [a, b] of segmentsOf(it)) d = Math.min(d, segDist(at, a, b));
    if (d <= tol && (!best || d < best.d)) best = { it, d };
  }
  return best?.it;
}

/** Drawn items as the engine writes them into a DXF (drawing units). */
export interface ShapeOut { layer: string; kind: 'line' | 'xline' | 'ray' | 'pline' | 'circle' | 'arc' | 'ellipse' | 'text' | 'mtext' | 'hatch' | 'point' | 'pointstyle' | 'insert' | 'blockdef' | 'attdef'; pts: Pt[]; mode?: number; name?: string; sc?: number; units?: number; items?: ShapeOut[]; tag?: string; prompt?: string; flags?: { invisible?: boolean; constant?: boolean; verify?: boolean; preset?: boolean; lock?: boolean }; atts?: ShapeOut[]; closed?: boolean; bulges?: number[]; r?: number; a0?: number; a1?: number; axis?: Pt; ratio?: number; text?: string; h?: number; rot?: number; just?: string; w?: number; lsp?: number; loops?: Pt[][]; solid?: boolean; lines?: { angle: number; base: Pt; offset: Pt; dashes: number[] }[]; id?: string; srcs?: string[]; hangle?: number; hscale?: number; color?: string; lt?: string; ltdash?: number[]; lw?: number }
export function shapesOut(items: SketchItem[], metresPerUnit: number, defs: CadBlockDef[] = []): ShapeOut[] {
  const unitsPerMm = 0.001 / metresPerUnit;
  const { fittings } = trayFittings(items, unitsPerMm);
  // Tray fittings are written as their labels at the joint ("Tee 300 × 150").
  const fittingTexts = fittings.map((f): ShapeOut => ({ layer: TRAY_LAYER, kind: 'text', pts: [[f.at[0] + 120 * unitsPerMm, f.at[1] + 120 * unitsPerMm]], text: fittingLabel(f), h: 100 * unitsPerMm, rot: 0 }));
  const one = (it: SketchItem): ShapeOut[] => {
    // A leader's arrowhead as a solid triangle, the size and shape the canvas draws (3 mm on paper at 1:100).
    if (it.leader && it.pts.length > 1) {
      const { leader: _l, ...line } = it, [a, b] = it.pts, ang = Math.atan2(a[1] - b[1], a[0] - b[0]), hd = 3 * 100 * unitsPerMm;
      const tip = (t: number): Pt => [a[0] - hd * Math.cos(ang + t), a[1] - hd * Math.sin(ang + t)];
      return [...one(line), { layer: it.layer, kind: 'hatch', pts: [], loops: [[a, tip(-0.3), tip(0.3)]], solid: true }];
    }
    if (it.kind === 'dim') {
      const d = dimOf(it, metresPerUnit);
      // A dimension of a style is written as measured now (in its unit and decimals) unless typed over; one drawn
      // before styles as the length in metres. Its text is centred on the middle of its baseline, as it is drawn.
      return [...d.lines.map((l): ShapeOut => ({ layer: it.layer, kind: 'line', pts: l })), ...d.arcs.map((a): ShapeOut => ({ layer: it.layer, kind: 'arc', pts: [a.c], r: a.r, a0: a.a0, a1: a.a1 })),
        { layer: it.layer, kind: 'text', pts: [d.text], text: it.look || it.dimKind ? d.label : `${(d.length * metresPerUnit).toFixed(2)}`, h: d.h, rot: d.angle, just: 'C' }];
    }
    if (it.tray) {
      // A single line broken at the middle for its label "CT 300 POWER" (with its route once assigned).
      const h = TRAY_TEXT_MM * unitsPerMm, { pieces, textAt } = trayLine(it, h), l = trayLabel(it);
      return [...pieces.map((q): ShapeOut => ({ layer: it.layer, kind: 'pline', pts: q })), { layer: it.layer, kind: 'text', pts: [textAt], text: l.text, h, rot: l.rot }];
    }
    if (it.hatch) {
      // A hatch with its outline (a circle as 128 sides), its islands and its pattern lines at the plan's 1:100 spacing,
      // as drawn; named for its pattern, with its angle (radians) and scale (drawing units per pattern unit).
      const solid = !!defOf(it.hatch).solid, unit = 100 * unitsPerMm;
      return [{ layer: it.layer, kind: 'hatch', pts: [], loops: [hatchOutlinePts(it), ...(it.holes ?? [])], solid, name: it.hatch.custom?.name ?? it.hatch.pattern.toUpperCase(), hangle: (it.hatch.angle * Math.PI) / 180, hscale: Math.max(0.2, it.hatch.scale) * unit,
        ...(it.assoc?.length ? { srcs: it.assoc } : {}), ...(solid ? {} : { lines: atOrigin(placedLines(it.hatch, unit), it.hatch.origin) }) }];
    }
    if (it.infinite) return [{ layer: it.layer, kind: it.infinite, pts: it.pts.slice(0, 2) }];
    if (it.kind === 'line' && it.pts.length > 2) return [{ layer: it.layer, kind: 'pline', pts: it.pts }];
    // A revision cloud as one closed polyline of arcs; an ellipse as an ellipse.
    if (it.cloud) { const c = cloudLobes(it); return [{ layer: it.layer, kind: 'pline', pts: c.pts, closed: true, bulges: c.pts.map(() => c.bulge) }]; }
    if (it.kind === 'ellipse') return it.ax ? [{ layer: it.layer, kind: 'ellipse', pts: it.pts, axis: it.ax, ratio: it.ratio ?? 1 }] : [];
    if (it.kind === 'point') return [{ layer: it.layer, kind: 'point', pts: it.pts }];
    // An insert of one of the drawing's blocks (the BLOCK records go with blockDefsOut).
    if (it.kind === 'insert') return it.block ? [{ layer: it.layer, kind: 'insert', pts: it.pts, name: it.block, sc: it.sc ?? 1, rot: it.rot ?? 0,
      // Its attributes as placed (ATTRIB entities after the INSERT), each with its value.
      atts: attributePlacements(it, defs).map(({ ad, value, at }): ShapeOut => ({ ...attdefOut(at), text: value, tag: ad.tag })) }] : [];
    // An attribute definition (ATTDEF): its tag, prompt, default and modes, drawn as text.
    if (it.kind === 'attdef') return [attdefOut(it)];
    // A note as an MTEXT: its words with their codes, the box's width and attachment.
    if (it.kind === 'mtext') return [{ layer: it.layer, kind: 'mtext', pts: it.pts, text: toDxfMtext(it.note ?? []), h: it.h, rot: it.rot, just: it.just ?? 'TL', w: it.w ?? 0, lsp: it.lsp ?? 1 }];
    // A multileader: its lines, and its words as one MTEXT.
    if (it.kind === 'mleader') {
      const n = mleaderNote(it);
      return [...mleaderSegments(it).map(([a, b]): ShapeOut => ({ layer: it.layer, kind: 'line', pts: [a, b] })),
        ...(n ? [{ layer: it.layer, kind: 'mtext' as const, pts: n.pts, text: toDxfMtext(n.note ?? []), h: n.h, rot: 0, just: n.just ?? 'ML', w: n.w ?? 0, lsp: 1 }] : [])];
    }
    if (it.kind === 'text') {
      // Its mask (a solid hatch on LV-MASK, written before it so it lies under), the text, then its frame.
      const f = textFrameOf(it);
      return [...(it.mask ? [{ layer: MASK_LAYER, kind: 'hatch' as const, pts: [], loops: [textCorners(it)], solid: true }] : []),
        { layer: it.layer, kind: 'text', pts: it.pts, text: it.text, h: it.h, rot: it.rot, ...(it.just ? { just: it.just } : {}) },
        ...(f?.circle ? [{ layer: it.layer, kind: 'circle' as const, pts: [f.circle.c], r: f.circle.r }] : f?.pts ? [{ layer: it.layer, kind: 'pline' as const, pts: f.pts, closed: true }] : [])];
    }
    // A polyline with arc segments: written with its bulges (one per point).
    if (it.kind === 'pline' && hasArcs(it)) return [{ layer: it.layer, kind: 'pline', pts: it.pts, closed: it.closed, bulges: it.pts.map((_, i) => it.bulges?.[i] ?? 0) }];
    return [{ layer: it.layer, kind: it.kind, pts: it.pts, closed: it.closed, r: it.r, a0: it.a0, a1: it.a1 }];
  };
  // Each shape carries its object's id (an associative hatch names the shapes it follows).
  // A line's own colour, linetype and lineweight (none: by layer). The linetype is the drawing's own name, else the app's
  // (its pattern in paper mm at the plan's 1:100, as the hatches, in drawing units, for a drawing that has none of that name).
  const styleOf = (it: SketchItem): Pick<ShapeOut, 'color' | 'lt' | 'ltdash' | 'lw'> => {
    const color = colourOut(it.color), lt = it.ltName ?? (it.lt ? it.lt.toUpperCase() : ''), dash = it.ltName || !it.lt ? [] : LINETYPES[it.lt]?.dash ?? [];
    return { ...(color ? { color } : {}), ...(lt ? { lt } : {}), ...(dash.length ? { ltdash: dash.map((d, i) => (i % 2 ? -d : d) * 100 * unitsPerMm) } : {}), ...(it.lw && it.lw > 0 ? { lw: Math.round(it.lw * 100) } : {}) };
  };
  return [...items.flatMap((it) => { const st = styleOf(it); return one(it).map((s): ShapeOut => ({ ...s, ...(s.layer === MASK_LAYER ? {} : st), id: it.id })); }), ...fittingTexts];
}

const attdefOut = (it: SketchItem): ShapeOut => ({ layer: it.layer, kind: 'attdef', pts: it.pts, text: it.text ?? '', h: it.h, rot: it.rot ?? 0, just: it.just ?? '', tag: it.tag ?? '', prompt: it.prompt ?? '', flags: { invisible: !!it.att?.invisible, constant: !!it.att?.constant, verify: !!it.att?.verify, preset: !!it.att?.preset, lock: !!it.att?.lock } });
/** The drawing's own blocks as BLOCK records for the DXF: each with its objects (relative to the base point). */
export const blockDefsOut = (defs: CadBlockDef[], metresPerUnit: number): ShapeOut[] => defs.map((d) => ({ layer: '', kind: 'blockdef', pts: [], name: d.name, units: d.units ?? 0, text: d.description ?? '', items: shapesOut(d.items, metresPerUnit, defs) }));
/** The drawing's point style for the DXF header ($PDMODE, $PDSIZE), written with the shapes. */
export const pointStyleOut = (s: PointStyle): ShapeOut => ({ layer: '', kind: 'pointstyle', pts: [], mode: s.mode, r: pdsizeOf(s) });

/** A point typed on the command line, in drawing units: "x,y" (absolute), "@dx,dy" (from the last point), "@d<angle"
 * (polar, degrees), or a plain distance along the cursor's direction from the last point (direct distance entry). */
export function typedPoint(text: string, last: Pt | undefined, cursor: Pt | null): Pt | undefined {
  const t = text.trim().replace(/\s+/g, '');
  const num = (s: string) => (/^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN);
  let m = /^@(-?[\d.]+)<(-?[\d.]+)$/.exec(t);
  if (m && last) { const d = num(m[1]), a = (num(m[2]) * Math.PI) / 180; if (Number.isFinite(d) && Number.isFinite(a)) return [last[0] + d * Math.cos(a), last[1] + d * Math.sin(a)]; }
  m = /^(@?)(-?[\d.]+),(-?[\d.]+)$/.exec(t);
  if (m) {
    const x = num(m[2]), y = num(m[3]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;
    if (m[1]) return last ? [last[0] + x, last[1] + y] : undefined;
    return [x, y];
  }
  const d = num(t);
  if (Number.isFinite(d) && last && cursor) {
    const l = dist(last, cursor);
    if (l < 1e-9) return undefined;
    return [last[0] + ((cursor[0] - last[0]) / l) * d, last[1] + ((cursor[1] - last[1]) / l) * d];
  }
  return undefined;
}
