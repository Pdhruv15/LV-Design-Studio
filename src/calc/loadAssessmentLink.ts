import type { Project } from '../types';
import { buildingInfoOf } from './building';
import { buildingFigures, isOutdoor, laSpaces, rowArea, rowsFromRooms, setAreaMode, type LaFromBuilding, type LaRow, type LaSpace, type LoadAssessment } from './loadAssessment';

/** Building information against the load assessment: the figures and the space mix
 * Building gives now, beside the ones the assessment holds, and what differs. Nothing
 * here changes the assessment on its own; updateFromBuilding does, when asked. */

export interface LaLinkFigure {
  key: 'gfa' | 'floors' | 'parking';
  building?: number; // absent: Building information has no such figure
  assessment: number;
  differs: boolean;
  /** Building against the assessment, in % of the assessment's figure. */
  pct?: number;
}

/** A space of the area schedule on either side. */
export interface LaLinkSpace { id: string; label: string; buildingM2?: number; assessmentM2?: number; differs: boolean }

export interface LaLink {
  /** Every building of the project, with its GFA above ground and whether the assessment counts it. */
  buildings: { id: string; name: string; counted: boolean; gfaM2: number }[];
  /** The counted building with the most floors above ground. */
  tallest?: string;
  /** Building information has a figure or a room for the counted buildings. */
  hasBuilding: boolean;
  figures: LaLinkFigure[];
  spaces: LaLinkSpace[];
  /** The area schedule Building gives (m² per space, rooms and flats above ground). */
  buildingRows: LaRow[];
  buildingAreaM2: number;
  mixDiffers: boolean;
  differs: boolean;
  /** Differs, and the user has not kept their own figures against this state of Building. */
  notice: boolean;
}

/** More than 10 % apart (and more than 1 m²) is a difference worth marking. */
const apart = (a: number, b: number) => Math.abs(a - b) > Math.max(1, 0.1 * Math.max(a, b));
const sameSpace = (a: LaSpace, b: LaSpace) => a.id === b.id || a.label.toLowerCase() === b.label.toLowerCase();

/** The state of Building information an assessment is compared with, as one string. */
function signature(f: { gfaM2?: number; floors?: number; parkingM2?: number }, rows: LaRow[]): string {
  return [Math.round(f.gfaM2 ?? 0), f.floors ?? 0, Math.round(f.parkingM2 ?? 0), ...rows.map((r) => `${r.id}:${r.areaM2 ?? 0}`).sort()].join('|');
}

export function laLink(project: Project, a: LoadAssessment, spaces: LaSpace[] = laSpaces()): LaLink {
  const info = buildingInfoOf(project);
  const ids = a.from?.buildingIds;
  const counted = (id: string) => !ids?.length || ids.includes(id);
  const each = info.buildings.map((b) => ({ b, f: buildingFigures(project, [b.id]) }));
  const top = each.filter((x) => counted(x.b.id) && x.f.floors).sort((x, y) => (y.f.floors ?? 0) - (x.f.floors ?? 0))[0];
  const f = buildingFigures(project, ids);
  const figure = (key: LaLinkFigure['key'], building: number | undefined, assessment: number): LaLinkFigure => ({
    key, building, assessment, differs: building !== undefined && Math.round(building) !== Math.round(assessment),
    pct: building !== undefined && assessment > 0 ? ((building - assessment) / assessment) * 100 : undefined
  });
  const figures = [figure('gfa', f.gfaM2, a.gfaM2), figure('floors', f.floors, a.floors), figure('parking', f.parkingM2, a.parkingM2)];
  const buildingRows = rowsFromRooms(project, spaces, ids);
  const used = new Set<LaRow>();
  const linkSpaces: LaLinkSpace[] = a.rows.map((r) => {
    const b = buildingRows.find((x) => !used.has(x) && sameSpace(x, r));
    if (b) used.add(b);
    const assessmentM2 = rowArea(a, r);
    return { id: r.id, label: r.label, buildingM2: b?.areaM2, assessmentM2, differs: b ? apart(b.areaM2 ?? 0, assessmentM2) : buildingRows.length > 0 && assessmentM2 > 1 && !isOutdoor(r) };
  });
  for (const b of buildingRows) if (!used.has(b)) linkSpaces.push({ id: b.id, label: b.label, buildingM2: b.areaM2, differs: (b.areaM2 ?? 0) > 1 });
  const mixDiffers = buildingRows.length > 0 && linkSpaces.some((x) => x.differs);
  const differs = figures.some((x) => x.differs) || mixDiffers;
  return {
    buildings: each.map(({ b, f: bf }) => ({ id: b.id, name: b.name, counted: counted(b.id), gfaM2: bf.gfaM2 ?? 0 })),
    tallest: top?.b.name, hasBuilding: figures.some((x) => x.building !== undefined) || buildingRows.length > 0,
    figures, spaces: linkSpaces, buildingRows, buildingAreaM2: buildingRows.reduce((s, r) => s + (r.areaM2 ?? 0), 0),
    mixDiffers, differs, notice: differs && a.from?.kept !== signature(f, buildingRows)
  };
}

const withFrom = (a: LoadAssessment, from: LaFromBuilding): LoadAssessment => {
  const clean: LaFromBuilding = { ...(from.buildingIds?.length ? { buildingIds: from.buildingIds } : {}), ...(from.kept ? { kept: from.kept } : {}) };
  const { from: _old, ...rest } = a;
  return Object.keys(clean).length ? { ...rest, from: clean } : rest;
};

/** The assessment with Building's figures and/or its area schedule taken over. A space the
 * assessment already has keeps its W/m² and Dwelling tick; the services, diversities and
 * supply settings are untouched. */
export function updateFromBuilding(project: Project, a: LoadAssessment, take: { figures: boolean; schedule: boolean }, spaces: LaSpace[] = laSpaces()): LoadAssessment {
  const ids = a.from?.buildingIds;
  let next = a;
  if (take.figures) {
    const f = buildingFigures(project, ids);
    if (f.gfaM2 || f.floors) next = { ...next, gfaM2: f.gfaM2 ?? next.gfaM2, floors: f.floors ?? next.floors, parkingM2: f.parkingM2 ?? 0 };
  }
  if (take.schedule) {
    const rows = rowsFromRooms(project, spaces, ids);
    if (rows.length) next = { ...setAreaMode(next, 'm2'), rows: rows.map((r) => { const own = a.rows.find((x) => sameSpace(x, r)); return own ? { ...own, pct: undefined, areaM2: r.areaM2 } : r; }) };
  }
  return withFrom(next, { buildingIds: ids });
}

/** Keeps the assessment's own figures: the notice stays away until Building information changes again. */
export function keepFigures(project: Project, a: LoadAssessment, spaces: LaSpace[] = laSpaces()): LoadAssessment {
  const ids = a.from?.buildingIds;
  return withFrom(a, { buildingIds: ids, kept: signature(buildingFigures(project, ids), rowsFromRooms(project, spaces, ids)) });
}

/** Sets which buildings the assessment counts (every building: no list kept). */
export function countBuildings(project: Project, a: LoadAssessment, ids: string[]): LoadAssessment {
  const all = buildingInfoOf(project).buildings.map((b) => b.id);
  const picked = all.filter((id) => ids.includes(id));
  return withFrom(a, { buildingIds: picked.length === all.length ? undefined : picked });
}
