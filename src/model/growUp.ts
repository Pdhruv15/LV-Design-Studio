import { cableSizeText, selectCable } from '../calc/electrical';
import { supplyMode } from '../diagram/supplyPoint';
import { supplyIncomerFeeder, type Board, type BoardKind, type Feeder, type Project } from '../types';
import { BOARD_RATING, panelKindOf } from './addPanel';
import { below } from './moveBoard';
import { allIds, newBoard, uniqueId, type DropResult } from './sldEdit';
import { hasSupplyValues, losesValues, setFedFrom } from './supplyEdit';

/** Growing a project upward: a first board gets the board that feeds it ("Add upstream board…"), or is joined to a
 * board already in the project ("Connect to…"). The typed incoming cable becomes a real way, the values given
 * from upstream move to the new first board, and the results at the old one stay the same (they are calculated
 * from then on, from the same numbers). */

type Supply = NonNullable<Board['supply']>;

/** Board types offered as the board above (the types that feed other boards). */
export const FEEDING_KINDS: BoardKind[] = ['SMDB', 'ESMDB', 'MDB', 'LV-MDB', 'EMDB', 'LV-EMDB', 'MCC', 'EMCC', 'LV-ACB'];

const ABOVE: Partial<Record<BoardKind, BoardKind>> = { DB: 'SMDB', EDB: 'ESMDB', SMDB: 'MDB', MCC: 'MDB', FP: 'MDB', UPS: 'MDB', EMDB: 'MDB', 'LV-EMDB': 'MDB', ESMDB: 'EMDB', EMCC: 'EMDB' };
/** What normally feeds a board of this type: 'transformer' for a main board. */
export const upstreamKind = (b: Board): BoardKind | 'transformer' => (b.kind && ABOVE[b.kind]) || 'transformer';

const GIVEN = ['faultKa', 'xr', 'faultKaMin', 'vdUsedPct', 'zeOhm', 'allowedA'] as const;
const SOURCE_KEYS = ['fedFrom', 'kind', 'ref', 'meter', 'ctRatio', 'cable', 'ecc'] as const;
const num = (v: number) => String(+v.toFixed(2));
const named = (s?: string) => (typeof s === 'string' ? s.trim() || undefined : undefined);
const boardOf = (p: Project, id: string) => p.boards.find((b) => b.id === id);

/** Whether the two rows are offered for this board, and why not (undefined = offered). */
export function growBlocked(project: Project, boardId: string): string | undefined {
  const b = boardOf(project, boardId);
  if (!b) return 'Board not found';
  if (b.upstreamId) return `${b.id} is fed from ${b.upstreamId}`;
  if (b.kind === 'MC') return `${b.id} is the supply point itself`;
  if (supplyMode(b) === 'transformer') return `${b.id} has its own transformer`;
  const tie = (project.ties ?? []).find((t) => t.a === b.id || t.b === b.id);
  if (tie) return `Remove bus coupler ${tie.id} first`;
  return undefined;
}

/** The values given from upstream, in words: "Ik″ 12 kA, drop used 1.6 %, Ze 0.35 Ω". */
function givenList(s: Supply | undefined): string[] {
  if (!s) return [];
  const t: [number | undefined, (v: number) => string][] = [
    [s.faultKa, (v) => `Ik″ ${num(v)} kA`], [s.xr, (v) => `X/R ${num(v)}`], [s.faultKaMin, (v) => `minimum Ik″ ${num(v)} kA`],
    [s.vdUsedPct, (v) => `drop used ${num(v)} %`], [s.zeOhm, (v) => `Ze ${num(v)} Ω`], [s.allowedA, (v) => `allowed load ${num(v)} A`]
  ];
  return t.flatMap(([v, f]) => (v !== undefined ? [f(v)] : []));
}

/** The reference and name the new board gets: the typed name of a board outside the project when it is free, else the next free <type>-n. */
function suggestion(project: Project, x: Board, kind?: BoardKind): { kind: BoardKind; id: string; name: string; typed: boolean } {
  const used = allIds(project), typedName = x.supply?.fedBy === 'board' ? named(x.supply.fedFrom) : undefined;
  const free = typedName && !used.has(typedName) ? typedName : undefined;
  const fromName = free ? panelKindOf(free) : undefined;
  const k = kind ?? (fromName && FEEDING_KINDS.includes(fromName) ? fromName : upstreamKind(x) as BoardKind);
  if (free) return { kind: k, id: free, name: free, typed: true };
  const g = newBoard(project, k);
  return { kind: k, id: g.id, name: g.name, typed: false };
}

interface Way { feeder: Feeder; typed: boolean; deviceText: string; cableText: string }

/** The way from `parentId` to `x`: the typed incoming cable and device when there is one (what the calculations already
 * treated as a virtual feeder), else a way at the board's rating with a cable sized for it, 30 m, to check. */
function wayTo(project: Project, x: Board, parentId: string, taken: Set<string>): Way {
  const sup = x.supply, virtual = supplyIncomerFeeder(x);
  const rating = sup?.ratingA && sup.ratingA > 0 ? sup.ratingA : x.ratedCurrentA ?? (x.kind ? BOARD_RATING[x.kind] : 63);
  const device = sup?.device;
  const id = taken.has(`INC-${x.id}`) ? uniqueId(taken, `INC-${x.id}`) : `INC-${x.id}`;
  const base: Feeder = {
    id, boardId: parentId, feedsBoardId: x.id, name: `Incomer to ${x.name}`, loadKw: 0, demandFactor: 1, powerFactor: 0.85,
    lengthM: 30, cableCsaMm2: 0, cores: 4, breakerRatingA: rating, breakerIcuKa: 36,
    breakerType: device === 'ACB' ? 'ACB' : device === 'MCCB' ? 'MCCB' : rating > 1600 ? 'ACB' : rating > 63 ? 'MCCB' : 'C',
    ...(device ? { device } : {})
  };
  const feeder: Feeder = virtual
    ? { ...base, lengthM: virtual.lengthM, cableCsaMm2: virtual.cableCsaMm2, cores: virtual.cores, ...(virtual.parallel !== undefined ? { parallel: virtual.parallel } : {}), ...(virtual.cpcMm2 !== undefined ? { cpcMm2: virtual.cpcMm2 } : {}), ...(virtual.installMethod ? { installMethod: virtual.installMethod } : {}) }
    : { ...base, cableCsaMm2: selectCable(rating, 30, project.voltageV, 4, 0.85, project.ambientC, 100, rating) ?? 300, lengthToCheck: true };
  return { feeder, typed: !!virtual, deviceText: `${rating} A ${device ?? 'breaker'}`, cableText: `${cableSizeText(feeder)}, ${feeder.lengthM} m` };
}

export interface UpstreamPlan { transformer: boolean; kind?: BoardKind; id?: string; title: string; lines: string[] }

/** The text of the question, without changing anything. */
export function upstreamPlan(project: Project, boardId: string, kind?: BoardKind): UpstreamPlan {
  const x = boardOf(project, boardId);
  if (!x || growBlocked(project, boardId)) return { transformer: false, title: `Add a board above ${boardId}`, lines: [] };
  if (!kind && upstreamKind(x) === 'transformer') {
    const lines = [`${x.id} gets a 1000 kVA transformer with a typical impedance.`];
    if (losesValues(x, 'transformer') || hasSupplyValues(x)) lines.push('The values given for its supply are kept but no longer used.');
    return { transformer: true, title: `Add a transformer to ${x.id}?`, lines };
  }
  const s = suggestion(project, x, kind), way = wayTo(project, x, '', new Set());
  const given = givenList(x.supply), sup = x.supply;
  const lines = [way.typed
    ? `The incoming cable ${way.cableText} and its ${way.deviceText} become the way from the new board to ${x.id}.`
    : `A ${way.feeder.breakerRatingA} A way with a cable sized for it is added from the new board to ${x.id} (30 m, to check).`];
  if (given.length) lines.push(`The given values (${given.join(', ')}) move to the new board.`);
  const src = named(sup?.fedFrom);
  if (supplyMode(x) === 'source' && (src || sup?.meter)) lines.push(`The source${src ? ` ${src}` : ''}${sup?.meter ? ' and its meter' : ''} move${sup?.meter ? '' : 's'} to the new board.`);
  if (way.typed || given.length || (sup && supplyMode(x) === 'source')) lines.push(`From then on the values at ${x.id} are calculated.`);
  return { transformer: false, kind: s.kind, id: s.id, title: `Add a board above ${x.id}`, lines };
}

/** The supply block the new first board gets: the values given at the old one move up. */
function movedSupply(x: Board): Supply | undefined {
  const sup = x.supply, mode = supplyMode(x);
  if (!sup || mode === 'unset' || mode === 'transformer') return undefined;
  const out: Record<string, unknown> = mode === 'board' ? { fedBy: 'board' } : {};
  for (const k of mode === 'source' ? SOURCE_KEYS : (['ref'] as const)) if (sup[k] !== undefined) out[k] = sup[k];
  for (const k of GIVEN) if (sup[k] !== undefined) out[k] = sup[k];
  return out as Supply;
}

/** X below its new parent: no supply block (calculated from the parent now); the Ir setting stays at the board. */
function fedFromAbove(x: Board, parentId: string): Board {
  const { supply: sup, ...rest } = x;
  const ir = sup?.irSetting;
  return { ...rest, upstreamId: parentId, ...(ir !== undefined && x.protection?.irSetting === undefined ? { protection: { ...x.protection, irSetting: ir } } : {}) };
}

/** Makes the board above `boardId`: a transformer for a main board, else a new board of the usual type (or `opts.kind`). */
export function addUpstreamBoard(project: Project, boardId: string, opts: { kind?: BoardKind; id?: string } = {}): DropResult {
  const refuse = (message: string): DropResult => ({ project, message });
  const blocked = growBlocked(project, boardId);
  if (blocked) return refuse(blocked);
  const x = boardOf(project, boardId)!;
  if (!opts.kind && upstreamKind(x) === 'transformer') {
    const board = setFedFrom(project, x, 'transformer');
    return { project: { ...project, boards: project.boards.map((b) => (b.id === x.id ? board : b)) }, select: { type: 'board', id: x.id }, message: `Added a 1000 kVA transformer to ${x.id} — set kVA and impedance on the Supply tab` };
  }
  const used = allIds(project), s = suggestion(project, x, opts.kind);
  let id = s.id, name = s.name;
  if (opts.id !== undefined) {
    id = opts.id.trim();
    if (!id) return refuse('The reference is empty');
    name = id === newBoard(project, s.kind).id ? newBoard(project, s.kind).name : id;
  }
  if (used.has(id)) return refuse(`${id} already exists in the project`);
  const way = wayTo(project, x, id, new Set([...used, id]));
  const given = movedSupply(x), earthing = x.earthing;
  const n: Board = {
    id, name, kind: s.kind, ratedCurrentA: Math.max(BOARD_RATING[s.kind], x.ratedCurrentA ?? 0, way.feeder.breakerRatingA),
    ...(given ? { supply: given } : {}), ...(earthing ? { earthing } : {})
  };
  const { earthing: _e, ...x0 } = fedFromAbove(x, id);
  const boards = project.boards.flatMap((b) => (b.id === x.id ? [n, x0] : [b]));
  const what = way.typed
    ? `the incoming cable ${way.cableText} with ${x.supply?.ratingA ? 'its' : 'a'} ${way.deviceText} is now the way to ${x.id}`
    : `a ${way.feeder.breakerRatingA} A way with ${way.cableText.replace(', ', ' cable, ')}, was added`;
  const moved = given && Object.keys(given).some((k) => k !== 'fedBy') ? `; the given values moved to ${id}` : '';
  return {
    project: { ...project, boards, feeders: [...project.feeders, way.feeder] }, select: { type: 'board', id },
    message: `Added ${id} above ${x.id}: ${what}${moved}${way.typed ? '' : ' — check the cable length'}`
  };
}

/** Why X cannot be connected to P, or undefined. */
export function connectBlocked(project: Project, boardId: string, parentId: string): string | undefined {
  const blocked = growBlocked(project, boardId);
  if (blocked) return blocked;
  if (!boardOf(project, parentId)) return 'Board not found';
  if (boardId === parentId) return `${boardId} can't supply itself`;
  if (below(project, boardId).has(parentId)) return `${parentId} is fed from ${boardId}`;
  return undefined;
}

/** Whether connecting removes values the user typed at X (they are calculated from the parent from then on). */
const losesAtConnect = (x: Board) => givenList(x.supply).length > 0 || !!named(x.supply?.fedFrom) || !!x.supply?.ref || !!x.supply?.meter || !!x.supply?.cable || !!x.supply?.ecc || !!x.supply?.ctRatio;

/** The text of the "Connect to…" question, without changing anything. */
export function connectPlan(project: Project, boardId: string, parentId: string): { title: string; lines: string[]; loses: boolean } {
  const x = boardOf(project, boardId), title = `Connect ${boardId} to ${parentId}?`;
  if (!x || connectBlocked(project, boardId, parentId)) return { title, lines: [], loses: false };
  const way = wayTo(project, x, parentId, new Set());
  const given = givenList(x.supply), loses = losesAtConnect(x);
  const lines = [way.typed
    ? `The incoming cable ${way.cableText} and its ${way.deviceText} become the way from ${parentId} to ${x.id}.`
    : `A ${way.feeder.breakerRatingA} A way with a cable sized for it is added from ${parentId} to ${x.id} (30 m, to check).`];
  if (loses) lines.push(given.length ? `The given values (${given.join(', ')}) are removed: from then on they are calculated from ${parentId}.` : `The values given for its supply are removed: from then on they are calculated from ${parentId}.`);
  return { title, lines, loses };
}

/** Joins a first board to a board already in the project, with the typed incoming cable (or a default way) as the way between them. */
export function connectTo(project: Project, boardId: string, parentId: string): DropResult {
  const blocked = connectBlocked(project, boardId, parentId);
  if (blocked) return { project, message: blocked };
  const x = boardOf(project, boardId)!;
  const way = wayTo(project, x, parentId, allIds(project));
  const loses = losesAtConnect(x);
  return {
    project: { ...project, boards: project.boards.map((b) => (b.id === x.id ? fedFromAbove(x, parentId) : b)), feeders: [...project.feeders, way.feeder] },
    select: { type: 'board', id: x.id },
    message: `Connected ${x.id} to ${parentId} with a ${way.deviceText} and ${way.cableText}${loses ? '; the values given for its supply are now calculated' : ''}${way.typed ? '' : ' — check the cable length'}`
  };
}
