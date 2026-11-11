import { describe, expect, it } from 'vitest';
import { cadCommand } from './cadCommands';
import { type CtxEntry, type CtxItem } from './cadContextMenu';
import { devArg, deviceMenu, devicesInRoom, luxCheckLine, roomEntry, roomLoads, trayCheckLine, type DeviceMenuState } from './cadObjectMenus';
import type { PlacedItem } from '../../model/cadDevices';
import type { BuildingRoom, RoomType } from '../../types';

const flat = (list: CtxEntry[]): CtxItem[] => list.flatMap((x) => (x === '-' ? [] : [x, ...(x.sub ?? [])]));
const labels = (list: CtxEntry[]) => list.map((x) => (x === '-' ? '-' : x.label));
const dev = (what: PlacedItem['what'], id: string, label: string, x = 0, y = 0) => ({ key: `${what}:${id}`, what, id, label, detail: '', x, y }) as PlacedItem;
const lv: DeviceMenuState = {
  items: [dev('lv', 'P1', 'Light'), dev('lv', 'P2', 'Light')], edits: ['row', 'column', 'replace', 'circuit', 'match', 'move', 'copy', 'delete'],
  circuits: [{ id: 'Y1', label: 'DB-1/Y1 · Lighting', now: true }, { id: 'Y2', label: 'DB-1/Y2 · Lighting' }],
  swaps: [{ id: 'ltg', label: 'Light', now: true }, { id: 's13', label: 'Socket 13 A' }], types: [{ id: 'ltg', label: 'Light', count: 2 }],
  circuit: { id: 'Y1', board: 'DB-1', wired: false }, oneType: true, canShow: true
};
const board: DeviceMenuState = { ...lv, items: [dev('board', 'DB-1', 'DB-1')], edits: ['rename', 'circuits', 'move', 'delete'], circuit: undefined };
const elv: DeviceMenuState = { ...lv, items: [dev('elv', 'E1', 'Smoke detector')], edits: ['replace', 'coverage', 'match', 'move', 'copy', 'delete'], circuit: undefined, swaps: [{ id: 'heat-detector', label: 'Heat detector' }] };
const room: BuildingRoom = { id: 'R1', buildingId: 'V', levelId: 'GF', name: 'Office 1', type: 'office', areaM2: 16, outline: [[0, 0], [4, 0], [4, 4], [0, 4]] };
const office: RoomType = { id: 'office', label: 'Office', wPerM2: 100, demandFactor: 0.8 };

describe('right-click menus (phase 2): LV and ELV objects', () => {
  it('every entry runs a typed command or a page action: none without a tool behind it', () => {
    const all = [deviceMenu(lv), deviceMenu(board), deviceMenu(elv), deviceMenu({ ...lv, items: [lv.items[0], elv.items[0]], edits: ['filter', 'move', 'delete'] }), [roomEntry({ room })]];
    for (const x of all.flatMap(flat)) {
      if (x.sub) continue;
      if (x.cmd) expect(cadCommand(x.cmd), x.cmd).toBeTruthy();
      else expect(x.act, x.label).toBeTruthy();
    }
  });

  it('LV devices: Circuit ▸ (with Draw home-run), Swap device type ▸, Select same circuit / type, Show in load schedule / SLD, arrange and edits', () => {
    const m = deviceMenu(lv);
    expect(labels(m)).toEqual(['Circuit', 'Swap device type', '-', 'Select same circuit', 'Select same type', 'Show in load schedule', 'Show in SLD', '-',
      'Align in a row', 'Align in a column', 'Match to this', '-', 'Move', 'Copy', 'Erase', '-', 'Isolate', 'Count', 'Deselect all', '-', 'Properties']);
    const c = flat(m).find((x) => x.label === 'Circuit')!.sub!;
    expect(c.map((x) => [x.label, x.arg, !!x.off])).toEqual([['DB-1/Y1 · Lighting', 'circuit|Y1', true], ['DB-1/Y2 · Lighting', 'circuit|Y2', false], ['Draw home-run', 'homerun', false]]);
    expect(flat(deviceMenu({ ...lv, circuit: { ...lv.circuit!, wired: true } })).some((x) => x.label === 'Remove home-run')).toBe(true);
    // On two circuits: no Select same circuit, home-run or Show in; without the pages, no Show in.
    expect(labels(deviceMenu({ ...lv, circuit: undefined }))).not.toContain('Select same circuit');
    expect(labels(deviceMenu({ ...lv, canShow: false }))).not.toContain('Show in SLD');
  });

  it('a board: Open board, Load schedule, Show in SLD / riser, Select all fed devices, Draw home-runs, Rename, Feeder cables', () => {
    expect(labels(deviceMenu(board))).toEqual(['Open board', 'Load schedule', 'Show in SLD', 'Show in riser', '-', 'Select all fed devices', 'Draw home-runs', '-',
      'Rename board…', 'Feeder cables', '-', 'Move', 'Erase', '-', 'Isolate', 'Count', 'Deselect all', '-', 'Properties']);
  });

  it('ELV devices: Swap device (same system) ▸, Select same type, Show in ELV schedule, Coverage, Match; a mix: Filter ▸ and what they all have', () => {
    expect(labels(deviceMenu(elv))).toEqual(['Swap device (same system)', '-', 'Select same type', 'Show in ELV schedule', '-', 'Match to this', 'Coverage', '-', 'Move', 'Copy', 'Erase', '-', 'Isolate', 'Count', 'Deselect all', '-', 'Properties']);
    const mix = deviceMenu({ ...lv, items: [lv.items[0], elv.items[0]], edits: ['filter', 'move', 'delete'], types: [{ id: 'ltg', label: 'Light', count: 1 }, { id: 'smoke', label: 'Smoke detector', count: 1 }] });
    expect(labels(mix).slice(0, 4)).toEqual(['Filter', '-', 'Move', 'Erase']);
    expect(flat(mix).find((x) => x.label === 'Filter')!.sub!.map((x) => x.arg)).toEqual(['filter|ltg', 'filter|smoke']);
  });

  it('devArg: the edit and its value back from the entry', () => {
    expect(devArg('circuit|DB-1-Y1')).toEqual({ edit: 'circuit', value: 'DB-1-Y1' });
    expect(devArg('homeruns')).toEqual({ edit: 'homeruns' });
  });

  it('a room: one flyout of its tools; Fill names the ELV device chosen', () => {
    const r = roomEntry({ room, typeLabel: 'Office', elv: 'Smoke detector' });
    expect(r.label).toBe('Room Office 1');
    expect(r.sub!.map((x) => x.label)).toEqual(['Light room…', 'Lux check', 'Emergency lighting', 'Fill with Smoke detector', 'Select devices in room', 'Room loads', 'Area', 'Rename room…', 'Room type…']);
    expect(roomEntry({ room }).sub![3].label).toBe('Fill with an ELV device…');
  });

  it('room loads: W/m² × area, × the demand factor, and the devices inside', () => {
    const inside = [dev('lv', 'P1', 'Light', 1, 1), dev('lv', 'P2', 'Light', 3, 1), dev('lv', 'P3', 'Socket 13 A', 2, 3), dev('lv', 'P4', 'Light', 9, 9)];
    expect(devicesInRoom(inside, room).map((d) => d.id)).toEqual(['P1', 'P2', 'P3']);
    const l = roomLoads(room, office, inside);
    expect([+l.connectedKw.toFixed(2), +l.demandKw.toFixed(2)]).toEqual([1.6, 1.28]);
    expect(l.line).toBe('Office: 1.60 kW connected, 1.28 kW demand (100 W/m² × 16.0 m², ×0.8) · 2 Light · 1 Socket 13 A');
    expect(roomLoads({ ...room, count: 3 }, office, []).connectedKw).toBeCloseTo(4.8, 6);
    expect(roomLoads(room, undefined, []).line).toBe('0.00 kW connected, 0.00 kW demand (no room type) · no devices placed');
  });

  it('lux check and tray fill lines', () => {
    expect(luxCheckLine('Office 1', 4, 6, 500)).toBe('LUX CHECK  Office 1: 4 lights placed, 6 needed for 500 lx — 2 short');
    expect(luxCheckLine('Store', 1, 1, 150)).toBe('LUX CHECK  Store: 1 light placed, 1 needed for 150 lx — enough');
    expect(trayCheckLine(300, 32.46, 40, 300)).toBe('FILL  300 mm tray: 32.5% full (limit 40%) — OK');
    expect(trayCheckLine(100, 61, 40, 200)).toBe('FILL  100 mm tray: 61.0% full (limit 40%) — over the limit · the cables need 200 mm');
  });
});
