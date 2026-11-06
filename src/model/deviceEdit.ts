import { rule } from '../database/catalog';
import { copyElv, elvAlike, isElvType, moveElv, placeElvAt, removeElvs, replaceElv } from '../components/elv/elvCadDevices';
import { LV_PALETTE, moveItem, placeLvPoint, removeItem, type PlacedItem } from './cadDevices';
import { updateCircuit } from './schedule';
import type { LevelRef } from './levels';
import type { PointType, Project } from '../types';

/** Design CAD → Edit devices: changes to several placed devices at once (metres on the level's plan). Every change is
 * one project, so one undo step, and keeps the circuits' point counts as Add device does. */

type Pt = [number, number];
export type DeviceEdit = 'filter' | 'row' | 'column' | 'space' | 'array' | 'replace' | 'circuit' | 'coverage' | 'match' | 'move' | 'copy' | 'delete' | 'rename' | 'circuits';

const lvOf = (p: Project, id: string) => (p.lvPoints ?? []).find((d) => d.id === id);
const elvOf = (p: Project, id: string) => (p.elvDevices ?? []).find((d) => d.id === id);
/** 'lv' | 'elv' | 'board', and an emergency light or sign apart (it keeps its type). */
const family = (it: PlacedItem) => it.what;

/** The type of a placed device: an LV point type, an ELV device type or 'board'. */
export function typeOf(p: Project, it: PlacedItem): string {
  if (it.what === 'lv') return lvOf(p, it.id)?.type ?? '';
  if (it.what === 'elv') return elvOf(p, it.id)?.type ?? '';
  return 'board';
}

/** Devices in a window (two opposite corners): wholly inside it, or (`crossing`) also those it touches; `r` is the
 * symbol's radius. */
export function inWindow(items: PlacedItem[], a: Pt, b: Pt, crossing: boolean, r: number): PlacedItem[] {
  const [x0, x1, y0, y1] = [Math.min(a[0], b[0]), Math.max(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[1], b[1])];
  const k = crossing ? r : -r;
  return items.filter((d) => d.x >= x0 - k && d.x <= x1 + k && d.y >= y0 - k && d.y <= y1 + k);
}

/** What the toolbar offers for what is picked: for one device by its kind, for several the edits they all have, with
 * Align and Space equally first, and Filter when the types are mixed. */
export function editsFor(p: Project, items: PlacedItem[]): DeviceEdit[] {
  if (!items.length) return [];
  const one = (it: PlacedItem): DeviceEdit[] => it.what === 'board' ? ['rename', 'circuits', 'move', 'delete']
    : it.what === 'elv' ? ['replace', 'coverage', 'match', 'move', 'copy', 'delete']
    : [...(typeOf(p, it) === 'ltg' && !lvOf(p, it.id)?.emergency ? ['array' as const] : []), ...(lvOf(p, it.id)?.emergency ? [] : ['replace' as const]), 'circuit', 'match', 'move', 'copy', 'delete'];
  let common = one(items[0]).filter((e) => items.every((it) => one(it).includes(e)));
  if (items.length > 1) common = common.filter((e) => e !== 'array' && e !== 'rename' && e !== 'circuits');
  if (new Set(items.map(family)).size > 1) common = common.filter((e) => e !== 'replace');
  const arrange: DeviceEdit[] = items.length > 1 ? ['row', 'column', ...(items.length > 2 ? ['space' as const] : [])] : [];
  const mixed: DeviceEdit[] = new Set(items.map((it) => typeOf(p, it))).size > 1 ? ['filter'] : [];
  return [...mixed, ...arrange, ...common];
}

/** What a device can be replaced with: another LV point type, or another ELV device of the same system. */
export function replacements(p: Project, items: PlacedItem[]): { id: string; label: string }[] {
  if (!items.length || new Set(items.map(family)).size > 1) return [];
  if (items[0].what === 'lv') return LV_PALETTE.filter((x) => 'lv' in x.kind).map((x) => ({ id: x.id, label: x.label }));
  return items[0].what === 'elv' ? elvAlike(items.map((it) => typeOf(p, it))) : [];
}

/** New positions in a row (the average Y), a column (the average X), or spread evenly between the two outer devices
 * along the longer side. */
export function arranged(items: PlacedItem[], how: 'row' | 'column' | 'space'): Map<string, Pt> {
  const out = new Map<string, Pt>();
  if (items.length < 2) return out;
  const avg = (k: 'x' | 'y') => items.reduce((t, d) => t + d[k], 0) / items.length;
  if (how === 'row') { const y = avg('y'); items.forEach((d) => out.set(d.key, [d.x, y])); return out; }
  if (how === 'column') { const x = avg('x'); items.forEach((d) => out.set(d.key, [x, d.y])); return out; }
  const span = (k: 'x' | 'y') => Math.max(...items.map((d) => d[k])) - Math.min(...items.map((d) => d[k]));
  const k = span('x') >= span('y') ? 'x' : 'y';
  const s = [...items].sort((a, b) => a[k] - b[k]);
  const [a, b] = [s[0], s[s.length - 1]];
  s.forEach((d, i) => { const f = i / (s.length - 1); out.set(d.key, [a.x + f * (b.x - a.x), a.y + f * (b.y - a.y)]); });
  return out;
}

/** Moves devices to new positions (key → metres). */
export function moveDevices(p: Project, items: PlacedItem[], to: Map<string, Pt>, level: LevelRef): Project {
  let next = p;
  for (const it of items) {
    const at = to.get(it.key);
    if (!at) continue;
    next = it.what === 'elv' ? moveElv(next, it.id, at[0], at[1]) : moveItem(next, it, at[0], at[1], level);
  }
  return next;
}

/** Copies devices by (dx, dy) metres: LV points on their circuits, ELV devices of their type (a board is one item). */
export function copyDevices(p: Project, items: PlacedItem[], dx: number, dy: number, level: LevelRef): { project: Project; copied: number } {
  let next = p, copied = 0;
  for (const it of items) {
    if (it.what === 'lv') {
      const d = lvOf(p, it.id);
      if (!d) continue;
      next = placeLvPoint(next, level, d.type, d.feederId, it.x + dx, it.y + dy, d.emergency).project;
    } else if (it.what === 'elv') {
      const c = copyElv(next, it.id, level, it.x + dx, it.y + dy);
      if (!c) continue;
      next = c;
    } else continue;
    copied += 1;
  }
  return { project: next, copied };
}

/** Deletes devices: LV points come off their circuits' counts, boards off the plan. */
export function deleteDevices(p: Project, items: PlacedItem[]): Project {
  const elv = items.filter((it) => it.what === 'elv').map((it) => it.id);
  let next = elv.length ? removeElvs(p, elv) : p;
  for (const it of items) if (it.what !== 'elv') next = removeItem(next, it);
  return next;
}

const recount = (p: Project, feederId: string, type: PointType, delta: number): Project => {
  const f = p.feeders.find((x) => x.id === feederId);
  if (!f) return p;
  return updateCircuit(p, feederId, { points: { ...(f.points ?? {}), [type]: Math.max(0, (f.points?.[type] ?? 0) + delta) } });
};

/** Replaces devices with another type: LV points stay on their circuits (counted as the new type), ELV devices stay in
 * their system. Emergency lights and signs keep their type. */
export function replaceDevices(p: Project, items: PlacedItem[], type: string): { project: Project; changed: number } {
  let next = p, changed = 0;
  for (const it of items) {
    if (it.what === 'lv') {
      const d = lvOf(next, it.id);
      if (!d || d.emergency || d.type === type || !LV_PALETTE.some((x) => 'lv' in x.kind && x.kind.lv === type)) continue;
      next = { ...next, lvPoints: (next.lvPoints ?? []).map((x) => (x.id === d.id ? { ...x, type: type as PointType } : x)) };
      next = recount(recount(next, d.feederId, d.type, -1), d.feederId, type as PointType, 1);
      changed += 1;
    } else if (it.what === 'elv') {
      const r = replaceElv(next, it.id, type);
      if (!r) continue;
      next = r;
      changed += 1;
    }
  }
  return { project: next, changed };
}

/** Moves LV points to another circuit: off the old circuit's count, onto the new one's. */
export function toCircuit(p: Project, items: PlacedItem[], feederId: string): { project: Project; changed: number } {
  if (!p.feeders.some((f) => f.id === feederId)) throw new Error('Choose the circuit.');
  let next = p, changed = 0;
  for (const it of items) {
    const d = it.what === 'lv' ? lvOf(next, it.id) : undefined;
    if (!d || d.feederId === feederId) continue;
    next = { ...next, lvPoints: (next.lvPoints ?? []).map((x) => (x.id === d.id ? { ...x, feederId } : x)) };
    next = recount(recount(next, d.feederId, d.type, -1), feederId, d.type, 1);
    changed += 1;
  }
  return { project: next, changed };
}

/** A circuit's points of each type after the picked LV points move onto it, and the most allowed (Rules sheet: lighting
 * points and 13 A sockets per circuit) where one is over. */
export function circuitAfter(p: Project, items: PlacedItem[], feederId: string): { points: number; over?: { type: PointType; n: number; max: number } } {
  const f = p.feeders.find((x) => x.id === feederId);
  const pts: Partial<Record<PointType, number>> = { ...(f?.points ?? {}) };
  for (const it of items) {
    const d = it.what === 'lv' ? lvOf(p, it.id) : undefined;
    if (d && d.feederId !== feederId) pts[d.type] = (pts[d.type] ?? 0) + 1;
  }
  const max: Partial<Record<PointType, number>> = { ltg: rule('maxLtgPerCircuit'), s13: rule('maxS13PerCircuit') };
  const over = (Object.keys(max) as PointType[]).map((t) => ({ type: t, n: pts[t] ?? 0, max: max[t]! })).find((x) => x.n > x.max);
  return { points: Object.values(pts).reduce((t, n) => t + (n ?? 0), 0), ...(over ? { over } : {}) };
}

/** Match: the target takes the source's circuit (LV) and, if asked, its type. An ELV device takes the type only (its
 * system goes with the type). */
export function matchDevice(p: Project, from: PlacedItem, target: PlacedItem, what: { circuit: boolean; type: boolean }): Project {
  let next = p;
  if (what.type && from.what === target.what) next = replaceDevices(next, [target], typeOf(p, from)).project;
  const src = from.what === 'lv' ? lvOf(p, from.id) : undefined;
  if (what.circuit && src && target.what === 'lv') next = toCircuit(next, [target], src.feederId).project;
  return next;
}

/** Positions of N devices along a line: by number or by spacing (metres), half a spacing from each end or on the ends. */
export function alongLine(a: Pt, b: Pt, by: { count: number } | { spacing: number }, ends: 'half' | 'on'): Pt[] {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (len < 1e-9) return [];
  const n = 'count' in by ? Math.max(1, Math.round(by.count))
    : by.spacing > 0 ? Math.max(1, Math.floor(len / by.spacing + 1e-9) + (ends === 'on' ? 1 : 0)) : 0;
  return Array.from({ length: n }, (_, i) => {
    const f = ends === 'half' ? (i + 0.5) / n : n === 1 ? 0.5 : i / (n - 1);
    return [a[0] + f * (b[0] - a[0]), a[1] + f * (b[1] - a[1])] as Pt;
  });
}

/** Places devices along a line: LV points on the circuit chosen, or ELV devices. */
export function placeAlong(p: Project, level: LevelRef, type: string, feederId: string, at: Pt[]): { project: Project; placed: number } {
  if (!at.length) throw new Error('Draw the line first.');
  if (isElvType(type)) return { project: placeElvAt(p, type, level, at), placed: at.length };
  let next = p;
  for (const [x, y] of at) next = placeLvPoint(next, level, type as PointType, feederId, x, y).project;
  return { project: next, placed: at.length };
}

/** Every device on the circuits of a board, on a level. */
export const onBoard = (p: Project, items: PlacedItem[], boardId: string): PlacedItem[] =>
  items.filter((it) => it.what === 'lv' && p.feeders.find((f) => f.id === lvOf(p, it.id)?.feederId)?.boardId === boardId);

/** Renames a board (its name; the ID stays, as circuits and cables refer to it). */
export function renameBoard(p: Project, boardId: string, name: string): Project {
  const n = name.trim();
  if (!n) throw new Error('Type the new name.');
  return { ...p, boards: p.boards.map((b) => (b.id === boardId ? { ...b, name: n } : b)) };
}

/** "4 × Light, 1 × Twin socket" — what is picked, by type or circuit. */
export function countBy(items: PlacedItem[], key: (it: PlacedItem) => string): string {
  const n = new Map<string, number>();
  for (const it of items) n.set(key(it), (n.get(key(it)) ?? 0) + 1);
  return [...n].map(([k, c]) => `${c} × ${k}`).join(', ');
}
