import { withNetwork } from './network';
import { faultCurrentKA, feederRating, impedanceToBoard, incomerBasis, izText, sourceAssumed, supplySourceLevel, supplyVdUsedPct, voltageDropPct, type Status } from './electrical';
import type { RatingBasis } from './installation';
import { lvSupplied, supplyIncomerFeeder, type Board, type Feeder, type Project } from '../types';
import { fmtFixed } from '../util/format';

/** The incoming cable of a first board on an LV supply, from the supply point (the feeding board's busbar, where
 * the values given from upstream apply) to this board, checked like an incomer feeder: Ib ≤ In ≤ Iz and the
 * voltage drop against the project's limit, with the drop already used upstream added. In is the supply's
 * device rating; when it is not given, or the device is an isolator, that check is skipped and ends 'warn' (not verified). */
export interface SupplyIncomerResult {
  board: Board;
  /** The cable as a Feeder (supplyIncomerFeeder), for the cable calculations. */
  cable: Feeder;
  ibA: number; // design current: the board's incomer basis (most loaded phase)
  inA?: number; // the supply device's rating, when given
  izA: number; // derated cable rating; NaN when there is none for the installation method
  rating: RatingBasis;
  vdPct: number; // the cable's own drop
  vdUsedPct: number; // already used upstream of the supply point
  vdTotalPct: number;
  vdStatus: Status;
  /** Fault level stated at the supply point (kA), when given. */
  faultSupplyKA?: number;
  /** Prospective fault at the board's busbar, behind the incoming cable. */
  faultBoardKA: number;
  /** No supply fault level is given: faultBoardKA rests on the placeholder source. */
  faultAssumed?: true;
  ampacityStatus: 'ok' | 'bad'; // Iz ≥ Ib
  protectionStatus: Status; // Ib ≤ In ≤ Iz; 'warn' when In is not given
  status: Status;
  /** Short reasons for every check that is not 'ok'. */
  reasons: string[];
}

export function evaluateSupplyIncomer(project: Project, board: Board): SupplyIncomerResult | undefined {
  const cable = lvSupplied(board) ? supplyIncomerFeeder(board) : undefined;
  if (!cable) return undefined;
  const ibA = incomerBasis(cable, project).current.a;
  const inA = board.supply!.ratingA && board.supply!.ratingA > 0 ? board.supply!.ratingA : undefined;
  const rating = feederRating(project, cable);
  const izA = rating.iz;
  const vdPct = voltageDropPct(cable, project);
  const vdUsedPct = supplyVdUsedPct(board);
  const vdTotalPct = vdUsedPct + vdPct;
  const vdStatus: Status = vdTotalPct > project.vdLimitPct ? 'bad' : vdTotalPct > project.vdLimitPct * 0.85 ? 'warn' : 'ok';
  const ampacityStatus = izA >= ibA ? 'ok' : 'bad';
  // An isolator gives no overload protection: its rating can fail Ib, but the cable's protection is not verified.
  const isolator = board.supply!.device === 'ISOL';
  const protectionStatus: Status = inA === undefined ? 'warn' : ibA > inA ? 'bad' : isolator ? 'warn' : inA <= izA ? 'ok' : 'bad';
  const faultAssumed = sourceAssumed(project, board.id);
  const level = supplySourceLevel(project, board); // the fault level at the supply point: typed, or calculated from the source rating
  const faultSupplyKA = level.basis === 'assumed' ? undefined : level.ka;
  const faultBoardKA = faultCurrentKA(impedanceToBoard(project, board.id), project.voltageV);

  const reasons: string[] = [];
  if (rating.missing) reasons.push(`no rating for the incoming cable (${rating.missing})`);
  else if (ampacityStatus === 'bad') reasons.push(`Iz ${izText(izA)} A is below Ib ${fmtFixed(ibA, 1)} A`);
  if (inA === undefined) reasons.push('supply device rating not given: Ib ≤ In ≤ Iz not checked');
  else if (ibA > inA) reasons.push(`Ib ${fmtFixed(ibA, 1)} A is above the supply device ${fmtFixed(inA, 0)} A`);
  else if (isolator) reasons.push('the supply device is an isolator: protection of the incoming cable not verified (Ib ≤ In ≤ Iz not checked)');
  else if (!rating.missing && !(inA <= izA)) reasons.push(`the supply device ${fmtFixed(inA, 0)} A is above Iz ${izText(izA)} A: the cable is not protected`);
  if (vdStatus !== 'ok') reasons.push(`voltage drop ${fmtFixed(vdTotalPct, 2)} % (${fmtFixed(vdUsedPct, 2)} % used upstream) ${vdStatus === 'bad' ? 'above' : 'close to'} the ${project.vdLimitPct} % limit`);

  const statuses: Status[] = [vdStatus, ampacityStatus, protectionStatus];
  const status: Status = statuses.includes('bad') ? 'bad' : statuses.includes('warn') ? 'warn' : 'ok';
  return {
    board, cable, ibA, ...(inA !== undefined && { inA }), izA, rating, vdPct, vdUsedPct, vdTotalPct, vdStatus,
    ...(faultSupplyKA !== undefined && { faultSupplyKA }), faultBoardKA, ...(faultAssumed && { faultAssumed }),
    ampacityStatus, protectionStatus, status, reasons
  };
}

/** The incoming cable checks of every first board that has one. */
export function supplyIncomers(project: Project): SupplyIncomerResult[] {
  return withNetwork(project, () => project.boards.flatMap((b) => evaluateSupplyIncomer(project, b) ?? []));
}
