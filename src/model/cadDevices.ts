import { buildingInfoOf } from '../calc/building';
import { updateCircuit } from './schedule';
import { circuitRef } from '../calc/loadSchedule';
import { pointMax } from './circuitRoom';
import type { LevelRef } from './levels';
import { PLAN_SYMBOLS } from './planSymbols';
import { boardSymbolOf } from '../diagram/panelBox';
import type { Feeder, PointType, Project } from '../types';

/** Devices the engineer places in the CAD view, in metres on a level's plan (the same coordinates as the room outlines
 * and the ELV devices):
 * - LV points (lights, sockets, fans…) on a circuit: kept in `project.lvPoints`, and counted on that circuit — placing
 *   one adds a point of its type, deleting it takes the point away;
 * - a distribution board: the board's position and level on the plan.
 * ELV devices are placed through src/components/elv/elvCadDevices.ts (the ELV placement); their palette and placed
 * items have the same shape as these. */

export interface LvPoint {
  id: string; // permanent: never reused
  type: PointType;
  feederId: string;
  buildingId: string;
  levelId: string;
  x: number; // metres on the level's plan
  y: number;
  /** An emergency light or sign (Design CAD → Emergency): a lighting point drawn with its own symbol. */
  emergency?: EmergencyKind;
  /** The luminaire Light room (LUX) placed, kept with the point so the BOQ counts lights by type. */
  luminaire?: PointLuminaire;
  /** The symbol turned on the plan (degrees anticlockwise: 90, 180 or 270), so a socket or switch faces its wall. */
  rot?: number;
  /** How the point is fitted, where the plan shows it apart: a floor socket, a socket above the ceiling, a fused
   * isolator. It counts on its circuit as its type. */
  variant?: PointVariant;
}
export type PointVariant = 'floor' | 'ceiling' | 'fused';
/** A rotation as kept on a point: 0, 90, 180 or 270. */
export const rightAngle = (deg: number | undefined) => ((Math.round((deg ?? 0) / 90) % 4) + 4) % 4 * 90;

/** A luminaire as placed: a copy of the catalogue entry, so a later catalogue change does not change the design. */
export interface PointLuminaire { id: string; label: string; watts: number; lumens: number; manufacturer?: string }

/** A switch, box or breaker box placed on a plan: it carries no load and is not counted on a circuit; the BOQ counts
 * it. `type` is its plan symbol (src/model/planSymbols.ts); a switch may name the circuit it controls. */
export interface CadAccessory {
  id: string; // permanent: never reused
  type: string;
  buildingId: string;
  levelId: string;
  x: number; // metres on the level's plan
  y: number;
  rot?: number;
  feederId?: string;
}

export type EmergencyKind = 'fitting' | 'exit-sign' | 'direction-sign';
/** Plan symbols of the emergency lights and signs (lighting points with `emergency` set). */
export const EMERGENCY_ITEMS: Record<EmergencyKind, { label: string; symbol: { shape: string; text: string } }> = {
  fitting: { label: 'Emergency light', symbol: { shape: 'circle', text: 'E' } },
  'exit-sign': { label: 'Exit sign', symbol: { shape: 'rect', text: 'EX' } },
  'direction-sign': { label: 'Direction sign', symbol: { shape: 'rect', text: 'DS' } }
};

/** The devices the CAD palette offers (ELV ones come from the ELV side with `kind: { elv }`). */
export type CadDeviceKind = { lv: PointType } | { elv: string } | { board: true } | { acc: string; circuit?: true };
/** `plan`: the item's plan symbol (src/model/planSymbols.ts), drawn in place of the plain `shape`, `tag` the text
 * beside it (a rating); `icon`: the symbol its palette button shows. `group`: its heading on the palette. */
export interface PaletteItem { id: string; label: string; kind: CadDeviceKind; group?: string; variant?: PointVariant; symbol: { shape: string; text: string; plan?: string; tag?: string; icon?: string } }
/** The palette's headings, in order (ELV devices follow under their own). */
export const PALETTE_GROUPS = ['Lighting', 'Sockets', 'Switches', 'Equipment', 'Boards', 'Boxes'];
const acc = (type: string, group: string, circuit?: true): PaletteItem => ({ id: type, label: PLAN_SYMBOLS[type].label, group, kind: { acc: type, ...(circuit ? { circuit } : {}) }, symbol: { shape: 'circle', text: '', plan: type } });

export const LV_PALETTE: PaletteItem[] = [
  { id: 'ltg', label: 'Light', group: 'Lighting', kind: { lv: 'ltg' }, symbol: { shape: 'cross', text: '', icon: 'light' } },
  { id: 'cfan', label: 'Ceiling fan', group: 'Lighting', kind: { lv: 'cfan' }, symbol: { shape: 'circle', text: 'F', icon: 'ceiling-fan' } },
  { id: 'exfan', label: 'Exhaust fan', group: 'Lighting', kind: { lv: 'exfan' }, symbol: { shape: 'circle', text: 'EF', plan: 'exhaust-fan' } },
  { id: 's13', label: 'Socket 13 A', group: 'Sockets', kind: { lv: 's13' }, symbol: { shape: 'rect', text: '', plan: 'socket' } },
  { id: 's13t', label: 'Twin socket', group: 'Sockets', kind: { lv: 's13t' }, symbol: { shape: 'twin', text: '', plan: 'socket-twin' } },
  { id: 's13-floor', label: 'Floor socket', group: 'Sockets', variant: 'floor', kind: { lv: 's13' }, symbol: { shape: 'rect', text: 'FL', plan: 'socket-floor' } },
  { id: 's13-ceiling', label: 'Socket above ceiling', group: 'Sockets', variant: 'ceiling', kind: { lv: 's13' }, symbol: { shape: 'rect', text: 'C', plan: 'socket-ceiling' } },
  { id: 'shaver', label: 'Shaver outlet', group: 'Sockets', kind: { lv: 'shaver' }, symbol: { shape: 'rect', text: 'SH', plan: 'shaver' } },
  { id: 's15', label: 'Power outlet 15 A', group: 'Sockets', kind: { lv: 's15' }, symbol: { shape: 'rect', text: '15', plan: 'power-outlet', tag: '15 A' } },
  { id: 'sac', label: 'Split A/C', group: 'Equipment', kind: { lv: 'sac' }, symbol: { shape: 'square', text: 'AC', icon: 'split-ac' } },
  { id: 'wh', label: 'Water heater', group: 'Equipment', kind: { lv: 'wh' }, symbol: { shape: 'square', text: 'WH', icon: 'water-heater' } },
  { id: 'hd', label: 'Hand dryer', group: 'Equipment', kind: { lv: 'hd' }, symbol: { shape: 'rect', text: 'HD', plan: 'hand-dryer' } },
  { id: 'db', label: 'DB', group: 'Boards', kind: { board: true }, symbol: { shape: 'rect', text: 'DB', icon: 'p-db' } },
  { id: 'isol', label: 'Isolator', group: 'Boards', kind: { lv: 'isol' }, symbol: { shape: 'rect', text: 'IS', plan: 'isolator' } },
  { id: 'isol-fused', label: 'Fused isolator', group: 'Boards', variant: 'fused', kind: { lv: 'isol' }, symbol: { shape: 'rect', text: 'FS', plan: 'fused-isolator' } },
  // No-load accessories: a switch may name the circuit it controls.
  ...['switch', 'switch-2way', 'dimmer', 'switch-fan', 'limit-switch', 'push-button', 'switch-panel'].map((t) => acc(t, 'Switches', true)),
  acc('cb-box', 'Boards', true),
  ...['junction-box', 'pull-box', 'junction-box-ceiling'].map((t) => acc(t, 'Boxes'))
];

/** The palette item of a point type as fitted (its variant, else the plain one). */
export const lvItemOf = (type: PointType, variant?: PointVariant): PaletteItem | undefined =>
  LV_PALETTE.find((x) => 'lv' in x.kind && x.kind.lv === type && x.variant === variant) ?? LV_PALETTE.find((x) => 'lv' in x.kind && x.kind.lv === type && !x.variant);

/** The smallest room outline on the level around a point (metres). */
function roomAt(p: Project, level: LevelRef, x: number, y: number) {
  const inside = (pts: [number, number][]) => {
    let hit = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  };
  return buildingInfoOf(p).rooms
    .filter((r) => r.buildingId === level.building && r.levelId === level.level && r.outline && r.outline.length >= 3 && inside(r.outline))
    .sort((a, b) => a.areaM2 - b.areaM2)[0];
}

/** Final circuits a point can go on (not feeders to other boards), by board and way. */
export const finalCircuits = (p: Project): Feeder[] =>
  p.feeders.filter((f) => !f.feedsBoardId && !f.generation).sort((a, b) => circuitLabel(p, a).localeCompare(circuitLabel(p, b), undefined, { numeric: true }));
/** "DB-GF1/R1 · Living lighting", as circuits are written on plans (CCT). */
export function circuitLabel(_p: Project, f: Feeder): string {
  const ref = circuitRef(f);
  return `${f.boardId}${ref ? `/${ref}` : ''}${f.name ? ` · ${f.name}` : ''}`;
}

/** A circuit without its board, as the list of one board's circuits names it: "R1 · Living lighting". */
export function circuitWay(f: Feeder): string {
  const ref = circuitRef(f);
  return ref ? `${ref}${f.name ? ` · ${f.name}` : ''}` : f.name || f.id;
}

/** A final circuit as multileaders fill it in: "DB-L1-01/L3" (the board and the circuit's reference). */
export const circuitTag = (f: Feeder): string => { const ref = circuitRef(f); return `${f.boardId}${ref ? `/${ref}` : ''}`; };

/** A cable as plans name it: "MDB-1 → SMDB-GF" for a feeder to a board, else its circuit ("DB-GF1/R1 · Living lighting"). */
export const cableLabel = (p: Project, f: Feeder): string => (f.feedsBoardId ? `${f.boardId} → ${f.feedsBoardId}` : circuitLabel(p, f));
/** Every cable a route can be drawn for: feeders to boards first, then final circuits. */
export const cablesOf = (p: Project): Feeder[] => [...p.feeders].filter((f) => !f.generation)
  .sort((a, b) => Number(!a.feedsBoardId) - Number(!b.feedsBoardId) || cableLabel(p, a).localeCompare(cableLabel(p, b), undefined, { numeric: true }));

const nextLvId = (p: Project) => (p.lvPoints ?? []).reduce((m, d) => Math.max(m, Number(/^P(\d+)$/.exec(d.id)?.[1] ?? 0)), p.lvPointSeq ?? 0) + 1;
const withCount = (p: Project, feederId: string, type: PointType, delta: number): Project => {
  const f = p.feeders.find((x) => x.id === feederId);
  if (!f) return p;
  const n = Math.max(0, (f.points?.[type] ?? 0) + delta);
  return updateCircuit(p, feederId, { points: { ...(f.points ?? {}), [type]: n } });
};

/** Places an LV point on a circuit: added to the plan and counted on the circuit. */
export function placeLvPoint(p: Project, level: LevelRef, type: PointType, feederId: string, x: number, y: number, emergency?: EmergencyKind, luminaire?: PointLuminaire, rot?: number, variant?: PointVariant): { project: Project; id: string } {
  if (!p.feeders.some((f) => f.id === feederId)) throw new Error('Choose the circuit the point is on.');
  const id = `P${nextLvId(p)}`;
  const point: LvPoint = { id, type, feederId, buildingId: level.building, levelId: level.level, x, y, ...(emergency ? { emergency } : {}), ...(luminaire ? { luminaire } : {}), ...(rightAngle(rot) ? { rot: rightAngle(rot) } : {}), ...(variant ? { variant } : {}) };
  return { project: withCount({ ...p, lvPoints: [...(p.lvPoints ?? []), point] }, feederId, type, 1), id };
}

/** Turns LV points to a rotation (degrees anticlockwise, kept as a right angle). */
export function rotateLvPoints(p: Project, ids: string[], rot: number): Project {
  const r = rightAngle(rot);
  return { ...p, lvPoints: (p.lvPoints ?? []).map((d) => { if (!ids.includes(d.id)) return d; const { rot: _old, ...rest } = d; return r ? { ...rest, rot: r } : rest; }) };
}

export function moveLvPoint(p: Project, id: string, x: number, y: number): Project {
  return { ...p, lvPoints: (p.lvPoints ?? []).map((d) => (d.id === id ? { ...d, x, y } : d)) };
}

/** Removes an LV point and takes it off its circuit's count; its ID is not given out again. */
export function removeLvPoint(p: Project, id: string): Project {
  const d = (p.lvPoints ?? []).find((x) => x.id === id);
  if (!d) return p;
  const rest = (p.lvPoints ?? []).filter((x) => x.id !== id);
  const { lvPoints: _old, ...base } = p;
  const next = rest.length ? { ...base, lvPoints: rest, lvPointSeq: nextLvId(p) - 1 } : { ...base, lvPointSeq: nextLvId(p) - 1 };
  return withCount(next, d.feederId, d.type, -1);
}

const nextAccId = (p: Project) => (p.cadAccessories ?? []).reduce((m, d) => Math.max(m, Number(/^A(\d+)$/.exec(d.id)?.[1] ?? 0)), p.cadAccessorySeq ?? 0) + 1;
/** Places an accessory (a switch, a box): on the plan only, no circuit count. A circuit that is not the project's is not kept. */
export function placeAccessory(p: Project, level: LevelRef, type: string, x: number, y: number, more: { feederId?: string; rot?: number } = {}): { project: Project; id: string } {
  if (!PLAN_SYMBOLS[type]) throw new Error('Choose the accessory to place.');
  const id = `A${nextAccId(p)}`, feederId = more.feederId && p.feeders.some((f) => f.id === more.feederId) ? more.feederId : undefined;
  const item: CadAccessory = { id, type, buildingId: level.building, levelId: level.level, x, y, ...(rightAngle(more.rot) ? { rot: rightAngle(more.rot) } : {}), ...(feederId ? { feederId } : {}) };
  return { project: { ...p, cadAccessories: [...(p.cadAccessories ?? []), item] }, id };
}
export function moveAccessory(p: Project, id: string, x: number, y: number): Project {
  return { ...p, cadAccessories: (p.cadAccessories ?? []).map((d) => (d.id === id ? { ...d, x, y } : d)) };
}
/** Removes an accessory; its ID is not given out again. */
export function removeAccessory(p: Project, id: string): Project {
  if (!(p.cadAccessories ?? []).some((d) => d.id === id)) return p;
  const rest = (p.cadAccessories ?? []).filter((d) => d.id !== id), { cadAccessories: _old, ...base } = p;
  return { ...base, ...(rest.length ? { cadAccessories: rest } : {}), cadAccessorySeq: nextAccId(p) - 1 };
}
/** Turns accessories to a rotation (degrees anticlockwise, kept as a right angle). */
export function rotateAccessories(p: Project, ids: string[], rot: number): Project {
  const r = rightAngle(rot);
  return { ...p, cadAccessories: (p.cadAccessories ?? []).map((d) => { if (!ids.includes(d.id)) return d; const { rot: _old, ...rest } = d; return r ? { ...rest, rot: r } : rest; }) };
}

/** Places a board on the plan: its position and level, and the room it is in (when that room has an outline). */
export function placeBoard(p: Project, boardId: string, level: LevelRef, x: number, y: number): Project {
  const room = roomAt(p, level, x, y);
  return { ...p, boards: p.boards.map((b) => (b.id === boardId ? { ...b, planPoint: { x, y }, level, ...(room ? { location: room.name } : {}) } : b)) };
}

/** One device shown in the CAD view (metres on the level's plan). */
export interface PlacedItem { key: string; id: string; what: 'lv' | 'elv' | 'board' | 'acc'; x: number; y: number; label: string; detail: string; symbol: PaletteItem['symbol']; room?: string; rot?: number }

/** LV points and boards placed on a level (ELV devices: src/components/elv/elvCadDevices.ts). */
export function placedOn(p: Project, level: LevelRef): PlacedItem[] {
  const roomName = (x: number, y: number) => roomAt(p, level, x, y)?.name;
  const lv = (p.lvPoints ?? []).filter((d) => d.buildingId === level.building && d.levelId === level.level).map((d): PlacedItem => {
    const f = p.feeders.find((x) => x.id === d.feederId);
    const item = d.emergency ? EMERGENCY_ITEMS[d.emergency] : lvItemOf(d.type, d.variant);
    return { key: `lv:${d.id}`, id: d.id, what: 'lv', x: d.x, y: d.y, label: item?.label ?? d.type, detail: f ? circuitLabel(p, f) : 'circuit removed', symbol: item?.symbol ?? { shape: 'circle', text: '?' }, room: roomName(d.x, d.y), ...(d.rot ? { rot: d.rot } : {}) };
  });
  const boards = p.boards.filter((b) => b.planPoint && b.level?.building === level.building && b.level?.level === level.level).map((b): PlacedItem => ({
    key: `board:${b.id}`, id: b.id, what: 'board', x: b.planPoint!.x, y: b.planPoint!.y, label: b.id, detail: b.name, symbol: { shape: 'rect', text: 'DB', plan: boardSymbolOf(p, b) }, room: b.location
  }));
  const accs = (p.cadAccessories ?? []).filter((d) => d.buildingId === level.building && d.levelId === level.level).map((d): PlacedItem => {
    const f = d.feederId ? p.feeders.find((x) => x.id === d.feederId) : undefined;
    return { key: `acc:${d.id}`, id: d.id, what: 'acc', x: d.x, y: d.y, label: PLAN_SYMBOLS[d.type]?.label ?? d.type, detail: f ? circuitLabel(p, f) : '', symbol: { shape: 'circle', text: '', plan: d.type }, room: roomName(d.x, d.y), ...(d.rot ? { rot: d.rot } : {}) };
  });
  return [...lv, ...boards, ...accs];
}

/** Places an LV palette item (a point on a circuit, or a board) at a point. */
export function placeItem(p: Project, item: PaletteItem, level: LevelRef, x: number, y: number, target: { feederId?: string; boardId?: string; rot?: number }): { project: Project; message: string } {
  if ('elv' in item.kind) throw new Error('ELV devices are placed through the ELV placement.');
  if ('lv' in item.kind) {
    const { project } = placeLvPoint(p, level, item.kind.lv, target.feederId ?? '', x, y, undefined, undefined, item.symbol.plan ? target.rot : undefined, item.variant);
    const f = project.feeders.find((q) => q.id === target.feederId)!;
    const n = f.points?.[item.kind.lv] ?? 0, max = pointMax(item.kind.lv);
    return { project, message: `${item.label} placed on ${circuitLabel(project, f)} — ${max === undefined ? n : `${n} of ${max}`} on the circuit` };
  }
  if ('acc' in item.kind) {
    const { project } = placeAccessory(p, level, item.kind.acc, x, y, { rot: target.rot, ...(item.kind.circuit ? { feederId: target.feederId } : {}) });
    return { project, message: `${item.label} placed` };
  }
  if (!target.boardId) throw new Error('Choose the board to place.');
  return { project: placeBoard(p, target.boardId, level, x, y), message: `${target.boardId} placed on the plan` };
}

/** Moves or removes a placed LV point or board. */
export function moveItem(p: Project, it: PlacedItem, x: number, y: number, level: LevelRef): Project {
  return it.what === 'lv' ? moveLvPoint(p, it.id, x, y) : it.what === 'acc' ? moveAccessory(p, it.id, x, y) : placeBoard(p, it.id, level, x, y);
}
export function removeItem(p: Project, it: PlacedItem): Project {
  if (it.what === 'lv') return removeLvPoint(p, it.id);
  if (it.what === 'acc') return removeAccessory(p, it.id);
  return { ...p, boards: p.boards.map((b) => { if (b.id !== it.id) return b; const { planPoint: _pp, ...rest } = b; return rest; }) };
}
