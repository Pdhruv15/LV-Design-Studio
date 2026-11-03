import { buildingInfoOf, roomTypesOf } from './building';
import { estimateUf } from './lighting';
import { polygonArea } from '../model/cadBoundary';
import { inside } from '../model/cadMeasure';
import type { BuildingRoom, Project } from '../types';

/** Lighting of one room on the plan by the lumen method (CIBSE / IES average illuminance), for any room outline the
 * engineer has picked (rectangles, L-shapes, angled walls): the luminaire count, their positions on a grid inside the
 * outline, and the checks. The average only — uniformity and glare need a point-by-point study (DIALux / Relux). */

type Pt = [number, number];

export interface RoomLightingInput {
  ceilingM: number; workPlaneM: number; suspensionM: number;
  targetLux: number; lumens: number; watts: number; mf: number;
  /** Reflectance key from REFLECTANCES, used when uf is not given. */
  reflectance: string;
  /** Manufacturer UF; leave undefined to estimate from the reflectance table. */
  uf?: number;
  /** The luminaire's largest spacing-to-height ratio from its data sheet; spacing beyond it is flagged. */
  shrMax?: number;
  /** Lighting power density limit (W/m²), e.g. ASHRAE 90.1; flagged when exceeded. */
  lpdMax?: number;
}

export interface RoomLightingResult {
  invalid?: string;
  areaM2: number; perimeterM: number; hmM: number; k: number; uf: number; ufEstimated: boolean;
  required: number; count: number; points: Pt[];
  spacingXM: number; spacingYM: number; shr: number;
  achievedLux: number; totalW: number; wPerM2: number;
  warnings: string[];
}

const perimeter = (o: Pt[]) => o.reduce((s, q, i) => s + Math.hypot(o[(i + 1) % o.length][0] - q[0], o[(i + 1) % o.length][1] - q[1]), 0);
const r2 = (v: number) => Math.round(v * 100) / 100;

/** Room index K = 2A ÷ (Hm·P), the general form of L·W ÷ (Hm·(L + W)) for any outline. */
export const roomIndexOf = (areaM2: number, perimeterM: number, hmM: number) => (2 * areaM2) / (hmM * perimeterM);

/** At least n points inside the outline, each in the middle of a cell of a grid over the outline's extents, so a
 * rectangle gets half a spacing to the walls. The cells shrink in 2 % steps until n fit; points outside an L-shape
 * are left out. A room too small for any cell centre gets one point at its middle. */
export function gridInOutline(outline: Pt[], n: number): { points: Pt[]; spacingXM: number; spacingYM: number } {
  const xs = outline.map((q) => q[0]), ys = outline.map((q) => q[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const w = x1 - x0, h = y1 - y0;
  let s = Math.sqrt(Math.abs(polygonArea(outline)) / Math.max(1, n));
  let best = { points: [] as Pt[], spacingXM: w, spacingYM: h };
  for (let step = 0; step < 400 && n > 0; step++, s *= 0.98) {
    const nx = Math.max(1, Math.round(w / s)), ny = Math.max(1, Math.round(h / s));
    const points: Pt[] = [];
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const at: Pt = [x0 + ((i + 0.5) * w) / nx, y0 + ((j + 0.5) * h) / ny];
      if (inside(at, outline)) points.push([r2(at[0]), r2(at[1])]);
    }
    best = { points, spacingXM: w / nx, spacingYM: h / ny };
    if (points.length >= n) break;
  }
  if (!best.points.length && n > 0) best.points = [[r2(xs.reduce((t, v) => t + v, 0) / xs.length), r2(ys.reduce((t, v) => t + v, 0) / ys.length)]];
  return best;
}

/** N = E·A ÷ (Φ·UF·MF), rounded up and laid out inside the outline (metres on the level's plan). */
export function roomLighting(outline: Pt[], x: RoomLightingInput): RoomLightingResult {
  const areaM2 = Math.abs(polygonArea(outline));
  const perimeterM = outline.length >= 3 ? perimeter(outline) : 0;
  const hmM = x.ceilingM - x.suspensionM - x.workPlaneM;
  const empty: RoomLightingResult = { areaM2, perimeterM, hmM, k: NaN, uf: NaN, ufEstimated: false, required: NaN, count: 0, points: [], spacingXM: NaN, spacingYM: NaN, shr: NaN, achievedLux: NaN, totalW: 0, wPerM2: 0, warnings: [] };
  if (outline.length < 3 || areaM2 <= 0) return { ...empty, invalid: 'The room has no outline on the plan: pick or trace it first.' };
  if (hmM <= 0) return { ...empty, invalid: 'The luminaire must be above the working plane (ceiling − suspension − working plane > 0).' };
  if (!(x.lumens > 0) || !(x.mf > 0) || !(x.targetLux > 0)) return { ...empty, invalid: 'Give the target lux, the luminaire lumens and the maintenance factor.' };
  const k = roomIndexOf(areaM2, perimeterM, hmM);
  const ufEstimated = x.uf === undefined;
  const uf = x.uf ?? estimateUf(k, x.reflectance);
  const required = (x.targetLux * areaM2) / (x.lumens * uf * x.mf);
  const { points, spacingXM, spacingYM } = gridInOutline(outline, Math.max(1, Math.ceil(required - 1e-9)));
  const count = points.length;
  const achievedLux = (count * x.lumens * uf * x.mf) / areaM2;
  const totalW = count * x.watts;
  const wPerM2 = totalW / areaM2;
  const shr = Math.max(spacingXM, spacingYM) / hmM;
  const warnings = [
    ...(achievedLux < x.targetLux - 1e-9 ? [`${Math.round(achievedLux)} lx is below the ${x.targetLux} lx target: the outline leaves too few grid points; add luminaires by hand.`] : []),
    ...(x.shrMax && shr > x.shrMax + 1e-9 ? [`Spacing-to-height ratio ${shr.toFixed(2)} is above the luminaire's ${x.shrMax}: uniformity may be poor; use more, smaller luminaires.`] : []),
    ...(x.lpdMax && wPerM2 > x.lpdMax + 1e-9 ? [`${wPerM2.toFixed(1)} W/m² is above the ${x.lpdMax} W/m² limit of the room type.`] : []),
    ...(ufEstimated ? ['UF estimated for a typical direct LED luminaire; use the manufacturer\'s UF table for submission.'] : [])
  ];
  return { areaM2, perimeterM, hmM, k, uf, ufEstimated, required, count, points, spacingXM, spacingYM, shr, achievedLux, totalW, wPerM2, warnings };
}

/** Starting values for a room, for the engineer to change: target lux and LPD limit from its room type, ceiling
 * 0.6 m below the floor-to-floor height (2.4–3.5 m), 0.85 m working plane (0 for circulation, stores and car parks). */
export function roomLightingDefaults(p: Project, room: BuildingRoom): Pick<RoomLightingInput, 'ceilingM' | 'workPlaneM' | 'suspensionM' | 'targetLux' | 'mf' | 'reflectance' | 'lpdMax'> {
  const info = buildingInfoOf(p);
  const type = roomTypesOf(info).find((t) => t.id === room.type);
  const level = info.buildings.find((b) => b.id === room.buildingId)?.levels.find((l) => l.id === room.levelId);
  const ceilingM = level ? Math.min(3.5, Math.max(2.4, r2(level.heightM - 0.6))) : 2.8;
  const floorTask = /^(lobby|parking|store|plant)$/.test(room.type);
  return { ceilingM, workPlaneM: floorTask ? 0 : 0.85, suspensionM: 0, targetLux: type?.lux ?? 300, mf: 0.8, reflectance: '533', ...(type?.lpdMax ? { lpdMax: type.lpdMax } : {}) };
}
