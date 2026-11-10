import { buildingInfoOf } from '../calc/building';
import { placeLvPoint, removeLvPoint, type PointLuminaire } from './cadDevices';
import { inside } from './cadMeasure';
import type { LevelRef } from './levels';
import type { Project } from '../types';

/** Placing a room's lighting layout (src/calc/roomLighting.ts) as light points on one circuit. With `replace`, the
 * lights already inside the room's outline on that level are taken off first (from whichever circuit they are on), so
 * running it again after a change does not double the room. */
export function placeRoomLights(p: Project, level: LevelRef, roomId: string, feederId: string, points: [number, number][], replace = false, luminaire?: PointLuminaire): { project: Project; ids: string[]; removed: number } {
  const room = buildingInfoOf(p).rooms.find((r) => r.id === roomId);
  if (!room?.outline || room.outline.length < 3) throw new Error('The room has no outline on the plan: pick or trace it first.');
  if (room.buildingId !== level.building || room.levelId !== level.level) throw new Error(`Room ${room.name} is not on this level.`);
  if (!p.feeders.some((f) => f.id === feederId)) throw new Error('Choose the circuit the lights are on.');
  let next = p, removed = 0;
  if (replace) {
    const old = (p.lvPoints ?? []).filter((d) => d.type === 'ltg' && d.buildingId === level.building && d.levelId === level.level && inside([d.x, d.y], room.outline!));
    for (const d of old) next = removeLvPoint(next, d.id);
    removed = old.length;
  }
  const ids: string[] = [];
  for (const [x, y] of points) {
    const r = placeLvPoint(next, level, 'ltg', feederId, x, y, undefined, luminaire);
    next = r.project;
    ids.push(r.id);
  }
  return { project: next, ids, removed };
}
