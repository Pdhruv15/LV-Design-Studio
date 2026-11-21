import { describe, expect, it } from 'vitest';
import { emptyTrayPlan } from '../calc/cableTray';
import type { Project, SketchItem, TrayRoute } from '../types';
import { checkLvContainment, CONTAINMENT_CHECK_LIMITS } from './cadContainmentCheck';

const cable = { demandFactor: 1, powerFactor: 0.9, cableCsaMm2: 240, cores: 4 as const, breakerRatingA: 400, breakerIcuKa: 36, loadKw: 200, lengthM: 40 };
const route: TrayRoute = { id: 'r-a', name: 'A', cables: [] };
const tray = (id: string, widthMm: number, routeName = 'A'): SketchItem => ({
  id, kind: 'pline', layer: 'E-TRAY', pts: [[0, 0], [10, 0]], tray: { widthMm, service: 'Power', route: routeName }
});
const project = (patch: Partial<Project> = {}): Project => ({
  name: 'T', voltageV: 415, frequencyHz: 50, ambientC: 45, vdLimitPct: 4, updatedAt: '', boards: [],
  feeders: [{ ...cable, id: 'F1', boardId: 'MDB', name: 'SMDB', trayRoute: 'A' }],
  trays: { ...emptyTrayPlan(), routes: [route] },
  ...patch
});

describe('LV containment segment check', () => {
  it('checks each drawn segment at its installed width and recommends a standard size', () => {
    const result = checkLvContainment(project(), [tray('small', 100), tray('large', 600)]);
    expect(result.segments).toHaveLength(2);
    expect(result.segments[0]).toMatchObject({ name: 'S1', routeName: 'A', status: 'overloaded', cableCount: 1 });
    expect(result.segments[0].recommendedWidthMm).toBeGreaterThan(100);
    expect(result.segments[1].status).toBe('within-limit');
    expect(result.checkedRoutes).toBe(1); // the shared route is sized once
  });

  it('reports missing assignments and missing schedule routes without sizing them', () => {
    const result = checkLvContainment(project(), [tray('none', 300, ''), tray('gone', 300, 'REMOVED')]);
    expect(result.segments.map((segment) => segment.status)).toEqual(['unassigned', 'unassigned']);
    expect(result.checkedRoutes).toBe(0);
  });

  it('does not offer an unsafe width while a route has an unsized cable', () => {
    const p = project({ trays: { ...emptyTrayPlan(), routes: [{ ...route, cables: [{ id: 'm', cores: 4, csaMm2: 0, qty: 1 }] }] } });
    const segment = checkLvContainment(p, [tray('t', 300)]).segments[0];
    expect(segment.status).toBe('review');
    expect(segment.notes).toContain('1 cable without a size');
    expect(segment.recommendedWidthMm).toBeUndefined();
  });

  it('caps the visible segments and cable instances before the sizing engine expands them', () => {
    const manyTrays = Array.from({ length: CONTAINMENT_CHECK_LIMITS.segments + 5 }, (_, i) => tray(`t${i}`, 300));
    const first = checkLvContainment(project(), manyTrays);
    expect(first.segments).toHaveLength(CONTAINMENT_CHECK_LIMITS.segments);
    expect(first.truncated).toBe(true);

    const qty = CONTAINMENT_CHECK_LIMITS.cableInstancesPerRoute + 1;
    const limited = checkLvContainment(project({ trays: { ...emptyTrayPlan(), routes: [{ ...route, cables: [{ id: 'm', cores: 4, csaMm2: 35, qty }] }] } }), [tray('t', 300)]);
    expect(limited.segments[0]).toMatchObject({ status: 'limited' });
  });
});
