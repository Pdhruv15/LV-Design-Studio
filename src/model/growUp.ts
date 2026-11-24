import { cableSizeText, faultCurrentKA, impedanceToBoard, selectCable, sourceAssumed, sourceKindTakes, supplySourceLevel, takesSourceRating } from '../calc/electrical';
import { icuSteps } from '../calc/sizing';
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

/** What stays with the way (or the board) and does not move up with the given values. */
const STAYS = new Set(['device', 'ratingA', 'irSetting', 'incomer']);
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
function givenList(x: Board): string[] {
  const s = x.supply;
  if (!s) return [];
  // The rating, X″d and fault multiple count only while the board's source level reads them.
  const reads = takesSourceRating(x), k = sourceKindTakes(s.kind);
  const t: [number | undefined, (v: number) => string][] = [
    [s.faultKa, (v) => `Ik″ ${num(v)} kA`], [s.xr, (v) => `X/R ${num(v)}`],
    [reads ? s.ratedKva : undefined, (v) => `${num(v)} kVA`], [reads && k.machine ? s.xdPct : undefined, (v) => `X″d ${num(v)} %`], [reads && k.machine ? s.xdTransientPct : undefined, (v) => `X′d ${num(v)} %`], [reads && k.machine ? s.sustainedMultiple : undefined, (v) => `sustained fault ${num(v)} × rated`], [reads && k.inverter ? s.faultMultiple : undefined, (v) => `fault current ${num(v)} × rated`], [s.faultKaMin, (v) => `minimum Ik″ ${num(v)} kA`],
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

interface Way { feeder: Feeder; typed: boolean; half: boolean; isol: boolean; its: boolean; unrated: boolean; deviceText: string; cableText: string }

const MIN_ICU_KA = 36;
/** The breaking capacity of the new way: the next standard step above the fault level at its busbar, never below 36 kA. */
const icuFor = (ka?: number) => Math.max(MIN_ICU_KA, ka && ka > 0 ? icuSteps().find((k) => k >= ka) ?? icuSteps()[icuSteps().length - 1] : 0);

/** The way from `parentId` to `x`: the typed incoming cable and device when there is one (what the calculations already
 * treated as a virtual feeder), else a way at the board's rating with a cable sized for it, 30 m, to check.
 * `ka` is the fault level at the busbar the way starts from (its breaking capacity follows it). */
function wayTo(project: Project, x: Board, parentId: string, taken: Set<string>, ka?: number): Way {
  const sup = x.supply, virtual = supplyIncomerFeeder(x), inc = sup?.incomer;
  const half = !virtual && lvSuppliedBoard(x) && !!inc && inc.cableCsaMm2 > 0;
  const rating = [sup?.ratingA, x.ratedCurrentA, x.kind ? BOARD_RATING[x.kind] : undefined, 63].find((v) => v !== undefined && v > 0)!;
  const isol = sup?.device === 'ISOL', device = isol ? undefined : sup?.device;
  const id = taken.has(`INC-${x.id}`) ? uniqueId(taken, `INC-${x.id}`) : `INC-${x.id}`;
  const base: Feeder = {
    id, boardId: parentId, feedsBoardId: x.id, name: `Incomer to ${x.name}`, loadKw: 0, demandFactor: 1, powerFactor: 0.85,
    lengthM: 30, cableCsaMm2: 0, cores: 4, breakerRatingA: rating, breakerIcuKa: icuFor(ka),
    breakerType: device === 'ACB' ? 'ACB' : device === 'MCCB' ? 'MCCB' : rating > 1600 ? 'ACB' : rating > 63 ? 'MCCB' : 'C',
    ...(device ? { device } : {})
  };
  const kept = (c: { cores?: 2 | 3 | 4; parallel?: number; cpcMm2?: number; installMethod?: Feeder['installMethod'] }) => ({ cores: c.cores ?? 4, ...(c.parallel !== undefined ? { parallel: c.parallel } : {}), ...(c.cpcMm2 !== undefined ? { cpcMm2: c.cpcMm2 } : {}), ...(c.installMethod ? { installMethod: c.installMethod } : {}) });
  const feeder: Feeder = virtual
    ? { ...base, lengthM: virtual.lengthM, cableCsaMm2: virtual.cableCsaMm2, ...kept(virtual) }
    : half
      ? { ...base, cableCsaMm2: inc!.cableCsaMm2, ...kept(inc!), lengthToCheck: true }
      : { ...base, cableCsaMm2: selectCable(rating, 30, project.voltageV, 4, 0.85, project.ambientC, 100, rating) ?? 300, lengthToCheck: true };
  if (x.existing && (virtual || half)) feeder.existing = true;
  const typedRating = !!sup?.ratingA && sup.ratingA > 0;
  return {
    feeder, typed: !!virtual, half, isol, its: typedRating && !isol, unrated: (!!virtual || half) && !typedRating,
    deviceText: `${rating} A ${device ?? 'breaker'}`, cableText: `${cableSizeText(feeder)}, ${feeder.lengthM} m`
  };
}

const lvSuppliedBoard = (b: Board) => !b.upstreamId && !b.sourceKva && !!b.supply;

/** The lines about the way: the typed cable and device (or what was missing), or the default way, and what it does to the results. */
function wayLines(way: Way, from: string, x: Board): string[] {
  const f = way.feeder, out: string[] = [];
  if (way.half) out.push(`The incoming cable ${cableSizeText(f)} has no length: 30 m is used, to check.`);
  else if (way.typed) out.push(way.its ? `The incoming cable ${way.cableText} and its ${way.deviceText} become the way from ${from} to ${x.id}.` : `The incoming cable ${way.cableText} becomes the way from ${from} to ${x.id}.`);
  else out.push(`A ${f.breakerRatingA} A way with a cable sized for it is added from ${from} to ${x.id} (30 m, to check): the fault level and voltage drop at ${x.id} change by this cable.`);
  if (way.isol) out.push(`The supply device was typed as an isolator: the way is made with a ${f.breakerRatingA} A breaker — set the real device.`);
  else if (way.unrated) out.push(`No supply device rating was typed: the way is made with a ${f.breakerRatingA} A breaker (the board's rating).`);
  return out;
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
  const given = givenList(x), sup = x.supply;
  const lines = wayLines(way, 'the new board', x);
  if (given.length) lines.push(`The given values (${given.join(', ')}) move to the new board.`);
  const src = named(sup?.fedFrom);
  if (supplyMode(x) === 'source' && (src || sup?.meter)) lines.push(`The source${src ? ` ${src}` : ''}${sup?.meter ? ' and its meter' : ''} move${sup?.meter ? '' : 's'} to the new board.`);
  else if (supplyMode(x) === 'board' && sup?.meter) lines.push('Its meter moves to the new board.');
  if (way.typed || way.half || given.length || (sup && supplyMode(x) === 'source')) lines.push(`From then on the values at ${x.id} are calculated.`);
  return { transformer: false, kind: s.kind, id: s.id, title: `Add a board above ${x.id}`, lines };
}

/** The supply block the new first board gets: everything typed at the old one moves up, except what is now the way
 * (device, rating, Ir setting, incomer) and, for a board outside the project, its own name. */
function movedSupply(x: Board): Supply | undefined {
  const sup = x.supply, mode = supplyMode(x);
  if (!sup || mode === 'unset' || mode === 'transformer') return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(sup)) if (v !== undefined && !STAYS.has(k) && !(mode === 'board' && k === 'fedFrom')) out[k] = v;
  if (mode === 'board') out.fedBy = 'board';
  return out as Supply;
}

/** X below its new parent: no supply block (calculated from the parent now); the Ir setting stays at the board. */
function fedFromAbove(x: Board, parentId: string): Board {
  const { supply: sup, ...rest } = x;
  const ir = sup?.irSetting;
  return { ...rest, upstreamId: parentId, ...(!(x.ratedCurrentA && x.ratedCurrentA > 0) && sup?.ratingA && sup.ratingA > 0 ? { ratedCurrentA: sup.ratingA } : {}), ...(ir !== undefined && x.protection?.irSetting === undefined ? { protection: { ...x.protection, irSetting: ir } } : {}) };
}

/** The pits of a first board belong to its number: they follow it to the new board (as renaming does). */
function moveEarthPits(project: Project, from: string, to: string): Project {
  const key = (k: string) => (k === `lv:${from}` ? `lv:${to}` : k);
  const rekey = <T,>(o: Record<string, T> | undefined) => (o ? Object.fromEntries(Object.entries(o).map(([k, v]) => [key(k), v])) : o);
  const plan = project.earthingPlan;
  return {
    ...project,
    ...(project.earthPitIds ? { earthPitIds: rekey(project.earthPitIds) } : {}),
    ...(plan ? { earthingPlan: { ...plan, ...(plan.pits ? { pits: rekey(plan.pits) } : {}), ...(plan.unlinked ? { unlinked: plan.unlinked.map(key) } : {}) } } : {})
  };
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
  const level = supplySourceLevel(project, x); // the typed fault level, or the one calculated from the source rating
  const way = wayTo(project, x, id, new Set([...used, id]), level.basis === 'assumed' ? undefined : level.ka);
  const given = movedSupply(x), earthing = x.earthing;
  const n: Board = {
    id, name, kind: s.kind, ratedCurrentA: Math.max(BOARD_RATING[s.kind], x.ratedCurrentA ?? 0, way.feeder.breakerRatingA),
    ...(given ? { supply: given } : {}), ...(earthing ? { earthing } : {}),
    // The cable up to an existing board is installed, so what feeds it is too (not priced as new).
    ...(x.existing && way.feeder.existing ? { existing: {} } : {})
  };
  const { earthing: _e, ...x0 } = fedFromAbove(x, id);
  const boards = project.boards.flatMap((b) => (b.id === x.id ? [n, x0] : [b]));
  const what = way.typed || way.half
    ? `the incoming cable ${way.cableText} with ${way.its ? 'its' : 'a'} ${way.deviceText} is now the way to ${x.id}`
    : `a ${way.feeder.breakerRatingA} A way with ${way.cableText.replace(', ', ' cable, ')}, was added`;
  const moved = given && Object.keys(given).some((k) => k !== 'fedBy') ? `; the given values moved to ${id}` : '';
  return {
    project: moveEarthPits({ ...project, boards, feeders: [...project.feeders, way.feeder] }, x.id, id), select: { type: 'board', id },
    message: `Added ${id} above ${x.id}: ${what}${moved}${way.feeder.lengthToCheck ? ' — check the cable length' : ''}${way.isol ? '; set the real protective device of the way' : ''}`
  };
}

/** On the Board tab the view stays on the board the menu was used on: a board made above it is shown by its incomer there. */
export function stayOnBoardAfter(r: DropResult, boardId?: string): DropResult {
  return boardId && r.select?.type === 'board' && r.select.id !== boardId ? { ...r, select: { type: 'board', id: boardId } } : r;
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
const losesAtConnect = (x: Board) => givenList(x).length > 0 || !!named(x.supply?.fedFrom) || !!x.supply?.ref || !!x.supply?.meter || !!x.supply?.cable || !!x.supply?.ecc || !!x.supply?.ctRatio;

/** The text of the "Connect to…" question, without changing anything. */
export function connectPlan(project: Project, boardId: string, parentId: string): { title: string; lines: string[]; loses: boolean } {
  const x = boardOf(project, boardId), title = `Connect ${boardId} to ${parentId}?`;
  if (!x || connectBlocked(project, boardId, parentId)) return { title, lines: [], loses: false };
  const way = wayTo(project, x, parentId, new Set());
  const given = givenList(x), loses = losesAtConnect(x);
  const lines = wayLines(way, parentId, x);
  if (loses) lines.push(given.length ? `The given values (${given.join(', ')}) are removed: from then on they are calculated from ${parentId}.` : 'The name, reference and meter typed for its supply are removed.');
  return { title, lines, loses };
}

/** The fault level (kA) at a board's busbar when it is known (not the placeholder source), else undefined. */
function faultAt(project: Project, id: string): number | undefined {
  if (sourceAssumed(project, id)) return undefined;
  const ka = faultCurrentKA(impedanceToBoard(project, id), project.voltageV);
  return Number.isFinite(ka) && ka > 0 ? ka : undefined;
}

/** Joins a first board to a board already in the project, with the typed incoming cable (or a default way) as the way between them. */
export function connectTo(project: Project, boardId: string, parentId: string): DropResult {
  const blocked = connectBlocked(project, boardId, parentId);
  if (blocked) return { project, message: blocked };
  const x = boardOf(project, boardId)!;
  const way = wayTo(project, x, parentId, allIds(project), faultAt(project, parentId));
  const lost = givenList(x).length > 0;
  return {
    project: { ...project, boards: project.boards.map((b) => (b.id === x.id ? fedFromAbove(x, parentId) : b)), feeders: [...project.feeders, way.feeder] },
    select: { type: 'board', id: x.id },
    message: `Connected ${x.id} to ${parentId} with a ${way.deviceText} and ${way.cableText}${lost ? '; the values given for its supply are now calculated' : ''}${way.feeder.lengthToCheck ? ' — check the cable length' : ''}${way.isol ? '; set the real protective device of the way' : ''}`
  };
}
