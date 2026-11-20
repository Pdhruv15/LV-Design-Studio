import { addElvRoute, checkElvRoute, ELV_ROUTE_RULES, elvRoutesOn } from '../../elv/routes';
import type { ElvSystem } from '../../elv/defaults';
import type { Project, SketchItem } from '../../types';
import { SYSTEM_LABEL } from './elvLabels';

type Pt = [number, number];
type Level = { building: string; level: string };

const LAYER: Record<ElvSystem, string> = {
  'fire-alarm': 'E-ELV-FA-ROUTE', cctv: 'E-ELV-CCTV-ROUTE', 'access-control': 'E-ELV-ACS-ROUTE', ict: 'E-ELV-ICT-ROUTE', 'public-address': 'E-ELV-PA-ROUTE'
};

export { checkElvRoute, ELV_ROUTE_RULES };
export type { ElvSystem };
export const elvRouteLayer = (system: ElvSystem) => LAYER[system];

/** Approved ELV routes as CAD overlay polylines in the open drawing's units. */
export function elvCadRouteSketches(p: Project, level: Level, metresPerUnit: number): SketchItem[] {
  return elvRoutesOn(p, level.building, level.level).map((route) => ({
    id: `_elv:${route.id}`, kind: 'pline', layer: LAYER[route.system], pts: route.points.map(([x, y]): Pt => [x / metresPerUnit, y / metresPerUnit])
  }));
}

export function elvCadRouteLabels(p: Project, level: Level): Record<string, string> {
  return Object.fromEntries(elvRoutesOn(p, level.building, level.level).map((route) => [`_elv:${route.id}`, `${route.id} · ${SYSTEM_LABEL[route.system]}`]));
}

export function approveElvCadRoute(p: Project, level: Level, system: ElvSystem, points: Pt[], preferredContainment: boolean) {
  return addElvRoute(p, { system, buildingId: level.building, levelId: level.level, points, lvClearanceM: ELV_ROUTE_RULES[system].separationM, ...(preferredContainment ? { preferredContainment: true } : {}) });
}
