import { circuitLabel, LV_PALETTE, type PlacedItem } from './cadDevices';
import { inside } from './cadMeasure';
import { pointMax } from './circuitRoom';
import type { LevelRef } from './levels';
import type { BuildingRoom, PointType, Project } from '../types';

/** Check level (CHK): what is missing, over a limit or left outside a room on one level, with the counts by type.
 * Worked out on demand from the rooms, the placed items and the circuits; the lumen-method need of a room and the ELV
 * coverage come from the page (they use the Light room settings and the ELV module). */
export interface LevelFinding {
  /** The line as shown. */
  text: string;
  /** Nothing to do (a tick), or something to look at (a warning). */
  ok: boolean;
  /** Placed items to pick and the window to go to (metres on the plan); none for a line that is only a summary. */
  keys?: string[];
  box?: { x0: number; y0: number; x1: number; y1: number };
  /** The tool that fixes it: Light room for this room, or Coverage for this system. */
  fix?: { tool: 'lux'; roomId: string } | { tool: 'coverage'; system: string };
}
export interface LevelCheckGroup { id: 'lighting' | 'sockets' | 'circuits' | 'devices' | 'coverage' | 'boards'; title: string; findings: LevelFinding[] }
export interface LevelCheck { counts: string; groups: LevelCheckGroup[]; toLook: number; rooms: number; devices: number }
export interface LevelCheckInput {
  /** Rooms of the level that have an outline. */
  rooms: BuildingRoom[];
  /** Everything placed on the level (LV points, accessories, boards, ELV devices), as the page lists it. */
  placed: PlacedItem[];
  /** The lights a room needs for its target, by the lumen method (undefined: cannot be worked out). */
  lightNeed: (room: BuildingRoom) => { needed: number; lux: number } | undefined;
  /** ELV coverage by system, for the systems with devices on the level. */
  coverage: { system: string; label: string; roomsNotCovered: number }[];
}

type Box = NonNullable<LevelFinding['box']>;
const GROW_M = 2;
const s = (n: number) => (n === 1 ? '' : 's');

const boxOfRoom = (r: BuildingRoom): Box => {
  const xs = r.outline!.map((q) => q[0]), ys = r.outline!.map((q) => q[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
};
/** The window of one or several items: their points grown by 2 m each way. */
const boxOfItems = (pts: { x: number; y: number }[]): Box => ({
  x0: Math.min(...pts.map((q) => q.x)) - GROW_M, y0: Math.min(...pts.map((q) => q.y)) - GROW_M,
  x1: Math.max(...pts.map((q) => q.x)) + GROW_M, y1: Math.max(...pts.map((q) => q.y)) + GROW_M
});

export function checkLevel(p: Project, level: LevelRef, input: LevelCheckInput): LevelCheck {
  const { rooms, placed } = input;
  const lvType = (it: PlacedItem): PointType | undefined => it.what === 'lv' ? (p.lvPoints ?? []).find((d) => d.id === it.id)?.type : undefined;
  const lvPlaced = placed.filter((it) => it.what === 'lv');
  const inRoom = (r: BuildingRoom, it: PlacedItem) => inside([it.x, it.y], r.outline!);
  const groups: LevelCheckGroup[] = [];

  // Lighting: lights of each room against the lumen-method need.
  const lighting: LevelFinding[] = [];
  let lightOk = 0;
  for (const r of rooms) {
    const n = lvPlaced.filter((it) => lvType(it) === 'ltg' && inRoom(r, it)).length;
    const need = input.lightNeed(r);
    if (n === 0) lighting.push({ text: `${r.name} — no light`, ok: false, box: boxOfRoom(r), fix: { tool: 'lux', roomId: r.id } });
    else if (need && n < need.needed) lighting.push({ text: `${r.name} — ${n} light${s(n)}, ${need.needed} needed for ${need.lux} lx`, ok: false, box: boxOfRoom(r), fix: { tool: 'lux', roomId: r.id } });
    else lightOk++;
  }
  if (lightOk) lighting.push({ text: `${lightOk} room${s(lightOk)} meet${lightOk === 1 ? 's' : ''} ${lightOk === 1 ? 'its' : 'their'} target`, ok: true });
  if (lighting.length) groups.push({ id: 'lighting', title: 'Lighting', findings: lighting });

  // Sockets: a room with an outline should have one.
  const sockets: LevelFinding[] = [];
  let socketOk = 0;
  for (const r of rooms) {
    const has = lvPlaced.some((it) => ['s13', 's13t', 's15'].includes(lvType(it) ?? '') && inRoom(r, it));
    if (has) socketOk++;
    else sockets.push({ text: `${r.name} — no socket`, ok: false, box: boxOfRoom(r) });
  }
  if (socketOk) sockets.push({ text: `${socketOk} room${s(socketOk)} ${socketOk === 1 ? 'has' : 'have'} a socket`, ok: true });
  if (sockets.length) groups.push({ id: 'sockets', title: 'Sockets', findings: sockets });

  // Circuits: over the Rules-sheet maximum, and points whose circuit was removed.
  const circuits: LevelFinding[] = [];
  const pointsOf = (feederId: string) => (p.lvPoints ?? []).filter((d) => d.feederId === feederId && d.buildingId === level.building && d.levelId === level.level);
  const onLevel = (p.lvPoints ?? []).filter((d) => d.buildingId === level.building && d.levelId === level.level);
  for (const f of p.feeders) {
    const mine = pointsOf(f.id);
    if (!mine.length) continue;
    for (const type of ['ltg', 's13'] as const) {
      const max = pointMax(type), n = f.points?.[type] ?? 0;
      if (max === undefined || n <= max) continue;
      const of = mine.filter((d) => d.type === type);
      circuits.push({
        text: `${circuitLabel(p, f)} — ${n} ${type === 'ltg' ? 'lighting points' : '13 A sockets'}, maximum ${max}`, ok: false,
        keys: (of.length ? of : mine).map((d) => `lv:${d.id}`), box: boxOfItems(of.length ? of : mine)
      });
    }
  }
  const removed = onLevel.filter((d) => !p.feeders.some((f) => f.id === d.feederId));
  if (removed.length) circuits.push({ text: `${removed.length} device${s(removed.length)} on a circuit that was removed`, ok: false, keys: removed.map((d) => `lv:${d.id}`), box: boxOfItems(removed) });
  if (!circuits.length && onLevel.length) circuits.push({ text: 'No circuit of this level is over its maximum', ok: true });
  if (circuits.length) groups.push({ id: 'circuits', title: 'Circuits', findings: circuits });

  // Devices outside every room outline.
  if (rooms.length) {
    const out = placed.filter((it) => it.what !== 'board' && !rooms.some((r) => inRoom(r, it)));
    if (out.length) groups.push({ id: 'devices', title: 'Devices', findings: [{ text: `${out.length} device${s(out.length)} outside every room`, ok: false, keys: out.map((it) => it.key), box: boxOfItems(out) }] });
  }

  // ELV coverage by system.
  const coverage: LevelFinding[] = input.coverage.map((c) => c.roomsNotCovered > 0
    ? { text: `${c.label} — ${c.roomsNotCovered} room${s(c.roomsNotCovered)} not fully covered`, ok: false, fix: { tool: 'coverage', system: c.system } }
    : { text: `${c.label} — covered`, ok: true });
  if (coverage.length) groups.push({ id: 'coverage', title: 'ELV coverage', findings: coverage });

  // Boards of this level that are not on the plan.
  const levelBoards = p.boards.filter((b) => b.level?.building === level.building && b.level?.level === level.level);
  const missing = levelBoards.filter((b) => !b.planPoint);
  const boards: LevelFinding[] = missing.map((b) => ({ text: `${b.id} is on this level but not on the plan`, ok: false }));
  if (levelBoards.length && !missing.length) boards.push({ text: 'Every board of this level is on the plan', ok: true });
  if (boards.length) groups.push({ id: 'boards', title: 'Boards', findings: boards });

  // Counts by type.
  const switches = new Set(LV_PALETTE.filter((x) => x.group === 'Switches' && 'acc' in x.kind).map((x) => (x.kind as { acc: string }).acc));
  const accOf = (it: PlacedItem) => (p.cadAccessories ?? []).find((d) => d.id === it.id)?.type ?? '';
  const lights = lvPlaced.filter((it) => lvType(it) === 'ltg').length;
  const sock = lvPlaced.filter((it) => ['s13', 's13t', 's15'].includes(lvType(it) ?? '')).length;
  const sw = placed.filter((it) => it.what === 'acc' && switches.has(accOf(it))).length;
  const other = lvPlaced.length - lights - sock;
  const elv = placed.filter((it) => it.what === 'elv').length;
  const bd = placed.filter((it) => it.what === 'board').length;
  const parts = [
    lights && `${lights} light${s(lights)}`, sock && `${sock} socket${s(sock)}`, sw && `${sw} switch${sw === 1 ? '' : 'es'}`,
    other && `${other} other point${s(other)}`, elv && `${elv} ELV device${s(elv)}`, bd && `${bd} board${s(bd)}`
  ].filter(Boolean);
  return {
    counts: parts.length ? parts.join(' · ') : 'Nothing placed', groups,
    toLook: groups.reduce((n, g) => n + g.findings.filter((f) => !f.ok).length, 0), rooms: rooms.length, devices: placed.length
  };
}
