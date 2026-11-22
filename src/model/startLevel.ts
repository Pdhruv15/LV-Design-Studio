import type { Project, Board } from '../types';
import { setFedFrom } from './supplyEdit';
import { applyDrop } from './sldEdit';
import { addRmuTo, addSubstation, txRmu } from './substations';
import { addGridSource } from './hvSupply';
import { withUids } from './stableIds';

/** Where the SLD of a new project starts: one board of this level (the rest is added afterwards). */
export type StartLevel = 'db' | 'submain' | 'source' | 'transformer' | 'rmu' | 'ring';
export interface StartChoice { level: StartLevel; transformers?: 1 | 2 }   // transformers only read for 'rmu'
export const DEFAULT_START: StartChoice = { level: 'transformer' };

export const START_LEVELS: { id: StartLevel; title: string; note: string }[] = [
  { id: 'db', title: 'Final DB', note: 'One DB and its circuits. Fed from a board outside the project.' },
  { id: 'submain', title: 'Sub-main board', note: 'An SMDB with the DBs below it. Fed from a board outside the project.' },
  { id: 'source', title: 'Main board, LV source', note: 'Utility LV supply, feeder pillar or own generation.' },
  { id: 'transformer', title: 'Transformer and main board', note: 'One transformer and its main board. The default.' },
  { id: 'rmu', title: 'RMU and one or two transformers', note: 'One RMU feeding one transformer (RRT) or two (RRTT).' },
  { id: 'ring', title: '11 kV ring, two substations', note: 'Grid source, two RMUs and two transformers. More are added afterwards.' }
];

/** The 11 kV starts open the MV supply and RMUs card after the project is made. */
export const startOpensMv = (c: StartChoice) => c.level === 'rmu' || c.level === 'ring';

/** One line for the Review step. */
export function startLevelText(c: StartChoice): string {
  if (c.level === 'rmu') return c.transformers === 2 ? 'RMU and two transformers, bus coupler normally open' : 'RMU and one transformer';
  return START_LEVELS.find((l) => l.id === c.level)?.title ?? '';
}

/** A second main board, a copy of the first with its own id (and uid, which withUids makes). */
function twin(b: Board): Board {
  const { uid: _u, ...rest } = b;
  return { ...rest, id: 'MDB-2', name: 'Main Distribution Board 2' };
}

/** A fresh project (one transformer-fed MDB-1, no feeders) set up for the chosen start; any other project is returned as it is. */
export function applyStartLevel(project: Project, choice: StartChoice): Project {
  if (project.boards.length !== 1 || project.feeders.length || choice.level === 'transformer') return project;
  const first = project.boards[0];
  switch (choice.level) {
    case 'source': return withUids({ ...project, boards: [setFedFrom(project, first, 'source')] });
    case 'submain':
    case 'db': {
      const made = applyDrop({ ...project, boards: [] }, { kind: 'board', board: choice.level === 'db' ? 'DB' : 'SMDB' }, { type: 'canvas' }).project;
      return withUids({ ...made, boards: made.boards.map((b) => { const { uid: _u, ...rest } = b; return rest; }) });
    }
    case 'rmu': {
      if (choice.transformers !== 2) return withUids(txRmu(project, first.id, '+').project);
      const one = { ...first, name: 'Main Distribution Board 1' };
      let p: Project = { ...project, boards: [one, twin(one)] };
      p = txRmu(p, 'MDB-1', '+').project;
      const rmu = p.boards[0].rmu ?? 'RMU-1';
      p = txRmu(p, 'MDB-2', rmu).project;
      const ratingA = Math.min(...p.boards.map((b) => b.ratedCurrentA ?? 0));
      return withUids({ ...p, ties: [...(p.ties ?? []), { id: 'BC-MDB-1-MDB-2', a: 'MDB-1', b: 'MDB-2', ratingA }] });
    }
    case 'ring': {
      const one = { ...first, name: 'Main Distribution Board 1' };
      let p: Project = addGridSource({ ...project, boards: [one, twin(one)] });
      for (const id of ['MDB-1', 'MDB-2']) {
        const ss = addSubstation(p); p = ss.project;
        const rmu = addRmuTo(p, ss.name); p = rmu.project;
        p = txRmu(p, id, rmu.name).project;
      }
      return withUids(p);
    }
  }
}
