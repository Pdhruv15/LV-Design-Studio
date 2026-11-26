import { describe, expect, it } from 'vitest';
import { sampleProject } from '../data/sampleProject';
import { placedOn } from './cadDevices';
import { checkLevel, type LevelCheckInput } from './levelCheck';
import type { BuildingRoom, Project } from '../types';

const box = (x0: number, y0: number, x1: number, y1: number): [number, number][] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const level = { building: 'V', level: 'GF' };
const A: BuildingRoom = { id: 'RA', buildingId: 'V', levelId: 'GF', name: 'Majlis', type: 'living', areaM2: 36, outline: box(0, 0, 6, 6) };
const B: BuildingRoom = { id: 'RB', buildingId: 'V', levelId: 'GF', name: 'Store', type: 'store', areaM2: 36, outline: box(10, 0, 16, 6) };
const circuit = sampleProject.feeders[0];
const pt = (id: string, type: string, x: number, y: number, feederId = circuit.id) => ({ id, type, feederId, buildingId: 'V', levelId: 'GF', x, y }) as never;

const make = (o: Partial<Project> = {}): Project => ({
  ...sampleProject, elvDevices: undefined, cadAccessories: [{ id: 'A1', type: 'switch', buildingId: 'V', levelId: 'GF', x: 1, y: 1 }],
  building: { buildings: [{ id: 'V', name: 'Villa', levels: [{ id: 'GF', name: 'Ground', kind: 'ground', heightM: 4 }] }], rooms: [A, B] },
  feeders: sampleProject.feeders.map((f) => (f.id === circuit.id ? { ...f, points: { ltg: 11 } } : f)),
  boards: [{ ...sampleProject.boards[0], level, planPoint: { x: 2, y: 2 } }, { ...sampleProject.boards[1], id: 'DB-X', level, planPoint: undefined }],
  lvPoints: [pt('P1', 'ltg', 1, 1), pt('P2', 'ltg', 2, 2), pt('P3', 's13', 3, 3), pt('P4', 'cooker', 20, 20)],
  ...o
});
const run = (p: Project, extra: Partial<LevelCheckInput> = {}) => checkLevel(p, level, {
  rooms: [A, B], placed: placedOn(p, level), lightNeed: (r) => (r.id === 'RA' ? { needed: 4, lux: 300 } : undefined), coverage: [], ...extra
});
const texts = (c: ReturnType<typeof run>, id: string) => c.groups.find((g) => g.id === id)?.findings.map((f) => f.text);

describe('Check level', () => {
  it('lists rooms short of lights, with none, and the rooms that are fine', () => {
    const c = run(make());
    expect(texts(c, 'lighting')).toEqual(['Majlis — 2 lights, 4 needed for 300 lx', 'Store — no light']);
    expect(c.groups[0].findings[0]).toMatchObject({ ok: false, fix: { tool: 'lux', roomId: 'RA' }, box: { x0: 0, y0: 0, x1: 6, y1: 6 } });
    expect(texts(run(make(), { lightNeed: () => ({ needed: 2, lux: 300 }) }), 'lighting')).toEqual(['Store — no light', '1 room meets its target']);
  });

  it('flags a room with lights whose lighting target could not be verified', () => {
    const c = run(make(), { lightNeed: () => undefined });
    expect(texts(c, 'lighting')).toEqual(['Majlis — lighting target not verified', 'Store — no light']);
    expect(c.groups[0].findings[0]).toMatchObject({ ok: false, fix: { tool: 'lux', roomId: 'RA' }, box: { x0: 0, y0: 0, x1: 6, y1: 6 } });
  });

  it('lists rooms with no socket and a tick line', () => {
    expect(texts(run(make()), 'sockets')).toEqual(['Store — no socket', '1 room has a socket']);
    expect(texts(run(make({ lvPoints: [pt('P1', 's13t', 1, 1), pt('P2', 's15', 11, 1)] })), 'sockets')).toEqual(['2 rooms have a socket']);
  });

  it('lists a circuit over its maximum and devices on a removed circuit', () => {
    const c = run(make({ lvPoints: [pt('P1', 'ltg', 1, 1), pt('P2', 'ltg', 2, 2), pt('P5', 'ltg', 3, 3, 'GONE')] }));
    const f = c.groups.find((g) => g.id === 'circuits')!.findings;
    expect(f[0].text).toMatch(/ — 11 lighting points, maximum 10$/);
    expect(f[0]).toMatchObject({ keys: ['lv:P1', 'lv:P2'], box: { x0: -1, y0: -1, x1: 4, y1: 4 } });
    expect(f[1]).toMatchObject({ text: '1 device on a circuit that was removed', keys: ['lv:P5'] });
    expect(texts(run(make({ feeders: sampleProject.feeders })), 'circuits')).toEqual(['No circuit of this level is over its maximum']);
  });

  it('lists devices outside every room, and leaves the group out when no room has an outline', () => {
    const c = run(make());
    expect(c.groups.find((g) => g.id === 'devices')!.findings).toEqual([expect.objectContaining({ text: '1 device outside every room', keys: ['lv:P4'], box: { x0: 18, y0: 18, x1: 22, y1: 22 } })]);
    expect(run(make(), { rooms: [] }).groups.some((g) => g.id === 'devices')).toBe(false);
  });

  it('lists ELV coverage by system and boards not on the plan', () => {
    const c = run(make(), { coverage: [{ system: 'cctv', label: 'CCTV', roomsNotCovered: 1 }, { system: 'fire-alarm', label: 'Fire alarm', roomsNotCovered: 0 }] });
    expect(texts(c, 'coverage')).toEqual(['CCTV — 1 room not fully covered', 'Fire alarm — covered']);
    expect(c.groups.find((g) => g.id === 'coverage')!.findings[0].fix).toEqual({ tool: 'coverage', system: 'cctv' });
    expect(texts(c, 'boards')).toEqual(['DB-X is on this level but not on the plan']);
    const placedAll = make(); placedAll.boards = placedAll.boards.map((b) => ({ ...b, planPoint: { x: 1, y: 1 } }));
    expect(texts(run(placedAll), 'boards')).toEqual(['Every board of this level is on the plan']);
    expect(run(make({ boards: [] })).groups.some((g) => g.id === 'boards')).toBe(false);
  });

  it('counts by type and the things to look at', () => {
    const c = run(make());
    expect(c.counts).toBe('2 lights · 1 socket · 1 switch · 1 other point · 1 board');
    expect(c).toMatchObject({ rooms: 2, devices: 6 });
    expect(c.toLook).toBe(c.groups.reduce((n, g) => n + g.findings.filter((f) => !f.ok).length, 0));
    expect(run(make({ lvPoints: [], cadAccessories: [], boards: [] }), { placed: [] }).counts).toBe('Nothing placed');
  });
});
