import { describe, expect, it } from 'vitest';
import type { Project } from '../types';
import { addElvRoute, checkElvRoute, elvRouteBends, elvRouteLength, elvRoutesOn, removeElvRoute } from './routes';

const base = (): Project => ({ name: 'P', voltageV: 415, frequencyHz: 50, ambientC: 45, vdLimitPct: 4, updatedAt: '', boards: [], feeders: [] });

describe('ELV cable routes', () => {
  it('keeps approved geometry in metres with permanent route IDs', () => {
    const first = addElvRoute(base(), { system: 'ict', buildingId: 'B', levelId: 'GF', points: [[0, 0], [4.12345, 0], [4.12345, 3]], lvClearanceM: 0.3, preferredContainment: true });
    expect(first.route).toMatchObject({ id: 'ER1', points: [[0, 0], [4.123, 0], [4.123, 3]] });
    expect(elvRouteLength(first.route.points)).toBeCloseTo(7.123, 3);
    expect(elvRouteBends(first.route.points)).toBe(1);
    const without = removeElvRoute(first.project, 'ER1');
    const second = addElvRoute(without, { system: 'cctv', buildingId: 'B', levelId: 'GF', points: [[0, 0], [2, 0]], lvClearanceM: 0.3 });
    expect(second.route.id).toBe('ER2');
    expect(elvRoutesOn(second.project, 'B', 'GF')).toHaveLength(1);
  });

  it('applies system-specific length decisions', () => {
    expect(checkElvRoute('ict', 90)).toMatchObject({ status: 'pass' });
    expect(checkElvRoute('ict', 90.1)).toMatchObject({ status: 'fail' });
    expect(checkElvRoute('cctv', 100.1)).toMatchObject({ status: 'fail' });
    expect(checkElvRoute('fire-alarm', 250)).toMatchObject({ status: 'review' });
    expect(checkElvRoute('access-control', 20)).toMatchObject({ status: 'review' });
  });

  it('rejects empty or invalid route geometry', () => {
    expect(() => addElvRoute(base(), { system: 'ict', buildingId: 'B', levelId: 'GF', points: [[0, 0]], lvClearanceM: 0.3 })).toThrow(/two different/);
    expect(() => addElvRoute(base(), { system: 'ict', buildingId: 'B', levelId: 'GF', points: [[0, 0], [91, 0]], lvClearanceM: 0.3 })).toThrow(/exceeds the 90 m maximum/);
    expect(() => removeElvRoute(base(), 'ER1')).toThrow(/No ELV route/);
  });
});
