import type { Project } from '../types';
import { rmuRecord } from '../calc/hvSupply';
import { updateRmu } from './hvSupply';
import { newBoard, type DropResult } from './sldEdit';
import { nextRmus, rmuNames, txTag, withTransformer } from './transformers';
import { rmuChoices, txRmu } from './substations';

/** Start at the 11 kV side (proposal 2026-11-21, part 6): an RMU that feeds nothing yet is drawn with its tee-offs spare;
 * right-click → Add transformer and main board puts a new main board with a transformer on it. */

/** The kVA of the transformer a new main board gets; the Supply tab sets the real one. */
const NEW_KVA = 1000;

export interface RmuAddPlan {
  /** Why nothing can be added (the RMU is full and cannot grow, or it does not exist). */
  blocked?: string;
  /** The configuration the RMU becomes to take the transformer (RRT → RRTT, RRTT → RRTTT), when it is full. */
  grow?: string;
  title: string;
  lines: string[];
}

/** The project with the new main board (not on an RMU yet) and its id. */
function withNewBoard(project: Project) {
  const board = withTransformer(newBoard(project, 'MDB'), NEW_KVA, project.voltageV);
  const last = project.boards.reduce((at, b, i) => (b.upstreamId ? at : i), -1);
  const boards = [...project.boards.slice(0, last + 1), board, ...project.boards.slice(last + 1)];
  return { next: { ...project, boards }, id: board.id };
}

const known = (project: Project, rmu: string) => !!rmuRecord(project, rmu) || rmuNames(project).includes(rmu);

/** What "Add transformer and main board" on this RMU would do. */
export function rmuAddPlan(project: Project, rmu: string): RmuAddPlan {
  const name = rmu.trim();
  const title = `Add a transformer and main board on ${name}?`;
  if (!known(project, name)) return { blocked: `No RMU ${name}`, title, lines: [] };
  const { next, id } = withNewBoard(project);
  const r = txRmu(next, id, name);
  if (r.project === next) return { blocked: r.message, title, lines: [] };
  const grow = rmuChoices(next, id).find((c) => c.name === name)?.grow;
  const config = rmuRecord(project, name)?.config?.trim().toUpperCase();
  const ss = r.project.boards.find((b) => b.id === id)?.substation;
  return {
    ...(grow ? { grow } : {}), title,
    lines: [
      ...(grow ? [`${name} is full (${config}): it becomes ${grow}.`] : []),
      `A new main board ${id} gets a ${NEW_KVA} kVA transformer on ${name}.`,
      ...(ss ? [`It is put in ${ss}, the substation of ${name}.`] : [])
    ]
  };
}

/** A new main board with a 1000 kVA transformer on this RMU (one undo step). */
export function addTransformerOnRmu(project: Project, rmu: string): DropResult {
  const name = rmu.trim();
  const plan = rmuAddPlan(project, name);
  if (plan.blocked) return { project, message: plan.blocked };
  const { next, id } = withNewBoard(project);
  const r = txRmu(next, id, name);
  const grew = rmuRecord(r.project, name)?.config !== rmuRecord(project, name)?.config;
  const ss = r.project.boards.find((b) => b.id === id)?.substation;
  const said = `Added ${txTag(r.project, id) ?? 'a transformer'} (${NEW_KVA} kVA) with ${id} on ${name}`
    + (grew ? ` · ${name} is now ${rmuRecord(r.project, name)?.config}` : '') + (ss ? ` · in ${ss}` : '');
  return { project: r.project, select: { type: 'board', id }, message: `${said} — set kVA and impedance on the Supply tab` };
}

/** A new RMU record (RRT, feeding nothing yet), on the first grid source; in `substation` when given. */
export function addRmu(project: Project, substation?: string): DropResult {
  const name = nextRmus(project, 1)[0];
  const ss = substation?.trim();
  return { project: updateRmu(project, name, { config: 'RRT', ...(ss ? { substation: ss } : {}) }), message: `Added ${name} (RRT, no transformer yet): right-click it → Add transformer and main board` };
}
