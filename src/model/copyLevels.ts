import { circuitRef } from '../calc/loadSchedule';
import { LIGHTING_POINTS, type Board, type Feeder, type PointType, type Project } from '../types';
import { finalCircuits, placeAccessory, placeLvPoint, removeAccessory, removeLvPoint, type LvPoint } from './cadDevices';
import { suits } from './circuitRoom';
import type { LevelRef } from './levels';

/** Copy to levels (CL): this level's lights, sockets and equipment, and its switches and boxes, to other levels at the
 * same plan positions. A point goes on the same way of the board chosen for its board on the other level. */
export interface CopyTarget { level: LevelRef; label: string; /** Board of a copied point → the board that takes it on this level (none: left out). */ boards: Record<string, string | undefined> }
export interface LvCopyLevel { label: string; points: number; acc: number; removed: number; leftOut: number }
export interface LvCopyResult { project: Project; levels: LvCopyLevel[]; notes: string[] }

const onLevel = (x: { buildingId: string; levelId: string }, l: LevelRef) => x.buildingId === l.building && x.levelId === l.level;
const boardOnLevel = (b: Board, l: LevelRef) => b.level?.building === l.building && b.level?.level === l.level;
const SOCKETS: PointType[] = ['s13', 's13t', 's15', 'shaver'];

/** The boards whose circuits carry what is ticked on this level (its points, and its switches that name a circuit), with how many, in the order of the project's boards. */
export function boardsToMap(p: Project, from: LevelRef, what: { points: boolean; acc: boolean }): { boardId: string; n: number }[] {
  const count = new Map<string, number>();
  const add = (feederId: string | undefined) => {
    const f = p.feeders.find((x) => x.id === feederId);
    if (f) count.set(f.boardId, (count.get(f.boardId) ?? 0) + 1);
  };
  if (what.points) for (const d of p.lvPoints ?? []) if (onLevel(d, from)) add(d.feederId);
  if (what.acc) for (const d of p.cadAccessories ?? []) if (onLevel(d, from)) add(d.feederId);
  const ids = p.boards.map((b) => b.id);
  return [...count.keys()].sort((a, b) => ids.indexOf(a) - ids.indexOf(b)).map((boardId) => ({ boardId, n: count.get(boardId)! }));
}

/** The boards copies may go on: the level's own boards (any floor of a typical level) first, then the others; only boards with a final circuit. */
export function boardChoices(p: Project, level: LevelRef): { here: Board[]; others: Board[] } {
  const withCircuit = new Set(finalCircuits(p).map((f) => f.boardId));
  const boards = p.boards.filter((b) => withCircuit.has(b.id));
  return { here: boards.filter((b) => boardOnLevel(b, level)), others: boards.filter((b) => !boardOnLevel(b, level)) };
}

/** The board offered at first: for a board of the level copied from, the board at the same place in the other level's list; a board that is on neither level stands for itself. */
export function defaultBoard(p: Project, from: LevelRef, boardId: string, to: LevelRef): string | undefined {
  const mine = boardChoices(p, from).here, theirs = boardChoices(p, to);
  const at = mine.findIndex((b) => b.id === boardId);
  if (at >= 0) return theirs.here[at]?.id;
  return [...theirs.here, ...theirs.others].some((b) => b.id === boardId) ? boardId : undefined;
}

const nounOf = (types: PointType[], n: number): string =>
  types.every((t) => LIGHTING_POINTS.includes(t)) ? (n === 1 ? 'light' : 'lights') : types.every((t) => SOCKETS.includes(t)) ? (n === 1 ? 'socket' : 'sockets') : (n === 1 ? 'device' : 'devices');

/** The circuit of a board on the same way as another circuit (the reference of the way is the same and not empty). */
const partnerOf = (p: Project, boardId: string, f: Feeder): Feeder | undefined => {
  const way = circuitRef(f);
  return way ? finalCircuits(p).find((x) => x.boardId === boardId && circuitRef(x) === way) : undefined;
};

export function copyLvToLevels(p: Project, from: LevelRef, targets: CopyTarget[], what: { points: boolean; acc: boolean }, replace: boolean): LvCopyResult {
  const source = (p.lvPoints ?? []).filter((d) => onLevel(d, from));
  const sourceAcc = (p.cadAccessories ?? []).filter((d) => onLevel(d, from));
  const feederOf = (id: string | undefined) => p.feeders.find((x) => x.id === id);
  let cur = p;
  const levels: LvCopyLevel[] = [], notes: string[] = [];
  for (const t of targets) {
    if (t.level.building === from.building && t.level.level === from.level) continue;
    const row: LvCopyLevel = { label: t.label, points: 0, acc: 0, removed: 0, leftOut: 0 };
    if (replace) {
      if (what.points) for (const d of (cur.lvPoints ?? []).filter((x) => onLevel(x, t.level))) { cur = removeLvPoint(cur, d.id); row.removed++; }
      if (what.acc) for (const d of (cur.cadAccessories ?? []).filter((x) => onLevel(x, t.level))) { cur = removeAccessory(cur, d.id); row.removed++; }
    }
    if (what.points) {
      // Points grouped by the way they were on, in the order they first appear.
      const groups = new Map<string, { board: string; way: string; list: LvPoint[] }>();
      for (const d of source) {
        const f = feederOf(d.feederId);
        if (!f) continue;
        const way = circuitRef(f) ?? '', key = `${f.boardId}\u0000${way}`;
        if (!groups.has(key)) groups.set(key, { board: f.boardId, way, list: [] });
        groups.get(key)!.list.push(d);
      }
      const afterReplace = cur, said = new Set<string>();
      for (const g of groups.values()) {
        const to: string | undefined = t.boards[g.board], types = g.list.map((d) => d.type), noun = nounOf(types, g.list.length);
        if (!to) {
          row.leftOut += g.list.length;
          if (!said.has(g.board)) {
            said.add(g.board);
            const n = [...groups.values()].filter((x) => x.board === g.board).reduce((s, x) => s + x.list.length, 0);
            notes.push(`No board chosen for ${g.board}: ${n} ${nounOf([...groups.values()].filter((x) => x.board === g.board).flatMap((x) => x.list.map((d) => d.type)), n)} left out on ${t.label}`);
          }
          continue;
        }
        const partner = partnerOf(afterReplace, to, feederOf(g.list[0].feederId)!);
        if (!partner) { row.leftOut += g.list.length; notes.push(`${to} has no way ${g.way}: ${g.list.length} ${noun} left out on ${t.label}`); continue; }
        if (types.some((ty) => !suits(afterReplace.feeders.find((x) => x.id === partner.id)!, ty))) notes.push(`${to} ${g.way} carries other points: ${g.list.length} ${noun} added to it on ${t.label}`);
        for (const d of g.list) {
          cur = placeLvPoint(cur, t.level, d.type, partner.id, d.x, d.y, d.emergency, d.luminaire, d.rot, d.variant).project;
          row.points++;
        }
      }
    }
    if (what.acc) {
      for (const a of sourceAcc) {
        const f = feederOf(a.feederId), to = f && t.boards[f.boardId], partner = f && to ? partnerOf(cur, to, f) : undefined;
        cur = placeAccessory(cur, t.level, a.type, a.x, a.y, { ...(partner ? { feederId: partner.id } : {}), rot: a.rot }).project;
        row.acc++;
      }
    }
    levels.push(row);
  }
  return { project: cur, levels, notes };
}
