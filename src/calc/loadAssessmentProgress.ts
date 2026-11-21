import type { Project } from '../types';
import { assess } from './loadAssessment';
import { buildingInfoOf, summarizeBuilding } from './building';
import { floorLoads, plannedDbs } from './buildingDesign';
import { buildDashboard } from './dashboard';

export interface ConceptPart { id: string; name: string; connectedKw: number; demandKw: number; dbs?: number; plannedDbs?: number }
export interface ConceptRow { key: 'assessment' | 'rooms' | 'designed'; connectedKw: number; demandKw: number; buildings: ConceptPart[] }
export interface ConceptToDesign {
  mdKva: number;
  rows: ConceptRow[]; // 'assessment' always; 'rooms' and 'designed' only when they have a load
  maxDemandKw: number; // largest demandKw of the rows (at least 1)
  mdOfRooms?: number; // assessment demand ÷ rooms demand
  designedPct?: number; // designed demand ÷ assessment demand × 100
  dbs: number; plannedDbs: number; // DBs that exist / DBs planned, over the counted buildings
  boards: number; // boards in the project
}

/** The assessment, the rooms and the load schedules designed so far, side by side. Undefined without an assessment. */
export function conceptToDesign(project: Project): ConceptToDesign | undefined {
  const a = project.loadAssessment;
  if (!a) return undefined;
  const r = assess(a);
  const info = buildingInfoOf(project);
  const ids = a.from?.buildingIds;
  const counted = ids?.length ? info.buildings.filter((b) => ids.includes(b.id)) : info.buildings;
  const rows: ConceptRow[] = [{ key: 'assessment', connectedKw: r.connectedKw, demandKw: r.mdKw, buildings: [] }];

  const roomParts: ConceptPart[] = counted.map((b) => { const s = summarizeBuilding(info, b); return { id: b.id, name: b.name, connectedKw: s.connectedKw, demandKw: s.demandKw }; });
  const roomsConnected = roomParts.reduce((s, p) => s + p.connectedKw, 0);
  const roomsDemand = roomParts.reduce((s, p) => s + p.demandKw, 0);
  if (roomsConnected > 0) rows.push({ key: 'rooms', connectedKw: roomsConnected, demandKw: roomsDemand, buildings: roomParts });

  let dbs = 0, planned = 0;
  const designedParts: ConceptPart[] = [];
  for (const b of counted) {
    const specs = plannedDbs(project, b.id);
    const have = specs.filter((d) => project.boards.some((x) => x.id === d.id)).length;
    dbs += have; planned += specs.length;
    const fl = floorLoads(project, b.id);
    const c = fl.reduce((s, f) => s + f.connectedKw, 0), d = fl.reduce((s, f) => s + f.demandKw, 0);
    if (c > 0) designedParts.push({ id: b.id, name: b.name, connectedKw: c, demandKw: d, dbs: have, plannedDbs: specs.length });
  }
  let designed: ConceptRow | undefined;
  try {
    const dash = buildDashboard({ ...project, feeders: project.feeders.filter((f) => !f.fromRoom?.startsWith('la:') && !f.fromRoom?.startsWith('sp:')) });
    if (dash.demandKva > 0) designed = { key: 'designed', connectedKw: dash.connectedKw, demandKw: dash.demandKw, buildings: designedParts };
  } catch { /* an incomplete project has no designed figure */ }
  if (designed) rows.push(designed);

  const rooms = rows.find((x) => x.key === 'rooms');
  return {
    mdKva: r.mdKva, rows, maxDemandKw: Math.max(1, ...rows.map((x) => x.demandKw)),
    mdOfRooms: rooms && rooms.demandKw > 0 ? r.mdKw / rooms.demandKw : undefined,
    designedPct: designed && r.mdKw > 0 ? (designed.demandKw / r.mdKw) * 100 : undefined,
    dbs, plannedDbs: planned, boards: project.boards.length
  };
}
