import { describe, expect, it } from 'vitest';
import { pointMax } from './circuitRoom';
import { planRoomLights, planRoomSets, ROOM_SCOPE_MAX, ROOM_SET_MAX, roomsInScope, scopeCounts } from './roomScope';
import type { BuildingRoom, Feeder, Project } from '../types';

const box = (x: number): [number, number][] => [[x, 0], [x + 4, 0], [x + 4, 4], [x, 4]];
const room = (id: string, type: string, o: Partial<BuildingRoom> = {}): BuildingRoom => ({ id, buildingId: 'B', levelId: 'L1', name: id, type, areaM2: 16, outline: box(0), ...o });
const project = (rooms: BuildingRoom[]): Project => ({
  name: 'T', voltageV: 415, frequencyHz: 50, ambientC: 45, vdLimitPct: 4, updatedAt: '', boards: [], feeders: [],
  building: { buildings: [{ id: 'B', name: 'Tower', levels: [{ id: 'L1', name: 'Level 1', kind: 'typical', heightM: 4 }] }], rooms }
} as unknown as Project);
const ids = (rs: BuildingRoom[]) => rs.map((r) => r.id);

describe('All rooms like this: the rooms of a scope', () => {
  const rooms = [room('A', 'office'), room('B', 'bed'), room('C', 'office'), room('D', 'office', { outline: undefined }), room('E', 'office', { levelId: 'L2' }), room('F', 'bed')];
  it('takes this room, its type or the level, the room given first, only rooms with an outline on its level', () => {
    const p = project(rooms);
    expect(ids(roomsInScope(p, rooms[2], 'room').rooms)).toEqual(['C']);
    expect(ids(roomsInScope(p, rooms[2], 'type').rooms)).toEqual(['C', 'A']);
    expect(ids(roomsInScope(p, rooms[2], 'level').rooms)).toEqual(['C', 'A', 'B', 'F']);
    expect(scopeCounts(p, rooms[0])).toEqual({ room: 1, type: 2, level: 4 });
  });
  it('stops at the limit of a run and says how many are left', () => {
    const many = Array.from({ length: 45 }, (_, i) => room(`R${i}`, 'office'));
    const r = roomsInScope(project(many), many[10], 'type');
    expect(r.rooms).toHaveLength(ROOM_SCOPE_MAX);
    expect(r.rooms[0].id).toBe('R10');
    expect(r.left).toBe(5);
    expect(scopeCounts(project(many), many[0]).type).toBe(45);
  });
});

describe('Lights of several rooms on the lighting circuits', () => {
  const max = pointMax('ltg')!;
  const f = (id: string, ltg = 0, o: Partial<Feeder> = {}): Feeder => ({ id, boardId: 'DB1', points: ltg ? { ltg } : undefined, ...o } as Feeder);
  const rooms = ['A', 'B', 'C'].map((n) => room(n, 'office'));
  const lights = (n: number) => () => ({ points: Array.from({ length: n }, (_, i): [number, number] => [i, 0]), lux: 300 });
  it('keeps a room on the circuit chosen while the whole room fits, and counts the totals', () => {
    const plan = planRoomLights([f('X'), f('Y')], 'X', rooms.slice(0, 2), lights(3));
    expect(plan.rows.map((r) => r.feederId)).toEqual(['X', 'X']);
    expect(plan).toMatchObject({ lights: 6, rooms: 2 });
    expect(plan.circuits.map((c) => [c.feeder.id, c.added, c.after])).toEqual([['X', 6, 6]]);
  });
  it('goes on to the next circuit when the whole room does not fit, and skips a socket circuit', () => {
    const plan = planRoomLights([f('X', max - 2), f('S', 0, { points: { s13: 3 } }), f('Y')], 'X', rooms.slice(0, 1), lights(3));
    expect(plan.rows[0].feederId).toBe('Y');
    expect(plan.circuits.map((c) => [c.feeder.id, c.added, c.after])).toEqual([['Y', 3, 3]]);
  });
  it('leaves a room out with the reason', () => {
    expect(planRoomLights([f('X')], 'X', [rooms[0]], lights(max + 1)).rows[0].why).toBe('needs more than one circuit: light it on its own');
    const full = planRoomLights([f('X', max), f('Y', max)], 'X', rooms.slice(0, 2), lights(1));
    expect(full.rows.map((r) => r.why)).toEqual(['no lighting circuit with room', 'no lighting circuit with room']);
    expect(full).toMatchObject({ lights: 0, rooms: 0, circuits: [] });
    expect(planRoomLights([f('X')], 'X', [rooms[0]], () => undefined).rows[0].why).toBe('its lights cannot be worked out');
    expect(planRoomLights([f('X')], 'nope', [rooms[0]], lights(1)).rows[0].why).toBe('choose the circuit first');
  });
});

describe('Room devices over several rooms', () => {
  const max = pointMax('ltg')!;
  const f = (id: string, ltg = 0): Feeder => ({ id, boardId: 'DB1', points: ltg ? { ltg } : undefined } as Feeder);
  const rooms = ['A', 'B', 'C'].map((n) => room(n, 'office'));
  const pts = (n: number) => Array.from({ length: n }, (_, i): [number, number] => [i, 0]);
  const of = (lights: number, sockets = 2, elv = 3, limited = false) => () => ({ lights: pts(lights), sockets, elv, limited });
  it('keeps the rooms with their totals and circuits', () => {
    const plan = planRoomSets([f('X')], 'X', rooms, of(3), true);
    expect(plan.rooms).toBe(3);
    expect([plan.lights, plan.sockets, plan.elv, plan.devices]).toEqual([9, 6, 9, 24]);
    expect(plan.circuits.map((c) => [c.feeder.id, c.added, c.after])).toEqual([['X', 9, 9]]);
    expect(plan.rows.every((r) => r.feederId === 'X')).toBe(true);
  });
  it('leaves out a limited room and one that cannot be worked out', () => {
    const plan = planRoomSets([f('X')], 'X', rooms, (r) => (r.id === 'A' ? undefined : r.id === 'B' ? { lights: pts(2), sockets: 1, elv: 1, limited: true } : of(2)()), true);
    expect(plan.rows.map((r) => r.why)).toEqual(['its devices cannot be worked out', 'over the limit of one room: divide it or place it by hand', undefined]);
    expect(plan.rooms).toBe(1);
  });
  it('leaves out a room that fits on no lighting circuit', () => {
    const plan = planRoomSets([f('X', max - 1)], 'X', rooms.slice(0, 1), of(4), true);
    expect(plan.rows[0].why).toBe('no lighting circuit with room');
    expect(plan.devices).toBe(0);
  });
  it('stops at the devices of a run and works the circuits out from the rooms kept', () => {
    const many = Array.from({ length: 3 }, (_, i) => room(`R${i}`, 'office'));
    const plan = planRoomSets([f('X'), f('Y'), f('Z')], 'X', many, of(max, 100, 50), true);
    expect(plan.rows.map((r) => r.why)).toEqual([undefined, undefined, `${ROOM_SET_MAX} devices a run`]);
    expect(plan.devices).toBe(2 * (max + 150));
    expect(plan.circuits.map((c) => c.added)).toEqual([max, max]);
  });
  it('needs no circuit for ELV only', () => {
    const plan = planRoomSets([], '', rooms, of(4), false);
    expect(plan.rooms).toBe(3);
    expect([plan.lights, plan.sockets, plan.elv]).toEqual([0, 0, 9]);
    expect(plan.circuits).toEqual([]);
  });
});
