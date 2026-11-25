import { buildingInfoOf } from '../calc/building';
import { pointMax, suits } from './circuitRoom';
import type { BuildingRoom, Feeder, Project } from '../types';

/** All rooms like this: which rooms one run of a room tool takes (this room, the rooms of its type on the level, or
 * every room of the level), and the lights of several rooms shared out over the lighting circuits. */
export type RoomScope = 'room' | 'type' | 'level';
/** The most rooms one run takes. */
export const ROOM_SCOPE_MAX = 40;

/** The rooms of the scope that have an outline, the room given first; `left`: those over the limit of a run. */
export function roomsInScope(p: Project, room: BuildingRoom, scope: RoomScope): { rooms: BuildingRoom[]; left: number } {
  const all = scope === 'room' ? [room] : [room, ...buildingInfoOf(p).rooms.filter((r) => r.id !== room.id && r.buildingId === room.buildingId && r.levelId === room.levelId && (scope === 'level' || r.type === room.type) && (r.outline?.length ?? 0) >= 3)];
  return { rooms: all.slice(0, ROOM_SCOPE_MAX), left: Math.max(0, all.length - ROOM_SCOPE_MAX) };
}

/** How many rooms each scope would take for this room (before the limit): for the buttons. */
export function scopeCounts(p: Project, room: BuildingRoom): Record<RoomScope, number> {
  const on = buildingInfoOf(p).rooms.filter((r) => r.id !== room.id && r.buildingId === room.buildingId && r.levelId === room.levelId && (r.outline?.length ?? 0) >= 3);
  return { room: 1, type: 1 + on.filter((r) => r.type === room.type).length, level: 1 + on.length };
}

export interface RoomLightRow { room: BuildingRoom; points: [number, number][]; lux: number; feederId?: string; /** Why it is left out. */ why?: string }
export interface RoomLightPlan { rows: RoomLightRow[]; lights: number; rooms: number; circuits: { feeder: Feeder; added: number; after: number }[] }

/** The lights of each room on one circuit: the circuit chosen while it has room for the whole room, then the next
 * lighting circuits with room (as nextWithRoom orders them). A room that fits on none is left out, with the reason. */
export function planRoomLights(circuits: Feeder[], startId: string, rooms: BuildingRoom[], lightsOf: (room: BuildingRoom) => { points: [number, number][]; lux: number } | undefined): RoomLightPlan {
  const max = pointMax('ltg') as number;
  const start = circuits.find((f) => f.id === startId);
  const counts = new Map(circuits.map((f) => [f.id, f.points?.ltg ?? 0]));
  const candidates: Feeder[] = [];
  if (start) {
    const at = circuits.indexOf(start);
    const open = circuits.filter((f) => f !== start && suits(f, 'ltg'));
    const same = open.filter((f) => f.boardId === start.boardId);
    candidates.push(start, ...same.filter((f) => circuits.indexOf(f) > at), ...same.filter((f) => circuits.indexOf(f) < at), ...open.filter((f) => f.boardId !== start.boardId));
  }
  const rows: RoomLightRow[] = [];
  const used: { feeder: Feeder; added: number; after: number }[] = [];
  for (const room of rooms) {
    const lit = lightsOf(room);
    const row: RoomLightRow = { room, points: lit?.points ?? [], lux: lit?.lux ?? 0 };
    rows.push(row);
    if (!start) row.why = 'choose the circuit first';
    else if (!lit) row.why = 'its lights cannot be worked out';
    else if (lit.points.length > max) row.why = 'needs more than one circuit: light it on its own';
    else {
      const f = candidates.find((c) => (counts.get(c.id) ?? 0) + lit.points.length <= max);
      if (!f) row.why = 'no lighting circuit with room';
      else {
        row.feederId = f.id;
        counts.set(f.id, (counts.get(f.id) ?? 0) + lit.points.length);
        let u = used.find((x) => x.feeder.id === f.id);
        if (!u) used.push((u = { feeder: f, added: 0, after: 0 }));
        u.added += lit.points.length;
        u.after = counts.get(f.id)!;
      }
    }
  }
  const got = rows.filter((r) => r.feederId);
  return { rows, lights: got.reduce((s, r) => s + r.points.length, 0), rooms: got.length, circuits: used };
}
