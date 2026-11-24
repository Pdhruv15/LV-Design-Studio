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

/** DC resistance at 20 °C of aluminium conductors, ohm/km (IEC 60228, class 2 stranded). */
export const AL_R20_OHM_PER_KM: Record<number, number> = {
  16: 1.91, 25: 1.2, 35: 0.868, 50: 0.641, 70: 0.443, 95: 0.32, 120: 0.253, 150: 0.206, 185: 0.164, 240: 0.125, 300: 0.1
};

/** Temperature coefficient of resistance at 20 °C, per K (IEC 60228 / IEC 60287-1-1). */
export const COPPER_ALPHA = 0.00393;
export const ALUMINIUM_ALPHA = 0.00403;
export const alphaOf = (f?: CableFamily) => (f?.conductor === 'al' ? ALUMINIUM_ALPHA : COPPER_ALPHA);

/** Highest conductor temperature in normal service, °C: XLPE 90, PVC 70. */
export const maxTempOf = (f?: CableFamily) => (f?.insulation === 'pvc' ? 70 : 90);

/** k of a protective conductor that is a core of the cable (IEC 60364-5-54 Table A.54.4): the conductor metal
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
