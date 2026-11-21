import type { Feeder, PointType, Project } from '../types';
import { applyRecommendation, recommend } from './sizing';
import type { LoadAssessment } from './loadAssessment';
import { assessmentFeeders, type LaFeederItem } from './loadAssessmentMdb';

/** The lump feeders ("la:…" from the load assessment) stand in for loads that are not designed yet. When real
 * DBs or service feeders are designed under the same MDB, the lumps are reduced by what is designed, so the
 * load is counted once. */

const round = (x: number) => Math.round(x * 100) / 100;

/** The lump (assessment feeder key, without "-e" and with stair1/stair2 as "stair") a Common service belongs to. */
export const LUMP_OF_SERVICE: Record<string, string> = { lift: 'lift', booster: 'pump', transfer: 'pump', carpark: 'pump', pool: 'pump', ev: 'ev', facade: 'spec', fire: 'fire', jockey: 'jockey', stair: 'stair' };

const groupOf = (key: string) => (/^stair\d$/.test(key) ? 'stair' : key.replace(/-e$/, ''));
const CATEGORY = new Set(['ltg', 'pwr', 'hvac', 'dhw', 'cook', 'lift', 'pump', 'ev', 'spec']);

/** 'la:pump-e' → 'pump', 'la:stair2' → 'stair'; undefined for a feeder that is not a lump. */
export function lumpKeyOf(f: Feeder): string | undefined {
  return f.fromRoom?.startsWith('la:') ? groupOf(f.fromRoom.slice(3)) : undefined;
}

const POINT_LUMPS: [PointType[], string][] = [[['wh'], 'dhw'], [['cooker'], 'cook'], [['sac', 'wac', 'fcu'], 'hvac'], [['s13', 's15', 's13t', 'shaver', 'spur'], 'pwr'], [['ltg', 'cfan', 'exfan'], 'ltg']];
const TYPE_LUMPS: Record<string, string> = { lighting: 'ltg', sockets: 'pwr', hvac: 'hvac', ev: 'ev' };

/** The lump a designed load belongs to, when it can be told. */
export function lumpOfLoad(f: Feeder): string | undefined {
  if (f.feedsBoardId || f.existing || f.fromRoom?.startsWith('la:')) return undefined;
  if (f.fromRoom?.startsWith('svc:')) return LUMP_OF_SERVICE[f.fromRoom.slice(4)];
  const pts = f.points;
  if (pts && Object.values(pts).some((n) => (n ?? 0) > 0)) {
    for (const [types, lump] of POINT_LUMPS) if (types.some((t) => (pts[t] ?? 0) > 0)) return lump;
    return undefined;
  }
  return f.loadType ? TYPE_LUMPS[f.loadType] : undefined;
}

/** Connected kW designed so far, per lump. */
export function designedByLump(project: Project): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of project.feeders) { const k = lumpOfLoad(f); if (k) out[k] = (out[k] ?? 0) + f.loadKw; }
  return out;
}

/** What each assessment feeder should carry now: the assessment's kW less what is already designed in its lump. */
export function expectedLumps(project: Project, a: LoadAssessment): LaFeederItem[] {
  const designed = designedByLump(project);
  const groups = new Map<string, LaFeederItem[]>();
  for (const it of assessmentFeeders(a)) { const g = groupOf(it.key); groups.set(g, [...(groups.get(g) ?? []), it]); }
  const out: LaFeederItem[] = [];
  for (const [g, items] of groups) {
    const done = designed[g] ?? 0;
    if (CATEGORY.has(g)) {
      const full = items.reduce((s, x) => s + x.kw, 0), left = Math.max(0, full - done);
      for (const it of items) out.push({ ...it, kw: full > 0 ? round((it.kw * left) / full) : 0 });
    } else if (g === 'fire' || g === 'jockey' || g === 'stair') {
      let take = done;
      for (const it of items) {
        if (take >= it.kw - 0.005) { take -= it.kw; out.push({ ...it, kw: 0 }); }
        else { out.push({ ...it, kw: round(it.kw - take) }); take = 0; }
      }
    } else out.push(...items);
  }
  const order = new Map(assessmentFeeders(a).map((x, i) => [x.key, i]));
  return out.filter((x) => x.kw >= 0.005).sort((x, y) => order.get(x.key)! - order.get(y.key)!);
}

export interface LumpChange { key: string; label: string; fromKw: number; toKw: number }

/** Brings the lump feeders that exist to what is expected: reduced as real loads arrive, removed at zero, restored if the real loads go. */
export function reconcileLumps(project: Project, a: LoadAssessment): { project: Project; changes: LumpChange[] } {
  const known = new Set(assessmentFeeders(a).map((x) => x.key));
  const want = new Map(expectedLumps(project, a).map((x) => [x.key, x]));
  const mine = (f: Feeder) => !!f.fromRoom?.startsWith('la:') && known.has(f.fromRoom.slice(3));
  const before = new Map<string, { label: string; kw: number }>();
  const after = new Map<string, number>();
  let p = project;
  for (const f of project.feeders.filter(mine)) {
    const g = lumpKeyOf(f)!;
    before.set(g, { label: before.get(g)?.label ?? f.name, kw: (before.get(g)?.kw ?? 0) + f.loadKw });
    const it = want.get(f.fromRoom!.slice(3));
    if (!it) { p = { ...p, feeders: p.feeders.filter((x) => x.id !== f.id) }; continue; }
    after.set(g, (after.get(g) ?? 0) + (Math.abs(f.loadKw - it.kw) >= 0.005 ? it.kw : f.loadKw));
    if (Math.abs(f.loadKw - it.kw) < 0.005) continue;
    const next = { ...f, loadKw: it.kw };
    const tmp = { ...p, feeders: p.feeders.map((x) => (x.id === f.id ? next : x)) };
    p = { ...tmp, feeders: tmp.feeders.map((x) => (x.id === f.id ? applyRecommendation(next, recommend(tmp, next, 'optimise')) : x)) };
  }
  const changes: LumpChange[] = [];
  for (const [key, b] of before) { const toKw = after.get(key) ?? 0; if (Math.abs(b.kw - toKw) >= 0.005) changes.push({ key, label: b.label, fromKw: b.kw, toKw }); }
  return { project: p, changes };
}
