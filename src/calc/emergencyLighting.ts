import { polygonArea } from '../model/cadBoundary';
import { inside } from '../model/cadMeasure';

/** Emergency escape lighting on the plan, after BS 5266-1:2016 and EN 1838:2013. The engineer draws the escape route
 * (a polyline along the corridor centre line, from the far end to the exit) and marks the points of emphasis; the app
 * puts a fitting at each exit, change of direction and point of emphasis, fills the gaps up to the fitting's spacing,
 * lays out open (anti-panic) areas, places exit signs and checks their viewing distance. Spacings come from the
 * manufacturer's spacing table for the mounting height — the defaults are only typical. 2D plan geometry, metres. */

type Pt = [number, number];

/** Points of emphasis (EN 1838 §4.1): a fitting within 2 m horizontally of each. */
export type EmphasisKind = 'exit' | 'final-exit' | 'stair' | 'level-change' | 'intersection' | 'call-point' | 'fire-equipment' | 'first-aid' | 'sign';
export const EMPHASIS_LABEL: Record<EmphasisKind, string> = {
  exit: 'Exit door', 'final-exit': 'Final exit (outside)', stair: 'Stair (each flight)', 'level-change': 'Change of floor level', intersection: 'Corridor intersection',
  'call-point': 'Fire alarm call point', 'fire-equipment': 'Fire-fighting equipment', 'first-aid': 'First aid point', sign: 'Safety sign'
};
/** Within this distance of the route a point of emphasis is lit from the route; further away it gets its own fitting. */
export const EMPHASIS_REACH_M = 2;

export interface EmergencyFittingData {
  /** Largest distance between two fittings on an escape route (1 lx on the centre line) — spacing table. */
  routeSpacingM: number;
  /** Largest distance from the last fitting to the end wall of a route. */
  routeEndM: number;
  /** Open area (0.5 lx): largest distance between fittings, and from a fitting to a wall. */
  openSpacingM: number;
  openWallM: number;
  watts: number;
}
/** Typical 3 W LED self-contained fitting at 2.5–3 m: replace with the manufacturer's spacing table. */
export const TYPICAL_FITTING: EmergencyFittingData = { routeSpacingM: 12, routeEndM: 4, openSpacingM: 9, openWallM: 3.5, watts: 3 };

export type FittingWhy = 'end' | 'direction' | 'emphasis' | 'spacing' | 'open-area';
export interface EmergencyFitting { at: Pt; why: FittingWhy; note?: string }
export interface ExitSign { at: Pt; kind: 'exit' | 'direction' }

const r2 = (v: number) => Math.round(v * 100) / 100;
const dist = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const round = (p: Pt): Pt => [r2(p[0]), r2(p[1])];

/** Where a point lies along a polyline: the distance along it (chainage), the nearest point and how far off it is. */
export function project(route: Pt[], p: Pt): { s: number; at: Pt; off: number } {
  let best = { s: 0, at: route[0], off: dist(route[0], p) }, s0 = 0;
  for (let i = 0; i + 1 < route.length; i++) {
    const a = route[i], b = route[i + 1], len = dist(a, b);
    const t = len ? Math.max(0, Math.min(1, ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / (len * len))) : 0;
    const at = lerp(a, b, t), off = dist(at, p);
    if (off < best.off - 1e-9) best = { s: s0 + t * len, at, off };
    s0 += len;
  }
  return best;
}

/** The point at a chainage along the polyline. */
export function pointAt(route: Pt[], s: number): Pt {
  let s0 = 0;
  for (let i = 0; i + 1 < route.length; i++) {
    const len = dist(route[i], route[i + 1]);
    if (s <= s0 + len + 1e-9) return lerp(route[i], route[i + 1], len ? (s - s0) / len : 0);
    s0 += len;
  }
  return route[route.length - 1];
}

/** A change of direction: the route turns by more than this at a vertex (smaller bends are one straight run). */
const TURN_DEG = 30;
const turnDeg = (a: Pt, b: Pt, c: Pt) => {
  const u = Math.atan2(b[1] - a[1], b[0] - a[0]), v = Math.atan2(c[1] - b[1], c[0] - b[0]);
  return Math.abs(((v - u + 3 * Math.PI) % (2 * Math.PI)) - Math.PI) * (180 / Math.PI);
};

export interface EscapeRouteResult {
  invalid?: string;
  lengthM: number;
  fittings: EmergencyFitting[];
  signs: ExitSign[];
  maxGapM: number; // largest distance between fittings along the route
  warnings: string[];
}

/** Fittings along one escape route. Its first and last points are its ends (the far end and the exit); the end
 * fittings sit within `routeEndM` of them. Points of emphasis within 2 m of the route are lit from it (a fitting at
 * their nearest point on the route); those further away get a fitting of their own, noted. Gaps longer than
 * `routeSpacingM` are split evenly. Exit signs go at the exit end and at each change of direction, and the distance
 * from any point of the route to a sign is checked against the sign's viewing distance. */
export function escapeRoute(route: Pt[], fitting: EmergencyFittingData, emphasis: { at: Pt; kind: EmphasisKind }[] = [], signViewM = 30): EscapeRouteResult {
  const lengthM = route.slice(1).reduce((t, q, i) => t + dist(route[i], q), 0);
  if (route.length < 2 || lengthM <= 0) return { invalid: 'Draw the escape route: at least two points, from the far end to the exit.', lengthM: 0, fittings: [], signs: [], maxGapM: 0, warnings: [] };
  if (!(fitting.routeSpacingM > 0) || !(fitting.routeEndM >= 0)) return { invalid: 'Give the fitting\'s route spacing from its spacing table.', lengthM, fittings: [], signs: [], maxGapM: 0, warnings: [] };
  const stops: { s: number; why: FittingWhy; note?: string }[] = [];
  const endS = Math.min(fitting.routeEndM, lengthM / 2);
  stops.push({ s: endS, why: 'end' }, { s: lengthM - endS, why: 'end', note: 'exit' });
  let s0 = 0;
  const turns: number[] = [];
  for (let i = 1; i + 1 < route.length; i++) {
    s0 += dist(route[i - 1], route[i]);
    if (turnDeg(route[i - 1], route[i], route[i + 1]) > TURN_DEG) { stops.push({ s: s0, why: 'direction' }); turns.push(i); }
  }
  const own: EmergencyFitting[] = [];
  for (const e of emphasis) {
    const p = project(route, e.at);
    if (p.off <= EMPHASIS_REACH_M) stops.push({ s: p.s, why: 'emphasis', note: EMPHASIS_LABEL[e.kind] });
    else own.push({ at: round(e.at), why: 'emphasis', note: `${EMPHASIS_LABEL[e.kind]} — ${p.off.toFixed(1)} m from the route: own fitting` });
  }
  // One fitting serves points that close together (within 0.5 m along the route); the first reason is kept.
  stops.sort((a, b) => a.s - b.s);
  const merged = stops.filter((x, i) => i === 0 || x.s - stops[i - 1].s > 0.5);
  const all = [...merged];
  for (let i = 0; i + 1 < merged.length; i++) {
    const gap = merged[i + 1].s - merged[i].s, n = Math.ceil(gap / fitting.routeSpacingM - 1e-9);
    for (let k = 1; k < n; k++) all.push({ s: merged[i].s + (gap * k) / n, why: 'spacing' });
  }
  all.sort((a, b) => a.s - b.s);
  const maxGapM = all.slice(1).reduce((m, x, i) => Math.max(m, x.s - all[i].s), 0);
  const fittings: EmergencyFitting[] = [...all.map((x) => ({ at: round(pointAt(route, x.s)), why: x.why, ...(x.note ? { note: x.note } : {}) })), ...own];
  const signs: ExitSign[] = [{ at: round(pointAt(route, lengthM - endS)), kind: 'exit' }, ...turns.map((i) => ({ at: round(route[i]), kind: 'direction' as const }))];
  // From any point the nearest sign: the far end to the first sign, and half of each gap between signs.
  const signS = signs.map((g) => project(route, g.at).s).sort((a, b) => a - b);
  const worst = Math.max(signS[0], ...signS.slice(1).map((s, i) => (s - signS[i]) / 2), lengthM - signS[signS.length - 1]);
  const warnings = [
    ...(worst > signViewM + 1e-9 ? [`A point on the route is ${worst.toFixed(1)} m from the nearest exit sign, more than its ${signViewM} m viewing distance: add a direction sign or use a larger sign.`] : []),
    ...(own.length ? [`${own.length} point${own.length === 1 ? ' is' : 's are'} more than ${EMPHASIS_REACH_M} m from the route and get${own.length === 1 ? 's its' : ' their'} own fitting.`] : [])
  ];
  return { lengthM, fittings, signs, maxGapM, warnings };
}

/** BS 5266-1: open (anti-panic) area lighting for rooms over 60 m², or smaller ones an escape route passes through. */
export const OPEN_AREA_M2 = 60;
export const needsOpenArea = (areaM2: number, onRoute = false) => onRoute || areaM2 > OPEN_AREA_M2;

/** Open area: a grid of fittings over the outline's extents with cells no larger than the spacing (or twice the wall
 * distance), each fitting in the middle of its cell so no wall is further than the wall distance; points outside an
 * L-shaped outline are left out. */
export function openArea(outline: Pt[], fitting: EmergencyFittingData): { fittings: EmergencyFitting[]; spacingXM: number; spacingYM: number; areaM2: number; invalid?: string } {
  const areaM2 = Math.abs(polygonArea(outline));
  if (outline.length < 3 || areaM2 <= 0) return { fittings: [], spacingXM: 0, spacingYM: 0, areaM2, invalid: 'The room has no outline on the plan: pick or trace it first.' };
  const cell = Math.min(fitting.openSpacingM, 2 * fitting.openWallM);
  if (!(cell > 0)) return { fittings: [], spacingXM: 0, spacingYM: 0, areaM2, invalid: 'Give the fitting\'s open-area spacing from its spacing table.' };
  const xs = outline.map((q) => q[0]), ys = outline.map((q) => q[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const nx = Math.max(1, Math.ceil((x1 - x0) / cell - 1e-9)), ny = Math.max(1, Math.ceil((y1 - y0) / cell - 1e-9));
  const fittings: EmergencyFitting[] = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const at: Pt = [x0 + ((i + 0.5) * (x1 - x0)) / nx, y0 + ((j + 0.5) * (y1 - y0)) / ny];
    if (inside(at, outline)) fittings.push({ at: round(at), why: 'open-area' });
  }
  if (!fittings.length) fittings.push({ at: round([xs.reduce((t, v) => t + v, 0) / xs.length, ys.reduce((t, v) => t + v, 0) / ys.length]), why: 'open-area' });
  return { fittings, spacingXM: (x1 - x0) / nx, spacingYM: (y1 - y0) / ny, areaM2 };
}

/** Viewing distance of an exit sign (EN 1838 §4.1, ISO 3864-1): d = z × h, z = 200 internally lit, 100 externally lit. */
export const signViewingM = (heightMm: number, internallyLit = true) => ((internallyLit ? 200 : 100) * heightMm) / 1000;

/** BS 5266-1 duration: 3 h where people sleep, where the building is reoccupied after an evacuation, and for most
 * premises in practice; 1 h only where evacuation is immediate and the building is not reoccupied until recharged. */
export const durationH = (sleeping: boolean, immediateEvacuation = false): 1 | 3 => (sleeping || !immediateEvacuation ? 3 : 1);
