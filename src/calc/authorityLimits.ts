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
 * ever make a cable larger. A design reference may carry its own copy of
 * the limits (Standards → Design references), edited row by row; applying
 * it copies them into the project. */

export interface CableLimitRow { csaMm2: number; maxBreakerA: number; maxLoadA: number }
export interface CableLimitTable {
  id: string;
  /** Shown in remarks and checks, e.g. "DEWA Table 3". */
  label: string;
  /** Cable type values it covers, plus DEFAULT_FEEDER / DB_WIRING for circuits with no type set. */
  cableTypes: string[];
  /** Only single-phase (2-core) or only three-phase circuits; both when unset. */
  phases?: 'single' | 'three';
  rows: CableLimitRow[];
}

/** Size up: the sizing makes the cable meet the tables and writes a remark.
 * Warn: the sizing ignores them; the check fails with quick fixes. Off: none. */
export type LimitMode = 'size-up' | 'warn' | 'off';
export const LIMIT_MODES: [LimitMode, string][] = [['size-up', 'Size the cable up and add a remark'], ['warn', "Warn only (flag, don't resize)"], ['off', 'Off']];

/** An authority's cable / breaker limits: kept on a design reference and
 * copied into the project when the reference is applied. */
export interface CableLimitSet {
  /** Authority name for messages, e.g. "DEWA". */
  name: string;
  mode: LimitMode;
  dbFeederMin: { csaMm2: number; breakerA: number };
  tables: CableLimitTable[];
}

/** Keys for circuits with no cable type set: feeders (the app's default armoured XLPE) and DB load-schedule circuits. */
export const DEFAULT_FEEDER = '(default)';
export const DB_WIRING = '(db circuit)';

const rows = (pairs: [number, number][]): CableLimitRow[] => pairs.map(([csaMm2, a]) => ({ csaMm2, maxBreakerA: a, maxLoadA: a }));

/** Cable types of Tables 1 and 2 (the app's other types: Table 3 when armoured XLPE copper). */
export const PVC_1C_CONDUIT = 'PVC 1C';
export const PVC_SWA = 'PVC/SWA/PVC';
const XLPE_ARMOURED = ['XLPE/PVC/SWA', 'XLPE/SWA/PVC', 'XLPE/SWA/LSZH', 'XLPE/LSF/SWA'];

export const DEWA_TABLE1_1PH: CableLimitTable = { id: 'dewa-t1-1ph', label: 'DEWA Table 1', cableTypes: [DB_WIRING, PVC_1C_CONDUIT], phases: 'single', rows: rows([[2.5, 16], [4, 20], [6, 30], [10, 40], [16, 50], [25, 60], [35, 80]]) };
export const DEWA_TABLE1_3PH: CableLimitTable = { id: 'dewa-t1-3ph', label: 'DEWA Table 1', cableTypes: [DB_WIRING, PVC_1C_CONDUIT], phases: 'three', rows: rows([[2.5, 16], [4, 20], [6, 25], [10, 30], [16, 40], [25, 60], [50, 80], [70, 100], [95, 125], [120, 160]]) };
export const DEWA_TABLE2: CableLimitTable = {
  id: 'dewa-t2', label: 'DEWA Table 2', cableTypes: [PVC_SWA],
  rows: rows([[2.5, 16], [4, 20], [6, 30], [10, 40], [16, 50], [25, 60], [35, 80], [50, 100], [70, 125], [95, 160], [120, 180], [150, 200], [185, 250], [240, 300], [300, 350], [400, 400]])
};
export const DEWA_TABLE3: CableLimitTable = {
  id: 'dewa-t3', label: 'DEWA Table 3', cableTypes: [DEFAULT_FEEDER, ...XLPE_ARMOURED],
  rows: rows([[10, 50], [16, 60], [25, 80], [35, 100], [50, 125], [70, 160], [95, 200], [120, 225], [150, 250], [185, 300], [240, 350], [300, 400]])
};

/** DEWA: a feeder to a distribution board is at least this cable and breaker. */
export const DEWA_DB_FEEDER_MIN = { csaMm2: 10, breakerA: 40 } as const;

/** The built-in DEWA limits (Appendix 5, Tables 1–3, and the DB feeder minimum). */
export const DEWA_LIMITS: CableLimitSet = {
  name: 'DEWA', mode: 'size-up', dbFeederMin: { ...DEWA_DB_FEEDER_MIN },
  tables: [DEWA_TABLE1_1PH, DEWA_TABLE1_3PH, DEWA_TABLE2, DEWA_TABLE3]
};

type TableFeeder = Pick<Feeder, 'cableType' | 'cores' | 'phase'>;
export type CableLimits = CableLimitSet;

const KNOWN = new Set([...XLPE_ARMOURED, PVC_SWA, PVC_1C_CONDUIT, 'XLPE/PVC', 'XLPE 1C', 'PVC/PVC', 'FR BS 8491', 'FR BS 6387 CWZ', 'FR IEC 60331', 'MICC', 'H1Z2Z2-K']);

/** The key a feeder's cable is listed under: its type, a type of the app's
 * list for an older free-text name (armoured PVC or XLPE, copper), or the
 * key for circuits with no type set. */
export function cableKeyOf(f: TableFeeder): string | undefined {
  const t = f.cableType?.trim();
  if (!t) return f.phase !== undefined ? DB_WIRING : DEFAULT_FEEDER;
  if (KNOWN.has(t)) return t;
  if (/\bAL\b|alumin/i.test(t)) return undefined;
  if (/^PVC\/SWA/i.test(t)) return PVC_SWA;
  if (/XLPE/i.test(t) && /SWA|AWA|ARM/i.test(t)) return XLPE_ARMOURED[0];
  return t;
}

/** The table for a feeder's cable, or undefined when none covers it (aluminium, unarmoured XLPE, fire-rated …). */
export function tableFor(limits: Pick<CableLimitSet, 'tables'>, f: TableFeeder): CableLimitTable | undefined {
  const key = cableKeyOf(f);
  if (key === undefined) return undefined;
  const single = f.cores === 2 || (f.phase !== undefined && f.phase !== 'RYB');
  return limits.tables.find((t) => t.cableTypes.includes(key) && (!t.phases || (t.phases === 'single') === single));
}

/** The DEWA table for a feeder's cable. */
export const dewaTableFor = (f: TableFeeder) => tableFor(DEWA_LIMITS, f);

/** The limits stored on an applied reference; older projects without them
 * get DEWA's when the reference is DEWA (or builds on it by name), or when
 * none is applied (the app's DEWA defaults). */
export function projectLimitsOf(project: Project): CableLimitSet | undefined {
  const ref = project.designReference;
  if (ref?.cableLimits) return ref.cableLimits;
  const dewa = !ref || ref.id === 'builtin-dewa' || /\bDEWA\b/i.test(ref.name);
  return dewa ? DEWA_LIMITS : undefined;
}

/** The limits the project checks against (size up or warn); undefined when off or none. */
export function cableLimitsOf(project: Project): CableLimits | undefined {
  const l = projectLimitsOf(project);
  return l && l.mode !== 'off' ? l : undefined;
}

/** The limits the sizing makes cables meet: only in "size up" mode. */
export function sizingLimitsOf(project: Project): CableLimits | undefined {
  const l = projectLimitsOf(project);
  return l?.mode === 'size-up' ? l : undefined;
}

/** The row that limits a size: the largest row at or below it; undefined below or above the table. */
export function rowFor(table: Pick<CableLimitTable, 'rows'>, csaMm2: number): CableLimitRow | undefined {
  if (!table.rows.length || csaMm2 > table.rows[table.rows.length - 1].csaMm2 + 1e-9) return undefined;
  let hit: CableLimitRow | undefined;
  for (const r of table.rows) if (r.csaMm2 <= csaMm2 + 1e-9) hit = r;
  return hit;
}

type LimitFeeder = TableFeeder & Pick<Feeder, 'feedsBoardId'>;

/** Whether a cable size and runs may carry this breaker and load under the limits. */
export function combinationAllowed(limits: CableLimits, f: LimitFeeder, csaMm2: number, runs: number, breakerA: number, ib: number): boolean {
  if (f.feedsBoardId && csaMm2 < limits.dbFeederMin.csaMm2) return false;
  const table = tableFor(limits, f);
  const row = table && rowFor(table, csaMm2);
  if (!row) return true;
  return breakerA <= row.maxBreakerA * runs + 1e-9 && ib <= row.maxLoadA * runs + 1e-9;
}

/** The rule a cable size must meet when sizing this feeder, breaker and load; undefined unless the project sizes to limits. */
export function limitRule(project: Project, f: LimitFeeder, breakerA: number, ib: number): ((csaMm2: number, runs: number) => boolean) | undefined {
  const limits = sizingLimitsOf(project);
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
  const { dbFeederMin, name } = limits;
  const table = tableFor(limits, f);
  const label = table?.label ?? name;
  if (f.feedsBoardId) {
    if (f.cableCsaMm2 < dbFeederMin.csaMm2) return { label, status: 'bad', message: `${name}: a feeder to a DB is at least ${dbFeederMin.csaMm2} mm² (has ${f.cableCsaMm2} mm²)` };
    if (f.breakerRatingA < dbFeederMin.breakerA) return { label, status: 'bad', message: `${name}: a feeder to a DB has a breaker of at least ${dbFeederMin.breakerA} A (has ${f.breakerRatingA} A)` };
  }
  const row = table && rowFor(table, f.cableCsaMm2);
  if (!table || !row) return f.feedsBoardId ? { label, status: 'ok', message: `${name}: DB feeder ≥ ${dbFeederMin.csaMm2} mm², ≥ ${dbFeederMin.breakerA} A` } : undefined;
  const maxIn = row.maxBreakerA * runs, maxIb = row.maxLoadA * runs;
  const size = runsText(runs, f.cableCsaMm2);
  if (f.breakerRatingA > maxIn + 1e-9) return { label, status: 'bad', message: `${label}: ${f.breakerRatingA} A breaker on ${size} (max ${maxIn} A)` };
  if (ib > maxIb + 1e-9) return { label, status: 'bad', message: `${label}: load ${ib.toFixed(1)} A on ${size} (max ${maxIb} A)` };
  return { label, status: 'ok', message: `${label}: ${size} up to ${maxIn} A` };
}

/** Remark written on a feeder whose cable the limits made larger, e.g.
 * "DEWA Table 3: 35 mm² for 100 A (25 mm² max 80 A)". */
export function sizedUpRemark(limits: CableLimits, f: LimitFeeder, calc: { csaMm2: number; runs: number }, chosen: { csaMm2: number; runs: number }, breakerA: number): string {
  if (f.feedsBoardId && calc.csaMm2 < limits.dbFeederMin.csaMm2) return `${limits.name}: DB feeder minimum ${limits.dbFeederMin.csaMm2} mm²`;
  const table = tableFor(limits, f);
  const row = table && rowFor(table, calc.csaMm2);
  const why = row ? ` (${runsText(calc.runs, calc.csaMm2)} max ${row.maxBreakerA * calc.runs} A)` : '';
  return `${table?.label ?? limits.name}: ${runsText(chosen.runs, chosen.csaMm2)} for ${breakerA} A${why}`;
}

/** A remark the limits wrote (replaced or cleared on the next sizing; the
 * user's own remarks are kept): "<table or authority>: <size> for <A> A …"
 * or "<authority>: DB feeder minimum …". */
export function isLimitRemark(s: string | undefined, limits?: CableLimits): boolean {
  if (!s) return false;
  if (/^DEWA( Table \d)?:/.test(s)) return true;
  if (!limits) return false;
  const heads = [limits.name, ...limits.tables.map((t) => t.label)].filter(Boolean);
  return heads.some((h) => s.startsWith(`${h}: `) && (/: (\d+ × )?[\d.]+ mm² for \d+(\.\d+)? A/.test(s) || s.includes(': DB feeder minimum ')));
}

// ---- Editing -----------------------------------------------------------------

/** Cleans limits read from a file or a project; undefined when unusable. */
export function normaliseLimits(x: unknown): CableLimitSet | undefined {
  if (!x || typeof x !== 'object') return undefined;
  const l = x as Partial<CableLimitSet>;
  const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : NaN);
  const tables = (Array.isArray(l.tables) ? l.tables : []).filter((t) => t && typeof t === 'object').map((t, i): CableLimitTable => ({
    id: typeof t.id === 'string' && t.id ? t.id : `t-${i}`,
    label: String(t.label ?? ''),
    cableTypes: Array.isArray(t.cableTypes) ? t.cableTypes.map(String) : [],
    ...(t.phases === 'single' || t.phases === 'three' ? { phases: t.phases } : {}),
    rows: (Array.isArray(t.rows) ? t.rows : [])
      .map((r) => ({ csaMm2: num(r?.csaMm2), maxBreakerA: num(r?.maxBreakerA), maxLoadA: num(r?.maxLoadA) }))
      .filter((r) => r.csaMm2 > 0 && r.maxBreakerA > 0 && r.maxLoadA > 0)
      .sort((a, b) => a.csaMm2 - b.csaMm2)
  }));
  const min = l.dbFeederMin ?? { csaMm2: 0, breakerA: 0 };
  return {
    name: String(l.name ?? '').trim() || 'Authority',
    mode: LIMIT_MODES.some(([m]) => m === l.mode) ? l.mode! : 'size-up',
    dbFeederMin: { csaMm2: Math.max(0, num(min.csaMm2) || 0), breakerA: Math.max(0, num(min.breakerA) || 0) },
    tables
  };
}

/** Problems that stop limits being saved. */
export function limitIssues(l: CableLimitSet | undefined): string[] {
  if (!l) return [];
  const out: string[] = [];
  if (!(l.dbFeederMin.csaMm2 >= 0) || !(l.dbFeederMin.breakerA >= 0)) out.push('Cable / breaker limits: the DB feeder minimum must be 0 or more.');
  for (const t of l.tables) {
    const name = t.label.trim() || 'A table';
    if (!t.label.trim()) out.push('Cable / breaker limits: give every table a name.');
    if (!t.cableTypes.length) out.push(`${name}: pick the cable types it applies to.`);
    const seen = new Set<number>();
    for (const r of t.rows) {
      if (!(r.csaMm2 > 0) || !(r.maxBreakerA > 0) || !(r.maxLoadA > 0)) { out.push(`${name}: every row needs a size, a breaker and a load above 0.`); break; }
      if (seen.has(r.csaMm2)) { out.push(`${name}: ${r.csaMm2} mm² is listed twice.`); break; }
      seen.add(r.csaMm2);
    }
  }
  return out;
}

/** Rows sorted by size, as saved. */
export const sortLimitRows = (l: CableLimitSet): CableLimitSet => ({ ...l, tables: l.tables.map((t) => ({ ...t, rows: [...t.rows].sort((a, b) => a.csaMm2 - b.csaMm2) })) });

/** How a row compares with the same table in the base limits: same, changed (with the base row) or new. */
export function rowOrigin(base: CableLimitSet | undefined, tableId: string, row: CableLimitRow): { kind: 'base' | 'changed' | 'new'; was?: CableLimitRow } {
  const b = base?.tables.find((t) => t.id === tableId)?.rows.find((r) => r.csaMm2 === row.csaMm2);
  if (!b) return { kind: 'new' };
  return b.maxBreakerA === row.maxBreakerA && b.maxLoadA === row.maxLoadA ? { kind: 'base', was: b } : { kind: 'changed', was: b };
}

/** Rows that differ from the base (changed, added or removed). */
export function changedRowCount(l: CableLimitSet, base: CableLimitSet | undefined): number {
  if (!base) return 0;
  let n = 0;
  for (const t of l.tables) {
    const bt = base.tables.find((x) => x.id === t.id);
    for (const r of t.rows) if (rowOrigin(base, t.id, r).kind !== 'base') n++;
    if (bt) n += bt.rows.filter((r) => !t.rows.some((x) => x.csaMm2 === r.csaMm2)).length;
  }
  return n;
}
