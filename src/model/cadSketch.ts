import { fittingLabel, trayFittings } from './cadTrayFittings';
import { patternOf, placedLines } from './cadHatch';
import type { CadSketch, Project, SketchItem } from '../types';

type Pt = [number, number];

/** What the engineer draws in the CAD view over the architect's drawing (which stays as received): lines, polylines,
 * rectangles, circles, arcs, texts and dimensions, in drawing units, kept in the project per drawing file and written
 * into the drawing by Save DXF. Move, copy, rotate and erase work on them; they snap like the drawing. */

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
export const sketchOf = (p: Project, file: string): SketchItem[] => p.cadSketch?.find((s) => same(s.file, file))?.items ?? [];

/** The project with the drawing's drawn objects replaced. */
export function withSketchItems(p: Project, file: string, items: SketchItem[]): Project {
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

/** The item moved by (dx, dy). */
export const moved = (it: SketchItem, dx: number, dy: number): SketchItem => ({ ...it, pts: it.pts.map((q) => [q[0] + dx, q[1] + dy] as Pt) });
/** The item rotated by `a` radians about `c`. */
export function rotated(it: SketchItem, c: Pt, a: number): SketchItem {
  const pts = it.pts.map((q) => rot(q, c, a));
  if (it.kind === 'arc') return { ...it, pts, a0: (it.a0 ?? 0) + a, a1: (it.a1 ?? 0) + a };
  if (it.kind === 'text') return { ...it, pts, rot: (it.rot ?? 0) + a };
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
/** A dimension's text: its own when it has one (typed over, or one drawn before styles, which keeps the text it was
 * drawn with), else, for one of a style, its length measured now in the style's unit and decimals. */
export function dimLabel(it: SketchItem, metresPerUnit: number): string {
  if (it.text) return it.text;
  const len = dimMeasure(it) * metresPerUnit;
  return it.look ? dimLength(len, it.look) : len.toFixed(2);
}

/** What a dimension measures (drawing units): its points' distance, or for a linear one the distance along its line. */
export const dimMeasure = (it: Pick<SketchItem, 'pts' | 'dir'>): number => it.pts.length < 2 ? 0
  : it.dir === undefined ? dist(it.pts[0], it.pts[1])
    : Math.abs((it.pts[1][0] - it.pts[0][0]) * Math.cos(it.dir) + (it.pts[1][1] - it.pts[0][1]) * Math.sin(it.dir));

/** The lines of one arrowhead with its tip at d, pointing out along dir (at2 steps along and across the line). */
function arrowLines(kind: DimArrow, d: Pt, dir: number, size: number, at2: (d: Pt, a: number, b: number) => Pt): [Pt, Pt][] {
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
  // along a horizontal line and its height along a vertical one.
  const half = look?.textFlat ? (Math.abs(ux) * w) / 2 + Math.abs(uy) * h * 0.35 : w / 2;
  const s = look?.textAlong === 'first' ? Math.min(len / 2, size * 1.5 + half) : look?.textAlong === 'second' ? Math.max(len / 2, len - size * 1.5 - half) : len / 2;
  const base: Pt = [d1[0] + ux * s, d1[1] + uy * s];
  const pos = look?.textPos;
  let text: Pt;
  if (!pos) {
    const lift = side * size * 0.5;
    text = [base[0] + nx * lift, base[1] + ny * lift];
  } else {
    // The side of the line that is up as the text reads, and how far the text's middle sits from the line.
    const upx = -Math.sin(lineAngle), upy = Math.cos(lineAngle);
    const clear = pos === 'centered' ? 0 : (tgap + (look?.textFlat ? (Math.abs(upx) * w) / 2 + Math.abs(upy) * h * 0.35 : h * 0.35)) * (pos === 'below' ? -1 : 1);
    // The baseline sits 0.35 of the height below the middle, as the text reads.
    const bx = -Math.sin(angle), by = Math.cos(angle);
    text = [base[0] + upx * clear - bx * h * 0.35, base[1] + upy * clear - by * h * 0.35];
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

/** About how wide text of height h is (the sheets print it in Arial). */
export const textWidth = (s: string, h: number) => s.length * h * 0.6;
/** A dimension item laid out, its text measured with metresPerUnit: its lines, where its text goes, the text and its
 * height. */
export function dimOf(it: SketchItem, metresPerUnit: number) {
  const look = it.look;
  const label = look ? dimLabel(it, metresPerUnit) : it.text ?? '';
  const h = it.h ?? dimMeasure(it) * 0.04;
  const box = look && (look.textPos || look.textAlong) ? { w: textWidth(label, h), h } : undefined;
  return { ...dimensionLines(it.pts[0], it.pts[1], it.pts[2], look, box, it.dir), label, h };
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
export function segmentsOf(it: SketchItem, metresPerUnit = 0.001): [Pt, Pt][] {
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
  else if (it.kind === 'line' || it.kind === 'pline') poly(it.pts, !!it.closed);
  else if (it.kind === 'ellipse') poly(ellipsePoints(it), true);
  else if (it.kind === 'circle') arc(it.pts[0], it.r ?? 0, 0, 2 * Math.PI);
  else if (it.kind === 'arc') arc(it.pts[0], it.r ?? 0, it.a0 ?? 0, it.a1 ?? 0);
  else if (it.kind === 'dim') out.push(...dimOf(it, metresPerUnit).lines);
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
  const w = 0.6 * h * l.text.length, c = Math.cos(l.rot), s = Math.sin(l.rot);
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
export function snapPoints(items: SketchItem[]): { x: number; y: number; kind: number }[] {
  const out: { x: number; y: number; kind: number }[] = [];
  for (const it of items) {
    if (it.kind === 'line' || it.kind === 'pline') {
      it.pts.forEach((q) => out.push({ x: q[0], y: q[1], kind: 1 }));
      const n = it.pts.length;
      // A cloud's sides are arcs: no middles of its outline.
      if (!it.cloud) for (let i = 0; i + 1 < n + (it.closed ? 1 : 0); i += 1) { const a = it.pts[i], b = it.pts[(i + 1) % n]; out.push({ x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2, kind: 2 }); }
    } else if (it.kind === 'circle') out.push({ x: it.pts[0][0], y: it.pts[0][1], kind: 4 });
    else if (it.kind === 'ellipse') {
      const c = it.pts[0], [ux, uy] = it.ax ?? [0, 0], k = it.ratio ?? 1;
      out.push({ x: c[0], y: c[1], kind: 4 }, ...[[ux, uy], [-ux, -uy], [-uy * k, ux * k], [uy * k, -ux * k]].map(([dx, dy]) => ({ x: c[0] + dx, y: c[1] + dy, kind: 64 })));
    }
    else if (it.kind === 'arc') {
      const c = it.pts[0], r = it.r ?? 0;
      out.push({ x: c[0], y: c[1], kind: 4 }, { x: c[0] + r * Math.cos(it.a0 ?? 0), y: c[1] + r * Math.sin(it.a0 ?? 0), kind: 1 }, { x: c[0] + r * Math.cos(it.a1 ?? 0), y: c[1] + r * Math.sin(it.a1 ?? 0), kind: 1 });
    } else if (it.kind === 'text') out.push({ x: it.pts[0][0], y: it.pts[0][1], kind: 16 });
    else if (it.kind === 'dim') out.push({ x: it.pts[0][0], y: it.pts[0][1], kind: 1 }, { x: it.pts[1][0], y: it.pts[1][1], kind: 1 });
  }
  return out;
}

/** The drawn item nearest the point within `tol` (drawing units), or undefined. Texts by their box. */
export function itemAt(items: SketchItem[], at: Pt, tol: number): SketchItem | undefined {
  let best: { it: SketchItem; d: number } | undefined;
  const segDist = (p: Pt, a: Pt, b: Pt) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
    return dist(p, [a[0] + t * dx, a[1] + t * dy]);
  };
  for (const it of items) {
    let d = Infinity;
    if (it.kind === 'text') {
      const h = it.h ?? 1, w = 0.6 * h * (it.text ?? '').length;
      const a = -(it.rot ?? 0), x = at[0] - it.pts[0][0], y = at[1] - it.pts[0][1];
      const px = x * Math.cos(a) - y * Math.sin(a), py = x * Math.sin(a) + y * Math.cos(a);
      d = px >= -tol && px <= w + tol && py >= -tol && py <= h + tol ? 0 : Infinity;
    } else for (const [a, b] of segmentsOf(it)) d = Math.min(d, segDist(at, a, b));
    if (d <= tol && (!best || d < best.d)) best = { it, d };
  }
  return best?.it;
}

/** Drawn items as the engine writes them into a DXF (drawing units). */
export interface ShapeOut { layer: string; kind: 'line' | 'pline' | 'circle' | 'arc' | 'ellipse' | 'text' | 'hatch'; pts: Pt[]; closed?: boolean; bulges?: number[]; r?: number; a0?: number; a1?: number; axis?: Pt; ratio?: number; text?: string; h?: number; rot?: number; loops?: Pt[][]; solid?: boolean; lines?: { angle: number; base: Pt; offset: Pt; dashes: number[] }[] }
export function shapesOut(items: SketchItem[], metresPerUnit: number): ShapeOut[] {
  const unitsPerMm = 0.001 / metresPerUnit;
  const { fittings } = trayFittings(items, unitsPerMm);
  // Tray fittings are written as their labels at the joint ("Tee 300 × 150").
  const fittingTexts = fittings.map((f): ShapeOut => ({ layer: TRAY_LAYER, kind: 'text', pts: [[f.at[0] + 120 * unitsPerMm, f.at[1] + 120 * unitsPerMm]], text: fittingLabel(f), h: 100 * unitsPerMm, rot: 0 }));
  return [...items.flatMap((it): ShapeOut[] => {
    if (it.kind === 'dim') {
      const d = dimOf(it, metresPerUnit);
      // A dimension of a style is written as measured now (in its unit and decimals) unless typed over; one drawn
      // before styles as the length in metres.
      return [...d.lines.map((l): ShapeOut => ({ layer: it.layer, kind: 'line', pts: l })),
        { layer: it.layer, kind: 'text', pts: [d.text], text: it.look ? d.label : `${(d.length * metresPerUnit).toFixed(2)}`, h: d.h, rot: d.angle }];
    }
    if (it.tray) {
      // A single line broken at the middle for its label "CT 300 POWER" (with its route once assigned).
      const h = TRAY_TEXT_MM * unitsPerMm, { pieces, textAt } = trayLine(it, h), l = trayLabel(it);
      return [...pieces.map((q): ShapeOut => ({ layer: it.layer, kind: 'pline', pts: q })), { layer: it.layer, kind: 'text', pts: [textAt], text: l.text, h, rot: l.rot }];
    }
    if (it.hatch) {
      // A hatch with its outline (a circle as 128 sides) and its pattern lines at the plan's 1:100 spacing, as drawn.
      const loop: Pt[] = it.kind === 'circle'
        ? Array.from({ length: 128 }, (_, i): Pt => [it.pts[0][0] + (it.r ?? 0) * Math.cos((i * 2 * Math.PI) / 128), it.pts[0][1] + (it.r ?? 0) * Math.sin((i * 2 * Math.PI) / 128)])
        : it.pts;
      const solid = !!patternOf(it.hatch.pattern).solid;
      return [{ layer: it.layer, kind: 'hatch', pts: [], loops: [loop], solid, ...(solid ? {} : { lines: placedLines(it.hatch, 100 * unitsPerMm) }) }];
    }
    if (it.kind === 'line' && it.pts.length > 2) return [{ layer: it.layer, kind: 'pline', pts: it.pts }];
    // A revision cloud as one closed polyline of arcs; an ellipse as an ellipse.
    if (it.cloud) { const c = cloudLobes(it); return [{ layer: it.layer, kind: 'pline', pts: c.pts, closed: true, bulges: c.pts.map(() => c.bulge) }]; }
    if (it.kind === 'ellipse') return it.ax ? [{ layer: it.layer, kind: 'ellipse', pts: it.pts, axis: it.ax, ratio: it.ratio ?? 1 }] : [];
    return [{ layer: it.layer, kind: it.kind, pts: it.pts, closed: it.closed, r: it.r, a0: it.a0, a1: it.a1, text: it.text, h: it.h, rot: it.rot }];
  }), ...fittingTexts];
}

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
