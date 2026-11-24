import { elcbGroups, isScheduleCircuit, scheduleCircuits, type ElcbGroup } from '../calc/loadSchedule';
import type { BoardElcb, Project } from '../types';
import { balancePhases, refreshBoard } from './schedule';
import { isDbBoard } from './spareWays';

/** ELCBs (RCCBs) over whole ways of a DB, and 1-phase RCBOs in place of a circuit's MCB. Every ELCB is a device of its
 * own: resizing, editing, placing or removing one, or changing the "New ELCBs" size, first fixes the ELCBs the schedule
 * shows (fixElcbs), so no other ELCB moves; only Re-group all ELCBs cuts the whole DB again. A circuit has either an ELCB
 * or an RCBO, never both: an RCBO circuit leaves the ELCB of its ways. After each change the board's circuits are sized
 * again, because the earth-fault check (and so the MCB and wire) reads the earth leakage protection. */

/** ELCB sizes in circuits (1 to 4 ways); 0 is no ELCB. */
export const ELCB_SIZES = [3, 6, 9, 12] as const;
export type ElcbSize = 0 | (typeof ELCB_SIZES)[number];

export interface ElcbResult { project: Project; id: string; message: string }

const waysText = (a: number, b: number) => (a === b ? `way ${a}` : `ways ${a}–${b}`);

function boardOf(project: Project, boardId: string) {
  const board = project.boards.find((b) => b.id === boardId);
  if (!board) throw new Error(`${boardId} is no longer in the project`);
  if (!isDbBoard(board)) throw new Error(`${boardId} has no load schedule of final circuits`);
  return board;
}

/** Why these ways cannot hold an ELCB: not whole numbers from 1, in order. Undefined when they are fine (ELCBs already
 * over some of them give those ways up). */
export function elcbWaysProblem(e: Pick<BoardElcb, 'fromWay' | 'toWay'>): string | undefined {
  if (!Number.isInteger(e.fromWay) || !Number.isInteger(e.toWay) || e.fromWay < 1 || e.toWay < e.fromWay) return 'Give whole way numbers, from 1, with the first way not after the last';
  return undefined;
}

function checkWays(e: Pick<BoardElcb, 'fromWay' | 'toWay'>) {
  const why = elcbWaysProblem(e);
  if (why) throw new Error(why);
}

const nextId = (list: BoardElcb[]) => {
  let n = list.length + 1;
  while (list.some((x) => x.id === `elcb${n}`)) n++;
  return `elcb${n}`;
};
const byWay = (a: BoardElcb, b: BoardElcb) => a.fromWay - b.fromWay;
const covers = (way: number) => (x: BoardElcb) => x.fromWay <= way && way <= x.toWay;

/** The list with ways a–b taken from every ELCB but `keep`: one inside them goes, one across them is split in two (both
 * parts keep its settings), one over an end is cut short. */
function carve(list: BoardElcb[], a: number, b: number, keep?: string): BoardElcb[] {
  const out: BoardElcb[] = [];
  for (const x of list) {
    if (x.id === keep || x.toWay < a || x.fromWay > b) {
      out.push(x);
      continue;
    }
    if (x.fromWay < a) out.push({ ...x, toWay: a - 1 });
    if (x.toWay > b) out.push({ ...x, id: x.fromWay < a ? nextId([...list, ...out]) : x.id, fromWay: b + 1 });
  }
  return out;
}

/** Whether ways a–b hold something an ELCB protects: a circuit that is not an RCBO, or a spare breaker. */
function holds(project: Project, boardId: string, a: number, b: number): boolean {
  const inWays = (w?: number) => !!w && w >= a && w <= b;
  return scheduleCircuits(project, boardId).some((f) => !f.rcbo && inWays(f.way))
    || !!project.boards.find((x) => x.id === boardId)?.spareWays?.some((sp) => sp.kind === 'spare' && inWays(sp.way));
}

/** Every ELCB the schedule shows becomes one of the board's own over the ways it has now, with rating, mA and poles left
 * Auto: nothing on the schedule or its prints changes. Afterwards the "New ELCBs" size reaches only ways with no ELCB. */
export function fixElcbs(project: Project, boardId: string): Project {
  const board = boardOf(project, boardId);
  const auto = elcbGroups(project, board).filter((g) => !g.byHand);
  if (!auto.length) return project;
  const list = [...(board.elcbs ?? [])];
  for (const g of auto) list.push({ id: nextId(list), fromWay: g.ways[0], toWay: g.ways[g.ways.length - 1] });
  return { ...project, boards: project.boards.map((b) => (b.id === boardId ? { ...b, elcbs: list.sort(byWay) } : b)) };
}

const withElcbs = (project: Project, boardId: string, list: BoardElcb[]): Project =>
  refreshBoard({ ...project, boards: project.boards.map((b) => (b.id === boardId ? { ...b, elcbs: list.length ? list : undefined } : b)) }, boardId);

const clean = (e: Partial<BoardElcb>): Partial<BoardElcb> => {
  const o = { ...e };
  for (const k of Object.keys(o) as (keyof BoardElcb)[]) if (o[k] === undefined) delete o[k];
  return o;
};

/** The ELCB's number on the schedule (ELCB-n) after a change, for the message. */
function numberOf(project: Project, boardId: string, id: string): { n: number; label: string } | undefined {
  const board = project.boards.find((b) => b.id === boardId)!;
  const g = elcbGroups(project, board).find((x) => x.byHand?.id === id);
  return g && { n: g.index, label: g.label };
}

/** A new ELCB over ways: the ELCBs already there give those ways up, and no other ELCB moves. */
export function addBoardElcb(project: Project, boardId: string, e: Omit<BoardElcb, 'id'>): ElcbResult {
  boardOf(project, boardId);
  checkWays(e);
  const fixed = fixElcbs(project, boardId);
  const list = carve(boardOf(fixed, boardId).elcbs ?? [], e.fromWay, e.toWay);
  const id = nextId(list);
  const next = withElcbs(fixed, boardId, [...list, { ...clean(e), id } as BoardElcb].sort(byWay));
  const g = numberOf(next, boardId, id);
  return { project: next, id, message: `ELCB-${g?.n ?? ''} ${g?.label ?? ''} placed over ${waysText(e.fromWay, e.toWay)}`.replace(/\s+placed/, ' placed') };
}

export function updateBoardElcb(project: Project, boardId: string, id: string, patch: Partial<Omit<BoardElcb, 'id'>>): ElcbResult {
  const board = boardOf(project, boardId);
  const list = board.elcbs ?? [];
  const cur = list.find((x) => x.id === id);
  if (!cur) throw new Error('That ELCB is no longer on the board');
  const merged: BoardElcb = { ...cur, ...patch };
  for (const k of Object.keys(patch) as (keyof BoardElcb)[]) if (patch[k as keyof typeof patch] === undefined) delete merged[k];
  checkWays(merged);
  // Other ELCBs give up the ways it now takes; ways it gives up get an ELCB of their own when they hold something.
  let rest = carve(list.map((x) => (x.id === id ? merged : x)), merged.fromWay, merged.toWay, id);
  for (const [a, b] of [[cur.fromWay, Math.min(cur.toWay, merged.fromWay - 1)], [Math.max(cur.fromWay, merged.toWay + 1), cur.toWay]]) {
    if (a <= b && holds(project, boardId, a, b)) rest = [...rest, { id: nextId(rest), fromWay: a, toWay: b }];
  }
  const next = withElcbs(project, boardId, rest.sort(byWay));
  const g = numberOf(next, boardId, id);
  return { project: next, id, message: `ELCB-${g?.n ?? ''} ${g?.label ?? ''} over ${waysText(merged.fromWay, merged.toWay)}`.replace(/\s+over/, ' over') };
}

export function removeBoardElcb(project: Project, boardId: string, id: string): Project {
  const board = boardOf(project, boardId);
  return withElcbs(project, boardId, (board.elcbs ?? []).filter((x) => x.id !== id));
}

/** The id of the ELCB over `way` once the board's ELCBs are fixed, with that project. */
function fixedAt(project: Project, boardId: string, way: number): { project: Project; id: string } {
  boardOf(project, boardId);
  const fixed = fixElcbs(project, boardId);
  const e = (boardOf(fixed, boardId).elcbs ?? []).find(covers(way));
  if (!e) throw new Error(`Way ${way} has no ELCB`);
  return { project: fixed, id: e.id };
}

/** Changes the ELCB over `way` (an automatic one becomes the board's own first): its ways, poles, rating or mA. */
export function editElcbAt(project: Project, boardId: string, way: number, patch: Partial<Omit<BoardElcb, 'id'>>): ElcbResult {
  const at = fixedAt(project, boardId, way);
  return updateBoardElcb(at.project, boardId, at.id, patch);
}

/** Makes the ELCB over `way` cover 3, 6, 9 or 12 circuits from its first way. Bigger takes the next ways from the ELCBs
 * there (one left with no ways goes); smaller gives the ways it frees an ELCB of their own. No other ELCB moves. */
export function resizeElcb(project: Project, boardId: string, way: number, circuits: number): ElcbResult {
  if (!(ELCB_SIZES as readonly number[]).includes(circuits)) throw new Error('An ELCB covers 3, 6, 9 or 12 circuits (1 to 4 ways)');
  const at = fixedAt(project, boardId, way);
  const e = boardOf(at.project, boardId).elcbs!.find((x) => x.id === at.id)!;
  const toWay = e.fromWay + circuits / 3 - 1;
  if (toWay === e.toWay) return { project, id: e.id, message: `ELCB-${numberOf(at.project, boardId, e.id)?.n ?? ''} already covers ${circuits} circuits` };
  const r = updateBoardElcb(at.project, boardId, e.id, { toWay });
  return { ...r, message: `${r.message} (${circuits} circuits)` };
}

/** Takes the ELCB over `way` off: its ways get ELCBs of the "New ELCBs" size (none with No ELCB). */
export function removeElcbAt(project: Project, boardId: string, way: number): Project {
  const at = fixedAt(project, boardId, way);
  return removeBoardElcb(at.project, boardId, at.id);
}

/** The schedule's group for an ELCB as a dialog has it (ways and poles; rating and mA Auto), for its Auto values: `at` is
 * a way of the ELCB being changed, none for a new one. Undefined when the ways are not valid. */
export function elcbPreview(project: Project, boardId: string, e: Pick<BoardElcb, 'fromWay' | 'toWay' | 'poles'>, at?: number): ElcbGroup | undefined {
  if (elcbWaysProblem(e)) return undefined;
  const fixed = fixElcbs(project, boardId);
  const list = boardOf(fixed, boardId).elcbs ?? [];
  const id = (at !== undefined && list.find(covers(at))?.id) || 'new';
  const elcbs = [...carve(list.filter((x) => x.id !== id), e.fromWay, e.toWay), { ...e, id }].sort(byWay);
  const next = { ...fixed, boards: fixed.boards.map((b) => (b.id === boardId ? { ...b, elcbs } : b)) };
  return elcbGroups(next, boardOf(next, boardId)).find((g) => g.byHand?.id === id);
}

/** Sets the "New ELCBs" size: the ELCBs already on the DB keep their ways; only ways with no ELCB take the new size. */
export function setNewElcbSize(project: Project, boardId: string, size: ElcbSize): Project {
  boardOf(project, boardId);
  const fixed = fixElcbs(project, boardId);
  return refreshBoard({ ...fixed, boards: fixed.boards.map((b) => (b.id === boardId ? { ...b, elcbGroupSize: size } : b)) }, boardId);
}

export interface RegroupOptions { size: ElcbSize; keepApart: boolean; keepRcbos: boolean }

/** Re-group all ELCBs: the DB is cut again into ELCBs of `size` circuits (none for 0), its own ELCBs go, and so do its
 * RCBOs unless kept. keepApart moves circuits so lighting and power start on ELCBs of their own (renumbering them);
 * without it no circuit moves. */
export function regroupElcbs(project: Project, boardId: string, o: RegroupOptions): Project {
  boardOf(project, boardId);
  const sized = { ...project, boards: project.boards.map((b) => (b.id === boardId ? { ...b, elcbGroupSize: o.size } : b)) };
  let p = o.keepRcbos ? withElcbs(sized, boardId, []) : allAutomatic(sized, boardId);
  if (o.keepApart && o.size && scheduleCircuits(p, boardId).length >= 2) p = refreshBoard(balancePhases(p, boardId), boardId);
  return p;
}

/** What Re-group would do, for its dialog: circuits per ELCB now and after, and how many circuits change reference. */
export function regroupPreview(project: Project, boardId: string, o: RegroupOptions): { before: number[]; after: number[]; moved: number } {
  const sizes = (p: Project) => elcbGroups(p, boardOf(p, boardId)).map((g) => g.ways.length * 3);
  const next = regroupElcbs(project, boardId, o);
  const moved = next.feeders.length !== project.feeders.length ? 0
    : project.feeders.filter((f, i) => f.boardId === boardId && isScheduleCircuit(f) && (next.feeders[i].phase !== f.phase || next.feeders[i].way !== f.way)).length;
  return { before: sizes(project), after: sizes(next), moved };
}

/** Makes a 1-phase circuit's breaker an RCBO (on), IΔn as given or Auto, or an MCB again (off). */
export function setRcbo(project: Project, feederId: string, on: boolean, rcdMa?: number): Project {
  const f = project.feeders.find((x) => x.id === feederId);
  if (!f || !isScheduleCircuit(f)) throw new Error('That circuit is no longer on a load schedule');
  if (on && f.phase === 'RYB') throw new Error('An RCBO is for 1-phase circuits; use an ELCB for a 3-phase circuit');
  const next = { ...f };
  if (on) {
    next.rcbo = true;
    if (rcdMa) next.rcdMa = rcdMa;
    else delete next.rcdMa;
  } else {
    delete next.rcbo;
    delete next.rcdMa;
  }
  return refreshBoard({ ...project, feeders: project.feeders.map((x) => (x.id === feederId ? next : x)) }, f.boardId);
}

/** Back to the board's automatic grouping: no ELCBs of its own and no RCBOs. */
export function allAutomatic(project: Project, boardId: string): Project {
  boardOf(project, boardId);
  const rcbos = new Set(scheduleCircuits(project, boardId).filter((f) => f.rcbo).map((f) => f.id));
  const feeders = project.feeders.map((f) => {
    if (!rcbos.has(f.id)) return f;
    const rest = { ...f };
    delete rest.rcbo;
    delete rest.rcdMa;
    return rest;
  });
  return withElcbs({ ...project, feeders }, boardId, []);
}
