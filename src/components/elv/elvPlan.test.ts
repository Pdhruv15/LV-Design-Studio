import { describe, expect, it } from 'vitest';
import type { Project } from '../../types';
import { canFill, copySystems, coverageGaps, coverageNote, deviceNear, elvLayer, FILL_MAX, fillAt, fillRooms, moveTo, placeAt, remove, rotate, systemCounts } from './elvPlan';

const box = (x1: number, y1: number, x2: number, y2: number): [number, number][] => [[x1, y1], [x2, y1], [x2, y2], [x1, y2]];
const L1 = { building: 'B', level: 'L1' };
const MM = 0.001; // a plan drawn in millimetres

const project = (): Project => ({
  name: 'T', voltageV: 415, frequencyHz: 50, ambientC: 45, vdLimitPct: 4, updatedAt: '', boards: [], feeders: [],
  building: {
    buildings: [{ id: 'B', name: 'Tower', levels: [{ id: 'L1', name: 'Level 1', kind: 'typical', heightM: 4 }, { id: 'L2', name: 'Level 2', kind: 'typical', heightM: 4 }] }],
    rooms: [
      { id: 'R1', buildingId: 'B', levelId: 'L1', name: 'Office', type: 'office', areaM2: 200, outline: box(0, 0, 20, 10) },
      { id: 'R2', buildingId: 'B', levelId: 'L2', name: 'Office', type: 'office', areaM2: 200, outline: box(0, 0, 20, 10) }
    ]
  }
});

describe('ELV layer of the Floor plan page', () => {
  it('places a device in the room under the click and says so', () => {
    const r = placeAt(project(), L1, 'smoke-detector', [5.123, 5]);
    expect(r).toMatchObject({ id: 'E1', message: 'Smoke detector E1 added to Office · ⌘Z to undo' });
    expect(r.next.elvDevices![0]).toMatchObject({ x: 5.12, y: 5, roomId: 'R1' });
    expect(placeAt(project(), L1, 'smoke-detector', [50, 5]).message).toBe('Smoke detector E1 added outside every room outline · ⌘Z to undo');
  });

  it('draws devices in drawing units, dims other systems, and shows coverage cut at the room with the gaps', () => {
    let p = placeAt(project(), L1, 'smoke-detector', [5, 5]).next;
    p = placeAt(p, L1, 'camera', [1, 1]).next;
    const layer = elvLayer(p, L1, MM, { system: 'fire-alarm', coverage: true, selected: 'E1' });
    expect(layer.symbols.map((s) => [s.at, s.text, !!s.dim, !!s.selected])).toEqual([[[5000, 5000], 'S', false, true], [[1000, 1000], 'C', true, false]]);
    expect(layer.covers).toEqual([{ at: [5000, 5000], r: 7500, clip: box(0, 0, 20000, 10000) }]);
    // One detector at x = 5 m cannot reach the far end of a 20 m room.
    expect(layer.coverage[0].pct).toBeLessThan(0.7);
    expect(layer.gaps!.at.length).toBeGreaterThan(0);
    expect(layer.gaps!.at.every(([x, y]) => Math.hypot(x - 5000, y - 5000) > 7500)).toBe(true);
    expect(elvLayer(p, L1, MM, { system: 'fire-alarm', coverage: false, selected: null })).toMatchObject({ covers: [] });
    // A camera shows its identify / recognise / observe bands.
    const cam = elvLayer(rotate(p, 'E2', 45).next, L1, MM, { system: 'cctv', coverage: true, selected: null }).covers[0];
    expect(cam.cone).toMatchObject({ fovDeg: 100, rotationDeg: 45 });
    expect(cam.cone!.bands.map((b) => Math.round(b))).toEqual([3222, 6444, 12889]);
  });

  it('fills a room on the coverage grid, previews it, and refuses devices with no spacing', () => {
    const r = fillAt(project(), L1, 'smoke-detector', [3, 3]); // 20 × 10 m at 10.6 m: 2 × 1
    expect(r.message).toBe('Office: 2 smoke detectors placed · ⌘Z to undo');
    expect(r.next!.elvDevices!.map((d) => [d.x, d.y])).toEqual([[5, 5], [15, 5]]);
    expect(elvLayer(r.next!, L1, MM, { system: 'fire-alarm', coverage: true, selected: null }).coverage[0].pct).toBe(1);
    const preview = elvLayer(project(), L1, MM, { system: 'fire-alarm', coverage: true, selected: null, preview: { type: 'smoke-detector', at: [3, 3] } });
    expect(preview.symbols.filter((s) => s.ghost)).toHaveLength(2);
    expect(fillAt(project(), L1, 'call-point', [3, 3]).message).toMatch(/no coverage spacing to fill by/);
    expect(fillAt(project(), L1, 'smoke-detector', [50, 3]).message).toMatch(/^No room with an outline there/);
    expect([canFill('smoke-detector'), canFill('ceiling-speaker'), canFill('camera')]).toEqual([true, true, false]);
  });

  it('fills several rooms in one change, previews them, and stops at the limit of a run', () => {
    const rooms = [{ name: 'Office', outline: box(0, 0, 20, 10) }, { name: 'Store', outline: box(30, 0, 40, 10) }];
    const r = fillRooms(project(), L1, 'smoke-detector', rooms);
    expect(r).toMatchObject({ placed: 3, left: 0, message: '2 rooms: 3 smoke detectors placed · ⌘Z to undo' });
    expect(r.next!.elvDevices!.map((d) => d.roomId)).toEqual(['R1', 'R1', undefined]);
    const preview = elvLayer(project(), L1, MM, { system: 'fire-alarm', coverage: false, selected: null, preview: { type: 'smoke-detector', at: [3, 3], rooms: rooms.map((x) => x.outline) } });
    expect(preview.symbols.filter((s) => s.ghost).map((s) => s.at[0] > 25000)).toEqual([false, false, true]);
    expect(fillRooms(project(), L1, 'call-point', rooms)).toMatchObject({ placed: 0, left: 0, message: expect.stringMatching(/no coverage spacing/) });
    // A room that would take the run over FILL_MAX is left out.
    const big = [{ name: 'Hall', outline: box(0, 0, 200, 200) }, { name: 'Hall 2', outline: box(0, 0, 200, 200) }, { name: 'Closet', outline: box(0, 0, 5, 5) }];
    const cut = fillRooms(project(), L1, 'smoke-detector', big);
    expect(cut.placed).toBeLessThanOrEqual(FILL_MAX);
    expect(cut.left).toBe(1); // the second hall; the closet still fits
    expect(cut.message).toBe(`2 rooms: ${cut.placed} smoke detectors placed — 1 room left out: ${FILL_MAX} devices a run · ⌘Z to undo`);
    expect(elvLayer(project(), L1, MM, { system: 'fire-alarm', coverage: false, selected: null, preview: { type: 'smoke-detector', at: [3, 3], rooms: big.map((x) => x.outline) } }).symbols).toHaveLength(FILL_MAX);
  });

  it('selects, moves, turns, deletes and copies devices', () => {
    let p = placeAt(project(), L1, 'camera', [2, 2]).next;
    expect(deviceNear(p, L1, 'cctv', [2.3, 2.2], 0.5)?.id).toBe('E1');
    expect(deviceNear(p, L1, 'fire-alarm', [2, 2], 0.5)).toBeUndefined(); // another system's device is not picked
    expect(moveTo(p, 'E1', [25, 2]).message).toBe('CCTV camera E1 moved outside every room outline · ⌘Z to undo');
    p = rotate(p, 'E1', -90).next;
    expect(p.elvDevices![0].rotationDeg).toBe(270);
    expect(remove(p, 'E1').next.elvDevices).toEqual([]);
  });

  it('counts the devices of each system and copies the systems chosen to another level, with Replace taking off what is there', () => {
    const L2 = { building: 'B', level: 'L2' };
    let p = placeAt(project(), L1, 'camera', [2, 2]).next;
    p = placeAt(p, L1, 'smoke-detector', [4, 4]).next;
    expect(systemCounts(p, L1).map((x) => [x.system, x.n])).toEqual([['fire-alarm', 1], ['cctv', 1], ['access-control', 0], ['ict', 0], ['public-address', 0]]);
    const c = copySystems(p, L1, L2, ['cctv'], false);
    expect(c).toMatchObject({ copied: 1, removed: 0 });
    expect(systemCounts(c.next, L2).find((x) => x.system === 'cctv')!.n).toBe(1);
    expect(systemCounts(c.next, L2).find((x) => x.system === 'fire-alarm')!.n).toBe(0);
    const again = copySystems(c.next, L1, L2, ['cctv'], false);
    expect(systemCounts(again.next, L2).find((x) => x.system === 'cctv')!.n).toBe(2);
    const r = copySystems(again.next, L1, L2, ['cctv'], true);
    expect(r).toMatchObject({ copied: 1, removed: 2 });
    expect(systemCounts(r.next, L2).find((x) => x.system === 'cctv')!.n).toBe(1);
  });

  it('describes the coverage a device is placed by', () => {
    expect(coverageNote('heat-detector')).toBe(' · 5.3 m radius');
    expect(coverageNote('ceiling-speaker')).toBe(' · at most 6 m apart');
    expect(coverageNote('camera')).toBe(' · 100°: identify 3.2 m, recognise 6.4 m, observe 12.9 m');
    expect(coverageNote('data-outlet')).toBe('');
  });
  it('lists the rooms a system does not fully cover, only for systems with devices on the level', () => {
    let p = placeAt(project(), L1, 'smoke-detector', [5, 5]).next;
    expect(coverageGaps(p, L1)).toEqual([{ system: 'fire-alarm', label: expect.any(String), roomsNotCovered: 1 }]);
    expect(coverageGaps(p, { building: 'B', level: 'L2' })).toEqual([]);
    p = placeAt(p, L1, 'camera', [1, 1]).next;
    expect(coverageGaps(p, L1).map((g) => g.system)).toEqual(['fire-alarm', 'cctv']);
  });
});
