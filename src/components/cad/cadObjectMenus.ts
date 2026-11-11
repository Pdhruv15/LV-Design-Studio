import { inside } from '../../model/cadMeasure';
import type { PlacedItem } from '../../model/cadDevices';
import type { DeviceEdit } from '../../model/deviceEdit';
import type { BuildingRoom, RoomType } from '../../types';
import { tidy, type CtxEntry, type CtxItem } from './cadContextMenu';

/** Design CAD: the right-click menus of LV and ELV objects (phase 2 of the context-menu plan, docs/notes/Future
 * development/UI UX proposals - 2026-11-11 - Context-aware right-click menus.md): devices, boards, ELV devices and
 * rooms. Pure, as cadContextMenu.ts: each entry is a typed command (`cmd`) or a page action (`act`: 'dev' runs a device
 * edit, its `arg` "edit|value"; 'room' a room action on the room under the cursor). */

/** What the page opens from a menu: a board's load schedule, the SLD at a circuit or board, a board's own diagram, the
 * riser, the cable schedule of a board, the ELV page, the drawing register (sheet list). */
export type CadShow = { to: 'load-schedule' | 'sld' | 'board' | 'riser' | 'cable-schedule' | 'elv' | 'drawing-register'; board?: string; feeder?: string };

/** Device edits the menu adds to those of the toolbar (deviceEdit.ts). */
export type DeviceMore = 'samecircuit' | 'sametype' | 'homerun' | 'homeruns' | 'schedule' | 'sld' | 'board' | 'riser' | 'feeder' | 'elvschedule';

export interface DeviceMenuState {
  /** The devices picked. */
  items: readonly PlacedItem[];
  /** The toolbar's edits for them (editsFor). */
  edits: readonly DeviceEdit[];
  /** Circuit ▸: the circuits to put LV devices on ('now' the one they are all on). */
  circuits: readonly { id: string; label: string; now?: boolean }[];
  /** Swap device type ▸ (replacements). */
  swaps: readonly { id: string; label: string; now?: boolean }[];
  /** Filter ▸: the types picked, with how many. */
  types: readonly { id: string; label: string; count: number }[];
  /** The LV devices picked are all on this circuit (wired: it has its home run drawn). */
  circuit?: { id: string; board: string; wired: boolean };
  /** One type picked. */
  oneType: boolean;
  /** The page can open the load schedule, SLD and ELV pages. */
  canShow: boolean;
}

const dev = (label: string, edit: DeviceEdit | DeviceMore, arg?: string, key?: string, off?: boolean): CtxItem => ({ label, act: 'dev', arg: arg === undefined ? edit : `${edit}|${arg}`, ...(key ? { key } : {}), ...(off ? { off } : {}) });
/** "edit|value" back into the edit and its value. */
export function devArg(arg: string): { edit: DeviceEdit | DeviceMore; value?: string } {
  const i = arg.indexOf('|');
  return i < 0 ? { edit: arg as DeviceEdit } : { edit: arg.slice(0, i) as DeviceEdit, value: arg.slice(i + 1) };
}

/** The end of every object menu: Isolate ▸, Count, Deselect all, Properties. */
const tail = (): CtxEntry[] => ['-',
  { label: 'Isolate', sub: [{ label: 'Isolate objects', cmd: 'ISOLATEOBJECTS' }, { label: 'Hide objects', cmd: 'HIDEOBJECTS' }, { label: 'End object isolation', cmd: 'UNISOLATEOBJECTS' }] },
  { label: 'Count', cmd: 'COUNT' },
  { label: 'Deselect all', key: 'Esc', act: 'deselect' }, '-',
  { label: 'Properties', key: 'Ctrl+1', act: 'properties' }];

/** Align row / column, Space equally, Array on line, Match, Coverage: those the toolbar has for them. */
function arrange(s: DeviceMenuState): CtxEntry[] {
  const has = (e: DeviceEdit) => s.edits.includes(e);
  return [
    ...(has('row') ? [dev('Align in a row', 'row')] : []), ...(has('column') ? [dev('Align in a column', 'column')] : []),
    ...(has('space') ? [dev('Space equally', 'space')] : []), ...(has('array') ? [dev('Array on line…', 'array', undefined, 'ARL')] : []),
    ...(has('match') ? [dev('Match to this', 'match', undefined, 'MA')] : []), ...(has('coverage') ? [dev('Coverage', 'coverage', undefined, 'COV')] : [])
  ];
}
const modify = (s: DeviceMenuState): CtxEntry[] => [
  ...(s.edits.includes('move') ? [dev('Move', 'move', undefined, 'M')] : []), ...(s.edits.includes('copy') ? [dev('Copy', 'copy', undefined, 'CO')] : []),
  ...(s.edits.includes('delete') ? [dev('Erase', 'delete', undefined, 'Del')] : [])
];
const filter = (s: DeviceMenuState): CtxEntry[] => (s.edits.includes('filter') ? [{ label: 'Filter', sub: s.types.map((t) => dev(`${t.label} only`, 'filter', t.id, String(t.count))) }] : []);

/** The menu of the devices picked: LV devices (lights, sockets, switches…), one board, ELV devices, or a mix. */
export function deviceMenu(s: DeviceMenuState): CtxEntry[] {
  const fam = new Set(s.items.map((d) => d.what));
  const what = fam.size > 1 ? 'mixed' : s.items[0]?.what;
  if (what === 'board' && s.items.length === 1) {
    return tidy([
      ...(s.canShow ? [dev('Open board', 'board'), dev('Load schedule', 'schedule'), dev('Show in SLD', 'sld'), dev('Show in riser', 'riser'), '-' as const] : []),
      dev('Select all fed devices', 'circuits'), dev('Draw home-runs', 'homeruns', undefined, 'WC'), '-',
      dev('Rename board…', 'rename'), ...(s.canShow ? [dev('Feeder cables', 'feeder')] : []), '-',
      ...modify(s), ...tail()
    ]);
  }
  if (what === 'lv') {
    const c = s.circuit;
    return tidy([
      ...filter(s),
      ...(s.edits.includes('circuit') ? [{ label: 'Circuit', sub: [...s.circuits.map((x) => dev(x.label, 'circuit', x.id, x.now ? 'now' : undefined, x.now)),
        ...(c ? [dev(c.wired ? 'Remove home-run' : 'Draw home-run', 'homerun', undefined, 'W1')] : [])] }] : []),
      ...(s.edits.includes('replace') && s.swaps.length ? [{ label: 'Swap device type', sub: s.swaps.map((x) => dev(x.label, 'replace', x.id, x.now ? 'now' : undefined, x.now)) }] : []), '-',
      ...(c ? [dev('Select same circuit', 'samecircuit')] : []), ...(s.oneType ? [dev('Select same type', 'sametype')] : []),
      ...(c && s.canShow ? [dev('Show in load schedule', 'schedule'), dev('Show in SLD', 'sld')] : []), '-',
      ...arrange(s), '-', ...modify(s), ...tail()
    ]);
  }
  if (what === 'elv') {
    return tidy([
      ...filter(s),
      ...(s.edits.includes('replace') && s.swaps.length ? [{ label: 'Swap device (same system)', sub: s.swaps.map((x) => dev(x.label, 'replace', x.id, x.now ? 'now' : undefined, x.now)) }] : []), '-',
      ...(s.oneType ? [dev('Select same type', 'sametype')] : []), ...(s.canShow ? [dev('Show in ELV schedule', 'elvschedule')] : []), '-',
      ...arrange(s), '-', ...modify(s), ...tail()
    ]);
  }
  // A mix (or several boards): what they all have.
  return tidy([...filter(s), '-', ...arrange(s), '-', ...modify(s), ...tail()]);
}

/** The room under the cursor, on the blank-canvas menu: one flyout of the room's tools. */
export interface RoomMenuState {
  room: BuildingRoom;
  /** The room type's name. */
  typeLabel?: string;
  /** The ELV device chosen in the Devices panel (Fill room with it). */
  elv?: string;
}
export function roomEntry(s: RoomMenuState): CtxItem {
  const r = (label: string, arg: string, key?: string): CtxItem => ({ label, act: 'room', arg, ...(key ? { key } : {}) });
  return {
    label: `Room ${s.room.name}`,
    sub: [r('Light room…', 'lux', 'LUX'), r('Lux check', 'luxcheck'), r('Emergency lighting', 'em', 'EM'), r(s.elv ? `Fill with ${s.elv}` : 'Fill with an ELV device…', 'fill', 'FILL'),
      r('Select devices in room', 'select'), r('Room loads', 'loads'), r('Area', 'area'), r('Rename room…', 'rename'), r('Room type…', 'type', s.typeLabel)]
  };
}

type Pt = [number, number];
/** The devices whose point (metres on the plan) is inside the room's outline. */
export function devicesInRoom(items: readonly PlacedItem[], room: BuildingRoom): PlacedItem[] {
  const o = room.outline;
  if (!o || o.length < 3) return [];
  return items.filter((d) => inside([d.x, d.y] as Pt, o));
}

/** Room loads: the connected load from the room type's W/m² over its area, the demand after its demand factor, and the
 * devices placed in it by kind ("6 Lighting · 4 Socket"). */
export function roomLoads(room: BuildingRoom, type: RoomType | undefined, placed: readonly PlacedItem[]): { connectedKw: number; demandKw: number; line: string } {
  const n = room.count ?? 1;
  const connectedKw = type ? (type.wPerM2 * room.areaM2 * n) / 1000 : 0;
  const demandKw = type ? connectedKw * type.demandFactor : 0;
  const by = new Map<string, number>();
  for (const d of devicesInRoom(placed, room)) by.set(d.label, (by.get(d.label) ?? 0) + 1);
  const devices = [...by].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k, c]) => `${c} ${k}`).join(' · ');
  return { connectedKw, demandKw, line: `${type ? `${type.label}: ` : ''}${connectedKw.toFixed(2)} kW connected, ${demandKw.toFixed(2)} kW demand${type ? ` (${type.wPerM2} W/m² × ${room.areaM2.toFixed(1)} m²${n > 1 ? ` × ${n}` : ''}, ×${type.demandFactor})` : ' (no room type)'}${devices ? ` · ${devices}` : ' · no devices placed'}` };
}

/** Lux check: the lights placed in the room against the number the lumen method asks for. */
export function luxCheckLine(name: string, placed: number, needed: number, lux: number): string {
  const verdict = placed >= needed ? 'enough' : `${needed - placed} short`;
  return `LUX CHECK  ${name}: ${placed} light${placed === 1 ? '' : 's'} placed, ${needed} needed for ${lux} lx — ${verdict}`;
}

/** The tray-route side of a cable tray drawn: the route's cables, and its fill at the drawn width. */
export function trayCheckLine(widthMm: number, fillPct: number, limitPct: number, autoWidthMm: number): string {
  const ok = fillPct <= limitPct;
  return `FILL  ${widthMm} mm tray: ${fillPct.toFixed(1)}% full (limit ${limitPct}%) — ${ok ? 'OK' : 'over the limit'}${autoWidthMm !== widthMm ? ` · the cables need ${autoWidthMm} mm` : ''}`;
}

