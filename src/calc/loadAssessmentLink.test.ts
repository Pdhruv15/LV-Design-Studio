import { describe, expect, it } from 'vitest';
import { sampleProject } from '../data/sampleProject';
import { assess, DEFAULT_TYPES, newAssessment } from './loadAssessment';
import { countBuildings, keepFigures, laLink, updateFromBuilding } from './loadAssessmentLink';
import type { BuildingInfo, Project } from '../types';

// A tower with flats and two identical basements, and a block of shops.
const building: BuildingInfo = {
  buildings: [
    { id: 'T', name: 'Tower A', levels: [
      { id: 'T-B', name: 'B1–B2', kind: 'basement', heightM: 3.5, grossM2: 4200, count: 2 },
      { id: 'T-G', name: 'Ground', kind: 'ground', heightM: 4.5, grossM2: 1200 },
      { id: 'T-T', name: 'Typical floors', kind: 'typical', heightM: 3.6, grossM2: 1150, count: 20, units: [{ unitTypeId: 'U2', count: 8 }] },
      { id: 'T-R', name: 'Roof', kind: 'roof', heightM: 3, grossM2: 1000 }
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
const project: Project = { ...sampleProject, building };
// Started before the building was entered: the starting 24 000 m², 20 floors and 8 000 m² car park.
const a = newAssessment(DEFAULT_TYPES[0], {}, { types: [] });

describe('Building information against the load assessment', () => {
  it('lists the figures of every building beside the assessment’s and marks what differs', () => {
    const l = laLink(project, a);
    expect(l.buildings).toEqual([{ id: 'T', name: 'Tower A', counted: true, gfaM2: 25200 }, { id: 'P', name: 'Podium shops', counted: true, gfaM2: 1200 }]);
    expect(l.tallest).toBe('Tower A');
    expect(l.figures.map((f) => [f.key, f.building, f.assessment, f.differs])).toEqual([['gfa', 26400, 24000, true], ['floors', 22, 20, true], ['parking', 8400, 8000, true]]);
    expect(l.figures[0].pct).toBeCloseTo(10);
    expect(l.hasBuilding && l.differs && l.notice).toBe(true);
  });

  it('gives each space of the area schedule its Building m²', () => {
    const l = laLink(project, a);
    const of = (id: string) => l.spaces.find((s) => s.id === id)!;
    // Apartment: 78 % of 24 000 m² in the assessment, 160 flats × 118 m² in Building: within 10 %.
    expect(of('apt')).toMatchObject({ assessmentM2: 18720, buildingM2: 18880, differs: false });
    expect(of('lobby')).toMatchObject({ assessmentM2: 2400, buildingM2: 3300, differs: true });
    // In the assessment only, and in Building only.
    expect(of('gym')).toMatchObject({ buildingM2: undefined, differs: true });
    expect(of('retail')).toMatchObject({ assessmentM2: 960, buildingM2: 1100, differs: true });
    expect(l.buildingAreaM2).toBe(18880 + 3300 + 1100);
    expect(l.mixDiffers).toBe(true);
  });

  it('Update from Building takes the figures and the area schedule, keeping the assessment’s own W/m²', () => {
    const edited = { ...a, rows: a.rows.map((r) => (r.id === 'apt' ? { ...r, pwr: 40 } : r)) };
    const next = updateFromBuilding(project, edited, { figures: true, schedule: true });
    expect(next).toMatchObject({ gfaM2: 26400, floors: 22, parkingM2: 8400, areaMode: 'm2' });
    expect(next.rows.map((r) => [r.id, r.areaM2])).toEqual([['lobby', 3300], ['apt', 18880], ['retail', 1100]]);
    expect(next.rows.find((r) => r.id === 'apt')).toMatchObject({ pwr: 40, dwelling: true });
    expect(next.services).toEqual(a.services);
    const l = laLink(project, next);
    expect(l.differs || l.notice).toBe(false);
    // More floors and area: one more lift, a higher maximum demand.
    expect(assess(next).liftCount).toBe(6);
    expect(assess(a).liftCount).toBe(5);
  });

  it('takes only what is ticked', () => {
    const figures = updateFromBuilding(project, a, { figures: true, schedule: false });
    expect(figures.gfaM2).toBe(26400);
    expect(figures.rows).toEqual(a.rows);
    const schedule = updateFromBuilding(project, a, { figures: false, schedule: true });
    expect(schedule.gfaM2).toBe(24000);
    expect(schedule.rows).toHaveLength(3);
  });

  it('Keep my figures hides the notice until Building information changes again', () => {
    const kept = keepFigures(project, a);
    expect(laLink(project, kept)).toMatchObject({ differs: true, notice: false });
    const grown: Project = { ...project, building: { ...building, rooms: [...building.rooms, { id: 'r9', buildingId: 'P', levelId: 'P-G', name: 'Cafe', type: 'fnb', areaM2: 80 }] } };
    expect(laLink(grown, kept).notice).toBe(true);
  });

  it('counts only the ticked buildings', () => {
    const tower = countBuildings(project, a, ['T']);
    expect(tower.from).toEqual({ buildingIds: ['T'] });
    const l = laLink(project, tower);
    expect(l.buildings.map((b) => b.counted)).toEqual([true, false]);
    expect(l.figures[0].building).toBe(25200);
    expect(l.spaces.some((s) => s.id === 'retail' && s.buildingM2 !== undefined)).toBe(false);
    // Every building ticked again: no list is kept.
    expect(countBuildings(project, tower, ['P', 'T']).from).toBeUndefined();
  });

  it('with no Building information nothing differs', () => {
    expect(laLink({ ...sampleProject, building: undefined }, a)).toMatchObject({ hasBuilding: false, differs: false, notice: false, buildings: [] });
  });
});
