import { elcbGroups, isScheduleCircuit, rcbosOf, scheduleCircuits, type ElcbGroup, type RcboKind } from '../calc/loadSchedule';
import type { BoardElcb, Project, RcdType } from '../types';
import { balancePhases, refreshBoard } from './schedule';
import { isDbBoard } from './spareWays';

/** ELCBs (RCCBs) over whole ways of a DB, RCBOs in place of a circuit's MCB (2P, or 4P on a 3-phase circuit), and
 * circuits left with no RCD on purpose. Every ELCB is a device of its
 * own: resizing, editing, placing or removing one, or changing the "New ELCBs" size, first fixes the ELCBs the schedule
 * shows (fixElcbs), so no other ELCB moves; only Re-group all ELCBs cuts the whole DB again. A circuit has one earth
 * leakage device: its ELCB, an RCBO, or none (No RCD); an RCBO or No RCD circuit leaves the ELCB of its ways. After each change the board's circuits are sized
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
  return scheduleCircuits(project, boardId).some((f) => !f.rcbo && !f.noRcd && inWays(f.way))
    || !!project.boards.find((x) => x.id === boardId)?.spareWays?.some((sp) => sp.kind === 'spare' && inWays(sp.way));
}

/** Every ELCB the schedule shows becomes one of the board's own over the ways it has now, with rating, mA and poles left
 * Auto: nothing on the schedule or its prints changes. Afterwards the "New ELCBs" size reaches only ways with no ELCB,
 * and those keep lighting and power apart (elcbKeepApart) unless Re-group turned that off. */
export function fixElcbs(project: Project, boardId: string): Project {
  const board = boardOf(project, boardId);
  const auto = elcbGroups(project, board).filter((g) => !g.byHand);
  if (!auto.length && board.elcbKeepApart !== undefined) return project;
  const list = [...(board.elcbs ?? [])];
  for (const g of auto) list.push({ id: nextId(list), fromWay: g.ways[0], toWay: g.ways[g.ways.length - 1] });
  // From now on new ELCBs keep lighting and power apart: every circuit is under an ELCB now, so nothing moves.
  const keepApart = board.elcbKeepApart ?? true;
  return { ...project, boards: project.boards.map((b) => (b.id === boardId ? { ...b, elcbs: list.length ? list.sort(byWay) : undefined, elcbKeepApart: keepApart } : b)) };
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

const INCOMER_ONLY = 'This DB has one ELCB at the incomer over every way. Re-group all ELCBs… cuts it into ELCBs over ways first';
/** Stops a change that would put an ELCB over ways next to (or cut) the one at the incomer. */
function noIncomer(project: Project, boardId: string) {
  if (boardOf(project, boardId).elcbs?.some((x) => x.incomer)) throw new Error(INCOMER_ONLY);
}

/** A new ELCB over ways: the ELCBs already there give those ways up, and no other ELCB moves. */
export function addBoardElcb(project: Project, boardId: string, e: Omit<BoardElcb, 'id'>): ElcbResult {
  noIncomer(project, boardId);
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
  if (cur.incomer) {
    // The ELCB at the incomer keeps covering every way: only its poles, rating, mA, type and S-type change.
    const next = withElcbs(project, boardId, [{ ...merged, fromWay: cur.fromWay, toWay: cur.toWay, incomer: true }]);
    const g = numberOf(next, boardId, id);
    return { project: next, id, message: `ELCB-${g?.n ?? ''} at the incomer: ${g?.label ?? ''}` };
  }
  if (merged.incomer) throw new Error(INCOMER_ONLY);
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
  noIncomer(project, boardId);
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
  const inc = list.find((x) => x.incomer);
  const id = inc?.id ?? ((at !== undefined && list.find(covers(at))?.id) || 'new');
  // The ELCB at the incomer stays over every way; another one shows with the ways it would have.
  const elcbs = inc ? [{ id, fromWay: inc.fromWay, toWay: inc.toWay, poles: e.poles, incomer: true as const }]
    : [...carve(list.filter((x) => x.id !== id), e.fromWay, e.toWay), { ...e, id }].sort(byWay);
  const next = { ...fixed, boards: fixed.boards.map((b) => (b.id === boardId ? { ...b, elcbs } : b)) };
  return elcbGroups(next, boardOf(next, boardId)).find((g) => g.byHand?.id === id);
}

/** Sets the "New ELCBs" size: the ELCBs already on the DB keep their ways; only ways with no ELCB take the new size.
 * New circuits then get no RCBO of their own (it ends "RCBO on every circuit" for them). */
export function setNewElcbSize(project: Project, boardId: string, size: ElcbSize): Project {
  boardOf(project, boardId);
  const fixed = fixElcbs(project, boardId);
  return refreshBoard({ ...fixed, boards: fixed.boards.map((b) => (b.id === boardId ? { ...b, elcbGroupSize: size, rcboEveryCircuit: undefined } : b)) }, boardId);
}

/** "RCBO on every circuit" from the New ELCBs list: circuits added from now on get an RCBO; the circuits already on the
 * DB keep their device (Re-group gives them all one). The ELCBs on the DB, an incomer one too, stay as they are. */
export function setNewRcbos(project: Project, boardId: string): Project {
  boardOf(project, boardId);
  const fixed = fixElcbs(project, boardId);
  return { ...fixed, boards: fixed.boards.map((b) => (b.id === boardId ? { ...b, rcboEveryCircuit: true } : b)) };
}

/** What the New ELCBs list shows for a DB: what a circuit added now gets. */
export type NewElcbsChoice = ElcbSize | 'rcbo' | 'incomer';
export function newElcbsChoice(board: { elcbGroupSize?: ElcbSize; rcboEveryCircuit?: boolean; elcbs?: { incomer?: true }[] }): NewElcbsChoice {
  if (board.rcboEveryCircuit) return 'rcbo';
  if (board.elcbs?.some((e) => e.incomer)) return 'incomer';
  return board.elcbGroupSize ?? 6;
}

/** A whole-board scheme in place of ELCBs of one size: one ELCB at the incomer, or an RCBO on every circuit. */
export type ElcbScheme = 'incomer' | 'rcbo';
export interface RegroupOptions { size: ElcbSize; keepApart: boolean; keepRcbos: boolean; scheme?: ElcbScheme }

/** Re-group all ELCBs: the DB is cut again into ELCBs of `size` circuits (none for 0), its own ELCBs go, and so do its
 * RCBOs and No RCD circuits unless kept. keepApart moves circuits so lighting and power start on ELCBs of their own (renumbering them) and
 * stays on for new ways; without it no circuit moves. A scheme moves no circuit: 'incomer' puts one ELCB at the incomer
 * over every way, with the kept RCBOs below it; 'rcbo' gives every circuit without one an RCBO, and new circuits too. */
export function regroupElcbs(project: Project, boardId: string, o: RegroupOptions): Project {
  boardOf(project, boardId);
  const size = o.scheme ? 0 : o.size;
  const sized = { ...project, boards: project.boards.map((b) => (b.id === boardId ? { ...b, elcbGroupSize: size, elcbKeepApart: o.keepApart, rcboEveryCircuit: o.scheme === 'rcbo' || undefined } : b)) };
  let p = o.keepRcbos ? withElcbs(sized, boardId, []) : allAutomatic(sized, boardId);
  if (o.scheme === 'incomer') {
    const board = boardOf(p, boardId);
    const last = Math.max(1, ...scheduleCircuits(p, boardId).map((f) => f.way!), ...(board.spareWays ?? []).map((sp) => sp.way ?? 0));
    p = withElcbs(p, boardId, [{ id: 'elcb1', fromWay: 1, toWay: last, incomer: true }]);
  } else if (o.scheme === 'rcbo') {
    const plain = new Set(scheduleCircuits(p, boardId).filter((f) => !f.rcbo && !f.noRcd).map((f) => f.id));
    p = refreshBoard({ ...p, feeders: p.feeders.map((f) => (plain.has(f.id) ? { ...f, rcbo: true } : f)) }, boardId);
  } else if (o.keepApart && size && scheduleCircuits(p, boardId).length >= 2) p = refreshBoard(balancePhases(p, boardId), boardId);
  return p;
}

/** What Re-group would do, for its dialog: circuits per ELCB now and after, how many circuits change reference, the
 * RCBOs (and add-on blocks) after it, the ELCB at the incomer if there is one, and a warning when that ELCB is short of
 * the incomer's rating. */
export function regroupPreview(project: Project, boardId: string, o: RegroupOptions): { before: number[]; after: number[]; moved: number; rcbos: number; incomer?: string; warning?: string } {
  const sizes = (p: Project) => elcbGroups(p, boardOf(p, boardId)).map((g) => g.ways.length * 3);
  const next = regroupElcbs(project, boardId, o);
  const moved = next.feeders.length !== project.feeders.length ? 0
    : project.feeders.filter((f, i) => f.boardId === boardId && isScheduleCircuit(f) && (next.feeders[i].phase !== f.phase || next.feeders[i].way !== f.way)).length;
  const nb = boardOf(next, boardId);
  const inc = elcbGroups(next, nb).find((g) => g.incomer);
  const incomerA = next.feeders.find((f) => f.feedsBoardId === boardId && f.boardId === nb.upstreamId)?.breakerRatingA ?? nb.ratedCurrentA ?? 0;
  const warning = inc && !inc.byHand?.ratingA && incomerA > inc.ratingA
    ? `The incomer is ${incomerA} A and an ELCB goes up to ${inc.ratingA} A: use an earth leakage relay on the incomer breaker instead` : undefined;
  return { before: sizes(project), after: sizes(next), moved, rcbos: rcbosOf(next, nb).length, incomer: inc && `ELCB-${inc.index} ${inc.label}`, warning };
}

/** Gives a circuit an earth leakage device of its own (on): an RCBO in place of its MCB (2P, or 4P on a 3-phase circuit),
 * an AFDD + RCBO (1-phase only), or an RCD add-on block on its MCB — `kind` as given, else the one it has; IΔn as given
 * or Auto; RCD type as given, null for Auto, else the one it has. Off: its MCB again, back on the ELCB of its ways. This
 * replaces No RCD. */
export function setRcbo(project: Project, feederId: string, on: boolean, rcdMa?: number, kind?: RcboKind, rcdType?: RcdType | null): Project {
  const f = project.feeders.find((x) => x.id === feederId);
  if (!f || !isScheduleCircuit(f)) throw new Error('That circuit is no longer on a load schedule');
  const k = kind ?? f.rcboKind ?? 'rcbo';
  if (on && k === 'afdd' && f.phase === 'RYB') throw new Error('An AFDD + RCBO is for 1-phase circuits; give a 3-phase circuit a 4P RCBO or an RCD add-on block');
  const next = { ...f };
  if (on) {
    next.rcbo = true;
    if (k === 'rcbo') delete next.rcboKind;
    else next.rcboKind = k;
    // RCD type: as given, null for Auto, unset (undefined) keeps the one it has.
    if (rcdType) next.rcdType = rcdType;
    else if (rcdType === null) delete next.rcdType;
    delete next.noRcd;
    if (rcdMa) next.rcdMa = rcdMa;
    else delete next.rcdMa;
  } else {
    delete next.rcbo;
    delete next.rcboKind;
    delete next.rcdType;
    delete next.rcdMa;
  }
  return refreshBoard({ ...project, feeders: project.feeders.map((x) => (x.id === feederId ? next : x)) }, f.boardId);
}

/** No earth leakage device for a circuit on purpose (fire alarm panel, life safety), with the reason; it leaves the ELCB
 * of its ways and an RCBO it had. No reason puts it back on its ELCB. The earth fault check then rests on the MCB alone. */
export function setNoRcd(project: Project, feederId: string, reason?: string): Project {
  const f = project.feeders.find((x) => x.id === feederId);
  if (!f || !isScheduleCircuit(f)) throw new Error('That circuit is no longer on a load schedule');
  const next = { ...f };
  const why = reason?.trim();
  if (why) {
    next.noRcd = why;
    delete next.rcbo;
    delete next.rcboKind;
    delete next.rcdType;
    delete next.rcdMa;
  } else delete next.noRcd;
  return refreshBoard({ ...project, feeders: project.feeders.map((x) => (x.id === feederId ? next : x)) }, f.boardId);
}

/** Back to the board's automatic grouping: no ELCBs of its own, no RCBOs and no No RCD circuits. */
export function allAutomatic(project: Project, boardId: string): Project {
  boardOf(project, boardId);
  const own = new Set(scheduleCircuits(project, boardId).filter((f) => f.rcbo || f.noRcd).map((f) => f.id));
  const feeders = project.feeders.map((f) => {
    if (!own.has(f.id)) return f;
    const rest = { ...f };
    delete rest.rcbo;
    delete rest.rcboKind;
    delete rest.rcdType;
    delete rest.rcdMa;
    delete rest.noRcd;
    return rest;
  });
  return withElcbs({ ...project, feeders }, boardId, []);
}
