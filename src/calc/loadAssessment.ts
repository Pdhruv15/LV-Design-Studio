import type { Project } from '../types';
import { catalog } from '../database/catalog';
import { catalogueTxKva, generatorSizes, txSizeList, type TxSizeList } from './sizeLists';
import type { BuildingInfo, ProjectBuilding } from '../types';
import type { RoomType } from '../types';
import { buildingInfoOf, carParkAreaOf, isCarParkType, roomTypesOf, summarizeBuilding, unitRoomLoads } from './building';

/** Early-stage load assessment: building type → area schedule (W/m² per
 * space) → service requirements → maximum demand, transformers and the
 * standby generator. Everything is editable: the space mix, the densities,
 * the service factors, each category's diversity and the supply rules.
 * Your own figures are kept as a library on this computer ("Save as my
 * type" / "Save as my library"); the built-in values are PLACEHOLDERS. */

export type CoolSystem = 'none' | 'split' | 'vrf' | 'chw' | 'wcc' | 'dc';
export type DhwSystem = 'none' | 'local' | 'elec' | 'central' | 'solar';
export type CategoryKey = 'ltg' | 'pwr' | 'hvac' | 'dhw' | 'cook' | 'lift' | 'pump' | 'ev' | 'spec';

export const COOL_SYSTEMS: { value: CoolSystem; label: string }[] = [
  { value: 'none', label: 'No mechanical cooling' },
  { value: 'split', label: 'Split units' },
  { value: 'vrf', label: 'VRF / VRV' },
  { value: 'chw', label: 'Chilled water — air-cooled chiller' },
  { value: 'wcc', label: 'Chilled water — water-cooled chiller' },
  { value: 'dc', label: 'District cooling (FCU / AHU + pumps only)' }
];
export const DHW_SYSTEMS: { value: DhwSystem; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'local', label: 'Local point heaters' },
  { value: 'elec', label: 'Electric heater per unit' },
  { value: 'central', label: 'Central plant (electric)' },
  { value: 'solar', label: 'Solar + electric backup' }
];

/** Where a space is. Only an indoor, cooled space carries a cooling load; an outdoor
 * space (a terrace, a pool deck) is outside the GFA, so it is left out of the area total. */
export type LaLocation = 'in' | 'nc' | 'oc' | 'oo';
export const LA_LOCATIONS: { value: LaLocation; label: string }[] = [
  { value: 'in', label: 'Indoor, cooled' },
  { value: 'nc', label: 'Indoor, not cooled' },
  { value: 'oc', label: 'Outdoor, covered' },
  { value: 'oo', label: 'Outdoor, open' }
];
export const isCooled = (s: { location?: LaLocation }): boolean => (s.location ?? 'in') === 'in';
export const isOutdoor = (s: { location?: LaLocation }): boolean => s.location === 'oc' || s.location === 'oo';

/** How the Cooling W/m² of the spaces are read: a cooling load (thermal: the cooling system's
 * factor gives the electrical kW), or the electrical load of the air conditioning, used as typed. */
export type AcBasis = 'thermal' | 'electrical';

/** A space in the area schedule: its share of the GFA (or m²) and densities. */
export interface LaSpace {
  id: string;
  label: string;
  location?: LaLocation; // absent: indoor, cooled
  ltg: number; // lighting W/m²
  pwr: number; // small power W/m²
  clg: number; // cooling W/m² (thermal, or electrical: see AcBasis)
  dwelling?: boolean; // counts for water heating and cooking
}
export interface LaRow extends LaSpace { pct?: number; areaM2?: number }
/** A space of a density standard, with where its values come from. */
export interface LaStandardSpace extends LaSpace { reference?: string }
/** A named set of space densities (the Space densities workbook, or the library on this computer). */
export interface LaStandard { name: string; acBasis?: AcBasis; spaces: LaStandardSpace[] }

export interface LaServices {
  cool: CoolSystem;
  dhw: DhwSystem;
  cook: 'none' | 'elec';
  lifts: 'none' | 'auto' | 'custom';
  liftCount?: number;
  fire: boolean;
  evPct: number; // % of parking bays with chargers
  itKw: number;
  pool: boolean;
  kitchen: boolean;
  laundry: boolean;
  medical: boolean;
  facade: boolean;
}

/** How each service turns into kW. */
export interface LaFactors {
  cool: Record<CoolSystem, number>; // kW electrical per kW thermal
  dhw: Record<DhwSystem, number>; // W/m² (dwelling areas; point heaters: whole GFA)
  cook: number; // W/m² of dwelling areas
  liftKw: number; // each, up to 12 floors
  liftKwHigh: number; // each, above 12 floors
  floorsPerLift: number;
  evKw: number; // per charger
  m2PerBay: number;
  carParkLtg: number; // W/m² of car park
  carParkFanKwPerM2: number;
  boosterKw: number; // duty pumps (2 sets)
  transferKw: number;
  poolKw: number;
  kitchen: number; // W/m² of GFA
  laundry: number;
  medical: number;
  facadeKwPerFloor: number;
  firePumpKw: number;
  jockeyKw: number;
  stairFanKw: number;
}

export type LaDiversity = Record<CategoryKey, number>;

export interface LaCustomLoad { id: string; label: string; qty: number; kw: number; diversity: number; onGenerator: boolean }

export interface LaSupply {
  coincidence: number;
  pf: number;
  voltage: number;
  maxLoadingPct: number;
  maxTxKva: number;
  redundancy: 'N' | 'N+1';
  genMargin: number;
  sparePct: number;
  txSizes?: number[]; // a typed list; blank: the size list below
  /** The list the transformer sizes come from (src/calc/sizeLists.ts); absent: the catalogue when it has sizes, else the market standard sizes. */
  sizeList?: TxSizeList;
}

/** A building type: the starting point of an assessment. */
export interface LaBuildingType {
  id: string;
  label: string;
  rows: LaRow[]; // pct of GFA
  vaBand: [number, number]; // typical VA/m² of GFA
  essentialPct: number; // share of HVAC and special services on the generator
  services: LaServices;
  diversity?: Partial<LaDiversity>;
  mine?: boolean; // saved by you
  acBasis?: AcBasis; // of its rows; absent: thermal
}

/** The project's assessment (a full copy — library changes never move it). */
export interface LoadAssessment {
  typeId: string;
  typeLabel: string;
  vaBand: [number, number];
  essentialPct: number;
  gfaM2: number;
  floors: number;
  parkingM2: number;
  areaMode: 'pct' | 'm2';
  rows: LaRow[];
  /** How the rows' Cooling W/m² are read; absent: thermal. */
  acBasis?: AcBasis;
  services: LaServices;
  factors: LaFactors;
  diversity: LaDiversity;
  custom: LaCustomLoad[];
  supply: LaSupply;
  /** Printed as a section of the Design Basis report. */
  inReport?: boolean;
  /** How it follows Building information (src/calc/loadAssessmentLink.ts). */
  from?: LaFromBuilding;
  /** The density standard its spaces were taken from. */
  standard?: string;
}

/** The link of an assessment to Building information. */
export interface LaFromBuilding {
  /** The buildings counted; absent: every building. */
  buildingIds?: string[];
  /** The state of Building information against which the user kept their own figures: no notice until it changes again. */
  kept?: string;
}

// ---- PLACEHOLDER library — not authority figures; replace with yours.

export const DEFAULT_SPACES: LaSpace[] = [
  { id: 'apt', label: 'Apartment', ltg: 8, pwr: 35, clg: 110, dwelling: true },
  { id: 'villa', label: 'Villa', ltg: 8, pwr: 35, clg: 110, dwelling: true },
  { id: 'office', label: 'Office', ltg: 9, pwr: 25, clg: 130 },
  { id: 'retail', label: 'Retail / shop', ltg: 15, pwr: 20, clg: 160 },
  { id: 'fnb', label: 'F&B / restaurant', ltg: 12, pwr: 60, clg: 200 },
  { id: 'hotel', label: 'Hotel room', ltg: 8, pwr: 20, clg: 110, dwelling: true },
  { id: 'lobby', label: 'Lobby / corridor', ltg: 6, pwr: 5, clg: 80 },
  { id: 'gym', label: 'Gym / amenity', ltg: 10, pwr: 20, clg: 150 },
  { id: 'plant', label: 'Plant / electrical', ltg: 5, pwr: 10, clg: 0, location: 'nc' },
  { id: 'ward', label: 'Ward / patient room', ltg: 9, pwr: 30, clg: 140, dwelling: true },
  { id: 'theatre', label: 'Operating / ICU', ltg: 20, pwr: 120, clg: 250 },
  { id: 'class', label: 'Classroom', ltg: 9, pwr: 10, clg: 120 },
  { id: 'store', label: 'Warehouse / store', ltg: 5, pwr: 5, clg: 0, location: 'nc' },
  { id: 'bo', label: 'Back of house', ltg: 7, pwr: 25, clg: 90 }
];

export const DEFAULT_FACTORS: LaFactors = {
  cool: { none: 0, split: 0.33, vrf: 0.3, chw: 0.36, wcc: 0.25, dc: 0.08 },
  dhw: { none: 0, local: 4, elec: 15, central: 12, solar: 5 },
  cook: 18, liftKw: 15, liftKwHigh: 22, floorsPerLift: 4, evKw: 7.4, m2PerBay: 25, carParkLtg: 3, carParkFanKwPerM2: 0.006,
  boosterKw: 7.5, transferKw: 5.5, poolKw: 15, kitchen: 12, laundry: 6, medical: 20, facadeKwPerFloor: 2,
  firePumpKw: 55, jockeyKw: 3, stairFanKw: 7.5
};

export const DEFAULT_DIVERSITY: LaDiversity = { ltg: 0.9, pwr: 0.5, hvac: 0.85, dhw: 0.35, cook: 0.3, lift: 0.6, pump: 0.7, ev: 0.6, spec: 0.7 };

export const DEFAULT_SUPPLY: LaSupply = { coincidence: 0.9, pf: 0.9, voltage: 400, maxLoadingPct: 80, maxTxKva: 1500, redundancy: 'N', genMargin: 1.25, sparePct: 0 };


const sp = (id: string, pct: number): LaRow => ({ ...DEFAULT_SPACES.find((s) => s.id === id)!, pct });
const svc = (s: Partial<LaServices>): LaServices => ({ cool: 'vrf', dhw: 'local', cook: 'none', lifts: 'auto', fire: true, evPct: 0, itKw: 0, pool: false, kitchen: false, laundry: false, medical: false, facade: false, ...s });

export const DEFAULT_TYPES: LaBuildingType[] = [
  { id: 'res', label: 'Residential tower', rows: [sp('apt', 78), sp('lobby', 10), sp('gym', 3), sp('retail', 4), sp('plant', 5)], vaBand: [50, 90], essentialPct: 15,
    services: svc({ dhw: 'elec', cook: 'elec', evPct: 10, pool: true, facade: true }) },
  { id: 'villa', label: 'Villa compound', rows: [sp('villa', 92), sp('lobby', 2), sp('gym', 3), sp('plant', 3)], vaBand: [60, 110], essentialPct: 5,
    services: svc({ cool: 'split', dhw: 'elec', cook: 'elec', lifts: 'none', fire: false, evPct: 20, pool: true }) },
  { id: 'office', label: 'Office', rows: [sp('office', 75), sp('lobby', 12), sp('retail', 5), sp('plant', 8)], vaBand: [70, 120], essentialPct: 20, diversity: { pwr: 0.6 },
    services: svc({ cool: 'chw', evPct: 10, itKw: 20, facade: true }) },
  { id: 'mall', label: 'Retail mall', rows: [sp('retail', 62), sp('fnb', 12), sp('lobby', 18), sp('bo', 3), sp('plant', 5)], vaBand: [110, 180], essentialPct: 15, diversity: { ltg: 1, pwr: 0.7 },
    services: svc({ cool: 'chw', cook: 'elec', evPct: 5, kitchen: true, facade: true }) },
  { id: 'hotel', label: 'Hotel', rows: [sp('hotel', 58), sp('lobby', 14), sp('fnb', 8), sp('gym', 4), sp('bo', 10), sp('plant', 6)], vaBand: [80, 130], essentialPct: 30,
    services: svc({ cool: 'chw', dhw: 'central', cook: 'elec', evPct: 5, itKw: 10, pool: true, kitchen: true, laundry: true, facade: true }) },
  { id: 'hosp', label: 'Hospital', rows: [sp('ward', 45), sp('theatre', 10), sp('office', 12), sp('lobby', 18), sp('bo', 8), sp('plant', 7)], vaBand: [120, 200], essentialPct: 60, diversity: { pwr: 0.7, hvac: 0.9 },
    services: svc({ cool: 'chw', dhw: 'central', cook: 'elec', evPct: 5, itKw: 30, kitchen: true, laundry: true, medical: true }) },
  { id: 'school', label: 'School', rows: [sp('class', 60), sp('office', 10), sp('lobby', 18), sp('gym', 7), sp('plant', 5)], vaBand: [40, 80], essentialPct: 10,
    services: svc({ cook: 'elec', itKw: 10, kitchen: true }) },
  { id: 'wh', label: 'Warehouse', rows: [sp('store', 85), sp('office', 10), sp('plant', 5)], vaBand: [15, 40], essentialPct: 10,
    services: svc({ cool: 'none', lifts: 'none', evPct: 10 }) }
];

// ---- Your library (this computer)

export interface LaLibrary { types: LaBuildingType[]; spaces?: LaSpace[]; /** Of the spaces' Cooling W/m²; absent: thermal. */ spacesAcBasis?: AcBasis; factors?: LaFactors; diversity?: LaDiversity; supply?: LaSupply }
const LIB_KEY = 'lvds.loadAssessmentLibrary';

export function loadLaLibrary(): LaLibrary {
  try {
    const v = JSON.parse(localStorage.getItem(LIB_KEY) ?? 'null');
    return v && Array.isArray(v.types) ? v : { types: [] };
  } catch { return { types: [] }; }
}
export function saveLaLibrary(lib: LaLibrary): boolean {
  try { localStorage.setItem(LIB_KEY, JSON.stringify(lib)); return true; } catch { return false; }
}

/** Building types offered: the placeholders with your own types over them (same id) and after them. */
export function laTypes(lib: LaLibrary = loadLaLibrary()): LaBuildingType[] {
  const mine = new Map(lib.types.map((t) => [t.id, t]));
  return [...DEFAULT_TYPES.map((t) => mine.get(t.id) ?? t), ...lib.types.filter((t) => !DEFAULT_TYPES.some((d) => d.id === t.id))];
}
export const laSpaces = (lib: LaLibrary = loadLaLibrary()): LaSpace[] => laStandards(lib)[0].spaces;

// ---- Density standards

export const PLACEHOLDER_STANDARD = 'Starting figures (placeholders)';
export const LOCAL_STANDARD = 'My library (this computer)';
/** The density standards to pick from: the space library on this computer when it has one (it stays
 * the first, as it was the only one before), then the Space densities workbook; with neither, the
 * built-in starting figures. */
export function laStandards(lib: LaLibrary = loadLaLibrary()): LaStandard[] {
  const cat = catalog().spaceStandards;
  const mine: LaStandard[] = lib.spaces?.length ? [{ name: LOCAL_STANDARD, acBasis: lib.spacesAcBasis, spaces: lib.spaces }] : [];
  const all = [...mine, ...cat];
  return all.length ? all : [{ name: PLACEHOLDER_STANDARD, spaces: DEFAULT_SPACES }];
}
/** The standard an assessment reads: the one it names, else the first. */
export const standardOf = (name: string | undefined, standards: LaStandard[]): LaStandard => standards.find((s) => s.name === name) ?? standards[0];

const sameSpace = (a: LaSpace, b: LaSpace): boolean => a.id === b.id && (a.location ?? 'in') === (b.location ?? 'in');
const findSpace = (spaces: LaStandardSpace[], row: LaSpace): LaStandardSpace | undefined =>
  spaces.find((x) => sameSpace(x, row)) ?? spaces.find((x) => x.label.toLowerCase() === row.label.toLowerCase());
const coolFactorOf = (a: LoadAssessment): number => a.factors.cool[a.services.cool] ?? 0;
/** A standard space's cooling figure in the assessment's basis. */
const clgFor = (space: LaSpace, std: LaStandard, a: LoadAssessment): number => clgInBasis(space.clg, std.acBasis, a.acBasis, coolFactorOf(a));

/** How a row stands against its standard: equal to it ('standard'), changed in this project ('edited'), or not in the standard ('own'). */
export function againstStandard(row: LaRow, std: LaStandard, a: LoadAssessment): { state: 'standard' | 'edited' | 'own'; space?: LaStandardSpace } {
  const space = findSpace(std.spaces, row);
  if (!space) return { state: 'own' };
  const eq = (x: number, y: number) => Math.abs(x - y) <= 0.05;
  const same = eq(row.ltg, space.ltg) && eq(row.pwr, space.pwr) && !!row.dwelling === !!space.dwelling && (!isCooled(row) || eq(row.clg, clgFor(space, std, a)));
  return { state: same ? 'standard' : 'edited', space };
}

/** The row with its standard's lighting, power, cooling, dwelling tick and location (area kept). */
export function resetToStandard(row: LaRow, space: LaStandardSpace, std: LaStandard, a: LoadAssessment): LaRow {
  return { ...row, ltg: space.ltg, pwr: space.pwr, clg: clgFor(space, std, a), dwelling: space.dwelling, location: space.location };
}

/** The assessment reading another standard: every row the standard has takes its figures; the others keep theirs. */
export function applyStandard(a: LoadAssessment, std: LaStandard): LoadAssessment {
  return { ...a, standard: std.name, rows: a.rows.map((r) => { const space = findSpace(std.spaces, r); return space ? resetToStandard(r, space, std, a) : r; }) };
}

/** The standards with the assessment's rows written into the one named (added when new): a space with the same id and location, or the same name, is replaced; the others are kept. */
export function withStandardRows(standards: LaStandard[], name: string, a: LoadAssessment): LaStandard[] {
  const old = standards.find((s) => s.name === name);
  const basis = old ? old.acBasis : a.acBasis;
  const spaces: LaStandardSpace[] = [...(old?.spaces ?? [])];
  for (const r of a.rows) {
    const space: LaStandardSpace = { id: r.id, label: r.label, location: r.location, ltg: r.ltg, pwr: r.pwr, clg: clgInBasis(r.clg, a.acBasis, basis, coolFactorOf(a)), dwelling: r.dwelling };
    const i = spaces.findIndex((x) => sameSpace(x, r));
    const j = i >= 0 ? i : spaces.findIndex((x) => x.label.toLowerCase() === r.label.toLowerCase());
    if (j >= 0) spaces[j] = { ...space, ...(spaces[j].reference ? { reference: spaces[j].reference } : {}) }; else spaces.push(space);
  }
  const next: LaStandard = { name, ...(basis ? { acBasis: basis } : {}), spaces };
  return old ? standards.map((s) => (s === old ? next : s)) : [...standards, next];
}

/** The standards as rows of the Space densities workbook. */
export function standardsToSheet(standards: LaStandard[]): Record<string, string | number>[] {
  return standards.filter((s) => s.name !== LOCAL_STANDARD && s.name !== PLACEHOLDER_STANDARD).flatMap((s) => s.spaces.map((x) => ({
    standard: s.name, id: x.id, label: x.label, location: LA_LOCATIONS.find((l) => l.value === x.location && x.location !== 'in')?.label ?? '', ltg: x.ltg, pwr: x.pwr, clg: x.clg,
    acBasis: s.acBasis === 'electrical' ? 'Electrical load' : '', dwelling: x.dwelling ? 'Yes' : '', reference: x.reference ?? ''
  })));
}
export const laFactors = (lib: LaLibrary = loadLaLibrary()): LaFactors => ({ ...DEFAULT_FACTORS, ...lib.factors, cool: { ...DEFAULT_FACTORS.cool, ...lib.factors?.cool }, dhw: { ...DEFAULT_FACTORS.dhw, ...lib.factors?.dhw } });

/** Saves the assessment's current set-up as one of your building types. */
export function typeFromAssessment(a: LoadAssessment, id: string, label: string): LaBuildingType {
  const g = a.gfaM2 || 1;
  return {
    id, label, mine: true, vaBand: [...a.vaBand], essentialPct: a.essentialPct, services: { ...a.services }, diversity: { ...a.diversity }, ...(a.acBasis === 'electrical' ? { acBasis: a.acBasis } : {}),
    rows: a.rows.map((r) => ({ ...r, pct: rowPct(a, r, g), areaM2: undefined }))
  };
}

// ---- Starting an assessment

/** The buildings an assessment counts: every building, or the ones named. */
const countedBuildings = (info: BuildingInfo, ids?: string[]): ProjectBuilding[] => (ids?.length ? info.buildings.filter((b) => ids.includes(b.id)) : info.buildings);

/** GFA above ground and car park area of the project's buildings (all of them, or the
 * ones named) added up, and the floors above ground of the tallest one. */
export function buildingFigures(project: Project, buildingIds?: string[]): { gfaM2?: number; floors?: number; parkingM2?: number } {
  const info = buildingInfoOf(project);
  let gfaM2 = 0, floors = 0, parkingM2 = 0;
  for (const b of countedBuildings(info, buildingIds)) {
    const s = summarizeBuilding(info, b);
    const above = s.levels.filter((l) => l.level.kind !== 'basement').reduce((a, l) => a + (l.level.grossM2 ?? 0) * l.count, 0);
    gfaM2 += above || s.gfaM2;
    floors = Math.max(floors, s.aboveGround);
    parkingM2 += carParkAreaOf(info, b);
  }
  return { gfaM2: gfaM2 || undefined, floors: floors || undefined, parkingM2: parkingM2 || undefined };
}

export function newAssessment(t: LaBuildingType, base: Partial<LoadAssessment> = {}, lib: LaLibrary = loadLaLibrary()): LoadAssessment {
  return {
    gfaM2: 24000, floors: 20, parkingM2: 8000, supply: { ...DEFAULT_SUPPLY, ...lib.supply }, custom: [],
    ...base,
    typeId: t.id, typeLabel: t.label, vaBand: [...t.vaBand], essentialPct: t.essentialPct, areaMode: 'pct', acBasis: t.acBasis === 'electrical' ? 'electrical' : undefined,
    rows: t.rows.map((r) => ({ ...r })), services: { ...t.services },
    factors: laFactors(lib), diversity: { ...DEFAULT_DIVERSITY, ...lib.diversity, ...t.diversity }
  };
}

/** The assessment space a room type counts as when no space has its id or name: the
 * rooms of a flat are part of the apartment (a dwelling area), a toilet or pantry is
 * back of house. */
export const SPACE_OF_ROOM_TYPE: Record<string, string> = { apartment: 'apt', living: 'apt', bedroom: 'apt', kitchen: 'apt', bathroom: 'apt', toilet: 'bo' };

/** The assessment space a room type counts as: the one set on it (Building → Room types),
 * else the space with its id or name, else the built-in pairing. Undefined: none, so the
 * room type gets a row of its own. */
export function spaceOfRoomType(rt: RoomType | undefined, typeId: string, spaces: LaSpace[]): LaSpace | undefined {
  const byId = (id?: string) => (id ? spaces.find((x) => x.id === id) ?? DEFAULT_SPACES.find((x) => x.id === id) : undefined);
  return byId(rt?.laSpace) ?? spaces.find((x) => x.id === typeId || x.label.toLowerCase() === (rt?.label ?? typeId).toLowerCase()) ?? byId(SPACE_OF_ROOM_TYPE[typeId]);
}

/** The assessment's area schedule from the Building rooms and flats (m² per space, above
 * ground) of every building, or of the ones named. Room types that count as the same
 * space share one row. */
export function rowsFromRooms(project: Project, spaces: LaSpace[] = laSpaces(), buildingIds?: string[]): LaRow[] {
  const info = buildingInfoOf(project);
  const types = new Map(roomTypesOf(info).map((t) => [t.id, t]));
  const byType = new Map<string, number>();
  const add = (type: string, areaM2: number) => { if (!isCarParkType(info, type)) byType.set(type, (byType.get(type) ?? 0) + areaM2); };
  for (const b of countedBuildings(info, buildingIds)) {
    const below = new Set(b.levels.filter((l) => l.kind === 'basement').map((l) => l.id));
    const levelCount = new Map(summarizeBuilding(info, b).levels.map((l) => [l.level.id, l.count]));
    for (const r of info.rooms) {
      if (r.buildingId === b.id && !below.has(r.levelId)) add(r.type, r.areaM2 * (r.count ?? 1) * (levelCount.get(r.levelId) ?? 1));
    }
    for (const u of unitRoomLoads(info, b)) if (!below.has(u.levelId)) add(u.type, u.areaM2);
  }
  const rows = new Map<string, LaRow>();
  for (const [type, areaM2] of byType) {
    const rt = types.get(type);
    const known = spaceOfRoomType(rt, type, spaces);
    const w = rt?.wPerM2 ?? 30;
    // Unknown space: the room type's W/m² split into lighting and power — review the cooling.
    const row: LaSpace = known ?? { id: type, label: rt?.label ?? type, ltg: Math.min(10, Math.round(w * 0.2)), pwr: Math.round(w * 0.8), clg: 100 };
    rows.set(row.id, { ...row, areaM2: (rows.get(row.id)?.areaM2 ?? 0) + areaM2 });
  }
  return [...rows.values()].map((r) => ({ ...r, areaM2: Math.round(r.areaM2 ?? 0) }));
}

// ---- The calculation

export const rowPct = (a: LoadAssessment, r: LaRow, gfa = a.gfaM2): number => (a.areaMode === 'pct' ? r.pct ?? 0 : gfa ? ((r.areaM2 ?? 0) / gfa) * 100 : 0);
export const rowArea = (a: LoadAssessment, r: LaRow): number => (a.areaMode === 'pct' ? (a.gfaM2 * (r.pct ?? 0)) / 100 : r.areaM2 ?? 0);

/** A Cooling W/m² figure moved from one basis to the other with the cooling system's factor
 * (kW electrical per kW thermal), so the load stays the same. With no factor it is kept as typed. */
export function clgInBasis(clg: number, from: AcBasis | undefined, to: AcBasis | undefined, factor: number): number {
  const f = from ?? 'thermal', t = to ?? 'thermal';
  if (f === t || !(factor > 0)) return clg;
  return Math.round((t === 'electrical' ? clg * factor : clg / factor) * 10) / 10;
}

/** Switches how the rows' Cooling W/m² are read, converting them so the HVAC load stays the same. */
export function setAcBasis(a: LoadAssessment, basis: AcBasis): LoadAssessment {
  if ((a.acBasis ?? 'thermal') === basis) return a;
  const factor = a.factors.cool[a.services.cool] ?? 0;
  return { ...a, acBasis: basis === 'electrical' ? 'electrical' : undefined, rows: a.rows.map((r) => ({ ...r, clg: clgInBasis(r.clg, a.acBasis, basis, factor) })) };
}

/** Switches between % of GFA and m², keeping each row's area. */
export function setAreaMode(a: LoadAssessment, mode: 'pct' | 'm2'): LoadAssessment {
  if (mode === a.areaMode) return a;
  return { ...a, areaMode: mode, rows: a.rows.map((r) => (mode === 'm2' ? { ...r, areaM2: Math.round(rowArea(a, r)), pct: undefined } : { ...r, pct: +rowPct(a, r).toFixed(2), areaM2: undefined })) };
}

export interface LaCategory {
  key: string; // a CategoryKey, 'life', or 'custom:<id>'
  label: string;
  connectedKw: number;
  diversity: number; // 0 = not in the normal MD (generator only)
  demandKw: number;
  generatorShare: number; // share of it on the standby generator
  editable: boolean; // diversity editable in the table
}

export interface LaResult {
  areaM2: number; // indoor rows total (the outdoor rows are outside the GFA)
  pctTotal: number;
  outdoorM2: number; // outdoor rows total
  dwellingM2: number;
  services: Record<string, number>; // kW per service, for the service cards
  liftCount: number;
  categories: LaCategory[];
  connectedKw: number;
  sumDemandKw: number;
  mdKw: number;
  mdKva: number;
  vaPerM2: number;
  inBand: boolean;
  tx?: { count: number; kva: number; duty: number }; // count includes the N+1 unit
  txSizes: number[];
  generatorKw: number; // essential demand
  generatorKvaRequired: number;
  generatorKva?: number;
  generatorCount: number;
  incomerA?: number;
}

/** The supply's size list in use: the one picked, else the catalogue (the market standard sizes while it is empty). */
export const laSizeList = (s: LaSupply): TxSizeList => s.sizeList ?? (catalogueTxKva().length ? 'catalogue' : 'market');
const txSizesOf = (s: LaSupply): number[] => {
  const own = s.txSizes?.filter((x) => x > 0);
  return [...new Set(own?.length ? own : txSizeList(laSizeList(s)))].sort((a, b) => a - b);
};
const genSizes = (): number[] => generatorSizes();

export function assess(a: LoadAssessment): LaResult {
  const f = a.factors, s = a.services, d = a.diversity, ess = a.essentialPct / 100;
  const floors = Math.max(1, a.floors || 1), park = Math.max(0, a.parkingM2 || 0), gfa = Math.max(0, a.gfaM2 || 0);
  let ltg = 0, pwr = 0, clg = 0, area = 0, pct = 0, dwell = 0, outdoor = 0;
  for (const r of a.rows) {
    const m2 = rowArea(a, r);
    if (isOutdoor(r)) outdoor += m2; else { area += m2; pct += rowPct(a, r); }
    ltg += (m2 * r.ltg) / 1000; pwr += (m2 * r.pwr) / 1000;
    if (isCooled(r)) clg += (m2 * r.clg) / 1000;
    if (r.dwelling) dwell += m2;
  }
  ltg += (park * f.carParkLtg) / 1000;

  const hvac = s.cool === 'none' ? 0 : a.acBasis === 'electrical' ? clg : clg * (f.cool[s.cool] ?? 0);
  const dhw = s.dhw === 'local' ? (gfa * f.dhw.local) / 1000 : (dwell * (f.dhw[s.dhw] ?? 0)) / 1000;
  const cook = s.cook === 'elec' ? (dwell * f.cook) / 1000 : 0;
  const liftCount = s.lifts === 'none' ? 0 : s.lifts === 'custom' ? Math.max(0, Math.round(s.liftCount ?? 0))
    : Math.max(floors > 2 ? 1 : 0, Math.ceil((floors / Math.max(1, f.floorsPerLift)) * Math.max(1, gfa / floors / 6000)));
  const lift = liftCount * (floors > 12 ? f.liftKwHigh : f.liftKw);
  const pool = s.pool ? f.poolKw : 0;
  const carFans = park ? Math.max(11, park * f.carParkFanKwPerM2) : 0;
  const pump = 2 * f.boosterKw + (floors > 2 ? 2 * f.transferKw : 0) + pool + carFans;
  const ev = (park / Math.max(1, f.m2PerBay)) * (s.evPct / 100) * f.evKw;
  const kitchen = s.kitchen ? (gfa * f.kitchen) / 1000 : 0;
  const laundry = s.laundry ? (gfa * f.laundry) / 1000 : 0;
  const medical = s.medical ? (gfa * f.medical) / 1000 : 0;
  const facade = s.facade ? floors * f.facadeKwPerFloor : 0;
  const spec = kitchen + laundry + medical + facade + (s.itKw || 0);
  const life = s.fire ? f.firePumpKw + f.jockeyKw + (floors > 4 ? 2 * f.stairFanKw : 0) : 0;
  const coolLabel = COOL_SYSTEMS.find((c) => c.value === s.cool)?.label ?? s.cool;

  const cat = (key: CategoryKey, label: string, kw: number, gen: number): LaCategory => ({ key, label, connectedKw: kw, diversity: d[key], demandKw: kw * d[key], generatorShare: gen, editable: true });
  const categories: LaCategory[] = [
    cat('ltg', 'Lighting', ltg, 1),
    cat('pwr', 'Small power', pwr, 0.3),
    cat('hvac', `HVAC — ${coolLabel}`, hvac, ess),
    cat('dhw', 'Water heating', dhw, 0),
    cat('cook', 'Cooking', cook, 0),
    cat('lift', `Lifts (${liftCount})`, lift, 1),
    cat('pump', 'Pumps / ventilation', pump, 0.5),
    cat('ev', 'EV charging', ev, 0),
    cat('spec', 'Special services', spec, ess),
    { key: 'life', label: 'Fire & life safety (generator only)', connectedKw: life, diversity: 0, demandKw: 0, generatorShare: 1, editable: false },
    ...a.custom.map((c) => ({ key: `custom:${c.id}`, label: c.label || 'Custom load', connectedKw: c.qty * c.kw, diversity: c.diversity, demandKw: c.qty * c.kw * c.diversity, generatorShare: c.onGenerator ? 1 : 0, editable: false }))
  ].filter((c) => c.connectedKw > 0);

  const connectedKw = categories.reduce((x, c) => x + c.connectedKw, 0);
  const sumDemandKw = categories.reduce((x, c) => x + c.demandKw, 0);
  const sup = a.supply;
  const mdKw = sumDemandKw * (sup.coincidence || 1) * (1 + (sup.sparePct || 0) / 100);
  const pf = sup.pf > 0 && sup.pf <= 1 ? sup.pf : 0.9;
  const mdKva = mdKw / pf;
  const vaPerM2 = gfa ? (mdKva * 1000) / gfa : 0;

  const txSizes = txSizesOf(sup);
  const load = (sup.maxLoadingPct || 100) / 100;
  const allowed = txSizes.filter((z) => z <= (sup.maxTxKva || Infinity));
  let tx: LaResult['tx'];
  if (mdKva > 0 && allowed.length) {
    for (let n = 1; n <= 20 && !tx; n++) {
      const kva = allowed.find((z) => z * n * load >= mdKva);
      if (kva) tx = { count: sup.redundancy === 'N+1' ? n + 1 : n, kva, duty: n };
    }
  }
  // Generator: each category's demand (life safety at full load) times its share on the generator.
  const generatorKw = categories.reduce((x, c) => x + c.connectedKw * (c.diversity || 1) * c.generatorShare, 0);
  const generatorKvaRequired = (generatorKw / pf) * (sup.genMargin || 1);
  const gs = genSizes();
  let generatorKva: number | undefined, generatorCount = 0;
  if (generatorKvaRequired > 0) {
    for (let n = 1; n <= 6 && !generatorKva; n++) {
      generatorKva = gs.find((z) => z * n >= generatorKvaRequired);
      if (generatorKva) generatorCount = n;
    }
  }
  return {
    areaM2: area, pctTotal: pct, outdoorM2: outdoor, dwellingM2: dwell, liftCount, categories, connectedKw, sumDemandKw, mdKw, mdKva, vaPerM2,
    inBand: vaPerM2 >= a.vaBand[0] && vaPerM2 <= a.vaBand[1],
    services: { cool: hvac, dhw, cook, lifts: lift, ev, it: s.itKw || 0, fire: life, pool, kitchen, laundry, medical, facade },
    tx, txSizes, generatorKw, generatorKvaRequired, generatorKva, generatorCount,
    incomerA: tx ? (tx.kva * 1000) / (Math.sqrt(3) * (sup.voltage || 400)) : undefined
  };
}
