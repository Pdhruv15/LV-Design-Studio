import { boardOf, feedersOn, withNetwork } from './network';
import { cpcOf, defaultCpcMm2, getCable, resolveCable } from './cableTable';
import { feederFamily, kCpcOf } from './cableFamily';
import { DEFAULT_TRANSFORMER_XR, generatorMinSource, gridImpedance, gridSourceOf, rOperatingOhmPerKm, runsOf, sourceRatingHint, supplyImpedance, supplySourceLevel, transformerImpedance, zMagnitude, type Impedance, type Status } from './electrical';
import { elcbGroups, hasNoRcd, isScheduleCircuit, rcbosOf } from './loadSchedule';
import { lvSupplied, supplyFaultKa, supplyIncomerFeeder, supplyXr, type Board, type BreakerType, type Feeder, type Project } from '../types';
import { fmtFixed } from '../util/format';

const SQRT3 = Math.sqrt(3);

/** Minimum voltage factor for LV fault calculations (IEC 60909): the
 * lowest fault current is what decides whether the breaker trips in time. */
export const C_MIN = 0.95;

/** k for a copper protective conductor incorporated in an XLPE multicore
 * cable (IEC 60364-5-54 Table A.54.3), used in the adiabatic check. */
export const K_CPC_XLPE_CU = 143;

// Protective conductor sizes live with the cable data (used by the tray
// schedule too); re-exported here where the earthing study always had them.
export { cpcOf, defaultCpcMm2 };

export function breakerTypeOf(f: Feeder): BreakerType {
  return f.breakerType ?? (f.breakerRatingA <= 63 ? 'C' : 'MCCB');
}

/** Current that guarantees instantaneous (magnetic) tripping, i.e. the
 * upper edge of the magnetic band: 5/10/20 In for MCB types B/C/D
 * (IEC 60898-1), the Im setting for MCCB/ACB (IEC 60947-2). */
export function instantaneousTripA(f: Feeder): number {
  switch (breakerTypeOf(f)) {
    case 'B':
      return 5 * f.breakerRatingA;
    case 'C':
      return 10 * f.breakerRatingA;
    case 'D':
      return 20 * f.breakerRatingA;
    default:
      return (f.breakerImMultiple ?? 10) * f.breakerRatingA;
  }
}

const SOCKET_POINTS = ['shaver', 's13', 's15', 's13t'] as const;

export type CircuitPurpose = 'sockets' | 'fixed' | 'unknown';
/** Socket-outlet / fixed-equipment classification of a final circuit (see Feeder.circuitPurpose). */
export function circuitPurposeOf(f: Feeder): CircuitPurpose {
  if (f.circuitPurpose) return f.circuitPurpose;
  if (SOCKET_POINTS.some((k) => (f.points?.[k] ?? 0) > 0)) return 'sockets';
  return 'unknown';
}

export interface DisconnectionBasis {
  requiredS: number;
  purpose: CircuitPurpose;
  /** false: U0 outside the 230 V band this check supports — the time is not the standard's for that supply. */
  supported: boolean;
  basis: string;
}

/** Required disconnection time, IEC 60364-4-41 411.3.2.2 / Table 41.1 (as BS 7671 411.3.2), TN system,
 * U0 in the nominal 230 V band (120–250 V, covering 230/400 and 240/415 V supplies): 0.4 s for final
 * circuits up to 63 A with socket-outlets and up to 32 A supplying only fixed equipment; 5 s for
 * distribution circuits and other final circuits. Unknown purpose is treated as socket-outlets (stricter).
 * The project rule strictFinalDisconnection (0.4 s for every final circuit to 63 A) is a disclosed override.
 * TT systems and other U0 bands are not modelled. */
export function disconnectionBasis(f: Feeder, project?: Pick<Project, 'voltageV' | 'strictFinalDisconnection'>): DisconnectionBasis {
  const purpose = circuitPurposeOf(f);
  const u0 = project ? project.voltageV / SQRT3 : 230;
  const supported = u0 > 120 && u0 <= 250;
  const where = `TN, U0 ${u0.toFixed(0)} V`;
  if (f.feedsBoardId) return { requiredS: 5, purpose, supported, basis: `Distribution circuit: 5 s (${where})` };
  if (project?.strictFinalDisconnection && f.breakerRatingA <= 63) return { requiredS: 0.4, purpose, supported, basis: 'Project rule (stricter than IEC 60364-4-41): every final circuit up to 63 A in 0.4 s' };
  const limit = purpose === 'fixed' ? 32 : 63;
  const label = purpose === 'fixed' ? 'fixed equipment only' : purpose === 'sockets' ? 'with socket-outlets' : 'purpose not set — treated as socket-outlets';
  const requiredS = f.breakerRatingA <= limit ? 0.4 : 5;
  return { requiredS, purpose, supported, basis: `Final circuit ${label}, ${f.breakerRatingA} A ${f.breakerRatingA <= limit ? '≤' : '>'} ${limit} A: ${requiredS} s (${where})${supported ? '' : ' — outside the supported 230 V band, not verified'}` };
}

export function requiredDisconnectionS(f: Feeder, project?: Pick<Project, 'voltageV' | 'strictFinalDisconnection'>): number {
  return disconnectionBasis(f, project).requiredS;
}

/** Phase + protective conductor loop impedance of one cable run. */
function cableLoop(project: Project, f: Feeder): Impedance {
  const km = f.lengthM / 1000, family = feederFamily(project, f);
  // The protective conductor is of the cable's family; a size that family is not made in (a small separate
  // conductor beside an aluminium cable) is taken as copper.
  const cpcFamily = resolveCable(cpcOf(f), family) ? family : undefined;
  return {
    // Each run carries its own protective conductor, in parallel too.
    r: ((rOperatingOhmPerKm(f.cableCsaMm2, undefined, family) + rOperatingOhmPerKm(cpcOf(f), undefined, cpcFamily)) * km) / runsOf(f),
    x: (getCable(f.cableCsaMm2, family).xOhmPerKm * km) / runsOf(f)
  };
}

/** Loop impedance at the busbar of an LV-supplied first board. A Ze typed at the supply point is taken as given
 * (purely resistive: the conservative split once cable loops are added); without one it is estimated from the
 * minimum fault level when that is given, else from the fault level. The incoming cable's phase + protective
 * conductor loop is then added. No fault level and no Ze: no source data. */
function supplyEarthLoop(project: Project, board: Board): { z: Impedance; missing?: string; estimated?: string; subTransient?: boolean } {
  const sup = board.supply!, ze = sup.zeOhm !== undefined && sup.zeOhm > 0 ? sup.zeOhm : undefined;
  const level = supplySourceLevel(project, board), ka = supplyFaultKa(board), kaMin = sup.faultKaMin !== undefined && sup.faultKaMin > 0 ? sup.faultKaMin : undefined;
  // A calculated source (rating typed, no fault level): its impedance is the Ze estimate, said by what it rests on.
  const inverter = level.z.x === 0;
  // A generator: its transient reactance (or typed sustained current), not the sub-transient level.
  const gen = generatorMinSource(project, board, C_MIN);
  const from = inverter || !gen ? `the inverter fault current at ${board.id}` : `the generator's ${gen.text} at ${board.id}${gen.assumed ? ' (assumed: type X′d, the sustained fault current or the minimum fault level)' : ''}`;
  const base = ze !== undefined ? { z: { r: ze, x: 0 } } : ka || kaMin
    ? { z: supplyImpedance(kaMin ?? ka!, project.voltageV, supplyXr(board)), estimated: `Ze estimated from the supply ${kaMin ? 'minimum ' : ''}fault level at ${board.id}` }
    : level.basis === 'calculated'
      ? { z: gen?.z ?? level.z, estimated: `Ze estimated from ${from}`, ...(gen?.assumed ? { subTransient: true } : {}) }
      : undefined;
  const cable = supplyIncomerFeeder(board);
  const c = cable ? cableLoop(project, cable) : { r: 0, x: 0 }; // the known part, even when there is no source data
  if (!base) return { z: c, missing: `no source data at ${board.id} (transformer kVA and impedance %, or the supply fault level${sourceRatingHint(board)})` };
  return cable ? { ...base, z: { r: base.z.r + c.r, x: base.z.x + c.x } } : base;
}

/** Earth fault loop impedance at a board's busbar (TN-S). At the main
 * board this is the transformer's own impedance (Dyn transformer with
 * Z0 ≈ Z1, so a phase-earth fault at its terminals ≈ the 3-phase fault)
 * plus 2/3 of the grid source's impedance when its fault level is given;
 * a main board on an LV supply without a transformer takes Ze ≈ the
 * 3-phase source impedance from the supply fault level (`estimated`);
 * each incomer below adds its phase + protective conductor loop.
 * `missing` says why the path is incomplete (no source data, a missing
 * board or incomer, a loop in the board tree): z is then only the part
 * that is known — a lower bound, never a verified Ze. */
export function earthLoopPath(project: Project, boardId: string, seen = new Set<string>()): { z: Impedance; missing?: string; estimated?: string; subTransient?: boolean } {
  const board = boardOf(project, boardId);
  if (!board) return { z: { r: 0, x: 0 }, missing: `board ${boardId} not found` };
  if (seen.has(boardId)) return { z: { r: 0, x: 0 }, missing: `the supply path loops back to ${boardId}` };
  seen.add(boardId);
  if (!board.upstreamId) {
    if (!board.sourceKva || !board.sourceImpedancePct) {
      const ka = supplyFaultKa(board);
      if (lvSupplied(board)) return supplyEarthLoop(project, board);
      if (ka) return { z: supplyImpedance(ka, project.voltageV), estimated: `Ze estimated from the supply fault level at ${board.id}` };
      return { z: { r: 0, x: 0 }, missing: `no source data at ${board.id} (transformer kVA and impedance %, or the supply fault level)` };
    }
    const zt = transformerImpedance(board.sourceKva, board.sourceImpedancePct, project.voltageV, board.sourceXr ?? DEFAULT_TRANSFORMER_XR);
    // MV network: in the positive and negative sequence only (the Dyn transformer blocks its zero
    // sequence), so it adds 2/3 of its impedance to the loop (2 Z1 + Z0) ÷ 3.
    const zq = gridImpedance(gridSourceOf(project, board), project.voltageV);
    return { z: zq ? { r: zt.r + (2 / 3) * zq.r, x: zt.x + (2 / 3) * zq.x } : zt };
  }
  const up = earthLoopPath(project, board.upstreamId, seen);
  const incomer = feedersOn(project, board.upstreamId!).find((f) => f.feedsBoardId === board.id);
  const est = up.estimated ? { estimated: up.estimated, ...(up.subTransient ? { subTransient: true } : {}) } : {};
  if (!incomer) return { z: up.z, missing: up.missing ?? `no incomer feeder from ${board.upstreamId} to ${board.id}`, ...est };
  const c = cableLoop(project, incomer);
  return { z: { r: up.z.r + c.r, x: up.z.x + c.x }, ...(up.missing ? { missing: up.missing } : {}), ...est };
}

/** Known part of the loop impedance at a board (see earthLoopPath for whether it is complete). */
export function earthLoopToBoard(project: Project, boardId: string): Impedance {
  return earthLoopPath(project, boardId).z;
}

/** Minimum line-to-earth fault current (A) at a board's busbar, or on a circuit from it at `fraction` of the
 * cable's length (1 = the far end): c min · U0 ÷ Zs, as the earth loop study works it. Undefined when the loop
 * to the board is not known (no source data). */
export function earthFaultAtA(project: Project, boardId: string, f?: Feeder, fraction = 1): number | undefined {
  const path = earthLoopPath(project, boardId);
  if (path.missing) return undefined;
  const c = f ? cableLoop(project, f) : { r: 0, x: 0 };
  const zs = Math.hypot(path.z.r + c.r * fraction, path.z.x + c.x * fraction);
  return zs > 0 ? (C_MIN * project.voltageV) / SQRT3 / zs : undefined;
}

export interface EarthingResult {
  feeder: Feeder;
  cpcMm2: number;
  zeOhm: number; // loop impedance at the supply board
  zsOhm: number; // loop impedance at the far end of the circuit
  faultA: number; // minimum earth fault current at the far end
  tripA: number; // current for instantaneous tripping (Ia): the breaker's magnetic trip, or 5 × IΔn with an RCD
  rcdMa?: number; // earth leakage protection on the circuit (its own, or the DB's ELCB group)
  maxZsOhm: number; // largest Zs that still gives instantaneous tripping
  requiredS: number; // required disconnection time
  /** How requiredS was decided: circuit purpose, rating threshold, supply basis, any project override. */
  requiredBasis: string;
  basisSupported: boolean;
  disconnection: Status; // ok: trips instantaneously; warn: 5 s circuit relying on the thermal region; bad: too slow
  /** Minimum area of each protective conductor for the fault energy, from the current through it
   * (cpcCurrentA): the whole fault current for one run; for parallel runs, its equal share (ENG-012). */
  adiabaticMinMm2: number;
  /** ok: one CPC carries the whole fault current (also covers a fault inside one run); warn: passes only
   * if the fault current shares equally between identical runs bonded at both ends (assumed, not
   * verified); bad: too small even with equal sharing. */
  adiabatic: Status;
  runs: number;
  /** Current through each protective conductor in the modelled end-of-circuit fault (equal sharing). */
  cpcCurrentA: number;
  /** One CPC carrying the whole fault current (worst case, e.g. a fault within one run). */
  adiabaticWholeMm2: number;
  /** For parallel runs: what the thermal result assumes. */
  adiabaticNote?: string;
  /** Why the loop to the supply is incomplete. Zs, If and the thermal check are then only the known
   * part (If is an upper bound); nothing is shown as verified. */
  sourceMissing?: string;
  /** Ze comes from the supply fault level of a main board without a transformer (the loop still counts as verified). */
  sourceEstimated?: string;
  /** Ze rests on a generator's sub-transient reactance alone (no minimum fault level typed): the sustained
   * current is lower, so a pass on this basis is not verified (disconnection 'warn'). */
  subTransientOnly?: boolean;
  /** If is at or below the device rating: it cannot trip. */
  belowRating?: boolean;
  status: Status;
}

export function evaluateEarthing(project: Project, f: Feeder): EarthingResult {
  const u0 = project.voltageV / SQRT3;
  const { z: ze, missing: sourceMissing, estimated: sourceEstimated, subTransient } = earthLoopPath(project, f.boardId);
  const c = cableLoop(project, f);
  const zs = { r: ze.r + c.r, x: ze.x + c.x };
  const zsOhm = zMagnitude(zs);
  // Incomplete path: the known loop only gives an upper bound on If (more impedance only lowers it), so it
  // can prove a failure but never a pass. No loop impedance at all: no figure, not Infinity.
  const faultA = zsOhm > 0 ? (C_MIN * u0) / zsOhm : NaN;
  // An RCD (feeder's own, or the ELCB of a DB's final-circuit group) trips
  // within 40 ms at 5 × IΔn (IEC 61008 / 61009), far below a breaker's
  // magnetic threshold.
  const rcdMa = rcdOf(project, f);
  const tripA = rcdMa ? Math.min(instantaneousTripA(f), (5 * rcdMa) / 1000) : instantaneousTripA(f);
  const db = disconnectionBasis(f, project);
  const requiredS = db.requiredS;

  const instantaneous = faultA >= tripA;
  // Instantaneous (< 0.1 s) meets every TN time; otherwise the time limit only counts on the supported basis.
  // A current at or below the device rating can never trip it (complete loop): too slow, whatever the source.
  const belowRating = !sourceMissing && Number.isFinite(faultA) && faultA <= f.breakerRatingA;
  const disconnection: Status = sourceMissing
    ? (Number.isFinite(faultA) && !instantaneous && requiredS < 5 && db.supported ? 'bad' : 'warn')
    : belowRating ? 'bad' : instantaneous ? (subTransient ? 'warn' : 'ok') : requiredS >= 5 || !db.supported ? 'warn' : 'bad';

  // Fault duration for the adiabatic check: 0.1 s when the breaker trips
  // instantaneously (conservative for MCCBs), otherwise the full required
  // disconnection time.
  const t = instantaneous ? 0.1 : requiredS;
  // Adiabatic check, S ≥ I × √t ÷ k, with I the current through the conductor checked. The loop above
  // models identical parallel runs, each with its own CPC, in parallel to a fault at the far end — so
  // each CPC carries 1 ÷ runs of the total there. Whether that holds for every fault (a fault inside one
  // run, unequal runs, a shared CPC) isn't known from the data, so a pass that relies on sharing is only
  // 'warn'. The total fault current still sets the disconnection check above.
  const cpcMm2 = cpcOf(f);
  const runs = runsOf(f);
  const cpcCurrentA = faultA / runs;
  const k = kCpcOf(feederFamily(project, f));
  const adiabaticWholeMm2 = (faultA * Math.sqrt(t)) / k;
  const adiabaticMinMm2 = (cpcCurrentA * Math.sqrt(t)) / k;
  // Unknown fault current and duration: the thermal check can't be decided either way.
  const adiabatic: Status = sourceMissing ? 'warn' : cpcMm2 >= adiabaticWholeMm2 ? 'ok' : cpcMm2 >= adiabaticMinMm2 ? 'warn' : 'bad';
  const adiabaticNote = runs > 1
    ? `${runs} parallel runs: each ${cpcMm2} mm² CPC carries ${fmtFixed(cpcCurrentA, 1)} A of the ${fmtFixed(faultA, 1)} A end-of-circuit fault (needs ${adiabaticMinMm2.toFixed(1)} mm² each, ${(adiabaticMinMm2 * runs).toFixed(1)} of ${cpcMm2 * runs} mm² together). Assumes identical runs and lengths bonded at both ends; ${adiabatic === 'ok' ? 'one CPC alone also carries the whole fault current, so a fault within one run is covered too' : `not verified for a fault within one run, unequal runs or a shared CPC (one CPC alone would need ${adiabaticWholeMm2.toFixed(1)} mm²)`}.`
    : undefined;

  const status: Status = disconnection === 'bad' || adiabatic === 'bad' ? 'bad' : disconnection === 'warn' || adiabatic === 'warn' ? 'warn' : 'ok';
  return {
    feeder: f,
    cpcMm2,
    zeOhm: zMagnitude(ze),
    zsOhm,
    faultA,
    tripA,
    ...(rcdMa ? { rcdMa } : {}),
    maxZsOhm: (C_MIN * u0) / tripA,
    requiredS,
    requiredBasis: db.basis,
    basisSupported: db.supported,
    disconnection,
    adiabaticMinMm2,
    adiabatic,
    runs,
    cpcCurrentA,
    adiabaticWholeMm2,
    ...(adiabaticNote ? { adiabaticNote } : {}),
    ...(sourceMissing ? { sourceMissing } : {}),
    ...(sourceEstimated ? { sourceEstimated } : {}),
    ...(subTransient ? { subTransientOnly: true } : {}),
    ...(belowRating ? { belowRating: true } : {}),
    status
  };
}

/** The disconnection result in words — the same on the page and in the reports. */
export function disconnectionLabel(r: EarthingResult): string {
  if (r.sourceMissing) return r.disconnection === 'bad' ? 'Too slow (even without the missing source impedance)' : 'Not verified — supply loop incomplete';
  if (r.disconnection === 'ok') return '< 0.1 s';
  if (r.belowRating) return `Will not disconnect — If ${fmtFixed(r.faultA, 1)} A is not above the ${r.feeder.breakerRatingA} A device rating`;
  if (r.disconnection === 'bad') return 'Too slow';
  if (r.subTransientOnly && r.faultA >= r.tripA) return 'Not verified — generator X′d assumed, type X′d or the minimum fault level';
  return r.basisSupported ? `Thermal — check curve for ${r.requiredS} s` : 'Required time not determined for this supply';
}
/** Ze, Zs and If as text: an incomplete loop shows Ze unknown, Zs as a minimum and If as a maximum. */
export function loopFigures(r: EarthingResult, d = 4): { ze: string; zs: string; fault: string } {
  if (!r.sourceMissing) return { ze: `${r.sourceEstimated ? '≈ ' : ''}${r.zeOhm.toFixed(d)}`, zs: r.zsOhm.toFixed(d), fault: fmtFixed(r.faultA, 1) };
  return { ze: 'unknown', zs: `≥ ${r.zsOhm.toFixed(d)}`, fault: Number.isFinite(r.faultA) ? `≤ ${fmtFixed(r.faultA, 1)}` : '—' };
}

const elcbCache = new WeakMap<Project, Map<string, number>>();
/** Earth leakage protection of a circuit (mA): its own RCD, else the ELCB
 * group of its DB when it is a load schedule circuit. */
export function rcdOf(project: Project, f: Feeder): number | undefined {
  if (isScheduleCircuit(f) && hasNoRcd(f)) return undefined; // No RCD on purpose: the MCB alone clears an earth fault
  if (f.rcdMa) return f.rcdMa;
  if (!isScheduleCircuit(f)) return undefined;
  let m = elcbCache.get(project);
  if (!m) {
    m = new Map();
    for (const b of project.boards) for (const g of elcbGroups(project, b)) for (const c of g.circuits) m.set(c.id, g.sensitivityMa);
    for (const b of project.boards) for (const r of rcbosOf(project, b)) m.set(r.circuit.id, r.sensitivityMa);
    elcbCache.set(project, m);
  }
  return m.get(f.id);
}

export function evaluateEarthingAll(project: Project): EarthingResult[] {
  return withNetwork(project, () => project.feeders.map((f) => evaluateEarthing(project, f)));
}
