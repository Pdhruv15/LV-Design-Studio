import { describe, expect, it } from 'vitest';
import { cadCommand } from './cadCommands';
import { allItems, isItem, type CtxEntry } from './cadContextMenu';
import { MENU_ICONS } from './cadMenuIcons';
import { devArg, deviceHead, deviceMenu, devicesInRoom, luxCheckLine, roomEntry, roomLoads, trayCheckLine, type DeviceMenuState } from './cadObjectMenus';
import type { PlacedItem } from '../../model/cadDevices';
import type { BuildingRoom, RoomType } from '../../types';

const flat = allItems;
const labels = (list: CtxEntry[]) => list.map((x) => (x === '-' ? '-' : x.label));
const dev = (what: PlacedItem['what'], id: string, label: string, x = 0, y = 0) => ({ key: `${what}:${id}`, what, id, label, detail: what === 'lv' ? 'DB-1/Y1 · Lighting' : '', x, y }) as PlacedItem;
const lv: DeviceMenuState = {
  items: [dev('lv', 'P1', 'Light'), dev('lv', 'P2', 'Light')], edits: ['row', 'column', 'replace', 'circuit', 'match', 'move', 'copy', 'delete'],
  circuits: [{ id: 'Y1', label: 'DB-1/Y1 · Lighting', now: true }, { id: 'Y2', label: 'DB-1/Y2 · Lighting' }],
  swaps: [{ id: 'ltg', label: 'Light', now: true }, { id: 's13', label: 'Socket 13 A' }], types: [{ id: 'ltg', label: 'Light', count: 2 }],
  circuit: { id: 'Y1', board: 'DB-1', wired: false }, oneType: true, canShow: true, canUndo: true, canRedo: false, undoLabel: 'Move', propsOn: false, canPaste: false, repeat: 'DEV'
};
const board: DeviceMenuState = { ...lv, items: [dev('board', 'DB-1', 'DB-1')], edits: ['rename', 'circuits', 'move', 'delete'], circuit: undefined };
const elv: DeviceMenuState = { ...lv, items: [dev('elv', 'E1', 'Smoke detector')], edits: ['replace', 'coverage', 'match', 'move', 'copy', 'delete'], circuit: undefined, swaps: [{ id: 'heat-detector', label: 'Heat detector' }] };
const room: BuildingRoom = { id: 'R1', buildingId: 'V', levelId: 'GF', name: 'Office 1', type: 'office', areaM2: 16, outline: [[0, 0], [4, 0], [4, 4], [0, 4]] };
const office: RoomType = { id: 'office', label: 'Office', wPerM2: 100, demandFactor: 0.8 };

const COMMON_LABELS = ['Isolate', 'Pan', 'Zoom', '-', 'Properties', 'Options…'];
describe('right-click menus (phase 2): LV and ELV objects', () => {
  it('every entry, also in lists, runs a typed command or a page action: none without a tool behind it; every icon exists', () => {
    const all = [deviceMenu(lv), deviceMenu(board), deviceMenu(elv), deviceMenu({ ...lv, items: [lv.items[0], elv.items[0]], edits: ['filter', 'move', 'delete'] }), [roomEntry({ room })]];
    for (const x of all.flatMap(flat)) {
      if (x.icon) expect(MENU_ICONS[x.icon], x.icon).toBeTruthy();
      expect(x.label, x.label).not.toMatch(/[▸▾✓●]/);
      if (x.sub) continue;
      if (x.cmd) expect(cadCommand(x.cmd), x.cmd).toBeTruthy();
      else expect(x.act, x.label).toBeTruthy();
    }
  });

  it('LV devices: the one order (Repeat, Circuit, Swap, Show in, Arrange; undo; modify; view; select; palette), electrical rows in amber, Erase red, the circuit marked now', () => {
    const m = deviceMenu(lv);
    expect(labels(m)).toEqual(['Repeat DEV', '-', 'Circuit', 'Swap device type', 'Show in SLD', 'Show in load schedule', 'Arrange', '-', 'Undo Move', 'Redo', '-', 'Erase', 'Move', 'Copy selection', '-', 'Isolate', 'Pan', 'Zoom', '-',
      'Select same circuit', 'Select same type', 'Invert selection', 'Deselect all', 'Count', '-', 'Properties', 'Options…']);
    const by = (l: string) => flat(m).find((x) => x.label === l)!;
    expect(['Circuit', 'Swap device type', 'Show in SLD', 'Show in load schedule', 'Arrange'].map((l) => by(l).lv)).toEqual([true, true, true, true, true]);
    expect([by('Erase').bad, by('Erase').key, by('Move').key, by('Copy selection').key, by('Copy')]).toEqual([true, 'Del', 'M', 'CO', undefined]);
    const c = by('Circuit').sub!.filter(isItem);
    expect(c.map((x) => [x.label, x.arg, !!x.off, !!x.now])).toEqual([['DB-1/Y1 · Lighting', 'circuit|Y1', true, true], ['DB-1/Y2 · Lighting', 'circuit|Y2', false, false], ['Draw home-run', 'homerun', false, false]]);
    expect(by('Arrange').sub!.filter(isItem).map((x) => x.label)).toEqual(['Align in a row', 'Align in a column', 'Match to this']);
    expect(flat(deviceMenu({ ...lv, circuit: { ...lv.circuit!, wired: true } })).some((x) => x.label === 'Remove home-run')).toBe(true);
    // On two circuits: no Select same circuit, home-run or Show in; without the pages, no Show in.
    expect(labels(deviceMenu({ ...lv, circuit: undefined }))).not.toContain('Select same circuit');
    expect(labels(deviceMenu({ ...lv, canShow: false }))).not.toContain('Show in SLD');
    // Undo and Redo name their step; Properties follows the palette.
    expect(labels(deviceMenu({ ...lv, undoLabel: undefined, redoLabel: 'Offset', canRedo: true }))).toEqual(expect.arrayContaining(['Undo', 'Redo Offset']));
    expect([by('Properties').on, flat(deviceMenu({ ...lv, propsOn: true })).find((x) => x.label === 'Properties')!.on]).toEqual([false, true]);
    expect([by('Undo Move').off, by('Redo').off]).toEqual([false, true]);
  });

  it('the header names what is picked: n × device and its circuit; a board by id and name; a mix by count', () => {
    expect(deviceHead(lv)).toEqual({ icon: 'device', title: '2 × Light', detail: 'DB-1/Y1' });
    expect(deviceHead({ ...lv, items: [lv.items[0]] })).toMatchObject({ title: 'Light' });
    expect(deviceHead({ ...lv, circuit: undefined }).detail).toBeUndefined();
    expect(deviceHead({ items: [{ ...dev('board', 'DB-1', 'Ground floor board') }] })).toMatchObject({ title: 'DB-1', detail: 'Ground floor board' });
    expect(deviceHead({ items: [lv.items[0], elv.items[0]] })).toMatchObject({ icon: 'boxes', title: '2 devices' });
  });

  it('a board: Open board, Load schedule, Show in SLD / riser, Board tools; Erase and Move; no Copy', () => {
    expect(labels(deviceMenu(board))).toEqual(['Repeat DEV', '-', 'Open board', 'Load schedule', 'Show in SLD', 'Show in riser', 'Board tools', '-', 'Undo Move', 'Redo', '-', 'Erase', 'Move', '-', ...COMMON_LABELS.slice(0, 3), '-',
      'Invert selection', 'Deselect all', 'Count', '-', 'Properties', 'Options…']);
    expect(flat(deviceMenu(board)).find((x) => x.label === 'Board tools')!.sub!.filter(isItem).map((x) => x.label)).toEqual(['Select all fed devices', 'Draw home-runs', 'Rename board…', 'Feeder cables']);
    expect(flat(deviceMenu({ ...board, canShow: false })).find((x) => x.label === 'Board tools')!.sub!.filter(isItem).map((x) => x.label)).toEqual(['Select all fed devices', 'Draw home-runs', 'Rename board…']);
  });

  it('ELV devices: Swap device (same system), Show in ELV schedule, Coverage, Arrange; Rotate with the modify group; a mix: Arrange, modify and Filter', () => {
    expect(labels(deviceMenu(elv))).toEqual(['Repeat DEV', '-', 'Swap device (same system)', 'Show in ELV schedule', 'Coverage', 'Arrange', '-', 'Undo Move', 'Redo', '-', 'Erase', 'Move', 'Copy selection', 'Rotate (to face a point)', '-', ...COMMON_LABELS.slice(0, 3), '-',
      'Select same type', 'Invert selection', 'Deselect all', 'Count', '-', 'Properties', 'Options…']);
    expect(flat(deviceMenu(elv)).find((x) => x.label === 'Arrange')!.sub!.filter(isItem).map((x) => x.label)).toEqual(['Match to this']);
    const mix = deviceMenu({ ...lv, items: [lv.items[0], elv.items[0]], edits: ['filter', 'move', 'delete'], types: [{ id: 'ltg', label: 'Light', count: 1 }, { id: 'smoke', label: 'Smoke detector', count: 1 }] });
    expect(labels(mix)).toEqual(['Repeat DEV', '-', 'Undo Move', 'Redo', '-', 'Erase', 'Move', '-', 'Isolate', 'Pan', 'Zoom', '-', 'Invert selection', 'Deselect all', 'Filter', 'Count', '-', 'Properties', 'Options…']);
    expect(flat(mix).find((x) => x.label === 'Filter')!.sub!.filter(isItem).map((x) => x.arg)).toEqual(['filter|ltg', 'filter|smoke']);
  });

  it('devArg: the edit and its value back from the entry', () => {
    expect(devArg('circuit|DB-1-Y1')).toEqual({ edit: 'circuit', value: 'DB-1-Y1' });
    expect(devArg('homeruns')).toEqual({ edit: 'homeruns' });
  });

  it('a room: one list of its electrical tools; Fill names the ELV device chosen', () => {
    const r = roomEntry({ room, typeLabel: 'Office', elv: 'Smoke detector' });
    expect(r.label).toBe('Room Office 1');
    expect(r.sub!.filter(isItem).map((x) => x.label)).toEqual(['Light room…', 'Socket room…', 'Lux check', 'Emergency lighting', 'Fill with Smoke detector', 'Select devices in room', 'Room loads', 'Area', 'Rename room…', 'Room type…']);
    expect(roomEntry({ room }).sub!.filter(isItem)[4].label).toBe('Fill with an ELV device…');
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
