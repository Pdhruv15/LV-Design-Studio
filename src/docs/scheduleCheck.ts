import type { Board, Project } from '../types';
import { cables } from '../calc/cableTable';
import { evaluateFeeder } from '../calc/electrical';
import { scheduleCircuits } from '../calc/loadSchedule';
import { withNetwork } from '../calc/network';
import { failReasons, quickFixes } from '../calc/quickFix';
import { loadScheduleRows } from './loadScheduleDoc';
import { fmtFixed } from '../util/format';

export type ScheduleRow = ReturnType<typeof loadScheduleRows>['rows'][number];
export interface ScheduleFix { label: string; patch: Partial<ScheduleRow['f']> }

/** A row that fails or needs checking: its status is not OK, or its wire is below the minimum for its type. */
export const isProblem = (r: Pick<ScheduleRow, 'status' | 'belowMin'>) => r.status !== 'ok' || r.belowMin;
/** A failing row (a wire below the minimum counts); the other problem rows are to check. */
export const isFail = (r: Pick<ScheduleRow, 'status' | 'belowMin'>) => r.status === 'bad' || r.belowMin;
export const problemRows = (rows: ScheduleRow[]) => rows.filter(isProblem);

/** The first board after this one in `order` (wrapping round, this one last) with a problem circuit. Each board's rows are
 * worked out only when the search reaches it. */
export function nextProblemBoard(project: Project, from: string, order: Board[]): string | undefined {
  const i = order.findIndex((b) => b.id === from);
  for (let k = 1; k <= order.length; k++) {
    const b = order[(i + k) % order.length];
    if (!b || !scheduleCircuits(project, b.id).length) continue;
    if (loadScheduleRows(project, b.id).rows.some(isProblem)) return b.id;
  }
  return undefined;
}

/** Why a row is a problem, in words: the check's reasons, its warnings, and the minimum wire when the wire is below it. */
export function rowReasons(project: Project, r: ScheduleRow): string[] {
  return withNetwork(project, () => {
    const res = r.status === 'ok' ? undefined : evaluateFeeder(project, r.f);
    const out = res ? failReasons(project, res) : [];
    // The warning the failure list leaves out: a breaker near its rating.
    if (res && res.loadingPct > 85 && res.loadingPct <= 100) out.push(`Breaker loading ${fmtFixed(res.loadingPct, 0)} % of In ${r.f.breakerRatingA} A`);
    return r.belowMin ? [`Wire below the ${r.minWire} mm² minimum for ${r.category} circuits`, ...out] : out;
  });
}

/** What can be done about it: the smallest wire that meets the minimum, then the quick fixes the SLD offers. */
export function rowFixes(project: Project, r: ScheduleRow): ScheduleFix[] {
  return withNetwork(project, () => {
    const out: ScheduleFix[] = [];
    const wire = r.belowMin ? cables().find((c) => c.csaMm2 >= r.minWire) : undefined;
    if (wire) out.push({ label: `${wire.csaMm2} mm² wire`, patch: { cableCsaMm2: wire.csaMm2, cpcMm2: undefined } });
    if (r.status !== 'ok') for (const x of quickFixes(project, r.f)) if (!out.some((y) => y.label === x.label)) out.push({ label: x.label, patch: x.patch });
    return out;
  });
}
