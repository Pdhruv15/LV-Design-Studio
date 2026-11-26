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

/** The most devices one Room devices run places over several rooms. */
export const ROOM_SET_MAX = 400;
export interface RoomSetRow { room: BuildingRoom; lights: number; sockets: number; elv: number; /** The lighting circuit of its lights. */ feederId?: string; /** Why it is left out. */ why?: string }
export interface RoomSetPlan { rows: RoomSetRow[]; rooms: number; lights: number; sockets: number; elv: number; devices: number; circuits: { feeder: Feeder; added: number; after: number }[] }

/** Room devices over several rooms: each room's lights on one lighting circuit (as planRoomLights), its sockets on the
 * power circuit; a room whose preview reached its own limit, that fits on no lighting circuit, or that would take the
 * run over ROOM_SET_MAX is left out, with the reason. */
export function planRoomSets(circuits: Feeder[], lightingId: string, rooms: BuildingRoom[], of: (room: BuildingRoom) => { lights: [number, number][]; sockets: number; elv: number; limited: boolean } | undefined, lv: boolean): RoomSetPlan {
  const got = new Map(rooms.map((r) => [r.id, of(r)]));
  const rows: RoomSetRow[] = rooms.map((room) => {
    const o = got.get(room.id);
    const row: RoomSetRow = { room, lights: lv ? o?.lights.length ?? 0 : 0, sockets: lv ? o?.sockets ?? 0 : 0, elv: o?.elv ?? 0 };
    if (!o) row.why = 'its devices cannot be worked out';
    else if (o.limited) row.why = 'over the limit of one room: divide it or place it by hand';
    return row;
  });
  // The lights of the rooms still kept on the lighting circuits; a room with no lights needs no circuit.
  let used: RoomSetPlan['circuits'] = [];
  const share = () => {
    used = [];
    if (!lv) return;
    const lit = rows.filter((r) => !r.why && r.lights > 0);
    for (const r of lit) delete r.feederId;
    const plan = planRoomLights(circuits, lightingId, lit.map((r) => r.room), (room) => ({ points: got.get(room.id)!.lights, lux: 0 }));
    plan.rows.forEach((p, i) => { lit[i].feederId = p.feederId; lit[i].why = p.why; });
    used = plan.circuits;
  };
  share();
  let total = 0, cut = false;
  for (const r of rows) {
    if (r.why) continue;
    const n = r.lights + r.sockets + r.elv;
    if (total + n > ROOM_SET_MAX) { r.why = `${ROOM_SET_MAX} devices a run`; delete r.feederId; cut = true; } else total += n;
  }
  if (cut) share();
  const kept = rows.filter((r) => !r.why);
  const sum = (k: 'lights' | 'sockets' | 'elv') => kept.reduce((s, r) => s + r[k], 0);
  return { rows, rooms: kept.length, lights: sum('lights'), sockets: sum('sockets'), elv: sum('elv'), devices: sum('lights') + sum('sockets') + sum('elv'), circuits: used };
}
