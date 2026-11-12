import type { Project } from '../types';
import { cableLabel } from './cadDevices';
import { levelOfPlan, planOfLevel } from './cadPlans';
import { planScale } from './cadUnits';
import { boardLocation, findFloor, floorLabel, floorList, type LevelRef } from './levels';

/** Where a board or circuit of the SLD is on a floor plan: the level and its drawing, what to mark there (placed items
 * by key, drawn cable pieces by id) and the window to zoom to (metres on the plan). */
export interface PlanTarget {
  level: LevelRef;
  file: string;
  kind: 'board' | 'devices' | 'route';
  /** Placed items to pick ("board:<id>", "lv:<id>"). */
  keys: string[];
  /** Drawn cable route pieces to select (sketch item ids). */
  itemIds: string[];
  /** The window to zoom to, metres; none for a route known only by a handle in the architect's drawing. */
  box?: { x0: number; y0: number; x1: number; y1: number };
  /** What the target is, e.g. "DB-2 · Level 2 · Elec. room 2.01". */
  label: string;
  /** Said first when the target is not what was asked for: "<circuit> has no route or devices on a plan; showing the board it feeds". */
  note?: string;
}

/** The window grows by a quarter, and a single point gets at least this far each way. */
const GROW = 0.25, MIN_HALF_M = 4;

type Pt = [number, number];
function windowOf(pts: Pt[]): PlanTarget['box'] {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const hw = Math.max((x1 - x0) * (1 + GROW) / 2, MIN_HALF_M), hh = Math.max((y1 - y0) * (1 + GROW) / 2, MIN_HALF_M);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  return { x0: cx - hw, y0: cy - hh, x1: cx + hw, y1: cy + hh };
}

/** The lowest level of those given (order of Building information, bottom to top). */
function lowest(p: Project, levels: LevelRef[]): LevelRef {
  const order = new Map<string, number>();
  floorList(p.building).forEach((f) => { const k = `${f.ref.building}/${f.ref.level}`; if (!order.has(k)) order.set(k, f.order); });
  const o = (l: LevelRef) => order.get(`${l.building}/${l.level}`) ?? Infinity;
  return levels.reduce((a, b) => (o(b) < o(a) ? b : a));
}

const levelName = (p: Project, l: LevelRef) => {
  const f = findFloor(p.building, l);
  return f ? floorLabel(p.building, f) : l.level;
};

function onPlan(p: Project, level: LevelRef, rest: Omit<PlanTarget, 'level' | 'file'>): PlanTarget | string {
  const plan = planOfLevel(p, level);
  if (!plan) return `No plan drawing is set for ${levelName(p, level)}`;
  return { level, file: plan.file, ...rest };
}

function boardTarget(p: Project, boardId: string, note?: string): PlanTarget | string {
  const b = p.boards.find((x) => x.id === boardId);
  if (!b?.planPoint || !b.level) return `${boardId} is not placed on a plan (Design CAD → Place board)`;
  return onPlan(p, b.level, {
    kind: 'board', keys: [`board:${b.id}`], itemIds: [], box: windowOf([[b.planPoint.x, b.planPoint.y]]),
    label: [b.id, boardLocation(p, b)].filter(Boolean).join(' · '), note
  });
}

/**
 * Where a board or circuit is on the plans. A board: its placed symbol. A circuit: its drawn cable route (the lowest
 * level when pieces are on several), else its placed devices (the level with most of them, the lowest on a tie), else
 * the board it feeds when that is placed. A reason when there is nothing to show.
 */
export function planTarget(p: Project, pick: { board?: string; feeder?: string }): PlanTarget | string {
  if (pick.board) return boardTarget(p, pick.board);
  const f = p.feeders.find((x) => x.id === pick.feeder);
  if (!f) return 'Nothing is selected';

  // Drawn cable route pieces and routes linked by handle, by drawing file.
  const routed = new Map<string, { items: { id: string; pts: Pt[] }[] }>();
  const fileKey = (file: string) => file.trim().toLowerCase();
  const slot = (file: string) => routed.get(fileKey(file)) ?? routed.set(fileKey(file), { items: [] }).get(fileKey(file))!;
  for (const s of p.cadSketch ?? []) {
    for (const it of s.items) if (it.cable?.feederId === f.id && it.pts.length) slot(s.file).items.push({ id: it.id, pts: it.pts });
  }
  for (const l of p.cadPlanLinks ?? []) if (Object.values(l.routes ?? {}).includes(f.id)) slot(l.file);
  const levels = new Map<string, LevelRef>();
  for (const file of routed.keys()) {
    const fl = levelOfPlan(p, file);
    if (fl) levels.set(`${fl.ref.building}/${fl.ref.level}`, { building: fl.ref.building, level: fl.ref.level });
  }
  if (levels.size) {
    const level = lowest(p, [...levels.values()]);
    const plan = planOfLevel(p, level)!;
    const here = routed.get(fileKey(plan.file)) ?? { items: [] };
    const m = planScale(p, plan.file, plan.units).factor;
    const pts = here.items.flatMap((i) => i.pts.map((q): Pt => [q[0] * m, q[1] * m]));
    return { level, file: plan.file, kind: 'route', keys: [], itemIds: here.items.map((i) => i.id), box: pts.length ? windowOf(pts) : undefined, label: `${cableLabel(p, f)} · ${levelName(p, level)}` };
  }

  // Placed devices: the level holding most of them.
  const pts = (p.lvPoints ?? []).filter((d) => d.feederId === f.id);
  if (pts.length) {
    const by = new Map<string, typeof pts>();
    for (const d of pts) (by.get(`${d.buildingId}/${d.levelId}`) ?? by.set(`${d.buildingId}/${d.levelId}`, []).get(`${d.buildingId}/${d.levelId}`)!).push(d);
    const most = Math.max(...[...by.values()].map((g) => g.length));
    const tied = [...by.values()].filter((g) => g.length === most);
    const level = lowest(p, tied.map((g) => ({ building: g[0].buildingId, level: g[0].levelId })));
    const group = tied.find((g) => g[0].buildingId === level.building && g[0].levelId === level.level)!;
    return onPlan(p, level, { kind: 'devices', keys: group.map((d) => `lv:${d.id}`), itemIds: [], box: windowOf(group.map((d): Pt => [d.x, d.y])), label: `${cableLabel(p, f)} · ${levelName(p, level)}` });
  }

  // The board it feeds, when that is placed.
  if (f.feedsBoardId) {
    const b = p.boards.find((x) => x.id === f.feedsBoardId);
    if (b?.planPoint && b.level) return boardTarget(p, b.id, `${cableLabel(p, f)} has no route or devices on a plan; showing the board it feeds`);
  }
  return `${cableLabel(p, f)} has no route or devices on a plan`;
}
