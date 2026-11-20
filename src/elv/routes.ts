import type { Project } from '../types';
import type { ElvSystem } from './defaults';

type Pt = [number, number];

/** One approved system cable route. Points are metres on the level plan, independent of the drawing's units. */
export interface ElvRoute {
  id: string;
  system: ElvSystem;
  buildingId: string;
  levelId: string;
  points: Pt[];
  /** LV cable routes were treated as exclusion lines at this clearance when the proposal was made. */
  lvClearanceM: number;
  /** A matching ELV containment run was present and used as a routing preference. */
  preferredContainment?: boolean;
}

export interface ElvRouteRule {
  maxLengthM?: number;
  lengthRule: string;
  separationM: number;
  containment: string;
}

/** System-first constraints. A missing length limit means the chosen equipment/cable calculation must be reviewed. */
export const ELV_ROUTE_RULES: Record<ElvSystem, ElvRouteRule> = {
  'fire-alarm': { lengthRule: 'Verify loop resistance and panel manufacturer limit', separationM: 0.3, containment: 'Prefer fire alarm or ELV containment' },
  cctv: { maxLengthM: 100, lengthRule: 'PoE channel ≤ 100 m', separationM: 0.3, containment: 'Prefer ELV or data containment' },
  'access-control': { lengthRule: 'Verify lock voltage drop and controller manufacturer limit', separationM: 0.3, containment: 'Prefer ELV containment' },
  ict: { maxLengthM: 90, lengthRule: 'Permanent link ≤ 90 m', separationM: 0.3, containment: 'Prefer data or ELV containment' },
  'public-address': { lengthRule: 'Verify speaker-line voltage drop and amplifier zoning', separationM: 0.3, containment: 'Prefer ELV containment' }
};

export const elvRouteLength = (points: Pt[]) => points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - points[i][0], p[1] - points[i][1]), 0);
export const elvRouteBends = (points: Pt[]) => Math.max(0, points.length - 2);

export interface ElvRouteCheck { status: 'pass' | 'review' | 'fail'; text: string }
export function checkElvRoute(system: ElvSystem, lengthM: number): ElvRouteCheck {
  const rule = ELV_ROUTE_RULES[system];
  if (rule.maxLengthM !== undefined) return lengthM <= rule.maxLengthM + 1e-7
    ? { status: 'pass', text: `${lengthM.toFixed(1)} m of ${rule.maxLengthM} m maximum` }
    : { status: 'fail', text: `${lengthM.toFixed(1)} m exceeds the ${rule.maxLengthM} m maximum` };
  return { status: 'review', text: `${lengthM.toFixed(1)} m · ${rule.lengthRule}` };
}

export const elvRoutesOn = (p: Project, buildingId: string, levelId: string) =>
  (p.elvRoutes ?? []).filter((r) => r.buildingId === buildingId && r.levelId === levelId);

function nextRouteId(p: Project): number {
  return Math.max(p.elvRouteSeq ?? 0, ...(p.elvRoutes ?? []).map((r) => Number(/^ER(\d+)$/.exec(r.id)?.[1] ?? 0))) + 1;
}

/** Adds an approved route. Search grids and rejected alternatives are deliberately not stored. */
export function addElvRoute(p: Project, route: Omit<ElvRoute, 'id'>): { project: Project; route: ElvRoute } {
  if (route.points.length < 2 || route.points.some((q) => !Number.isFinite(q[0]) || !Number.isFinite(q[1])) || elvRouteLength(route.points) < 0.05) throw new Error('An ELV route needs two different finite points.');
  const check = checkElvRoute(route.system, elvRouteLength(route.points));
  if (check.status === 'fail') throw new Error(check.text);
  const n = nextRouteId(p);
  const added: ElvRoute = { ...route, id: `ER${n}`, points: route.points.map(([x, y]) => [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000]) };
  return { project: { ...p, elvRoutes: [...(p.elvRoutes ?? []), added], elvRouteSeq: n }, route: added };
}

export function removeElvRoute(p: Project, id: string): Project {
  if (!(p.elvRoutes ?? []).some((r) => r.id === id)) throw new Error(`No ELV route ${id}.`);
  return { ...p, elvRoutes: (p.elvRoutes ?? []).filter((r) => r.id !== id) };
}
