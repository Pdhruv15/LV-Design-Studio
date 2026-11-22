import { selectCable } from '../calc/electrical';
import { applyRecommendation, recommend } from '../calc/sizing';
import { supplyNameSuggestion } from './designReference';
import type { Board, BoardKind, Feeder, Project } from '../types';
import { below } from './moveBoard';

/** Adding a panel with a chosen id: the core of the add_panel tool (headless/editTools.ts) and of Push to load schedule (sheets). */

/** Board ratings for a new panel, A, as the diagram palette gives them (src/model/sldEdit.ts). */
export const BOARD_RATING: Record<BoardKind, number> = { MC: 400, 'LV-ACB': 1600, MDB: 1600, 'LV-MDB': 1600, SMDB: 250, ESMDB: 250, DB: 63, EDB: 63, MCC: 400, EMCC: 400, EMDB: 250, 'LV-EMDB': 800, FP: 250, UPS: 32 };

export interface NewPanel { name?: string; ratedA?: number; lengthM?: number; location?: string; transformerKva?: number; impedancePct?: number }

const taken = (p: Project) => new Set([...p.boards.map((b) => b.id), ...p.feeders.map((f) => f.id)]);
const uniqueId = (p: Project, base: string) => { const t = taken(p); for (let n = 1; ; n++) if (!t.has(`${base}-${n}`)) return `${base}-${n}`; };

/** The name of a new first board's supply: only when the project applied a design reference. */
const fedFromOf = (p: Project) => { const n = supplyNameSuggestion(p); return n ? { fedFrom: n } : {}; };

/** The project with the panel, and the panel and its incomer feeder. Under a parent the incomer is a feeder on the parent with its
 * breaker at the panel's rating and a cable sized by the app; without one the panel is a main board with its own supply.
 * Throws when the id is empty or taken, or the parent is not in the project. */
export function buildPanel(p: Project, id: string, kind: BoardKind, parentId?: string, a: NewPanel = {}): { project: Project; board: Board; incomer?: Feeder } {
  if (!id.trim()) throw new Error('The id is empty.');
  if (taken(p).has(id)) throw new Error(`${id} already exists in the project.`);
  const parent = parentId ? p.boards.find((b) => b.id === parentId) : undefined;
  if (parentId && !parent) throw new Error(`${parentId} is not in the project.`);
  const board: Board = {
    id, name: a.name ?? id, kind, ratedCurrentA: a.ratedA ?? BOARD_RATING[kind],
    ...(parent ? { upstreamId: parent.id } : { supply: { ...fedFromOf(p) } }),
    ...(a.location ? { location: a.location } : {}),
    ...(a.transformerKva !== undefined ? { sourceKva: a.transformerKva, sourceImpedancePct: a.impedancePct } : {})
  };
  if (!parent) return { project: { ...p, boards: [...p.boards, board] }, board };
  return { ...addIncomer({ ...p, boards: [...p.boards, board] }, board, parent, a.lengthM ?? 30), board };
}

/** The incomer feeder of a panel that is in the project, on its parent: breaker at the panel's rating, cable sized by the app. */
function addIncomer(p: Project, board: Board, parent: Board, lengthM: number): { project: Project; incomer: Feeder } {
  const id = board.id, rating = board.ratedCurrentA!;
  const inc0: Feeder = {
    id: taken(p).has(`INC-${id}`) ? uniqueId(p, `INC-${id}`) : `INC-${id}`, boardId: parent.id, feedsBoardId: id, name: `Incomer to ${board.name}`,
    loadKw: 0, demandFactor: 1, powerFactor: 0.85, lengthM, cores: 4, breakerRatingA: rating, breakerIcuKa: 36,
    cableCsaMm2: selectCable(rating, lengthM, p.voltageV, 4, 0.85, p.ambientC, 100, rating) ?? 300,
    breakerType: rating > 1600 ? 'ACB' : rating > 63 ? 'MCCB' : 'C'
  };
  const withBoard = { ...p, feeders: [...p.feeders, inc0] };
  const incomer = applyRecommendation(inc0, recommend(withBoard, inc0, 'fix'));
  return { project: { ...withBoard, feeders: withBoard.feeders.map((f) => (f.id === incomer.id ? incomer : f)) }, incomer };
}

/** An existing main board with no board above it becomes fed from `parentId`: its supply goes, its incomer feeder is added on the
 * parent as buildPanel makes one. Throws when either is not in the project, the board has an upstream or a source of its own, or
 * the parent is the board or below it. */
export function connectPanel(p: Project, id: string, parentId: string, a: { ratedA?: number; lengthM?: number } = {}): Project {
  const board = p.boards.find((b) => b.id === id), parent = p.boards.find((b) => b.id === parentId);
  if (!board) throw new Error(`${id} is not in the project.`);
  if (!parent) throw new Error(`${parentId} is not in the project.`);
  if (board.upstreamId) throw new Error(`${id} is already fed from ${board.upstreamId}.`);
  if (board.sourceKva !== undefined) throw new Error(`${id} has its own supply.`);
  if (id === parentId || below(p, id).has(parentId)) throw new Error(`${parentId} is ${id} or below it.`);
  const { supply: _s, ...rest } = board;
  const next: Board = { ...rest, upstreamId: parent.id, ratedCurrentA: a.ratedA ?? board.ratedCurrentA ?? BOARD_RATING[board.kind ?? 'SMDB'] };
  return addIncomer({ ...p, boards: p.boards.map((b) => (b.id === id ? next : b)) }, next, parent, a.lengthM ?? 30).project;
}

const PREFIXES: [string, BoardKind][] = ([['LV-EMDB', 'LV-EMDB'], ['LVEMDB', 'LV-EMDB'], ['LV-MDB', 'LV-MDB'], ['LVMDB', 'LV-MDB'], ['LV-ACB', 'LV-ACB'], ['ESMDB', 'ESMDB'], ['EMDB', 'EMDB'], ['EMCC', 'EMCC'], ['SMDB', 'SMDB'], ['EDB', 'EDB'], ['MDB', 'MDB'], ['MCC', 'MCC'], ['UPS', 'UPS'], ['DB', 'DB'], ['FP', 'FP'], ['MC', 'MC']] as [string, BoardKind][])
  .sort((x, y) => y[0].length - x[0].length);
/** The names a panel number starts with, longest first. */
export const PANEL_PREFIXES = PREFIXES.map(([x]) => x);

/** The kind a panel number's start says (SMDB-1, DB-GF, mcc2), or undefined: the prefix must not be followed by a letter, so
 * MCCB-2 and DEWA are not panels. */
export function panelKindOf(id: string): BoardKind | undefined {
  const u = id.trim().toUpperCase();
  return PREFIXES.find(([x]) => u.startsWith(x) && !/[A-Z]/.test(u[x.length] ?? ''))?.[1];
}

/** A panel with exactly this id (and the id as its name) of this kind, under a parent panel or as a new supply. */
export const addPanel = (project: Project, id: string, kind: BoardKind, parentId?: string): Project => buildPanel(project, id, kind, parentId).project;
