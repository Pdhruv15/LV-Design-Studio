import { supplyIncomerFeeder, type Feeder, type Project } from '../types';
import { forgetNetworks } from './network';
import { AL_R20_OHM_PER_KM, familyRatingA, DEFAULT_FAMILY, familyKey, familyLabel, feederFamily, familyOfType, isDefaultFamily, maxTempOf, singleCoreXOhmPerKm, type CableFamily } from './cableFamily';

// Reference data for copper, XLPE-insulated, steel-wire-armoured (SWA) cable,
// 4-core, laid in free air at 30°C ambient — a common LV distribution cable
// construction. R values (ohm/km at 20°C DC) are IEC 60228 standard values.
// X and ampacity are typical published figures for this cable type and are
// approximations: for a real project, replace with the manufacturer's
// datasheet or the exact IEC 60364-5-52 table for your installation method.
export interface CableSpec {
  csaMm2: number;
  rOhmPerKm20C: number; // DC resistance at 20°C, ohm/km (IEC 60228)
  xOhmPerKm: number; // reactance, ohm/km (typical, multicore)
  ampacityA: number; // current rating in free air, 30°C ambient, XLPE 90°C
  ratePerM?: number; // supply + install rate for the BOQ (from Cables.xlsx)
  /** Where the row's values come from (Cables.xlsx; blank on the built-in reference rows). */
  manufacturer?: string;
  cableType?: string; // e.g. "Cu/XLPE/SWA/PVC 0.6/1 kV, 4-core"
  /** The row's cable family (src/calc/cableFamily.ts); absent = copper / XLPE / multicore. */
  family?: CableFamily;
  installMethod?: string; // e.g. "IEC 60364-5-52 method E, free air"
  referenceDoc?: string; // datasheet or table the values were taken from
  /** Current rating (A, 30 °C air / 20 °C ground, before derating) for other installation methods. */
  methodRatings?: Partial<Record<InstallMethod, number>>;
}

/** IEC 60364-5-52 reference installation methods. `ampacityA` is method E. */
export type InstallMethod = 'E' | 'C' | 'B1' | 'B2' | 'A1' | 'A2' | 'D1' | 'D2';
export const INSTALL_METHODS: { id: InstallMethod; label: string; ground: boolean }[] = [
  { id: 'E', label: 'E — in free air / on a tray', ground: false },
  { id: 'C', label: 'C — clipped direct to a wall', ground: false },
  { id: 'B1', label: 'B1 — single cores in conduit / trunking on a wall', ground: false },
  { id: 'B2', label: 'B2 — multicore in conduit / trunking on a wall', ground: false },
  { id: 'A1', label: 'A1 — single cores in conduit in an insulated wall', ground: false },
  { id: 'A2', label: 'A2 — multicore in conduit in an insulated wall', ground: false },
  { id: 'D1', label: 'D1 — in ducts in the ground', ground: true },
  { id: 'D2', label: 'D2 — direct in the ground', ground: true }
];
export const methodOf = (f: Pick<Feeder, 'installMethod'>): InstallMethod => f.installMethod ?? 'E';
export const isBuried = (m: InstallMethod) => m === 'D1' || m === 'D2';

/** Built-in reference ratings for the methods other than E, by size (A). Empty until the IEC 60364-5-52
 * Annex B tables are added from a verified copy of the standard; without a value (here or in Cables.xlsx) a
 * circuit on that method has no rating and shows DATA REQUIRED — nothing is substituted. */
export const REFERENCE_METHOD_RATINGS: Partial<Record<Exclude<InstallMethod, 'E'>, Record<number, number>>> = {};

/** Where a cable size's values come from:
 * - reference: the app's built-in approximate values (or a Cables.xlsx row still holding them unchanged)
 * - user: a Cables.xlsx row edited without naming a manufacturer and reference document
 * - manufacturer: a Cables.xlsx row naming its manufacturer and reference document
 * - fallback: the size is missing from Cables.xlsx, so the built-in reference value was used. */
export type CableSource = 'reference' | 'user' | 'manufacturer' | 'fallback';
export const CABLE_SOURCE_TEXT: Record<CableSource, string> = {
  reference: 'app reference value (approximate, not manufacturer-verified)',
  user: 'user-entered in Cables.xlsx (no manufacturer / reference document given)',
  manufacturer: 'manufacturer data (Cables.xlsx)',
  fallback: 'not in Cables.xlsx; app reference value used instead (approximate)'
};

/** Built-in reference data; replaced by Cables.xlsx when that has rows. */
export const REFERENCE_CABLE_TABLE: CableSpec[] = [
  { csaMm2: 1.5, rOhmPerKm20C: 12.1, xOhmPerKm: 0.1, ampacityA: 26 },
  { csaMm2: 2.5, rOhmPerKm20C: 7.41, xOhmPerKm: 0.1, ampacityA: 36 },
  { csaMm2: 4, rOhmPerKm20C: 4.61, xOhmPerKm: 0.09, ampacityA: 47 },
  { csaMm2: 6, rOhmPerKm20C: 3.08, xOhmPerKm: 0.09, ampacityA: 60 },
  { csaMm2: 10, rOhmPerKm20C: 1.83, xOhmPerKm: 0.09, ampacityA: 80 },
  { csaMm2: 16, rOhmPerKm20C: 1.15, xOhmPerKm: 0.085, ampacityA: 105 },
  { csaMm2: 25, rOhmPerKm20C: 0.727, xOhmPerKm: 0.085, ampacityA: 138 },
  { csaMm2: 35, rOhmPerKm20C: 0.524, xOhmPerKm: 0.08, ampacityA: 168 },
  { csaMm2: 50, rOhmPerKm20C: 0.387, xOhmPerKm: 0.08, ampacityA: 200 },
  { csaMm2: 70, rOhmPerKm20C: 0.268, xOhmPerKm: 0.08, ampacityA: 253 },
  { csaMm2: 95, rOhmPerKm20C: 0.193, xOhmPerKm: 0.075, ampacityA: 306 },
  { csaMm2: 120, rOhmPerKm20C: 0.153, xOhmPerKm: 0.075, ampacityA: 354 },
  { csaMm2: 150, rOhmPerKm20C: 0.124, xOhmPerKm: 0.075, ampacityA: 393 },
  { csaMm2: 185, rOhmPerKm20C: 0.0991, xOhmPerKm: 0.07, ampacityA: 448 },
  { csaMm2: 240, rOhmPerKm20C: 0.0754, xOhmPerKm: 0.07, ampacityA: 528 },
  { csaMm2: 300, rOhmPerKm20C: 0.0601, xOhmPerKm: 0.07, ampacityA: 603 }
];

// Ambient temperature correction factors for 90°C (XLPE) cable, relative to
// 30°C ambient. Calculated, not taken from a table: the conductor's permitted
// temperature rise at that ambient over its rise at 30°C, √((90 − θ) / (90 − 30)),
// at 5 K steps, rounded to two places. IEC 60364-5-52 Table B.52.14 is the
// table to check them against.
// PVC (70 °C) cable: the same formula with 70 in place of 90, to 60 °C as the table does.
const XLPE_MAX_C = 90;
const AMBIENT_REF_C = 30;
const ambientPoints = (maxC: number, count: number): [number, number][] => Array.from({ length: count }, (_, i): [number, number] => {
  const t = 25 + 5 * i;
  return [t, Math.round(Math.sqrt((maxC - t) / (maxC - AMBIENT_REF_C)) * 100) / 100];
});
const AMBIENT_POINTS = ambientPoints(XLPE_MAX_C, 10);
const AMBIENT_POINTS_PVC = ambientPoints(70, 8);

/** Range the correction table covers. Outside it the factor is held at the
 * end value (no extrapolation): conservative below 25 °C, NOT conservative
 * above 70 °C — see ambientCheck. */
export const AMBIENT_RANGE_C = { min: AMBIENT_POINTS[0][0], max: AMBIENT_POINTS[AMBIENT_POINTS.length - 1][0] } as const;

/** Ambient correction factor, interpolated in the table. Not a number in →
 * NaN out (never a made-up 1.0), so a missing ambient fails every rating check. */
export function ambientCorrectionFactor(ambientC: number, family?: CableFamily): number {
  if (!Number.isFinite(ambientC)) return NaN;
  const pvc = maxTempOf(family) === 70;
  const pts = pvc ? AMBIENT_POINTS_PVC : AMBIENT_POINTS;
  // PVC above its table: no factor (the 60 °C value would overstate the rating).
  if (pvc && ambientC > pts[pts.length - 1][0]) return NaN;
  if (ambientC <= pts[0][0]) return pts[0][1];
  if (ambientC >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
  for (let i = 0; i < pts.length - 1; i++) {
    const [t1, f1] = pts[i];
    const [t2, f2] = pts[i + 1];
    if (ambientC >= t1 && ambientC <= t2) {
      const frac = (ambientC - t1) / (t2 - t1);
      return f1 + frac * (f2 - f1);
    }
  }
  return NaN;
}

/** Whether an ambient temperature is inside the correction table, and what
 * using it means: 'bad' when the factor would be optimistic or there is no
 * number, 'warn' when it is held at the (conservative) 25 °C value. */
export function ambientCheck(ambientC: number): { status: 'ok' | 'warn' | 'bad'; problem?: string } {
  const { min, max } = AMBIENT_RANGE_C;
  if (!Number.isFinite(ambientC)) return { status: 'bad', problem: 'Design ambient temperature is not a number — cable ratings cannot be derated' };
  if (ambientC > max) return { status: 'bad', problem: `Design ambient ${ambientC} °C is above the ${max} °C the derating table covers — the ${max} °C factor would overstate the cable rating` };
  if (ambientC < min) return { status: 'warn', problem: `Design ambient ${ambientC} °C is below the ${min} °C the derating table covers — the ${min} °C factor is used (conservative)` };
  return { status: 'ok' };
}

let active: CableSpec[] = REFERENCE_CABLE_TABLE;
/** Cables.xlsx rows of the other cable families, by family key. */
let familyRows = new Map<string, CableSpec[]>();
const builtInFamily = new Map<string, CableSpec | null>();

/** Cable data in use: the database's Cables.xlsx when it has valid rows,
 * otherwise the built-in reference table. Sorted by size. */
export function cables(): CableSpec[] {
  return active;
}

/** Sets the cable data (null = back to the built-in reference). */
export function setCables(rows: CableSpec[] | null): void {
  const own = (rows ?? []).filter((r) => isDefaultFamily(r.family));
  active = own.length ? [...own].sort((a, b) => a.csaMm2 - b.csaMm2) : REFERENCE_CABLE_TABLE;
  familyRows = new Map();
  for (const r of rows ?? []) if (!isDefaultFamily(r.family)) familyRows.set(familyKey(r.family!), [...(familyRows.get(familyKey(r.family!)) ?? []), r]);
  forgetNetworks();
}
/** True when the calculations use the app's built-in reference cable values
 * (approximations — replace with manufacturer data via Cables.xlsx). */
export const usingReferenceCables = () => active === REFERENCE_CABLE_TABLE;
export const cablesSource = () => (usingReferenceCables() ? 'app reference values (approximate, not manufacturer data)' : 'Cables.xlsx (LV Database)');
/** Notice printed on outputs made with the reference values. */
export const REFERENCE_DATA_NOTICE = 'Cable data: app reference values (approximate, not manufacturer-verified). Replace them in Cables.xlsx before relying on these results.';

const sameValues = (a: CableSpec, b: CableSpec) => a.rOhmPerKm20C === b.rOhmPerKm20C && a.xOhmPerKm === b.xOhmPerKm && a.ampacityA === b.ampacityA;

/** The app's own values for a size of another cable family: R at 20 °C from the aluminium table or the
 * reference table (copper); X of the reference table for a multicore cable (the same geometry) or calculated for
 * single cores; the family's built-in current rating for the default installation method (familyRatingA). A size
 * with no built-in rating has none (NaN): it must come from Cables.xlsx, nothing is substituted. */
function builtInFamilySpec(csaMm2: number, family: CableFamily): CableSpec | null {
  const key = `${familyKey(family)}|${csaMm2}`;
  if (!builtInFamily.has(key)) {
    const ref = REFERENCE_CABLE_TABLE.find((c) => c.csaMm2 === csaMm2);
    const r = family.conductor === 'al' ? AL_R20_OHM_PER_KM[csaMm2] : ref?.rOhmPerKm20C;
    const x = family.form === 'multi' ? ref?.xOhmPerKm : singleCoreXOhmPerKm(csaMm2, family.form);
    builtInFamily.set(key, r && x ? { csaMm2, rOhmPerKm20C: r, xOhmPerKm: x, ampacityA: familyRatingA(family, csaMm2) ?? NaN, family } : null);
  }
  return builtInFamily.get(key)!;
}

/** A cable size's data and where it comes from; null when no data has the size. `family`: the cable family
 * (default copper / XLPE / multicore). */
export function resolveCable(csaMm2: number, family: CableFamily = DEFAULT_FAMILY): { spec: CableSpec; source: CableSource } | null {
  if (!isDefaultFamily(family)) {
    const own = familyRows.get(familyKey(family))?.find((c) => c.csaMm2 === csaMm2);
    if (own) return { spec: own, source: own.manufacturer?.trim() && own.referenceDoc?.trim() ? 'manufacturer' : 'user' };
    const built = builtInFamilySpec(csaMm2, family);
    return built ? { spec: built, source: 'reference' } : null;
  }
  const ref = REFERENCE_CABLE_TABLE.find((c) => c.csaMm2 === csaMm2);
  if (usingReferenceCables()) return ref ? { spec: ref, source: 'reference' } : null;
  const db = active.find((c) => c.csaMm2 === csaMm2);
  if (!db) return ref ? { spec: ref, source: 'fallback' } : null;
  if (db.manufacturer?.trim() && db.referenceDoc?.trim()) return { spec: db, source: 'manufacturer' };
  return { spec: db, source: ref && sameValues(db, ref) ? 'reference' : 'user' };
}

export function getCable(csaMm2: number, family?: CableFamily): CableSpec {
  // A project may use a size the database doesn't list; the reference value
  // is used for it rather than failing the whole calculation — resolveCable /
  // cableDataStatus report that it happened.
  const c = resolveCable(csaMm2, family);
  if (!c) throw new Error(`No cable data for ${csaMm2} mm²${isDefaultFamily(family) ? '' : ` ${familyLabel(family!)}`}`);
  return c.spec;
}

/** The current rating of a size for an installation method (before derating), and where it comes from;
 * null when neither Cables.xlsx nor the built-in reference has one. Method E is the cable data's own rating. */
export function methodRating(csaMm2: number, method: InstallMethod, family?: CableFamily): { a: number; source: CableSource } | null {
  const r = resolveCable(csaMm2, family);
  if (!r) return null;
  if (!isDefaultFamily(family)) {
    const a = method === 'E' ? r.spec.ampacityA : r.spec.methodRatings?.[method];
    return a !== undefined && Number.isFinite(a) && a > 0 ? { a, source: r.source } : null;
  }
  if (method === 'E') return { a: r.spec.ampacityA, source: r.source };
  const own = r.source === 'fallback' ? undefined : r.spec.methodRatings?.[method];
  if (own !== undefined && Number.isFinite(own) && own > 0) return { a: own, source: r.source === 'manufacturer' ? 'manufacturer' : usingReferenceCables() ? 'reference' : 'user' };
  const ref = REFERENCE_METHOD_RATINGS[method]?.[csaMm2];
  return ref ? { a: ref, source: usingReferenceCables() ? 'reference' : 'fallback' } : null;
}

/** The cables the project uses: its feeders and the incoming cable of each first board on an LV supply. */
type CableUse = Pick<Project, 'feeders'> & Partial<Pick<Project, 'boards' | 'cableDataByType'>>;
export const cablesInUse = (project: CableUse): Feeder[] => [...project.feeders, ...(project.boards ?? []).flatMap((b) => supplyIncomerFeeder(b) ?? [])];

/** Where the data for each cable size the project uses comes from (phase and
 * protective conductors), smallest size first. `missing`: sizes no data has. */
export function cableDataStatus(project: CableUse): { sizes: { csaMm2: number; source: CableSource }[]; missing: number[]; methods: { csaMm2: number; method: InstallMethod; source?: CableSource }[]; families: FamilyUse[] } {
  const used = new Set<number>(), byMethod = new Map<string, { csaMm2: number; method: InstallMethod }>();
  const byFamily = new Map<string, { csaMm2: number; method: InstallMethod; family: CableFamily }>();
  for (const f of cablesInUse(project)) {
    const m = methodOf(f), family = feederFamily(project, f);
    if (!isDefaultFamily(family)) {
      // Another family: the cable's own data and rating; its protective conductor is the same family.
      byFamily.set(`${familyKey(family)}|${f.cableCsaMm2}|${m}`, { csaMm2: f.cableCsaMm2, method: m, family });
      continue;
    }
    used.add(f.cableCsaMm2); if (f.cpcMm2 !== undefined) used.add(f.cpcMm2);
    if (m !== 'E') byMethod.set(`${f.cableCsaMm2}|${m}`, { csaMm2: f.cableCsaMm2, method: m });
  }
  const sizes: { csaMm2: number; source: CableSource }[] = [], missing: number[] = [];
  for (const csa of [...used].sort((a, b) => a - b)) {
    const r = resolveCable(csa);
    if (r) sizes.push({ csaMm2: csa, source: r.source }); else missing.push(csa);
  }
  /** Ratings for the installation methods other than E, by size and method; no source = no rating. */
  const methods = [...byMethod.values()].sort((a, b) => a.csaMm2 - b.csaMm2 || a.method.localeCompare(b.method))
    .map((x) => ({ ...x, source: methodRating(x.csaMm2, x.method)?.source }));
  const families = [...byFamily.values()].sort((a, b) => familyKey(a.family).localeCompare(familyKey(b.family)) || a.csaMm2 - b.csaMm2 || a.method.localeCompare(b.method))
    .map((x) => ({ ...x, label: familyLabel(x.family), source: resolveCable(x.csaMm2, x.family)?.source, rating: methodRating(x.csaMm2, x.method, x.family)?.source }));
  return { sizes, missing, methods, families };
}

/** A size of another cable family the project uses, on one installation method: where its R and X come from
 * (`source`; absent = no data for the size) and its current rating (`rating`; absent = none, DATA REQUIRED). */
export interface FamilyUse { csaMm2: number; method: InstallMethod; family: CableFamily; label: string; source?: CableSource; rating?: CableSource }
const familyText = (x: FamilyUse) => `${x.csaMm2} mm² ${x.label}${x.method === 'E' ? '' : ` (${x.method})`}`;

/** Cables whose type has its own family data while the project still calculates every cable as copper / XLPE /
 * multicore ("Cable data by type" off): the type labels, for a to-do line. */
export function typesOnDefaultData(project: CableUse): string[] {
  if (project.cableDataByType) return [];
  return [...new Set(cablesInUse(project).filter((f) => !isDefaultFamily(familyOfType(f.cableType))).map((f) => familyLabel(familyOfType(f.cableType))))].sort();
}

/** One line for reports: which sizes (and installation-method ratings) are not manufacturer data, by source; '' when all are. */
export function cableDataNotice(project: CableUse): string {
  const { sizes, missing, methods, families } = cableDataStatus(project);
  const by = (s: CableSource) => [...sizes.filter((x) => x.source === s).map((x) => `${x.csaMm2}`), ...methods.filter((x) => x.source === s).map((x) => `${x.csaMm2} (${x.method})`)];
  const list = (xs: string[]) => `${xs.join(', ')} mm²`;
  const parts = (['reference', 'fallback', 'user'] as const).filter((s) => by(s).length).map((s) => `${list(by(s))}: ${CABLE_SOURCE_TEXT[s]}`);
  if (missing.length) parts.push(`${list(missing.map(String))}: no cable data`);
  const noRating = methods.filter((x) => !x.source);
  if (noRating.length) parts.push(`${list(noRating.map((x) => `${x.csaMm2} (${x.method})`))}: no rating for the installation method`);
  const famRef = families.filter((x) => x.source && x.source !== 'manufacturer');
  if (famRef.length) parts.push(`${[...new Set(famRef.map((x) => `${x.csaMm2} mm² ${x.label}`))].join(', ')}: R and X not manufacturer data (app values or user-entered)`);
  const famNone = families.filter((x) => !x.source || !x.rating);
  if (famNone.length) parts.push(`${famNone.map(familyText).join(', ')}: no ${famNone.some((x) => !x.source) ? 'cable data or ' : ''}current rating`);
  return parts.length ? `Cable data — ${parts.join('; ')}. Verify against the manufacturer's datasheet before relying on these results.` : '';
}

/** To-do findings about the cable data: a size taken from the reference table
 * because Cables.xlsx lacks it is always flagged; a circuit whose installation
 * method has no rating fails (DATA REQUIRED); with `strictCableData` (final
 * design) every size or method rating without manufacturer data must be fixed. */
export function cableDataFindings(project: CableUse & Pick<Project, 'strictCableData'>): { status: 'warn' | 'bad'; text: string }[] {
  const { sizes, missing, methods, families } = cableDataStatus(project);
  const strict = !!project.strictCableData;
  const out: { status: 'warn' | 'bad'; text: string }[] = [];
  const of = (s: CableSource) => [...sizes.filter((x) => x.source === s).map((x) => `${x.csaMm2}`), ...methods.filter((x) => x.source === s).map((x) => `${x.csaMm2} (${x.method})`)];
  if (missing.length) out.push({ status: 'bad', text: `Cable data: ${missing.join(', ')} mm² not in Cables.xlsx or the reference table` });
  const noRating = methods.filter((x) => !x.source).map((x) => `${x.csaMm2} mm² ${x.method}`);
  if (noRating.length) out.push({ status: 'bad', text: `Cable data required: no current rating for ${noRating.join(', ')} — add the installation-method rating in Cables.xlsx` });
  if (of('fallback').length) out.push({ status: strict ? 'bad' : 'warn', text: `Cable data: ${of('fallback').join(', ')} mm² missing from Cables.xlsx — approximate app reference values used` });
  const famNoData = families.filter((x) => !x.source);
  if (famNoData.length) out.push({ status: 'bad', text: `Cable data: no data for ${[...new Set(famNoData.map((x) => `${x.csaMm2} mm² ${x.label}`))].join(', ')} — add the rows in Cables.xlsx` });
  const famNoRating = families.filter((x) => x.source && !x.rating);
  if (famNoRating.length) out.push({ status: 'bad', text: `Cable data required: no current rating for ${famNoRating.map(familyText).join(', ')} — add the rows (Conductor, Insulation, Form) in Cables.xlsx` });
  const onDefault = typesOnDefaultData(project);
  if (onDefault.length) out.push({ status: 'warn', text: `Cable data by type is off: ${onDefault.join(', ')} cables are calculated with copper / XLPE / multicore data — turn it on in Project settings` });
  if (strict) {
    const famUnverified = [...new Set(families.filter((x) => x.source && x.source !== 'manufacturer').map((x) => `${x.csaMm2} mm² ${x.label}`))];
    if (famUnverified.length) out.push({ status: 'bad', text: `Cable data: ${famUnverified.join(', ')} without manufacturer data (manufacturer and reference document in Cables.xlsx) — required for final design` });
    const unverified = [...of('reference'), ...of('user')];
    if (unverified.length) out.push({ status: 'bad', text: `Cable data: ${unverified.join(', ')} mm² without manufacturer data (manufacturer and reference document in Cables.xlsx) — required for final design` });
  }
  return out;
}

/** Protective conductor size from IEC 60364-5-54 Table 54.2 (same material
 * as the line conductor): S ≤ 16 → S; 16 < S ≤ 35 → 16; S > 35 → S/2,
 * rounded up to the next standard size. */
export function defaultCpcMm2(phaseMm2: number): number {
  if (phaseMm2 <= 16) return phaseMm2;
  if (phaseMm2 <= 35) return 16;
  return cables().find((c) => c.csaMm2 >= phaseMm2 / 2)?.csaMm2 ?? phaseMm2;
}

export const cpcOf = (f: Feeder) => f.cpcMm2 ?? defaultCpcMm2(f.cableCsaMm2);
