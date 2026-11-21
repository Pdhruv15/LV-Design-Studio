import { describe, expect, it } from 'vitest';
import { approveElvRoomTemplate, ELV_ROOM_TEMPLATE_LIMIT, proposeElvRoomTemplate } from './elvRoomTemplate';
import type { BuildingRoom, Project } from '../../types';

const box = (w: number, h: number): [number, number][] => [[0, 0], [w, 0], [w, h], [0, h]];
const room: BuildingRoom = { id: 'R1', buildingId: 'B', levelId: 'L1', name: 'Office', type: 'office', areaM2: 80, outline: box(10, 8) };
const project: Project = {
  name: 'T', voltageV: 415, frequencyHz: 50, ambientC: 45, vdLimitPct: 4, updatedAt: '', boards: [], feeders: [],
  building: { buildings: [{ id: 'B', name: 'Tower', levels: [{ id: 'L1', name: 'Level 1', kind: 'typical', heightM: 4 }] }], rooms: [room] }
};

describe('coordinated room device template — ELV boundary', () => {
  it('proposes only data outlets, Wi-Fi APs and smoke detectors within a fixed budget', () => {
    const proposal = proposeElvRoomTemplate(room, 'office');
    expect(proposal.limited).toBe(false);
    expect(proposal.dataOutlets.length).toBeGreaterThan(0);
    expect(proposal.accessPoints.length).toBeGreaterThan(0);
    expect(proposal.smokeDetectors.length).toBeGreaterThan(0);
    expect(proposal.dataOutlets.length + proposal.accessPoints.length + proposal.smokeDetectors.length).toBeLessThanOrEqual(ELV_ROOM_TEMPLATE_LIMIT);
  });

  it('approves through the ELV placement model and replaces without doubling', () => {
    const proposal = proposeElvRoomTemplate(room, 'meeting');
    const first = approveElvRoomTemplate(project, room, proposal);
    expect(first.project.elvDevices).toHaveLength(first.placed);
    expect(new Set(first.project.elvDevices?.map((d) => d.type))).toEqual(new Set(['data-outlet', 'access-point', 'smoke-detector']));
    expect(first.project.elvDevices?.every((d) => d.roomId === room.id)).toBe(true);
    const again = approveElvRoomTemplate(first.project, room, proposal);
    expect(again.removed).toBe(first.placed);
    expect(again.project.elvDevices).toHaveLength(first.placed);
  });

  it('bounds a huge room and refuses approval of the incomplete preview', () => {
    const huge = { ...room, areaM2: 10_000, outline: box(100, 100) };
    const proposal = proposeElvRoomTemplate(huge, 'office');
    expect(proposal.limited).toBe(true);
    expect(proposal.dataOutlets.length + proposal.accessPoints.length + proposal.smokeDetectors.length).toBeLessThanOrEqual(ELV_ROOM_TEMPLATE_LIMIT);
    expect(() => approveElvRoomTemplate(project, huge, proposal)).toThrow(/point limit/);
  });
});
