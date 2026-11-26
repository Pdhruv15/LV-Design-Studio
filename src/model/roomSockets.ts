import { buildingInfoOf } from '../calc/building';
import { placeLvPoint, removeLvPoint, rightAngle, type PointVariant } from './cadDevices';
import { inside } from './cadMeasure';
import { pointMax, suits } from './circuitRoom';
import type { LevelRef } from './levels';
import type { Feeder, PointType, Project } from '../types';

/** Socket room (SOCK): sockets along the walls of a room at a spacing, each turned to face into the room. */
export interface WallSocket { key: string; wall: number; at: [number, number]; /** As LvPoint.rot. */ rot: number }
export interface SocketLayout { sockets: WallSocket[]; /** Every position before any is taken off. */ all: WallSocket[]; wallsM: number; usedM: number }

type Pt = [number, number];
const round2 = (v: number) => Math.round(v * 100) / 100;
/** The shortest wall that takes a socket, and how far a socket stands inside its wall (metres). */
const MIN_WALL_M = 0.6, INSET_M = 0.05;
/** The socket types of Socket room: the ones taken off first when a room's sockets are replaced. */
export const SOCKET_TYPES: PointType[] = ['s13', 's13t', 's15'];

/** Sockets along the walls of the outline. Wall i runs from outline[i] to the next corner. The plan symbol `socket`
 * has its flat bar facing the room and its stem (to the wall) down its own y axis, so turned by `rot` the bar faces
 * along (-sin rot, cos rot), which is made the inward normal of the wall. */
export function socketLayout(outline: Pt[], o: { spacingM: number; skip: number[]; off: string[] }): SocketLayout {
  const all: WallSocket[] = [];
  let wallsM = 0, usedM = 0;
  const spacing = o.spacingM > 0 ? o.spacingM : 3;
  outline.forEach((a, i) => {
    const b = outline[(i + 1) % outline.length];
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
    wallsM += len;
    if (o.skip.includes(i)) return;
    usedM += len;
    if (len < MIN_WALL_M) return;
    const n = Math.max(1, Math.round(len / spacing));
    for (let k = 0; k < n; k += 1) {
      const t = ((k + 0.5) * len) / n, px = a[0] + (dx / len) * t, py = a[1] + (dy / len) * t;
      // The side of the wall that is in the room.
      let nx = -dy / len, ny = dx / len;
      if (!inside([px + nx * INSET_M, py + ny * INSET_M], outline)) { nx = -nx; ny = -ny; }
      const rot = rightAngle((Math.atan2(ny, nx) * 180) / Math.PI - 90);
      all.push({ key: `${i}:${k}`, wall: i, at: [round2(px + nx * INSET_M), round2(py + ny * INSET_M)], rot });
    }
  });
  return { sockets: all.filter((s) => !o.off.includes(s.key)), all, wallsM, usedM };
}

/** The wall of the outline nearest a point, within `withinM`. */
export function wallNear(outline: Pt[], at: Pt, withinM: number): number | undefined {
  let best: number | undefined, bestD = withinM;
  outline.forEach((a, i) => {
    const b = outline[(i + 1) % outline.length];
    const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((at[0] - a[0]) * dx + (at[1] - a[1]) * dy) / l2)) : 0;
    const d = Math.hypot(at[0] - (a[0] + t * dx), at[1] - (a[1] + t * dy));
    if (d <= bestD) { best = i; bestD = d; }
  });
  return best;
}

export interface SocketShare { rows: { feeder: Feeder; keys: string[]; after: number }[]; /** Sockets with no circuit with room. */ left: string[] }

/** The sockets on the circuit chosen, going on to the next circuit with room at the most the Rules sheet allows. The
 * circuits are tried as Light room tries them: the same board after the circuit chosen, then before, then other boards. */
export function shareSockets(circuits: Feeder[], startId: string, type: PointType, keys: string[]): SocketShare {
  const start = circuits.find((f) => f.id === startId);
  if (!start) return { rows: [], left: [...keys] };
  const max = pointMax(type), have = (f: Feeder) => f.points?.[type] ?? 0;
  if (max === undefined) return { rows: keys.length ? [{ feeder: start, keys: [...keys], after: have(start) + keys.length }] : [], left: [] };
  const at = circuits.indexOf(start);
  const open = circuits.filter((f) => f !== start && suits(f, type));
  const same = open.filter((f) => f.boardId === start.boardId);
  const candidates = [start, ...same.filter((f) => circuits.indexOf(f) > at), ...same.filter((f) => circuits.indexOf(f) < at), ...open.filter((f) => f.boardId !== start.boardId)];
  const rows: SocketShare['rows'] = [];
  let rest = [...keys];
  for (const f of candidates) {
    if (!rest.length) break;
    const room = max - have(f);
    if (room <= 0) continue;
    const take = rest.slice(0, room);
    rest = rest.slice(take.length);
    rows.push({ feeder: f, keys: take, after: have(f) + take.length });
  }
  return { rows, left: rest };
}

/** The room on the level with its outline, or an error as Light room gives it. */
function roomOnLevel(p: Project, level: LevelRef, roomId: string) {
  const room = buildingInfoOf(p).rooms.find((r) => r.id === roomId);
  if (!room?.outline || room.outline.length < 3) throw new Error('The room has no outline on the plan: pick or trace it first.');
  if (room.buildingId !== level.building || room.levelId !== level.level) throw new Error(`Room ${room.name} is not on this level.`);
  return room as typeof room & { outline: Pt[] };
}

/** The socket points of the room's level that stand inside its outline. */
const socketsIn = (p: Project, level: LevelRef, outline: Pt[]) =>
  (p.lvPoints ?? []).filter((d) => SOCKET_TYPES.includes(d.type) && d.buildingId === level.building && d.levelId === level.level && inside([d.x, d.y], outline));

/** The circuits as they stand once the sockets of the room are taken off: what Replace leaves room for. */
export function circuitsWithoutRoomSockets(p: Project, level: LevelRef, roomId: string, circuits: Feeder[]): Feeder[] {
  const room = roomOnLevel(p, level, roomId);
  const gone = socketsIn(p, level, room.outline);
  return circuits.map((f) => {
    const mine = gone.filter((d) => d.feederId === f.id);
    if (!mine.length) return f;
    const points = { ...(f.points ?? {}) };
    for (const d of mine) points[d.type] = Math.max(0, (points[d.type] ?? 0) - 1);
    return { ...f, points };
  });
}

/** Places the layout as points of `type` on their circuits; `replace` first takes off the socket points already in the room. */
export function placeRoomSockets(p: Project, level: LevelRef, roomId: string, type: PointType, variant: PointVariant | undefined, layout: WallSocket[], share: SocketShare, replace: boolean): { project: Project; ids: string[]; removed: number } {
  const room = roomOnLevel(p, level, roomId);
  if (share.rows.some((r) => !p.feeders.some((f) => f.id === r.feeder.id))) throw new Error('Choose the circuit the sockets are on.');
  let next = p, removed = 0;
  if (replace) {
    const old = socketsIn(p, level, room.outline);
    for (const d of old) next = removeLvPoint(next, d.id);
    removed = old.length;
  }
  const ids: string[] = [];
  for (const row of share.rows) {
    for (const key of row.keys) {
      const s = layout.find((x) => x.key === key);
      if (!s) continue;
      const r = placeLvPoint(next, level, type, row.feeder.id, s.at[0], s.at[1], undefined, undefined, s.rot, variant);
      next = r.project;
      ids.push(r.id);
    }
  }
  return { project: next, ids, removed };
}
