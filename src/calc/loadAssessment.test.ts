import { afterEach, describe, expect, it } from 'vitest';
import { setCatalog, EMPTY_CATALOG } from '../database/catalog';
import {
  againstStandard, applyStandard, assess, buildingFigures, clgInBasis, DEFAULT_SPACES, DEFAULT_TYPES, laSpaces, laStandards, LOCAL_STANDARD, newAssessment, PLACEHOLDER_STANDARD, resetToStandard, rowArea, rowsFromRooms,
  setAcBasis, setAreaMode, standardOf, standardsToSheet, typeFromAssessment, withStandardRows, type LaStandard, type LoadAssessment
} from './loadAssessment';
import { loadAssessmentBasis } from '../docs/designBasis';
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

describe('A/C figures as a cooling load or as an electrical load', () => {
  it('an electrical figure is used as typed, with no system factor', () => {
    const a = res({ acBasis: 'electrical' });
    const clg = a.rows.reduce((x, row) => x + (rowArea(a, row) * (row.location ? 0 : row.clg)) / 1000, 0);
    expect(assess(a).services.cool).toBeCloseTo(clg);
    // The cooling system no longer changes the load, but "No cooling" still means none.
    expect(assess({ ...a, services: { ...a.services, cool: 'dc' } }).services.cool).toBeCloseTo(clg);
    expect(assess({ ...a, services: { ...a.services, cool: 'none' } }).services.cool).toBe(0);
  });

  it('switching the basis converts the figures, so the HVAC load stays the same', () => {
    const a = res();
    const e = setAcBasis(a, 'electrical');
    expect(e.acBasis).toBe('electrical');
    // Apartment: 110 W/m² thermal × the VRF factor 0.3.
    expect(e.rows.find((r) => r.id === 'apt')!.clg).toBe(33);
    expect(assess(e).services.cool).toBeCloseTo(assess(a).services.cool);
    const back = setAcBasis(e, 'thermal');
    expect(back.acBasis).toBeUndefined();
    expect(back.rows.find((r) => r.id === 'apt')!.clg).toBe(110);
    expect(setAcBasis(a, 'thermal')).toBe(a);
    // With no factor to convert with ("No cooling"), the figures are kept as typed.
    expect(clgInBasis(110, 'thermal', 'electrical', 0)).toBe(110);
  });

  it('a saved type and the reports remember the basis', () => {
    const e = setAcBasis(res(), 'electrical');
    const t = typeFromAssessment(e, 'my1', 'My tower');
    expect(t.acBasis).toBe('electrical');
    expect(newAssessment(t, {}, lib).acBasis).toBe('electrical');
    expect(newAssessment(DEFAULT_TYPES[0], { acBasis: 'electrical' }, lib).acBasis).toBeUndefined();
    expect(loadAssessmentBasis(e).acElectrical).toBe(true);
    expect(loadAssessmentBasis(e).services[0].selection).toContain('A/C densities are the electrical load');
    expect(loadAssessmentBasis(res()).acElectrical).toBe(false);
  });
});

describe('where a space is', () => {
  const rows = [
    { id: 'in', label: 'F&B — indoor seating', ltg: 12, pwr: 60, clg: 200, areaM2: 300 },
    { id: 'out', label: 'F&B — outdoor seating', ltg: 6, pwr: 15, clg: 200, areaM2: 200, location: 'oc' as const },
    { id: 'open', label: 'Open corridor', ltg: 5, pwr: 3, clg: 80, areaM2: 100, location: 'nc' as const }
  ];
  const a = { ...res({ areaMode: 'm2', rows }), gfaM2: 400, parkingM2: 0 };

  it('only an indoor, cooled space carries a cooling load', () => {
    const r = assess(a);
    // Cooling: 300 m² × 200 W/m² thermal × the VRF factor; the outdoor and the not cooled rows add none.
    expect(r.services.cool).toBeCloseTo(60 * a.factors.cool.vrf);
    // Lighting and power count for every row.
    expect(r.categories.find((c) => c.key === 'ltg')!.connectedKw).toBeCloseTo((300 * 12 + 200 * 6 + 100 * 5) / 1000);
    expect(r.categories.find((c) => c.key === 'pwr')!.connectedKw).toBeCloseTo((300 * 60 + 200 * 15 + 100 * 3) / 1000);
  });

  it('an outdoor space is outside the GFA: not in the area total', () => {
    const r = assess(a);
    expect(r.areaM2).toBe(400);
    expect(r.outdoorM2).toBe(200);
    expect(r.pctTotal).toBeCloseTo(100);
    // A row with no location is indoor and cooled, as before.
    expect(assess({ ...a, rows: rows.map(({ location: _l, ...x }) => x) }).areaM2).toBe(600);
  });

  it('plant rooms and stores start as not cooled', () => {
    const plant = res().rows.find((x) => x.id === 'plant')!;
    expect(plant.location).toBe('nc');
    expect(assess(res({ rows: res().rows.map((x) => (x.id === 'plant' ? { ...x, clg: 500 } : x)) })).services.cool).toBeCloseTo(assess(res()).services.cool);
  });
});

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

  it('a room type counts as the assessment space set on it, or as the car park', () => {
    const info: BuildingInfo = {
      ...twoBuildings, unitTypes: [],
      roomTypes: [{ id: 'lab', label: 'Laboratory', wPerM2: 200, demandFactor: 0.8, laSpace: 'office' }, { id: 'ramp', label: 'Ramp', wPerM2: 5, demandFactor: 1, laSpace: 'carpark' }],
      rooms: [{ id: 'x1', buildingId: 'P', levelId: 'P-G', name: 'Lab', type: 'lab', areaM2: 90 }, { id: 'x2', buildingId: 'P', levelId: 'P-G', name: 'Ramp', type: 'ramp', areaM2: 60 }]
    };
    expect(rowsFromRooms(withBuildings(info))).toEqual([{ id: 'office', label: 'Office', ltg: 9, pwr: 25, clg: 130, areaM2: 90 }]);
    // The ramp is car park area: out of the area schedule, in the car park figure of its building.
    expect(buildingFigures(withBuildings(info), ['P']).parkingM2).toBe(60);
  });

  it('a room type with no space keeps its own row with a split of its W/m²', () => {
    const info: BuildingInfo = { ...twoBuildings, roomTypes: [{ id: 'lab', label: 'Laboratory', wPerM2: 200, demandFactor: 0.8 }], rooms: [{ id: 'x1', buildingId: 'P', levelId: 'P-G', name: 'Lab', type: 'lab', areaM2: 90 }], unitTypes: [] };
    expect(rowsFromRooms(withBuildings(info))).toEqual([{ id: 'lab', label: 'Laboratory', ltg: 10, pwr: 160, clg: 100, areaM2: 90 }]);
  });
});

describe('density standards', () => {
  afterEach(() => setCatalog(EMPTY_CATALOG));
  const mine: LaStandard = { name: 'Mine', spaces: [
    { id: 'office', label: 'Office', ltg: 10, pwr: 30, clg: 150 },
    { id: 'fnb', label: 'F&B', ltg: 12, pwr: 60, clg: 200, reference: 'Table 4' },
    { id: 'fnb', label: 'F&B', location: 'oo', ltg: 6, pwr: 10, clg: 0 }
  ] };
  const elec: LaStandard = { name: 'Electrical', acBasis: 'electrical', spaces: [{ id: 'office', label: 'Office', ltg: 10, pwr: 30, clg: 45 }] };
  const withRows = (rows: LoadAssessment['rows'], patch: Partial<LoadAssessment> = {}) => ({ ...res(), services: { ...res().services, cool: 'vrf' as const }, rows, ...patch });

  it('falls back to the placeholders, then lists the local library and the workbook standards', () => {
    expect(laStandards({ types: [] })).toEqual([{ name: PLACEHOLDER_STANDARD, spaces: DEFAULT_SPACES }]);
    expect(laSpaces({ types: [] })).toBe(DEFAULT_SPACES);
    setCatalog({ ...EMPTY_CATALOG, spaceStandards: [mine, elec] });
    const local = [{ id: 'x', label: 'X', ltg: 1, pwr: 2, clg: 3 }];
    const all = laStandards({ types: [], spaces: local, spacesAcBasis: 'electrical' });
    // The library on this computer stays the first, as it was the only one before the workbook.
    expect(all.map((s) => s.name)).toEqual([LOCAL_STANDARD, 'Mine', 'Electrical']);
    expect(all[0]).toMatchObject({ acBasis: 'electrical', spaces: local });
    expect(laSpaces({ types: [] })).toBe(mine.spaces);
    expect(standardOf('Electrical', all)).toBe(elec);
    // An unknown or missing name reads the first standard.
    expect(standardOf('gone', all)).toBe(all[0]);
    expect(standardOf(undefined, all)).toBe(all[0]);
  });

  it('tells a row equal to its standard from an edited one and one the standard does not have', () => {
    const a = withRows([{ id: 'office', label: 'Office', ltg: 10, pwr: 30, clg: 150, pct: 50 }, { id: 'office', label: 'Office', ltg: 10, pwr: 31, clg: 150, pct: 20 }, { id: 'zz', label: 'Zed', ltg: 1, pwr: 1, clg: 1, pct: 30 }]);
    expect(againstStandard(a.rows[0], mine, a).state).toBe('standard');
    expect(againstStandard(a.rows[1], mine, a).state).toBe('edited');
    expect(againstStandard(a.rows[2], mine, a)).toEqual({ state: 'own' });
    // the outdoor variant of the same id is its own space; cooling is ignored for a space that is not cooled
    const out = { id: 'fnb', label: 'F&B', location: 'oo' as const, ltg: 6, pwr: 10, clg: 99, pct: 0 };
    expect(againstStandard(out, mine, a).state).toBe('standard');
    expect(againstStandard({ ...out, location: undefined }, mine, a)).toMatchObject({ state: 'edited', space: { ltg: 12 } });
    expect(againstStandard({ id: 'q', label: 'office', ltg: 10, pwr: 30, clg: 150 }, mine, a).state).toBe('standard'); // same name
  });

  it('reads an electrical-basis standard against a thermal assessment', () => {
    const a = withRows([{ id: 'office', label: 'Office', ltg: 10, pwr: 30, clg: 150, pct: 100 }]);
    expect(againstStandard(a.rows[0], elec, a).state).toBe('standard'); // 45 kW electrical = 150 thermal at 0.3
    const next = applyStandard({ ...a, rows: [{ ...a.rows[0], clg: 10 }] }, elec);
    expect(next.rows[0].clg).toBe(150);
    expect(next.standard).toBe('Electrical');
    expect(next.acBasis).toBeUndefined();
  });

  it('resets a row and applies a standard to the rows it has', () => {
    const a = withRows([{ id: 'fnb', label: 'F&B', ltg: 1, pwr: 1, clg: 1, dwelling: true, pct: 40 }, { id: 'zz', label: 'Zed', ltg: 1, pwr: 1, clg: 1, pct: 60 }]);
    expect(resetToStandard(a.rows[0], mine.spaces[2], mine, a)).toEqual({ id: 'fnb', label: 'F&B', location: 'oo', ltg: 6, pwr: 10, clg: 0, dwelling: undefined, pct: 40 });
    const next = applyStandard(a, mine);
    expect(next.rows[0]).toMatchObject({ ltg: 12, pwr: 60, clg: 200, dwelling: undefined, pct: 40 });
    expect(next.rows[1]).toBe(a.rows[1]);
  });

  it('writes the rows into a standard and back to the sheet', () => {
    const a = withRows([{ id: 'fnb', label: 'F&B', ltg: 13, pwr: 61, clg: 210, pct: 50 }, { id: 'gym', label: 'Gym', ltg: 10, pwr: 20, clg: 150, dwelling: true, pct: 50 }]);
    const out = withStandardRows([mine, elec], 'Mine', a);
    expect(out[1]).toBe(elec);
    expect(out[0].spaces).toHaveLength(4); // the outdoor F&B is kept, Gym added
    expect(out[0].spaces[1]).toMatchObject({ id: 'fnb', ltg: 13, clg: 210, reference: 'Table 4' });
    expect(out[0].spaces[3]).toMatchObject({ id: 'gym', dwelling: true });
    // into an electrical standard the cooling is written in its basis; a new standard takes the assessment's
    expect(withStandardRows([elec], 'Electrical', withRows([{ id: 'office', label: 'Office', ltg: 10, pwr: 30, clg: 150, pct: 100 }]))[0].spaces[0].clg).toBe(45);
    const added = withStandardRows([mine], 'New', withRows([{ id: 'office', label: 'Office', ltg: 10, pwr: 30, clg: 150, pct: 100 }], { acBasis: 'electrical' }));
    expect(added[1]).toMatchObject({ name: 'New', acBasis: 'electrical' });
    expect(standardsToSheet([mine, elec, { name: LOCAL_STANDARD, spaces: DEFAULT_SPACES }, { name: PLACEHOLDER_STANDARD, spaces: DEFAULT_SPACES }])).toEqual([
      { standard: 'Mine', id: 'office', label: 'Office', location: '', ltg: 10, pwr: 30, clg: 150, acBasis: '', dwelling: '', reference: '' },
      { standard: 'Mine', id: 'fnb', label: 'F&B', location: '', ltg: 12, pwr: 60, clg: 200, acBasis: '', dwelling: '', reference: 'Table 4' },
      { standard: 'Mine', id: 'fnb', label: 'F&B', location: 'Outdoor, open', ltg: 6, pwr: 10, clg: 0, acBasis: '', dwelling: '', reference: '' },
      { standard: 'Electrical', id: 'office', label: 'Office', location: '', ltg: 10, pwr: 30, clg: 45, acBasis: 'Electrical load', dwelling: '', reference: '' }
    ]);
  });
});
