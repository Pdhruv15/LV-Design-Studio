import { expect, it } from 'vitest';
import type { Seg } from '../../src/model/cadBoundary';
import { LV_ROUTE_LIMITS, planLvRoutes, type LvRoutePlan } from '../../src/model/lvRoutePlanner';

/** Exercises the planner near its cell cap with enough wall detail to include rasterisation work. */
it('bounded LV route planner benchmark', () => {
  const walls: Seg[] = Array.from({ length: 1_000 }, (_, i) => {
    const x = 20 + (i % 50) * 9;
    const y = 20 + Math.floor(i / 50) * 12;
    return [[x, y], [x + 2, y]];
  });
  const timings: number[] = [];
  let result: LvRoutePlan | undefined;
  for (let run = 0; run < 6; run += 1) {
    const started = performance.now();
    result = planLvRoutes({
      start: [0, 0], end: [500, 300], walls,
      settings: { options: 3, precision: 'detailed', marginM: 10 }
    });
    timings.push(performance.now() - started);
  }
  expect(result?.ok).toBe(true);
  if (!result?.ok) return;
  expect(result.stats.cells).toBeLessThanOrEqual(LV_ROUTE_LIMITS.maxCells);
  expect(result.routes.length).toBeLessThanOrEqual(LV_ROUTE_LIMITS.maxOptions);
  expect(result.stats.approxBytes).toBeLessThan(2 * 1024 * 1024);
  timings.shift();
  timings.sort((a, b) => a - b);
  process.stdout.write(`\nLV route planner: ${result.stats.cells.toLocaleString()} cells · ${walls.length.toLocaleString()} walls · ${(result.stats.approxBytes / 1048576).toFixed(2)} MB arrays · median ${timings[2].toFixed(1)} ms · max ${timings[timings.length - 1].toFixed(1)} ms\n`);
});
