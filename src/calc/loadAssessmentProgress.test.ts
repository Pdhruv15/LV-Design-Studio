import { describe, expect, it } from 'vitest';
import { sampleProject } from '../data/sampleProject';
import { assess, DEFAULT_TYPES, newAssessment } from './loadAssessment';
import { buildingInfoOf, summarizeBuilding } from './building';
import { generateBuildingDbs } from './buildingDesign';
import { createMdbFromAssessment } from './loadAssessmentMdb';
import { conceptToDesign } from './loadAssessmentProgress';
import type { BuildingInfo, Project } from '../types';

// A tower with flats and a block of shops.
const building: BuildingInfo = {
  buildings: [
    { id: 'T', name: 'Tower A', levels: [
      { id: 'T-G', name: 'Ground', kind: 'ground', heightM: 4.5, grossM2: 1200 },
      { id: 'T-T', name: 'Typical floors', kind: 'typical', heightM: 3.6, grossM2: 1150, count: 20, units: [{ unitTypeId: 'U2', count: 8 }] }
    ] },
    { id: 'P', name: 'Podium shops', levels: [{ id: 'P-G', name: 'Ground', kind: 'ground', heightM: 5, grossM2: 1200 }] }
  ],
  unitTypes: [{ id: 'U2', name: '2BR apartment', rooms: [{ name: 'Living', type: 'living', areaM2: 74 }, { name: 'Bedrooms', type: 'bedroom', areaM2: 44 }] }],
  rooms: [
    { id: 'r1', buildingId: 'T', levelId: 'T-T', name: 'Corridor', type: 'lobby', areaM2: 150 },
    { id: 'r2', buildingId: 'T', levelId: 'T-G', name: 'Lobby', type: 'lobby', areaM2: 300 },
    { id: 'r5', buildingId: 'P', levelId: 'P-G', name: 'Shops', type: 'retail', areaM2: 1100 }
  ]
};
const a = newAssessment(DEFAULT_TYPES[0], {}, { types: [] });
const project: Project = { ...sampleProject, building, loadAssessment: a };

describe('conceptToDesign', () => {
  it('is undefined without an assessment', () => {
    expect(conceptToDesign({ ...project, loadAssessment: undefined })).toBeUndefined();
  });

  it('gives the assessment row as assess does', () => {
    const c = conceptToDesign(project)!;
    const r = assess(a);
    expect(c.rows[0]).toEqual({ key: 'assessment', connectedKw: r.connectedKw, demandKw: r.mdKw, buildings: [] });
    expect(c.mdKva).toBe(r.mdKva);
    expect(c.maxDemandKw).toBeGreaterThanOrEqual(1);
  });

  it('sums the rooms of every building and keeps one part each', () => {
    const c = conceptToDesign(project)!;
    const info = buildingInfoOf(project);
    const sums = info.buildings.map((b) => summarizeBuilding(info, b));
    const rooms = c.rows.find((x) => x.key === 'rooms')!;
    expect(rooms.connectedKw).toBeCloseTo(sums.reduce((s, x) => s + x.connectedKw, 0));
    expect(rooms.demandKw).toBeCloseTo(sums.reduce((s, x) => s + x.demandKw, 0));
    expect(rooms.buildings.map((p) => p.name)).toEqual(['Tower A', 'Podium shops']);
    expect(c.mdOfRooms).toBeCloseTo(assess(a).mdKw / rooms.demandKw);
  });

  it('counts only the buildings the assessment counts', () => {
    const c = conceptToDesign({ ...project, loadAssessment: { ...a, from: { buildingIds: ['T'] } } })!;
    expect(c.rows.find((x) => x.key === 'rooms')!.buildings.map((p) => p.id)).toEqual(['T']);
  });

  it('leaves out the assessment’s own lump feeders from the designed row', () => {
    const bare: Project = { ...project, feeders: [] };
    const made = createMdbFromAssessment({ ...bare, boards: [], feeders: [] }, a);
    expect(conceptToDesign({ ...made.project, building, loadAssessment: a })!.rows.some((x) => x.key === 'designed')).toBe(false);
  });

  it('shows the load designed so far and its share of the assessment', () => {
    const main = sampleProject.boards.find((b) => !b.upstreamId)!.id;
    const gen = generateBuildingDbs(project, 'T', main);
    const c = conceptToDesign(gen.project)!;
    const d = c.rows.find((x) => x.key === 'designed')!;
    expect(d.demandKw).toBeGreaterThan(0);
    expect(c.designedPct).toBeCloseTo((d.demandKw / assess(a).mdKw) * 100);
    expect(c.plannedDbs).toBeGreaterThan(0);
    expect(c.dbs).toBeLessThanOrEqual(c.plannedDbs);
    expect(d.buildings.every((p) => p.plannedDbs !== undefined)).toBe(true);
  });
});
