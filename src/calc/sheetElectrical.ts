import { AMBIENT_RANGE_C, ambientCorrectionFactor, cables, defaultCpcMm2, getCable } from './cableTable';
import { groupFactor } from './electrical';
import { currentFromPower, nextBreaker, pfCorrection, powerFromCurrent, transformer, voltageDrop, type Phases } from './quick';
import { STANDARD_TRANSFORMER_KVA } from './sizing';

/** Electrical functions for the built-in sheets' formulas (Sheets page), worked out with the app's own calculators
 * (src/calc/quick.ts) and data: the cable table (Cables.xlsx or the reference values), the breaker ratings
 * (Breakers.xlsx or the standard list) and the standard transformer ratings. Excel does not have these functions.
 *
 * Optional arguments are left off the end. phases: 3 (the default) or 1. V: line-to-line for 3-phase, phase-to-neutral
 * for 1-phase; left off, 400 V or 230 V. Each function gets numbers and gives a number; NaN when the inputs cannot
 * give one (the cell shows #VALUE!) and undefined when nothing in the app's data fits (#N/A). */

type Args = number[];
/** A sheet function: how many arguments it takes, and its sum. Arguments are numbers, except those at the positions in
 * `words`, which come as text (a class such as "R"; a number typed there comes as its text). */
export type SheetFunction =
  | { min: number; max: number; words?: undefined; fn: (a: Args) => number | undefined }
  | { min: number; max: number; words: number[]; fn: (a: (number | string)[]) => number | undefined };

const phasesOf = (v: number | undefined): Phases | undefined => (v === undefined ? 3 : v === 1 || v === 3 ? v : undefined);
const voltsOf = (v: number | undefined, ph: Phases) => v ?? (ph === 3 ? 400 : 230);
const inAmbientRange = (c: number) => Number.isFinite(c) && c >= AMBIENT_RANGE_C.min && c <= AMBIENT_RANGE_C.max;
const isFactor = (g: number) => Number.isFinite(g) && g > 0 && g <= 1;
/** A size the cable data has; undefined (#N/A) for one it does not. */
const knownSize = (mm2: number): number | undefined => { try { getCable(mm2); return mm2; } catch { return undefined; } };

/** The smallest cable, for this many runs in parallel, whose derated rating Iz covers both the current and the breaker
 * rating (so the breaker protects the cable) and whose voltage drop is within the limit — the rules of the app's cable
 * selection (selectCableRuns): sizes below 50 mm² are not paralleled, grouping for the runs unless one is given. */
function cableSize(a: Args): number | undefined {
  const [ib, lengthM, pf, ambientC, vdLimitPct] = a;
  const ph = phasesOf(a[5]), runs = a[7] ?? 1, group = a[8] ?? groupFactor(runs), breakerA = a[9];
  if (!ph || !(ib > 0) || !(lengthM >= 0) || !(pf >= 0 && pf <= 1) || !inAmbientRange(ambientC) || !(vdLimitPct > 0 && vdLimitPct <= 100)) return NaN;
  if (!Number.isInteger(runs) || runs < 1 || runs > 8 || !isFactor(group) || (breakerA !== undefined && !(breakerA >= ib - 1e-9))) return NaN;
  const inA = breakerA ?? nextBreaker(ib);
  if (inA === undefined) return undefined;
  const k = ambientCorrectionFactor(ambientC) * group * runs, v = voltsOf(a[6], ph);
  for (const c of cables()) {
    if (runs > 1 && c.csaMm2 < 50) continue;
    if (!(c.ampacityA * k >= Math.max(ib, inA))) continue;
    if (voltageDrop(ib, lengthM, c.csaMm2, ph, v, pf, runs).pct <= vdLimitPct) return c.csaMm2;
  }
  return undefined;
}

export const ELECTRICAL_FUNCTIONS: Record<string, SheetFunction> = {
  /** AMPS(kW, pf, [phases], [V]): the line current, A. */
  AMPS: { min: 2, max: 4, fn: (a) => { const ph = phasesOf(a[2]); return ph ? currentFromPower(a[0], 'kW', ph, voltsOf(a[3], ph), a[1]) : NaN; } },
  /** KW(A, pf, [phases], [V]): the active power at a current, kW. */
  KW: { min: 2, max: 4, fn: (a) => { const ph = phasesOf(a[2]); return ph ? powerFromCurrent(a[0], ph, voltsOf(a[3], ph), a[1]).kw : NaN; } },
  /** VD(A, length m, mm², pf, [phases], [V], [runs]): the voltage drop of the run, % of V. */
  VD: {
    min: 4, max: 7, fn: (a) => {
      const ph = phasesOf(a[4]);
      if (!ph) return NaN;
      if (knownSize(a[2]) === undefined) return a[2] > 0 ? undefined : NaN;
      return voltageDrop(a[0], a[1], a[2], ph, voltsOf(a[5], ph), a[3], a[6] ?? 1).pct;
    }
  },
  /** BREAKER(A): the next breaker rating at or above the current, A. */
  BREAKER: { min: 1, max: 1, fn: (a) => (a[0] >= 0 ? nextBreaker(a[0]) : NaN) },
  /** CABLESIZE(A, length m, pf, ambient °C, VD limit %, [phases], [V], [runs], [grouping], [breaker A]): mm² of each run. */
  CABLESIZE: { min: 5, max: 10, fn: cableSize },
  /** DERATE(ambient °C, [grouping]): the cable rating factor for the ambient, times the grouping factor. */
  DERATE: { min: 1, max: 2, fn: (a) => (inAmbientRange(a[0]) && isFactor(a[1] ?? 1) ? ambientCorrectionFactor(a[0]) * (a[1] ?? 1) : NaN) },
  /** CPC(mm²): the protective conductor for a line conductor, IEC 60364-5-54 Table 54.2, mm². */
  CPC: { min: 1, max: 1, fn: (a) => (a[0] > 0 ? defaultCpcMm2(a[0]) : NaN) },
  /** TXSIZE(kVA): the next standard transformer rating at or above the load, kVA. */
  TXSIZE: { min: 1, max: 1, fn: (a) => (a[0] >= 0 ? STANDARD_TRANSFORMER_KVA.find((k) => k >= a[0] - 1e-9) : NaN) },
  /** FAULTKA(kVA, impedance %, [V]): the fault at a transformer's LV terminals (infinite MV source, c = 1.05), kA. */
  FAULTKA: { min: 2, max: 3, fn: (a) => transformer(a[0], a[2] ?? 400, a[1]).faultKA },
  /** KVAR(kW, pf now, pf target): the capacitor kvar to raise the power factor; 0 when it is already there. */
  KVAR: { min: 3, max: 3, fn: (a) => pfCorrection(a[0], a[1], a[2]).kvar }
};
