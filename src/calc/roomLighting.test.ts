import { describe, expect, it } from 'vitest';
import { sampleProject } from '../data/sampleProject';
import { lumenMethod } from './lighting';
import { gridInOutline, roomIndexOf, roomLighting, roomLightingDefaults, type RoomLightingInput } from './roomLighting';
import { inside } from '../model/cadMeasure';
import { placeRoomLights } from '../model/roomLights';
import type { Project } from '../types';

type Pt = [number, number];
const rect = (x0: number, y0: number, w: number, h: number): Pt[] => [[x0, y0], [x0 + w, y0], [x0 + w, y0 + h], [x0, y0 + h]];
const lShape: Pt[] = [[0, 0], [10, 0], [10, 4], [4, 4], [4, 10], [0, 10]]; // 64 m²
const office: RoomLightingInput = { ceilingM: 3, workPlaneM: 0.85, suspensionM: 0, targetLux: 500, lumens: 3600, watts: 36, mf: 0.8, reflectance: '753', uf: 0.6 };

describe('room lighting on the plan — lumen method for any outline', () => {
  it('room index of a rectangle matches L·W ÷ (Hm·(L + W))', () => {
    expect(roomIndexOf(80, 36, 2.15)).toBeCloseTo(80 / (2.15 * 18), 6);
  });

  it('a rectangle needs the same count as the rectangular lumen method, at half a spacing from the walls', () => {
    const r = roomLighting(rect(0, 0, 10, 8), office);
    const flat = lumenMethod({ lengthM: 10, widthM: 8, ...office });
    expect(r.required).toBeCloseTo(flat.required, 6); // 23.1
    expect(r.count).toBeGreaterThanOrEqual(24);
    expect(r.achievedLux).toBeGreaterThanOrEqual(500);
    expect(r.wPerM2).toBeCloseTo((r.count * 36) / 80, 6);
    const xs = r.points.map((q) => q[0]);
    expect(Math.min(...xs)).toBeCloseTo(r.spacingXM / 2, 1);
    expect(r.warnings).toEqual([]);
  });

  it('an L-shaped room keeps every luminaire inside the outline and still meets the target', () => {
    const r = roomLighting(lShape, office);
    expect(r.areaM2).toBeCloseTo(64, 6);
    expect(r.perimeterM).toBeCloseTo(40, 6);
    expect(r.points.every((q) => inside(q, lShape))).toBe(true);
    expect(r.count).toBeGreaterThanOrEqual(Math.ceil(r.required));
    expect(r.achievedLux).toBeGreaterThanOrEqual(500);
  });

  it('a small room gets one luminaire in the middle', () => {
    const g = gridInOutline(rect(2, 2, 1.2, 1.5), 1);
    expect(g.points).toEqual([[2.6, 2.75]]);
  });

  it('estimates UF from the reflectances when none is given, and says so', () => {
    const r = roomLighting(rect(0, 0, 6, 4), { ...office, uf: undefined, reflectance: '533' });
    expect(r.ufEstimated).toBe(true);
    expect(r.uf).toBeGreaterThan(0.3);
    expect(r.warnings.some((w) => w.startsWith('UF estimated'))).toBe(true);
  });

  it('flags spacing beyond the luminaire\'s SHR and power density beyond the limit', () => {
    const r = roomLighting(rect(0, 0, 12, 12), { ...office, ceilingM: 2.6, targetLux: 100, lumens: 6000, watts: 60, shrMax: 1.2, lpdMax: 2 });
    expect(r.shr).toBeGreaterThan(1.2);
    expect(r.warnings.some((w) => w.startsWith('Spacing-to-height ratio'))).toBe(true);
    expect(r.warnings.some((w) => w.includes('W/m² limit'))).toBe(true);
  });

  it('rejects a room without an outline, a luminaire below the working plane, and missing data', () => {
    expect(roomLighting([], office).invalid).toMatch(/no outline/);
    expect(roomLighting(rect(0, 0, 5, 5), { ...office, ceilingM: 0.8 }).invalid).toMatch(/above the working plane/);
    expect(roomLighting(rect(0, 0, 5, 5), { ...office, lumens: 0 }).invalid).toMatch(/lumens/);
  });
});

const villa: Project = {
  ...sampleProject, lvPoints: undefined, elvDevices: undefined,
  building: { buildings: [{ id: 'V', name: 'Villa', levels: [{ id: 'GF', name: 'Ground', kind: 'ground', heightM: 4 }] }], rooms: [{ id: 'R1', buildingId: 'V', levelId: 'GF', name: 'Majlis', type: 'living', areaM2: 36, outline: rect(0, 6, 6, 6) }] }
};
const level = { building: 'V', level: 'GF' };
const circuit = villa.feeders.find((f) => f.id === 'DB-GF1-Y1')!; // Majlis lighting

describe('room lighting — defaults and placing on a circuit', () => {
  it('takes the target lux from the room type and the ceiling from the level height', () => {
    const d = roomLightingDefaults(villa, villa.building!.rooms[0]);
    expect(d).toMatchObject({ targetLux: 150, ceilingM: 3.4, workPlaneM: 0.85, mf: 0.8 });
  });

  it('places the layout as lights on the circuit; replacing does not double the room', () => {
    const before = circuit.points?.ltg ?? 0;
    const r = roomLighting(villa.building!.rooms[0].outline!, { ...roomLightingDefaults(villa, villa.building!.rooms[0]), lumens: 1000, watts: 10 });
    const first = placeRoomLights(villa, level, 'R1', circuit.id, r.points);
    expect(first.ids).toHaveLength(r.count);
    expect(first.project.feeders.find((f) => f.id === circuit.id)!.points?.ltg).toBe(before + r.count);
    const again = placeRoomLights(first.project, level, 'R1', circuit.id, r.points, true);
    expect(again.removed).toBe(r.count);
    expect(again.project.lvPoints).toHaveLength(r.count);
    expect(again.project.feeders.find((f) => f.id === circuit.id)!.points?.ltg).toBe(before + r.count);
  });

  it('refuses a room on another level, or no circuit', () => {
    expect(() => placeRoomLights(villa, { building: 'V', level: 'FF' }, 'R1', circuit.id, [[1, 7]])).toThrow(/not on this level/);
    expect(() => placeRoomLights(villa, level, 'R1', 'NOPE', [[1, 7]])).toThrow(/circuit/);
  });
});
