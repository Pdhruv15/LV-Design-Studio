import { describe, expect, it } from 'vitest';
import type { Seg } from './cadBoundary';
import { LV_ROUTE_LIMITS, planLvRoutes } from './lvRoutePlanner';

const settings = { options: 1, precision: 'balanced' as const, marginM: 4, clearanceM: 0.15 };

describe('bounded LV route planner', () => {
  it('finds the shortest orthogonal route through a wall opening', () => {
    const walls: Seg[] = [[[5, -10], [5, 0.4]], [[5, 1.6], [5, 10]]];
    const result = planLvRoutes({ start: [1, 1], end: [9, 1], walls, settings });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.routes[0].lengthM).toBeLessThan(9);
    const crossing = result.routes[0].points.slice(1).flatMap((b, i) => {
      const a = result.routes[0].points[i];
      if ((a[0] - 5) * (b[0] - 5) > 0 || a[0] === b[0]) return [];
      const t = (5 - a[0]) / (b[0] - a[0]);
      return [a[1] + (b[1] - a[1]) * t];
    });
    expect(crossing.some((y) => y > 0.4 && y < 1.6)).toBe(true);
    expect(result.stats.cells).toBeLessThanOrEqual(LV_ROUTE_LIMITS.maxCells);
  });

  it('returns no route when a wall closes the bounded search area', () => {
    const walls: Seg[] = [[[5, -20], [5, 20]]];
    const result = planLvRoutes({ start: [1, 0], end: [9, 0], walls, settings });
    expect(result).toMatchObject({ ok: false, code: 'no-route' });
  });

  it('hard-caps route alternatives at three and reuses a bounded grid', () => {
    const result = planLvRoutes({ start: [0, 0], end: [12, 0], walls: [], settings: { ...settings, options: 20 } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.routes.length).toBeLessThanOrEqual(3);
    expect(result.routes.length).toBeGreaterThan(0);
    expect(result.stats.cells).toBeLessThanOrEqual(LV_ROUTE_LIMITS.maxCells);
    expect(result.stats.approxBytes).toBeLessThan(2 * 1024 * 1024);
  });

  it('adapts the grid on a large plan instead of exceeding the memory limit', () => {
    const result = planLvRoutes({ start: [0, 0], end: [500, 300], walls: [], settings: { options: 1, precision: 'detailed', marginM: 10 } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.stats.cells).toBeLessThanOrEqual(LV_ROUTE_LIMITS.maxCells);
    expect(result.stats.gridM).toBeGreaterThan(0.15);
    expect(result.stats.approxBytes).toBeLessThan(2 * 1024 * 1024);
    expect(result.routes[0].visited).toBeLessThanOrEqual(LV_ROUTE_LIMITS.maxVisited);
  });

  it('stops before processing excessive wall detail', () => {
    const walls: Seg[] = Array.from({ length: LV_ROUTE_LIMITS.maxWallSegments + 1 }, (_, i) => {
      const y = (i % 10) / 10;
      return [[2, y], [2.01, y]];
    });
    const result = planLvRoutes({ start: [0, 0], end: [4, 0], walls, settings });
    expect(result).toMatchObject({ ok: false, code: 'limit' });
  });

  it('is deterministic for the recommended route', () => {
    const walls: Seg[] = [[[4, -2], [4, 1]], [[4, 2], [4, 5]]];
    const a = planLvRoutes({ start: [0, 0], end: [8, 0], walls, settings });
    const b = planLvRoutes({ start: [0, 0], end: [8, 0], walls, settings });
    expect(a.ok && b.ok ? a.routes[0].points : undefined).toEqual(a.ok && b.ok ? b.routes[0].points : undefined);
  });
});
