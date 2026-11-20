import type { Project } from '../types';
import type { SheetTable } from './sheetTable';
import { mvPlan, onMvSide } from '../diagram/mvArrangement';
import { rmuRecord, txRatio } from '../calc/hvSupply';
import { txTags } from '../model/transformers';

/** The MV overview sheet's two schedules (One sheet per substation; proposal 2026-11-18 part 5), under its drawing and
 * in its order (by ring, then substation, then RMU): each RMU with its substation, ways, ratings, tee-off protection and
 * what each tee-off feeds; each transformer with its rating, impedance, vector group, ratio, substation, RMU way, main
 * board and the sheet it is drawn on. A value not entered prints as —. */

const dash = (v: string | number | undefined) => (v === undefined || v === '' ? '—' : String(v));

/** RMU SCHEDULE: RMU, S/S, ways, rating, short-time, tee-off protection, feeds (spare tee-offs and the normally open
 * switch included). Undefined without an RMU on the ring. */
export function rmuSchedule(project: Project): SheetTable | undefined {
  const tags = txTags(project);
  const rows = mvPlan(project).rings.flatMap((r) => r.items).flatMap((it) => {
    if (it.kind !== 'rmu') return [];
    const rec = rmuRecord(project, it.name);
    const rating = [rec?.ratedKv ? `${rec.ratedKv} kV` : undefined, rec?.ratedA ? `${rec.ratedA} A` : undefined].filter(Boolean).join(' · ');
    const tOff = it.tOff === 'vcb' ? 'CB, relay 50/51, 50N/51N' : it.tOff === 'fuse' ? `switch-fuse${it.fuseA ? ` ${it.fuseA} A` : ''}` : undefined;
    const feeds = it.tees.map((t, i) => (t ? tags.get(t) ?? t : `T${i + 1} spare`)).join(', ') + (it.normallyOpen ? ` · N/O on ${it.normallyOpen}` : '');
    return [[it.name, dash(it.substation), dash(it.config), dash(rating), rec?.ikKa ? `${rec.ikKa} kA ${rec.ikDurationS ?? 1} s` : '—', dash(tOff), feeds]];
  });
  if (!rows.length) return undefined;
  return { title: 'RMU SCHEDULE', lines: [], head: ['RMU', 'S/S', 'Ways', 'Rating', 'Short-time', 'Tee-off protection', 'Feeds'], rows, foot: [], widths: [58, 46, 50, 96, 76, 162, 160], left: [0, 5, 6] };
}

/** TRANSFORMER SCHEDULE: TX, kVA, Z %, vector group, ratio (as the SLD labels it), S/S, RMU and way, main board and the
 * sheet it is drawn on (`sheetOf`: main board id → sheet number). Undefined without a transformer on the MV side. */
export function txSchedule(project: Project, sheetOf: Record<string, string> = {}): SheetTable | undefined {
  const tags = txTags(project);
  const plan = mvPlan(project);
  const where = new Map<string, { ss?: string; way?: string }>();
  for (const it of plan.rings.flatMap((r) => r.items)) {
    if (it.kind === 'tap') where.set(it.boardId, { ss: it.substation });
    else it.tees.forEach((t, i) => { if (t) where.set(t, { ss: it.substation, way: `${it.name} / T${i + 1}` }); });
  }
  const byId = new Map(project.boards.map((b) => [b.id, b]));
  const rows = plan.order.map((id) => byId.get(id)!).filter((b) => onMvSide(b) && b.sourceKva).map((b) => {
    const w = where.get(b.id) ?? {};
    return [tags.get(b.id) ?? '—', String(b.sourceKva), dash(b.sourceImpedancePct), b.vectorGroup ?? 'Dyn11', txRatio(project, b), dash(w.ss), dash(w.way), b.id, dash(sheetOf[b.id])];
  });
  if (!rows.length) return undefined;
  return { title: 'TRANSFORMER SCHEDULE', lines: [], head: ['TX', 'kVA', 'Z %', 'Group', 'Ratio', 'S/S', 'RMU / way', 'Main board', 'Sheet'], rows, foot: [], widths: [46, 46, 38, 52, 80, 44, 84, 78, 76], left: [0, 7] };
}
