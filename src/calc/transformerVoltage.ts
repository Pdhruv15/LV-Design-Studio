import type { Board, Project } from '../types';
import { gridSourceOf } from './electrical';

/** Transformer voltages, tap and the usual pick-list values (the board form and Project settings suggest them). */
export const MV_VOLTAGES_KV = [3.3, 6.6, 11, 13.8, 22, 33];
export const LV_VOLTAGES_V = [208, 380, 400, 415, 433, 480, 690];
export const TAP_STEPS_PCT = [-5, -2.5, 0, 2.5, 5];
export const VECTOR_GROUPS = ['Dyn11', 'Dyn5', 'YNd11', 'Yyn0', 'Dzn0'];

/** Primary voltage of a main board's transformer, kV: its own value, else its grid source's, else 11. */
export function transformerPrimaryKv(project: Project, board: Board): number {
  const own = board.sourcePrimaryKv;
  if (own !== undefined && Number.isFinite(own) && own > 0) return own;
  const kv = gridSourceOf(project, board)?.kv;
  return kv && kv > 0 ? kv : 11;
}

/** No-load secondary voltage on the set tap as a % above (+) or below (−) nominal: (1 / (1 + tap/100) − 1) × 100.
 * Tap −2.5 % → +2.56 %; 0 → 0. */
export function tapBoostPct(board: Board): number {
  const t = board.sourceTapPct;
  return t !== undefined && Number.isFinite(t) && t !== 0 && t > -100 ? (1 / (1 + t / 100) - 1) * 100 : 0;
}

/** 'step-down' when the primary voltage is above the secondary (the project's LV voltage), 'step-up' when below. */
export function transformerKind(project: Project, board: Board): 'step-down' | 'step-up' {
  return transformerPrimaryKv(project, board) * 1000 >= project.voltageV ? 'step-down' : 'step-up';
}
