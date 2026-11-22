import { networkOf, withNetwork } from './network';
import { evaluateFeeder, type Status } from './electrical';
import { breakerTypeOf, instantaneousTripA } from './earthing';
import { lvSupplied, supplyGiven, type Board, type Feeder, type Project, type SwitchDevice } from '../types';

/** Lower edge of the magnetic band — the largest current at which the
 * breaker is guaranteed NOT to trip instantaneously: 3/5/10 In for MCB
 * types B/C/D (IEC 60898-1); Im − 20 % tolerance for MCCB/ACB. */
export function instantaneousNoTripA(f: Feeder): number {
  switch (breakerTypeOf(f)) {
    case 'B':
      return 3 * f.breakerRatingA;
    case 'C':
      return 5 * f.breakerRatingA;
    case 'D':
      return 10 * f.breakerRatingA;
    default:
      return 0.8 * (f.breakerImMultiple ?? 10) * f.breakerRatingA;
  }
}

/** Generic inverse-time characteristic for plotting: t = A / ((I/In)² − 1)
 * in the thermal region, stepping down to 20 ms at the magnetic threshold.
 * This is a representative shape (≈ 1.45 In in minutes, 3 In in about a
 * minute), NOT manufacturer data — use the device's published curves for
 * final coordination. Returns Infinity below 1.05 In (no trip). */
const THERMAL_A = 500;
export function genericTripTimeS(f: Feeder, currentA: number, magneticAt = instantaneousTripA(f)): number {
  const m = currentA / f.breakerRatingA;
  if (m <= 1.05) return Infinity;
  if (currentA >= magneticAt) return 0.02;
  return Math.min(THERMAL_A / (m * m - 1), 10000);
}

export interface SelectivityResult {
  upstream: Feeder;
  downstream: Feeder;
  ratio: number; // In upstream ÷ In downstream
  ratioOk: boolean; // ≥ 1.6 gives overload (time) selectivity
  faultKA: number; // maximum fault at the downstream breaker
  limitKA: number; // current selectivity limit = upstream magnetic no-trip threshold
  shortCircuit: 'total' | 'partial';
  status: Status;
}

/** Selectivity between two breakers in series (up feeds down). */
export function selectivityPair(project: Project, up: Feeder, down: Feeder): SelectivityResult {
  const ratio = up.breakerRatingA / down.breakerRatingA;
  const ratioOk = ratio >= 1.6;
  const faultKA = evaluateFeeder(project, down).breakerFaultKA;
  const limitKA = instantaneousNoTripA(up) / 1000;
  const shortCircuit = limitKA >= faultKA ? 'total' : 'partial';
  const status: Status = !ratioOk && up.breakerRatingA <= down.breakerRatingA ? 'bad' : ratioOk && shortCircuit === 'total' ? 'ok' : 'warn';
  return { upstream: up, downstream: down, ratio, ratioOk, faultKA, limitKA, shortCircuit, status };
}

/** The breakers a feeder's supply passes through, nearest first: the
 * incomer of its board, then that board's incomer, up to the main board. */
export function upstreamBreakers(project: Project, f: Feeder): Feeder[] {
  const out: Feeder[] = [];
  const seen = new Set<string>();
  for (let boardId = f.boardId; !seen.has(boardId); ) {
    seen.add(boardId);
    const inc = project.feeders.find((x) => x.feedsBoardId === boardId && project.boards.find((b) => b.id === boardId)?.upstreamId === x.boardId);
    if (!inc) break;
    out.push(inc);
    boardId = inc.boardId;
  }
  return out;
}

/** Discrimination along a feeder's supply: each breaker with the one
 * above it, from the feeder up to the main board. */
export function discriminationChain(project: Project, f: Feeder): SelectivityResult[] {
  const chain = [f, ...upstreamBreakers(project, f)];
  return chain.slice(0, -1).map((down, i) => selectivityPair(project, chain[i + 1], down));
}

/** Current-based selectivity between a sub-board's incoming breaker and
 * each outgoing breaker on that board (see selectivityPair):
 *  - overload region: In(up) / In(down) ≥ 1.6;
 *  - short-circuit region: total if the upstream breaker's magnetic
 *    no-trip threshold is above the maximum fault at the downstream breaker,
 *    otherwise partial up to that threshold (the manufacturer's selectivity
 *    tables may still show total selectivity through energy limitation). */
export function evaluateSelectivity(project: Project): SelectivityResult[] {
  return withNetwork(project, () => {
    const out: SelectivityResult[] = [];
    const ix = networkOf(project)!;
    for (const up of project.feeders.filter((f) => f.feedsBoardId)) {
      for (const down of ix.feedersByBoard.get(up.feedsBoardId!) ?? []) out.push(selectivityPair(project, up, down));
    }
    return out;
  });
}

/** Discrimination between the supply's upstream device (Board.supply) and an outgoing breaker of the first board it
 * feeds. The overload region is judged as selectivityPair does: In(up) ÷ In(down) ≥ 1.6, with In = supply.ratingA.
 * The short-circuit region needs the upstream device's instantaneous setting, which the supply does not hold, so it is
 * not invented: the pair is not verified (status 'warn', never 'ok'), unless the overload region already fails ('bad'). */
export interface SupplySelectivityResult {
  board: Board;
  upstream: { device?: SwitchDevice; ratingA: number; irSetting?: number };
  downstream: Feeder;
  ratio: number; // supply In ÷ In downstream
  ratioOk: boolean; // ≥ 1.6 gives overload (time) selectivity
  faultKA: number; // maximum fault at the downstream breaker
  status: Status;
  reasons: string[];
}

/** The supply device against each outgoing breaker, for every first board on an LV supply that has a device rating and
 * at least one value given from upstream (a supply with only its stated rating is left as it was). */
export function evaluateSupplySelectivity(project: Project): SupplySelectivityResult[] {
  return withNetwork(project, () => {
    const out: SupplySelectivityResult[] = [];
    const ix = networkOf(project)!;
    for (const board of project.boards) {
      const sup = board.supply;
      if (!lvSupplied(board) || !sup?.ratingA || !(sup.ratingA > 0) || !supplyGiven(board)) continue;
      const upstream = { ...(sup.device && { device: sup.device }), ratingA: sup.ratingA, ...(sup.irSetting && { irSetting: sup.irSetting }) };
      for (const down of ix.feedersByBoard.get(board.id) ?? []) {
        const ratio = sup.ratingA / down.breakerRatingA;
        const ratioOk = ratio >= 1.6;
        const bad = !ratioOk && sup.ratingA <= down.breakerRatingA;
        const reasons: string[] = [];
        if (bad) reasons.push(`the supply device ${sup.ratingA} A is not above ${down.id} (${down.breakerRatingA} A)`);
        else if (!ratioOk) reasons.push(`In ratio ${ratio.toFixed(2)} is below 1.6`);
        reasons.push(sup.device === 'ISOL' ? 'the supply device is an isolator: no protective device to discriminate with' : 'short circuit: the upstream device setting is not given');
        out.push({ board, upstream, downstream: down, ratio, ratioOk, faultKA: evaluateFeeder(project, down).breakerFaultKA, status: bad ? 'bad' : 'warn', reasons });
      }
    }
    return out;
  });
}
