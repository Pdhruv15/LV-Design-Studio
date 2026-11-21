import type { Board, Project } from '../types';
import { boardSummary } from './summary';

/** A board busbar's rated short-time withstand (Icw, 1 s, IEC 61439-1 §5.3.4) against the
 * prospective fault level at the board. Only boards with an Icw entered are checked: the
 * figure is the panel builder's, so none is assumed. */
export interface BusbarIcwCheck {
  board: Board; icwKa: number; faultKa: number; ok: boolean;
  /** The fault level rests on the placeholder source: neither a pass nor a fail ("not verified"). */
  assumed?: true;
}

export function busbarIcwCheck(project: Project, board: Board): BusbarIcwCheck | undefined {
  const icwKa = board.busbarIcwKa;
  if (!(icwKa !== undefined && icwKa > 0)) return undefined;
  const s = boardSummary(project, board);
  const faultKa = s.faultKA;
  return { board, icwKa, faultKa, ok: icwKa + 1e-9 >= faultKa, ...(s.faultAssumed && { assumed: true as const }) };
}

export const busbarIcwChecks = (project: Project): BusbarIcwCheck[] =>
  project.boards.map((b) => busbarIcwCheck(project, b)).filter((c): c is BusbarIcwCheck => !!c);
