import { boardOf, feedersOn, memoized, networkOf, withNetwork } from './network';
import { recordedPQ } from '../model/existing';
import { ambientCorrectionFactor, cables, getCable } from './cableTable';
import { alphaOf, COPPER_ALPHA, feederFamily, type CableFamily } from './cableFamily';
import { trayGrouping } from './cableTray';
import { feederRatingBasis, type RatingBasis } from './installation';
import { SOURCE_KINDS, lvSupplied, supplyFaultKa, supplyIncomerFeeder, supplyXr, type Board, type Feeder, type GridSource, type Project } from '../types';
import { boardPhasePQ, type PhasePQ } from './loadSchedule';
import { fmtFixed } from '../util/format';
import { checkLimits, type LimitCheck } from './authorityLimits';

const SQRT3 = Math.sqrt(3);

/** Transformer X/R ratio used when the board doesn't specify one. Typical
 * for 500–2000 kVA distribution transformers; it only affects how the
 * transformer's %Z is split between R and X, not its magnitude. */
export const DEFAULT_TRANSFORMER_XR = 5;
/** Generator subtransient reactance X″d (%), for fault levels on generator supply; typical for LV diesel sets. */
export const GENERATOR_XD_SUBTRANSIENT_PCT = 15;
/** X/R of a generator set's fault impedance when none is given. */
export const GENERATOR_XR = 10;
/** Fault current of an inverter source as a multiple of its rated current, when none is given (inverters limit it to about 1.1 to 1.5 × In). */
export const INVERTER_FAULT_MULTIPLE = 1.2;

/** Complex impedance in ohms. Series impedances are added as R+jX phasors
 * (not as scalar magnitudes), which matters once cable R dominates. */
export interface Impedance {
  r: number;
  x: number;
}

const addZ = (a: Impedance, b: Impedance): Impedance => ({ r: a.r + b.r, x: a.x + b.x });
export const zMagnitude = (z: Impedance): number => Math.hypot(z.r, z.x);

/** AC resistance at operating temperature, approximated with a flat 1.2x
 * factor over the 20°C IEC 60228 value to account for the rise to ~90°C
 * conductor temperature. Skin/proximity effect is ignored (negligible below
 * ~120 mm² and a reasonable simplification above it for this tool). */
export function rOperatingOhmPerKm(csaMm2: number, tempC?: number, family?: CableFamily): number {
  return getCable(csaMm2, family).rOhmPerKm20C * resistanceFactor(tempC, alphaOf(family));
}

/** R(θ) ÷ R(20 °C), for copper (α = 0.00393 /K) unless the conductor's α is given. No temperature set: the
 * flat 1.2 used everywhere so far (≈ 70 °C). */
export { COPPER_ALPHA };
export const resistanceFactor = (tempC?: number, alpha = COPPER_ALPHA) => (tempC === undefined ? 1.2 : 1 + alpha * (tempC - 20));

/** Number of cable runs in parallel (at least 1). */
export const runsOf = (f: Pick<Feeder, 'parallel'>) => Math.max(1, Math.round(f.parallel ?? 1));

/** Cable as written on drawings and schedules, e.g. "2 × 4C × 240 mm²". */
export const cableSizeText = (f: Pick<Feeder, 'parallel' | 'cores' | 'cableCsaMm2'>) =>
  `${runsOf(f) > 1 ? `${runsOf(f)} × ` : ''}${f.cores}C × ${f.cableCsaMm2} mm²`;

/** Grouping factor for n multicore cables in parallel, touching, in one
 * layer on a tray (IEC 60364-5-52 Table B.52.17, method E). */
export const PARALLEL_GROUP_FACTOR = [1, 1, 0.88, 0.82, 0.77, 0.75, 0.73, 0.73, 0.72];
export const groupFactor = (runs: number) => PARALLEL_GROUP_FACTOR[Math.min(runs, PARALLEL_GROUP_FACTOR.length - 1)];

/** Total demand (kW) flowing through a board: the sum of its own end-load
 * feeders' demand, plus (recursively) the demand of every downstream board
 * fed through an incomer feeder on this board. A board already on the path
 * (a supply loop, or a board feeding itself) is not counted again — the loop
 * is invalid data, reported by checkReferences ("is fed in a loop"). */
export function boardDemandKw(project: Project, boardId: string, path = new Set<string>(), covered = false): number {
  if (path.has(boardId)) return 0;
  path.add(boardId);
  // A recorded maximum demand (existing installation) covers the existing load at and below its board.
  const board = boardOf(project, boardId);
  const rec = !covered && board ? recordedPQ(project, board) : undefined;
  const cov = covered || !!rec?.covers;
  const kw = feedersOn(project, boardId)
    .reduce((sum, f) => sum + (f.feedsBoardId ? boardDemandKw(project, f.feedsBoardId, path, cov) : cov && f.existing ? 0 : f.loadKw * f.demandFactor), rec?.p ?? 0);
  path.delete(boardId);
  return kw;
}

/** Design current (A) for a feeder: balanced 3-phase for 3/4-core
 * circuits, phase-to-neutral for 2-core (single-phase) circuits. An incomer
 * feeder (feedsBoardId set) carries the downstream board's most loaded
 * phase: I = max(P_phase) ÷ (U0 · cos φ), which equals the balanced 3-phase
 * formula when the board's phases are balanced. */
export function designCurrentA(feeder: Feeder, project: Project): number {
  if (feeder.feedsBoardId) return incomerBasis(feeder, project).current.a;
  const u0 = project.voltageV / SQRT3;
  // Capacitor bank: I = Q ÷ (√3 · U), from its kvar rating.
  if (feeder.kvar) return (feeder.kvar * 1000) / (SQRT3 * project.voltageV);
  const demandKw = feeder.loadKw * feeder.demandFactor;
  return feeder.cores >= 3
    ? (demandKw * 1000) / (SQRT3 * project.voltageV * feeder.powerFactor)
    : (demandKw * 1000) / (u0 * feeder.powerFactor);
}

/** One phase's current and power factor (sin φ signed: negative when the phase is capacitive). */
export interface PhaseBasis { phase: 'R' | 'Y' | 'B'; a: number; pf: number; sin: number; p: number; q: number }

/** An incomer's electrical basis, from the downstream board's real and reactive power per phase
 * (ENG-005) — not from the incomer's stored PF. Current: the phase with the largest apparent
 * power, I = S_phase ÷ U0. Voltage drop: the phase with the largest first-order conductor drop
 * L × (R·P + X·Q) ÷ (U0 · runs), chosen on its own (it can differ from the current phase).
 * This is a phase-conductor approximation, not a neutral-displacement / unbalanced load flow. */
export function incomerBasis(feeder: Feeder, project: Project, csaMm2 = feeder.cableCsaMm2, runs = runsOf(feeder)): { phases: PhasePQ; current: PhaseBasis; vd: PhaseBasis & { pct: number }; totalP: number; totalQ: number } {
  const u0 = project.voltageV / SQRT3;
  const phases = boardPhasePQ(project, feeder.feedsBoardId!);
  const basis = (ph: 'R' | 'Y' | 'B'): PhaseBasis => {
    const { p, q } = phases[ph];
    const s = Math.hypot(p, q);
    return { phase: ph, a: (s * 1000) / u0, pf: s > 0 ? p / s : 1, sin: s > 0 ? q / s : 0, p, q };
  };
  const all = (['R', 'Y', 'B'] as const).map(basis);
  const current = all.reduce((m, x) => (x.a > m.a ? x : m), all[0]);
  const family = feederFamily(project, feeder);
  const r = rOperatingOhmPerKm(csaMm2, project.vdTempC, family), x = getCable(csaMm2, family).xOhmPerKm;
  let vd: PhaseBasis & { pct: number };
  if (feeder.cores >= 3) {
    // Each phase conductor: ΔV = L × (R·Ip + X·Iq) ÷ runs, against U0 (equals √3·I·Z ÷ U when balanced).
    const pct = (b: PhaseBasis) => ((feeder.lengthM / 1000) * (r * (b.p * 1000) / u0 + x * (b.q * 1000) / u0) / runs / u0) * 100;
    vd = all.map((b) => ({ ...b, pct: pct(b) })).reduce((m, b) => (b.pct > m.pct ? b : m));
  } else {
    // Single-phase supply: the phase + neutral loop (2·I·Z) against U0, on the current phase.
    vd = { ...current, pct: ((2 * current.a * (feeder.lengthM / 1000) * (r * current.pf + x * current.sin)) / runs / u0) * 100 };
  }
  const totalP = all.reduce((a, b) => a + b.p, 0), totalQ = all.reduce((a, b) => a + b.q, 0);
  return { phases, current, vd, totalP, totalQ };
}

/** The voltage-drop evaluator for cable selection: an incomer's downstream P / Q basis; undefined for
 * other feeders (their Ib and cos φ are used, as before). */
export const vdEvaluator = (feeder: Feeder, project: Project): ((csaMm2: number, runs: number) => number) | undefined =>
  feeder.feedsBoardId ? (csa, runs) => feederVdPctAt(feeder, project, csa, runs) : undefined;

/** Voltage drop (%) of a feeder at a given cable size and runs, on the same basis as voltageDropPct —
 * used for the actual cable and for every candidate size (Fix / Optimise, suggestions). */
export function feederVdPctAt(feeder: Feeder, project: Project, csaMm2: number, runs: number): number {
  if (feeder.feedsBoardId) return incomerBasis(feeder, project, csaMm2, runs).vd.pct;
  return vdPctFor(designCurrentA(feeder, project), csaMm2, feeder.lengthM, feeder.cores, feeder.powerFactor, project.voltageV, runs, project.vdTempC, feederFamily(project, feeder));
}

/** Cable current rating after ambient temperature and grouping derating.
 * Grouping: the cable tray factor when the cable is on a tray route (its
 * parallel runs are counted among the cables there), otherwise the factor
 * for its own parallel runs. */
export function deratedAmpacityA(csaMm2: number, ambientC: number, runs = 1, trayFactor?: number): number {
  return getCable(csaMm2).ampacityA * ambientCorrectionFactor(ambientC) * runs * (trayFactor ?? groupFactor(runs));
}

/** A circuit's current rating for its installation method (IEC 60364-5-52), at its own or a candidate size and
 * number of runs: the method's tabulated rating × ambient / ground and grouping factors × runs. Iz is NaN when
 * there is no rating for the method (DATA REQUIRED). */
export function feederRating(project: Project, feeder: Feeder, csaMm2 = feeder.cableCsaMm2, runs = runsOf(feeder)): RatingBasis {
  return feederRatingBasis(project, feeder, csaMm2, runs, trayFactorOf(project, feeder)?.factor, groupFactor, feederFamily(project, feeder));
}

/** The Iz evaluator for cable selection: every candidate size and runs on the circuit's own installation method. */
export const izEvaluator = (feeder: Feeder, project: Project): ((csaMm2: number, runs: number) => number) => (csa, runs) => feederRating(project, feeder, csa, runs).iz;

/** Grouping factor of a feeder from the cable trays it runs on (the worst
 * route), if it is on any. */
export const trayFactorOf = (project: Project, feeder: Feeder) => trayGrouping(project).get(feeder.id);

/** Voltage drop as a percentage of nominal: 3-phase circuits use
 * √3·I·Z against the line-to-line voltage; single-phase circuits use the
 * phase + neutral loop (2·I·Z) against the phase-to-neutral voltage. */
function vdPctFor(ib: number, csaMm2: number, lengthM: number, cores: 2 | 3 | 4, cosPhi: number, voltageV: number, runs = 1, tempC?: number, family?: CableFamily): number {
  const rOhmPerKm = rOperatingOhmPerKm(csaMm2, tempC, family) / runs;
  const xOhmPerKm = getCable(csaMm2, family).xOhmPerKm / runs;
  const sinPhi = Math.sqrt(Math.max(0, 1 - cosPhi * cosPhi));
  const threePhase = cores >= 3;
  const multiplier = threePhase ? SQRT3 : 2;
  const baseV = threePhase ? voltageV : voltageV / SQRT3;
  const vdVolts = (multiplier * ib * lengthM * (rOhmPerKm * cosPhi + xOhmPerKm * sinPhi)) / 1000;
  return (vdVolts / baseV) * 100;
}

/** Voltage drop in percent over this feeder's own cable run only. */
export function voltageDropPct(feeder: Feeder, project: Project): number {
  return feederVdPctAt(feeder, project, feeder.cableCsaMm2, runsOf(feeder));
}

function findIncomer(project: Project, board: Board): Feeder | undefined {
  const ix = networkOf(project);
  if (ix) return ix.incomerOf.get(board.id);
  return project.feeders.find((f) => f.boardId === board.upstreamId && f.feedsBoardId === board.id);
}

/** Voltage drop (%) from the source to a board's busbar: the sum of the
 * drops on every incomer feeder in the chain above it. Zero for the main
 * board. DEWA/IEC limits apply to the total source-to-load drop, so this
 * is added to each feeder's own drop before comparing with the limit. */
export function upstreamVoltageDropPct(project: Project, boardId: string, seen = new Set<string>()): number {
  const board = boardOf(project, boardId);
  if (!board || seen.has(boardId)) return 0;
  // A first board on an LV supply starts at the drop already used upstream plus its incoming cable.
  if (!board.upstreamId) return lvSupplied(board) ? memoized(project, `vdUp:${boardId}`, () => supplyVoltageDropPct(project, board)) : 0;
  seen.add(boardId);
  return memoized(project, `vdUp:${boardId}`, () => upstreamVdOf(project, board, seen));
}

/** The drop already used upstream of the supply point (%): the given value when it is a number above zero, else 0. */
export const supplyVdUsedPct = (board: Board): number => { const v = board.supply?.vdUsedPct; return v !== undefined && Number.isFinite(v) && v > 0 ? v : 0; };

/** Drop (%) at the busbar of an LV-supplied first board: the drop given from upstream (`supply.vdUsedPct`, at the
 * feeding board) plus the incoming cable's own drop, worked out as the drop of a sub-board's incomer. */
export function supplyVoltageDropPct(project: Project, board: Board): number {
  const cable = supplyIncomerFeeder(board);
  return supplyVdUsedPct(board) + (cable ? voltageDropPct(cable, project) : 0);
}

function upstreamVdOf(project: Project, board: Board, seen: Set<string>): number {
  const incomer = findIncomer(project, board);
  const own = incomer ? voltageDropPct(incomer, project) : 0;
  return own + upstreamVoltageDropPct(project, board.upstreamId!, seen);
}

/** Picks the smallest standard cable size whose derated ampacity covers both
 * the design current and the breaker rating (so the breaker protects the
 * cable), and whose voltage drop fits the budget left for this feeder.
 * Returns null if nothing in the table satisfies both. */
export function selectCable(
  ib: number,
  lengthM: number,
  systemVoltageV: number,
  cores: 2 | 3 | 4,
  cosPhi: number,
  ambientC: number,
  vdBudgetPct: number,
  breakerRatingA = 0,
  /** Conductor temperature for the voltage drop (the project's vdTempC); blank = R20 × 1.2. */
  tempC?: number,
  /** The feeder's own voltage-drop evaluator (an incomer's downstream P / Q basis). */
  vdAt?: (csaMm2: number, runs: number) => number,
  /** The feeder's own rating evaluator (its installation method); default: method E at ambientC. */
  izAt?: (csaMm2: number, runs: number) => number,
  /** Extra rule a size must also meet (an authority's cable / breaker limits). */
  allowAt?: (csaMm2: number, runs: number) => boolean
): number | null {
  return selectCableRuns(ib, lengthM, systemVoltageV, cores, cosPhi, ambientC, vdBudgetPct, breakerRatingA, 1, undefined, tempC, vdAt, izAt, allowAt)?.csaMm2 ?? null;
}

/** Like selectCable, but when no single cable fits, tries 2, 3… runs in
 * parallel (each run the same size), smallest size first for the fewest
 * runs. Sizes below 50 mm² are never paralleled. */
export function selectCableRuns(
  ib: number,
  lengthM: number,
  systemVoltageV: number,
  cores: 2 | 3 | 4,
  cosPhi: number,
  ambientC: number,
  vdBudgetPct: number,
  breakerRatingA = 0,
  maxRuns = 4,
  trayFactor?: number,
  /** Conductor temperature for the voltage drop (the project's vdTempC), as the displayed drop uses; blank = R20 × 1.2. */
  tempC?: number,
  /** The feeder's own voltage-drop evaluator (an incomer's downstream P / Q basis); default: Ib and cos φ at tempC. */
  vdAt?: (csaMm2: number, runs: number) => number,
  /** The feeder's own rating evaluator (its installation method); default: method E at ambientC. A size with no
   * rating (NaN) is never chosen. */
  izAt?: (csaMm2: number, runs: number) => number,
  /** Extra rule a size must also meet (an authority's cable / breaker limits, src/calc/authorityLimits.ts). */
  allowAt?: (csaMm2: number, runs: number) => boolean
): { csaMm2: number; runs: number } | null {
  const requiredIz = Math.max(ib, breakerRatingA);
  for (let runs = 1; runs <= maxRuns; runs++) {
    for (const c of cables()) {
      if (runs > 1 && c.csaMm2 < 50) continue;
      const iz = izAt ? izAt(c.csaMm2, runs) : c.ampacityA * ambientCorrectionFactor(ambientC) * runs * (trayFactor ?? groupFactor(runs));
      if (!(iz >= requiredIz)) continue;
      if (allowAt && !allowAt(c.csaMm2, runs)) continue;
      if ((vdAt ? vdAt(c.csaMm2, runs) : vdPctFor(ib, c.csaMm2, lengthM, cores, cosPhi, systemVoltageV, runs, tempC)) <= vdBudgetPct) return { csaMm2: c.csaMm2, runs };
    }
  }
  return null;
}

/** Transformer source impedance referred to the LV side, split into R and X
 * using the given X/R ratio. |Z| = U² · uk% / S. */
export function transformerImpedance(sourceKva: number, impedancePct: number, voltageV: number, xr = DEFAULT_TRANSFORMER_XR): Impedance {
  const z = (voltageV * voltageV * (impedancePct / 100)) / (sourceKva * 1000);
  const r = z / Math.sqrt(1 + xr * xr);
  return { r, x: r * xr };
}

/** Source impedance of a supply with a stated fault level (an authority supply, or a neighbouring
 * building's main board): |Z| = c · U ÷ (√3 · Ik″), split with the default transformer X/R. */
export function supplyImpedance(faultKa: number, voltageV: number, xr = DEFAULT_TRANSFORMER_XR): Impedance {
  const z = (C_MAX * voltageV) / (SQRT3 * faultKa * 1000);
  const r = z / Math.sqrt(1 + xr * xr);
  return { r, x: r * xr };
}

/** Voltage factor for the MV network feeder impedance, IEC 60909-0 Table 1 (MV, maximum currents). */
export const C_MV = 1.1;
/** X/R of an MV network feeder when the authority gives none (RQ = 0.1 XQ, IEC 60909-0 §6.2). */
export const DEFAULT_GRID_XR = 10;

/** Short-circuit power S″kQ (MVA) of a grid source: as stated, else √3 · U · Ik″. */
export function gridFaultMva(g: GridSource): number | undefined {
  if (g.faultMva && g.faultMva > 0) return g.faultMva;
  if (g.faultKa && g.faultKa > 0 && g.kv > 0) return SQRT3 * g.kv * g.faultKa;
  return undefined;
}

/** Grid source feeding a main board's transformer: the one its RMU names, else the project's first. */
export function gridSourceOf(project: Project, board: Board): GridSource | undefined {
  const list = project.gridSources ?? [];
  if (!list.length) return undefined;
  const name = board.rmu?.trim();
  const id = name ? project.rmus?.find((r) => r.name === name)?.sourceId : undefined;
  return (id && list.find((g) => g.id === id)) || list[0];
}

/** MV network impedance referred to the LV side, ZQt = cQ · U²LV ÷ S″kQ (IEC 60909-0 eq. 3 with
 * tr = UnQ ÷ ULV), split by the network X/R. Undefined without a fault level (infinite network). */
export function gridImpedance(g: GridSource | undefined, voltageV: number): Impedance | undefined {
  const s = g && gridFaultMva(g);
  if (!s) return undefined;
  const z = (C_MV * voltageV * voltageV) / (s * 1e6);
  const xr = g.xr && g.xr > 0 ? g.xr : DEFAULT_GRID_XR;
  const r = z / Math.sqrt(1 + xr * xr);
  return { r, x: r * xr };
}

/** Source impedance at a main board with a transformer: the transformers joined by closed couplers in
 * parallel, each in series with its grid source; transformers on one source share its impedance. */
export function mainSourceImpedance(project: Project, board: Board): Impedance {
  const group = parallelGroup(project, board.id);
  const bySource = new Map<string, { zq?: Impedance; zt: Impedance[] }>();
  for (const b of group.length ? group : [board]) {
    const g = gridSourceOf(project, b);
    const e = bySource.get(g?.id ?? '') ?? { zq: gridImpedance(g, project.voltageV), zt: [] };
    e.zt.push(transformerImpedance(b.sourceKva!, b.sourceImpedancePct!, project.voltageV, b.sourceXr));
    bySource.set(g?.id ?? '', e);
  }
  const branches = [...bySource.values()].map((e) => {
    const zt = e.zt.length > 1 ? parallelZ(e.zt) : e.zt[0];
    return e.zq ? addZ(e.zq, zt) : zt;
  });
  return branches.length > 1 ? parallelZ(branches) : branches[0];
}

/** Cable phase impedance for the maximum short-circuit current: R at 20 °C
 * (IEC 60909-0 uses the conductor at 20 °C for maximum currents — a cold
 * cable gives the highest fault). Minimum faults (earthing) use the
 * operating temperature instead. */
export function cableImpedance(csaMm2: number, lengthM: number, runs = 1, family?: CableFamily): Impedance {
  const cable = getCable(csaMm2, family);
  return {
    r: (cable.rOhmPerKm20C * (lengthM / 1000)) / runs,
    x: (cable.xOhmPerKm * (lengthM / 1000)) / runs
  };
}

/** Placeholder source impedance (Ω) used where a first board has no transformer data and no supply fault level. */
export const PLACEHOLDER_SOURCE_Z: Impedance = { r: 0, x: 0.01 };
/** The fault level (kA) of that placeholder source at the project voltage, as the SLD prints it ("assumed"). */
export const assumedSourceFaultKa = (project: Pick<Project, 'voltageV'>): number => faultCurrentKA(PLACEHOLDER_SOURCE_Z, project.voltageV);

export type SourceBasis = 'given' | 'calculated' | 'assumed';
export interface SourceLevel { basis: SourceBasis; ka: number; z: Impedance; text?: string }
const n2 = (v: number): string => String(+v.toFixed(2));
const positiveNum = (n: number | undefined): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;
/** The fault level at the supply point of a first board without a transformer, and where it comes from.
 * given: the typed Ik″. calculated: from the typed rating of the source, by kind. assumed: the placeholder source.
 * - Machine (diesel generator, wind turbine as a generator): Ik″ = c · I_rated ÷ x″d, i.e. the impedance
 *   U² · x″d ÷ S as in the standby-generator scenario (default X″d 15 %, X/R 10).
 * - Inverter (solar PV, battery, wind turbine with a fault multiple): the fault current is k · I_rated (default
 *   k 1.2), with no voltage factor: an inverter limits its current, it is no voltage source behind an impedance.
 *   It is carried as the resistive impedance |Z| = c · U ÷ (√3 · k · I_rated) that gives exactly that current at
 *   the supply point; downstream of the incoming cable the model gives slightly less than k · I_rated, which is on
 *   the safe side for the disconnection checks and immaterial for breaking capacity.
 * Limits: one source per first board (no parallel sources); motor contribution is not applied. The minimum fault
 * current of a generator is not this level: see generatorMinSource. */
export function supplySourceLevel(project: Pick<Project, 'voltageV'>, board: Board): SourceLevel {
  const typed = supplyFaultKa(board);
  if (typed) return { basis: 'given', ka: typed, z: supplyImpedance(typed, project.voltageV, supplyXr(board)) };
  const s = board.supply;
  if (lvSupplied(board) && s && s.fedBy !== 'board' && positiveNum(s.ratedKva)) { // a board outside the project is the source: its own rating is not read
    const kind = s.kind, v = project.voltageV;
    const iRated = (s.ratedKva * 1000) / (SQRT3 * v);
    const kva = `${n2(s.ratedKva)} kVA`;
    const machine = kind === 'generator' || (kind === 'wind' && !positiveNum(s.faultMultiple));
    if (machine) {
      const xd = positiveNum(s.xdPct) ? s.xdPct : GENERATOR_XD_SUBTRANSIENT_PCT;
      const z = transformerImpedance(s.ratedKva, xd, v, supplyXr(board) ?? GENERATOR_XR);
      return { basis: 'calculated', ka: faultCurrentKA(z, v), z, text: `${kva} · X″d ${n2(xd)} %` };
    }
    if (kind === 'pv' || kind === 'battery' || kind === 'wind') {
      const k = positiveNum(s.faultMultiple) ? s.faultMultiple : INVERTER_FAULT_MULTIPLE;
      const zAbs = (C_MAX * v) / (SQRT3 * k * iRated);
      return { basis: 'calculated', ka: (k * iRated) / 1000, z: { r: zAbs, x: 0 }, text: `${kva} · ${n2(k)} × rated` };
    }
  }
  return { basis: 'assumed', ka: assumedSourceFaultKa(project), z: PLACEHOLDER_SOURCE_Z };
}

/** Transient reactance X′d of a generator (%), for its minimum fault current; typical for LV diesel sets (the
 * value the motor-start dip uses, src/calc/motor.ts). */
export const GENERATOR_XD_TRANSIENT_DEFAULT_PCT = 25;

/** The source impedance for the minimum fault current of a generator source (a machine with a typed rating and
 * no typed fault level); undefined for every other source. The sub-transient current has decayed before a
 * protective device clears an earth fault, so the loop is taken on:
 * - the typed sustained fault current, k × rated (excitation support): the resistive impedance
 *   |Z| = c · U ÷ (√3 · k · I_rated) that gives exactly that current at the supply point for the voltage factor
 *   `c` of the study that asks; or
 * - the transient reactance X′d (typed, or 25 % assumed: `assumed`), with the source's X/R. */
export function generatorMinSource(project: Pick<Project, 'voltageV'>, board: Board, c: number): { z: Impedance; text: string; assumed: boolean } | undefined {
  const s = board.supply;
  if (supplyFaultKa(board) || !lvSupplied(board) || !s || s.fedBy === 'board' || !positiveNum(s.ratedKva)) return undefined;
  if (!(s.kind === 'generator' || (s.kind === 'wind' && !positiveNum(s.faultMultiple)))) return undefined;
  const v = project.voltageV;
  if (positiveNum(s.sustainedMultiple)) {
    const iRated = (s.ratedKva * 1000) / (SQRT3 * v);
    return { z: { r: (c * v) / (SQRT3 * s.sustainedMultiple * iRated), x: 0 }, text: `sustained fault current ${n2(s.sustainedMultiple)} × rated`, assumed: false };
  }
  const typed = positiveNum(s.xdTransientPct);
  const xd = typed ? s.xdTransientPct! : GENERATOR_XD_TRANSIENT_DEFAULT_PCT;
  return { z: transformerImpedance(s.ratedKva, xd, v, supplyXr(board) ?? GENERATOR_XR), text: `transient reactance X′d ${n2(xd)} %`, assumed: !typed };
}

/** The level's number as printed: two decimals below 1 kA (an inverter source gives a small level), else one. */
export const levelKaText = (ka: number): string => (ka < 1 ? ka.toFixed(2) : ka.toFixed(1));

/** What a source kind reads: a machine takes a rating and X″d, an inverter a rating and a fault multiple. */
export const sourceKindTakes = (kind: string | undefined): { machine: boolean; inverter: boolean } => ({ machine: kind === 'generator' || kind === 'wind', inverter: kind === 'pv' || kind === 'battery' || kind === 'wind' });

/** True when the board's source level reads a typed rating (a kind that takes one, not fed from a board outside the project). */
export function takesSourceRating(board: Board): boolean {
  const t = sourceKindTakes(board.supply?.kind);
  return lvSupplied(board) && board.supply!.fedBy !== 'board' && (t.machine || t.inverter);
}

/** The hint tail for a source with no level: ", or the source rating" when its kind takes one, else nothing. */
export const sourceRatingHint = (board: Board): string => (takesSourceRating(board) ? ', or the source rating' : '');

/** A calculated source in a sentence for the documents: "solar PV 100 kVA, fault current 1.2 × rated, 0.17 kA calculated";
 * undefined when the level is typed or assumed (those keep their own wording). */
export function calculatedSourceText(project: Pick<Project, 'voltageV'>, board: Board): string | undefined {
  const level = supplySourceLevel(project, board);
  if (level.basis !== 'calculated' || !level.text) return undefined;
  const label = SOURCE_KINDS.find((k) => k.value === board.supply?.kind)?.label ?? 'source';
  const basis = level.text.replace(' · ', ', ').replace(/([\d.]+) × rated/, 'fault current $1 × rated');
  return `${label.charAt(0).toLowerCase()}${label.slice(1)} ${basis}, ${level.ka.toFixed(2)} kA calculated`;
}

/** A calculated supply fault level for a form cell and its remark ("2.4 (calc.)", "Ik″ 2.4 kA calculated: 250 kVA · X″d 15 %");
 * undefined when the level is typed or assumed (the form prints those as before). */
export function calculatedLevelCell(project: Pick<Project, 'voltageV'>, board: Board): { cell: string; remark: string } | undefined {
  const level = supplySourceLevel(project, board);
  if (level.basis !== 'calculated') return undefined;
  const ka = levelKaText(level.ka);
  return { cell: `${ka} (calc.)`, remark: `Ik″ ${ka} kA calculated${level.text ? `: ${level.text}` : ''}` };
}

/** Impedance from the source (transformer) up to and including a board's
 * busbar, walking up the board hierarchy: main board -> transformer only;
 * any downstream board -> its parent's impedance plus its incomer cable. */
export function impedanceToBoard(project: Project, boardId: string, seen = new Set<string>()): Impedance {
  const board = boardOf(project, boardId);
  const fallback = PLACEHOLDER_SOURCE_Z;
  if (!board || seen.has(boardId)) return fallback;
  seen.add(boardId);
  return memoized(project, `zUp:${boardId}`, () => impedanceToBoardOf(project, board, seen));
}

/** True when the fault level at a board rests on the placeholder source: the first board at the top of its supply
 * chain has neither transformer data nor a supply fault level (or the chain is broken). Its fault-level checks
 * are then not verified. */
export function sourceAssumed(project: Project, boardId: string): boolean {
  return memoized(project, `srcAssumed:${boardId}`, () => {
    const seen = new Set<string>();
    for (let b = boardOf(project, boardId); b && !seen.has(b.id); b = b.upstreamId ? boardOf(project, b.upstreamId) : undefined) {
      seen.add(b.id);
      if (!b.upstreamId) return !(b.sourceKva && b.sourceImpedancePct) && supplySourceLevel(project, b).basis === 'assumed';
    }
    return true;
  });
}

/** Main boards joined to this one by closed bus couplers (transformers in
 * parallel), this one first. Only main boards with transformer data take part;
 * a board without closed ties is alone. */
export function parallelGroup(project: Project, boardId: string): Board[] {
  const fed = (id: string) => project.boards.find((b) => b.id === id && !b.upstreamId && b.sourceKva && b.sourceImpedancePct);
  const first = fed(boardId);
  if (!first) return [];
  const group = [first];
  for (let i = 0; i < group.length; i++) {
    for (const t of project.ties ?? []) {
      if (!t.closed || (t.a !== group[i].id && t.b !== group[i].id)) continue;
      const other = fed(t.a === group[i].id ? t.b : t.a);
      if (other && !group.includes(other)) group.push(other);
    }
  }
  return group;
}

/** Source impedance of transformers in parallel: 1 / Σ (1 / Zi), as phasors. */
export function parallelZ(zs: Impedance[]): Impedance {
  let g = 0, b = 0;
  for (const z of zs) { const m = z.r * z.r + z.x * z.x; g += z.r / m; b -= z.x / m; }
  const m = g * g + b * b;
  return { r: g / m, x: -b / m };
}

function impedanceToBoardOf(project: Project, board: Board, seen: Set<string>): Impedance {
  if (!board.upstreamId) {
    // No transformer: a supply with a stated fault level (authority, or a neighbouring building's main board).
    if (!board.sourceKva || !board.sourceImpedancePct) {
      // An assumed level is the placeholder source at the supply point: the typed incoming cable still counts.
      const zs = supplySourceLevel(project, board).z;
      const cable = supplyIncomerFeeder(board); // the incoming cable from the supply point to this board
      return cable ? addZ(zs, cableImpedance(cable.cableCsaMm2, cable.lengthM, runsOf(cable))) : zs;
    }
    // A closed coupler joins the busbars: every transformer on them feeds a fault (couplers taken as 0 Ω),
    // each behind its MV network impedance when the grid fault level is given.
    return mainSourceImpedance(project, board);
  }

  const incomer = findIncomer(project, board);
  const incomerZ = incomer ? cableImpedance(incomer.cableCsaMm2, incomer.lengthM, runsOf(incomer), feederFamily(project, incomer)) : { r: 0, x: 0 };
  return addZ(impedanceToBoard(project, board.upstreamId!, seen), incomerZ);
}

/** Maximum voltage factor for LV short-circuit currents, IEC 60909-0
 * Table 1: 1.05 for LV systems with a +6 % voltage tolerance (1.10 applies
 * to systems with +10 %). */
export const C_MAX = 1.05;

/** Prospective symmetrical initial short-circuit current Ik″ (kA rms) for a
 * given source-to-fault impedance: c · U ÷ (√3 · |Z|), with c = C_MAX. The
 * upstream (MV) network is infinite unless a grid source gives its fault level
 * (then its impedance is part of Z, see gridImpedance) and the transformer correction
 * factor KT is not applied — a simplified method based on IEC 60909-0, not a
 * full study. For a line-to-neutral fault pass the loop impedance (the result
 * is then c · U0 ÷ |Z|). */
export function faultCurrentKA(z: Impedance, systemVoltageV: number, c = C_MAX): number {
  const zm = zMagnitude(z);
  if (zm <= 0) return Infinity;
  return (c * systemVoltageV) / (SQRT3 * zm) / 1000;
}

export type Status = 'ok' | 'warn' | 'bad';

/** Iz for display: whole amps, or '—' when there is no rating for the installation method. */
export const izText = (iz: number) => fmtFixed(iz, 1);

export interface FeederResult {
  feeder: Feeder;
  ib: number; // design current
  ampacity: number; // Iz, derated cable rating
  /** Grouping factor from the cable tray the cable runs on (worst route). */
  tray?: { factor: number; route: string };
  /** How Iz was found: installation method, tabulated rating, factors; `missing` when there is no rating. */
  rating: RatingBasis;
  loadingPct: number; // Ib as % of breaker In
  vdPct: number; // this feeder's own cable run
  vdUpstreamPct: number; // source to this feeder's supply board
  vdTotalPct: number; // source to end of this feeder — compared with the limit
  vdStatus: Status;
  ampacityStatus: 'ok' | 'bad'; // Iz ≥ Ib
  /** Overload protection per IEC 60364-4-43: Ib ≤ In ≤ Iz. */
  protectionStatus: 'ok' | 'bad';
  /** Prospective fault at the breaker's own terminals (the supply board's
   * busbar) — the fault the breaker must be able to interrupt. */
  breakerFaultKA: number;
  /** Prospective fault at the far end of the cable (lower value; relevant
   * for minimum-fault / disconnection-time checks). 3-phase fault for
   * 3/4-core circuits, line-to-neutral for 2-core circuits. */
  endFaultKA: number;
  /** Breaker breaking capacity Icu ≥ fault at its terminals; 'warn' (not verified) when the fault level is assumed. */
  icuStatus: Status;
  /** The source behind this board has no transformer data or supply fault level: the fault levels are placeholders. */
  faultAssumed?: true;
  /** The authority's cable / breaker limits (DEWA Table 3, DB feeder minimum); absent when none apply. */
  limits?: LimitCheck;
  status: Status;
}

export function evaluateFeeder(project: Project, feeder: Feeder): FeederResult {
  // Within a run, each feeder is evaluated once (discrimination reuses it); only for this exact feeder object.
  const ix = networkOf(project);
  if (!ix) return evaluateFeederOf(project, feeder);
  const hit = ix.memo.get(`feeder:${feeder.id}`) as { feeder: Feeder; r: FeederResult } | undefined;
  if (hit?.feeder === feeder) return hit.r;
  const r = evaluateFeederOf(project, feeder);
  ix.memo.set(`feeder:${feeder.id}`, { feeder, r });
  return r;
}

function evaluateFeederOf(project: Project, feeder: Feeder): FeederResult {
  const ib = designCurrentA(feeder, project);
  const tray = trayFactorOf(project, feeder);
  const rating = feederRating(project, feeder);
  const ampacity = rating.iz;
  const loadingPct = (ib / feeder.breakerRatingA) * 100;

  const vdPct = voltageDropPct(feeder, project);
  const vdUpstreamPct = upstreamVoltageDropPct(project, feeder.boardId);
  const vdTotalPct = vdUpstreamPct + vdPct;

  const zBoard = impedanceToBoard(project, feeder.boardId);
  const breakerFaultKA = faultCurrentKA(zBoard, project.voltageV);
  // Single-phase circuits: the fault at the far end is line-to-neutral, so
  // it flows through the phase and neutral conductors (2 × cable Z).
  const zCable = cableImpedance(feeder.cableCsaMm2, feeder.lengthM, runsOf(feeder), feederFamily(project, feeder));
  const loop = feeder.cores >= 3 ? 1 : 2;
  const endFaultKA = faultCurrentKA(addZ(zBoard, { r: zCable.r * loop, x: zCable.x * loop }), project.voltageV);

  const vdStatus: Status = vdTotalPct > project.vdLimitPct ? 'bad' : vdTotalPct > project.vdLimitPct * 0.85 ? 'warn' : 'ok';
  const ampacityStatus = ampacity >= ib ? 'ok' : 'bad';
  const protectionStatus = ib <= feeder.breakerRatingA && feeder.breakerRatingA <= ampacity ? 'ok' : 'bad';
  const faultAssumed = sourceAssumed(project, feeder.boardId);
  const icuStatus: Status = faultAssumed ? 'warn' : feeder.breakerIcuKa >= breakerFaultKA ? 'ok' : 'bad';
  const loadingStatus: Status = loadingPct > 100 ? 'bad' : loadingPct > 85 ? 'warn' : 'ok';

  const limits = checkLimits(project, feeder, ib, runsOf(feeder));
  const statuses: Status[] = [vdStatus, ampacityStatus, protectionStatus, icuStatus, loadingStatus, limits?.status ?? 'ok'];
  const status: Status = statuses.includes('bad') ? 'bad' : statuses.includes('warn') ? 'warn' : 'ok';

  return {
    feeder, ib, ampacity, tray, rating, loadingPct, vdPct, vdUpstreamPct, vdTotalPct, vdStatus,
    ampacityStatus, protectionStatus, breakerFaultKA, endFaultKA, icuStatus, ...(faultAssumed && { faultAssumed }), ...(limits && { limits }), status
  };
}

export function evaluateProject(project: Project): FeederResult[] {
  return withNetwork(project, () => project.feeders.map((f) => evaluateFeeder(project, f)));
}
