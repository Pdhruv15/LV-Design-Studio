import { describe, expect, it } from 'vitest';
import { assess, buildingFigures, DEFAULT_TYPES, newAssessment, rowArea, rowsFromRooms, setAreaMode, typeFromAssessment, type LoadAssessment } from './loadAssessment';
import { sampleProject } from '../data/sampleProject';
import { defaultServices } from './buildingDesign';
import type { BuildingInfo, Project } from '../types';

const lib = { types: [] };
const res = (patch: Partial<LoadAssessment> = {}) => ({ ...newAssessment(DEFAULT_TYPES[0], { gfaM2: 24000, floors: 20, parkingM2: 8000 }, lib), ...patch });

describe('load assessment', () => {
  it('area schedule × W/m² gives lighting, power and cooling', () => {
    const a = res();
    const r = assess(a);
    expect(r.pctTotal).toBeCloseTo(100);
    expect(r.areaM2).toBeCloseTo(24000);
    // Lighting: Σ area × W/m² + car park 8 000 m² × 3 W/m²
    const ltg = a.rows.reduce((x, row) => x + (rowArea(a, row) * row.ltg) / 1000, 0) + 24;
    expect(r.categories.find((c) => c.key === 'ltg')!.connectedKw).toBeCloseTo(ltg);
  });

  it('the cooling system changes the HVAC load', () => {
    const vrf = assess(res()).services.cool;
    const dc = assess(res({ services: { ...res().services, cool: 'dc' } })).services.cool;
    expect(dc).toBeLessThan(vrf / 3);
  });

  it('fire & life safety is on the generator only, not in the normal MD', () => {
    const r = assess(res());
    const life = r.categories.find((c) => c.key === 'life')!;
    expect(life.demandKw).toBe(0);
    const off = assess(res({ services: { ...res().services, fire: false } }));
    expect(off.mdKw).toBeCloseTo(r.mdKw);
    expect(off.generatorKw).toBeLessThan(r.generatorKw);
  });

  it('custom loads add to the MD and, when ticked, to the generator', () => {
    const base = assess(res());
    const r = assess(res({ custom: [{ id: 'c1', label: 'Cold room', qty: 2, kw: 10, diversity: 0.5, onGenerator: true }] }));
    expect(r.sumDemandKw - base.sumDemandKw).toBeCloseTo(10);
    expect(r.generatorKw - base.generatorKw).toBeCloseTo(10);
  });

  it('edited diversity, coincidence and spare change the MD', () => {
    const a = res();
    const r1 = assess(a);
    const r2 = assess({ ...a, diversity: { ...a.diversity, pwr: 1 }, supply: { ...a.supply, coincidence: 1, sparePct: 10 } });
    expect(r2.mdKw).toBeGreaterThan(r1.mdKw);
    expect(r2.mdKw).toBeCloseTo(r2.sumDemandKw * 1.1);
  });

  it('transformers stay under the loading limit, N+1 adds one', () => {
    const a = res();
    const r = assess(a);
    expect(r.tx!.kva * r.tx!.duty * 0.8).toBeGreaterThanOrEqual(r.mdKva);
    expect(r.tx!.kva).toBeLessThanOrEqual(1500);
    const n1 = assess({ ...a, supply: { ...a.supply, redundancy: 'N+1' } });
    expect(n1.tx!.count).toBe(r.tx!.count + 1);
    const own = assess({ ...a, supply: { ...a.supply, txSizes: [1000], maxTxKva: 1000 } });
    expect(own.tx!.kva).toBe(1000);
  });

  it('m² mode keeps the areas; saved types keep the mix as %', () => {
    const a = res();
    const m2 = setAreaMode(a, 'm2');
    expect(assess(m2).areaM2).toBeCloseTo(assess(a).areaM2, 0);
    const t = typeFromAssessment(m2, 'my1', 'My tower');
    expect(t.rows.reduce((x, r) => x + (r.pct ?? 0), 0)).toBeCloseTo(100, 0);
    expect(t.mine).toBe(true);
  });

  it('VA/m² is checked against the type band', () => {
    const r = assess(res({ vaBand: [1, 2] }));
    expect(r.inBand).toBe(false);
  });
});

// A tower with flats on its typical floors and two identical basements, and a block of shops.
const twoBuildings: BuildingInfo = {
  buildings: [
    { id: 'T', name: 'Tower A', levels: [
      { id: 'T-B', name: 'B1–B2', kind: 'basement', heightM: 3.5, grossM2: 4200, count: 2 },
      { id: 'T-G', name: 'Ground', kind: 'ground', heightM: 4.5, grossM2: 1200 },
      { id: 'T-T', name: 'Typical floors', kind: 'typical', heightM: 3.6, grossM2: 1150, count: 20, units: [{ unitTypeId: 'U2', count: 8 }] },
      { id: 'T-R', name: 'Roof', kind: 'roof', heightM: 3, grossM2: 1000 }
    ] },
    { id: 'P', name: 'Podium shops', levels: [{ id: 'P-G', name: 'Ground', kind: 'ground', heightM: 5, grossM2: 1200 }] }
  ],
  unitTypes: [{ id: 'U2', name: '2BR apartment', rooms: [
    { name: 'Living', type: 'living', areaM2: 46 }, { name: 'Bedrooms', type: 'bedroom', areaM2: 44 },
    { name: 'Kitchen', type: 'kitchen', areaM2: 14 }, { name: 'Bathrooms', type: 'bathroom', areaM2: 14 }
  ] }],
  rooms: [
    { id: 'r1', buildingId: 'T', levelId: 'T-T', name: 'Corridor', type: 'lobby', areaM2: 150 },
    { id: 'r2', buildingId: 'T', levelId: 'T-G', name: 'Lobby', type: 'lobby', areaM2: 300 },
    { id: 'r3', buildingId: 'T', levelId: 'T-G', name: 'Toilets', type: 'toilet', areaM2: 40 },
    { id: 'r4', buildingId: 'T', levelId: 'T-B', name: 'Parking', type: 'parking', areaM2: 4000 },
    { id: 'r5', buildingId: 'P', levelId: 'P-G', name: 'Shops', type: 'retail', areaM2: 1100 }
  ]
};
const withBuildings = (building: BuildingInfo): Project => ({ ...sampleProject, building });

describe('load assessment from Building information', () => {
  it('adds up every building: GFA, the tallest building’s floors and the car park', () => {
    const f = buildingFigures(withBuildings(twoBuildings));
    expect(f.gfaM2).toBe(1200 + 20 * 1150 + 1000 + 1200);
    expect(f.floors).toBe(22);
    // Car park rooms on a level of two identical basements count twice.
    expect(f.parkingM2).toBe(8000);
  });

  it('counts only the buildings named', () => {
    expect(buildingFigures(withBuildings(twoBuildings), ['P'])).toEqual({ gfaM2: 1200, floors: 1, parkingM2: undefined });
    expect(rowsFromRooms(withBuildings(twoBuildings), undefined, ['P']).map((r) => r.id)).toEqual(['retail']);
  });

  it('takes the basements’ gross area as the car park when no Car park rooms are entered', () => {
    const noRooms = { ...twoBuildings, rooms: twoBuildings.rooms.filter((r) => r.type !== 'parking') };
    expect(buildingFigures(withBuildings(noRooms)).parkingM2).toBe(8400);
    expect(defaultServices(withBuildings(noRooms), 'T').find((x) => x.id === 'carpark')).toMatchObject({ qty: 1, kw: 50.4 });
    expect(defaultServices(withBuildings(twoBuildings), 'T').find((x) => x.id === 'carpark')!.kw).toBe(48);
  });

  it('the area schedule counts the flats, as one dwelling Apartment row', () => {
    const rows = rowsFromRooms(withBuildings(twoBuildings));
    const apt = rows.find((r) => r.id === 'apt')!;
    // 8 flats × 118 m² on each of 20 floors: living, bedrooms, kitchen and bathrooms share the row.
    expect(apt.areaM2).toBe(8 * 118 * 20);
    expect(apt).toMatchObject({ label: 'Apartment', dwelling: true, ltg: 8, pwr: 35, clg: 110 });
    expect(rows.find((r) => r.id === 'lobby')!.areaM2).toBe(150 * 20 + 300);
    // A toilet or pantry counts as back of house; the shops of the second building are in.
    expect(rows.find((r) => r.id === 'bo')!.areaM2).toBe(40);
    expect(rows.find((r) => r.id === 'retail')!.areaM2).toBe(1100);
    expect(rows.some((r) => ['living', 'bedroom', 'kitchen', 'bathroom', 'toilet', 'parking'].includes(r.id))).toBe(false);
    // The dwelling area brings water heating and cooking into the assessment.
    const r = assess({ ...res({ areaMode: 'm2', rows }), gfaM2: 26400, floors: 22, parkingM2: 8000 });
    expect(r.dwellingM2).toBe(8 * 118 * 20);
    expect(r.services.dhw).toBeGreaterThan(0);
    expect(r.services.cook).toBeGreaterThan(0);
  });

  it('a room type with no space keeps its own row with a split of its W/m²', () => {
    const info: BuildingInfo = { ...twoBuildings, roomTypes: [{ id: 'lab', label: 'Laboratory', wPerM2: 200, demandFactor: 0.8 }], rooms: [{ id: 'x1', buildingId: 'P', levelId: 'P-G', name: 'Lab', type: 'lab', areaM2: 90 }], unitTypes: [] };
    expect(rowsFromRooms(withBuildings(info))).toEqual([{ id: 'lab', label: 'Laboratory', ltg: 10, pwr: 160, clg: 100, areaM2: 90 }]);
  });
});
