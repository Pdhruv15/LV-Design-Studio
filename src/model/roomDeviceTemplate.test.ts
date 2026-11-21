import { describe, expect, it } from 'vitest';
import { sampleProject } from '../data/sampleProject';
import { inside } from './cadMeasure';
import { approveLvRoomTemplate, proposeLvRoomTemplate, ROOM_TEMPLATE_LIMITS, roomPerimeterPoints } from './roomDeviceTemplate';
import type { BuildingRoom, Project } from '../types';

const box = (w: number, h: number): [number, number][] => [[0, 0], [w, 0], [w, h], [0, h]];
const room: BuildingRoom = { id: 'R1', buildingId: 'V', levelId: 'GF', name: 'Office', type: 'office', areaM2: 48, outline: box(8, 6) };
const project: Project = {
  ...sampleProject, lvPoints: undefined, elvDevices: undefined,
  building: { buildings: [{ id: 'V', name: 'Villa', levels: [{ id: 'GF', name: 'Ground', kind: 'ground', heightM: 4 }] }], rooms: [room] }
};
const level = { building: 'V', level: 'GF' };

describe('coordinated room device template — LV', () => {
  it('places deterministic lights and twin sockets inside one room within the fixed budget', () => {
    const proposal = proposeLvRoomTemplate(project, room, 'office');
    expect(proposal.limited).toBe(false);
    expect(proposal.lights.length).toBeGreaterThan(0);
    expect(proposal.sockets.length).toBeGreaterThan(0);
    expect(proposal.lights.length + proposal.sockets.length).toBeLessThanOrEqual(ROOM_TEMPLATE_LIMITS.lights + ROOM_TEMPLATE_LIMITS.sockets);
    expect([...proposal.lights, ...proposal.sockets].every((p) => inside(p, room.outline!))).toBe(true);
  });

  it('approves into the existing LV point model and replaces without doubling', () => {
    const proposal = proposeLvRoomTemplate(project, room, 'meeting');
    const first = approveLvRoomTemplate(project, level, proposal, 'DB-GF1-Y1', 'DB-GF1-B6');
    expect(first.placed).toBe(proposal.lights.length + proposal.sockets.length);
    expect(first.project.lvPoints?.filter((d) => d.type === 'ltg')).toHaveLength(proposal.lights.length);
    expect(first.project.lvPoints?.filter((d) => d.type === 's13t')).toHaveLength(proposal.sockets.length);
    const again = approveLvRoomTemplate(first.project, level, proposal, 'DB-GF1-Y1', 'DB-GF1-B6');
    expect(again.removed).toBe(first.placed);
    expect(again.project.lvPoints).toHaveLength(first.placed);
  });

  it('refuses approval when a very large room reaches the preview cap', () => {
    const huge = { ...room, areaM2: 10_000, outline: box(100, 100) };
    const proposal = proposeLvRoomTemplate({ ...project, building: { ...project.building!, rooms: [huge] } }, huge, 'office');
    expect(proposal.limited).toBe(true);
    expect(proposal.lights).toHaveLength(ROOM_TEMPLATE_LIMITS.lights);
    expect(() => approveLvRoomTemplate(project, level, proposal, 'DB-GF1-Y1', 'DB-GF1-B6')).toThrow(/point limit/);
  });

  it('keeps perimeter points inside a concave room', () => {
    const outline: [number, number][] = [[0, 0], [8, 0], [8, 3], [3, 3], [3, 8], [0, 8]];
    const points = roomPerimeterPoints(outline, 8);
    expect(points).toHaveLength(8);
    expect(points.every((p) => inside(p, outline))).toBe(true);
  });
});
