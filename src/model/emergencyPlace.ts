import { placeLvPoint } from './cadDevices';
import type { LevelRef } from './levels';
import type { EmergencyLayout } from '../calc/emergencyLighting';
import type { Project } from '../types';

/** Places a level's emergency layout (src/calc/emergencyLighting.ts) on one circuit: each fitting and sign is a
 * lighting point counted on the circuit, tagged so plans and sheets draw it with its emergency symbol. */
export function placeEmergency(p: Project, level: LevelRef, feederId: string, layout: EmergencyLayout): { project: Project; fittings: number; signs: number } {
  if (!p.feeders.some((f) => f.id === feederId)) throw new Error('Choose the circuit the emergency lights are on (an unswitched lighting circuit).');
  if (!layout.fittings.length && !layout.signs.length) throw new Error('Nothing to place: draw an escape route, or click a room for open-area lighting.');
  let next = p;
  for (const f of layout.fittings) next = placeLvPoint(next, level, 'ltg', feederId, f.at[0], f.at[1], 'fitting').project;
  for (const s of layout.signs) next = placeLvPoint(next, level, 'ltg', feederId, s.at[0], s.at[1], s.kind === 'exit' ? 'exit-sign' : 'direction-sign').project;
  return { project: next, fittings: layout.fittings.length, signs: layout.signs.length };
}
