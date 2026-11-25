import { describe, expect, it } from 'vitest';
import { sampleProject } from '../data/sampleProject';
import { symbolGeom } from './planSymbols';
import { inside } from './cadMeasure';
import { pointMax } from './circuitRoom';
import { circuitsWithoutRoomSockets, placeRoomSockets, shareSockets, socketLayout, wallNear } from './roomSockets';
import { placeLvPoint } from './cadDevices';
import type { Feeder, Project } from '../types';

type Pt = [number, number];
const rect = (x0: number, y0: number, w: number, h: number): Pt[] => [[x0, y0], [x0 + w, y0], [x0 + w, y0 + h], [x0, y0 + h]];
const villa: Project = {
  ...sampleProject, lvPoints: undefined, elvDevices: undefined,
  building: {
    buildings: [{ id: 'V', name: 'Villa', levels: [{ id: 'GF', name: 'Ground', kind: 'ground', heightM: 4 }, { id: 'FF', name: 'First', kind: 'typical', heightM: 3 }] }],
    rooms: [{ id: 'R1', buildingId: 'V', levelId: 'GF', name: 'Majlis', type: 'living', areaM2: 24, outline: rect(0, 0, 6, 4) }, { id: 'R2', buildingId: 'V', levelId: 'FF', name: 'Upstairs', type: 'living', areaM2: 4, outline: rect(0, 0, 2, 2) }]
  }
};
const level = { building: 'V', level: 'GF' };
const feeder = (id: string, board: string, n = 0, type: 's13' | 'ltg' = 's13'): Feeder => ({ ...villa.feeders[0], id, boardId: board, points: n ? { [type]: n } : {} });
const room = rect(0, 0, 6, 4);

describe('socketLayout', () => {
  it('puts sockets along each wall by the spacing, inside the room, with keys', () => {
    const l = socketLayout(room, { spacingM: 3, skip: [], off: [] });
    expect(l.wallsM).toBe(20);
    expect(l.usedM).toBe(20);
    // Walls 6, 4, 6, 4 m at 3 m: 2, 1, 2, 1 sockets.
    expect(l.all.map((s) => s.key)).toEqual(['0:0', '0:1', '1:0', '2:0', '2:1', '3:0']);
    expect(l.sockets).toEqual(l.all);
    expect(l.all[0].at).toEqual([1.5, 0.05]);
    expect(l.all[1].at).toEqual([4.5, 0.05]);
    expect(l.all[2].at).toEqual([5.95, 2]);
    for (const s of l.all) expect(inside(s.at, room)).toBe(true);
  });

  it('turns each socket so its flat bar faces into the room and its stem runs to the wall', () => {
    const l = socketLayout(room, { spacingM: 3, skip: [], off: [] });
    const rots = Object.fromEntries(l.all.map((s) => [s.wall, s.rot]));
    expect(rots).toEqual({ 0: 0, 1: 90, 2: 180, 3: 270 });
    for (const s of l.all) {
      const g = symbolGeom('socket', s.at[0], s.at[1], 0.01, undefined, s.rot)!;
      // The flat bar is the line through the point along the wall, facing the room; the half circle and the stem lie behind it, towards the wall.
      const arc = g.paths.find((p) => p.pts.length > 3)!;
      const lines = g.paths.filter((p) => p.pts.length === 2);
      const depth = (q: Pt) => (s.wall === 0 ? q[1] : s.wall === 1 ? 6 - q[0] : s.wall === 2 ? 4 - q[1] : q[0]);
      const bar = lines.find((p) => Math.abs(depth(p.pts[0]) - depth(p.pts[1])) < 1e-9)!;
      expect(bar).toBeDefined();
      const barDepth = depth(s.at);
      expect(Math.max(...arc.pts.map(depth))).toBeLessThanOrEqual(barDepth + 1e-9);
      expect(Math.min(...arc.pts.map(depth))).toBeLessThan(barDepth - 0.01);
      // The stem (the other short line) runs from the half circle on towards the wall, which is still further out.
      const stem = lines.find((p) => p !== bar)!;
      expect(Math.max(...stem.pts.map(depth))).toBeLessThan(Math.min(...arc.pts.map(depth)) + 1e-9);
      expect(Math.min(...stem.pts.map(depth))).toBeGreaterThan(0);
    }
  });

  it('leaves out a skipped wall and the sockets taken off', () => {
    const l = socketLayout(room, { spacingM: 3, skip: [0], off: ['2:1'] });
    expect(l.usedM).toBe(14);
    expect(l.wallsM).toBe(20);
    expect(l.all.some((s) => s.wall === 0)).toBe(false);
    expect(l.all.map((s) => s.key)).toEqual(['1:0', '2:0', '2:1', '3:0']);
    expect(l.sockets.map((s) => s.key)).toEqual(['1:0', '2:0', '3:0']);
  });

  it('puts one socket on a wall shorter than the spacing, none on a wall under 0.6 m, and takes the nearest right angle', () => {
    expect(socketLayout(rect(0, 0, 1, 1), { spacingM: 3, skip: [], off: [] }).all).toHaveLength(4);
    const s = socketLayout(rect(0, 0, 4, 0.5), { spacingM: 3, skip: [], off: [] });
    expect(s.all.map((x) => x.wall)).toEqual([0, 2]);
    // A wall at 30 degrees takes the nearest right angle.
    const tilted = socketLayout([[0, 0], [6, 0], [6, 4], [0, 4]].map(([x, y]) => [x * Math.cos(0.5) - y * Math.sin(0.5), x * Math.sin(0.5) + y * Math.cos(0.5)] as Pt), { spacingM: 3, skip: [], off: [] });
    expect(tilted.all.every((x) => x.rot % 90 === 0)).toBe(true);
  });
});

describe('wallNear', () => {
  it('finds the nearest wall within reach', () => {
    expect(wallNear(room, [3, 0.1], 0.3)).toBe(0);
    expect(wallNear(room, [5.9, 2], 0.3)).toBe(1);
    expect(wallNear(room, [3, 2], 0.3)).toBeUndefined();
    expect(wallNear(room, [0.1, 2], 0.3)).toBe(3);
  });
});

describe('shareSockets', () => {
  const max = pointMax('s13')!;
  const keys = Array.from({ length: 5 }, (_, i) => `0:${i}`);

  it('puts all on the circuit chosen when the type has no limit', () => {
    const f = feeder('A', 'DB1', 4);
    const s = shareSockets([f], 'A', 's13t', keys);
    expect(s.rows).toEqual([{ feeder: f, keys, after: 5 }]);
    expect(s.left).toEqual([]);
  });

  it('fills the circuit to the most and goes on to the next with room, the same board first', () => {
    const a = feeder('A', 'DB1', max - 2), b = feeder('B', 'DB2'), c = feeder('C', 'DB1');
    const s = shareSockets([a, b, c], 'A', 's13', keys);
    expect(s.rows.map((r) => [r.feeder.id, r.keys.length, r.after])).toEqual([['A', 2, max], ['C', 3, 3]]);
    expect(s.left).toEqual([]);
  });

  it('lists the sockets that fit nowhere, and all of them for an unknown circuit', () => {
    const a = feeder('A', 'DB1', max - 1), b = feeder('B', 'DB1', max), lighting = feeder('L', 'DB1', 2, 'ltg');
    const s = shareSockets([a, b, lighting], 'A', 's13', keys);
    expect(s.rows.map((r) => [r.feeder.id, r.keys.length])).toEqual([['A', 1]]);
    expect(s.left).toEqual(keys.slice(1));
    expect(shareSockets([a], 'nope', 's13', keys)).toEqual({ rows: [], left: keys });
  });
});

describe('placeRoomSockets', () => {
  const layout = socketLayout(room, { spacingM: 3, skip: [], off: [] }).sockets;
  const a = villa.feeders[0], b = villa.feeders[1];
  const share = { rows: [{ feeder: a, keys: ['0:0', '0:1', '1:0'], after: 3 }, { feeder: b, keys: ['2:0'], after: 1 }], left: [] };

  it('places the points with their rotation on their circuits and counts them', () => {
    const r = placeRoomSockets(villa, level, 'R1', 's13', undefined, layout, share, false);
    expect(r.ids).toHaveLength(4);
    const pts = r.project.lvPoints!;
    expect(pts.map((p) => [p.feederId, p.type, p.x, p.y, p.rot ?? 0])).toEqual([[a.id, 's13', 1.5, 0.05, 0], [a.id, 's13', 4.5, 0.05, 0], [a.id, 's13', 5.95, 2, 90], [b.id, 's13', 4.5, 3.95, 180]]);
    expect(r.project.feeders.find((f) => f.id === a.id)!.points!.s13).toBe((a.points?.s13 ?? 0) + 3);
    expect(r.project.feeders.find((f) => f.id === b.id)!.points!.s13).toBe((b.points?.s13 ?? 0) + 1);
  });

  it('with replace takes off the sockets already in the room first, and keeps lights and sockets elsewhere', () => {
    let p = placeLvPoint(villa, level, 's13', a.id, 3, 2).project;
    p = placeLvPoint(p, level, 's13t', a.id, 2, 2).project;
    p = placeLvPoint(p, level, 'ltg', a.id, 1, 1).project;
    p = placeLvPoint(p, level, 's13', a.id, 20, 20).project;
    const before = a.points?.s13 ?? 0;
    const room1 = circuitsWithoutRoomSockets(p, level, 'R1', p.feeders).find((f) => f.id === a.id)!;
    expect(room1.points!.s13).toBe(before + 1);
    const r = placeRoomSockets(p, level, 'R1', 's13', undefined, layout, { rows: [{ feeder: a, keys: ['0:0'], after: 1 }], left: [] }, true);
    expect(r.removed).toBe(2);
    expect(r.project.lvPoints!.map((x) => x.type).sort()).toEqual(['ltg', 's13', 's13']);
    expect(r.project.feeders.find((f) => f.id === a.id)!.points!.s13).toBe(before + 2);
  });

  it('refuses a room with no outline or on another level', () => {
    expect(() => placeRoomSockets(villa, level, 'R2', 's13', undefined, layout, share, false)).toThrow(/not on this level/);
    expect(() => placeRoomSockets(villa, level, 'none', 's13', undefined, layout, share, false)).toThrow(/no outline/);
  });
});
