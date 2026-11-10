import type { SketchItem } from '../types';
import { dimMeasure } from './cadSketch';
import { parseFrame, parseJust, rejustified } from './cadText';

type Pt = [number, number];

/** Design CAD → Properties palette: the geometry and text of drawn objects, read and set in metres (to the drawing's
 * units by `k`, metres per drawing unit) and degrees. An edit keeps the object's id, layer, tray route and cable, so
 * what links to it (schedules, fittings, circuits by feeder) stays. Several objects take the same value each. */

/** The kind a value belongs to: the Geometry section shows when all the objects are of one of these. */
export type GeomKind = 'line' | 'pline' | 'circle' | 'arc' | 'ellipse' | 'cloud' | 'tray' | 'cable' | 'text' | 'mtext' | 'dim' | 'dimang';
export const geomKind = (it: SketchItem): GeomKind => (it.tray ? 'tray' : it.cable ? 'cable' : it.cloud ? 'cloud' : it.dimKind === 'angular' ? 'dimang' : it.kind);
/** What an object is, as the palette and the toolbar beside it name it. */
export const kindLabel = (it: SketchItem) => (it.tray ? 'Cable tray' : it.cable ? 'Cable route' : it.cloud ? 'Revision cloud'
  : it.kind === 'dim' ? (it.dimKind ? { radius: 'Radius dimension', diameter: 'Diameter dimension', angular: 'Angular dimension' }[it.dimKind] : 'Dimension')
  : { line: 'Line', pline: it.closed ? 'Closed polyline' : 'Polyline', circle: 'Circle', arc: 'Arc', ellipse: 'Ellipse', text: 'Text', mtext: 'Note' }[it.kind]);

export type PropKey = 'sx' | 'sy' | 'ex' | 'ey' | 'len' | 'ang' | 'cx' | 'cy' | 'r' | 'a0' | 'a1' | 'rx' | 'ry' | 'arc' | 'vx' | 'vy' | 'closed' | 'width' | 'service'
  | 'text' | 'h' | 'rot' | 'just' | 'frame' | 'mask' | 'measured' | 'override';
export interface PropDef { key: PropKey; label: string; unit?: 'm' | 'deg'; ro?: boolean; text?: boolean }

const L = (key: PropKey, label: string, more: Partial<PropDef> = {}): PropDef => ({ key, label, unit: 'm', ...more });
const A = (key: PropKey, label: string, more: Partial<PropDef> = {}): PropDef => ({ key, label, unit: 'deg', ...more });
const T = (key: PropKey, label: string, more: Partial<PropDef> = {}): PropDef => ({ key, label, text: true, ...more });

/** The Geometry rows of a kind (a polyline's X and Y are those of the vertex shown); a line of several segments takes no
 * typed length or angle. */
export function geometryRows(kind: GeomKind, items: SketchItem[]): PropDef[] {
  const straight = items.every((it) => it.pts.length === 2);
  switch (kind) {
    case 'line': return [L('sx', 'Start X'), L('sy', 'Start Y'), L('ex', 'End X'), L('ey', 'End Y'), L('len', 'Length', { ro: !straight }), A('ang', 'Angle', { ro: !straight })];
    case 'circle': return [L('cx', 'Centre X'), L('cy', 'Centre Y'), L('r', 'Radius')];
    case 'arc': return [L('cx', 'Centre X'), L('cy', 'Centre Y'), L('r', 'Radius'), A('a0', 'Start angle'), A('a1', 'End angle')];
    case 'ellipse': return [L('cx', 'Centre X'), L('cy', 'Centre Y'), L('rx', 'Major radius'), L('ry', 'Minor radius'), A('ang', 'Rotation')];
    case 'cloud': return [L('vx', 'X'), L('vy', 'Y'), L('len', 'Outline length', { ro: true }), L('arc', 'Arc length')];
    case 'pline': return [L('vx', 'X'), L('vy', 'Y'), L('len', 'Length', { ro: true }), T('closed', 'Closed')];
    case 'tray': return [T('width', 'Width'), T('service', 'Service'), L('vx', 'X'), L('vy', 'Y'), L('len', 'Length', { ro: true })];
    case 'cable': return [L('vx', 'X'), L('vy', 'Y'), L('len', 'Length', { ro: true })];
    default: return [];
  }
}
/** The Text rows: contents, height and rotation; for a dimension its measured value and the text shown over it. */
export function textRows(kind: GeomKind): PropDef[] {
  if (kind === 'text') return [T('text', 'Contents'), L('h', 'Height'), A('rot', 'Rotation'), T('just', 'Justify'), T('frame', 'Frame'), T('mask', 'Mask')];
  if (kind === 'dim') return [L('measured', 'Measured', { ro: true }), T('override', 'Text override'), L('h', 'Text height')];
  if (kind === 'dimang') return [A('measured', 'Measured', { ro: true }), T('override', 'Text override'), L('h', 'Text height')];
  return [];
}

const len = (pts: Pt[], closed?: boolean) => pts.slice(1).reduce((t, q, i) => t + Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]), 0) + (closed && pts.length > 2 ? Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) : 0);
const deg = (a: number) => (((a * 180) / Math.PI) % 360 + 360) % 360;
const rad = (d: number) => (d * Math.PI) / 180;
const vIdx = (it: SketchItem, v: number) => Math.max(0, Math.min(it.pts.length - 1, v));
const measuredOf = (it: SketchItem) => dimMeasure(it);

/** A value of an object: metres or degrees as a number, else text (undefined when it has none). */
export function propValue(it: SketchItem, key: PropKey, k: number, v = 0): number | string | undefined {
  const p = it.pts, last = p[p.length - 1];
  switch (key) {
    case 'sx': return p[0][0] * k;
    case 'sy': return p[0][1] * k;
    case 'ex': return last[0] * k;
    case 'ey': return last[1] * k;
    case 'len': return len(p, it.closed) * k;
    case 'ang': return it.kind === 'ellipse' ? deg(Math.atan2(it.ax?.[1] ?? 0, it.ax?.[0] ?? 1)) : deg(Math.atan2(last[1] - p[0][1], last[0] - p[0][0]));
    case 'rx': return it.ax ? Math.hypot(it.ax[0], it.ax[1]) * k : undefined;
    case 'ry': return it.ax ? Math.hypot(it.ax[0], it.ax[1]) * (it.ratio ?? 1) * k : undefined;
    case 'arc': return it.cloud !== undefined ? it.cloud * k : undefined;
    case 'cx': return p[0][0] * k;
    case 'cy': return p[0][1] * k;
    case 'r': return (it.r ?? 0) * k;
    case 'a0': return deg(it.a0 ?? 0);
    case 'a1': return deg(it.a1 ?? 0);
    case 'vx': return p[vIdx(it, v)][0] * k;
    case 'vy': return p[vIdx(it, v)][1] * k;
    case 'closed': return it.closed ? 'Yes' : 'No';
    case 'just': return it.kind === 'text' ? it.just ?? 'L' : undefined;
    case 'frame': return it.kind === 'text' ? it.frame ?? 'none' : undefined;
    case 'mask': return it.kind === 'text' ? (it.mask ? 'Yes' : 'No') : undefined;
    case 'width': return it.tray ? String(it.tray.widthMm) : undefined;
    case 'service': return it.tray?.service ?? '';
    case 'text': return it.text ?? '';
    case 'h': return it.h !== undefined ? it.h * k : undefined;
    case 'rot': return deg(it.rot ?? 0);
    case 'measured': return it.dimKind === 'angular' ? measuredOf(it) : measuredOf(it) * k;
    // A dimension of a style has text only when typed over; one drawn before styles keeps its length as its text.
    case 'override': return it.look ? it.text ?? '' : it.text !== undefined && it.text !== (measuredOf(it) * k).toFixed(2) ? it.text : '';
  }
}

/** The object with a value set (metres or degrees, or text); undefined when it does not take it (the edit is refused). */
export function withProp(it: SketchItem, key: PropKey, value: number | string, k: number, v = 0): SketchItem | undefined {
  const n = typeof value === 'number' ? value : NaN, u = n / k;
  const num = Number.isFinite(n);
  const p = it.pts.map((q): Pt => [q[0], q[1]]), i = p.length - 1;
  const at = (j: number, x?: number, y?: number) => { p[j] = [x ?? p[j][0], y ?? p[j][1]]; return { ...it, pts: p }; };
  switch (key) {
    case 'sx': case 'cx': return num ? at(0, u) : undefined;
    case 'sy': case 'cy': return num ? at(0, undefined, u) : undefined;
    case 'ex': return num ? at(i, u) : undefined;
    case 'ey': return num ? at(i, undefined, u) : undefined;
    case 'vx': return num ? at(vIdx(it, v), u) : undefined;
    case 'vy': return num ? at(vIdx(it, v), undefined, u) : undefined;
    case 'len': case 'ang': {
      // An ellipse's rotation: its major axis turned to the angle.
      if (key === 'ang' && it.kind === 'ellipse') {
        if (!num || !it.ax) return undefined;
        const r = Math.hypot(it.ax[0], it.ax[1]);
        return { ...it, ax: [r * Math.cos(rad(n)), r * Math.sin(rad(n))] };
      }
      if (!num || it.kind !== 'line' || p.length !== 2) return undefined;
      const a = key === 'ang' ? rad(n) : Math.atan2(p[1][1] - p[0][1], p[1][0] - p[0][0]);
      const l = key === 'len' ? u : Math.hypot(p[1][0] - p[0][0], p[1][1] - p[0][1]);
      if (!(l > 0)) return undefined;
      return at(1, p[0][0] + l * Math.cos(a), p[0][1] + l * Math.sin(a));
    }
    case 'r': return num && u > 0 && (it.kind === 'circle' || it.kind === 'arc') ? { ...it, r: u } : undefined;
    // An ellipse's radii: the major one keeps the minor's length (the longer stays the major axis).
    case 'rx': case 'ry': {
      if (!num || !(u > 0) || it.kind !== 'ellipse' || !it.ax) return undefined;
      const a = Math.hypot(it.ax[0], it.ax[1]), b = a * (it.ratio ?? 1);
      const [na, nb] = key === 'rx' ? [u, b] : [a, u];
      const [ma, mb] = na >= nb ? [na, nb] : [nb, na], th = Math.atan2(it.ax[1], it.ax[0]) + (na >= nb ? 0 : Math.PI / 2);
      return { ...it, ax: [ma * Math.cos(th), ma * Math.sin(th)], ratio: mb / ma };
    }
    case 'arc': return num && u > 0 && it.cloud !== undefined ? { ...it, cloud: u } : undefined;
    case 'a0': return num && it.kind === 'arc' ? { ...it, a0: rad(n) } : undefined;
    case 'a1': return num && it.kind === 'arc' ? { ...it, a1: rad(n) } : undefined;
    case 'closed': {
      if (it.kind !== 'pline' || it.tray || it.cable) return undefined;
      const c = String(value) === 'Yes';
      if (c && p.length < 3) return undefined;
      const { closed: _c, ...rest } = it;
      return c ? { ...rest, closed: true } : rest;
    }
    case 'width': { const w = Number(value); return it.tray && w > 0 ? { ...it, tray: { ...it.tray, widthMm: w } } : undefined; }
    case 'service': {
      if (!it.tray) return undefined;
      const { service: _s, ...t } = it.tray, s = String(value).trim();
      return { ...it, tray: s ? { ...t, service: s } : t };
    }
    case 'text': return it.kind === 'text' && String(value).trim() ? { ...it, text: String(value) } : undefined;
    case 'h': return num && u > 0 && (it.kind === 'text' || it.kind === 'dim') ? { ...it, h: u } : undefined;
    case 'rot': return num && it.kind === 'text' ? { ...it, rot: rad(n) } : undefined;
    case 'just': { const j = parseJust(String(value)); return j && it.kind === 'text' ? rejustified(it, j) : undefined; }
    case 'frame': { const f = parseFrame(String(value)); if (!f || it.kind !== 'text') return undefined; const { frame: _f, ...rest } = it; return f === 'none' ? rest : { ...rest, frame: f }; }
    case 'mask': { if (it.kind !== 'text') return undefined; const { mask: _m, ...rest } = it; return String(value) === 'Yes' ? { ...rest, mask: true } : rest; }
    case 'override': {
      if (it.kind !== 'dim') return undefined;
      const t = String(value).trim();
      if (t) return { ...it, text: t };
      // Blank: one of a style (or a radius, diameter or angle) is measured again in its unit and decimals; one drawn
      // before styles gets its length.
      if (it.look || it.dimKind) { const { text: _t, ...rest } = it; return rest; }
      return { ...it, text: (measuredOf(it) * k).toFixed(2) };
    }
    default: return undefined;
  }
}

/** The value shown for several objects: the one they share, else 'varies'. */
export function sharedValue(items: SketchItem[], key: PropKey, k: number, v = 0): number | string | undefined | 'varies' {
  const vals = items.map((it) => propValue(it, key, k, v));
  const first = vals[0];
  const eq = (a: typeof first, b: typeof first) => (typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(a)) : a === b);
  return vals.every((x) => eq(x, first)) ? first : 'varies';
}

/** The value as shown: metres to 2 decimals, degrees to 1. */
export const shownValue = (def: PropDef, v: number | string | undefined) =>
  v === undefined ? '' : typeof v === 'string' ? v : def.unit === 'deg' ? `${v.toFixed(1)}°` : def.key === 'len' || def.key === 'measured' ? `${v.toFixed(2)} m` : v.toFixed(2);

/** A typed value for a row: a number for metres and degrees (a comma as the decimal mark, the unit left off), else the
 * text; undefined when it is not a number. */
export function parseTyped(def: PropDef, text: string): number | string | undefined {
  if (def.text) return text;
  const n = Number(text.trim().replace(/\s*(m|°|deg)$/i, '').replace(',', '.'));
  return text.trim() && Number.isFinite(n) ? n : undefined;
}

/** The kinds of the objects picked, with their counts, for the palette's drop-down: All first. */
export function kindChoices(items: SketchItem[]): { id: string; label: string; n: number }[] {
  const by = new Map<string, number>();
  for (const it of items) by.set(kindLabel(it), (by.get(kindLabel(it)) ?? 0) + 1);
  return [{ id: '', label: 'All', n: items.length }, ...[...by].map(([id, n]) => ({ id, label: id, n }))];
}
