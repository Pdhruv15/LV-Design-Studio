import type { Feeder, Project } from '../types';

/** Authority limits on cable / breaker combinations, on top of the IEC
 * sizing (Ib ≤ In ≤ Iz, voltage drop). DEWA Regulations for Electrical
 * Installations, Appendix 5 (selection of cables, normal situations): each
 * cable size has a maximum MCB / MCCB rating and a maximum load current.
 *  - Table 1: single-core PVC, non-armoured, in concealed conduit — 2 × 1C
 *    for 1-phase, 3/4 × 1C for 3-phase. Circuits on a DB load schedule are
 *    taken as this wiring unless another cable type is set.
 *  - Table 2: multi-core armoured PVC (PVC/SWA/PVC).
 *  - Table 3: multi-core armoured XLPE — the app's default cable.
 * "10/15 A" on 2.5 mm² is read as today's 16 A MCB. Table 2's "65 mm²" row
 * is a misprint for 95 mm². A size between two rows takes the smaller row's
 * limit; sizes below or above a table are left to the calculation. Parallel
 * runs count as runs × the table value. A cable that feeds a distribution
 * board is at least 10 mm² on a breaker of at least 40 A. The limits only
 * ever make a cable larger. */

export interface CableLimitRow { csaMm2: number; maxBreakerA: number; maxLoadA: number }
export interface CableLimitTable { label: string; rows: readonly CableLimitRow[] }

const rows = (pairs: [number, number][]): CableLimitRow[] => pairs.map(([csaMm2, a]) => ({ csaMm2, maxBreakerA: a, maxLoadA: a }));

export const DEWA_TABLE1_1PH: CableLimitTable = { label: 'DEWA Table 1', rows: rows([[2.5, 16], [4, 20], [6, 30], [10, 40], [16, 50], [25, 60], [35, 80]]) };
export const DEWA_TABLE1_3PH: CableLimitTable = { label: 'DEWA Table 1', rows: rows([[2.5, 16], [4, 20], [6, 25], [10, 30], [16, 40], [25, 60], [50, 80], [70, 100], [95, 125], [120, 160]]) };
export const DEWA_TABLE2: CableLimitTable = {
  label: 'DEWA Table 2',
  rows: rows([[2.5, 16], [4, 20], [6, 30], [10, 40], [16, 50], [25, 60], [35, 80], [50, 100], [70, 125], [95, 160], [120, 180], [150, 200], [185, 250], [240, 300], [300, 350], [400, 400]])
};
export const DEWA_TABLE3: CableLimitTable = {
  label: 'DEWA Table 3',
  rows: rows([[10, 50], [16, 60], [25, 80], [35, 100], [50, 125], [70, 160], [95, 200], [120, 225], [150, 250], [185, 300], [240, 350], [300, 400]])
};

/** DEWA: a feeder to a distribution board is at least this cable and breaker. */
export const DEWA_DB_FEEDER_MIN = { csaMm2: 10, breakerA: 40 } as const;

/** Cable types of Tables 1 and 2 (the app's other types: Table 3 when armoured XLPE copper). */
export const PVC_1C_CONDUIT = 'PVC 1C';
export const PVC_SWA = 'PVC/SWA/PVC';

type TableFeeder = Pick<Feeder, 'cableType' | 'cores' | 'phase'>;
export interface CableLimits { tableFor: (f: TableFeeder) => CableLimitTable | undefined; dbFeederMin: { csaMm2: number; breakerA: number } }

/** The DEWA table for a feeder's cable, or undefined when none covers it (aluminium, unarmoured XLPE, fire-rated …). */
export function dewaTableFor(f: TableFeeder): CableLimitTable | undefined {
  const t = f.cableType?.trim();
  const single = f.cores === 2 || (f.phase !== undefined && f.phase !== 'RYB');
  if (!t) return f.phase !== undefined ? (single ? DEWA_TABLE1_1PH : DEWA_TABLE1_3PH) : DEWA_TABLE3;
  if (/\bAL\b|alumin/i.test(t)) return undefined;
  if (t === PVC_1C_CONDUIT) return single ? DEWA_TABLE1_1PH : DEWA_TABLE1_3PH;
  if (/^PVC\/SWA/i.test(t)) return DEWA_TABLE2;
  if (/XLPE/i.test(t) && /SWA|AWA|ARM/i.test(t)) return DEWA_TABLE3;
  return undefined;
}

/** The project's authority limits: DEWA when the applied design reference is
 * DEWA (or builds on it by name), or when none is applied (the app's DEWA
 * defaults). Other authorities have no tables yet. */
export function cableLimitsOf(project: Project): CableLimits | undefined {
  const ref = project.designReference;
  const dewa = !ref || ref.id === 'builtin-dewa' || /\bDEWA\b/i.test(ref.name);
  return dewa ? { tableFor: dewaTableFor, dbFeederMin: DEWA_DB_FEEDER_MIN } : undefined;
}

/** The row that limits a size: the largest row at or below it; undefined below or above the table. */
export function rowFor(table: CableLimitTable, csaMm2: number): CableLimitRow | undefined {
  if (csaMm2 > table.rows[table.rows.length - 1].csaMm2 + 1e-9) return undefined;
  let hit: CableLimitRow | undefined;
  for (const r of table.rows) if (r.csaMm2 <= csaMm2 + 1e-9) hit = r;
  return hit;
}

type LimitFeeder = TableFeeder & Pick<Feeder, 'feedsBoardId'>;

/** Whether a cable size and runs may carry this breaker and load under the limits. */
export function combinationAllowed(limits: CableLimits, f: LimitFeeder, csaMm2: number, runs: number, breakerA: number, ib: number): boolean {
  if (f.feedsBoardId && csaMm2 < limits.dbFeederMin.csaMm2) return false;
  const table = limits.tableFor(f);
  const row = table && rowFor(table, csaMm2);
  if (!row) return true;
  return breakerA <= row.maxBreakerA * runs + 1e-9 && ib <= row.maxLoadA * runs + 1e-9;
}

/** The rule a cable size must meet for this feeder, breaker and load; undefined when the project has no limits. */
export function limitRule(project: Project, f: LimitFeeder, breakerA: number, ib: number): ((csaMm2: number, runs: number) => boolean) | undefined {
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
  const { dbFeederMin } = limits;
  const table = limits.tableFor(f);
  const label = table?.label ?? 'DEWA';
  if (f.feedsBoardId) {
    if (f.cableCsaMm2 < dbFeederMin.csaMm2) return { label, status: 'bad', message: `DEWA: a feeder to a DB is at least ${dbFeederMin.csaMm2} mm² (has ${f.cableCsaMm2} mm²)` };
    if (f.breakerRatingA < dbFeederMin.breakerA) return { label, status: 'bad', message: `DEWA: a feeder to a DB has a breaker of at least ${dbFeederMin.breakerA} A (has ${f.breakerRatingA} A)` };
  }
  const row = table && rowFor(table, f.cableCsaMm2);
  if (!table || !row) return f.feedsBoardId ? { label, status: 'ok', message: `DEWA: DB feeder ≥ ${dbFeederMin.csaMm2} mm², ≥ ${dbFeederMin.breakerA} A` } : undefined;
  const maxIn = row.maxBreakerA * runs, maxIb = row.maxLoadA * runs;
  const size = runsText(runs, f.cableCsaMm2);
  if (f.breakerRatingA > maxIn + 1e-9) return { label, status: 'bad', message: `${label}: ${f.breakerRatingA} A breaker on ${size} (max ${maxIn} A)` };
  if (ib > maxIb + 1e-9) return { label, status: 'bad', message: `${label}: load ${ib.toFixed(1)} A on ${size} (max ${maxIb} A)` };
  return { label, status: 'ok', message: `${label}: ${size} up to ${maxIn} A` };
}

/** Remark written on a feeder whose cable the limits made larger, e.g.
 * "DEWA Table 3: 35 mm² for 100 A (25 mm² max 80 A)". */
export function sizedUpRemark(limits: CableLimits, f: LimitFeeder, calc: { csaMm2: number; runs: number }, chosen: { csaMm2: number; runs: number }, breakerA: number): string {
  if (f.feedsBoardId && calc.csaMm2 < limits.dbFeederMin.csaMm2) return `DEWA: DB feeder minimum ${limits.dbFeederMin.csaMm2} mm²`;
  const table = limits.tableFor(f);
  const row = table && rowFor(table, calc.csaMm2);
  const why = row ? ` (${runsText(calc.runs, calc.csaMm2)} max ${row.maxBreakerA * calc.runs} A)` : '';
  return `${table?.label ?? 'DEWA'}: ${runsText(chosen.runs, chosen.csaMm2)} for ${breakerA} A${why}`;
}

/** A remark the limits wrote (replaced or cleared on the next sizing; the user's own remarks are kept). */
export const isLimitRemark = (s: string | undefined) => !!s && /^DEWA( Table \d)?:/.test(s);
