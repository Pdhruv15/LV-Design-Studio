import type { Feeder, Project } from '../types';

/** Authority limits on cable / breaker combinations, on top of the IEC
 * sizing (Ib ≤ In ≤ Iz, voltage drop). DEWA Regulations for Electrical
 * Installations, Table 3: multi-core armoured XLPE copper cable, one cable in
 * normal situations — each size has a maximum MCB / MCCB rating and a maximum
 * load current. Parallel runs count as runs × the table value. Sizes outside
 * the table (below 10 mm² or above 300 mm²) are left to the calculation.
 * A cable that feeds a distribution board is at least 10 mm² on a breaker of
 * at least 40 A. The limits only ever make a cable larger. */

export interface CableLimitRow { csaMm2: number; maxBreakerA: number; maxLoadA: number }

export const DEWA_TABLE3: readonly CableLimitRow[] = [
  { csaMm2: 10, maxBreakerA: 50, maxLoadA: 50 },
  { csaMm2: 16, maxBreakerA: 60, maxLoadA: 60 },
  { csaMm2: 25, maxBreakerA: 80, maxLoadA: 80 },
  { csaMm2: 35, maxBreakerA: 100, maxLoadA: 100 },
  { csaMm2: 50, maxBreakerA: 125, maxLoadA: 125 },
  { csaMm2: 70, maxBreakerA: 160, maxLoadA: 160 },
  { csaMm2: 95, maxBreakerA: 200, maxLoadA: 200 },
  { csaMm2: 120, maxBreakerA: 225, maxLoadA: 225 },
  { csaMm2: 150, maxBreakerA: 250, maxLoadA: 250 },
  { csaMm2: 185, maxBreakerA: 300, maxLoadA: 300 },
  { csaMm2: 240, maxBreakerA: 350, maxLoadA: 350 },
  { csaMm2: 300, maxBreakerA: 400, maxLoadA: 400 }
];

/** DEWA: a feeder to a distribution board is at least this cable and breaker. */
export const DEWA_DB_FEEDER_MIN = { csaMm2: 10, breakerA: 40 } as const;

const TABLE_LABEL = 'DEWA Table 3';

export interface CableLimits { label: string; rows: readonly CableLimitRow[]; dbFeederMin: { csaMm2: number; breakerA: number } }

/** The project's authority limits: DEWA when the applied design reference is
 * DEWA (or builds on it by name), or when none is applied (the app's DEWA
 * defaults). Other authorities have no table yet. */
export function cableLimitsOf(project: Project): CableLimits | undefined {
  const ref = project.designReference;
  const dewa = !ref || ref.id === 'builtin-dewa' || /\bDEWA\b/i.test(ref.name);
  return dewa ? { label: TABLE_LABEL, rows: DEWA_TABLE3, dbFeederMin: DEWA_DB_FEEDER_MIN } : undefined;
}

/** Table 3 covers multi-core armoured XLPE copper cable; blank is the app's default XLPE/PVC/SWA. */
export function tableApplies(f: Pick<Feeder, 'cableType'>): boolean {
  const t = f.cableType?.trim();
  if (!t) return true;
  return /XLPE/i.test(t) && /SWA|AWA|ARM/i.test(t) && !/\bAL\b|alumin/i.test(t);
}

/** The table row for a size, or undefined when the size is outside the table. */
export const rowFor = (limits: CableLimits, csaMm2: number) => limits.rows.find((r) => r.csaMm2 === csaMm2);

/** Whether a cable size and runs may carry this breaker and load under the limits. */
export function combinationAllowed(limits: CableLimits, f: Pick<Feeder, 'cableType' | 'feedsBoardId'>, csaMm2: number, runs: number, breakerA: number, ib: number): boolean {
  if (f.feedsBoardId && csaMm2 < limits.dbFeederMin.csaMm2) return false;
  if (!tableApplies(f)) return true;
  const row = rowFor(limits, csaMm2);
  if (!row) return true;
  return breakerA <= row.maxBreakerA * runs + 1e-9 && ib <= row.maxLoadA * runs + 1e-9;
}

/** The rule a cable size must meet for this feeder, breaker and load; undefined when the project has no limits. */
export function limitRule(project: Project, f: Pick<Feeder, 'cableType' | 'feedsBoardId'>, breakerA: number, ib: number): ((csaMm2: number, runs: number) => boolean) | undefined {
  const limits = cableLimitsOf(project);
  return limits ? (csa, runs) => combinationAllowed(limits, f, csa, runs, breakerA, ib) : undefined;
}

/** Smallest breaker a feeder may have: DB feeders at least the DB minimum. */
export const minBreakerA = (limits: CableLimits | undefined, f: Pick<Feeder, 'feedsBoardId'>) =>
  limits && f.feedsBoardId ? limits.dbFeederMin.breakerA : 0;

export interface LimitCheck { status: 'ok' | 'bad'; message: string; label: string }

const runsText = (runs: number, csa: number) => `${runs > 1 ? `${runs} × ` : ''}${csa} mm²`;

/** Checks a feeder as built against the limits; undefined when no limit applies to it. */
export function checkLimits(project: Project, f: Feeder, ib: number, runs: number): LimitCheck | undefined {
  const limits = cableLimitsOf(project);
  if (!limits) return undefined;
  const { label, dbFeederMin } = limits;
  if (f.feedsBoardId) {
    if (f.cableCsaMm2 < dbFeederMin.csaMm2) return { label, status: 'bad', message: `DEWA: a feeder to a DB is at least ${dbFeederMin.csaMm2} mm² (has ${f.cableCsaMm2} mm²)` };
    if (f.breakerRatingA < dbFeederMin.breakerA) return { label, status: 'bad', message: `DEWA: a feeder to a DB has a breaker of at least ${dbFeederMin.breakerA} A (has ${f.breakerRatingA} A)` };
  }
  const row = tableApplies(f) ? rowFor(limits, f.cableCsaMm2) : undefined;
  if (!row) return f.feedsBoardId ? { label, status: 'ok', message: `DEWA: DB feeder ≥ ${dbFeederMin.csaMm2} mm², ≥ ${dbFeederMin.breakerA} A` } : undefined;
  const maxIn = row.maxBreakerA * runs, maxIb = row.maxLoadA * runs;
  const size = runsText(runs, f.cableCsaMm2);
  if (f.breakerRatingA > maxIn + 1e-9) return { label, status: 'bad', message: `${label}: ${f.breakerRatingA} A breaker on ${size} (max ${maxIn} A)` };
  if (ib > maxIb + 1e-9) return { label, status: 'bad', message: `${label}: load ${ib.toFixed(1)} A on ${size} (max ${maxIb} A)` };
  return { label, status: 'ok', message: `${label}: ${size} up to ${maxIn} A` };
}

/** Remark written on a feeder whose cable the limits made larger, e.g.
 * "DEWA Table 3: 35 mm² for 100 A (25 mm² max 80 A)". */
export function sizedUpRemark(limits: CableLimits, f: Pick<Feeder, 'feedsBoardId'>, calc: { csaMm2: number; runs: number }, chosen: { csaMm2: number; runs: number }, breakerA: number): string {
  if (f.feedsBoardId && calc.csaMm2 < limits.dbFeederMin.csaMm2) return `DEWA: DB feeder minimum ${limits.dbFeederMin.csaMm2} mm²`;
  const row = rowFor(limits, calc.csaMm2);
  const why = row ? ` (${runsText(calc.runs, calc.csaMm2)} max ${row.maxBreakerA * calc.runs} A)` : '';
  return `${limits.label}: ${runsText(chosen.runs, chosen.csaMm2)} for ${breakerA} A${why}`;
}

/** A remark the limits wrote (replaced or cleared on the next sizing; the user's own remarks are kept). */
export const isLimitRemark = (s: string | undefined) => !!s && /^DEWA( Table 3)?:/.test(s);
