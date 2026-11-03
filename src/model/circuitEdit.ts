import { LIGHTING_POINTS, type Board, type Feeder, type PointType, type Project } from '../types';
import { evaluateFeeder, type FeederResult, type Status } from '../calc/electrical';
import { evaluateEarthing, type EarthingResult } from '../calc/earthing';
import { circuitCategory, circuitRef, elcbGroups, scheduleCircuits, type CircuitCategory, type ElcbGroup, type PointColumn } from '../calc/loadSchedule';
import { updateCircuit, type CircuitPatch } from './schedule';

// Helpers for the load schedule's Edit circuit dialog (CircuitEditDialog):
// which tab a field is on, which point columns to show, room presets,
// "Same as…" circuits and the live result before Save.

export type CircuitEditTab = 'loads' | 'protection' | 'general';
export type Points = Partial<Record<PointType, number>>;

/** The tab that holds a sheet column (the field the user double-clicked). */
export function tabOfField(field: string | undefined): CircuitEditTab {
  if (field === 'mcb' || field === 'wire' || field === 'ecc' || field === 'check' || field === 'elcb') return 'protection';
  if (field === 'room' || field === 'remarks' || field === 'length') return 'general';
  return 'loads';
}

const used = (points: Points | undefined) => Object.entries(points ?? {}).filter(([, n]) => (n ?? 0) > 0).map(([t]) => t as PointType);

/** Columns that fit each kind of circuit; the rest are under "More columns…". */
const LIGHTING_FIT: PointType[] = [...LIGHTING_POINTS, 'shaver'];
const POWER_FIT: PointType[] = ['s13', 's13t', 's15', 'spur'];

/** The point columns shown first: those the circuit uses, plus those that fit
 * its kind (lighting or power). A circuit with no points yet shows them all. */
export function fitColumns(columns: PointColumn[], points: Points, itemized: Set<PointType> = new Set()): PointColumn[] {
  const on = new Set([...used(points), ...itemized]);
  if (!on.size) return columns;
  const fit = [...on].every((t) => LIGHTING_FIT.includes(t)) ? LIGHTING_FIT : POWER_FIT;
  return columns.filter((c) => on.has(c.value) || fit.includes(c.value));
}

export interface RoomPreset { label: string; points: Points }

/** Typical points per room, split into the lighting and the power circuit.
 * Starting values for the engineer to change before saving. */
const ROOMS: { match: RegExp; name: string; lighting: Points; power: Points }[] = [
  { match: /bed/, name: 'Bedroom', lighting: { ltg: 4, cfan: 1 }, power: { s13: 4 } },
  { match: /majlis|living|family|lounge|sitting/, name: 'Majlis / living', lighting: { ltg: 10 }, power: { s13: 6 } },
  { match: /dining/, name: 'Dining', lighting: { ltg: 6 }, power: { s13: 4 } },
  { match: /kitchen|pantry/, name: 'Kitchen', lighting: { ltg: 8, exfan: 1 }, power: { s13: 5 } },
  { match: /bath|toilet|\bwc\b|powder/, name: 'Bathroom', lighting: { ltg: 2, exfan: 1, shaver: 1 }, power: { wh: 1 } },
  { match: /maid|driver/, name: 'Maid room', lighting: { ltg: 3, exfan: 1 }, power: { s13: 3 } },
  { match: /corridor|lobby|passage|hall|stair/, name: 'Corridor', lighting: { ltg: 6 }, power: { s13: 2 } },
  { match: /extern|outdoor|garden|facade|boundary/, name: 'External', lighting: { ltg: 10 }, power: { s13: 2 } },
  { match: /store|laundry|utility/, name: 'Store / laundry', lighting: { ltg: 2 }, power: { s15: 2 } }
];

const samePoints = (a: Points, b: Points) => {
  const keys = new Set([...used(a), ...used(b)]);
  return [...keys].every((k) => (a[k] ?? 0) === (b[k] ?? 0));
};
const pointsText = (p: Points, label: (t: PointType) => string) => used(p).map((t) => `${p[t]} ${label(t)}`).join(' · ');

/** Points the room name suggests: the same room on other DBs of the project
 * first, then the typical room set. "lighting" / "socket" in the name, or the
 * circuit's current points, pick the lighting or the power set. */
export function roomPresets(project: Project, f: Feeder, room: string, points: Points, label: (t: PointType) => string): RoomPreset[] {
  const name = room.trim().toLowerCase();
  if (!name) return [];
  const kind: CircuitCategory | undefined = /light|ltg/.test(name) ? 'lighting' : /socket|power|s\/o/.test(name) ? 'power' : used(points).length ? circuitCategory({ ...f, points }) : undefined;
  const out: RoomPreset[] = [];
  const seen: Points[] = [points];
  const add = (prefix: string, p: Points) => {
    if (!used(p).length || seen.some((s) => samePoints(s, p))) return;
    seen.push(p);
    out.push({ label: `${prefix}: ${pointsText(p, label)}`, points: p });
  };
  for (const c of project.feeders) {
    if (c.id === f.id || c.boardId === f.boardId || (c.room ?? '').trim().toLowerCase() !== name || c.way === undefined) continue;
    add(`As ${c.boardId} ${circuitRef(c) ?? c.id}`, c.points ?? {});
  }
  const r = ROOMS.find((x) => x.match.test(name));
  if (r) {
    if (kind !== 'power') add(`${r.name} lighting`, r.lighting);
    if (kind !== 'lighting') add(`${r.name} power`, r.power);
  }
  return out.slice(0, 4);
}

export interface SameAsOption { id: string; label: string; points: Points }

/** Other circuits on the same DB that have points, for "Same as…". */
export function sameAsOptions(project: Project, f: Feeder, label: (t: PointType) => string): SameAsOption[] {
  return scheduleCircuits(project, f.boardId)
    .filter((c) => c.id !== f.id && used(c.points).length)
    .map((c) => ({ id: c.id, label: `${circuitRef(c) ?? c.id} ${c.room ?? c.name} (${pointsText(c.points!, label)})`, points: { ...c.points } }));
}

export interface CircuitPreview {
  feeder: Feeder;
  result: FeederResult;
  earthing: EarthingResult;
  elcb?: ElcbGroup;
  status: Status;
}

const worst = (a: Status, b: Status): Status => (a === 'bad' || b === 'bad' ? 'bad' : a === 'warn' || b === 'warn' ? 'warn' : 'ok');

/** The circuit as it would be after Save: sized again unless sized by hand,
 * with its cable, voltage-drop and earth-fault results and its ELCB. */
export function previewCircuit(project: Project, board: Board, id: string, patch: CircuitPatch): CircuitPreview | undefined {
  const next = updateCircuit(project, id, patch);
  const feeder = next.feeders.find((x) => x.id === id);
  if (!feeder) return undefined;
  const result = evaluateFeeder(next, feeder);
  const earthing = evaluateEarthing(next, feeder);
  const nb = next.boards.find((b) => b.id === board.id) ?? board;
  const elcb = elcbGroups(next, nb).find((g) => g.circuits.some((c) => c.id === id));
  return { feeder, result, earthing, ...(elcb ? { elcb } : {}), status: worst(result.status, earthing.status) };
}
