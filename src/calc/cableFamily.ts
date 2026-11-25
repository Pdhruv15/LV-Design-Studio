import { GENERIC_ODS } from '../data/cableBrands';

// Cable families: the conductor metal, the insulation and how the cores lie.
// The cable data (R, X, current ratings) is kept per family and size; a
// project uses it when its "Cable data by type" setting is on. Otherwise every
// cable is calculated as copper / XLPE / multicore, as before.

export type Conductor = 'cu' | 'al';
export type Insulation = 'xlpe' | 'pvc';
/** multi: one multicore cable; trefoil / flat: single-core cables touching in trefoil, or side by side. */
export type CableForm = 'multi' | 'trefoil' | 'flat';
export interface CableFamily { conductor: Conductor; insulation: Insulation; form: CableForm }

export const DEFAULT_FAMILY: CableFamily = { conductor: 'cu', insulation: 'xlpe', form: 'multi' };
export const familyKey = (f: CableFamily) => `${f.conductor}-${f.insulation}-${f.form}`;
export const DEFAULT_FAMILY_KEY = familyKey(DEFAULT_FAMILY);
export const isDefaultFamily = (f: CableFamily | undefined) => !f || familyKey(f) === DEFAULT_FAMILY_KEY;

const FORM_TEXT: Record<CableForm, string> = { multi: 'multicore', trefoil: 'single-core, trefoil', flat: 'single-core, flat' };
/** e.g. "Al/XLPE multicore". */
export const familyLabel = (f: CableFamily) => `${f.conductor === 'al' ? 'Al' : 'Cu'}/${f.insulation === 'pvc' ? 'PVC' : 'XLPE'} ${FORM_TEXT[f.form]}`;

/** The family of each cable type on the app's list (src/model/cableTypes.ts) that is not copper / XLPE / multicore.
 * Fire-rated, mineral and solar cable have no family data of their own and stay on the default. */
const FAMILY_OF_TYPE: Record<string, CableFamily> = {
  'XLPE 1C': { conductor: 'cu', insulation: 'xlpe', form: 'trefoil' },
  'XLPE 1C FLAT': { conductor: 'cu', insulation: 'xlpe', form: 'flat' },
  'PVC/PVC': { conductor: 'cu', insulation: 'pvc', form: 'multi' },
  'PVC/SWA/PVC': { conductor: 'cu', insulation: 'pvc', form: 'multi' },
  'PVC 1C': { conductor: 'cu', insulation: 'pvc', form: 'trefoil' },
  'AL/XLPE/SWA/PVC': { conductor: 'al', insulation: 'xlpe', form: 'multi' },
  'AL/XLPE 1C': { conductor: 'al', insulation: 'xlpe', form: 'trefoil' }
};
export const familyOfType = (cableType: string | undefined): CableFamily => (cableType && FAMILY_OF_TYPE[cableType]) || DEFAULT_FAMILY;

/** The family a cable is calculated with: its type's family when the project keeps cable data by type, else the default. */
export const feederFamily = (project: { cableDataByType?: boolean }, f: { cableType?: string }): CableFamily =>
  project.cableDataByType ? familyOfType(f.cableType) : DEFAULT_FAMILY;

/** A family from the words of a Cables.xlsx row (blank cells = the default); null when a word is not known. */
export function familyFromWords(conductor: string, insulation: string, form: string): CableFamily | null {
  const c = conductor.trim().toLowerCase(), i = insulation.trim().toLowerCase(), f = form.trim().toLowerCase();
  const cond: Conductor | null = !c || c.startsWith('cu') || c.startsWith('copper') ? 'cu' : c.startsWith('al') ? 'al' : null;
  const ins: Insulation | null = !i || i.startsWith('xlpe') ? 'xlpe' : i.startsWith('pvc') ? 'pvc' : null;
  const frm: CableForm | null = !f || f.startsWith('multi') ? 'multi' : f.includes('trefoil') ? 'trefoil' : f.includes('flat') ? 'flat' : null;
  return cond && ins && frm ? { conductor: cond, insulation: ins, form: frm } : null;
}

/** DC resistance at 20 °C of stranded aluminium conductors, ohm/km (industry-standard values). */
export const AL_R20_OHM_PER_KM: Record<number, number> = {
  16: 1.91, 25: 1.2, 35: 0.868, 50: 0.641, 70: 0.443, 95: 0.32, 120: 0.253, 150: 0.206, 185: 0.164, 240: 0.125, 300: 0.1
};

/** Temperature coefficient of resistance at 20 °C, per K. */
export const COPPER_ALPHA = 0.00393;
export const ALUMINIUM_ALPHA = 0.00403;
export const alphaOf = (f?: CableFamily) => (f?.conductor === 'al' ? ALUMINIUM_ALPHA : COPPER_ALPHA);

/** Highest conductor temperature in normal service, °C: XLPE 90, PVC 70. */
export const maxTempOf = (f?: CableFamily) => (f?.insulation === 'pvc' ? 70 : 90);

/** k of a protective conductor that is a core of the cable (industry-standard values): the conductor metal
 * and the insulation's initial / final temperatures (PVC 70 / 160 °C, XLPE 90 / 250 °C). */
export function kCpcOf(f?: CableFamily): number {
  const pvc = f?.insulation === 'pvc';
  return f?.conductor === 'al' ? (pvc ? 76 : 94) : pvc ? 115 : 143;
}

const OD_1C = new Map(GENERIC_ODS.filter((o) => o.cores === 1).map((o) => [o.csaMm2, o.odMm]));

/** Reactance of single-core cables touching, ohm/km at 50 Hz, calculated (not from a table):
 * X = 2πf · 0.2 mH/km · (¼ + ln(s ÷ r)), with s the axial spacing (the cable's overall diameter in trefoil,
 * ∛2 × that side by side) and r the conductor radius, taken as 0.59 √A for a compacted stranded conductor.
 * The diameter is the typical one of a single-core cable of that size; undefined when the size has none. */
export function singleCoreXOhmPerKm(csaMm2: number, form: 'trefoil' | 'flat'): number | undefined {
  const od = OD_1C.get(csaMm2);
  if (!od) return undefined;
  const r = 0.59 * Math.sqrt(csaMm2);
  const s = Math.max(od, 2 * r) * (form === 'flat' ? Math.cbrt(2) : 1);
  return Math.round(2 * Math.PI * 50 * 0.2e-3 * (0.25 + Math.log(s / r)) * 1000) / 1000;
}

// Built-in current ratings of the cable families, A: industry-standard values for cable in free air or on a
// perforated tray at 30 °C ambient, three loaded conductors (the same basis as the copper / XLPE / multicore
// reference ratings: the default installation method). They are reference values, reported as such; a row in
// Cables.xlsx replaces them. Other installation methods have no built-in rating for these families.
const SIZES = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300];
const SIZES_25 = SIZES.slice(6), SIZES_16 = SIZES.slice(5);
const table = (sizes: number[], amps: number[]): Record<number, number> => Object.fromEntries(sizes.map((s, i) => [s, amps[i]]));
const FAMILY_RATINGS_A: Record<string, Record<number, number>> = {
  // Multicore cable.
  'cu-xlpe-multi': table(SIZES, [23, 32, 42, 54, 75, 100, 127, 158, 192, 246, 298, 346, 399, 456, 538, 621]),
  'cu-pvc-multi': table(SIZES, [18.5, 25, 34, 43, 60, 80, 101, 126, 153, 196, 238, 276, 319, 364, 430, 497]),
  'al-xlpe-multi': table(SIZES_16, [77, 97, 120, 146, 187, 227, 263, 304, 347, 409, 471]),
  'al-pvc-multi': table(SIZES_16, [61, 78, 96, 117, 150, 183, 212, 245, 280, 330, 381]),
  // Single-core cables touching, in trefoil.
  'cu-xlpe-trefoil': table(SIZES_25, [135, 169, 207, 268, 328, 383, 444, 510, 607, 703]),
  'cu-pvc-trefoil': table(SIZES_25, [110, 137, 167, 216, 264, 308, 356, 409, 485, 561]),
  'al-xlpe-trefoil': table(SIZES_25, [103, 129, 159, 206, 253, 296, 343, 395, 471, 547]),
  'al-pvc-trefoil': table(SIZES_25, [84, 105, 128, 166, 203, 237, 274, 315, 375, 434]),
  // Single-core cables touching, side by side.
  'cu-xlpe-flat': table(SIZES_25, [141, 176, 216, 279, 342, 400, 464, 533, 634, 736]),
  'cu-pvc-flat': table(SIZES_25, [114, 143, 174, 225, 275, 321, 372, 427, 507, 587]),
  'al-xlpe-flat': table(SIZES_25, [107, 135, 165, 215, 264, 308, 358, 413, 492, 571])
};

/** The built-in current rating (A) of a size of a cable family on the default installation method; undefined when
 * there is none. Single cores smaller than the single-core ratings start at (25 mm²) take the multicore rating of
 * the same conductor and insulation, which is the lower of the two: on the safe side. */
export function familyRatingA(family: CableFamily, csaMm2: number): number | undefined {
  const own = FAMILY_RATINGS_A[familyKey(family)]?.[csaMm2];
  if (own !== undefined || family.form === 'multi') return own;
  return csaMm2 < 25 ? FAMILY_RATINGS_A[familyKey({ ...family, form: 'multi' })]?.[csaMm2] : undefined;
}
